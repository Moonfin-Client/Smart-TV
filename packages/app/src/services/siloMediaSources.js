// Silo's files and their tracks as Jellyfin MediaSources and MediaStreams.
//
// Each file version is one MediaSource, the default first. Its tracks get stream indexes the way Jellyfin numbers them:
// a subtitle keeps its index in the file where Silo gives one, and everything else takes the free numbers in order.
// What each index stands for on Silo (the track's kind and position among its kind) rides along under `_siloTracks`,
// since Silo names tracks that way when playing.

import {secondsToTicks, siloIdOf} from './siloMapper';

export const SILO_TRACKS_KEY = '_siloTracks';

const NAMES = {
	ar: 'Arabic', ara: 'Arabic', bg: 'Bulgarian', bul: 'Bulgarian', bn: 'Bengali', ben: 'Bengali',
	ca: 'Catalan', cat: 'Catalan', cs: 'Czech', ces: 'Czech', cze: 'Czech', cy: 'Welsh',
	cym: 'Welsh', wel: 'Welsh', da: 'Danish', dan: 'Danish', de: 'German', deu: 'German',
	ger: 'German', el: 'Greek', ell: 'Greek', gre: 'Greek', en: 'English', eng: 'English',
	es: 'Spanish', spa: 'Spanish', et: 'Estonian', est: 'Estonian', eu: 'Basque', eus: 'Basque',
	baq: 'Basque', fa: 'Persian', fas: 'Persian', per: 'Persian', fi: 'Finnish', fin: 'Finnish',
	fil: 'Filipino', fr: 'French', fra: 'French', fre: 'French', ga: 'Irish', gle: 'Irish',
	gl: 'Galician', glg: 'Galician', he: 'Hebrew', heb: 'Hebrew', hi: 'Hindi', hin: 'Hindi',
	hr: 'Croatian', hrv: 'Croatian', hu: 'Hungarian', hun: 'Hungarian', id: 'Indonesian', ind: 'Indonesian',
	is: 'Icelandic', isl: 'Icelandic', ice: 'Icelandic', it: 'Italian', ita: 'Italian', ja: 'Japanese',
	jpn: 'Japanese', ko: 'Korean', kor: 'Korean', lt: 'Lithuanian', lit: 'Lithuanian', lv: 'Latvian',
	lav: 'Latvian', ms: 'Malay', msa: 'Malay', may: 'Malay', nb: 'Norwegian Bokmål', nob: 'Norwegian Bokmål',
	nl: 'Dutch', nld: 'Dutch', dut: 'Dutch', nn: 'Norwegian Nynorsk', nno: 'Norwegian Nynorsk', no: 'Norwegian',
	nor: 'Norwegian', pl: 'Polish', pol: 'Polish', pt: 'Portuguese', por: 'Portuguese', ro: 'Romanian',
	ron: 'Romanian', rum: 'Romanian', ru: 'Russian', rus: 'Russian', sk: 'Slovak', slk: 'Slovak',
	slo: 'Slovak', sl: 'Slovenian', slv: 'Slovenian', sr: 'Serbian', srp: 'Serbian', sv: 'Swedish',
	swe: 'Swedish', ta: 'Tamil', tam: 'Tamil', te: 'Telugu', tel: 'Telugu', th: 'Thai',
	tha: 'Thai', tr: 'Turkish', tur: 'Turkish', uk: 'Ukrainian', ukr: 'Ukrainian', ur: 'Urdu',
	urd: 'Urdu', vi: 'Vietnamese', vie: 'Vietnamese', zh: 'Chinese', zho: 'Chinese', chi: 'Chinese'
};

// The two-letter code Silo takes for a language code, where the table knows one (`eng` is `en`), else the code.
export const siloLanguageCode = (code) => {
	const lower = String(code || '').trim().toLowerCase();
	const name = NAMES[lower];
	if (lower.length === 2 || !name) return lower;
	return Object.keys(NAMES).find((key) => key.length === 2 && NAMES[key] === name) || lower;
};

// The English name of a language code, or the code itself when the table doesn't know it.
export const siloLanguageName = (code) => {
	const trimmed = typeof code === 'string' ? code.trim() : '';
	if (!trimmed) return null;
	const base = trimmed.toLowerCase().split(/[-_]/)[0];
	if (base === 'und' || base === 'zxx' || base === 'mis') return null;
	return NAMES[base] || trimmed.toUpperCase();
};

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const maps = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const kbps = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 1000) : null);
const num = (v) => (typeof v === 'number' ? v : null);

