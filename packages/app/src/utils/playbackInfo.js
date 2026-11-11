import $L from '@enact/i18n/$L';

import {languageName} from './languageNames';
import {
	audioChannelsName, audioCodecName, channelLayout, formatBitrate, getHdrType, getVideoCodec, present, videoCodecName
} from './mediaStreamFacts';
import {dolbyVisionProfile} from './videoRange';

// The playback information rows, read from what Jellyfin and Emby both put in the media source
// and its transcoding url.

const lower = (value) => (value == null ? '' : String(value)).trim().toLowerCase();

const listOf = (value) => lower(value).split(',').map((entry) => entry.trim()).filter(Boolean);

const number = (value) => parseInt(value, 10) || 0;

// Old TVs have no URLSearchParams, and the servers don't agree on the case of the names, so they're
// kept in lower case.
const queryParams = (url) => {
	const params = {};
	const query = String(url || '').split('?')[1];
	(query ? query.split('&') : []).forEach((part) => {
		const eq = part.indexOf('=');
		if (eq < 1) return;
		const name = part.slice(0, eq).toLowerCase();
		const value = part.slice(eq + 1);
		try {
			params[name] = decodeURIComponent(value.replace(/\+/g, ' '));
		} catch {
			params[name] = value;
		}
	});
	return params;
};

// The session sends an array where older servers send one comma separated string.
const reasonList = (value) => {
	const reasons = [];
	(Array.isArray(value) ? value : String(value || '').split(',')).forEach((name) => {
		const reason = String(name).trim();
		if (reason && !reasons.some((seen) => lower(seen) === lower(reason))) reasons.push(reason);
	});
	return reasons;
};

const reasonKey = (reasons) => reasons.map(lower).sort().join();

// Reasons that make the server encode a stream again even though its codec is one it may copy.
const VIDEO_ENCODE_REASONS = [
	'videoprofilenotsupported', 'videolevelnotsupported', 'videoresolutionnotsupported', 'videobitdepthnotsupported',
	'videoframeratenotsupported', 'refframesnotsupported', 'anamorphicvideonotsupported', 'interlacedvideonotsupported',
	'videocodectagnotsupported', 'videorangetypenotsupported', 'videorangenotsupported'
];
const AUDIO_ENCODE_REASONS = ['audioprofilenotsupported', 'audiochannelsnotsupported', 'audiosampleratenotsupported', 'audiobitdepthnotsupported'];

const CODEC_ALIASES = {h265: 'hevc', avc: 'h264', dvhe: 'hevc', dvh1: 'hevc', dca: 'dts'};
const sameCodec = (a, b) => (CODEC_ALIASES[a] || a) === (CODEC_ALIASES[b] || b);

// The server copies a stream whose codec is on the url's list unless something else blocks it,
// and otherwise encodes to the first codec listed.
const conversionOf = (stream, codecList, cap, reasons, encodeReasons) => {
	if (!stream) return {converted: false, codec: null};
	const codecs = listOf(codecList);
	const source = lower(stream.Codec);
	if (codecs.length && source && !codecs.some((codec) => codec === 'copy' || sameCodec(codec, source))) {
		return {converted: true, codec: codecs[0]};
	}
	const converted = (cap > 0 && stream.BitRate > cap) || reasons.some((reason) => encodeReasons.indexOf(lower(reason)) !== -1);
	return {converted, codec: null};
};

const resolutionName = (width, height) => {
	if (width >= 3200 || height >= 1800) return '4K';
	if (width >= 1600 || height >= 900) return '1080p';
	if (width >= 1200 || height >= 700) return '720p';
	return 'SD';
};

const fpsValue = (stream) => {
	const fps = Number(stream.RealFrameRate || stream.AverageFrameRate);
	return fps > 0 ? String(Number(fps.toFixed(3))) : null;
};

