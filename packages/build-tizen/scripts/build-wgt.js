#!/usr/bin/env node
/**
 * Moonfin Tizen Build Script
 * 
 * Usage:
 *   npm run build          - Build unsigned .wgt (for development)
 *   npm run build:signed   - Build signed .wgt (for store/production)
 *   npm run install-tv     - Build and install to connected TV
 *
 * Flags:
 *   --legacy               - Target Tizen 2.4 (strips Smart Hub Preview service
 *                            and Tizen 4+ metadata from config.xml)
 *   --oblong               - Use oblong (512x423) launcher icon instead of square
 *
 * Environment overrides (all optional, for installs in unusual places):
 *   TIZEN_CLI              - Full path to tizen / tizen.bat
 *   TIZEN_STUDIO_HOME      - Tizen tooling install root
 *   TIZEN_SIGN_PROFILE     - Signing profile name (default: Moonfin)
 *   TIZEN_CERT_DIR         - Folder holding author.p12 and distributor.p12
 *   TIZEN_PROFILES_XML     - Full path to profiles.xml
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {LINT_DIRS, runLintGate} = require('../../../scripts/lint-gate');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const APP_DIR = path.resolve(ROOT, '..', 'app');
const DIST = path.join(ROOT, 'dist');
const TIZEN_DIR = path.join(ROOT, 'tizen');

const args = process.argv.slice(2);
const isSigned = args.includes('--signed');
const shouldInstall = args.includes('--install');
const isDev = args.includes('--dev');
const isLegacy = args.includes('--legacy');
const isOblong = args.includes('--oblong');
const skipTizenCLI = args.includes('--skip-tizen-cli') || process.env.CI_SKIP_TIZEN_CLI === '1' || process.env.CI === 'true';
const skipLint = args.includes('--skip-lint');

// ── Optional version bump: npm run build:tizen -- 2.3.0 ──
const versionArg = args.find(a => /^\d+\.\d+\.\d+$/.test(a));
if (versionArg) {
	console.log(`\n Bumping Tizen version to ${versionArg}...\n`);
	execSync(`node ${path.join(REPO_ROOT, 'scripts', 'bump-version.js')} tizen ${versionArg}`, {stdio: 'inherit'});
	console.log();
}

const isWindows = process.platform === 'win32';
// HOME is not set on native Windows shells, so fall back to USERPROFILE.
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';

// Samsung certificate signing configuration
const SAMSUNG_CERT_PROFILE = process.env.TIZEN_SIGN_PROFILE || 'Moonfin';
const SAMSUNG_CERT_DIR = process.env.TIZEN_CERT_DIR ||
	(HOME_DIR ? path.join(HOME_DIR, 'SamsungCertificate', SAMSUNG_CERT_PROFILE) : '');

// The data folder sits in the drive root on Windows and in the user home
// everywhere else.
function findProfilesXml() {
	const candidates = [
		process.env.TIZEN_PROFILES_XML,
		HOME_DIR && path.join(HOME_DIR, 'tizen-studio-data', 'profile', 'profiles.xml'),
		'C:\\tizen-studio-data\\profile\\profiles.xml',
		process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'tizen-studio-data', 'profile', 'profiles.xml')
	];
	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) return candidate;
	}
	return null;
}

const TIZEN_PROFILES_XML = findProfilesXml();

// ANSI colors
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

function log(msg) { console.log(cyan('[build]'), msg); }
function success(msg) { console.log(green('[✓]'), msg); }
function warn(msg) { console.log(yellow('[!]'), msg); }
function error(msg) { console.log(red('[✗]'), msg); }

function run(cmd, options = {}) {
	log(`Running: ${cmd}`);
	try {
		execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...options });
		return true;
	} catch (e) {
		return false;
	}
}

let crcTable = null;
function crc32(buf) {
	if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
	if (!crcTable) {
		crcTable = new Int32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
			crcTable[i] = c;
		}
	}
	let crc = -1;
	for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
	return (crc ^ -1) >>> 0;
}

function listFilesRecursive(dir, base = dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFilesRecursive(abs, base));
		else if (entry.isFile()) out.push({abs, rel: path.relative(base, abs).split(path.sep).join('/')});
	}
	return out;
}

const ZIP_LOCAL_SIG = 0x04034b50;
const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_END_SIG = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_MADE_BY_UNIX = 0x0314;
const ZIP_UTF8_NAMES = 0x0800;
const ZIP_DEFLATE = 8;
const ZIP_STORE = 0;
const ZIP_FILE_MODE = (0o100644 << 16) >>> 0;
// 1980-01-01, the earliest date a zip can express. Pinning it keeps two builds
// of the same files byte for byte identical.
const ZIP_EPOCH_TIME = 0;
const ZIP_EPOCH_DATE = 0x0021;

/**
 * Writes a .wgt, which is a plain zip, without needing a zip binary on PATH.
 */
