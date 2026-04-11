/* eslint-disable no-console */
const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const run = (cmd, options = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...options});
};

const runLintGate = (cwd) => {
	const cmd = 'npx enact lint .';
	console.log(`> ${cmd}`);
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
};

// Recursively remove a directory (cross-platform alternative to rm -rf)
const removeDirs = (base, filterFn) => {
	if (!fs.existsSync(base)) return;
	for (const entry of fs.readdirSync(base, {withFileTypes: true})) {
		if (entry.isDirectory() && filterFn(entry.name)) {
			fs.rmSync(path.join(base, entry.name), {recursive: true, force: true});
		}
	}
};

const deleteFiles = (basePath, filenames) => {
	filenames.forEach(filename => {
		const filePath = path.join(basePath, filename);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	});
};

const findDir = (base, target) => {
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
};

const copyDirRecursive = (src, dest) => {
	fs.mkdirSync(dest, {recursive: true});
	for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
};

// ── Optional version bump: npm run build:webos -- 2.3.0 ──
const versionArg = process.argv.find(a => /^\d+\.\d+\.\d+$/.test(a));
if (versionArg) {
	console.log(`\n Bumping webOS version to ${versionArg}...\n`);
	execSync(`node ${path.join(ROOT_DIR, 'scripts', 'bump-version.js')} webos ${versionArg}`, {stdio: 'inherit'});
	console.log();
}

const appPkg = require(path.join(APP_DIR, 'package.json'));

// Resolve @moonfin/* aliases to absolute paths so webpack resolves them
// outside node_modules and babel-loader transpiles them correctly.
const ENACT_ALIAS = JSON.stringify({
	'@moonfin/platform-webos': path.resolve(__dirname, '..', 'platform-webos', 'src'),
	'@moonfin/platform-tizen': path.resolve(__dirname, '..', 'platform-tizen', 'src'),
	'@moonfin/app': path.resolve(__dirname, '..', 'app')
});

