// Builds Moonfin for Xbox.
//
// The app is built with PLATFORM=xbox TARGET=modern (WebView2 follows current Edge) into the UWP
// host under shell/Moonfin.Xbox/www, which serves it to a WebView2 from the package as
// http://moonfin.internal. MSBuild then makes the .msix, so that last step needs Windows with the
// Visual Studio Build Tools and their Universal Windows Platform workload. --no-msix stops once the
// web app is in place, which works anywhere.
//
//   node xbox/build.mjs [--debug] [--tester] [--store] [--no-msix] [--no-web] [--probe-clips] [--clips <name,name>]
//     [--server <url>] [--emby <url>] [--image <url>] [--report <url>] [--media <label=url>]... [--dev-url <url>] [--install <console>]
//
// The app carries the device probe (probe.mjs), which Settings opens for a signed in user.
// --probe-clips adds the test clips its playback run plays, made beforehand with
// probe/make-clips.cjs. They are some 70 MB, so no build takes them unless asked. --clips takes only
// the ones named. --server, --emby, --image, --report and --media are written into the probe's config.
//
// The package is Moonfin.Xbox, the earlier Moonfin TV app's identity, so it installs over that app
// and keeps its storage. MOONFIN_FLAVOR=test makes Moonfin.Xbox.SolidTV, "Moonfin SolidTV", which
// installs beside it. --store makes the Store upload under the Store product's identity, as CI does
// on tags.
// --install with the release identity wants MOONFIN_FLAVOR=release spelled out, so a test install never
// replaces Moonfin by accident. --tester, --debug and --install count the version's last part up so a console takes the package
// over the one it has. --dev-url makes a Debug package that loads the app from a dev server
// (PLATFORM=xbox TARGET=modern npx vite --host). --install sends it to a console in Developer Mode
// through console.cjs.
//
// It is signed with the certificate in MOONFIN_XBOX_PFX (password in MOONFIN_XBOX_PFX_PASSWORD), or
// with a throwaway one made and kept in xbox/.cert, which is all sideloading needs. The packages and
// the console's dependencies land in out/.
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeProbe } from './probe.mjs'

const XBOX_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = join(XBOX_DIR, '..')
const OUT_DIR = join(ROOT_DIR, 'out')
const HOST_DIR = join(XBOX_DIR, 'shell', 'Moonfin.Xbox')
const WWW_DIR = join(HOST_DIR, 'www')
const PACKAGES_DIR = join(HOST_DIR, 'AppPackages')
const CERT_DIR = join(XBOX_DIR, '.cert')
const MANIFEST_PATH = join(HOST_DIR, 'Package.appxmanifest')
const BUILD_MANIFEST = 'Package.Build.appxmanifest'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const test = process.env.MOONFIN_FLAVOR === 'test'
if (!['', 'test', 'release'].includes(process.env.MOONFIN_FLAVOR || '')) throw new Error(`MOONFIN_FLAVOR is test or release, not ${process.env.MOONFIN_FLAVOR}`)

// The Store product the package is submitted under, shared with the desktop app.
const STORE_IDENTITY = { name: 'Moonfin.Moonfin', publisher: 'CN=4E670673-D47F-4792-94F7-65B4918F6E4C' }
// The side-by-side test package, with a PhoneProductId of its own.
const TEST_IDENTITY = { name: 'Moonfin.Xbox.SolidTV', phone: '6d1f3a52-8c47-4f0e-9b2a-5e7c1d9a3b64', title: 'Moonfin SolidTV' }

