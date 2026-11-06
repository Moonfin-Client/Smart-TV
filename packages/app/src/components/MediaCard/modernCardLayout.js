// The widths a modern home row card is laid out from.

// Grandparents stops at the Extra Large height here, since a modern row any
// taller no longer fits on the screen.
const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4, grandparents: 1.4};

// Only the My Media row answers to the setting. Live TV draws its Guide and
// Recordings tiles as collection folders too, and going by the item would
// restyle a row the setting says nothing about.
export const isStaticLibraryCard = (isLibraryRow, settings) =>
	isLibraryRow === true && settings?.modernCardsOnMyMediaRow !== true;

export const posterSizeScale = (posterSize) => POSTER_SIZE_MULTIPLIERS[posterSize] || 1;

// Core's Medium poster on TV, 120 points tall on its 1150 wide canvas, drawn at 1920.
const BASE_IMAGE_HEIGHT = 120 * 1920 / 1150;

// Worked out together because a tile held static sits at the width a card grows
// to on focus, which is what lines the row up with the ones around it.
export const modernCardMetrics = ({posterSize, isSquareItem, isStatic}) => {
	const height = BASE_IMAGE_HEIGHT * posterSizeScale(posterSize);
	const imageHeight = Math.round(height);
	const expandedWidth = Math.round(height * 16 / 9);
	const posterWidth = isSquareItem ? imageHeight : Math.round((height * 2) / 3);

	return {imageHeight, expandedWidth, cardWidth: isStatic ? expandedWidth : posterWidth};
};

// Room under a modern card's art for three lines of caption, its title and two lines below.
export const MODERN_CAPTION_ROOM = 89;

// The space below each modern row. The other clients size the padding slider in their own
// units, so the stored value lands here as a margin. Up to 420 it moves in smaller steps, so
// every stop changes the spacing, and even the lowest stop never reaches into the caption room
// of the row above. Full screen rows pace themselves.
export const modernRowSpacing = (settings) => {
	if (settings?.fullScreenRows) return null;
	const offset = Math.min(Math.max((settings?.modernHomeRowsPadding ?? 360) - 400, -40), 200);
	return offset < 20 ? Math.round((offset + 40) * 34 / 60) : Math.max(34, offset);
};

export const getEpisodeLabels = (item) => {
	if (!item) return null;
	if (item.Type === 'Episode') {
		if (!Number.isFinite(item.ParentIndexNumber) || !Number.isFinite(item.IndexNumber)) return null;
		const short = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
		return {
			short,
			full: item.SeriesName ? `${short} - ${item.Name}` : short
		};
	}
	if (item.Type === 'Season' && item.SeriesName) {
		return {
			short: item.Name,
			full: item.Name
		};
	}
	return null;
};

export const getCardDisplayTitle = (item) => {
	if (!item) return '';
	if (item.Type === 'Episode' || item.Type === 'Season') {
		return item.SeriesName || item.Name;
	}
	return item.Name;
};
