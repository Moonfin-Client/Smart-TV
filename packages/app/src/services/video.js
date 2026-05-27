import {getPlatform} from '../platform';

let impl;
let loadPromise = null;

const loadImpl = () => {
	if (impl) return Promise.resolve(impl);
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		if (getPlatform() === 'tizen') {
			impl = await import('@moonfin/platform-tizen/video');
		} else {
			impl = await import('@moonfin/platform-webos/video');
		}
		return impl;
	})();
	return loadPromise;
};

loadImpl();

export const initVideo = () => loadImpl();

export const getPlayMethod = (...args) => impl.getPlayMethod(...args);
export const getMimeType = (...args) => impl.getMimeType(...args);
export const findCompatibleAudioStreamIndex = (...args) => impl.findCompatibleAudioStreamIndex(...args);
export const getSupportedAudioCodecs = (...args) => impl.getSupportedAudioCodecs(...args);
export const isAudioStreamPlayable = (...args) => impl.isAudioStreamPlayable(...args);
export const setDisplayWindow = (...args) => impl.setDisplayWindow(...args);
export const registerAppStateObserver = (...args) => impl.registerAppStateObserver(...args);
export const keepScreenOn = (...args) => impl.keepScreenOn(...args);
export const getAudioOutputInfo = (...args) => impl.getAudioOutputInfo(...args);
export const cleanupVideoElement = (...args) => impl.cleanupVideoElement(...args);
export const setupVisibilityHandler = (...args) => impl.setupVisibilityHandler(...args);

export const setupPlatformLifecycle = (...args) => {
	if (getPlatform() === 'tizen') {
		return impl.setupTizenLifecycle?.(...args) || (() => {});
	}
	return impl.setupWebOSLifecycle?.(...args) || (() => {});
};
