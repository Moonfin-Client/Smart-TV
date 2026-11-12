/* eslint-disable no-console */
// Builds Moonfin for Xbox.
//
// The web app is packed with Enact like the other platforms and copied into the UWP
// host under shell/Moonfin.Xbox/www, which serves it to a WebView2 from the package.
// The host is then built into an .msix with MSBuild, so that last step needs Windows
// with the Visual Studio Build Tools and their UWP workload. Pass --no-msix to stop
// once the web app is in place, which works on any system.
//
//   node build.js [--debug] [--tester] [--store] [--no-msix] [--no-web] [--probe-clips] [--clips <name,name>] [--dev-url <url>] [--install <console>]
//   node build.js --probe [--debug] [--server <url>] [--emby <url>] [--image <url>] [--report <url>] [--media <label=url>]... [--install <console>]
//
// The app carries the device probe, which Settings opens for a signed in user, see
// probe/probe.js. --probe-clips adds the test clips its playback run plays, made
// beforehand with probe/make-clips.js. They are some 70 MB, so no build takes them
// unless asked. --clips takes only the ones named, for testers sent to one test.
//
// --tester makes the package to hand to testers. Its version counts up so it installs
// over the build they already have.
//
// --store makes the upload for the Microsoft Store, under the identity of the Store
// product the desktop app is listed as. The Store signs what it publishes, so a
// throwaway certificate of that publisher does here.
//
// --probe packages the probe page instead of the app, with the clips. It is a
// package of its own name, so it installs beside the app rather than over it, and
// is for a device the app doesnt start on.
//
// --no-web keeps the web app already in www and only builds the host again, for
// when nothing but the C# changed.
//
// --dev-url makes a Debug package that loads the app from a dev server (npm run
// dev:xbox) instead of from the package, so changes show on the console as they are
// saved.
//
// --install sends the package to a console in Developer Mode and starts it there,
// see console.js.
//
// The package is signed with the certificate in MOONFIN_XBOX_PFX, its password in
// MOONFIN_XBOX_PFX_PASSWORD. Without one a throwaway certificate is made and kept in
// .cert, which is all sideloading through the Device Portal needs. Either way its
// subject has to be the Publisher in Package.appxmanifest.
//
// The package version follows packages/app/package.json.
const {execFileSync, execSync, spawnSync} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {LINT_DIRS, runLintGate} = require('../../scripts/lint-gate');
const {copyReaderAssets} = require('../../scripts/reader-assets');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const HOST_DIR = path.join(__dirname, 'shell', 'Moonfin.Xbox');
const WWW_DIR = path.join(HOST_DIR, 'www');
const PACKAGES_DIR = path.join(HOST_DIR, 'AppPackages');
const CERT_DIR = path.join(__dirname, '.cert');
const MANIFEST_PATH = path.join(HOST_DIR, 'Package.appxmanifest');
const PROBE_DIR = path.join(__dirname, 'probe');
const BUILD_MANIFEST = 'Package.Build.appxmanifest';

// The Store product the package is submitted under, shared with the desktop app.
const STORE_IDENTITY = {name: 'Moonfin.Moonfin', publisher: 'CN=4E670673-D47F-4792-94F7-65B4918F6E4C'};

// Files the subtitle renderers load next to the page. The page has a real origin
// here, so they are copied as they are.
const LIBASS_DIR = path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js');
const PAGE_ASSETS = [
	{src: path.join(ROOT_DIR, 'node_modules', 'libpgs', 'dist', 'libpgs.worker.js')},
	{src: path.join(LIBASS_DIR, 'subtitles-octopus-worker.js')},
	{src: path.join(LIBASS_DIR, 'subtitles-octopus-worker.wasm')},
	{src: path.join(ROOT_DIR, 'node_modules', '@enact', 'sandstone', 'fonts', 'MuseoSans', 'MuseoSans-Light.ttf'), name: 'ass-fallback-font.ttf'},
	{src: path.join(APP_DIR, 'resources', 'banner-dark.png'), name: path.join('resources', 'banner-dark.png')}
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const chosenClips = () => (option('--clips') || '').split(',').filter(Boolean);
const bundlesClips = () => flag('--probe-clips') || chosenClips().length > 0;
const everyOption = (name) => args.map((arg, index) => (arg === name ? args[index + 1] : null)).filter(Boolean);

const run = (cmd, opts = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...opts});
};

