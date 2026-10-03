const REQUIRED_COLOR_KEYS = [
	'background',
	'onBackground',
	'surface',
	'onSurface',
	'surfaceVariant',
	'scrim',
	'accent',
	'onAccent',
	'buttonNormal',
	'buttonFocused',
	'buttonDisabled',
	'buttonActive',
	'onButtonNormal',
	'onButtonFocused',
	'onButtonDisabled',
	'inputBackground',
	'inputFocused',
	'inputBorder',
	'inputBorderFocused',
	'rangeTrack',
	'rangeProgress',
	'rangeThumb',
	'seekbarBuffered',
	'badgeBackground',
	'onBadge',
	'badgeUnplayed',
	'badgeWatched',
	'recordingActive',
	'recordingScheduled'
];

const DEFAULT_SEMANTIC = Object.freeze({
	statusAvailable: '#FF22C55E',
	statusRequested: '#FF9333EA',
	statusPending: '#FFEAB308',
	statusDownloading: '#FF6366F1',
	statusError: '#FFEF4444',
	mediaTypeBadgeMovie: '#FF3B82F6',
	mediaTypeBadgeShow: '#FF8B5CF6'
});

// What a theme falls back to when it carries no error color of its own.
export const DEFAULT_ERROR_COLOR = '#FFCF6679';

const DEFAULT_BOOK_COLORS = Object.freeze({
	background: '#FF0F182A',
	accent: '#FF32B9E8',
	mutedText: '#FF9EDBFF',
	primaryText: '#FFDCEFFF',
	sectionTitle: '#FFFFE6C3',
	divider: '#223E5F82',
	placeholder: '#FF2C77B7',
	shadow: '#24000000',
	gradientTop: '#FF18263D',
	gradientBottom: '#FF0B1424',
	inactiveChip: '#556388A8'
});

const DEFAULT_BOOK_PLACEHOLDER_PALETTE = Object.freeze([
	'#FF1A5C9A',
	'#FF2E7D32',
	'#FF6A1B9A',
	'#FF00695C',
	'#FFC62828',
	'#FF4527A0',
	'#FF558B2F',
	'#FF283593',
	'#FF4E342E',
	'#FF00838F'
]);

const normalizeHexColor = (value, fieldName) => {
	if (typeof value !== 'string') {
		throw new Error(`Theme field "${fieldName}" must be a hex color string.`);
	}
	const raw = value.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]+$/.test(raw)) {
		throw new Error(`Theme field "${fieldName}" must be a valid hex color.`);
	}
	if (raw.length === 3) {
		const expanded = raw.split('').map((part) => part + part).join('');
		return `#FF${expanded.toUpperCase()}`;
	}
	if (raw.length === 6) {
		return `#FF${raw.toUpperCase()}`;
	}
	if (raw.length === 8) {
		return `#${raw.toUpperCase()}`;
	}
	throw new Error(`Theme field "${fieldName}" must be #RGB, #RRGGBB, or #AARRGGBB.`);
};

export const isValidHexColor = (value) => {
	if (typeof value !== 'string') return false;
	const raw = value.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]+$/.test(raw)) return false;
	return raw.length === 3 || raw.length === 6 || raw.length === 8;
};

