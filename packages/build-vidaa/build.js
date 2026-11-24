/* eslint-disable no-console */
// Packages Moonfin as an opkg .ipk for Hisense VIDAA (mtk9618), installed as
// the "Jellyfin" app.
//
//   node build.js [--skip-app]
//
// Without --skip-app it first runs the web build for the VIDAA platform
// (npm run build:webos with REACT_APP_PLATFORM=vidaa), whose output lands in <repo>/dist. The package then contains:
//
//   /APPS/pkgs/jellyfin-moonfin/www/       the built web app
//   /APPS/pkgs/jellyfin-moonfin/serve.js   static server for 127.0.0.1:8099
//   /APPS/pkgs/jellyfin-moonfin/setup.js   install/uninstall helper
//   /APPS/pkgs/jellyfin-moonfin/service/   boot service for the vendor service manager
//
// opkg on the TV installs relative to /APPS/pkgs, so data paths start at ./jellyfin-moonfin.
// Install on the TV, as root, with the vendor library path:
//   opkg --force-reinstall install /APPS/jellyfin-moonfin.ipk
const {execSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_SRC = path.join(__dirname, 'pkg');
const OUT_DIR = path.join(__dirname, 'out');
const PKG_NAME = 'jellyfin-moonfin';

const run = (cmd, opts = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...opts});
};

// Minimal ar(1) writer, byte-for-byte the layout of the ipk that already
// installs on this TV (member names without the GNU trailing slash).
const writeAr = (file, members) => {
	const parts = [Buffer.from('!<arch>\n')];
	for (const {name, data} of members) {
		const field = (value, width) => String(value).padEnd(width, ' ').slice(0, width);
		const header = field(name, 16) + field(0, 12) + field(0, 6) + field(0, 6) +
			field('100644', 8) + field(data.length, 10) + '`\n';
		parts.push(Buffer.from(header, 'ascii'), data);
		if (data.length % 2) parts.push(Buffer.from('\n'));
	}
	fs.writeFileSync(file, Buffer.concat(parts));
};

const listFiles = (dir, rel = '.') => fs.readdirSync(path.join(dir, rel), {withFileTypes: true})
	.flatMap((e) => (e.isDirectory() ? listFiles(dir, `${rel}/${e.name}`) : [`${rel}/${e.name}`]));

// Root-owned, metadata-free gzipped tar of the *files* under dir, paths as ./...
// No directory entries on purpose, like the ipk that already works on this TV:
// a "./" entry would make opkg re-own and re-mode /APPS/pkgs itself.
const tarGz = (dir, out) => {
	const list = path.join(path.dirname(out), path.basename(out) + '.list');
	fs.writeFileSync(list, listFiles(dir).join('\n') + '\n');
	run(`tar --format ustar --uid 0 --gid 0 --uname root --gname root --no-xattrs --no-mac-metadata -n ` +
		`-czf ${JSON.stringify(out)} -C ${JSON.stringify(dir)} -T ${JSON.stringify(list)}`,
		{env: {...process.env, COPYFILE_DISABLE: '1'}});
};

const copyDir = (src, dest) => {
	fs.mkdirSync(dest, {recursive: true});
	for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
};

const dirSize = (dir) => fs.readdirSync(dir, {withFileTypes: true}).reduce((sum, e) => {
	const p = path.join(dir, e.name);
	return sum + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
}, 0);

const main = () => {
	if (!process.argv.includes('--skip-app')) {
		run('npm run build:webos', {cwd: ROOT_DIR, env: {...process.env, REACT_APP_PLATFORM: 'vidaa'}});
		// The webOS build rewrites its store manifest; that file is not ours to change.
		run('git checkout -- packages/build-webos/org.moonfin.webos.manifest.json', {cwd: ROOT_DIR});
	}
	if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
		throw new Error(`no web build in ${DIST_DIR}; run without --skip-app`);
	}
	const version = require(path.join(ROOT_DIR, 'packages', 'app', 'package.json')).version;

	const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'moonfin-vidaa-'));
	const data = path.join(stage, 'data');
	const control = path.join(stage, 'control');
	const home = path.join(data, PKG_NAME);

	copyDir(DIST_DIR, path.join(home, 'www'));
	copyDir(path.join(PKG_SRC, 'service'), path.join(home, 'service'));
	fs.copyFileSync(path.join(__dirname, 'serve.js'), path.join(home, 'serve.js'));
	fs.copyFileSync(path.join(PKG_SRC, 'setup.js'), path.join(home, 'setup.js'));

	fs.mkdirSync(control);
	fs.writeFileSync(path.join(control, 'control'), [
		`Package: ${PKG_NAME}`,
		`Version: ${version}`,
		'Architecture: mtk9618',
		`AppId: ${PKG_NAME}`,
		'AppName: Jellyfin',
		'Section: ns',
		'Priority: optional',
		'Maintainer: gwerneckp',
		'Description: Jellyfin client (Moonfin) for Hisense VIDAA',
		'Format: 1',
		'Persistent: false',
		'PackageType: Entry',
		'Userid: 0:0',
		`Installed-Size: ${Math.ceil(dirSize(data) / 1024)}`,
		''
	].join('\n'));
	for (const script of ['postinst', 'prerm']) {
		fs.copyFileSync(path.join(PKG_SRC, script), path.join(control, script));
		fs.chmodSync(path.join(control, script), 0o755);
	}

	const controlTar = path.join(stage, 'control.tar.gz');
	const dataTar = path.join(stage, 'data.tar.gz');
	tarGz(control, controlTar);
	tarGz(data, dataTar);

	fs.mkdirSync(OUT_DIR, {recursive: true});
	const ipk = path.join(OUT_DIR, `${PKG_NAME}_${version}_mtk9618.ipk`);
	writeAr(ipk, [
		{name: 'debian-binary', data: Buffer.from('2.0\n')},
		{name: 'control.tar.gz', data: fs.readFileSync(controlTar)},
		{name: 'data.tar.gz', data: fs.readFileSync(dataTar)}
	]);
	fs.rmSync(stage, {recursive: true, force: true});
	console.log(`\n Built ${ipk} (${(fs.statSync(ipk).size / 1048576).toFixed(1)} MB)`);
};

main();
