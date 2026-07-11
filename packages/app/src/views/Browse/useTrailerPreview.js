import {useState, useEffect, useCallback, useRef} from 'react';
import {buildQueryString} from '../../utils/urlCompat';
import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import {createApiForServer, getApiKey, getServerUrl as getDefaultServerUrl} from '../../services/jellyfinApi';
import css from './Browse.module.less';

const TRAILER_REVEAL_MS = 4000;
// the preview plays into a plain HTML5 video element which cant decode a server
// transcode on Tizen, so direct play the original trailer file instead
const LOCAL_TRAILER_STREAM_PARAMS = {
	Static: 'true'
};

// Shared trailer preview engine for the home banners. Resolves a local or
// youtube trailer for the current item, plays a muted preview into a container
// the caller renders, and reveals it after a short delay.
export default function useTrailerPreview({currentItem, isVisible, enabled, preferMuted, api, getItemServerUrl}) {
	const [trailerActive, setTrailerActive] = useState(false);
	const [screensaverActive, setScreensaverActive] = useState(false);

	const trailerContainerRef = useRef(null);
	const trailerVideoRef = useRef(null);
	const trailerSkipIntervalRef = useRef(null);
	const trailerStateRef = useRef('idle');
	const trailerVideoIdRef = useRef(null);
	const trailerRevealTimerRef = useRef(null);
	const sponsorSegmentsRef = useRef([]);

	const stopTrailer = useCallback(() => {
		if (trailerRevealTimerRef.current) {
			clearTimeout(trailerRevealTimerRef.current);
			trailerRevealTimerRef.current = null;
		}
		if (trailerSkipIntervalRef.current) {
			clearInterval(trailerSkipIntervalRef.current);
			trailerSkipIntervalRef.current = null;
		}
		setTrailerActive(false);
		const video = trailerVideoRef.current;
		if (video) {
			try { video.pause(); } catch (e) { /* ignore */ }
			try {
				video.src = '';
				video.removeAttribute('src');
				if (video.srcObject) video.srcObject = null;
			} catch (e) { /* ignore */ }
			video.classList.remove(css.trailerVisible);
			video.classList.remove(css.trailerVideo);
			video.onplaying = null;
			video.onended = null;
			video.onerror = null;
		}
		trailerStateRef.current = 'idle';
		trailerVideoIdRef.current = null;
		sponsorSegmentsRef.current = [];
	}, []);

	const getRemoteTrailersForItem = useCallback(async (item) => {
		if (!item?.Id) return [];

		const initialTrailers = Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : [];
		if (initialTrailers.length > 0) return initialTrailers;

		try {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			if (!serverApi?.getItem) return [];
			const detailed = await serverApi.getItem(item.Id);
			return Array.isArray(detailed?.RemoteTrailers) ? detailed.RemoteTrailers : [];
		} catch {
			return [];
		}
	}, [api]);

	const getLocalTrailerStreamUrlForItem = useCallback(async (item) => {
		if (!item?.Id) return null;

		try {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			if (!serverApi?.getLocalTrailers) return null;

			const trailers = await serverApi.getLocalTrailers(item.Id);
			const trailerItems = Array.isArray(trailers?.Items) ? trailers.Items : Array.isArray(trailers) ? trailers : [];
			const trailerId = trailerItems.find((t) => t?.Id)?.Id;
			if (!trailerId) return null;

			const resolvedServerUrl = item._serverUrl || getItemServerUrl(item) || getDefaultServerUrl();
			if (!resolvedServerUrl) return null;

			const resolvedToken = item._serverAccessToken || getApiKey();
			const params = {
				...LOCAL_TRAILER_STREAM_PARAMS,
				...(resolvedToken ? {ApiKey: resolvedToken} : {})
			};
			return `${resolvedServerUrl}/Videos/${encodeURIComponent(trailerId)}/stream?${buildQueryString(params)}`;
		} catch {
			return null;
		}
	}, [api, getItemServerUrl]);

	const startTrailerPreview = useCallback(async (videoId, directUrl = null) => {
		const requestId = videoId || directUrl || null;
		trailerStateRef.current = 'resolving';
		trailerVideoIdRef.current = requestId;
		await stopPlaybackForTrailer(trailerVideoRef.current);

		const [{fetchSponsorSegments, fetchVideoStreamUrl, getTrailerStartTime}, {getSharedVideoElement}] = await Promise.all([
			import('../../services/youtubeTrailer'),
			import('@moonfin/platform-webos/video')
		]);

		const container = trailerContainerRef.current;
		if (!container) return;

		let video = trailerVideoRef.current;
		if (!video) {
			video = getSharedVideoElement();
			trailerVideoRef.current = video;
		}
		video.className = css.trailerVideo;
		video.playsInline = true;
		video.controls = false;

		video.muted = preferMuted;
		video.volume = preferMuted ? 0 : 1;
		video.autoplay = true;
		video.classList.remove(css.trailerVisible);

		if (!container.contains(video)) {
			container.appendChild(video);
		}

		const clearSkipInterval = () => {
			if (trailerSkipIntervalRef.current) {
				clearInterval(trailerSkipIntervalRef.current);
				trailerSkipIntervalRef.current = null;
			}
		};

		const isStale = () => trailerStateRef.current !== 'resolving' || trailerVideoIdRef.current !== requestId;

		// a local trailer plays as a direct url, a youtube id resolves to a
		// stream first. Youtube is tried when a local trailer cant be decoded
		const resolveStream = async (attempt) => {
			if (attempt.url) return {streamUrl: attempt.url, segments: [], startTime: 0};
			try {
				const results = await Promise.all([
					fetchSponsorSegments(attempt.id).catch(() => []),
					fetchVideoStreamUrl(attempt.id, false)
				]);
				return {streamUrl: results[1], segments: results[0], startTime: getTrailerStartTime(results[0])};
			} catch (e) {
				return {streamUrl: null, segments: [], startTime: 0};
			}
		};

		const attempts = [];
		if (directUrl) attempts.push({url: directUrl});
		if (videoId) attempts.push({id: videoId});

		const tryAttempt = async (index) => {
			if (isStale()) return;
			if (index >= attempts.length) {
				trailerStateRef.current = 'unavailable';
				video.classList.remove(css.trailerVisible);
				return;
			}

			const {streamUrl, segments, startTime} = await resolveStream(attempts[index]);
			if (isStale()) return;
			if (!streamUrl) {
				tryAttempt(index + 1);
				return;
			}
			sponsorSegmentsRef.current = segments;

			clearSkipInterval();
			if (segments.length > 0) {
				trailerSkipIntervalRef.current = setInterval(() => {
					if (!video || video.paused) return;
					const t = video.currentTime;
					for (let i = 0; i < segments.length; i++) {
						if (t >= segments[i].start && t < segments[i].end - 0.5) {
							video.currentTime = segments[i].end;
							break;
						}
					}
				}, 500);
			}

			video.onplaying = () => {
				if (trailerStateRef.current === 'resolving' && trailerVideoIdRef.current === requestId) {
					trailerStateRef.current = 'playing';
					trailerRevealTimerRef.current = setTimeout(() => {
						if (trailerStateRef.current === 'playing' && trailerVideoIdRef.current === requestId) {
							video.classList.add(css.trailerVisible);
							setTrailerActive(true);
						}
					}, TRAILER_REVEAL_MS);
				}
			};

			video.onended = () => {
				stopTrailer();
			};

			video.onerror = () => {
				if (trailerVideoIdRef.current !== requestId) return;
				clearSkipInterval();
				video.classList.remove(css.trailerVisible);
				if (trailerStateRef.current === 'resolving') {
					tryAttempt(index + 1);
				} else {
					trailerStateRef.current = 'unavailable';
				}
			};

			video.src = streamUrl;
			if (startTime > 0) video.currentTime = startTime;
			const playPromise = video.play();
			if (playPromise) {
				playPromise.catch(() => {
					// autoplay with audio can get blocked, so retry muted to keep previews working
					if (!video || video.muted) return;
					video.muted = true;
					video.volume = 0;
					const retryPromise = video.play();
					if (retryPromise) retryPromise.catch(() => {});
				});
			}
		};

		tryAttempt(0);
	}, [stopTrailer, preferMuted]);

	useEffect(() => {
		if (!enabled || !isVisible || !currentItem || screensaverActive) {
			stopTrailer();
			return;
		}

		stopTrailer();
		let cancelled = false;

		const resolveAndStartTrailer = async () => {
			try {
				const {extractYouTubeId, extractYouTubeIdFromUrl} = await import('../../services/youtubeTrailer');
				if (cancelled) return;

				let directUrl = await getLocalTrailerStreamUrlForItem(currentItem);
				if (cancelled) return;

				// resolve a youtube trailer as the fallback for when a local
				// trailer cant be decoded by the web engine
				let resolvedVideoId = extractYouTubeId(currentItem);

				if (!directUrl && !resolvedVideoId) {
					const remoteTrailers = await getRemoteTrailersForItem(currentItem);
					if (cancelled) return;

					for (let i = 0; i < remoteTrailers.length; i++) {
						const trailerUrl = remoteTrailers[i]?.Url || remoteTrailers[i]?.url || '';
						if (!trailerUrl) continue;

						const trailerVideoId = extractYouTubeIdFromUrl(trailerUrl);
						if (trailerVideoId) {
							resolvedVideoId = trailerVideoId;
							break;
						}

						if (!directUrl) {
							directUrl = trailerUrl;
						}
					}
				}

				if (cancelled) return;

				if (resolvedVideoId || directUrl) {
					startTrailerPreview(resolvedVideoId, directUrl);
				}
			} catch (e) {
				if (!cancelled) stopTrailer();
			}
		};

		resolveAndStartTrailer();

		return () => {
			cancelled = true;
			stopTrailer();
		};
	}, [currentItem, isVisible, screensaverActive, enabled, getLocalTrailerStreamUrlForItem, getRemoteTrailersForItem, startTrailerPreview, stopTrailer]);

	useEffect(() => {
		const handleScreensaver = (e) => setScreensaverActive(!!e.detail?.active);
		window.addEventListener('moonfin:screensaver', handleScreensaver);
		return () => window.removeEventListener('moonfin:screensaver', handleScreensaver);
	}, []);

	useEffect(() => {
		const handleVisibility = () => {
			if (document.hidden) stopTrailer();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	}, [stopTrailer]);

	useEffect(() => {
		return () => stopTrailer();
	}, [stopTrailer]);

	return {trailerActive, trailerContainerRef};
}
