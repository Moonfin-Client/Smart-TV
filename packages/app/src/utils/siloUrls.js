// Artwork on a Silo server. Silo has no image address that can be built from an item id: each picture comes signed,
// inside the item that shows it. The mapper records every one here as it maps an item, under the item, the image type
// and its index, and tags it with a hash of its address. An image is then found by its tag, or by the item and type.

const siloServers = new Set();
const images = {};
const byTag = {};
const MAX_IMAGES = 20000;
let count = 0;

export const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

export const registerSiloServer = (serverUrl) => {
	if (serverUrl) siloServers.add(trimSlash(serverUrl));
};

export const isSiloServer = (serverUrl) => Boolean(serverUrl) && siloServers.has(trimSlash(serverUrl));

// FNV-1a, twice with different seeds, for a short tag that stays the same for the same picture.
const hash = (text, seed) => {
	let h = seed >>> 0;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return ('0000000' + h.toString(16)).slice(-8);
};

// Tagged by the address without its signature, so a re-signed picture keeps its tag.
export const siloImageTag = (url) => {
	const plain = String(url).split(/[?#]/)[0];
	return hash(plain, 2166136261) + hash(plain, 3141592653);
};

export const resolveSiloUrl = (url, baseUrl) => {
	const trimmed = typeof url === 'string' ? url.trim() : '';
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (trimmed.startsWith('//')) return `${(/^(https?):/i.exec(baseUrl || '') || [null, 'https'])[1]}:${trimmed}`;
	const base = trimSlash(baseUrl);
	return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`;
};

const keyOf = (serverUrl, itemId, type, index = 0) => `${trimSlash(serverUrl)}|${itemId}|${type}|${index}`;

// Records a picture of `itemId` and answers its tag, or null when there's no picture.
export const registerSiloImage = (serverUrl, itemId, type, url, index = 0) => {
	const resolved = resolveSiloUrl(url, serverUrl);
	if (!resolved || itemId == null) return null;
	const tag = siloImageTag(url.trim());
	const key = keyOf(serverUrl, itemId, type, index);
	if (!images[key]) count++;
	images[key] = {url: resolved, tag};
	byTag[tag] = resolved;
	// A very long session forgets everything rather than grow without end; pictures come back with their items.
	if (count > MAX_IMAGES) clearSiloImages();
	return tag;
};

export const siloImageFor = (serverUrl, itemId, type, index = 0) => images[keyOf(serverUrl, itemId, type, index)] || null;

export const siloImageTagFor = (serverUrl, itemId, type, index = 0) => siloImageFor(serverUrl, itemId, type, index)?.tag || null;

export function clearSiloImages () {
	Object.keys(images).forEach((key) => delete images[key]);
	Object.keys(byTag).forEach((key) => delete byTag[key]);
	count = 0;
}

// Silo sizes a picture when the item is read (`image_size`), and a signed address can't be resized, so the size
// options are ignored. A tag the caller holds wins over the item and type: it names the exact picture.
export const siloImageUrl = (serverUrl, itemId, imageType = 'Primary', options = {}) => {
	if (options.tag && byTag[options.tag]) return byTag[options.tag];
	if (!itemId) return null;
	return siloImageFor(serverUrl, itemId, imageType, options.index || 0)?.url || null;
};
