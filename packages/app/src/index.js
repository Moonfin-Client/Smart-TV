/* global ENACT_PACK_ISOMORPHIC, Element, NodeList */
import 'whatwg-fetch';

// NodeList.forEach polyfill for Tizen 2.4 WebKit (missing from babel-preset-enact's core-js exclusions)
if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
	NodeList.prototype.forEach = Array.prototype.forEach;
}

import {createRoot, hydrateRoot} from 'react-dom/client';

import App from './App';
import {isTizen} from './platform';
import {registerKeys, ESSENTIAL_KEY_NAMES} from './utils/keys';

// Polyfill Element.prototype.scrollTo for older webOS/Tizen browsers
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
	Element.prototype.scrollTo = function (options) {
		if (typeof options === 'object') {
			this.scrollLeft = options.left !== undefined ? options.left : this.scrollLeft;
			this.scrollTop = options.top !== undefined ? options.top : this.scrollTop;
		} else if (arguments.length >= 2) {
			this.scrollLeft = arguments[0];
			this.scrollTop = arguments[1];
		}
	};
}

// Polyfill: Slider knob positioning for browsers without CSS custom properties
// (e.g. Tizen 2.4 / WebKit r152340). No-op on modern browsers.
(function () {
	if (typeof window === 'undefined') return;
	if (window.CSS && window.CSS.supports && window.CSS.supports('--a', '0')) return;

	function patchSliderKnobs () {
		var sliders = document.querySelectorAll('[class*="slider"]');
		for (var i = 0; i < sliders.length; i++) {
			var el = sliders[i];
			var style = el.getAttribute('style');
			if (!style) continue;

			var match = style.match(/--slider-knob-pct:\s*([^;]+)/);
			if (match) {
				var pct = match[1].trim();
				var knob = el.querySelector('[class*="knob"]');
				if (knob) {
					if (el.className.indexOf('vertical') !== -1) {
						knob.style.bottom = pct;
					} else {
						knob.style.left = pct;
					}
				}
			}
		}
	}

	var rafId;
	function schedulePatch () {
		if (rafId) return;
		rafId = window.requestAnimationFrame(function () {
			rafId = null;
			patchSliderKnobs();
			schedulePatch();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', schedulePatch);
	} else {
		schedulePatch();
	}
})();

if (isTizen()) {
	registerKeys(ESSENTIAL_KEY_NAMES);
}

const appElement = (<App />);

if (typeof window !== 'undefined') {
	if (ENACT_PACK_ISOMORPHIC) {
		hydrateRoot(document.getElementById('root'), appElement);
	} else {
		createRoot(document.getElementById('root')).render(appElement);
	}
}

export default appElement;
