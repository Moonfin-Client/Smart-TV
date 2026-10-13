// Where focus sits among a screen's rows.
//
// Spotlight only remembers the card a row was left on while that row stays mounted, so
// coming back to a screen that rebuilt its rows lands on the start of one. Noting where
// the card sat is what lets the row be re-entered where it was left.

const rowCards = (spotlightId) => {
	if (typeof document === 'undefined' || !spotlightId) return null;
	const row = document.querySelector(`[data-spotlight-id="${spotlightId}"]`);
	return row ? row.querySelectorAll('.spottable') : null;
};

export const focusedCardIndex = (spotlightId, active) => {
	if (!active) return -1;
	const cards = rowCards(spotlightId);
	return cards ? Array.prototype.indexOf.call(cards, active) : -1;
};

// The index is checked before the row is looked for, so moving about a screen that has
// nothing to restore costs nothing. A row holding fewer cards than it did brings back
// the last one it has rather than nothing at all.
export const cardToRestore = (spotlightId, index) => {
	if (typeof index !== 'number' || !(index >= 0)) return null;
	const cards = rowCards(spotlightId);
	if (!cards || cards.length === 0) return null;
	return cards[Math.min(index, cards.length - 1)];
};

// Which row holds focus, counting anything outside the rows as the top. Rows rest at an
// offset of their own, so the row is what says where the list is rather than the scroll
// position.
export const focusedRowIndex = (active) => {
	const wrapper = active?.closest?.('[data-row-index]');
	const index = wrapper ? Number(wrapper.getAttribute('data-row-index')) : 0;
	return index > 0 ? index : 0;
};

// A placeholder holds a loading row's place but has nothing to focus, so moving between rows
// steps over it. The first row with cards from [from] in the direction of [step], or -1.
export const nextFocusableRow = (rows, from, step) => {
	for (let i = from; i >= 0 && i < rows.length; i += step) {
		if (!rows[i].isPlaceholder) return i;
	}
	return -1;
};

// The remembered row is on its way back and has not filled yet.
export const ROW_STILL_LOADING = 'row-still-loading';

// Where to land on a screen whose rows were rebuilt. The rows come back in waves and settle in
// a different order each time, so the remembered row is looked up by its id rather than by
// where it sat. A row that is back but still a placeholder is worth waiting for: landing on
// its neighbour meanwhile would leave focus there once it fills. Only a row that is gone for
// good falls back to the nearest row with cards, above first.
export const rowToRestore = (rows, remembered) => {
	if (!remembered) return null;
	const {rowId, rowIndex, cardIndex} = remembered;
	const byId = rowId ? rows.findIndex((row) => row.id === rowId) : -1;
	if (byId >= 0) {
		return rows[byId].isPlaceholder ? ROW_STILL_LOADING : {rowIndex: byId, cardIndex};
	}
	if (typeof rowIndex !== 'number' || rowIndex < 0 || rows.length === 0) return null;
	const nearest = Math.min(rowIndex, rows.length - 1);
	const above = nextFocusableRow(rows, nearest, -1);
	const target = above >= 0 ? above : nextFocusableRow(rows, nearest, 1);
	return target >= 0 ? {rowIndex: target, cardIndex} : null;
};
