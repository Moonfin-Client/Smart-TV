export const parseAspectRatioValue = (value) => {
	if (!value) return null;
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
	if (typeof value !== 'string') return null;

	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.includes(':')) {
		const [w, h] = trimmed.split(':').map(Number);
		if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
			return w / h;
		}
		return null;
	}

	const parsed = Number(trimmed);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getVideoDisplayAspectRatio = (mediaSource) => {
	const videoStream = mediaSource?.MediaStreams?.find((s) => s.Type === 'Video');
	if (!videoStream) return null;

	const declaredAspect =
		parseAspectRatioValue(videoStream.AspectRatio) ||
		parseAspectRatioValue(videoStream.DisplayAspectRatio);
	if (declaredAspect) return declaredAspect;

	const width = Number(videoStream.Width);
	const height = Number(videoStream.Height);
	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		return width / height;
	}

	return null;
};

export const getZoomDisplayRect = (screenRect, aspectRatio, zoomMode) => {
	const screenWidth = Math.max(1, Number(screenRect?.width) || 1920);
	const screenHeight = Math.max(1, Number(screenRect?.height) || 1080);
	const screenAspect = screenWidth / screenHeight;
	const targetAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : screenAspect;

	// Zoom to Fill covers the screen too, since its source is cut down to the screen's shape.
	if (zoomMode === 'stretch' || zoomMode === 'fill') {
		return {x: 0, y: 0, width: screenWidth, height: screenHeight};
	}

	let width;
	let height;

	if (targetAspect > screenAspect) {
		width = screenWidth;
		height = Math.round(width / targetAspect);
	} else {
		height = screenHeight;
		width = Math.round(height * targetAspect);
	}

	const x = Math.round((screenWidth - width) / 2);
	const y = Math.round((screenHeight - height) / 2);
	return {x, y, width, height};
};