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
import {isPreroll, nextInQueue, shouldAutoAdvance} from '../../utils/cinemaMode';
import {driftAction, driftMs, needsSeek, correctionOptions, DRIFT_CHECK_MS} from '../../utils/syncDrift';
import {createReadyGate} from '../../utils/syncReady';
import {getImageUrl} from '../../utils/helpers';
import {initPgsCanvasRenderer, disposePgsRenderer, clearPgsCanvas} from '../../utils/pgsRenderer';
import {supportsAssRenderer, initAssCanvasRenderer, disposeAssRenderer, setAssTime} from '../../utils/assRenderer';
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml, resolveSubtitleStyleSettings} from '../../utils/subtitleConstants';
import {isHdrOutput} from '../../utils/videoRange';
import {selectPreferredAudioStream} from '../../utils/audioTrackSelection';
import {applyResumeRewind, skipBackSeconds, skipForwardSeconds, zoomInternalFromSetting, zoomSettingFromInternal} from '../../utils/playbackTuning';
import {saveAudioPref, saveSubtitlePref} from '../../services/subtitlePrefs';
import {resolveSeriesAudio} from './initialAudio';
import {resolveInitialSubtitle} from './initialSubtitle';
import {api as jellyfinApi, createApiForServer, getServerUrl} from '../../services/jellyfinApi';
import PlayerControls, {usePlayerButtons} from './PlayerControls';
import useLiveProgram from './useLiveProgram';
import useSleepTimer from './useSleepTimer';
import AudioMode from './audio/AudioMode';
import useAudioTransport from './audio/useAudioTransport';
import useLyrics from './audio/useLyrics';
import {handleAudioFocusKey, exitAudioPanel, nextAudioFocusRow, AUDIO_FOCUS_IDS} from './audio/audioFocus';
import useSegmentPopups from './useSegmentPopups';
import {NextEpisodeContainer, CONTROLS_HIDE_DELAY, withTimeout, SEGMENT_FETCH_TIMEOUT} from './PlayerConstants';
import NextUpOverlay from './NextUpOverlay';
import SkipSegmentOverlay from './SkipSegmentOverlay';
import StillWatchingDialog from './StillWatchingDialog';
import {
	toSubtitleLanguage,
	mapSubtitleStreamsFromMediaSource,
	mapRemoteSubtitleOptions
} from './remoteSubtitleUtils';
import {getVideoDisplayAspectRatio, getZoomDisplayRect} from './aspectRatioUtils';
import {mapJellyfinTrackToTizen} from './tizenTrackUtils';
import serverLogger from '../../services/serverLogger';
import {summarizeAvplayTracks, describeSubtitleStream, describeSubtitleStreams} from './subtitleDiagnostics';

import css from './TizenPlayer.module.less';

// AVPlay reads a display rect against a 1920x1080 screen whatever the app renders at, so
// these stay fixed rather than following the window. Handing it panel pixels on a 4K set
// makes the video plane four times the visible area and every display mode look the same.
const AVPLAY_SCREEN = {width: 1920, height: 1080};
const AVPLAY_FULLSCREEN_RECT = {x: 0, y: 0, ...AVPLAY_SCREEN};

