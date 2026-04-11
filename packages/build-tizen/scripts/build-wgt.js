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
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Samsung certificate signing configuration
const SAMSUNG_CERT_PROFILE = process.env.TIZEN_SIGN_PROFILE || 'Moonfin';
const SAMSUNG_CERT_DIR = path.join(process.env.HOME, 'SamsungCertificate', 'Moonfin');
const TIZEN_PROFILES_XML = path.join(process.env.HOME, 'tizen-studio-data', 'profile', 'profiles.xml');

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

function runLintGate(cwd) {
	log('Running: npx enact lint .');
	const result = spawnSync('npx', ['enact', 'lint', '.'], {
		cwd,
		env: process.env,
		encoding: 'utf8'
	});
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	const output = `${result.stdout || ''}\n${result.stderr || ''}`;
	const hasWarnings = /\bwarning\b/i.test(output);
	return result.status === 0 && !hasWarnings;
}

function zipDirToFile(srcDir, outputFile) {
	// zip -qr <output> . (cwd=srcDir) -> creates a valid zip-based .wgt artifact
	const result = spawnSync('zip', ['-qr', outputFile, '.'], {
		cwd: srcDir,
		stdio: 'inherit'
	});
	return result.status === 0;
}

function findTizenCLI() {
	const possiblePaths = [
		// Windows
		'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
		process.env.LOCALAPPDATA + '\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
		process.env.USERPROFILE + '\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
		// Tizen VS Code Extension path
		process.env.USERPROFILE + '\\.tizen-extension-platform\\server\\sdktools\\data\\tools\\ide\\bin\\tizen.bat',
		// macOS/Linux
		'/usr/local/tizen-studio/tools/ide/bin/tizen',
		process.env.HOME + '/tizen-studio/tools/ide/bin/tizen',
	];
	
	for (const p of possiblePaths) {
		if (p && fs.existsSync(p)) return p;
	}
	
	// Try PATH
	try {
		execSync('tizen version', { stdio: 'pipe' });
		return 'tizen';
	} catch (e) {
		return null;
	}
}

function findSDB() {
	const possiblePaths = [
		// Windows
		'C:\\tizen-studio\\tools\\sdb.exe',
		process.env.LOCALAPPDATA + '\\tizen-studio\\tools\\sdb.exe',
		process.env.USERPROFILE + '\\tizen-studio\\tools\\sdb.exe',
		// Tizen VS Code Extension path
		process.env.USERPROFILE + '\\.tizen-extension-platform\\server\\sdktools\\data\\tools\\sdb.exe',
		// macOS/Linux
		'/usr/local/tizen-studio/tools/sdb',
		process.env.HOME + '/tizen-studio/tools/sdb',
	];
	
	for (const p of possiblePaths) {
		if (p && fs.existsSync(p)) return p;
	}
	
	// Try PATH
	try {
		execSync('sdb version', { stdio: 'pipe' });
		return 'sdb';
	} catch (e) {
		return null;
	}
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
	
	// Step 1: Find Tizen CLI
	const tizenCLI = findTizenCLI();
	if (!tizenCLI) {
		if (skipTizenCLI) {
			warn('Tizen CLI not found — using CI fallback packaging mode (--skip-tizen-cli).');
		} else {
			error('Tizen CLI not found!');
			console.log('\nPlease install Tizen Studio from:');
			console.log('https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html');
			console.log('\nOr run with --skip-tizen-cli for CI fallback packaging.');
			process.exit(1);
		}
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
		if (!runLintGate(APP_DIR)) {
			error('Lint check failed!');
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
	
	// Step 2.5: Patch index.html for Tizen compatibility
	log('Patching index.html for Tizen compatibility...');
	const indexPath = path.join(DIST, 'index.html');
	if (fs.existsSync(indexPath)) {
		let html = fs.readFileSync(indexPath, 'utf8');
		
		const preBootPatches = `<script>
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
		success('Patched index.html (globalThis polyfill + XHR mock)');
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

	if (!tizenCLI) {
		log('Packaging fallback .wgt via zip (no Tizen CLI)...');
		if (!zipDirToFile(DIST, finalWgt)) {
			error('Fallback zip packaging failed! Ensure "zip" is available on PATH.');
			process.exit(1);
		}
	} else {
		log('Verifying Samsung certificate...');
		const authorP12 = path.join(SAMSUNG_CERT_DIR, 'author.p12');
		const distributorP12 = path.join(SAMSUNG_CERT_DIR, 'distributor.p12');

		if (!fs.existsSync(authorP12) || !fs.existsSync(distributorP12)) {
			warn('Samsung certificate files not found at: ' + SAMSUNG_CERT_DIR);
			warn('Expected: author.p12 and distributor.p12');
			warn('Please create a Samsung certificate via Tizen Studio Certificate Manager.');
			if (isSigned) {
				error('Cannot create signed build without Samsung certificates!');
				process.exit(1);
			}
			warn('Falling back to unsigned build...');
		} else {
			success(`Found Samsung certificates in ${SAMSUNG_CERT_DIR}`);
		}

		if (!fs.existsSync(TIZEN_PROFILES_XML)) {
			warn('Tizen profiles.xml not found at: ' + TIZEN_PROFILES_XML);
			if (isSigned) {
				error('Cannot create signed build without profiles.xml!');
				process.exit(1);
			}
		} else {
			const profileContent = fs.readFileSync(TIZEN_PROFILES_XML, 'utf8');
			if (profileContent.includes(`name="${SAMSUNG_CERT_PROFILE}"`)) {
				success(`Signing profile "${SAMSUNG_CERT_PROFILE}" found in profiles.xml`);
			} else {
				warn(`Profile "${SAMSUNG_CERT_PROFILE}" not found in profiles.xml`);
				warn('Available profiles can be managed via Tizen Studio Certificate Manager');
			}
		}

		log(`Packaging ${isSigned ? 'signed' : 'unsigned'} .wgt with profile "${SAMSUNG_CERT_PROFILE}"...`);

		let packageCmd;
		const hasCerts = fs.existsSync(authorP12) && fs.existsSync(distributorP12) && fs.existsSync(TIZEN_PROFILES_XML);
		if (hasCerts) {
			// Always sign with the Samsung certificate profile when certs are available
			packageCmd = `"${tizenCLI}" package -t wgt --sign "${SAMSUNG_CERT_PROFILE}" -- "${DIST}" -o "${REPO_ROOT}"`;
		} else {
			// Fallback: package without explicit profile
			packageCmd = `"${tizenCLI}" package -t wgt -- "${DIST}" -o "${REPO_ROOT}"`;
		}

		if (!run(packageCmd)) {
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
