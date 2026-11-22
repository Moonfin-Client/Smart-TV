// Over-the-air updates for sideloaded Tizen and webOS builds. A build only gets
// the loader when MOONFIN_OTA_URL (where release files download from, the tag
// folder goes after it) and MOONFIN_OTA_PUBLIC_KEY (PEM file) are set, so store
// builds leave them unset. With MOONFIN_OTA_SIGNING_KEY (PEM file) also set, the
// build writes moonfin-ota-<platform>.json and .bin next to the packages, to be
// attached to the release.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The code an update replaces. Everything else in the package is the shell, and
// an update only applies to the exact shell it was built with.
const CODE = /^(main\.js|main\.css|chunk\.[^/]+\.(js|css))$/;
// Enact writes some ilibmanifest.json files only on a cold build, and every one of
// them just lists locale files that are hashed anyway, so they don't count.
const NOT_SHELL = /^(index\.html|[^/]+\.LICENSE\.txt|icon[^/]*\.png|author-signature\.xml|signature\d*\.xml|\.manifest\.tmp|(.*\/)?ilibmanifest\.json)$/;
const VERSIONED = /^(config\.xml|appinfo\.json)$/;

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

const listFiles = (dir, prefix = '') => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
	const rel = prefix + entry.name;
	return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel + '/') : [rel];
});

const shellHash = (roots, version) => {
	const lines = [];
	for (const [dir, prefix] of roots) {
		for (const name of listFiles(dir, prefix)) {
			if (CODE.test(name) || NOT_SHELL.test(name)) continue;
			let data = fs.readFileSync(path.join(dir, name.slice(prefix.length)));
			// Every release bumps the version in the manifests, which shouldn't count as a shell change.
			if (VERSIONED.test(name)) data = data.toString('utf8').split(version).join('');
			lines.push(name + ' ' + sha256(data));
		}
	}
	return sha256(lines.sort().join('\n'));
};

const pemBody = file => fs.readFileSync(file, 'utf8').replace(/-----[^-]+-----|\s/g, '');

const applyOta = ({dist, platform, version, extraRoots = [], log = console.log}) => {
	const url = process.env.MOONFIN_OTA_URL;
	if (!url || !process.env.MOONFIN_OTA_PUBLIC_KEY) return;
	// The builds run from their own folders, so paths count from the repo root.
	const publicKey = path.resolve(REPO_ROOT, process.env.MOONFIN_OTA_PUBLIC_KEY);
	if (!fs.existsSync(publicKey)) {
		log(`OTA skipped, no public key at ${path.relative(REPO_ROOT, publicKey)}`);
		return;
	}

	fs.copyFileSync(path.join(__dirname, 'loader.js'), path.join(dist, 'ota-loader.js'));
	const shell = shellHash([[dist, ''], ...extraRoots], version);
	const config = {platform, version, shell, url: url.replace(/\/+$/, ''), key: pemBody(publicKey)};

	const indexPath = path.join(dist, 'index.html');
	let html = fs.readFileSync(indexPath, 'utf8');
	const css = /<link href="main\.css" rel="stylesheet"\s*\/?>/;
	const js = /<script defer="defer" src="main\.js"><\/script>/;
	if (!css.test(html) || !js.test(html)) throw new Error('OTA: main.css or main.js tag not found in index.html');
	html = html.replace(css, '').replace(js,
		`<script>window.MOONFIN_OTA=${JSON.stringify(config)};</script><script src="ota-loader.js"></script>`);
	fs.writeFileSync(indexPath, html);
	log(`OTA loader added (${platform} ${version}, shell ${shell.slice(0, 12)})`);

	if (!process.env.MOONFIN_OTA_SIGNING_KEY) return;
	const signingKey = path.resolve(REPO_ROOT, process.env.MOONFIN_OTA_SIGNING_KEY);

	// One .bin per release keeps the release page to two update files per platform.
	const names = fs.readdirSync(dist).filter(f => CODE.test(f)).sort();
	const parts = names.map(name => fs.readFileSync(path.join(dist, name)));
	const bin = Buffer.concat(parts);
	const files = names.map((name, i) => [name, parts[i].length]);
	const payload = JSON.stringify({platform, version, shell, bytes: bin.length, sha256: sha256(bin), files});
	const sig = crypto.sign('sha256', Buffer.from(payload), fs.readFileSync(signingKey, 'utf8')).toString('base64');
	fs.writeFileSync(path.join(REPO_ROOT, `moonfin-ota-${platform}.bin`), bin);
	fs.writeFileSync(path.join(REPO_ROOT, `moonfin-ota-${platform}.json`), JSON.stringify({payload, sig}));
	log(`OTA release files written: moonfin-ota-${platform}.json and .bin (${files.length} files)`);
};

module.exports = {applyOta, shellHash};
