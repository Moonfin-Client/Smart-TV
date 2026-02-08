/* eslint-disable no-console */
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit'});
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

try {
	console.log(' Building Moonfin for webOS...\n');

	// Clean previous build
	console.log('Cleaning previous build...');
	run('npm run clean');

	// Production build with Enact
	console.log('\n Building with Enact...');
	run('npx enact pack -p');

	// Copy banner
	console.log('\n Copying banner...');
	const bannerSrc = path.join('resources', 'banner-dark.png');
	const bannerDest = path.join('dist', 'resources', 'banner-dark.png');
	if (fs.existsSync(bannerSrc)) {
		fs.mkdirSync(path.dirname(bannerDest), {recursive: true});
		fs.copyFileSync(bannerSrc, bannerDest);
	}

	// Remove non-English locales to reduce package size
	console.log('\n Removing non-English locales due to size constraints...');
	const localeDir = path.join('dist', 'node_modules', 'ilib', 'locale');
	removeDirs(localeDir, (name) => !name.startsWith('en'));

	// Package into IPK
	console.log('\n Creating IPK package...');
	fs.mkdirSync('build', {recursive: true});
	run('npx ares-package ./dist ./services -o ./build');

	// Update manifest with version and hash
	console.log('\n Updating manifest...');
	run('node update-manifest.js');

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
