import {useCallback, useMemo} from 'react';
import $L from '@enact/i18n/$L';

import {TRANSCODE_QUALITIES} from './detailsMedia';
import {ModalContainer} from '../../utils/spotlightContainers';
import {numberedTrackName, subtitleTrackDetail, audioTrackDetail, isExternalSubtitleStream} from '../../utils/trackLabels';
import TrackOptionRow, {TrackDivider} from '../../components/TrackOptionRow';
import {SpottableButton, SpottableDiv} from './detailsSpottables';

import css from './Details.module.less';

// The pickers behind the Version, Audio and Subtitle buttons. Only one is ever raised at a
// time, so they share activeModal.
const DetailTrackModals = ({
	activeModal,
	onCloseModal,
	item,
	audioStreams,
	subtitleStreams,
	selectedVersionIndex,
	selectedAudioIndex,
	selectedSubtitleIndex,
	preferExternalSubtitles,
	onSelectTranscodeQuality,
	onSelectVersion,
	onSelectAudio,
	onSelectSubtitle,
	onOpenRemoteSubtitleSearch,
	isSearchingRemoteSubtitles,
	isDownloadingRemoteSubtitle,
	remoteSubtitleError,
	remoteSubtitleResults,
	onSelectRemoteSubtitle
}) => {
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);

	// The file's own tracks list before downloaded ones, the order the player
	// uses (or vice versa when preferExternalSubtitles is true). Rows are picked
	// by their place in the unsorted list, so each one carries that place rather
	// than its place on screen.
	const displaySubtitleStreams = useMemo(() => {
		const withPosition = subtitleStreams.map((stream, position) => ({stream, position}));
		const internal = withPosition.filter((entry) => !isExternalSubtitleStream(entry.stream));
		const external = withPosition.filter((entry) => isExternalSubtitleStream(entry.stream));
		return preferExternalSubtitles ? [...external, ...internal] : [...internal, ...external];
	}, [subtitleStreams, preferExternalSubtitles]);

	// The list only stands in for itself once the work is done and there is
	// nothing to report instead.
	const remoteSubtitleBusy = isSearchingRemoteSubtitles || isDownloadingRemoteSubtitle;
	const showRemoteSubtitleResults = !remoteSubtitleBusy && !remoteSubtitleError;

	return (
		<>
			{activeModal === 'advancedPlayback' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="advancedPlayback" spotlightId="advancedPlayback-modal">
						<h2 className={css.trackModalTitle}>{$L('Advanced Playback')}</h2>
						<div className={css.trackList}>
							{TRANSCODE_QUALITIES.map((quality, i) => (
								<TrackOptionRow
									key={quality.bitrate}
									label={`${$L('Transcode Stream')}: ${quality.label()}`}
									selected={i === 0}
									data-bitrate={quality.bitrate}
									onClick={onSelectTranscodeQuality}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={onCloseModal} />
						</div>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'version' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="version" spotlightId="version-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Version')}</h2>
						<div className={css.trackList}>
							{item.MediaSources.map((source, i) => {
								const video = source.MediaStreams?.find(s => s.Type === 'Video');
								const resLabel = video?.Width >= 3800 ? '4K' : video?.Width >= 1900 ? '1080p' : video?.Width >= 1260 ? '720p' : video?.Width ? `${video.Width}p` : '';
								const bitrate = source.Bitrate ? `${(source.Bitrate / 1000000).toFixed(1)} Mbps` : '';
								const container = source.Container?.toUpperCase();
								const detail = [resLabel, container, bitrate].filter(Boolean).join(' · ');
								return (
									<TrackOptionRow
										key={source.Id}
										label={source.Name || `${$L('Version')} ${i + 1}`}
										detail={detail}
										selected={i === selectedVersionIndex}
										data-index={i}
										onClick={onSelectVersion}
									/>
								);
							})}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={onCloseModal} />
						</div>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.trackModalTitle}>{$L('Audio Track')}</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => (
								<TrackOptionRow
									key={stream.Index}
									label={numberedTrackName(i + 1, stream.DisplayTitle || stream.Title || stream.Language, $L('Audio'))}
									detail={audioTrackDetail({language: stream.Language, displayTitle: stream.DisplayTitle, codec: stream.Codec, channels: stream.Channels})}
									selected={i === selectedAudioIndex}
									data-index={i}
									onClick={onSelectAudio}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={onCloseModal} />
						</div>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.trackModalTitle}>{$L('Subtitle Track')}</h2>
						<div className={css.trackList}>
							<TrackOptionRow
								label={$L('None')}
								selected={selectedSubtitleIndex === -1}
								data-index={-1}
								onClick={onSelectSubtitle}
							/>
							{displaySubtitleStreams.map(({stream, position}, i) => (
								<TrackOptionRow
									key={stream.Index}
									label={numberedTrackName(i + 1, stream.DisplayTitle || stream.Title || stream.Language, $L('Subtitle'))}
									detail={subtitleTrackDetail({name: stream.DisplayTitle || stream.Title || stream.Language, codec: stream.Codec, language: stream.Language, isExternal: stream.IsExternal, deliveryMethod: stream.DeliveryMethod, isForced: stream.IsForced, isHearingImpaired: stream.IsHearingImpaired})}
									selected={position === selectedSubtitleIndex}
									data-index={position}
									onClick={onSelectSubtitle}
								/>
							))}
							<TrackDivider />
							<TrackOptionRow
								label={$L('Download subtitles...')}
								detail={$L('Search using the OpenSubtitles plugin')}
								spotlightId="btn-subtitle-download"
								onClick={onOpenRemoteSubtitleSearch}
							/>
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={onCloseModal} />
						</div>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitleDownload' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="subtitleDownload" spotlightId="subtitleDownload-modal">
						<h2 className={css.trackModalTitle}>{$L('Download Subtitles')}</h2>
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
							{showRemoteSubtitleResults && remoteSubtitleResults.map((subtitle, idx) => (
								<SpottableButton
									key={subtitle.id || idx}
									className={css.trackItem}
									data-index={idx}
									onClick={onSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
									<span className={css.trackName}>{subtitle.name || $L('Subtitle')}</span>
									{subtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{subtitle.info}</span>}
									{subtitle.flags?.length > 0 && (
										<span className={css.subtitleFlags}>
											{subtitle.flags.map((flag) => (
												<span key={flag} className={css.subtitleFlag}>{flag}</span>
											))}
										</span>
									)}
								</SpottableButton>
							))}
							<TrackDivider />
							<TrackOptionRow label={$L('Cancel')} dimmed onClick={onCloseModal} />
						</div>
					</ModalContainer>
				</div>
			)}
		</>
	);
};

export default DetailTrackModals;
