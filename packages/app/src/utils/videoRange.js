const normalizeToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

const rangeToken = (videoStream) => {
	const raw = [videoStream.VideoRangeType, videoStream.ExtendedVideoType, videoStream.VideoRange]
		.find((value) => typeof value === 'string' && value.trim() !== '') || '';
	return normalizeToken(raw.replace(/\+/g, 'PLUS'));
};

// The HDR format a stream carries, from whichever range field the server filled in. Emby types it
// in ExtendedVideoType and writes VideoRange as prose, HDR 10 rather than HDR10, so the value is
// squashed first, with + spelled out so HDR 10+ doesn't read as HDR10.
export const videoRangeLabel = (videoStream) => {
	if (!videoStream) return 'SDR';
	const range = rangeToken(videoStream);

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

// The digits after DoviProfile in Emby's sub type, such as 81.
const embyDolbyVisionSubType = (videoStream) => (/doviprofile(\d+)/i.exec(videoStream.ExtendedVideoSubType || '') || [])[1] || '';

// Jellyfin, Silo and Plex give the profile in DvProfile. Emby's sub type starts with it, except for
// profile 10 (DoviProfile10x).
export const dolbyVisionProfile = (videoStream) => {
	if (videoStream.DvProfile > 0) return Number(videoStream.DvProfile);
	const digits = embyDolbyVisionSubType(videoStream);
	if (!digits) return null;
	return digits[0] === '1' ? 10 : Number(digits[0]) || null;
};

// The layer under the Dolby Vision, from the name after DOVIWith in the range type or from Emby's
// sub type. Null for an SDR layer or none at all.
const dolbyVisionFallback = (range, videoStream) => {
	const named = /^DOVIWITH(?:EL)?(.*)$/.exec(range);
	if (named) {
		if (!named[1]) return 'HDR10';
		const label = videoRangeLabel({VideoRangeType: named[1]});
		return label === 'SDR' ? null : label;
	}
	const subType = embyDolbyVisionSubType(videoStream);
	if (subType === '61' || subType === '81' || subType[0] === '7') return 'HDR10';
	return subType === '84' ? 'HLG' : null;
};

// The details screen's range badges: Dolby Vision with its profile when the server gives one (DV P8),
// then the layer a display without Dolby Vision falls back to. Dolby Vision the server calls invalid
// reads as the VideoRange the picture has, and a stream with no range field has no badge.
export const videoRangeBadges = (videoStream) => {
	const range = videoStream ? rangeToken(videoStream) : '';
	if (!range) return [];
	if (range === 'DOVIINVALID') return [videoStream.VideoRange === 'HDR' ? 'HDR' : 'SDR'];
	if (range.indexOf('DOVI') === -1 && range.indexOf('DOLBYVISION') === -1) return [videoRangeLabel(videoStream)];
	const profile = dolbyVisionProfile(videoStream);
	const fallback = dolbyVisionFallback(range, videoStream);
	return [profile ? `DV P${profile}` : 'DV'].concat(fallback ? [fallback] : []);
};

export const findVideoStream = (mediaSource) =>
	(mediaSource?.MediaStreams || []).find((s) => s.Type === 'Video') || null;

// What reaches the screen, not what sits on disk. A transcode drops the HDR metadata,
// so an HDR source arrives as SDR and wants the SDR style.
export const isHdrOutput = (mediaSource, isTranscoding) => {
	if (isTranscoding) return false;
	return isHdrVideoStream(findVideoStream(mediaSource));
};
