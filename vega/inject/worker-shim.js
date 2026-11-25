// Workers for a page loaded from file:///pkg/assets.
//
// Such a page has a null origin, so it can neither start a Worker from a sibling
// file nor fetch one. The build turns each worker, and every file that worker reads
// by relative URL, into a classic script that hands its bytes to this shim. A
// classic script tag still loads from file://, so the shim starts the worker from
// a blob instead and feeds it the files it would otherwise have fetched.
//
// Inside the worker, fetch and XMLHttpRequest answer those file names from the
// bytes they were given, and the libass wasm goes in through Module.wasmBinary so
// emscripten never asks for it.
(function () {
	if (location.protocol !== 'file:' || typeof Worker === 'undefined') return;

	const ASSET_DIR = 'vega-assets/';

	// Worker file name to the files that worker reads by relative URL.
	const WORKERS = {
		'subtitles-octopus-worker.js': ['subtitles-octopus-worker.wasm', 'ass-fallback-font.ttf'],
		'libarchive-worker.js': ['libarchive.wasm'],
		'pdf.worker.min.js': []
	};

	const loaded = {};
	const waiting = {};

	window.__moonfinVegaAsset = function (name, base64) {
		loaded[name] = base64;
		const callbacks = waiting[name] || [];
		delete waiting[name];
		callbacks.forEach(function (entry) { entry.resolve(base64); });
	};

	const loadAsset = function (name) {
		if (loaded[name]) return Promise.resolve(loaded[name]);
		return new Promise(function (resolve, reject) {
			const first = !waiting[name];
			(waiting[name] = waiting[name] || []).push({resolve: resolve, reject: reject});
			if (!first) return;
			const script = document.createElement('script');
			script.src = ASSET_DIR + name + '.js';
			script.onerror = function () {
				const callbacks = waiting[name] || [];
				delete waiting[name];
				callbacks.forEach(function (entry) { entry.reject(new Error('Missing Vega asset ' + name)); });
			};
			script.onload = function () { script.remove(); };
			document.head.appendChild(script);
		});
	};

	const toBytes = function (base64) {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	};

	// Runs inside the worker. It holds the app's messages until the real worker
	// script is in place, then replays them in order.
	const BOOTSTRAP = [
		'const queued = [];',
		'let assets = {};',
		'const toBytes = ' + toBytes.toString() + ';',
		'const queue = function (e) { if (!e.data || !e.data.__moonfin) queued.push(e.data); };',
		'self.addEventListener("message", queue);',
		'const assetName = function (url) {',
		'	const name = String(url).split("?")[0].split("#")[0].split("/").pop();',
		'	return Object.prototype.hasOwnProperty.call(assets, name) ? name : null;',
		'};',
		'const dataUrl = function (name) { return "data:application/octet-stream;base64," + assets[name]; };',
		'const open = XMLHttpRequest.prototype.open;',
		'XMLHttpRequest.prototype.open = function (method, url, ...rest) {',
		'	const name = assetName(url);',
		'	return open.call(this, method, name ? dataUrl(name) : url, ...rest);',
		'};',
		'const nativeFetch = self.fetch;',
		'self.fetch = function (url, init) {',
		'	const name = assetName(url);',
		'	return nativeFetch.call(self, name ? dataUrl(name) : url, init);',
		'};',
		'self.addEventListener("message", function start(e) {',
		'	const d = e.data;',
		'	if (!d || d.__moonfin !== "start") return;',
		'	self.removeEventListener("message", start);',
		'	self.removeEventListener("message", queue);',
		'	assets = d.assets;',
		'	if (d.wasm) self.Module = {wasmBinary: toBytes(assets[d.wasm])};',
		'	(0, eval)(d.source);',
		'	queued.forEach(function (data) { self.dispatchEvent(new MessageEvent("message", {data: data})); });',
		'});'
	].join('\n');

	const bootstrapUrl = URL.createObjectURL(new Blob([BOOTSTRAP], {type: 'text/javascript'}));
	const NativeWorker = window.Worker;

	window.Worker = function (url, options) {
		const name = String(url).split('?')[0].split('#')[0].split('/').pop();
		if (!Object.prototype.hasOwnProperty.call(WORKERS, name)) return new NativeWorker(url, options);

		const worker = new NativeWorker(bootstrapUrl, options);
		const files = WORKERS[name];
		Promise.all([name].concat(files).map(loadAsset)).then(function (parts) {
			const assets = {};
			files.forEach(function (file, index) { assets[file] = parts[index + 1]; });
			worker.postMessage({
				__moonfin: 'start',
				source: new TextDecoder().decode(toBytes(parts[0])),
				assets: assets,
				wasm: files.find(function (file) { return /\.wasm$/.test(file); }) || null
			});
		}, function (err) {
			worker.dispatchEvent(new ErrorEvent('error', {message: err.message}));
		});
		return worker;
	};
	window.Worker.prototype = NativeWorker.prototype;
})();
