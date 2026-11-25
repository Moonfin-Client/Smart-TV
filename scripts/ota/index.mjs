// In-app updates for sideloaded webOS and Tizen packages. A package gets the update loader only
// when both of these are set:
//   MOONFIN_OTA_URL         where release files download from, the tag folder goes after it
//                           (CI: https://github.com/<repo>/releases/download)
//   MOONFIN_OTA_PUBLIC_KEY  the PEM the loader checks signatures with (scripts/ota/public.pem)
// Store builds leave them unset. With MOONFIN_OTA_SIGNING_KEY (the private PEM, kept out of the
// repo) also set, packaging writes out/moonfin-ota-<platform>.json and .bin, to attach to the
// GitHub release whose tag is the package version. Relative paths count from the repo root.
import { createHash, sign } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

// What an update replaces: both bundles' scripts, the translations, which change in nearly every
// release, and every other file the app loads through the renderer or assetUrl(). The shell is what
// the TV takes only at install (the manifests and the service), the boot page, the loader, and the
// comic reader's worker, which finds its wasm beside itself. An update only applies to the exact shell
// it was built with.
const CODE = /^assets\/[^/]+\.js$/
const STRINGS = /^resources\/(.+\/)?strings\.json$/
const SHELL = /^(index\.html|ota-loader\.js|config\.xml|appinfo\.json|splash\.png|service\/.+|reader\/libarchive-worker\.js|reader\/wasm-gen\/.+)$/
const NOT_SHELL = /^(icon[^/]*\.png|author-signature\.xml|signature\d*\.xml|\.manifest\.tmp|ota-assets\.json)$/
const isAsset = (name) => !CODE.test(name) && !STRINGS.test(name) && !SHELL.test(name) && !NOT_SHELL.test(name)
// The package's own copy of each asset, by hash, so a TV stores only the ones an update changes.
const ASSETS_FILE = 'ota-assets.json'
const VERSIONED = /^(config\.xml|appinfo\.json)$/
// The loader's config holds the shell hash and the bundles' file names, which change every
// release. It's written with no '<' in it so this always finds its end.
const CONFIG = /<script>window\.MOONFIN_OTA=[^<]*<\/script>/

// Stands in for the boot script in index.html until applyOta fills in the config.
export const OTA_BOOT = '<script>window.MOONFIN_OTA={}</script><script src="ota-loader.js"></script>'

// The public key's path when this build gets the loader, otherwise null.
export const otaKey = (log = console.log) => {
  if (!process.env.MOONFIN_OTA_URL || !process.env.MOONFIN_OTA_PUBLIC_KEY) return null
  const file = resolve(REPO_ROOT, process.env.MOONFIN_OTA_PUBLIC_KEY)
  if (existsSync(file)) return file
  log(`OTA skipped, no public key at ${relative(REPO_ROOT, file)}`)
  return null
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

const listFiles = (dir, prefix = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name
    return entry.isDirectory() ? listFiles(join(dir, entry.name), rel + '/') : [rel]
  })

export const shellHash = (roots, version) => {
  const lines = []
  for (const [dir, prefix] of roots) {
    for (const name of listFiles(dir, prefix)) {
      if (!SHELL.test(name)) continue
      let data = readFileSync(join(dir, name.slice(prefix.length)))
      // Every release bumps the version in the manifests, which shouldn't count as a shell change.
      if (VERSIONED.test(name)) data = data.toString('utf8').split(version).join('')
      if (name === 'index.html') data = data.toString('utf8').replace(CONFIG, '')
      lines.push(name + ' ' + sha256(data))
    }
  }
  return sha256(lines.sort().join('\n'))
}

const pemBody = (file) => readFileSync(file, 'utf8').replace(/-----[^-]+-----|\s/g, '')

