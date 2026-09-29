import {useCallback, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {buildDirectPlayReasonItems} from '../../utils/directPlayReasons';
import {fileName, fileSizeLine, videoLines} from './nouveau/nouveauFooterFields';
import useDetailPlaybackInfo from './useDetailPlaybackInfo';

import css from './ModernFileInformation.module.less';

const SpottableDiv = Spottable('div');
const Container = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// How many tracks of a kind show before the rest wait behind Show All.
const COLLAPSED_TRACKS = 2;

// Shown in local time, since the server sends UTC and an evening west of UTC would read as the
// next day.
const addedOn = (dateCreated) => {
	const date = dateCreated ? new Date(dateCreated) : null;
	if (!date || isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
};

// The rows are spottable though there's nothing to activate on most of them, since focus is how
// the tab bar hands over and how the scroller knows where to go.
const InfoRow = ({label, children}) => (
	<SpottableDiv className={css.infoRow}>
		<span className={css.infoLabel}>{label}</span>
		<span className={css.infoValue}>{children}</span>
	</SpottableDiv>
);

const TrackRow = ({label, streams, activeIndex, includeForced, showAllLabel}) => {
	const [expanded, setExpanded] = useState(false);
	const toggle = useCallback(() => setExpanded((open) => !open), []);
	if (!streams.length) return null;

	const shown = expanded ? streams : streams.slice(0, COLLAPSED_TRACKS);
	return (
		<>
			<InfoRow label={label}>
				{shown.map((stream, index) => {
					const title = stream.DisplayTitle || String(stream.Codec || '').toUpperCase();
					const language = stream.Language ? String(stream.Language).toUpperCase() : $L('Unknown');
					const flags = (stream.IsDefault === true ? ` [${$L('Default')}]` : '') +
						(includeForced && stream.IsForced === true ? ` [${$L('Forced')}]` : '');
					return (
						<span key={index} className={`${css.track} ${stream.Index === activeIndex ? css.trackActive : ''}`}>
							{`${title} (${language})${flags}`}
						</span>
					);
				})}
			</InfoRow>
			{streams.length > COLLAPSED_TRACKS && (
				<SpottableDiv className={css.showAll} onClick={toggle}>
					{expanded ? $L('Show Less') : showAllLabel.replace('{count}', streams.length)}
				</SpottableDiv>
			)}
		</>
	);
};

const DirectPlaySection = ({api, item, mediaSource, activeAudio, activeSubtitle, settings}) => {
	const {status, result, retry} = useDetailPlaybackInfo({
		api,
		itemId: item.Id,
		serverType: item._serverType,
		mediaSourceId: mediaSource.Id,
		audioStreamIndex: activeAudio,
		subtitleStreamIndex: activeSubtitle,
		maxBitrate: settings.maxBitrate
	});

	if (status === 'loading') {
		return (
			<div className={css.checking}>
				<span className={css.spinner} />
				{$L('Checking Direct Play capability...')}
			</div>
		);
	}

	if (status === 'failed') {
		return (
			<div className={css.capabilityRow}>
				<span className={css.capabilityLabel}>{$L('Direct Play Capability:')}</span>
				<span className={css.capabilityFailed}>{$L('Failed to load')}</span>
				<SpottableDiv className={css.retry} onClick={retry}>{$L('Retry')}</SpottableDiv>
			</div>
		);
	}

	if (status !== 'ready') return null;

	const direct = result.supportsDirectPlay;
	const source = result.source;
	const reasons = direct ? [] : buildDirectPlayReasonItems({
		serverReasons: result.transcodeReasons,
		mediaSource: {
			Container: source.Container ?? mediaSource.Container,
			Bitrate: source.Bitrate ?? mediaSource.Bitrate,
			MediaStreams: source.MediaStreams?.length ? source.MediaStreams : mediaSource.MediaStreams
		},
		deviceProfile: result.deviceProfile,
		settings,
		audioStreamIndex: activeAudio,
		subtitleStreamIndex: activeSubtitle,
		maxStreamingBitrate: result.maxStreamingBitrate
	});

	return (
		<SpottableDiv className={css.directPlay}>
			<div className={css.capabilityRow}>
				<span className={css.capabilityLabel}>{$L('Direct Play Capability:')}</span>
				<span className={direct ? css.capabilityYes : css.capabilityNo}>{direct ? $L('Yes') : $L('No')}</span>
			</div>
			{reasons.length > 0 && (
				<div className={css.reasons}>
					{reasons.map((reason, index) => (
						<div key={index} className={css.reason}>
							<div className={css.reasonText}>{`• ${reason.description}`}</div>
							{reason.hint && <div className={css.reasonHint}>{reason.hint}</div>}
						</div>
					))}
				</div>
			)}
		</SpottableDiv>
	);
};

// What the file behind the title is: its name, size and when it was added, the tracks inside it,
// and whether it plays as it is. A file that can't direct play says why, with a hint about the
// setting that would change it.
const ModernFileInformation = ({item, mediaSource, effectiveApi, selectedAudioIndex, selectedSubtitleIndex, settings, firstSpotlightId}) => {
	const streams = mediaSource?.MediaStreams || [];
	const video = streams.find((stream) => stream.Type === 'Video');
	const audio = streams.filter((stream) => stream.Type === 'Audio');
	const subtitles = streams.filter((stream) => stream.Type === 'Subtitle');

	// The stored choice is a place in these lists, while a track knows itself by its own index.
	const activeAudio = audio[selectedAudioIndex]?.Index;
	const activeSubtitle = selectedSubtitleIndex >= 0 ? subtitles[selectedSubtitleIndex]?.Index : undefined;

	const name = fileName(mediaSource);
	const sizeLine = fileSizeLine(mediaSource);
	const added = addedOn(item?.DateCreated);
	const videoDetails = videoLines(video);

	return (
		<Container className={css.fileInfo}>
			<h3 className={css.title}>{$L('File Information')}</h3>
			<SpottableDiv className={css.fileCard} spotlightId={firstSpotlightId}>
				{name && <div className={css.fileName}>{name}</div>}
				{sizeLine && <div className={css.fileMeta}>{sizeLine}</div>}
				{added && <div className={css.fileMeta}>{$L('Date Added: {date}').replace('{date}', added)}</div>}
			</SpottableDiv>
			{videoDetails.length > 0 && <InfoRow label={$L('Video')}>{videoDetails.join('  •  ')}</InfoRow>}
			<TrackRow
				label={$L('Audio')}
				streams={audio}
				activeIndex={activeAudio}
				showAllLabel={$L('Show All ({count}) Audio Tracks')}
			/>
			<TrackRow
				label={$L('Subtitles')}
				streams={subtitles}
				activeIndex={activeSubtitle}
				includeForced
				showAllLabel={$L('Show All ({count}) Subtitle Tracks')}
			/>
			<DirectPlaySection
				api={effectiveApi}
				item={item}
				mediaSource={mediaSource}
				activeAudio={activeAudio}
				activeSubtitle={activeSubtitle}
				settings={settings}
			/>
		</Container>
	);
};

export default ModernFileInformation;
