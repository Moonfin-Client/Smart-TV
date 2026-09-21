import $L from '@enact/i18n/$L';

export const SUBTITLE_SIZE_OPTIONS = [
	{ value: 'small', label: $L('Small'), fontSize: 36 },
	{ value: 'medium', label: $L('Medium'), fontSize: 44 },
	{ value: 'large', label: $L('Large'), fontSize: 52 },
	{ value: 'xlarge', label: $L('Extra Large'), fontSize: 60 }
];

export const SUBTITLE_COLOR_OPTIONS = [
	{ value: '#ffffff', label: $L('White') },
	{ value: '#cccccc', label: $L('Light Grey') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#0000ff', label: $L('Blue') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#000080', label: $L('Navy') },
	{ value: '#00000000', label: $L('Transparent') },
	{ value: '#00000080', label: $L('Semi-transparent Black') },
	{ value: '#ffffff80', label: $L('Semi-transparent White') }
];

export const SUBTITLE_POSITION_OPTIONS = [
	{ value: 'bottom', label: $L('Bottom'), offset: 10 },
	{ value: 'lower', label: $L('Lower'), offset: 20 },
	{ value: 'middle', label: $L('Middle'), offset: 30 },
	{ value: 'higher', label: $L('Higher'), offset: 40 },
	{ value: 'absolute', label: $L('Absolute'), offset: 0 }
];

export const SUBTITLE_SHADOW_COLOR_OPTIONS = [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#cccccc', label: $L('Light Grey') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#0000ff', label: $L('Blue') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#000080', label: $L('Navy') },
	{ value: '#00000000', label: $L('Transparent') },
	{ value: '#00000080', label: $L('Semi-transparent Black') },
	{ value: '#ffffff80', label: $L('Semi-transparent White') }
];

export const SUBTITLE_BACKGROUND_COLOR_OPTIONS = [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#cccccc', label: $L('Light Grey') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#0000ff', label: $L('Blue') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#000080', label: $L('Navy') },
	{ value: '#00000000', label: $L('Transparent') },
	{ value: '#00000080', label: $L('Semi-transparent Black') },
	{ value: '#ffffff80', label: $L('Semi-transparent White') }
];

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
	'subtitleBackground'
];

export const hdrKeyFor = (key) => `${key}Hdr`;

export const subtitleStyleKey = (key, isHdr) => (isHdr ? hdrKeyFor(key) : key);

/**
 * Flattens the HDR twins over the base keys while HDR is on screen, so everything
 * downstream keeps reading the base names.
 */
export const resolveSubtitleStyleSettings = (settings, isHdr) => {
	if (!isHdr || !settings?.subtitleHdrSeparate) return settings;

	const resolved = {...settings};
	for (const key of SUBTITLE_STYLE_KEYS) {
		const value = settings[hdrKeyFor(key)];
		if (value !== undefined) resolved[key] = value;
	}
	return resolved;
};

const hexOpacity = (opacity) => Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');

export const formatColorWithOpacity = (color, opacityPercent, defaultOpacity = 100) => {
	const c = color || '#000000';
	const opacity = opacityPercent !== undefined ? opacityPercent : defaultOpacity;
	if (c.startsWith('#') && c.length === 9) {
		const baseHex = c.slice(0, 7);
		const baseAlpha = parseInt(c.slice(7, 9), 16) / 255;
		const finalAlpha = Math.round((opacity / 100) * baseAlpha * 255)
			.toString(16)
			.padStart(2, '0');
		return `${baseHex}${finalAlpha}`;
	}
	return `${c}${hexOpacity(opacity)}`;
};

export const getSubtitleColorOptions = () => SUBTITLE_COLOR_OPTIONS;
export const getSubtitleShadowColorOptions = () => SUBTITLE_SHADOW_COLOR_OPTIONS;
export const getSubtitleBackgroundColorOptions = () => SUBTITLE_BACKGROUND_COLOR_OPTIONS;

const SIZE_MAP = { small: 36, medium: 44, large: 52, xlarge: 60 };
const POSITION_MAP = { bottom: 10, lower: 20, middle: 30, higher: 40 };

export const getSubtitleOverlayStyle = (settings) => ({
	bottom: settings.subtitlePosition === 'absolute'
		? `${100 - settings.subtitlePositionAbsolute}%`
		: `${POSITION_MAP[settings.subtitlePosition] || 10}%`,
	opacity: (settings.subtitleOpacity || 100) / 100
});

export const getSubtitleTextStyle = (settings) => {
	const shadowColor = formatColorWithOpacity(settings.subtitleShadowColor || '#000000', settings.subtitleShadowOpacity, 100);
	const blur = `${settings.subtitleShadowBlur || 0.1}em`;

	return {
		fontSize: `${SIZE_MAP[settings.subtitleSize] || 44}px`,
		backgroundColor: formatColorWithOpacity(settings.subtitleBackgroundColor || '#000000', settings.subtitleBackground, 0),
		color: settings.subtitleColor || '#ffffff',
		textShadow: `-2px -2px ${blur} ${shadowColor}, 2px -2px ${blur} ${shadowColor}, -2px 2px ${blur} ${shadowColor}, 2px 2px ${blur} ${shadowColor}, 0 0 ${blur} ${shadowColor}`
	};
};

export const sanitizeSubtitleHtml = (text) =>
	text
		.replace(/\\N/gi, '<br/>')
		.replace(/\r?\n/gi, '<br/>')
		.replace(/{\\.*?}/gi, '')
		.replace(/ {2,}/g, ' ')
		.trim();

