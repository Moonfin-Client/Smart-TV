// Single source of truth for how each subtitle codec is delivered.
// Text formats render on the web layer, PGS renders client side via libpgs,
// and dvd or dvb bitmaps have no client renderer so the server burns them in.
export const TEXT_SUBTITLE_CODECS = ['srt', 'subrip', 'vtt', 'webvtt', 'ass', 'ssa', 'sub', 'smi', 'sami', 'mov_text'];
export const ASS_SUBTITLE_CODECS = ['ass', 'ssa'];
export const PGS_SUBTITLE_CODECS = ['pgssub', 'hdmv_pgs', 'hdmv_pgs_subtitle', 'pgs'];
export const BURN_IN_SUBTITLE_CODECS = ['dvdsub', 'dvbsub', 'dvb_subtitle'];

export const isTextSubtitleCodec = (codec) => TEXT_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isAssSubtitleCodec = (codec) => ASS_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isPgsSubtitleCodec = (codec) => PGS_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isBurnInSubtitleCodec = (codec) => BURN_IN_SUBTITLE_CODECS.includes((codec || '').toLowerCase());

const MATROSKA_CONTAINERS = ['mkv', 'matroska'];

/** True for a container whose subtitle tracks can be read back out of the file itself. */
export const isMatroskaContainer = (container) =>
	String(container || '').toLowerCase().split(',').map((part) => part.trim()).some((part) => MATROSKA_CONTAINERS.includes(part));

/**
 * True when this subtitle is embedded PGS the client should read out of the media file it
 * is already streaming, instead of asking the server to extract a sidecar for it. The side
 * costs a full pass over the source with ffmpeg before the first subtitle can appear, and
 * the platform has to have a renderer for what comes out of the file.
 */
export const isInBandSubtitleTrack = (codec, {isExternal, container, canStreamInBand} = {}) =>
	!isExternal &&
	!!canStreamInBand &&
	isPgsSubtitleCodec(codec) &&
	isMatroskaContainer(container);
