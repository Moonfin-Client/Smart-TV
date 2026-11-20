/* eslint-disable no-console */
// Builds the hosted TV edition served at moonfin.io/tv/.
//
//   node build.js            Titan OS or the plain web, picked at runtime, into dist/tv
//   node build.js --titan    Titan OS only, for Titan's QA, into dist/titan
const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {LINT_DIRS, runLintGate} = require('../../scripts/lint-gate');
const {copyReaderAssets} = require('../../scripts/reader-assets');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const titanOnly = process.argv.includes('--titan');
const OUT_DIR = path.join(__dirname, 'dist', titanOnly ? 'titan' : 'tv');

const run = (cmd, options = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...options});
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

const fromModules = (...parts) => path.join(ROOT_DIR, 'node_modules', ...parts);

// The subtitle workers and the banner, which the page asks for next to itself.
const PAGE_ASSETS = [
	{src: path.join(APP_DIR, 'resources', 'banner-dark.png'), name: 'resources/banner-dark.png'},
	{src: fromModules('libpgs', 'dist', 'libpgs.worker.js')},
	{src: fromModules('libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.js')},
	{src: fromModules('libass-wasm', 'dist', 'js', 'subtitles-octopus-worker-legacy.js')},
	{src: fromModules('libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.wasm')},
	{src: fromModules('@enact', 'sandstone', 'fonts', 'MuseoSans', 'MuseoSans-Light.ttf'), name: 'ass-fallback-font.ttf'}
];

// Sandstone's CSS asks for its fonts at /node_modules/@enact/sandstone/fonts, which
// on moonfin.io is outside the app, so they travel with it and the CSS points there.
const bundleSandstoneFonts = (dir) => {
	copyDirRecursive(fromModules('@enact', 'sandstone', 'fonts'), path.join(dir, 'fonts'));
	for (const file of fs.readdirSync(dir).filter((entry) => entry.endsWith('.css'))) {
		const cssPath = path.join(dir, file);
		const css = fs.readFileSync(cssPath, 'utf8');
		const patched = css.replace(/url\(\/node_modules\/@enact\/sandstone\/fonts\//g, 'url(fonts/');
		if (patched !== css) fs.writeFileSync(cssPath, patched);
	}
};

const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-eval' blob: http: https:",
	"style-src 'self' 'unsafe-inline' blob: http: https:",
	'img-src * data: blob:',
	'media-src * data: blob:',
	'connect-src * ws: wss: data: blob:',
	"font-src 'self' data: blob: http: https:",
	"worker-src 'self' blob:",
	// Titan's SDK opens a frame on titanos.tv.
	'frame-src https://*.titanos.tv',
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'"
].join('; ');

// The title and the commit go in the page, so a deployed copy says what it was built from.
const finishIndexHtml = (dir, version) => {
	const file = path.join(dir, 'index.html');
	let commit = 'unknown';
	try {
		commit = execSync('git rev-parse --short HEAD', {cwd: ROOT_DIR, encoding: 'utf8'}).trim();
	} catch (e) {
		// A source tarball has no git.
	}
	const html = fs.readFileSync(file, 'utf8');
	if (!html.includes('<head>') || !html.includes('<title></title>')) throw new Error("index.html isn't shaped the way this build expects");
	fs.writeFileSync(file, html
		.replace('<head>', `<head>\n\t\t<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">\n\t\t<meta name="moonfin-build" content="${version} ${commit}">`)
		.replace('<title></title>', '<title>Moonfin</title>'));
	return commit;
};

const appPkg = require(path.join(APP_DIR, 'package.json'));

const ENACT_ALIAS = JSON.stringify({
	'@moonfin/platform-webos': path.resolve(__dirname, '..', 'platform-webos', 'src'),
	'@moonfin/platform-tizen': path.resolve(__dirname, '..', 'platform-tizen', 'src'),
	'@moonfin/platform-vega': path.resolve(__dirname, '..', 'platform-vega', 'src'),
	'@moonfin/platform-xbox': path.resolve(__dirname, '..', 'platform-xbox', 'src'),
	'@moonfin/platform-titan': path.resolve(__dirname, '..', 'platform-titan', 'src'),
	'@moonfin/platform-web': path.resolve(__dirname, '..', 'platform-web', 'src'),
	'@moonfin/app': APP_DIR
});

try {
	console.log(` Building the hosted ${titanOnly ? 'Titan OS' : 'TV'} edition...\n`);

	console.log('Applying Enact compatibility patches...');
	require(path.join(ROOT_DIR, 'scripts', 'patch-enact-legacy.js'));

	console.log('Cleaning previous build...');
	run('npx enact clean', {cwd: APP_DIR});

	if (!process.argv.includes('--skip-lint')) {
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
	}

	console.log('\n Building with Enact...');
	run('npx enact pack -p', {
		cwd: APP_DIR,
		env: {
			...process.env,
			BROWSERSLIST_CONFIG: path.join(__dirname, '.browserslistrc'),
			ENACT_ALIAS,
			REACT_APP_VERSION: appPkg.version,
			REACT_APP_HOSTED: 'true',
			...(titanOnly ? {REACT_APP_PLATFORM: 'titan'} : {})
		}
	});

	console.log('\n Copying build output...');
	fs.rmSync(OUT_DIR, {recursive: true, force: true});
	fs.mkdirSync(path.dirname(OUT_DIR), {recursive: true});
	fs.renameSync(path.join(APP_DIR, 'dist'), OUT_DIR);

	console.log('\n Copying the subtitle workers, banner and fonts...');
	for (const asset of PAGE_ASSETS) {
		const dest = path.join(OUT_DIR, asset.name || path.basename(asset.src));
		fs.mkdirSync(path.dirname(dest), {recursive: true});
		fs.copyFileSync(asset.src, dest);
	}
	bundleSandstoneFonts(OUT_DIR);
	copyReaderAssets(OUT_DIR, (msg) => console.log(`  ${msg}`));

	console.log('\n Pruning ilib locale data...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-ilib-locales.js'))(OUT_DIR);

	console.log('\n Pruning bundled translation copies...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-bundled-strings.js'))(OUT_DIR);

	const commit = finishIndexHtml(OUT_DIR, appPkg.version);
	console.log(`\n Build complete: ${path.relative(ROOT_DIR, OUT_DIR)} (${appPkg.version} ${commit})`);
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
