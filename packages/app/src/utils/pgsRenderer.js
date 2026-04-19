/**
 * PGS (Blu-ray bitmap subtitle) rendering utility.
 * initPgsRenderer (webOS) - attaches to <video>, auto-syncs via timeupdate.
 * initPgsCanvasRenderer (Tizen) - canvas only, call renderAtTimestamp() manually.
 */

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
