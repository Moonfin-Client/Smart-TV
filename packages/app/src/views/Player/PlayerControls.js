import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import {getImageUrl} from '../../utils/helpers';
import {autocropLogoUrl} from '../../utils/logoAutocrop';
import {getServerUrl} from '../../services/jellyfinApi';
import TrickplayPreview from '../../components/TrickplayPreview';
import {isTrickplayOn} from '../../utils/trickplayLayout';
import SubtitleOffsetOverlay from './SubtitleOffsetOverlay';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';
import SecondarySubtitleSettingsOverlay from './SecondarySubtitleSettingsOverlay';
import {SECONDARY_DELAY_LIMIT_SECONDS} from './secondarySubtitle';
import SubtitleFetchIndicator, {useSubtitleFetchShown} from './SubtitleFetchIndicator';
import {getPlatform} from '../../platform';
import {ModalContainer} from '../../utils/spotlightContainers';
import {numberedTrackName, sortSubtitleStreams, subtitleTrackDetail, audioTrackDetail} from '../../utils/trackLabels';
import TrackOptionRow, {TrackDivider} from '../../components/TrackOptionRow';
import EpisodeBrowser from './EpisodeBrowser';
import PlaybackInfoModal from './PlaybackInfoModal';
import {
	SpottableButton, SpottableDiv,
	formatTime, getQualityPresets,
	IconPlay, IconPause, IconRewind, IconForward, IconSubtitle, IconSubtitleOff, IconAudio,
	IconChapters, IconEpisodes, IconPrevious, IconNext, IconQuality, IconInfo, IconCast, IconZoom,
	IconShuffle, IconRepeat, IconRepeatOne, IconSleep, IconGuide, IconChannels,
	IconFavorite, IconFavoriteFilled, IconPlaylistAdd, IconLyrics, IconQueueMusic, IconLiveRewind, IconLiveForward,
	IconLivePlay, IconLivePause, IconLiveTv, IconRecord, IconSeriesRecord, LIVE_RED
} from './PlayerConstants';
import {MARK_SKIPPED_GREY} from '../LiveTV/GuideIcons';
import LiveRecordingDialog, {LiveRecordingToast} from './LiveRecordingDialog';
import {recordPromptChannel} from '../../utils/recordAiring';
import {formatClockTime} from '../../utils/clock';
import {AT_LIVE_SECONDS} from './liveWindow';
import {episodeLine} from '../../utils/liveTvGuide';
import {chapterMarkerPositions} from '../../utils/chapterMarkers';
import {keepFocusInView} from '../../utils/focusScroll';
import {SLEEP_TIMER_MINUTES} from './useSleepTimer';
import {arrange, OSD_BUTTONS, OSD_ORDER_KEY, OSD_HIDDEN_KEY} from '../../utils/buttonLayout';
import {formatPlaybackTimeSlot, formatPlaybackTrailingTime} from '../../utils/playbackTimeLabels';
import { useSettings } from '../../context/SettingsContext';

import audioCss from './audio/AudioMode.module.less';

