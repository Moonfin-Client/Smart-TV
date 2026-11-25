// Builds Moonfin for Vega OS (Fire TV).
//
// The app is built with PLATFORM=vega TARGET=modern, prepared for life at file:///pkg/assets, and
// copied into the React Native shell under shell/, which hosts it in the Vega WebView. The shell
// is then built into a .vpkg with the Vega SDK, so that last step needs `vega` on the PATH. The
// package is org.moonfin.androidtv, the earlier Moonfin TV app's, so it installs over that app and
// keeps its storage.
// MOONFIN_FLAVOR=test makes org.moonfin.solidtv, "Moonfin SolidTV", which installs beside it.
// --install and --launch with the release identity want MOONFIN_FLAVOR=release spelled out, so a
// test install never replaces Moonfin by accident.
//
//   [MOONFIN_FLAVOR=test|release] node vega/build.mjs [--debug] [--no-vpkg] [--install] [--launch] [--inject <file>]
//
// --inject adds one more script to the page head, ahead of the app, for test builds (a write guard).
// The package version follows package.json. The .vpkg lands in out/.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const VEGA_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = join(VEGA_DIR, '..')
const SHELL_DIR = join(VEGA_DIR, 'shell')
const ASSETS_DIR = join(SHELL_DIR, 'assets')
const INJECT_DIR = join(VEGA_DIR, 'inject')
const BRAND_DIR = join(VEGA_DIR, 'brand')
const OUT_DIR = join(ROOT_DIR, 'out')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const flavor = process.env.MOONFIN_FLAVOR || 'release'
if (flavor !== 'test' && flavor !== 'release') throw new Error(`MOONFIN_FLAVOR is test or release, not ${flavor}`)
const IDENTITY = flavor === 'test' ? { id: 'org.moonfin.solidtv', title: 'Moonfin SolidTV', file: 'MoonfinSolidTV' } : { id: 'org.moonfin.androidtv', title: 'Moonfin', file: 'Moonfin' }

const run = (cmd, opts = {}) => {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

// Files the app reads with XHR, fetch or the renderer's image worker, which a file:// page can't.
// Each is also left where it is, for the reads that do work from file:// (@font-face, FontFace).
const PACKED = /\.(png|jpe?g|webp|gif|json|ttf|otf|woff2?)$/i
const TEXT = /\.json$/i

// Workers and the files they read by relative URL, for inject/worker-shim.js.
const WORKER_ASSETS = [
  'subtitles-octopus-worker.js',
  'subtitles-octopus-worker.wasm',
  'ass-fallback-font.ttf',
  'reader/libarchive-worker.js',
  'reader/wasm-gen/libarchive.wasm',
  'reader/pdf.worker.min.js',
]

const walk = (dir, list = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, list)
    else list.push(path)
  }
  return list
}

const packFiles = (dir) => {
  const filesDir = join(dir, 'vega-files')
  let count = 0
  let bytes = 0
  for (const path of walk(dir)) {
    const name = relative(dir, path)
    if (!PACKED.test(name) || name.startsWith('vega-')) continue
    const data = readFileSync(path)
    const line = TEXT.test(name)
      ? `__moonfinVegaFile(${JSON.stringify(name)},0,${JSON.stringify(data.toString('utf8'))});\n`
      : `__moonfinVegaFile(${JSON.stringify(name)},1,${JSON.stringify(data.toString('base64'))});\n`
    const target = join(filesDir, `${name}.js`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, line)
    count++
    bytes += line.length
  }
  console.log(`  Packed ${count} files, ${(bytes / 1048576).toFixed(1)} MB`)
}

const writeWorkerAssets = (dir) => {
  const assetDir = join(dir, 'vega-assets')
  mkdirSync(assetDir, { recursive: true })
  for (const file of WORKER_ASSETS) {
    const src = join(dir, file)
    if (!existsSync(src)) {
      console.warn(`  ${file} not found, subtitles or books may degrade`)
      continue
    }
    const name = basename(file)
    const base64 = readFileSync(src).toString('base64')
    writeFileSync(join(assetDir, `${name}.js`), `__moonfinVegaAsset(${JSON.stringify(name)},${JSON.stringify(base64)});\n`)
  }
}

// The scripts run in name order ahead of the app's deferred bundle.
const injectScripts = (dir) => {
  const vegaDir = join(dir, 'vega')
  mkdirSync(vegaDir, { recursive: true })
  const files = readdirSync(INJECT_DIR).sort()
  for (const file of files) copyFileSync(join(INJECT_DIR, file), join(vegaDir, file))
  const extra = option('--inject')
  if (extra) {
    copyFileSync(extra, join(vegaDir, `test-${basename(extra)}`))
    files.unshift(`test-${basename(extra)}`)
  }
  const tags = files.map((file) => `<script src="vega/${file}"></script>`).join('\n    ')
  const indexPath = join(dir, 'index.html')
  // file:// pages fail CORS-mode loads, so drop the crossorigin attributes Vite adds.
  const html = readFileSync(indexPath, 'utf8').replace(/ crossorigin/g, '')
  if (!/<script defer src=/.test(html)) throw new Error('No app script in index.html')
  writeFileSync(indexPath, html.replace(/<script defer src=/, `${tags}\n    <script defer src=`))
}

