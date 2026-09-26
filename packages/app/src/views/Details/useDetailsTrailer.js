import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';

import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import {attachTrailerStream, fetchVideoStream, extractYouTubeIdFromUrl, fetchSponsorSegments, isManifestUrl, needsHlsJs} from '../../services/youtubeTrailer';
import {isBackKey} from '../../utils/keys';

// Plays a title's trailer. A local one goes to the real player, and a YouTube link plays in
// an overlay here, since the player has no way to open a stream that isn't on the server.
const useDetailsTrailer = ({item, effectiveApi, onPlay, trailerMuted, seerrOnly}) => {
	const [trailerOverlay, setTrailerOverlay] = useState(null);
	const [trailerStreamUrl, setTrailerStreamUrl] = useState(null);

	const trailerVideoRef = useRef(null);
	const trailerAudioLanguageRef = useRef('');
	const sponsorSegmentsRef = useRef([]);
	const sponsorSkipIntervalRef = useRef(null);

	const handleTrailer = useCallback(() => {
		const openTrailer = async () => {
			if (!item?.Id) return;
			await stopPlaybackForTrailer(trailerVideoRef.current);

			try {
				// A Seerr title has no id the library would recognise, so asking it for a local
				// trailer only spends a failed request before the Seerr one plays.
				if (!seerrOnly && effectiveApi?.getLocalTrailers) {
					const localResult = await effectiveApi.getLocalTrailers(item.Id);
					const localItems = Array.isArray(localResult?.Items)
						? localResult.Items
						: (Array.isArray(localResult) ? localResult : []);
					const localTrailer = localItems.find((t) => t?.Id);

					if (localTrailer) {
						const trailerItem = {
							...localTrailer,
							_serverUrl: item._serverUrl,
							_serverType: item._serverType,
							_serverAccessToken: item._serverAccessToken,
							_serverUserId: item._serverUserId,
							_serverName: item._serverName,
							_serverId: item._serverId
						};
						onPlay?.(trailerItem, false, {});
						return;
					}
				}
				} catch (err) { void err; }

			if (item?.RemoteTrailers?.length > 0) {
				for (let i = 0; i < item.RemoteTrailers.length; i++) {
					const trailerUrl = item.RemoteTrailers[i]?.Url || item.RemoteTrailers[i]?.url || '';
					if (!trailerUrl) continue;

					const videoId = extractYouTubeIdFromUrl(trailerUrl);
					if (videoId) {
						setTrailerOverlay(videoId);
						window.requestAnimationFrame(() => Spotlight.focus('trailer-close-btn'));
						return;
					}

					window.open(trailerUrl, '_blank');
					return;
				}
			}
		};

		openTrailer();
	}, [effectiveApi, item, onPlay, seerrOnly]);

	const clearSponsorSkip = useCallback(() => {
		if (sponsorSkipIntervalRef.current) {
			clearInterval(sponsorSkipIntervalRef.current);
			sponsorSkipIntervalRef.current = null;
		}
	}, []);

	const handleCloseTrailer = useCallback(() => {
		clearSponsorSkip();
		sponsorSegmentsRef.current = [];
		if (trailerVideoRef.current) {
			try {
				trailerVideoRef.current.pause();
				// Calling load() here corrupts the Chrome 53 hardware decoder.
				trailerVideoRef.current.src = '';
				trailerVideoRef.current.removeAttribute('src');
			} catch { /* ignore */ }
		}
		setTrailerOverlay(null);
		setTrailerStreamUrl(null);
	}, [clearSponsorSkip]);

	const handleTrailerOverlayKeyDown = useCallback((e) => {
		if (isBackKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			handleCloseTrailer();
		}
	}, [handleCloseTrailer]);

	useEffect(() => {
		if (!trailerOverlay) {
			setTrailerStreamUrl(null);
			return;
		}
		let cancelled = false;

		const resolveStream = async () => {
			// Segments are a bonus, so a failed lookup must not hold up the trailer.
			const [segments, stream] = await Promise.all([
				fetchSponsorSegments(trailerOverlay).catch(() => []),
				fetchVideoStream(trailerOverlay, true)
			]);
			if (cancelled) return;
			if (stream) {
				sponsorSegmentsRef.current = segments || [];
				trailerAudioLanguageRef.current = stream.audioLanguage || '';
				setTrailerStreamUrl(stream.url);
			} else {
				setTrailerOverlay(null);
			}
		};

		resolveStream();
		return () => { cancelled = true; };
	}, [trailerOverlay]);

	// The overlay's video mounts once there is a stream to put on it. A manifest the TV cant play
	// gives way to YouTube's small muxed file.
	useEffect(() => {
		const video = trailerVideoRef.current;
		if (!trailerStreamUrl || !video) return undefined;
		let cancelled = false;
		let fellBack = false;
		let release = null;

		const fallBack = () => {
			if (cancelled || fellBack || !isManifestUrl(trailerStreamUrl)) return;
			fellBack = true;
			fetchVideoStream(trailerOverlay, true, '', true).then((stream) => {
				if (cancelled || !stream) return;
				trailerAudioLanguageRef.current = '';
				setTrailerStreamUrl(stream.url);
			});
		};
		video.onerror = fallBack;

		const loadHls = needsHlsJs(trailerStreamUrl) ? import('hls.js').then((m) => m.default) : Promise.resolve(null);
		loadHls.then((Hls) => {
			if (cancelled) return;
			release = attachTrailerStream(video, trailerStreamUrl, {Hls, audioLanguage: trailerAudioLanguageRef.current, onError: fallBack});
		}).catch(fallBack);

		return () => {
			cancelled = true;
			video.onerror = null;
			if (release) release();
		};
	}, [trailerStreamUrl, trailerOverlay]);

	// Skips sponsor segments by polling, the same way the home screen previews do.
	useEffect(() => {
		const segments = sponsorSegmentsRef.current;
		if (!trailerStreamUrl || segments.length === 0) return undefined;

		sponsorSkipIntervalRef.current = setInterval(() => {
			const video = trailerVideoRef.current;
			if (!video || video.paused) return;
			const t = video.currentTime;
			for (let i = 0; i < segments.length; i++) {
				if (t >= segments[i].start && t < segments[i].end - 0.5) {
					video.currentTime = segments[i].end;
					break;
				}
			}
		}, 500);

		return clearSponsorSkip;
	}, [trailerStreamUrl, clearSponsorSkip]);

	useEffect(() => {
		if (!trailerOverlay || !trailerVideoRef.current) return;
		const video = trailerVideoRef.current;
		const muted = !!trailerMuted;
		video.muted = muted;
		video.defaultMuted = muted;
		video.volume = muted ? 0 : 1;
	}, [trailerMuted, trailerOverlay, trailerStreamUrl]);

	return {
		trailerOverlay,
		trailerStreamUrl,
		trailerVideoRef,
		handleTrailer,
		handleCloseTrailer,
		handleTrailerOverlayKeyDown
	};
};

export default useDetailsTrailer;
