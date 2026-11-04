import $L from '@enact/i18n/$L';

// Core's grid on its 1150 point TV canvas, drawn at 1920. Its poster sizes are portrait
// heights, the gaps leave room for a focused card to grow 12 percent when focus expansion is on,
// and the cells stretch to fill the width between the 60 point margins.
//
// Sandstone's grid takes one spacing for both directions and clips at its top edge, so each
// cell carries the focus growth and ring above its art, and half the extra column gap on each
// side. That puts Core's first row, gaps and clip edge back where Core has them.
const DP = 1920 / 1150;
const CORE_PORTRAIT = {small: 120, medium: 150, large: 180, extraLarge: 210};
const GRID_WIDTH = 1920 - 200;
const FOCUS_SCALE = 1.12;
const RING_OUTSET = 8;

export const browseGridMetrics = (posterSize, expansion = true) => {
	const cardWidth = (CORE_PORTRAIT[posterSize] || CORE_PORTRAIT.medium) * 2 / 3;
	const coreSpacing = expansion ? 12 + cardWidth * (FOCUS_SCALE - 1) / 2 : 12;
	const columns = Math.floor((1150 - 120 + coreSpacing) / (cardWidth + coreSpacing));
	const columnGap = Math.round(coreSpacing * DP);
	const ringRoom = Math.ceil(RING_OUTSET * FOCUS_SCALE);
	// Core's 16 point row gap less the ring's room, the rest of the gap being the growth.
	const spacing = Math.round(16 * DP) - ringRoom;
	const inset = (columnGap - spacing) / 2;
	const cellWidth = Math.floor((GRID_WIDTH - spacing * (columns - 1)) / columns);
	const artWidth = cellWidth - 2 * inset;
	const imageHeight = Math.round(artWidth * 1.5);
	const headroom = (expansion ? Math.round(imageHeight * (FOCUS_SCALE - 1)) : 0) + ringRoom;
	// The grid clips at its sides too, so a focused card in the first or last column would lose
	// its growth and ring. The grid reaches that much past the margins and every cell takes the
	// room back as inset, which leaves each column's art and pitch where they were.
	const growth = expansion ? Math.ceil(artWidth * (FOCUS_SCALE - 1) / 2) : 0;
	const room = Math.max(0, growth + ringRoom - inset);
	return {
		columns,
		spacing: spacing - 2 * room,
		inset: inset + room,
		edge: (1920 - GRID_WIDTH) / 2 - room,
		cellWidth: cellWidth + 2 * room,
		imageHeight,
		headroom,
		// Core's 20 point top padding less the room the first row already keeps.
		gridTop: Math.round(20 * DP) - ringRoom,
		// The spacing gave up the side room in both directions, so each cell gives it back below.
		cellHeight: headroom + imageHeight + Math.round(42 * DP) + 2 * room
	};
};

// The status words Core puts after the year and rating.
export const statusLabel = (status) => {
	if (status === 4 || status === 5) return $L('Available');
	if (status === 2 || status === 3) return $L('Requested');
	return null;
};

export const yearOf = (entry) => (entry.releaseDate || entry.firstAirDate || '').substring(0, 4);

export const cardSubtitle = (entry) => {
	const parts = [];
	const year = yearOf(entry);
	if (year.length === 4) parts.push(year);
	if (entry.voteAverage > 0) parts.push(`★ ${entry.voteAverage.toFixed(1)}`);
	const status = statusLabel(entry.mediaInfo?.status);
	if (status) parts.push(status);
	return parts.join('  ');
};

// Core's All, Available and Requested chips and its A to Z bar run over what has loaded.
export const matchesBrowseFilters = (entry, statusFilter, letter) => {
	const status = entry.mediaInfo?.status;
	if (status === 6) return false;
	if (statusFilter === 'available' && status !== 4 && status !== 5) return false;
	if (statusFilter === 'requested' && status !== 2 && status !== 3) return false;
	if (!letter) return true;
	const first = (entry.title || entry.name || '').trim().charAt(0).toUpperCase();
	if (!first) return false;
	return letter === '#' ? !/[A-Z]/.test(first) : first === letter;
};
