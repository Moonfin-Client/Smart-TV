// A row opens with about a screen of cards and grows as focus nears the end of what's mounted, so
// a long list is only built in full for somebody who walks through it. Without this every card in
// the row fetches and decodes its artwork at once.

const INITIAL_CARD_WINDOW = 10;
const CARD_WINDOW_STEP = 8;
// How near the last mounted card focus has to get before the next batch lands.
const CARD_WINDOW_EDGE = 2;

export const initialCardCount = (itemCount) =>
	Math.min(Math.max(itemCount || 0, 0), INITIAL_CARD_WINDOW);

export const expandedCardCount = (currentCount, focusedIndex, itemCount) => {
	const total = Math.max(itemCount || 0, 0);
	const current = Math.min(Math.max(currentCount || 0, 0), total);
	if (focusedIndex < current - CARD_WINDOW_EDGE) return current;
	return Math.min(total, current + CARD_WINDOW_STEP);
};
