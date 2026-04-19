import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import $L from '@enact/i18n/$L';
import * as playback from '../../services/playback';
import {
	initTizenAPI, registerAppStateObserver, keepScreenOn,
	avplayOpen, avplayPrepare, avplayPlay, avplayPause,
	avplaySeek, avplayGetCurrentTime, avplayGetDuration, avplayGetState,
	avplaySetListener, avplaySetSpeed, avplaySelectTrack, avplaySetSilentSubtitle,
	avplayGetTracks, avplaySetDisplayMethod, avplaySetStreamingProperty, setDisplayWindow, cleanupAVPlay
} from '@moonfin/platform-tizen/video';
import {useSettings} from '../../context/SettingsContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import * as syncPlayService from '../../services/syncPlay';
import {KEYS, isBackKey} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {initPgsCanvasRenderer, disposePgsRenderer, clearPgsCanvas} from '../../utils/pgsRenderer';
import {supportsAssRenderer, initAssCanvasRenderer, disposeAssRenderer, setAssTime} from '../../utils/assRenderer';
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml} from '../../utils/subtitleConstants';
import {api as jellyfinApi, createApiForServer, getServerUrl} from '../../services/jellyfinApi';
import PlayerControls, {usePlayerButtons} from './PlayerControls';
import useSegmentPopups from './useSegmentPopups';
import {CONTROLS_HIDE_DELAY, parseLyricsResponse, withTimeout} from './PlayerConstants';
import {
	toSubtitleLanguage,
	mapSubtitleStreamsFromMediaSource,
	mapRemoteSubtitleOptions
} from './remoteSubtitleUtils';

import css from './TizenPlayer.module.less';

