import $L from '../services/i18n.js';

// The palette the other clients offer, in their order. The three see-through entries carry their
// own alpha as #rrggbbaa. The text fill leaves out Transparent, which would hide the text.
const subtitlePalette = ({allowTransparent}) => [
	{ value: '#ffffff', label: $L('White') },
	{ value: '#cccccc', label: $L('Light Gray') },
	{ value: '#808080', label: $L('Gray') },
	{ value: '#404040', label: $L('Dark Gray') },
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#0000ff', label: $L('Blue') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#000080', label: $L('Navy') },
	...(allowTransparent ? [{ value: '#00000000', label: $L('Transparent') }] : []),
	{ value: '#00000080', label: $L('Semi-transparent Black') },
	{ value: '#ffffff80', label: $L('Semi-transparent White') }
];

export const getSubtitleColorOptions = () => subtitlePalette({allowTransparent: false});
export const getSubtitleShadowColorOptions = () => subtitlePalette({allowTransparent: true});
export const getSubtitleBackgroundColorOptions = () => subtitlePalette({allowTransparent: true});

// Every style setting that has an HDR twin stored alongside it.
export const SUBTITLE_STYLE_KEYS = [
	'subtitleSize',
	'subtitlePosition',
	'subtitlePositionAbsolute',
	'subtitleOpacity',
	'subtitleColor',
	'subtitleShadowColor',
	'subtitleShadowOpacity',
	'subtitleShadowBlur',
	'subtitleBackgroundColor',
	'subtitleBackground',
	'subtitleBold'
];

// The outline width, the drop shadow and the font have no HDR twin.
export const SUBTITLE_SHARED_STYLE_KEYS = [
	'subtitleStrokeWidth',
	'subtitleDropShadow',
	'subtitleDropShadowIntensity',
	'subtitleDropShadowOffset',
	'subtitleDropShadowBlur',
	'subtitleFont'
];

export const hdrKeyFor = (key) => `${key}Hdr`;

export const subtitleStyleKey = (key, isHdr) => (isHdr ? hdrKeyFor(key) : key);

// Flattens the HDR twins over the base keys while HDR is on screen, so everything
// downstream keeps reading the base names.
export const resolveSubtitleStyleSettings = (settings, isHdr) => {
	if (!isHdr || !settings?.subtitleHdrSeparate) return settings;

	const resolved = {...settings};
	for (const key of SUBTITLE_STYLE_KEYS) {
		const value = settings[hdrKeyFor(key)];
		if (value !== undefined) resolved[key] = value;
	}
	return resolved;
};

const SIZE_MAP = { small: 36, medium: 44, large: 52, xlarge: 60 };
const POSITION_MAP = { bottom: 10, lower: 20, middle: 30, higher: 40 };

// A second track on screen moves the first by shiftPercent, never past the bottom edge.
export const getSubtitleOverlayStyle = (settings, shiftPercent = 0) => {
	const bottom = settings.subtitlePosition === 'absolute'
		? 100 - settings.subtitlePositionAbsolute
		: POSITION_MAP[settings.subtitlePosition] || 10;
	return {
		bottom: `${Math.max(0, bottom + shiftPercent)}%`,
		opacity: (settings.subtitleOpacity || 100) / 100
	};
};

export const getSubtitleFontPx = (settings) => SIZE_MAP[settings?.subtitleSize] || 44;

// The size setting as a multiple of an ASS track's own sizes. Medium leaves the track as authored.
export const getAssFontScale = (settings) => getSubtitleFontPx(settings) / SIZE_MAP.medium;

export const sanitizeSubtitleHtml = (text) =>
	text
		.replace(/\\N/gi, '<br/>')
		.replace(/\r?\n/gi, '<br/>')
		.replace(/{\\.*?}/gi, '')
		.replace(/ {2,}/g, ' ')
		.trim();

