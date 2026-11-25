// The viewer's own rating of a title, which lives in the server's user data
// rather than anywhere local. The server keeps a score out of ten alongside a
// separate liked flag, and the chosen style only changes how that score is
// shown and entered.

const PERSONAL_RATING_STYLES = ['thumbs', 'stars', 'numeric'];

// Default interval count on the shared 0-10 rating scale:
// 11 steps = 0.5-star increments (0-5) or whole-number increments (0-10).
export const DEFAULT_PERSONAL_RATING_INTERVALS = 11;

// The score at which a rating counts as liked.
const LIKED_RATING_THRESHOLD = 6.5;

export const normalizeRatingStyle = (style) => (
	PERSONAL_RATING_STYLES.indexOf(style) >= 0 ? style : 'thumbs'
);

export const effectivePersonalRatingIntervals = (style, configured) => {
	const normalizedStyle = normalizeRatingStyle(style);
	const parsed = Number(configured);
	if (normalizedStyle === 'stars') {
		if (parsed === 6) return 6;
		if (parsed === 21 || parsed === 41) return 21;
		return 11;
	}
	if (normalizedStyle === 'numeric') {
		if (parsed === 21) return 21;
		if (parsed === 41) return 41;
		return 11;
	}
	return DEFAULT_PERSONAL_RATING_INTERVALS;
};

export const personalRatingServerStep = (style, intervals) => {
	const effective = effectivePersonalRatingIntervals(style, intervals);
	return 10 / (effective - 1);
};

export const personalRatingMaxDecimals = (style, intervals) => {
	const normalizedStyle = normalizeRatingStyle(style);
	const effective = effectivePersonalRatingIntervals(normalizedStyle, intervals);
	if (normalizedStyle === 'stars') {
		if (effective === 6) return 0;
		if (effective === 11) return 1;
		return 2;
	}
	if (normalizedStyle === 'numeric') {
		if (effective === 11) return 0;
		if (effective === 21) return 1;
		return 2;
	}
	return 0;
};

export const clampRating = (rating) => {
	if (!Number.isFinite(rating)) return 0;
	return Math.min(10, Math.max(0, rating));
};

export const snapPersonalRatingToGrid = (rating, style, intervals) => {
	const step = personalRatingServerStep(style, intervals);
	const clamped = clampRating(rating);
	const snapped = clampRating(Math.round(clamped / step) * step);
	return Math.round(snapped * 100) / 100;
};

export const formatPersonalRatingNumber = (value, maxDecimals) => {
	const factor = Math.pow(10, maxDecimals);
	const rounded = Math.round(value * factor) / factor;
	if (maxDecimals === 0) return String(Math.round(rounded));
	return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
};

export const formatPersonalRatingBadge = (serverRating, style, intervals = DEFAULT_PERSONAL_RATING_INTERVALS) => {
	const normalizedStyle = normalizeRatingStyle(style);
	const clamped = clampRating(serverRating);
	if (normalizedStyle === 'thumbs') {
		return formatPersonalRatingNumber(clamped, 1);
	}
	const maxDecimals = personalRatingMaxDecimals(normalizedStyle, intervals);
	if (normalizedStyle === 'stars') {
		return `${formatPersonalRatingNumber(clamped / 2, maxDecimals)}/5`;
	}
	return formatPersonalRatingNumber(clamped, maxDecimals);
};

export const stepPersonalRatingDown = (current, style, intervals) => {
	const step = personalRatingServerStep(style, intervals);
	const next = clampRating((Math.ceil(current / step) - 1) * step);
	return Math.round(next * 100) / 100;
};

export const stepPersonalRatingUp = (current, style, intervals) => {
	const step = personalRatingServerStep(style, intervals);
	const next = clampRating((Math.floor(current / step) + 1) * step);
	return Math.round(next * 100) / 100;
};

export const personalRatingOf = (userData) => {
	// Clearing a rating leaves a null behind, which Number would read as a score
	// of zero, so it has to be turned away before the conversion.
	const raw = userData?.Rating;
	if (raw === null || raw === undefined || raw === '') return null;
	const rating = Number(raw);
	return Number.isFinite(rating) ? rating : null;
};

// A thumb rating only stores the liked flag, so a score on its own has to stand
// in for one when the server never recorded it.
export const displayRatingLikes = (userData) => {
	if (typeof userData?.Likes === 'boolean') return userData.Likes;
	const rating = personalRatingOf(userData);
	return rating === null ? null : rating >= LIKED_RATING_THRESHOLD;
};

export const starsFromRating = (rating) => (rating === null ? 0 : rating / 2);

// Full stars with a fractional star matching the configured star interval.
export const starRatingLabel = (rating, intervals = DEFAULT_PERSONAL_RATING_INTERVALS) => {
	const effective = effectivePersonalRatingIntervals('stars', intervals);
	const snappedStars = snapPersonalRatingToGrid(rating ?? 0, 'stars', effective) / 2;
	const subdivisions = effective === 6 ? 1 : effective === 11 ? 2 : 4;
	const snappedUnits = Math.round(snappedStars * subdivisions);
	if (snappedUnits <= 0) return '';
	const full = Math.floor(snappedUnits / subdivisions);
	const remainder = snappedUnits % subdivisions;
	let fraction = '';
	if (subdivisions === 2 && remainder === 1) {
		fraction = '½';
	} else if (subdivisions === 4) {
		if (remainder === 1) fraction = '¼';
		else if (remainder === 2) fraction = '½';
		else if (remainder === 3) fraction = '¾';
	}
	return `${'★'.repeat(full)}${fraction}`;
};

// The user data a rating leaves behind, applied before the server answers so the
// screen reacts at once.
export const thumbRatingPatch = (likes) => ({Likes: likes});

export const numericRatingPatch = (rating) => ({
	Rating: rating,
	Likes: rating >= LIKED_RATING_THRESHOLD
});

export const clearedRatingPatch = () => ({Rating: null, Likes: null});

// Types a personal rating can attach to. The server stores user data per item,
// so a series, season and episode each carry their own rating with no
// propagation between them. People, photos and playlists stay out.
const RATABLE_ITEM_TYPES = [
	'Movie',
	'Series',
	'Season',
	'Episode',
	'Video',
	'MusicVideo',
	'MusicAlbum',
	'MusicArtist',
	'Audio',
	'AudioBook',
	'Book',
	'BoxSet'
];

export const isRatableItemType = (type) => RATABLE_ITEM_TYPES.indexOf(type) >= 0;
