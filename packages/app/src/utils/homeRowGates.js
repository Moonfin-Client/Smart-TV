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
	return true;
};

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

// The external rows (IMDb, TMDB, MDBList Watching Now, seasonal and the calendars) have no switch
// of their own. The row editor offers one, and Home draws it when it's on, only while the server
// can fill it. Null for every other row. Silo makes its own seasonal row, plugin or not.
export const isExternalRowAvailable = (rowId, {settings, pluginInfo, serverType}) => {
	const plugin = Boolean(settings.useMoonfinPlugin) && Boolean(pluginInfo);
	if (rowId.startsWith('imdb-')) return plugin;
	if (rowId.startsWith('tmdb_')) return plugin && (pluginInfo.tmdbAvailable === true || hasText(settings.tmdbApiKey));
	if (rowId === 'mdblist_watching_now') return plugin && (pluginInfo.mdblistAvailable === true || hasText(settings.mdblistApiKey));
	if (rowId === 'seasonal') return plugin || serverType === 'silo';
	if (rowId === 'radarr_calendar' || rowId === 'sonarr_calendar') return plugin && pluginInfo.calendarAvailable === true;
	return null;
};

// The Seerr rows come through the Moonfin plugin. The home screen never builds them while the
// plugin is off, so only the editor has to ask. The external rows answer to isExternalRowAvailable.
export const isPluginSourcedRow = (rowId) => rowId.startsWith('seerr_');
