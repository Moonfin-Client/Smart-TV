import {useState, useEffect, useCallback, useRef} from 'react';
import Spotlight from '@enact/spotlight';

import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import {
	attachTrailerStream, fetchVideoStream, fetchSponsorSegments, isManifestUrl, nativeManifestSkipped,
	needsHlsJs, noteNativeManifest, playsManifestNatively, searchedTrailers, searchesForTrailer, watchManifestPlayback
} from '../../services/youtubeTrailer';
import serverLogger from '../../services/serverLogger';
import {getServerType} from '../../services/jellyfinApi';
import {volumeLevel} from '../../utils/volumeLevel';
import {trailerChoicesFor} from './trailerChoices';

// The caption text comes over as a blob, since a track element cant load it from YouTube across
// origins. It carries no label, so hls.js leaves it alone. YouTube pins its cues to the left edge,
// so their settings are dropped to leave them centered, and its machine captions open each cue
// with a line of one space, which would draw as an empty box.
const showCaptionTrack = (video, captionsUrl) => {
	let blobUrl = null;
	let track = null;
	let dropped = false;
	fetch(captionsUrl)
		.then((res) => (res.ok ? res.text() : null))
		.then((vtt) => {
			if (!vtt || dropped) return;
			const cleaned = vtt.replace(/^(\S+ --> \S+) .*$/gm, '$1').replace(/^[ \t]+\r?\n/gm, '');
			blobUrl = URL.createObjectURL(new Blob([cleaned], {type: 'text/vtt'}));
			track = document.createElement('track');
			track.kind = 'subtitles';
			track.src = blobUrl;
			video.appendChild(track);
			track.track.mode = 'showing';
		})
		.catch(() => {});
	return () => {
		dropped = true;
		if (track && track.parentNode) track.parentNode.removeChild(track);
		if (blobUrl) URL.revokeObjectURL(blobUrl);
	};
};

