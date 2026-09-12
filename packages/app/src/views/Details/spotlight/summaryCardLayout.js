// The band of summary cards has to fit under the hero without scrolling, because the detail
// screen never scrolls on a TV, so the cards are measured against the screen rather than
// given a fixed size.

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 120;
const HEIGHT_SHARE = 0.28;
const GAP = 16;
const WIDEST_RATIO = 16 / 9;

// Taller cards show more of the artwork through the scrim, so the band takes what height it
// can up to a ceiling.
export const summaryCardHeight = (viewportHeight) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, viewportHeight * HEIGHT_SHARE));

// The cards divide the band evenly, and none grows wider than landscape artwork needs.
export const summaryCardWidth = (bandWidth, count, height) => {
	if (count <= 0) return 0;
	const even = (bandWidth - (count - 1) * GAP) / count;
	return Math.max(0, Math.min(height * WIDEST_RATIO, even));
};

// The hero column, which the band matches so the two line up down the left edge.
export const heroWidth = (viewportWidth) => Math.min(1100, Math.max(450, viewportWidth * 0.85));
