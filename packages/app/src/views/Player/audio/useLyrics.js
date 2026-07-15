import {useState, useEffect, useMemo} from 'react';
import {api as jellyfinApi, createApiForServer} from '../../../services/jellyfinApi';
import {parseLyricsResponse} from '../PlayerConstants';

// Loads and tracks lyrics for the playing track. A 404 just means the track has
// none, so it resolves to an empty list rather than an error.
const useLyrics = (item, isAudioMode, currentTime) => {
	const [lines, setLines] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			if (!isAudioMode || !item?.Id) {
				setLines([]);
				setError(null);
				setIsLoading(false);
				return;
			}

			setIsLoading(true);
			setError(null);

			try {
				const hasServerContext = item._serverUrl && item._serverAccessToken && item._serverUserId;
				const apiClient = hasServerContext
					? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
					: jellyfinApi;
				const response = await apiClient.getLyrics(item.Id);
				if (cancelled) return;
				setLines(parseLyricsResponse(response));
			} catch (err) {
				if (cancelled) return;
				setLines([]);
				if (err?.status && err.status !== 404) {
					setError('Unable to load lyrics right now.');
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		load();

		return () => { cancelled = true; };
	}, [isAudioMode, item?.Id, item?._serverUrl, item?._serverAccessToken, item?._serverUserId]);

	// Unsynced lyrics have no timings, so there is no line to highlight.
	const activeIndex = useMemo(() => {
		if (!lines.length) return -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (typeof lines[i].startSeconds === 'number' && currentTime >= lines[i].startSeconds) {
				return i;
			}
		}
		return -1;
	}, [lines, currentTime]);

	const isSynced = useMemo(() => lines.some((l) => typeof l.startSeconds === 'number'), [lines]);

	return {lines, isLoading, error, activeIndex, isSynced};
};

export default useLyrics;