export const usePlayerButtons = ({
	isPaused, audioStreams, subtitleStreams, chapters,
	nextEpisode, isAudioMode, isLiveTV, liveRewind, atLive, hasNextTrack, hasPrevTrack,
	shuffleMode, repeatMode, selectedQuality,
	selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey,
	sleepMinutes, canBrowseEpisodes = false, isFavorite, hasLyrics, audioPanel, recordable, recordMark
}) => {
	const {settings} = useSettings();
	const topButtons = useMemo(() => {
		if (isAudioMode) {
			return [
				{id: 'shuffle', icon: <IconShuffle />, label: $L('Shuffle'), action: 'shuffle', active: shuffleMode},
				{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack', disabled: !hasPrevTrack && !shuffleMode},
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'},
				{id: 'next', icon: <IconNext />, label: $L('Next'), action: 'nextTrack', disabled: !hasNextTrack && repeatMode === 'off' && !shuffleMode},
				{id: 'repeat', icon: repeatMode === 'one' ? <IconRepeatOne /> : <IconRepeat />, label: $L('Repeat'), action: 'repeat', active: repeatMode !== 'off'}
			];
		}
		const buttons = [];
		if (!isLiveTV) {
			buttons.push(
				{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack'},
				{id: 'rewind', icon: <IconRewind />, label: $L('Seek back'), action: 'rewind'},
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'},
				{id: 'forward', icon: <IconForward />, label: $L('Seek forward'), action: 'forward'}
			);
			if (hasNextTrack) {
				buttons.push(
					{id: 'nextTrack', icon: <IconNext />, label: $L('Next'), action: 'nextTrack'}
				);
			} else if (nextEpisode) {
				buttons.push(
					{id: 'next', icon: <IconNext />, label: $L('Next Episode'), action: 'next'}
				);
			}
		} else {
			const playPause = {id: 'playPause', icon: isPaused ? <IconLivePlay /> : <IconLivePause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'};
			buttons.push(...(liveRewind ? [
				{id: 'rewind', icon: <IconLiveRewind />, label: $L('Seek back'), action: 'rewind'},
				playPause,
				{id: 'forward', icon: <IconLiveForward />, label: $L('Seek forward'), action: 'forward'},
				{id: 'jumpToLive', icon: <IconLiveTv color={atLive ? LIVE_RED : undefined} />, label: $L('Jump to Live'), action: 'jumpToLive'}
			] : [playPause]));
		}
		return buttons;
	}, [isPaused, isAudioMode, isLiveTV, liveRewind, atLive, nextEpisode, hasNextTrack, hasPrevTrack, shuffleMode, repeatMode]);

	const osdOrder = settings[OSD_ORDER_KEY];
	const osdHidden = settings[OSD_HIDDEN_KEY];

	const bottomButtons = useMemo(() => {
		// In audio mode these flank the transport, with the track actions on the left and the panel toggles on the right.
		if (isAudioMode) {
			return [
				{id: 'favorite', icon: isFavorite ? <IconFavoriteFilled /> : <IconFavorite />, label: $L('Favorite'), action: 'favorite', active: isFavorite, side: 'start'},
				{id: 'addToPlaylist', icon: <IconPlaylistAdd />, label: $L('Add to Playlist'), action: 'addToPlaylist', side: 'start'},
				// Without lyrics Up Next is the only panel, so there's nothing to toggle.
				...(hasLyrics ? [
					{id: 'lyrics', icon: <IconLyrics />, label: $L('Lyrics'), action: 'lyrics', active: audioPanel === 'lyrics', selected: audioPanel === 'lyrics'},
					{id: 'queue', icon: <IconQueueMusic />, label: $L('Up Next'), action: 'queue', active: audioPanel === 'queue', selected: audioPanel === 'queue'}
				] : [])
			];
		}
		// Declaration order is where a button the user never placed ends up, so keep it stable.
		// The live row's order comes from moonfin-core's live player.
		if (isLiveTV) {
			return arrange([
				{id: 'channels', icon: <IconChannels />, label: $L('Channels'), action: 'channels'},
				{id: 'guide', icon: <IconGuide />, label: $L('Guide'), action: 'guide'},
				...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
				...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
				{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality'},
				{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
				{id: 'sleep', icon: <IconSleep />, label: $L('Sleep timer'), action: 'sleep', active: sleepMinutes != null},
				...(recordable ? [{
					id: 'record',
					icon: recordMark === 'series' || recordMark === 'skipped'
						? <IconSeriesRecord color={recordMark === 'series' ? LIVE_RED : MARK_SKIPPED_GREY} />
						: <IconRecord color={recordMark === 'record' ? LIVE_RED : undefined} />,
					label: recordMark && recordMark !== 'skipped' ? $L('Cancel Recording') : $L('Record'),
					action: 'record'
				}] : []),
				{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
			], {order: osdOrder, hidden: osdHidden});
		}
		return arrange([
			...(chapters.length > 0 ? [{id: 'chapters', icon: <IconChapters />, label: $L('Chapters'), action: 'chapter'}] : []),
			// Only an episode has a season to browse, so a movie never gets this button.
			...(canBrowseEpisodes ? [{id: 'episodes', icon: <IconEpisodes />, label: $L('Episodes'), action: 'episodes'}] : []),
			...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
			...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
			// Core calls this castAndCrew and keeps cast for Chromecast, so hiding one there
			// must not take the other away here.
			{id: 'castAndCrew', icon: <IconCast />, label: $L('Cast & Crew'), action: 'cast', disabled: !hasCastMembers},
			{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality', active: selectedQuality != null},
			{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
			{id: 'sleep', icon: <IconSleep />, label: $L('Sleep timer'), action: 'sleep', active: sleepMinutes != null},
			{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
		], {order: osdOrder, hidden: osdHidden, catalogue: OSD_BUTTONS});
	}, [audioStreams.length, chapters.length, canBrowseEpisodes, subtitleStreams.length, isAudioMode, isLiveTV, selectedQuality, selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey, sleepMinutes, osdOrder, osdHidden, isFavorite, hasLyrics, audioPanel, recordable, recordMark]);

	return {topButtons, bottomButtons};
};

// The row shows the offset the strip it opens is set to.
const offsetLabel = (offset) => (offset ? `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s` : $L('None'));

// Mirrors the height clamp .mediaLogo sets in css (10vh, floor 70px, ceiling
// 160px) so the two stay in lockstep - this is what a logo renders at before
// any width-driven shrinking kicks in.
const LOGO_HEIGHT_VH = 0.10;
const LOGO_MIN_HEIGHT_PX = 70;
const LOGO_MAX_HEIGHT_PX = 160;
// A squarish logo comfortably clears this at the height above; a wide
// wordmark would not, which is exactly the case this trims down for.
const LOGO_MAX_WIDTH_VW = 0.34;

// A logo rendered at the normal height, straight off its aspect ratio - undefined
// until the autocrop pass resolves one, since a raw un-autocropped image still
// needs to render at something in the meantime.
const logoHeightPxFor = (aspectRatio, viewportWidth, viewportHeight) => {
	const normalHeight = Math.min(LOGO_MAX_HEIGHT_PX, Math.max(LOGO_MIN_HEIGHT_PX, viewportHeight * LOGO_HEIGHT_VH));
	if (!aspectRatio) return normalHeight;

	const maxWidth = viewportWidth * LOGO_MAX_WIDTH_VW;
	const widthAtNormalHeight = normalHeight * aspectRatio;
	return widthAtNormalHeight > maxWidth ? maxWidth / aspectRatio : normalHeight;
};

const PlayerControls = ({
	css,
	controlsVisible,
	isHdrContent = false,
	activeModal,
	isAudioMode,	isLiveTV,	focusRow,
	liveWindow,
	title,
	subtitle,
	logoUrl,
	liveProgram,
	topButtons,
	bottomButtons,
	displayTime,
	seekStepSeconds,
	duration,
	progressPercent,
	bufferedPercent,
	isSeeking,
	item,
	mediaSourceId,
	playMethod,
	selectedAudioIndex,
	selectedSubtitleIndex,
	selectedQuality,
	audioStreams,
	subtitleStreams,
	chapters,
	currentTime,
	subtitleOffset,
	subtitleTrackEvents,
	handleControlButtonClick,
	handleProgressClick,
	handleProgressKeyDown,
	handleProgressBlur,
	handleSelectAudio,
	handleSelectSubtitle,
	handleSubtitleKeyDown,
	handleSelectSleep,
	sleepMinutes,
	sleepRemainingSeconds,
	handleSelectQuality,
	handleSelectChapter,
	handleSelectEpisode,
	handleSelectCastMember,
	handleOpenSubtitleOffset,
	handleOpenSubtitleSettings,
	handleOpenRemoteSubtitleSearch,
	handleSelectRemoteSubtitle,
	canDownloadRemoteSubtitles,
	isSearchingRemoteSubtitles,
	isDownloadingRemoteSubtitle,
	remoteSubtitleError,
	remoteSubtitleResults,
	castMembers,
	isLoadingCastMembers,
	handleSubtitleOffsetChange,
	secondarySubtitleIndex,
	secondarySubtitleStreams,
	secondarySubtitleOffset,
	secondarySubtitleTrackEvents,
	handleChooseSubtitleSlot,
	handleSelectSecondarySubtitle,
	handleOpenSecondarySubtitleOffset,
	handleOpenSecondarySubtitleSettings,
	handleSecondarySubtitleOffsetChange,
	subtitleFetching,
	closeModal,
	stopPropagation,
	transcodeForced,
	videoRef,
	liveRecording
}) => {
	const { settings } = useSettings();
	const isTizenPlatform = getPlatform() === 'tizen';
	const [logoLoadFailed, setLogoLoadFailed] = useState(false);
	const [croppedLogoUrl, setCroppedLogoUrl] = useState(null);
	const [logoAspectRatio, setLogoAspectRatio] = useState(null);

	// A tag that resolved but whose image 404s (stale cache, server hiccup) should
	// still fall back to text instead of leaving a broken image in the corner.
	// Logos vary a lot in how much transparent padding is baked into the source
	// image, so the raw url renders first and is swapped for a trimmed version
	// once the autocrop pass resolves - keeps every logo reading the same size.
	useEffect(() => {
		setLogoLoadFailed(false);
		setCroppedLogoUrl(null);
		setLogoAspectRatio(null);
		if (!logoUrl) return undefined;
		let cancelled = false;
		autocropLogoUrl(logoUrl).then((result) => {
			if (cancelled) return;
			setCroppedLogoUrl(result?.url || null);
			setLogoAspectRatio(result?.aspectRatio || null);
		});
		return () => { cancelled = true; };
	}, [logoUrl]);

	const displayLogoUrl = croppedLogoUrl || logoUrl;

	// A wordmark-style logo (wide aspect ratio) renders far too big at the height a
	// squarish one is comfortable at, since nothing before this scaled height down
	// as width grew - see logoHeightPxFor.
	const [viewportSize, setViewportSize] = useState(() => ({width: window.innerWidth, height: window.innerHeight}));
	useEffect(() => {
		const handleResize = () => setViewportSize({width: window.innerWidth, height: window.innerHeight});
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);
	const logoHeightPx = useMemo(
		() => logoHeightPxFor(logoAspectRatio, viewportSize.width, viewportSize.height),
		[logoAspectRatio, viewportSize]
	);

	const handleLogoError = useCallback(() => {
		setLogoLoadFailed(true);
	}, []);

	// The list only stands in for itself once the work is done and there is
	// nothing to report instead.
	const remoteSubtitleBusy = isSearchingRemoteSubtitles || isDownloadingRemoteSubtitle;
	const showRemoteSubtitleResults = !remoteSubtitleBusy && !remoteSubtitleError;
	const showSubtitleFetch = useSubtitleFetchShown(subtitleFetching) && !isAudioMode;
	const controlsShown = controlsVisible && !activeModal;

	const subtitleSlotLabel = (index) => {
		const stream = subtitleStreams.find((s) => s.index === index);
		if (!stream) return $L('None');
		return stream.displayTitle || stream.language || $L('Subtitle');
	};

	// Every button carries its own tooltip and the stylesheet reveals the focused one,
	// so moving along the row doesn't re-render anything.
	const renderControlButton = (btn, row, defaultSpotlightId) => (
		<div key={btn.id} className={css.controlBtnWrapper}>
			<SpottableButton
				className={`${css.controlBtn} ${isLiveTV ? css.liveBtn : ''} ${btn.disabled ? css.controlBtnDisabled : ''} ${btn.active ? css.controlBtnActive : ''} ${btn.selected ? audioCss.toggleOn : ''}`}
				data-action={btn.action}
				onClick={btn.disabled ? undefined : handleControlButtonClick}
				aria-label={btn.label}
				aria-disabled={btn.disabled}
				spotlightDisabled={focusRow !== row}
				spotlightId={defaultSpotlightId}
			>
				{btn.icon}
			</SpottableButton>
			<div className={css.focusTooltip}>{btn.label}</div>
		</div>
	);

	const handleCastClick = useCallback((e) => {
		const index = Number(e.currentTarget.dataset.index);
		if (!Number.isFinite(index)) return;
		const person = castMembers[index];
		if (!person) return;
		handleSelectCastMember?.(person);
	}, [castMembers, handleSelectCastMember]);

	const durationMs = duration * 1000;
	const chapterMarks = useMemo(
		() => (settings.showChapterMarkers && !isAudioMode ? chapterMarkerPositions(chapters, durationMs) : []),
		[settings.showChapterMarkers, isAudioMode, chapters, durationMs]
	);

	const clampedProgress = Number.isFinite(progressPercent)
		? Math.max(0, Math.min(100, progressPercent))
		: 0;
	const clampedBuffered = Number.isFinite(bufferedPercent)
		? Math.max(clampedProgress, Math.min(100, bufferedPercent))
		: clampedProgress;

	// The video player gives each of the six slots its own setting. Music has one row
	// with elapsed on the left and a single configurable label on the right.
	const timeArgs = {position: displayTime, duration, clockDisplay: settings.clockDisplay, timeOffsetHours: settings.timeOffsetHours};
	const slotText = (settingKey) => formatPlaybackTimeSlot({slot: settings[settingKey], ...timeArgs});
	const aboveSlots = isAudioMode ? [] : [
		slotText('playbackTimeAboveLeft'),
		slotText('playbackTimeAboveCenter'),
		slotText('playbackTimeAboveRight')
	];
	const belowSlots = isAudioMode
		? [
			formatTime(displayTime),
			'',
			formatPlaybackTrailingTime({mode: settings.musicPlaybackTimeDisplay, ...timeArgs})
		]
		: [
			slotText('playbackTimeBelowLeft'),
			slotText('playbackTimeBelowCenter'),
			slotText('playbackTimeBelowRight')
		];
	// A row of nothing but hidden slots takes its margin with it rather than leaving a gap.
	const hasText = (slots) => slots.some((text) => text !== '');
	const renderTimeRow = (slots, rowClass, textClass) => (
		<div className={rowClass}>
			<span className={`${textClass} ${css.timeSlotCell} ${css.timeSlotLeft}`}>{slots[0]}</span>
			<span className={`${textClass} ${css.timeSlotCell} ${css.timeSlotCenter}`}>{slots[1]}</span>
			<span className={`${textClass} ${css.timeSlotCell} ${css.timeSlotRight}`}>{slots[2]}</span>
		</div>
	);

	return (
		<>
			<div className={`${css.playerControls} ${controlsShown ? css.visible : ''} ${isAudioMode ? css.audioControls : ''}`}>
				{!isAudioMode && (
				<div className={css.controlsTop}>
					{isLiveTV ? (
						<div className={css.liveTopRow}>
							{item?.ChannelNumber && <span className={css.channelBadge}>{item.ChannelNumber}</span>}
							<div className={css.liveChannelInfo}>
								<div className={css.liveChannelName}>{title}</div>
								{liveProgram?.Name && <div className={css.liveProgramName}>{liveProgram.Name}</div>}
							</div>
						</div>
					) : (
						<div className={css.mediaInfo}>
							{logoUrl && !logoLoadFailed ? (
								<>
									<img
										className={css.mediaLogo}
										style={{height: `${logoHeightPx}px`}}
										src={displayLogoUrl}
										alt={title}
										onError={handleLogoError}
									/>
									{subtitle && <h1 className={css.mediaTitle}>{subtitle}</h1>}
								</>
							) : subtitle ? (
								<>
									<p className={css.mediaSecondary}>{title}</p>
									<h1 className={css.mediaTitle}>{subtitle}</h1>
								</>
							) : (
								<h1 className={css.mediaTitle}>{title}</h1>
							)}
						</div>
					)}
				</div>
				)}

				<div className={css.controlsBottom} data-player-controls-bottom>
					{showSubtitleFetch && controlsShown && <SubtitleFetchIndicator />}
					{isLiveTV && (() => {
						// With a rewind window the bar runs from its start to the live point, the left
						// label is the time of day being watched and the right one how far behind live
						// it is. Otherwise it's the current program's span, or a clock and a LIVE tag
						// without guide data.
						const now = Date.now();
						const programEpisodeLine = episodeLine(liveProgram);
						let progress = 0;
						let startLabel;
						let endLabel;
						if (liveWindow) {
							const behind = Math.max(0, liveWindow.edge - displayTime);
							progress = Math.max(0, Math.min(1, (displayTime - liveWindow.start) / (liveWindow.edge - liveWindow.start)));
							startLabel = formatClockTime(new Date(now - behind * 1000), settings.clockDisplay);
							endLabel = behind <= AT_LIVE_SECONDS ? $L('LIVE') : `-${formatTime(behind)}`;
						} else {
							const start = liveProgram ? new Date(liveProgram.StartDate) : null;
							const end = liveProgram ? new Date(liveProgram.EndDate) : null;
							if (start && end) {
								progress = Math.max(0, Math.min(1, (now - start.getTime()) / (end.getTime() - start.getTime())));
							}
							startLabel = formatClockTime(start || new Date(), settings.clockDisplay);
							endLabel = end ? formatClockTime(end, settings.clockDisplay) : $L('LIVE');
						}
						return (
							<div className={css.liveTimeline}>
								{programEpisodeLine && (
									<div className={css.liveEpisodeTitle}>{programEpisodeLine}</div>
								)}
								{liveWindow ? (
									<SpottableDiv
										className={css.progressBar}
										onKeyDown={handleProgressKeyDown}
										onBlur={handleProgressBlur}
										spotlightDisabled={focusRow !== 'progress'}
										spotlightId="progress-bar"
									>
										<div className={css.progressFill} style={{transform: `scaleX(${progress})`, WebkitTransform: `scaleX(${progress})`}} />
										<div className={css.seekIndicator} style={{left: `${progress * 100}%`}} />
									</SpottableDiv>
								) : (
									<div className={css.liveProgressTrack}>
										{liveProgram && (
											<div className={css.liveProgressFill} style={{width: `${progress * 100}%`}} />
										)}
									</div>
								)}
								<div className={css.liveTimeLabels}>
									<span>{startLabel}</span>
									<span>{endLabel}</span>
								</div>
							</div>
						);
					})()}
					{!isLiveTV && (
					<div className={css.progressContainer}>
						{hasText(aboveSlots) && renderTimeRow(aboveSlots, css.timeInfoTop, css.timeEnd)}
						<SpottableDiv
							className={css.progressBar}
							onClick={handleProgressClick}
							onKeyDown={handleProgressKeyDown}
							onBlur={handleProgressBlur}
							tabIndex={0}
							spotlightDisabled={focusRow !== 'progress'}
							spotlightId="progress-bar"
						>
							{Number.isFinite(bufferedPercent) && (
								<div className={css.progressBuffered} style={{transform: `scaleX(${clampedBuffered / 100})`, WebkitTransform: `scaleX(${clampedBuffered / 100})`}} />
							)}
							<div className={css.progressFill} style={{transform: `scaleX(${clampedProgress / 100})`, WebkitTransform: `scaleX(${clampedProgress / 100})`}} />
							<div className={css.seekIndicator} style={{left: `${clampedProgress}%`}} />
							{/* Over the fill and the thumb, so a mark stays visible where it crosses the played part. */}
							{chapterMarks.map((ms) => (
								<div key={ms} className={css.chapterMark} style={{left: `${(ms / durationMs) * 100}%`}} />
							))}
							{!isAudioMode && isTrickplayOn(settings) && (
								<TrickplayPreview
									itemId={item.Id}
									mediaSourceId={mediaSourceId}
									positionTicks={displayTime * 10000000}
									durationTicks={durationMs * 10000}
									stepSeconds={seekStepSeconds}
									mode={settings.trickPlayMode}
									scalePercent={settings.trickPlayPreviewScale}
									verticalPercent={settings.trickPlayVerticalPosition}
									followScrub={settings.trickPlayFollowScrub}
									zoomMode={settings.playerZoomMode}
									visible={isSeeking}
									warm={controlsVisible}
								/>
							)}
						</SpottableDiv>
						{hasText(belowSlots) && renderTimeRow(belowSlots, css.timeInfo, css.timeDisplay)}
					</div>
					)}

					{!isAudioMode && (topButtons.length > 0 || bottomButtons.length > 0) && (
						<div className={css.videoControlsRow} data-player-controls-row>
							{topButtons.length > 0 && (
								<div className={css.transportButtons}>
									{topButtons.map((btn) => renderControlButton(btn, 'bottom', btn.id === 'playPause' ? 'play-pause-btn' : undefined))}
								</div>
							)}

							{bottomButtons.length > 0 && (
								<div className={css.controlButtonsBottom}>
						{bottomButtons.map((btn) => renderControlButton(btn, 'bottom'))}
								</div>
							)}
						</div>
					)}

					{isAudioMode && (
						<div className={audioCss.dock}>
							<div className={audioCss.dockSide}>
								{bottomButtons.filter((btn) => btn.side === 'start').map((btn) => renderControlButton(btn, 'bottom'))}
							</div>
							<div className={audioCss.dockCenter}>
								{topButtons.map((btn) => renderControlButton(btn, 'bottom', btn.id === 'playPause' ? 'play-pause-btn' : undefined))}
							</div>
							<div className={`${audioCss.dockSide} ${audioCss.dockEnd}`}>
								{bottomButtons.filter((btn) => btn.side !== 'start').map((btn) => renderControlButton(btn, 'bottom'))}
							</div>
						</div>
					)}
				</div>
			</div>

			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.modalTitle}>{$L('Audio Track')}</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => (
								<TrackOptionRow
									key={stream.index}
									label={numberedTrackName(i + 1, stream.displayTitle, $L('Audio'))}
									detail={audioTrackDetail({language: stream.language, displayTitle: stream.displayTitle, codec: stream.codec, channels: stream.channels})}
									selected={stream.index === selectedAudioIndex}
									data-index={stream.index}
									onClick={handleSelectAudio}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeModal} />
						</div>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.modalTitle}>{$L('Subtitle Track')}</h2>
						<div className={css.trackList}>
							<TrackOptionRow
								label={$L('None')}
								selected={selectedSubtitleIndex === -1}
								data-index={-1}
								onClick={handleSelectSubtitle}
								onKeyDown={handleSubtitleKeyDown}
							/>
							{sortSubtitleStreams(subtitleStreams, settings?.preferExternalSubtitles === true).map((stream, i) => (
								<TrackOptionRow
									key={stream.index}
									label={numberedTrackName(i + 1, stream.displayTitle, $L('Subtitle'))}
									detail={subtitleTrackDetail({name: stream.displayTitle, codec: stream.codec, language: stream.language, isExternal: stream.isExternal, deliveryMethod: stream.deliveryMethod, isForced: stream.isForced, isHearingImpaired: stream.isHearingImpaired})}
									selected={stream.index === selectedSubtitleIndex}
									data-index={stream.index}
									onClick={handleSelectSubtitle}
									onKeyDown={handleSubtitleKeyDown}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Offset')} detail={offsetLabel(subtitleOffset)} spotlightId="btn-subtitle-offset" onClick={handleOpenSubtitleOffset} />
							<TrackOptionRow label={$L('Appearance')} spotlightId="btn-subtitle-appearance" onClick={handleOpenSubtitleSettings} />
							{canDownloadRemoteSubtitles && (
								<TrackOptionRow
									label={$L('Download subtitles...')}
									detail={$L('Search using OpenSubtitles')}
									spotlightId="btn-subtitle-download"
									onClick={handleOpenRemoteSubtitleSearch}
								/>
							)}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeModal} />
						</div>
					</ModalContainer>
				</div>
			)}

			{showSubtitleFetch && !controlsShown && <SubtitleFetchIndicator standalone />}

			{activeModal === 'subtitleSlot' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="subtitleSlot" spotlightId="subtitleSlot-modal">
						<h2 className={css.modalTitle}>{$L('Subtitles')}</h2>
						<div className={css.trackList}>
							<TrackOptionRow
								label={$L('Primary')}
								detail={subtitleSlotLabel(selectedSubtitleIndex)}
								data-slot="primary"
								onClick={handleChooseSubtitleSlot}
							/>
							<TrackOptionRow
								label={$L('Secondary')}
								detail={subtitleSlotLabel(secondarySubtitleIndex)}
								data-slot="secondary"
								onClick={handleChooseSubtitleSlot}
							/>
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeModal} />
						</div>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'secondarySubtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="secondarySubtitle" spotlightId="secondarySubtitle-modal">
						<h2 className={css.modalTitle}>{$L('Secondary Subtitle Track')}</h2>
						<div className={css.trackList}>
							<TrackOptionRow
								label={$L('None')}
								selected={secondarySubtitleIndex == null}
								data-index={-1}
								onClick={handleSelectSecondarySubtitle}
							/>
							{secondarySubtitleStreams.map((stream, i) => (
								<TrackOptionRow
									key={stream.index}
									label={numberedTrackName(i + 1, stream.displayTitle, $L('Subtitle'))}
									detail={subtitleTrackDetail({name: stream.displayTitle, codec: stream.codec, language: stream.language, isExternal: stream.isExternal, deliveryMethod: stream.deliveryMethod, isForced: stream.isForced, isHearingImpaired: stream.isHearingImpaired})}
									selected={stream.index === secondarySubtitleIndex}
									data-index={stream.index}
									onClick={handleSelectSecondarySubtitle}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Offset')} detail={offsetLabel(secondarySubtitleOffset)} spotlightId="btn-secondary-subtitle-offset" onClick={handleOpenSecondarySubtitleOffset} />
							<TrackOptionRow label={$L('Appearance')} spotlightId="btn-secondary-subtitle-appearance" onClick={handleOpenSecondarySubtitleSettings} />
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeModal} />
						</div>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'subtitleDownload' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="subtitleDownload" spotlightId="subtitleDownload-modal">
						<h2 className={css.modalTitle}>{$L('Download Subtitles')}</h2>
						<div className={css.trackList}>
							{isSearchingRemoteSubtitles && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('Searching...')}</span>
								</SpottableDiv>
							)}
							{isDownloadingRemoteSubtitle && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('Downloading subtitle…')}</span>
								</SpottableDiv>
							)}
							{!remoteSubtitleBusy && remoteSubtitleError && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{remoteSubtitleError}</span>
								</SpottableDiv>
							)}
							{showRemoteSubtitleResults && remoteSubtitleResults.length === 0 && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('No remote subtitles found')}</span>
								</SpottableDiv>
							)}
							{showRemoteSubtitleResults && remoteSubtitleResults.map((remoteSubtitle, idx) => (
								<SpottableButton
									key={remoteSubtitle.id || idx}
									className={css.trackItem}
									data-index={idx}
									onClick={handleSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
									<span className={css.trackName}>{remoteSubtitle.name || $L('Subtitle')}</span>
									{remoteSubtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{remoteSubtitle.info}</span>}
									{remoteSubtitle.flags?.length > 0 && (
										<span className={css.subtitleFlags}>
											{remoteSubtitle.flags.map((flag) => (
												<span key={flag} className={css.subtitleFlag}>{flag}</span>
											))}
										</span>
									)}
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'record' && liveRecording?.available && (
				<LiveRecordingDialog
					css={css}
					recording={liveRecording}
					clockDisplay={settings.clockDisplay}
					channel={recordPromptChannel(item?.ChannelNumber, item?.Name)}
					onClose={closeModal}
					stopPropagation={stopPropagation}
				/>
			)}
			<LiveRecordingToast toast={liveRecording?.toast} onDone={liveRecording?.clearToast} />

			{activeModal === 'sleep' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="sleep" spotlightId="sleep-modal">
						<h2 className={css.modalTitle}>{$L('Sleep timer')}</h2>
						<div className={css.trackList}>
							<TrackOptionRow
								label={$L('Off')}
								selected={sleepMinutes == null}
								data-minutes="0"
								onClick={handleSelectSleep}
							/>
							{SLEEP_TIMER_MINUTES.map((minutes) => (
								<TrackOptionRow
									key={minutes}
									label={$L('{count} minutes').replace('{count}', minutes)}
									selected={minutes === sleepMinutes}
									data-minutes={minutes}
									onClick={handleSelectSleep}
								/>
							))}
						</div>
						{sleepMinutes != null && sleepRemainingSeconds > 0 && (
							<p className={css.modalFooter}>
								{$L('Stopping in {time}').replace('{time}', formatTime(sleepRemainingSeconds))}
							</p>
						)}
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'quality' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="quality" spotlightId="quality-modal">
						<h2 className={css.modalTitle}>{$L('Max Bitrate')}</h2>
						<div className={css.trackList}>
							{getQualityPresets().map((preset) => (
								<TrackOptionRow
									key={preset.value ?? 'auto'}
									label={preset.label}
									selected={selectedQuality === preset.value}
									data-value={preset.value === null ? 'null' : preset.value}
									onClick={handleSelectQuality}
								/>
							))}
						</div>
						<p className={css.modalFooter}>{$L('Current')}: {playMethod || $L('Unknown')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'episodes' && (
				<EpisodeBrowser
					item={item}
					logoUrl={logoLoadFailed ? null : displayLogoUrl}
					onLogoError={handleLogoError}
					onSelect={handleSelectEpisode}
					onClose={closeModal}
				/>
			)}

			{activeModal === 'chapter' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={`${css.modalContent} ${css.chaptersModal}`} onClick={stopPropagation} data-modal="chapter" spotlightId="chapter-modal">
						<h2 className={css.modalTitle}>{$L('Chapters')}</h2>
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
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'cast' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="cast" spotlightId="cast-modal">
						<h2 className={css.modalTitle}>{$L('Cast & Crew')}</h2>
						<div className={css.trackList}>
							{isLoadingCastMembers && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('Loading...')}</span>
								</SpottableDiv>
							)}
							{!isLoadingCastMembers && castMembers.length === 0 && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('No cast information available')}</span>
								</SpottableDiv>
							)}
							{!isLoadingCastMembers && castMembers.length > 0 && (
								<div className={css.castRow} onFocus={keepFocusInView}>
									{castMembers.map((person, index) => {
										const imageTag = person?.PrimaryImageTag || person?.ImageTag || person?.ImageTags?.Primary || null;
										const imageServer = person?._serverUrl || item?._serverUrl || getServerUrl();
										const imageUrl = getImageUrl(imageServer, person?.Id, 'Primary', {
											maxHeight: 220,
											quality: 90,
											tag: imageTag
										});

										return (
											<SpottableButton
												key={`${person.Id || person.Name || 'person'}-${index}`}
												className={css.castCard}
												data-index={index}
												data-selected={index === 0 ? 'true' : undefined}
												onClick={handleCastClick}
												aria-label={person.Name || $L('Unknown')}
											>
												<div className={css.castPhotoWrap}>
													{imageUrl ? (
														<img className={css.castPhoto} src={imageUrl} alt="" aria-hidden="true" />
													) : (
														<div className={css.castPhotoFallback}>{(person.Name || '?').charAt(0).toUpperCase()}</div>
													)}
												</div>
												<div className={css.castName}>{person.Name || $L('Unknown')}</div>
												<div className={css.castRole}>{person.Role || person.Type || $L('Cast')}</div>
											</SpottableButton>
										);
									})}
								</div>
							)}
						</div>
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'info' && (
				<PlaybackInfoModal
					playMethod={playMethod}
					selectedAudioIndex={selectedAudioIndex}
					selectedSubtitleIndex={selectedSubtitleIndex}
					maxBitrate={selectedQuality || settings.maxBitrate}
					transcodeForced={transcodeForced}
					isLiveTV={isLiveTV}
					item={item}
					liveProgram={liveProgram}
					isTizen={isTizenPlatform}
					videoRef={videoRef}
					onClose={closeModal}
				/>
			)}

			{activeModal === 'subtitleOffset' && (
				<SubtitleOffsetOverlay
					visible
					currentOffset={subtitleOffset}
					currentTime={currentTime}
					subtitleTrackEvents={subtitleTrackEvents}
					onClose={closeModal}
					onOffsetChange={handleSubtitleOffsetChange}
				/>
			)}

			{activeModal === 'secondarySubtitleOffset' && (
				<SubtitleOffsetOverlay
					visible
					currentOffset={secondarySubtitleOffset}
					currentTime={currentTime}
					subtitleTrackEvents={secondarySubtitleTrackEvents}
					onClose={closeModal}
					onOffsetChange={handleSecondarySubtitleOffsetChange}
					offsetLimitSeconds={SECONDARY_DELAY_LIMIT_SECONDS}
				/>
			)}

			{activeModal === 'secondarySubtitleSettings' && (
				<SecondarySubtitleSettingsOverlay
					onClose={closeModal}
					isHdr={isHdrContent}
				/>
			)}

			{activeModal === 'subtitleSettings' && (
				<SubtitleSettingsOverlay
					visible
					onClose={closeModal}
					isHdr={isHdrContent}
				/>
			)}
		</>
	);
};

export default PlayerControls;
