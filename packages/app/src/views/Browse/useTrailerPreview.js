import {useState, useEffect, useCallback, useRef} from 'react';
import {buildQueryString} from '../../utils/urlCompat';
import {isPlexServer, withPlexToken} from '../../utils/plexUrls';
import {stopPlaybackForTrailer} from '../../utils/trailerPlayback';
import {claimSharedVideo, isMusicPlaying, ownsSharedVideo, releaseSharedVideo} from '../../utils/sharedVideoOwner';
import {coverVideoInBox} from '../../utils/videoCover';
import {volumeLevel} from '../../utils/volumeLevel';
import {createApiForServer, getApiKey, getServerType, getServerUrl as getDefaultServerUrl} from '../../services/jellyfinApi';
import serverLogger from '../../services/serverLogger';
import {afterHomeReady} from '../../utils/homeReady';
import css from './Browse.module.less';

const TRAILER_REVEAL_MS = 3000;
// The element keeps the trailer's own shape and overhangs the container, which crops
// it instead of squashing it into a frame that isnt 16:9.
const TRAILER_ZOOM = 1.15;
// the preview plays into a plain HTML5 video element which cant decode a server
// transcode on Tizen, so direct play the original trailer file instead
const LOCAL_TRAILER_STREAM_PARAMS = {
	Static: 'true'
};

