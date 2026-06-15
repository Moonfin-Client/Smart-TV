import {useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Scroller from '@enact/sandstone/Scroller';
import * as playback from '../../services/playback';
import {getImageUrl} from '../../utils/helpers';
import {getServerUrl} from '../../services/jellyfinApi';
import TrickplayPreview from '../../components/TrickplayPreview';
import SubtitleOffsetOverlay from './SubtitleOffsetOverlay';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';
import {getPlatform} from '../../platform';
import {
	SpottableButton, SpottableDiv, ModalContainer,
	formatTime, formatEndTime, PLAYBACK_RATES, getQualityPresets,
	IconPlay, IconPause, IconRewind, IconForward, IconSubtitle, IconSubtitleOff, IconAudio,
	IconChapters, IconPrevious, IconNext, PlaybackRateLabel, IconQuality, IconInfo, IconCast, IconZoom,
	IconShuffle, IconRepeat, IconRepeatOne, IconFavorite, IconFavoriteFilled
} from './PlayerConstants';
import { useSettings } from '../../context/SettingsContext';

export const usePlayerButtons = ({
	isPaused, audioStreams, subtitleStreams, chapters,
	nextEpisode, isAudioMode, isLiveTV, hasNextTrack, hasPrevTrack,
	shuffleMode, repeatMode, isFavorite, playbackRate, selectedQuality,
	selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey
}) => {
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
			if (hasPrevTrack) {
				buttons.push(
					{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack'}
				);
			}
			buttons.push(
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

	const bottomButtons = useMemo(() => {
		if (isAudioMode) {
			return [];
		}
		if (isLiveTV) {
			return [
				...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitle', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
				...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
				{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality'},
				{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
				{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
			];
		}
		return [
			{id: 'speed', icon: <PlaybackRateLabel value={playbackRate} />, label: $L('Playback Speed'), action: 'speed', active: playbackRate !== 1},
			...(chapters.length > 0 ? [{id: 'chapters', icon: <IconChapters />, label: $L('Chapters'), action: 'chapter'}] : []),
			...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitle', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
			...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
			{id: 'cast', icon: <IconCast />, label: $L('Cast and Crew'), action: 'cast', disabled: !hasCastMembers},
			{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality', active: selectedQuality != null},
			{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
			{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
		];
	}, [audioStreams.length, chapters.length, subtitleStreams.length, isAudioMode, isLiveTV, playbackRate, selectedQuality, selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey]);

	const favoriteButton = useMemo(() => {
		if (!isAudioMode) return null;
		return {id: 'favorite', icon: isFavorite ? <IconFavoriteFilled /> : <IconFavorite />, label: $L('Favorite'), action: 'favorite', active: isFavorite};
	}, [isAudioMode, isFavorite]);

	return {topButtons, bottomButtons, favoriteButton};
};

export const formatBitrate = (bitrate) => {
	if (!bitrate) return $L('Unknown');
	if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
	if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
	return `${bitrate} bps`;
};

export const getHdrType = (videoStream) => {
	if (!videoStream) return 'SDR';
	const rangeType = videoStream.VideoRangeType || '';
	if (rangeType.includes('DOVI') || rangeType.includes('DoVi')) return 'Dolby Vision';
	if (rangeType.includes('HDR10Plus') || rangeType.includes('HDR10+')) return 'HDR10+';
	if (rangeType.includes('HDR10') || rangeType.includes('HDR')) return 'HDR10';
	if (rangeType.includes('HLG')) return 'HLG';
	if (videoStream.VideoRange === 'HDR') return 'HDR';
	return 'SDR';
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
	activeModal,
	isAudioMode,	isLiveTV,	focusRow,
	title,
	subtitle,
	topButtons,
	bottomButtons,
	favoriteButton,
	displayTime,
	duration,
	progressPercent,
	bufferedPercent,
	isSeeking,
	seekPosition,
	item,
	mediaSourceId,
	playMethod,
	playbackRate,
	selectedAudioIndex,
	selectedSubtitleIndex,
	selectedQuality,
	audioStreams,
	subtitleStreams,
	chapters,
	currentTime,
	subtitleOffset,
	showSkipIntro,
	handleControlButtonClick,
	handleProgressClick,
	handleProgressKeyDown,
	handleProgressBlur,
	handleSkipIntro,
	handleSelectAudio,
	handleSelectSubtitle,
	handleSubtitleKeyDown,
	handleSelectSpeed,
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
				className={`${css.controlBtn} ${btn.disabled ? css.controlBtnDisabled : ''} ${btn.active ? css.controlBtnActive : ''}`}
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
	), [css.controlBtn, css.controlBtnActive, css.controlBtnDisabled, css.controlBtnWrapper, css.focusTooltip, focusRow, focusedTooltip, handleControlButtonClick, handleTooltipBlur, handleTooltipFocus]);

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

	return (
		<>
			{showSkipIntro && !isAudioMode && !isLiveTV && !activeModal && !controlsVisible && (
				<div className={css.skipOverlay}>
					<SpottableButton className={css.skipButton} onClick={handleSkipIntro} spotlightId="skip-intro-btn">
						{$L('Skip Intro')}
					</SpottableButton>
				</div>
			)}

			<div className={`${css.playerControls} ${controlsVisible && !activeModal ? css.visible : ''} ${isAudioMode ? css.audioControls : ''}`}>
				{!isAudioMode && (
				<div className={css.controlsTop}>
					<div className={css.mediaInfo}>
						<h1 className={css.mediaTitle}>{title}</h1>
						{subtitle && <p className={css.mediaSubtitle}>{subtitle}</p>}
					</div>
				</div>
				)}

				<div className={css.controlsBottom}>
					{isAudioMode && favoriteButton && (
						<div className={css.audioFavoriteRow}>
							<div className={css.controlBtnWrapper}>
								<SpottableButton
									className={`${css.controlBtn} ${favoriteButton.active ? css.controlBtnActive : ''}`}
									data-action={favoriteButton.action}
									data-tooltip={favoriteButton.label}
									onClick={handleControlButtonClick}
									onFocus={handleTooltipFocus}
									onBlur={handleTooltipBlur}
									aria-label={favoriteButton.label}
									spotlightDisabled={focusRow !== 'top'}
									spotlightId="favorite-btn"
								>
									{favoriteButton.icon}
								</SpottableButton>
								{focusedTooltip === favoriteButton.label && (
									<div className={css.focusTooltip}>{favoriteButton.label}</div>
								)}
							</div>
						</div>
					)}

					{!isLiveTV && (
					<div className={css.progressContainer}>
						<div className={css.timeInfoTop}>
							<span className={css.timeEnd}>{formatEndTime(duration - displayTime, settings.clockDisplay)}</span>
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
							<div className={css.progressBuffered} style={{width: `${clampedBuffered}%`}} />
							<div className={css.progressFill} style={{width: `${clampedProgress}%`}} />
							<div className={css.seekIndicator} style={{left: `${clampedProgress}%`}} />
							{isSeeking && !isAudioMode && (
								<TrickplayPreview
									itemId={item.Id}
									mediaSourceId={mediaSourceId}
									positionTicks={seekPosition}
									visible
									style={{left: `${clampedProgress}%`}}
								/>
							)}
						</SpottableDiv>
						<div className={css.timeInfo}>
							<span className={css.timeDisplay}>
								{formatTime(displayTime)} / {formatTime(duration)}
							</span>
						</div>
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
									{stream.isForced && <span className={css.trackInfo}>{$L('Forced')}</span>}
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

			{activeModal === 'speed' && (
				<div className={css.trackModal} onClick={closeModal}>
					<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="speed" spotlightId="speed-modal">
						<h2 className={css.modalTitle}>{$L('Playback Speed')}</h2>
						<div className={css.trackList}>
							{PLAYBACK_RATES.map((rate) => (
								<SpottableButton
									key={rate}
									className={`${css.trackItem} ${rate === playbackRate ? css.selected : ''}`}
									data-rate={rate}
									data-selected={rate === playbackRate ? 'true' : undefined}
									onClick={handleSelectSpeed}
								>
									<span className={css.trackName}>{rate === 1 ? $L('Normal') : `${rate}x`}</span>
								</SpottableButton>
							))}
						</div>
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
								<div className={css.castRow}>
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
				onClose={closeModal}
				onOffsetChange={handleSubtitleOffsetChange}
			/>

			<SubtitleSettingsOverlay
				visible={activeModal === 'subtitleSettings'}
				onClose={closeModal}
			/>
		</>
	);
};

export default PlayerControls;
