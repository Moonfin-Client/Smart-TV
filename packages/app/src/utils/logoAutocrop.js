// Jellyfin's "Logo" images vary wildly in how much transparent padding studios
// bake around the wordmark, so laying every logo out in a shared fixed-height
// box makes some read much bigger than others. This trims each logo down to
// its opaque bounds (plus a little breathing room) so they land at a
// consistent visual size inside that box.

const ALPHA_THRESHOLD = 16;
const CROP_PADDING_RATIO = 0.06;

// The bounds are read off a copy the server scales down, since only the shape of the ink matters and this
// runs just as playback is starting.
const SCAN_WIDTH = 240;

// A set left on the screensaver walks the library, so only the last few logos are kept.
const CACHE_LIMIT = 16;

const cache = new Map();

const remember = (key, value) => {
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
	cache.set(key, value);
	return value;
};

// The crossOrigin request is what keeps getImageData from throwing on a canvas
// tainted by the artwork.
const loadImage = (src, crossOrigin) =>
	new Promise((resolve, reject) => {
		const img = document.createElement('img');
		if (crossOrigin) img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

// Jellyfin and Emby scale an image to the maxWidth asked for. Any other url is scanned as it is.
const scanUrlFor = (url) => url.replace(/([?&]maxWidth=)\d+/, `$1${SCAN_WIDTH}`);

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

const opaqueBoundsOf = (img) => {
	const scale = Math.min(1, SCAN_WIDTH / img.naturalWidth);
	const width = Math.max(1, Math.round(img.naturalWidth * scale));
	const height = Math.max(1, Math.round(img.naturalHeight * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(img, 0, 0, width, height);
	const bounds = findOpaqueBounds(ctx.getImageData(0, 0, width, height).data, width, height);
	return bounds && {bounds, width, height};
};

// A transparent stand-in with the trimmed logo's own size, so whatever sizes the img sizes it as it would
// the trimmed image.
const sizerUrl = (width, height) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`)}`;

/**
 * The trimmed logo for ink `bounds` found on a `width` by `height` scan of a logo whose full size is
 * `fullWidth` by `fullHeight`: the url to show, the trimmed aspect ratio and a style for the img. The img
 * shows a transparent stand-in the trimmed size and draws the logo as its background, scaled and shifted
 * so the margin falls outside the box.
 */
export const trimmedLogo = (logoUrl, bounds, width, height, fullWidth, fullHeight) => {
	// Each edge widens to cover the whole scan pixel that produced it, so a faint outer stroke isn't cut off.
	// The left edge stays flush with the ink, so the logo lines up with the plain-text title below it. Top
	// and bottom get a little room.
	const left = bounds.minX / width;
	const across = (bounds.maxX + 1) / width - left;
	const inkTop = bounds.minY / height;
	const inkHeight = (bounds.maxY + 1) / height - inkTop;
	const pad = inkHeight * CROP_PADDING_RATIO;
	const top = inkTop - pad;
	const down = inkHeight + pad * 2;

	const trimmedWidth = Math.max(1, Math.round(across * fullWidth));
	const trimmedHeight = Math.max(1, Math.round(down * fullHeight));
	// A background percentage lines up that fraction of the image with the same fraction of the box.
	const at = (offset, size) => (size === 1 ? 0 : (offset / (1 - size)) * 100);
	return {
		url: sizerUrl(trimmedWidth, trimmedHeight),
		aspectRatio: trimmedWidth / trimmedHeight,
		style: {
			backgroundImage: `url("${logoUrl}")`,
			backgroundRepeat: 'no-repeat',
			backgroundSize: `${100 / across}% ${100 / down}%`,
			backgroundPosition: `${at(left, across)}% ${at(top, down)}%`
		}
	};
};

// Falls back to the untouched url (and a null aspectRatio) whenever the trim can't be worked out: no image,
// a server that doesn't allow the cross origin read, or a fully transparent bitmap.
export const autocropLogoUrl = (logoUrl) => {
	if (!logoUrl) return Promise.resolve(null);
	if (cache.has(logoUrl)) return cache.get(logoUrl);

	const promise = (async () => {
		try {
			const scanUrl = scanUrlFor(logoUrl);
			const [scan, full] = await Promise.all([loadImage(scanUrl, true), scanUrl === logoUrl ? null : loadImage(logoUrl, false)]);
			const {naturalWidth: fullWidth, naturalHeight: fullHeight} = full || scan;
			if (!scan.naturalWidth || !scan.naturalHeight || !fullWidth || !fullHeight) return {url: logoUrl, aspectRatio: null};
			const found = opaqueBoundsOf(scan);
			if (!found) return {url: logoUrl, aspectRatio: null};
			return trimmedLogo(logoUrl, found.bounds, found.width, found.height, fullWidth, fullHeight);
		} catch {
			return {url: logoUrl, aspectRatio: null};
		}
	})();

	return remember(logoUrl, promise);
};
