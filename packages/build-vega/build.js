/* eslint-disable no-console */
// Builds Moonfin for Vega OS (Fire TV).
//
// The web app is packed with Enact like the other platforms, prepared for life at
// file:///pkg/assets, and copied into the React Native shell under shell/, which
// hosts it in the Vega WebView. The shell is then built into a .vpkg with the Vega
// SDK, so that last step needs `vega` on the PATH. Pass --no-vpkg to stop once the
// assets are in place.
//
//   node build.js [--debug] [--no-vpkg] [--install] [--launch]
//
// The package version follows packages/app/package.json.
const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {LINT_DIRS, runLintGate} = require('../../scripts/lint-gate');
const {READER_ASSETS, copyReaderAssets} = require('../../scripts/reader-assets');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SHELL_DIR = path.join(__dirname, 'shell');
const ASSETS_DIR = path.join(SHELL_DIR, 'assets');
const INJECT_DIR = path.join(__dirname, 'inject');
const BRAND_DIR = path.join(__dirname, 'brand');

// Files the subtitle workers need. They are packaged as scripts the worker shim
// can load from file://, see inject/worker-shim.js.
const WORKER_ASSETS = [
	path.join(ROOT_DIR, 'node_modules', 'libpgs', 'dist', 'libpgs.worker.js'),
	path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.js'),
	path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.wasm'),
	{src: path.join(ROOT_DIR, 'node_modules', '@enact', 'sandstone', 'fonts', 'MuseoSans', 'MuseoSans-Light.ttf'), name: 'ass-fallback-font.ttf'},
	...['libarchive-worker.js', 'libarchive.wasm', 'pdf.worker.min.js'].map((name) => ({
		src: READER_ASSETS.find((asset) => path.basename(asset.name) === name).src,
		name
	}))
];

// A zip with the entries stored as they are, which is all the splash service
// reads, so no archiver has to be installed for the build.
const crc32 = (buffer) => {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
};

const storeZip = (entries) => {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const {name, data} of entries) {
		const nameBytes = Buffer.from(name, 'utf8');
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		locals.push(local, nameBytes, data);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBytes);
		offset += local.length + nameBytes.length + data.length;
	}
	const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
};

// The icon named in the manifest is read from assets/image, and the splash
// service plays assets/raw/SplashScreenImages.zip, a frame list in the boot
// animation layout, until the shell hides it.
const writeBrandAssets = (dir) => {
	fs.mkdirSync(path.join(dir, 'image'), {recursive: true});
	fs.copyFileSync(path.join(BRAND_DIR, 'icon.png'), path.join(dir, 'image', 'icon.png'));
	fs.mkdirSync(path.join(dir, 'raw'), {recursive: true});
	const zip = storeZip([
		{name: 'desc.txt', data: Buffer.from('1920 1080 30\nc 0 0 _loop\n', 'utf8')},
		{name: '_loop/', data: Buffer.alloc(0)},
		{name: '_loop/loop00000.png', data: fs.readFileSync(path.join(BRAND_DIR, 'splash.png'))}
	]);
	fs.writeFileSync(path.join(dir, 'raw', 'SplashScreenImages.zip'), zip);
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

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

// Sandstone's CSS asks for its fonts at /node_modules/@enact/sandstone/fonts, an
// absolute path nothing serves, so every face its stylesheet names travels with it.
const SANDSTONE_FONTS = path.join(ROOT_DIR, 'node_modules', '@enact', 'sandstone', 'fonts');

const bundleSandstoneFonts = (dir) => {
	copyDirRecursive(SANDSTONE_FONTS, path.join(dir, 'fonts'));
	for (const file of fs.readdirSync(dir).filter((entry) => entry.endsWith('.css'))) {
		const cssPath = path.join(dir, file);
		const css = fs.readFileSync(cssPath, 'utf8');
		const patched = css.replace(/url\(\/node_modules\/@enact\/sandstone\/fonts\//g, 'url(fonts/');
		if (patched !== css) fs.writeFileSync(cssPath, patched);
	}
};

const writeWorkerAssets = (dir) => {
	const assetDir = path.join(dir, 'vega-assets');
	fs.mkdirSync(assetDir, {recursive: true});
	for (const asset of WORKER_ASSETS) {
		const src = asset.src || asset;
		const name = asset.name || path.basename(src);
		if (!fs.existsSync(src)) {
			console.warn(`  ${name} not found, subtitle rendering may degrade`);
			continue;
		}
		const base64 = fs.readFileSync(src).toString('base64');
		fs.writeFileSync(path.join(assetDir, `${name}.js`), `__moonfinVegaAsset(${JSON.stringify(name)},${JSON.stringify(base64)});\n`);
		console.log(`  Packed ${name}`);
	}
};

const copyInjectScripts = (dir) => {
	const vegaDir = path.join(dir, 'vega');
	fs.mkdirSync(vegaDir, {recursive: true});
	for (const file of fs.readdirSync(INJECT_DIR)) {
		fs.copyFileSync(path.join(INJECT_DIR, file), path.join(vegaDir, file));
	}
};

const injectScriptTags = (html) => {
	const tags = fs.readdirSync(INJECT_DIR).sort()
		.map((file) => `<script src="vega/${file}"></script>`)
		.join('\n\t');
	return html.replace(/<script defer="defer" src="main\.js"><\/script>/, `${tags}\n\t<script defer="defer" src="main.js"></script>`);
};

const buildApp = (appPkg) => {
	const ENACT_ALIAS = JSON.stringify({
		'@moonfin/platform-webos': path.resolve(__dirname, '..', 'platform-webos', 'src'),
		'@moonfin/platform-tizen': path.resolve(__dirname, '..', 'platform-tizen', 'src'),
		'@moonfin/platform-vega': path.resolve(__dirname, '..', 'platform-vega', 'src'),
		'@moonfin/platform-xbox': path.resolve(__dirname, '..', 'platform-xbox', 'src'),
		'@moonfin/platform-titan': path.resolve(__dirname, '..', 'platform-titan', 'src'),
		'@moonfin/platform-web': path.resolve(__dirname, '..', 'platform-web', 'src'),
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
			REACT_APP_PLATFORM: 'vega'
		}
	});

	console.log('\n Copying build output into the shell...');
	fs.rmSync(ASSETS_DIR, {recursive: true, force: true});
	copyDirRecursive(path.join(APP_DIR, 'dist'), ASSETS_DIR);
	fs.rmSync(path.join(APP_DIR, 'dist'), {recursive: true, force: true});

	console.log('\n Copying banner...');
	const bannerSrc = path.join(APP_DIR, 'resources', 'banner-dark.png');
	fs.mkdirSync(path.join(ASSETS_DIR, 'resources'), {recursive: true});
	fs.copyFileSync(bannerSrc, path.join(ASSETS_DIR, 'resources', 'banner-dark.png'));

	console.log('\n Copying book reader assets...');
	copyReaderAssets(ASSETS_DIR, (msg) => console.log(`  ${msg}`));

	console.log('\n Packing subtitle and book reader workers for file://...');
	writeWorkerAssets(ASSETS_DIR);

	console.log('\n Patching index.html...');
	copyInjectScripts(ASSETS_DIR);
	const indexPath = path.join(ASSETS_DIR, 'index.html');
	fs.writeFileSync(indexPath, injectScriptTags(fs.readFileSync(indexPath, 'utf8')));

	console.log('\n Pruning ilib locale data...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-ilib-locales.js'))(ASSETS_DIR);

	console.log('\n Pruning bundled translation copies...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-bundled-strings.js'))(ASSETS_DIR);

	console.log('\n Bundling Sandstone fonts...');
	bundleSandstoneFonts(ASSETS_DIR);

	console.log('\n Writing the icon and splash...');
	writeBrandAssets(ASSETS_DIR);
};

