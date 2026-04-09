/**
 * ASS/SSA subtitle rendering via SubtitlesOctopus (libass-wasm).
 * Two modes, mirrors pgsRenderer.js:
 *   initAssRenderer (webOS) - auto-syncs to <video> element
 *   initAssCanvasRenderer (Tizen) - manual setCurrentTime() on a canvas
 */

// Worker files use ES6 arrows (Chrome 45+) and `let` in sloppy mode (Chrome 49+).
// createImageBitmap (Chrome 50+) is a convenient proxy that excludes
// webOS 2/3 and Tizen 2.4/3.0; those fall back to plain text.
export const supportsAssRenderer = () => typeof createImageBitmap === 'function';

const createRenderer = async (options, onError) => {
	try {
		const mod = await import('libass-wasm');
		const SubtitlesOctopus = mod.default || mod;

		return new SubtitlesOctopus({
			...options,
			workerUrl: '/subtitles-octopus-worker.js',
			legacyWorkerUrl: '/subtitles-octopus-worker-legacy.js',
			onError: onError || null,
			renderMode: 'wasm-blend',
			targetFps: 24,
			debug: false
		});
	} catch (err) {
		console.error('[AssRenderer] Failed to initialize', err);
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
