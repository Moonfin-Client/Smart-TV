import $L from '../services/i18n.js';

import {baseLayerLabel, videoRangeLabel} from './videoRange';

// The player's info panel and the details screen's file footer both read these, so they live here
// rather than in the player, where importing them would pull the player in too.

export const formatBitrate = (bitrate) => {
	if (!bitrate) return $L('Unknown');
	if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
	if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
	return `${bitrate} bps`;
};

// A panel that can't decode Dolby Vision shows the base layer instead, so that's the format named.
export const getHdrType = (videoStream, showsDolbyVision = true) => {
	const label = videoRangeLabel(videoStream);
	if (label !== 'Dolby Vision' || showsDolbyVision) return label;
	return baseLayerLabel(videoStream) || label;
};

const VIDEO_CODEC_NAMES = {
	hevc: 'HEVC', h265: 'HEVC', h264: 'H.264', avc: 'H.264', av1: 'AV1', vp9: 'VP9', vp8: 'VP8',
	mpeg2video: 'MPEG-2', mpeg4: 'MPEG-4', vc1: 'VC-1'
};

const AUDIO_CODEC_NAMES = {aac: 'AAC', flac: 'FLAC', opus: 'Opus', mp3: 'MP3', vorbis: 'Vorbis', alac: 'ALAC'};

const DOLBY_NAMES = {truehd: 'Dolby TrueHD', eac3: 'Dolby Digital Plus', ac3: 'Dolby Digital'};

export const lower = (value) => (value == null ? '' : String(value)).trim().toLowerCase();

export const videoCodecName = (codec) => {
	const key = lower(codec);
	return key ? (VIDEO_CODEC_NAMES[key] || key.toUpperCase()) : null;
};

// A profile or level the server wrote as 0 is one it didn't read.
export const present = (value) => {
	const text = value == null ? '' : String(value).trim();
	return text && text !== '0' ? text : null;
};

export const getVideoCodec = (videoStream) => {
	const name = videoCodecName(videoStream?.Codec);
	if (!name) return null;
	const profile = present(videoStream.Profile);
	return profile ? `${name} ${profile}` : name;
};

// The server writes Atmos and the DTS extensions into the profile, as in "Dolby TrueHD + Dolby Atmos".
export const audioCodecName = (codec, profile) => {
	const key = lower(codec);
	if (!key) return null;
	const detail = lower(profile);
	if (DOLBY_NAMES[key]) return detail.indexOf('atmos') !== -1 ? `${DOLBY_NAMES[key]} with Atmos` : DOLBY_NAMES[key];
	if (key === 'dts' || key === 'dca') {
		if (/dts[:\- ]?x\b/.test(detail)) return 'DTS:X';
		if (/\bma\b/.test(detail)) return 'DTS-HD Master Audio';
		if (/\bhra\b/.test(detail)) return 'DTS-HD High Resolution';
		return 'DTS';
	}
	if (key.indexOf('pcm_') === 0) return 'PCM';
	return AUDIO_CODEC_NAMES[key] || key.toUpperCase();
};

export const audioChannelsName = (channels) => {
	if (!(channels > 0)) return null;
	if (channels === 1) return $L('Mono');
	if (channels === 2) return $L('Stereo');
	if (channels === 6) return $L('5.1 surround');
	if (channels === 8) return $L('7.1 surround');
	return $L('{count} channels').replace('{count}', channels);
};

// How a converted count names what it came from, without the word surround.
export const channelLayout = (channels) => {
	if (channels === 6) return $L('5.1');
	if (channels === 8) return $L('7.1');
	return audioChannelsName(channels);
};

// These give back nothing rather than a placeholder, because the details footer leaves a line out
// entirely when the server didn't say.

export const getResolution = (videoStream) => {
	const width = videoStream?.Width;
	const height = videoStream?.Height;
	if (!width || !height) return null;
	return `${width} × ${height}`;
};

export const getFrameRate = (videoStream) => {
	const fps = videoStream?.RealFrameRate || videoStream?.AverageFrameRate;
	if (!fps) return null;
	return `${Number(fps).toFixed(3)} fps`;
};

export const getBitDepth = (stream) => (stream?.BitDepth ? `${stream.BitDepth}-bit` : null);
