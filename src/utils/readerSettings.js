// How an EPUB page looks. It's kept on this TV only and never synced.

export const READER_SETTINGS_KEY = 'book_reader_settings';

// Turns comic and PDF pages negative. The one switch covers both readers.
export const FIXED_LAYOUT_INVERT_KEY = 'book_reader_fixed_layout_invert';

export const READER_DEFAULTS = {
	pageTheme: 'original',
	fontFamily: 'serif',
	fontScale: 1,
	lineSpacing: 'normal',
	margin: 'normal',
	justify: false,
	bold: false,
	brightness: 1,
	warmth: 0
};

export const PAGE_THEMES = {
	original: {bg: '#121212', fg: '#e7e7e7', link: '#8ab4f8'},
	paper: {bg: '#f4ecd8', fg: '#3e3023', link: '#6b4e2a'},
	quiet: {bg: '#e8e4da', fg: '#413e37', link: '#5a4b33'},
	calm: {bg: '#2a2c2e', fg: '#cbced1', link: '#8ab4f8'},
	night: {bg: '#000000', fg: '#b8b8b8', link: '#6fa8ff'}
};

const FONT_FAMILIES = {
	system: '-apple-system, system-ui, \'Segoe UI\', Roboto, sans-serif',
	serif: 'Georgia, \'Times New Roman\', serif',
	sans: 'system-ui, \'Helvetica Neue\', Arial, sans-serif',
	mono: '\'SF Mono\', Menlo, Consolas, monospace'
};

const LINE_HEIGHTS = {tight: 1.4, normal: 1.65, relaxed: 1.95};
// Side margin and the widest the text column gets, for a 960 wide page.
const MARGINS = {narrow: [12, 920], normal: [22, 760], wide: [40, 620]};

export const FONT_SCALE_RANGE = [0.8, 1.8];
export const BRIGHTNESS_RANGE = [0.3, 1];
export const WARMTH_RANGE = [0, 1];

const clamp = (value, [min, max], fallback) => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const oneOf = (value, table, fallback) => (Object.prototype.hasOwnProperty.call(table, value) ? value : fallback);

// Whatever was stored, with anything missing or out of range back at its default.
export const normalizeReaderSettings = (stored) => {
	const s = stored && typeof stored === 'object' ? stored : {};
	const d = READER_DEFAULTS;
	return {
		pageTheme: oneOf(s.pageTheme, PAGE_THEMES, d.pageTheme),
		fontFamily: oneOf(s.fontFamily, FONT_FAMILIES, d.fontFamily),
		fontScale: Math.round(clamp(s.fontScale, FONT_SCALE_RANGE, d.fontScale) * 10) / 10,
		lineSpacing: oneOf(s.lineSpacing, LINE_HEIGHTS, d.lineSpacing),
		margin: oneOf(s.margin, MARGINS, d.margin),
		justify: s.justify === true,
		bold: s.bold === true,
		brightness: clamp(s.brightness, BRIGHTNESS_RANGE, d.brightness),
		warmth: clamp(s.warmth, WARMTH_RANGE, d.warmth)
	};
};

// The chapter style for the engine and the column around it. unit is screen pixels per layout pixel.
export const readerPageStyle = (settings, {baseSize, unit}) => {
	const colors = PAGE_THEMES[settings.pageTheme];
	const [margin, maxWidth] = MARGINS[settings.margin];
	return {
		...colors,
		font: FONT_FAMILIES[settings.fontFamily],
		size: Math.round(baseSize * settings.fontScale),
		lineHeight: LINE_HEIGHTS[settings.lineSpacing],
		bold: settings.bold,
		justify: settings.justify,
		margin: Math.round(margin * unit),
		maxWidth: Math.round(maxWidth * unit)
	};
};

// The dim and the warm tint laid over the page, or null for neither.
export const readerTint = ({brightness, warmth}) => {
	const dim = 1 - brightness;
	if (dim <= 0.001 && warmth <= 0.001) return null;
	return {dim: dim * 0.7, warmth: warmth * 0.28};
};