// A zip with the entries stored as they are, which is all the splash service reads.
const crc32 = (buffer) => {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

const storeZip = (entries) => {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// The icon named in the manifest is read from assets/image, and the splash service plays
// assets/raw/SplashScreenImages.zip until the shell hides it.
const writeBrandAssets = (dir) => {
  mkdirSync(join(dir, 'image'), { recursive: true })
  copyFileSync(join(BRAND_DIR, 'icon.png'), join(dir, 'image', 'icon.png'))
  mkdirSync(join(dir, 'raw'), { recursive: true })
  const zip = storeZip([
    { name: 'desc.txt', data: Buffer.from('1920 1080 30\nc 0 0 _loop\n', 'utf8') },
    { name: '_loop/', data: Buffer.alloc(0) },
    { name: '_loop/loop00000.png', data: readFileSync(join(BRAND_DIR, 'splash.png')) },
  ])
  writeFileSync(join(dir, 'raw', 'SplashScreenImages.zip'), zip)
}

const buildApp = () => {
  console.log('Building SolidTV for Vega...')
  rmSync(ASSETS_DIR, { recursive: true, force: true })
  run(`npx vite build --outDir ${JSON.stringify(ASSETS_DIR)}`, {
    cwd: ROOT_DIR,
    env: { ...process.env, PLATFORM: 'vega', TARGET: 'modern' },
  })
  console.log('\n Packing the files the app reads for file://...')
  packFiles(ASSETS_DIR)
  writeWorkerAssets(ASSETS_DIR)
  console.log('\n Patching index.html...')
  injectScripts(ASSETS_DIR)
  writeBrandAssets(ASSETS_DIR)
}

// The flavor's package and app names, written into the shell's manifest and app.json each build.
const syncManifest = (version) => {
  const manifestPath = join(SHELL_DIR, 'manifest.toml')
  const manifest = readFileSync(manifestPath, 'utf8')
  const updated = manifest
    .replace(/^(version = ")[^"]*(")/m, `$1${version}$2`)
    .replace(/^(title = ")[^"]*(")/m, `$1${IDENTITY.title}$2`)
    .replace(/^(id = ")org\.moonfin\.[a-z]+(")/m, `$1${IDENTITY.id}$2`)
    .replace(/^(id = ")org\.moonfin\.[a-z]+\.main(")/m, `$1${IDENTITY.id}.main$2`)
  if (!updated.includes(`id = "${IDENTITY.id}.main"`)) throw new Error('manifest.toml changed shape, its ids were not found')
  if (updated !== manifest) writeFileSync(manifestPath, updated)
  const appJsonPath = join(SHELL_DIR, 'app.json')
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'))
  writeFileSync(appJsonPath, JSON.stringify({ ...appJson, name: `${IDENTITY.id}.main`, displayName: IDENTITY.title }, null, '\t') + '\n')
}

// The store wants a build number that only goes up, so it follows the version.
const buildNumber = (version) => {
  const [major, minor, patch] = version.split('.').map(Number)
  return major * 10000 + minor * 100 + patch
}

const buildVpkg = (version) => {
  if (!existsSync(join(SHELL_DIR, 'node_modules'))) {
    console.log('\n Installing shell dependencies...')
    run('npm install --no-audit --no-fund', { cwd: SHELL_DIR })
  }
  const buildType = flag('--debug') ? 'Debug' : 'Release'
  console.log(`\n Building the Vega package (${buildType})...`)
  run(`npx react-native build-vega --build-type ${buildType} --build-number ${buildNumber(version)}`, { cwd: SHELL_DIR })

  const builtDir = join(SHELL_DIR, 'build', `armv7-${buildType.toLowerCase()}`)
  const built = existsSync(builtDir) ? readdirSync(builtDir).find((file) => file.endsWith('.vpkg')) : null
  if (!built) throw new Error(`No .vpkg found under ${builtDir}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const finalName = `${IDENTITY.file}_Vega_${buildType === 'Debug' ? 'Debug_' : ''}v${version}.vpkg`
  if (existsSync(join(OUT_DIR, finalName))) unlinkSync(join(OUT_DIR, finalName))
  copyFileSync(join(builtDir, built), join(OUT_DIR, finalName))
  console.log(`  out/${finalName}`)

  // The CLI refuses to pick when it sees more than one device, unauthorized ones included.
  const device = process.env.VEGA_SERIAL ? ` -d ${process.env.VEGA_SERIAL}` : ''
  if (flag('--install') || flag('--launch')) run(`vega device install-app${device} --packagePath ${JSON.stringify(join(OUT_DIR, finalName))}`)
  if (flag('--launch')) run(`vega device launch-app${device} --appName ${IDENTITY.id}.main`)
}

try {
  const { version } = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))
  if ((flag('--install') || flag('--launch')) && flavor === 'release' && process.env.MOONFIN_FLAVOR !== 'release') {
    throw new Error('--install would replace Moonfin (org.moonfin.androidtv). Set MOONFIN_FLAVOR=test, or MOONFIN_FLAVOR=release to mean it.')
  }
  console.log(`Package ${IDENTITY.id} (${flavor})`)
  buildApp()
  syncManifest(version)
  if (flag('--no-vpkg')) console.log(`\n Assets ready in ${ASSETS_DIR}.`)
  else buildVpkg(version)
  console.log('\n Build complete!')
} catch (err) {
  console.error('\n Build failed:', err.message)
  process.exit(1)
}
