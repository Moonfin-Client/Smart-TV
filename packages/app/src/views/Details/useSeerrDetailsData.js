// Everything Seerr knows about one title: the payload itself, the recommendation and similar
// rows, and the viewer's permissions, quota and configured servers. Without a media id it sits
// idle, which is how a title Seerr has nothing to say about costs nothing.

import {useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import {getMediaDownloadSummary, isMediaInFlight} from '../../utils/seerrStatus';
import {streamingRegion} from '../../utils/seerrStreaming';

const DOWNLOAD_POLL_MS = 15000;
const WAITING_POLL_MS = 30000;

// How often the open page refetches the title, or null once nothing is on its way. A download
// moves every few seconds, while a request waiting on approval or on the library scan changes
// far less often.
export const statusPollInterval = (media) => {
	if (getMediaDownloadSummary(media, false) || getMediaDownloadSummary(media, true)) return DOWNLOAD_POLL_MS;
	if (isMediaInFlight(media, false) || isMediaInFlight(media, true)) return WAITING_POLL_MS;
	return null;
};

const useSeerrDetailsData = ({mediaId, mediaType, contextUser}) => {
	const [details, setDetails] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [recommendations, setRecommendations] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [quota, setQuota] = useState(null);
	const [userPermissions, setUserPermissions] = useState(null);
	// Seerr only lets someone take back their own request, so who is watching has to be known.
	const [currentUserId, setCurrentUserId] = useState(null);
	// Seerr only offers 4K for a kind of media when it has a 4K backend standing by for it,
	// which it reports for everyone rather than only for those who can read the server list.
	// Taken as offered until it says otherwise.
	const [is4kEnabled, setIs4kEnabled] = useState(true);
	const [servers, setServers] = useState([]);
	const [region, setRegion] = useState(null);
	// The first render of a new title still holds the last one's answer, and a screen that acts
	// on it opens the wrong title, so it stays hidden until the load below has cleared it.
	const [loadedFor, setLoadedFor] = useState(null);
	const stale = loadedFor?.mediaId !== mediaId || loadedFor?.mediaType !== mediaType;
	const shownDetails = stale ? null : details;

	useEffect(() => {
		setLoadedFor({mediaId, mediaType});
		setDetails(null);
		setRecommendations([]);
		setSimilar([]);
		setError(null);
		if (!mediaId || !mediaType) {
			setLoading(false);
			return;
		}

		// Moving to another title while a fetch is in flight has to drop the late answer,
		// or the screen shows one title's request state against another's artwork.
		let cancelled = false;

		const loadDetails = async () => {
			setLoading(true);
			try {
				const [data, userData, serversData, publicSettings] = await Promise.all([
					mediaType === 'movie'
						? seerrApi.getMovie(mediaId)
						: seerrApi.getTv(mediaId),
					seerrApi.getUser().catch(() => null),
					(mediaType === 'movie'
						? seerrApi.getRadarrServers()
						: seerrApi.getSonarrServers()
					).catch(() => []),
					seerrApi.getPublicSettings().catch(() => null)
				]);

				if (cancelled) return;
				setDetails(data);

				setCurrentUserId(userData?.id ?? contextUser?.id ?? null);

				const apiPermissions = userData?.permissions;
				const contextPermissions = contextUser?.permissions;
				if (apiPermissions != null) {
					setUserPermissions(apiPermissions);
				} else if (contextPermissions != null) {
					setUserPermissions(contextPermissions);
				} else {
					setUserPermissions(null);
				}

				// Quota is display only and the server still enforces it, so
				// a failed fetch just hides the quota lines.
				if (userData?.id != null) {
					seerrApi.getUserQuota(userData.id)
						.then((q) => { if (!cancelled) setQuota(q || null); })
						.catch(() => { if (!cancelled) setQuota(null); });
				}

				const serversList = Array.isArray(serversData) ? serversData : [];
				const serversWithType = serversList.map(s => ({
					...s,
					isRadarr: mediaType === 'movie'
				}));
				setServers(serversWithType);
				const offers4k = mediaType === 'movie'
					? publicSettings?.movie4kEnabled
					: publicSettings?.series4kEnabled;
				setIs4kEnabled(offers4k !== false);
				setRegion(streamingRegion(userData, publicSettings));

				const loadMultiplePages = async (fetcher) => {
					const allResults = [];
					for (let page = 1; page <= 3; page++) {
						try {
							const pageData = await fetcher(mediaId, page);
							if (pageData?.results) allResults.push(...pageData.results);
						} catch {
							break;
						}
					}
					return allResults;
				};

				const [recsData, similarData] = await Promise.all([
					loadMultiplePages(mediaType === 'movie'
						? seerrApi.getMovieRecommendations
						: seerrApi.getTvRecommendations
					),
					loadMultiplePages(mediaType === 'movie'
						? seerrApi.getMovieSimilar
						: seerrApi.getTvSimilar
					)
				]);
				if (cancelled) return;
				setRecommendations(recsData.slice(0, 20));
				setSimilar(similarData.slice(0, 20));
			} catch (err) {
				if (cancelled) return;
				console.error('Failed to load details:', err);
				setError(err.message || $L('Failed to load details'));
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		loadDetails();
		return () => { cancelled = true; };
	}, [mediaId, mediaType, contextUser]);

	const hdStatus = useMemo(() => shownDetails?.mediaInfo?.status ?? null, [shownDetails]);
	const status4k = useMemo(() => shownDetails?.mediaInfo?.status4k ?? null, [shownDetails]);

	const hdDownload = useMemo(() =>
		getMediaDownloadSummary(shownDetails?.mediaInfo, false),
	[shownDetails]
	);

	const download4k = useMemo(() =>
		getMediaDownloadSummary(shownDetails?.mediaInfo, true),
	[shownDetails]
	);

	const pollInterval = useMemo(() => statusPollInterval(shownDetails?.mediaInfo), [shownDetails]);

	// Keeps the refresh running from the request until the title lands, so the progress and
	// the Play button show up without leaving the page. Only the details payload is swapped
	// and a failed tick is ignored, so a blip never replaces the screen with an error.
	useEffect(() => {
		if (loading || !mediaId || !mediaType || !pollInterval) return;
		let closed = false;
		const id = setInterval(() => {
			// Nobody is looking at the page while the app is in the background.
			if (document.hidden) return;
			(mediaType === 'movie'
				? seerrApi.getMovie(mediaId)
				: seerrApi.getTv(mediaId)
			).then((data) => {
				if (data && !closed) setDetails(data);
			}).catch(() => {});
		}, pollInterval);
		return () => {
			closed = true;
			clearInterval(id);
		};
	}, [loading, pollInterval, mediaId, mediaType]);

	return {
		details: shownDetails,
		setDetails,
		loading: loading || stale,
		error,
		setError,
		recommendations: stale ? [] : recommendations,
		similar: stale ? [] : similar,
		quota,
		userPermissions,
		currentUserId,
		servers,
		is4kEnabled,
		streamingRegion: region,
		hdStatus,
		status4k,
		hdDownload,
		download4k
	};
};

export default useSeerrDetailsData;
