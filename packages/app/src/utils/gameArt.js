// Display helpers for retro games. Thumbnail art comes from
// gamesApi.gameThumbUrl.

// Strips the extension from a filename.
export const thumbName = (fileName) => {
	if (!fileName) return '';
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(0, dot) : fileName;
};

// A safe display title: strip the replacement char and control bytes some ROM folder names
// carry, falling back to the filename without extension when nothing legible remains.
export const gameDisplayTitle = (title, fileName) => {
	// eslint-disable-next-line no-control-regex
	const cleaned = (title || '').replace(/�/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
	return cleaned || thumbName(fileName);
};

// Stable, pleasant fallback color for poster placeholders when no thumbnail resolves.
export const gameFallbackColor = (seed) => {
	let hash = 0;
	const s = seed || '';
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) & 0x7fffffff;
	}
	return `hsl(${hash % 360}, 45%, 26%)`;
};
