import {foldForSearch} from './accentFolding';

// The library filter panel keeps its choices as plain lists, and the server
// wants a query parameter per kind. Genres, ratings and tags are pipe
// delimited so a value holding a comma still arrives whole.

const list = (values, separator = ',') =>
	Array.isArray(values) && values.length > 0 ? values.join(separator) : undefined;

const flag = (values, key) => (Array.isArray(values) && values.includes(key) ? 'true' : undefined);

// One flag serves both standard and high definition, so asking for both is the
// same as asking for neither.
const hdParam = (qualityFilters) => {
	const wantsHd = Array.isArray(qualityFilters) && qualityFilters.includes('hd');
	const wantsSd = Array.isArray(qualityFilters) && qualityFilters.includes('sd');
	if (wantsHd === wantsSd) return undefined;
	return wantsHd ? 'true' : 'false';
};

const buildFilterParams = ({
	featureFilters = [],
	qualityFilters = [],
	videoSourceFilters = [],
	genreFilters = [],
	ratingFilters = [],
	tagFilters = [],
	yearFilters = [],
	audioLanguageFilters = [],
	subtitleLanguageFilters = []
} = {}) => {
	const params = {
		HasSubtitles: flag(featureFilters, 'HasSubtitles'),
		HasTrailer: flag(featureFilters, 'HasTrailer'),
		HasSpecialFeature: flag(featureFilters, 'HasSpecialFeature'),
		HasThemeSong: flag(featureFilters, 'HasThemeSong'),
		HasThemeVideo: flag(featureFilters, 'HasThemeVideo'),
		IsHD: hdParam(qualityFilters),
		Is4K: flag(qualityFilters, 'uhd'),
		Is3D: flag(qualityFilters, 'threeD'),
		VideoTypes: list(videoSourceFilters),
		Genres: list(genreFilters, '|'),
		OfficialRatings: list(ratingFilters, '|'),
		Tags: list(tagFilters, '|'),
		Years: list(yearFilters),
		AudioLanguages: list(audioLanguageFilters),
		SubtitleLanguages: list(subtitleLanguageFilters)
	};

	// A filter nobody picked is left out rather than sent as an empty value.
	Object.keys(params).forEach(key => {
		if (params[key] === undefined) delete params[key];
	});
	return params;
};

// Everything the Sort & Filter panel can narrow a library by, as it's saved for each library.
// The keys are the ones buildFilterParams takes, so the saved value goes straight in.
export const NO_FILTERS = {
	favoritesOnly: false,
	playedFilter: 'all',
	likedFilter: 'all',
	seriesFilter: 'all',
	featureFilters: [],
	qualityFilters: [],
	videoSourceFilters: [],
	genreFilters: [],
	ratingFilters: [],
	tagFilters: [],
	yearFilters: [],
	audioLanguageFilters: [],
	subtitleLanguageFilters: []
};

export const hasActiveFilters = (filters) => Object.keys(NO_FILTERS).some((key) => {
	const value = filters[key];
	return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== NO_FILTERS[key];
});

// Shorter lists are quicker to scroll through than to search.
const FACET_SEARCH_MIN = 10;

/**
 * What one facet in the panel shows: its values narrowed to the search, then cut to the page
 * limit. Anything already picked stays on screen however far down the list it sits, otherwise
 * a page limit could hide the only way to clear it.
 *
 * @param {Array<string|{name: string, value: string}>} values - languages carry a display
 *   name beside the code the query takes, everything else is its own label
 * @param {string[]} selected
 * @param {string} query
 * @param {number} limit
 */
export const facetRows = (values, selected, query, limit) => {
	const options = values.map((v) => (typeof v === 'string' ? {name: v, value: v} : v));
	const searchable = options.length >= FACET_SEARCH_MIN;
	const folded = searchable ? foldForSearch(query.trim()) : '';
	const matching = folded ? options.filter((option) => foldForSearch(option.name).includes(folded)) : options;
	let room = limit;
	const visible = matching.filter((option) => {
		if (selected.includes(option.value)) return true;
		if (room <= 0) return false;
		room -= 1;
		return true;
	});
	return {
		chosen: options.filter((option) => selected.includes(option.value)).length,
		searchable,
		noMatches: matching.length === 0,
		visible,
		remaining: matching.length - visible.length
	};
};

export {buildFilterParams};
