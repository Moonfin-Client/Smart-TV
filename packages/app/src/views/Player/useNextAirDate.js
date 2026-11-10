import {useEffect, useState} from 'react';
import {api as jellyfinApi, getApiKey, getServerUrl} from '../../services/jellyfinApi';
import {getApiForItem} from '../../services/connectionPool';
import {fetchUpcomingEpisode} from '../../utils/upcomingEpisode';
import {daysBetween, followsEpisode} from '../../utils/calendarEntries';

// Sonarr gives an instant, TMDB a bare day, which is that local day.
const airDateOf = (value) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
	const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * When the series' next episode airs, for the end card of an episode the library has nothing after
 * yet. Null while there's a next episode to play, or when nothing is known to air next.
 */
const useNextAirDate = ({item, nextEpisode, settings}) => {
	const [found, setFound] = useState(null);
	const enabled = settings.showNextAirDate !== false && settings.nextUpBehavior !== 'disabled';
	const seriesId = item?.Type === 'Episode' ? item.SeriesId : null;
	const itemId = item?.Id;

	useEffect(() => {
		setFound(null);
		if (!enabled || !seriesId) return undefined;
		let live = true;
		(async () => {
			try {
				// The lookup goes by the series' provider ids, which the episode doesn't carry.
				const series = await (getApiForItem(item) || jellyfinApi).getItem(seriesId);
				const info = await fetchUpcomingEpisode({
					item: series,
					settings,
					serverUrl: item._serverUrl || getServerUrl(),
					serverToken: item._serverAccessToken || getApiKey()
				});
				const date = info && airDateOf(info.airDate);
				if (!live || !date || daysBetween(new Date(), date) < 0) return;
				if (!followsEpisode(info, item.ParentIndexNumber, item.IndexNumber)) return;
				setFound({
					itemId,
					seasonNumber: info.seasonNumber,
					episodeNumber: info.episodeNumber,
					date,
					title: info.title && info.title !== 'TBA' ? info.title : (item.SeriesName || series?.Name || '')
				});
			} catch (err) {
				console.warn('[Player] Next air date lookup failed:', err);
			}
		})();
		return () => {
			live = false;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [itemId, seriesId, enabled]);

	return !nextEpisode && found && found.itemId === itemId ? found : null;
};

export default useNextAirDate;
