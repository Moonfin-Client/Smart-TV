/**
 * PGS (Blu-ray bitmap subtitle) rendering utility.
 * initPgsRenderer (webOS) - attaches to <video>, auto-syncs via timeupdate.
 * initPgsInBandRenderer (webOS) - same, but the .sup bytes are pulled out of the
 *   container the player is streaming instead of being fetched as an extracted file.
 * initPgsCanvasRenderer (Tizen) - canvas only, call renderAtTimestamp() manually.
 */

import {createInBandPgsSource} from './mkvPgsSource';

let streamUrlCounter = 0;

const installStreamFetch = (url, readable) => {
	const original = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const requested = typeof input === 'string' ? input : input?.url;
		if (requested === url) {
			return Promise.resolve(new Response(readable, {headers: {'Content-Type': 'application/octet-stream'}}));
		}
		return original(input, init);
	};
	return () => {
		globalThis.fetch = original;
	};
};

class InBandPgsRenderer {
	constructor(renderer, source) {
		this.renderer = renderer;
		this.source = source;
	}

	get timeOffset() {
		return this.renderer.timeOffset;
	}

	set timeOffset(value) {
		this.renderer.timeOffset = value;
	}

	renderAtTimestamp(time) {
		this.renderer.renderAtTimestamp(time);
	}

	/** True when a seek back left libpgs holding timestamps that no longer ascend. */
	needsRestart(time) {
		return this.source.needsRestart(time);
	}

	dispose() {
		this.source.dispose();
		this.renderer.dispose();
	}
}

export const initPgsRenderer = async (videoElement, subtitleStream) => {
	if (!subtitleStream?.deliveryUrl) return null;

	try {
		const {PgsRenderer} = await import('libpgs');
		return new PgsRenderer({
			workerUrl: 'libpgs.worker.js',
			video: videoElement,
			subUrl: subtitleStream.deliveryUrl
		});
	} catch (err) {
		console.error('[PgsRenderer] Failed to initialize', err);
		return null;
	}
};

/**
 * Render PGS straight out of the container. libpgs loads a subtitle by url and streams
 * whatever the response delivers, so the bytes are handed to it through a fetch that
 * answers for a url nobody else can ask for, and the .sup framing is produced near the
 * playhead by the in band source.
 */
export const initPgsInBandRenderer = async (videoElement, subtitleStream, options = {}) => {
	if (!subtitleStream?.inBand || !videoElement) return null;

	try {
		const source = createInBandPgsSource({
			streamUrl: subtitleStream.inBand.streamUrl,
			subtitleOrdinal: subtitleStream.inBand.ordinal,
			getTime: () => videoElement.currentTime,
			startTime: options.startTime ?? videoElement.currentTime
		});
		if (!source || !(await source.ready)) {
			source?.dispose();
			console.warn('[PgsRenderer] In-band PGS source unavailable');
			return null;
		}

		const {PgsRenderer} = await import('libpgs');
		const url = `moonfin-inband-pgs://${++streamUrlCounter}`;
		const restore = installStreamFetch(url, source.readable);
		let renderer;
		try {
			renderer = new PgsRenderer({
				workerUrl: 'libpgs.worker.js',
				video: videoElement,
				subUrl: url,
				mode: 'mainThread'
			});
		} finally {
			restore();
		}
		return new InBandPgsRenderer(renderer, source);
	} catch (err) {
		console.error('[PgsRenderer] Failed to initialize in band PGS', err);
		return null;
	}
};

export const initPgsCanvasRenderer = async (canvasElement, subtitleStream) => {
	if (!subtitleStream?.deliveryUrl || !canvasElement) return null;

	try {
		const {PgsRenderer} = await import('libpgs');
		return new PgsRenderer({
			canvas: canvasElement,
			subUrl: subtitleStream.deliveryUrl,
			mode: 'mainThread'
		});
	} catch (err) {
		console.error('[PgsRenderer] Failed to initialize canvas renderer', err);
		return null;
	}
};

export const disposePgsRenderer = (renderer) => {
	if (renderer?.dispose) {
		try {
			renderer.dispose();
		} catch (err) {
			console.warn('[PgsRenderer] Error disposing renderer', err);
		}
	}
};

export const clearPgsCanvas = (canvas) => {
	if (canvas) {
		const ctx = canvas.getContext('2d');
		if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
};
