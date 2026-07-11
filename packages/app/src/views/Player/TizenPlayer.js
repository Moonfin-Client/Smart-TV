import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import $L from '@enact/i18n/$L';
import * as playback from '../../services/playback';
import {
	initTizenAPI, registerAppStateObserver, keepScreenOn, getTizenVersion,
	avplayOpen, avplayPrepare, avplayPlay, avplayPause,
	avplaySeek, avplaySeekIdle, avplaySetPostSeekHook, avplayGetCurrentTime, avplayGetDuration, avplayGetState,
	avplaySetListener, avplaySetSpeed, avplaySelectTrack, avplaySetSilentSubtitle,
	avplayGetTracks, avplaySetDisplayMethod, avplaySetStreamingProperty, setDisplayWindow, cleanupAVPlay,
	avplaySetBufferingParams, avplaySuspend, avplayRestore, waitForHlsManifest
} from '@moonfin/platform-tizen/video';
import {useSettings} from '../../context/SettingsContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import * as syncPlayService from '../../services/syncPlay';
import {KEYS, isBackKey} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {initPgsCanvasRenderer, disposePgsRenderer, clearPgsCanvas} from '../../utils/pgsRenderer';
import {supportsAssRenderer, initAssCanvasRenderer, disposeAssRenderer, setAssTime} from '../../utils/assRenderer';
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml} from '../../utils/subtitleConstants';
import {findPreferredAudioStream} from '../../utils/audioLanguage';
import {api as jellyfinApi, createApiForServer, getServerUrl} from '../../services/jellyfinApi';
import PlayerControls, {usePlayerButtons} from './PlayerControls';
import useSegmentPopups from './useSegmentPopups';
import {SpottableButton, NextEpisodeContainer, CONTROLS_HIDE_DELAY, parseLyricsResponse, withTimeout} from './PlayerConstants';
import {
	toSubtitleLanguage,
	mapSubtitleStreamsFromMediaSource,
	mapRemoteSubtitleOptions
} from './remoteSubtitleUtils';
import {getVideoDisplayAspectRatio} from './aspectRatioUtils';
import {mapJellyfinTrackToTizen} from './tizenTrackUtils';

import css from './TizenPlayer.module.less';

// setDisplayRect works in the app coordinate space, not panel pixels. Handing it
// the panel resolution on a 4K set makes the video plane four times the visible
// area, which is why the display method modes all looked identical.
const getTizenFullscreenRect = () => {
	if (typeof window === 'undefined') {
		return {x: 0, y: 0, width: 1920, height: 1080};
	}

	return {
		x: 0,
		y: 0,
		width: Math.max(1, Math.round(window.innerWidth || 1920)),
		height: Math.max(1, Math.round(window.innerHeight || 1080))
	};
};

const getRootFontSizePx = () => {
	if (typeof window === 'undefined' || typeof document === 'undefined') return 24;
	const computed = window.getComputedStyle(document.documentElement).fontSize;
	const parsed = parseFloat(computed);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
};

/**
 * AVPlay-based Player component for Samsung Tizen.
 *
 * Uses Samsung's native AVPlay API instead of HTML5 <video> for hardware-accelerated
 * playback. AVPlay renders on a platform multimedia layer BEHIND the web engine;
 * the web layer must be transparent in the video area for the content to show through.
 */
