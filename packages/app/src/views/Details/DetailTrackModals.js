import {useCallback} from 'react';
import $L from '@enact/i18n/$L';

import {TRANSCODE_QUALITIES} from './detailsMedia';
import {ModalContainer} from '../../utils/spotlightContainers';
import {numberedTrackName, trackName, subtitleTrackDetail, audioTrackDetail, versionLabel} from '../../utils/trackLabels';
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
	versionLibraries,
	serverSources,
	selectedServerIndex,
	onSelectTranscodeQuality,
	onSelectVersion,
	onSelectServer,
	onSelectAudio,
	onSelectSubtitle,
	onOpenRemoteSubtitleSearch,
	isSearchingRemoteSubtitles,
	remoteSubtitleResults,
	onSelectRemoteSubtitle
}) => {
	const stopPropagation = useCallback((e) => e.stopPropagation(), []);

	return (
		<>
			{activeModal === 'advancedPlayback' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="advancedPlayback" spotlightId="advancedPlayback-modal">
						<h2 className={css.trackModalTitle}>{$L('Advanced Playback')}</h2>
						<div className={css.trackList}>
							{TRANSCODE_QUALITIES.map((quality, i) => (
								<SpottableButton
									key={quality.bitrate}
									className={css.trackItem}
									data-bitrate={quality.bitrate}
									data-selected={i === 0 ? 'true' : undefined}
									onClick={onSelectTranscodeQuality}
								>
									<span className={css.trackName}>{$L('Transcode Stream')}: {quality.label()}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
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
								const displayName = versionLabel(source.Name || `${$L('Version')} ${i + 1}`, versionLibraries?.[source.Id]);
								return (
									<SpottableButton
										key={source.Id}
										className={`${css.trackItem} ${i === selectedVersionIndex ? css.selected : ''}`}
										data-index={i}
										data-selected={i === selectedVersionIndex ? 'true' : undefined}
										onClick={onSelectVersion}
									>
										<span className={css.trackName}>{displayName}</span>
										{detail && <span className={css.trackInfo}>{detail}</span>}
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'server' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="server" spotlightId="server-modal">
						<h2 className={css.trackModalTitle}>{new Set((serverSources || []).map((s) => s.serverId || s.id.split(':')[0])).size > 1 ? $L('Select Server') : $L('Select Version / Library')}</h2>
						<div className={css.trackList}>
							{(serverSources || []).map((source, i) => {
								const isMultiServer = new Set((serverSources || []).map((s) => s.serverId || s.id.split(':')[0])).size > 1;
								const video = source.item?.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Video');
								const resLabel = video?.Width >= 3800 ? '4K' : video?.Width >= 1900 ? '1080p' : video?.Width >= 1260 ? '720p' : video?.Width ? `${video.Width}p` : '';
								const container = source.item?.MediaSources?.[0]?.Container?.toUpperCase();
								const bitrate = source.item?.MediaSources?.[0]?.Bitrate ? `${(source.item.MediaSources[0].Bitrate / 1000000).toFixed(1)} Mbps` : '';
								const mediaDetail = [resLabel, container, bitrate].filter(Boolean).join(' · ');

								const nameParts = [];
								if (isMultiServer && source.name) nameParts.push(source.name);
								if (source.libraryName) nameParts.push(source.libraryName);
								const sourceVersionName = source.item?.MediaSources?.[0]?.Name;
								if (sourceVersionName && sourceVersionName !== source.libraryName && sourceVersionName !== source.item?.Name) {
									nameParts.push(sourceVersionName);
								} else if (resLabel) {
									nameParts.push(resLabel);
								}
								if (nameParts.length === 0 && source.name) nameParts.push(source.name);
								const displayName = nameParts.length > 0 ? nameParts.join(' · ') : `${$L('Source')} ${i + 1}`;

								return (
									<SpottableButton
										key={source.id || i}
										className={`${css.trackItem} ${i === selectedServerIndex ? css.selected : ''}`}
										data-index={i}
										data-selected={i === selectedServerIndex ? 'true' : undefined}
										onClick={onSelectServer}
									>
										<span className={css.trackName}>{displayName}</span>
										{mediaDetail ? (
											<span className={css.trackInfo}>{mediaDetail}</span>
										) : source.url ? (
											<span className={css.trackInfo}>{source.url}</span>
										) : null}
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'audio' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="audio" spotlightId="audio-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Audio Track')}</h2>
						<div className={css.trackList}>
							{audioStreams.map((stream, i) => {
								const detail = audioTrackDetail({language: stream.Language, displayTitle: stream.DisplayTitle, codec: stream.Codec, channels: stream.Channels});
								return (
									<SpottableButton
										key={stream.Index}
										className={`${css.trackItem} ${i === selectedAudioIndex ? css.selected : ''}`}
										data-index={i}
										data-selected={i === selectedAudioIndex ? 'true' : undefined}
										onClick={onSelectAudio}
									>
										<span className={css.trackName}>{numberedTrackName(i + 1, stream.DisplayTitle || stream.Title || stream.Language, $L('Audio'))}</span>
										{detail && <span className={css.trackInfo}>{detail}</span>}
									</SpottableButton>
								);
							})}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
			{activeModal === 'subtitle' && (
				<div className={css.trackModal} onClick={onCloseModal}>
					<ModalContainer className={css.trackModalPanel} onClick={stopPropagation} data-modal="subtitle" spotlightId="subtitle-modal">
						<h2 className={css.trackModalTitle}>{$L('Select Subtitle')}</h2>
						<div className={css.trackList}>
							<SpottableButton
								className={`${css.trackItem} ${selectedSubtitleIndex === -1 ? css.selected : ''}`}
								data-index={-1}
								data-selected={selectedSubtitleIndex === -1 ? 'true' : undefined}
								onClick={onSelectSubtitle}
							>
								<span className={css.trackName}>{$L('Off')}</span>
							</SpottableButton>
							{subtitleStreams.map((stream, i) => (
								<SpottableButton
									key={stream.Index}
									className={`${css.trackItem} ${i === selectedSubtitleIndex ? css.selected : ''}`}
									data-index={i}
									data-selected={i === selectedSubtitleIndex ? 'true' : undefined}
									onClick={onSelectSubtitle}
								>
									<span className={css.trackName}>{trackName(i + 1, stream.DisplayTitle || stream.Title || stream.Language, $L('Subtitle'))}</span>
									<span className={css.trackInfo}>{subtitleTrackDetail({name: stream.DisplayTitle || stream.Title || stream.Language, codec: stream.Codec, language: stream.Language, isExternal: stream.IsExternal, deliveryMethod: stream.DeliveryMethod, isForced: stream.IsForced, isHearingImpaired: stream.IsHearingImpaired})}</span>
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>
							<SpottableButton spotlightId="btn-subtitle-download" className={css.actionBtn} onClick={onOpenRemoteSubtitleSearch}>
								{$L('Download')}
							</SpottableButton>
						</p>
						<p className={css.trackModalFooter} style={{marginTop: 5, fontSize: 14, opacity: 0.5}}>{$L('Press BACK to close')}</p>
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
									onClick={onSelectRemoteSubtitle}
									style={{flexDirection: 'column', alignItems: 'flex-start'}}
								>
									<span className={css.trackName}>{subtitle.name || $L('Subtitle')}</span>
									{subtitle.info && <span className={css.trackInfo} style={{marginTop: 4}}>{subtitle.info}</span>}
								</SpottableButton>
							))}
						</div>
						<p className={css.trackModalFooter}>{$L('Press BACK to close')}</p>
					</ModalContainer>
				</div>
			)}
		</>
	);
};

export default DetailTrackModals;
