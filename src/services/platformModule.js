import {getPlatform} from '../platform';

// Loads the platform's version of a module. The bundler only splits out an import it can
// see, so every platform is spelled out rather than built from a name. A platform it
// doesn't know gets the webOS one, which runs in a plain browser.
const LOADERS = {
	storage: {
		tizen: () => import('@moonfin/platform-tizen/storage'),
		webos: () => import('@moonfin/platform-webos/storage'),
		vega: () => import('@moonfin/platform-vega/storage'),
		xbox: () => import('@moonfin/platform-xbox/storage')
	},
	video: {
		tizen: () => import('@moonfin/platform-tizen/video'),
		webos: () => import('@moonfin/platform-webos/video'),
		vega: () => import('@moonfin/platform-vega/video'),
		xbox: () => import('@moonfin/platform-xbox/video')
	},
	deviceProfile: {
		tizen: () => import('@moonfin/platform-tizen/deviceProfile'),
		webos: () => import('@moonfin/platform-webos/deviceProfile'),
		vega: () => import('@moonfin/platform-vega/deviceProfile'),
		xbox: () => import('@moonfin/platform-xbox/deviceProfile')
	},
	deviceInfo: {
		tizen: () => import('@moonfin/platform-tizen/deviceInfo'),
		webos: () => import('@moonfin/platform-webos/deviceInfo'),
		vega: () => import('@moonfin/platform-vega/deviceInfo'),
		xbox: () => import('@moonfin/platform-xbox/deviceInfo')
	},
	volume: {
		tizen: () => import('@moonfin/platform-tizen/volume'),
		webos: () => import('@moonfin/platform-webos/volume'),
		vega: () => import('@moonfin/platform-vega/volume'),
		xbox: () => import('@moonfin/platform-xbox/volume')
	},
	countryCode: {
		tizen: () => import('@moonfin/platform-tizen/countryCode'),
		webos: () => import('@moonfin/platform-webos/countryCode'),
		vega: () => import('@moonfin/platform-vega/countryCode'),
		xbox: () => import('@moonfin/platform-xbox/countryCode')
	}
};

export const resolvePlatformModule = (name) => {
	const loaders = LOADERS[name];
	if (!loaders) return Promise.reject(new Error(`No platform module named ${name}`));
	return (loaders[getPlatform()] || loaders.webos)();
};
