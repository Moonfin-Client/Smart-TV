/**
 * Boot-critical polyfills for legacy smart TVs.
 * MUST be the very first import in index.js so these are in place before
 * @enact/core or any other library module executes.
 */

/* global self, NodeList, HTMLCollection, Element */
/* eslint-disable no-var */

// @enact/core/platform references globalThis directly without a typeof guard.
// Missing on Tizen 2.4 (WebKit r152340), webOS 3–5 (Chromium <71).
if (typeof globalThis === 'undefined') {
	if (typeof self !== 'undefined') {
		self.globalThis = self;
	} else if (typeof window !== 'undefined') {
		window.globalThis = window;
	}
}

// Array.from polyfill — Chrome 38 (webOS 3) does not have Array.from (added in
// Chrome 45). Babel helpers and @enact/spotlight use it to convert Sets, Maps,
// and NodeLists to arrays.
if (!Array.from) {
	Array.from = function (arrayLike, mapFn, thisArg) {
		if (arrayLike == null) {
			throw new TypeError('Array.from requires an array-like object');
		}
		if (typeof Symbol !== 'undefined' && arrayLike[Symbol.iterator]) {
			var result = [];
			var iter = arrayLike[Symbol.iterator]();
			var step;
			while (!(step = iter.next()).done) {
				result.push(mapFn ? mapFn.call(thisArg, step.value, result.length) : step.value);
			}
			return result;
		}
		var len = arrayLike.length >>> 0;
		var arr = new Array(len);
		for (var i = 0; i < len; i++) {
			arr[i] = mapFn ? mapFn.call(thisArg, arrayLike[i], i) : arrayLike[i];
		}
		return arr;
	};
}

// Symbol.iterator polyfill for DOM collection types.
// Chrome 38 has Symbol but NodeList/HTMLCollection lack Symbol.iterator,
// causing Babel's _iterableToArray helper (used for [...spread]) to fail.
if (typeof Symbol !== 'undefined' && Symbol.iterator) {
	if (typeof NodeList !== 'undefined' && !NodeList.prototype[Symbol.iterator]) {
		NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
	}
	if (typeof HTMLCollection !== 'undefined' && !HTMLCollection.prototype[Symbol.iterator]) {
		HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
	}
}

// Enact Spotlight calls nodeList.forEach(); babel-preset-enact excludes the
// core-js polyfill for web.dom-collections.for-each.
if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
	NodeList.prototype.forEach = Array.prototype.forEach;
}

// Element.prototype.matches — prefixed as webkitMatchesSelector before Chrome 33.
if (typeof Element !== 'undefined' && !Element.prototype.matches) {
	Element.prototype.matches =
		Element.prototype.webkitMatchesSelector ||
		Element.prototype.msMatchesSelector;
}

// Element.prototype.closest — added in Chrome 41, missing on webOS 3 (Chrome 38).
// Used extensively by @enact/spotlight and our detail/browse views for DOM
// traversal in focus-management and click/key handlers.
if (typeof Element !== 'undefined' && !Element.prototype.closest) {
	Element.prototype.closest = function (selector) {
		var el = this;
		while (el && el.nodeType === 1) {
			if (el.matches(selector)) {
				return el;
			}
			el = el.parentElement || el.parentNode;
		}
		return null;
	};
}

// AbortController polyfill for webOS 2 (Chrome ~38) and other legacy browsers.
if (typeof AbortController === 'undefined') {
	var AbortSignalPolyfill = function () {
		this.aborted = false;
		this._listeners = [];
	};
	AbortSignalPolyfill.prototype.addEventListener = function (type, fn) {
		if (type === 'abort') this._listeners.push(fn);
	};
	AbortSignalPolyfill.prototype.removeEventListener = function (type, fn) {
		if (type === 'abort') {
			this._listeners = this._listeners.filter(function (l) { return l !== fn; });
		}
	};
	AbortSignalPolyfill.prototype._emit = function () {
		this.aborted = true;
		for (var i = 0; i < this._listeners.length; i++) {
			try { this._listeners[i](); } catch (e) { /* ignore */ }
		}
	};

	var AbortControllerPolyfill = function () {
		this.signal = new AbortSignalPolyfill();
	};
	AbortControllerPolyfill.prototype.abort = function () {
		this.signal._emit();
	};

	if (typeof self !== 'undefined') {
		self.AbortController = AbortControllerPolyfill;
		self.AbortSignal = AbortSignalPolyfill;
	} else if (typeof window !== 'undefined') {
		window.AbortController = AbortControllerPolyfill;
		window.AbortSignal = AbortSignalPolyfill;
	}
}

// Add 'legacy' class on Tizen 2.4 / webOS 2.x for CSS layout workarounds
if (typeof document !== 'undefined') {
	var ua = navigator.userAgent || '';
	var isLegacyTizen = /Tizen [12]\./i.test(ua);
	var chromeMatch = ua.match(/Chrome\/(\d+)/);
	var isLegacyWebOS = (/Web0S|webOS/).test(ua) && (!chromeMatch || parseInt(chromeMatch[1], 10) < 38);
	if (isLegacyTizen || isLegacyWebOS) {
		document.documentElement.className = (document.documentElement.className ? document.documentElement.className + ' ' : '') + 'legacy';
	}
}
