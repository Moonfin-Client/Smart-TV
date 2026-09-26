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
export const canRenderEmbeddedPgsInBand = (...args) => impl.canRenderEmbeddedPgsInBand(...args);
export const findCompatibleAudioStreamIndex = (...args) => impl.findCompatibleAudioStreamIndex(...args);
export const getSupportedAudioCodecs = (...args) => impl.getSupportedAudioCodecs(...args);
export const isAudioStreamPlayable = (...args) => impl.isAudioStreamPlayable(...args);
export const setDisplayWindow = (...args) => impl.setDisplayWindow(...args);
export const registerAppStateObserver = (...args) => impl.registerAppStateObserver(...args);
export const keepScreenOn = (...args) => impl.keepScreenOn(...args);
export const getAudioOutputInfo = (...args) => impl.getAudioOutputInfo(...args);
export const cleanupVideoElement = (...args) => impl.cleanupVideoElement(...args);
export const setupVisibilityHandler = (...args) => impl.setupVisibilityHandler(...args);

// Asked for before the platform module has loaded, so a caller that tears down first is
// caught by the flag rather than by a remover for a handler that never went on.
export const setupPlatformLifecycle = (onRelaunch) => {
	let remove;
	let cancelled = false;

	loadImpl().then((loaded) => {
		if (cancelled) return;
		const setup = getPlatform() === 'tizen' ? loaded.setupTizenLifecycle : loaded.setupWebOSLifecycle;
		remove = setup?.(onRelaunch);
	}).catch(() => {});

	return () => {
		cancelled = true;
		remove?.();
	};
};
