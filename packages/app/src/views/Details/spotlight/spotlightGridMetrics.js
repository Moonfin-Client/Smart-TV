// Cards grow to this when they take focus. It is set in CSS, at the .card:focus rule in
// components/MediaCard/MediaCard.module.less, and repeated here because the gap between
// cells has to leave room for the growth and stylesheets cant do that arithmetic.
const FOCUS_SCALE = 1.05;

// Half the width a card gains on focus, which is what each side of it needs to stay clear.
// Wide artwork grows by the same fraction of a much larger number, so a gap that suits a
// poster does not suit a banner, and the extent is passed in rather than assumed.
export const focusGap = (extent, minimum = 12) => Math.max(minimum, extent * (FOCUS_SCALE - 1) / 2);

// Column count and cell size for one modal grid. Cells aim for `desiredWidth`, the column
// count is held inside `minColumns` to `maxColumns`, and a cell never grows past
// `maxCellWidth`.
//
// The gaps are measured twice on purpose. The first pass sizes cells at the minimum gap, the
// gap is then worked out from that width, and the cells are measured again against it.
export const spotlightGridMetrics = ({
	maxWidth,
	desiredWidth,
	minColumns,
	maxColumns,
	minSpacing = 12,
	minRunSpacing = 16,
	aspectRatio = 2 / 3,
	focusExpansion = false,
	maxCellWidth = Infinity
}) => {
	const fit = Math.floor((maxWidth + minSpacing) / (desiredWidth + minSpacing));
	const columns = Math.min(Math.max(fit, minColumns), maxColumns);

	const cellWidthWith = (gap) => Math.min(
		Math.max(Math.floor((maxWidth - gap * (columns - 1)) / columns), 0),
		maxCellWidth
	);

	const spacing = focusExpansion ? focusGap(cellWidthWith(minSpacing), minSpacing) : minSpacing;
	const cellWidth = cellWidthWith(spacing);
	const runSpacing = focusExpansion ? focusGap(cellWidth / aspectRatio, minRunSpacing) : minRunSpacing;

	return {columns, cellWidth, spacing, runSpacing};
};