const syncManifestVersion = (version) => {
	const manifestPath = path.join(SHELL_DIR, 'manifest.toml');
	const manifest = fs.readFileSync(manifestPath, 'utf8');
	const updated = manifest.replace(/^(version = ")[^"]*(")/m, `$1${version}$2`);
	if (updated !== manifest) fs.writeFileSync(manifestPath, updated);
};

// The store wants a build number that only goes up, so it follows the version.
const buildNumber = (version) => {
	const [major, minor, patch] = version.split('.').map(Number);
	return major * 10000 + minor * 100 + patch;
};

const buildVpkg = (version) => {
	if (!fs.existsSync(path.join(SHELL_DIR, 'node_modules'))) {
		console.log('\n Installing shell dependencies...');
		run('npm install --no-audit --no-fund', {cwd: SHELL_DIR});
	}

	const buildType = flag('--debug') ? 'Debug' : 'Release';
	console.log(`\n Building the Vega package (${buildType})...`);
	run(`npx react-native build-vega --build-type ${buildType} --build-number ${buildNumber(version)}`, {cwd: SHELL_DIR});

	const outDir = path.join(SHELL_DIR, 'build', `armv7-${buildType.toLowerCase()}`);
	const built = fs.existsSync(outDir) ? fs.readdirSync(outDir).find((file) => file.endsWith('.vpkg')) : null;
	if (!built) throw new Error(`No .vpkg found under ${outDir}`);

	const prefix = `Moonfin_Vega_${buildType === 'Debug' ? 'Debug_' : ''}`;
	for (const file of fs.readdirSync(ROOT_DIR).filter((entry) => entry.startsWith(prefix) && /^v?\d+\.\d+\.\d+\.vpkg$/.test(entry.slice(prefix.length)))) {
		fs.unlinkSync(path.join(ROOT_DIR, file));
	}
	const finalName = `${prefix}v${version}.vpkg`;
	fs.copyFileSync(path.join(outDir, built), path.join(ROOT_DIR, finalName));
	console.log(`  ${finalName}`);

	if (flag('--install') || flag('--launch')) {
		run(`vega device install-app --packagePath ${JSON.stringify(path.join(ROOT_DIR, finalName))}`);
	}
	if (flag('--launch')) {
		run('vega device launch-app --appName org.moonfin.androidtv.main');
	}
};

try {
	const appPkg = require(path.join(APP_DIR, 'package.json'));

	console.log(' Building Moonfin for Vega...\n');
	buildApp(appPkg);
	syncManifestVersion(appPkg.version);

	if (flag('--no-vpkg')) {
		console.log(`\n Assets ready in ${ASSETS_DIR}. Run again without --no-vpkg where the Vega SDK is installed to build the package.`);
	} else {
		buildVpkg(appPkg.version);
	}

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
