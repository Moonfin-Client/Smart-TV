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
	mediaTypeBadgeMovie: '#FF3B82F6',
	mediaTypeBadgeShow: '#FF8B5CF6'
});

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
	const bordersSource = json.borders;
	if (!bordersSource || typeof bordersSource !== 'object') {
		throw new Error('Theme borders are required.');
	}
	return {
		schemaVersion,
		id,
		displayName,
		fontFamily: typeof json.fontFamily === 'string' && json.fontFamily.trim() ? json.fontFamily.trim() : null,
		textGlow: parseShadowList(json.textGlow, 'textGlow'),
		navColorCycle: Array.isArray(json.navColorCycle)
			? json.navColorCycle.map((color, index) => normalizeHexColor(color, `navColorCycle[${index}]`))
			: [],
		transparentNavbarSurface: !!json.transparentNavbarSurface,
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

const radiusToCss = (radius) => {
	if (!radius) return '0px';
	const {topLeft, topRight, bottomRight, bottomLeft} = radius;
	if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft) {
		return `${topLeft}px`;
	}
	return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
};

const shadowToCss = (shadow) => {
	const offsetX = shadow.offsetX || 0;
	const offsetY = shadow.offsetY || 0;
	const blur = shadow.blurRadius || 0;
	const spread = shadow.spreadRadius || 0;
	return `${offsetX}px ${offsetY}px ${blur}px ${spread}px ${toCssColor(shadow.color)}`;
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
	'--theme-nav-color-1': theme.navColorCycle[0] ? toCssColor(theme.navColorCycle[0]) : toCssColor(theme.colors.onSurface),
	'--theme-nav-color-2': theme.navColorCycle[1] ? toCssColor(theme.navColorCycle[1]) : toCssColor(theme.colors.onSurface),
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
