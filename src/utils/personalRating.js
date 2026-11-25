// The viewer's own rating of a title, which lives in the server's user data
// rather than anywhere local. The server keeps a score out of ten alongside a
// separate liked flag, and the chosen style only changes how that score is
// shown and entered.

const PERSONAL_RATING_STYLES = ['thumbs', 'stars', 'numeric'];

// The score at which a rating counts as liked.
const LIKED_RATING_THRESHOLD = 6.5;

export const normalizeRatingStyle = (style) => (
	PERSONAL_RATING_STYLES.indexOf(style) >= 0 ? style : 'thumbs'
);

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

export const clampRating = (rating) => {
	if (!Number.isFinite(rating)) return 0;
	return Math.min(10, Math.max(0, rating));
};

export const starsFromRating = (rating) => (rating === null ? 0 : rating / 2);

// Full stars with a half added when the remainder is close enough to earn one.
export const starRatingLabel = (rating) => {
	const stars = starsFromRating(rating);
	const full = Math.floor(stars);
	return `${'★'.repeat(full)}${stars - full >= 0.25 ? '½' : ''}`;
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