const hdrName = (stream, showsDolbyVision) => {
	const label = getHdrType(stream, showsDolbyVision);
	const profile = dolbyVisionProfile(stream);
	return label === 'Dolby Vision' && profile ? `${label} Profile ${profile}` : label;
};

const fill = (text, values) => Object.keys(values).reduce((out, key) => out.replace(`{${key}}`, values[key]), text);

const convertedFrom = (value, source) => fill($L('{value} (converted from {source})'), {value, source});

const trackName = (stream) => languageName(stream.Language) || stream.Title || null;

const SUBTITLE_FORMATS = {
	pgssub: 'PGS (image)', dvdsub: 'VobSub (image)', dvd_subtitle: 'VobSub (image)', vobsub: 'VobSub (image)',
	dvbsub: 'DVB (image)', subrip: 'SRT (text)', srt: 'SRT (text)', ass: 'ASS (styled text)', ssa: 'SSA (styled text)',
	webvtt: 'WebVTT (text)', vtt: 'WebVTT (text)', mov_text: 'MP4 text', tx3g: 'MP4 text', ttml: 'TTML (text)'
};

const subtitleFormatName = (codec) => SUBTITLE_FORMATS[codec] || codec.toUpperCase();

const CONTAINER_EXTENSIONS = [
	'3gp', 'asf', 'avi', 'divx', 'flv', 'iso', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'ogm', 'ogv',
	'rmvb', 'ts', 'vob', 'webm', 'wmv', 'wtv'
];

