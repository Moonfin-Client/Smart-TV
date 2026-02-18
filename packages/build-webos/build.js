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

const deleteFiles = (basePath, filenames) => {
	filenames.forEach(filename => {
		const filePath = path.join(basePath, filename);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	});
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

	// Root-level files: phone, currency, unit, address, astronomy data
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
	deleteFiles(path.join('dist', 'node_modules', 'ilib', 'locale'), nonEngLocalefiles);

	// Remove Deseret script locale (historic/obsolete)
	fs.rmSync(path.join('dist', 'node_modules', 'ilib', 'locale', 'en', 'Dsrt'), {recursive: true, force: true});
	
	// Strip bulky files from en/ regional subdirs (keep only sysres, dateformats, list, localeinfo, plurals)
	console.log('\n Removing non-essential files from en/ regional locale dirs...');
	deleteFiles(path.join('dist', 'node_modules', 'ilib', 'locale', 'en'), nonEngLocalefiles);

	// Remove unused font weights to reduce size
	console.log('\n Removing unused font weights...');
	const fontFiles = ([
		'MuseoSans-Thin.ttf',
		'MuseoSans-BlackItalic.ttf',
		'MuseoSans-BoldItalic.ttf',
		'MuseoSans-MediumItalic.ttf'
	]);
	deleteFiles(path.join('dist', 'node_modules', '@enact', 'sandstone', 'fonts', 'MuseoSans'), fontFiles);

	// Package into IPK
	console.log('\n Creating IPK package...');
	fs.mkdirSync('build', {recursive: true});
	run('npx ares-package ./dist -o ./build');

	// Update manifest with version and hash
	console.log('\n Updating manifest...');
	run('node update-manifest.js');

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
