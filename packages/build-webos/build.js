/* eslint-disable no-console */
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const run = (cmd, options = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...options});
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

// ── Optional version bump: npm run build:webos -- 2.2.0 ──
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

	// Production build with Enact
	console.log('\n Building with Enact...');
	run('npx enact pack -p', {cwd: APP_DIR, env: {...process.env, ENACT_ALIAS, REACT_APP_VERSION: appPkg.version}});

	// Copy build output to repo root dist/
	console.log('\n Copying build output...');
	if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, {recursive: true, force: true});
	copyDirRecursive(path.join(APP_DIR, 'dist'), DIST_DIR);

	// Clean intermediate app dist
	fs.rmSync(path.join(APP_DIR, 'dist'), {recursive: true, force: true});

	// Copy banner
	console.log('\n Copying banner...');
	const bannerSrc = path.join(APP_DIR, 'resources', 'banner-dark.png');
	const bannerDest = path.join(DIST_DIR, 'resources', 'banner-dark.png');
	if (fs.existsSync(bannerSrc)) {
		fs.mkdirSync(path.dirname(bannerDest), {recursive: true});
		fs.copyFileSync(bannerSrc, bannerDest);
	}

	// Find ilib locale directory (may be nested under _/_/ in mono-repo builds)
	const ilibDir = findDir(DIST_DIR, 'ilib');
	const localeDir = ilibDir ? path.join(ilibDir, 'locale') : null;

	if (localeDir && fs.existsSync(localeDir)) {
		console.log('\n Removing non-English locales due to size constraints...');
		console.log(`  ilib found at: ${ilibDir}`);
		removeDirs(localeDir, (name) => !name.startsWith('en'));

		console.log('\n Removing unused ilib data files...');
		const nonEngLocalefiles = ([
			'currency.json',
			'numplan.json',
			'emergency.json',
			'unitfmt.json',
			'phoneloc.json',
			'phonefmt.json',
			'iddarea.json',
			'idd.json',
			'mnc.json',
			'address.json',
			'addressres.json',
			'astro.json',
			'pseudomap.json',
			'collation.json',
			'countries.json',
			'nativecountries.json',
			'ctrynames.json',
			'ctryreverse.json',
			'name.json',
			'lang2charset.json',
			'ccc.json'
		]);
		deleteFiles(localeDir, nonEngLocalefiles);

		fs.rmSync(path.join(localeDir, 'en', 'Dsrt'), {recursive: true, force: true});

		console.log('\n Removing non-essential files from en/ regional locale dirs...');
		deleteFiles(path.join(localeDir, 'en'), nonEngLocalefiles);
	} else {
		console.log('\n No ilib locale directory found — skipping locale cleanup');
	}

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
	run(`npx ares-package ${DIST_DIR} -o ${ROOT_DIR} --no-minify`);

	// Update manifest with version and hash
	console.log('\n Updating manifest...');
	run('node update-manifest.js');

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