const parseNumber = (value, fieldName, fallback) => {
	if (value === undefined || value === null) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Theme field "${fieldName}" must be a number.`);
	}
	return parsed;
};

const parseRadiusValue = (value, fieldName) => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value.replace(/px$/i, ''));
		if (Number.isFinite(parsed)) return parsed;
	}
	throw new Error(`Theme field "${fieldName}" must be a number or px string.`);
};

const parseBorderRadius = (value, fieldName) => {
	if (typeof value === 'number' || typeof value === 'string') {
		const radius = parseRadiusValue(value, fieldName);
		return {
			topLeft: radius,
			topRight: radius,
			bottomRight: radius,
			bottomLeft: radius
		};
	}
	if (!value || typeof value !== 'object') {
		throw new Error(`Theme field "${fieldName}" must be a radius value.`);
	}
	return {
		topLeft: parseRadiusValue(value.topLeft ?? value.tl ?? 0, `${fieldName}.topLeft`),
		topRight: parseRadiusValue(value.topRight ?? value.tr ?? 0, `${fieldName}.topRight`),
		bottomRight: parseRadiusValue(value.bottomRight ?? value.br ?? 0, `${fieldName}.bottomRight`),
		bottomLeft: parseRadiusValue(value.bottomLeft ?? value.bl ?? 0, `${fieldName}.bottomLeft`)
	};
};

const parseBorderSide = (value, fieldName, allowNull = false) => {
	if (value == null) {
		if (allowNull) return null;
		throw new Error(`Theme field "${fieldName}" is required.`);
	}
	if (typeof value !== 'object') {
		throw new Error(`Theme field "${fieldName}" must be a border object.`);
	}
	return {
		color: normalizeHexColor(value.color, `${fieldName}.color`),
		width: parseNumber(value.width, `${fieldName}.width`, 1)
	};
};

const parseShadow = (value, fieldName) => {
	if (!value || typeof value !== 'object') {
		throw new Error(`Theme field "${fieldName}" must be a shadow object.`);
	}
	return {
		color: normalizeHexColor(value.color, `${fieldName}.color`),
		blurRadius: parseNumber(value.blurRadius, `${fieldName}.blurRadius`, 0),
		spreadRadius: parseNumber(value.spreadRadius, `${fieldName}.spreadRadius`, 0),
		offsetX: parseNumber(value.offsetX, `${fieldName}.offsetX`, 0),
		offsetY: parseNumber(value.offsetY, `${fieldName}.offsetY`, 0)
	};
};

const parseShadowList = (value, fieldName) => {
	if (value == null) return [];
	if (!Array.isArray(value)) {
		throw new Error(`Theme field "${fieldName}" must be a list.`);
	}
	if (value.length > 8) {
		throw new Error(`Theme field "${fieldName}" supports at most 8 shadows.`);
	}
	return value.map((entry, index) => parseShadow(entry, `${fieldName}[${index}]`));
};

const parseColorGroup = (value, fieldName, defaults) => {
	const source = value || {};
	const next = {};
	for (const key of Object.keys(defaults)) {
		next[key] = normalizeHexColor(source[key] ?? defaults[key], `${fieldName}.${key}`);
	}
	return next;
};

export const parseThemeSpec = (json) => {
	if (!json || typeof json !== 'object') {
		throw new Error('Theme spec must be an object.');
	}
	const schemaVersion = Number(json.schemaVersion ?? 1);
	if (!Number.isFinite(schemaVersion) || schemaVersion > 1) {
		throw new Error('Unsupported theme schemaVersion.');
	}
	const id = typeof json.id === 'string' ? json.id.trim() : '';
	if (!id || !/^[a-z0-9_-]+$/.test(id)) {
		throw new Error('Theme id must be lowercase letters, numbers, underscores, or hyphens.');
	}
	const displayName = typeof json.displayName === 'string' ? json.displayName.trim() : '';
	if (!displayName) {
		throw new Error('Theme displayName is required.');
	}
	const colorsSource = json.colors;
	if (!colorsSource || typeof colorsSource !== 'object') {
		throw new Error('Theme colors are required.');
	}
	const colors = {};
	for (const key of REQUIRED_COLOR_KEYS) {
		colors[key] = normalizeHexColor(colorsSource[key], `colors.${key}`);
	}
	// Optional on the other clients too, so a theme without one is not an error.
	colors.error = colorsSource.error != null
		? normalizeHexColor(colorsSource.error, 'colors.error')
		: null;
	const bordersSource = json.borders;
	if (!bordersSource || typeof bordersSource !== 'object') {
		throw new Error('Theme borders are required.');
	}
	return {
		schemaVersion,
		id,
		displayName,
		description: typeof json.description === 'string' && json.description.trim() ? json.description.trim() : '',
		fontFamily: typeof json.fontFamily === 'string' && json.fontFamily.trim() ? json.fontFamily.trim() : null,
		textGlow: parseShadowList(json.textGlow, 'textGlow'),
		navColorCycle: Array.isArray(json.navColorCycle)
			? json.navColorCycle.map((color, index) => normalizeHexColor(color, `navColorCycle[${index}]`))
			: [],
		transparentNavbarSurface: !!json.transparentNavbarSurface,
		// The stair-step bevel chrome the other clients paint from this has no
		// equivalent here, the tokens carry the look on their own.
		isPixel: !!json.isPixel,
		isGlass: !!json.isGlass,
		colors,
		borders: {
			cardBorder: parseBorderSide(bordersSource.cardBorder, 'borders.cardBorder'),
			chipBorder: parseBorderSide(bordersSource.chipBorder, 'borders.chipBorder'),
			focusBorder: parseBorderSide(bordersSource.focusBorder, 'borders.focusBorder'),
			cardRadius: parseBorderRadius(bordersSource.cardRadius, 'borders.cardRadius'),
			chipRadius: parseBorderRadius(bordersSource.chipRadius, 'borders.chipRadius'),
			chipBackground: normalizeHexColor(bordersSource.chipBackground, 'borders.chipBackground'),
			focusGlow: parseShadowList(bordersSource.focusGlow, 'borders.focusGlow'),
			navBorder: parseBorderSide(bordersSource.navBorder, 'borders.navBorder', true)
		},
		semantic: parseColorGroup(json.semantic, 'semantic', DEFAULT_SEMANTIC),
		book: {
			...parseColorGroup(json.book, 'book', DEFAULT_BOOK_COLORS),
			placeholderPalette: Array.isArray(json.book?.placeholderPalette)
				? json.book.placeholderPalette.map((color, index) => normalizeHexColor(color, `book.placeholderPalette[${index}]`))
				: typeof json.book?.placeholderPalette === 'string'
					? [normalizeHexColor(json.book.placeholderPalette, 'book.placeholderPalette')]
					: DEFAULT_BOOK_PLACEHOLDER_PALETTE.slice()
		}
	};
};

export const toCssColorWithAlpha = (hex, alphaMultiplier) => {
	const normalized = normalizeHexColor(hex, 'color');
	const value = normalized.slice(1);
	const alpha = Number.parseInt(value.slice(0, 2), 16) / 255;
	const red = Number.parseInt(value.slice(2, 4), 16);
	const green = Number.parseInt(value.slice(4, 6), 16);
	const blue = Number.parseInt(value.slice(6, 8), 16);
	const adjusted = Math.min(1, Math.max(0, alpha * alphaMultiplier));
	if (adjusted >= 0.999) return `rgb(${red}, ${green}, ${blue})`;
	return `rgba(${red}, ${green}, ${blue}, ${Math.round(adjusted * 1000) / 1000})`;
};

export const toCssColor = (hex) => {
	const normalized = normalizeHexColor(hex, 'color');
	const value = normalized.slice(1);
	const alpha = Number.parseInt(value.slice(0, 2), 16) / 255;
	const red = Number.parseInt(value.slice(2, 4), 16);
	const green = Number.parseInt(value.slice(4, 6), 16);
	const blue = Number.parseInt(value.slice(6, 8), 16);
	if (alpha >= 0.999) {
		return `rgb(${red}, ${green}, ${blue})`;
	}
	return `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * 1000) / 1000})`;
};

// Extract RGB triplet as string for use in rgba(var(...), opacity) syntax
export const toRgbTriplet = (hex) => {
	const normalized = normalizeHexColor(hex, 'color');
	const value = normalized.slice(1);
	const red = Number.parseInt(value.slice(2, 4), 16);
	const green = Number.parseInt(value.slice(4, 6), 16);
	const blue = Number.parseInt(value.slice(6, 8), 16);
	return `${red}, ${green}, ${blue}`;
};

// Whether text on a colour should be dark or light comes down to how bright that
// colour is. The crossover sits where black and white read equally well against
// it, so either side of that line picks the one that reads better.
const INK_CROSSOVER = 0.179;

// The least a button label has to differ from its fill to stay readable. Button
// text is large and bold, which is the case that gets by on three rather than
// the four and a half a paragraph needs.
export const MIN_BUTTON_CONTRAST = 3;

const relativeLuminance = (hex) => {
	const channels = toRgbTriplet(hex).split(', ').map(Number);
	const linear = channels.map((value) => {
		const part = value / 255;
		return part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
	});
	return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
};

/**
 * The rgb triplet to write on top of a colour, dark for a bright background and
 * light for a dim one.
 *
 * @param {string} hex - the background the text sits on
 * @returns {string} an rgb triplet ready for an rgba()
 */
export const inkOn = (hex) => (relativeLuminance(hex) > INK_CROSSOVER ? '0, 0, 0' : '255, 255, 255');

/**
 * How far apart two colours are to read, on the usual 1 to 21 scale.
 *
 * @param {string} hex
 * @param {string} other
 * @returns {number}
 */
export const contrastRatio = (hex, other) => {
	const first = relativeLuminance(hex);
	const second = relativeLuminance(other);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

// What a line of ordinary text needs against the surface behind it.
export const MIN_LIGHT_INK_CONTRAST = 4.5;

const WHITE = '#ffffffff';

/**
 * A colour taken down until light text reads against it, keeping its hue.
 *
 * A theme names anything from near white to a saturated cyan for a focused fill. Dark text on
 * the bright ones measures well and still reads muddy across a room, so the fill is deepened and
 * keeps the light text the rows around it already use. Something dark enough comes back as it is.
 *
 * @param {string} hex - the fill the theme asked for
 * @returns {string} the same colour, dark enough to carry light text
 */
export const deepenForLightInk = (hex) => {
	const normalized = normalizeHexColor(hex, 'color');
	const alpha = normalized.slice(1, 3).toLowerCase();
	const pair = (value) => `0${Math.round(value).toString(16)}`.slice(-2);
	const build = (rgb) => `#${alpha}${rgb.map(pair).join('')}`;

	let channels = toRgbTriplet(normalized).split(', ').map(Number);
	let current = build(channels);
	// Fifteen percent a step reaches black from anywhere inside twenty, so this always ends.
	for (let step = 0; step < 20 && contrastRatio(current, WHITE) < MIN_LIGHT_INK_CONTRAST; step++) {
		channels = channels.map((value) => value * 0.85);
		current = build(channels);
	}
	return current;
};