// The longest a segment skip waits on a session whose position never moves.
const PLAYBACK_SETTLE_MS = 2000;

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
const Player = ({item, resume, initialMediaSourceId, initialAudioIndex, initialSubtitleIndex, initialStartPositionTicks, initialQuality, forceTranscode, onEnded, onBack, onGuide, onPlayNext, onSelectPerson, audioPlaylist, videoQueue, onPausedChange}) => {
	const {settings, updateSetting} = useSettings();
	const {isInGroup, lastCommand} = useSyncPlay();
	const syncPlayCommandRef = useRef(false);
	const lastProcessedCommandRef = useRef(null);
	const suppressBufferingUntilRef = useRef(0);
	const stallRecheckTimerRef = useRef(null);
	const isBufferingRef = useRef(false);
	const syncPlaySample = useCallback(() => ({
		isPlaying: avplayGetState() === 'PLAYING',
		positionTicks: Math.floor(avplayGetCurrentTime() * 10000)
	}), []);
	const readyGate = useMemo(() => createReadyGate({
		sample: syncPlaySample,
		isBuffering: () => isBufferingRef.current,
		report: () => syncPlayService.sendReadyRequest(syncPlaySample)
	}), [syncPlaySample]);

	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [error, setError] = useState(null);
	const [title, setTitle] = useState('');
	const [subtitle, setSubtitle] = useState('');
	const [playMethod, setPlayMethod] = useState(null);
	const [isHdrContent, setIsHdrContent] = useState(false);
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
	// Seeded from the advanced playback menu, which picks a cap before playback starts.
	const [selectedQuality, setSelectedQuality] = useState(initialQuality || null);
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
	const liveProgram = useLiveProgram(item, isLiveTV);
	const [isAudioMode, setIsAudioMode] = useState(false);
	const [audioTab, setAudioTab] = useState('queue');
	const [isFavorite, setIsFavorite] = useState(false);
	const [zoomMode, setZoomMode] = useState(() => zoomInternalFromSetting(settings.playerZoomMode));
	const [videoAspectRatio, setVideoAspectRatio] = useState(null);
	const [castMembers, setCastMembers] = useState([]);
	const [isLoadingCastMembers, setIsLoadingCastMembers] = useState(false);
	const zoomModeRef = useRef(zoomInternalFromSetting(settings.playerZoomMode));
	const videoAspectRatioRef = useRef(null);

	const lyrics = useLyrics(item, isAudioMode, currentTime);

	const positionRef = useRef(0);
	const playSessionRef = useRef(null);
	const runTimeRef = useRef(0);
	const healthMonitorRef = useRef(null);
	const unregisterAppStateRef = useRef(null);
	const controlsTimeoutRef = useRef(null);
	const lastFocusedElementRef = useRef(null);
	const timeUpdateIntervalRef = useRef(null);
	const avplayReadyRef = useRef(false);
	// Whether the pipeline is really running, and the segment skip waiting on it.
	const playbackMovingRef = useRef(false);
	const playIssuedAtRef = useRef(0);
	const lastPolledMsRef = useRef(null);
	const pendingSegmentSeekRef = useRef(null);
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
	// re-arms server reporting when playback resumes after a background stop
	const resumeReportingRef = useRef(null);
	// index of a subtitle the server is currently burning into the stream
	const burnInSubtitleRef = useRef(null);

	const restartCurrent = useCallback(() => {
		if (avplayReadyRef.current) {
			avplaySeek(0).catch(e => console.warn('[Player] Seek failed:', e));
		}
	}, []);
	const seekTo = useCallback((seconds) => {
		if (avplayReadyRef.current) {
			avplaySeek(seconds * 1000).catch(e => console.warn('[Player] Seek failed:', e));
		}
	}, []);
	const getPositionSeconds = useCallback(() => (avplayReadyRef.current ? avplayGetCurrentTime() / 1000 : 0), []);

	const {
		shuffleMode, repeatMode, hasNextTrack, hasPrevTrack,
		handleToggleShuffle, handleToggleRepeat, handleNextTrack, handlePrevTrack,
		handleSelectQueueTrack, handleSeekToLyric, handleEnterAudioPanel, getNextStep
	} = useAudioTransport({
		item, audioPlaylist, isAudioMode, onPlayNext, positionRef,
		restartCurrent, seekTo, getPositionSeconds, setFocusRow
	});

	const applyDisplayWindow = useCallback(() => {
		const mode = zoomModeRef.current;
		const aspect = videoAspectRatioRef.current;

		// AVPlay shapes its letterbox from the decoded frame, the size the picture is stored
		// at rather than the size it should be shown at, so anamorphic DVD rips come out
		// squeezed. Its own dar/par mode covers that in principle but stopped scaling right
		// on recent Tizen, so hand it a box of the shape the stream declares and let it fill.
		if (mode === 'fit' && aspect) {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
			setDisplayWindow(getZoomDisplayRect(AVPLAY_SCREEN, aspect, 'fit'));
			return;
		}

		if (mode === 'stretch') {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
		} else if (mode === 'fill') {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_CROPPED_FULL');
		} else {
			avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
		}
		// setting the rect after the method is what makes the scaler pick up a
		// mid playback mode change
		setDisplayWindow(AVPLAY_FULLSCREEN_RECT);
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

	const subtitleStyleSettings = useMemo(
		() => resolveSubtitleStyleSettings(settings, isHdrContent),
		[settings, isHdrContent]
	);

	const hasCastMembers = useMemo(() => {
		if (castMembers.length > 0) return true;
		return item?.Type === 'Episode' && Boolean(item?.SeriesId);
	}, [castMembers.length, item]);

	// handleBack is defined further down, so the timer reaches it through a ref
	// rather than forcing the whole player to be reordered.
	const handleBackRef = useRef(null);
	const {sleepMinutes, remainingSeconds: sleepRemainingSeconds, startSleepTimer} = useSleepTimer({
		onExpire: () => handleBackRef.current?.(),
		ticking: activeModal === 'sleep'
	});

	const {topButtons, bottomButtons} = usePlayerButtons({
		isPaused, audioStreams, subtitleStreams, chapters,
		nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
		shuffleMode, repeatMode, selectedQuality,
		selectedSubtitleIndex, canDownloadRemoteSubtitles: !isAudioMode && Boolean(item?.Id), hasCastMembers, zoomModeLabel, zoomModeKey: zoomMode,
		sleepMinutes
	});

	useEffect(() => {
		zoomModeRef.current = zoomMode;
	}, [zoomMode]);

	useEffect(() => {
		videoAspectRatioRef.current = videoAspectRatio;
	}, [videoAspectRatio]);

	useEffect(() => {
		const people = Array.isArray(item?.People) ? item.People : [];
		setCastMembers(people);
	}, [item]);


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

		// AVPlay reports PLAYING as soon as play is issued, so a position that has
		// visibly moved is the only proof the pipeline is running. The elapsed
		// time is a backstop for a stream whose position sits still, so nothing
		// waiting on this is held forever.
		if (!playbackMovingRef.current && state === 'PLAYING') {
			const advanced = lastPolledMsRef.current != null && ms > lastPolledMsRef.current;
			lastPolledMsRef.current = ms;
			if (advanced || Date.now() - playIssuedAtRef.current > PLAYBACK_SETTLE_MS) {
				playbackMovingRef.current = true;
				const held = pendingSegmentSeekRef.current;
				pendingSegmentSeekRef.current = null;
				if (held != null) seekToSegmentTarget(held); // eslint-disable-line no-use-before-define
			}
		}

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
	 * quiet skips the logs on the confirmation pass, which repeats after every seek.
	 */
	const applyNativeSubtitleTrack = useCallback((stream, streamList, trackInfo = null, {quiet = false} = {}) => {
		const embedded = (streamList || []).filter((s) => s.isEmbeddedNative);
		const tracks = trackInfo || avplayGetTracks();
		const tizenIndex = mapJellyfinTrackToTizen(tracks, embedded, 'TEXT', stream.index);
		if (tizenIndex == null) {
			if (!quiet) {
				serverLogger.playbackError('Subtitle: no matching AVPlay TEXT track for embedded stream', {
					stream: describeSubtitleStream(stream),
					embeddedCandidates: describeSubtitleStreams(embedded),
					avplayTextTracks: summarizeAvplayTracks(tracks, 'TEXT')
				});
			}
			return false;
		}
		avplaySelectTrack('TEXT', tizenIndex);
		// flip the silent flag once so the cue engine actually starts delivering,
		// selections made early are otherwise silently ignored on older firmware
		if (stream.isImageBased) {
			// PGS renders as a native bitmap overlay, no JS events
			avplaySetSilentSubtitle(true);
			avplaySetSilentSubtitle(false);
			useNativeSubtitleRef.current = false;
		} else {
			// text arrives through onsubtitlechange and renders on the web layer. The
			// flip has to end unsilenced or no cue is delivered at all, which leaves
			// the web layer empty while the track still reads as selected.
			avplaySetSilentSubtitle(true);
			avplaySetSilentSubtitle(false);
			useNativeSubtitleRef.current = true;
		}
		activeNativeSubRef.current = {stream, streams: streamList};
		if (!quiet) {
			serverLogger.playback('Subtitle: applied native AVPlay track', {
				route: stream.isImageBased ? 'native-pgs' : 'native-text',
				stream: describeSubtitleStream(stream),
				tizenIndex,
				avplayTextTracks: summarizeAvplayTracks(tracks, 'TEXT')
			});
		}
		return true;
	}, []);

	// firmware drops the native selection after buffer flushes and sometimes
	// ignores selections made early, both recover by re-applying it
	const reassertNativeSubtitle = useCallback(() => {
		const active = activeNativeSubRef.current;
		if (!active) return;
		try { applyNativeSubtitleTrack(active.stream, active.streams, null, {quiet: true}); } catch (e) { void e; }
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
					// giving up leaves AVPlays default, which is silence when the set cant
					// decode it, so try the Jellyfin index in case AVPlay numbers its tracks
					// the same way. It counts video and subtitles too, so only take it when
					// AVPlay reported that index itself
					console.warn('[Player] No matching AVPlay audio track for index', pending.audioIndex);
					const audioTracks = summarizeAvplayTracks(trackInfo, 'AUDIO');
					const directUsable = audioTracks.some((t) => t.index === pending.audioIndex);
					try {
						if (directUsable) avplaySelectTrack('AUDIO', pending.audioIndex);
					} catch (directErr) {
						console.warn('[Player] Direct audio index selection failed:', directErr?.message || directErr);
					}
					serverLogger.playbackError('Audio: no matching AVPlay track', {
						jellyfinIndex: pending.audioIndex,
						usedDirectIndex: directUsable,
						requestedCodec: pending.audioStreams?.find((s) => s.index === pending.audioIndex)?.codec,
						avplayAudioTracks: audioTracks
					});
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
				serverLogger.playbackError('Playback: AVPlay reported an error', {
					eventType: typeof eventType === 'object' ? JSON.stringify(eventType).slice(0, 300) : String(eventType),
					playerState: avplayGetState(),
					selectedAudioStreamIndex: playback.getCurrentSession()?.audioStreamIndex,
					playMethod: playback.getCurrentSession()?.playMethod
				});
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

		const prepareTimeout = 120000;
		let prepareTimer;
		try {
			await Promise.race([
				avplayPrepare(),
				new Promise((_, reject) => {
					prepareTimer = setTimeout(() => reject(new Error('Stream preparation timed out')), prepareTimeout);
				})
			]);
		} catch (prepareErr) {
			// where an undecodable audio codec shows up, and it only hit the console before
			serverLogger.playbackError('Playback: stream preparation failed', {
				error: prepareErr?.message || String(prepareErr),
				playerState: avplayGetState(),
				playMethod: playback.getCurrentSession()?.playMethod,
				selectedAudioStreamIndex: playback.getCurrentSession()?.audioStreamIndex
			});
			throw prepareErr;
		} finally {
			clearTimeout(prepareTimer);
		}
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
		playbackMovingRef.current = false;
		playIssuedAtRef.current = Date.now();
		lastPolledMsRef.current = null;
		pendingSegmentSeekRef.current = null;
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
		setIsHdrContent(isHdrOutput(result.mediaSource, result.playMethod === playback.PlayMethod.Transcode));
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
					if (playback.consumeBackgroundStopFired()) {
						// the session was stopped on the server while we were
						// backgrounded, so bring it back before we resume playback
						resumeReportingRef.current?.();
					}
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
					// Script freezes as soon as the app is backgrounded and a kill
					// while suspended runs nothing at all, so the stop has to go out
					// right now. It also records the resume position. Coming back
					// re-reports start on the same session.
					playback.reportBackgroundStop(positionRef.current);
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
			// always report the stop, even at position 0 (live TV and freshly
			// opened media start there), or the session lingers on the server
			playback.reportStopBeacon(positionRef.current);
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

	// Re-report start and restart the reporting loops on the existing session
	// when playback resumes after a background stop already reported it ended.
	resumeReportingRef.current = () => {
		playback.reportStart(positionRef.current);
		playback.startProgressReporting(
			() => positionRef.current,
			10000,
			() => ({ isPaused: avplayGetState() !== 'PLAYING' })
		);
		playback.startHealthMonitoring(handleUnhealthy);
		healthMonitorRef.current = playback.getHealthMonitor();
	};

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
			setMediaSegments(null);
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
				const startPosition = applyResumeRewind(
					initialStartPositionTicks != null ? initialStartPositionTicks : ((!isLiveTV && resume !== false) ? savedPosition : 0),
					settings
				);
				const effectiveBitrate = selectedQuality || settings.maxBitrate || undefined;
				const playbackInfoOptions = {
					startPositionTicks: startPosition,
					maxBitrate: effectiveBitrate,
					preferTranscode: settings.preferTranscode,
					enableDirectPlay: !forceTranscode,
					enableDirectStream: !forceTranscode,
					forceDirectPlay: (isLiveTV || forceTranscode) ? false : settings.forceDirectPlay,
					item: item,
					mediaSourceId: initialMediaSourceId,
					audioStreamIndex: initialAudioIndex != null ? initialAudioIndex : undefined,
					subtitleStreamIndex: initialSubtitleIndex != null ? initialSubtitleIndex : undefined,
					isLiveTV,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				};
				let result = await playback.getPlaybackInfo(item.Id, playbackInfoOptions);
				if (!stillCurrent()) return;

				const applyPlaybackResult = (r) => {
					setPlayMethod(r.playMethod);
					setIsHdrContent(isHdrOutput(r.mediaSource, r.playMethod === playback.PlayMethod.Transcode));
					setMediaSourceId(r.mediaSourceId);
					setVideoAspectRatio(getVideoDisplayAspectRatio(r.mediaSource));
					playSessionRef.current = r.playSessionId;
					runTimeRef.current = r.runTimeTicks || 0;
					setDuration((r.runTimeTicks || 0) / 10000000);
					setAudioStreams(r.audioStreams || []);
					setSubtitleStreams(r.subtitleStreams || []);
				};

				applyPlaybackResult(result);
				positionRef.current = startPosition;

				// Chapters are an Item property, not MediaSource - result.chapters may be empty.
				// Fetched off the critical path, they only feed the chapter picker
				setChapters(!isLiveTV ? (result.chapters || []) : []);
				if (!isLiveTV && (result.chapters || []).length === 0) {
					playback.fetchItemChapters(item.Id, item).then((chapterList) => {
						if (stillCurrent()) setChapters(chapterList);
					}).catch(() => {});
				}

				// Handle initial audio selection. The local track preferences win,
				// otherwise honor the Jellyfin user's preferred audio language via the
				// server computed defaultAudioStreamIndex, then the file default.
				// A track remembered for the series stands in front of the language
				// preferences, the same order the other clients take these in.
				const rememberedAudio = await resolveSeriesAudio(item, result.audioStreams);
				const preferredAudio = rememberedAudio || selectPreferredAudioStream(result.audioStreams, settings);
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
				let burnInPendingSub = null;

				// one inventory of what the server offered, before anything is selected
				serverLogger.playback('Playback: media opened', {
					itemId: item?.Id,
					playMethod: result.playMethod,
					container: result.mediaSource?.Container,
					videoCodec: (result.mediaSource?.MediaStreams || []).find((s) => s.Type === 'Video')?.Codec,
					selectedAudioStreamIndex: result.selectedAudioStreamIndex,
					transcodingContainer: result.mediaSource?.TranscodingContainer,
					transcodingSubProtocol: result.mediaSource?.TranscodingSubProtocol,
					// what the server was willing to offer, so a report explains the play method
					supportsDirectPlay: result.mediaSource?.SupportsDirectPlay,
					supportsDirectStream: result.mediaSource?.SupportsDirectStream,
					// profile and title are where Atmos is named, which is what forces a transcode
					audioStreams: (result.mediaSource?.MediaStreams || [])
						.filter((s) => s.Type === 'Audio')
						.map((s) => ({
							index: s.Index,
							codec: s.Codec,
							profile: s.Profile,
							title: s.Title,
							displayTitle: s.DisplayTitle,
							channels: s.Channels,
							channelLayout: s.ChannelLayout,
							language: s.Language,
							isDefault: s.IsDefault
						})),
					subtitleStreams: describeSubtitleStreams(result.subtitleStreams)
				});

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
					if (sub.isBurnIn) {
						// The server bakes these into the video, so the track only exists
						// once the stream was negotiated with its index. Ask for it below
						// when that hasn't happened yet.
						if (sub.index === initialSubtitleIndex) burnInSubtitleRef.current = sub.index;
						else burnInPendingSub = sub;
					}
					console.log('[Player] Initial subtitle action:', pendingSubAction.type, 'codec:', sub.codec);
					serverLogger.playback('Subtitle: initial track chosen', {
						route: pendingSubAction.type,
						stream: describeSubtitleStream(sub)
					});
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
							serverLogger.playback('Subtitle: fetched text track from server', {
								stream: describeSubtitleStream(sub),
								trackEvents: data?.TrackEvents?.length ?? 0
							});
						} catch (err) {
							console.error('[Player] Error fetching subtitle data:', err);
							serverLogger.playbackError('Subtitle: fetching text track failed', {
								stream: describeSubtitleStream(sub),
								error: err?.message || String(err)
							});
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
						serverLogger.playback('Subtitle: falling back to client PGS rendering', {
							stream: describeSubtitleStream(stream)
						});
						loadSubtitleAssets({type: 'pgs', stream});
					} else if (stream.isTextBased) {
						serverLogger.playback('Subtitle: falling back to client text rendering', {
							stream: describeSubtitleStream(stream)
						});
						loadSubtitleAssets({type: 'text', stream});
					} else {
						serverLogger.playbackError('Subtitle: no client renderer available for this stream', {
							stream: describeSubtitleStream(stream)
						});
					}
				};

				const turnSubtitlesOff = () => {
					setSelectedSubtitleIndex(-1);
					setSubtitleTrackEvents(null);
				};

				const startingAudio = initialAudioIndex != null
					? result.audioStreams?.find(s => s.index === initialAudioIndex)
					: autoAudio;
				const initialSubtitleChoice = await resolveInitialSubtitle(result, item, initialSubtitleIndex, settings, startingAudio);
				if (initialSubtitleChoice === null) turnSubtitlesOff();
				else selectInitialSubtitle(initialSubtitleChoice);

				// Without this the track reads as selected and nothing ever renders,
				// because the server was never asked to bake it in.
				if (burnInPendingSub) {
					try {
						const renegotiated = await playback.getPlaybackInfo(item.Id, {
							...playbackInfoOptions,
							subtitleStreamIndex: burnInPendingSub.index
						});
						if (!stillCurrent()) return;
						result = renegotiated;
						applyPlaybackResult(result);
						burnInSubtitleRef.current = burnInPendingSub.index;
					} catch (err) {
						console.error('[Player] Burn in subtitle negotiation failed:', err);
					}
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
				setFocusRow('bottom');
				setIsFavorite(!!item.UserData?.IsFavorite);

				// Audio mode: always show controls, skip video-only features.
				// Segment and next episode lookups only feed overlays, so they run
				// in the background instead of holding up playback
				if (shouldUseAudioMode) {
					setControlsVisible(true);
				} else if (!isLiveTV) {
					withTimeout(playback.getMediaSegments(item.Id), SEGMENT_FETCH_TIMEOUT).then((segments) => {
						if (stillCurrent()) setMediaSegments(segments);
					}).catch((segmentErr) => {
						console.warn('[Player] Media segment fetch skipped:', segmentErr?.message || segmentErr);
					});

					// A queue sets its own order. Running off the end of one, or playing a
					// lone episode, falls back to the air order lookup.
					const queued = videoQueue?.length ? nextInQueue(videoQueue, item) : null;
					if (queued) {
						if (stillCurrent()) setNextEpisode(queued);
					} else if (item.Type === 'Episode') {
						playback.getNextEpisode(item).then((next) => {
							if (stillCurrent()) setNextEpisode(next);
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
				// A pre-roll that cant even load gets skipped, not surfaced.
				const skipTo = isPreroll(item) ? nextInQueue(videoQueue, item) : null;
				if (stillCurrent()) {
					if (skipTo && onPlayNext) {
						onPlayNext(skipTo);
					} else {
						setError(err.message || $L('Failed to load media'));
					}
				}
			} finally {
				if (stillCurrent()) setIsLoading(false);
			}
		};

		loadMedia();

		return () => {
			// Report stop whenever a session is still open. A normal back-out has
			// already stopped and cleared it. Don't gate on position, live TV and
			// freshly opened media sit at 0 and would otherwise leak.
			if (playback.getCurrentSession()) {
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
	}, [item, resume, videoQueue, onPlayNext, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, forceTranscode, settings.subtitleMode, settings.introAction, settings.outroAction]);

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
				// Paused playback keeps its controls, like the other clients. Resuming
				// goes through showControls and re-arms the timer.
				if (isPausedRef.current) return;
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

	// No track indexes travel along. The session only records an index the
	// viewer asked for, so a subtitle the player picked on its own reads as
	// minus one there, and handing that to the next episode would switch its
	// subtitles off. A chosen track already carries over through the series
	// preferences.
	const onPlayNextWithCleanup = useCallback(async (episode) => {
		// An outro skip lands near the end, so the next up countdown can come
		// round again on the episode it already started. The item never changes
		// so nothing reloads, and the teardown below would leave the player dead.
		if (episode.Id === item.Id) return;
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);
		cleanupAVPlay();
		avplayReadyRef.current = false;
		onPlayNext(episode);
	}, [onPlayNext, stopTimeUpdatePolling, item.Id]);

	const seekToSegmentTarget = useCallback((target) => {
		avplaySeek(Math.floor(target / 10000)).catch(e => console.warn('[Player] Seek failed:', e));
	}, []);

	// A recap starts at the top of the episode, so its skip button is on screen
	// while the session is still starting. A fresh session refuses seeks until
	// playback is moving, which is what the resume seek above waits for, so a
	// skip pressed that early waits with it rather than seeking into a session
	// that is not ready.
	const onSeekToSegmentEnd = useCallback((endTicks) => {
		if (!endTicks || !avplayReadyRef.current) return;
		// An outro usually runs to the last frame and AVPlay won't seek there, so
		// stop a second early and let playback finish on its own.
		const limit = runTimeRef.current > 0 ? runTimeRef.current - 10000000 : endTicks;
		const target = Math.max(0, Math.min(endTicks, limit));
		if (!playbackMovingRef.current) {
			pendingSegmentSeekRef.current = target;
			return;
		}
		seekToSegmentTarget(target);
	}, [seekToSegmentTarget]);

	const {
		skipSegment, showSkipCredits, showNextEpisode, nextEpisodeCountdown,
		handleSkipSegment, handlePlayNextNow,
		askStillWatching, handleStillWatchingContinue, handleStillWatchingStop, cancelNextEpisodeCountdown,
		checkSegments, handlePopupKeyDown, resetPopups
	} = useSegmentPopups({
		mediaSegments, nextEpisode, settings, runTimeRef,
		activeModal, controlsVisible, hideControls, showControls,
		onSeekToSegmentEnd,
		onPlayNext: onPlayNextWithCleanup,
		onPausePlayback: () => { avplayPause(); setIsPaused(true); },
		// Called long after the definition below, so reading it now would be too early.
		onStopPlayback: () => handleBack(), // eslint-disable-line no-use-before-define
		currentIsPreroll: isPreroll(item)
	});

	// ==============================
	// Playback Event Handlers (via AVPlay listener refs)
	// ==============================
	const handleEnded = useCallback(async () => {
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);

		if (repeatMode === 'one') {
			restartCurrent();
			return;
		}

		cleanupAVPlay();
		avplayReadyRef.current = false;

		const step = audioPlaylist && onPlayNext ? getNextStep() : null;
		if (step?.type === 'play') {
			onPlayNext(step.track);
			return;
		}
		if (nextEpisode && onPlayNext && shouldAutoAdvance(settings.autoPlay, item)) {
			onPlayNext(nextEpisode);
		} else {
			onEnded?.();
		}
	}, [onEnded, onPlayNext, nextEpisode, stopTimeUpdatePolling, audioPlaylist, repeatMode, restartCurrent, getNextStep, settings.autoPlay, item]);

	const handleError = useCallback(async () => {
		console.error('[Player] Playback error');

		// A broken pre-roll skips to the feature rather than surfacing an error or
		// spending the transcode fallback on it.
		const skipTo = isPreroll(item) ? nextInQueue(videoQueue, item) : null;
		if (skipTo && onPlayNext) {
			cleanupAVPlay();
			avplayReadyRef.current = false;
			onPlayNext(skipTo);
			return;
		}

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
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, settings.stereoUpmixEnabled, restartFromResult, mediaSourceId, videoQueue, onPlayNext]);

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
	const teardownPlayback = useCallback(async () => {
		cancelNextEpisodeCountdown();
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);
		cleanupAVPlay();
		avplayReadyRef.current = false;
	}, [cancelNextEpisodeCountdown, stopTimeUpdatePolling]);

	const handleBack = useCallback(async () => {
		await teardownPlayback();
		onBack?.();
	}, [teardownPlayback, onBack]);

	const handleOpenGuide = useCallback(async () => {
		await teardownPlayback();
		(onGuide || onBack)?.();
	}, [teardownPlayback, onGuide, onBack]);

	useEffect(() => {
		handleBackRef.current = handleBack;
	}, [handleBack]);

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
		const step = skipBackSeconds(settings);
		if (isInGroup && !syncPlayCommandRef.current) {
			const newTicks = Math.max(0, positionRef.current - step * 10000000);
			syncPlayService.sendSeekRequest(newTicks);
			return;
		}
		const ms = avplayGetCurrentTime();
		const newMs = Math.max(0, ms - step * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings, isInGroup]);

	const handleForward = useCallback(() => {
		if (!avplayReadyRef.current) return;
		const step = skipForwardSeconds(settings);
		if (isInGroup && !syncPlayCommandRef.current) {
			const newTicks = Math.min(runTimeRef.current, positionRef.current + step * 10000000);
			syncPlayService.sendSeekRequest(newTicks);
			return;
		}
		const ms = avplayGetCurrentTime();
		const durationMs = avplayGetDuration();
		const newMs = Math.min(durationMs, ms + step * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings, isInGroup]);

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

	const handleSelectSleep = useCallback((e) => {
		const minutes = parseInt(e.currentTarget.dataset.minutes, 10);
		startSleepTimer(minutes || null);
		closeModal();
	}, [startSleepTimer, closeModal]);

	// Track selection - using data attributes to avoid arrow functions in JSX
	const handleSelectAudio = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		setSelectedAudioIndex(index);
		// Saved here rather than after the switch, because switching leaves by several
		// routes and the choice was made either way.
		saveAudioPref(item, index, audioStreams || []);
		closeModal();

		try {
			// AVPlay: try switching audio track natively first
			if (playMethod !== playback.PlayMethod.Transcode && avplayReadyRef.current) {
				// only the opening negotiation checked this before. switching natively to a
				// track the set cant decode freezes the picture, so reload and let the
				// server transcode instead
				const target = (audioStreams || []).find((s) => s.index === index);
				const playableNatively = await playback.canPlayAudioStreamNatively(target
					? {Codec: target.codec, Profile: target.profile, Title: target.title, DisplayTitle: target.displayTitle, ChannelLayout: target.channelLayout, Channels: target.channels}
					: null);
				if (!playableNatively) {
					serverLogger.playback('Audio: track needs the server, reloading instead of switching natively', {
						jellyfinIndex: index,
						codec: target?.codec,
						profile: target?.profile,
						channelLayout: target?.channelLayout
					});
				}
				try {
					const tizenAudioIndex = playableNatively
						? mapJellyfinTrackToTizen(avplayGetTracks(), audioStreams, 'AUDIO', index)
						: null;
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
	}, [item, playMethod, closeModal, restartFromResult, audioStreams]);

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

			serverLogger.playback('Subtitle: user selected track', {
				stream: describeSubtitleStream(stream),
				requestedIndex: index
			});

			if (stream && stream.isEmbeddedNative) {
				try {
					nativeSuccess = applyNativeSubtitleTrack(stream, streamList);
				} catch (err) {
					console.warn('[Player] Error selecting native track:', err);
					serverLogger.playbackError('Subtitle: native track selection threw', {
						stream: describeSubtitleStream(stream),
						error: err?.message || String(err)
					});
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
					serverLogger.playback('Subtitle: rendering text track client side', {
						stream: describeSubtitleStream(stream),
						trackEvents: data?.TrackEvents?.length ?? 0
					});
				} catch (err) {
					serverLogger.playbackError('Subtitle: fetching text track failed', {
						stream: describeSubtitleStream(stream),
						error: err?.message || String(err)
					});
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
		saveSubtitlePref(item, index, streamList || []);
		if (shouldClose) {
			closeModal();
		}
	}, [item, subtitleStreams, closeModal, settings.enablePgsRendering, applyNativeSubtitleTrack, reloadWithSubtitleIndex]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		await applySubtitleSelection(index, subtitleStreams, true);
	}, [applySubtitleSelection, subtitleStreams]);

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
			const next = isAudioMode ? nextAudioFocusRow('progress', 'up') : 'bottom';
			setFocusRow(next);
			setIsSeeking(false);
			window.requestAnimationFrame(() => Spotlight.focus(isAudioMode ? AUDIO_FOCUS_IDS[next] : 'play-pause-btn'));
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
			updateSetting('playerZoomMode', zoomSettingFromInternal(next));
			window.requestAnimationFrame(() => applyDisplayWindow());
			return next;
		});
	}, [applyDisplayWindow, updateSetting]);

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
			case 'quality': openModal('quality'); break;
			case 'chapter': openModal('chapter'); break;
			case 'cast': handleOpenCast(); break;
			case 'zoom': handleToggleZoom(); break;
			case 'sleep': openModal('sleep'); break;
			case 'info': openModal('info'); break;
			case 'guide': handleOpenGuide(); break;
			case 'next': handlePlayNextNow(); break;
			case 'nextTrack': handleNextTrack(); break;
			case 'prevTrack': handlePrevTrack(); break;
			case 'shuffle': handleToggleShuffle(); break;
			case 'repeat': handleToggleRepeat(); break;
			case 'favorite': handleToggleFavorite(); break;
			default: break;
		}
	}, [showControls, handlePlayPause, handleRewind, handleForward, openModal, handleOpenCast, handleToggleZoom, handleOpenGuide, handlePlayNextNow, handleNextTrack, handlePrevTrack, handleToggleShuffle, handleToggleRepeat, handleToggleFavorite]);

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
						// Every seek costs a rebuffer here, which the group then waits
						// on, so a difference this small is left alone.
						if (needsSeek(positionRef.current, target)) {
							avplaySeek(Math.floor(target / 10000)).catch(() => {});
						}
					}
					syncPlayService.setSyncReference(target != null ? target : positionRef.current);
					avplayPlay();
					setIsPaused(false);
					break;
				}
				case 'Pause': {
					avplayPause();
					setIsPaused(true);
					syncPlayService.clearSyncReference();
					if (PositionTicks != null && needsSeek(positionRef.current, PositionTicks)) {
						avplaySeek(Math.floor(PositionTicks / 10000)).catch(() => {});
					}
					break;
				}
				case 'Seek': {
					if (PositionTicks != null) {
						if (needsSeek(positionRef.current, PositionTicks)) {
							avplaySeek(Math.floor(PositionTicks / 10000)).catch(() => {});
						}
						syncPlayService.setSyncReference(PositionTicks);
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

	// Commands alone cant hold this in step, because the decoder loses a little
	// wall clock time on every rebuffer and nothing measured it afterwards.
	useEffect(() => {
		const correction = correctionOptions(settings);
		if (!isInGroup || isPaused || !correction.enabled) return undefined;

		let restoreTimer = null;
		const restoreRate = () => avplaySetSpeed(1);
		const interval = setInterval(() => {
			if (syncPlayCommandRef.current || avplayGetState() !== 'PLAYING') return;
			const expected = syncPlayService.getExpectedPositionTicks(correction.extraOffsetMs);
			const action = driftAction(driftMs(positionRef.current, expected), correction);

			if (action.type === 'seek') {
				syncPlayCommandRef.current = true;
				suppressBufferingUntilRef.current = Date.now() + syncPlayService.BUFFERING_SUPPRESS_MS;
				const done = () => { syncPlayCommandRef.current = false; };
				avplaySeek(Math.floor(expected / 10000)).then(done, done);
			} else if (action.type === 'rate' && !restoreTimer) {
				avplaySetSpeed(action.rate);
				restoreTimer = setTimeout(() => {
					restoreTimer = null;
					restoreRate();
				}, correction.speedDurationMs);
			}
		}, DRIFT_CHECK_MS);

		return () => {
			clearInterval(interval);
			if (restoreTimer) clearTimeout(restoreTimer);
			restoreRate();
		};
	}, [isInGroup, isPaused, settings]);

	// The server marks every member as buffering after a group seek or a change
	// of item and waits for each one to report Ready, so a set that never
	// stalled still has to answer.
	useEffect(() => {
		if (!isInGroup) return;

		const listener = syncPlayService.addListener((event) => {
			if (event === 'stateUpdate') {
				const state = avplayGetState();
				if (state === 'PLAYING' || state === 'PAUSED') readyGate.request();
			}
		});

		return () => {
			listener();
			readyGate.cancel();
		};
	}, [isInGroup, readyGate]);

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
					if (isBufferingRef.current) syncPlayService.sendBufferingRequest(syncPlaySample);
				}, remaining + 100);
			} else {
				syncPlayService.sendBufferingRequest(syncPlaySample);
			}
		} else if (avplayReadyRef.current) {
			clearTimeout(stallRecheckTimerRef.current);
			readyGate.request();
		}
		return () => clearTimeout(stallRecheckTimerRef.current);
	}, [isInGroup, isBuffering, readyGate, syncPlaySample]);

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
				// Back leaves the queue or lyrics panel before it leaves the player
				if (isAudioMode && focusRow === 'panel') {
					exitAudioPanel(setFocusRow);
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
				if ((key === 'Enter' || e.keyCode === 13) && (skipSegment || showSkipCredits || showNextEpisode)) {
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

			if (isAudioMode && controlsVisible && !activeModal &&
				handleAudioFocusKey(e, {focusRow, setFocusRow, showControls})) {
				return;
			}

			// Up/Down arrow navigation between rows when controls are visible
			if (controlsVisible && !activeModal) {
				showControls();

				if (key === 'ArrowUp' || e.keyCode === 38) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'bottom') return !isLiveTV ? 'progress' : 'bottom';
						if (prev === 'progress') {
							window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
							return 'bottom';
						}
						return 'bottom';
					});
					return;
				}
				if (key === 'ArrowDown' || e.keyCode === 40) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'top') return isLiveTV ? (bottomButtons.length > 0 ? 'bottom' : 'top') : 'progress';
						if (prev === 'progress') {
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
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, duration, settings.seekStep, handlePopupKeyDown, bottomButtons.length, isAudioMode, focusRow, scheduleDeferredSeek, skipSegment, showSkipCredits, showNextEpisode, isLiveTV, isInGroup, verifyResumeHealthy]);

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

	return (
		<div className={css.container} ref={playerContainerRef} onClick={showControls}>
			{/*
			 * No <video> element - AVPlay renders on the platform multimedia layer
			 * behind the web engine. The container is transparent so video shows through.
			 */}

			{isAudioMode && (
				<AudioMode
					item={item}
					title={title}
					subtitle={subtitle}
					serverUrl={getServerUrl()}
					isFavorite={isFavorite}
					onToggleFavorite={handleToggleFavorite}
					focusRow={focusRow}
					activeTab={audioTab}
					onSelectTab={setAudioTab}
					onEnterPanel={handleEnterAudioPanel}
					audioPlaylist={audioPlaylist}
					onSelectTrack={handleSelectQueueTrack}
					lyrics={lyrics}
					onSeekToLine={handleSeekToLyric}
				/>
			)}

			{/* Custom Subtitle Overlay - rendered on web layer above AVPlay video */}
			{currentSubtitleText && !isAudioMode && (
				<div
					className={css.subtitleOverlay}
					style={getSubtitleOverlayStyle(subtitleStyleSettings)}
				>
				{/* eslint-disable react/no-danger */}
					<div
						className={css.subtitleText}
						style={getSubtitleTextStyle(subtitleStyleSettings)}
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


			{/* Buffering Indicator */}
			{isBuffering && (
				<div className={css.bufferingIndicator}>
					<div className={css.spinner} />
				</div>
			)}

			{isPaused && settings.showDescriptionOnPause && item?.Overview && !isAudioMode && !activeModal && !controlsVisible && (
				<div className={css.pauseDescriptionOverlay}>
					<div className={css.pauseDescriptionText}>{item.Overview}</div>
				</div>
			)}

			{askStillWatching && (
				<StillWatchingDialog onContinue={handleStillWatchingContinue} onStop={handleStillWatchingStop} />
			)}

			{(showSkipCredits || showNextEpisode) && nextEpisode && !isAudioMode && !activeModal && !controlsVisible && (
				<NextEpisodeContainer spotlightRestrict="self-only">
					<NextUpOverlay
						episode={nextEpisode}
						imageUrl={getImageUrl(item._serverUrl || getServerUrl(), nextEpisode.Id, 'Primary', {maxWidth: 400, quality: 80})}
						countdown={nextEpisodeCountdown}
						timeout={settings.nextUpTimeout ?? 7}
						countdownStyle={settings.nextUpCountdownStyle ?? 'both'}
						minimal={settings.nextUpBehavior === 'minimal'}
						onPlay={handlePlayNextNow}
						onDismiss={cancelNextEpisodeCountdown}
					/>
				</NextEpisodeContainer>
			)}

			{skipSegment && !isAudioMode && !isLiveTV && !activeModal && !controlsVisible && (
				<SkipSegmentOverlay
					type={skipSegment.type}
					remainingSeconds={skipSegment.remainingSeconds}
					progress={skipSegment.progress}
					countdownStyle={settings.nextUpCountdownStyle ?? 'both'}
					onSkip={handleSkipSegment}
					spotlightId="skip-segment-btn"
				/>
			)}

			<PlayerControls
				isHdrContent={isHdrContent}
				css={css}
				controlsVisible={controlsVisible}
				activeModal={activeModal}
				isAudioMode={isAudioMode}
				isLiveTV={isLiveTV}
				liveProgram={liveProgram}
				focusRow={focusRow}
				title={title}
				subtitle={subtitle}
				topButtons={topButtons}
				bottomButtons={bottomButtons}
				displayTime={displayTime}
				duration={duration}
				progressPercent={progressPercent}
				bufferedPercent={bufferedPercent}
				isSeeking={isSeeking}
				seekPosition={seekPosition}
				item={item}
				mediaSourceId={mediaSourceId}
				playMethod={playMethod}
				selectedAudioIndex={selectedAudioIndex}
				selectedSubtitleIndex={selectedSubtitleIndex}
				selectedQuality={selectedQuality}
				audioStreams={audioStreams}
				subtitleStreams={subtitleStreams}
				chapters={chapters}
				currentTime={currentTime}
				subtitleOffset={subtitleOffset}
				handleControlButtonClick={handleControlButtonClick}
				handleProgressClick={handleProgressClick}
				handleProgressKeyDown={handleProgressKeyDown}
				handleProgressBlur={handleProgressBlur}
				handleSelectAudio={handleSelectAudio}
				handleSelectSubtitle={handleSelectSubtitle}
				handleSubtitleKeyDown={handleSubtitleItemKeyDown}
				handleSelectSleep={handleSelectSleep}
				sleepMinutes={sleepMinutes}
				sleepRemainingSeconds={sleepRemainingSeconds}
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