const getTizenFullscreenRect = () => {
	if (typeof window === 'undefined') {
		return {x: 0, y: 0, width: 1920, height: 1080};
	}

	const cssWidth = Math.max(1, Math.round(window.innerWidth || 1920));
	const cssHeight = Math.max(1, Math.round(window.innerHeight || 1080));
	const dpr = Math.max(1, window.devicePixelRatio || 1);

	const physicalWidth = Math.round(cssWidth * dpr);
	const physicalHeight = Math.round(cssHeight * dpr);

	const screenWidth = Math.round(window.screen?.width || physicalWidth || 1920);
	const screenHeight = Math.round(window.screen?.height || physicalHeight || 1080);

	return {
		x: 0,
		y: 0,
		// Prefer panel resolution when available to avoid cropped/zoomed AVPlay output
		width: Math.max(screenWidth, physicalWidth),
		height: Math.max(screenHeight, physicalHeight)
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
const Player = ({item, resume, initialMediaSourceId, initialAudioIndex, initialSubtitleIndex, initialStartPositionTicks, onEnded, onBack, onPlayNext, audioPlaylist, onPausedChange}) => {
	const {settings} = useSettings();
	const {isInGroup, lastCommand} = useSyncPlay();
	const syncPlayCommandRef = useRef(false);
	const lastProcessedCommandRef = useRef(null);

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
	const [focusRow, setFocusRow] = useState('top');
	const isLiveTV = item.Type === 'TvChannel';
	const [isAudioMode, setIsAudioMode] = useState(false);
	const [lyricsLines, setLyricsLines] = useState([]);
	const [isLyricsLoading, setIsLyricsLoading] = useState(false);
	const [lyricsError, setLyricsError] = useState(null);
	const [shuffleMode, setShuffleMode] = useState(false);
	const [repeatMode, setRepeatMode] = useState('off');
	const [isFavorite, setIsFavorite] = useState(false);

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

	const applyDisplayWindow = useCallback(() => {
		const rect = getTizenFullscreenRect();
		setDisplayWindow(rect);
		avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
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

	const {topButtons, bottomButtons, favoriteButton} = usePlayerButtons({
		isPaused, audioStreams, subtitleStreams, chapters,
		nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
		shuffleMode, repeatMode, isFavorite
	});

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
	 * Start AVPlay playback for a given URL.
	 * Stops any existing session, opens the new URL, prepares, and plays.
	 */
	const startAVPlayback = useCallback(async (url, seekPositionTicks = 0) => {
		stopTimeUpdatePolling();
		cleanupAVPlay();
		avplayReadyRef.current = false;

		// Open new URL
		avplayOpen(url);

		// Set display to full screen - AVPlay renders on platform layer behind web
		applyDisplayWindow();

		// Set AVPlay event listener
		avplaySetListener({
			onbufferingstart: () => { setIsBuffering(true); },
			onbufferingcomplete: () => { setIsBuffering(false); },
			onstreamcompleted: () => { handleEndedCallbackRef.current?.(); },
			onerror: (eventType) => {
				console.error('[Player] AVPlay error:', eventType);
				handleErrorCallbackRef.current?.();
			},
			oncurrentplaytime: () => {},
			onevent: (eventType, eventData) => {
				console.log('[Player] AVPlay event:', eventType, eventData);
			},
			onsubtitlechange: handleSubtitleChange,
			ondrmevent: () => {}
		});

		// Prepare (async)
		await avplayPrepare();
		avplayReadyRef.current = true;

		// Get duration from AVPlay (returns ms)
		const durationMs = avplayGetDuration();
		if (durationMs > 0) {
			setDuration(durationMs / 1000);
		}

		// Seek to position if resuming
		if (seekPositionTicks > 0) {
			const seekMs = Math.floor(seekPositionTicks / 10000);
			await avplaySeek(seekMs);
		}

		// Play
		avplayPlay();
		setIsPaused(false);

		// Start time update polling
		startTimeUpdatePolling();
	}, [startTimeUpdatePolling, stopTimeUpdatePolling, handleSubtitleChange, applyDisplayWindow]);

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
					if (avplayReadyRef.current && !isPaused) {
						const state = avplayGetState();
						if (state === 'PAUSED' || state === 'READY') {
							try { avplayPlay(); } catch (e) { void e; }
						}
					}
				},
				() => {
					console.log('[Player] App backgrounded - pausing and saving progress');
					const state = avplayGetState();
					if (state === 'PLAYING') {
						try { avplayPause(); } catch (e) { void e; }
					}
					if (positionRef.current > 0) {
						playback.reportProgress(positionRef.current);
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

	// Handle playback health issues
	const handleUnhealthy = useCallback(async () => {
		console.log('[Player] Playback unhealthy, falling back to transcode');
	}, []);

	// ==============================
	// Load Media & Start AVPlay
	// ==============================
	useEffect(() => {
		const loadMedia = async () => {
			setIsLoading(true);
			setError(null);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
			setSelectedSubtitleIndex(-1);
			resetPopups(); // eslint-disable-line no-use-before-define

			// Stop any previous playback
			stopTimeUpdatePolling();
			cleanupAVPlay();
			avplayReadyRef.current = false;

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
					isLiveTV,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				});

				setPlayMethod(result.playMethod);
				setMediaSourceId(result.mediaSourceId);
				playSessionRef.current = result.playSessionId;
				positionRef.current = startPosition;
				runTimeRef.current = result.runTimeTicks || 0;
				setDuration((result.runTimeTicks || 0) / 10000000);

				// Set streams
				setAudioStreams(result.audioStreams || []);
				setSubtitleStreams(result.subtitleStreams || []);

				// Chapters are an Item property, not MediaSource - result.chapters may be empty
				let chapterList = [];
				if (!isLiveTV) {
					chapterList = result.chapters || [];
					if (chapterList.length === 0) {
						chapterList = await playback.fetchItemChapters(item.Id, item);
					}
				}
				setChapters(chapterList);

				// Handle initial audio selection
				if (initialAudioIndex !== undefined && initialAudioIndex !== null) {
					setSelectedAudioIndex(initialAudioIndex);
				} else {
					const defaultAudio = result.audioStreams?.find(s => s.isDefault);
					if (defaultAudio) setSelectedAudioIndex(defaultAudio.index);
				}

				// Track pending audio/subtitle setup (apply after AVPlay prepare)
				let pendingAudioIndex = null;
				if (initialAudioIndex != null) {
					pendingAudioIndex = initialAudioIndex;
				}

				let pendingSubAction = null;

				const loadSubtitleData = async (sub) => {
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

					console.log('[Player] loadSubtitleData:', {
						codec: sub?.codec,
						isImageBased: sub?.isImageBased,
						isTextBased: sub?.isTextBased,
						isAss: sub?.isAss,
						isEmbeddedNative: sub?.isEmbeddedNative,
						deliveryUrl: sub?.deliveryUrl,
						enablePgsRendering: settings.enablePgsRendering,
						pgsCanvasReady: !!pgsCanvasRef.current
					});

					if (sub && sub.isEmbeddedNative) {
						// Sets pendingSubAction so the post-ready callback can call setSelectTrack.
						// Image-based (PGS) tracks use setSilentSubtitle(false) for native rendering.
						pendingSubAction = {type: 'native', stream: sub};
						setSubtitleTrackEvents(null);
					} else if (sub && sub.isAss && supportsAssRenderer()) {
						pendingSubAction = {type: 'ass'};
						try {
							const assUrl = playback.getAssSubtitleUrl(sub);
							if (assUrl && pgsCanvasRef.current) {
								const assErrorHandler = (err) => {
									console.error('[Player] ASS renderer error, falling back to text', err);
									disposeAssRenderer(assRendererRef.current);
									assRendererRef.current = null;
									playback.fetchSubtitleData(sub).then(data => {
										setSubtitleTrackEvents(data?.TrackEvents || null);
									}).catch(() => setSubtitleTrackEvents(null));
								};
								const renderer = await initAssCanvasRenderer(pgsCanvasRef.current, assUrl, assErrorHandler);
								if (renderer) {
									assRendererRef.current = renderer;
									setSubtitleTrackEvents(null);
								} else {
									pendingSubAction = {type: 'text'};
									const data = await playback.fetchSubtitleData(sub);
									setSubtitleTrackEvents(data?.TrackEvents || null);
								}
							}
						} catch (err) {
							console.error('[Player] ASS init failed, falling back to text', err);
							pendingSubAction = {type: 'text'};
							try {
								const data = await playback.fetchSubtitleData(sub);
								setSubtitleTrackEvents(data?.TrackEvents || null);
							} catch (_e) {
								setSubtitleTrackEvents(null);
							}
						}
					} else if (sub && sub.isTextBased) {
						pendingSubAction = {type: 'text'};
						try {
							const data = await playback.fetchSubtitleData(sub);
							if (data && data.TrackEvents) {
								setSubtitleTrackEvents(data.TrackEvents);
							} else {
								setSubtitleTrackEvents(null);
							}
						} catch (err) {
							console.error('[Player] Error fetching subtitle data:', err);
							setSubtitleTrackEvents(null);
						}
					} else if (sub && sub.isImageBased && settings.enablePgsRendering) {
						try {
							const renderer = await initPgsCanvasRenderer(pgsCanvasRef.current, sub);
							if (renderer) {
								pgsRendererRef.current = renderer;
								pendingSubAction = {type: 'pgs'};
								setSubtitleTrackEvents(null);
							} else {
								pendingSubAction = {type: 'off'};
								console.error('[Player] PGS renderer returned null');
								setSubtitleTrackEvents(null);
							}
						} catch (err) {
							console.error('[Player] Error initializing PGS renderer:', err);
							pendingSubAction = {type: 'off'};
							setSubtitleTrackEvents(null);
						}
					} else {
						pendingSubAction = {type: 'off'};
						setSubtitleTrackEvents(null);
					}
					setCurrentSubtitleText(null);
				};

				if (initialSubtitleIndex !== undefined && initialSubtitleIndex !== null) {
					if (initialSubtitleIndex >= 0) {
						const initialSub = result.subtitleStreams?.find(s => s.index === initialSubtitleIndex);
						if (initialSub) {
							setSelectedSubtitleIndex(initialSubtitleIndex);
							await loadSubtitleData(initialSub);
						}
					} else {
						setSelectedSubtitleIndex(-1);
						setSubtitleTrackEvents(null);
					}
				} else if (settings.subtitleMode === 'always') {
					const defaultSub = result.subtitleStreams?.find(s => s.isDefault);
					if (defaultSub) {
						setSelectedSubtitleIndex(defaultSub.index);
						await loadSubtitleData(defaultSub);
					} else if (result.subtitleStreams?.length > 0) {
						const firstSub = result.subtitleStreams[0];
						setSelectedSubtitleIndex(firstSub.index);
						await loadSubtitleData(firstSub);
					}
				} else if (settings.subtitleMode === 'forced') {
					const forcedSub = result.subtitleStreams?.find(s => s.isForced);
					if (forcedSub) {
						setSelectedSubtitleIndex(forcedSub.index);
						await loadSubtitleData(forcedSub);
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
				setIsFavorite(!!item.UserData?.IsFavorite);

				// Audio mode: always show controls, skip video-only features
				if (shouldUseAudioMode) {
					setControlsVisible(true);
				} else if (!isLiveTV) {
					try {
						const segments = await withTimeout(playback.getMediaSegments(item.Id), 4000);
						setMediaSegments(segments);
					} catch (segmentErr) {
						console.warn('[Player] Media segment fetch skipped:', segmentErr?.message || segmentErr);
						setMediaSegments({introStart: null, introEnd: null, creditsStart: null});
					}

					// Load next episode for TV shows
					if (item.Type === 'Episode') {
						try {
							const next = await withTimeout(playback.getNextEpisode(item), 4000);
							setNextEpisode(next);
						} catch (nextErr) {
							console.warn('[Player] Next episode lookup skipped:', nextErr?.message || nextErr);
							setNextEpisode(null);
						}
					}
				}

				// === Start AVPlay ===
				avplayOpen(result.url);
				applyDisplayWindow();

				if (isLiveTV || result.url.includes('.m3u8')) {
					avplaySetStreamingProperty('ADAPTIVE_INFO', 'FIXED_MAX_RESOLUTION=1920x1080');
				}

				avplaySetListener({
					onbufferingstart: () => { setIsBuffering(true); },
					onbufferingcomplete: () => { setIsBuffering(false); },
					onstreamcompleted: () => { handleEndedCallbackRef.current?.(); },
					onerror: (eventType) => {
						console.error('[Player] AVPlay error:', eventType);
						handleErrorCallbackRef.current?.();
					},
					oncurrentplaytime: () => {},
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

				// Get duration from AVPlay (returns ms)
				const durationMs = avplayGetDuration();
				if (durationMs > 0) {
					setDuration(durationMs / 1000);
					runTimeRef.current = Math.floor(durationMs * 10000);
				}

				// Seek to start position if resuming
				if (!isLiveTV && startPosition > 0) {
					const seekMs = Math.floor(startPosition / 10000);
					await avplaySeek(seekMs);
				}

				// Play - must be called BEFORE setSelectTrack, which requires PLAYING or PAUSED state
				avplayPlay();
				setIsPaused(false);

				// Apply pending track selections (AVPlay must be in PLAYING/PAUSED state)
				const trackInfo = (pendingAudioIndex != null || pendingSubAction) ? avplayGetTracks() : [];
				const allTracks = Array.isArray(trackInfo) ? trackInfo : [];

				if (pendingAudioIndex != null && result.playMethod !== playback.PlayMethod.Transcode) {
					try {
						// Map Jellyfin stream Index → AVPlay audio track index
						const audioTracks = allTracks.filter(t => t.type === 'AUDIO');
						const jellyfinAudioStreams = result.audioStreams || [];
						const jellyfinPos = jellyfinAudioStreams.findIndex(s => s.index === pendingAudioIndex);
						if (jellyfinPos >= 0 && jellyfinPos < audioTracks.length) {
							const tizenAudioIndex = audioTracks[jellyfinPos].index;
							avplaySelectTrack('AUDIO', tizenAudioIndex);
							console.log('[Player] Applied initial audio track via AVPlay, jellyfinIndex:', pendingAudioIndex, 'tizenIndex:', tizenAudioIndex);
						} else if (audioTracks.length > 0) {
							avplaySelectTrack('AUDIO', pendingAudioIndex);
							console.log('[Player] Applied initial audio track via AVPlay (direct), index:', pendingAudioIndex);
						}
					} catch (audioErr) {
						console.warn('[Player] Failed to apply initial audio track:', audioErr.message);
					}
				}

				if (pendingSubAction) {
					if (pendingSubAction.type === 'native' && pendingSubAction.stream) {
						let nativeApplied = false;
						try {
							// Samsung AVPlay API uses 'TEXT' (not 'SUBTITLE') for subtitle tracks
							const subTracks = allTracks.filter(t => t.type === 'TEXT');
							if (subTracks.length > 0) {
								const embeddedStreams = (result.subtitleStreams || []).filter(s => s.isEmbeddedNative);
								const embeddedIndex = embeddedStreams.indexOf(pendingSubAction.stream);
								if (embeddedIndex >= 0 && embeddedIndex < subTracks.length) {
									const tizenIndex = subTracks[embeddedIndex].index;
									avplaySelectTrack('TEXT', tizenIndex);
									if (pendingSubAction.stream.isImageBased) {
										// PGS: AVPlay renders the bitmap overlay natively, no JS events.
										avplaySetSilentSubtitle(false);
										useNativeSubtitleRef.current = false;
									} else {
										// Text: suppress native render, receive text via onsubtitlechange.
										avplaySetSilentSubtitle(true);
										useNativeSubtitleRef.current = true;
									}
									nativeApplied = true;
								}
							}
						} catch (err) {
							console.warn('[Player] Native subtitle track mapping failed:', err);
						}
						if (!nativeApplied) {
							useNativeSubtitleRef.current = false;
							avplaySetSilentSubtitle(true);
							if (pendingSubAction.stream.isImageBased && settings.enablePgsRendering) {
								const renderer = await initPgsCanvasRenderer(pgsCanvasRef.current, pendingSubAction.stream);
								if (renderer) pgsRendererRef.current = renderer;
							} else {
								try {
									const data = await playback.fetchSubtitleData(pendingSubAction.stream);
									if (data && data.TrackEvents) {
										setSubtitleTrackEvents(data.TrackEvents);
									}
								} catch (fetchErr) {
									console.error('[Player] Subtitle extraction fallback failed:', fetchErr);
								}
							}
						}
					} else if (pendingSubAction.type === 'text') {
						avplaySetSilentSubtitle(true);
					} else {
						avplaySetSilentSubtitle(true);
					}
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
				setError(err.message || $L('Failed to load media'));
			} finally {
				setIsLoading(false);
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
			useNativeSubtitleRef.current = false;
			pendingSeekMsRef.current = null;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item, resume, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, settings.subtitleMode, settings.skipIntro, applyDisplayWindow]);

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
	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (controlsTimeoutRef.current) {
			clearTimeout(controlsTimeoutRef.current);
		}
		// Don't auto-hide controls in audio mode
		if (!isAudioMode) {
			controlsTimeoutRef.current = setTimeout(() => {
				if (!activeModal) {
					setControlsVisible(false);
				}
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

	// Audio playlist: next track (respects shuffle, repeat)
	const handleNextTrack = useCallback(async () => {
		if (!audioPlaylist || !onPlayNext) return;
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
	}, [hasNextTrack, onPlayNext, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode]);

	// Audio playlist: previous track (or restart current if >3s in)
	const handlePrevTrack = useCallback(async () => {
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
	}, [hasPrevTrack, onPlayNext, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode]);

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
					setPlayMethod(result.playMethod);
					playSessionRef.current = result.playSessionId;
					try {
						await startAVPlayback(result.url, positionRef.current);
						playback.reportStart(positionRef.current);
						playback.startProgressReporting(
							() => positionRef.current,
							10000,
							() => ({ isPaused: avplayGetState() !== 'PLAYING' })
						);
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
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, settings.stereoUpmixEnabled, startAVPlayback, mediaSourceId]);

	// Keep callback refs in sync
	handleEndedCallbackRef.current = handleEnded;
	handleErrorCallbackRef.current = handleError;

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
			playback.reportProgress(positionRef.current, { isPaused: false, eventName: 'unpause' });
		}
	}, [settings.unpauseRewind, isInGroup]);

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
		showControls();
		window.requestAnimationFrame(() => {
			Spotlight.focus('player-controls');
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
					// Map Jellyfin stream Index to AVPlay's audio track index
					const trackInfo = avplayGetTracks();
					const audioTracks = Array.isArray(trackInfo) ? trackInfo.filter(t => t.type === 'AUDIO') : [];
					const jellyfinPos = audioStreams.findIndex(s => s.index === index);
					if (jellyfinPos >= 0 && jellyfinPos < audioTracks.length) {
						const tizenAudioIndex = audioTracks[jellyfinPos].index;
						avplaySelectTrack('AUDIO', tizenAudioIndex);
						console.log('[Player] Switched audio track natively, jellyfinIndex:', index, 'tizenIndex:', tizenAudioIndex);
						return;
					}
						avplaySelectTrack('AUDIO', index);
					console.log('[Player] Switched audio track natively (direct), index:', index);
					return;
				} catch (nativeErr) {
					console.log('[Player] Native audio switch failed, reloading:', nativeErr.message);
				}
			}

			const currentMs = avplayGetCurrentTime();
			const currentPositionTicks = Math.floor(currentMs * 10000);

			const result = await playback.changeAudioStream(index, currentPositionTicks);
			if (result) {
				console.log('[Player] Switching audio track via stream reload for', playMethod, '- resuming from', currentPositionTicks);
				positionRef.current = currentPositionTicks;
				if (result.playMethod) setPlayMethod(result.playMethod);
				await startAVPlayback(result.url, currentPositionTicks);
				playback.reportStart(positionRef.current);
				playback.startProgressReporting(
					() => positionRef.current,
					10000,
					() => ({ isPaused: avplayGetState() !== 'PLAYING' })
				);
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, startAVPlayback, audioStreams]);

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
			if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
			avplaySetSilentSubtitle(true);
		} else {
			setSelectedSubtitleIndex(index);
			const stream = streamList.find((s) => s.index === index);

			let nativeSuccess = false;

			if (stream && stream.isEmbeddedNative) {
				try {
					const trackInfo = avplayGetTracks();
					const subTracks = Array.isArray(trackInfo) ? trackInfo.filter((t) => t.type === 'TEXT') : [];

					if (subTracks.length > 0) {
						const embeddedStreams = streamList.filter((s) => s.isEmbeddedNative);
						const embeddedIndex = embeddedStreams.indexOf(stream);

						if (embeddedIndex >= 0 && embeddedIndex < subTracks.length) {
							const tizenIndex = subTracks[embeddedIndex].index;
							avplaySelectTrack('TEXT', tizenIndex);
							if (stream.isImageBased) {
								// PGS: native bitmap overlay rendered by AVPlay. No JS events.
								avplaySetSilentSubtitle(false);
								useNativeSubtitleRef.current = false;
							} else {
								avplaySetSilentSubtitle(true);
								useNativeSubtitleRef.current = true;
							}
							nativeSuccess = true;
						}
					}
				} catch (err) {
					console.warn('[Player] Error selecting native track:', err);
				}
			}

			if (nativeSuccess) {
				setSubtitleTrackEvents(null);
				setCurrentSubtitleText(null);
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
						const assErrorHandler = (err) => {
							console.error('[Player] ASS renderer error, falling back to text', err);
							disposeAssRenderer(assRendererRef.current);
							assRendererRef.current = null;
							playback.fetchSubtitleData(stream).then(data => {
								setSubtitleTrackEvents(data?.TrackEvents || null);
							}).catch(() => setSubtitleTrackEvents(null));
						};
						const renderer = await initAssCanvasRenderer(pgsCanvasRef.current, assUrl, assErrorHandler);
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
	}, [subtitleStreams, closeModal, settings.enablePgsRendering]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		await applySubtitleSelection(index, subtitleStreams, true);
	}, [applySubtitleSelection, subtitleStreams]);

	const handleSelectSpeed = useCallback((e) => {
		const rate = parseFloat(e.currentTarget.dataset.rate);
		if (isNaN(rate)) return;
		setPlaybackRate(rate);
		// AVPlay supports integer speeds (1, 2, 4); fractional may not work
		if (avplayReadyRef.current) {
			avplaySetSpeed(rate);
		}
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
			setFocusRow('top');
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

	// Button action handler
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
			case 'info': openModal('info'); break;
			case 'next': handlePlayNextEpisode(); break;
			case 'nextTrack': handleNextTrack(); break;
			case 'prevTrack': handlePrevTrack(); break;
			case 'shuffle': handleToggleShuffle(); break;
			case 'repeat': handleToggleRepeat(); break;
			case 'favorite': handleToggleFavorite(); break;
			default: break;
		}
	}, [showControls, handlePlayPause, handleRewind, handleForward, openModal, handlePlayNextEpisode, handleNextTrack, handlePrevTrack, handleToggleShuffle, handleToggleRepeat, handleToggleFavorite]);

	// Wrapper for control button clicks - reads action from data attribute
	const handleControlButtonClick = useCallback((e) => {
		const action = e.currentTarget.dataset.action;
		if (action) {
			handleButtonAction(action);
		}
	}, [handleButtonAction]);

	const handleSubtitleOffsetChange = useCallback((newOffset) => {
		setSubtitleOffset(newOffset);
	}, []);

	// Prevent propagation handler for modals
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

		syncPlayCommandRef.current = true;

		switch (Command) {
			case 'Unpause': {
				const delay = syncPlayService.getDelayToWhen(When);
				if (PositionTicks != null) {
					avplaySeek(Math.floor(PositionTicks / 10000)).catch(() => {});
				}
				if (delay > 0) {
					const t = setTimeout(() => {
						avplayPlay();
						setIsPaused(false);
						syncPlayCommandRef.current = false;
					}, delay);
					return () => clearTimeout(t);
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
			case 'Stop': {
				handleBack();
				break;
			}
			default:
				break;
		}

		syncPlayCommandRef.current = false;
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
		if (!isInGroup) return;
		if (isBuffering) {
			const state = avplayGetState();
			syncPlayService.sendBufferingRequest(
				state === 'PLAYING',
				positionRef.current
			);
		} else if (avplayReadyRef.current) {
			const state = avplayGetState();
			syncPlayService.sendReadyRequest(
				state === 'PLAYING',
				positionRef.current
			);
		}
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
					avplayPlay();
					setIsPaused(false);
				}
				return;
			}
			if (e.keyCode === KEYS.PAUSE) {
				e.preventDefault();
				e.stopPropagation();
				showControls();
				const state = avplayGetState();
				if (state === 'PLAYING') {
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
				showControls(); // Reset timer on navigation

				if (key === 'ArrowUp' || e.keyCode === 38) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'bottom') return isLiveTV ? 'top' : 'progress';
						if (prev === 'progress') {
							window.requestAnimationFrame(() => Spotlight.focus(isAudioMode ? 'favorite-btn' : 'play-pause-btn'));
							return 'top';
						}
						return 'top';
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
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, duration, settings.seekStep, handlePopupKeyDown, bottomButtons.length, isAudioMode, scheduleDeferredSeek, showSkipIntro, showSkipCredits, showNextEpisode, isLiveTV]);

	// Calculate progress - use seekPosition when actively seeking for smooth scrubbing
	const displayTime = isSeeking ? (seekPosition / 10000000) : currentTime;
	const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

	// Focus appropriate element when focusRow changes
	useEffect(() => {
		if (!controlsVisible) return;

		window.requestAnimationFrame(() => {
			if (focusRow === 'progress') {
				Spotlight.focus('progress-bar');
			} else if (focusRow === 'bottom') {
				Spotlight.focus('bottom-row-default');
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
								{isLyricsLoading && <p className={css.audioLyricsLine}>Loading lyrics...</p>}
								{!isLyricsLoading && lyricsError && <p className={css.audioLyricsLine}>{lyricsError}</p>}
								{!isLyricsLoading && !lyricsError && activeLyricLine && (
									<p className={css.audioLyricsLine}>{activeLyricLine}</p>
								)}
								{!isLyricsLoading && !lyricsError && !activeLyricLine && lyricsLines.length > 0 && (
									<p className={css.audioLyricsLine}>{lyricsLines[0].text}</p>
								)}
								{!isLyricsLoading && !lyricsError && lyricsLines.length === 0 && (
									<p className={css.audioLyricsLine}>No lyrics available</p>
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
				<div className={css.nextEpisodeOverlay}>
					<div className={css.nextLabel}>{$L('UP NEXT')}</div>
					<div className={css.nextTitle}>{nextEpisode.Name}</div>
					{nextEpisode.SeriesName && (
						<div className={css.nextMeta}>
							S{nextEpisode.ParentIndexNumber}E{nextEpisode.IndexNumber}
						</div>
					)}
					{nextEpisodeCountdown !== null && (
						<div className={css.nextCountdown}>
							{$L('Starting in {countdown}s').replace('{countdown}', nextEpisodeCountdown)}
						</div>
					)}
					<div className={css.nextButtons}>
						<Button onClick={handlePlayNextEpisode} spotlightId="next-episode-play-btn">{$L('Play Now')}</Button>
						<Button onClick={cancelNextEpisodeCountdown}>{$L('Hide')}</Button>
					</div>
				</div>
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
				handleSelectQuality={handleSelectQuality}
				handleSelectChapter={handleSelectChapter}
				handleOpenSubtitleOffset={handleOpenSubtitleOffset}
				handleOpenSubtitleSettings={handleOpenSubtitleSettings}
				handleOpenRemoteSubtitleSearch={handleOpenRemoteSubtitleSearch}
				handleSelectRemoteSubtitle={handleSelectRemoteSubtitle}
				canDownloadRemoteSubtitles={!isAudioMode && Boolean(item?.Id)}
				isSearchingRemoteSubtitles={isSearchingRemoteSubtitles}
				remoteSubtitleResults={remoteSubtitleResults}
				handleSubtitleOffsetChange={handleSubtitleOffsetChange}
				closeModal={closeModal}
				stopPropagation={stopPropagation}
				// eslint-disable-next-line react/jsx-no-bind
				renderInfoPlaybackRows={({css: c}) => (
					<div className={c.infoRow}>
						<span className={c.infoLabel}>{$L('Player')}</span>
						<span className={c.infoValue}>AVPlay (Native)</span>
					</div>
				)}
			/>
		</div>
	);
};

export default Player;
