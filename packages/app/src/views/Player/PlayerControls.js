import {useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Scroller from '@enact/sandstone/Scroller';
import * as playback from '../../services/playback';
import {getImageUrl} from '../../utils/helpers';
import {getServerUrl} from '../../services/jellyfinApi';
import TrickplayPreview from '../../components/TrickplayPreview';
import SubtitleOffsetOverlay from './SubtitleOffsetOverlay';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';
import {isHdrVideoStream} from '../../utils/videoRange';
import {getPlatform} from '../../platform';
import {ModalContainer} from '../../utils/spotlightContainers';
import {numberedTrackName, trackName, sortSubtitleStreams, subtitleTrackDetail, audioTrackDetail} from '../../utils/trackLabels';
import {
	SpottableButton, SpottableDiv,
	formatTime, getQualityPresets,
	IconPlay, IconPause, IconRewind, IconForward, IconSubtitle, IconSubtitleOff, IconAudio,
	IconChapters, IconPrevious, IconNext, IconQuality, IconInfo, IconCast, IconZoom,
	IconShuffle, IconRepeat, IconRepeatOne, IconSleep, IconGuide
} from './PlayerConstants';
import {formatClockTime} from '../../utils/clock';
import {keepFocusInView} from '../../utils/focusScroll';
import {SLEEP_TIMER_MINUTES} from './useSleepTimer';
import {arrange, OSD_ORDER_KEY, OSD_HIDDEN_KEY} from '../../utils/buttonLayout';
import {formatPlaybackTimeSlot, formatPlaybackTrailingTime} from '../../utils/playbackTimeLabels';
import { useSettings } from '../../context/SettingsContext';

export const usePlayerButtons = ({
	isPaused, audioStreams, subtitleStreams, chapters,
	nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
	shuffleMode, repeatMode, selectedQuality,
	selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey,
	sleepMinutes
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
				{id: 'rewind', icon: <IconRewind />, label: $L('Seek Back'), action: 'rewind'},
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'},
				{id: 'forward', icon: <IconForward />, label: $L('Seek Forward'), action: 'forward'}
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
			buttons.push(
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'}
			);
		}
		return buttons;
	}, [isPaused, isAudioMode, isLiveTV, nextEpisode, hasNextTrack, hasPrevTrack, shuffleMode, repeatMode]);

	const osdOrder = settings[OSD_ORDER_KEY];
	const osdHidden = settings[OSD_HIDDEN_KEY];

	const bottomButtons = useMemo(() => {
		if (isAudioMode) {
			return [];
		}
		// Declaration order is where a button the user never placed ends up, so keep it stable.
		// The live row's order comes from moonfin-core's live player.
		if (isLiveTV) {
			return arrange([
				{id: 'guide', icon: <IconGuide />, label: $L('Guide'), action: 'guide'},
				...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
				...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
				{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality'},
				{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
				{id: 'sleep', icon: <IconSleep />, label: $L('Sleep Timer'), action: 'sleep', active: sleepMinutes != null},
				{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
			], {order: osdOrder, hidden: osdHidden});
		}
		return arrange([
			...(chapters.length > 0 ? [{id: 'chapters', icon: <IconChapters />, label: $L('Chapters'), action: 'chapter'}] : []),
			...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
			...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
			// Core calls this castAndCrew and keeps cast for Chromecast, so hiding one there
			// must not take the other away here.
			{id: 'castAndCrew', icon: <IconCast />, label: $L('Cast and Crew'), action: 'cast', disabled: !hasCastMembers},
			{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality', active: selectedQuality != null},
			{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
			{id: 'sleep', icon: <IconSleep />, label: $L('Sleep Timer'), action: 'sleep', active: sleepMinutes != null},
			{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
		], {order: osdOrder, hidden: osdHidden});
	}, [audioStreams.length, chapters.length, subtitleStreams.length, isAudioMode, isLiveTV, selectedQuality, selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey, sleepMinutes, osdOrder, osdHidden]);

	return {topButtons, bottomButtons};
};

export const formatBitrate = (bitrate) => {
	if (!bitrate) return $L('Unknown');
	if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
	if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
	return `${bitrate} bps`;
};

export const getHdrType = (videoStream) => {
	if (!isHdrVideoStream(videoStream)) return 'SDR';
	const rangeType = videoStream.VideoRangeType || '';
	if (rangeType.includes('DOVI') || rangeType.includes('DoVi')) return 'Dolby Vision';
	if (rangeType.includes('HDR10Plus') || rangeType.includes('HDR10+')) return 'HDR10+';
	if (rangeType.includes('HDR10') || rangeType.includes('HDR')) return 'HDR10';
	if (rangeType.includes('HLG')) return 'HLG';
	return 'HDR';
};

export const getVideoCodec = (videoStream) => {
	if (!videoStream) return $L('Unknown');
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

export const getAudioCodec = (audioStream) => {
	if (!audioStream) return $L('Unknown');
	let codec = (audioStream.Codec || '').toUpperCase();
	if (codec === 'EAC3') codec = 'E-AC3 (Dolby Digital Plus)';
	else if (codec === 'AC3') codec = 'AC3 (Dolby Digital)';
	else if (codec === 'TRUEHD') codec = 'TrueHD';
	else if (codec === 'DTS') codec = 'DTS';
	else if (codec === 'AAC') codec = 'AAC';
	else if (codec === 'FLAC') codec = 'FLAC';
	return codec;
};

export const getAudioChannels = (audioStream) => {
	if (!audioStream) return $L('Unknown');
	const channels = audioStream.Channels;
	if (!channels) return $L('Unknown');
	if (channels === 8) return '7.1';
	if (channels === 6) return '5.1';
	if (channels === 2) return $L('Stereo');
	if (channels === 1) return $L('Mono');
	return `${channels} ${$L('channels')}`;
};

const PlayerControls = ({
	css,
	controlsVisible,
	isHdrContent = false,
	activeModal,
	isAudioMode,	isLiveTV,	focusRow,
	title,
	subtitle,
	liveProgram,
	topButtons,
	bottomButtons,
	displayTime,
	duration,
	progressPercent,
	bufferedPercent,
	isSeeking,
	seekPosition,
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
	handleSelectCastMember,
	handleOpenSubtitleOffset,
	handleOpenSubtitleSettings,
	handleOpenRemoteSubtitleSearch,
	handleSelectRemoteSubtitle,
	canDownloadRemoteSubtitles,
	isSearchingRemoteSubtitles,
	remoteSubtitleResults,
	castMembers,
	isLoadingCastMembers,
	handleSubtitleOffsetChange,
	closeModal,
	stopPropagation,
	renderInfoPlaybackRows,
	renderInfoVideoExtra
}) => {
	const { settings } = useSettings();
	const isTizenPlatform = getPlatform() === 'tizen';
	const [focusedTooltip, setFocusedTooltip] = useState(null);

	const handleTooltipFocus = useCallback((e) => {
		const label = e.currentTarget.dataset.tooltip;
		if (!label) return;
		setFocusedTooltip(label);
	}, []);

	const handleTooltipBlur = useCallback(() => {
		setFocusedTooltip(null);
	}, []);

	const renderControlButton = useCallback((btn, row, defaultSpotlightId) => (
		<div key={btn.id} className={css.controlBtnWrapper}>
			<SpottableButton
				className={`${css.controlBtn} ${isLiveTV ? css.liveBtn : ''} ${btn.disabled ? css.controlBtnDisabled : ''} ${btn.active ? css.controlBtnActive : ''}`}
				data-action={btn.action}
				data-tooltip={btn.label}
				onClick={btn.disabled ? undefined : handleControlButtonClick}
				onFocus={handleTooltipFocus}
				onBlur={handleTooltipBlur}
				aria-label={btn.label}
				aria-disabled={btn.disabled}
				spotlightDisabled={focusRow !== row}
				spotlightId={defaultSpotlightId}
			>
				{btn.icon}
			</SpottableButton>
			{focusedTooltip === btn.label && (
				<div className={css.focusTooltip}>{btn.label}</div>
			)}
		</div>
	), [css.controlBtn, css.controlBtnActive, css.controlBtnDisabled, css.controlBtnWrapper, css.focusTooltip, css.liveBtn, isLiveTV, focusRow, focusedTooltip, handleControlButtonClick, handleTooltipBlur, handleTooltipFocus]);

	const handleCastClick = useCallback((e) => {
		const index = Number(e.currentTarget.dataset.index);
		if (!Number.isFinite(index)) return;
		const person = castMembers[index];
		if (!person) return;
		handleSelectCastMember?.(person);
	}, [castMembers, handleSelectCastMember]);

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
			<div className={`${css.playerControls} ${controlsVisible && !activeModal ? css.visible : ''} ${isAudioMode ? css.audioControls : ''}`}>
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
							{subtitle ? (
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

				<div className={css.controlsBottom}>
					{isLiveTV && (() => {
						// The live timeline is the current program's span, not a seek bar.
						// Without guide data it falls back to a clock and a LIVE tag.
						const now = Date.now();
						const start = liveProgram ? new Date(liveProgram.StartDate) : null;
						const end = liveProgram ? new Date(liveProgram.EndDate) : null;
						const progress = start && end
							? Math.max(0, Math.min(1, (now - start.getTime()) / (end.getTime() - start.getTime())))
							: 0;
						return (
							<div className={css.liveTimeline}>
								{liveProgram?.EpisodeTitle && (
									<div className={css.liveEpisodeTitle}>{liveProgram.EpisodeTitle}</div>
								)}
								<div className={css.liveProgressTrack}>
									{liveProgram && (
										<div className={css.liveProgressFill} style={{width: `${progress * 100}%`}} />
									)}
								</div>
								<div className={css.liveTimeLabels}>
									<span>{formatClockTime(start || new Date(), settings.clockDisplay)}</span>
									<span>{end ? formatClockTime(end, settings.clockDisplay) : $L('LIVE')}</span>
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
							<div className={css.progressBuffered} style={{transform: `scaleX(${clampedBuffered / 100})`, WebkitTransform: `scaleX(${clampedBuffered / 100})`}} />
							<div className={css.progressFill} style={{transform: `scaleX(${clampedProgress / 100})`, WebkitTransform: `scaleX(${clampedProgress / 100})`}} />
							<div className={css.seekIndicator} style={{left: `${clampedProgress}%`}} />
							{isSeeking && !isAudioMode && settings.trickPlayEnabled !== false && (
								<TrickplayPreview
									itemId={item.Id}
									mediaSourceId={mediaSourceId}
									positionTicks={seekPosition}
									visible
								/>
							)}
						</SpottableDiv>
						{hasText(belowSlots) && renderTimeRow(belowSlots, css.timeInfo, css.timeDisplay)}
					</div>
					)}

					{!isAudioMode && (topButtons.length > 0 || bottomButtons.length > 0) && (
						<div className={css.videoControlsRow}>
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

					{isAudioMode && topButtons.length > 0 && (
						<div className={css.audioTransportButtons}>
							{topButtons.map((btn) => renderControlButton(btn, 'bottom', btn.id === 'playPause' ? 'play-pause-btn' : undefined))}
						</div>
					)}
				</div>
			</div>

			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.modalTitle}>{$L('Select Audio Track')}</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => {
								const detail = audioTrackDetail({language: stream.language, displayTitle: stream.displayTitle, codec: stream.codec, channels: stream.channels});
								return (
									<SpottableButton
										key={stream.index}
										className={`${css.trackItem} ${stream.index === selectedAudioIndex ? css.selected : ''}`}
										data-index={stream.index}
										data-selected={stream.index === selectedAudioIndex ? 'true' : undefined}
										onClick={handleSelectAudio}
									>
										<span className={css.trackName}>{numberedTrackName(i + 1, stream.displayTitle, $L('Audio'))}</span>
										{detail && <span className={css.trackInfo}>{detail}</span>}
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.modalTitle}>{$L('Select Subtitle')}</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${selectedSubtitleIndex === -1 ? css.selected : ''}`}
								data-index={-1}
								data-selected={selectedSubtitleIndex === -1 ? 'true' : undefined}
								onClick={handleSelectSubtitle}
								onKeyDown={handleSubtitleKeyDown}
							>
								<span className={css.trackName}>{$L('Off')}</span>
							</SpottableButton>
							{sortSubtitleStreams(subtitleStreams).map((stream, i) => (
								<SpottableButton
									key={stream.index}
									className={`${css.trackItem} ${stream.index === selectedSubtitleIndex ? css.selected : ''}`}
									data-index={stream.index}
									data-selected={stream.index === selectedSubtitleIndex ? 'true' : undefined}
									onClick={handleSelectSubtitle}
									onKeyDown={handleSubtitleKeyDown}
								>
									<span className={css.trackName}>{trackName(i + 1, stream.displayTitle, $L('Subtitle'))}</span>
									<span className={css.trackInfo}>{subtitleTrackDetail({name: stream.displayTitle, codec: stream.codec, language: stream.language, isExternal: stream.isExternal, deliveryMethod: stream.deliveryMethod, isForced: stream.isForced, isHearingImpaired: stream.isHearingImpaired})}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>
							<SpottableButton spotlightId="btn-subtitle-offset" className={css.actionBtn} onClick={handleOpenSubtitleOffset}>{$L('Offset')}</SpottableButton>
							<SpottableButton spotlightId="btn-subtitle-appearance" className={css.actionBtn} onClick={handleOpenSubtitleSettings} style={{marginLeft: 15}}>{$L('Appearance')}</SpottableButton>
							{canDownloadRemoteSubtitles && (
								<SpottableButton spotlightId="btn-subtitle-download" className={css.actionBtn} onClick={handleOpenRemoteSubtitleSearch} style={{marginLeft: 15}}>
									{$L('Download')}
								</SpottableButton>
							)}
						</p>
						<p className={css.modalFooter} style={{marginTop: 5, fontSize: 14, opacity: 0.5}}>{$L('Press BACK to close')}</p>
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
							{!isSearchingRemoteSubtitles && remoteSubtitleResults.length === 0 && (
								<SpottableDiv className={css.trackItem}>
									<span className={css.trackName}>{$L('No remote subtitles found')}</span>
								</SpottableDiv>
							)}
							{!isSearchingRemoteSubtitles && remoteSubtitleResults.map((remoteSubtitle, idx) => (
								<SpottableButton
									key={remoteSubtitle.id || idx}
									className={css.trackItem}
									data-index={idx}
									onClick={handleSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
											<span className={css.trackName}>{remoteSubtitle.name || $L('Subtitle')}</span>
											{remoteSubtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{remoteSubtitle.info}</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{activeModal === 'sleep' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="sleep" spotlightId="sleep-modal">
						<h2 className={css.modalTitle}>{$L('Sleep Timer')}</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${sleepMinutes == null ? css.selected : ''}`}
								data-minutes="0"
								data-selected={sleepMinutes == null ? 'true' : undefined}
								onClick={handleSelectSleep}
							>
								<span className={css.trackName}>{$L('Off')}</span>
							</SpottableButton>
							{SLEEP_TIMER_MINUTES.map((minutes) => (
								<SpottableButton
									key={minutes}
									className={`${css.trackItem} ${minutes === sleepMinutes ? css.selected : ''}`}
									data-minutes={minutes}
									data-selected={minutes === sleepMinutes ? 'true' : undefined}
									onClick={handleSelectSleep}
								>
									<span className={css.trackName}>{$L('{count} minutes').replace('{count}', minutes)}</span>
								</SpottableButton>
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
								<SpottableButton
									key={preset.value ?? 'auto'}
									className={`${css.trackItem} ${selectedQuality === preset.value ? css.selected : ''}`}
									data-value={preset.value === null ? 'null' : preset.value}
									data-selected={selectedQuality === preset.value ? 'true' : undefined}
									onClick={handleSelectQuality}
								>
									<span className={css.trackName}>{preset.label}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>{$L('Current')}: {playMethod || $L('Unknown')}</p>
					</ModalContainer>
				</div>
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
						<h2 className={css.modalTitle}>{$L('Cast and Crew')}</h2>
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

			{activeModal === 'info' && (() => {
				const session = playback.getCurrentSession();
				const mediaSource = session?.mediaSource;
				const truehdCodecProbe = session?.capabilities?.truehdCodecSupported;
				const truehdCodecProbeStatus = truehdCodecProbe === true
					? $L('Supported')
					: truehdCodecProbe === false
						? $L('Not Supported')
						: $L('Unknown');
				const videoStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Video');
				const audioStream = mediaSource?.MediaStreams?.find(s => s.Index === selectedAudioIndex) ||
					mediaSource?.MediaStreams?.find(s => s.Type === 'Audio');
				const subtitleStream = selectedSubtitleIndex >= 0
					? mediaSource?.MediaStreams?.find(s => s.Index === selectedSubtitleIndex)
					: null;

				return (
					<div className={css.trackModal} onClick={closeModal}>
						<div className={`${css.modalContent} ${css.videoInfoModal}`} onClick={stopPropagation}>
							<h2 className={css.modalTitle}>{$L('Playback Information')}</h2>
							<Scroller
								className={css.videoInfoContent}
								direction="vertical"
								horizontalScrollbar="hidden"
								verticalScrollbar="hidden"
							>
								<SpottableDiv className={css.infoSection} spotlightId="info-playback">
									<h3 className={css.infoHeader}>{$L('Playback')}</h3>
									<div className={`${css.infoRow} ${css.infoHighlight}`}>
										<span className={css.infoLabel}>{$L('Play Method')}</span>
										<span className={css.infoValue}>{playMethod || $L('Unknown')}</span>
									</div>
									{renderInfoPlaybackRows && renderInfoPlaybackRows({css, mediaSource, playMethod})}
									<div className={css.infoRow}>
										<span className={css.infoLabel}>{$L('Container')}</span>
										<span className={css.infoValue}>
											{(mediaSource?.Container || $L('Unknown')).toUpperCase()}
										</span>
									</div>
									<div className={css.infoRow}>
										<span className={css.infoLabel}>{$L('Bitrate')}</span>
										<span className={css.infoValue}>
											{formatBitrate(mediaSource?.Bitrate)}
										</span>
									</div>
									{isTizenPlatform && (
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Experimental TrueHD')}</span>
											<span className={css.infoValue}>
												{settings.experimentalTruehd ? $L('Enabled') : $L('Disabled')}
											</span>
										</div>
									)}
									{isTizenPlatform && (
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('TrueHD Codec Probe')}</span>
											<span className={css.infoValue}>{truehdCodecProbeStatus}</span>
										</div>
									)}
								</SpottableDiv>

								{videoStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-video">
										<h3 className={css.infoHeader}>{$L('Video')}</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Resolution')}</span>
											<span className={css.infoValue}>
												{videoStream.Width}×{videoStream.Height}
												{videoStream.RealFrameRate && ` @ ${Math.round(videoStream.RealFrameRate)}fps`}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('HDR')}</span>
											<span className={css.infoValue}>{getHdrType(videoStream)}</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Codec')}</span>
											<span className={css.infoValue}>{getVideoCodec(videoStream)}</span>
										</div>
										{renderInfoVideoExtra && renderInfoVideoExtra({css, videoStream})}
										{videoStream.BitRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>{$L('Video Bitrate')}</span>
												<span className={css.infoValue}>{formatBitrate(videoStream.BitRate)}</span>
											</div>
										)}
									</SpottableDiv>
								)}

								{audioStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-audio">
										<h3 className={css.infoHeader}>{$L('Audio')}</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Track')}</span>
											<span className={css.infoValue}>
												{audioStream.DisplayTitle || audioStream.Language || $L('Unknown')}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Codec')}</span>
											<span className={css.infoValue}>{getAudioCodec(audioStream)}</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Channels')}</span>
											<span className={css.infoValue}>{getAudioChannels(audioStream)}</span>
										</div>
										{audioStream.BitRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>{$L('Audio Bitrate')}</span>
												<span className={css.infoValue}>{formatBitrate(audioStream.BitRate)}</span>
											</div>
										)}
										{audioStream.SampleRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>{$L('Sample Rate')}</span>
												<span className={css.infoValue}>{(audioStream.SampleRate / 1000).toFixed(1)} kHz</span>
											</div>
										)}
									</SpottableDiv>
								)}

								{subtitleStream && (
									<SpottableDiv className={css.infoSection} spotlightId="info-subtitles">
										<h3 className={css.infoHeader}>{$L('Subtitles')}</h3>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Track')}</span>
											<span className={css.infoValue}>
												{subtitleStream.DisplayTitle || subtitleStream.Language || $L('Unknown')}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Format')}</span>
											<span className={css.infoValue}>
												{(subtitleStream.Codec || $L('Unknown')).toUpperCase()}
											</span>
										</div>
										<div className={css.infoRow}>
											<span className={css.infoLabel}>{$L('Type')}</span>
											<span className={css.infoValue}>
												{subtitleStream.IsExternal ? $L('External') : $L('Embedded')}
											</span>
										</div>
									</SpottableDiv>
								)}
							</Scroller>
							<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
						</div>
					</div>
				);
			})()}

			<SubtitleOffsetOverlay
				visible={activeModal === 'subtitleOffset'}
				currentOffset={subtitleOffset}
				currentTime={currentTime}
				subtitleTrackEvents={subtitleTrackEvents}
				onClose={closeModal}
				onOffsetChange={handleSubtitleOffsetChange}
			/>

			<SubtitleSettingsOverlay
				visible={activeModal === 'subtitleSettings'}
				onClose={closeModal}
				isHdr={isHdrContent}
			/>
		</>
	);
};

export default PlayerControls;