export const radiusToCss = (radius) => {
	if (!radius) return '0px';
	const {topLeft, topRight, bottomRight, bottomLeft} = radius;
	if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft) {
		return `${topLeft}px`;
	}
	return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
};

export const shadowToCss = (shadow) => {
	const offsetX = shadow.offsetX || 0;
	const offsetY = shadow.offsetY || 0;
	const blur = shadow.blurRadius || 0;
	const spread = shadow.spreadRadius || 0;
	return `${offsetX}px ${offsetY}px ${blur}px ${spread}px ${toCssColor(shadow.color)}`;
};

// The nav slots read up to 16 of these. A theme without a cycle keeps the
// first two pinned to onSurface so the slots always resolve.
const buildNavColorVars = (theme) => {
	const cycle = theme.navColorCycle.length > 0
		? theme.navColorCycle
		: [theme.colors.onSurface, theme.colors.onSurface];
	const vars = {};
	cycle.slice(0, 16).forEach((color, index) => {
		vars[`--theme-nav-color-${index + 1}`] = toCssColor(color);
	});
	return vars;
};

export const buildThemeCssVars = (theme) => ({
	'--accent-color': toCssColor(theme.borders.focusBorder.color),
	'--theme-background': toCssColor(theme.colors.background),
	'--theme-on-background': toCssColor(theme.colors.onBackground),
	'--theme-surface': toCssColor(theme.colors.surface),
	'--theme-on-surface': toCssColor(theme.colors.onSurface),
	'--theme-surface-variant': toCssColor(theme.colors.surfaceVariant),
	'--theme-scrim': toCssColor(theme.colors.scrim),
	'--theme-accent': toCssColor(theme.colors.accent),
	'--theme-on-accent': toCssColor(theme.colors.onAccent),
	'--theme-button-normal': toCssColor(theme.colors.buttonNormal),
	'--theme-button-focused': toCssColor(theme.colors.buttonFocused),
	'--theme-button-disabled': toCssColor(theme.colors.buttonDisabled),
	'--theme-button-active': toCssColor(theme.colors.buttonActive),
	'--theme-input-background': toCssColor(theme.colors.inputBackground),
	'--theme-input-focused': toCssColor(theme.colors.inputFocused),
	'--theme-input-border': toCssColor(theme.colors.inputBorder),
	'--theme-input-border-focused': toCssColor(theme.colors.inputBorderFocused),
	'--theme-range-track': toCssColor(theme.colors.rangeTrack),
	'--theme-range-progress': toCssColor(theme.colors.rangeProgress),
	'--theme-range-thumb': toCssColor(theme.colors.rangeThumb),
	'--theme-seekbar-buffered': toCssColor(theme.colors.seekbarBuffered),
	'--theme-badge-background': toCssColor(theme.colors.badgeBackground),
	'--theme-badge-unplayed': toCssColor(theme.colors.badgeUnplayed),
	'--theme-badge-watched': toCssColor(theme.colors.badgeWatched),
	'--theme-recording-active': toCssColor(theme.colors.recordingActive),
	'--theme-recording-scheduled': toCssColor(theme.colors.recordingScheduled),
	'--theme-focus-border-color': toCssColor(theme.borders.focusBorder.color),
	'--theme-focus-border-width': `${theme.borders.focusBorder.width}px`,
	'--theme-card-radius': radiusToCss(theme.borders.cardRadius),
	'--theme-chip-radius': radiusToCss(theme.borders.chipRadius),
	'--theme-chip-background': toCssColor(theme.borders.chipBackground),
	'--theme-chip-border': `${theme.borders.chipBorder.width}px solid ${toCssColor(theme.borders.chipBorder.color)}`,
	'--theme-card-border': `${theme.borders.cardBorder.width}px solid ${toCssColor(theme.borders.cardBorder.color)}`,
	'--theme-nav-border': theme.borders.navBorder
		? `${theme.borders.navBorder.width}px solid ${toCssColor(theme.borders.navBorder.color)}`
		: 'none',
	'--theme-focus-glow': theme.borders.focusGlow.length ? theme.borders.focusGlow.map(shadowToCss).join(', ') : 'none',
	'--theme-text-glow': theme.textGlow.length ? theme.textGlow.map(shadowToCss).join(', ') : 'none',
	'--theme-font-family': theme.fontFamily || 'inherit',
	'--theme-navbar-color-rgb': theme.transparentNavbarSurface ? 'transparent' : toCssColor(theme.colors.surface),
	'--theme-navbar-opacity': theme.transparentNavbarSurface ? 0 : 1,
	...buildNavColorVars(theme),
	'--theme-error': toCssColor(theme.colors.error || DEFAULT_ERROR_COLOR),
	'--theme-status-error': toCssColor(theme.semantic.statusError),
	'--theme-status-available': toCssColor(theme.semantic.statusAvailable),
	'--theme-status-available-20': toCssColorWithAlpha(theme.semantic.statusAvailable, 0.2),
	'--theme-status-requested': toCssColor(theme.semantic.statusRequested),
	'--theme-status-pending': toCssColor(theme.semantic.statusPending),
	'--theme-status-pending-20': toCssColorWithAlpha(theme.semantic.statusPending, 0.2),
	'--theme-status-downloading': toCssColor(theme.semantic.statusDownloading),
	'--theme-badge-movie': toCssColor(theme.semantic.mediaTypeBadgeMovie),
	'--theme-badge-show': toCssColor(theme.semantic.mediaTypeBadgeShow),
	// button text
	'--theme-on-button-normal': toCssColor(theme.colors.onButtonNormal),
	'--theme-on-button-focused': toCssColor(theme.colors.onButtonFocused),
	'--theme-on-button-disabled': toCssColor(theme.colors.onButtonDisabled),
	'--theme-on-badge': toCssColor(theme.colors.onBadge),
	// derived convenience vars consumed by global LESS variables
	'--theme-text-primary': toCssColor(theme.colors.onBackground),
	'--theme-text-secondary': toCssColorWithAlpha(theme.colors.onSurface, 0.7),
	'--theme-text-muted': toCssColorWithAlpha(theme.colors.onSurface, 0.45),
	'--theme-border-color': toCssColor(theme.borders.cardBorder.color),
	'--theme-accent-secondary': toCssColor(theme.colors.recordingScheduled),
	'--theme-login-gradient-end': toCssColor(theme.colors.surfaceVariant),
	// RGB triplet vars for use in rgba(var(...), opacity) syntax
	'--theme-background-rgb': toRgbTriplet(theme.colors.background),
	'--theme-surface-rgb': toRgbTriplet(theme.colors.surface),
	'--theme-on-background-rgb': toRgbTriplet(theme.colors.onBackground),
	'--theme-on-surface-rgb': toRgbTriplet(theme.colors.onSurface),
	'--theme-accent-rgb': toRgbTriplet(theme.colors.accent),
	'--theme-surface-variant-rgb': toRgbTriplet(theme.colors.surfaceVariant),
	'--theme-scrim-rgb': toRgbTriplet(theme.colors.scrim)
});