function zipDirToFile(srcDir, outputFile) {
	try {
		const files = listFilesRecursive(srcDir).sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
		const localParts = [];
		const centralParts = [];
		let offset = 0;
		let centralSize = 0;

		for (const file of files) {
			const data = fs.readFileSync(file.abs);
			const deflated = zlib.deflateRawSync(data, {level: 9});
			const useDeflate = deflated.length < data.length;
			const payload = useDeflate ? deflated : data;
			const method = useDeflate ? ZIP_DEFLATE : ZIP_STORE;
			const name = Buffer.from(file.rel, 'utf8');
			const crc = crc32(data);

			const local = Buffer.alloc(30);
			local.writeUInt32LE(ZIP_LOCAL_SIG, 0);
			local.writeUInt16LE(ZIP_VERSION, 4);
			local.writeUInt16LE(ZIP_UTF8_NAMES, 6);
			local.writeUInt16LE(method, 8);
			local.writeUInt16LE(ZIP_EPOCH_TIME, 10);
			local.writeUInt16LE(ZIP_EPOCH_DATE, 12);
			local.writeUInt32LE(crc, 14);
			local.writeUInt32LE(payload.length, 18);
			local.writeUInt32LE(data.length, 22);
			local.writeUInt16LE(name.length, 26);
			localParts.push(local, name, payload);

			const central = Buffer.alloc(46);
			central.writeUInt32LE(ZIP_CENTRAL_SIG, 0);
			central.writeUInt16LE(ZIP_MADE_BY_UNIX, 4);
			central.writeUInt16LE(ZIP_VERSION, 6);
			central.writeUInt16LE(ZIP_UTF8_NAMES, 8);
			central.writeUInt16LE(method, 10);
			central.writeUInt16LE(ZIP_EPOCH_TIME, 12);
			central.writeUInt16LE(ZIP_EPOCH_DATE, 14);
			central.writeUInt32LE(crc, 16);
			central.writeUInt32LE(payload.length, 20);
			central.writeUInt32LE(data.length, 24);
			central.writeUInt16LE(name.length, 28);
			central.writeUInt32LE(ZIP_FILE_MODE, 38);
			central.writeUInt32LE(offset, 42);
			centralParts.push(central, name);

			offset += local.length + name.length + payload.length;
			centralSize += central.length + name.length;
		}

		const end = Buffer.alloc(22);
		end.writeUInt32LE(ZIP_END_SIG, 0);
		end.writeUInt16LE(files.length, 8);
		end.writeUInt16LE(files.length, 10);
		end.writeUInt32LE(centralSize, 12);
		end.writeUInt32LE(offset, 16);

		fs.writeFileSync(outputFile, Buffer.concat([...localParts, ...centralParts, end]));
		return true;
	} catch (e) {
		error('Packaging failed: ' + e.message);
		return false;
	}
}

// Covers both Tizen Studio, which Samsung has retired, and the VS Code
// extension that replaced it. Some installers nest everything one level deeper
// under sdk/, so both layouts get probed.
function tizenSdkRoots() {
	return [
		process.env.TIZEN_STUDIO_HOME,
		'C:\\tizen-studio',
		process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'tizen-studio'),
		process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'tizen-studio'),
		HOME_DIR && path.join(HOME_DIR, '.tizen-extension-platform', 'server', 'sdktools', 'data'),
		'/usr/local/tizen-studio',
		HOME_DIR && path.join(HOME_DIR, 'tizen-studio')
	].filter(Boolean);
}