// The legacy tags get the SystemJS fetch hook right before the entry, so a stored release's chunks
// load from storage.
const withHook = (legacy) => {
  const entry = /<script\b[^>]*\bid="vite-legacy-entry"/
  if (!entry.test(legacy)) throw new Error('OTA: no legacy entry tag to put the chunk hook before')
  const hook = readFileSync(join(HERE, 'systemFetch.js'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
  return legacy.replace(entry, (tag) => `<script>${hook}</script>${tag}`)
}

// Call it only when otaKey() gave a key. dir is the staged package with index.html holding
// OTA_BOOT. tags are bootPage's { modern, legacy } script tags and files each bundle's scripts, as
// package paths. extraRoots are [dir, prefix] pairs that also ship in the package (the webOS service).
export const applyOta = ({ dir, platform, version, tags, files, extraRoots = [], outDir, log = console.log }) => {
  const publicKey = otaKey(log)
  if (!publicKey) throw new Error('OTA: MOONFIN_OTA_URL and MOONFIN_OTA_PUBLIC_KEY are needed')
  copyFileSync(join(HERE, 'loader.js'), join(dir, 'ota-loader.js'))
  const assets = listFiles(dir).filter(isAsset).sort()
  const ownAssets = Object.fromEntries(assets.map((n) => [n, sha256(readFileSync(join(dir, n))).slice(0, 16)]))
  writeFileSync(join(dir, ASSETS_FILE), JSON.stringify(ownAssets))
  const shell = shellHash([[dir, ''], ...extraRoots], version)
  const engines = {
    modern: { tags: tags.modern, files: files.modern },
    legacy: { tags: withHook(tags.legacy), files: files.legacy },
  }
  const boot = { modern: engines.modern.tags, legacy: engines.legacy.tags }
  const config = { platform, version, shell, url: process.env.MOONFIN_OTA_URL.replace(/\/+$/, ''), key: pemBody(publicKey), boot }
  const indexPath = join(dir, 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  if (html.split(OTA_BOOT).length !== 2) throw new Error('OTA: index.html should hold the loader stand-in once')
  writeFileSync(indexPath, html.replace(OTA_BOOT, OTA_BOOT.replace('{}', JSON.stringify(config).replace(/</g, '\\u003c'))))
  log(`OTA loader added (${platform} ${version}, shell ${shell.slice(0, 12)})`)

  // Release files left from an earlier run belong to another package.
  for (const ext of ['.json', '.bin']) rmSync(join(outDir, `moonfin-ota-${platform}${ext}`), { force: true })
  if (!process.env.MOONFIN_OTA_SIGNING_KEY) return { shell }
  const signingKey = resolve(REPO_ROOT, process.env.MOONFIN_OTA_SIGNING_KEY)

  // One .bin per release keeps the release page to two update files per platform. Both bundles, every
  // language and every asset go in it, and a TV keeps only the bundle its engine runs, its own language
  // and the assets that differ from its package.
  const names = [...new Set([...files.modern, ...files.legacy, ...listFiles(dir).filter((n) => STRINGS.test(n)), ...assets])].sort()
  for (const name of names) if (SHELL.test(name) || NOT_SHELL.test(name)) throw new Error(`OTA: ${name} is part of the shell`)
  const parts = names.map((name) => readFileSync(join(dir, name)))
  const bin = Buffer.concat(parts)
  const payload = JSON.stringify({
    platform,
    version,
    shell,
    bytes: bin.length,
    sha256: sha256(bin),
    files: names.map((name, i) => [name, parts[i].length]),
    assets: assets.map((name) => [name, ownAssets[name]]),
    engines,
  })
  const sig = sign('sha256', Buffer.from(payload), readFileSync(signingKey, 'utf8')).toString('base64')
  writeFileSync(join(outDir, `moonfin-ota-${platform}.bin`), bin)
  writeFileSync(join(outDir, `moonfin-ota-${platform}.json`), JSON.stringify({ payload, sig }))
  log(`OTA release files written: moonfin-ota-${platform}.json and .bin (${names.length} files, ${(bin.length / 1048576).toFixed(1)} MB)`)
  return { shell }
}
