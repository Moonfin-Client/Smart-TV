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
export const toRgbTriplet = (hex) => {
	const normalized = normalizeHexColor(hex, 'color');
	const value = normalized.slice(1);
	const red = Number.parseInt(value.slice(2, 4), 16);
	const green = Number.parseInt(value.slice(4, 6), 16);
	const blue = Number.parseInt(value.slice(6, 8), 16);
	return `${red}, ${green}, ${blue}`;
};

// Text on a color goes dark or light by how bright the color is. The crossover
// sits where black and white read equally well against it.
const INK_CROSSOVER = 0.179;

// The least contrast a button label needs against its fill. Button text is large
// and bold, so it gets by on 3 rather than the 4.5 body text needs.
export const MIN_BUTTON_CONTRAST = 3;

export const relativeLuminance = (hex) => {
	const channels = toRgbTriplet(hex).split(', ').map(Number);
	const linear = channels.map((value) => {
		const part = value / 255;
		return part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
	});
	return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
};

// The rgb triplet for text on top of hex, dark on a bright background and light on a dim one.
export const inkOn = (hex) => (relativeLuminance(hex) > INK_CROSSOVER ? '0, 0, 0' : '255, 255, 255');

// On the usual 1 to 21 scale.
export const contrastRatio = (hex, other) => {
	const first = relativeLuminance(hex);
	const second = relativeLuminance(other);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};