const run = (cmd, opts = {}) => {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

// A server can be at any address, so pictures, media and requests stay open, while scripts
// written into the page, frames and plugins stay shut. Workers come from blob: (the
// renderer's image decoder, the emulator) and the book reader unpacks an EPUB's own stylesheets there.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' blob: http: https:",
  "style-src 'self' 'unsafe-inline' blob: http: https:",
  'img-src * data: blob:',
  'media-src * data: blob:',
  'connect-src * ws: wss: data: blob:',
  "font-src 'self' data: blob: http: https:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const buildApp = () => {
  console.log('Building SolidTV for Xbox...')
  rmSync(WWW_DIR, { recursive: true, force: true })
  run(`npx vite build --emptyOutDir --outDir ${JSON.stringify(WWW_DIR)}`, { cwd: ROOT_DIR, env: { ...process.env, PLATFORM: 'xbox', TARGET: 'modern' } })
  const file = join(WWW_DIR, 'index.html')
  const html = readFileSync(file, 'utf8')
  // The policy refuses inline scripts, so the page can't have any.
  if (/<script>/.test(html) || !html.includes('<head>')) throw new Error('index.html changed shape, check the policy')
  writeFileSync(file, html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`))
  const chosen = (option('--clips') || '').split(',').filter(Boolean)
  const clips = flag('--probe-clips') || chosen.length > 0
  const every = (name) => args.map((arg, i) => (arg === name ? args[i + 1] : null)).filter(Boolean)
  const probe = writeProbe(join(WWW_DIR, 'probe'), {
    assets: '../',
    clips,
    chosen,
    tester: flag('--tester'),
    server: option('--server') || '',
    emby: option('--emby') || '',
    image: option('--image') || '',
    report: option('--report') || '',
    media: every('--media'),
  })
  console.log(` Device probe added, ${probe.bundled.length} test clips${clips ? '' : ' (pass --probe-clips to bundle them)'}`)
}

// Nothing is packed for a dev server build. The host finds the address in the one file www holds.
const writeDevUrl = (devUrl) => {
  if (!/^https?:\/\/[^/]/i.test(devUrl || '')) throw new Error(`--dev-url needs an http or https address, got ${devUrl}`)
  const url = new URL(devUrl)
  rmSync(WWW_DIR, { recursive: true, force: true })
  mkdirSync(WWW_DIR, { recursive: true })
  writeFileSync(join(WWW_DIR, 'dev-url.txt'), `${url.href}\n`)
  console.log(` The package will load the app from ${url.href}`)
}

// A console only takes a package over one it already has when the version went up, and removing
// the old one first throws away the sign-in and every setting. The count is kept beside the certificate.
const countsVersionUp = () => flag('--debug') || flag('--install') || flag('--tester')
const nextRevision = () => {
  const file = join(CERT_DIR, 'debug-revision.txt')
  const last = existsSync(file) ? Number(readFileSync(file, 'utf8')) || 0 : 0
  const next = last >= 65535 ? 1 : last + 1
  mkdirSync(CERT_DIR, { recursive: true })
  writeFileSync(file, String(next))
  return next
}

// The desktop app's x64 MSIX shares the Store product with the plain app version, so the Store
// build moves the third part up by 1000.
const storeVersion = (version) => version.replace(/\.(\d+)$/, (_, patch) => `.${Number(patch) + 1000}`)

// Written fresh each build and never kept, so MSBuild never reuses the manifest of the build before.
const writeBuildManifest = (version) => {
  let manifest = readFileSync(MANIFEST_PATH, 'utf8')
  const packageVersion = flag('--store') ? storeVersion(version) : version
  manifest = manifest.replace(/(<Identity[^>]*?Version=")[^"]*(")/, `$1${packageVersion}.${countsVersionUp() ? nextRevision() : 0}$2`)
  if (flag('--store')) {
    manifest = manifest
      .replace(/(<Identity[^>]*?Name=")[^"]*(")/, `$1${STORE_IDENTITY.name}$2`)
      .replace(/(<Identity[^>]*?Publisher=")[^"]*(")/, `$1${STORE_IDENTITY.publisher}$2`)
  } else if (test) {
    manifest = manifest
      .replace(/(<Identity[^>]*?Name=")[^"]*(")/, `$1${TEST_IDENTITY.name}$2`)
      .replace(/(PhoneProductId=")[^"]*(")/, `$1${TEST_IDENTITY.phone}$2`)
      .replace(/<DisplayName>[^<]*<\/DisplayName>/, `<DisplayName>${TEST_IDENTITY.title}</DisplayName>`)
      .replace(/(<uap:VisualElements[^>]*?DisplayName=")[^"]*(")/, `$1${TEST_IDENTITY.title}$2`)
  }
  writeFileSync(join(HOST_DIR, BUILD_MANIFEST), manifest)
  return manifest
}

const syncManifestVersion = (version) => {
  const manifest = readFileSync(MANIFEST_PATH, 'utf8')
  const updated = manifest.replace(/(<Identity[^>]*?Version=")[^"]*(")/, `$1${version}.0$2`)
  if (updated !== manifest) writeFileSync(MANIFEST_PATH, updated)
}

const manifestPublisher = () => {
  const match = /<Identity[^>]*?Publisher="([^"]*)"/.exec(readFileSync(MANIFEST_PATH, 'utf8'))
  if (!match) throw new Error('No Publisher in Package.appxmanifest')
  return match[1]
}

const findMSBuild = () => {
  const vswhere = join(process.env['ProgramFiles(x86)'] || '', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (process.platform !== 'win32' || !existsSync(vswhere)) return null
  const found = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.Component.MSBuild', '-find', 'MSBuild\\**\\Bin\\MSBuild.exe'], { encoding: 'utf8' })
  return found.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || null
}

// A code signing certificate of the manifest's publisher, made in memory and written straight to
// .cert, so no certificate store on the machine is touched.
const CERT_SCRIPT = `
param($Subject, $PfxPath, $CerPath, $Password)
$ErrorActionPreference = 'Stop'
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$request = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest($Subject, $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$request.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension($false, $false, 0, $true)))
$request.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true)))
$usages = New-Object System.Security.Cryptography.OidCollection
[void]$usages.Add((New-Object System.Security.Cryptography.Oid('1.3.6.1.5.5.7.3.3')))
$request.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension($usages, $true)))
$certificate = $request.CreateSelfSigned([System.DateTimeOffset]::UtcNow.AddDays(-1), [System.DateTimeOffset]::UtcNow.AddYears(5))
[System.IO.File]::WriteAllBytes($PfxPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password))
[System.IO.File]::WriteAllBytes($CerPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
`

const signingCertificate = () => {
  if (process.env.MOONFIN_XBOX_PFX && !flag('--store')) {
    const pfx = resolve(process.env.MOONFIN_XBOX_PFX)
    if (!existsSync(pfx)) throw new Error(`MOONFIN_XBOX_PFX names ${pfx}, which does not exist`)
    return { pfx, password: process.env.MOONFIN_XBOX_PFX_PASSWORD || '' }
  }
  const kind = flag('--store') ? 'store' : 'dev'
  const pfx = join(CERT_DIR, `moonfin-xbox-${kind}.pfx`)
  const cer = join(CERT_DIR, `moonfin-xbox-${kind}.cer`)
  const passwordFile = join(CERT_DIR, `${kind}-password.txt`)
  const subjectFile = join(CERT_DIR, `${kind}-subject.txt`)
  const subject = flag('--store') ? STORE_IDENTITY.publisher : manifestPublisher()
  const current = existsSync(pfx) && existsSync(passwordFile) && existsSync(subjectFile) && readFileSync(subjectFile, 'utf8') === subject
  if (!current) {
    console.log(`\n Making a throwaway signing certificate for ${subject}...`)
    mkdirSync(CERT_DIR, { recursive: true })
    const password = randomBytes(18).toString('base64url')
    const script = join(CERT_DIR, 'make-certificate.ps1')
    writeFileSync(script, CERT_SCRIPT)
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Subject', subject, '-PfxPath', pfx, '-CerPath', cer, '-Password', password], { stdio: 'inherit' })
    rmSync(script, { force: true })
    writeFileSync(passwordFile, password)
    writeFileSync(subjectFile, subject)
  }
  return { pfx, cer, password: readFileSync(passwordFile, 'utf8') }
}

const findFiles = (dir, match) => {
  const found = []
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findFiles(full, match))
    else if (match(entry.name)) found.push(full)
  }
  return found
}

const buildMsix = (version) => {
  const msbuild = findMSBuild()
  if (!msbuild) throw new Error('MSBuild was not found. The package needs Windows with the Visual Studio Build Tools and their Universal Windows Platform workload. Run again with --no-msix to stop at the web app.')
  const configuration = flag('--debug') ? 'Debug' : 'Release'
  const certificate = signingCertificate()
  console.log(`\n Building the Xbox package (${configuration})...`)
  rmSync(PACKAGES_DIR, { recursive: true, force: true })
  writeBuildManifest(version)
  const msbuildArgs = [
    join(HOST_DIR, 'Moonfin.Xbox.csproj'),
    '-restore',
    '-nologo',
    '-verbosity:minimal',
    `-p:Configuration=${configuration}`,
    '-p:Platform=x64',
    `-p:UapAppxPackageBuildMode=${flag('--store') ? 'StoreUpload' : 'SideloadOnly'}`,
    `-p:AppxPackageDir=${PACKAGES_DIR}${sep}`,
    '-p:AppxPackageSigningEnabled=true',
    `-p:PackageCertificateKeyFile=${certificate.pfx}`,
    `-p:MoonfinManifest=${BUILD_MANIFEST}`,
  ]
  console.log(`> MSBuild ${msbuildArgs.slice(1).join(' ')}`)
  // The password goes in through the environment, where MSBuild reads properties too, so it stays out of the log.
  execFileSync(msbuild, msbuildArgs, { stdio: 'inherit', env: { ...process.env, PackageCertificatePassword: certificate.password } })

  const extension = flag('--store') ? 'msixupload' : 'msix'
  const packageName = flag('--store') ? /^Moonfin\.Moonfin_.*\.msixupload$/ : /^Moonfin\.Xbox(\.SolidTV)?_.*\.(msix|appx)$/
  const built = findFiles(PACKAGES_DIR, (name) => packageName.test(name))[0]
  if (!built) throw new Error(`No package found under ${PACKAGES_DIR}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const finalName = `${test ? 'MoonfinSolidTV' : 'Moonfin'}_Xbox_${flag('--store') ? 'Store_' : ''}${configuration === 'Debug' ? 'Debug_' : ''}v${version}.${extension}`
  if (existsSync(join(OUT_DIR, finalName))) unlinkSync(join(OUT_DIR, finalName))
  copyFileSync(built, join(OUT_DIR, finalName))
  console.log(`  out/${finalName}`)
  // A console needs these installed along with the package the first time.
  const dependencies = join(dirname(built), 'Dependencies', 'x64')
  if (existsSync(dependencies)) console.log(`  Dependencies for sideloading: ${dependencies}`)
  if (certificate.cer) console.log(`  Certificate it is signed with: ${certificate.cer}`)
  return { file: join(OUT_DIR, finalName), dependencies }
}

