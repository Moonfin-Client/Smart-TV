/**
 * ASS/SSA subtitle rendering via SubtitlesOctopus (libass-wasm).
 * Two modes, mirrors pgsRenderer.js:
 *   initAssRenderer (webOS) - auto-syncs to <video> element
 *   initAssCanvasRenderer (Tizen) - manual setCurrentTime() on a canvas
 */

import {parseSubtitleText} from './subtitleText';

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

const supportsWasmBlend = () => {
	const chromiumMajor = getChromiumMajorVersion();
	if (chromiumMajor && chromiumMajor >= 57) return true;
	return false;
};

const createRenderer = async (options, onError) => {
	try {
		const mod = await import('libass-wasm');
		const SubtitlesOctopus = mod.default || mod;
		const workerUrl = 'subtitles-octopus-worker.js';
		const qualityOptions = supportsWasmBlend()
			? { targetFps: 24, renderMode: 'wasm-blend', prescaleFactor: 0.8, maxRenderHeight: 2160}
			: { targetFps: 10, renderMode: 'js-blend', prescaleFactor: 0.5, maxRenderHeight: 540};

		return new SubtitlesOctopus({
			...options,
			workerUrl,
			legacyWorkerUrl: workerUrl.replace('worker.js', 'worker-legacy.js'),
			fallbackFont: 'ass-fallback-font.ttf',
			onError: onError || null,
			...qualityOptions,
			debug: false
		});
	} catch (err) {
		console.error('[AssRenderer] Failed to initialize:', err);
		return null;
	}
};

export const initAssRenderer = async (videoElement, subtitleUrl, fontsUrl, onError) => {
	if (!videoElement || !subtitleUrl) return null;
	return createRenderer({video: videoElement, subUrl: subtitleUrl, fonts: fontsUrl}, onError);
};

// The script each renderer started from, so a size change can hand it over again and the offset
// timeline can list its lines.
const tracks = new WeakMap();
let fontScale = 1;

/**
 * Multiplies a script's style sizes and its \fs tags by [scale], the way libass's font scale does.
 * Outlines, shadows and positions stay as authored, and a scale of 1 hands the script back
 * untouched.
 */
export const scaleAssFontSizes = (script, scale) => {
	if (!script || scale === 1 || !(scale > 0)) return script;
	const size = (value) => String(Math.round(parseFloat(value) * scale * 100) / 100);
	let column = 2;
	return script.replace(/^(Format|Style|Dialogue):(.*)$/gm, (line, kind, rest) => {
		if (kind === 'Format') {
			const at = rest.split(',').map((field) => field.trim().toLowerCase()).indexOf('fontsize');
			if (at >= 0) column = at;
			return line;
		}
		if (kind === 'Style') {
			const fields = rest.split(',');
			if (fields.length > column) fields[column] = fields[column].replace(/\d+(?:\.\d+)?/, size);
			return `Style:${fields.join(',')}`;
		}
		return line.replace(/\{[^}]*\}/g, (block) => block.replace(/\\fs(\d+(?:\.\d+)?)/g, (tag, value) => `\\fs${size(value)}`));
	});
};

// The subtitle size as a multiple of the default, which the next track starts at and the one on
// screen is drawn again at.
export const setAssFontScale = (renderer, scale) => {
	fontScale = scale;
	const track = tracks.get(renderer);
	if (!track || track.scale === scale || !renderer.setTrack) return;
	track.scale = scale;
	renderer.setTrack(scaleAssFontSizes(track.script, scale));
};

const fetchScript = async (url) => {
	try {
		const response = await window.fetch(url);
		return response.ok ? await response.text() : null;
	} catch (err) {
		return null;
	}
};

export const initAssCanvasRenderer = async (canvasElement, subtitleUrl, fontsUrl, onError) => {
	if (!canvasElement || !subtitleUrl) return null;
	canvasElement.width = window.innerWidth || canvasElement.clientWidth || 1920;
	canvasElement.height = window.innerHeight || canvasElement.clientHeight || 1080;
	// Read here rather than in the worker so it can be scaled and listed. If it can't be, the
	// worker tries the URL itself, as it always did.
	const script = await fetchScript(subtitleUrl);
	if (script === null) return createRenderer({canvas: canvasElement, subUrl: subtitleUrl, fonts: fontsUrl}, onError);
	const scale = fontScale;
	const renderer = await createRenderer({canvas: canvasElement, subContent: scaleAssFontSizes(script, scale), fonts: fontsUrl}, onError);
	if (renderer) {
		tracks.set(renderer, {script, scale});
		// The size may have changed while the renderer was starting.
		setAssFontScale(renderer, fontScale);
	}
	return renderer;
};

// The track's lines as timed events for the subtitle offset timeline, read once per track.
export const assTimelineEvents = (renderer) => {
	const track = tracks.get(renderer);
	if (!track) return null;
	if (!track.events) track.events = parseSubtitleText(track.script);
	return track.events;
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

export const clearAssCanvas = (canvas) => {
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
};