const frameRate = (value) => {
	if (typeof value === 'number') return value > 0 ? value : null;
	const match = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(text(value) || '');
	if (!match) return null;
	const rate = match[2] ? parseFloat(match[1]) / parseFloat(match[2]) : parseFloat(match[1]);
	return rate > 0 && Number.isFinite(rate) ? rate : null;
};

// The tracks behind each stream index.
export const siloTrackForStreamIndex = (source, index) => {
	const entry = (source?.[SILO_TRACKS_KEY] || []).find((t) => t.Index === index);
	return entry && typeof entry.Ordinal === 'number' ? {kind: entry.Kind, ordinal: entry.Ordinal, containerIndex: entry.ContainerIndex} : null;
};

export const siloStreamIndexForTrack = (source, kind, ordinal) => {
	const entry = (source?.[SILO_TRACKS_KEY] || []).find((t) => t.Kind === kind && t.Ordinal === ordinal);
	return entry && typeof entry.Index === 'number' ? entry.Index : null;
};

export const siloNextStreamIndex = (source) => (source?.MediaStreams || [])
	.reduce((max, s) => (typeof s.Index === 'number' && s.Index > max ? s.Index : max), -1) + 1;

const IMAGE_SUBTITLE_CODECS = ['hdmv_pgs_subtitle', 'pgssub', 'pgs', 'dvd_subtitle', 'dvdsub', 'vobsub', 'dvb_subtitle', 'dvbsub', 'xsub'];
const SUBTITLE_CODEC_LABELS = {hdmv_pgs_subtitle: 'PGSSUB', dvd_subtitle: 'DVDSUB', dvb_subtitle: 'DVBSUB'};
const subtitleCodecLabel = (codec) => (codec ? SUBTITLE_CODEC_LABELS[codec] || codec.toUpperCase() : null);

// A subtitle Silo found or downloaded since the file was read, added after the file's own tracks.
export const siloAddedSubtitleStream = ({index, codec, language, label, forced = false, hearingImpaired = false}) => ({
	Type: 'Subtitle',
	Index: index,
	...(codec ? {Codec: codec} : null),
	...(language ? {Language: language} : null),
	...(label ? {Title: label} : null),
	DisplayTitle: [siloLanguageName(language), label && label !== language ? label : null].filter(Boolean).join(' - '),
	IsForced: forced,
	IsHearingImpaired: hearingImpaired,
	IsDefault: false,
	IsExternal: true,
	IsTextSubtitleStream: true,
	SupportsExternalStream: true
});

const RANGE_TYPES = {
	sdr: 'SDR', hdr10: 'HDR10', hdr10plus: 'HDR10Plus', hlg: 'HLG', dovi: 'DOVI', dolbyvision: 'DOVI', doviwithhdr10: 'DOVIWithHDR10',
	doviwithhdr10plus: 'DOVIWithHDR10Plus', doviwithhlg: 'DOVIWithHLG', doviwithsdr: 'DOVIWithSDR', doviwithel: 'DOVIWithEL',
	doviwithelhdr10plus: 'DOVIWithELHDR10Plus', doviinvalid: 'DOVIInvalid'
};

const derivedRangeType = (t) => {
	const dolbyVision = typeof t.dv_profile === 'number' || (text(t.dolby_vision) || 'none').toLowerCase() !== 'none';
	const hdr10Plus = t.hdr10_plus === true;
	if (dolbyVision) {
		const compat = num(t.dv_bl_compat_id);
		if (compat === 1 || compat === 6) return hdr10Plus ? 'DOVIWithHDR10Plus' : 'DOVIWithHDR10';
		if (compat === 2) return 'DOVIWithSDR';
		if (compat === 4) return 'DOVIWithHLG';
		return 'DOVI';
	}
	if (hdr10Plus) return 'HDR10Plus';
	const transfer = (text(t.color_transfer) || '').toLowerCase();
	if (transfer === 'smpte2084') return 'HDR10';
	if (transfer === 'arib-std-b67') return 'HLG';
	return 'SDR';
};

