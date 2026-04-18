/**
 * ASS/SSA subtitle rendering via SubtitlesOctopus (libass-wasm).
 * Two modes, mirrors pgsRenderer.js:
 *   initAssRenderer (webOS) - auto-syncs to <video> element
 *   initAssCanvasRenderer (Tizen) - manual setCurrentTime() on a canvas
 */

// Worker files use ES6 arrows (Chrome 45+) and `let` in sloppy mode (Chrome 49+).
// Gate support on actual worker/runtime capability instead of createImageBitmap.
const getChromiumMajorVersion = () => {
	const ua = navigator.userAgent || '';
	const match = ua.match(/(?:Chrome|Chromium)\/(\d+)/i);
	return match ? parseInt(match[1], 10) : null;
};


export const supportsAssRenderer = () => {
	const chromiumMajor = getChromiumMajorVersion();
	if (typeof Worker !== 'function') return false;
	if (typeof Promise === 'undefined') return false;
	if (typeof Uint8Array === 'undefined') return false;
	if (chromiumMajor && chromiumMajor < 49) return false;
	return true;
};

const createRenderer = async (options, onError) => {
	try {
		const mod = await import('libass-wasm');
		const SubtitlesOctopus = mod.default || mod;
		const workerUrl = 'subtitles-octopus-worker.js';

		return new SubtitlesOctopus({
			...options,
			workerUrl,
			legacyWorkerUrl: workerUrl.replace('worker.js', 'worker-legacy.js'),
			fallbackFont: 'ass-fallback-font.ttf',
			onError: onError || null,
			targetFps: 10,
			renderMode: 'js-blend',
			prescaleFactor: 0.5,
			maxRenderHeight: 540,
			debug: false
		});
	} catch (err) {
		console.error('[AssRenderer] Failed to initialize:', err);
		return null;
	}
};

export const initAssRenderer = async (videoElement, subtitleUrl, onError) => {
	if (!videoElement || !subtitleUrl) return null;
	return createRenderer({video: videoElement, subUrl: subtitleUrl}, onError);
};

export const initAssCanvasRenderer = async (canvasElement, subtitleUrl, onError) => {
	if (!canvasElement || !subtitleUrl) return null;
	canvasElement.width = window.innerWidth || canvasElement.clientWidth || 1920;
	canvasElement.height = window.innerHeight || canvasElement.clientHeight || 1080;
	return createRenderer({canvas: canvasElement, subUrl: subtitleUrl}, onError);
};

export const disposeAssRenderer = (renderer) => {
	if (renderer?.dispose) {
		try {
			renderer.dispose();
		} catch (err) {
			console.warn('[AssRenderer] Error disposing', err);
		}
	}
};

export const setAssTime = (renderer, currentTimeSeconds) => {
	if (renderer?.setCurrentTime) {
		renderer.setCurrentTime(Math.max(0, currentTimeSeconds));
	}
};
