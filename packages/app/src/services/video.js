import {getPlatform} from '../platform';
import {resolvePlatformModule} from './platformModule';

let impl;
let loadPromise = null;

const loadImpl = () => {
	if (impl) return Promise.resolve(impl);
	if (loadPromise) return loadPromise;
	loadPromise = resolvePlatformModule('video').then((loaded) => {
		impl = loaded;
		return impl;
	});
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
export const waitForDecoderRelease = (...args) => impl.waitForDecoderRelease(...args);
export const getSharedVideoElement = (...args) => impl.getSharedVideoElement(...args);
export const leavesPlayerInBackground = () => !!impl.leavesPlayerInBackground;
export const resumesAfterFirstFrame = (mediaSource) => !!impl.resumesAfterFirstFrame?.(mediaSource);
export const notePlaybackError = (...args) => impl?.notePlaybackError?.(...args);
// A platform whose own player can open a file more than one way, told what is about to play,
// and what that player then does with the sound
export const chooseHostReader = (...args) => impl?.chooseHostReader?.(...args);
// A platform whose page cant read YouTube's manifests has its host read them
export const readTrailerManifest = (url) => (impl?.readTrailerManifest ? impl.readTrailerManifest(url) : Promise.resolve(null));
export const getHostAudioOutput = async () => (impl?.getHostAudioOutput ? impl.getHostAudioOutput() : null);
// The HDR mode a platform's own player put the display in for what is playing
export const getHostDisplay = () => impl?.getHostDisplay?.() || null;
// A platform whose own player draws a bitmap subtitle format the page cant, and the call
// that picks the track by stream index, with -1 for none.
export const rendersSubtitleInHost = (codec) => !!impl?.rendersSubtitleInHost?.(codec);
export const showHostSubtitle = (video, index) => !!impl?.showHostSubtitle?.(video, index);
export const controllerIsOnlyRemote = () => !!impl?.controllerIsOnlyRemote;

// Only Xbox hands the page its controller as keys as well, which a game reading the
// controller itself would get twice.
export const giveControllerToGame = (given) => impl?.giveControllerToGame?.(given);

// Only webOS has a service bridge to bring up before the player can use it.
export const initPlayerPlatform = () => (impl.initLunaAPI ? impl.initLunaAPI() : Promise.resolve(false));

const LIFECYCLE_SETUP = {tizen: 'setupTizenLifecycle', webos: 'setupWebOSLifecycle', vega: 'setupVegaLifecycle', xbox: 'setupXboxLifecycle'};

// Asked for before the platform module has loaded, so a caller that tears down first is
// caught by the flag rather than by a remover for a handler that never went on.
export const setupPlatformLifecycle = (onRelaunch) => {
	let remove;
	let cancelled = false;

	loadImpl().then((loaded) => {
		if (cancelled) return;
		const setup = LIFECYCLE_SETUP[getPlatform()];
		remove = setup && loaded[setup]?.(onRelaunch);
	}).catch(() => {});

	return () => {
		cancelled = true;
		remove?.();
	};
};
