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
