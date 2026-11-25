import {getTokenParam} from '../services/jellyfinApi';

const READERS = {
	epub: {kind: 'epub'},
	cbz: {kind: 'comic', archive: 'zip'},
	zip: {kind: 'comic', archive: 'zip'},
	cbt: {kind: 'comic', archive: 'tar'},
	cbr: {kind: 'comic', archive: 'rar', newer: true},
	cb7: {kind: 'comic', archive: '7z', newer: true},
	pdf: {kind: 'pdf', newer: true}
};

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jpe', 'jif', 'jfif', 'png', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'webp'];

// jellyfin-web saves a comic or PDF place as its page index in units of 10000 ticks.
export const TICKS_PER_PAGE = 10000;

// An EPUB's runtime is one second's worth of ticks, and its place is that share of it.
const EPUB_TICKS = 10000000;

const extensionOf = (value) => {
	if (typeof value !== 'string') return null;
	const name = value.trim().toLowerCase().split(/[\\/]/).pop();
	const dot = name.lastIndexOf('.');
	return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : null;
};

export const bookExtension = (item) => {
	if (!item) return null;
	const sources = item.MediaSources || [];
	const candidates = [item.Path].concat(sources.map((source) => source.Path));
	for (const candidate of candidates) {
		const ext = extensionOf(candidate);
		if (ext) return ext;
	}
	const container = (item.Container || (sources[0] && sources[0].Container) || '').toLowerCase();
	return container || null;
};

export const isBookItem = (item) => !!item && (item.Type === 'Book' || item.MediaType === 'Book');

export const bookReader = (item) => {
	const ext = bookExtension(item);
	return ext && READERS[ext] ? {ext, ...READERS[ext]} : null;
};

// The RAR and 7z decoder is WebAssembly that uses the sign extension
// instructions, which the first WebAssembly engines lack. PDF is held to the
// same newer TVs.
const SIGN_EXTENSION_MODULE = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 10, 7, 1, 5, 0, 65, 0, 192, 11];
let newerFormats = null;
export const supportsNewerBookFormats = () => {
	if (newerFormats === null) {
		try {
			newerFormats = typeof Worker === 'function' && typeof WebAssembly === 'object' &&
				WebAssembly.validate(new Uint8Array(SIGN_EXTENSION_MODULE));
		} catch (e) {
			newerFormats = false;
		}
	}
	return newerFormats;
};

// Download needs the account's download permission, which File doesn't, so a
// profile without it can still read.
export const fetchBook = async (item, serverUrl, accessToken) => {
	const base = item._serverUrl || serverUrl;
	const token = item._serverAccessToken || accessToken;
	const auth = `${getTokenParam(item._serverType)}=${encodeURIComponent(token)}`;
	let status = 0;
	for (const route of ['Download', 'File']) {
		const response = await fetch(`${base}/Items/${item.Id}/${route}?${auth}`);
		if (response.ok) return response.arrayBuffer();
		status = response.status;
		if (status !== 401 && status !== 403) break;
	}
	throw new Error(`HTTP ${status}`);
};

export const startPage = (item, count) => {
	const ticks = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
	const page = Math.round(ticks / TICKS_PER_PAGE);
	return page > 0 && page < count ? page : 0;
};

// jellyfin-web floors it too, and epub.js rounds a percentage up to the next
// location when restoring one, so flooring brings back the saved location.
export const epubTicks = (fraction) => Math.floor(Math.min(Math.max(fraction, 0), 1) * EPUB_TICKS);

// The share of the book the server position points at. It's null when there's no
// server position, when it's the one this TV reported last, or when this TV saved
// more recently.
export const newerServerEpubFraction = (item, local) => {
	const userData = (item && item.UserData) || {};
	const ticks = userData.PlaybackPositionTicks || 0;
	if (ticks <= 0 || (local && ticks === local.ticks)) return null;
	const serverSavedAt = Date.parse(userData.LastPlayedDate || '');
	if (local && local.savedAt && !(serverSavedAt > local.savedAt)) return null;
	return Math.min(ticks / EPUB_TICKS, 1);
};

