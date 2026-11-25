// On Auto up to three secondary buttons stay on screen, and past that two do with the rest behind
// More. This isn't `countSplit` from utils/buttonLayout, since no argument to it gives three then
// two and other rows depend on it as it is.

const MAX_SECONDARY_WITHOUT_OVERFLOW = 3;
const VISIBLE_SECONDARY_WITH_OVERFLOW = 2;

export const splitNouveauActions = (secondaryActions, maxVisibleButtons = 0) => {
	const actions = Array.isArray(secondaryActions) ? secondaryActions : [];

	let needsOverflow;
	let visibleCount = VISIBLE_SECONDARY_WITH_OVERFLOW;

	if (maxVisibleButtons === -1) {
		needsOverflow = false;
	} else if (maxVisibleButtons >= 1) {
		// The count covers the primary button too, so the secondaries get one fewer than it inline,
		// and one fewer again where the More button has to take a place in the row as well.
		needsOverflow = actions.length > maxVisibleButtons - 1;
		visibleCount = Math.max(0, maxVisibleButtons - 2);
	} else {
		needsOverflow = actions.length > MAX_SECONDARY_WITHOUT_OVERFLOW;
	}

	if (!needsOverflow) {
		return {inline: actions, overflow: []};
	}

	return {
		inline: actions.slice(0, visibleCount),
		overflow: actions.slice(visibleCount)
	};
};
