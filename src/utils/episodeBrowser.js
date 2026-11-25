import {isPlayableEpisode} from './nextEpisode';

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

// How far through an episode is, as the bar on a home card draws it. The server reports the
// percentage on its own, and the position over the runtime stands in when it doesn't.
export const watchedPercent = (episode) => {
	const data = episode?.UserData;
	if (!data) return 0;
	let percent = data.PlayedPercentage;
	if (!(percent > 0) && data.PlaybackPositionTicks > 0 && episode.RunTimeTicks > 0) {
		percent = (data.PlaybackPositionTicks / episode.RunTimeTicks) * 100;
	}
	return percent > 0 ? Math.min(100, percent) : 0;
};
