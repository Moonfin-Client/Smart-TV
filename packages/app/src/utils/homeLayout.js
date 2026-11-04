/**
 * The home row list, and translating it to and from the server.
 *
 * This lives outside SettingsContext because SettingsContext touches platform storage
 * as soon as it is imported, which leaves it impossible to load in a unit test.
 *
 * The server holds the layout as two views of one value:
 *   homeSections   every row, each with its own enabled flag and order, including rows
 *                  contributed by plugins. The complete picture.
 *   homeRowOrder   the names of the enabled rows only. It can't express "disabled" and
 *                  carries no plugin rows.
 *
 * Reading prefers homeSections and falls back to homeRowOrder. Writing has to send both:
 * the server drops a stored homeSections as soon as it receives a homeRowOrder without
 * one, taking every other client's disabled rows and plugin rows with it.
 */

import {PICK_SOURCES, isPickedRow, isSeerrSliderRow, isServerSectionRow, makePickedRow, makeSeerrSliderRow} from './pickedRows';

export const DEFAULT_HOME_ROWS = [
	{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
	{id: 'nextup', name: 'Next Up', enabled: true, order: 1},
	{id: 'latest-media', name: 'Recently Added Media', enabled: true, order: 2},
	{id: 'collections', name: 'Collections', enabled: false, order: 3},
	{id: 'library-tiles', name: 'My Media', enabled: false, order: 4},
	{id: 'favoriteMovies', name: 'Favorite Movies', enabled: false, order: 5},
	{id: 'favoriteSeries', name: 'Favorite Series', enabled: false, order: 6},
	{id: 'favoriteEpisodes', name: 'Favorite Episodes', enabled: false, order: 7},
	{id: 'favoritePeople', name: 'Favorite People', enabled: false, order: 8},
	{id: 'favoriteArtists', name: 'Favorite Artists', enabled: false, order: 9},
	{id: 'favoriteMusicVideos', name: 'Favorite Music Videos', enabled: false, order: 10},
	{id: 'favoriteAlbums', name: 'Favorite Albums', enabled: false, order: 11},
	{id: 'favoriteSongs', name: 'Favorite Songs', enabled: false, order: 12},
	{id: 'genres', name: 'Genres', enabled: false, order: 13},
	{id: 'recently-released', name: 'Recently Released', enabled: false, order: 14},
	{id: 'imdb-top250-movies', name: 'IMDb Top 250 Movies', enabled: false, order: 15},
	{id: 'imdb-top250-tv', name: 'IMDb Top 250 TV Shows', enabled: false, order: 16},
	{id: 'imdb-popular-movies', name: 'IMDb Most Popular Movies', enabled: false, order: 17},
	{id: 'imdb-popular-tv', name: 'IMDb Most Popular TV Shows', enabled: false, order: 18},
	{id: 'imdb-lowest-rated', name: 'IMDb Lowest Rated Movies', enabled: false, order: 19},
	{id: 'imdb-top-english', name: 'IMDb Top Rated English Movies', enabled: false, order: 20},
	{id: 'sinceyouwatched1', name: 'Since You Watched Row 1', enabled: false, order: 21},
	{id: 'sinceyouwatched2', name: 'Since You Watched Row 2', enabled: false, order: 22},
	{id: 'sinceyouwatched3', name: 'Since You Watched Row 3', enabled: false, order: 23},
	{id: 'sinceyouwatched4', name: 'Since You Watched Row 4', enabled: false, order: 24},
	{id: 'sinceyouwatched5', name: 'Since You Watched Row 5', enabled: false, order: 25},
	{id: 'rewatch', name: 'Rewatch', enabled: false, order: 26},
	{id: 'playlists', name: 'Playlists', enabled: false, order: 27},
	{id: 'audioartists', name: 'Music Artists', enabled: false, order: 28},
	{id: 'audioalbums', name: 'Music Albums', enabled: false, order: 29},
	{id: 'audioplaylists', name: 'Music Playlists', enabled: false, order: 30},
	{id: 'resumeaudio', name: 'Continue Listening', enabled: false, order: 31},
	{id: 'activerecordings', name: 'Recordings', enabled: false, order: 32},
	{id: 'livetv', name: 'Live TV', enabled: false, order: 33},
	{id: 'seerr_shortcuts', name: 'Seerr Browse', enabled: false, order: 34},
	{id: 'seerr_recent_requests', name: 'Recent Requests', enabled: false, order: 35},
	{id: 'seerr_recently_added', name: 'Recently Added', enabled: false, order: 36},
	{id: 'seerr_trending', name: 'Trending Now', enabled: false, order: 37},
	{id: 'seerr_popular_movies', name: 'Popular Movies', enabled: false, order: 38},
	{id: 'seerr_popular_series', name: 'Popular TV Shows', enabled: false, order: 39},
	{id: 'seerr_upcoming_movies', name: 'Upcoming Movies', enabled: false, order: 40},
	{id: 'seerr_upcoming_series', name: 'Upcoming TV Shows', enabled: false, order: 41},
	{id: 'seerr_movie_genres', name: 'Browse Movies by Genre', enabled: false, order: 42},
	{id: 'seerr_series_genres', name: 'Browse TV by Genre', enabled: false, order: 43},
	{id: 'seerr_studios', name: 'Browse by Studio', enabled: false, order: 44},
	{id: 'seerr_networks', name: 'Browse by Network', enabled: false, order: 45},
	{id: 'tmdb_popular_movies', name: 'TMDB Popular Movies', enabled: false, order: 46},
	{id: 'tmdb_top_rated_movies', name: 'TMDB Top Rated Movies', enabled: false, order: 47},
	{id: 'tmdb_now_playing_movies', name: 'TMDB Now Playing Movies', enabled: false, order: 48},
	{id: 'tmdb_upcoming_movies', name: 'TMDB Upcoming Movies', enabled: false, order: 49},
	{id: 'tmdb_popular_tv', name: 'TMDB Popular TV', enabled: false, order: 50},
	{id: 'tmdb_top_rated_tv', name: 'TMDB Top Rated TV', enabled: false, order: 51},
	{id: 'tmdb_airing_today_tv', name: 'TMDB Airing Today TV', enabled: false, order: 52},
	{id: 'tmdb_on_the_air_tv', name: 'TMDB On The Air TV', enabled: false, order: 53},
	{id: 'tmdb_trending_movie_daily', name: 'TMDB Trending Movies (Daily)', enabled: false, order: 54},
	{id: 'tmdb_trending_movie_weekly', name: 'TMDB Trending Movies (Weekly)', enabled: false, order: 55},
	{id: 'tmdb_trending_tv_daily', name: 'TMDB Trending TV (Daily)', enabled: false, order: 56},
	{id: 'tmdb_trending_tv_weekly', name: 'TMDB Trending TV (Weekly)', enabled: false, order: 57},
	{id: 'tmdb_trending_all_weekly', name: 'TMDB Trending All (Weekly)', enabled: false, order: 58},
	{id: 'radarr_calendar', name: 'Radarr Upcoming', enabled: false, order: 59},
	{id: 'sonarr_calendar', name: 'Sonarr Upcoming', enabled: false, order: 60},
	// These ids match the plugin's own section types, so none of them needs an entry
	// in the mapping tables below.
	{id: 'seerr_watchlist', name: 'Your Watchlist', enabled: false, order: 61},
	{id: 'librarybuttons', name: 'Library Buttons', enabled: false, order: 62},
	{id: 'studios', name: 'Studios', enabled: false, order: 63},
	{id: 'seasonal', name: 'Seasonal Row', enabled: false, order: 64},
	{id: 'onnow', name: 'On Now', enabled: false, order: 65},
	{id: 'mdblist_watching_now', name: 'Watching on MDBList', enabled: false, order: 66}
];

export const TV_TO_SERVER_ROW = {
	'latest-media': 'latestmedia',
	'recently-released': 'recentlyreleased',
	'library-tiles': 'smalllibrarytiles',
	'favoriteMovies': 'favoritemovies',
	'favoriteSeries': 'favoriteseries',
	'favoriteEpisodes': 'favoriteepisodes',
	'favoritePeople': 'favoritepeople',
	'favoriteArtists': 'favoriteartists',
	'favoriteMusicVideos': 'favoritemusicvideos',
	'favoriteAlbums': 'favoritealbums',
	'favoriteSongs': 'favoritesongs',
	'genres': 'genres',
	'imdb-top250-movies': 'imdb_top_250_movies',
	'imdb-top250-tv': 'imdb_top_250_tv_shows',
	'imdb-popular-movies': 'imdb_most_popular_movies',
	'imdb-popular-tv': 'imdb_most_popular_tv_shows',
	'imdb-lowest-rated': 'imdb_lowest_rated_movies',
	'imdb-top-english': 'imdb_top_english_movies'
};
export const SERVER_TO_TV_ROW = {
	'latestmedia': 'latest-media',
	'recentlyreleased': 'recently-released',
	'smalllibrarytiles': 'library-tiles',
	'favoritemovies': 'favoriteMovies',
	'favoriteseries': 'favoriteSeries',
	'favoriteepisodes': 'favoriteEpisodes',
	'favoritepeople': 'favoritePeople',
	'favoriteartists': 'favoriteArtists',
	'favoriteMusicVideos': 'favoriteMusicVideos',
	'favoritemusicvideos': 'favoriteMusicVideos',
	'favoritealbums': 'favoriteAlbums',
	'favoritesongs': 'favoriteSongs',
	'genres': 'genres',
	'imdb_top_250_movies': 'imdb-top250-movies',
	'imdb_top_250_tv_shows': 'imdb-top250-tv',
	'imdb_most_popular_movies': 'imdb-popular-movies',
	'imdb_most_popular_tv_shows': 'imdb-popular-tv',
	'imdb_lowest_rated_movies': 'imdb-lowest-rated',
	'imdb_top_english_movies': 'imdb-top-english'
};

const ROW_IMAGE_TYPES = ['poster', 'backdrop', 'logo', 'thumb', 'banner'];

export const rowImageTypeFromServer = (value) => {
	const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return ROW_IMAGE_TYPES.includes(type) ? type : undefined;
};

// The per row image types travel as row:type pairs under the server's row names, for
// example "genres:thumb,nextup:poster", since the plugin saves its admin defaults as XML,
// which can't hold a map. Continue Watching has its own key. An empty list is still sent,
// because the server keeps the old list when the value is missing and a cleared row would
// come back.
export const homeRowImageTypesToServer = (overrides) => Object.entries(overrides || {})
	.filter(([id]) => id !== 'resume')
	.map(([id, type]) => `${TV_TO_SERVER_ROW[id] || id}:${type}`)
	.join(',');

export const homeRowImageTypesFromServer = (value) => {
	if (typeof value !== 'string') return undefined;
	const overrides = {};
	for (const part of value.split(',')) {
		const pair = part.split(':');
		if (pair.length !== 2) continue;
		const row = pair[0].trim().toLowerCase();
		const type = rowImageTypeFromServer(pair[1]);
		if (row && row !== 'resume' && type) overrides[SERVER_TO_TV_ROW[row] || row] = type;
	}
	return overrides;
};

// A row the saved layout lacks is appended switched off, except where `enabledById` says
// otherwise. The seasonal row uses that: a client that predates it drops it from the layout it
// pushes, so its own synced toggle decides.
export const mergeHomeRows = (rows, enabledById = {}) => {
	if (!Array.isArray(rows)) return [...DEFAULT_HOME_ROWS];
	const merged = [...rows];
	let added = false;
	for (const def of DEFAULT_HOME_ROWS) {
		if (!merged.find((row) => row.id === def.id)) {
			merged.push({...def, enabled: enabledById[def.id] === true, order: merged.length});
			added = true;
		}
	}
	if (!added) return rows;
	return merged;
};

// The seasonal row with its toggle applied. Switching it on puts it right after Continue
// Watching and Next Up, where a holiday row gets noticed. Switching it off keeps its place.
export const withSeasonalRow = (rows, enabled) => {
	const sorted = [...(rows || [])].sort((left, right) => left.order - right.order);
	const index = sorted.findIndex((row) => row.id === 'seasonal');
	const current = index >= 0 ? sorted.splice(index, 1)[0] : DEFAULT_HOME_ROWS.find((row) => row.id === 'seasonal');
	let insertAt = index >= 0 ? index : sorted.length;
	if (enabled && !current.enabled) {
		let anchor = -1;
		sorted.forEach((row, i) => {
			if (row.id === 'resume' || row.id === 'nextup') anchor = i;
		});
		insertAt = anchor + 1;
	}
	sorted.splice(insertAt, 0, {...current, enabled});
	return sorted.map((row, order) => ({...row, order}));
};

// The Watching on MDBList row with its toggle applied. Switching it on moves it right after the
// last row that's on, and switching it off keeps its place.
export const withWatchingNowRow = (rows, enabled) => {
	const sorted = [...(rows || [])].sort((left, right) => left.order - right.order);
	const index = sorted.findIndex((row) => row.id === 'mdblist_watching_now');
	const current = index >= 0 ? sorted.splice(index, 1)[0] : DEFAULT_HOME_ROWS.find((row) => row.id === 'mdblist_watching_now');
	let insertAt = index >= 0 ? index : sorted.length;
	if (enabled) {
		insertAt = 0;
		sorted.forEach((row, i) => {
			if (row.enabled) insertAt = i + 1;
		});
	}
	sorted.splice(insertAt, 0, {...current, enabled});
	return sorted.map((row, order) => ({...row, order}));
};

// Sections this client has no row for, meaning plugin rows and any type belonging to a
// client with rows this one lacks. They get handed back verbatim so that writing a
// layout from the TV never destroys them. Null means we haven't read the server's
// layout yet.
let homeSectionsPassthrough = null;

export const hasSeenServerLayout = () => homeSectionsPassthrough !== null;

// Exported so tests can clear the module state between cases.
export const __resetHomeLayoutPassthrough = () => {
	homeSectionsPassthrough = null;
};

const ROW_BY_ID = new Map(DEFAULT_HOME_ROWS.map((row) => [row.id, row]));

// A server type we don't have a row for is left out rather than invented.
const rowForServerType = (type) => ROW_BY_ID.get(SERVER_TO_TV_ROW[type] || type);

// A collection, genre or playlist picked on any client, or a Seerr slider put on Home, as the row
// this client keeps for it
const pickedRowFromSection = (section) => {
	const source = String(section.pluginSource || '').toLowerCase();
	if (source === 'seerr' && section.pluginSection && section.pluginAdditionalData && section.serverId) {
		return makeSeerrSliderRow({
			serverUrl: section.serverId,
			sliderId: section.pluginSection,
			sliderType: section.pluginAdditionalData,
			name: section.pluginDisplayText || ''
		});
	}
	// Silo's own sections keep the section in pluginSection, as Moonfin-Core and Moonbase write them.
	if (source === 'server' && section.pluginSection) {
		return makePickedRow({source, serverUrl: section.serverId || '', itemId: String(section.pluginSection), name: section.pluginDisplayText || ''});
	}
	if (!PICK_SOURCES[source] || !section.pluginAdditionalData || !section.serverId) return undefined;
	return makePickedRow({
		source,
		serverUrl: section.serverId,
		itemId: String(section.pluginAdditionalData),
		name: section.pluginDisplayText || ''
	});
};

// The row that writes a section back, if this client has one. A section with none has
// to be carried through untouched instead, so the type is what decides it rather than
// the kind, which the server often leaves off entirely.
const modelledRow = (section) => {
	if (!section) return undefined;
	if (section.kind === 'pluginDynamic') return pickedRowFromSection(section);
	return rowForServerType(section.type);
};

export const homeRowsFromSections = (sections, enabledById) => {
	if (!Array.isArray(sections) || sections.length === 0) return undefined;
	const rows = sections
		.map((section) => {
			const def = modelledRow(section);
			return def ? {def, enabled: section.enabled !== false, order: section.order ?? 0} : null;
		})
		.filter(Boolean)
		.sort((left, right) => left.order - right.order)
		.map((entry, index) => ({...entry.def, enabled: entry.enabled, order: index}));
	return rows.length > 0 ? mergeHomeRows(rows, enabledById) : undefined;
};

export const homeRowsFromRowOrder = (serverIds, enabledById) => {
	if (!Array.isArray(serverIds) || serverIds.length === 0) return undefined;
	const rows = [];
	serverIds.forEach((sid, index) => {
		const def = rowForServerType(sid);
		if (def) rows.push({...def, enabled: true, order: index});
	});
	return mergeHomeRows(rows, enabledById);
};

// The whole layout comes from the first profile that has one, never a row by row merge
// across profiles.
export const homeRowsFromProfile = (serverProfile, enabledById) => {
	if (!serverProfile) return undefined;
	const fromSections = homeRowsFromSections(serverProfile.homeSections, enabledById);
	if (fromSections) {
		homeSectionsPassthrough = serverProfile.homeSections.filter((s) => !modelledRow(s));
		return fromSections;
	}
	const fromOrder = homeRowsFromRowOrder(serverProfile.homeRowOrder, enabledById);
	if (fromOrder) {
		homeSectionsPassthrough = homeSectionsPassthrough || [];
		return fromOrder;
	}
	return undefined;
};

// A picked row or a slider goes over the way the other clients write it, typed none, since its
// id alone can't say which item it stands for
const rowToSection = (row, order) => {
	const plugin = {kind: 'pluginDynamic', type: 'none', enabled: !!row.enabled, order, serverId: row.serverUrl, pluginDisplayText: row.name};
	if (isSeerrSliderRow(row)) {
		return {...plugin, pluginSource: 'seerr', pluginSection: row.sliderId, pluginAdditionalData: row.sliderType};
	}
	if (isServerSectionRow(row)) return {...plugin, pluginSource: 'server', pluginSection: row.itemId};
	if (isPickedRow(row)) {
		return {...plugin, pluginSource: row.source, pluginSection: PICK_SOURCES[row.source].section, pluginAdditionalData: row.itemId};
	}
	return {kind: 'builtin', type: TV_TO_SERVER_ROW[row.id] || row.id, enabled: !!row.enabled, order};
};

export const homeRowsToSections = (rows) => [
	...[...rows]
		.sort((left, right) => left.order - right.order)
		.map(rowToSection),
	...(homeSectionsPassthrough || [])
];

export const homeRowsToRowOrder = (rows) => [...rows]
	.sort((left, right) => left.order - right.order)
	.filter((row) => row.enabled && !isPickedRow(row) && !isSeerrSliderRow(row))
	.map((row) => TV_TO_SERVER_ROW[row.id] || row.id);
