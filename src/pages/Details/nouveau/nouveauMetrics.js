// Most rails divide their room by a fractional count, so the last card peeks in and shows the rail
// goes on. The people rail divides by a whole count, so every face is complete. Chapters, extras and
// discovery keep a 40px gap, and the other rails tighten to 32.

export const TV_RAIL_GAP = 32;
export const RAIL_GAP = 40;

export const SECTION_INSET = 56;

// With the navigation bar along the top, the bar and the avatar beside it end a little above
// this. The hero starts here and a pinned rail's heading stops here.
export const TOP_BAR_CLEARANCE = 135;

const EPISODE_VISIBLE_COUNT = 3.25;
const COLLECTION_VISIBLE_COUNT = 5.5;
const DISCOVERY_VISIBLE_COUNT = 6.15;
const MEDIA_RAIL_VISIBLE_COUNT = 4.15;
const PEOPLE_VISIBLE_CARDS = 8;

const PEOPLE_AVATAR_FACTOR = 0.84;

// A rail with no room to speak of would otherwise hand back a negative width and take the layout
// with it, so anything that isn't a usable number settles at zero.
const atLeastZero = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// Whole cards plus the fraction of one more. Only the cards that fit whole are charged a gap, which
// is what leaves the fractional card peeking in from the edge.
const fractionalRailWidth = (available, visibleCount, gap) =>
	atLeastZero((available - Math.floor(visibleCount) * gap) / visibleCount);

// Every card fits whole, so there's one gap fewer than there are cards.
const countRailWidth = (available, visibleCards, gap) =>
	atLeastZero((available - (visibleCards - 1) * gap) / visibleCards);

export const episodeCardWidth = (available) =>
	fractionalRailWidth(available, EPISODE_VISIBLE_COUNT, TV_RAIL_GAP);

export const episodeImageHeight = (cardWidth) => (cardWidth * 9) / 16;

export const collectionCardWidth = (available) =>
	fractionalRailWidth(available, COLLECTION_VISIBLE_COUNT, TV_RAIL_GAP);

export const collectionCardHeight = (cardWidth) => (cardWidth * 3) / 2;

export const discoveryCardWidth = (available) =>
	fractionalRailWidth(available, DISCOVERY_VISIBLE_COUNT, RAIL_GAP);

export const discoveryPosterHeight = (cardWidth) => (cardWidth * 3) / 2;

export const mediaRailCardWidth = (available) =>
	fractionalRailWidth(available, MEDIA_RAIL_VISIBLE_COUNT, RAIL_GAP);

export const mediaRailArtworkHeight = (cardWidth) => (cardWidth * 9) / 16;

export const peopleCardWidth = (available) =>
	countRailWidth(available, PEOPLE_VISIBLE_CARDS, TV_RAIL_GAP);

export const peopleAvatarSize = (cardWidth) => cardWidth * PEOPLE_AVATAR_FACTOR;
