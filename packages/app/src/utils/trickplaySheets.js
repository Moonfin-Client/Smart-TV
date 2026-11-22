// Where a moment's trickplay thumbnail sits on the server's sprite sheets, and which sheets the
// next scrub steps will need. `info` is one width's entry from an item's Trickplay manifest.

// Scrubbing carries on the way it started, so the run ahead is the longer.
const STEPS_AHEAD = 6;
const STEPS_BEHIND = 2;

// The sheet and the crop within it for a position, or null past the last thumbnail.
export const trickplayTile = (info, positionMs) => {
	if (!info || !(info.Interval > 0) || !isFinite(positionMs)) return null;
	const thumbnailIndex = Math.floor(positionMs / info.Interval);
	if (thumbnailIndex < 0 || thumbnailIndex >= info.ThumbnailCount) return null;
	const tilesPerSheet = info.TileWidth * info.TileHeight;
	const indexInSheet = thumbnailIndex % tilesPerSheet;
	return {
		imageIndex: Math.floor(thumbnailIndex / tilesPerSheet),
		x: (indexInSheet % info.TileWidth) * info.Width,
		y: Math.floor(indexInSheet / info.TileWidth) * info.Height,
		width: info.Width,
		height: info.Height,
		sheetWidth: info.Width * info.TileWidth,
		sheetHeight: info.Height * info.TileHeight
	};
};

// The sheets the next few scrub steps land on, from where the scrub is now, so they're already
// loaded when it gets there. A set, since neighboring steps usually share a sheet.
export const planSeekSheetIndexes = ({info, positionMs, durationMs, stepMs, forward}) => {
	if (!info || !(durationMs > 0)) return [];
	const lastMs = durationMs - 1;
	const step = Math.max(1, stepMs || 0);
	const indexes = [];
	const sheetAt = (ms) => {
		// A runtime a little past the last thumbnail still wants the last sheet.
		const tile = trickplayTile(info, Math.min(lastMs, Math.max(0, ms), (info.ThumbnailCount - 1) * info.Interval));
		return tile ? tile.imageIndex : -1;
	};
	const addSheet = (index) => {
		if (index >= 0 && indexes.indexOf(index) < 0) indexes.push(index);
	};
	const add = (offsetMs) => addSheet(sheetAt(positionMs + offsetMs));
	add(0);
	for (let i = 1; i <= STEPS_AHEAD; i++) add(i * (forward ? step : -step));
	for (let i = 1; i <= STEPS_BEHIND; i++) add(i * (forward ? -step : step));
	// A held key crosses a whole sheet faster than the steps look ahead, so the next sheet is asked
	// for as soon as the scrub enters one.
	const current = sheetAt(positionMs);
	if (info.TileWidth * info.TileHeight > 1 && current >= 0) {
		const next = current + (forward ? 1 : -1);
		if (next <= sheetAt(lastMs)) addSheet(next);
	}
	return indexes;
};
