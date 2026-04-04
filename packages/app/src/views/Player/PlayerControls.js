/**
 * PlayerControls — shared player controls overlay, skip button, and modals.
 *
 * Used by both TizenPlayer and WebOSPlayer to eliminate ~400 lines of
 * duplicated rendering code. Platform-specific parts (next-episode overlay,
 * info-modal playback rows) are injected via props.
 */
import {useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Scroller from '@enact/sandstone/Scroller';
import * as playback from '../../services/playback';
import TrickplayPreview from '../../components/TrickplayPreview';
import SubtitleOffsetOverlay from './SubtitleOffsetOverlay';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';
import {
	SpottableButton, SpottableDiv, ModalContainer,
	formatTime, formatEndTime, PLAYBACK_RATES, getQualityPresets,
	IconPlay, IconPause, IconRewind, IconForward, IconSubtitle, IconAudio,
	IconChapters, IconPrevious, IconNext, IconSpeed, IconQuality, IconInfo
} from './PlayerConstants';
import { useSettings } from '../../context/SettingsContext';

// ============================================================
// usePlayerControls — shared button / state logic
// ============================================================

/**
 * Builds the top and bottom button arrays used by the controls overlay.
 * Call from the platform player and pass the results to <PlayerControls>.
 */
export const usePlayerButtons = ({
	isPaused, audioStreams, subtitleStreams, chapters,
	nextEpisode, isAudioMode, hasNextTrack, hasPrevTrack
}) => {
	const topButtons = useMemo(() => {
		const buttons = [
			{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'}
		];
		if (isAudioMode) {
			buttons.unshift(
				{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack', disabled: !hasPrevTrack}
			);
			buttons.push(
				{id: 'next', icon: <IconNext />, label: $L('Next'), action: 'nextTrack', disabled: !hasNextTrack}
			);
		} else {
			buttons.push(
				{id: 'rewind', icon: <IconRewind />, label: $L('Rewind'), action: 'rewind'},
				{id: 'forward', icon: <IconForward />, label: $L('Forward'), action: 'forward'},
				{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio', disabled: audioStreams.length === 0},
				{id: 'subtitle', icon: <IconSubtitle />, label: $L('Subtitles'), action: 'subtitle', disabled: subtitleStreams.length === 0}
			);
		}
		return buttons;
	}, [isPaused, audioStreams.length, subtitleStreams.length, isAudioMode, hasNextTrack, hasPrevTrack]);

	const bottomButtons = useMemo(() => {
		if (isAudioMode) {
			return [];
		}
		return [
			{id: 'chapters', icon: <IconChapters />, label: $L('Chapters'), action: 'chapter', disabled: chapters.length === 0},
			{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'previous', disabled: true},
			{id: 'next', icon: <IconNext />, label: $L('Next'), action: 'next', disabled: !nextEpisode},
			{id: 'speed', icon: <IconSpeed />, label: $L('Speed'), action: 'speed'},
			{id: 'quality', icon: <IconQuality />, label: $L('Quality'), action: 'quality'},
			{id: 'info', icon: <IconInfo />, label: $L('Info'), action: 'info'}
		];
	}, [chapters.length, nextEpisode, isAudioMode]);

	return {topButtons, bottomButtons};
};

// ============================================================
// Shared info-modal helpers (exported for both platforms)
// ============================================================

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

// ============================================================
// <PlayerControls> component
// ============================================================

const PlayerControls = ({
	css,
	// Visibility & layout
	controlsVisible,
	activeModal,
	isAudioMode,
	focusRow,
	// Media info
	title,
	subtitle,
	// Buttons
	topButtons,
	bottomButtons,
	// Progress
	displayTime,
	duration,
	progressPercent,
	isSeeking,
	seekPosition,
	item,
	mediaSourceId,
	// Playback state
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
	// Skip intro
	showSkipIntro,
	// Handlers
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
	handleOpenSubtitleOffset,
	handleOpenSubtitleSettings,
	handleOpenRemoteSubtitleSearch,
	handleSelectRemoteSubtitle,
	canDownloadRemoteSubtitles,
	isSearchingRemoteSubtitles,
	remoteSubtitleResults,
	handleSubtitleOffsetChange,
	closeModal,
	stopPropagation,
	// Info modal: platform-specific rows injected as render prop
	renderInfoPlaybackRows,
	renderInfoVideoExtra
}) => {
	const { settings } = useSettings();
	return (
		<>
			{/* Skip Intro Button */}
			{showSkipIntro && !isAudioMode && !activeModal && !controlsVisible && (
				<div className={css.skipOverlay}>
					<SpottableButton className={css.skipButton} onClick={handleSkipIntro} spotlightId="skip-intro-btn">
						{$L('Skip Intro')}
					</SpottableButton>
				</div>
			)}

			{/* Player Controls Overlay */}
			<div className={`${css.playerControls} ${controlsVisible && !activeModal ? css.visible : ''} ${isAudioMode ? css.audioControls : ''}`}>
				{/* Top - Media Info (hidden in audio mode) */}
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
								spotlightDisabled={focusRow !== 'top'}							spotlightId={btn.id === 'playPause' ? 'play-pause-btn' : undefined}							>
								{btn.icon}
							</SpottableButton>
						))}
					</div>

					{/* Progress Bar */}
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

			{/* Subtitle Modal */}
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
							{!isSearchingRemoteSubtitles && remoteSubtitleResults.map((subtitle, idx) => (
								<SpottableButton
									key={subtitle.id || idx}
									className={css.trackItem}
									data-index={idx}
									onClick={handleSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
									<span className={css.trackName}>{subtitle.name || $L('Subtitle')}</span>
									{subtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{subtitle.info}</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.modalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}

			{/* Speed Modal */}
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

			{/* Quality Modal */}
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

			{/* Chapter Modal */}
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
								{/* Playback Section */}
								<SpottableDiv className={css.infoSection} spotlightId="info-playback">
									<h3 className={css.infoHeader}>{$L('Playback')}</h3>
									<div className={`${css.infoRow} ${css.infoHighlight}`}>
										<span className={css.infoLabel}>{$L('Play Method')}</span>
										<span className={css.infoValue}>{playMethod || $L('Unknown')}</span>
									</div>
									{/* Platform-specific playback rows */}
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
								</SpottableDiv>

								{/* Video Section */}
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
										{/* Platform-specific video rows */}
										{renderInfoVideoExtra && renderInfoVideoExtra({css, videoStream})}
										{videoStream.BitRate && (
											<div className={css.infoRow}>
												<span className={css.infoLabel}>{$L('Video Bitrate')}</span>
												<span className={css.infoValue}>{formatBitrate(videoStream.BitRate)}</span>
											</div>
										)}
									</SpottableDiv>
								)}

								{/* Audio Section */}
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

								{/* Subtitle Section */}
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
		</>
	);
};

export default PlayerControls;
