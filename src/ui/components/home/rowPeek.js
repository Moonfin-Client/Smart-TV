import {modernCardMetrics} from './modernCardLayout.js';

const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4, grandparents: 2};
const BASE_SIZES = {portrait: [240, 360], landscape: [384, 216], square: [240, 240], banner: [1168, 216]};

// How big a card of each shape draws, grown or shrunk by the poster size setting.
export const classicCardSize = (shape, posterSize) => {
	const multiplier = POSTER_SIZE_MULTIPLIERS[posterSize] || 1;
	const [width, height] = BASE_SIZES[shape];
	return {width: Math.round(width * multiplier), height: Math.round(height * multiplier)};
};

// From a row's top to the top of its cards: the title line plus the space under it.
const CLASSIC_CARDS_TOP = 69;
const MODERN_CARDS_TOP = 50;

// The id a row's image type is set under. Per library rows share the one id that gates them.
export const imageTypeRowId = (row) => (row.isLatestRow ? 'latest-media'
	: row.isRecentlyReleasedRow ? 'recently-released' : row.id);

// Overrides are a classic rows feature, the modern layout keeps its own arrangement untouched.
export const rowImageType = (row, settings) => {
	const key = imageTypeRowId(row);
	const overrides = settings.homeRowsStyle === 'v1' ? (settings.homeRowImageTypes || {}) : {};
	// Continue Watching merged with Next Up is set under the two rows it's made of, Continue Watching first.
	const override = key === 'continue-nextup' ? (overrides.resume || overrides.nextup) : overrides[key];
	return override || settings.homeRowsImageType;
};

// The shape a classic card asks for. Any artwork other than a poster draws wide.
export const classicShape = (cardType, imageType) => {
	if (cardType === 'square' || cardType === 'circle') return 'square';
	if (imageType === 'banner') return 'banner';
	return cardType === 'landscape' || (imageType && imageType !== 'poster') ? 'landscape' : 'portrait';
};

// How much of the first row shows along the bottom of the media bar, in design pixels: its
// title and the top half of its cards. Zero when the setting is off or the bar has no peek.
export const rowPeekHeight = (settings, row) => {
	if (!settings.mediaBarRowPeek || !row || settings.featuredBarStyle === 'banner' || settings.featuredBarStyle === 'off') return 0;
	if (settings.homeRowsStyle !== 'v1') {
		return MODERN_CARDS_TOP + modernCardMetrics({posterSize: settings.homeRowsPosterSize}).imageHeight / 2;
	}
	const {height} = classicCardSize(classicShape(row.type, rowImageType(row, settings)), settings.homeRowsPosterSize);
	return CLASSIC_CARDS_TOP + height / 2;
};

