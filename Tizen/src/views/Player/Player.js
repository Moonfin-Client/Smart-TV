import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import Scroller from '@enact/sandstone/Scroller';
import * as playback from '../../services/playback';
import {
	initTizenAPI, registerAppStateObserver, keepScreenOn,
	avplayOpen, avplayPrepare, avplayPlay, avplayPause, avplayStop, avplayClose,
	avplaySeek, avplayGetCurrentTime, avplayGetDuration, avplayGetState,
	avplaySetListener, avplaySetSpeed, avplaySelectTrack, avplaySetSilentSubtitle,
	avplayGetTracks, avplaySetDisplayMethod, setDisplayWindow, cleanupAVPlay
} from '../../services/tizenVideo';
import {useSettings} from '../../context/SettingsContext';
import {TIZEN_KEYS, isBackKey} from '../../utils/tizenKeys';
import {getImageUrl} from '../../utils/helpers';
import {getServerUrl} from '../../services/jellyfinApi';
import TrickplayPreview from '../../components/TrickplayPreview';
import SubtitleOffsetOverlay from './SubtitleOffsetOverlay';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';

import css from './Player.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');

const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

const formatTime = (seconds) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatEndTime = (remainingSeconds) => {
	const now = new Date();
	now.setSeconds(now.getSeconds() + remainingSeconds);
	const hours = now.getHours();
	const minutes = now.getMinutes();
	const ampm = hours >= 12 ? 'PM' : 'AM';
	const h12 = hours % 12 || 12;
	return `Ends at ${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Playback speed options (AVPlay supports integer speeds; fractional speeds may not work)
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Quality presets (bitrate in bps)
const QUALITY_PRESETS = [
	{label: 'Auto', value: null},
	{label: '4K (60 Mbps)', value: 60000000, minRes: 3840},
	{label: '1080p (20 Mbps)', value: 20000000, minRes: 1920},
	{label: '1080p (10 Mbps)', value: 10000000, minRes: 1920},
	{label: '720p (8 Mbps)', value: 8000000, minRes: 1280},
	{label: '720p (4 Mbps)', value: 4000000, minRes: 1280},
	{label: '480p (2 Mbps)', value: 2000000, minRes: 854},
	{label: '360p (1 Mbps)', value: 1000000, minRes: 640}
];

const CONTROLS_HIDE_DELAY = 5000;

// SVG Icon components
const IconPlay = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/>
	</svg>
);

const IconPause = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Zm400-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z"/>
	</svg>
);

const IconRewind = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M860-240 500-480l360-240v480Zm-400 0L100-480l360-240v480Zm-80-240Zm400 0Zm-400 90v-180l-136 90 136 90Zm400 0v-180l-136 90 136 90Z"/>
	</svg>
);

const IconForward = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M100-240v-480l360 240-360 240Zm400 0v-480l360 240-360 240ZM180-480Zm400 0Zm-400 90 136-90-136-90v180Zm400 0 136-90-136-90v180Z"/>
	</svg>
);

const IconSubtitle = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm0-80h560v-480H200v480Zm80-120h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360ZM200-240v-480 480Z"/>
	</svg>
);

const IconAudio = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/>
	</svg>
);

const IconNext = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
	</svg>
);

const IconPrevious = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z"/>
	</svg>
);

const IconChapters = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="m160-800 80 160h120l-80-160h80l80 160h120l-80-160h80l80 160h120l-80-160h120q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Zm0 240v320h640v-320H160Zm0 0v320-320Z"/>
	</svg>
);

const IconSpeed = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M418-340q24 24 62 23.5t56-27.5l224-336-336 224q-27 18-28.5 55t22.5 61Zm62-460q59 0 113.5 16.5T696-734l-76 48q-33-17-68.5-25.5T480-720q-133 0-226.5 93.5T160-400q0 42 11.5 83t32.5 77h552q23-38 33.5-79t10.5-85q0-36-8.5-70T766-540l48-76q30 47 48 100.5T880-400q0 90-34.5 167T752-120H208q-59-59-93.5-136T80-400q0-83 31.5-156T197-669q54-54 127-85.5T480-786Zm0 386Z"/>
	</svg>
);

const IconQuality = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M170-228q-38-44-61-98T80-440h82q6 44 22 83.5t42 72.5l-56 56ZM80-520q8-60 30-114t60-98l56 56q-26 33-42 72.5T162-520H80ZM438-82q-60-6-113.5-29T226-170l56-58q35 26 73.5 43t82.5 23v80ZM284-732l-58-58q45-36 98.5-59T440-878v80q-45 6-84 23t-72 43Zm96 432v-360l280 180-280 180ZM520-82v-80q121-17 200.5-107T800-480q0-121-79.5-211T520-798v-80q154 17 257 130t103 268q0 155-103 268T520-82Z"/>
	</svg>
);

const IconInfo = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M160-120v-720h80v80h80v-80h320v80h80v-80h80v720h-80v-80h-80v80H320v-80h-80v80h-80Zm80-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm400 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80ZM400-200h160v-560H400v560Zm0-560h160-160Z"/>
	</svg>
);

/**
 * AVPlay-based Player component for Samsung Tizen.
 *
 * Uses Samsung's native AVPlay API instead of HTML5 <video> for hardware-accelerated
 * playback. AVPlay renders on a platform multimedia layer BEHIND the web engine;
 * the web layer must be transparent in the video area for the content to show through.
 */
const Player = ({item, initialAudioIndex, initialSubtitleIndex, onEnded, onBack, onPlayNext, audioPlaylist}) => {
	const {settings} = useSettings();

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
	const [mediaSegments, setMediaSegments] = useState(null);
	const [showSkipIntro, setShowSkipIntro] = useState(false);
	const [showSkipCredits, setShowSkipCredits] = useState(false);
	const [nextEpisode, setNextEpisode] = useState(null);
	const [showNextEpisode, setShowNextEpisode] = useState(false);
	const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(null);
	const [isSeeking, setIsSeeking] = useState(false);
	const [seekPosition, setSeekPosition] = useState(0);
	const [mediaSourceId, setMediaSourceId] = useState(null);
	const [hasTriedTranscode, setHasTriedTranscode] = useState(false);
	const [focusRow, setFocusRow] = useState('top');
	const [isAudioMode, setIsAudioMode] = useState(false);

	// Audio playlist tracking
	const audioPlaylistIndex = useMemo(() => {
		if (!audioPlaylist || !item) return -1;
		return audioPlaylist.findIndex(t => t.Id === item.Id);
	}, [audioPlaylist, item]);
	const hasNextTrack = audioPlaylist && audioPlaylistIndex >= 0 && audioPlaylistIndex < audioPlaylist.length - 1;
	const hasPrevTrack = audioPlaylist && audioPlaylistIndex > 0;

	const positionRef = useRef(0);
	const playSessionRef = useRef(null);
	const runTimeRef = useRef(0);
	const healthMonitorRef = useRef(null);
	const nextEpisodeTimerRef = useRef(null);
	const hasTriggeredNextEpisodeRef = useRef(false);
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
	// Ref for the Player container DOM element — used to walk up ancestors for transparency
	const playerContainerRef = useRef(null);

	const topButtons = useMemo(() => {
		const buttons = [
			{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? 'Play' : 'Pause', action: 'playPause'}
		];
		if (isAudioMode) {
			buttons.unshift(
				{id: 'previous', icon: <IconPrevious />, label: 'Previous', action: 'prevTrack', disabled: !hasPrevTrack}
			);
			buttons.push(
				{id: 'next', icon: <IconNext />, label: 'Next', action: 'nextTrack', disabled: !hasNextTrack}
			);
		} else {
			buttons.push(
				{id: 'rewind', icon: <IconRewind />, label: 'Rewind', action: 'rewind'},
				{id: 'forward', icon: <IconForward />, label: 'Forward', action: 'forward'},
				{id: 'audio', icon: <IconAudio />, label: 'Audio', action: 'audio', disabled: audioStreams.length === 0},
				{id: 'subtitle', icon: <IconSubtitle />, label: 'Subtitles', action: 'subtitle', disabled: subtitleStreams.length === 0}
			);
		}
		return buttons;
	}, [isPaused, audioStreams.length, subtitleStreams.length, isAudioMode, hasNextTrack, hasPrevTrack]);

	const bottomButtons = useMemo(() => {
		if (isAudioMode) {
			return [];
		}
		return [
			{id: 'chapters', icon: <IconChapters />, label: 'Chapters', action: 'chapter', disabled: chapters.length === 0},
			{id: 'previous', icon: <IconPrevious />, label: 'Previous', action: 'previous', disabled: true},
			{id: 'next', icon: <IconNext />, label: 'Next', action: 'next', disabled: !nextEpisode},
			{id: 'speed', icon: <IconSpeed />, label: 'Speed', action: 'speed'},
			{id: 'quality', icon: <IconQuality />, label: 'Quality', action: 'quality'},
			{id: 'info', icon: <IconInfo />, label: 'Info', action: 'info'}
		];
	}, [chapters.length, nextEpisode, isAudioMode]);

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

		// Update custom subtitle text - match current position to subtitle events
		if (subtitleTrackEvents && subtitleTrackEvents.length > 0) {
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

		// Check for intro skip
		if (mediaSegments && settings.skipIntro) {
			const {introStart, introEnd, creditsStart} = mediaSegments;

			if (introStart && introEnd) {
				const inIntro = ticks >= introStart && ticks < introEnd;
				setShowSkipIntro(inIntro);
			}

			if (creditsStart && nextEpisode) {
				const inCredits = ticks >= creditsStart;
				if (inCredits) {
					setShowSkipCredits(prev => {
						if (!prev) {
							// Will start countdown via effect
							return true;
						}
						return prev;
					});
				}
			}
		}

		// Near end of video
		if (nextEpisode && runTimeRef.current > 0) {
			const remaining = runTimeRef.current - ticks;
			const nearEnd = remaining < 300000000;
			if (nearEnd && !hasTriggeredNextEpisodeRef.current) {
				setShowNextEpisode(true);
				hasTriggeredNextEpisodeRef.current = true;
			}
		}
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
		setDisplayWindow({x: 0, y: 0, width: 1920, height: 1080});
		avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');

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
			onsubtitlechange: () => {},
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
	}, [startTimeUpdatePolling, stopTimeUpdatePolling]);

	// ==============================
	// Initialization
	// ==============================
	useEffect(() => {
		const init = async () => {
			await initTizenAPI();
			await keepScreenOn(true);

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

		return () => {
			keepScreenOn(false);
			// Restore backgrounds on all ancestors
			document.body.style.background = '';
			document.documentElement.style.background = '';
			if (playerContainerRef.current) {
				let el = playerContainerRef.current.parentElement;
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

	// ==============================
	// Load Media & Start AVPlay
	// ==============================
	useEffect(() => {
		const loadMedia = async () => {
			setIsLoading(true);
			setError(null);

			// Stop any previous playback
			stopTimeUpdatePolling();
			cleanupAVPlay();
			avplayReadyRef.current = false;

			try {
				const startPosition = item.UserData?.PlaybackPositionTicks || 0;
				const effectiveBitrate = selectedQuality || settings.maxBitrate || undefined;
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: startPosition,
					maxBitrate: effectiveBitrate,
					preferTranscode: settings.preferTranscode,
					item: item,
					audioStreamIndex: initialAudioIndex != null ? initialAudioIndex : undefined
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
				setChapters(result.chapters || []);

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
					if (sub && sub.isEmbeddedNative) {
						console.log('[Player] Initial: Using native embedded subtitle (codec:', sub.codec, ')');
						const trackIndex = result.subtitleStreams ? result.subtitleStreams.indexOf(sub) : -1;
						pendingSubAction = {type: 'native', trackIndex};
						setSubtitleTrackEvents(null);
					} else if (sub && sub.isTextBased) {
						pendingSubAction = {type: 'text'};
						try {
							const data = await playback.fetchSubtitleData(sub);
							if (data && data.TrackEvents) {
								setSubtitleTrackEvents(data.TrackEvents);
								console.log('[Player] Loaded', data.TrackEvents.length, 'subtitle events');
							} else {
								setSubtitleTrackEvents(null);
							}
						} catch (err) {
							console.error('[Player] Error fetching subtitle data:', err);
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

					// Load next episode for TV shows
					if (item.Type === 'Episode') {
						const next = await playback.getNextEpisode(item);
						setNextEpisode(next);
					}
				}

				// === Start AVPlay ===
				avplayOpen(result.url);
				setDisplayWindow({x: 0, y: 0, width: 1920, height: 1080});
				avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');

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
					onsubtitlechange: () => {},
					ondrmevent: () => {}
				});

				await avplayPrepare();
				avplayReadyRef.current = true;

				// Get duration from AVPlay (returns ms)
				const durationMs = avplayGetDuration();
				if (durationMs > 0) {
					setDuration(durationMs / 1000);
					runTimeRef.current = Math.floor(durationMs * 10000);
				}

				// Apply pending audio track setup (AVPlay must be in READY state)
				if (pendingAudioIndex != null && result.playMethod !== playback.PlayMethod.Transcode) {
					try {
						avplaySelectTrack('AUDIO', pendingAudioIndex);
						console.log('[Player] Applied initial audio track via AVPlay, index:', pendingAudioIndex);
					} catch (audioErr) {
						console.warn('[Player] Failed to apply initial audio track:', audioErr.message);
					}
				}

				// Apply pending subtitle setup (AVPlay must be in READY state)
				if (pendingSubAction) {
					if (pendingSubAction.type === 'native' && pendingSubAction.trackIndex >= 0) {
						avplaySelectTrack('SUBTITLE', pendingSubAction.trackIndex);
						avplaySetSilentSubtitle(false);
					} else {
						avplaySetSilentSubtitle(true);
					}
				}

				// Seek to start position if resuming
				if (startPosition > 0) {
					const seekMs = Math.floor(startPosition / 10000);
					await avplaySeek(seekMs);
				}

				// Play
				avplayPlay();
				setIsPaused(false);

				// Report start and begin progress reporting
				playback.reportStart(positionRef.current);
				playback.startProgressReporting(() => positionRef.current);
				playback.startHealthMonitoring(handleUnhealthy);
				healthMonitorRef.current = playback.getHealthMonitor();

				// Start time update polling
				startTimeUpdatePolling();

				console.log(`[Player] Loaded ${displayTitle} via ${result.playMethod} (AVPlay native)`);
			} catch (err) {
				console.error('[Player] Failed to load media:', err);
				setError(err.message || 'Failed to load media');
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
			avplayReadyRef.current = false;

			if (nextEpisodeTimerRef.current) {
				clearInterval(nextEpisodeTimerRef.current);
			}
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
			if (seekDebounceRef.current) {
				clearTimeout(seekDebounceRef.current);
				seekDebounceRef.current = null;
			}
			pendingSeekMsRef.current = null;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.subtitleMode, settings.skipIntro]);

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

	// Handle playback health issues
	const handleUnhealthy = useCallback(async () => {
		console.log('[Player] Playback unhealthy, falling back to transcode');
	}, []);

	// Cancel next episode countdown
	const cancelNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
		}
		setNextEpisodeCountdown(null);
		setShowNextEpisode(false);
		setShowSkipCredits(false);
	}, []);

	// Play next episode
	const handlePlayNextEpisode = useCallback(async () => {
		if (nextEpisode && onPlayNext) {
			cancelNextEpisodeCountdown();
			stopTimeUpdatePolling();
			await playback.reportStop(positionRef.current);
			cleanupAVPlay();
			avplayReadyRef.current = false;
			onPlayNext(nextEpisode);
		}
	}, [nextEpisode, onPlayNext, cancelNextEpisodeCountdown, stopTimeUpdatePolling]);

	// Audio playlist: next track
	const handleNextTrack = useCallback(async () => {
		if (hasNextTrack && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		}
	}, [hasNextTrack, onPlayNext, audioPlaylist, audioPlaylistIndex]);

	// Audio playlist: previous track (or restart current if >3s in)
	const handlePrevTrack = useCallback(async () => {
		if (avplayReadyRef.current) {
			const ms = avplayGetCurrentTime();
			if (ms > 3000) {
				// Restart current track
				avplaySeek(0).catch(e => console.warn('[Player] Seek failed:', e));
				return;
			}
		}
		if (hasPrevTrack && onPlayNext) {
			await playback.reportStop(positionRef.current);
			onPlayNext(audioPlaylist[audioPlaylistIndex - 1]);
		}
	}, [hasPrevTrack, onPlayNext, audioPlaylist, audioPlaylistIndex]);

	// Start countdown to next episode
	const startNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimerRef.current) return;

		let countdown = 15;
		setNextEpisodeCountdown(countdown);

		nextEpisodeTimerRef.current = setInterval(() => {
			countdown--;
			setNextEpisodeCountdown(countdown);

			if (countdown <= 0) {
				clearInterval(nextEpisodeTimerRef.current);
				nextEpisodeTimerRef.current = null;
				handlePlayNextEpisode();
			}
		}, 1000);
	}, [handlePlayNextEpisode]);

	// Start next episode countdown when credits detected
	useEffect(() => {
		if (showSkipCredits && nextEpisode && settings.autoPlay) {
			startNextEpisodeCountdown();
		}
	}, [showSkipCredits, nextEpisode, settings.autoPlay, startNextEpisodeCountdown]);

	// Start next episode countdown when near end
	useEffect(() => {
		if (showNextEpisode && !showSkipCredits && nextEpisode && settings.autoPlay) {
			startNextEpisodeCountdown();
		}
	}, [showNextEpisode, showSkipCredits, nextEpisode, settings.autoPlay, startNextEpisodeCountdown]);

	// ==============================
	// Playback Event Handlers (via AVPlay listener refs)
	// ==============================
	const handleEnded = useCallback(async () => {
		stopTimeUpdatePolling();
		await playback.reportStop(positionRef.current);
		cleanupAVPlay();
		avplayReadyRef.current = false;
		// Auto-advance to next track in audio playlist
		if (hasNextTrack && onPlayNext) {
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		} else if (nextEpisode && onPlayNext) {
			onPlayNext(nextEpisode);
		} else {
			onEnded?.();
		}
	}, [onEnded, onPlayNext, nextEpisode, stopTimeUpdatePolling, hasNextTrack, audioPlaylist, audioPlaylistIndex]);

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
					item: item
				});

				if (result.url) {
					setPlayMethod(result.playMethod);
					playSessionRef.current = result.playSessionId;
					// Restart AVPlay with transcode URL
					try {
						await startAVPlayback(result.url, positionRef.current);
						playback.reportStart(positionRef.current);
						playback.startProgressReporting(() => positionRef.current);
					} catch (restartErr) {
						console.error('[Player] AVPlay restart failed:', restartErr);
						setError('Playback failed. The file format may not be supported.');
					}
					return;
				}
			} catch (fallbackErr) {
				console.error('[Player] Transcode fallback failed:', fallbackErr);
			}
		}

		setError('Playback failed. The file format may not be supported.');
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, startAVPlayback]);

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
		if (state === 'PLAYING') {
			avplayPause();
			setIsPaused(true);
		} else if (state === 'PAUSED' || state === 'READY') {
			avplayPlay();
			setIsPaused(false);
		}
	}, []);

	const handleRewind = useCallback(() => {
		if (!avplayReadyRef.current) return;
		const ms = avplayGetCurrentTime();
		const newMs = Math.max(0, ms - settings.seekStep * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings.seekStep]);

	const handleForward = useCallback(() => {
		if (!avplayReadyRef.current) return;
		const ms = avplayGetCurrentTime();
		const durationMs = avplayGetDuration();
		const newMs = Math.min(durationMs, ms + settings.seekStep * 1000);
		avplaySeek(newMs).catch(e => console.warn('[Player] Seek failed:', e));
	}, [settings.seekStep]);

	const handleSkipIntro = useCallback(() => {
		if (mediaSegments?.introEnd && avplayReadyRef.current) {
			const seekMs = Math.floor(mediaSegments.introEnd / 10000);
			avplaySeek(seekMs).catch(e => console.warn('[Player] Seek failed:', e));
		}
		setShowSkipIntro(false);
	}, [mediaSegments]);

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
					avplaySelectTrack('AUDIO', index);
					console.log('[Player] Switched audio track natively via AVPlay, index:', index);
					return;
				} catch (nativeErr) {
					console.log('[Player] Native audio switch failed, reloading:', nativeErr.message);
				}
			}

			// Fallback: re-request playback info and reload via AVPlay
			const currentMs = avplayGetCurrentTime();
			const currentPositionTicks = Math.floor(currentMs * 10000);

			const result = await playback.changeAudioStream(index, currentPositionTicks);
			if (result) {
				console.log('[Player] Switching audio track via stream reload for', playMethod, '- resuming from', currentPositionTicks);
				positionRef.current = currentPositionTicks;
				if (result.playMethod) setPlayMethod(result.playMethod);

				// Restart AVPlay with new URL
				await startAVPlayback(result.url, currentPositionTicks);
				playback.reportStart(positionRef.current);
				playback.startProgressReporting(() => positionRef.current);
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, startAVPlayback]);

	const handleSelectSubtitle = useCallback(async (e) => {
		const index = parseInt(e.currentTarget.dataset.index, 10);
		if (isNaN(index)) return;
		if (index === -1) {
			setSelectedSubtitleIndex(-1);
			setSubtitleTrackEvents(null);
			setCurrentSubtitleText(null);
			avplaySetSilentSubtitle(true);
		} else {
			setSelectedSubtitleIndex(index);
			const stream = subtitleStreams.find(s => s.index === index);

			let nativeSuccess = false;

			if (stream && stream.isEmbeddedNative) {
				// Try to use AVPlay's native track selection for embedded SRT
				try {
					const trackInfo = avplayGetTracks();
					// Filter for subtitle tracks
					const subTracks = Array.isArray(trackInfo) ? trackInfo.filter(t => t.type === 'SUBTITLE') : [];

					if (subTracks.length > 0) {
						// Only count embedded streams to match Tizen's list
						const embeddedStreams = subtitleStreams.filter(s => s.isEmbeddedNative);
						const embeddedIndex = embeddedStreams.indexOf(stream);

						if (embeddedIndex >= 0 && embeddedIndex < subTracks.length) {
							// Use the index from the Tizen object if possible
							const tizenIndex = subTracks[embeddedIndex].index;
							avplaySelectTrack('SUBTITLE', tizenIndex);
							avplaySetSilentSubtitle(false);
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
			} else if (stream && (stream.isTextBased || stream.isEmbeddedNative)) {
				// Fallback to extraction (text-based) logic
				// This runs if it's a text stream OR if it was an embedded native stream that failed the check above
				avplaySetSilentSubtitle(true); // hide native subs, use custom overlay
				try {
					const data = await playback.fetchSubtitleData(stream);
					if (data && data.TrackEvents) {
						setSubtitleTrackEvents(data.TrackEvents);
						console.log('[Player] Loaded', data.TrackEvents.length, 'subtitle events (Fallback/Extracted)');
					} else {
						setSubtitleTrackEvents(null);
					}
				} catch (err) {
					console.error('[Player] Error fetching subtitle data:', err);
					setSubtitleTrackEvents(null);
				}
			} else {
				console.log('[Player] Image-based subtitle (codec:', stream?.codec, ') - requires burn-in via transcode');
				avplaySetSilentSubtitle(true);
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

	// Progress bar keyboard control — deferred seeking
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
		} else if (e.key === 'ArrowDown' || e.keyCode === 40) {
			e.preventDefault();
			executeDeferredSeek();
			setFocusRow('bottom');
			setIsSeeking(false);
		}
	}, [duration, settings.seekStep, showControls, scheduleDeferredSeek, executeDeferredSeek]);

	const handleProgressBlur = useCallback(() => {
		executeDeferredSeek();
		setIsSeeking(false);
	}, [executeDeferredSeek]);

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
			default: break;
		}
	}, [showControls, handlePlayPause, handleRewind, handleForward, openModal, handlePlayNextEpisode, handleNextTrack, handlePrevTrack]);

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

	// ==============================
	// Global Key Handler
	// ==============================
	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.key || e.keyCode;

			// Media playback keys (Tizen remote)
			if (e.keyCode === TIZEN_KEYS.PLAY) {
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
			if (e.keyCode === TIZEN_KEYS.PAUSE) {
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
			if (e.keyCode === TIZEN_KEYS.PLAY_PAUSE) {
				e.preventDefault();
				e.stopPropagation();
				showControls();
				handlePlayPause();
				return;
			}
			if (e.keyCode === TIZEN_KEYS.FAST_FORWARD) {
				e.preventDefault();
				e.stopPropagation();
				handleForward();
				showControls();
				return;
			}
			if (e.keyCode === TIZEN_KEYS.REWIND) {
				e.preventDefault();
				e.stopPropagation();
				handleRewind();
				showControls();
				return;
			}
			if (e.keyCode === TIZEN_KEYS.STOP) {
				e.preventDefault();
				e.stopPropagation();
				handleBack();
				return;
			}

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
				if (key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39) {
					e.preventDefault();
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
				// Any other key shows controls
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
						if (prev === 'bottom') return 'progress';
						if (prev === 'progress') return 'top';
						return 'top';
					});
					return;
				}
				if (key === 'ArrowDown' || e.keyCode === 40) {
					e.preventDefault();
					setFocusRow(prev => {
						if (prev === 'top') return 'progress';
						if (prev === 'progress') return bottomButtons.length > 0 ? 'bottom' : 'progress';
						return 'bottom'; // Already at bottom, stay there
					});
					return;
				}
			}

			// Play/Pause with Enter when controls not focused
			if ((key === 'Enter' || e.keyCode === 13) && !controlsVisible && !activeModal) {
				handlePlayPause();
				return;
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, duration, settings.seekStep, showNextEpisode, showSkipCredits, nextEpisode, cancelNextEpisodeCountdown, bottomButtons.length, scheduleDeferredSeek]);

	// Calculate progress - use seekPosition when actively seeking for smooth scrubbing
	const displayTime = isSeeking ? (seekPosition / 10000000) : currentTime;
	const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

	// Focus appropriate element when focusRow changes
	useEffect(() => {
		if (!controlsVisible) return;

		const timer = setTimeout(() => {
			if (focusRow === 'progress') {
				Spotlight.focus('progress-bar');
			} else if (focusRow === 'bottom') {
				Spotlight.focus('bottom-row-default');
			}
		}, 50);

		return () => clearTimeout(timer);
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
					<p>Loading...</p>
				</div>
			</div>
		);
	}

	// Render error
	if (error) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<h2>Playback Error</h2>
					<p>{error}</p>
					<Button onClick={onBack}>Go Back</Button>
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
						</div>
					</div>
				</div>
			)}

			{/* Custom Subtitle Overlay - rendered on web layer above AVPlay video */}
			{currentSubtitleText && !isAudioMode && (
				<div
					className={css.subtitleOverlay}
					style={{
						bottom: settings.subtitlePosition === 'absolute'
							? `${100 - settings.subtitlePositionAbsolute}%`
							: `${settings.subtitlePosition === 'bottom' ? 10 : settings.subtitlePosition === 'lower' ? 20 : settings.subtitlePosition === 'middle' ? 30 : 40}%`,
						opacity: (settings.subtitleOpacity || 100) / 100
					}}
				>
				{/* eslint-disable react/no-danger */}
					<div
						className={css.subtitleText}
						style={{
							fontSize: `${settings.subtitleSize === 'small' ? 36 : settings.subtitleSize === 'medium' ? 44 : settings.subtitleSize === 'large' ? 52 : 60}px`,
							backgroundColor: `${settings.subtitleBackgroundColor || '#000000'}${Math.round(((settings.subtitleBackground !== undefined ? settings.subtitleBackground : 75) / 100) * 255).toString(16).padStart(2, '0')}`,
							color: settings.subtitleColor || '#ffffff',
							textShadow: `0 0 ${settings.subtitleShadowBlur || 0.1}em ${settings.subtitleShadowColor || '#000000'}${Math.round(((settings.subtitleShadowOpacity !== undefined ? settings.subtitleShadowOpacity : 50) / 100) * 255).toString(16).padStart(2, '0')}`
						}}
						dangerouslySetInnerHTML={{
							__html: currentSubtitleText
								.replace(/\\N/gi, '<br/>')
								.replace(/\r?\n/gi, '<br/>')
								.replace(/{\\.*?}/gi, '') // Remove ASS/SSA style tags
						}}
					/>
					{/* eslint-enable react/no-danger */}
				</div>
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

			{/* Skip Intro Button */}
			{showSkipIntro && !isAudioMode && !activeModal && (
				<div className={css.skipOverlay}>
					<SpottableButton className={css.skipButton} onClick={handleSkipIntro}>
						Skip Intro
					</SpottableButton>
				</div>
			)}

			{/* Next Episode Overlay */}
			{(showSkipCredits || showNextEpisode) && nextEpisode && !isAudioMode && !activeModal && (
				<div className={css.nextEpisodeOverlay}>
					<div className={css.nextLabel}>Up Next</div>
					<div className={css.nextTitle}>{nextEpisode.Name}</div>
					{nextEpisode.SeriesName && (
						<div className={css.nextMeta}>
							S{nextEpisode.ParentIndexNumber}E{nextEpisode.IndexNumber}
						</div>
					)}
					{nextEpisodeCountdown !== null && (
						<div className={css.nextCountdown}>
							Starting in {nextEpisodeCountdown}s
						</div>
					)}
					<div className={css.nextButtons}>
						<Button onClick={handlePlayNextEpisode}>Play Now</Button>
						<Button onClick={cancelNextEpisodeCountdown}>Hide</Button>
					</div>
				</div>
			)}

			{/* Player Controls Overlay */}
			<div className={`${css.playerControls} ${controlsVisible && !activeModal ? css.visible : ''} ${isAudioMode ? css.audioControls : ''}`}>
				{/* Top - Media Info (hidden in audio mode, shown in album art area instead) */}
				{!isAudioMode && (
				<div className={css.controlsTop}>
					<div className={css.mediaInfo}>
						<h1 className={css.mediaTitle}>{title}</h1>
						{subtitle && <p className={css.mediaSubtitle}>{subtitle}</p>}
					</div>
				</div>
				)}

				{/* Bottom - Controls */}
				<div className={css.controlsBottom}>
					{/* Top Row Buttons */}
					<div className={css.controlButtons}>
						{topButtons.map((btn) => (
							<SpottableButton
								key={btn.id}
								className={`${css.controlBtn} ${btn.disabled ? css.controlBtnDisabled : ''}`}
								data-action={btn.action}
								onClick={btn.disabled ? undefined : handleControlButtonClick}
								aria-label={btn.label}
								aria-disabled={btn.disabled}
								spotlightDisabled={focusRow !== 'top'}
							>
								{btn.icon}
							</SpottableButton>
						))}
					</div>

					{/* Progress Bar */}
					<div className={css.progressContainer}>
						<div className={css.timeInfoTop}>
							<span className={css.timeEnd}>{formatEndTime(duration - displayTime)}</span>
						</div>
						<SpottableDiv
							className={css.progressBar}
							onClick={handleProgressClick}
							onKeyDown={handleProgressKeyDown}
							onBlur={handleProgressBlur}
							tabIndex={0}
							spotlightDisabled={focusRow !== 'progress'}
							spotlightId="progress-bar"
						>
							<div className={css.progressFill} style={{width: `${progressPercent}%`}} />
							<div className={css.seekIndicator} style={{left: `${progressPercent}%`}} />
							{isSeeking && !isAudioMode && (
								<TrickplayPreview
									itemId={item.Id}
									mediaSourceId={mediaSourceId}
									positionTicks={seekPosition}
									visible
									style={{left: `${progressPercent}%`}}
								/>
							)}
						</SpottableDiv>
						<div className={css.timeInfo}>
							<span className={css.timeDisplay}>
								{formatTime(displayTime)} / {formatTime(duration)}
							</span>
						</div>
					</div>

					{/* Bottom Row Buttons */}
					{bottomButtons.length > 0 && (
					<div className={css.controlButtonsBottom}>
						{bottomButtons.map((btn) => (
							<SpottableButton
								key={btn.id}
								className={`${css.controlBtn} ${btn.disabled ? css.controlBtnDisabled : ''}`}
								data-action={btn.action}
								onClick={btn.disabled ? undefined : handleControlButtonClick}
								aria-label={btn.label}
								aria-disabled={btn.disabled}
								spotlightDisabled={focusRow !== 'bottom'}
								spotlightId={btn.id === 'chapters' ? 'bottom-row-default' : undefined}
							>
								{btn.icon}
							</SpottableButton>
						))}
					</div>
					)}
				</div>
			</div>

			{/* Audio Track Modal */}
			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.modalTitle}>Select Audio Track</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream) => (
								<SpottableButton
									key={stream.index}
									className={`${css.trackItem} ${stream.index === selectedAudioIndex ? css.selected : ''}`}
									data-index={stream.index}
									data-selected={stream.index === selectedAudioIndex ? 'true' : undefined}
									onClick={handleSelectAudio}
								>
									<span className={css.trackName}>{stream.displayTitle}</span>
									{stream.channels && <span className={css.trackInfo}>{stream.channels}ch</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}

			{/* Subtitle Modal */}
			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.modalTitle}>Select Subtitle</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${selectedSubtitleIndex === -1 ? css.selected : ''}`}
								data-index={-1}
								data-selected={selectedSubtitleIndex === -1 ? 'true' : undefined}
								onClick={handleSelectSubtitle}
								onKeyDown={handleSubtitleItemKeyDown}
							>
								<span className={css.trackName}>Off</span>
							</SpottableButton>
							{subtitleStreams.map((stream) => (
								<SpottableButton
									key={stream.index}
									className={`${css.trackItem} ${stream.index === selectedSubtitleIndex ? css.selected : ''}`}
									data-index={stream.index}
									data-selected={stream.index === selectedSubtitleIndex ? 'true' : undefined}
									onClick={handleSelectSubtitle}
									onKeyDown={handleSubtitleItemKeyDown}
								>
									<span className={css.trackName}>{stream.displayTitle}</span>
									{stream.isForced && <span className={css.trackInfo}>Forced</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>
							<SpottableButton spotlightId="btn-subtitle-offset" className={css.actionBtn} onClick={handleOpenSubtitleOffset}>Offset</SpottableButton>
							<SpottableButton spotlightId="btn-subtitle-appearance" className={css.actionBtn} onClick={handleOpenSubtitleSettings} style={{marginLeft: 15}}>Appearance</SpottableButton>
						</p>
						<p className={css.modalFooter} style={{marginTop: 5, fontSize: 14, opacity: 0.5}}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}

			{/* Speed Modal */}
			{activeModal === 'speed' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="speed" spotlightId="speed-modal">
						<h2 className={css.modalTitle}>Playback Speed</h2>
						<div className={css.trackList}>
							{PLAYBACK_RATES.map((rate) => (
								<SpottableButton
									key={rate}
									className={`${css.trackItem} ${rate === playbackRate ? css.selected : ''}`}
									data-rate={rate}
									data-selected={rate === playbackRate ? 'true' : undefined}
									onClick={handleSelectSpeed}
								>
									<span className={css.trackName}>{rate === 1 ? 'Normal' : `${rate}x`}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}

			{/* Quality Modal */}
			{activeModal === 'quality' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="quality" spotlightId="quality-modal">
						<h2 className={css.modalTitle}>Max Bitrate</h2>
						<div className={css.trackList}>
							{QUALITY_PRESETS.map((preset) => (
								<SpottableButton
									key={preset.label}
									className={`${css.trackItem} ${selectedQuality === preset.value ? css.selected : ''}`}
									data-value={preset.value === null ? 'null' : preset.value}
									data-selected={selectedQuality === preset.value ? 'true' : undefined}
									onClick={handleSelectQuality}
								>
									<span className={css.trackName}>{preset.label}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>Current: {playMethod || 'Unknown'}</p>
					</ModalContainer>
				</div>
			)}

			{/* Chapter Modal */}
			{activeModal === 'chapter' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={`${css.modalContent} ${css.chaptersModal}`} onClick={stopPropagation} data-modal="chapter" spotlightId="chapter-modal">
						<h2 className={css.modalTitle}>Chapters</h2>
						<div className={css.trackList}>
							{chapters.map((chapter) => {
								const chapterTime = chapter.startPositionTicks / 10000000;
								const isCurrent = currentTime >= chapterTime &&
									(chapters.indexOf(chapter) === chapters.length - 1 ||
									 currentTime < chapters[chapters.indexOf(chapter) + 1].startPositionTicks / 10000000);
								return (
									<SpottableButton
										key={chapter.index}
										className={`${css.chapterItem} ${isCurrent ? css.currentChapter : ''}`}
										data-ticks={chapter.startPositionTicks}
										data-selected={isCurrent ? 'true' : undefined}
										onClick={handleSelectChapter}
									>
										<span className={css.chapterTime}>{formatTime(chapterTime)}</span>
										<span className={css.chapterName}>{chapter.name}</span>
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.modalFooter}>Press BACK to close</p>
					</ModalContainer>
				</div>
			)}

			{/* Info Modal */}
			{activeModal === 'info' && (() => {
				const session = playback.getCurrentSession();
				const mediaSource = session?.mediaSource;
				const videoStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Video');
				const audioStream = mediaSource?.MediaStreams?.find(s => s.Index === selectedAudioIndex) ||
					mediaSource?.MediaStreams?.find(s => s.Type === 'Audio');
				const subtitleStream = selectedSubtitleIndex >= 0
					? mediaSource?.MediaStreams?.find(s => s.Index === selectedSubtitleIndex)
					: null;

				// Format bitrate nicely
				const formatBitrate = (bitrate) => {
					if (!bitrate) return 'Unknown';
					if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
					if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
					return `${bitrate} bps`;
				};

				// Get HDR type
				const getHdrType = () => {
					if (!videoStream) return 'SDR';
					const rangeType = videoStream.VideoRangeType || '';
					if (rangeType.includes('DOVI') || rangeType.includes('DoVi')) return 'Dolby Vision';
					if (rangeType.includes('HDR10Plus') || rangeType.includes('HDR10+')) return 'HDR10+';
					if (rangeType.includes('HDR10') || rangeType.includes('HDR')) return 'HDR10';
					if (rangeType.includes('HLG')) return 'HLG';
					if (videoStream.VideoRange === 'HDR') return 'HDR';
					return 'SDR';
				};

				// Get video codec with profile
				const getVideoCodec = () => {
					if (!videoStream) return 'Unknown';
					let codec = (videoStream.Codec || '').toUpperCase();
					if (codec === 'HEVC') codec = 'HEVC (H.265)';
					else if (codec === 'H264' || codec === 'AVC') codec = 'AVC (H.264)';
					else if (codec === 'AV1') codec = 'AV1';
					else if (codec === 'VP9') codec = 'VP9';

					if (videoStream.Profile) {
						codec += ` ${videoStream.Profile}`;
					}
					if (videoStream.Level) {
						codec += `@L${videoStream.Level}`;
					}
					return codec;
				};

				// Get audio codec with channels
				const getAudioCodec = () => {
					if (!audioStream) return 'Unknown';
					let codec = (audioStream.Codec || '').toUpperCase();
					if (codec === 'EAC3') codec = 'E-AC3 (Dolby Digital Plus)';
					else if (codec === 'AC3') codec = 'AC3 (Dolby Digital)';
					else if (codec === 'TRUEHD') codec = 'TrueHD';
					else if (codec === 'DTS') codec = 'DTS';
					else if (codec === 'AAC') codec = 'AAC';
					else if (codec === 'FLAC') codec = 'FLAC';

					return codec;
				};

				const getAudioChannels = () => {
					if (!audioStream) return 'Unknown';
					const channels = audioStream.Channels;
					if (!channels) return 'Unknown';
					if (channels === 8) return '7.1';
					if (channels === 6) return '5.1';
					if (channels === 2) return 'Stereo';
					if (channels === 1) return 'Mono';
					return `${channels} channels`;
				};

				return (
					<div className={css.trackModal} onClick={closeModal}>
						<div className={`${css.modalContent} ${css.videoInfoModal}`} onClick={stopPropagation}>
							<h2 className={css.modalTitle}>Playback Information</h2>
							<Scroller
								className={css.videoInfoContent}
								direction="vertical"
								horizontalScrollbar="hidden"
								verticalScrollbar="hidden"
							>
								{/* Playback Section */}
								<SpottableDiv className={css.infoSection} spotlightId="info-playback">
									<h3 className={css.infoHeader}>Playback</h3>
									<div className={`${css.infoRow} ${css.infoHighlight}`}>
										<span className={css.infoLabel}>Play Method</span>
										<span className={css.infoValue}>{playMethod || 'Unknown'}</span>
									</div>
									<div className={css.infoRow}>
										<span className={css.infoLabel}>Player</span>
										<span className={css.infoValue}>AVPlay (Native)</span>
									</div>
									<div className={css.infoRow}>
										<span className={css.infoLabel}>Container</span>
										<span className={css.infoValue}>
											{(mediaSource?.Container || 'Unknown').toUpperCase()}
										</span>
									</div>
									<div className={css.infoRow}>
										<span className={css.infoLabel}>Bitrate</span>
										<span className={css.infoValue}>
											{formatBitrate(mediaSource?.Bitrate)}
										</span>
									</div>
								</SpottableDiv>

								{/* Video Section */}
								{videoStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-video">
										<h3 className={css.infoHeader}>Video</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Resolution</span>
											<span className={css.infoValue}>
												{videoStream.Width}×{videoStream.Height}
												{videoStream.RealFrameRate && ` @ ${Math.round(videoStream.RealFrameRate)}fps`}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>HDR</span>
											<span className={css.infoValue}>{getHdrType()}</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Codec</span>
											<span className={css.infoValue}>{getVideoCodec()}</span>
										</div>
										{videoStream.BitRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>Video Bitrate</span>
												<span className={css.infoValue}>{formatBitrate(videoStream.BitRate)}</span>
											</div>
										)}
									</SpottableDiv>
								)}

								{/* Audio Section */}
								{audioStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-audio">
										<h3 className={css.infoHeader}>Audio</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Track</span>
											<span className={css.infoValue}>
												{audioStream.DisplayTitle || audioStream.Language || 'Unknown'}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Codec</span>
											<span className={css.infoValue}>{getAudioCodec()}</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Channels</span>
											<span className={css.infoValue}>{getAudioChannels()}</span>
										</div>
										{audioStream.BitRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>Audio Bitrate</span>
												<span className={css.infoValue}>{formatBitrate(audioStream.BitRate)}</span>
											</div>
										)}
										{audioStream.SampleRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>Sample Rate</span>
												<span className={css.infoValue}>{(audioStream.SampleRate / 1000).toFixed(1)} kHz</span>
											</div>
										)}
									</SpottableDiv>
								)}

								{/* Subtitle Section */}
								{subtitleStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-subtitles">
										<h3 className={css.infoHeader}>Subtitles</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Track</span>
											<span className={css.infoValue}>
												{subtitleStream.DisplayTitle || subtitleStream.Language || 'Unknown'}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Format</span>
											<span className={css.infoValue}>
												{(subtitleStream.Codec || 'Unknown').toUpperCase()}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>Type</span>
											<span className={css.infoValue}>
												{subtitleStream.IsExternal ? 'External' : 'Embedded'}
											</span>
										</div>
									</SpottableDiv>
								)}
							</Scroller>
							<p className={css.modalFooter}>Press BACK to close</p>
						</div>
					</div>
				);
			})()}

			{/* Subtitle Offset Modal */}
			<SubtitleOffsetOverlay
				visible={activeModal === 'subtitleOffset'}
				currentOffset={subtitleOffset}
				onClose={closeModal}
				onOffsetChange={handleSubtitleOffsetChange}
			/>

			{/* Subtitle Settings Modal */}
			<SubtitleSettingsOverlay
				visible={activeModal === 'subtitleSettings'}
				onClose={closeModal}
			/>
		</div>
	);
};

export default Player;
