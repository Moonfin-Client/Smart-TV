export const SUBTITLE_SIZE_OPTIONS = [
	{ value: 'small', label: 'Small', fontSize: 36 },
	{ value: 'medium', label: 'Medium', fontSize: 44 },
	{ value: 'large', label: 'Large', fontSize: 52 },
	{ value: 'xlarge', label: 'Extra Large', fontSize: 60 }
];

export const SUBTITLE_COLOR_OPTIONS = [
	{ value: '#ffffff', label: 'White' },
	{ value: '#ffff00', label: 'Yellow' },
	{ value: '#00ffff', label: 'Cyan' },
	{ value: '#ff00ff', label: 'Magenta' },
	{ value: '#00ff00', label: 'Green' },
	{ value: '#ff0000', label: 'Red' },
	{ value: '#808080', label: 'Grey' },
	{ value: '#404040', label: 'Dark Grey' }
];

export const SUBTITLE_POSITION_OPTIONS = [
	{ value: 'bottom', label: 'Bottom', offset: 10 },
	{ value: 'lower', label: 'Lower', offset: 20 },
	{ value: 'middle', label: 'Middle', offset: 30 },
	{ value: 'higher', label: 'Higher', offset: 40 },
	{ value: 'absolute', label: 'Absolute', offset: 0 }
];

export const SUBTITLE_SHADOW_COLOR_OPTIONS = [
	{ value: '#000000', label: 'Black' },
	{ value: '#ffffff', label: 'White' },
	{ value: '#808080', label: 'Grey' },
	{ value: '#404040', label: 'Dark Grey' },
	{ value: '#ff0000', label: 'Red' },
	{ value: '#00ff00', label: 'Green' },
	{ value: '#0000ff', label: 'Blue' }
];

export const SUBTITLE_BACKGROUND_COLOR_OPTIONS = [
	{ value: '#000000', label: 'Black' },
	{ value: '#ffffff', label: 'White' },
	{ value: '#808080', label: 'Grey' },
	{ value: '#404040', label: 'Dark Grey' },
	{ value: '#000080', label: 'Navy' }
];

const hexOpacity = (opacity) => Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');

const SIZE_MAP = { small: 36, medium: 44, large: 52, xlarge: 60 };
const POSITION_MAP = { bottom: 10, lower: 20, middle: 30, higher: 40 };

export const getSubtitleOverlayStyle = (settings) => ({
	bottom: settings.subtitlePosition === 'absolute'
		? `${100 - settings.subtitlePositionAbsolute}%`
		: `${POSITION_MAP[settings.subtitlePosition] || 10}%`,
	opacity: (settings.subtitleOpacity || 100) / 100
});

export const getSubtitleTextStyle = (settings) => {
	const shadowColor = `${settings.subtitleShadowColor || '#000000'}${hexOpacity(settings.subtitleShadowOpacity !== undefined ? settings.subtitleShadowOpacity : 100)}`;
	const blur = `${settings.subtitleShadowBlur || 0.1}em`;

	return {
		fontSize: `${SIZE_MAP[settings.subtitleSize] || 44}px`,
		backgroundColor: `${settings.subtitleBackgroundColor || '#000000'}${hexOpacity(settings.subtitleBackground !== undefined ? settings.subtitleBackground : 0)}`,
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

