// Single source of truth for how each subtitle codec is delivered.
// Text formats render on the web layer, PGS renders client side via libpgs,
// and dvd or dvb bitmaps have no client renderer so the server burns them in.
export const TEXT_SUBTITLE_CODECS = ['srt', 'subrip', 'vtt', 'webvtt', 'ass', 'ssa', 'sub', 'smi', 'sami'];
export const ASS_SUBTITLE_CODECS = ['ass', 'ssa'];
export const PGS_SUBTITLE_CODECS = ['pgssub', 'hdmv_pgs', 'pgs'];
export const BURN_IN_SUBTITLE_CODECS = ['dvdsub', 'dvbsub', 'dvb_subtitle'];

export const isTextSubtitleCodec = (codec) => TEXT_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isAssSubtitleCodec = (codec) => ASS_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isPgsSubtitleCodec = (codec) => PGS_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
export const isBurnInSubtitleCodec = (codec) => BURN_IN_SUBTITLE_CODECS.includes((codec || '').toLowerCase());
