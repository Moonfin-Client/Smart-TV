// Where the scrub preview sits and how big it is, from the viewer's trickplay settings. The
// player and the settings preview both draw from this, so they can't drift apart.

// The seek bar's thumb, which the preview lines up with when it follows the scrub.
const SEEK_THUMB_RADIUS = 10.5;
// Room the player's own overlays take above the bar at rest.
export const VERTICAL_TRAVEL_TOP_MARGIN = 120;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const isTrickplayOn = (settings) => settings.trickPlayMode !== 'disabled';

const trackXForPosition = ({positionMs, durationMs, trackWidth}) => {
	const fraction = durationMs > 0 ? clamp(positionMs / durationMs, 0, 1) : 0;
	return SEEK_THUMB_RADIUS + fraction * Math.max(trackWidth - 2 * SEEK_THUMB_RADIUS, 0);
};

const resolveSingleLeft = ({positionMs, durationMs, trackWidth, tileWidth, followScrub}) => {
	if (!followScrub) return (trackWidth - tileWidth) / 2;
	const thumbX = trackXForPosition({positionMs, durationMs, trackWidth});
	return clamp(thumbX - tileWidth / 2, 0, Math.max(0, trackWidth - tileWidth));
};

// How many tiles fit either side of the main one, with one more past the last that fits so
// the strip runs off the track rather than stopping short of it.
const resolveStrip = ({mainTileLeft, trackWidth, tileWidth, spacing, maxSlotsPerSide = 500, overflowMargin = 0}) => {
	const step = tileWidth + spacing;
	if (step <= 0) return {leftCount: 0, rightCount: 0, leftOffset: mainTileLeft};
	const leftCount = clamp(Math.floor((mainTileLeft + overflowMargin) / step) + 1, 0, maxSlotsPerSide);
	const rightCount = clamp(Math.floor((trackWidth + overflowMargin - mainTileLeft - tileWidth) / step) + 1, 0, maxSlotsPerSide);
	return {leftCount, rightCount, leftOffset: mainTileLeft - leftCount * step};
};

const resolveVerticalTravelMax = ({rawMaxTravel, trackWidth}) => Math.max(Math.min(rawMaxTravel, trackWidth), 0);

const resolveVerticalTravel = (verticalPositionPercent, maxTravel) => (clamp(verticalPositionPercent, 0, 100) / 100) * Math.max(maxTravel, 0);

// 10% is half size and 100% twice, with the whole height budget at the top of the range.
const resolveTileSize = ({trackWidth, scalePercent, aspect, maxHeightBudget}) => {
	const scale = 0.5 + ((clamp(scalePercent, 10, 100) - 10) / 90) * 1.5;
	const safeHeightBudget = Math.max(maxHeightBudget, 32);
	const safeTrackWidth = Math.max(trackWidth, 24);
	const desiredHeight = clamp(safeHeightBudget * (scale / 2), 24, safeHeightBudget);
	const height = Math.min(desiredHeight, safeTrackWidth * aspect);
	return {width: height / aspect, height};
};

// The moment each slot of a strip shows, one scrub step apart, or null past either end.
const resolveStripSlots = ({positionMs, durationMs, stepMs, slotCount = 5, highlightIndex = null}) => {
	const highlight = clamp(highlightIndex ?? Math.floor(slotCount / 2), 0, slotCount - 1);
	const slots = [];
	for (let i = 0; i < slotCount; i++) {
		const slotIndex = i - highlight;
		const targetMs = positionMs + slotIndex * stepMs;
		const inRange = targetMs >= 0 && targetMs <= durationMs;
		slots.push({slotIndex, targetMs: inRange ? targetMs : null});
	}
	return slots;
};

export const planTrickplayPreview = ({trackWidth, scalePercent, aspect, maxHeightBudget, positionMs, durationMs, followScrub, verticalPositionPercent, isStrip, spacing, overflowMargin, stepMs}) => {
	const tile = resolveTileSize({trackWidth, scalePercent, aspect, maxHeightBudget});
	const verticalTravel = resolveVerticalTravel(verticalPositionPercent, resolveVerticalTravelMax({rawMaxTravel: maxHeightBudget - tile.height, trackWidth}));
	const mainTileLeft = resolveSingleLeft({positionMs, durationMs, trackWidth, tileWidth: tile.width, followScrub});
	const strip = isStrip
		? resolveStrip({mainTileLeft, trackWidth, tileWidth: tile.width, spacing, overflowMargin})
		: {leftCount: 0, rightCount: 0, leftOffset: mainTileLeft};
	const slots = resolveStripSlots({positionMs, durationMs, stepMs, slotCount: strip.leftCount + 1 + strip.rightCount, highlightIndex: strip.leftCount});
	return {
		tileWidth: tile.width,
		tileHeight: tile.height,
		verticalTravel,
		leftOffset: strip.leftOffset,
		leftCount: strip.leftCount,
		rightCount: strip.rightCount,
		slots
	};
};