const copyDirRecursive = (src, dest) => {
	fs.mkdirSync(dest, {recursive: true});
	for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
		else fs.copyFileSync(srcPath, destPath);
	}
};

const copyPageAssets = (dir) => {
	for (const asset of PAGE_ASSETS) {
		const name = asset.name || path.basename(asset.src);
		if (!fs.existsSync(asset.src)) {
			console.warn(`  ${name} not found, subtitle rendering may degrade`);
			continue;
		}
		const dest = path.join(dir, name);
		fs.mkdirSync(path.dirname(dest), {recursive: true});
		fs.copyFileSync(asset.src, dest);
		console.log(`  Copied ${name}`);
	}
};

// Sandstone's CSS asks for its fonts at /node_modules/@enact/sandstone/fonts, which
// the pack leaves out. The page is served from the root of www, so they go at that
// very path and the CSS stays as it is.
const SANDSTONE_FONTS = path.join('node_modules', '@enact', 'sandstone', 'fonts');

// What the page may load and run. A server can be at any address, so pictures,
// media and requests are left open. What is shut is a script written into the page,
// which is how markup out of a server or a subtitle would run one, along with frames
// and plugins. Scripts may still be evaluated and come from anywhere, since the
// emulator builds its workers that way and fetches its cores from the server.
// Stylesheets may come from blob: too, where the book reader unpacks an EPUB's own.
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
	"form-action 'none'"
].join('; ');

const addContentSecurityPolicy = (dir) => {
	const file = path.join(dir, 'index.html');
	const html = fs.readFileSync(file, 'utf8');
	if (!html.includes('<head>')) throw new Error('index.html has no head to put the content security policy in');
	fs.writeFileSync(file, html.replace('<head>', `<head>\n\t\t<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`));
};

const buildApp = (appPkg) => {
	const ENACT_ALIAS = JSON.stringify({
		'@moonfin/platform-webos': path.resolve(__dirname, '..', 'platform-webos', 'src'),
		'@moonfin/platform-tizen': path.resolve(__dirname, '..', 'platform-tizen', 'src'),
		'@moonfin/platform-vega': path.resolve(__dirname, '..', 'platform-vega', 'src'),
		'@moonfin/platform-xbox': path.resolve(__dirname, '..', 'platform-xbox', 'src'),
		'@moonfin/app': APP_DIR
	});

	console.log('Applying Enact compatibility patches...');
	require(path.join(ROOT_DIR, 'scripts', 'patch-enact-legacy.js'));

	console.log('Cleaning previous build...');
	run('npx enact clean', {cwd: APP_DIR});

	console.log('\n Running lint checks...');
	for (const dir of LINT_DIRS) {
		if (!runLintGate(dir, (msg) => console.log(`> ${msg}`))) {
			console.error('Lint check failed: warnings/errors detected.');
			process.exit(1);
		}
	}

	console.log('\n Checking CSS against the browser targets...');
	if (spawnSync('node', [path.join(ROOT_DIR, 'scripts', 'check-legacy-css.js')], {stdio: 'inherit'}).status !== 0) {
		console.error('CSS target check failed.');
		process.exit(1);
	}

	console.log('\n Building with Enact...');
	run('npx enact pack -p', {
		cwd: APP_DIR,
		env: {
			...process.env,
			BROWSERSLIST_CONFIG: path.join(__dirname, '.browserslistrc'),
			ENACT_ALIAS,
			REACT_APP_VERSION: appPkg.version,
			REACT_APP_PLATFORM: 'xbox'
		}
	});

	console.log('\n Copying build output into the host...');
	fs.rmSync(WWW_DIR, {recursive: true, force: true});
	copyDirRecursive(path.join(APP_DIR, 'dist'), WWW_DIR);
	fs.rmSync(path.join(APP_DIR, 'dist'), {recursive: true, force: true});
	addContentSecurityPolicy(WWW_DIR);

	console.log('\n Copying the subtitle workers and banner...');
	copyPageAssets(WWW_DIR);
	copyReaderAssets(WWW_DIR, (msg) => console.log(`  ${msg}`));

	console.log('\n Copying Sandstone fonts...');
	copyDirRecursive(path.join(ROOT_DIR, SANDSTONE_FONTS), path.join(WWW_DIR, SANDSTONE_FONTS));

	// Settings opens the probe once the user is signed in. Its test clips are large, so
	// they only go along when asked for.
	console.log('\n Adding the device probe...');
	const probe = writeProbe(path.join(WWW_DIR, 'probe'), {assets: '../', clips: bundlesClips()});
	console.log(`  ${probe.bundled.length} test clips${bundlesClips() ? '' : ' (pass --probe-clips to bundle them)'}`);

	console.log('\n Pruning ilib locale data...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-ilib-locales.js'))(WWW_DIR);

	console.log('\n Pruning bundled translation copies...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-bundled-strings.js'))(WWW_DIR);
};

