// Which sections a Nouveau page is made of, and in what order. Everything here is a plain function
// of what the screen already knows, so the order can be proven without drawing anything.
//
// The details footer is not gated. Every item gets one, which is why it is appended rather than
// asked about.

export const SECTION_EPISODES = 'episodes';
export const SECTION_COLLECTION = 'collection';
// The collections a movie or show belongs to, a rail each.
export const SECTION_PARENT_COLLECTIONS = 'parentCollections';
export const SECTION_CHAPTERS = 'chapters';
export const SECTION_PARTS = 'additionalParts';
export const SECTION_EXTRAS = 'extras';
export const SECTION_DISCOVERY = 'discovery';
export const SECTION_REVIEWS = 'reviews';
export const SECTION_PEOPLE = 'people';
export const SECTION_DETAILS = 'details';
export const SECTION_BOOKS = 'books';

// Only the two types that can carry a recommendation list of their own.
export const supportsDiscovery = (type) => type === 'Movie' || type === 'Series';

export const shouldIncludeEpisodes = (type) => type === 'Series' || type === 'Season';

export const shouldIncludeCollection = (type) => type === 'BoxSet';

// Chapters go by the list alone rather than by type, so anything that carries them shows them.
export const shouldIncludeChapters = (chapterCount) => chapterCount > 0;

export const shouldIncludeExtras = (extraCount) => extraCount > 0;

export const shouldIncludePeople = ({actorCount = 0, directorCount = 0}) =>
	actorCount > 0 || directorCount > 0;

// Held open while a lookup is still out, so the rail keeps its place rather than appearing late and
// pushing everything under it down the page. Once the answers are in it is only kept for an answer
// that actually has something in it.
export const shouldIncludeDiscovery = ({
	type,
	similarLoaded = false,
	similarCount = 0,
	seerrExpected = false,
	seerrResolved = false,
	seerrSimilarCount = 0,
	seerrRecommendationCount = 0
}) => {
	if (!supportsDiscovery(type)) return false;
	if (!similarLoaded) return true;
	if (similarCount > 0) return true;
	if (!seerrExpected) return false;
	if (!seerrResolved) return true;
	return seerrSimilarCount > 0 || seerrRecommendationCount > 0;
};

// Seerr is only worth waiting on for a title it could actually match, which means the plugin is
// there and the item carries an id Seerr can look up.
export const seerrDiscoveryExpected = ({type, seerrAvailable = false, tmdbId, imdbId}) =>
	supportsDiscovery(type) && Boolean(seerrAvailable) && Boolean(tmdbId || imdbId);

export const nouveauSectionOrder = (state = {}) => {
	const {
		type,
		chapterCount = 0,
		partCount = 0,
		extraCount = 0,
		actorCount = 0,
		directorCount = 0,
		reviewCount = 0,
		parentCollectionCount = 0,
		isBookSeries = false
	} = state;

	const sections = [];
	if (shouldIncludeEpisodes(type)) sections.push(SECTION_EPISODES);
	if (shouldIncludeCollection(type)) sections.push(SECTION_COLLECTION);
	if (shouldIncludeChapters(chapterCount)) sections.push(SECTION_CHAPTERS);
	if (partCount > 0) sections.push(SECTION_PARTS);
	if (isBookSeries === true) sections.push(SECTION_BOOKS);
	if (shouldIncludeExtras(extraCount)) sections.push(SECTION_EXTRAS);
	if (parentCollectionCount > 0 && !shouldIncludeCollection(type)) sections.push(SECTION_PARENT_COLLECTIONS);
	if (shouldIncludeDiscovery(state)) sections.push(SECTION_DISCOVERY);
	if (reviewCount > 0) sections.push(SECTION_REVIEWS);
	if (shouldIncludePeople({actorCount, directorCount})) sections.push(SECTION_PEOPLE);
	if (isBookSeries === false) sections.push(SECTION_DETAILS);
	return sections;
};
