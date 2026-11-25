/* global webapis */
import {detectTizenVersion} from './deviceProfile';

let cached = null;

export const getDeviceInfo = () => {
	if (cached) return cached;

	cached = {
		platform: 'Tizen',
		appVersion: process.env.REACT_APP_VERSION || '0.0.0',
		userAgent: navigator.userAgent || 'Unknown',
		screenSize: `${window.screen.width}x${window.screen.height}`,
		tvVersion: 'Unknown',
		modelName: 'Unknown'
	};

	try {
		cached.tvVersion = detectTizenVersion().toFixed(1);
		if (typeof webapis !== 'undefined' && webapis.productinfo) {
			if (typeof webapis.productinfo.getModel === 'function') {
				cached.modelName = webapis.productinfo.getModel() || 'Unknown';
			}
		}
	} catch {
		// Tizen API not available
	}

	return cached;
};
