import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import Hls from 'hls.js';
import * as playback from '../../services/playback';
import {getImageUrl} from '../../utils/helpers';
import {getServerUrl} from '../../services/jellyfinApi';
import {detectWebOSVersion, getH264FallbackProfile} from '@moonfin/platform-webos/deviceProfile';
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
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml} from '../../utils/subtitleConstants';
import PlayerControls, {usePlayerButtons} from './PlayerControls';
import useSegmentPopups from './useSegmentPopups';
import {
	SpottableButton, NextEpisodeContainer, CONTROLS_HIDE_DELAY
} from './PlayerConstants';

import css from './WebOSPlayer.module.less';

const Player = ({item, resume, initialMediaSourceId, initialAudioIndex, initialSubtitleIndex, onEnded, onBack, onPlayNext, audioPlaylist}) => {
	const {settings} = useSettings();

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
	const [mediaSegments, setMediaSegments] = useState(null);
	const [nextEpisode, setNextEpisode] = useState(null);
	const [isSeeking, setIsSeeking] = useState(false);
	const [seekPosition, setSeekPosition] = useState(0);
	const [mediaSourceId, setMediaSourceId] = useState(null);
	const [hasTriedTranscode, setHasTriedTranscode] = useState(false);
	const [focusRow, setFocusRow] = useState('top');
	const [isAudioMode, setIsAudioMode] = useState(false);
	const audioPlaylistIndex = useMemo(() => {
		if (!audioPlaylist || !item) return -1;
		return audioPlaylist.findIndex(t => t.Id === item.Id);
	}, [audioPlaylist, item]);
	const hasNextTrack = audioPlaylist && audioPlaylistIndex >= 0 && audioPlaylistIndex < audioPlaylist.length - 1;
	const hasPrevTrack = audioPlaylist && audioPlaylistIndex > 0;



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
	const prevItemIdRef = useRef(null);
	const hlsPlayerRef = useRef(null);
	const pendingAudioRef = useRef(null);
	const transcodeOffsetTicksRef = useRef(0);
	const transcodeOffsetDetectedRef = useRef(true);
	const playbackStartTimeoutRef = useRef(null);
	const pendingResumeTicksRef = useRef(0);
	const hasReportedStartRef = useRef(false);

	const destroyHlsPlayer = () => {
		if (hlsPlayerRef.current) {
			hlsPlayerRef.current.destroy();
			hlsPlayerRef.current = null;
		}
	};

	const {topButtons, bottomButtons} = usePlayerButtons({
		isPaused, audioStreams, subtitleStreams, chapters,
		nextEpisode, isAudioMode, hasNextTrack, hasPrevTrack
	});

	useEffect(() => {
		const init = async () => {
			await initLunaAPI();
			await keepScreenOn(true);

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
				videoRef.current.play().catch(err => {
					console.warn('[Player] Failed to resume playback:', err);
				});
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

		return () => {
			for (const [event, handler] of Object.entries(listeners)) {
				video.removeEventListener(event, handler);
			}
			if (containerRef.current && containerRef.current.contains(video)) {
				containerRef.current.removeChild(video);
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

			resetPopups();
			setNextEpisode(null);

			await waitForDecoderRelease();

			try {
				const savedPosition = item.UserData?.PlaybackPositionTicks || 0;
				const startPosition = resume !== false ? savedPosition : 0;
				console.log('[Player] Start position:', {
					resume,
					savedPosition,
					startPosition,
					hasUserData: !!item.UserData
				});
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: startPosition,
					maxBitrate: selectedQuality || settings.maxBitrate,
					enableDirectPlay: !settings.preferTranscode,
					enableDirectStream: !settings.preferTranscode,
					forceDirectPlay: settings.forceDirectPlay,
					mediaSourceId: initialMediaSourceId,
					audioStreamIndex: initialAudioIndex,
					subtitleStreamIndex: initialSubtitleIndex,
					item: item
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
				if (result.playMethod !== 'Transcode' && startPosition > 0) {
					pendingResumeTicksRef.current = startPosition;
					console.log('[Player] Pending resume seek:', startPosition, 'ticks (' + (startPosition / 10000000) + 's)');
				} else {
					pendingResumeTicksRef.current = 0;
				}

				if (result.playMethod === 'Transcode' && startPosition > 0) {
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

				console.log('[Player] === SUBTITLE SELECTION START ===');
				console.log('[Player] initialSubtitleIndex:', initialSubtitleIndex);
				console.log('[Player] subtitleMode:', settings.subtitleMode);
				console.log('[Player] availableSubtitles:', result.subtitleStreams?.length || 0);
				if (result.subtitleStreams) {
					result.subtitleStreams.forEach((s, i) => {
						console.log('[Player] Subtitle ' + i + ': index=' + s.index + ' codec=' + s.codec + ' lang=' + s.language + ' default=' + s.isDefault + ' forced=' + s.isForced + ' text=' + s.isTextBased);
					});
				}

				// Helper to load subtitle data
				const loadSubtitleData = async (sub) => {
					console.log('[Player] loadSubtitleData called for:', sub?.index, 'isTextBased:', sub?.isTextBased);
					if (sub && sub.isTextBased) {
						try {
							console.log('[Player] Fetching subtitle JSON data...');
							const data = await playback.fetchSubtitleData(sub);
							console.log('[Player] fetchSubtitleData returned:', data ? 'data' : 'null', 'events:', data?.TrackEvents?.length);
							if (data && data.TrackEvents) {
								setSubtitleTrackEvents(data.TrackEvents);
								console.log('[Player] Set subtitleTrackEvents with', data.TrackEvents.length, 'events');
							} else {
								console.log('[Player] No TrackEvents in response');
								setSubtitleTrackEvents(null);
							}
						} catch (err) {
							console.error('[Player] Error fetching subtitle data:', err);
							setSubtitleTrackEvents(null);
						}
					} else {
						console.log('[Player] Not loading subs - sub:', !!sub, 'isTextBased:', sub?.isTextBased);
						setSubtitleTrackEvents(null);
					}
					setCurrentSubtitleText(null);
				};

				if (initialSubtitleIndex !== undefined && initialSubtitleIndex !== null) {
					console.log('[Player] Using initialSubtitleIndex path');
					if (initialSubtitleIndex >= 0) {
						const selectedSub = result.subtitleStreams?.find(s => s.index === initialSubtitleIndex);
						if (selectedSub) {
							console.log('[Player] Using initial subtitle index:', initialSubtitleIndex);
							setSelectedSubtitleIndex(initialSubtitleIndex);
							await loadSubtitleData(selectedSub);
						}
					} else {
						// -1 means subtitles off
						console.log('[Player] initialSubtitleIndex is -1, subtitles off');
						setSelectedSubtitleIndex(-1);
						setSubtitleTrackEvents(null);
					}
				} else if (settings.subtitleMode === 'always') {
					console.log('[Player] Using subtitleMode=always path');
					const defaultSub = result.subtitleStreams?.find(s => s.isDefault);
					if (defaultSub) {
						console.log('[Player] Using default subtitle (always mode):', defaultSub.index);
						setSelectedSubtitleIndex(defaultSub.index);
						await loadSubtitleData(defaultSub);
					} else if (result.subtitleStreams?.length > 0) {
						// No default marked, use first available
						const firstSub = result.subtitleStreams[0];
						console.log('[Player] No default subtitle, using first:', firstSub.index);
						setSelectedSubtitleIndex(firstSub.index);
						await loadSubtitleData(firstSub);
					} else {
						console.log('[Player] subtitleMode=always but no subtitles available');
					}
				} else if (settings.subtitleMode === 'forced') {
					console.log('[Player] Using subtitleMode=forced path');
					const forcedSub = result.subtitleStreams?.find(s => s.isForced);
					if (forcedSub) {
						console.log('[Player] Using forced subtitle:', forcedSub.index);
						setSelectedSubtitleIndex(forcedSub.index);
						await loadSubtitleData(forcedSub);
					} else {
						console.log('[Player] No forced subtitle found');
					}
				} else {
					console.log('[Player] No subtitle auto-selected - subtitleMode is:', settings.subtitleMode);
				}
				console.log('[Player] === SUBTITLE SELECTION END ===');

				let displayTitle = item.Name;
				let displaySubtitle = '';
				if (item.SeriesName) {
					displayTitle = item.SeriesName;
					displaySubtitle = `S${item.ParentIndexNumber}E${item.IndexNumber} - ${item.Name}`;
				} else if (result.isAudio) {
					displayTitle = item.Name;
					displaySubtitle = item.AlbumArtist || item.Artists?.[0] || item.Album || '';
				}
				setTitle(displayTitle);
				setSubtitle(displaySubtitle);
				setIsAudioMode(!!result.isAudio);

				// Audio mode: always show controls, skip video-only features
				if (result.isAudio) {
					setControlsVisible(true);
				} else {
					if (settings.skipIntro) {
						const segments = await playback.getMediaSegments(item.Id);
						setMediaSegments(segments);
					}

					if (item.Type === 'Episode') {
						const next = await playback.getNextEpisode(item);
						setNextEpisode(next);
					}
				}

				console.log(`[Player] Loaded ${displayTitle} via ${result.playMethod}`);
			} catch (err) {
				console.error('[Player] Failed to load media:', err);
				setError(err.message || 'Failed to load media');
			} finally {
				setIsLoading(false);
			}
		};

		loadMedia();

		return () => {
			console.log('[Player] Cleanup running - unmounting or re-rendering');

			if (isCleaningUpRef.current) {
				console.log('[Player] Skipping cleanup — already handled by handleBack/handleEnded');
				playback.stopProgressReporting();
				playback.stopHealthMonitoring();
				resetPopups();
				if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
				if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
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

			resetPopups();
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
	}, [item, resume, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, settings.subtitleMode, settings.skipIntro, initialAudioIndex, initialSubtitleIndex]);

	useEffect(() => {
		if (mediaUrl) {
			console.log('[Player] mediaUrl set:', mediaUrl);
		}
	}, [mediaUrl]);

	const seekInTranscode = useCallback(async (seekPositionTicks) => {
		if (seekingTranscodeRef.current) return;
		seekingTranscodeRef.current = true;

		if (seekDebounceTimerRef.current) {
			clearTimeout(seekDebounceTimerRef.current);
			seekDebounceTimerRef.current = null;
		}

		console.log('[Player] seekInTranscode: requesting new stream at', seekPositionTicks, 'ticks (', seekPositionTicks / 10000000, 's)');

		sourceTransitionRef.current = true;

		try {
			try {
				await playback.reportStop(positionRef.current);
			} catch (e) {
				console.warn('[Player] seekInTranscode: reportStop failed:', e);
			}

			destroyHlsPlayer();
			const video = videoRef.current;
			if (video) {
				try { video.pause(); } catch (e) { /* ignore */ }
				while (video.firstChild) video.removeChild(video.firstChild);
				video.src = '';
				video.removeAttribute('src');
			}

			const result = await playback.getPlaybackInfo(item.Id, {
				startPositionTicks: seekPositionTicks,
				maxBitrate: selectedQuality || settings.maxBitrate,
				enableDirectPlay: false,
				enableDirectStream: false,
				enableTranscoding: true,
				mediaSourceId: mediaSourceId,
				item: item
			});

			if (result.url) {
				positionRef.current = seekPositionTicks;
				lastSeekTargetRef.current = seekPositionTicks;
				transcodeOffsetTicksRef.current = seekPositionTicks;
				transcodeOffsetDetectedRef.current = false;

				// Wait for server to start FFmpeg and produce initial segments
				await new Promise(resolve => setTimeout(resolve, 1500));

				setMediaUrl(result.url);
				setPlayMethod(result.playMethod);
				setMimeType(result.mimeType || 'video/mp4');
				playSessionRef.current = result.playSessionId;

				console.log('[Player] seekInTranscode: new stream loaded at', seekPositionTicks / 10000000, 'seconds');
			}
		} catch (err) {
			console.error('[Player] seekInTranscode failed:', err);
			setError('Failed to seek - please try again');
		} finally {
			sourceTransitionRef.current = false;
			seekingTranscodeRef.current = false;

			if (lastSeekTargetRef.current !== null && lastSeekTargetRef.current !== seekPositionTicks) {
				console.log('[Player] seekInTranscode: target changed during seek, re-seeking to', lastSeekTargetRef.current / 10000000, 's');
				setTimeout(() => seekInTranscode(lastSeekTargetRef.current), 100);
			}
		}
	}, [item, selectedQuality, settings.maxBitrate]);

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
								 console.log('[Player] hls.js play() aborted — expected');
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
							console.log('[Player] hls.js persistent stall at', video.currentTime, '— force-seeking to 0.5s');
							video.currentTime = 0.5;
						} else if (stallCount === 6 && video.currentTime < 2) {
							console.log('[Player] hls.js still stalling at', video.currentTime, '— recovering media error');
							hls.recoverMediaError();
						}
					}

					if (data.fatal) {
						switch (data.type) {
							case Hls.ErrorTypes.NETWORK_ERROR:
								console.log('[Player] hls.js fatal network error — attempting recovery');
								hls.startLoad();
								break;
							case Hls.ErrorTypes.MEDIA_ERROR:
								console.log('[Player] hls.js fatal media error — attempting recovery');
								hls.recoverMediaError();
								break;
							default:
								console.error('[Player] hls.js unrecoverable error — dispatching error event');
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
				// <source> element provides DV codec hints to Starfish via type attribute
				const sourceEl = document.createElement('source');
				sourceEl.src = srcUrl;
				sourceEl.type = mimeType;
				video.appendChild(sourceEl);
				video.load();
			}

			if (playbackStartTimeoutRef.current) {
				clearTimeout(playbackStartTimeoutRef.current);
			}
			const onFirstTimeUpdate = () => {
				clearTimeout(playbackStartTimeoutRef.current);
				playbackStartTimeoutRef.current = null;
				video.removeEventListener('timeupdate', onFirstTimeUpdate);
				sourceTransitionRef.current = false;
				transcodeRetryCountRef.current = 0;
				if (pendingResumeTicksRef.current > 0) {
					const seekSec = pendingResumeTicksRef.current / 10000000;
					if (video.currentTime < seekSec * 0.5) {
						console.log('[Player] #t= fragment did not seek — using currentTime fallback:', seekSec, 's');
						video.currentTime = seekSec;
					} else {
						console.log('[Player] Resume via #t= fragment successful, position:', video.currentTime, 's');
					}
					pendingResumeTicksRef.current = 0;
				}

				// Apply initial audio track selection via audioTracks API
				const pending = pendingAudioRef.current;
				if (pending && video.audioTracks?.length > 1) {
					const trackPosition = pending.audioStreams
						.map(s => s.index)
						.indexOf(pending.streamIndex);
					if (trackPosition >= 0 && trackPosition < video.audioTracks.length) {
						for (let i = 0; i < video.audioTracks.length; i++) {
							video.audioTracks[i].enabled = (i === trackPosition);
						}
						console.log('[Player] Applied initial audio track via audioTracks API, index:', pending.streamIndex);
					}
					pendingAudioRef.current = null;
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
					console.warn('[Player] Playback start timeout — no timeupdate received in ' + (timeoutMs / 1000) + 's, triggering error handler');
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
							console.log('[Player] play() aborted (source transition) — expected');
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

	// Handle playback health issues — if the health monitor detects stalled
	// playback (no progress for extended period), fall back to transcoding.
	const handleUnhealthy = useCallback(async () => {
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
		await playback.reportStop(positionRef.current);
		onPlayNext(episode);
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

	// Audio playlist: next track
	const handleNextTrack = useCallback(async () => {
		if (hasNextTrack && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		}
	}, [hasNextTrack, onPlayNext, audioPlaylist, audioPlaylistIndex]);

	// Audio playlist: previous track (or restart current if >3s in)
	const handlePrevTrack = useCallback(async () => {
		const video = videoRef.current;
		if (video && video.currentTime > 3) {
			// Restart current track
			video.currentTime = 0;
			return;
		}
		if (hasPrevTrack && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex - 1]);
		}
	}, [hasPrevTrack, onPlayNext, audioPlaylist, audioPlaylistIndex]);

	const handleLoadedMetadata = useCallback(() => {
		if (videoRef.current) {
			if (playMethod !== 'Transcode') {
				setDuration(videoRef.current.duration);
			}
			videoRef.current.play().catch(err => {
				console.error('[Player] Failed to start playback:', err);
			});
		}
	}, [playMethod]);

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
					const expectedSec = transcodeOffsetTicksRef.current / 10000000;
					if (rawTime > expectedSec * 0.5) {
						transcodeOffsetTicksRef.current = 0;
						console.log('[Player] Transcode timestamps: absolute (no offset needed)');
					} else {
						console.log('[Player] Transcode timestamps: relative, applying offset:', expectedSec, 's');
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
				// Apply offset: lookupTime = currentTime - offset
				// If offset is positive (delay), we look at earlier time in the subtitle track
				const lookupTicks = ticks - (subtitleOffset * 10000000);

				let foundSubtitle = null;
				for (const event of subtitleTrackEvents) {
					if (lookupTicks >= event.StartPositionTicks && lookupTicks <= event.EndPositionTicks) {
						foundSubtitle = event.Text;
						break;
					}
				}
				setCurrentSubtitleText(foundSubtitle);
			}

			checkSegments(ticks);
		}
	}, [playMethod, checkSegments, subtitleTrackEvents, subtitleOffset]);

	const handleWaiting = useCallback(() => {
		setIsBuffering(true);
		if (healthMonitorRef.current) {
			healthMonitorRef.current.recordBuffer();
		}
	}, []);

	const handlePlaying = useCallback(() => {
		setIsBuffering(false);
		if (!seekDebounceTimerRef.current) {
			lastSeekTargetRef.current = null;
		}
	}, []);

	const handleEnded = useCallback(async () => {
		if (sourceTransitionRef.current) {
			console.log('[Player] Ignoring ended event during source transition (seek)');
			return;
		}

		await playback.reportStop(positionRef.current);

		isCleaningUpRef.current = true;
		destroyHlsPlayer();
		await cleanupVideoElement(videoRef.current);

		if (hasNextTrack && onPlayNext) {
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		} else if (nextEpisode && onPlayNext) {
			onPlayNext(nextEpisode);
		} else {
			onEnded?.();
		}
	}, [onEnded, onPlayNext, nextEpisode, hasNextTrack, audioPlaylist, audioPlaylistIndex]);

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
		let errorMessage = 'Playback failed.';

		try {
		if (video?.error) {
			switch (video.error.code) {
				case 1:
					errorMessage = 'Playback was aborted.';
					break;
				case 2:
					errorMessage = 'A network error occurred. Check your connection.';
					break;
				case 3:
					errorMessage = 'The video format is not supported by this TV.';
					break;
				case 4:
					errorMessage = 'The video source is not supported.';
					break;
				default:
					errorMessage = 'An unknown playback error occurred.';
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
					item: item
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
				errorMessage = 'Transcoding failed. The server may not support this format.';
			}
		} else if (playMethod === 'Transcode' && (!forceHlsJsRef.current || transcodeRetryCountRef.current < 1) && Hls.isSupported()) {
			// Tier 2: native HEVC transcode failed → switch to hls.js H.264+AAC
			// Tier 3: hls.js H.264 retry (one attempt)
			const isTier2 = !forceHlsJsRef.current;
			if (!isTier2) transcodeRetryCountRef.current++;
			console.log('[Player]', isTier2 ? 'Native transcode failed — switching to hls.js H.264' : 'hls.js H.264 failed, retrying...');

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
					item: item
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
				errorMessage = isTier2 ? 'H.264 transcoding fallback failed.' : 'Transcoding failed after retry. Try restarting the app.';
			}
		}

		destroyHlsPlayer();
		await cleanupVideoElement(videoRef.current);
		setError(errorMessage);
		} finally {
			isHandlingErrorRef.current = false;
		}
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate]);

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
			if (isPaused) {
				videoRef.current.play();
			} else {
				videoRef.current.pause();
			}
		}
	}, [isPaused]);

	const handleRewind = useCallback(() => {
		if (videoRef.current) seekByOffset(-settings.seekStep);
	}, [settings.seekStep, seekByOffset]);

	const handleForward = useCallback(() => {
		if (videoRef.current) seekByOffset(settings.seekStep);
	}, [settings.seekStep, seekByOffset]);

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
			// DirectPlay: try native audioTracks API for instant switch without reload
			if (playMethod !== playback.PlayMethod.Transcode && videoRef.current?.audioTracks?.length > 1) {
				const audioTrackList = videoRef.current.audioTracks;
				const audioStreamIndices = audioStreams.map(s => s.index);
				const trackPosition = audioStreamIndices.indexOf(index);

				if (trackPosition >= 0 && trackPosition < audioTrackList.length) {
					for (let i = 0; i < audioTrackList.length; i++) {
						audioTrackList[i].enabled = (i === trackPosition);
					}
					console.log('[Player] Switched audio natively via audioTracks API');
					return;
				}
			}

			// Fallback: re-request playback info with current position preserved
			const currentPositionTicks = videoRef.current
				? Math.floor(videoRef.current.currentTime * 10000000)
				: positionRef.current || 0;

			const result = await playback.changeAudioStream(index, currentPositionTicks);
			if (result) {
				positionRef.current = currentPositionTicks;
				let newUrl = result.url;
				// Cache-buster for DirectPlay so the video element reloads
				if (result.playMethod === playback.PlayMethod.DirectPlay) {
					const separator = newUrl.includes('?') ? '&' : '?';
					newUrl = `${newUrl}${separator}_audioSwitch=${Date.now()}`;
				}
				setMediaUrl(newUrl);
				if (result.playMethod) setPlayMethod(result.playMethod);
				setMimeType(result.mimeType || 'video/mp4');
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, audioStreams]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		console.log('[Player] handleSelectSubtitle called with index:', index);
		if (isNaN(index)) return;
		if (index === -1) {
			console.log('[Player] Turning subtitles OFF');
			setSelectedSubtitleIndex(-1);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
		} else {
			console.log('[Player] Selecting subtitle index:', index);
			setSelectedSubtitleIndex(index);
			const stream = subtitleStreams.find(s => s.index === index);
			console.log('[Player] Found stream:', stream ? 'yes' : 'no', 'codec:', stream?.codec, 'isTextBased:', stream?.isTextBased);
			// Fetch subtitle data as JSON for custom rendering (webOS doesn't support native <track>)
			if (stream && stream.isTextBased) {
				try {
					console.log('[Player] Fetching subtitle data for text-based sub...');
					const data = await playback.fetchSubtitleData(stream);
					console.log('[Player] Got subtitle data:', data ? 'yes' : 'no', 'TrackEvents:', data?.TrackEvents?.length);
					if (data && data.TrackEvents) {
						setSubtitleTrackEvents(data.TrackEvents);
						console.log('[Player] Manual select: Loaded', data.TrackEvents.length, 'subtitle events');
					} else {
						console.log('[Player] No TrackEvents in response');
						setSubtitleTrackEvents(null);
					}
				} catch (err) {
					console.error('[Player] Error fetching subtitle data:', err);
					setSubtitleTrackEvents(null);
				}
			} else {
				// PGS/image-based subtitles - cannot render client-side, need to burn in via transcode
				console.log('[Player] Image-based subtitle (codec:', stream?.codec, ') - requires burn-in via transcode');
				setSubtitleTrackEvents(null);
			}
			setCurrentSubtitleText(null);
		}
		closeModal();
	}, [subtitleStreams, closeModal]);

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
			window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
		} else if (e.key === 'ArrowDown' || e.keyCode === 40) {
			e.preventDefault();
			setFocusRow('bottom');
			setIsSeeking(false);
		}
	}, [settings.seekStep, seekByOffset, showControls]);

	const handleProgressBlur = useCallback(() => {
		setIsSeeking(false);
	}, []);

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
			default: break;
		}
	}, [showControls, handlePlayPause, handleRewind, handleForward, openModal, handlePlayNextEpisode, handleNextTrack, handlePrevTrack]);

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
				handleForward();
				showControls();
				return;
			}
			if (e.keyCode === 412) {
				e.preventDefault();
				e.stopPropagation();
				handleRewind();
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
				if (key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39) {
					e.preventDefault();
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
				if ((key === 'Enter' || e.keyCode === 13) && (showSkipIntro || showSkipCredits || showNextEpisode)) {
					return;
				}
				if (key === 'Enter' || e.keyCode === 13) {
					e.preventDefault();
					handlePlayPause();
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
						if (prev === 'bottom') return 'progress';
						if (prev === 'progress') {
							window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
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
						if (prev === 'top') return 'progress';
						if (prev === 'progress') return bottomButtons.length > 0 ? 'bottom' : 'progress';
						return 'bottom'; // Already at bottom, stay there
					});
					return;
				}
			}

		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, settings.seekStep, seekByOffset, handlePopupKeyDown, bottomButtons.length, showSkipIntro, showSkipCredits, showNextEpisode]);

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
					<p>Loading...</p>
				</div>
			)}

			{error && (
				<div className={css.error}>
					<h2>Playback Error</h2>
					<p>{error}</p>
					<Button onClick={onBack}>Go Back</Button>
				</div>
			)}

			{/* Audio Mode: Album Art + Info */}
			{!isLoading && !error && isAudioMode && (
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
						</div>
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

			{/* Playback Speed Indicator */}
			{!isLoading && !error && playbackRate !== 1 && (
				<div className={css.playbackIndicators}>
					<div className={css.speedIndicator}>{playbackRate}x</div>
				</div>
			)}

			{/* Next Episode Overlay */}
			{!isLoading && !error && (showSkipCredits || showNextEpisode) && nextEpisode && !isAudioMode && !activeModal && !controlsVisible && (
				<NextEpisodeContainer className={css.nextEpisodeOverlay} spotlightRestrict="self-only">
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
							<div className={css.nextLabel}>UP NEXT</div>
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
									&#9654; Play Now
								</SpottableButton>
								<SpottableButton
									className={css.nextCancelBtn}
									onClick={cancelNextEpisodeCountdown}
								>
									Hide
								</SpottableButton>
							</div>
						</div>
					</div>
					{nextEpisodeCountdown !== null && (
						<div className={css.nextProgressBar}>
							<div
								className={css.nextProgressFill}
								style={{width: `${((15 - nextEpisodeCountdown) / 15) * 100}%`}}
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
				handleSubtitleOffsetChange={handleSubtitleOffsetChange}
				closeModal={closeModal}
				stopPropagation={stopPropagation}
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
						return 'Unknown';
					};
					return pm === 'Transcode' ? (
						<div className={`${c.infoRow} ${c.infoWarning}`}>
							<span className={c.infoLabel}>Transcode Reason</span>
							<span className={c.infoValue}>{getTranscodeReason()}</span>
						</div>
					) : null;
				}}
				renderInfoVideoExtra={({css: c, videoStream}) => (
					videoStream?.BitDepth ? (
						<div className={c.infoRow}>
							<span className={c.infoLabel}>Bit Depth</span>
							<span className={c.infoValue}>{videoStream.BitDepth}-bit</span>
						</div>
					) : null
				)}
			/>}
		</div>
	);
};

export default Player;
