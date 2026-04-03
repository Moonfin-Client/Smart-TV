/**
 * PGS (Blu-ray bitmap subtitle) rendering utility
 */

export const initPgsRenderer = async (videoElement, subtitleStream, config = {}) => {
	if (!subtitleStream?.deliveryUrl) return null;

	try {
		const {PgsRenderer} = await import('libpgs');

		const renderer = new PgsRenderer({
			workerUrl: '/libpgs.worker.js',
			video: videoElement,
			subUrl: subtitleStream.deliveryUrl,
			displaySettings: {
				scale: config.scale || 1.0,
				opacity: config.opacity !== undefined ? config.opacity / 100 : 1.0,
				bottomPadding: config.bottomPadding || 0
			}
		});

		return renderer;
	} catch (err) {
		console.error('[PgsRenderer] Failed to initialize', err);
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

/**
 * Low-level PGS parser for manual rendering (e.g., Tizen AVPlay context)
 */
export const initPgsParser = async (subtitleStream) => {
	if (!subtitleStream?.deliveryUrl) return null;

	try {
		const {PgsParser, initWasm} = await import('libpgs');
		if (typeof initWasm === 'function') {
			await initWasm();
		}

		const response = await fetch(subtitleStream.deliveryUrl);
		if (!response.ok) throw new Error(`Failed to fetch PGS data: ${response.status}`);

		const arrayBuffer = await response.arrayBuffer();
		const parser = new PgsParser();
		parser.load(new Uint8Array(arrayBuffer));

		return parser;
	} catch (err) {
		console.error('[PgsParser] Failed to initialize', err);
		return null;
	}
};

export const disposePgsParser = (parser) => {
	if (parser?.dispose) {
		try {
			parser.dispose();
		} catch (err) {
			console.warn('[PgsParser] Error disposing parser', err);
		}
	}
};

/**
 * Render a PGS frame to canvas using low-level parser
 * Returns true if frame was rendered, false if no subtitle at current time
 */
export const renderPgsFrame = (canvas, parser, currentTimeSeconds) => {
	if (!canvas || !parser) return false;

	try {
		const targetWidth = window.innerWidth || canvas.clientWidth || canvas.width;
		const targetHeight = window.innerHeight || canvas.clientHeight || canvas.height;
		if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
			canvas.width = targetWidth;
			canvas.height = targetHeight;
		}

		const frame = parser.renderAtTimestamp(currentTimeSeconds);
		if (!frame) {
			clearPgsCanvas(canvas);
			return false;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return false;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (frame.compositionData && Array.isArray(frame.compositionData)) {
			for (const composition of frame.compositionData) {
				if (composition.pixelData) {
					ctx.putImageData(composition.pixelData, composition.x || 0, composition.y || 0);
				}
			}
		}

		return true;
	} catch (err) {
		console.error('[PgsRenderer] Failed to render frame', err);
		return false;
	}
};

export const clearPgsCanvas = (canvas) => {
	if (canvas) {
		const ctx = canvas.getContext('2d');
		if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
};
