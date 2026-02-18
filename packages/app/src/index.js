/* global ENACT_PACK_ISOMORPHIC, Element */
import {createRoot, hydrateRoot} from 'react-dom/client';

import App from './App';
import reportWebVitals from './reportWebVitals';

// Polyfill Element.prototype.scrollTo for older webOS browsers
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

const appElement = (<App />);

if (typeof window !== 'undefined') {
	if (ENACT_PACK_ISOMORPHIC) {
		hydrateRoot(document.getElementById('root'), appElement);
	} else {
		createRoot(document.getElementById('root')).render(appElement);
	}
}

export default appElement;

reportWebVitals();