export const sortPages = (names) => names
	.filter((name) => IMAGE_EXTENSIONS.indexOf(extensionOf(name)) !== -1 && name.split('/').pop().charAt(0) !== '.')
	.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

const decodeText = (bytes, start, length) => {
	let text = '';
	for (let i = start; i < start + length && bytes[i] !== 0; i++) text += String.fromCharCode(bytes[i]);
	try {
		return decodeURIComponent(escape(text));
	} catch (e) {
		return text;
	}
};

const paxPath = (bytes, start, length) => {
	const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decodeText(bytes, start, length));
	return match ? match[1] : null;
};

// Every file in a tar is a 512 byte header followed by its bytes padded to 512.
// GNU long names and pax paths arrive as an entry of their own before the file.
export const readTarEntries = (buffer) => {
	const bytes = new Uint8Array(buffer);
	const entries = [];
	let nextName = null;
	let offset = 0;
	while (offset + 512 <= bytes.length && bytes[offset] !== 0) {
		const size = parseInt(decodeText(bytes, offset + 124, 12).trim() || '0', 8) || 0;
		const type = String.fromCharCode(bytes[offset + 156] || 48);
		const prefix = decodeText(bytes, offset + 345, 155);
		const name = nextName || (prefix ? `${prefix}/` : '') + decodeText(bytes, offset, 100);
		const data = offset + 512;
		nextName = null;
		if (type === 'L') nextName = decodeText(bytes, data, size);
		else if (type === 'x') nextName = paxPath(bytes, data, size);
		else if (type === '0' || type === '7') entries.push({name, offset: data, size});
		offset = data + Math.ceil(size / 512) * 512;
	}
	return entries;
};

const scripts = {};
// The legacy reader bundles carry their own core-js, which on Chrome 38 swaps the page's Promise,
// RegExp, Symbol, URL and Reflect, and dozens of Object, Array and String methods, for slower JS
// copies across the whole app, and the app's Map, Set and iterator polyfills only answer to the
// Symbol it had. What the page had goes back once the bundle has run, and the bundle keeps the
// copies it captured. Built-ins it added stay.
const BUILT_IN_GLOBALS = ['Promise', 'RegExp', 'Symbol', 'URL', 'URLSearchParams', 'Reflect'];
const keepBuiltIns = () => {
	const define = Object.defineProperty;
	const describe = Object.getOwnPropertyDescriptor;
	const names = Object.getOwnPropertyNames;
	const globals = BUILT_IN_GLOBALS.map((name) => [name, window[name]]);
	const kept = [];
	[Object, Object.prototype, Array, Array.prototype, String.prototype, RegExp.prototype, Function.prototype, JSON, Promise.prototype].forEach((owner) => {
		names(owner).forEach((key) => {
			const d = describe(owner, key);
			if (d && 'value' in d) kept.push([owner, key, d]);
		});
	});
	const put = (fn) => {
		try {
			fn();
		} catch (e) {
			console.warn('[books] built-in not restored', e);
		}
	};
	return () => {
		globals.forEach(([name, value]) => put(() => {
			if (window[name] !== value) window[name] = value;
		}));
		kept.forEach(([owner, key, d]) => put(() => {
			const now = describe(owner, key);
			if (!now || now.value !== d.value) define(owner, key, d);
		}));
	};
};

export const loadScript = (src) => {
	if (!scripts[src]) {
		scripts[src] = new Promise((resolve, reject) => {
			const restore = keepBuiltIns();
			const script = document.createElement('script');
			script.src = src;
			script.onload = () => {
				restore();
				resolve();
			};
			script.onerror = () => {
				delete scripts[src];
				reject(new Error(`Could not load ${src}`));
			};
			document.head.appendChild(script);
		});
	}
	return scripts[src];
};