const toHex6 = (channels) => `#${channels.map((value) => `0${Math.round(value).toString(16)}`.slice(-2)).join('')}`;

// Moves a color toward `target` by `amount`, both given as rgb channel triples.
const mixToward = (channels, target, amount) =>
	channels.map((value, i) => value + ((target[i] - value) * amount));

const MIX_STEP = 0.08;
const MIX_STEPS = 20;

/**
 * An accent that can be seen against the surfaces it sits on. A picked color is the person's own
 * choice, so it is left exactly as picked while it reads, and only when it would vanish, black
 * on a near black screen or white on a white one, is it moved toward light or dark, just far
 * enough to reach `minContrast`. The direction follows the surfaces, lighter over dark ones.
 *
 * @param {string} hex - the picked color
 * @param {string[]} backgrounds - the colors it will be drawn over
 * @param {number} [minContrast] - the least ratio to reach, three being enough for a large mark
 * @returns {string} the color to draw, as #rrggbb
 */
export const ensureVisible = (hex, backgrounds, minContrast = MIN_BUTTON_CONTRAST) => {
	const surfaces = (backgrounds || []).filter(Boolean);
	if (surfaces.length === 0) return hex;
	const worst = (color) => Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));
	if (worst(hex) >= minContrast) return hex;

	const overDark = surfaces.every((surface) => inkOn(surface) === '255, 255, 255');
	const target = overDark ? [255, 255, 255] : [0, 0, 0];
	const start = toRgbTriplet(hex).split(', ').map(Number);
	let current = toHex6(start);
	// Capped at 1: MIX_STEP * MIX_STEPS is 1.6, and past 1 this extrapolates beyond the
	// target instead of stopping there, which can push a channel outside 0-255 and hand
	// toHex6 a negative number it has no way to render as a hex pair.
	for (let step = 1; step <= MIX_STEPS && worst(current) < minContrast; step += 1) {
		current = toHex6(mixToward(start, target, Math.min(1, MIX_STEP * step)));
	}
	return current;
};

/**
 * The ink for text drawn on a fill: the color the caller would otherwise use where it reads
 * against that fill, and black or white where it does not.
 *
 * @param {string} fill - the color behind the text
 * @param {string} preferred - the ink to keep when it reads
 * @returns {string} an rgb() color
 */
export const readableInk = (fill, preferred) => (
	preferred && contrastRatio(fill, preferred) >= MIN_BUTTON_CONTRAST
		? toCssColor(preferred)
		: `rgba(${inkOn(fill)}, 0.92)`
);

/**
 * A color laid over another at some opacity, as it ends up looking.
 *
 * @param {string} hex - the color on top
 * @param {string} backgroundHex - the color under it
 * @param {number} alpha - how opaque the top color is, 0 to 1
 * @returns {string} the blend, as #rrggbb
 */
export const blendOver = (hex, backgroundHex, alpha) => {
	const top = toRgbTriplet(hex).split(', ').map(Number);
	const under = toRgbTriplet(backgroundHex).split(', ').map(Number);
	return toHex6(mixToward(under, top, Math.min(1, Math.max(0, alpha))));
};