const videoRange = (t) => {
	const said = text(t.video_range_type);
	const type = said == null ? derivedRangeType(t) : (RANGE_TYPES[said.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')] || said);
	const range = text(t.video_range) ? text(t.video_range).toUpperCase() : (type === 'SDR' ? 'SDR' : 'HDR');
	return {range, type};
};

const resolutionLabel = (width, height, interlaced) => {
	if (!(width > 0) || !(height > 0)) return null;
	const s = interlaced ? 'i' : 'p';
	if (width >= 7600 || height >= 4300) return '8K';
	if (width >= 3800 || height >= 2000) return '4K';
	if (width >= 2500 || height >= 1400) return `1440${s}`;
	if (width >= 1800 || height >= 1000) return `1080${s}`;
	if (width >= 1200 || height >= 700) return `720${s}`;
	if (width >= 600 || height >= 400) return `480${s}`;
	return 'SD';
};

const videoTitle = (stream) => [
	resolutionLabel(stream.Width, stream.Height, stream.IsInterlaced === true),
	stream.VideoRange === 'HDR' ? (stream.VideoRangeType || 'HDR') : null,
	stream.Codec ? stream.Codec.toUpperCase() : null
].filter(Boolean).join(' ');

const channelLayout = (layout, channels) => {
	if (layout) {
		const bare = layout.replace(/\(.*\)/g, '').trim();
		return bare ? bare[0].toUpperCase() + bare.slice(1) : null;
	}
	return {1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1'}[channels] || null;
};

const videoStream = (t, index, first, fileBitrate) => {
	const range = videoRange(t);
	const rate = frameRate(t.frame_rate);
	const stream = {
		Type: 'Video',
		Index: index,
		...(text(t.codec) ? {Codec: text(t.codec)} : null),
		...(text(t.profile) ? {Profile: text(t.profile)} : null),
		...(num(t.level) != null ? {Level: t.level} : null),
		...(num(t.width) != null ? {Width: Math.trunc(t.width)} : null),
		...(num(t.height) != null ? {Height: Math.trunc(t.height)} : null),
		...(text(t.aspect_ratio) ? {AspectRatio: text(t.aspect_ratio)} : null),
		IsInterlaced: t.interlaced === true,
		...(rate ? {RealFrameRate: rate, AverageFrameRate: rate} : null),
		...(num(t.bit_depth) != null ? {BitDepth: Math.trunc(t.bit_depth)} : null),
		...(text(t.pixel_format) ? {PixelFormat: text(t.pixel_format)} : null),
		...(text(t.color_transfer) ? {ColorTransfer: text(t.color_transfer)} : null),
		...(text(t.color_primaries) ? {ColorPrimaries: text(t.color_primaries)} : null),
		...(text(t.color_space) ? {ColorSpace: text(t.color_space)} : null),
		VideoRange: range.range,
		VideoRangeType: range.type,
		...(num(t.dv_profile) != null ? {DvProfile: Math.trunc(t.dv_profile)} : null),
		...(num(t.dv_level) != null ? {DvLevel: Math.trunc(t.dv_level)} : null),
		...(num(t.dv_bl_compat_id) != null ? {DvBlSignalCompatibilityId: Math.trunc(t.dv_bl_compat_id)} : null),
		...((kbps(t.bitrate) || fileBitrate) ? {BitRate: kbps(t.bitrate) || fileBitrate} : null),
		...(text(t.embedded_title) ? {Title: text(t.embedded_title)} : null),
		IsDefault: first,
		IsExternal: false
	};
	stream.DisplayTitle = videoTitle(stream);
	return stream;
};

const audioStream = (t, index, isDefault) => {
	const channels = num(t.channels) != null ? Math.trunc(t.channels) : null;
	const layout = channelLayout(text(t.layout), channels);
	const language = text(t.language);
	const codec = text(t.codec);
	return {
		Type: 'Audio',
		Index: index,
		...(codec ? {Codec: codec} : null),
		...(text(t.profile) ? {Profile: text(t.profile)} : null),
		...(language ? {Language: language} : null),
		...(text(t.embedded_title) ? {Title: text(t.embedded_title)} : null),
		DisplayTitle: [siloLanguageName(language), codec ? codec.toUpperCase() : null, layout, isDefault ? '(Default)' : null]
			.filter(Boolean).join(' '),
		...(layout ? {ChannelLayout: layout} : null),
		...(channels != null ? {Channels: channels} : null),
		...(kbps(t.bitrate) ? {BitRate: kbps(t.bitrate)} : null),
		...(num(t.sample_rate) != null ? {SampleRate: Math.trunc(t.sample_rate)} : null),
		...(num(t.bit_depth) != null ? {BitDepth: Math.trunc(t.bit_depth)} : null),
		IsDefault: isDefault,
		IsExternal: false
	};
};

const subtitleStream = (t, index) => {
	const language = text(t.language);
	const codec = text(t.codec);
	const title = text(t.embedded_title);
	const forced = t.forced === true;
	const hearingImpaired = t.hearing_impaired === true;
	const isDefault = t.default === true;
	const isText = !codec || !IMAGE_SUBTITLE_CODECS.includes(codec);
	const languageName = siloLanguageName(language);
	const titleSays = (title || '').toLowerCase();
	const details = [
		title && (!languageName || !titleSays.includes(languageName.toLowerCase())) ? title : null,
		forced && !titleSays.includes('forced') ? 'Forced' : null,
		hearingImpaired && !titleSays.includes('sdh') && !titleSays.includes('cc') ? 'SDH' : null,
		isDefault ? 'Default' : null,
		subtitleCodecLabel(codec)
	].filter(Boolean).join(' ');
	return {
		Type: 'Subtitle',
		Index: index,
		...(codec ? {Codec: codec} : null),
		...(language ? {Language: language} : null),
		...(title ? {Title: title} : null),
		DisplayTitle: languageName == null ? details : (details ? `${languageName} (${details})` : languageName),
		IsForced: forced,
		IsHearingImpaired: hearingImpaired,
		IsDefault: isDefault,
		IsExternal: t.external === true,
		IsTextSubtitleStream: isText,
		SupportsExternalStream: isText
	};
};

const sourceName = (version, video) => {
	const fileName = text(version.file_name);
	if (fileName) {
		const dot = fileName.lastIndexOf('.');
		return dot > 0 ? fileName.slice(0, dot) : fileName;
	}
	return [
		text(version.edition_raw) || text(version.edition_key),
		text(version.resolution),
		text(version.codec_video) ? text(version.codec_video).toUpperCase() : null,
		version.hdr === true ? (video ? videoRange(video).type : 'HDR') : null
	].filter(Boolean).join(' ');
};

const defaultAudioOrdinal = (version, audios) => {
	if (!audios.length) return null;
	const effective = version.effective_audio_track_index;
	if (typeof effective === 'number' && effective >= 0 && effective < audios.length) return effective;
	const flagged = audios.findIndex((a) => a.default === true);
	return flagged >= 0 ? flagged : 0;
};

// One file version (with its tracks) as a MediaSource.
export const siloVersionToMediaSource = (version, itemId) => {
	const fileId = siloIdOf(version?.file_id);
	if (!fileId) return null;
	const videos = maps(version.video_tracks);
	const audios = maps(version.audio_tracks);
	const subtitles = maps(version.subtitle_tracks);
	const used = {};
	const subtitleIndex = subtitles.map((s) => {
		if (typeof s.index === 'number' && s.index >= 0 && !used[s.index]) {
			used[s.index] = true;
			return s.index;
		}
		return null;
	});
	let next = 0;
	const nextFree = () => {
		while (used[next]) next++;
		used[next] = true;
		return next;
	};
	const fileBitrate = kbps(version.bitrate);
	const defaultAudio = defaultAudioOrdinal(version, audios);
	const defaultSubtitle = subtitles.findIndex((s) => s.default === true);
	const streams = [];
	const tracks = [];
	const add = (stream, kind, ordinal, containerIndex) => {
		streams.push(stream);
		tracks.push({Index: stream.Index, Kind: kind, Ordinal: ordinal, ...(containerIndex != null ? {ContainerIndex: containerIndex} : null)});
	};
	videos.forEach((v, i) => add(videoStream(v, nextFree(), i === 0, fileBitrate), 'video', i));
	let defaultAudioIndex = null;
	audios.forEach((a, i) => {
		const index = nextFree();
		if (i === defaultAudio) defaultAudioIndex = index;
		add(audioStream(a, index, i === defaultAudio), 'audio', i);
	});
	let defaultSubtitleIndex = null;
	subtitles.forEach((s, i) => {
		const index = subtitleIndex[i] != null ? subtitleIndex[i] : nextFree();
		if (i === defaultSubtitle) defaultSubtitleIndex = index;
		add(subtitleStream(s, index), 'subtitle', i, subtitleIndex[i]);
	});
	streams.sort((a, b) => a.Index - b.Index);
	const duration = num(version.duration) != null ? version.duration : version.duration_seconds;
	return {
		Id: fileId,
		ItemId: itemId,
		Name: sourceName(version, videos[0]),
		Protocol: 'File',
		Type: 'Default',
		...(text(version.container) ? {Container: text(version.container)} : null),
		...(text(version.file_path) ? {Path: text(version.file_path)} : null),
		...(num(version.file_size) != null ? {Size: Math.trunc(version.file_size)} : null),
		...(fileBitrate ? {Bitrate: fileBitrate} : null),
		...(typeof duration === 'number' && duration > 0 ? {RunTimeTicks: secondsToTicks(duration)} : null),
		IsRemote: false,
		SupportsDirectPlay: true,
		SupportsDirectStream: true,
		SupportsTranscoding: true,
		...(defaultAudioIndex != null ? {DefaultAudioStreamIndex: defaultAudioIndex} : null),
		...(defaultSubtitleIndex != null ? {DefaultSubtitleStreamIndex: defaultSubtitleIndex} : null),
		MediaStreams: streams,
		[SILO_TRACKS_KEY]: tracks,
		_silo: version
	};
};

const nominalHeight = (resolution) => {
	const match = /(\d{3,4})/.exec(text(resolution) || '');
	if (match) return parseInt(match[1], 10);
	return {'4k': 2160, uhd: 2160, '8k': 4320}[(text(resolution) || '').toLowerCase()] || null;
};

// A season list's file summary, which says less than a version.
export const siloFileToMediaSource = (file, itemId) => {
	const fileId = siloIdOf(file?.file_id);
	if (!fileId) return null;
	const height = nominalHeight(file.resolution);
	const hdr = file.hdr === true;
	const video = {
		Type: 'Video',
		Index: 0,
		...(text(file.codec_video) ? {Codec: text(file.codec_video)} : null),
		...(height ? {Width: Math.round(height * 16 / 9), Height: height} : null),
		VideoRange: hdr ? 'HDR' : 'SDR',
		...(hdr ? null : {VideoRangeType: 'SDR'}),
		IsDefault: true
	};
	video.DisplayTitle = videoTitle(video);
	return {
		Id: fileId,
		ItemId: itemId,
		Name: sourceName(file, null),
		Protocol: 'File',
		Type: 'Default',
		...(text(file.container) ? {Container: text(file.container)} : null),
		...(num(file.file_size) != null ? {Size: Math.trunc(file.file_size)} : null),
		IsRemote: false,
		SupportsDirectPlay: true,
		SupportsDirectStream: true,
		SupportsTranscoding: true,
		MediaStreams: [video].concat(num(file.audio_channels) != null ? [{Type: 'Audio', Index: 1, Channels: Math.trunc(file.audio_channels), IsDefault: true}] : []),
		[SILO_TRACKS_KEY]: [],
		_silo: file
	};
};

// An item's files, the one Silo plays by default first.
export const siloItemMediaSources = (item, itemId) => {
	const variants = Array.isArray(item?.playback_variants) ? item.playback_variants : [];
	const defaultFileId = variants.length ? siloIdOf(variants[0]?.default_file_id) : null;
	let sources = [];
	if (Array.isArray(item?.versions) && item.versions.length) {
		sources = maps(item.versions).map((v) => siloVersionToMediaSource(v, itemId)).filter(Boolean);
	} else if (Array.isArray(item?.files)) {
		sources = maps(item.files).map((f) => siloFileToMediaSource(f, itemId)).filter(Boolean);
	}
	const at = defaultFileId ? sources.findIndex((s) => s.Id === defaultFileId) : -1;
	if (at > 0) sources.unshift(sources.splice(at, 1)[0]);
	sources.forEach((s, i) => {
		s.Type = i === 0 ? 'Default' : 'Grouping';
	});
	return sources;
};
