// Packages the modern and legacy builds together into one webOS ipk or one Tizen wgt, with
// scripts/bootPage.mjs picking the bundle at launch.
//
// The release flavor (the default) carries the earlier Moonfin TV app's identity from packaging/,
// org.moonfin.webos with its Luna service and MoonfinApp.moonfin with its Smart Hub service, so it
// installs over that app and keeps its storage. MOONFIN_FLAVOR=test keeps the side-by-side ids
// (org.moonfin.solidtv, MnfnSolid1.Moonfin) and "SolidTV" in the title.
//
//   node scripts/package.mjs webos|tizen [--modern <dist>] [--legacy <dist>] [--unsigned]
//
// The dists default to dist/<platform>-modern and dist/<platform>-legacy. Tizen signs with the
// Tizen CLI profile TIZEN_SIGN_PROFILE, by default Moonfin. --unsigned zips the wgt without the
// Tizen CLI, as CI makes releases: a Samsung certificate only covers the TVs registered on it, so
// each user's own tooling signs the release.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve, sep } from 'node:path'
import { zipSync } from 'fflate'
import { bootTags, combine } from './bootPage.mjs'
import { OTA_BOOT, applyOta, otaKey } from './ota/index.mjs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = fileURLToPath(new URL('..', import.meta.url))
// npm's global tools are .cmd files and Tizen's CLI is a .bat on Windows, and both need a shell there.
const isWindows = process.platform === 'win32'
const tool = (cmd, args) =>
  execFileSync(cmd, isWindows ? args.map((a) => `"${a}"`) : args, { stdio: 'inherit', shell: isWindows })