try {
	console.log(' Building Moonfin for webOS...\n');

	// Apply Enact compatibility patches
	console.log('Applying Enact compatibility patches...');
	require(path.join(ROOT_DIR, 'scripts', 'patch-enact-legacy.js'));

	// Clean previous build
	console.log('Cleaning previous build...');
	run('npx enact clean', {cwd: APP_DIR});

	// Lint gate: fail build on any lint warning/error
	console.log('\n Running lint checks...');
	if (!runLintGate(APP_DIR)) {
		console.error('Lint check failed: warnings/errors detected.');
		process.exit(1);
	}

	// Production build with Enact
	console.log('\n Building with Enact...');
	const browserslistConfig = path.join(APP_DIR, '.browserslistrc');
	run('npx enact pack -p', {cwd: APP_DIR, env: {...process.env, BROWSERSLIST_CONFIG: browserslistConfig, ENACT_ALIAS, REACT_APP_VERSION: appPkg.version}});

	// Copy build output to repo root dist/
	console.log('\n Copying build output...');
	if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, {recursive: true, force: true});
	copyDirRecursive(path.join(APP_DIR, 'dist'), DIST_DIR);

	// Clean intermediate app dist
	fs.rmSync(path.join(APP_DIR, 'dist'), {recursive: true, force: true});

	// Patch CSS for legacy WebKit (webOS 2 / Tizen 2.4)
	// PostCSS resolves most vars at build time, but runtime-set CSS vars and
	// the 'initial' keyword survive minification and break on old WebKit.
	console.log('\n Patching CSS for legacy WebKit...');
	const cssFiles = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.css'));
	for (const cssFile of cssFiles) {
		const cssPath = path.join(DIST_DIR, cssFile);
		let css = fs.readFileSync(cssPath, 'utf8');
		const origLen = css.length;
		// 'initial' keyword not supported before Safari 9.1
		css = css.replace(/background-color:initial/g, 'background-color:rgba(0,0,0,0)');
		// Resolve any remaining var(--accent-color, #hex) to just the fallback
		css = css.replace(/var\(--accent-color,\s*([^)]+)\)/g, '$1');
		css = css.replace(/var\(--sand-accent-color,\s*([^)]+)\)/g, '$1');
		if (css.length !== origLen) {
			fs.writeFileSync(cssPath, css);
			console.log(`  Patched ${cssFile}`);
		}
	}

	// Copy banner
	console.log('\n Copying banner...');
	const bannerSrc = path.join(APP_DIR, 'resources', 'banner-dark.png');
	const bannerDest = path.join(DIST_DIR, 'resources', 'banner-dark.png');
	if (fs.existsSync(bannerSrc)) {
		fs.mkdirSync(path.dirname(bannerDest), {recursive: true});
		fs.copyFileSync(bannerSrc, bannerDest);
	}

	// Copy libpgs worker for PGS subtitle rendering
	console.log('\n Copying libpgs worker asset...');
	const libpgsWorkerSrc = path.join(ROOT_DIR, 'node_modules', 'libpgs', 'dist', 'libpgs.worker.js');
	const libpgsWorkerDest = path.join(DIST_DIR, 'libpgs.worker.js');
	if (fs.existsSync(libpgsWorkerSrc)) {
		fs.copyFileSync(libpgsWorkerSrc, libpgsWorkerDest);
		console.log('  ✓ Copied libpgs.worker.js');
	} else {
		console.warn('  ⚠ libpgs.worker.js not found (PGS rendering may degrade)');
	}

	// Copy SubtitlesOctopus assets for ASS/SSA subtitle rendering
	console.log('\n Copying SubtitlesOctopus assets...');
	const octopusDir = path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js');
	const octopusFiles = ['subtitles-octopus-worker.js', 'subtitles-octopus-worker-legacy.js', 'subtitles-octopus-worker.wasm'];
	for (const file of octopusFiles) {
		const src = path.join(octopusDir, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(DIST_DIR, file));
			console.log(`  ✓ Copied ${file}`);
		} else {
			console.warn(`  ⚠ ${file} not found (ASS rendering may degrade)`);
		}
	}

	// Prune ilib locale data — keeps only plurals.json and localeinfo.json
	// for configured locales, removing ~5.5 MB of unused formatting data.
	console.log('\n Pruning ilib locale data...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-ilib-locales.js'))(DIST_DIR);

	// Remove unused font weights to reduce size
	const museoDir = findDir(DIST_DIR, 'MuseoSans');
	if (museoDir) {
		console.log('\n Removing unused font weights...');
		const fontFiles = ([
			'MuseoSans-Thin.ttf',
			'MuseoSans-BlackItalic.ttf',
			'MuseoSans-BoldItalic.ttf',
			'MuseoSans-MediumItalic.ttf'
		]);
		deleteFiles(museoDir, fontFiles);
	}

	// Package into IPK
	console.log('\n Creating IPK package...');
	console.log(' Copying webos-meta files...');
	const webosMeta = path.join(__dirname, 'webos-meta');
	if (fs.existsSync(webosMeta)) {
		for (const file of fs.readdirSync(webosMeta)) {
			fs.copyFileSync(path.join(webosMeta, file), path.join(DIST_DIR, file));
		}
	}

	// Remove previous Moonfin_webOS_*.ipk files before packaging
	for (const f of fs.readdirSync(ROOT_DIR).filter(f => /^Moonfin_webOS_.*\.ipk$/.test(f))) {
		fs.unlinkSync(path.join(ROOT_DIR, f));
	}

	run(`npx ares-package ${DIST_DIR} -o ${ROOT_DIR} --no-minify`);

	// Rename to Moonfin_webOS_<version>.ipk
	const generatedIpk = path.join(ROOT_DIR, `org.moonfin.webos_${appPkg.version}_all.ipk`);
	const finalIpk = path.join(ROOT_DIR, `Moonfin_webOS_${appPkg.version}.ipk`);
	if (fs.existsSync(generatedIpk)) {
		fs.renameSync(generatedIpk, finalIpk);
		console.log(`  Renamed to Moonfin_webOS_${appPkg.version}.ipk`);
	}

	// Update manifest with version and hash
	console.log('\n Updating manifest...');
	run('node update-manifest.js');

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
