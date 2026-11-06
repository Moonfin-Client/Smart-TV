import {rem} from '../../utils/rootScale';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';
import {POSTER_LABEL_FLAGS} from './posterLabelFlags';

// How one label draws, matching the admin page's preview.

// Label sizes are points on an 1150 wide layout, and this app lays out at 1920.
const POINT_SCALE = 1920 / 1150;

// The server's own default, for a color that doesn't parse.
const FALLBACK_COLOR = '#2563EB';

// The line height the stylesheet gives a label's text. A flag drawn alone is as tall as a text
// label, so its edge lines up with the labels around it.
const LINE_HEIGHT = 1.2;

// The server names icons the way Material does. An unknown name draws no icon.
const knownIcon = (icon) => (typeof CORE_ICON_PATHS[icon] === 'string' ? icon : null);

const SIZES = {small: 0.8, medium: 1, large: 1.25, xlarge: 1.5};

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

const parseColor = (hex) => (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)
	? [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
	: null);

const channel = (value) => {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const rgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;

const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

export const posterLabelFlag = (icon) => {
	if (typeof icon !== 'string' || !icon.startsWith('flag-')) return null;
	const code = icon.slice(5);
	return POSTER_LABEL_FLAGS.has(code) ? code : null;
};

// A label with no text and an icon this app doesn't know would be an empty pill, from a server
// newer than the app.
export const canDrawPosterLabel = (badge) => badge.label.trim() !== '' ||
	knownIcon(badge.icon) !== null ||
	posterLabelFlag(badge.icon) !== null;

// The fill, text and border for a label's style. Opacity fades the fill and the border, never the
// text, so it stays readable.
export const posterLabelColors = (badge) => {
	const color = parseColor(badge.color) || parseColor(FALLBACK_COLOR);
	const alpha = Math.min(100, Math.max(10, badge.opacity)) / 100;
	const lum = luminance(color);
	let background;
	let text;
	let border = null;
	switch (badge.style) {
		case 'glass':
			background = rgba(color, 0.45 * alpha);
			border = {width: 1, color: rgba(WHITE, 0.35 * alpha)};
			text = rgb(WHITE);
			break;
		case 'outline':
			background = rgba(BLACK, 0.55 * alpha);
			border = {width: 1.5, color: rgba(color, alpha)};
			text = rgb(lum < 0.05 ? WHITE : color);
			break;
		case 'dark':
			background = rgba([12, 12, 16], 0.85 * alpha);
			text = rgb(lum < 0.05 ? WHITE : color);
			break;
		case 'light':
			background = rgba(WHITE, 0.92 * alpha);
			text = lum > 0.4 ? rgb([17, 17, 17]) : rgb(color);
			break;
		default:
			background = rgba(color, alpha);
			// The admin can pick any color, so the text turns dark once the fill is bright enough to need it.
			text = rgb(Math.pow(lum + 0.05, 2) > 0.15 ? BLACK : WHITE);
	}
	const own = parseColor(badge.textColor);
	return {background, border, text: own ? rgb(own) : text};
};

// Everything one label needs to draw, or null when it has nothing to show. Sizes are points grown
// to this app's canvas, then by the card's scale and the label's own size.
export const posterLabelLook = (badge, scale) => {
	if (!canDrawPosterLabel(badge)) return null;
	const size = scale * (SIZES[badge.size] || 1);
	const at = (points) => rem(points * POINT_SCALE * size);
	const hasText = badge.label.trim() !== '';
	const flag = posterLabelFlag(badge.icon);

	// A flag alone is its own shape, so it gets no fill and no padding.
	if (!hasText && flag) {
		const height = 10 * LINE_HEIGHT + 4;
		return {
			flag,
			flagOnly: true,
			name: `flag ${flag.toUpperCase()}`,
			style: {
				width: at(height * 4 / 3),
				height: at(height),
				borderRadius: badge.shape === 'square' ? 0 : at(badge.shape === 'pill' ? 5 : 3)
			}
		};
	}

	const {background, border, text} = posterLabelColors(badge);
	const icon = flag ? null : knownIcon(badge.icon);
	const gap = hasText ? at(3) : 0;
	return {
		text: hasText ? badge.label : null,
		icon,
		flag,
		// Read out for a label without text, since there's nothing else to read.
		name: hasText ? null : badge.icon.replace(/_/g, ' '),
		style: {
			background,
			color: text,
			border: border ? `${rem(border.width * POINT_SCALE)} solid ${border.color}` : 'none',
			borderRadius: badge.shape === 'pill' ? '999px' : badge.shape === 'square' ? 0 : at(4),
			fontSize: at(10),
			// An icon alone sits in a squarer pill.
			padding: `${at(2)} ${at(icon && !hasText ? 3 : 6)}`
		},
		iconStyle: icon ? {width: at(12.5), height: at(12.5), marginRight: gap} : null,
		flagStyle: flag ? {width: at(10 * 4 / 3), height: at(10), marginRight: gap} : null
	};
};

// The labels each corner shows, in the admin's order, or null when there are none to draw.
export const posterLabelCorners = (badges, perCorner, scale) => {
	const corners = {};
	let any = false;
	badges.forEach((badge) => {
		const shown = corners[badge.corner] || [];
		if (shown.length >= perCorner) return;
		const look = posterLabelLook(badge, scale);
		if (!look) return;
		shown.push(look);
		corners[badge.corner] = shown;
		any = true;
	});
	return any ? corners : null;
};