const Player = ({item, resume, initialMediaSourceId, initialAudioIndex, initialSubtitleIndex, initialStartPositionTicks, onEnded, onBack, onPlayNext, onSelectPerson, audioPlaylist, onPausedChange}) => {
	const {settings} = useSettings();
	const {isInGroup, lastCommand} = useSyncPlay();
	const syncPlayCommandRef = useRef(false);
	const lastProcessedCommandRef = useRef(null);
	const suppressBufferingUntilRef = useRef(0);
	const stallRecheckTimerRef = useRef(null);
	const isBufferingRef = useRef(false);

	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [error, setError] = useState(null);
	const [title, setTitle] = useState('');
	const [subtitle, setSubtitle] = useState('');
	const [playMethod, setPlayMethod] = useState(null);
	const [isPaused, setIsPaused] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [audioStreams, setAudioStreams] = useState([]);
	const [subtitleStreams, setSubtitleStreams] = useState([]);
	const [chapters, setChapters] = useState([]);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(null);
	const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);
	const [subtitleTrackEvents, setSubtitleTrackEvents] = useState(null);
	const [subtitleOffset, setSubtitleOffset] = useState(0);
	const [currentSubtitleText, setCurrentSubtitleText] = useState(null);
	const [controlsVisible, setControlsVisible] = useState(false);
	const [activeModal, setActiveModal] = useState(null);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [selectedQuality, setSelectedQuality] = useState(null);
	const [remoteSubtitleResults, setRemoteSubtitleResults] = useState([]);
	const [isSearchingRemoteSubtitles, setIsSearchingRemoteSubtitles] = useState(false);
	const [mediaSegments, setMediaSegments] = useState(null);
	const [nextEpisode, setNextEpisode] = useState(null);
	const [isSeeking, setIsSeeking] = useState(false);
	const [seekPosition, setSeekPosition] = useState(0);
	const [mediaSourceId, setMediaSourceId] = useState(null);
	const [hasTriedTranscode, setHasTriedTranscode] = useState(false);
	const [focusRow, setFocusRow] = useState('bottom');
	const isLiveTV = item.Type === 'TvChannel';
	const [isAudioMode, setIsAudioMode] = useState(false);
	const [lyricsLines, setLyricsLines] = useState([]);
	const [isLyricsLoading, setIsLyricsLoading] = useState(false);
	const [lyricsError, setLyricsError] = useState(null);
	const [shuffleMode, setShuffleMode] = useState(false);
	const [repeatMode, setRepeatMode] = useState('off');
	const [isFavorite, setIsFavorite] = useState(false);
	const [zoomMode, setZoomMode] = useState('fit');
	const [videoAspectRatio, setVideoAspectRatio] = useState(null);
	const [castMembers, setCastMembers] = useState([]);
	const [isLoadingCastMembers, setIsLoadingCastMembers] = useState(false);
	const zoomModeRef = useRef('fit');

	// Audio playlist tracking
	const audioPlaylistIndex = useMemo(() => {
		if (!audioPlaylist || !item) return -1;
		return audioPlaylist.findIndex(t => t.Id === item.Id);
	}, [audioPlaylist, item]);
	const hasNextTrack = audioPlaylist && audioPlaylistIndex >= 0 && audioPlaylistIndex < audioPlaylist.length - 1;
	const hasPrevTrack = audioPlaylist && audioPlaylistIndex > 0;
	const activeLyricIndex = useMemo(() => {
		if (!lyricsLines.length) return -1;
		for (let i = lyricsLines.length - 1; i >= 0; i--) {
			if (typeof lyricsLines[i].startSeconds === 'number' && currentTime >= lyricsLines[i].startSeconds) {
				return i;
			}
		}
		return -1;
	}, [lyricsLines, currentTime]);
	const activeLyricLine = activeLyricIndex >= 0 ? lyricsLines[activeLyricIndex]?.text : '';

	const positionRef = useRef(0);
	const playSessionRef = useRef(null);
	const runTimeRef = useRef(0);
	const healthMonitorRef = useRef(null);
	const unregisterAppStateRef = useRef(null);
	const controlsTimeoutRef = useRef(null);
	const lastFocusedElementRef = useRef(null);
	const timeUpdateIntervalRef = useRef(null);
	const avplayReadyRef = useRef(false);
	// Refs for stable callbacks inside AVPlay listener (avoids stale closures)
	const handleEndedCallbackRef = useRef(null);
	const handleErrorCallbackRef = useRef(null);
	// Ref for time-update logic (reassigned each render to get fresh state)
	const timeUpdateLogicRef = useRef(null);
	// Deferred seek: only execute actual avplaySeek after user stops pressing arrows
	const seekDebounceRef = useRef(null);
	const pendingSeekMsRef = useRef(null);
	const subtitleTimeoutRef = useRef(null);
	const useNativeSubtitleRef = useRef(false);
	// Ref for the Player container DOM element - used to walk up ancestors for transparency
	const playerContainerRef = useRef(null);
	const pgsRendererRef = useRef(null);
	const pgsCanvasRef = useRef(null);
	const assRendererRef = useRef(null);
	const rootFontSizePxRef = useRef(null);
	const prevInlineRootFontSizeRef = useRef('');
	const isPausedRef = useRef(false);
	// a fatal error can arrive while parked in pause and must resurface on resume
	const pausedErrorRef = useRef(null);
	const deferredResumeSeekRef = useRef(null);
	// tracks queued before prepare and applied once AVPlay reaches a state that accepts them
	const pendingTracksRef = useRef(null);
	const lastTrackAttemptRef = useRef(0);
	const applyPendingTracksRef = useRef(null);
	const activeNativeSubRef = useRef(null);
	const trackConfirmTimerRef = useRef(null);
	const currentUrlRef = useRef(null);
	const suspendedRef = useRef(null);
	const loadGenerationRef = useRef(0);
	const reloadPlaybackRef = useRef(null);
	// index of a subtitle the server is currently burning into the stream
	const burnInSubtitleRef = useRef(null);

	const applyDisplayWindow = useCallback(() => {
		const mode = zoomModeRef.current;
		if (mode === 'stretch') {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
		} else if (mode === 'fill') {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_CROPPED_FULL');
		} else {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
		}
		// setting the rect after the method is what makes the scaler pick up a
		// mid playback mode change
		setDisplayWindow(getTizenFullscreenRect());
	}, []);

	const enforceRootFontSize = useCallback(() => {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		if (!html) return;

		const target = rootFontSizePxRef.current;
		if (!target) return;

		const current = getRootFontSizePx();
		if (Math.abs(current - target) > 0.25) {
			html.style.fontSize = `${target}px`;
			console.warn('[Player] Corrected unexpected UI zoom:', current, '->', target);
		}
	}, []);

	// Shared handler for AVPlay's onsubtitlechange callback
	// setSilentSubtitle(true) hides native render and fires this with embedded subtitle text
	const handleSubtitleChange = useCallback((dur, text, type) => {
		if (useNativeSubtitleRef.current && type !== 1 && type !== '1') {
			if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
			setCurrentSubtitleText(text || null);
			if (text && dur > 0) {
				subtitleTimeoutRef.current = setTimeout(() => {
					setCurrentSubtitleText(null);
				}, parseInt(dur, 10));
			}
		}
	}, []);

	const zoomModeLabel = useMemo(() => {
		if (zoomMode === 'fill') return $L('Crop');
		if (zoomMode === 'stretch') return $L('Stretch');
		return $L('Fit');
	}, [zoomMode]);

	const hasCastMembers = useMemo(() => {
		if (castMembers.length > 0) return true;
		return item?.Type === 'Episode' && Boolean(item?.SeriesId);
	}, [castMembers.length, item]);

	const {topButtons, bottomButtons, favoriteButton} = usePlayerButtons({
		isPaused, audioStreams, subtitleStreams, chapters,
		nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
		shuffleMode, repeatMode, isFavorite, playbackRate, selectedQuality,
		selectedSubtitleIndex, canDownloadRemoteSubtitles: !isAudioMode && Boolean(item?.Id), hasCastMembers, zoomModeLabel, zoomModeKey: zoomMode
	});

	useEffect(() => {
		zoomModeRef.current = zoomMode;
	}, [zoomMode]);

	useEffect(() => {
		const people = Array.isArray(item?.People) ? item.People : [];
		setCastMembers(people);
	}, [item]);

	useEffect(() => {
		let cancelled = false;

		const loadLyrics = async () => {
			if (!isAudioMode || !item?.Id) {
				setLyricsLines([]);
				setLyricsError(null);
				setIsLyricsLoading(false);
				return;
			}

			setIsLyricsLoading(true);
			setLyricsError(null);

			try {
				const hasServerContext = item._serverUrl && item._serverAccessToken && item._serverUserId;
				const apiClient = hasServerContext
					? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
					: jellyfinApi;
				const response = await apiClient.getLyrics(item.Id);
				if (cancelled) return;
				setLyricsLines(parseLyricsResponse(response));
			} catch (err) {
				if (cancelled) return;
				setLyricsLines([]);
				if (err?.status && err.status !== 404) {
					setLyricsError('Unable to load lyrics right now.');
				}
			} finally {
				if (!cancelled) {
					setIsLyricsLoading(false);
				}
			}
		};

		loadLyrics();

		return () => {
			cancelled = true;
		};
	}, [isAudioMode, item?.Id, item?._serverUrl, item?._serverAccessToken, item?._serverUserId]);

	// ==============================
	// AVPlay Time Update Polling
	// ==============================
	// This ref is reassigned every render so the interval always has fresh React state.
	timeUpdateLogicRef.current = () => {
		if (!avplayReadyRef.current) return;
		const state = avplayGetState();
		if (state !== 'PLAYING' && state !== 'PAUSED') return;

		const ms = avplayGetCurrentTime();
		const time = ms / 1000;
		const ticks = Math.floor(ms * 10000);

		setCurrentTime(time);
		positionRef.current = ticks;

		if (healthMonitorRef.current && state === 'PLAYING') {
			healthMonitorRef.current.recordProgress();
		}

		if (subtitleTrackEvents && subtitleTrackEvents.length > 0) {
			const lookupTicks = ticks - (subtitleOffset * 10000000);
			const matchingTexts = [];
			for (const event of subtitleTrackEvents) {
				if (lookupTicks >= event.StartPositionTicks && lookupTicks <= event.EndPositionTicks) {
					matchingTexts.push(event.Text);
				}
			}
			setCurrentSubtitleText(matchingTexts.length > 0 ? matchingTexts.join('\n') : null);
		} else if (pgsRendererRef.current) {
			setCurrentSubtitleText(null);
			const pgsTime = time - (subtitleOffset || 0);
			pgsRendererRef.current.renderAtTimestamp(Math.max(0, pgsTime));
		} else if (assRendererRef.current) {
			setCurrentSubtitleText(null);
			const assTime = time - (subtitleOffset || 0);
			setAssTime(assRendererRef.current, Math.max(0, assTime));
		}

		checkSegments(ticks); // eslint-disable-line no-use-before-define
	};

	const startTimeUpdatePolling = useCallback(() => {
		if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
		timeUpdateIntervalRef.current = setInterval(() => {
			timeUpdateLogicRef.current?.();
		}, 500);
	}, []);

	const stopTimeUpdatePolling = useCallback(() => {
		if (timeUpdateIntervalRef.current) {
			clearInterval(timeUpdateIntervalRef.current);
			timeUpdateIntervalRef.current = null;
		}
	}, []);

	// ==============================
	// AVPlay Lifecycle Helpers
	// ==============================

	/**
	 * Select an embedded track natively via AVPlay's TEXT track list.
	 * Returns false when the stream cant be mapped to an AVPlay track.
	 */
	const applyNativeSubtitleTrack = useCallback((stream, streamList, trackInfo = null) => {
		const embedded = (streamList || []).filter((s) => s.isEmbeddedNative);
		const tizenIndex = mapJellyfinTrackToTizen(trackInfo || avplayGetTracks(), embedded, 'TEXT', stream.index);
		if (tizenIndex == null) return false;
		avplaySelectTrack('TEXT', tizenIndex);
		// flip the silent flag once so the cue engine actually starts delivering,
		// selections made early are otherwise silently ignored on older firmware
		if (stream.isImageBased) {
			// PGS renders as a native bitmap overlay, no JS events
			avplaySetSilentSubtitle(true);
			avplaySetSilentSubtitle(false);
			useNativeSubtitleRef.current = false;
		} else {
			// text arrives through onsubtitlechange and renders on the web layer
			avplaySetSilentSubtitle(false);
			avplaySetSilentSubtitle(true);
			useNativeSubtitleRef.current = true;
		}
		activeNativeSubRef.current = {stream, streams: streamList};
		return true;
	}, []);

	// firmware drops the native selection after buffer flushes and sometimes
	// ignores selections made early, both recover by re-applying it
	const reassertNativeSubtitle = useCallback(() => {
		const active = activeNativeSubRef.current;
		if (!active) return;
		try { applyNativeSubtitleTrack(active.stream, active.streams); } catch (e) { void e; }
	}, [applyNativeSubtitleTrack]);

	/**
	 * Apply queued audio and subtitle selections. Audio only takes while PLAYING,
	 * text also while PAUSED, and track lists can be incomplete right after play
	 * on older firmware, so this retries from several playback events until the
	 * selection lands or the deadline passes.
	 */
	const applyPendingTracks = useCallback(() => {
		const pending = pendingTracksRef.current;
		if (!pending || (pending.audioApplied && pending.subApplied)) return;
		const state = avplayGetState();
		if (state !== 'PLAYING' && state !== 'PAUSED') return;
		const expired = pending.deadline != null && Date.now() > pending.deadline;
		const trackInfo = avplayGetTracks();

		if (!pending.audioApplied && state === 'PLAYING') {
			try {
				const tizenIndex = mapJellyfinTrackToTizen(trackInfo, pending.audioStreams, 'AUDIO', pending.audioIndex);
				if (tizenIndex != null) {
					avplaySelectTrack('AUDIO', tizenIndex);
					pending.audioApplied = true;
					console.log('[Player] Applied initial audio track, jellyfinIndex:', pending.audioIndex, 'tizenIndex:', tizenIndex);
				} else if (expired) {
					console.warn('[Player] No matching AVPlay audio track for index', pending.audioIndex);
					pending.audioApplied = true;
				}
			} catch (e) {
				if (expired) pending.audioApplied = true;
			}
		}

		if (!pending.subApplied && pending.subStream) {
			try {
				if (applyNativeSubtitleTrack(pending.subStream, pending.subtitleStreams, trackInfo)) {
					pending.subApplied = true;
				} else if (expired) {
					pending.subApplied = true;
					pending.onNativeFallback?.(pending.subStream);
				}
			} catch (e) {
				if (expired) {
					pending.subApplied = true;
					pending.onNativeFallback?.(pending.subStream);
				}
			}
		}
	}, [applyNativeSubtitleTrack]);
	applyPendingTracksRef.current = applyPendingTracks;

	/**
	 * Shared open to play sequence used by the initial load and every stream
	 * reload. Configures buffering and adaptive properties in IDLE, prepares,
	 * then holds play until the first buffer fill so startup opens on a moving
	 * picture instead of a stall.
	 */
	const openAndPrepare = useCallback(async ({url, playMethod: method, mediaSource, resumeTicks = 0, hasNativePendingSub = false, shouldAbort = null}) => {
		const isHls = typeof url === 'string' && url.includes('.m3u8');
		const isTranscode = method === playback.PlayMethod.Transcode;

		// opening against a playlist the server hasnt written yet errors out
		// the whole pipeline, so wait for it to exist first
		if (isTranscode && isHls) {
			await waitForHlsManifest(url);
			if (shouldAbort?.()) return;
		}

		avplayOpen(url);
		currentUrlRef.current = url;
		applyDisplayWindow();
		avplaySetBufferingParams({bitrate: mediaSource?.Bitrate});

		// Samsung AVPlay rejects some Jellyfin transcode endpoints with the
		// default system User-Agent. USER_AGENT first, USERAGENT fallback for older firmwares.
		try {
			avplaySetStreamingProperty('USER_AGENT', 'JellyfinTizenClient');
		} catch {
			try { avplaySetStreamingProperty('USERAGENT', 'JellyfinTizenClient'); } catch { /* ignore */ }
		}

		const videoStream = mediaSource?.MediaStreams?.find((s) => s.Type === 'Video');
		const sourceWidth = videoStream?.Width || 0;
		const sourceHeight = videoStream?.Height || 0;
		const sourceBitrate = mediaSource?.Bitrate || 0;
		const is4K = sourceWidth > 1920 || sourceBitrate > 20000000;

		// deprecated since Tizen 5, newer firmware takes the cap through
		// FIXED_MAX_RESOLUTION instead
		if (isTranscode && is4K && getTizenVersion() < 5) {
			try { avplaySetStreamingProperty('SET_MODE_4K', 'TRUE'); } catch { /* ignore */ }
		}

		if (isLiveTV || isHls) {
			// ADAPTIVE_INFO only accepts BITRATES/STARTBITRATE/SKIPBITRATE/
			// FIXED_MAX_RESOLUTION, unknown keys break playback on older firmware
			const caps = playback.getCurrentSession()?.capabilities;
			const panelWidth = caps?.screenWidth || 3840;
			const panelHeight = caps?.screenHeight || 2160;
			const maxWidth = sourceWidth > 0 ? Math.min(sourceWidth, panelWidth) : panelWidth;
			const maxHeight = sourceHeight > 0 ? Math.min(sourceHeight, panelHeight) : panelHeight;
			avplaySetStreamingProperty('ADAPTIVE_INFO',
				`FIXED_MAX_RESOLUTION=${maxWidth}x${maxHeight}|STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST`);
		}

		// resume strategy: set the start position while still in IDLE where the
		// platform accepts it reliably. A fresh HLS transcode refuses seeks until
		// playback is moving, and a pending native subtitle needs play from zero
		// or its cue parser stays stuck at the start, so those defer instead.
		let postPlaySeekMs = 0;
		deferredResumeSeekRef.current = null;
		if (!isLiveTV && resumeTicks > 0) {
			const seekMs = Math.floor(resumeTicks / 10000);
			if (isTranscode && isHls) {
				deferredResumeSeekRef.current = seekMs;
			} else if (hasNativePendingSub || !avplaySeekIdle(seekMs)) {
				postPlaySeekMs = seekMs;
			}
		}

		let latchResolve;
		const bufferingLatch = new Promise((resolve) => { latchResolve = resolve; });
		// a fresh HLS session refuses seeks until playback is actually moving,
		// so the deferred resume seek must never fire before play is issued
		let playIssued = false;

		const runDeferredResumeSeek = () => {
			if (!playIssued) return;
			const ms = deferredResumeSeekRef.current;
			if (ms == null) return;
			deferredResumeSeekRef.current = null;
			avplaySeek(ms).catch((e) => {
				console.warn('[Player] Deferred resume seek failed:', e?.message || e);
			});
		};

		avplaySetListener({
			onbufferingstart: () => { setIsBuffering(true); },
			onbufferingcomplete: () => {
				setIsBuffering(false);
				latchResolve();
				runDeferredResumeSeek();
				applyPendingTracksRef.current?.();
			},
			onstreamcompleted: () => { handleEndedCallbackRef.current?.(); },
			onerror: (eventType) => {
				// the platform throws spurious errors after sitting in pause,
				// remember them so a dead pipeline still surfaces on resume
				if (isPausedRef.current || avplayGetState() === 'PAUSED') {
					pausedErrorRef.current = eventType;
					return;
				}
				console.error('[Player] AVPlay error:', eventType);
				handleErrorCallbackRef.current?.();
			},
			oncurrentplaytime: () => {
				if (pausedErrorRef.current) pausedErrorRef.current = null;
				const now = Date.now();
				if (now - lastTrackAttemptRef.current >= 500) {
					lastTrackAttemptRef.current = now;
					applyPendingTracksRef.current?.();
				}
			},
			onevent: (eventType, eventData) => {
				console.log('[Player] AVPlay event:', eventType, eventData);
			},
			onsubtitlechange: handleSubtitleChange,
			ondrmevent: () => {}
		});

		const prepareTimeout = isLiveTV ? 30000 : 60000;
		let prepareTimer;
		await Promise.race([
			avplayPrepare(),
			new Promise((_, reject) => {
				prepareTimer = setTimeout(() => reject(new Error('Stream preparation timed out')), prepareTimeout);
			})
		]);
		clearTimeout(prepareTimer);
		avplayReadyRef.current = true;

		// some firmware resets display state during prepare
		applyDisplayWindow();

		const durationMs = avplayGetDuration();
		if (durationMs > 0) {
			setDuration(durationMs / 1000);
			runTimeRef.current = Math.floor(durationMs * 10000);
		}

		// network streams open on a moving picture when play waits for the first
		// buffer fill, capped since buffering events are not guaranteed.
		// DirectPlay starts immediately like it always has
		if (isTranscode || isHls) {
			await Promise.race([
				bufferingLatch,
				new Promise((resolve) => setTimeout(resolve, 3000))
			]);
		}

		const startDelayMs = Math.max(0, Number(settings.videoStartDelay || 0) * 1000);
		if (startDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, startDelayMs));
		}

		playIssued = true;
		avplayPlay();
		setIsPaused(false);
		if (pendingTracksRef.current) {
			pendingTracksRef.current.deadline = Date.now() + 5000;
		}

		if (deferredResumeSeekRef.current != null) {
			setTimeout(runDeferredResumeSeek, 1500);
		}
		if (postPlaySeekMs > 0) {
			avplaySeek(postPlaySeekMs).catch((e) => {
				console.warn('[Player] Post play resume seek failed:', e?.message || e);
			});
		}

		applyPendingTracksRef.current?.();

		// one confirmation pass, some firmware silently drops selections made
		// this early in the session
		if (trackConfirmTimerRef.current) clearTimeout(trackConfirmTimerRef.current);
		trackConfirmTimerRef.current = setTimeout(() => {
			trackConfirmTimerRef.current = null;
			reassertNativeSubtitle();
			applyPendingTracksRef.current?.();
		}, 4000);
	}, [isLiveTV, applyDisplayWindow, handleSubtitleChange, reassertNativeSubtitle, settings.videoStartDelay]);

	/**
	 * Start AVPlay playback for a given URL.
	 * Stops any existing session, opens the new URL, prepares, and plays.
	 */
	const startAVPlayback = useCallback(async (url, seekPositionTicks = 0, options = {}) => {
		stopTimeUpdatePolling();
		cleanupAVPlay();
		avplayReadyRef.current = false;
		// pending selections belong to the previous session, an active native
		// subtitle re-applies through the confirmation pass instead
		pendingTracksRef.current = null;

		const session = playback.getCurrentSession();
		await openAndPrepare({
			url,
			playMethod: options.playMethod || session?.playMethod,
			mediaSource: options.mediaSource || session?.mediaSource,
			resumeTicks: seekPositionTicks
		});

		startTimeUpdatePolling();
	}, [startTimeUpdatePolling, stopTimeUpdatePolling, openAndPrepare]);

	// every stream reload restarts playback and session reporting the same way
	const restartFromResult = useCallback(async (result, positionTicks) => {
		if (!result?.url) return false;
		positionRef.current = positionTicks;
		if (result.playMethod) setPlayMethod(result.playMethod);
		if (result.playSessionId) playSessionRef.current = result.playSessionId;
		await startAVPlayback(result.url, positionTicks, {playMethod: result.playMethod, mediaSource: result.mediaSource});
		playback.reportStart(positionRef.current);
		playback.startProgressReporting(
			() => positionRef.current,
			10000,
			() => ({ isPaused: avplayGetState() !== 'PLAYING' })
		);
		return true;
	}, [startAVPlayback]);

	const reloadWithSubtitleIndex = useCallback(async (subIndex) => {
		const currentPositionTicks = Math.floor(avplayGetCurrentTime() * 10000);
		const result = await playback.changeSubtitleStream(subIndex);
		await restartFromResult(result, currentPositionTicks);
	}, [restartFromResult]);

	// ==============================
	// Initialization
	// ==============================
	useEffect(() => {
		const init = async () => {
			await initTizenAPI();
			await keepScreenOn(!isPaused);

			// Make ALL ancestor backgrounds transparent so AVPlay video layer shows through.
			// Enact's ThemeDecorator, Panels, and Panel components all inject opaque
			// backgrounds that would otherwise block the native AVPlay layer behind the web engine.
			document.body.style.background = 'transparent';
			document.documentElement.style.background = 'transparent';
			if (playerContainerRef.current) {
				let el = playerContainerRef.current.parentElement;
				while (el && el !== document.documentElement) {
					el.style.background = 'transparent';
					el.style.backgroundColor = 'transparent';
					el = el.parentElement;
				}
			} else {
				// Fallback: target known roots
				const appRoot = document.getElementById('root') || document.getElementById('app');
				if (appRoot) {
					appRoot.style.background = 'transparent';
					// Also walk its children upward from appRoot
					let child = appRoot.firstElementChild;
					while (child) {
						child.style.background = 'transparent';
						child.style.backgroundColor = 'transparent';
						child = child.firstElementChild;
					}
				}
			}

			unregisterAppStateRef.current = registerAppStateObserver(
				() => {
					console.log('[Player] App resumed');
					const suspended = suspendedRef.current;
					suspendedRef.current = null;
					if (suspended) {
						avplayRestore(suspended.url, suspended.positionMs).then((ok) => {
							if (ok) {
								if (suspended.wasPlaying) {
									try { avplayPlay(); } catch (e) { void e; }
									playback.reportProgress(positionRef.current, {isPaused: false, eventName: 'unpause'});
								}
							} else {
								// the transcode session likely expired while backgrounded
								console.warn('[Player] AVPlay restore failed, reloading stream');
								reloadPlaybackRef.current?.();
							}
						});
						return;
					}
					if (avplayReadyRef.current && !isPaused) {
						const state = avplayGetState();
						if (state === 'PAUSED' || state === 'READY') {
							try { avplayPlay(); } catch (e) { void e; }
						}
					}
				},
				() => {
					console.log('[Player] App backgrounded - suspending and saving progress');
					// report paused progress, not stopped. A stop here strands the
					// session on the server side while the client resumes later
					if (positionRef.current > 0) {
						if (!playback.reportProgressBeacon(positionRef.current, {isPaused: true})) {
							playback.reportProgress(positionRef.current, {isPaused: true});
						}
					}
					const state = avplayGetState();
					const wasPlaying = state === 'PLAYING';
					if (wasPlaying) {
						try { avplayPause(); } catch (e) { void e; }
					}
					if (avplayReadyRef.current && currentUrlRef.current) {
						const positionMs = avplayGetCurrentTime();
						if (avplaySuspend()) {
							suspendedRef.current = {url: currentUrlRef.current, positionMs, wasPlaying};
						}
					}
				}
			);
		};
		init();

		const containerNode = playerContainerRef.current;

		return () => {
			keepScreenOn(false);
			// Restore backgrounds on all ancestors
			document.body.style.background = '';
			document.documentElement.style.background = '';
			if (containerNode) {
				let el = containerNode.parentElement;
				while (el && el !== document.documentElement) {
					el.style.background = '';
					el.style.backgroundColor = '';
					el = el.parentElement;
				}
			} else {
				const appRoot = document.getElementById('root') || document.getElementById('app');
				if (appRoot) appRoot.style.background = '';
			}

			if (unregisterAppStateRef.current) {
				unregisterAppStateRef.current();
			}
		};
	}, [isPaused]);

	useEffect(() => {
		onPausedChange?.(isPaused);
	}, [isPaused, onPausedChange]);

	useEffect(() => {
		isPausedRef.current = isPaused;
	}, [isPaused]);

	useEffect(() => {
		// the buffer flush from a seek drops the native subtitle selection on
		// some firmware, so re-assert it whenever a seek lands
		avplaySetPostSeekHook(reassertNativeSubtitle);

		// backing out of the app entirely never reaches the unmount cleanup, so
		// the session would sit open on the server forever
		const handleAppExit = () => {
			if (positionRef.current > 0) {
				playback.reportStopBeacon(positionRef.current);
			}
			cleanupAVPlay();
		};
		window.addEventListener('pagehide', handleAppExit);
		window.addEventListener('beforeunload', handleAppExit);

		return () => {
			avplaySetPostSeekHook(null);
			window.removeEventListener('pagehide', handleAppExit);
			window.removeEventListener('beforeunload', handleAppExit);
		};
	}, [reassertNativeSubtitle]);

	// Handle playback health issues
	const handleUnhealthy = useCallback(async () => {
		console.log('[Player] Playback unhealthy, falling back to transcode');
	}, []);

	// ==============================
	// Load Media & Start AVPlay
	// ==============================
	useEffect(() => {
		const loadMedia = async () => {
			const generation = ++loadGenerationRef.current;
			const stillCurrent = () => generation === loadGenerationRef.current;
			setIsLoading(true);
			setError(null);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
			setSelectedSubtitleIndex(-1);
			setVideoAspectRatio(null);
			resetPopups(); // eslint-disable-line no-use-before-define

			// Stop any previous playback
			stopTimeUpdatePolling();
			cleanupAVPlay();
			avplayReadyRef.current = false;
			burnInSubtitleRef.current = null;
			pausedErrorRef.current = null;

			try {
				const savedPosition = isLiveTV ? 0 : (item.UserData?.PlaybackPositionTicks || 0);
				const startPosition = initialStartPositionTicks != null ? initialStartPositionTicks : ((!isLiveTV && resume !== false) ? savedPosition : 0);
				const effectiveBitrate = selectedQuality || settings.maxBitrate || undefined;
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: startPosition,
					maxBitrate: effectiveBitrate,
					preferTranscode: settings.preferTranscode,
					forceDirectPlay: isLiveTV ? false : settings.forceDirectPlay,
					item: item,
					mediaSourceId: initialMediaSourceId,
					audioStreamIndex: initialAudioIndex != null ? initialAudioIndex : undefined,
					subtitleStreamIndex: initialSubtitleIndex != null ? initialSubtitleIndex : undefined,
					isLiveTV,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				});
				if (!stillCurrent()) return;

				setPlayMethod(result.playMethod);
				setMediaSourceId(result.mediaSourceId);
				setVideoAspectRatio(getVideoDisplayAspectRatio(result.mediaSource));
				playSessionRef.current = result.playSessionId;
				positionRef.current = startPosition;
				runTimeRef.current = result.runTimeTicks || 0;
				setDuration((result.runTimeTicks || 0) / 10000000);

				// Set streams
				setAudioStreams(result.audioStreams || []);
				setSubtitleStreams(result.subtitleStreams || []);

				// Chapters are an Item property, not MediaSource - result.chapters may be empty.
				// Fetched off the critical path, they only feed the chapter picker
				setChapters(!isLiveTV ? (result.chapters || []) : []);
				if (!isLiveTV && (result.chapters || []).length === 0) {
					playback.fetchItemChapters(item.Id, item).then((chapterList) => {
						if (stillCurrent()) setChapters(chapterList);
					}).catch(() => {});
				}

				// Handle initial audio selection. A local language override wins,
				// otherwise honor the Jellyfin user's preferred audio language via the
				// server computed defaultAudioStreamIndex, then the file default.
				const preferredAudio = findPreferredAudioStream(result.audioStreams, settings.audioLanguage);
				const serverAudio = result.audioStreams?.find(s => s.index === result.defaultAudioStreamIndex);
				const fileDefaultAudio = result.audioStreams?.find(s => s.isDefault);
				const autoAudio = preferredAudio || serverAudio || fileDefaultAudio;
				if (initialAudioIndex !== undefined && initialAudioIndex !== null) {
					setSelectedAudioIndex(initialAudioIndex);
				} else if (autoAudio) {
					setSelectedAudioIndex(autoAudio.index);
				}

				// Track pending audio/subtitle setup (apply after AVPlay prepare).
				// Only actively switch tracks when the choice isn't the one AVPlay
				// plays natively (the file default).
				let pendingAudioIndex = null;
				if (initialAudioIndex != null) {
					pendingAudioIndex = initialAudioIndex;
				} else if (autoAudio && autoAudio.index !== fileDefaultAudio?.index) {
					pendingAudioIndex = autoAudio.index;
				}

				let pendingSubAction = null;

				// pick the render path synchronously so playback never waits on
				// subtitle downloads or server side extraction. The actual data
				// loads in the background once video is running
				const decideSubtitleAction = (sub) => {
					if (!sub) return {type: 'off'};
					if (sub.isEmbeddedNative) return {type: 'native', stream: sub};
					if (sub.isAss && supportsAssRenderer()) return {type: 'ass', stream: sub};
					if (sub.isTextBased) return {type: 'text', stream: sub};
					if (sub.isImageBased && settings.enablePgsRendering) return {type: 'pgs', stream: sub};
					return {type: 'off'};
				};

				const selectInitialSubtitle = (sub) => {
					if (!sub) return;
					setSelectedSubtitleIndex(sub.index);
					pendingSubAction = decideSubtitleAction(sub);
					// a preselected burn in track was already negotiated into the
					// stream, remember it so deselecting later reloads without it
					if (sub.isBurnIn) burnInSubtitleRef.current = sub.index;
					console.log('[Player] Initial subtitle action:', pendingSubAction.type, 'codec:', sub.codec);
				};

				const loadSubtitleAssets = async (action) => {
					const sub = action?.stream;
					if (!sub) return;
					if (action.type === 'ass') {
						try {
							const assUrl = playback.getAssSubtitleUrl(sub);
							if (assUrl && pgsCanvasRef.current) {
								const assFontsUrl = playback.getAssFontsUrl(sub);
								const assErrorHandler = (err) => {
									console.error('[Player] ASS renderer error, falling back to text', err);
									disposeAssRenderer(assRendererRef.current);
									assRendererRef.current = null;
									playback.fetchSubtitleData(sub).then(data => {
										if (stillCurrent()) setSubtitleTrackEvents(data?.TrackEvents || null);
									}).catch(() => stillCurrent() && setSubtitleTrackEvents(null));
								};
								const renderer = await initAssCanvasRenderer(pgsCanvasRef.current, assUrl, assFontsUrl, assErrorHandler);
								if (!stillCurrent()) {
									if (renderer) disposeAssRenderer(renderer);
									return;
								}
								if (renderer) {
									assRendererRef.current = renderer;
									setSubtitleTrackEvents(null);
								} else {
									const data = await playback.fetchSubtitleData(sub);
									if (stillCurrent()) setSubtitleTrackEvents(data?.TrackEvents || null);
								}
							}
						} catch (err) {
							console.error('[Player] ASS init failed, falling back to text', err);
							try {
								const data = await playback.fetchSubtitleData(sub);
								if (stillCurrent()) setSubtitleTrackEvents(data?.TrackEvents || null);
							} catch (_e) {
								if (stillCurrent()) setSubtitleTrackEvents(null);
							}
						}
					} else if (action.type === 'text') {
						try {
							const data = await playback.fetchSubtitleData(sub);
							if (stillCurrent()) setSubtitleTrackEvents(data?.TrackEvents || null);
						} catch (err) {
							console.error('[Player] Error fetching subtitle data:', err);
							if (stillCurrent()) setSubtitleTrackEvents(null);
						}
					} else if (action.type === 'pgs') {
						try {
							const renderer = await initPgsCanvasRenderer(pgsCanvasRef.current, sub);
							if (!stillCurrent()) {
								if (renderer) disposePgsRenderer(renderer);
								return;
							}
							if (renderer) {
								pgsRendererRef.current = renderer;
							} else {
								console.error('[Player] PGS renderer returned null');
							}
							setSubtitleTrackEvents(null);
						} catch (err) {
							console.error('[Player] Error initializing PGS renderer:', err);
							if (stillCurrent()) setSubtitleTrackEvents(null);
						}
					}
				};

				// when a native selection never lands, render the same track
				// client side instead
				const nativeSubtitleFallback = (stream) => {
					if (!stillCurrent()) return;
					useNativeSubtitleRef.current = false;
					avplaySetSilentSubtitle(true);
					if (stream.isImageBased && settings.enablePgsRendering) {
						loadSubtitleAssets({type: 'pgs', stream});
					} else if (stream.isTextBased) {
						loadSubtitleAssets({type: 'text', stream});
					}
				};

				if (initialSubtitleIndex !== undefined && initialSubtitleIndex !== null) {
					if (initialSubtitleIndex >= 0) {
						selectInitialSubtitle(result.subtitleStreams?.find(s => s.index === initialSubtitleIndex));
					} else {
						setSelectedSubtitleIndex(-1);
						setSubtitleTrackEvents(null);
					}
				} else if (settings.subtitleMode === 'always') {
					const defaultSub = result.subtitleStreams?.find(s => s.isDefault) || result.subtitleStreams?.[0];
					selectInitialSubtitle(defaultSub);
				} else if (settings.subtitleMode === 'forced') {
					selectInitialSubtitle(result.subtitleStreams?.find(s => s.isForced));
				} else if (settings.subtitleMode === 'default' &&
						result.defaultSubtitleStreamIndex != null && result.defaultSubtitleStreamIndex >= 0) {
					// Honor the Jellyfin user's subtitle preference, computed server side
					// from their SubtitleMode and SubtitleLanguagePreference
					selectInitialSubtitle(result.subtitleStreams?.find(s => s.index === result.defaultSubtitleStreamIndex));
				}

				// Build title and subtitle
				let displayTitle = item.Name;
				let displaySubtitle = '';
				if (isLiveTV) {
					displayTitle = item.Name || 'Live TV';
					displaySubtitle = item.ChannelNumber ? `Channel ${item.ChannelNumber}` : '';
				} else if (item.SeriesName) {
					displayTitle = item.SeriesName;
					displaySubtitle = `S${item.ParentIndexNumber}E${item.IndexNumber} - ${item.Name}`;
				} else if (result.isAudio) {
					displayTitle = item.Name;
					displaySubtitle = item.AlbumArtist || item.Artists?.[0] || item.Album || '';
				}
				setTitle(displayTitle);
				setSubtitle(displaySubtitle);
				const shouldUseAudioMode = !!result.isAudio || item?.MediaType === 'Audio' || item?.Type === 'Audio';
				setIsAudioMode(shouldUseAudioMode);
				setFocusRow(shouldUseAudioMode ? 'top' : 'bottom');
				setIsFavorite(!!item.UserData?.IsFavorite);

				// Audio mode: always show controls, skip video-only features.
				// Segment and next episode lookups only feed overlays, so they run
				// in the background instead of holding up playback
				if (shouldUseAudioMode) {
					setControlsVisible(true);
				} else if (!isLiveTV) {
					withTimeout(playback.getMediaSegments(item.Id), 4000).then((segments) => {
						if (stillCurrent()) setMediaSegments(segments);
					}).catch((segmentErr) => {
						console.warn('[Player] Media segment fetch skipped:', segmentErr?.message || segmentErr);
						if (stillCurrent()) setMediaSegments({introStart: null, introEnd: null, creditsStart: null});
					});

					if (item.Type === 'Episode') {
						withTimeout(playback.getNextEpisode(item), 4000).then((next) => {
							if (stillCurrent()) setNextEpisode(next);
						}).catch((nextErr) => {
							console.warn('[Player] Next episode lookup skipped:', nextErr?.message || nextErr);
							if (stillCurrent()) setNextEpisode(null);
						});
					}
				}

				// === Start AVPlay ===
				console.log('[Player] avplayOpen URL:', result.url);
				console.log('[Player] playMethod:', result.playMethod, 'mimeType:', result.mimeType, 'container:', result.mediaSource?.Container, 'transcodingContainer:', result.mediaSource?.TranscodingContainer);

				const wantsNativeAudio = pendingAudioIndex != null && result.playMethod !== playback.PlayMethod.Transcode;
				const wantsNativeSub = pendingSubAction?.type === 'native' && !!pendingSubAction.stream;
				pendingTracksRef.current = {
					audioIndex: wantsNativeAudio ? pendingAudioIndex : null,
					audioApplied: !wantsNativeAudio,
					subStream: wantsNativeSub ? pendingSubAction.stream : null,
					subApplied: !wantsNativeSub,
					audioStreams: result.audioStreams || [],
					subtitleStreams: result.subtitleStreams || [],
					onNativeFallback: nativeSubtitleFallback,
					deadline: null
				};
				activeNativeSubRef.current = null;

				await openAndPrepare({
					url: result.url,
					playMethod: result.playMethod,
					mediaSource: result.mediaSource,
					resumeTicks: startPosition,
					hasNativePendingSub: wantsNativeSub,
					shouldAbort: () => !stillCurrent()
				});
				if (!stillCurrent()) return;

				// keep firmware from auto enabling the first embedded track when
				// nothing renders natively
				if (!wantsNativeSub) {
					avplaySetSilentSubtitle(true);
					useNativeSubtitleRef.current = false;
				}

				if (pendingSubAction && !wantsNativeSub) {
					loadSubtitleAssets(pendingSubAction);
				}

				playback.reportStart(positionRef.current);
				playback.startProgressReporting(
					() => positionRef.current,
					10000,
					() => ({ isPaused: avplayGetState() !== 'PLAYING' })
				);
				playback.startHealthMonitoring(handleUnhealthy);
				healthMonitorRef.current = playback.getHealthMonitor();

				// Start time update polling
				startTimeUpdatePolling();

				console.log(`[Player] Loaded ${displayTitle} via ${result.playMethod} (AVPlay native)${isLiveTV ? ' [Live TV]' : ''}`);
			} catch (err) {
				console.error('[Player] Failed to load media:', err);
				if (stillCurrent()) setError(err.message || $L('Failed to load media'));
			} finally {
				if (stillCurrent()) setIsLoading(false);
			}
		};

		loadMedia();

		return () => {
			// Report stop to server with current position
			if (positionRef.current > 0) {
				playback.reportStop(positionRef.current);
			}

			playback.stopProgressReporting();
			playback.stopHealthMonitoring();
			stopTimeUpdatePolling();
			cleanupAVPlay();
			if (pgsRendererRef.current) {
				disposePgsRenderer(pgsRendererRef.current);
				pgsRendererRef.current = null;
			}
			if (assRendererRef.current) {
				disposeAssRenderer(assRendererRef.current);
				assRendererRef.current = null;
			}
			avplayReadyRef.current = false;

			resetPopups(); // eslint-disable-line no-use-before-define
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
			if (seekDebounceRef.current) {
				clearTimeout(seekDebounceRef.current);
				seekDebounceRef.current = null;
			}
			if (subtitleTimeoutRef.current) {
				clearTimeout(subtitleTimeoutRef.current);
				subtitleTimeoutRef.current = null;
			}
			if (trackConfirmTimerRef.current) {
				clearTimeout(trackConfirmTimerRef.current);
				trackConfirmTimerRef.current = null;
			}
			useNativeSubtitleRef.current = false;
			pendingSeekMsRef.current = null;
			pendingTracksRef.current = null;
			activeNativeSubRef.current = null;
			suspendedRef.current = null;
			currentUrlRef.current = null;
			deferredResumeSeekRef.current = null;
			pausedErrorRef.current = null;
			burnInSubtitleRef.current = null;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item, resume, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, settings.subtitleMode, settings.introAction, settings.outroAction]);

	useEffect(() => {
		if (typeof window === 'undefined') return () => {};

		const handleResize = () => {
			if (!avplayReadyRef.current) return;
			applyDisplayWindow();
			enforceRootFontSize();
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [applyDisplayWindow, enforceRootFontSize]);

	useEffect(() => {
		if (avplayReadyRef.current) {
			applyDisplayWindow();
		}
	}, [videoAspectRatio, applyDisplayWindow]);

	// Guard against random WebKit/Tizen page zoom side-effects while in player.
	// We lock the root font-size to the value at player entry and restore on exit.
	useEffect(() => {
		if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

		const html = document.documentElement;
		if (!html) return () => {};

		const baselinePx = getRootFontSizePx();
		rootFontSizePxRef.current = baselinePx;
		prevInlineRootFontSizeRef.current = html.style.fontSize || '';
		html.style.fontSize = `${baselinePx}px`;

		const observer = new window.MutationObserver(() => {
			enforceRootFontSize();
		});
		observer.observe(html, {attributes: true, attributeFilter: ['style', 'class']});

		window.addEventListener('resize', enforceRootFontSize);

		return () => {
			observer.disconnect();
			window.removeEventListener('resize', enforceRootFontSize);
			if (prevInlineRootFontSizeRef.current) {
				html.style.fontSize = prevInlineRootFontSizeRef.current;
			} else {
				html.style.removeProperty('font-size');
			}
			rootFontSizePxRef.current = null;
		};
	}, [enforceRootFontSize]);

	// ==============================
	// Controls Auto-hide
	// ==============================
	const showControls = useCallback((isModalOpen = activeModal) => {
		setControlsVisible(true);
		if (controlsTimeoutRef.current) {
			clearTimeout(controlsTimeoutRef.current);
		}
		// Don't auto-hide controls in audio mode
		if (!isAudioMode && !isModalOpen) {
			controlsTimeoutRef.current = setTimeout(() => {
			  setControlsVisible(false);
			}, CONTROLS_HIDE_DELAY);
		}
	}, [activeModal, isAudioMode]);

	const hideControls = useCallback(() => {
		setControlsVisible(false);
		if (controlsTimeoutRef.current) {
			clearTimeout(controlsTimeoutRef.current);
		}
	}, []);

	const onPlayNextWithCleanup = useCallback(async (episode) => {
		const session = playback.getCurrentSession();
		const trackOptions = session ? {
			audioStreamIndex: session.audioStreamIndex,
			subtitleStreamIndex: session.subtitleStreamIndex
		} : null;
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);
		cleanupAVPlay();
		avplayReadyRef.current = false;
		onPlayNext(episode, trackOptions);
	}, [onPlayNext, stopTimeUpdatePolling]);

	const onSeekToIntroEnd = useCallback(() => {
		if (mediaSegments?.introEnd && avplayReadyRef.current) {
			const seekMs = Math.floor(mediaSegments.introEnd / 10000);
			avplaySeek(seekMs).catch(e => console.warn('[Player] Seek failed:', e));
		}
	}, [mediaSegments]);

	const {
		showSkipIntro, showSkipCredits, showNextEpisode, nextEpisodeCountdown,
		handleSkipIntro, handlePlayNextEpisode, cancelNextEpisodeCountdown,
		checkSegments, handlePopupKeyDown, resetPopups
	} = useSegmentPopups({
		mediaSegments, nextEpisode, settings, runTimeRef,
		activeModal, controlsVisible, hideControls, showControls,
		onSeekToIntroEnd,
		onPlayNext: onPlayNextWithCleanup
	});

	const handleNextTrack = useCallback(async () => {
		if (!audioPlaylist || !onPlayNext) return;
		if (!isAudioMode) {
			if (hasNextTrack) {
				await playback.reportStop(positionRef.current);
				onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
			}
			return;
		}
		if (repeatMode === 'one' && avplayReadyRef.current) {
			avplaySeek(0).catch(e => console.warn('[Player] Seek failed:', e));
			return;
		}
		if (shuffleMode) {
			const candidates = audioPlaylist.filter((_, i) => i !== audioPlaylistIndex);
			if (candidates.length > 0) {
				await playback.reportStop(positionRef.current);
				onPlayNext(candidates[Math.floor(Math.random() * candidates.length)]);
			}
			return;
		}
		if (hasNextTrack) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		} else if (repeatMode === 'all' && audioPlaylist.length > 0) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[0]);
		}
	}, [hasNextTrack, onPlayNext, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode, isAudioMode]);

	const handlePrevTrack = useCallback(async () => {
		if (!audioPlaylist || !onPlayNext) return;
		if (!isAudioMode) {
			if (hasPrevTrack) {
				await playback.reportStop(positionRef.current);
				onPlayNext(audioPlaylist[audioPlaylistIndex - 1]);
			}
			return;
		}
		if (avplayReadyRef.current) {
			const ms = avplayGetCurrentTime();
			if (ms > 3000) {
				avplaySeek(0).catch(e => console.warn('[Player] Seek failed:', e));
				return;
			}
		}
		if (shuffleMode && audioPlaylist && onPlayNext) {
			const candidates = audioPlaylist.filter((_, i) => i !== audioPlaylistIndex);
			if (candidates.length > 0) {
				await playback.reportStop(positionRef.current);
				onPlayNext(candidates[Math.floor(Math.random() * candidates.length)]);
			}
			return;
		}
		if (hasPrevTrack && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex - 1]);
		} else if (repeatMode === 'all' && audioPlaylist && audioPlaylist.length > 0 && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylist.length - 1]);
		}
	}, [hasPrevTrack, onPlayNext, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode, isAudioMode]);

	// ==============================
	// Playback Event Handlers (via AVPlay listener refs)
	// ==============================
	const handleEnded = useCallback(async () => {
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);

		if (repeatMode === 'one' && avplayReadyRef.current) {
			avplaySeek(0).catch(e => console.warn('[Player] Seek failed:', e));
			return;
		}

		cleanupAVPlay();
		avplayReadyRef.current = false;

		if (audioPlaylist && onPlayNext) {
			if (shuffleMode) {
				const candidates = audioPlaylist.filter((_, i) => i !== audioPlaylistIndex);
				if (candidates.length > 0) {
					onPlayNext(candidates[Math.floor(Math.random() * candidates.length)]);
					return;
				}
			}
			if (hasNextTrack) {
				onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
				return;
			}
			if (repeatMode === 'all' && audioPlaylist.length > 0) {
				onPlayNext(audioPlaylist[0]);
				return;
			}
		}
		if (nextEpisode && onPlayNext) {
			onPlayNext(nextEpisode);
		} else {
			onEnded?.();
		}
	}, [onEnded, onPlayNext, nextEpisode, stopTimeUpdatePolling, hasNextTrack, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode]);

	const handleError = useCallback(async () => {
		console.error('[Player] Playback error');

		if (!hasTriedTranscode && playMethod !== playback.PlayMethod.Transcode) {
			console.log('[Player] DirectPlay failed, falling back to transcode...');
			setHasTriedTranscode(true);

			try {
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: positionRef.current,
					maxBitrate: selectedQuality || settings.maxBitrate,
					enableDirectPlay: false,
					enableDirectStream: false,
					enableTranscoding: true,
					mediaSourceId: mediaSourceId,
					item: item,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				});

				if (result.url) {
					try {
						await restartFromResult(result, positionRef.current);
					} catch (restartErr) {
						console.error('[Player] AVPlay restart failed:', restartErr);
						setError($L('Playback failed. The file format may not be supported.'));
					}
					return;
				}
			} catch (fallbackErr) {
				console.error('[Player] Transcode fallback failed:', fallbackErr);
			}
		}

		setError($L('Playback failed. The file format may not be supported.'));
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, settings.stereoUpmixEnabled, restartFromResult, mediaSourceId]);

	// Reload the current item from its last position, used when a suspended
	// session cant be restored after the app returns to the foreground
	const reloadCurrentPlayback = useCallback(async () => {
		try {
			const result = await playback.getPlaybackInfo(item.Id, {
				startPositionTicks: positionRef.current,
				maxBitrate: selectedQuality || settings.maxBitrate,
				mediaSourceId,
				audioStreamIndex: selectedAudioIndex != null ? selectedAudioIndex : undefined,
				item,
				stereoUpmixEnabled: settings.stereoUpmixEnabled
			});
			await restartFromResult(result, positionRef.current);
		} catch (err) {
			console.error('[Player] Stream reload failed:', err);
			setError($L('Playback failed. The file format may not be supported.'));
		}
	}, [item, selectedQuality, settings.maxBitrate, settings.stereoUpmixEnabled, mediaSourceId, selectedAudioIndex, restartFromResult]);

	// Keep callback refs in sync
	handleEndedCallbackRef.current = handleEnded;
	handleErrorCallbackRef.current = handleError;
	reloadPlaybackRef.current = reloadCurrentPlayback;

	// ==============================
	// Control Actions (AVPlay-based)
	// ==============================
	const handleBack = useCallback(async () => {
		cancelNextEpisodeCountdown();
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);
		cleanupAVPlay();
		avplayReadyRef.current = false;
		onBack?.();
	}, [onBack, cancelNextEpisodeCountdown, stopTimeUpdatePolling]);

	// an error swallowed during pause means the pipeline may be dead, so after
	// resuming check that playback actually moves and recover if it doesnt
	const verifyResumeHealthy = useCallback(() => {
		if (!pausedErrorRef.current) return;
		setTimeout(() => {
			if (pausedErrorRef.current && avplayGetState() !== 'PLAYING') {
				pausedErrorRef.current = null;
				handleErrorCallbackRef.current?.();
			}
		}, 1500);
	}, []);

	const handlePlayPause = useCallback(() => {
		const state = avplayGetState();
		if (isInGroup && !syncPlayCommandRef.current) {
			if (state === 'PLAYING') {
				syncPlayService.sendPauseRequest();
			} else {
				syncPlayService.sendPlayRequest();
			}
			return;
		}
		if (state === 'PLAYING') {
			avplayPause();
			setIsPaused(true);
			// Pause bug where the playe would thro erros when paused for longer
			healthMonitorRef.current?.setPaused(true);
			playback.reportProgress(positionRef.current, { isPaused: true, eventName: 'pause' });
		} else if (state === 'PAUSED' || state === 'READY') {
			const rewind = settings.unpauseRewind || 0;
			if (rewind > 0) {
				const ms = avplayGetCurrentTime();
				const newMs = Math.max(0, ms - rewind * 1000);
				avplaySeek(newMs).catch(() => {});
			}
			avplayPlay();
			setIsPaused(false);
			healthMonitorRef.current?.setPaused(false);
			verifyResumeHealthy();
			playback.reportProgress(positionRef.current, { isPaused: false, eventName: 'unpause' });
		}
	}, [settings.unpauseRewind, isInGroup, verifyResumeHealthy]);

	const handleRewind = useCallback(() => {
		if (!avplayReadyRef.current) return;
		if (isInGroup && !syncPlayCommandRef.current) {
			const newTicks = Math.max(0, positionRef.current - settings.seekStep * 10000000);
			syncPlayService.sendSeekRequest(newTicks);
			return;
		}
		const ms = avplayGetCurrentTime();
		const newMs = Math.max(0, ms - settings.seekStep * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings.seekStep, isInGroup]);

	const handleForward = useCallback(() => {
		if (!avplayReadyRef.current) return;
		if (isInGroup && !syncPlayCommandRef.current) {
			const newTicks = Math.min(runTimeRef.current, positionRef.current + settings.seekStep * 10000000);
			syncPlayService.sendSeekRequest(newTicks);
			return;
		}
		const ms = avplayGetCurrentTime();
		const durationMs = avplayGetDuration();
		const step = settings.skipForwardLength || settings.seekStep;
		const newMs = Math.min(durationMs, ms + step * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings.skipForwardLength, settings.seekStep, isInGroup]);

	// Modal handlers
	const openModal = useCallback((modal) => {
	  lastFocusedElementRef.current = document.activeElement;
		setActiveModal(modal);
		window.requestAnimationFrame(() => {
			const modalId = `${modal}-modal`;
			const focusResult = Spotlight.focus(modalId);

			if (!focusResult) {
				const selectedItem = document.querySelector(`[data-modal="${modal}"] [data-selected="true"]`);
				const firstItem = document.querySelector(`[data-modal="${modal}"] button`);
				if (selectedItem) {
					Spotlight.focus(selectedItem);
				} else if (firstItem) {
					Spotlight.focus(firstItem);
				}
			}
		});
	}, []);

	const closeModal = useCallback(() => {
		setActiveModal(null);
		showControls(false);
		window.requestAnimationFrame(() => {
		  if (lastFocusedElementRef.current) {
				Spotlight.focus(lastFocusedElementRef.current);
			}else{
			  Spotlight.focus('playerControls');
			}
		});
	}, [showControls]);

	// Track selection - using data attributes to avoid arrow functions in JSX
	const handleSelectAudio = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		setSelectedAudioIndex(index);
		closeModal();

		try {
			// AVPlay: try switching audio track natively first
			if (playMethod !== playback.PlayMethod.Transcode && avplayReadyRef.current) {
				try {
					const tizenAudioIndex = mapJellyfinTrackToTizen(avplayGetTracks(), audioStreams, 'AUDIO', index);
					if (tizenAudioIndex != null) {
						avplaySelectTrack('AUDIO', tizenAudioIndex);
						playback.updateCurrentSession({audioStreamIndex: index});
						console.log('[Player] Switched audio track natively, jellyfinIndex:', index, 'tizenIndex:', tizenAudioIndex);
						return;
					}
					console.log('[Player] No matching native audio track, reloading');
				} catch (nativeErr) {
					console.log('[Player] Native audio switch failed, reloading:', nativeErr.message);
				}
			}

			const currentMs = avplayGetCurrentTime();
			const currentPositionTicks = Math.floor(currentMs * 10000);

			const result = await playback.changeAudioStream(index, currentPositionTicks);
			if (result) {
				console.log('[Player] Switching audio track via stream reload for', playMethod, '- resuming from', currentPositionTicks);
				await restartFromResult(result, currentPositionTicks);
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, restartFromResult, audioStreams]);

	const applySubtitleSelection = useCallback(async (index, streamList = subtitleStreams, shouldClose = true) => {
		if (pgsRendererRef.current) {
			disposePgsRenderer(pgsRendererRef.current);
			pgsRendererRef.current = null;
		}
		if (pgsCanvasRef.current) {
			clearPgsCanvas(pgsCanvasRef.current);
		}
		if (assRendererRef.current) {
			disposeAssRenderer(assRendererRef.current);
			assRendererRef.current = null;
		}

		if (index === -1) {
			setSelectedSubtitleIndex(-1);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
			useNativeSubtitleRef.current = false;
			activeNativeSubRef.current = null;
			if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
			avplaySetSilentSubtitle(true);
			if (burnInSubtitleRef.current != null) {
				burnInSubtitleRef.current = null;
				try {
					await reloadWithSubtitleIndex(-1);
				} catch (err) {
					console.error('[Player] Subtitle reload failed:', err);
				}
			}
		} else {
			setSelectedSubtitleIndex(index);
			const stream = streamList.find((s) => s.index === index);

			// leaving a burned in track needs a fresh stream without it, or the
			// old subtitle stays baked into the video under the new selection
			if (burnInSubtitleRef.current != null && !(stream && stream.isBurnIn)) {
				burnInSubtitleRef.current = null;
				try {
					await reloadWithSubtitleIndex(index);
				} catch (err) {
					console.error('[Player] Subtitle reload failed:', err);
				}
			}

			let nativeSuccess = false;
			activeNativeSubRef.current = null;

			if (stream && stream.isEmbeddedNative) {
				try {
					nativeSuccess = applyNativeSubtitleTrack(stream, streamList);
				} catch (err) {
					console.warn('[Player] Error selecting native track:', err);
				}
			}

			if (nativeSuccess) {
				setSubtitleTrackEvents(null);
				setCurrentSubtitleText(null);
			} else if (stream && stream.isBurnIn) {
				// the server burns these formats into the video, so the stream
				// has to reload with the subtitle index in the negotiation
				useNativeSubtitleRef.current = false;
				avplaySetSilentSubtitle(true);
				setSubtitleTrackEvents(null);
				setCurrentSubtitleText(null);
				if (burnInSubtitleRef.current !== index) {
					try {
						await reloadWithSubtitleIndex(index);
						burnInSubtitleRef.current = index;
					} catch (err) {
						console.error('[Player] Burn in subtitle reload failed:', err);
					}
				}
			} else if (stream && stream.isEmbeddedNative && stream.isImageBased && settings.enablePgsRendering) {
				// Native PGS track selection failed -- fall back to libpgs.
				useNativeSubtitleRef.current = false;
				avplaySetSilentSubtitle(true);
				try {
					const renderer = await initPgsCanvasRenderer(pgsCanvasRef.current, stream);
					if (renderer) pgsRendererRef.current = renderer;
				} catch (err) {
					console.error('[Player] libpgs fallback failed:', err);
				}
				setSubtitleTrackEvents(null);
				setCurrentSubtitleText(null);
			} else if (stream && stream.isAss && supportsAssRenderer()) {
				useNativeSubtitleRef.current = false;
				avplaySetSilentSubtitle(true);
				try {
					const assUrl = playback.getAssSubtitleUrl(stream);
					if (assUrl && pgsCanvasRef.current) {
						const assFontsUrl = playback.getAssFontsUrl(stream);
						const assErrorHandler = (err) => {
							console.error('[Player] ASS renderer error, falling back to text', err);
							disposeAssRenderer(assRendererRef.current);
							assRendererRef.current = null;
							playback.fetchSubtitleData(stream).then(data => {
								setSubtitleTrackEvents(data?.TrackEvents || null);
							}).catch(() => setSubtitleTrackEvents(null));
						};
						const renderer = await initAssCanvasRenderer(pgsCanvasRef.current, assUrl, assFontsUrl, assErrorHandler);
						if (renderer) {
							assRendererRef.current = renderer;
							setSubtitleTrackEvents(null);
						} else {
							const data = await playback.fetchSubtitleData(stream);
							setSubtitleTrackEvents(data?.TrackEvents || null);
						}
					}
				} catch (err) {
					console.error('[Player] ASS init failed, falling back to text', err);
					try {
						const data = await playback.fetchSubtitleData(stream);
						setSubtitleTrackEvents(data?.TrackEvents || null);
					} catch (_e) {
						setSubtitleTrackEvents(null);
					}
				}
			} else if (stream && (stream.isTextBased || stream.isEmbeddedNative)) {
				useNativeSubtitleRef.current = false;
				avplaySetSilentSubtitle(true);
				try {
					const data = await playback.fetchSubtitleData(stream);
					if (data && data.TrackEvents) {
						setSubtitleTrackEvents(data.TrackEvents);
					} else {
						setSubtitleTrackEvents(null);
					}
				} catch (err) {
					setSubtitleTrackEvents(null);
				}
			} else if (stream && stream.isImageBased && settings.enablePgsRendering) {
				useNativeSubtitleRef.current = false;
				avplaySetSilentSubtitle(true);
				try {
					const renderer = await initPgsCanvasRenderer(pgsCanvasRef.current, stream);
					if (renderer) {
						pgsRendererRef.current = renderer;
					} else {
						console.error('[Player] PGS renderer returned null');
					}
					setSubtitleTrackEvents(null);
				} catch (err) {
					console.error('[Player] PGS init failed:', err);
					setSubtitleTrackEvents(null);
				}
			} else {
				avplaySetSilentSubtitle(true);
				setSubtitleTrackEvents(null);
			}
			setCurrentSubtitleText(null);
		}

		playback.updateCurrentSession({subtitleStreamIndex: index});
		if (shouldClose) {
			closeModal();
		}
	}, [subtitleStreams, closeModal, settings.enablePgsRendering, applyNativeSubtitleTrack, reloadWithSubtitleIndex]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		await applySubtitleSelection(index, subtitleStreams, true);
	}, [applySubtitleSelection, subtitleStreams]);

	const handleSelectSpeed = useCallback((e) => {
		const rate = parseFloat(e.currentTarget.dataset.rate);
		if (isNaN(rate)) return;
		if (avplayReadyRef.current && !avplaySetSpeed(rate)) {
			// the platform refused the rate, put both the player and the UI back
			avplaySetSpeed(1);
			setPlaybackRate(1);
			closeModal();
			return;
		}
		setPlaybackRate(rate);
		closeModal();
	}, [closeModal]);

	const handleSelectQuality = useCallback((e) => {
		const valueStr = e.currentTarget.dataset.value;
		const value = valueStr === 'null' ? null : parseInt(valueStr, 10);
		setSelectedQuality(isNaN(value) ? null : value);
		closeModal();
	}, [closeModal]);

	const handleSelectChapter = useCallback((e) => {
		const ticks = parseInt(e.currentTarget.dataset.ticks, 10);
		if (isNaN(ticks)) return;
		if (avplayReadyRef.current && ticks >= 0) {
			const seekMs = Math.floor(ticks / 10000);
			avplaySeek(seekMs).catch(err => console.warn('[Player] Chapter seek failed:', err));
		}
		closeModal();
	}, [closeModal]);

	// Progress bar seeking
	const handleProgressClick = useCallback((e) => {
		if (!avplayReadyRef.current) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		const newTimeMs = percent * duration * 1000;
		avplaySeek(newTimeMs).catch(err => console.warn('[Player] Seek failed:', err));
	}, [duration]);

	// Deferred seek helpers: only execute the actual avplaySeek after the user
	// stops pressing arrow keys (debounce) or presses OK/Enter to confirm.
	const executeDeferredSeek = useCallback(() => {
		if (seekDebounceRef.current) {
			clearTimeout(seekDebounceRef.current);
			seekDebounceRef.current = null;
		}
		if (pendingSeekMsRef.current != null && avplayReadyRef.current) {
			const seekMs = pendingSeekMsRef.current;
			pendingSeekMsRef.current = null;
			avplaySeek(seekMs).catch(err => console.warn('[Player] Deferred seek failed:', err));
		}
	}, []);

	const scheduleDeferredSeek = useCallback((targetMs) => {
		pendingSeekMsRef.current = targetMs;
		if (seekDebounceRef.current) {
			clearTimeout(seekDebounceRef.current);
		}
		seekDebounceRef.current = setTimeout(() => {
			seekDebounceRef.current = null;
			executeDeferredSeek();
		}, 500);
	}, [executeDeferredSeek]);

	// Progress bar keyboard control - deferred seeking
	const handleProgressKeyDown = useCallback((e) => {
		if (!avplayReadyRef.current) return;
		showControls();
		const step = settings.seekStep;

		if (e.key === 'ArrowLeft' || e.keyCode === 37) {
			e.preventDefault();
			setIsSeeking(true);
			// Use pending position if user is still seeking, otherwise use current AVPlay time
			const baseMs = pendingSeekMsRef.current != null ? pendingSeekMsRef.current : avplayGetCurrentTime();
			const newMs = Math.max(0, baseMs - step * 1000);
			setSeekPosition(Math.floor(newMs * 10000));
			scheduleDeferredSeek(newMs);
		} else if (e.key === 'ArrowRight' || e.keyCode === 39) {
			e.preventDefault();
			setIsSeeking(true);
			const baseMs = pendingSeekMsRef.current != null ? pendingSeekMsRef.current : avplayGetCurrentTime();
			const durationMs = avplayGetDuration();
			const newMs = Math.min(durationMs, baseMs + step * 1000);
			setSeekPosition(Math.floor(newMs * 10000));
			scheduleDeferredSeek(newMs);
		} else if (e.key === 'Enter' || e.keyCode === 13) {
			e.preventDefault();
			executeDeferredSeek();
			setIsSeeking(false);
		} else if (e.key === 'ArrowUp' || e.keyCode === 38) {
			e.preventDefault();
			executeDeferredSeek();
			setFocusRow(isAudioMode ? 'top' : 'bottom');
			setIsSeeking(false);
			window.requestAnimationFrame(() => Spotlight.focus(isAudioMode ? 'favorite-btn' : 'play-pause-btn'));
		} else if (e.key === 'ArrowDown' || e.keyCode === 40) {
			e.preventDefault();
			executeDeferredSeek();
			setFocusRow('bottom');
			setIsSeeking(false);
			if (isAudioMode) {
				window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
			}
		}
	}, [settings.seekStep, showControls, scheduleDeferredSeek, executeDeferredSeek, isAudioMode]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleProgressBlur = useCallback(() => {
		executeDeferredSeek();
		setIsSeeking(false);
	}, [executeDeferredSeek]);

	const handleToggleShuffle = useCallback(() => {
		setShuffleMode(prev => !prev);
	}, []);

	const handleToggleRepeat = useCallback(() => {
		setRepeatMode(prev => {
			if (prev === 'off') return 'all';
			if (prev === 'all') return 'one';
			return 'off';
		});
	}, []);

	const handleToggleFavorite = useCallback(async () => {
		if (!item?.Id) return;
		const newState = !isFavorite;
		setIsFavorite(newState);
		try {
			const serverUrl = item._serverUrl || getServerUrl();
			const serverApi = serverUrl ? createApiForServer(serverUrl) : jellyfinApi;
			await serverApi.setFavorite(item.Id, newState);
		} catch (err) {
			console.error('[Player] Failed to toggle favorite:', err);
			setIsFavorite(!newState);
		}
	}, [item, isFavorite]);

	const handleToggleZoom = useCallback(() => {
		setZoomMode((prev) => {
			const next = prev === 'fit' ? 'fill' : (prev === 'fill' ? 'stretch' : 'fit');
			zoomModeRef.current = next;
			window.requestAnimationFrame(() => applyDisplayWindow());
			return next;
		});
	}, [applyDisplayWindow]);

	const handleOpenCast = useCallback(async () => {
		openModal('cast');
		if (castMembers.length > 0 || !(item?.Type === 'Episode' && item?.SeriesId)) return;

		setIsLoadingCastMembers(true);
		try {
			const apiClient = item._serverUrl
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: jellyfinApi;
			const seriesItem = await apiClient.getItem(item.SeriesId);
			setCastMembers(Array.isArray(seriesItem?.People) ? seriesItem.People : []);
		} catch (err) {
			setCastMembers([]);
		} finally {
			setIsLoadingCastMembers(false);
		}
	}, [openModal, castMembers.length, item]);

	const handleSelectCastMember = useCallback((person) => {
		if (!person?.Id || !onSelectPerson) return;
		closeModal();
		onSelectPerson({
			...person,
			Type: 'Person',
			_serverUrl: item?._serverUrl,
			_serverType: item?._serverType,
			_serverAccessToken: item?._serverAccessToken,
			_serverUserId: item?._serverUserId
		});
	}, [closeModal, item, onSelectPerson]);

	const handleButtonAction = useCallback((action) => {
		showControls();
		switch (action) {
			case 'playPause': handlePlayPause(); break;
			case 'rewind': handleRewind(); break;
			case 'forward': handleForward(); break;
			case 'audio': openModal('audio'); break;
			case 'subtitle': openModal('subtitle'); break;
			case 'speed': openModal('speed'); break;
			case 'quality': openModal('quality'); break;
			case 'chapter': openModal('chapter'); break;
			case 'cast': handleOpenCast(); break;
			case 'zoom': handleToggleZoom(); break;
			case 'info': openModal('info'); break;
			case 'next': handlePlayNextEpisode(); break;
			case 'nextTrack': handleNextTrack(); break;
			case 'prevTrack': handlePrevTrack(); break;
			case 'shuffle': handleToggleShuffle(); break;
			case 'repeat': handleToggleRepeat(); break;
			case 'favorite': handleToggleFavorite(); break;
			default: break;
		}
	}, [showControls, handlePlayPause, handleRewind, handleForward, openModal, handleOpenCast, handleToggleZoom, handlePlayNextEpisode, handleNextTrack, handlePrevTrack, handleToggleShuffle, handleToggleRepeat, handleToggleFavorite]);

	const handleControlButtonClick = useCallback((e) => {
		const action = e.currentTarget.dataset.action;
		if (action) {
			handleButtonAction(action);
		}
	}, [handleButtonAction]);

	const handleSubtitleOffsetChange = useCallback((newOffset) => {
		setSubtitleOffset(newOffset);
	}, []);

	const stopPropagation = useCallback((e) => {
		e.stopPropagation();
	}, []);

	// Extracted handlers for subtitle modal navigation
	const handleSubtitleItemKeyDown = useCallback((e) => {
		if (e.keyCode === 39) { // Right -> Appearance
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('btn-subtitle-appearance');
		} else if (e.keyCode === 37) { // Left -> Offset
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('btn-subtitle-offset');
		}
	}, []);

	const handleOpenSubtitleOffset = useCallback(() => openModal('subtitleOffset'), [openModal]);
	const handleOpenSubtitleSettings = useCallback(() => openModal('subtitleSettings'), [openModal]);

	const handleOpenRemoteSubtitleSearch = useCallback(async () => {
		if (!item?.Id) return;

		setRemoteSubtitleResults([]);
		setIsSearchingRemoteSubtitles(true);
		openModal('subtitleDownload');

		const selectedSubtitle = subtitleStreams.find((s) => s.index === selectedSubtitleIndex);
		const selectedAudio = audioStreams.find((s) => s.index === selectedAudioIndex);
		const language = toSubtitleLanguage(
			selectedSubtitle?.language,
			selectedAudio?.language,
			subtitleStreams[0]?.language,
			audioStreams[0]?.language
		);

		try {
			const results = await jellyfinApi.searchRemoteSubtitles(item.Id, language);
			setRemoteSubtitleResults(mapRemoteSubtitleOptions(results));
			window.requestAnimationFrame(() => {
				const firstResult = document.querySelector('[data-modal="subtitleDownload"] button');
				if (firstResult) Spotlight.focus(firstResult);
			});
		} catch (err) {
			setRemoteSubtitleResults([]);
		} finally {
			setIsSearchingRemoteSubtitles(false);
		}
	}, [item, subtitleStreams, selectedSubtitleIndex, audioStreams, selectedAudioIndex, openModal]);

	const handleSelectRemoteSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index) || !remoteSubtitleResults[index] || !item?.Id) return;

		try {
			await jellyfinApi.downloadRemoteSubtitle(item.Id, remoteSubtitleResults[index].id);

			const existingIndexes = new Set(subtitleStreams.map((s) => s.index));
			const startTicks = Math.floor(avplayGetCurrentTime() * 10000);
			const info = await jellyfinApi.getPlaybackInfo(item.Id, {
				StartTimeTicks: startTicks,
				MediaSourceId: mediaSourceId,
				AudioStreamIndex: selectedAudioIndex,
				SubtitleStreamIndex: selectedSubtitleIndex,
				MaxStreamingBitrate: selectedQuality || settings.maxBitrate
			});

			const mediaSource = info?.MediaSources?.find((source) => source.Id === mediaSourceId) || info?.MediaSources?.[0];
			const refreshedSubtitleStreams = mapSubtitleStreamsFromMediaSource(mediaSource, getServerUrl(), {
				includeEmbeddedNative: true
			});
			setSubtitleStreams(refreshedSubtitleStreams);

			const newStream = refreshedSubtitleStreams.find((stream) => !existingIndexes.has(stream.index));
			if (newStream) {
				await applySubtitleSelection(newStream.index, refreshedSubtitleStreams, true);
			} else {
				setActiveModal('subtitle');
			}
		} catch (err) {
			setActiveModal('subtitle');
		}
	}, [remoteSubtitleResults, item, subtitleStreams, mediaSourceId, selectedAudioIndex, selectedSubtitleIndex, selectedQuality, settings.maxBitrate, applySubtitleSelection]);

	useEffect(() => {
		if (!lastCommand || !avplayReadyRef.current) return;
		if (lastCommand === lastProcessedCommandRef.current) return;
		lastProcessedCommandRef.current = lastCommand;

		const {Command, PositionTicks, When} = lastCommand;
		const delay = syncPlayService.getDelayToWhen(When);

		const execute = () => {
			syncPlayCommandRef.current = true;
			suppressBufferingUntilRef.current = Date.now() + syncPlayService.BUFFERING_SUPPRESS_MS;

			switch (Command) {
				case 'Unpause': {
					// Executing on time seeks to the commanded position. A late
					// arrival seeks ahead by the elapsed time to catch up.
					let target = delay > 0 ? PositionTicks : syncPlayService.getAdjustedPosition(PositionTicks, When);
					if (target != null) {
						if (runTimeRef.current > 0) target = Math.min(runTimeRef.current, target);
						avplaySeek(Math.floor(target / 10000)).catch(() => {});
					}
					avplayPlay();
					setIsPaused(false);
					break;
				}
				case 'Pause': {
					avplayPause();
					setIsPaused(true);
					if (PositionTicks != null) {
						avplaySeek(Math.floor(PositionTicks / 10000)).catch(() => {});
					}
					break;
				}
				case 'Seek': {
					if (PositionTicks != null) {
						avplaySeek(Math.floor(PositionTicks / 10000)).catch(() => {});
					}
					break;
				}
				default:
					break;
			}

			syncPlayCommandRef.current = false;
		};

		if (Command === 'Stop') {
			handleBack();
			return;
		}

		if (delay > 50) {
			const t = setTimeout(execute, delay);
			return () => clearTimeout(t);
		}
		execute();
	}, [lastCommand, handleBack]);

	useEffect(() => {
		if (!isInGroup) return;

		const listener = syncPlayService.addListener((event) => {
			if (event === 'stateUpdate') {
				const state = avplayGetState();
				if (state === 'PLAYING' || state === 'PAUSED') {
					syncPlayService.sendReadyRequest(
						state === 'PLAYING',
						positionRef.current
					);
				}
			}
		});

		return listener;
	}, [isInGroup]);

	useEffect(() => {
		isBufferingRef.current = isBuffering;
		if (!isInGroup) return;
		if (isBuffering) {
			const remaining = suppressBufferingUntilRef.current - Date.now();
			if (remaining > 0) {
				// This buffering came from our own command-driven seek. A genuine
				// stall must still reach the server eventually, so re-check once
				// the window expires (the state edge won't fire again for it).
				clearTimeout(stallRecheckTimerRef.current);
				stallRecheckTimerRef.current = setTimeout(() => {
					if (isBufferingRef.current) {
						syncPlayService.sendBufferingRequest(
							avplayGetState() === 'PLAYING',
							positionRef.current
						);
					}
				}, remaining + 100);
			} else {
				syncPlayService.sendBufferingRequest(
					avplayGetState() === 'PLAYING',
					positionRef.current
				);
			}
		} else if (avplayReadyRef.current) {
			clearTimeout(stallRecheckTimerRef.current);
			syncPlayService.sendReadyRequest(
				avplayGetState() === 'PLAYING',
				positionRef.current
			);
		}
		return () => clearTimeout(stallRecheckTimerRef.current);
	}, [isInGroup, isBuffering]);

	// ==============================
	// Global Key Handler
	// ==============================
	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.key || e.keyCode;

			// Media playback keys (Tizen remote)
			if (e.keyCode === KEYS.PLAY) {
				e.preventDefault();
				e.stopPropagation();
				showControls();
				const state = avplayGetState();
				if (state === 'PAUSED' || state === 'READY') {
					// In a group the request goes to the server because acting
					// locally would silently desync this client.
					if (isInGroup && !syncPlayCommandRef.current) {
						syncPlayService.sendPlayRequest();
						return;
					}
					avplayPlay();
					setIsPaused(false);
					verifyResumeHealthy();
				}
				return;
			}
			if (e.keyCode === KEYS.PAUSE) {
				e.preventDefault();
				e.stopPropagation();
				showControls();
				const state = avplayGetState();
				if (state === 'PLAYING') {
					if (isInGroup && !syncPlayCommandRef.current) {
						syncPlayService.sendPauseRequest();
						return;
					}
					avplayPause();
					setIsPaused(true);
				}
				return;
			}
			if (e.keyCode === KEYS.PLAY_PAUSE) {
				e.preventDefault();
				e.stopPropagation();
				showControls();
				handlePlayPause();
				return;
			}
			if (e.keyCode === KEYS.FAST_FORWARD) {
				e.preventDefault();
				e.stopPropagation();
				if (!isLiveTV) handleForward();
				showControls();
				return;
			}
			if (e.keyCode === KEYS.REWIND) {
				e.preventDefault();
				e.stopPropagation();
				if (!isLiveTV) handleRewind();
				showControls();
				return;
			}
			if (e.keyCode === KEYS.STOP) {
				e.preventDefault();
				e.stopPropagation();
				handleBack();
				return;
			}

			if (handlePopupKeyDown(e)) return;

			// Back button
			if (isBackKey(e) || key === 'GoBack' || key === 'Backspace') {
				e.preventDefault();
				e.stopPropagation();
				if (activeModal) {
					closeModal();
					return;
				}
				if (controlsVisible) {
					hideControls();
					return;
				}
				handleBack();
				return;
			}

			// Left/Right when controls hidden -> show controls and focus on seekbar
			if (!controlsVisible && !activeModal) {
				if ((key === 'Enter' || e.keyCode === 13) && (showSkipIntro || showSkipCredits || showNextEpisode)) {
					return;
				}
				if (key === 'Enter' || e.keyCode === 13) {
					e.preventDefault();
					handlePlayPause();
					return;
				}
				if ((key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39 ) && (showSkipCredits || showNextEpisode)) {
					return;
				}
				if (key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39) {
					e.preventDefault();
					if (isLiveTV) { showControls(); return; }
					showControls();
					setFocusRow('progress');
					setIsSeeking(true);
					const ms = avplayGetCurrentTime();
					setSeekPosition(Math.floor(ms * 10000));
					// Apply deferred seek step
					const step = settings.seekStep;
					if (key === 'ArrowLeft' || e.keyCode === 37) {
						const newMs = Math.max(0, ms - step * 1000);
						setSeekPosition(Math.floor(newMs * 10000));
						scheduleDeferredSeek(newMs);
					} else {
						const durationMs = avplayGetDuration();
						const newMs = Math.min(durationMs, ms + step * 1000);
						setSeekPosition(Math.floor(newMs * 10000));
						scheduleDeferredSeek(newMs);
					}
					return;
				}
				e.preventDefault();
				showControls();
				return;
			}

			// Up/Down arrow navigation between rows when controls are visible
			if (controlsVisible && !activeModal) {
				showControls();

				if (key === 'ArrowUp' || e.keyCode === 38) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'bottom') return !isLiveTV ? 'progress' : (isAudioMode ? 'top' : 'bottom');
						if (prev === 'progress') {
							window.requestAnimationFrame(() => Spotlight.focus(isAudioMode ? 'favorite-btn' : 'play-pause-btn'));
							return isAudioMode ? 'top' : 'bottom';
						}
						return isAudioMode ? 'top' : 'bottom';
					});
					return;
				}
				if (key === 'ArrowDown' || e.keyCode === 40) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'top') return isLiveTV ? (bottomButtons.length > 0 ? 'bottom' : 'top') : 'progress';
						if (prev === 'progress') {
							if (isAudioMode) {
								window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
								return 'bottom';
							}
							return bottomButtons.length > 0 ? 'bottom' : 'progress';
						}
						return 'bottom';
					});
					return;
				}
			}

		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, duration, settings.seekStep, handlePopupKeyDown, bottomButtons.length, isAudioMode, scheduleDeferredSeek, showSkipIntro, showSkipCredits, showNextEpisode, isLiveTV, isInGroup, verifyResumeHealthy]);

	// Calculate progress - use seekPosition when actively seeking for smooth scrubbing
	const displayTime = isSeeking ? (seekPosition / 10000000) : currentTime;
	const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;
	const bufferedPercent = progressPercent;

	// Focus appropriate element when focusRow changes
	useEffect(() => {
		if (!controlsVisible) return;

		window.requestAnimationFrame(() => {
			if (focusRow === 'progress') {
				Spotlight.focus('progress-bar');
			} else if (focusRow === 'bottom') {
				Spotlight.focus('play-pause-btn');
			}
		});
	}, [focusRow, controlsVisible]);

	// ==============================
	// Render
	// ==============================

	// Render loading
	if (isLoading) {
		return (
			<div className={css.container}>
				<div className={css.loadingIndicator}>
					<div className={css.spinner} />
					<p>{$L('Loading...')}</p>
				</div>
			</div>
		);
	}

	// Render error
	if (error) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<h2>{$L('Playback Error')}</h2>
					<p>{error}</p>
					<Button onClick={onBack}>{$L('Go Back')}</Button>
				</div>
			</div>
		);
	}

	const nextCountdownStyle = settings.nextUpCountdownStyle ?? 'both';
	const showNextCountdownTimer = nextEpisodeCountdown !== null && nextCountdownStyle !== 'progressBar';
	const showNextCountdownBar = nextEpisodeCountdown !== null && nextCountdownStyle !== 'timer';

	return (
		<div className={css.container} ref={playerContainerRef} onClick={showControls}>
			{/*
			 * No <video> element - AVPlay renders on the platform multimedia layer
			 * behind the web engine. The container is transparent so video shows through.
			 */}

			{/* Audio Mode: Album Art + Info */}
			{isAudioMode && (
				<div className={css.audioModeBackground}>
					<div className={css.audioModeContent}>
						<div className={css.audioAlbumArt}>
							{item.ImageTags?.Primary ? (
								<img
									src={getImageUrl(item._serverUrl || getServerUrl(), item.Id, 'Primary', {maxHeight: 500, quality: 90})}
									alt={item.Name}
									className={css.audioAlbumImg}
								/>
							) : item.AlbumId && item.AlbumPrimaryImageTag ? (
								<img
									src={getImageUrl(item._serverUrl || getServerUrl(), item.AlbumId, 'Primary', {maxHeight: 500, quality: 90})}
									alt={item.Album || item.Name}
									className={css.audioAlbumImg}
								/>
							) : (
								<div className={css.audioAlbumPlaceholder}>
									<svg viewBox="0 -960 960 960" fill="currentColor" width="120" height="120">
										<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
									</svg>
								</div>
							)}
						</div>
						<div className={css.audioTrackInfo}>
							<h1 className={css.audioTrackTitle}>{title}</h1>
							{subtitle && <p className={css.audioTrackArtist}>{subtitle}</p>}
							{item.Album && <p className={css.audioTrackAlbum}>{item.Album}</p>}
							<div className={css.audioLyricsPreview}>
								{isLyricsLoading && <p className={css.audioLyricsLine}>{$L('Loading lyrics...')}</p>}
								{!isLyricsLoading && lyricsError && <p className={css.audioLyricsLine}>{lyricsError}</p>}
								{!isLyricsLoading && !lyricsError && activeLyricLine && (
									<p className={css.audioLyricsLine}>{activeLyricLine}</p>
								)}
								{!isLyricsLoading && !lyricsError && !activeLyricLine && lyricsLines.length > 0 && (
									<p className={css.audioLyricsLine}>{lyricsLines[0].text}</p>
								)}
								{!isLyricsLoading && !lyricsError && lyricsLines.length === 0 && (
									<p className={css.audioLyricsLine}>{$L('No lyrics available')}</p>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Custom Subtitle Overlay - rendered on web layer above AVPlay video */}
			{currentSubtitleText && !isAudioMode && (
				<div
					className={css.subtitleOverlay}
					style={getSubtitleOverlayStyle(settings)}
				>
				{/* eslint-disable react/no-danger */}
					<div
						className={css.subtitleText}
						style={getSubtitleTextStyle(settings)}
						dangerouslySetInnerHTML={{__html: sanitizeSubtitleHtml(currentSubtitleText)}}
					/>
					{/* eslint-enable react/no-danger */}
				</div>
			)}

			{!isAudioMode && (
				<canvas
					ref={pgsCanvasRef}
					className={css.pgsCanvasOverlay}
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						width: '100%',
						height: '100%',
						zIndex: 100,
						pointerEvents: 'none'
					}}
				/>
			)}

			{/* Video Dimmer - not needed for audio */}
			{!isAudioMode && <div className={`${css.videoDimmer} ${controlsVisible ? css.visible : ''}`} />}

			{/* Buffering Indicator */}
			{isBuffering && (
				<div className={css.bufferingIndicator}>
					<div className={css.spinner} />
				</div>
			)}

			{/* Playback Indicators */}
			{playbackRate !== 1 && (
				<div className={css.playbackIndicators}>
					<div className={css.speedIndicator}>{playbackRate}x</div>
				</div>
			)}

			{isPaused && settings.showDescriptionOnPause && item?.Overview && !isAudioMode && !activeModal && !controlsVisible && (
				<div className={css.pauseDescriptionOverlay}>
					<div className={css.pauseDescriptionText}>{item.Overview}</div>
				</div>
			)}

			{/* Next Episode Overlay */}
			{(showSkipCredits || showNextEpisode) && nextEpisode && !isAudioMode && !activeModal && !controlsVisible && (
				<NextEpisodeContainer className={css.nextEpisodeOverlay} spotlightRestrict="self-only">
					{settings.nextUpBehavior !== 'minimal' ? (
						<div className={css.nextEpisodeCard}>
							<div className={css.nextThumbnail}>
								<img
									src={getImageUrl(item._serverUrl || getServerUrl(), nextEpisode.Id, 'Primary', {maxWidth: 400, quality: 80})}
									alt={nextEpisode.Name}
									className={css.nextThumbnailImg}
								/>
								<div className={css.nextThumbnailGradient} />
							</div>
							<div className={css.nextInfo}>
								<div className={css.nextLabelRow}>
									<div className={css.nextLabel}>{$L('UP NEXT')}</div>
									{showNextCountdownTimer && (
										<div className={css.nextCountdownInline}>{$L('Starting in {countdown}s').replace('{countdown}', nextEpisodeCountdown)}</div>
									)}
								</div>
								<div className={css.nextTitle}>{nextEpisode.Name}</div>
								{nextEpisode.SeriesName && (
									<div className={css.nextMeta}>
										S{nextEpisode.ParentIndexNumber} E{nextEpisode.IndexNumber} &middot; {nextEpisode.SeriesName}
									</div>
								)}
								<div className={css.nextActions}>
									<SpottableButton className={css.nextPlayBtn} onClick={handlePlayNextEpisode} spotlightId="next-episode-play-btn" data-spot-default="true">{$L('Play Now')}</SpottableButton>
									<SpottableButton className={css.nextCancelBtn} onClick={cancelNextEpisodeCountdown}>{$L('Hide')}</SpottableButton>
								</div>
							</div>
							{showNextCountdownBar && (
								<div className={css.nextProgressBar}>
									<div className={css.nextProgressFill} style={{'--countdown-duration': `${settings.nextUpTimeout ?? 7}s`}} />
								</div>
							)}
						</div>
					) : (
						<div className={css.nextEpisodeMinimal}>
							<div className={css.nextLabel}>{$L('UP NEXT')}</div>
							<div className={css.nextTitle}>{nextEpisode.Name}</div>
							{showNextCountdownTimer && (
								<div className={css.nextCountdownText}>{$L('Starting in {countdown}s').replace('{countdown}', nextEpisodeCountdown)}</div>
							)}
							<div className={css.nextActions}>
								<SpottableButton className={css.nextPlayBtn} onClick={handlePlayNextEpisode} spotlightId="next-episode-play-btn" data-spot-default="true">{$L('Play Now')}</SpottableButton>
								<SpottableButton className={css.nextCancelBtn} onClick={cancelNextEpisodeCountdown}>{$L('Hide')}</SpottableButton>
							</div>
							{showNextCountdownBar && (
								<div className={css.nextProgressBarMinimal}>
									<div className={css.nextProgressFill} style={{'--countdown-duration': `${settings.nextUpTimeout ?? 7}s`}} />
								</div>
							)}
						</div>
					)}
				</NextEpisodeContainer>
			)}

			<PlayerControls
				css={css}
				controlsVisible={controlsVisible}
				activeModal={activeModal}
				isAudioMode={isAudioMode}
				isLiveTV={isLiveTV}
				focusRow={focusRow}
				title={title}
				subtitle={subtitle}
				topButtons={topButtons}
				bottomButtons={bottomButtons}
				favoriteButton={favoriteButton}
				displayTime={displayTime}
				duration={duration}
				progressPercent={progressPercent}
				bufferedPercent={bufferedPercent}
				isSeeking={isSeeking}
				seekPosition={seekPosition}
				item={item}
				mediaSourceId={mediaSourceId}
				playMethod={playMethod}
				playbackRate={playbackRate}
				selectedAudioIndex={selectedAudioIndex}
				selectedSubtitleIndex={selectedSubtitleIndex}
				selectedQuality={selectedQuality}
				audioStreams={audioStreams}
				subtitleStreams={subtitleStreams}
				chapters={chapters}
				currentTime={currentTime}
				subtitleOffset={subtitleOffset}
				showSkipIntro={showSkipIntro}
				handleControlButtonClick={handleControlButtonClick}
				handleProgressClick={handleProgressClick}
				handleProgressKeyDown={handleProgressKeyDown}
				handleProgressBlur={handleProgressBlur}
				handleSkipIntro={handleSkipIntro}
				handleSelectAudio={handleSelectAudio}
				handleSelectSubtitle={handleSelectSubtitle}
				handleSubtitleKeyDown={handleSubtitleItemKeyDown}
				handleSelectSpeed={handleSelectSpeed}
				speedCaveat={$L('Audio is muted at speeds other than 1x on most Samsung TVs')}
				handleSelectQuality={handleSelectQuality}
				handleSelectChapter={handleSelectChapter}
				handleSelectCastMember={handleSelectCastMember}
				handleOpenSubtitleOffset={handleOpenSubtitleOffset}
				handleOpenSubtitleSettings={handleOpenSubtitleSettings}
				handleOpenRemoteSubtitleSearch={handleOpenRemoteSubtitleSearch}
				handleSelectRemoteSubtitle={handleSelectRemoteSubtitle}
				canDownloadRemoteSubtitles={!isAudioMode && Boolean(item?.Id)}
				isSearchingRemoteSubtitles={isSearchingRemoteSubtitles}
				remoteSubtitleResults={remoteSubtitleResults}
				castMembers={castMembers}
				isLoadingCastMembers={isLoadingCastMembers}
				handleSubtitleOffsetChange={handleSubtitleOffsetChange}
				closeModal={closeModal}
				stopPropagation={stopPropagation}
				// eslint-disable-next-line react/jsx-no-bind
				renderInfoPlaybackRows={({css: c}) => (
					<div className={c.infoRow}>
						<span className={c.infoLabel}>{$L('Player')}</span>
						<span className={c.infoValue}>{$L('AVPlay (Native)')}</span>
					</div>
				)}
			/>
		</div>
	);
};

export default Player;
