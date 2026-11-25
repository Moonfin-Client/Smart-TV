// PGS (Blu-ray bitmap subtitle) rendering through libpgs, drawn to a canvas.

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