const installOnConsole = (address, { file, dependencies }) => {
  console.log(`\n Installing on ${address}...`)
  if (spawnSync(process.execPath, [join(XBOX_DIR, 'console.cjs'), address, 'install', file, dependencies], { stdio: 'inherit' }).status !== 0) {
    throw new Error('The package was built but never reached the console')
  }
}

try {
  const { version } = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))
  if (flag('--dev-url') && !flag('--debug')) throw new Error('--dev-url only works with --debug, since a Release host loads nothing but its own package')
  if (flag('--store') && (test || ['--debug', '--tester', '--dev-url', '--install', '--no-msix'].some(flag))) throw new Error('--store makes the Release upload on its own, without the other build options')
  const consoleAddress = option('--install')
  if (flag('--install') && (!consoleAddress || consoleAddress.startsWith('--') || flag('--no-msix'))) throw new Error('--install needs the address of a console, and has nothing to send it with --no-msix')
  if (flag('--install') && !test && process.env.MOONFIN_FLAVOR !== 'release') throw new Error('--install would replace Moonfin (Moonfin.Xbox). Set MOONFIN_FLAVOR=test, or MOONFIN_FLAVOR=release to mean it.')

  if (flag('--dev-url')) writeDevUrl(option('--dev-url'))
  else if (!flag('--no-web')) buildApp()
  else if (!existsSync(join(WWW_DIR, 'index.html'))) throw new Error(`--no-web needs the web app in ${WWW_DIR}, and it is not there`)
  syncManifestVersion(version)

  if (flag('--no-msix')) {
    console.log(`\n Web app ready in ${WWW_DIR}. Run again without --no-msix on Windows with the Visual Studio Build Tools to build the package.`)
  } else {
    const built = buildMsix(version)
    if (consoleAddress) installOnConsole(consoleAddress, built)
  }
  console.log('\n Build complete!')
} catch (err) {
  console.error('\n Build failed:', err.message)
  process.exit(1)
}
