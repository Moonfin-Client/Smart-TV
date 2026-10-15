// The band of summary cards maintains a fixed 16:9 landscape aspect ratio and
// scrolls horizontally like a home row under the hero.

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 120;
const HEIGHT_SHARE = 0.28;
const CARD_RATIO = 16 / 9;

// Taller cards show more of the artwork through the scrim, so the band takes what height it
// can up to a ceiling.
export const summaryCardHeight = (viewportHeight) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, viewportHeight * HEIGHT_SHARE));

export const summaryCardWidth = (height) => Math.round(height * CARD_RATIO);

export const heroWidth = (viewportWidth) => Math.min(1100, Math.max(450, viewportWidth * 0.85));
