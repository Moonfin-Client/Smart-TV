import {getPlatform} from '../platform';

// Loads the platform's version of a module. Webpack splits each import it can see
// into its own chunk, so every platform is spelled out rather than built from a
// name. A packaged build that can't tell where it runs, as in a desktop browser,
// gets the webOS one.
const LOADERS = {
	storage: {
		tizen: () => import('@moonfin/platform-tizen/storage'),
		webos: () => import('@moonfin/platform-webos/storage'),
		vega: () => import('@moonfin/platform-vega/storage'),
		xbox: () => import('@moonfin/platform-xbox/storage'),
		titan: () => import('@moonfin/platform-titan/storage'),
		web: () => import('@moonfin/platform-web/storage')
	},
	video: {
		tizen: () => import('@moonfin/platform-tizen/video'),
		webos: () => import('@moonfin/platform-webos/video'),
		vega: () => import('@moonfin/platform-vega/video'),
		xbox: () => import('@moonfin/platform-xbox/video'),
		titan: () => import('@moonfin/platform-titan/video'),
		web: () => import('@moonfin/platform-web/video')
	},
	deviceProfile: {
		tizen: () => import('@moonfin/platform-tizen/deviceProfile'),
		webos: () => import('@moonfin/platform-webos/deviceProfile'),
		vega: () => import('@moonfin/platform-vega/deviceProfile'),
		xbox: () => import('@moonfin/platform-xbox/deviceProfile'),
		titan: () => import('@moonfin/platform-titan/deviceProfile'),
		web: () => import('@moonfin/platform-web/deviceProfile')
	},
	deviceInfo: {
		tizen: () => import('@moonfin/platform-tizen/deviceInfo'),
		webos: () => import('@moonfin/platform-webos/deviceInfo'),
		vega: () => import('@moonfin/platform-vega/deviceInfo'),
		xbox: () => import('@moonfin/platform-xbox/deviceInfo'),
		titan: () => import('@moonfin/platform-titan/deviceInfo'),
		web: () => import('@moonfin/platform-web/deviceInfo')
	},
	volume: {
		tizen: () => import('@moonfin/platform-tizen/volume'),
		webos: () => import('@moonfin/platform-webos/volume'),
		vega: () => import('@moonfin/platform-vega/volume'),
		xbox: () => import('@moonfin/platform-xbox/volume'),
		titan: () => import('@moonfin/platform-titan/volume'),
		web: () => import('@moonfin/platform-web/volume')
	},
	countryCode: {
		tizen: () => import('@moonfin/platform-tizen/countryCode'),
		webos: () => import('@moonfin/platform-webos/countryCode'),
		vega: () => import('@moonfin/platform-vega/countryCode'),
		xbox: () => import('@moonfin/platform-xbox/countryCode'),
		titan: () => import('@moonfin/platform-titan/countryCode'),
		web: () => import('@moonfin/platform-web/countryCode')
	}
};

export const resolvePlatformModule = (name) => {
	const loaders = LOADERS[name];
	if (!loaders) return Promise.reject(new Error(`No platform module named ${name}`));
	return (loaders[getPlatform()] || loaders.webos)();
};
