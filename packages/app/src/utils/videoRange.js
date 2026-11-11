const normalizeToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

// The HDR format a stream carries, from whichever range field the server filled in. Emby types it
// in ExtendedVideoType and writes VideoRange as prose, HDR 10 rather than HDR10, so the value is
// squashed first, with + spelled out so HDR 10+ doesn't read as HDR10.
export const videoRangeLabel = (videoStream) => {
	if (!videoStream) return 'SDR';
	const raw = [videoStream.VideoRangeType, videoStream.ExtendedVideoType, videoStream.VideoRange]
		.find((value) => typeof value === 'string' && value.trim() !== '') || '';
	const range = normalizeToken(raw.replace(/\+/g, 'PLUS'));

	if (range.indexOf('DOVI') !== -1 || range.indexOf('DOLBYVISION') !== -1) return 'Dolby Vision';
	// Ahead of HDR10, which its own name would match first.
	if (range.indexOf('HDR10PLUS') !== -1) return 'HDR10+';
	if (range.indexOf('HDR10') !== -1) return 'HDR10';
	if (range.indexOf('HLG') !== -1 || range.indexOf('HYPERLOGGAMMA') !== -1) return 'HLG';
	if (range.indexOf('HDR') !== -1) return 'HDR';
	return 'SDR';
};

export const isHdrVideoStream = (videoStream) => videoRangeLabel(videoStream) !== 'SDR';

// Emby sub types whose base layer is plain HDR10, so a decoder that skips the Dolby Vision
// metadata still renders the picture the file carries.
const HDR10_COMPATIBLE_EMBY_SUB_TYPES = ['DOVIPROFILE61', 'DOVIPROFILE81'];

// Jellyfin's VideoRangeType for the stream. Emby leaves that off and types Dolby Vision in
// ExtendedVideoType, or the VideoRange it derives from it, with the profile in ExtendedVideoSubType
// such as DoviProfile81, where the first digit is the profile. That reads as the range type Jellyfin
// gives the same file, so the checks written against Jellyfin's names hold for both. A Dolby Vision
// stream with no profile to go by can only ask for a Dolby Vision decoder.
export const videoRangeTypeOf = (videoStream) => {
	if (!videoStream) return '';
	if (videoStream.VideoRangeType) return videoStream.VideoRangeType;
	const type = normalizeToken(videoStream.ExtendedVideoType) || normalizeToken(videoStream.VideoRange);
	if (type !== 'DOLBYVISION') return '';
	const subType = normalizeToken(videoStream.ExtendedVideoSubType);
	if (HDR10_COMPATIBLE_EMBY_SUB_TYPES.indexOf(subType) !== -1) return 'DOVIWithHDR10';
	if (subType.indexOf('DOVIPROFILE5') === 0) return 'DOVI';
	if (subType.indexOf('DOVIPROFILE7') === 0) return 'DOVIWithEL';
	return 'DolbyVision';
};

// The format under the Dolby Vision, named after DOVIWith in the range type. A profile 7 enhancement
// layer sits on HDR10 unless HDR10+ is named with it, and bare Dolby Vision has nothing under it.
export const baseLayerLabel = (videoStream) => {
	const match = normalizeToken(videoRangeTypeOf(videoStream)).match(/^DOVIWITH(?:EL)?(.*)$/);
	if (!match) return null;
	return videoRangeLabel({VideoRangeType: match[1] || 'HDR10'});
};

// The Dolby Vision profile, from DvProfile (Jellyfin, Silo, Plex) or Emby's ExtendedVideoSubType, where
// DoviProfile81 is profile 8 and DoviProfile10x is profile 10.
export const dolbyVisionProfile = (stream) => {
	if (stream?.DvProfile) return stream.DvProfile;
	const digits = (/doviprofile(\d+)/i.exec(stream?.ExtendedVideoSubType || '') || [])[1];
	if (!digits) return null;
	return digits.startsWith('1') ? 10 : Number(digits[0]);
};

export const findVideoStream = (mediaSource) =>
	(mediaSource?.MediaStreams || []).find((s) => s.Type === 'Video') || null;

// What reaches the screen, not what sits on disk. A transcode drops the HDR metadata,
// so an HDR source arrives as SDR and wants the SDR style.
export const isHdrOutput = (mediaSource, isTranscoding) => {
	if (isTranscoding) return false;
	return isHdrVideoStream(findVideoStream(mediaSource));
};