// What kind of file a test clip is, which tells the probe what has to come out of it.
const AUDIO_ONLY = /\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i;
const MEDIA_FILE = /\.(mp4|m4v|mkv|webm|mov|ts|mp3|flac|m4a|aac|ogg|opus|wav)$/i;

// The probe page reports what the WebView can do. Server and media addresses are
// written into the package rather than the repo. Test clips in probe/media travel
// with it, so the playback run needs no server at all.
//
// The page goes into `dir`. `assets` is where, seen from there, the subtitle workers
// sit, and `clips` says whether the test clips go along.
const writeProbe = (dir, {assets = '', clips = true} = {}) => {
	fs.rmSync(dir, {recursive: true, force: true});
	fs.mkdirSync(dir, {recursive: true});
	for (const entry of fs.readdirSync(PROBE_DIR, {withFileTypes: true})) {
		if (entry.isFile() && entry.name !== 'make-clips.js') fs.copyFileSync(path.join(PROBE_DIR, entry.name), path.join(dir, entry.name));
	}

	const mediaSource = path.join(PROBE_DIR, 'media');
	const chosen = chosenClips();
	const missing = chosen.filter((name) => !fs.existsSync(path.join(mediaSource, name)));
	if (missing.length) throw new Error(`--clips names clips that are not in probe/media: ${missing.join(', ')}. Make them with node probe/make-clips.js`);
	const names = clips && fs.existsSync(mediaSource) ? fs.readdirSync(mediaSource).filter((name) => !chosen.length || chosen.includes(name)).sort() : [];
	const bundled = names.filter((name) => MEDIA_FILE.test(name));
	// An HLS stream is a folder of its playlist and segments
	const streams = names.filter((name) => fs.existsSync(path.join(mediaSource, name, 'index.m3u8')));
	if (bundled.length || streams.length) {
		fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
		for (const name of bundled) fs.copyFileSync(path.join(mediaSource, name), path.join(dir, 'media', name));
		for (const name of streams) copyDirRecursive(path.join(mediaSource, name), path.join(dir, 'media', name));
	}

	const config = {
		assets,
		jellyfin: option('--server') || '',
		emby: option('--emby') || '',
		image: option('--image') || '',
		report: option('--report') || '',
		media: [
			// A clip named t- belongs to a test a person has to judge, and the unattended run
			// leaves it out.
			...bundled.map((name) => ({label: name, url: `media/${name}`, video: !AUDIO_ONLY.test(name), interactive: /^t-/.test(name)})),
			...streams.map((name) => ({label: name, url: `media/${name}/index.m3u8`, video: true, interactive: /^t-/.test(name)})),
			...everyOption('--media').map((entry) => {
				const split = entry.indexOf('=');
				return split === -1 ? {label: entry, url: entry} : {label: entry.slice(0, split), url: entry.slice(split + 1)};
			})
		]
	};
	fs.writeFileSync(path.join(dir, 'probe-config.js'), `window.PROBE_CONFIG = ${JSON.stringify(config, null, '\t')};\n`);
	return {config, bundled: [...bundled, ...streams]};
};

