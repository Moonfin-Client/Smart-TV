// Jellyfin's "Logo" images vary wildly in how much transparent padding studios
// bake around the wordmark, so laying every logo out in a shared fixed-height
// box makes some read much bigger than others. This trims each logo down to
// its opaque bounds (plus a little breathing room) so they land at a
// consistent visual size inside that box.

const ALPHA_THRESHOLD = 16;
const CROP_PADDING_RATIO = 0.06;

const cache = new Map();

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

const findOpaqueBounds = (data, width, height) => {
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

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return logoUrl;
			ctx.drawImage(img, 0, 0);
			const {data} = ctx.getImageData(0, 0, width, height);

			const bounds = findOpaqueBounds(data, width, height);
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

	cache.set(logoUrl, promise);
	return promise;
};
