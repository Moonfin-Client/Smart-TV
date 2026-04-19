import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import $L from '@enact/i18n/$L';
import Hls from 'hls.js';
import * as playback from '../../services/playback';
import {getImageUrl} from '../../utils/helpers';
import {api as jellyfinApi, createApiForServer, getServerUrl} from '../../services/jellyfinApi';
import {detectWebOSVersion, getH264FallbackProfile} from '@moonfin/platform-webos/deviceProfile';
import {initPgsRenderer, disposePgsRenderer} from '../../utils/pgsRenderer';
import {supportsAssRenderer, initAssRenderer, disposeAssRenderer} from '../../utils/assRenderer';
import {
	initLunaAPI,
	registerAppStateObserver,
	keepScreenOn,
	cleanupVideoElement,
	waitForDecoderRelease,
	getSharedVideoElement,
	setupVisibilityHandler,
	setupWebOSLifecycle
} from '@moonfin/platform-webos/video';
import {useSettings} from '../../context/SettingsContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import * as syncPlayService from '../../services/syncPlay';
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml} from '../../utils/subtitleConstants';
import PlayerControls, {usePlayerButtons} from './PlayerControls';
import useSegmentPopups from './useSegmentPopups';
import {
	SpottableButton, NextEpisodeContainer, CONTROLS_HIDE_DELAY,
	parseLyricsResponse, withTimeout
} from './PlayerConstants';
import {
	toSubtitleLanguage,
	mapSubtitleStreamsFromMediaSource,
	mapRemoteSubtitleOptions
} from './remoteSubtitleUtils';

import css from './WebOSPlayer.module.less';

