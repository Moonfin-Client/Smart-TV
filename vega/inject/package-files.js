// The app's own files, for a page loaded from file:///pkg/assets.
//
// Such a page has a null origin, so XHR, fetch and workers can't read its sibling files, while a
// classic script tag still loads. The build turns each file the app reads (font atlases and their
// data, icons, images, strings) into a script under vega-files/ that hands its contents to
// __moonfinVegaFile, loaded the first time something asks for that file. The renderer's image
// worker runs from a blob and can't reach the page's files at all, so a packaged image it's asked
// for goes to it as a data URL instead.
(function () {
	if (location.protocol !== 'file:') return;

	var DIR = 'vega-files/';
	var ROOT = new URL('./', location.href).href;
	var files = {};
	var waiting = {};

	var MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', json: 'application/json', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'};
	var mime = function (name) {
		return MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
	};

	// The packaged name for a URL, or null when it isn't one of the page's own files.
	var packaged = function (url) {
		if (typeof url !== 'string' || /^(https?|data|blob):/i.test(url)) return null;
		var abs;
		try {
			abs = new URL(url, location.href).href;
		} catch (e) {
			return null;
		}
		if (abs.indexOf(ROOT) !== 0) return null;
		return decodeURIComponent(abs.slice(ROOT.length).split(/[?#]/)[0]);
	};

	// binary is 1 when data is base64, 0 when it's the file's text.
	window.__moonfinVegaFile = function (name, binary, data) {
		files[name] = {binary: binary === 1, data: data};
		var callbacks = waiting[name] || [];
		delete waiting[name];
		callbacks.forEach(function (entry) { entry.resolve(files[name]); });
	};

	var load = function (name) {
		if (files[name]) return Promise.resolve(files[name]);
		return new Promise(function (resolve, reject) {
			var first = !waiting[name];
			(waiting[name] = waiting[name] || []).push({resolve: resolve, reject: reject});
			if (!first) return;
			var script = document.createElement('script');
			script.src = DIR + name.split('/').map(encodeURIComponent).join('/') + '.js';
			script.onerror = function () {
				script.remove();
				var callbacks = waiting[name] || [];
				delete waiting[name];
				callbacks.forEach(function (entry) { entry.reject(new Error('Not packaged: ' + name)); });
			};
			script.onload = function () { script.remove(); };
			document.head.appendChild(script);
		});
	};

	var bytes = function (file) {
		if (!file.binary) return new TextEncoder().encode(file.data);
		if (Uint8Array.fromBase64) return Uint8Array.fromBase64(file.data);
		var binary = atob(file.data);
		var out = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out;
	};
	var text = function (file) {
		return file.binary ? new TextDecoder().decode(bytes(file)) : file.data;
	};

	var body = function (file, name, type) {
		if (type === 'json') {
			try {
				return JSON.parse(text(file));
			} catch (e) {
				return null;
			}
		}
		if (type === 'arraybuffer') return bytes(file).buffer;
		if (type === 'blob') return new Blob([bytes(file)], {type: mime(name)});
		if (type === '' || type === 'text') return text(file);
		return null;
	};

	// A request for a packaged file never opens the real one, so this XHR fires only the events
	// given here.
	var answer = function (xhr, name, file) {
		var type = xhr.responseType || '';
		var fields = file
			? {status: 200, statusText: 'OK', response: body(file, name, type)}
			: {status: 404, statusText: 'Not Found', response: type === '' || type === 'text' ? '' : null};
		fields.readyState = 4;
		fields.responseURL = ROOT + name;
		if (type === '' || type === 'text') fields.responseText = fields.response;
		Object.keys(fields).forEach(function (key) {
			Object.defineProperty(xhr, key, {value: fields[key], configurable: true});
		});
		['readystatechange', 'load', 'loadend'].forEach(function (event) {
			xhr.dispatchEvent(new ProgressEvent(event));
		});
	};

	var proto = XMLHttpRequest.prototype;
	var nativeOpen = proto.open;
	var nativeSend = proto.send;
	proto.open = function (method, url, async) {
		var name = packaged(url);
		this.__vegaFile = name === null ? null : {name: name, async: async !== false};
		if (name === null) return nativeOpen.apply(this, arguments);
	};
	proto.send = function () {
		var request = this.__vegaFile;
		if (!request) return nativeSend.apply(this, arguments);
		this.__vegaFile = null;
		var xhr = this;
		// A script tag can't load synchronously, so a synchronous request gets the 404 it gets today.
		if (!request.async) return answer(xhr, request.name, null);
		load(request.name).then(
			function (file) { answer(xhr, request.name, file); },
			function () { answer(xhr, request.name, null); }
		);
	};

	var nativeFetch = window.fetch;
	window.fetch = function (input, init) {
		var name = packaged(typeof input === 'string' ? input : input && input.url);
		if (name === null) return nativeFetch.apply(this, arguments);
		return load(name).then(
			function (file) { return new Response(new Blob([bytes(file)], {type: mime(name)}), {status: 200}); },
			function () { return new Response('', {status: 404, statusText: 'Not Found'}); }
		);
	};

	// The renderer's image worker reads each request's src with XHR.
	var NativeWorker = window.Worker;
	if (typeof NativeWorker === 'undefined') return;
	window.Worker = function (url, options) {
		var worker = new NativeWorker(url, options);
		var post = worker.postMessage;
		worker.postMessage = function (message) {
			var name = message && typeof message.src === 'string' ? packaged(message.src) : null;
			if (name === null) return post.apply(worker, arguments);
			var rest = Array.prototype.slice.call(arguments, 1);
			load(name).then(
				function (file) {
					var src = 'data:' + mime(name) + ';base64,' + (file.binary ? file.data : btoa(unescape(encodeURIComponent(file.data))));
					return Object.assign({}, message, {src: src});
				},
				function () { return message; }
			).then(function (sent) { post.apply(worker, [sent].concat(rest)); });
		};
		return worker;
	};
	window.Worker.prototype = NativeWorker.prototype;
})();