// Shared trailer preview engine for the home banners. Resolves a local or
// youtube trailer for the current item, plays a muted preview into a container
// the caller renders, and reveals it after a short delay.
export default function useTrailerPreview({currentItem, isVisible, enabled, preferMuted, volume, showCaptions = false, captionLanguage = '', api, getItemServerUrl, onEnded, hidesChrome = false}) {
	const [trailerActive, setTrailerActive] = useState(false);
	// Set from the playing event, a few seconds before trailerActive reveals the video, so the
	// banners can hold their carousel while the trailer is already audible.
	const [trailerHolding, setTrailerHolding] = useState(false);
	const [screensaverActive, setScreensaverActive] = useState(false);
	const [homeReady, setHomeReady] = useState(false);

	// Mirrored so a new handler each render cant restart the trailer, since
	// startTrailerPreview sits in the main effect's dependencies.
	const onEndedRef = useRef(onEnded);
	useEffect(() => {
		onEndedRef.current = onEnded;
	}, [onEnded]);

	const trailerContainerRef = useRef(null);
	const trailerVideoRef = useRef(null);
	const trailerSkipIntervalRef = useRef(null);
	const trailerStateRef = useRef('idle');
	const trailerVideoIdRef = useRef(null);
	const trailerRevealTimerRef = useRef(null);
	const sponsorSegmentsRef = useRef([]);
	const trailerCaptionBlobRef = useRef(null);
	const trailerCaptionBoxRef = useRef(null);
	const releaseStreamRef = useRef(null);
	const stopWatchRef = useRef(null);

	const releaseStream = useCallback(() => {
		if (releaseStreamRef.current) {
			releaseStreamRef.current();
			releaseStreamRef.current = null;
		}
	}, []);

	// The video element is shared, so a caption track left behind would show its
	// cues over whatever plays it next.
	const removeCaptionTrack = useCallback((video) => {
		if (video) {
			const tracks = video.querySelectorAll('track');
			for (let i = 0; i < tracks.length; i++) {
				if (tracks[i].track) tracks[i].track.oncuechange = null;
				video.removeChild(tracks[i]);
			}
		}
		if (trailerCaptionBoxRef.current) {
			const box = trailerCaptionBoxRef.current;
			if (box.parentNode) box.parentNode.removeChild(box);
			trailerCaptionBoxRef.current = null;
		}
		if (trailerCaptionBlobRef.current) {
			try { URL.revokeObjectURL(trailerCaptionBlobRef.current); } catch (e) { /* ignore */ }
			trailerCaptionBlobRef.current = null;
		}
	}, []);

	const stopWatch = useCallback(() => {
		if (stopWatchRef.current) {
			stopWatchRef.current();
			stopWatchRef.current = null;
		}
	}, []);

	const stopTrailer = useCallback(() => {
		stopWatch();
		if (trailerRevealTimerRef.current) {
			clearTimeout(trailerRevealTimerRef.current);
			trailerRevealTimerRef.current = null;
		}
		if (trailerSkipIntervalRef.current) {
			clearInterval(trailerSkipIntervalRef.current);
			trailerSkipIntervalRef.current = null;
		}
		setTrailerActive(false);
		setTrailerHolding(false);
		// The element is only touched while this is its owner, so the cleanups that run
		// on an item change or a hide can't clear a card preview that took it over.
		const video = ownsSharedVideo('trailer') ? trailerVideoRef.current : null;
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
			video.onloadedmetadata = null;
			video.onresize = null;
			releaseStream();
		}
		removeCaptionTrack(video);
		releaseSharedVideo('trailer');
		trailerStateRef.current = 'idle';
		trailerVideoIdRef.current = null;
		sponsorSegmentsRef.current = [];
	}, [stopWatch, removeCaptionTrack, releaseStream]);

	const getRemoteTrailersForItem = useCallback(async (item) => {
		if (!item?.Id) return [];

		const initialTrailers = Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : [];
		// A slide from an outside list isn't on the server, so what it came with is all there is.
		if (initialTrailers.length > 0 || item._external) return initialTrailers;
		const youtube = await import('../../services/youtubeTrailer');
		if (youtube.searchesForTrailer(item, getServerType())) return youtube.searchedTrailers(item);

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
		if (!item?.Id || item._external) return null;

		try {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			if (!serverApi?.getLocalTrailers) return null;

			const trailers = await serverApi.getLocalTrailers(item.Id);
			const trailerItems = Array.isArray(trailers?.Items) ? trailers.Items : Array.isArray(trailers) ? trailers : [];
			const trailer = trailerItems.find((t) => t?.Id);
			if (!trailer) return null;

			const resolvedServerUrl = item._serverUrl || getItemServerUrl(item) || getDefaultServerUrl();
			if (!resolvedServerUrl) return null;

			const resolvedToken = item._serverAccessToken || getApiKey();
			// A Plex trailer plays straight from its own file.
			if (isPlexServer(resolvedServerUrl)) {
				const part = trailer.MediaSources?.[0]?.DirectStreamUrl;
				return part ? withPlexToken(`${resolvedServerUrl}${part}`, resolvedToken) : null;
			}
			const params = {
				...LOCAL_TRAILER_STREAM_PARAMS,
				...(resolvedToken ? {ApiKey: resolvedToken} : {})
			};
			return `${resolvedServerUrl}/Videos/${encodeURIComponent(trailer.Id)}/stream?${buildQueryString(params)}`;
		} catch {
			return null;
		}
	}, [api, getItemServerUrl]);

	const startTrailerPreview = useCallback(async (videoId, directUrl = null) => {
		const requestId = videoId || directUrl || null;
		trailerStateRef.current = 'resolving';
		trailerVideoIdRef.current = requestId;
		await stopPlaybackForTrailer(trailerVideoRef.current);

		const [{attachTrailerStream, fetchSponsorSegments, fetchVideoStream, getTrailerStartTime, isManifestUrl, nativeManifestSkipped, needsHlsJs, noteNativeManifest, playsManifestNatively, watchManifestPlayback}, {getSharedVideoElement}] = await Promise.all([
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
		// A card preview still holding the element is stopped before it's touched.
		claimSharedVideo('trailer', stopTrailer);
		video.className = css.trailerVideo;
		video.playsInline = true;
		video.controls = false;

		video.muted = preferMuted;
		video.volume = preferMuted ? 0 : volumeLevel(volume);
		video.autoplay = true;
		video.classList.remove(css.trailerVisible);

		if (!container.contains(video)) {
			container.appendChild(video);
		}
		video.onloadedmetadata = () => coverVideoInBox(video, container, TRAILER_ZOOM);
		video.onresize = video.onloadedmetadata;

		const clearSkipInterval = () => {
			if (trailerSkipIntervalRef.current) {
				clearInterval(trailerSkipIntervalRef.current);
				trailerSkipIntervalRef.current = null;
			}
		};

		const isStale = () => trailerStateRef.current !== 'resolving' || trailerVideoIdRef.current !== requestId;

		// a local trailer plays as a direct url, a youtube id resolves to a
		// stream first. Youtube is tried when a local trailer cant be decoded.
		// The bar fills the screen, so ask for the best stream rather than the
		// balanced pick a small preview would take
		const resolveStream = async (attempt) => {
			if (attempt.url) return {streamUrl: attempt.url, captionsUrl: null, audioLanguage: '', segments: [], startTime: 0};
			try {
				const results = await Promise.all([
					fetchSponsorSegments(attempt.id).catch(() => []),
					fetchVideoStream(attempt.id, true, captionLanguage, attempt.muxedOnly)
				]);
				const stream = results[1];
				return {
					client: stream ? stream.client : '',
					streamUrl: stream ? stream.url : null,
					captionsUrl: stream ? stream.captionsUrl : null,
					audioLanguage: stream ? stream.audioLanguage : '',
					videoOnly: stream ? stream.videoOnly : null,
					segments: results[0],
					startTime: getTrailerStartTime(results[0])
				};
			} catch (e) {
				return {streamUrl: null, captionsUrl: null, audioLanguage: '', segments: [], startTime: 0};
			}
		};

		const attempts = [];
		if (directUrl) attempts.push({url: directUrl});
		if (videoId) attempts.push({id: videoId});

		// Giving up has to clear trailerActive as well as the class, because the
		// banner holds its carousel timer while that flag is set.
		const markUnavailable = () => {
			trailerStateRef.current = 'unavailable';
			video.classList.remove(css.trailerVisible);
			setTrailerActive(false);
			setTrailerHolding(false);
		};

		// resumeAt carries a manifest that stopped partway over to the muxed file at the same spot.
		const tryAttempt = async (index, resumeAt = 0) => {
			if (isStale()) return;
			if (index >= attempts.length) {
				markUnavailable();
				return;
			}
			stopWatch();

			if (attempts[index].id && !attempts[index].muxedOnly && nativeManifestSkipped()) {
				attempts[index].muxedOnly = true;
			}
			const {client, streamUrl, captionsUrl, audioLanguage, videoOnly, segments, startTime} = await resolveStream(attempts[index]);
			if (isStale()) return;
			if (!streamUrl) {
				tryAttempt(index + 1);
				return;
			}
			const isManifest = isManifestUrl(streamUrl);
			const nativeManifest = playsManifestNatively(streamUrl);
			let kind = 'local trailer';
			if (attempts[index].id) kind = isManifest ? `YouTube ${videoOnly ? 'picture only ' : ''}manifest on ${nativeManifest ? "the TV's player" : 'hls.js'}` : 'YouTube 360p file';
			serverLogger.playback(`Trailer preview: ${kind}${client ? ` from ${client}` : ''}`);
			sponsorSegmentsRef.current = segments;
			// A manifest the TV cant play gives way to YouTube's small muxed file.
			if (attempts[index].id && !attempts[index].muxedOnly && isManifestUrl(streamUrl)) {
				attempts.splice(index + 1, 0, {id: attempts[index].id, muxedOnly: true});
			}

			// The caption text is fetched here and handed over as a blob, since the
			// track element cant load it straight from YouTube across origins.
			removeCaptionTrack(video);
			if (showCaptions && captionsUrl) {
				fetch(captionsUrl)
					.then((res) => (res.ok ? res.text() : null))
					.then((vtt) => {
						if (!vtt || trailerVideoIdRef.current !== requestId) return;
						const blobUrl = URL.createObjectURL(new Blob([vtt], {type: 'text/vtt'}));
						trailerCaptionBlobRef.current = blobUrl;
						const track = document.createElement('track');
						track.kind = 'subtitles';
						track.default = true;
						track.src = blobUrl;
						video.appendChild(track);
						// The engine would draw the cues inside the scaled video box, where
						// they come out huge and off center, so the track stays hidden and
						// its text lands in a styled box under the video instead.
						const textTrack = track.track;
						textTrack.mode = 'hidden';
						const box = document.createElement('div');
						box.className = css.trailerCaptionBox;
						container.appendChild(box);
						trailerCaptionBoxRef.current = box;
						textTrack.oncuechange = () => {
							const cues = textTrack.activeCues;
							let text = '';
							for (let i = 0; i < (cues ? cues.length : 0); i++) {
								text += (text ? '\n' : '') + cues[i].text;
							}
							box.textContent = text.replace(/<[^>]*>/g, '');
						};
					})
					.catch(() => {});
			}

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
					setTrailerHolding(true);
					// A seek past a sponsor segment can fire this again, so the pending
					// reveal is dropped rather than left to run after the trailer stops.
					if (trailerRevealTimerRef.current) clearTimeout(trailerRevealTimerRef.current);
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
				onEndedRef.current?.();
			};

			// The element, hls.js and the watch can all report the same failure, which must only move on
			// once. A manifest that stops partway still has the muxed file to go to. Anything else that
			// was already playing is given up on.
			let failed = false;
			const fail = (reason) => {
				if (failed || trailerVideoIdRef.current !== requestId) return;
				failed = true;
				stopWatch();
				clearSkipInterval();
				const wasPlaying = trailerStateRef.current === 'playing';
				const movesOn = index + 1 < attempts.length && (!wasPlaying || isManifest);
				serverLogger.warn(serverLogger.LOG_CATEGORIES.PLAYBACK, `Trailer preview ${reason} on the ${kind}${movesOn ? ', trying the next stream' : ''}`);
				if (nativeManifest) noteNativeManifest(false);
				if (!movesOn) {
					markUnavailable();
					return;
				}
				const at = wasPlaying ? video.currentTime : 0;
				if (!wasPlaying) video.classList.remove(css.trailerVisible);
				// A stalled stream that comes back while the next one resolves mustnt take over again.
				video.onplaying = null;
				video.onended = null;
				trailerStateRef.current = 'resolving';
				tryAttempt(index + 1, at);
			};
			video.onerror = () => fail('failed to play');

			releaseStream();
			const Hls = needsHlsJs(streamUrl) ? (await import('hls.js')).default : null;
			if (isStale()) return;
			releaseStreamRef.current = attachTrailerStream(video, streamUrl, {Hls, audioLanguage, videoOnly, startTime: resumeAt > 0 ? resumeAt : startTime, onError: () => fail('failed to play')});
			const playPromise = video.play();
			if (playPromise) {
				playPromise.catch(() => {
					// Stopping a preview pauses the element, which rejects this same
					// promise, so without the id check one just turned off would restart.
					if (trailerVideoIdRef.current !== requestId) return;
					// Autoplay with audio can get blocked, so retry muted.
					if (video.muted) return;
					video.muted = true;
					video.volume = 0;
					video.play()?.catch(() => {});
				});
			}
			if (isManifest) {
				stopWatchRef.current = watchManifestPlayback(video, {
					onStall: fail,
					onConfirmed: nativeManifest ? () => noteNativeManifest(true) : null
				});
			}
		};

		tryAttempt(0);
	}, [stopTrailer, stopWatch, preferMuted, volume, showCaptions, captionLanguage, removeCaptionTrack, releaseStream]);

	useEffect(() => {
		let live = true;
		afterHomeReady().then(() => {
			if (live) setHomeReady(true);
		});
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => {
		if (!enabled || !homeReady || !isVisible || !currentItem || screensaverActive || isMusicPlaying()) {
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
	}, [currentItem, isVisible, screensaverActive, enabled, homeReady, getLocalTrailerStreamUrlForItem, getRemoteTrailersForItem, startTrailerPreview, stopTrailer]);

	useEffect(() => {
		const handleScreensaver = (e) => setScreensaverActive(!!e.detail?.active);
		window.addEventListener('moonfin:screensaver', handleScreensaver);
		return () => window.removeEventListener('moonfin:screensaver', handleScreensaver);
	}, []);

	// A playing trailer is the screen doing something, but it takes no key
	// presses, so the inactivity timer would sit there counting down and cut it
	// off. Announce it so the screensaver holds off until it ends. A full screen bar
	// also clears the navigation and the peeking row away while it has focus.
	const chromeHidden = trailerActive && hidesChrome;
	useEffect(() => {
		window.dispatchEvent(new CustomEvent('moonfin:trailerPreview', {detail: {active: trailerActive, hidesChrome: chromeHidden}}));
		return () => {
			window.dispatchEvent(new CustomEvent('moonfin:trailerPreview', {detail: {active: false}}));
		};
	}, [trailerActive, chromeHidden]);

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

	return {trailerActive, trailerHolding, trailerContainerRef};
}