const Player = ({item, resume, initialMediaSourceId, initialAudioIndex, initialSubtitleIndex, initialStartPositionTicks, onEnded, onBack, onPlayNext, audioPlaylist, onPausedChange}) => {
	const {settings} = useSettings();
	const {isInGroup, lastCommand} = useSyncPlay();
	const syncPlayCommandRef = useRef(false);
	const lastProcessedCommandRef = useRef(null);

	const [mediaUrl, setMediaUrl] = useState(null);
	const [mimeType, setMimeType] = useState('video/mp4');
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
	const [subtitleTrackEvents, setSubtitleTrackEvents] = useState(null)
	const [currentSubtitleText, setCurrentSubtitleText] = useState(null);
	const [subtitleOffset, setSubtitleOffset] = useState(0);
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
	const [isAudioMode, setIsAudioMode] = useState(false);
	const [lyricsLines, setLyricsLines] = useState([]);
	const [, setIsLyricsLoading] = useState(false);
	const [, setLyricsError] = useState(null);
	const [shuffleMode, setShuffleMode] = useState(false);
	const [repeatMode, setRepeatMode] = useState('off');
	const [isFavorite, setIsFavorite] = useState(false);
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

	const lyricsScrollRef = useRef(null);



	const videoRef = useRef(null);
	const containerRef = useRef(null);
	const handlersRef = useRef({});
	const positionRef = useRef(0);
	const playSessionRef = useRef(null);
	const runTimeRef = useRef(0);
	const healthMonitorRef = useRef(null);
	const unregisterAppStateRef = useRef(null);
	const controlsTimeoutRef = useRef(null);
	const lastSeekTargetRef = useRef(null);
	const seekingTranscodeRef = useRef(false);
	const seekDebounceTimerRef = useRef(null);
	const isCleaningUpRef = useRef(false);
	const isHandlingErrorRef = useRef(false);
	const sourceTransitionRef = useRef(false);
	const transcodeRetryCountRef = useRef(0);
	const forceHlsJsRef = useRef(false);
	const isLiveTV = item.Type === 'TvChannel';
	const prevItemIdRef = useRef(null);
	const hlsPlayerRef = useRef(null);
	const pendingAudioRef = useRef(null);
	const transcodeOffsetTicksRef = useRef(0);
	const transcodeOffsetDetectedRef = useRef(true);
	const playbackStartTimeoutRef = useRef(null);
	const pendingResumeTicksRef = useRef(0);
	const hasReportedStartRef = useRef(false);
	const lastSeekTimeRef = useRef(0);
	const mediaUrlRef = useRef(null);
	const pgsRendererRef = useRef(null);
	const assRendererRef = useRef(null);
	const pendingInitialAssSubtitleRef = useRef(null);

	const destroyHlsPlayer = () => {
		if (hlsPlayerRef.current) {
			hlsPlayerRef.current.destroy();
			hlsPlayerRef.current = null;
		}
	};

	// Match a Jellyfin audio stream to a browser audioTracks entry by language,
	// falling back to array-position if language matching is ambiguous or unavailable.
	const matchAudioTrack = (nativeTracks, jellyfinStreams, targetIndex) => {
		const selectedStream = jellyfinStreams.find(s => s.index === targetIndex);
		if (selectedStream) {
			const lang = (selectedStream.language || '').toLowerCase();
			if (lang && lang !== 'unknown' && lang !== 'und') {
				const langMatches = [];
				for (let i = 0; i < nativeTracks.length; i++) {
					const trackLang = (nativeTracks[i].language || '').toLowerCase();
					if (trackLang === lang || trackLang.startsWith(lang) || lang.startsWith(trackLang)) {
						langMatches.push(i);
					}
				}
				if (langMatches.length === 1) return langMatches[0];
				if (langMatches.length > 1) {
					const sameLanguageStreams = jellyfinStreams.filter(s => (s.language || '').toLowerCase() === lang);
					const posInSameLanguage = sameLanguageStreams.findIndex(s => s.index === targetIndex);
					if (posInSameLanguage >= 0 && posInSameLanguage < langMatches.length) {
						return langMatches[posInSameLanguage];
					}
				}
			}
		}
		const trackPosition = jellyfinStreams.findIndex(s => s.index === targetIndex);
		if (trackPosition >= 0 && trackPosition < nativeTracks.length) return trackPosition;
		return -1;
	};

	const {topButtons, bottomButtons, favoriteButton} = usePlayerButtons({
		isPaused, audioStreams, subtitleStreams, chapters,
		nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
		shuffleMode, repeatMode, isFavorite
	});

	const initAssRendererForStream = useCallback(async (stream) => {
		if (!stream?.isAss || !videoRef.current) {
			return false;
		}

		try {
			const assUrl = playback.getAssSubtitleUrl(stream);
			if (!assUrl) {
				return false;
			}

			const renderer = await initAssRenderer(videoRef.current, assUrl, (err) => {
				console.error('[Player] ASS renderer error, falling back to text', err);
				disposeAssRenderer(assRendererRef.current);
				assRendererRef.current = null;
				playback.fetchSubtitleData(stream).then(data => {
					setSubtitleTrackEvents(data?.TrackEvents || null);
				}).catch(() => setSubtitleTrackEvents(null));
			});

			if (renderer) {
				assRendererRef.current = renderer;
				setSubtitleTrackEvents(null);
				return true;
			}
		} catch (err) {
			console.error('[Player] ASS init failed, falling back to text', err);
		}

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

		return false;
	}, []);

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

	useEffect(() => {
		if (activeLyricIndex < 0 || !lyricsScrollRef.current) return;
		const el = lyricsScrollRef.current.querySelector(`[data-lyric-index="${activeLyricIndex}"]`);
		if (el) {
			// scrollIntoView options object unsupported on webOS 2 / old WebKit
			const container = lyricsScrollRef.current;
			container.scrollTop = el.offsetTop - (container.clientHeight / 2) + (el.offsetHeight / 2);
		}
	}, [activeLyricIndex]);

	useEffect(() => {
		const init = async () => {
			await initLunaAPI();
			await keepScreenOn(!isPaused);

			unregisterAppStateRef.current = registerAppStateObserver(
				() => {
					console.log('[Player] App resumed');
					if (videoRef.current && !isPaused) {
						videoRef.current.play();
					}
				},
				() => {
					console.log('[Player] App backgrounded');
				}
			);
		};
		init();

		return () => {
			keepScreenOn(false);
			if (unregisterAppStateRef.current) {
				unregisterAppStateRef.current();
			}
		};
	}, [isPaused]);

	useEffect(() => {
		onPausedChange?.(isPaused);
	}, [isPaused, onPausedChange]);

	// Handle webOS app visibility and relaunch events to properly pause/cleanup video
	useEffect(() => {
		let wasPlaying = false;

		const handleAppHidden = () => {
			console.log('[Player] App hidden - pausing and saving progress');
			if (videoRef.current) {
				wasPlaying = !videoRef.current.paused;
				if (wasPlaying) {
					videoRef.current.pause();
				}
			}
			// Report current progress when app is backgrounded
			// This ensures position is saved if user doesn't return
			if (positionRef.current > 0) {
				playback.reportProgress(positionRef.current);
			}
		};

		const handleAppVisible = () => {
			console.log('[Player] App visible - resuming if was playing');
			if (videoRef.current && wasPlaying) {
				const p = videoRef.current.play();
				if (p && typeof p.catch === 'function') {
					p.catch(err => {
						console.warn('[Player] Failed to resume playback:', err);
					});
				}
			}
		};

		const handleRelaunch = (params) => {
			console.log('[Player] App relaunched with params:', params);
			destroyHlsPlayer();
			if (videoRef.current) {
				cleanupVideoElement(videoRef.current);
			}
		};

		const removeVisibilityHandler = setupVisibilityHandler(handleAppHidden, handleAppVisible);
		const removeWebOSHandler = setupWebOSLifecycle(handleRelaunch);

		return () => {
			removeVisibilityHandler();
			removeWebOSHandler();
		};
	}, []);

	// Attach the singleton video element to the container and strip leftover trailer state.
	useEffect(() => {
		const video = getSharedVideoElement();
		videoRef.current = video;

		video.onplaying = null;
		video.onended = null;
		video.onerror = null;
		video.className = '';

		if (containerRef.current && !containerRef.current.contains(video)) {
			containerRef.current.appendChild(video);
		}

		const listeners = {
			loadedmetadata: () => handlersRef.current.onLoadedMetadata?.(),
			play: () => handlersRef.current.onPlay?.(),
			pause: () => handlersRef.current.onPause?.(),
			timeupdate: () => handlersRef.current.onTimeUpdate?.(),
			waiting: () => handlersRef.current.onWaiting?.(),
			playing: () => handlersRef.current.onPlaying?.(),
			ended: () => handlersRef.current.onEnded?.(),
			error: () => handlersRef.current.onError?.(),
		};

		for (const [event, handler] of Object.entries(listeners)) {
			video.addEventListener(event, handler);
		}

		const container = containerRef.current;

		return () => {
			for (const [event, handler] of Object.entries(listeners)) {
				video.removeEventListener(event, handler);
			}
			if (container && container.contains(video)) {
				container.removeChild(video);
			}
			videoRef.current = null;
		};
	}, []);

	useEffect(() => {
		const videoElement = videoRef.current;
		console.log('[Player] Main useEffect running with deps:', {
			itemId: item?.Id,
			selectedQuality,
			maxBitrate: settings.maxBitrate,
			preferTranscode: settings.preferTranscode,
			subtitleMode: settings.subtitleMode,
			skipIntro: settings.skipIntro,
			initialAudioIndex,
			initialSubtitleIndex
		});

		const loadMedia = async () => {
			isCleaningUpRef.current = false;
			hasReportedStartRef.current = false;
			if (prevItemIdRef.current !== item.Id) {
				transcodeRetryCountRef.current = 0;
				forceHlsJsRef.current = false;
				prevItemIdRef.current = item.Id;
			}
			setIsLoading(true);
			setError(null);
			setHasTriedTranscode(false);
			setCurrentTime(0);
			setSeekPosition(0);
			setIsSeeking(false);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
			setSelectedSubtitleIndex(-1);

			resetPopups(); // eslint-disable-line no-use-before-define
			setNextEpisode(null);

			await waitForDecoderRelease();

			try {
				const savedPosition = isLiveTV ? 0 : (item.UserData?.PlaybackPositionTicks || 0);
				const startPosition = initialStartPositionTicks != null ? initialStartPositionTicks : ((!isLiveTV && resume !== false) ? savedPosition : 0);
				console.log('[Player] Start position:', {
					resume,
					savedPosition,
					startPosition,
					isLiveTV,
					hasUserData: !!item.UserData
				});
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: startPosition,
					maxBitrate: selectedQuality || settings.maxBitrate,
					enableDirectPlay: !settings.preferTranscode,
					enableDirectStream: !settings.preferTranscode,
					forceDirectPlay: isLiveTV ? false : settings.forceDirectPlay,
					mediaSourceId: initialMediaSourceId,
					audioStreamIndex: initialAudioIndex,
					subtitleStreamIndex: initialSubtitleIndex,
					item: item,
					isLiveTV,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				});

				setMediaUrl(result.url);
				setMimeType(result.mimeType || 'video/mp4');
				setPlayMethod(result.playMethod);
				setMediaSourceId(result.mediaSourceId);
				playSessionRef.current = result.playSessionId;

				positionRef.current = startPosition;
				lastSeekTargetRef.current = null;
				seekingTranscodeRef.current = false;

				// Defer seek until pipeline is running
				if (!isLiveTV && result.playMethod !== 'Transcode' && startPosition > 0) {
					pendingResumeTicksRef.current = startPosition;
					console.log('[Player] Pending resume seek:', startPosition, 'ticks (' + (startPosition / 10000000) + 's)');
				} else {
					pendingResumeTicksRef.current = 0;
				}

				if (!isLiveTV && result.playMethod === 'Transcode' && startPosition > 0) {
					transcodeOffsetTicksRef.current = startPosition;
					transcodeOffsetDetectedRef.current = false;
				} else {
					transcodeOffsetTicksRef.current = 0;
					transcodeOffsetDetectedRef.current = true;
				}

				runTimeRef.current = result.runTimeTicks || 0;
				setDuration((result.runTimeTicks || 0) / 10000000);

				setAudioStreams(result.audioStreams || []);
				setSubtitleStreams(result.subtitleStreams || []);
				setChapters(result.chapters || []);

				const defaultAudio = result.audioStreams?.find(s => s.isDefault);
				if (initialAudioIndex !== undefined && initialAudioIndex !== null) {
					setSelectedAudioIndex(initialAudioIndex);
					// Store for onFirstTimeUpdate to apply via audioTracks API
					pendingAudioRef.current = {
						streamIndex: initialAudioIndex,
						audioStreams: result.audioStreams || []
					};
				} else if (defaultAudio) {
					setSelectedAudioIndex(defaultAudio.index);
					pendingAudioRef.current = null;
				}

				// Load subtitle data or renderer for the selected stream.
				const loadSubtitleData = async (sub) => {
					disposePgsRenderer(pgsRendererRef.current);
					pgsRendererRef.current = null;
					disposeAssRenderer(assRendererRef.current);
					assRendererRef.current = null;
					pendingInitialAssSubtitleRef.current = null;

					const supportsAss = sub && sub.isAss && supportsAssRenderer();
					if (supportsAss) {
						const hasReadyVideoSource = !!(videoRef.current && (videoRef.current.currentSrc || videoRef.current.src));
						if (!hasReadyVideoSource) {
							pendingInitialAssSubtitleRef.current = sub;
							setSubtitleTrackEvents(null);
						} else {
							await initAssRendererForStream(sub);
						}
					} else if (sub && sub.isTextBased) {
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
						if (videoRef.current) {
							try {
								const renderer = await initPgsRenderer(videoRef.current, sub);
								if (renderer) {
									pgsRendererRef.current = renderer;
									setSubtitleTrackEvents(null);
								} else {
									console.error('[Player] PGS renderer returned null');
									setSubtitleTrackEvents(null);
								}
							} catch (err) {
								console.error('[Player] PGS renderer failed:', err);
								setSubtitleTrackEvents(null);
							}
						} else {
							console.error('[Player] PGS: videoRef is null');
							setSubtitleTrackEvents(null);
						}
					} else {
						setSubtitleTrackEvents(null);
					}

					setCurrentSubtitleText(null);
				};

				if (initialSubtitleIndex !== undefined && initialSubtitleIndex !== null) {
					if (initialSubtitleIndex >= 0) {
						const selectedSub = result.subtitleStreams?.find(s => s.index === initialSubtitleIndex);
						if (selectedSub) {
							setSelectedSubtitleIndex(initialSubtitleIndex);
							await loadSubtitleData(selectedSub);
						} else {
							console.error('[Player] initialSubtitleIndex', initialSubtitleIndex, 'not found in subtitleStreams');
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
				const shouldUseAudioMode = !!result.isAudio || item?.MediaType === 'Audio' || item?.Type === 'Audio';
				setTitle(displayTitle);
				setSubtitle(displaySubtitle);
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

				console.log(`[Player] Loaded ${displayTitle} via ${result.playMethod}${isLiveTV ? ' [Live TV]' : ''}`);
			} catch (err) {
				console.error('[Player] Failed to load media:', err);
				setError(err.message || $L('Failed to load media'));
			} finally {
				setIsLoading(false);
			}
		};

		loadMedia();

		return () => {
			console.log('[Player] Cleanup running - unmounting or re-rendering');

			if (isCleaningUpRef.current) {
				console.log('[Player] Skipping cleanup - already handled by handleBack/handleEnded');
				playback.stopProgressReporting();
				playback.stopHealthMonitoring();
				resetPopups(); // eslint-disable-line no-use-before-define
				if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
				if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
				disposePgsRenderer(pgsRendererRef.current);
				disposeAssRenderer(assRendererRef.current);
				return;
			}

			const videoTime = videoElement ? videoElement.currentTime : 0;
			const videoTicks = Math.floor(videoTime * 10000000) + transcodeOffsetTicksRef.current;
			const currentPos = videoTicks > 0 ? videoTicks : positionRef.current;

			const intendedStart = positionRef.current;
			const playedMeaningfully = videoTicks > 100000000 || videoTicks > intendedStart + 100000000;
			if (currentPos > 0 && (playedMeaningfully || intendedStart === 0)) {
				console.log('[Player] Reporting stop at position:', currentPos, 'ticks');
				playback.reportStop(currentPos);
			} else {
				console.log('[Player] Skipping reportStop - position too small:', currentPos,
					'videoTime:', videoTime, 'intendedStart:', intendedStart);
			}

			playback.stopProgressReporting();
			playback.stopHealthMonitoring();

			resetPopups(); // eslint-disable-line no-use-before-define
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
			if (seekDebounceTimerRef.current) {
				clearTimeout(seekDebounceTimerRef.current);
			}

			isCleaningUpRef.current = true;
			destroyHlsPlayer();
			if (videoElement) {
				try { videoElement.pause(); } catch (e) { /* ignore */ }
				while (videoElement.firstChild) videoElement.removeChild(videoElement.firstChild);
				videoElement.src = '';
				videoElement.removeAttribute('src');
				if (videoElement.srcObject) {
					videoElement.srcObject = null;
				}
			}
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item, resume, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, settings.subtitleMode, settings.skipIntro, initialAudioIndex, initialSubtitleIndex]);

	useEffect(() => {
		if (mediaUrl) {
			mediaUrlRef.current = mediaUrl;
		}
	}, [mediaUrl]);

	const seekInTranscode = useCallback(async (seekPositionTicks) => {
		if (seekingTranscodeRef.current) return;
		seekingTranscodeRef.current = true;

		if (seekDebounceTimerRef.current) {
			clearTimeout(seekDebounceTimerRef.current);
			seekDebounceTimerRef.current = null;
		}

		console.log('[Player] seekInTranscode: seeking to', seekPositionTicks, 'ticks (', seekPositionTicks / 10000000, 's)');

		sourceTransitionRef.current = true;

		try {
			const video = videoRef.current;
			const currentUrl = mediaUrlRef.current;
			const newUrl = playback.rewriteTranscodeSeekUrl(currentUrl, seekPositionTicks);

			if (!newUrl || newUrl === currentUrl) {
				console.warn('[Player] seekInTranscode: URL unchanged, skipping seek');
				seekingTranscodeRef.current = false;
				sourceTransitionRef.current = false;
				return;
			}

			positionRef.current = seekPositionTicks;
			lastSeekTargetRef.current = seekPositionTicks;
			transcodeOffsetTicksRef.current = seekPositionTicks;
			transcodeOffsetDetectedRef.current = false;

			if (hlsPlayerRef.current) {
				hlsPlayerRef.current.stopLoad();
				hlsPlayerRef.current.loadSource(newUrl);
			} else if (video) {
				video.src = newUrl;
				if (mimeType) video.type = mimeType;
				video.load();
				const p = video.play();
				if (p && typeof p.catch === 'function') {
					p.catch(e => {
						if (e.name !== 'AbortError') {
							console.error('[Player] seekInTranscode play() rejected:', e);
						}
					});
				}
			}

			mediaUrlRef.current = newUrl;
		} catch (err) {
			console.error('[Player] seekInTranscode failed:', err);
			setError($L('Failed to seek - please try again'));
			sourceTransitionRef.current = false;
			seekingTranscodeRef.current = false;
		}
	}, [mimeType]);

	const seekByOffset = useCallback((deltaSec, updateSeekPosition) => {
		const baseTime = (playMethod === 'Transcode')
			? ((lastSeekTargetRef.current != null ? lastSeekTargetRef.current : positionRef.current) / 10000000)
			: (videoRef.current ? videoRef.current.currentTime : 0);
		const maxSeek = Math.max(0, duration - 1);
		const newTime = Math.max(0, Math.min(maxSeek, baseTime + deltaSec));
		const newTicks = Math.floor(newTime * 10000000);
		if (updateSeekPosition) setSeekPosition(newTicks);
		positionRef.current = newTicks;
		lastSeekTargetRef.current = newTicks;
		if (playMethod === 'Transcode') {
			setCurrentTime(newTime);
			if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
			seekDebounceTimerRef.current = setTimeout(() => {
				seekInTranscode(lastSeekTargetRef.current);
			}, 600);
		} else if (videoRef.current) {
			lastSeekTimeRef.current = Date.now();
			if (healthMonitorRef.current) healthMonitorRef.current.reset();
			try {
				videoRef.current.currentTime = newTime;
			} catch (e) {
				console.warn('[Player] seekByOffset: failed to set currentTime:', e);
			}
		}
	}, [duration, playMethod, seekInTranscode]);

	const seekToTicks = useCallback((ticks) => {
		if (!videoRef.current) return;
		const maxTicks = Math.max(0, runTimeRef.current - 10000000); // 1s before end
		const clampedTicks = Math.max(0, Math.min(ticks, maxTicks));
		positionRef.current = clampedTicks;
		lastSeekTargetRef.current = clampedTicks;
		if (playMethod === 'Transcode') {
			seekInTranscode(clampedTicks);
		} else {
			lastSeekTimeRef.current = Date.now();
			if (healthMonitorRef.current) healthMonitorRef.current.reset();
			try {
				videoRef.current.currentTime = clampedTicks / 10000000;
			} catch (e) {
				console.warn('[Player] seekToTicks: failed to set currentTime:', e);
			}
		}
	}, [playMethod, seekInTranscode]);

	useEffect(() => {
		const video = videoRef.current;
		console.log('[Player] Video src useEffect - video exists:', !!video, 'mediaUrl:', !!mediaUrl, 'isLoading:', isLoading, 'error:', !!error);

		if (!video || !mediaUrl || isLoading || error) return;

		console.log('[Player] Setting video src via ref:', mediaUrl);
		console.log('[Player] PlayMethod:', playMethod, 'MimeType:', mimeType);

		// autoplay must be re-set because hls.js path overrides it to false
		video.autoplay = true;

		const setSourceAndPlay = () => {
			console.log('[Player] Setting video source now');

			destroyHlsPlayer();

			let srcUrl = mediaUrl;
			const resumeTicks = pendingResumeTicksRef.current;
			if (resumeTicks > 0 && playMethod !== 'Transcode') {
				const resumeSec = resumeTicks / 10000000;
				srcUrl = mediaUrl + '#t=' + resumeSec;
				console.log('[Player] Appending media fragment #t=' + resumeSec + ' for resume (' + resumeTicks + ' ticks)');
			}

			const isHls = mimeType === 'application/x-mpegURL' || mediaUrl.includes('.m3u8');
			const webosVersion = detectWebOSVersion();
			// forceHlsJsRef overrides native when HEVC decoding already failed
			const nativeHlsOk = !forceHlsJsRef.current
				&& !!(video.canPlayType('application/x-mpegURL').replace(/no/, ''));
			const useHlsJs = isHls && !nativeHlsOk && Hls.isSupported();
			console.log('[Player] Source type:', { isHls, mimeType, autoplay: video.autoplay, webosVersion, nativeHlsOk, useHlsJs, forceHlsJs: forceHlsJsRef.current });

			while (video.firstChild) video.removeChild(video.firstChild);
			video.removeAttribute('src');
			video.load();

			if (useHlsJs) {
				console.log('[Player] Using hls.js for HLS playback (webOS ' + webosVersion + ')');
				const hls = new Hls({
					enableWorker: false,
					lowLatencyMode: false,
					maxBufferLength: 30,
					maxMaxBufferLength: 60,
					startFragPrefetch: true,
					maxBufferHole: 0.5,
					nudgeMaxRetry: 5,
				});
				hlsPlayerRef.current = hls;
				let hlsPlayStarted = false;
				let fragBufferedCount = 0;
				let stallCount = 0;

				hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
					console.log('[Player] hls.js manifest parsed, levels:', data.levels?.length, 'waiting for first fragment...');
				});

				hls.on(Hls.Events.FRAG_BUFFERED, () => {
					fragBufferedCount++;
					if (hlsPlayStarted) return;
					if (fragBufferedCount < 2) {
						console.log('[Player] hls.js fragment buffered (' + fragBufferedCount + '/2), waiting for more data...');
						return;
					}
					hlsPlayStarted = true;
					console.log('[Player] hls.js ' + fragBufferedCount + ' fragments buffered, starting playback');
					const p = video.play();
					if (p && typeof p.then === 'function') {
						p.then(() => console.log('[Player] hls.js play() resolved'))
						 .catch(e => {
							 if (e.name === 'AbortError') {
								 console.log('[Player] hls.js play() aborted - expected');
							 } else {
								 console.error('[Player] hls.js play() rejected:', e);
							 }
						 });
					}
				});

				hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
					console.log('[Player] hls.js loading fragment:', data.frag?.sn);
				});

				hls.on(Hls.Events.ERROR, (event, data) => {
					console.error('[Player] hls.js error:', data.type, data.details, 'fatal:', data.fatal);

					if (hlsPlayStarted && !data.fatal && (
						data.details === 'bufferStalledError' ||
						data.details === 'bufferNudgeOnStall'
					)) {
						stallCount++;
						if (stallCount === 3 && video.currentTime < 1) {
							console.log('[Player] hls.js persistent stall at', video.currentTime, '- force-seeking to 0.5s');
							video.currentTime = 0.5;
						} else if (stallCount === 6 && video.currentTime < 2) {
							console.log('[Player] hls.js still stalling at', video.currentTime, '- recovering media error');
							hls.recoverMediaError();
						}
					}

					if (data.fatal) {
						switch (data.type) {
							case Hls.ErrorTypes.NETWORK_ERROR:
								console.log('[Player] hls.js fatal network error - attempting recovery');
								hls.startLoad();
								break;
							case Hls.ErrorTypes.MEDIA_ERROR:
								console.log('[Player] hls.js fatal media error - attempting recovery');
								hls.recoverMediaError();
								break;
							default:
								console.error('[Player] hls.js unrecoverable error - dispatching error event');
								video.dispatchEvent(new Event('error'));
								break;
						}
					}
				});

				video.autoplay = false; // play() called from FRAG_BUFFERED instead
				hls.attachMedia(video);
				hls.loadSource(srcUrl);
			} else {
				destroyHlsPlayer();
				video.src = srcUrl;
				// Pass DV / codec hints so Starfish can activate the right decoder
				if (mimeType) video.type = mimeType;
				video.load();
			}

			if (playbackStartTimeoutRef.current) {
				clearTimeout(playbackStartTimeoutRef.current);
			}
			let resumeHandled = false;
			const onFirstTimeUpdate = () => {
				if (!resumeHandled) {
					resumeHandled = true;
					clearTimeout(playbackStartTimeoutRef.current);
					playbackStartTimeoutRef.current = null;
					sourceTransitionRef.current = false;
					transcodeRetryCountRef.current = 0;
					if (pendingResumeTicksRef.current > 0) {
						const seekSec = pendingResumeTicksRef.current / 10000000;
						if (video.currentTime < seekSec * 0.5) {
							console.log('[Player] #t= fragment did not seek - using currentTime fallback:', seekSec, 's');
							video.currentTime = seekSec;
						} else {
							console.log('[Player] Resume via #t= fragment successful, position:', video.currentTime, 's');
						}
						pendingResumeTicksRef.current = 0;
					}
				}

				// audioTracks may not be populated on the first timeupdate,
				// so retry on subsequent events until applied or no longer needed
				const pending = pendingAudioRef.current;
				if (pending) {
					if (video.audioTracks?.length > 1) {
						const matchIndex = matchAudioTrack(video.audioTracks, pending.audioStreams, pending.streamIndex);
						if (matchIndex >= 0) {
							for (let i = 0; i < video.audioTracks.length; i++) {
								video.audioTracks[i].enabled = (i === matchIndex);
							}
							console.log('[Player] Applied initial audio track via audioTracks API, index:', pending.streamIndex, 'matchIndex:', matchIndex);
						}
						pendingAudioRef.current = null;
					} else if (video.audioTracks?.length > 0) {
						// Single audio track, nothing to switch
						pendingAudioRef.current = null;
					}
				}

				if (!pendingAudioRef.current) {
					video.removeEventListener('timeupdate', onFirstTimeUpdate);
				}
			};
			video.addEventListener('timeupdate', onFirstTimeUpdate);
			const timeoutMs = useHlsJs ? 30000 : (playMethod === 'Transcode') ? 15000 : 8000;
			playbackStartTimeoutRef.current = setTimeout(() => {
				video.removeEventListener('timeupdate', onFirstTimeUpdate);
				sourceTransitionRef.current = false;
				const expectedStart = resumeTicks > 0 ? resumeTicks / 10000000 : 0;
				const noProgress = expectedStart > 0
					? (video.currentTime < expectedStart * 0.5 && (video.readyState < 3 || video.paused))
					: (video.currentTime === 0 && (video.readyState < 3 || video.paused));
				if (noProgress) {
					console.warn('[Player] Playback start timeout - no timeupdate received in ' + (timeoutMs / 1000) + 's, triggering error handler');
					console.warn('[Player] Video state:', { readyState: video.readyState, networkState: video.networkState, paused: video.paused, currentSrc: video.currentSrc });
					video.dispatchEvent(new Event('error'));
				}
			}, timeoutMs);

			if (!useHlsJs) {
				const playResult = video.play();
				if (playResult && typeof playResult.then === 'function') {
					playResult.then(() => {
						console.log('[Player] play() promise resolved');
					}).catch(err => {
						if (err.name === 'AbortError') {
							console.log('[Player] play() aborted (source transition) - expected');
						} else {
							console.error('[Player] play() promise rejected:', err);
						}
					});
				}
			}
		};

		setSourceAndPlay();

		return () => {
			if (playbackStartTimeoutRef.current) {
				clearTimeout(playbackStartTimeoutRef.current);
				playbackStartTimeoutRef.current = null;
			}
			destroyHlsPlayer();
		};
	}, [mediaUrl, isLoading, mimeType, playMethod, error]);

	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (controlsTimeoutRef.current) {
			clearTimeout(controlsTimeoutRef.current);
		}
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

	// Handle playback health issues - if the health monitor detects stalled
	// playback (no progress for extended period), fall back to transcoding.
	const handleUnhealthy = useCallback(async () => {
		if (Date.now() - lastSeekTimeRef.current < 15000 || videoRef.current?.paused) {
			if (healthMonitorRef.current) healthMonitorRef.current.reset();
			return;
		}
		console.log('[Player] Playback unhealthy, falling back to transcode');
		if (!hasTriedTranscode && playMethod !== 'Transcode') {
			const video = videoRef.current;
			if (video) {
				console.warn('[Player] Health monitor triggering transcode fallback');
				video.dispatchEvent(new Event('error'));
			}
		}
	}, [hasTriedTranscode, playMethod]);

	const onPlayNextWithCleanup = useCallback(async (episode) => {
		const session = playback.getCurrentSession();
		const trackOptions = session ? {
			audioStreamIndex: session.audioStreamIndex,
			subtitleStreamIndex: session.subtitleStreamIndex
		} : null;
		await playback.reportStop(positionRef.current);
		onPlayNext(episode, trackOptions);
	}, [onPlayNext]);

	const onSeekToIntroEnd = useCallback(() => {
		if (mediaSegments?.introEnd && videoRef.current) {
			seekToTicks(mediaSegments.introEnd);
		}
	}, [mediaSegments, seekToTicks]);

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
		if (repeatMode === 'one') {
			const video = videoRef.current;
			if (video) { video.currentTime = 0; video.play(); }
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
		const video = videoRef.current;
		if (video && video.currentTime > 3) {
			video.currentTime = 0;
			return;
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

	const handleLoadedMetadata = useCallback(() => {
		if (videoRef.current) {
			if (playMethod !== 'Transcode') {
				setDuration(videoRef.current.duration);
			}
			const p = videoRef.current.play();
			if (p && typeof p.catch === 'function') {
				p.catch(err => {
					console.error('[Player] Failed to start playback:', err);
				});
			}
		}

		const pendingInitialAssSub = pendingInitialAssSubtitleRef.current;
		if (pendingInitialAssSub && supportsAssRenderer()) {
			pendingInitialAssSubtitleRef.current = null;
			initAssRendererForStream(pendingInitialAssSub).catch((err) => {
				console.error('[Player] Deferred ASS init failed', err);
			});
		}
	}, [playMethod, initAssRendererForStream]);

	const handlePlay = useCallback(() => {
		setIsPaused(false);
		if (!hasReportedStartRef.current) {
			hasReportedStartRef.current = true;
			playback.reportStart(positionRef.current);
			playback.startProgressReporting(
				() => positionRef.current,
				10000,
				() => ({ isPaused: videoRef.current?.paused || false })
			);
			playback.startHealthMonitoring(handleUnhealthy);
			healthMonitorRef.current = playback.getHealthMonitor();
		} else {
			playback.reportProgress(positionRef.current, { isPaused: false, eventName: 'unpause' });
		}
	}, [handleUnhealthy]);

	const handlePause = useCallback(() => {
		setIsPaused(true);
		playback.reportProgress(positionRef.current, { isPaused: true, eventName: 'pause' });
	}, []);

	const handleTimeUpdate = useCallback(() => {
		if (videoRef.current) {
			const rawTime = videoRef.current.currentTime;

			if (playMethod === 'Transcode' && !transcodeOffsetDetectedRef.current && transcodeOffsetTicksRef.current > 0) {
				if (rawTime > 1) {
					transcodeOffsetDetectedRef.current = true;
					console.log('[Player] Transcode seek offset: applying', transcodeOffsetTicksRef.current / 10000000, 's (raw:', rawTime, 's)');

					const pendingTicks = lastSeekTargetRef.current;
					sourceTransitionRef.current = false;
					seekingTranscodeRef.current = false;

					if (pendingTicks !== null && pendingTicks !== transcodeOffsetTicksRef.current) {
						console.log('[Player] seekInTranscode: target changed during load, re-seeking to', pendingTicks / 10000000, 's');
						setTimeout(() => seekInTranscode(pendingTicks), 100);
					}
				} else {
					positionRef.current = transcodeOffsetTicksRef.current;
					setCurrentTime(transcodeOffsetTicksRef.current / 10000000);
					return;
				}
			}

			const time = rawTime + transcodeOffsetTicksRef.current / 10000000;
			setCurrentTime(time);
			const ticks = Math.floor(time * 10000000);
			positionRef.current = ticks;

			if (healthMonitorRef.current) {
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
			}

			checkSegments(ticks);
		}
	}, [playMethod, checkSegments, subtitleTrackEvents, subtitleOffset, seekInTranscode]);

	const handleWaiting = useCallback(() => {
		setIsBuffering(true);
		if (healthMonitorRef.current && (Date.now() - lastSeekTimeRef.current > 15000)) {
			healthMonitorRef.current.recordBuffer();
		}
	}, []);

	const handlePlaying = useCallback(() => {
		setIsBuffering(false);
		if (!seekDebounceTimerRef.current && !seekingTranscodeRef.current) {
			lastSeekTargetRef.current = null;
		}
	}, []);

	const handleEnded = useCallback(async () => {
		if (sourceTransitionRef.current) {
			console.log('[Player] Ignoring ended event during source transition (seek)');
			return;
		}

		await playback.reportStop(positionRef.current);

		if (repeatMode === 'one' && videoRef.current) {
			videoRef.current.currentTime = 0;
			videoRef.current.play();
			return;
		}

		isCleaningUpRef.current = true;
		destroyHlsPlayer();
		await cleanupVideoElement(videoRef.current);

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
	}, [onEnded, onPlayNext, nextEpisode, hasNextTrack, audioPlaylist, audioPlaylistIndex, shuffleMode, repeatMode]);

	const handleError = useCallback(async () => {
		// Ignore errors fired during cleanup (SDR reset video triggers error code 4)
		if (isCleaningUpRef.current) {
			console.log('[Player] Ignoring error during cleanup');
			return;
		}

		if (sourceTransitionRef.current) {
			console.log('[Player] Ignoring error during source transition (seek)');
			return;
		}

		if (isHandlingErrorRef.current) {
			console.log('[Player] Ignoring re-entrant error (cleanup in progress)');
			return;
		}
		isHandlingErrorRef.current = true;

		const video = videoRef.current;
		let errorMessage = $L('Playback failed.');

		try {
		if (video?.error) {
			switch (video.error.code) {
				case 1:
					errorMessage = $L('Playback was aborted.');
					break;
				case 2:
					errorMessage = $L('A network error occurred. Check your connection.');
					break;
				case 3:
					errorMessage = $L('The video format is not supported by this TV.');
					break;
				case 4:
					errorMessage = $L('The video source is not supported.');
					break;
				default:
					errorMessage = $L('An unknown playback error occurred.');
			}
			console.error('[Player] Playback error:', video.error.code, video.error.message);
			console.error('[Player] Error details:', {
				code: video.error.code,
				message: video.error.message,
				currentSrc: video.currentSrc,
				readyState: video.readyState,
				networkState: video.networkState,
				playMethod: playMethod
			});
		} else {
			console.error('[Player] Playback error (no error object)');
		}

		const session = playback.getCurrentSession();
		const hasVideoStream = !!session?.mediaSource?.MediaStreams?.some((s) => s.Type === 'Video');
		const isAudioOnlySession = !!session?.mediaSource && !hasVideoStream;
		if (isAudioOnlySession) {
			errorMessage = 'Audio playback failed for this track on this device.';
			destroyHlsPlayer();
			await cleanupVideoElement(videoRef.current);
			setError(errorMessage);
			return;
		}

		if (!hasTriedTranscode && playMethod !== playback.PlayMethod.Transcode) {
			// Tier 1 → DirectPlay failed, try native HEVC transcode (Starfish)
			console.log('[Player] DirectPlay failed, falling back to transcode...');
			setHasTriedTranscode(true);

			pendingResumeTicksRef.current = 0;

			destroyHlsPlayer();
			await cleanupVideoElement(videoRef.current);

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
					console.log('[Player] Switching to transcode on same element...');
					setMediaUrl(result.url);
					setPlayMethod(result.playMethod);
					setMimeType(result.mimeType || 'video/mp4');
					playSessionRef.current = result.playSessionId;
					return;
				}
			} catch (fallbackErr) {
				console.error('[Player] Transcode fallback failed:', fallbackErr);
				errorMessage = $L('Transcoding failed. The server may not support this format.');
			}
		} else if (playMethod === 'Transcode' && (!forceHlsJsRef.current || transcodeRetryCountRef.current < 1) && Hls.isSupported()) {
			// Tier 2: native HEVC transcode failed → switch to hls.js H.264+AAC
			// Tier 3: hls.js H.264 retry (one attempt)
			const isTier2 = !forceHlsJsRef.current;
			if (!isTier2) transcodeRetryCountRef.current++;
			console.log('[Player]', isTier2 ? 'Native transcode failed - switching to hls.js H.264' : 'hls.js H.264 failed, retrying...');

			try {
				await playback.reportStop(positionRef.current);
				destroyHlsPlayer();
				await cleanupVideoElement(videoRef.current);

				const h264Profile = await getH264FallbackProfile();
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: positionRef.current,
					maxBitrate: selectedQuality || settings.maxBitrate,
					enableDirectPlay: false,
					enableDirectStream: false,
					enableTranscoding: true,
					deviceProfile: h264Profile,
					mediaSourceId: mediaSourceId,
					item: item,
					stereoUpmixEnabled: settings.stereoUpmixEnabled
				});

				if (result.url) {
					if (isTier2) forceHlsJsRef.current = true;
					console.log('[Player] H.264 fallback URL:', result.url.substring(0, 200));
					setMediaUrl(result.url);
					setPlayMethod(result.playMethod);
					setMimeType(result.mimeType || 'application/x-mpegURL');
					playSessionRef.current = result.playSessionId;
					return;
				}
			} catch (fallbackErr) {
				console.error('[Player] H.264 fallback failed:', fallbackErr);
				errorMessage = isTier2 ? $L('H.264 transcoding fallback failed.') : $L('Transcoding failed after retry. Try restarting the app.');
			}
		}

		destroyHlsPlayer();
		await cleanupVideoElement(videoRef.current);
		setError(errorMessage);
		} finally {
			isHandlingErrorRef.current = false;
		}
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, settings.stereoUpmixEnabled, mediaSourceId]);

	useEffect(() => {
		handlersRef.current = {
			onLoadedMetadata: handleLoadedMetadata,
			onPlay: handlePlay,
			onPause: handlePause,
			onTimeUpdate: handleTimeUpdate,
			onWaiting: handleWaiting,
			onPlaying: handlePlaying,
			onEnded: handleEnded,
			onError: handleError,
		};
	}, [handleLoadedMetadata, handlePlay, handlePause, handleTimeUpdate, handleWaiting, handlePlaying, handleEnded, handleError]);

	const handleImageError = useCallback((e) => {
		e.target.style.display = 'none';
	}, []);

	const handleBack = useCallback(async () => {
		cancelNextEpisodeCountdown();
		const currentPos = videoRef.current
			? Math.floor(videoRef.current.currentTime * 10000000) + transcodeOffsetTicksRef.current
			: positionRef.current;
		await playback.reportStop(currentPos);

		isCleaningUpRef.current = true;
		destroyHlsPlayer();
		await cleanupVideoElement(videoRef.current);

		onBack?.();
	}, [onBack, cancelNextEpisodeCountdown]);

	const handlePlayPause = useCallback(() => {
		if (videoRef.current) {
			if (isInGroup && !syncPlayCommandRef.current) {
				if (isPaused) {
					syncPlayService.sendPlayRequest();
				} else {
					syncPlayService.sendPauseRequest();
				}
				return;
			}
			if (isPaused) {
				const rewind = settings.unpauseRewind || 0;
				if (rewind > 0) {
					const newTime = Math.max(0, videoRef.current.currentTime - rewind);
					videoRef.current.currentTime = newTime;
				}
				videoRef.current.play();
			} else {
				videoRef.current.pause();
			}
		}
	}, [isPaused, settings.unpauseRewind, isInGroup]);

	const handleRewind = useCallback(() => {
		if (videoRef.current) {
			if (isInGroup && !syncPlayCommandRef.current) {
				const newTicks = Math.max(0, positionRef.current - settings.seekStep * 10000000);
				syncPlayService.sendSeekRequest(newTicks);
				return;
			}
			seekByOffset(-settings.seekStep);
		}
	}, [settings.seekStep, seekByOffset, isInGroup]);

	const handleForward = useCallback(() => {
		if (videoRef.current) {
			if (isInGroup && !syncPlayCommandRef.current) {
				const newTicks = Math.min(runTimeRef.current, positionRef.current + settings.seekStep * 10000000);
				syncPlayService.sendSeekRequest(newTicks);
				return;
			}
			seekByOffset(settings.skipForwardLength || settings.seekStep);
		}
	}, [settings.skipForwardLength, settings.seekStep, seekByOffset, isInGroup]);

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

	const handleSubtitleKeyDown = useCallback((e) => {
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

	const handleOpenSubtitleOffset = useCallback(() => {
		openModal('subtitleOffset');
	}, [openModal]);

	const handleOpenSubtitleSettings = useCallback(() => {
		openModal('subtitleSettings');
	}, [openModal]);

	const applySubtitleSelection = useCallback(async (index, streamList = subtitleStreams, shouldClose = true) => {
		playback.updateCurrentSession({subtitleStreamIndex: index});

		disposePgsRenderer(pgsRendererRef.current);
		pgsRendererRef.current = null;
		disposeAssRenderer(assRendererRef.current);
		assRendererRef.current = null;
		pendingInitialAssSubtitleRef.current = null;

		if (index === -1) {
			setSelectedSubtitleIndex(-1);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
		} else {
			setSelectedSubtitleIndex(index);
			const stream = streamList.find(s => s.index === index);

			if (stream && stream.isAss && supportsAssRenderer()) {
				await initAssRendererForStream(stream);
			} else if (stream && stream.isTextBased) {
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
				if (videoRef.current) {
					try {
						const renderer = await initPgsRenderer(videoRef.current, stream, {
							opacity: settings.subtitleOpacity,
							scale: 1.0
						});
						if (renderer) {
							pgsRendererRef.current = renderer;
							setSubtitleTrackEvents(null);
						} else {
							setSubtitleTrackEvents(null);
						}
					} catch (err) {
						setSubtitleTrackEvents(null);
					}
				}
			} else {
				setSubtitleTrackEvents(null);
			}
			setCurrentSubtitleText(null);
		}

		if (shouldClose) {
			closeModal();
		}
	}, [subtitleStreams, closeModal, settings.enablePgsRendering, settings.subtitleOpacity, initAssRendererForStream]);

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
			const startTicks = Math.floor((videoRef.current?.currentTime || 0) * 10000000);
			const info = await jellyfinApi.getPlaybackInfo(item.Id, {
				StartTimeTicks: startTicks,
				MediaSourceId: mediaSourceId,
				AudioStreamIndex: selectedAudioIndex,
				SubtitleStreamIndex: selectedSubtitleIndex,
				MaxStreamingBitrate: selectedQuality || settings.maxBitrate
			});

			const mediaSource = info?.MediaSources?.find((source) => source.Id === mediaSourceId) || info?.MediaSources?.[0];
			const refreshedSubtitleStreams = mapSubtitleStreamsFromMediaSource(mediaSource, getServerUrl());
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

	// Track selection - using data attributes to avoid arrow functions in JSX
	const handleSelectAudio = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		setSelectedAudioIndex(index);
		closeModal();

		setHasTriedTranscode(false);
		forceHlsJsRef.current = false;
		transcodeRetryCountRef.current = 0;

		try {
			if (playMethod !== playback.PlayMethod.Transcode && videoRef.current?.audioTracks?.length > 1) {
				const audioTrackList = videoRef.current.audioTracks;
				const matchIndex = matchAudioTrack(audioTrackList, audioStreams, index);

				if (matchIndex >= 0) {
					for (let i = 0; i < audioTrackList.length; i++) {
						audioTrackList[i].enabled = (i === matchIndex);
					}
					playback.updateCurrentSession({audioStreamIndex: index});
					console.log('[Player] Switched audio natively via audioTracks API, matchIndex:', matchIndex);
					return;
				}
			}

			const currentPositionTicks = videoRef.current
				? Math.floor(videoRef.current.currentTime * 10000000)
				: positionRef.current || 0;

			const result = await playback.changeAudioStream(index, currentPositionTicks);
			if (result) {
				positionRef.current = currentPositionTicks;

				// Preserve playback position when reloading for audio switch
				if (result.playMethod !== playback.PlayMethod.Transcode && currentPositionTicks > 0) {
					pendingResumeTicksRef.current = currentPositionTicks;
				}
				if (result.playMethod === playback.PlayMethod.Transcode) {
					transcodeOffsetTicksRef.current = currentPositionTicks;
					transcodeOffsetDetectedRef.current = false;
				}

				let newUrl = result.url;
				if (result.playMethod === playback.PlayMethod.DirectPlay) {
					const separator = newUrl.includes('?') ? '&' : '?';
					newUrl = `${newUrl}${separator}_audioSwitch=${Date.now()}`;
					// Try native audio track switch after reload as safety net
					pendingAudioRef.current = {
						streamIndex: index,
						audioStreams: result.audioStreams || audioStreams
					};
				}
				setMediaUrl(newUrl);
				if (result.playMethod) setPlayMethod(result.playMethod);
				setMimeType(result.mimeType || 'video/mp4');
				if (result.audioStreams) setAudioStreams(result.audioStreams);
				if (result.subtitleStreams) setSubtitleStreams(result.subtitleStreams);
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, audioStreams]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		await applySubtitleSelection(index, subtitleStreams, true);
	}, [applySubtitleSelection, subtitleStreams]);

	const handleSelectSpeed = useCallback((e) => {
		const rate = parseFloat(e.currentTarget.dataset.rate);
		if (isNaN(rate)) return;
		setPlaybackRate(rate);
		if (videoRef.current) {
			videoRef.current.playbackRate = rate;
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
		if (isNaN(ticks) || ticks < 0) return;
		seekToTicks(ticks);
		closeModal();
	}, [closeModal, seekToTicks]);

	const handleProgressClick = useCallback((e) => {
		if (!videoRef.current) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		const newTime = percent * duration;
		const newTicks = Math.floor(newTime * 10000000);
		seekToTicks(newTicks);
	}, [duration, seekToTicks]);

	const handleProgressKeyDown = useCallback((e) => {
		if (!videoRef.current) return;
		const step = settings.seekStep;
		showControls();

		if (e.key === 'ArrowLeft' || e.keyCode === 37) {
			e.preventDefault();
			setIsSeeking(true);
			seekByOffset(-step, true);
		} else if (e.key === 'ArrowRight' || e.keyCode === 39) {
			e.preventDefault();
			setIsSeeking(true);
			seekByOffset(step, true);
		} else if (e.key === 'ArrowUp' || e.keyCode === 38) {
			e.preventDefault();
			setFocusRow('top');
			setIsSeeking(false);
			window.requestAnimationFrame(() => Spotlight.focus(isAudioMode ? 'favorite-btn' : 'play-pause-btn'));
		} else if (e.key === 'ArrowDown' || e.keyCode === 40) {
			e.preventDefault();
			setFocusRow('bottom');
			setIsSeeking(false);
			if (isAudioMode) {
				window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
			}
		}
	}, [settings.seekStep, seekByOffset, showControls, isAudioMode]);

	const handleProgressBlur = useCallback(() => {
		setIsSeeking(false);
	}, []);

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

	useEffect(() => {
		if (!lastCommand || !videoRef.current) return;
		if (lastCommand === lastProcessedCommandRef.current) return;
		lastProcessedCommandRef.current = lastCommand;

		const {Command, PositionTicks, When} = lastCommand;

		syncPlayCommandRef.current = true;

		switch (Command) {
			case 'Unpause': {
				const delay = syncPlayService.getDelayToWhen(When);
				if (PositionTicks != null) seekToTicks(PositionTicks);
				if (delay > 0) {
					const t = setTimeout(() => {
						videoRef.current?.play()?.catch?.(() => {});
						syncPlayCommandRef.current = false;
					}, delay);
					return () => clearTimeout(t);
				}
				videoRef.current.play()?.catch?.(() => {});
				break;
			}
			case 'Pause': {
				videoRef.current.pause();
				if (PositionTicks != null) seekToTicks(PositionTicks);
				break;
			}
			case 'Seek': {
				if (PositionTicks != null) seekToTicks(PositionTicks);
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
	}, [lastCommand, seekToTicks, handleBack]);

	useEffect(() => {
		if (!isInGroup || !videoRef.current) return;

		const reportBuffering = () => {
			syncPlayService.sendBufferingRequest(
				!videoRef.current.paused,
				positionRef.current
			);
		};

		const reportReady = () => {
			syncPlayService.sendReadyRequest(
				!videoRef.current.paused,
				positionRef.current
			);
		};

		const video = videoRef.current;
		video.addEventListener('waiting', reportBuffering);
		video.addEventListener('playing', reportReady);
		video.addEventListener('canplay', reportReady);

		return () => {
			video.removeEventListener('waiting', reportBuffering);
			video.removeEventListener('playing', reportReady);
			video.removeEventListener('canplay', reportReady);
		};
	}, [isInGroup]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.key || e.keyCode;

			if (handlePopupKeyDown(e)) return;

			// Media playback keys (webOS remote)
			// Play: 415, Pause: 19, Fast-forward: 417, Rewind: 412, Stop: 413
			if (e.keyCode === 415) {
				e.preventDefault();
				e.stopPropagation();
				if (videoRef.current && videoRef.current.paused) {
					videoRef.current.play();
				}
				return;
			}
			if (e.keyCode === 19) {
				e.preventDefault();
				e.stopPropagation();
				if (videoRef.current && !videoRef.current.paused) {
					videoRef.current.pause();
				}
				return;
			}
			if (e.keyCode === 417) {
				e.preventDefault();
				e.stopPropagation();
				if (!isLiveTV) handleForward();
				showControls();
				return;
			}
			if (e.keyCode === 412) {
				e.preventDefault();
				e.stopPropagation();
				if (!isLiveTV) handleRewind();
				showControls();
				return;
			}
			if (e.keyCode === 413) {
				e.preventDefault();
				e.stopPropagation();
				handleBack();
				return;
			}

			if (key === 'GoBack' || key === 'Backspace' || e.keyCode === 461 || e.keyCode === 8 || e.keyCode === 27) {
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
					setSeekPosition(Math.floor(currentTime * 10000000));
					const step = settings.seekStep;
					if (key === 'ArrowLeft' || e.keyCode === 37) {
						seekByOffset(-step, true);
					} else {
						seekByOffset(step, true);
					}
					return;
				}
				e.preventDefault();
				showControls();
				return;
			}

			// Up/Down arrow navigation between rows when controls are visible
			if (controlsVisible && !activeModal) {
				if (key === 'ArrowUp' || e.keyCode === 38) {
					e.preventDefault();
					showControls();
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
					showControls();
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
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, settings.seekStep, seekByOffset, handlePopupKeyDown, bottomButtons.length, isAudioMode, showSkipIntro, showSkipCredits, showNextEpisode, isLiveTV]);

	const displayTime = isSeeking ? (seekPosition / 10000000) : currentTime;
	const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

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

	return (
		<div className={css.container} onClick={!isLoading && !error ? showControls : undefined}>
			<div
				ref={containerRef}
				className={css.videoPlayer}
				style={isLoading || isAudioMode ? {opacity: 0, pointerEvents: 'none'} : undefined}
			/>

			{isLoading && (
				<div className={css.loadingIndicator}>
					<div className={css.spinner} />
					<p>{$L('Loading...')}</p>
				</div>
			)}

			{error && (
				<div className={css.error}>
					<h2>{$L('Playback Error')}</h2>
					<p>{error}</p>
					<Button onClick={onBack}>{$L('Go Back')}</Button>
				</div>
			)}

			{/* Audio Mode: Album Art + Info + Lyrics */}
			{!isLoading && !error && isAudioMode && (
				<div className={css.audioModeBackground}>
					<div className={lyricsLines.length > 0 ? css.audioContentWithLyrics : css.audioModeContent}>
						<div className={css.audioLeftPanel}>
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
							</div>
						</div>
						{lyricsLines.length > 0 && (
							<div className={css.audioLyricsPanel} ref={lyricsScrollRef}>
								{lyricsLines.map((line, index) => (
									<p
										key={`${index}-${line.startSeconds ?? 'none'}`}
										className={index === activeLyricIndex ? css.lyricLineActive : css.lyricLineInactive}
										data-lyric-index={index}
									>
										{line.text}
									</p>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Custom Subtitle Overlay - webOS doesn't support native <track> elements */}
			{!isLoading && !error && currentSubtitleText && !isAudioMode && (
				<div
					className={css.subtitleOverlay}
					style={getSubtitleOverlayStyle(settings)}
				>
					<div
						className={css.subtitleText}
						style={getSubtitleTextStyle(settings)}
						// eslint-disable-next-line react/no-danger
						dangerouslySetInnerHTML={{__html: sanitizeSubtitleHtml(currentSubtitleText)}}
					/>
				</div>
			)}

			{/* Video Dimmer - not needed for audio */}
			{!isLoading && !error && !isAudioMode && <div className={`${css.videoDimmer} ${controlsVisible ? css.visible : ''}`} />}

			{/* Buffering Indicator */}
			{!isLoading && isBuffering && (
				<div className={css.bufferingIndicator}>
					<div className={css.spinner} />
				</div>
			)}

			{!isLoading && !error && isPaused && settings.showDescriptionOnPause && item?.Overview && !isAudioMode && !activeModal && !controlsVisible && (
				<div className={css.pauseDescriptionOverlay}>
					<div className={css.pauseDescriptionText}>{item.Overview}</div>
				</div>
			)}

			{/* Playback Speed Indicator */}
			{!isLoading && !error && playbackRate !== 1 && (
				<div className={css.playbackIndicators}>
					<div className={css.speedIndicator}>{playbackRate}x</div>
				</div>
			)}

			{/* Next Episode Overlay */}
			{!isLoading && !error && (showSkipCredits || showNextEpisode) && nextEpisode && !isAudioMode && !activeModal && !controlsVisible && (
				<NextEpisodeContainer className={css.nextEpisodeOverlay} spotlightRestrict="self-only">
					{settings.nextUpBehavior !== 'minimal' ? (
					<div className={css.nextEpisodeCard}>
						<div className={css.nextThumbnail}>
							<img
								src={getImageUrl(getServerUrl(), nextEpisode.Id, 'Primary', {maxWidth: 400, quality: 80})}
								alt={nextEpisode.Name}
								className={css.nextThumbnailImg}
								onError={handleImageError}
							/>
							<div className={css.nextThumbnailGradient} />
						</div>
						<div className={css.nextInfo}>
							<div className={css.nextLabel}>{$L('UP NEXT')}</div>
							<div className={css.nextTitle}>{nextEpisode.Name}</div>
							{nextEpisode.SeriesName && (
								<div className={css.nextMeta}>
									S{nextEpisode.ParentIndexNumber} E{nextEpisode.IndexNumber} &middot; {nextEpisode.SeriesName}
								</div>
							)}
							<div className={css.nextActions}>
								<SpottableButton
									className={css.nextPlayBtn}
									onClick={handlePlayNextEpisode}
									data-spot-default="true"
								>
									&#9654; {$L('Play Now')}
								</SpottableButton>
								<SpottableButton
									className={css.nextCancelBtn}
									onClick={cancelNextEpisodeCountdown}
								>
									{$L('Hide')}
								</SpottableButton>
							</div>
						</div>
					</div>
					) : (
					<div className={css.nextEpisodeMinimal}>
						<div className={css.nextLabel}>{$L('UP NEXT')}</div>
						<div className={css.nextTitle}>{nextEpisode.Name}</div>
						{nextEpisodeCountdown !== null && (
							<div className={css.nextCountdownText}>{$L('Starting in {countdown}s').replace('{countdown}', nextEpisodeCountdown)}</div>
						)}
						<div className={css.nextActions}>
							<SpottableButton className={css.nextPlayBtn} onClick={handlePlayNextEpisode} data-spot-default="true">
								&#9654; {$L('Play Now')}
							</SpottableButton>
							<SpottableButton className={css.nextCancelBtn} onClick={cancelNextEpisodeCountdown}>
								{$L('Hide')}
							</SpottableButton>
						</div>
					</div>
					)}
					{nextEpisodeCountdown !== null && settings.nextUpBehavior !== 'minimal' && (
						<div className={css.nextProgressBar}>
							<div
								className={css.nextProgressFill}
								style={{'--countdown-duration': `${settings.nextUpTimeout ?? 7}s`}}
							/>
						</div>
					)}
				</NextEpisodeContainer>
			)}

			{!isLoading && !error && <PlayerControls
				css={css}
				controlsVisible={controlsVisible}
				activeModal={activeModal}
				isAudioMode={isAudioMode}
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
				handleSubtitleKeyDown={handleSubtitleKeyDown}
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
				renderInfoPlaybackRows={({css: c, mediaSource, playMethod: pm}) => {
					const getTranscodeReason = () => {
						if (pm !== 'Transcode') return null;
						const url = mediaSource?.TranscodingUrl || '';
						if (url.includes('TranscodeReasons=')) {
							const match = url.match(/TranscodeReasons=([^&]+)/);
							if (match) {
								return decodeURIComponent(match[1]).split(',')
									.map(r => r.replace(/([A-Z])/g, ' $1').trim())
									.join(', ');
							}
						}
						return $L('Unknown');
					};
					return pm === 'Transcode' ? (
						<div className={`${c.infoRow} ${c.infoWarning}`}>
							<span className={c.infoLabel}>{$L('Transcode Reason')}</span>
							<span className={c.infoValue}>{getTranscodeReason()}</span>
						</div>
					) : null;
				}}
				// eslint-disable-next-line react/jsx-no-bind
				renderInfoVideoExtra={({css: c, videoStream}) => (
					videoStream?.BitDepth ? (
						<div className={c.infoRow}>
							<span className={c.infoLabel}>{$L('Bit Depth')}</span>
							<span className={c.infoValue}>{videoStream.BitDepth}-bit</span>
						</div>
					) : null
				)}
			/>}
		</div>
	);
};

export default Player;
