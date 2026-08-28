// A row opens with about a screen of cards and grows as focus nears the end of
// what is mounted, so a long result set is only built in full for someone who
// walks through it.
export const INITIAL_CARD_WINDOW = 10;
export const CARD_WINDOW_STEP = 8;
// How near the last mounted card focus has to get before the next batch lands.
export const CARD_WINDOW_EDGE = 2;
export const ROW_WINDOW_RADIUS = 1;

export const shouldMountSearchRow = (rowIndex, activeRowIndex) =>
	Math.abs(rowIndex - activeRowIndex) <= ROW_WINDOW_RADIUS;

export const initialCardCount = (itemCount) =>
	Math.min(Math.max(itemCount || 0, 0), INITIAL_CARD_WINDOW);

export const expandedCardCount = (currentCount, focusedIndex, itemCount) => {
	const total = Math.max(itemCount || 0, 0);
	const current = Math.min(Math.max(currentCount || 0, 0), total);
	if (focusedIndex < current - CARD_WINDOW_EDGE) return current;
	return Math.min(total, current + CARD_WINDOW_STEP);
};

export const searchArtworkOptions = (aspect, tag) => {
	const options = aspect === 'poster' ? {maxHeight: 300} : {maxWidth: 400};
	options.quality = 80;
	if (tag) options.tag = tag;
	return options;
};
