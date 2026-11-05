import {classicCardSize} from '../../components/MediaCard/MediaCard';
import {modernCardMetrics} from '../../components/MediaCard/modernCardLayout';

// From a row's top to the top of its cards, the title line plus the space under it, as
// MediaRow.module.less and ModernMediaRow.module.less lay them out.
const CLASSIC_CARDS_TOP = 69;
const MODERN_CARDS_TOP = 50;

// Per library rows share one override under the id that gates them. Overrides are a classic
// rows feature, the modern layout keeps its own arrangement untouched.
export const rowImageType = (row, settings) => {
	const key = row.isLatestRow ? 'latest-media'
		: row.isRecentlyReleasedRow ? 'recently-released' : row.id;
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
