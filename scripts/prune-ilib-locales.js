/**
 * Prune ilib locale data from a build output directory.
 *
 * The Enact ILibPlugin copies ALL ilib locale data (~6 MB) into the bundle
 * regardless of the configured locales.  This app only uses $L() for string
 * translation (no DateFmt / NumFmt / Collator), so the only ilib files needed
 * at runtime are plurals.json and localeinfo.json for each configured language.
 *
 * Usage (from a build script):
 *   require('./prune-ilib-locales')(distDir);
 *
 * It will:
 *  1. Locate the ilib/locale directory inside distDir
 *  2. Read the configured locales from packages/app/package.json
 *  3. Delete every file and directory that is not essential for $L()
 *  4. Regenerate ilibmanifest.json so the runtime Loader doesn't 404
 */

const fs = require('fs');
const path = require('path');

// Files needed per language directory for $L() string translation.
// plurals.json  — ResBundle calls IString.loadPlurals() in its constructor
// localeinfo.json — loaded by ilib during setLocale() initialisation
const KEEP_FILES = new Set(['plurals.json', 'localeinfo.json']);

// Root-level ilib/locale/ files that are always needed.
// localeinfo.json — default/fallback locale metadata
// ilibmanifest.json — rebuilt by this script; tells the Loader what exists
const KEEP_ROOT = new Set(['localeinfo.json', 'ilibmanifest.json']);

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

// Collect all files relative to baseDir (forward-slash separated)
function collectFiles(baseDir, rel) {
	const results = [];
	const abs = rel ? path.join(baseDir, rel) : baseDir;
	if (!fs.existsSync(abs)) return results;
	for (const entry of fs.readdirSync(abs, {withFileTypes: true})) {
		const childRel = rel ? rel + '/' + entry.name : entry.name;
		if (entry.isDirectory()) {
			results.push(...collectFiles(baseDir, childRel));
		} else {
			results.push(childRel);
		}
	}
	return results;
}

module.exports = function pruneIlibLocales(distDir) {
	const ilibDir = findDir(distDir, 'ilib');
	const localeDir = ilibDir ? path.join(ilibDir, 'locale') : null;

	if (!localeDir || !fs.existsSync(localeDir)) {
		console.log('  No ilib locale directory found — skipping locale pruning');
		return;
	}

	// Read configured locales from package.json
	const appPkgPath = path.resolve(__dirname, '..', 'packages', 'app', 'package.json');
	const appPkg = JSON.parse(fs.readFileSync(appPkgPath, 'utf8'));
	const locales = (appPkg.enact && appPkg.enact.locales) || ['en-US'];

	// Build set of language directories to keep: 'en', 'pl', etc.
	// For 'en-US' we need both 'en' (language) and 'en/US' (region) — but
	// ilib's source only has 'en/{region}' dirs for date formatting data which
	// we don't need, so we just keep the language-level dir.
	const keepLangs = new Set();
	for (const locale of locales) {
		const lang = locale.split('-')[0].toLowerCase();
		keepLangs.add(lang);
	}

	console.log(`  Configured locales: [${locales.join(', ')}]`);
	console.log(`  Keeping language dirs: [${[...keepLangs].join(', ')}]`);

	let removedSize = 0;

	// 1. Remove root-level files that are only for formatting
	for (const entry of fs.readdirSync(localeDir, {withFileTypes: true})) {
		if (entry.isDirectory()) continue;
		if (KEEP_ROOT.has(entry.name)) continue;
		const fp = path.join(localeDir, entry.name);
		removedSize += fs.statSync(fp).size;
		fs.unlinkSync(fp);
	}

	// 2. Remove all language directories except the ones we need
	for (const entry of fs.readdirSync(localeDir, {withFileTypes: true})) {
		if (!entry.isDirectory()) continue;
		if (keepLangs.has(entry.name)) continue;
		const fp = path.join(localeDir, entry.name);
		removedSize += dirSize(fp);
		fs.rmSync(fp, {recursive: true, force: true});
	}

	// 3. Within each kept language dir, remove everything except KEEP_FILES
	//    and delete all region subdirectories (e.g. en/GB, en/AU)
	for (const lang of keepLangs) {
		const langDir = path.join(localeDir, lang);
		if (!fs.existsSync(langDir)) continue;

		for (const entry of fs.readdirSync(langDir, {withFileTypes: true})) {
			const fp = path.join(langDir, entry.name);
			if (entry.isDirectory()) {
				// Remove all region subdirs — they contain only formatting data
				removedSize += dirSize(fp);
				fs.rmSync(fp, {recursive: true, force: true});
			} else if (!KEEP_FILES.has(entry.name)) {
				removedSize += fs.statSync(fp).size;
				fs.unlinkSync(fp);
			}
		}
	}

	// 4. Regenerate ilibmanifest.json with only the remaining files
	const remaining = collectFiles(localeDir, '');
	const manifest = {files: remaining.filter(f => f !== 'ilibmanifest.json')};
	fs.writeFileSync(
		path.join(localeDir, 'ilibmanifest.json'),
		JSON.stringify(manifest, null, '\t'),
		'utf8'
	);

	const savedMB = (removedSize / 1024 / 1024).toFixed(1);
	console.log(`  Pruned ilib locale data: removed ${savedMB} MB`);
	console.log(`  Remaining files: ${manifest.files.length} (${manifest.files.join(', ')})`);
};

function dirSize(dir) {
	let total = 0;
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const fp = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			total += dirSize(fp);
		} else {
			total += fs.statSync(fp).size;
		}
	}
	return total;
}
