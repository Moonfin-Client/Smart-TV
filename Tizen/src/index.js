/* global ENACT_PACK_ISOMORPHIC, Element */
import {createRoot, hydrateRoot} from 'react-dom/client';

import App from './App';
import {registerKeys, ESSENTIAL_KEY_NAMES} from './utils/tizenKeys';

// Polyfill Element.prototype.scrollTo for older Tizen browsers
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

// Initialize Tizen key registration
if (typeof window !== 'undefined') {
	// Register TV remote keys when Tizen APIs are ready
	if (typeof tizen !== 'undefined') {
		registerKeys(ESSENTIAL_KEY_NAMES);
	} else {
		// Wait for tizen APIs to load
		window.addEventListener('load', () => {
			if (typeof tizen !== 'undefined') {
				registerKeys(ESSENTIAL_KEY_NAMES);
			}
		});
	}
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
