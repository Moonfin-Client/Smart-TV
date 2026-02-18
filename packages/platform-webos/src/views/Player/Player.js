import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import Scroller from '@enact/sandstone/Scroller';
import Hls from 'hls.js';
import * as playback from '../../services/playback';
import {getImageUrl} from '../../utils/helpers';
import {getServerUrl} from '../../services/jellyfinApi';
import {
	initLunaAPI,
	registerAppStateObserver,
	keepScreenOn,
	cleanupVideoElement,
	setupVisibilityHandler,
	setupWebOSLifecycle
} from '../../services/webosVideo';
import {useSettings} from '../../context/SettingsContext';
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

const NextEpisodeContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
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

// Playback speed options
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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

const IconChapters = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="m160-800 80 160h120l-80-160h80l80 160h120l-80-160h80l80 160h120l-80-160h120q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Zm0 240v320h640v-320H160Zm0 0v320-320Z"/>
	</svg>
);

const IconPrevious = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z"/>
	</svg>
);

const IconNext = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
		<path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
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

const Player = ({item, resume, initialAudioIndex, initialSubtitleIndex, onEnded, onBack, onPlayNext, audioPlaylist}) => {
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
	const [isDolbyVision, setIsDolbyVision] = useState(false);

	// Audio playlist tracking
	const audioPlaylistIndex = useMemo(() => {
		if (!audioPlaylist || !item) return -1;
		return audioPlaylist.findIndex(t => t.Id === item.Id);
	}, [audioPlaylist, item]);
	const hasNextTrack = audioPlaylist && audioPlaylistIndex >= 0 && audioPlaylistIndex < audioPlaylist.length - 1;
	const hasPrevTrack = audioPlaylist && audioPlaylistIndex > 0;

	// Detect Dolby Vision from a mediaSource's video stream VideoRangeType.
	// DV content must bypass hls.js (MSE) to preserve RPU metadata.
	// The native <video> element feeds the full bitstream to the hardware DV decoder.
	const detectDolbyVision = useCallback((mediaSource) => {
		const videoStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Video');
		const rangeType = (videoStream?.VideoRangeType || '').toUpperCase();
		return rangeType.includes('DOVI') || rangeType === 'DOLBYVISION';
	}, []);

	const videoRef = useRef(null);
	const hlsRef = useRef(null);
	const positionRef = useRef(0);
	const playSessionRef = useRef(null);
	const runTimeRef = useRef(0);
	const healthMonitorRef = useRef(null);
	const nextEpisodeTimerRef = useRef(null);
	const hasTriggeredNextEpisodeRef = useRef(false);
	const unregisterAppStateRef = useRef(null);
	const controlsTimeoutRef = useRef(null);
	const hlsRecoveryRef = useRef({ attempts: 0, lastErrorTime: 0 });
	const lastSeekTargetRef = useRef(null);
	const seekingTranscodeRef = useRef(false);
	const seekDebounceTimerRef = useRef(null);
	const transcodeOffsetTicksRef = useRef(0);
	const transcodeOffsetDetectedRef = useRef(true);
	const playbackStartTimeoutRef = useRef(null);

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
			setIsLoading(true);
			setError(null);

			setShowNextEpisode(false);
			setShowSkipCredits(false);
			setNextEpisodeCountdown(null);
			setShowSkipIntro(false);
			setNextEpisode(null);
			if (nextEpisodeTimerRef.current) {
				clearInterval(nextEpisodeTimerRef.current);
				nextEpisodeTimerRef.current = null;
			}

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
					// Cross-server support: pass item for server credential lookup
					item: item
				});

				setMediaUrl(result.url);
				setMimeType(result.mimeType || 'video/mp4');
				setPlayMethod(result.playMethod);
				setMediaSourceId(result.mediaSourceId);
				setIsDolbyVision(detectDolbyVision(result.mediaSource));
				playSessionRef.current = result.playSessionId;

				positionRef.current = startPosition;
				hlsRecoveryRef.current = { attempts: 0, lastErrorTime: 0 };
				lastSeekTargetRef.current = null;
				seekingTranscodeRef.current = false;

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
				} else if (defaultAudio) {
					setSelectedAudioIndex(defaultAudio.index);
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

			const videoTime = videoElement ? videoElement.currentTime : 0;
			const videoTicks = Math.floor(videoTime * 10000000) + transcodeOffsetTicksRef.current;
			const currentPos = videoTicks > 0 ? videoTicks : positionRef.current;

			const intendedStart = positionRef.current;
			const playedMeaningfully = videoTicks > 100000000;
			if (currentPos > 0 && (playedMeaningfully || intendedStart === 0)) {
				console.log('[Player] Reporting stop at position:', currentPos, 'ticks');
				playback.reportStop(currentPos);
			} else {
				console.log('[Player] Skipping reportStop - position too small:', currentPos,
					'videoTime:', videoTime, 'intendedStart:', intendedStart);
			}

			playback.stopProgressReporting();
			playback.stopHealthMonitoring();

			if (nextEpisodeTimerRef.current) {
				clearInterval(nextEpisodeTimerRef.current);
			}
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
			if (seekDebounceTimerRef.current) {
				clearTimeout(seekDebounceTimerRef.current);
			}

			cleanupVideoElement(videoElement);
		};
	}, [item, resume, selectedQuality, settings.maxBitrate, settings.preferTranscode, settings.forceDirectPlay, settings.subtitleMode, settings.skipIntro, initialAudioIndex, initialSubtitleIndex, detectDolbyVision]);

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

		try {
			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}

			const result = await playback.getPlaybackInfo(item.Id, {
				startPositionTicks: seekPositionTicks,
				maxBitrate: selectedQuality || settings.maxBitrate,
				enableDirectPlay: false,
				enableDirectStream: false,
				enableTranscoding: true,
				item: item
			});

			if (result.url) {
				positionRef.current = seekPositionTicks;
				lastSeekTargetRef.current = seekPositionTicks;
				transcodeOffsetTicksRef.current = seekPositionTicks;
				transcodeOffsetDetectedRef.current = false;

				hlsRecoveryRef.current = { attempts: 0, lastErrorTime: 0 };

				setMediaUrl(result.url);
				setPlayMethod(result.playMethod);
				setMimeType(result.mimeType || 'video/mp4');
				setIsDolbyVision(detectDolbyVision(result.mediaSource));
				playSessionRef.current = result.playSessionId;

				console.log('[Player] seekInTranscode: new stream loaded at', seekPositionTicks / 10000000, 'seconds');
			}
		} catch (err) {
			console.error('[Player] seekInTranscode failed:', err);
			setError('Failed to seek - please try again');
		} finally {
			seekingTranscodeRef.current = false;
		}
	}, [item, selectedQuality, settings.maxBitrate, detectDolbyVision]);

	// Seek relative to current position with debounced transcode re-requests.
	// updateSeekPosition: also update the seekbar UI during scrubbing.
	const seekByOffset = useCallback((deltaSec, updateSeekPosition) => {
		const baseTime = (playMethod === 'Transcode')
			? ((lastSeekTargetRef.current != null ? lastSeekTargetRef.current : positionRef.current) / 10000000)
			: (videoRef.current ? videoRef.current.currentTime : 0);
		const newTime = Math.max(0, Math.min(duration, baseTime + deltaSec));
		const newTicks = Math.floor(newTime * 10000000);
		if (updateSeekPosition) setSeekPosition(newTicks);
		positionRef.current = newTicks;
		lastSeekTargetRef.current = newTicks;
		if (playMethod === 'Transcode') {
			setCurrentTime(newTime);
			if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
			seekingTranscodeRef.current = false;
			seekDebounceTimerRef.current = setTimeout(() => {
				seekInTranscode(lastSeekTargetRef.current);
			}, 600);
		} else if (videoRef.current) {
			videoRef.current.currentTime = newTime;
		}
	}, [duration, playMethod, seekInTranscode]);

	const seekToTicks = useCallback((ticks) => {
		if (!videoRef.current) return;
		positionRef.current = ticks;
		lastSeekTargetRef.current = ticks;
		if (playMethod === 'Transcode') {
			seekInTranscode(ticks);
		} else {
			videoRef.current.currentTime = ticks / 10000000;
		}
	}, [playMethod, seekInTranscode]);

	useEffect(() => {
		const video = videoRef.current;
		console.log('[Player] Video src useEffect - video exists:', !!video, 'mediaUrl:', !!mediaUrl, 'isLoading:', isLoading);

		if (!video || !mediaUrl || isLoading) return;

		console.log('[Player] Setting video src via ref:', mediaUrl);
		console.log('[Player] PlayMethod:', playMethod, 'MimeType:', mimeType);

		// Set webOS-specific attributes that React doesn't handle well
		video.setAttribute('webkit-playsinline', '');
		video.setAttribute('playsinline', '');
		video.setAttribute('preload', 'auto');

		const isHls = mediaUrl.includes('.m3u8') || mimeType === 'application/x-mpegURL';

		// Dolby Vision content must use the native <video> HLS player, not hls.js.
		// hls.js uses MSE (Media Source Extensions) which strips DV RPU NALUs during
		// demuxing, causing the TV to fall back to the HDR10 base layer. The native
		// player feeds the full bitstream to the hardware decoder, preserving DV metadata.
		const useNativeHls = isHls && isDolbyVision;

		if (hlsRef.current) {
			console.log('[Player] Destroying existing HLS instance');
			hlsRef.current.destroy();
			hlsRef.current = null;
		}

		const setSourceAndPlay = async () => {
			if (isHls && !useNativeHls) {
				if (Hls.isSupported()) {
					console.log('[Player] Using hls.js for HLS playback');

					const hlsStartPosition = (playMethod === 'Transcode' && positionRef.current > 0)
						? positionRef.current / 10000000
						: -1; // -1 = default (start of playlist)

					const hls = new Hls({
						debug: false,
						enableWorker: true,
						lowLatencyMode: false,
						backBufferLength: 90,
						maxBufferLength: 60,
						maxMaxBufferLength: 120,
						startPosition: hlsStartPosition,
						startFragPrefetch: true,
						testBandwidth: true,
						progressive: true,
						fragLoadingMaxRetry: 10,
						fragLoadingRetryDelay: 1000,
						manifestLoadingMaxRetry: 6,
						manifestLoadingRetryDelay: 1000,
						levelLoadingMaxRetry: 6,
						levelLoadingRetryDelay: 1000
					});

					hlsRef.current = hls;

					hls.on(Hls.Events.MEDIA_ATTACHED, () => {
						console.log('[Player] HLS media attached');
						hls.loadSource(mediaUrl);
					});

					hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
						console.log('[Player] HLS manifest parsed, levels:', data.levels.length);
						video.play().then(() => {
							console.log('[Player] HLS play() promise resolved');
						}).catch(err => {
							console.error('[Player] HLS play() promise rejected:', err);
						});
					});

					hls.on(Hls.Events.ERROR, (event, data) => {
						console.error('[Player] HLS error:', data.type, data.details);
						if (data.fatal) {
							switch (data.type) {
								case Hls.ErrorTypes.NETWORK_ERROR:
									console.log('[Player] HLS fatal network error, trying to recover');
									hls.startLoad();
									break;
								case Hls.ErrorTypes.MEDIA_ERROR: {
									// Time-gated recovery limiting
									const now = performance.now();
									const recovery = hlsRecoveryRef.current;

									if (recovery.attempts === 0 || (now - recovery.lastErrorTime > 3000)) {
										hlsRecoveryRef.current = { attempts: 1, lastErrorTime: now };
										console.log('[Player] HLS fatal media error, attempt 1 - recoverMediaError');
										hls.recoverMediaError();
									} else if (recovery.attempts === 1) {
										hlsRecoveryRef.current = { attempts: 2, lastErrorTime: now };
										console.log('[Player] HLS fatal media error, attempt 2 - swapAudioCodec + recoverMediaError');
										hls.swapAudioCodec();
										hls.recoverMediaError();
									} else {
										console.error('[Player] HLS media error unrecoverable after', recovery.attempts, 'attempts');
										hlsRecoveryRef.current = { attempts: 0, lastErrorTime: 0 };

										if (playMethod === 'Transcode') {
											const seekTarget = lastSeekTargetRef.current != null
												? lastSeekTargetRef.current
												: positionRef.current;
											console.log('[Player] Requesting new transcode stream at position', seekTarget, 'ticks');
											seekInTranscode(seekTarget);
										} else {
											hls.destroy();
											hlsRef.current = null;
											setError('Playback failed - media error could not be recovered');
										}
									}
									break;
								}
								default:
									console.error('[Player] HLS unrecoverable error');
									hls.destroy();
									hlsRef.current = null;
									break;
							}
						}
					});

					hls.attachMedia(video);
					return;
				} else {
					console.warn('[Player] HLS not supported, falling back to direct playback');
				}
			}

			if (useNativeHls) {
				console.log('[Player] Using native HLS for Dolby Vision — bypassing hls.js to preserve DV RPU metadata');
			}

			console.log('[Player] Setting video source now');
			video.src = mediaUrl;
			video.load();

			// Start a playback timeout for non-HLS streams (DirectPlay/DirectStream).
			// Some formats (e.g. AVI) are listed as platform-supported by LG but may
			// silently fail in the HTML5 <video> element without firing an error event,
			// resulting in a black screen. If no timeupdate fires within 8 seconds,
			// synthetically trigger the error handler to fall back to transcoding.
			if (playbackStartTimeoutRef.current) {
				clearTimeout(playbackStartTimeoutRef.current);
			}
			const onFirstTimeUpdate = () => {
				clearTimeout(playbackStartTimeoutRef.current);
				playbackStartTimeoutRef.current = null;
				video.removeEventListener('timeupdate', onFirstTimeUpdate);
			};
			video.addEventListener('timeupdate', onFirstTimeUpdate);
			playbackStartTimeoutRef.current = setTimeout(() => {
				video.removeEventListener('timeupdate', onFirstTimeUpdate);
				// Check if playback actually started
				if (video.currentTime === 0 && (video.readyState < 3 || video.paused)) {
					console.warn('[Player] Playback start timeout — no timeupdate received in 8s, triggering error handler');
					console.warn('[Player] Video state:', { readyState: video.readyState, networkState: video.networkState, paused: video.paused, currentSrc: video.currentSrc });
					video.dispatchEvent(new Event('error'));
				}
			}, 8000);

			video.play().then(() => {
				console.log('[Player] play() promise resolved');
			}).catch(err => {
				console.error('[Player] play() promise rejected:', err);
			});
		};

		setSourceAndPlay();

		return () => {
			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}
			if (playbackStartTimeoutRef.current) {
				clearTimeout(playbackStartTimeoutRef.current);
				playbackStartTimeoutRef.current = null;
			}
		};
	}, [mediaUrl, isLoading, mimeType, playMethod, isDolbyVision, seekInTranscode]);

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

	const cancelNextEpisodeCountdown = useCallback(() => {
		if (nextEpisodeTimerRef.current) {
			clearInterval(nextEpisodeTimerRef.current);
			nextEpisodeTimerRef.current = null;
		}
		setNextEpisodeCountdown(null);
		setShowNextEpisode(false);
		setShowSkipCredits(false);
	}, []);

	const handlePlayNextEpisode = useCallback(async () => {
		if (nextEpisode && onPlayNext) {
			cancelNextEpisodeCountdown();
			await playback.reportStop(positionRef.current);
			onPlayNext(nextEpisode);
		}
	}, [nextEpisode, onPlayNext, cancelNextEpisodeCountdown]);

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

	// Auto-focus next episode popup when it appears
	useEffect(() => {
		if ((showSkipCredits || showNextEpisode) && nextEpisode && !activeModal) {
			setControlsVisible(false);
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
			const timer = setTimeout(() => {
				const defaultBtn = document.querySelector('[data-spot-default="true"]');
				if (defaultBtn) {
					Spotlight.focus(defaultBtn);
				}
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [showSkipCredits, showNextEpisode, nextEpisode, activeModal]);

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
		playback.reportStart(positionRef.current);
		playback.startProgressReporting(() => positionRef.current);
		playback.startHealthMonitoring(handleUnhealthy);
		healthMonitorRef.current = playback.getHealthMonitor();
	}, [handleUnhealthy]);

	const handlePause = useCallback(() => {
		setIsPaused(true);
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

			if (mediaSegments && settings.skipIntro) {
				const {introStart, introEnd, creditsStart} = mediaSegments;

				if (introStart !== null && introEnd !== null) {
					const inIntro = ticks >= introStart && ticks < introEnd;
					setShowSkipIntro(inIntro);
				}

				if (creditsStart !== null && nextEpisode) {
					const inCredits = ticks >= creditsStart;
					if (inCredits && !showSkipCredits) {
						// Auto-skip credits if setting enabled
						if (settings.skipCredits) {
							handlePlayNextEpisode();
							return;
						}
						setShowSkipCredits(true);
						if (settings.autoPlay) {
							startNextEpisodeCountdown();
						}
					}
				}
			}

			if (nextEpisode && runTimeRef.current > 0) {
				const remaining = runTimeRef.current - ticks;
				const nearEnd = remaining < 300000000;
				if (nearEnd && !showNextEpisode && !showSkipCredits && !hasTriggeredNextEpisodeRef.current) {
					setShowNextEpisode(true);
					hasTriggeredNextEpisodeRef.current = true;
					if (settings.autoPlay) {
						startNextEpisodeCountdown();
					}
				}
			}
		}
	}, [playMethod, mediaSegments, settings.skipIntro, settings.skipCredits, settings.autoPlay, nextEpisode, showSkipCredits, showNextEpisode, startNextEpisodeCountdown, handlePlayNextEpisode, subtitleTrackEvents, subtitleOffset]);

	const handleWaiting = useCallback(() => {
		setIsBuffering(true);
		if (healthMonitorRef.current) {
			healthMonitorRef.current.recordBuffer();
		}
	}, []);

	const handlePlaying = useCallback(() => {
		setIsBuffering(false);
		hlsRecoveryRef.current = { attempts: 0, lastErrorTime: 0 };
		if (!seekDebounceTimerRef.current) {
			lastSeekTargetRef.current = null;
		}
	}, []);

	const handleEnded = useCallback(async () => {
		await playback.reportStop(positionRef.current);

		// Cleanup video element before navigating to next episode or exiting
		// This ensures hardware decoder is released
		cleanupVideoElement(videoRef.current);

		// Auto-advance to next track in audio playlist
		if (hasNextTrack && onPlayNext) {
			onPlayNext(audioPlaylist[audioPlaylistIndex + 1]);
		} else if (nextEpisode && onPlayNext) {
			onPlayNext(nextEpisode);
		} else {
			onEnded?.();
		}
	}, [onEnded, onPlayNext, nextEpisode, hasNextTrack, audioPlaylist, audioPlaylistIndex]);

	const handleError = useCallback(async () => {
		const video = videoRef.current;
		let errorMessage = 'Playback failed.';

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
			console.log('[Player] DirectPlay failed, falling back to transcode...');
			setHasTriedTranscode(true);

			try {
				const result = await playback.getPlaybackInfo(item.Id, {
					startPositionTicks: positionRef.current,
					maxBitrate: selectedQuality || settings.maxBitrate,
					enableDirectPlay: false,
					enableDirectStream: false,
					enableTranscoding: true,
					// Cross-server support: pass item for server credential lookup
					item: item
				});

				if (result.url) {
					// Give the server a moment to prepare the transcode stream
					console.log('[Player] Waiting for transcode to initialize...');
					await new Promise(resolve => setTimeout(resolve, 1500));

					setMediaUrl(result.url);
					setPlayMethod(result.playMethod);
					setMimeType(result.mimeType || 'video/mp4');
					setIsDolbyVision(detectDolbyVision(result.mediaSource));
					playSessionRef.current = result.playSessionId;
					return;
				}
			} catch (fallbackErr) {
				console.error('[Player] Transcode fallback failed:', fallbackErr);
				errorMessage = 'Transcoding failed. The server may not support this format.';
			}
		}

		setError(errorMessage);
	}, [hasTriedTranscode, playMethod, item, selectedQuality, settings.maxBitrate, detectDolbyVision]);

	const handleImageError = useCallback((e) => {
		e.target.style.display = 'none';
	}, []);

	const handleBack = useCallback(async () => {
		cancelNextEpisodeCountdown();
		const currentPos = videoRef.current
			? Math.floor(videoRef.current.currentTime * 10000000) + transcodeOffsetTicksRef.current
			: positionRef.current;
		await playback.reportStop(currentPos);

		cleanupVideoElement(videoRef.current);

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

	const handleSkipIntro = useCallback(() => {
		if (mediaSegments?.introEnd && videoRef.current) {
			seekToTicks(mediaSegments.introEnd);
		}
		setShowSkipIntro(false);
	}, [mediaSegments, seekToTicks]);

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

		// Reset fallback flag so the DirectPlay→Transcode fallback can trigger again
		// if the new audio track also fails at the decoder level.
		setHasTriedTranscode(false);

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
				setIsDolbyVision(detectDolbyVision(result.mediaSource));
			}
		} catch (err) {
			console.error('[Player] Failed to change audio:', err);
		}
	}, [playMethod, closeModal, audioStreams, detectDolbyVision]);

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
			const nextEpisodeVisible = (showSkipCredits || showNextEpisode) && nextEpisode && !activeModal;

			// When next episode popup is showing, block all keys except Back and Enter
			if (nextEpisodeVisible) {
				if (key === 'GoBack' || key === 'Backspace' || e.keyCode === 461 || e.keyCode === 8 || e.keyCode === 27) {
					e.preventDefault();
					e.stopPropagation();
					cancelNextEpisodeCountdown();
					return;
				}
				// Let Enter through for Spotlight button activation
				if (key === 'Enter' || e.keyCode === 13) {
					return;
				}
				// Allow Left/Right for navigating between buttons
				if (key === 'ArrowLeft' || e.keyCode === 37 || key === 'ArrowRight' || e.keyCode === 39) {
					return;
				}
				// Block everything else
				e.preventDefault();
				e.stopPropagation();
				return;
			}

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
					// Apply the seek step immediately
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
						if (prev === 'bottom') return 'progress';
						if (prev === 'progress') return 'top';
						return 'top'; // Already at top, stay there
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

			// Play/Pause with Enter when controls not focused
			if ((key === 'Enter' || e.keyCode === 13) && !controlsVisible) {
				handlePlayPause();
				return;
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [controlsVisible, activeModal, closeModal, hideControls, handleBack, showControls, handlePlayPause, handleForward, handleRewind, currentTime, settings.seekStep, seekByOffset, showNextEpisode, showSkipCredits, nextEpisode, cancelNextEpisodeCountdown, bottomButtons.length]);

	const displayTime = isSeeking ? (seekPosition / 10000000) : currentTime;
	const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

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
		<div className={css.container} onClick={showControls}>
			{/* Video/Audio Element - Hidden visually for audio mode */}
			<video
				ref={videoRef}
				className={css.videoPlayer}
				style={isAudioMode ? {opacity: 0, pointerEvents: 'none'} : undefined}
				autoPlay
				onLoadedMetadata={handleLoadedMetadata}
				onPlay={handlePlay}
				onPause={handlePause}
				onTimeUpdate={handleTimeUpdate}
				onWaiting={handleWaiting}
				onPlaying={handlePlaying}
				onEnded={handleEnded}
				onError={handleError}
			/>

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

			{/* Custom Subtitle Overlay - webOS doesn't support native <track> elements */}
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
					<div
						className={css.subtitleText}
						style={{
							fontSize: `${settings.subtitleSize === 'small' ? 36 : settings.subtitleSize === 'medium' ? 44 : settings.subtitleSize === 'large' ? 52 : 60}px`,
							backgroundColor: `${settings.subtitleBackgroundColor || '#000000'}${Math.round(((settings.subtitleBackground !== undefined ? settings.subtitleBackground : 75) / 100) * 255).toString(16).padStart(2, '0')}`,
							color: settings.subtitleColor || '#ffffff',
							textShadow: `0 0 ${settings.subtitleShadowBlur || 0.1}em ${settings.subtitleShadowColor || '#000000'}${Math.round(((settings.subtitleShadowOpacity !== undefined ? settings.subtitleShadowOpacity : 50) / 100) * 255).toString(16).padStart(2, '0')}`
						}}
						// eslint-disable-next-line react/no-danger
						dangerouslySetInnerHTML={{
							__html: currentSubtitleText
								.replace(/\\N/gi, '<br/>')
								.replace(/\r?\n/gi, '<br/>')
								.replace(/{\\.*?}/gi, '') // Remove ASS/SSA style tags
								.replace(/ {2,}/g, ' ')  // Collapse multiple spaces left by tag removal
								.trim()
						}}
					/>
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

			{/* Playback Speed Indicator */}
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
								onKeyDown={handleSubtitleKeyDown}
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
									onKeyDown={handleSubtitleKeyDown}
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

				const formatBitrate = (bitrate) => {
					if (!bitrate) return 'Unknown';
					if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
					if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
					return `${bitrate} bps`;
				};

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

				const getTranscodeReason = () => {
					if (playMethod !== 'Transcode') return null;
					const url = mediaSource?.TranscodingUrl || '';
					const reasons = [];
					if (url.includes('TranscodeReasons=')) {
						const match = url.match(/TranscodeReasons=([^&]+)/);
						if (match) {
							// TranscodeReasons is a comma-separated list from the server
							const serverReasons = decodeURIComponent(match[1]).split(',');
							serverReasons.forEach(r => {
								const formatted = r.replace(/([A-Z])/g, ' $1').trim();
								reasons.push(formatted);
							});
						}
					}
					return reasons.length > 0 ? reasons.join(', ') : 'Unknown';
				};

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
									{playMethod === 'Transcode' && (
										<div className={`${css.infoRow} ${css.infoWarning}`}>
											<span className={css.infoLabel}>Transcode Reason</span>
											<span className={css.infoValue}>{getTranscodeReason()}</span>
										</div>
									)}
									<div className={css.infoRow}>
										<span className={css.infoLabel}>Container</span>
										<span className={css.infoValue}>
											{(mediaSource?.Container || 'Unknown').toUpperCase()}
										</span>
									</div>
									<div className={css.infoRow}>
										<span className={css.infoLabel}>HDR</span>
										<span className={css.infoValue}>{getHdrType()}</span>
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
											<span className={css.infoLabel}>Codec</span>
											<span className={css.infoValue}>{getVideoCodec()}</span>
										</div>
										{videoStream.BitDepth && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>Bit Depth</span>
												<span className={css.infoValue}>{videoStream.BitDepth}-bit</span>
											</div>
										)}
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
