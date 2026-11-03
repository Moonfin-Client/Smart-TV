// The widths a modern home row card is laid out from.

// Grandparents stops at the Extra Large height here, since a modern row any
// taller no longer fits on the screen.
const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4, grandparents: 1.4};

// Only the My Media row answers to the setting. Live TV draws its Guide and
// Recordings tiles as collection folders too, and going by the item would
// restyle a row the setting says nothing about.
export const isStaticLibraryCard = (isLibraryRow, settings) =>
	isLibraryRow === true && settings?.modernCardsOnMyMediaRow !== true;

// Worked out together because a tile held static sits at the width a card grows
// to on focus, which is what lines the row up with the ones around it.
export const modernCardMetrics = ({posterSize, platform, isSquareItem, isStatic}) => {
	const imageHeight = Math.round(360 * (POSTER_SIZE_MULTIPLIERS[posterSize] || 1));
	const expandedWidth = Math.round(imageHeight * (platform === 'tizen' ? 16 / 9 : 1.65));
	const posterWidth = isSquareItem ? imageHeight : Math.round((imageHeight * 2) / 3);

	return {imageHeight, expandedWidth, cardWidth: isStatic ? expandedWidth : posterWidth};
};

// The space below each modern row. The other clients size the padding slider in their own
// units, so the stored value lands here as a margin. Below the default it pulls the next row
// closer in smaller steps, so every stop changes the spacing and the lowest still clears the
// captions of the row above. Full screen rows pace themselves.
export const modernRowSpacing = (settings) => {
	if (settings?.fullScreenRows) return null;
	const offset = Math.min(Math.max((settings?.modernHomeRowsPadding ?? 360) - 400, -40), 200);
	return offset < 20 ? Math.round((offset - 20) * 34 / 60) : Math.max(0, offset - 34);
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
