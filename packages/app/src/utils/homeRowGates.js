// Some home rows have a setting of their own that switches a whole group on or off, separate
// from whether the row is enabled in the row list. The home screen and the settings editor
// both have to agree on that, or the editor offers to reorder a row that never appears.

export const FAVORITE_ROW_IDS = [
	'favoriteMovies',
	'favoriteSeries',
	'favoriteEpisodes',
	'favoritePeople',
	'favoriteArtists',
	'favoriteMusicVideos',
	'favoriteAlbums',
	'favoriteSongs'
];

const AUDIO_ROW_IDS = ['audioartists', 'audioalbums', 'audioplaylists', 'resumeaudio'];

export const isRowEnabledBySetting = (rowId, settings) => {
	if (FAVORITE_ROW_IDS.includes(rowId)) return settings.displayFavoritesRows;
	if (AUDIO_ROW_IDS.includes(rowId)) return settings.displayAudioRows;
	if (rowId === 'collections') return settings.displayCollectionsRows;
	if (rowId === 'genres') return settings.displayGenresRows;
	if (rowId === 'playlists') return settings.displayPlaylistsRows;
	if (rowId === 'studios') return settings.displayStudiosRows;
	if (rowId === 'rewatch') return settings.displayRewatchRow !== false;
	if (rowId === 'imdb-top250-movies') return settings.imdbTop250MoviesEnabled;
	if (rowId === 'imdb-top250-tv') return settings.imdbTop250TvShowsEnabled;
	if (rowId === 'imdb-popular-movies') return settings.imdbMostPopularMoviesEnabled;
	if (rowId === 'imdb-popular-tv') return settings.imdbMostPopularTvShowsEnabled;
	if (rowId === 'imdb-lowest-rated') return settings.imdbLowestRatedMoviesEnabled;
	if (rowId === 'imdb-top-english') return settings.imdbTopEnglishMoviesEnabled;
	if (rowId === 'seasonal') return settings.seasonalRowEnabled === true;
	if (rowId === 'mdblist_watching_now') return settings.mdblistWatchingNowEnabled === true;
	return true;
};

// Rows whose contents come through the Moonfin plugin. The home screen never builds these
// while the plugin is off, so only the editor has to ask.
export const isPluginSourcedRow = (rowId) =>
	rowId.startsWith('seerr_') ||
	rowId.startsWith('tmdb_') ||
	rowId === 'radarr_calendar' ||
	rowId === 'sonarr_calendar' ||
	rowId === 'seasonal' ||
	rowId === 'mdblist_watching_now';
