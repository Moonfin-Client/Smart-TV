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