// Jellyfin narrows the container to what the device profile lists, so an .mp4 can come back as mov.
// A dotted folder or release name isn't an extension, so only known ones count.
const containerName = (source) => {
	const extension = lower((/\.([^./\\]+)$/.exec((source.Path || '').split(/[?#]/)[0]) || [])[1]);
	if (CONTAINER_EXTENSIONS.indexOf(extension) !== -1) return extension.toUpperCase();
	const entries = listOf(source.Container);
	if (!entries.length) return null;
	return entries.indexOf('mp4') !== -1 ? 'MP4' : entries[0].toUpperCase();
};

const fileSize = (bytes) => {
	if (!(bytes > 0)) return null;
	const gb = bytes / (1024 * 1024 * 1024);
	return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
};

const fileName = (source) => (source.Path ? source.Path.split(/[\\/]/).pop() : null) || source.Name || null;

// PCM from the Xbox console player means it decoded the track, and a bitstream format means it
// went on to the receiver.
const audioOutputName = (output) => {
	const format = output?.format || '';
	if (/^pcm\b/i.test(format)) return $L('Decoded on this device');
	if (/^(truehd|dts|e-?ac-?3|ac-?3|dolby)/i.test(format)) return $L('Passthrough over HDMI');
	return null;
};

const pickAudio = (streams, index) => {
	const audio = streams.filter((stream) => stream.Type === 'Audio');
	return audio.find((stream) => stream.Index === index) || audio.find((stream) => stream.IsDefault) || audio[0] || null;
};

const oneDecimal = (value) => String(Number(value.toFixed(1)));

const BITRATE_REASONS = [
	'containerbitrateexceedslimit', 'videobitratenotsupported', 'audiobitratenotsupported', 'videobitrateexceedslimit',
	'bitratelimitexceeded', 'containerbitratenotsupported'
];

const CHANNEL_LAYOUTS = {6: '5.1', 8: '7.1'};

// H.264 writes level 5.1 as 51 and HEVC as 153.
const videoLevel = (codec, level) => {
	if (!(level > 0)) return null;
	if (codec === 'H.264') return oneDecimal(level / 10);
	return oneDecimal(codec === 'HEVC' ? level / 30 : level);
};

// One line per reason in a fixed order, naming the source value that kept the file from direct play
// where it's known. Identical lines show once, and the bitrate and limit are in bits per second.
export const whyLines = (reasons, {forced, video, audio, subtitle, container, bitrate, limit} = {}) => {
	const codec = videoCodecName(video?.Codec);
	const profile = present(video?.Profile);
	const level = codec && videoLevel(codec, video.Level);
	const fps = video && fpsValue(video);
	const range = video && hdrName(video, true);
	const audioName = audioCodecName(audio?.Codec);
	const subtitleCodec = lower(subtitle?.Codec);

	const anyVideo = $L("This device can't play this video format");
	const anyAudio = $L("This device can't play this audio format");
	const videoLine = codec ? fill($L("This device can't play {codec} video"), {codec}) : anyVideo;
	const audioLine = audioName ? fill($L("This device can't play {format} audio"), {format: audioName}) : anyAudio;

	const line = (reason) => {
		if (BITRATE_REASONS.indexOf(reason) !== -1) {
			// Rounded down, so the limit never reads above the bitrate, and a cap under 1 Mbps would read as 0.
			const mbps = Math.floor(limit / 1000000);
			return [2, bitrate > limit && mbps > 0
				? fill($L('{bitrate} is above the {limit} streaming limit'), {bitrate: formatBitrate(bitrate), limit: `${mbps} Mbps`})
				: $L('The bitrate is above the streaming limit')];
		}
		switch (reason) {
			case 'containernotsupported':
				return [3, container ? fill($L("This device can't open {container} files"), {container}) : $L("This device can't play this file type")];
			case 'videocodecnotsupported':
			case 'videocodectagnotsupported':
				return [4, videoLine];
			case 'videoprofilenotsupported':
				return [5, codec && profile ? fill($L("This device can't play {codec} {profile} video"), {codec, profile}) : videoLine];
			case 'videolevelnotsupported':
				return [6, level ? fill($L("This device can't play {codec} level {level} video"), {codec, level}) : videoLine];
			case 'videobitdepthnotsupported':
				return [7, video?.BitDepth > 0 ? fill($L("This device can't play {bits}-bit video"), {bits: video.BitDepth}) : anyVideo];
			case 'videoresolutionnotsupported':
				return [8, video?.Width > 0 && video?.Height > 0
					? fill($L("This device can't play {resolution} video"), {resolution: resolutionName(video.Width, video.Height)})
					: anyVideo];
			case 'videoframeratenotsupported':
				return [9, fps ? fill($L("This device can't play {fps} fps video"), {fps}) : anyVideo];
			case 'interlacedvideonotsupported':
				return [10, $L("This device can't play interlaced video")];
			case 'anamorphicvideonotsupported':
				return [11, $L("This device can't play anamorphic video")];
			case 'refframesnotsupported':
			case 'unknownvideostreaminfo':
				return [12, anyVideo];
			// A range the server left empty reads as SDR, which says nothing about why.
			case 'videorangetypenotsupported':
			case 'videorangenotsupported':
				return [13, range && range !== 'SDR' ? fill($L("This device can't display {range}"), {range}) : $L("This device can't display this HDR format")];
			case 'audiocodecnotsupported':
				return [14, audioLine];
			case 'audioprofilenotsupported':
				return [15, audioName && present(audio.Profile)
					? fill($L("This device can't play {fullFormat}"), {fullFormat: audioCodecName(audio.Codec, audio.Profile)})
					: audioLine];
			case 'audiochannelsnotsupported':
				return [16, audio?.Channels > 0
					? fill($L("This device can't play {channels} audio"), {channels: CHANNEL_LAYOUTS[audio.Channels] || `${audio.Channels}-channel`})
					: anyAudio];
			case 'audiosampleratenotsupported':
				return [17, audio?.SampleRate > 0 ? fill($L("This device can't play {rate} kHz audio"), {rate: oneDecimal(audio.SampleRate / 1000)}) : anyAudio];
			case 'audiobitdepthnotsupported':
				return [18, audio?.BitDepth > 0 ? fill($L("This device can't play {bits}-bit audio"), {bits: audio.BitDepth}) : anyAudio];
			case 'audioisexternal':
				return [19, $L('The audio track is in a separate file')];
			case 'secondaryaudionotsupported':
				return [20, $L('This device can only play the first audio track')];
			case 'unknownaudiostreaminfo':
				return [21, anyAudio];
			case 'subtitlecodecnotsupported':
				return [22, subtitleCodec
					? fill($L('{format} subtitles are being burned into the video'), {format: subtitleFormatName(subtitleCodec).replace(/ \(.*\)$/, '')})
					: $L('Subtitles are being burned into the video')];
			default:
				return [23, $L("The file couldn't be played directly")];
		}
	};

	const lines = (forced ? [[1, $L('Transcoding is forced in settings')]] : [])
		.concat(reasons.map((reason) => line(lower(reason))))
		// Reasons with the same place in the order always give the same line, so an unstable sort can't change what shows.
		.sort((a, b) => a[0] - b[0]);
	const out = [];
	lines.forEach((entry) => {
		if (out.indexOf(entry[1]) === -1) out.push(entry[1]);
	});
	return out;
};

export const buildPlaybackInfo = ({
	session,
	playMethod,
	selectedAudioIndex,
	selectedSubtitleIndex,
	maxBitrate,
	transcodeForced,
	isLiveTV,
	item,
	liveProgram,
	isTizen,
	hostAudioOutput,
	droppedFrames,
	transcodingInfo
}) => {
	const source = session?.mediaSource || {};
	const capabilities = session?.capabilities || {};
	const streams = source.MediaStreams || [];
	const method = playMethod || session?.playMethod;
	const transcoding = method === 'Transcode';
	const params = queryParams(transcoding ? source.TranscodingUrl : null);
	// Jellyfin keeps the session's transcoding details after a transcode ends, and an earlier transcode
	// that's still running reports into the same session, so they only count when the reasons agree.
	const urlReasons = reasonList(params.transcodereasons);
	const infoReasons = reasonList(transcodingInfo?.TranscodeReasons);
	const sameStream = !urlReasons.length || !infoReasons.length || reasonKey(urlReasons) === reasonKey(infoReasons);
	const info = transcoding && sameStream ? transcodingInfo || null : null;
	// The url's reasons come first, and the session's stand in when it has none.
	const reasons = urlReasons.length || !info ? urlReasons : infoReasons;

	const videoStream = streams.find((stream) => stream.Type === 'Video') || null;
	const audioStream = pickAudio(streams, selectedAudioIndex);
	const subtitleStream = selectedSubtitleIndex >= 0
		? streams.find((stream) => stream.Type === 'Subtitle' && stream.Index === selectedSubtitleIndex) || null
		: null;

	// Jellyfin leaves SubtitleMethod=Encode on urls that burn nothing, so it only counts for the track the url names.
	const burnsSubtitles = transcoding && !!subtitleStream && (
		lower(subtitleStream.DeliveryMethod) === 'encode' ||
		(lower(params.subtitlemethod) === 'encode' && params.subtitlestreamindex === String(subtitleStream.Index))
	);
	const videoTarget = number(params.videobitrate);
	const audioTarget = number(params.audiobitrate);
	const video = conversionOf(videoStream, params.videocodec, videoTarget, reasons, VIDEO_ENCODE_REASONS);
	const maxWidth = number(params.maxwidth);
	const maxHeight = number(params.maxheight);
	// A picture bigger than the url allows has to be scaled, and that means encoding it again.
	const scalesVideo = !!videoStream &&
		((maxWidth > 0 && videoStream.Width > maxWidth) || (maxHeight > 0 && videoStream.Height > maxHeight));
	const videoConverted = typeof info?.IsVideoDirect === 'boolean' ? !info.IsVideoDirect : video.converted || burnsSubtitles || scalesVideo;
	const videoOut = videoConverted ? lower(info?.VideoCodec) || video.codec : null;
	const audio = conversionOf(audioStream, params.audiocodec, audioTarget, reasons, AUDIO_ENCODE_REASONS);
	const channelCap = number(params.transcodingmaxaudiochannels) || number(params.maxaudiochannels);
	const sourceChannels = audioStream?.Channels;
	const cappedChannels = channelCap > 0 && sourceChannels > channelCap ? channelCap : null;
	const outChannels = info?.AudioChannels > 0 ? info.AudioChannels : cappedChannels;
	const deliveredChannels = outChannels && outChannels !== sourceChannels ? outChannels : null;
	const audioConverted = typeof info?.IsAudioDirect === 'boolean' ? !info.IsAudioDirect : audio.converted || deliveredChannels != null;
	const audioOut = audioConverted ? lower(info?.AudioCodec) || audio.codec : null;

	let note = null;
	if (method === 'DirectPlay') note = $L('Playing the original file as is.');
	else if (method === 'DirectStream') note = $L('The server is repackaging the file without converting it.');
	else if (transcoding && videoConverted && audioConverted) note = $L('The server is converting the video and audio so this device can play it.');
	else if (transcoding && videoConverted) note = $L('The server is converting the video so this device can play it.');
	else if (transcoding && audioConverted) note = $L('The server is converting the audio so this device can play it.');
	else if (transcoding) note = $L('The server is converting this file so this device can play it.');

	const methodName = {DirectPlay: $L('Direct Play'), DirectStream: $L('Direct Stream'), Transcode: $L('Transcoding')}[method];
	const sourceBitrate = source.Bitrate;
	const container = containerName(source);
	const streamingTarget = number(params.maxstreamingbitrate) || (videoTarget > 0 && audioTarget > 0 ? videoTarget + audioTarget : 0);
	const why = transcoding ? whyLines(reasons, {
		forced: transcodeForced,
		video: videoStream,
		audio: audioStream,
		subtitle: subtitleStream,
		container,
		bitrate: sourceBitrate,
		limit: maxBitrate > 0 ? maxBitrate : streamingTarget
	}) : [];

	const requested = videoTarget + audioTarget;
	// Without the session's figure the url's target stands in, and only below the file's own rate.
	const delivered = info?.Bitrate > 0 ? info.Bitrate : requested > 0 && requested < sourceBitrate ? requested : 0;
	const sourceText = sourceBitrate > 0 ? formatBitrate(sourceBitrate) : null;
	const deliveredText = delivered > 0 ? formatBitrate(delivered) : null;
	const bitrate = sourceText && deliveredText && deliveredText !== sourceText
		? fill($L('{value} (original {original})'), {value: deliveredText, original: sourceText})
		: deliveredText || sourceText;

	const playbackRows = [
		isLiveTV && {label: $L('Channel'), value: [item?.ChannelNumber || item?.Number, item?.Name].filter(Boolean).join(' ')},
		isLiveTV && {label: $L('Program'), value: liveProgram?.Name},
		{label: $L('Play Method'), value: methodName, bold: true},
		note && {note},
		{label: $L('Why'), value: why.join('\n')},
		{label: $L('Bitrate'), value: bitrate},
		{label: $L('Quality Limit'), value: maxBitrate > 0 ? `${Number((maxBitrate / 1000000).toFixed(1))} Mbps` : null}
	];

	let videoRows = [];
	if (videoStream) {
		const {Width: width, Height: height} = videoStream;
		const sourceHdr = hdrName(videoStream, true);
		const shownHdr = hdrName(videoStream, videoConverted || capabilities.dolbyVision !== false);
		const outWidth = info?.Width;
		const outHeight = info?.Height;
		let resolution = null;
		if (width && height) {
			resolution = outWidth > 0 && outHeight > 0 && (outWidth !== width || outHeight !== height)
				? fill($L('{name} ({size}, converted from {source})'), {
					name: resolutionName(outWidth, outHeight), size: `${outWidth}×${outHeight}`, source: resolutionName(width, height)
				})
				: `${resolutionName(width, height)} (${width}×${height})`;
		}
		const fps = fpsValue(videoStream);
		videoRows = [
			{label: $L('Resolution'), value: resolution},
			{label: $L('Frame Rate'), value: fps && `${fps} fps`},
			{
				label: $L('Format'),
				value: videoOut && !sameCodec(videoOut, lower(videoStream.Codec))
					? convertedFrom(videoCodecName(videoOut), videoCodecName(videoStream.Codec))
					: getVideoCodec(videoStream)
			},
			{label: $L('HDR'), value: shownHdr === sourceHdr ? sourceHdr : convertedFrom(shownHdr, sourceHdr)}
		];
	}

	let audioRows = [];
	if (audioStream) {
		const name = trackName(audioStream);
		audioRows = [
			{label: $L('Track'), value: name && audioStream.IsDefault ? `${name}, ${$L('Default')}` : name},
			{
				label: $L('Format'),
				value: audioOut && !sameCodec(audioOut, lower(audioStream.Codec))
					? convertedFrom(audioCodecName(audioOut), audioCodecName(audioStream.Codec))
					: audioCodecName(audioStream.Codec, audioStream.Profile)
			},
			{
				label: $L('Channels'),
				value: deliveredChannels ? convertedFrom(audioChannelsName(deliveredChannels), channelLayout(sourceChannels)) : audioChannelsName(sourceChannels)
			},
			{label: $L('Output'), value: audioOutputName(hostAudioOutput)}
		];
	}

	let subtitleRows = [];
	if (subtitleStream) {
		const name = trackName(subtitleStream);
		const flags = [subtitleStream.IsForced && $L('Forced'), subtitleStream.IsHearingImpaired && $L('SDH')].filter(Boolean);
		const codec = lower(subtitleStream.Codec);
		let delivery = subtitleStream.IsExternal ? $L('External') : $L('Embedded');
		if (burnsSubtitles) delivery = $L('Burned in by the server');
		subtitleRows = [
			{label: $L('Track'), value: name ? [name].concat(flags).join(', ') : null},
			{label: $L('Format'), value: codec ? subtitleFormatName(codec) : null},
			{label: $L('Delivery'), value: delivery}
		];
	}

	const fileRows = isLiveTV ? [] : [
		{label: $L('Name'), value: fileName(source)},
		{label: $L('Container'), value: container},
		{label: $L('Size'), value: fileSize(source.Size)}
	];

	const model = capabilities.modelName && capabilities.modelName !== 'Unknown' ? capabilities.modelName : null;
	const os = capabilities.tizenVersionDisplay || capabilities.webosVersionDisplay ||
		capabilities.vegaVersionDisplay || capabilities.xboxVersionDisplay;
	let player = null;
	if (session) player = isTizen ? $L('AVPlay (Native)') : capabilities.nativePlayer ? $L('Console Video Player') : $L('HTML5 video');
	const technicalRows = [
		{label: $L('Player'), value: player},
		{label: $L('Device'), value: [model, os].filter(Boolean).join(', ')},
		{label: $L('Transcode Reasons'), value: reasons.join(', ')},
		{label: $L('Dropped Frames'), value: droppedFrames != null ? String(droppedFrames) : null}
	];

	return [
		{id: 'playback', title: $L('Playback'), rows: playbackRows},
		{id: 'video', title: $L('Video'), rows: videoRows},
		{id: 'audio', title: $L('Audio'), rows: audioRows},
		{id: 'subtitles', title: $L('Subtitles'), rows: subtitleRows},
		{id: 'file', title: $L('File'), rows: fileRows},
		{id: 'technical', title: $L('Technical'), rows: technicalRows}
	]
		.map((section) => ({...section, rows: section.rows.filter((row) => row && (row.note || row.value))}))
		.filter((section) => section.rows.length > 0);
};