// The probe as a package of its own, for a device the app doesnt start on.
const buildProbe = () => {
	console.log(' Packaging the probe page...\n');
	const {config, bundled} = writeProbe(WWW_DIR);
	copyPageAssets(WWW_DIR);
	console.log(`  Jellyfin: ${config.jellyfin || '(none)'}\n  Emby: ${config.emby || '(none)'}\n  Media files: ${config.media.length} (${bundled.length} bundled)`);
	if (!bundled.length) console.log('  No test clips, so the playback run has nothing to play. Make them with: node probe/make-clips.js');
};

// A console only takes a package over one it already has when the version went up,
// and removing the old one first throws away the sign in and every setting. So each
// Debug build, and any build sent to a console or made for testers, counts the last
// part of its version one higher. The count is kept beside the certificate, outside
// the repo.
const countsVersionUp = () => flag('--debug') || flag('--install') || flag('--tester');
const nextRevision = () => {
	const file = path.join(CERT_DIR, 'debug-revision.txt');
	const last = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) || 0 : 0;
	const next = last >= 65535 ? 1 : last + 1;
	fs.mkdirSync(CERT_DIR, {recursive: true});
	fs.writeFileSync(file, String(next));
	return next;
};

// The desktop app's x64 MSIX goes in the same Store product with the plain app version,
// and the Store refuses two packages of one name and version, so the Store build moves
// the third part up by 1000.
const storeVersion = (version) => version.replace(/\.(\d+)$/, (_, patch) => `.${Number(patch) + 1000}`);