// Plays a title's trailer, or offers a choice when it has more than one. A local one goes to the
// real player, and a YouTube link plays in an overlay here, since the player has no way to open a
// stream that isn't on the server.
const useDetailsTrailer = ({item, effectiveApi, onPlay, trailerVolume, showCaptions, captionLanguage, seerrOnly, backRef}) => {
	const [trailerOverlay, setTrailerOverlay] = useState(null);
	const [trailerStreamUrl, setTrailerStreamUrl] = useState(null);
	const [trailerChoices, setTrailerChoices] = useState(null);

	const trailerVideoRef = useRef(null);
	const trailerAudioLanguageRef = useRef('');
	const trailerCaptionsRef = useRef('');
	const trailerVideoOnlyRef = useRef(null);
	const trailerResumeAtRef = useRef(0);
	const sponsorSegmentsRef = useRef([]);
	const sponsorSkipIntervalRef = useRef(null);
	const choicesOpenerRef = useRef(null);

	const playTrailer = useCallback(async (choice) => {
		await stopPlaybackForTrailer(trailerVideoRef.current);
		if (choice.local) {
			onPlay?.({
				...choice.local,
				_serverUrl: item._serverUrl,
				_serverType: item._serverType,
				_serverAccessToken: item._serverAccessToken,
				_serverUserId: item._serverUserId,
				_serverName: item._serverName,
				_serverId: item._serverId
			}, false, {});
			return;
		}
		setTrailerOverlay(choice.videoId);
		window.requestAnimationFrame(() => Spotlight.focus('trailer-close-btn'));
	}, [item, onPlay]);

	const handleTrailer = useCallback(() => {
		const openTrailer = async () => {
			if (!item?.Id) return;
			const opener = Spotlight.getCurrent();
			let localItems = [];

			try {
				// A Seerr title has no id the library would recognise, so asking it for a local
				// trailer only spends a failed request before the Seerr one plays.
				if (!seerrOnly && effectiveApi?.getLocalTrailers) {
					const localResult = await effectiveApi.getLocalTrailers(item.Id);
					localItems = Array.isArray(localResult?.Items)
						? localResult.Items
						: (Array.isArray(localResult) ? localResult : []);
				}
			} catch (err) { void err; }

			let choices = trailerChoicesFor(localItems, item.RemoteTrailers);
			if (!choices.length && searchesForTrailer(item, getServerType())) choices = trailerChoicesFor([], await searchedTrailers(item));
			if (choices.length > 1) {
				choicesOpenerRef.current = opener;
				setTrailerChoices(choices);
				return;
			}
			if (choices.length === 1) {
				playTrailer(choices[0]);
				return;
			}

			// A link that isnt YouTube can only go to the browser.
			const trailerUrl = (item.RemoteTrailers || []).map((t) => t?.Url || t?.url || '').find(Boolean);
			if (trailerUrl) {
				await stopPlaybackForTrailer(trailerVideoRef.current);
				window.open(trailerUrl, '_blank');
			}
		};

		openTrailer();
	}, [effectiveApi, item, playTrailer, seerrOnly]);

	const closeTrailerChoices = useCallback(() => {
		const opener = choicesOpenerRef.current;
		choicesOpenerRef.current = null;
		setTrailerChoices(null);
		window.requestAnimationFrame(() => {
			if (!opener || !Spotlight.focus(opener)) Spotlight.focus('details-action-buttons');
		});
	}, []);

	const pickTrailer = useCallback((choice) => {
		choicesOpenerRef.current = null;
		setTrailerChoices(null);
		playTrailer(choice);
	}, [playTrailer]);

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
		window.requestAnimationFrame(() => Spotlight.focus('details-action-buttons'));
	}, [clearSponsorSkip]);

	// BACK is settled by the app before the overlay ever sees the key, so the
	// trailer answers through the detail screen's handler like its other overlays.
	useEffect(() => {
		if (!backRef) return undefined;
		const handler = () => {
			if (trailerOverlay) {
				handleCloseTrailer();
				return true;
			}
			if (trailerChoices) {
				closeTrailerChoices();
				return true;
			}
			return false;
		};
		backRef.current = handler;
		return () => {
			if (backRef.current === handler) backRef.current = null;
		};
	}, [backRef, trailerOverlay, handleCloseTrailer, trailerChoices, closeTrailerChoices]);

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
				fetchVideoStream(trailerOverlay, true, captionLanguage, nativeManifestSkipped())
			]);
			if (cancelled) return;
			if (stream) {
				sponsorSegmentsRef.current = segments || [];
				trailerAudioLanguageRef.current = stream.audioLanguage || '';
				trailerCaptionsRef.current = stream.captionsUrl || '';
				trailerVideoOnlyRef.current = stream.videoOnly || null;
				trailerResumeAtRef.current = 0;
				serverLogger.playback(`Trailer: ${isManifestUrl(stream.url) ? `YouTube ${stream.videoOnly ? 'picture only ' : ''}manifest` : 'YouTube 360p file'}${stream.client ? ` from ${stream.client}` : ''}`);
				setTrailerStreamUrl(stream.url);
			} else {
				setTrailerOverlay(null);
			}
		};

		resolveStream();
		return () => { cancelled = true; };
	}, [trailerOverlay, captionLanguage]);

	// The overlay's video mounts once there is a stream to put on it. A manifest the TV cant play
	// gives way to YouTube's small muxed file.
	useEffect(() => {
		const video = trailerVideoRef.current;
		if (!trailerStreamUrl || !video) return undefined;
		let cancelled = false;
		let fellBack = false;
		let release = null;
		let releaseCaptions = null;
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
			fetchVideoStream(trailerOverlay, true, captionLanguage, true).then((stream) => {
				if (cancelled || !stream) return;
				trailerAudioLanguageRef.current = '';
				trailerCaptionsRef.current = stream.captionsUrl || '';
				trailerVideoOnlyRef.current = null;
				trailerResumeAtRef.current = at > 0 ? at : 0;
				setTrailerStreamUrl(stream.url);
			});
		};
		video.onerror = () => fallBack();

		const loadHls = needsHlsJs(trailerStreamUrl) ? import('hls.js').then((m) => m.default) : Promise.resolve(null);
		loadHls.then((Hls) => {
			if (cancelled) return;
			release = attachTrailerStream(video, trailerStreamUrl, {Hls, audioLanguage: trailerAudioLanguageRef.current, videoOnly: trailerVideoOnlyRef.current, startTime: trailerResumeAtRef.current, onError: () => fallBack()});
			if (showCaptions && trailerCaptionsRef.current) releaseCaptions = showCaptionTrack(video, trailerCaptionsRef.current);
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
			if (releaseCaptions) releaseCaptions();
			if (release) release();
		};
	}, [trailerStreamUrl, trailerOverlay, showCaptions, captionLanguage]);

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
		trailerVideoRef.current.volume = volumeLevel(trailerVolume);
	}, [trailerVolume, trailerOverlay, trailerStreamUrl]);

	return {
		trailerOverlay,
		trailerStreamUrl,
		trailerVideoRef,
		trailerChoices,
		handleTrailer,
		handleCloseTrailer,
		pickTrailer,
		closeTrailerChoices
	};
};

export default useDetailsTrailer;