// Always resolve to a full path, never the bare name. Tizen's launcher works out
// its own install root from the path it was started with, so calling it by name
// makes it search from the working directory, miss sdk.info and fail to start.
function resolveOnPath(cmd) {
	try {
		const out = execSync(`${isWindows ? 'where' : 'which'} ${cmd}`, {stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8'});
		const hits = out.split(/\r?\n/).map(s => s.trim()).filter(s => s && fs.existsSync(s));
		if (!hits.length) return null;
		return isWindows ? (hits.find(h => /\.(bat|cmd|exe)$/i.test(h)) || hits[0]) : hits[0];
	} catch (e) {
		return null;
	}
}

// An install can be present but unable to start. It still exits 0 in that case,
// so go by what it printed rather than the exit code alone.
function tizenCLIWorks(cliPath) {
	const result = spawnSync(`"${cliPath}" version`, {
		encoding: 'utf8',
		shell: true,
		cwd: path.dirname(cliPath)
	});
	if (result.error) return false;
	const output = `${result.stdout || ''}${result.stderr || ''}`;
	if (/ClassNotFoundException|NoClassDefFoundError|sdk\.info/i.test(output)) return false;
	return result.status === 0;
}

function findTizenCLI() {
	const exe = isWindows ? 'tizen.bat' : 'tizen';
	const candidates = [process.env.TIZEN_CLI];
	for (const root of tizenSdkRoots()) {
		candidates.push(path.join(root, 'tools', 'ide', 'bin', exe));
		candidates.push(path.join(root, 'sdk', 'tools', 'ide', 'bin', exe));
	}
	candidates.push(resolveOnPath('tizen'));

	const seen = new Set();
	const broken = [];
	for (const candidate of candidates) {
		if (!candidate || seen.has(candidate) || !fs.existsSync(candidate)) continue;
		seen.add(candidate);
		if (tizenCLIWorks(candidate)) return candidate;
		broken.push(candidate);
	}

	for (const cliPath of broken) warn(`Tizen CLI at ${cliPath} is installed but can't start, so it will be skipped`);
	return null;
}

function findSDB() {
	const exe = isWindows ? 'sdb.exe' : 'sdb';
	const candidates = [];
	for (const root of tizenSdkRoots()) {
		candidates.push(path.join(root, 'tools', exe));
		candidates.push(path.join(root, 'sdk', 'tools', exe));
	}
	candidates.push(resolveOnPath('sdb'));

	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function copyDir(src, dest) {
	if (!fs.existsSync(src)) return;
	
	const files = fs.readdirSync(src);
	for (const file of files) {
		const srcPath = path.join(src, file);
		const destPath = path.join(dest, file);
		
		if (fs.statSync(srcPath).isDirectory()) {
			if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function copyFiles(src, dest, pattern = null) {
	if (!fs.existsSync(src)) return;
	if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
	
	const files = fs.readdirSync(src);
	for (const file of files) {
		if (pattern && !file.match(pattern)) continue;
		const srcPath = path.join(src, file);
		const destPath = path.join(dest, file);
		if (!fs.statSync(srcPath).isDirectory()) {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function findDir(base, target) {
	if (!fs.existsSync(base)) return null;
	const stack = [base];
	while (stack.length) {
		const dir = stack.pop();
		for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);
			if (entry.name === target) return full;
			stack.push(full);
		}
	}
	return null;
}

async function main() {
	console.log('\n' + cyan('═'.repeat(50)));
	console.log(cyan('  Moonfin Tizen Build'));
	if (isLegacy) console.log(cyan('  Target: Tizen 2.4 (no Smart Hub Preview)'));
	if (isOblong) console.log(cyan('  Icon: oblong (512x423)'));
	console.log(cyan('═'.repeat(50)) + '\n');
	
	// Step 1: Find Tizen CLI. It is optional, and only needed to sign a build or
	// to install straight to a TV.
	const tizenCLI = skipTizenCLI ? null : findTizenCLI();
	if (!tizenCLI) {
		if (isSigned) {
			error('--signed requires the Tizen CLI, which was not found.');
			console.log('\nSamsung has retired Tizen Studio. The CLI now ships with the Tizen');
			console.log('VS Code extension: https://samsungtizenos.com/');
			console.log('\nIf yours is installed somewhere unusual, set TIZEN_CLI to it.');
			process.exit(1);
		}
		warn(skipTizenCLI
			? 'Skipping Tizen CLI by request, packaging unsigned .wgt directly.'
			: 'Tizen CLI not found, packaging unsigned .wgt directly.');
	} else {
		success(`Found Tizen CLI: ${tizenCLI}`);
	}
	
	// Step 2: Apply Enact compatibility patches
	log('Applying Enact compatibility patches...');
	try {
		require(path.join(REPO_ROOT, 'scripts', 'patch-enact-legacy.js'));
		success('Patches applied');
	} catch (e) {
		error('Failed to apply patches: ' + e.message);
		process.exit(1);
	}

	// Step 3: Build Enact app
	if (!skipLint) {
		log('Running lint checks...');
		for (const dir of LINT_DIRS) {
			if (!runLintGate(dir, (msg) => log(`Running: ${msg}`))) {
				error('Lint check failed!');
				process.exit(1);
			}
		}
		// enact lint is ESLint only and never sees .less.
		log('Checking CSS against the browser targets...');
		const cssGate = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'check-legacy-css.js')], {stdio: 'inherit'});
		if (cssGate.status !== 0) {
			error('CSS target check failed!');
			process.exit(1);
		}
		// The per-surface accent rules are generated from the stylesheets, so a stylesheet edit
		// without a regenerate would leave a surface's picked color missing some of its parts.
		log('Checking the generated accent rules are current...');
		const accentGate = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'gen-accent-rules.js'), '--check'], {stdio: 'inherit'});
		if (accentGate.status !== 0) {
			error('Accent rules are stale!');
			process.exit(1);
		}
		success('Lint checks passed');
	}

	log(`Building Enact app (${isDev ? 'development' : 'production'})...`);
	const packCmd = isDev ? 'npx enact pack' : 'npx enact pack -p';
	const browserslistConfig = path.join(ROOT, '.browserslistrc');
	const enactAlias = JSON.stringify({
		'@moonfin/platform-webos': path.resolve(ROOT, '..', 'platform-webos', 'src'),
		'@moonfin/platform-tizen': path.resolve(ROOT, '..', 'platform-tizen', 'src'),
		'@moonfin/app': path.resolve(ROOT, '..', 'app')
	});
	const appPkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
	const buildEnv = {
		...process.env,
		// Keep the CI job itself, but let Enact complete even with repo-level warnings.
		CI: 'false',
		BROWSERSLIST_CONFIG: browserslistConfig,
		ENACT_ALIAS: enactAlias,
		REACT_APP_VERSION: appPkg.version
	};
	if (!run(packCmd, { cwd: APP_DIR, env: buildEnv })) {
		error('Enact build failed!');
		process.exit(1);
	}
	success('Enact build complete');

	log('Copying build output...');
	if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });
	copyDir(path.join(APP_DIR, 'dist'), DIST);

	// Clean intermediate app dist
	fs.rmSync(path.join(APP_DIR, 'dist'), { recursive: true, force: true });
	success('Copied build output');

	// Copy banner image
	const bannerSrc = path.join(APP_DIR, 'resources', 'banner-dark.png');
	const bannerDest = path.join(DIST, 'resources', 'banner-dark.png');
	if (fs.existsSync(bannerSrc)) {
		fs.mkdirSync(path.dirname(bannerDest), { recursive: true });
		fs.copyFileSync(bannerSrc, bannerDest);
		success('Copied banner image');
	} else {
		warn('banner-dark.png not found at ' + bannerSrc);
	}

	// Copy libpgs worker for PGS subtitle rendering
	const libpgsWorkerSrc = path.join(REPO_ROOT, 'node_modules', 'libpgs', 'dist', 'libpgs.worker.js');
	const libpgsWorkerDest = path.join(DIST, 'libpgs.worker.js');
	if (fs.existsSync(libpgsWorkerSrc)) {
		fs.copyFileSync(libpgsWorkerSrc, libpgsWorkerDest);
		success('Copied libpgs.worker.js');
	} else {
		warn('libpgs.worker.js not found (PGS rendering may degrade)');
	}

	// Copy SubtitlesOctopus assets for ASS/SSA subtitle rendering
	const octopusDir = path.join(REPO_ROOT, 'node_modules', 'libass-wasm', 'dist', 'js');
	const octopusFiles = ['subtitles-octopus-worker.js', 'subtitles-octopus-worker-legacy.js', 'subtitles-octopus-worker.wasm'];
	for (const file of octopusFiles) {
		const src = path.join(octopusDir, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(DIST, file));
			success(`Copied ${file}`);
		} else {
			warn(`${file} not found (ASS rendering may degrade)`);
		}
	}

	// The renderer asks for this by name whenever a style names a font the file does not
	// carry, and it throws the whole track away when it cant be fetched.
	const fallbackFontSrc = path.join(REPO_ROOT, 'node_modules', '@enact', 'sandstone', 'fonts', 'MuseoSans', 'MuseoSans-Light.ttf');
	if (fs.existsSync(fallbackFontSrc)) {
		fs.copyFileSync(fallbackFontSrc, path.join(DIST, 'ass-fallback-font.ttf'));
		success('Copied ass-fallback-font.ttf (MuseoSans-Light)');
	} else {
		warn('MuseoSans-Light.ttf not found, subtitle fallback font missing');
	}

	// Step 2.5: Patch index.html for Tizen compatibility
	log('Patching index.html for Tizen compatibility...');
	const indexPath = path.join(DIST, 'index.html');
	if (fs.existsSync(indexPath)) {
		let html = fs.readFileSync(indexPath, 'utf8');
		
		// Samsung asks every app to load this. Newer firmware hands out webapis without it,
		// but older sets can leave productinfo and avinfo out until the page loads it.
		const preBootPatches = `<script src="$WEBAPIS/webapis/webapis.js"></script>
<script>
// globalThis polyfill
(function() {
	if (typeof globalThis === 'undefined') {
		if (typeof self !== 'undefined') self.globalThis = self;
		else if (typeof window !== 'undefined') window.globalThis = window;
	}
})();
</script>
<script>
// Intercept non-http(s) XHR on file:// protocol to prevent NetworkError
(function() {
	if (location.protocol !== 'file:') return;
	var OrigOpen = XMLHttpRequest.prototype.open;
	var OrigSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function(method, url) {
		if (!url || (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0)) {
			this.__xhrMocked = arguments.length < 3 || !!arguments[2];
			return;
		}
		return OrigOpen.apply(this, arguments);
	};
	XMLHttpRequest.prototype.send = function() {
		if (this.__xhrMocked !== undefined) {
			var isAsync = this.__xhrMocked;
			delete this.__xhrMocked;
			var self = this;
			var fire = function() {
				try { Object.defineProperty(self, 'readyState', {value: 4, configurable: true}); } catch(e) {}
				try { Object.defineProperty(self, 'status',     {value: 404, configurable: true}); } catch(e) {}
				try { Object.defineProperty(self, 'statusText', {value: 'Not Found', configurable: true}); } catch(e) {}
				try { Object.defineProperty(self, 'responseText', {value: '{}', configurable: true}); } catch(e) {}
				try { Object.defineProperty(self, 'response',   {value: '{}', configurable: true}); } catch(e) {}
				try { if (self.onreadystatechange) self.onreadystatechange(); } catch(e) {}
				try { if (self.onload) self.onload(); } catch(e) {}
			};
			if (isAsync) { setTimeout(fire, 0); } else { fire(); }
			return;
		}
		return OrigSend.apply(this, arguments);
	};
})();
</script>
`;
		html = html.replace(/<script defer="defer" src="main\.js"><\/script>/, preBootPatches + '<script defer="defer" src="main.js"></script>');
		fs.writeFileSync(indexPath, html);
		success('Patched index.html (webapis + globalThis polyfill + XHR mock)');
	}

	if (isLegacy) {
		log('Patching CSS for legacy WebKit...');
		const cssFiles = fs.readdirSync(DIST).filter(f => f.endsWith('.css'));
		for (const cssFile of cssFiles) {
			const cssPath = path.join(DIST, cssFile);
			let css = fs.readFileSync(cssPath, 'utf8');
			const origLen = css.length;
			// 'initial' keyword not supported before Safari 9.1
			css = css.replace(/background-color:initial/g, 'background-color:rgba(0,0,0,0)');
			// Resolve all var(--*, fallback) to just the fallback value
			css = css.replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
			if (css.length !== origLen) {
				fs.writeFileSync(cssPath, css);
				log(`  Patched ${cssFile}`);
			}
		}

		const splashPath = path.join(DIST, 'splash.png');
		if (fs.existsSync(splashPath)) {
			fs.unlinkSync(splashPath);
			success('Removed splash.png');
		}
	}
	
	// Step 3: Copy Tizen config files
	log('Copying Tizen configuration...');
	copyFiles(TIZEN_DIR, DIST);
	success('Copied config.xml and icons');

	if (isOblong) {
		const oblongSrc = path.join(TIZEN_DIR, 'icon-oblong.png');
		const iconDest = path.join(DIST, 'icon.png');
		if (fs.existsSync(oblongSrc)) {
			fs.copyFileSync(oblongSrc, iconDest);
			success('Replaced icon.png with oblong variant (512x423)');
		} else {
			warn('icon-oblong.png not found, keeping square icon');
		}
	}
	
	// Step 3.5: Copy Smart Hub Preview background service (Tizen 4+ only)
	if (isLegacy) {
		log('Skipping Smart Hub Preview service (not supported on legacy targets)');
	} else {
		const serviceDir = path.join(TIZEN_DIR, 'service');
		const distServiceDir = path.join(DIST, 'service');
		if (fs.existsSync(serviceDir)) {
			log('Copying Smart Hub Preview service...');
			if (!fs.existsSync(distServiceDir)) fs.mkdirSync(distServiceDir, { recursive: true });
			copyDir(serviceDir, distServiceDir);
			success('Copied Smart Hub Preview service');
		}
	}

	// Step 3.6: Strip Tizen 4+ elements from config.xml for legacy targets
	if (isLegacy) {
		log('Stripping Tizen 4+ elements from config.xml...');
		const configPath = path.join(DIST, 'config.xml');
		if (fs.existsSync(configPath)) {
			let configXml = fs.readFileSync(configPath, 'utf8');
			// Remove <tizen:service> block (Smart Hub Preview — Tizen 4+)
			configXml = configXml.replace(/\s*<!-- Remove the tizen:service block[^>]*-->\s*/g, '\n');
			configXml = configXml.replace(/\s*<tizen:service[\s\S]*?<\/tizen:service>/g, '');
			// Remove Smart Hub Preview metadata (Tizen 4+)
			configXml = configXml.replace(/\s*<!-- Remove the next two[^>]*-->\s*/g, '\n');
			configXml = configXml.replace(/\s*<tizen:metadata[^>]*use\.preview[^>]*\/>/g, '');
			// Remove background-support from tizen:setting (not supported on 2.4)
			configXml = configXml.replace(/ background-support="enable"/g, '');
			fs.writeFileSync(configPath, configXml, 'utf8');
			success('Stripped Tizen 4+ elements from config.xml');
		}
	}
	
	// Step 4: Clean up unnecessary files to reduce package size
	log('Cleaning up unnecessary files...');
	
	// Remove source maps if any
	const distFiles = fs.readdirSync(DIST);
	distFiles.forEach(file => {
		if (file.endsWith('.map')) {
			fs.unlinkSync(path.join(DIST, file));
		}
	});
	
	// Prune ilib locale data — keeps only plurals.json and localeinfo.json
	// for configured locales, removing ~5.5 MB of unused formatting data.
	log('Pruning ilib locale data...');
	require(path.join(REPO_ROOT, 'scripts', 'prune-ilib-locales.js'))(DIST);

	// Drop the per-locale strings.json copies the bundle already carries.
	require(path.join(REPO_ROOT, 'scripts', 'prune-bundled-strings.js'))(DIST);
	success('Pruned ilib locale data');
	
	// Step 6 & 7: Determine output filename and clean previous output
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	const version = pkg.version || '0.0.0';
	const typeName = isLegacy ? 'Legacy' : isOblong ? 'Oblong' : 'Regular';
	const wgtName = `Moonfin_Tizen_${typeName}_${version}.wgt`;
	const finalWgt = path.join(REPO_ROOT, wgtName);

	log('Cleaning up old output...');
	if (fs.existsSync(finalWgt)) {
		fs.unlinkSync(finalWgt);
		log(`Removed ${wgtName}`);
	}

	// Step 7: Package WGT

	// Signing needs the CLI, the .p12 pair and a matching profile entry. If any of
	// them is missing the build goes out unsigned, and the Tizen CLI can't produce
	// an unsigned package because it always wants an active profile.
	let canSign = false;
	if (tizenCLI) {
		log('Verifying Samsung certificate...');
		const authorP12 = path.join(SAMSUNG_CERT_DIR, 'author.p12');
		const distributorP12 = path.join(SAMSUNG_CERT_DIR, 'distributor.p12');
		const hasCerts = !!SAMSUNG_CERT_DIR && fs.existsSync(authorP12) && fs.existsSync(distributorP12);

		if (!hasCerts) {
			warn('Samsung certificate files not found' + (SAMSUNG_CERT_DIR ? ' at: ' + SAMSUNG_CERT_DIR : ''));
			warn('Expected: author.p12 and distributor.p12');
			warn('Create them with the certificate manager in your Tizen tooling,');
			warn('or set TIZEN_CERT_DIR to the folder that already holds them.');
		} else {
			success(`Found Samsung certificates in ${SAMSUNG_CERT_DIR}`);
		}

		let hasProfile = false;
		if (!TIZEN_PROFILES_XML) {
			warn('Tizen profiles.xml not found, set TIZEN_PROFILES_XML to point at it');
		} else {
			const profileContent = fs.readFileSync(TIZEN_PROFILES_XML, 'utf8');
			hasProfile = profileContent.includes(`name="${SAMSUNG_CERT_PROFILE}"`);
			if (hasProfile) {
				success(`Signing profile "${SAMSUNG_CERT_PROFILE}" found in profiles.xml`);
			} else {
				warn(`Profile "${SAMSUNG_CERT_PROFILE}" not found in ${TIZEN_PROFILES_XML}`);
				warn('Set TIZEN_SIGN_PROFILE to one of your own profiles, or create it');
				warn('with the certificate manager in your Tizen tooling.');
			}
		}

		canSign = hasCerts && hasProfile;
		if (isSigned && !canSign) {
			error("Can't create a signed build without both certificates and a matching profile!");
			process.exit(1);
		}
		if (!canSign) warn('Falling back to unsigned build...');
	}

	if (!canSign) {
		log('Packaging unsigned .wgt...');
		if (!zipDirToFile(DIST, finalWgt)) process.exit(1);
	} else {
		log(`Packaging signed .wgt with profile "${SAMSUNG_CERT_PROFILE}"...`);

		if (!run(`"${tizenCLI}" package -t wgt --sign "${SAMSUNG_CERT_PROFILE}" -- "${DIST}" -o "${REPO_ROOT}"`)) {
			error('Packaging failed!');
			process.exit(1);
		}

		// Find the generated wgt in repo root (exclude already-named Moonfin_Tizen_* files)
		const wgtFiles = fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.wgt') && !/^Moonfin_Tizen_/.test(f));
		if (wgtFiles.length === 0) {
			error('No .wgt file generated!');
			process.exit(1);
		}

		const generatedWgt = path.join(REPO_ROOT, wgtFiles[0]);

		// Rename to consistent name if needed
		if (generatedWgt !== finalWgt) {
			if (fs.existsSync(finalWgt)) fs.unlinkSync(finalWgt);
			fs.renameSync(generatedWgt, finalWgt);
		}
	}

	// Show final size
	const stats = fs.statSync(finalWgt);
	const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
	success(`Package created: ${finalWgt} (${sizeMB} MB)`);
	
	// Step 8: Install to TV (if requested)
	if (shouldInstall) {
		if (!tizenCLI) {
			error('Install requested but Tizen CLI is not available.');
			process.exit(1);
		}
		const sdb = findSDB();
		if (!sdb) {
			error('SDB not found! Cannot install to TV.');
			process.exit(1);
		}
		
		log('Installing to TV...');
		if (!run(`"${tizenCLI}" install -n "${finalWgt}"`)) {
			error('Installation failed! Make sure your TV is connected.');
			console.log('\nTo connect your TV:');
			console.log('1. Enable Developer Mode on your TV');
			console.log('2. Run: sdb connect <TV_IP_ADDRESS>');
			process.exit(1);
		}
		success('Installed to TV!');
		
		log('Launching app...');
		run(`"${tizenCLI}" run -p MoonfinApp.moonfin`);
	}
	
	console.log('\n' + green('═'.repeat(50)));
	console.log(green(`  Build Complete! (v${version})`));
	console.log(green('═'.repeat(50)));
	console.log(`\n  Output: ${cyan(finalWgt)}`);
	
	if (!shouldInstall) {
		console.log('\n  To install to your TV:');
		console.log(`  ${yellow('npm run install-tv')}`);
		console.log('\n  Or manually:');
		console.log(`  ${yellow(`tizen install -n "${wgtName}"`)}`);
	}
	
	console.log('');
}

main().catch(e => {
	error(e.message);
	process.exit(1);
});
