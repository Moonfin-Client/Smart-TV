import {useState, useEffect, useCallback, useRef} from 'react';

import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import {
	attachTrailerStream, fetchVideoStream, extractYouTubeIdFromUrl, fetchSponsorSegments, isManifestUrl, nativeManifestSkipped,
	needsHlsJs, noteNativeManifest, playsManifestNatively, watchManifestPlayback
} from '../../services/youtubeTrailer';
import serverLogger from '../../services/serverLogger';
import {isBackKey} from '../../utils/keys';

// Plays a title's trailer. A local one goes to the real player, and a YouTube link plays in
// an overlay here, since the player has no way to open a stream that isn't on the server.
const useDetailsTrailer = ({item, effectiveApi, onPlay, trailerMuted, seerrOnly}) => {
	const [trailerOverlay, setTrailerOverlay] = useState(null);
	const [trailerStreamUrl, setTrailerStreamUrl] = useState(null);

	const trailerVideoRef = useRef(null);
	const trailerAudioLanguageRef = useRef('');
	const trailerResumeAtRef = useRef(0);
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
				fetchVideoStream(trailerOverlay, true, '', nativeManifestSkipped())
			]);
			if (cancelled) return;
			if (stream) {
				sponsorSegmentsRef.current = segments || [];
				trailerAudioLanguageRef.current = stream.audioLanguage || '';
				trailerResumeAtRef.current = 0;
				serverLogger.playback(`Trailer: ${isManifestUrl(stream.url) ? 'YouTube manifest' : 'YouTube 360p file'}${stream.client ? ` from ${stream.client}` : ''}`);
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
		let stopWatch = null;
		const nativeManifest = playsManifestNatively(trailerStreamUrl);

		// A manifest that errors, never starts or stops partway gives way to the muxed file, picking up
		// where it stopped.
		const fallBack = (reason = 'failed to play') => {
			if (cancelled || fellBack || !isManifestUrl(trailerStreamUrl)) return;
			fellBack = true;
			if (stopWatch) stopWatch();
			serverLogger.warn(serverLogger.LOG_CATEGORIES.PLAYBACK, `Trailer ${reason} on the YouTube manifest, trying the 360p file`);
			if (nativeManifest) noteNativeManifest(false);
			const at = video.currentTime;
			fetchVideoStream(trailerOverlay, true, '', true).then((stream) => {
				if (cancelled || !stream) return;
				trailerAudioLanguageRef.current = '';
				trailerResumeAtRef.current = at > 0 ? at : 0;
				setTrailerStreamUrl(stream.url);
			});
		};
		video.onerror = () => fallBack();

		const loadHls = needsHlsJs(trailerStreamUrl) ? import('hls.js').then((m) => m.default) : Promise.resolve(null);
		loadHls.then((Hls) => {
			if (cancelled) return;
			release = attachTrailerStream(video, trailerStreamUrl, {Hls, audioLanguage: trailerAudioLanguageRef.current, startTime: trailerResumeAtRef.current, onError: () => fallBack()});
			if (isManifestUrl(trailerStreamUrl)) {
				stopWatch = watchManifestPlayback(video, {
					onStall: fallBack,
					onConfirmed: nativeManifest ? () => noteNativeManifest(true) : null
				});
			}
		}).catch(() => fallBack());

		return () => {
			cancelled = true;
			video.onerror = null;
			if (stopWatch) stopWatch();
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
