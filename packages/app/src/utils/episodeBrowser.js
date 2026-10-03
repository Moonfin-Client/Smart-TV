import {isPlayableEpisode} from './nextEpisode';

// The in-player episode browser: which playbacks offer it, and the small pieces of data it
// works from. The fetching lives in views/Player/useSeriesEpisodes.js.

// Only a series episode has a season to browse. A movie, a channel and a track have none, so
// they never get the button.
export const canBrowseEpisodes = ({item, isLiveTV = false, isAudioMode = false}) =>
	!isLiveTV && !isAudioMode && item?.Type === 'Episode' && Boolean(item?.SeriesId);

export const seasonIdOf = (item) => item?.SeasonId || item?.ParentId || null;

// The season the browser opens on: the one playing, or the first if the server no longer
// lists it. Ids are compared as strings because Emby hands them back as numbers.
export const initialSeasonId = (seasons, item) => {
	const list = seasons || [];
	const current = seasonIdOf(item);
	if (current != null && list.some((season) => String(season.Id) === String(current))) return current;
	return list.length ? list[0].Id : null;
};

// Missing and unaired episodes are listed with real ones but have no file to play.
export const browsableEpisodes = (episodes) => (episodes || []).filter(isPlayableEpisode);

const SERVER_FIELDS = ['_serverUrl', '_serverType', '_serverAccessToken', '_serverUserId', '_serverName', '_serverId'];

// Episodes fetched from a server other than the default one have to say which, or playback
// would ask the wrong server for them. The playing item already knows.
export const tagWithServerOf = (source, items) => {
	if (!source?._serverUrl) return items;
	const tag = (entry) => SERVER_FIELDS.reduce((tagged, field) => ({...tagged, [field]: source[field]}), {...entry});
	return Array.isArray(items) ? items.map(tag) : tag(items);
};

// How far through an episode is, as the bar on a home card draws it. The server reports the
// percentage on its own, and the position over the runtime stands in when it does not.
export const watchedPercent = (episode) => {
	const data = episode?.UserData;
	if (!data) return 0;
	let percent = data.PlayedPercentage;
	if (!(percent > 0) && data.PlaybackPositionTicks > 0 && episode.RunTimeTicks > 0) {
		percent = (data.PlaybackPositionTicks / episode.RunTimeTicks) * 100;
	}
	return percent > 0 ? Math.min(100, percent) : 0;
};