// The package is built from a copy of the manifest written fresh each build and never
// committed, which carries the version the build is given, a probe build's other name
// and a Store build's identity. Writing it every time keeps MSBuild from reusing the
// manifest of the build before.
const writeBuildManifest = (version) => {
	let manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
	const packageVersion = flag('--store') ? storeVersion(version) : version;
	manifest = manifest.replace(/(<Identity[^>]*?Version=")[^"]*(")/, `$1${packageVersion}.${countsVersionUp() ? nextRevision() : 0}$2`);
	if (flag('--store')) {
		manifest = manifest
			.replace(/(<Identity[^>]*?Name=")[^"]*(")/, `$1${STORE_IDENTITY.name}$2`)
			.replace(/(<Identity[^>]*?Publisher=")[^"]*(")/, `$1${STORE_IDENTITY.publisher}$2`);
	}
	if (flag('--probe')) {
		manifest = manifest
			.replace(/(<Identity[^>]*?Name=")[^"]*(")/, '$1Moonfin.Xbox.Probe$2')
			.replace(/(PhoneProductId=")[^"]*(")/, '$1b0c9f6a2-6d0f-4c0e-9f5e-2f1d8a7c4e11$2')
			.replace(/<DisplayName>[^<]*<\/DisplayName>/, '<DisplayName>Moonfin Probe</DisplayName>')
			.replace(/(<uap:VisualElements[^>]*?DisplayName=")[^"]*(")/, '$1Moonfin Probe$2');
	}
	fs.writeFileSync(path.join(HOST_DIR, BUILD_MANIFEST), manifest);
	return BUILD_MANIFEST;
};

// Nothing is packed for a dev server build. The host finds the address in the one
// file www holds and loads the app from there.
const writeDevUrl = (devUrl) => {
	if (!/^https?:\/\/[^/]/i.test(devUrl || '')) throw new Error(`--dev-url needs an http or https address, got ${devUrl}`);
	const url = new URL(devUrl);
	fs.rmSync(WWW_DIR, {recursive: true, force: true});
	fs.mkdirSync(WWW_DIR, {recursive: true});
	fs.writeFileSync(path.join(WWW_DIR, 'dev-url.txt'), `${url.href}\n`);
	console.log(` The package will load the app from ${url.href}`);
};

// The manifest takes four parts and the Store keeps the last for itself.
const syncManifestVersion = (version) => {
	const manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
	const updated = manifest.replace(/(<Identity[^>]*?Version=")[^"]*(")/, `$1${version}.0$2`);
	if (updated !== manifest) fs.writeFileSync(MANIFEST_PATH, updated);
};

const manifestPublisher = () => {
	const match = /<Identity[^>]*?Publisher="([^"]*)"/.exec(fs.readFileSync(MANIFEST_PATH, 'utf8'));
	if (!match) throw new Error('No Publisher in Package.appxmanifest');
	return match[1];
};

const findMSBuild = () => {
	const vswhere = path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
	if (process.platform !== 'win32' || !fs.existsSync(vswhere)) return null;
	const found = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.Component.MSBuild', '-find', 'MSBuild\\**\\Bin\\MSBuild.exe'], {encoding: 'utf8'});
	return found.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || null;
};

// A code signing certificate of the manifest's publisher, made in memory and written
// straight to .cert, so no certificate store on the machine is touched.
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
`;

const signingCertificate = () => {
	if (process.env.MOONFIN_XBOX_PFX && !flag('--store')) {
		const pfx = path.resolve(process.env.MOONFIN_XBOX_PFX);
		if (!fs.existsSync(pfx)) throw new Error(`MOONFIN_XBOX_PFX names ${pfx}, which does not exist`);
		return {pfx, password: process.env.MOONFIN_XBOX_PFX_PASSWORD || ''};
	}

	const kind = flag('--store') ? 'store' : 'dev';
	const pfx = path.join(CERT_DIR, `moonfin-xbox-${kind}.pfx`);
	const cer = path.join(CERT_DIR, `moonfin-xbox-${kind}.cer`);
	const passwordFile = path.join(CERT_DIR, `${kind}-password.txt`);
	const subjectFile = path.join(CERT_DIR, `${kind}-subject.txt`);
	const subject = flag('--store') ? STORE_IDENTITY.publisher : manifestPublisher();
	const current = fs.existsSync(pfx) && fs.existsSync(passwordFile) && fs.existsSync(subjectFile) && fs.readFileSync(subjectFile, 'utf8') === subject;
	if (!current) {
		console.log(`\n Making a throwaway signing certificate for ${subject}...`);
		fs.mkdirSync(CERT_DIR, {recursive: true});
		const password = crypto.randomBytes(18).toString('base64url');
		const script = path.join(CERT_DIR, 'make-certificate.ps1');
		fs.writeFileSync(script, CERT_SCRIPT);
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Subject', subject, '-PfxPath', pfx, '-CerPath', cer, '-Password', password], {stdio: 'inherit'});
		fs.rmSync(script, {force: true});
		fs.writeFileSync(passwordFile, password);
		fs.writeFileSync(subjectFile, subject);
	}
	return {pfx, cer, password: fs.readFileSync(passwordFile, 'utf8')};
};

const findFiles = (dir, test) => {
	const found = [];
	if (!fs.existsSync(dir)) return found;
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...findFiles(full, test));
		else if (test(entry.name)) found.push(full);
	}
	return found;
};

const buildMsix = (version) => {
	const msbuild = findMSBuild();
	if (!msbuild) {
		throw new Error('MSBuild was not found. The package needs Windows with the Visual Studio Build Tools and their Universal Windows Platform workload. Run again with --no-msix to stop at the web app.');
	}

	const configuration = flag('--debug') ? 'Debug' : 'Release';
	const certificate = signingCertificate();

	console.log(`\n Building the Xbox package (${configuration})...`);
	fs.rmSync(PACKAGES_DIR, {recursive: true, force: true});
	const msbuildArgs = [
		path.join(HOST_DIR, 'Moonfin.Xbox.csproj'),
		'-restore',
		'-nologo',
		'-verbosity:minimal',
		`-p:Configuration=${configuration}`,
		'-p:Platform=x64',
		`-p:UapAppxPackageBuildMode=${flag('--store') ? 'StoreUpload' : 'SideloadOnly'}`,
		`-p:AppxPackageDir=${PACKAGES_DIR}${path.sep}`,
		'-p:AppxPackageSigningEnabled=true',
		`-p:PackageCertificateKeyFile=${certificate.pfx}`
	];
	msbuildArgs.push(`-p:MoonfinManifest=${writeBuildManifest(version)}`);
	console.log(`> MSBuild ${msbuildArgs.slice(1).join(' ')}`);
	// The password goes in through the environment, where MSBuild reads properties from
	// too, so it stays out of the command line and the log.
	execFileSync(msbuild, msbuildArgs, {stdio: 'inherit', env: {...process.env, PackageCertificatePassword: certificate.password}});

	const extension = flag('--store') ? 'msixupload' : 'msix';
	const packageName = flag('--store') ? /^Moonfin\.Xbox_.*\.msixupload$/ : /^Moonfin\.Xbox(\.Probe)?_.*\.(msix|appx)$/;
	const built = findFiles(PACKAGES_DIR, (name) => packageName.test(name))[0];
	if (!built) throw new Error(`No package found under ${PACKAGES_DIR}`);

	const prefix = `Moonfin_Xbox_${flag('--probe') ? 'Probe_' : ''}${flag('--store') ? 'Store_' : ''}${configuration === 'Debug' ? 'Debug_' : ''}`;
	for (const file of fs.readdirSync(ROOT_DIR).filter((entry) => entry.startsWith(prefix) && /^v?\d+\.\d+\.\d+\.msix(upload)?$/.test(entry.slice(prefix.length)))) {
		fs.unlinkSync(path.join(ROOT_DIR, file));
	}
	const finalName = `${prefix}v${version}.${extension}`;
	fs.copyFileSync(built, path.join(ROOT_DIR, finalName));
	console.log(`  ${finalName}`);

	// A console needs these installed along with the package the first time.
	const dependencies = path.join(path.dirname(built), 'Dependencies', 'x64');
	if (fs.existsSync(dependencies)) console.log(`  Dependencies for sideloading: ${dependencies}`);
	if (certificate.cer) console.log(`  Certificate it is signed with: ${certificate.cer}`);
	return {file: path.join(ROOT_DIR, finalName), dependencies};
};

const installOnConsole = (address, {file, dependencies}) => {
	console.log(`\n Installing on ${address}...`);
	const consoleArgs = [path.join(__dirname, 'console.js'), address, 'install', file, dependencies];
	if (flag('--probe')) consoleArgs.push('--probe');
	if (spawnSync(process.execPath, consoleArgs, {stdio: 'inherit'}).status !== 0) throw new Error('The package was built but never reached the console');
};

try {
	const appPkg = require(path.join(APP_DIR, 'package.json'));
	if (flag('--dev-url') && !flag('--debug')) throw new Error('--dev-url only works with --debug, since a Release host loads nothing but its own package');
	if (flag('--store') && ['--debug', '--tester', '--probe', '--dev-url', '--install', '--no-msix'].some(flag)) throw new Error('--store makes the Release upload on its own, without the other build options');
	const consoleAddress = option('--install');
	if (flag('--install') && (!consoleAddress || consoleAddress.startsWith('--') || flag('--no-msix'))) throw new Error('--install needs the address of a console, and has nothing to send it with --no-msix');

	console.log(' Building Moonfin for Xbox...\n');
	if (flag('--probe')) buildProbe();
	else if (flag('--dev-url')) writeDevUrl(option('--dev-url'));
	else if (!flag('--no-web')) buildApp(appPkg);
	else if (!fs.existsSync(path.join(WWW_DIR, 'main.js'))) throw new Error(`--no-web needs the web app in ${WWW_DIR}, and it is not there. A probe build leaves its own page in that folder.`);
	syncManifestVersion(appPkg.version);

	if (flag('--no-msix')) {
		console.log(`\n Web app ready in ${WWW_DIR}. Run again without --no-msix on Windows with the Visual Studio Build Tools to build the package.`);
	} else {
		const built = buildMsix(appPkg.version);
		if (consoleAddress) installOnConsole(consoleAddress, built);
	}

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