const args = process.argv.slice(2)
const target = args[0]
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const test = process.env.MOONFIN_FLAVOR === 'test'
if (!['', 'test', 'release'].includes(process.env.MOONFIN_FLAVOR || '')) throw new Error(`MOONFIN_FLAVOR is test or release, not ${process.env.MOONFIN_FLAVOR}`)
if (target !== 'webos' && target !== 'tizen') {
  console.error('usage: [MOONFIN_FLAVOR=test] node scripts/package.mjs webos|tizen [--modern <dist>] [--legacy <dist>] [--unsigned]')
  process.exit(1)
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const meta = join(root, 'packaging', target)
const out = join(root, 'out')
const modern = resolve(root, option('--modern', `dist/${target}-modern`))
const legacy = resolve(root, option('--legacy', `dist/${target}-legacy`))
for (const dir of [modern, legacy]) if (!existsSync(join(dir, 'index.html'))) throw new Error(`no build in ${dir}`)
const pages = [legacy, modern].map((d) => readFileSync(join(d, 'index.html'), 'utf8'))
// Sideloaded releases update in place when the update env is set (scripts/ota/index.mjs).
const ota = otaKey()

// Replaces exactly one match, so a packaging file that changed shape fails here instead of shipping unchanged.
const swap = (text, from, to) => {
  const hits = text.split(from).length - 1
  if (hits !== 1) throw new Error(`expected one ${from}, found ${hits}`)
  return text.replace(from, to)
}

// The legacy build, then the modern bundle beside it. The rest of the two builds is the same public folder.
const stage = (headFirst) => {
  const dir = join(out, `${target}-${test ? 'test' : 'release'}`)
  rmSync(dir, { recursive: true, force: true })
  cpSync(legacy, dir, { recursive: true })
  for (const name of readdirSync(join(modern, 'assets'))) {
    if (!existsSync(join(dir, 'assets', name))) cpSync(join(modern, 'assets', name), join(dir, 'assets', name))
  }
  const html = combine(pages[0], pages[1], { headFirst, boot: ota ? OTA_BOOT : '' })
  writeFileSync(join(dir, 'index.html'), html)
  return dir
}

const sizeOf = (file) => `${(statSync(file).size / 1048576).toFixed(1)} MB`
const scripts = (d) => readdirSync(join(d, 'assets')).filter((n) => n.endsWith('.js')).map((n) => `assets/${n}`)
// Once every file of the package is staged, since the update loader's shell hash covers them all.
const addOta = (dir, extraRoots) => {
  if (!ota) return
  const files = { modern: scripts(modern), legacy: scripts(legacy) }
  applyOta({ dir, platform: target, version, tags: bootTags(pages[0], pages[1]), files, extraRoots, outDir: out })
}
mkdirSync(out, { recursive: true })

if (target === 'webos') {
  const dir = stage('')
  for (const f of ['icon-80.png', 'icon-130.png', 'splash.png']) cpSync(join(meta, f), join(dir, f))
  const appinfo = { ...JSON.parse(readFileSync(join(meta, 'appinfo.json'), 'utf8')), version }
  if (test) Object.assign(appinfo, { id: 'org.moonfin.solidtv', title: 'Moonfin SolidTV' })
  writeFileSync(join(dir, 'appinfo.json'), JSON.stringify(appinfo, null, 4) + '\n')
  addOta(dir, test ? [] : [[join(meta, 'service'), 'service/']])
  // webOS names a service after its app, so only the release carries the Luna service the app
  // calls for TLS fallback, relaunch after an update and Developer Mode renewal.
  const ares = ['--no-minify', '-o', out, dir]
  if (!test) ares.push(join(meta, 'service'))
  tool('ares-package', ares)
  let ipk = join(out, `${appinfo.id}_${version}_all.ipk`)
  if (!test) {
    const named = join(out, `Moonfin_webOS_v${version}.ipk`)
    renameSync(ipk, named)
    ipk = named
    // The Homebrew Channel's repository entry, in the shape earlier releases published it.
    const manifest = {
      id: appinfo.id,
      version,
      type: 'web',
      title: appinfo.title,
      appDescription: 'Moonfin is an enhanced Jellyfin client for LG Smart TVs supporting webOS 3+',
      iconUri: 'https://raw.githubusercontent.com/Moonfin-Client/Smart-TV/main/packaging/webos/icon-130.png',
      sourceUrl: 'https://github.com/Moonfin-Client/Smart-TV',
      rootRequired: false,
      ipkUrl: `Moonfin_webOS_v${version}.ipk`,
      ipkHash: { sha256: createHash('sha256').update(readFileSync(ipk)).digest('hex') },
    }
    writeFileSync(join(out, 'org.moonfin.webos.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  }
  console.log(`${ipk} (${sizeOf(ipk)})`)
} else {
  // Samsung asks apps to load webapis.js, and older sets leave AVPlay parts out without it.
  const dir = stage('<script src="$WEBAPIS/webapis/webapis.js"></script>\n    ')
  cpSync(join(meta, 'icon.png'), join(dir, 'icon.png'))
  cpSync(join(meta, 'service'), join(dir, 'service'), { recursive: true })
  let config = readFileSync(join(meta, 'config.xml'), 'utf8').replace(/(<widget\b[^>]*\bversion=")[^"]*/, `$1${version}`)
  if (test) {
    config = swap(config, 'id="http://moonfin.org/tizen"', 'id="http://moonfin.org/solidtv"')
    config = swap(config, 'id="MoonfinApp.moonfin" package="MoonfinApp"', 'id="MnfnSolid1.Moonfin" package="MnfnSolid1"')
    config = swap(config, 'id="MoonfinApp.service"', 'id="MnfnSolid1.service"')
    config = swap(config, '<name>Moonfin</name>', '<name>Moonfin SolidTV</name>')
    // The service finds the app it relaunches by the package plus this name.
    const service = join(dir, 'service', 'service.js')
    writeFileSync(service, swap(readFileSync(service, 'utf8'), "packageId + '.moonfin'", "packageId + '.Moonfin'"))
  }
  writeFileSync(join(dir, 'config.xml'), config)
  addOta(dir, [])
  const name = test ? 'Moonfin SolidTV' : 'Moonfin'
  rmSync(join(out, `${name}.wgt`), { force: true })
  if (args.includes('--unsigned')) {
    const files = readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile())
    const entries = Object.fromEntries(files.map((f) => [f.split(sep).join('/'), readFileSync(join(dir, f))]))
    writeFileSync(join(out, `${name}.wgt`), zipSync(entries, { level: 9 }))
  } else {
    const tizen = process.env.TIZEN_CLI || join(homedir(), 'tizen-studio', 'tools', 'ide', 'bin', isWindows ? 'tizen.bat' : 'tizen')
    tool(isWindows ? `"${tizen}"` : tizen, ['package', '-t', 'wgt', '-s', process.env.TIZEN_SIGN_PROFILE || 'Moonfin', '-o', out, '--', dir])
  }
  // The TV installer fails silently on a space in the file name.
  const wgt = join(out, test ? 'MoonfinSolidTV.wgt' : `Moonfin_Tizen_Regular_v${version}.wgt`)
  renameSync(join(out, `${name}.wgt`), wgt)
  console.log(`${wgt} (${sizeOf(wgt)})`)
}
