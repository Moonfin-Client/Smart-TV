/* eslint-disable no-var, prefer-arrow-callback, object-shorthand */
// Ships inside sideloaded TV packages and stays there. It boots a newer signed
// bundle from IndexedDB when one is ready, otherwise the bundled main.js. The
// app asks it to check for and download an update, nothing happens on its own.
// Plain ES5 for Chrome 38.
(function () {
	var C = window.MOONFIN_OTA;
	var READY = 'moonfin_ota_ready';
	var PENDING = 'moonfin_ota_pending';
	var BAD = 'moonfin_ota_bad';
	var INSTALLED = 'moonfin_ota_installed';
	var running = null;
	var dbPromise = null;

	function ls(key, value) {
		try {
			if (value === undefined) return localStorage.getItem(key);
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, value);
		} catch (e) { /* storage blocked, OTA just stays off */ }
		return null;
	}

	function newer(a, b) {
		var x = String(a).split('.'), y = String(b).split('.');
		for (var i = 0; i < 3; i++) {
			var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
			if (d) return d > 0;
		}
		return false;
	}

	function req(r) {
		return new Promise(function (resolve, reject) {
			r.onsuccess = function () { resolve(r.result); };
			r.onerror = function () { reject(r.error); };
		});
	}

	function db() {
		if (!dbPromise) {
			var open = indexedDB.open('moonfin_ota', 1);
			open.onupgradeneeded = function () { open.result.createObjectStore('files'); };
			dbPromise = req(open);
		}
		return dbPromise;
	}

	function read(version, name) {
		return db().then(function (d) {
			return req(d.transaction('files', 'readonly').objectStore('files').get(version + '/' + name));
		}).then(function (text) {
			if (typeof text !== 'string') throw new Error('OTA file missing: ' + name);
			return text;
		});
	}

	// Resolves only once the transaction commits. A TV over its storage quota
	// rolls the write back after the request itself already succeeded.
	function write(work) {
		return db().then(function (d) {
			return new Promise(function (resolve, reject) {
				var tx = d.transaction('files', 'readwrite');
				work(tx.objectStore('files'));
				tx.oncomplete = function () { resolve(); };
				tx.onabort = tx.onerror = function () { reject(tx.error || new Error('IndexedDB write failed')); };
			});
		});
	}

	// Drops every stored file outside the version's own key prefix ('/' sorts right before '0').
	function keepOnly(version) {
		return write(function (s) {
			if (!version) return s.clear();
			s['delete'](IDBKeyRange.upperBound(version + '/', true));
			s['delete'](IDBKeyRange.lowerBound(version + '0'));
		});
	}

	function room(bytes) {
		return new Promise(function (resolve) {
			var t = navigator.webkitTemporaryStorage;
			if (!t || !bytes) return resolve(true);
			t.queryUsageAndQuota(function (used, quota) { resolve(quota - used > bytes * 1.2); }, function () { resolve(true); });
		});
	}

	// Deleting the database frees its space right away, which clear() doesn't on Chrome 38.
	function wipe() {
		var open = dbPromise;
		dbPromise = null;
		if (open) open.then(function (d) { d.close(); }, function () { /* never opened */ });
		try { indexedDB.deleteDatabase('moonfin_ota'); } catch (e) { /* nothing stored */ }
	}

	function bootLocal() {
		document.write('<link href="main.css" rel="stylesheet"/><script src="main.js"></script>');
		wipe();
	}

	// An open iframe document keeps the page loading until main.js has run, like
	// the bundled boot. webOS hides and suspends a page that loads blank, and on a
	// quick relaunch it can hide one whose main.js runs after load.
	function holdLoad() {
		var frame = document.createElement('iframe');
		frame.style.display = 'none';
		try {
			document.body.appendChild(frame);
			frame.contentDocument.open();
		} catch (e) { /* the page just loads without waiting */ }
		return function () {
			try { frame.contentDocument.close(); } catch (e) { /* already closed */ }
			if (frame.parentNode) frame.parentNode.removeChild(frame);
		};
	}

	function bootStored(version, tries) {
		ls(PENDING, version + ' ' + tries);
		var release = holdLoad();
		var root = document.getElementById('root');
		var poll = setInterval(function () {
			if (!root.firstChild) return;
			clearInterval(poll);
			ls(PENDING, null);
		}, 500);
		Promise.all([read(version, 'main.css'), read(version, 'main.js')]).then(function (files) {
			running = version;
			api.read = function (name) { return read(version, name); };
			var style = document.createElement('style');
			style.setAttribute('data-href', 'main.css');
			style.textContent = files[0];
			document.head.appendChild(style);
			var script = document.createElement('script');
			script.text = files[1];
			document.body.appendChild(script);
			release();
			keepOnly(version)['catch'](function () { /* tidied on a later launch */ });
		}, function (e) {
			window.console.warn('[OTA] stored ' + version + ' failed to load: ' + (e && (e.name + ' ' + e.message)));
			wipe();
			ls(READY, null);
			ls(PENDING, null);
			var link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'main.css';
			document.head.appendChild(link);
			var script = document.createElement('script');
			script.src = 'main.js';
			document.body.appendChild(script);
			release();
		});
	}

	function get(url, type, timeout, onProgress) {
		return new Promise(function (resolve, reject) {
			var x = new XMLHttpRequest();
			x.open('GET', url, true);
			x.responseType = type;
			x.timeout = timeout;
			if (onProgress) x.onprogress = function (e) { onProgress(e.loaded); };
			x.onload = function () {
				if (x.status === 200) resolve(x.response);
				else reject(new Error('HTTP ' + x.status + ' ' + url));
			};
			x.onerror = x.ontimeout = function () { reject(new Error('Network error ' + url)); };
			x.send();
		});
	}

	function hex(buf) {
		var bytes = new Uint8Array(buf), out = '';
		for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
		return out;
	}

	function fromBase64(b64) {
		var raw = atob(b64), out = new Uint8Array(raw.length);
		for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	function verify(manifest) {
		var subtle = window.crypto && window.crypto.subtle;
		if (!subtle) return Promise.reject(new Error('No WebCrypto'));
		var alg = {name: 'RSASSA-PKCS1-v1_5', hash: {name: 'SHA-256'}};
		return subtle.importKey('spki', fromBase64(C.key), alg, false, ['verify']).then(function (key) {
			return subtle.verify(alg, key, fromBase64(manifest.sig), new TextEncoder().encode(manifest.payload));
		}).then(function (ok) {
			if (!ok) throw new Error('Bad manifest signature');
			return JSON.parse(manifest.payload);
		});
	}

	function asset(version, ext) {
		return C.url + '/' + version + '/moonfin-ota-' + C.platform + ext;
	}

	function readyVersion() {
		var parts = (ls(READY) || '').split(' ');
		return parts[1] === C.shell ? parts[0] : null;
	}

	var api = {
		// The version the next launch boots, once a download has finished.
		ready: readyVersion,

		// Resolves the signed manifest of a release when this TV can take it, or
		// null when it can't, for example a release that needs a new package.
		check: function (version) {
			return get(asset(version, '.json'), 'text', 15000).then(function (text) {
				return verify(JSON.parse(text));
			}).then(function (m) {
				var current = readyVersion() || running || C.version;
				var usable = m.platform === C.platform && m.shell === C.shell && m.version === version &&
					newer(m.version, current) && m.version !== ls(BAD);
				return usable ? m : null;
			}, function (e) {
				window.console.warn('[OTA] ' + (e && e.message));
				return null;
			});
		},

		// Downloads and verifies the release, then stores it for the next launch.
		// onProgress gets the share done, from 0 to 1.
		download: function (m, onProgress) {
			return get(asset(m.version, '.bin'), 'arraybuffer', 600000, function (loaded) {
				if (onProgress) onProgress(Math.min(loaded / m.bytes, 1));
			}).then(function (buf) {
				return window.crypto.subtle.digest({name: 'SHA-256'}, buf).then(function (sum) {
					if (hex(sum) !== m.sha256) throw new Error('Update failed its integrity check');
					return room(m.bytes);
				}).then(function (fits) {
					ls(READY, null);
					// The app is behind the update dialog and restarts next, so a TV
					// without room for two copies can drop the running one first.
					if (fits) return keepOnly(running);
					wipe();
				}).then(function () {
					var decoder = new TextDecoder('utf-8');
					var offset = 0;
					return write(function (s) {
						m.files.forEach(function (file) {
							s.put(decoder.decode(new Uint8Array(buf, offset, file[1])), m.version + '/' + file[0]);
							offset += file[1];
						});
					});
				});
			}).then(function () {
				ls(READY, m.version + ' ' + m.shell);
			});
		}
	};
	window.__moonfinOta = api;

	// A package installed since the last launch replaces any stored update, so
	// sideloading an older release goes back to it.
	if (ls(INSTALLED) !== C.version) {
		ls(INSTALLED, C.version);
		ls(READY, null);
	}
	var ready = readyVersion();
	var pending = (ls(PENDING) || '').split(' ');
	var tries = ready && pending[0] === ready ? parseInt(pending[1], 10) || 1 : 0;
	if (tries >= 2) {
		// The last two launches of this version never drew anything, so stop using it.
		// One alone could be someone quitting before the first screen.
		ls(BAD, ready);
		ready = null;
	}
	ls(PENDING, null);
	if (ready && newer(ready, C.version) && window.indexedDB && window.Promise) {
		bootStored(ready, tries + 1);
	} else {
		ls(READY, null);
		bootLocal();
	}
}());
