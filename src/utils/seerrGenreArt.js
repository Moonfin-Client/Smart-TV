// Genre artwork the way Seerr builds it: TMDB recolors the backdrop through its
// duotone filter, so a genre keeps its own color even when two genres end up on
// the same film. The colors and the genre they belong to come from Overseerr.

const BLACK = ['1F2937', 'D1D5DB'];
const RED = ['991B1B', 'FCA5A5'];
const DARK_RED = ['1F2937', 'F87171'];
const BLUE = ['032541', '01b4e4'];
const LIGHT_BLUE = ['1F2937', '60A5FA'];
const DARK_BLUE = ['1F2937', '2864d2'];
const ORANGE = ['92400E', 'FCD34D'];
const DARK_ORANGE = ['552c01', 'd47c1d'];
const LIGHT_GREEN = ['065F46', '6EE7B7'];
const PURPLE = ['5B21B6', 'C4B5FD'];
const DARK_PURPLE = ['480c8b', 'a96bef'];
const YELLOW = ['777e0d', 'e4ed55'];
const PINK = ['9D174D', 'F9A8D4'];

const GENRE_TONES = {
	28: RED, // Action
	12: DARK_PURPLE, // Adventure
	16: BLUE, // Animation
	35: ORANGE, // Comedy
	80: DARK_BLUE, // Crime
	99: LIGHT_GREEN, // Documentary
	18: PINK, // Drama
	10751: YELLOW, // Family
	14: LIGHT_BLUE, // Fantasy
	36: ORANGE, // History
	27: BLACK, // Horror
	10402: BLUE, // Music
	9648: PURPLE, // Mystery
	10749: PINK, // Romance
	878: LIGHT_BLUE, // Science Fiction
	10770: RED, // TV Movie
	53: BLACK, // Thriller
	10752: DARK_RED, // War
	37: ORANGE, // Western
	10759: DARK_PURPLE, // Action & Adventure
	10762: BLUE, // Kids
	10763: BLACK, // News
	10764: DARK_ORANGE, // Reality
	10765: LIGHT_BLUE, // Sci-Fi & Fantasy
	10766: PINK, // Soap
	10767: LIGHT_GREEN, // Talk
	10768: DARK_RED // War & Politics
};

// The duotone backdrop for a genre card, or null when the genre came back
// without artwork. Seerr skips the front of the list: those are the most
// popular films, and a popular film sits in several genres, so it's what
// shows up twice.
export const seerrGenreBackdrop = (genreId, backdrops) => {
	if (!Array.isArray(backdrops) || backdrops.length === 0) return null;
	const tones = GENRE_TONES[genreId] || BLACK;
	const path = backdrops.length > 4 ? backdrops[4] : backdrops[backdrops.length - 1];
	return {path, size: `w1280_filter(duotone,${tones[0]},${tones[1]})`};
};
