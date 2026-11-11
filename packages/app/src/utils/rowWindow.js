// A row opens with about a screen of cards and grows as focus nears the end of what is mounted, so
// a long list is only built in full for somebody who walks through it. Rows far from the one in
// focus are not mounted at all.
//
// This matters more than it looks on the oldest sets. The usual ways of deferring offscreen work,
// content-visibility and lazy image loading, both arrived long after the browsers these TVs ship
// with, so without windowing every card on the page fetches and decodes its artwork at once.

export const INITIAL_CARD_WINDOW = 10;
export const CARD_WINDOW_STEP = 8;
// How near the last mounted card focus has to get before the next batch lands.
export const CARD_WINDOW_EDGE = 2;
export const ROW_WINDOW_RADIUS = 1;

export const shouldMountRow = (rowIndex, activeRowIndex) =>
	Math.abs(rowIndex - activeRowIndex) <= ROW_WINDOW_RADIUS;

// A row that opens partway along mounts as far as its first card and a batch past it.
export const initialCardCount = (itemCount, startIndex = 0) =>
	Math.min(Math.max(itemCount || 0, 0), Math.max(INITIAL_CARD_WINDOW, (startIndex || 0) + 1 + CARD_WINDOW_STEP));

export const expandedCardCount = (currentCount, focusedIndex, itemCount) => {
	const total = Math.max(itemCount || 0, 0);
	const current = Math.min(Math.max(currentCount || 0, 0), total);
	if (focusedIndex < current - CARD_WINDOW_EDGE) return current;
	return Math.min(total, current + CARD_WINDOW_STEP);
};
