import $L from '../services/i18n.js';

// The sort keys Seerr's own discover pages send, one entry per axis with the
// direction stored in the value so reselecting an axis can flip it.
export const getSeerrSortOptions = (mediaType) => {
	const releaseKey = mediaType === 'tv' ? 'first_air_date' : 'release_date';
	return [
		{key: 'popularity', label: $L('Popularity'), defaultValue: 'popularity.desc'},
		{key: releaseKey, label: $L('Release Date'), defaultValue: `${releaseKey}.desc`},
		{key: 'vote_average', label: $L('Rating'), defaultValue: 'vote_average.desc'},
		{key: 'original_title', label: $L('Title'), defaultValue: 'original_title.asc'}
	];
};

// The six states TMDB files a series under, sent pipe joined the way Seerr's
// own filter panel does.
export const getSeerrTvStatusOptions = () => [
	{key: 0, label: $L('Returning')},
	{key: 1, label: $L('Planned')},
	{key: 2, label: $L('In Production')},
	{key: 3, label: $L('Ended')},
	{key: 4, label: $L('Canceled')},
	{key: 5, label: $L('Pilot')}
];

// Discrete stand-ins for Seerr's sliders, since a slider is no good to a
// remote. Empty keys mean the filter is off.
export const getSeerrMinRatingOptions = () => [
	{key: '', label: $L('Any')},
	{key: '5', label: '5+'},
	{key: '6', label: '6+'},
	{key: '7', label: '7+'},
	{key: '8', label: '8+'},
	{key: '9', label: '9+'}
];

export const getSeerrMinVoteOptions = () => [
	{key: '', label: $L('Any')},
	{key: '50', label: '50+'},
	{key: '100', label: '100+'},
	{key: '250', label: '250+'},
	{key: '500', label: '500+'},
	{key: '1000', label: '1000+'}
];

export const getSeerrRuntimeOptions = () => [
	{key: '', label: $L('Any')},
	{key: 'under30', label: $L('Under 30m'), lte: 30},
	{key: '30to60', label: $L('30m to 1h'), gte: 30, lte: 60},
	{key: '60to120', label: $L('1h to 2h'), gte: 60, lte: 120},
	{key: 'over120', label: $L('Over 2h'), gte: 120}
];

// Release windows standing in for Seerr's date pickers, each spanning whole
// years.
export const getSeerrReleaseOptions = () => [
	{key: '', label: $L('Any')},
	{key: '2020s', label: '2020s', gte: '2020-01-01'},
	{key: '2010s', label: '2010s', gte: '2010-01-01', lte: '2019-12-31'},
	{key: '2000s', label: '2000s', gte: '2000-01-01', lte: '2009-12-31'},
	{key: '1990s', label: '1990s', gte: '1990-01-01', lte: '1999-12-31'},
	{key: '1980s', label: '1980s', gte: '1980-01-01', lte: '1989-12-31'},
	{key: 'older', label: $L('Before 1980'), lte: '1979-12-31'}
];

// Folds the filter state into the query parameters discoverFiltered takes. A
// genre the browse was opened on and genres picked in the panel ride the same
// parameter, comma joined the way Seerr's own panel sends them.
export const buildSeerrDiscoverParams = ({
	routeGenreId,
	genreIds = [],
	tvStatuses = [],
	language = '',
	minRating = '',
	minVotes = '',
	runtime = '',
	released = ''
} = {}) => {
	const allGenres = [
		...(routeGenreId ? [routeGenreId] : []),
		...genreIds.filter((id) => id !== routeGenreId)
	];
	const runtimeOption = getSeerrRuntimeOptions().find((o) => o.key === runtime);
	const releaseOption = getSeerrReleaseOptions().find((o) => o.key === released);
	return {
		genre: allGenres.length > 0 ? allGenres.join(',') : undefined,
		status: tvStatuses.length > 0 ? tvStatuses.join('|') : undefined,
		language: language || undefined,
		voteAverageGte: minRating || undefined,
		voteCountGte: minVotes || undefined,
		withRuntimeGte: runtimeOption?.gte,
		withRuntimeLte: runtimeOption?.lte,
		releaseDateGte: releaseOption?.gte,
		releaseDateLte: releaseOption?.lte
	};
};

export const hasSeerrDiscoverFilters = ({
	genreIds = [],
	tvStatuses = [],
	language = '',
	minRating = '',
	minVotes = '',
	runtime = '',
	released = ''
} = {}) =>
	genreIds.length > 0 ||
	tvStatuses.length > 0 ||
	language !== '' ||
	minRating !== '' ||
	minVotes !== '' ||
	runtime !== '' ||
	released !== '';
