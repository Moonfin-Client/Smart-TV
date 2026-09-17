// Jellyfin's "Logo" images vary wildly in how much transparent padding studios
// bake around the wordmark, so laying every logo out in a shared fixed-height
// box makes some read much bigger than others. This trims each logo down to
// its opaque bounds (plus a little breathing room) so they land at a
// consistent visual size inside that box.

const ALPHA_THRESHOLD = 16;
const CROP_PADDING_RATIO = 0.06;

// The bounds only say where to cut, and the cut lands in the same place whether they were read
// off the full image or a small copy of it. Reading the full one means pulling every pixel back
// out of the canvas, which is the slow part and happens just as playback is starting.
const SCAN_WIDTH = 240;

// Every entry holds a whole logo as a data url, and a set left on the screensaver walks the
// library. Without a ceiling each logo it passes would sit in memory until the app closes.
const CACHE_LIMIT = 16;

const cache = new Map();

const remember = (key, value) => {
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
	cache.set(key, value);
	return value;
};

// The crossOrigin request is what keeps getImageData from throwing on a canvas
// tainted by the artwork.
const loadImage = (src) =>
	new Promise((resolve, reject) => {
		const img = document.createElement('img');
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

export const findOpaqueBounds = (data, width, height) => {
	let minX = width, minY = height, maxX = -1, maxY = -1;
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width * 4;
		for (let x = 0; x < width; x++) {
			if (data[rowOffset + x * 4 + 3] > ALPHA_THRESHOLD) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	return maxX >= minX && maxY >= minY ? {minX, minY, maxX, maxY} : null;
};

// Reads the ink bounds off a scaled down copy and maps them back onto the source. One scan pixel
// covers several real ones, so each edge widens to cover the whole pixel that produced it, which
// keeps a faint outer stroke from being cut off.
const opaqueBoundsOf = (img, width, height) => {
	const scale = Math.min(1, SCAN_WIDTH / width);
	const scanWidth = Math.max(1, Math.round(width * scale));
	const scanHeight = Math.max(1, Math.round(height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = scanWidth;
	canvas.height = scanHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(img, 0, 0, scanWidth, scanHeight);

	const {data} = ctx.getImageData(0, 0, scanWidth, scanHeight);
	const bounds = findOpaqueBounds(data, scanWidth, scanHeight);
	if (!bounds) return null;

	return {
		minX: Math.max(0, Math.floor(bounds.minX / scale)),
		minY: Math.max(0, Math.floor(bounds.minY / scale)),
		maxX: Math.min(width - 1, Math.ceil((bounds.maxX + 1) / scale)),
		maxY: Math.min(height - 1, Math.ceil((bounds.maxY + 1) / scale))
	};
};

// Falls back to the untouched URL whenever the crop can't be computed - no
// image, a server that doesn't allow the cross origin read, or a fully
// transparent bitmap.
export const autocropLogoUrl = (logoUrl) => {
	if (!logoUrl) return Promise.resolve(null);
	if (cache.has(logoUrl)) return cache.get(logoUrl);

	const promise = (async () => {
		try {
			const img = await loadImage(logoUrl);
			const {naturalWidth: width, naturalHeight: height} = img;
			if (!width || !height) return logoUrl;

			const bounds = opaqueBoundsOf(img, width, height);
			if (!bounds) return logoUrl;

			const trimmedWidth = bounds.maxX - bounds.minX + 1;
			const trimmedHeight = bounds.maxY - bounds.minY + 1;
			const padY = Math.round(trimmedHeight * CROP_PADDING_RATIO);

			// The left edge stays flush with the ink (no horizontal pad) so the
			// logo lines up with the plain-text title below it, which starts at
			// the same x position - padding both sides would offset the logo's
			// visible content to the right of that text.
			const outCanvas = document.createElement('canvas');
			outCanvas.width = trimmedWidth;
			outCanvas.height = trimmedHeight + padY * 2;
			const outCtx = outCanvas.getContext('2d');
			if (!outCtx) return logoUrl;
			outCtx.drawImage(
				img,
				bounds.minX, bounds.minY, trimmedWidth, trimmedHeight,
				0, padY, trimmedWidth, trimmedHeight
			);

			return outCanvas.toDataURL('image/png');
		} catch {
			return logoUrl;
		}
	})();

	return remember(logoUrl, promise);
};
