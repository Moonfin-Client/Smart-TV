import {useState, useEffect} from 'react';

import {useSettings} from '../../context/SettingsContext';
import {
	fetchSeriesMarkers,
	fetchItemMarkers,
	audioForItem,
	markerForEpisode,
	audioForSeason,
	areAnimeMarkersEnabled
} from '../../services/animeMarkersApi';

// Every marker for one series, keyed by episode and season id.

export const useAnimeMarkers = (seriesId, {serverUrl, delayMs = 0} = {}) => {
	const {settings} = useSettings();
	const enabled = areAnimeMarkersEnabled(settings);
	const [markers, setMarkers] = useState(null);

	useEffect(() => {
		if (!enabled || !seriesId) {
			setMarkers(null);
			return undefined;
		}

		let cancelled = false;
		const ask = () => {
			fetchSeriesMarkers(seriesId, {serverUrl}).then(result => {
				if (!cancelled) setMarkers(result);
			});
		};

		if (delayMs > 0) {
			const timer = setTimeout(ask, delayMs);
			return () => {
				cancelled = true;
				clearTimeout(timer);
			};
		}

		ask();
		return () => { cancelled = true; };
	}, [enabled, seriesId, serverUrl, delayMs]);

	return markers;
};


export const useEpisodeMarker = (episode, {serverUrl, delayMs} = {}) => {
	const markers = useAnimeMarkers(episode?.SeriesId, {serverUrl, delayMs});
	return markerForEpisode(markers, episode?.Id);
};

// The subbed/dubbed verdict for a standalone item, which in practice means a movie.
export const useItemAudio = (item, {serverUrl, delayMs = 0} = {}) => {
	const {settings} = useSettings();
	const enabled = areAnimeMarkersEnabled(settings);
	const itemId = item?.Id;
	const [audio, setAudio] = useState(null);

	useEffect(() => {
		if (!enabled || !itemId) {
			setAudio(null);
			return undefined;
		}

		let cancelled = false;
		const ask = () => {
			fetchItemMarkers([itemId], {serverUrl}).then(() => {
				if (!cancelled) setAudio(audioForItem(itemId));
			});
		};

		if (delayMs > 0) {
			const timer = setTimeout(ask, delayMs);
			return () => {
				cancelled = true;
				clearTimeout(timer);
			};
		}

		ask();
		return () => { cancelled = true; };
	}, [enabled, itemId, serverUrl, delayMs]);

	return audio;
};

export {markerForEpisode, audioForSeason};
