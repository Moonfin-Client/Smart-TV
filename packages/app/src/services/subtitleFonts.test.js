import {SUBTITLE_FONTS, isFontData, retrySubtitleFont, subtitleFontFailed, subtitleFontFamily} from './subtitleFonts';

const bytesOf = (...values) => new Uint8Array(values).buffer;
const TTF = bytesOf(0, 1, 0, 0, 9, 9);
const HTML = bytesOf(0x3c, 0x68, 0x74, 0x6d);

const answer = (bytes, ok = true) => Promise.resolve({ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(bytes)});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const sheet = () => document.getElementById('moonfin-subtitle-fonts')?.textContent || '';
const fontNamed = (family) => SUBTITLE_FONTS.find((font) => font.family === family);

beforeEach(() => {
	window.fetch = jest.fn(() => answer(TTF));
	window.URL.createObjectURL = jest.fn(() => 'blob:face');
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	jest.restoreAllMocks();
});

test('offers the synced families, each with a regular and a bold face over https', () => {
	expect(SUBTITLE_FONTS.map((font) => font.family)).toEqual([
		'Arimo', 'Atkinson Hyperlegible', 'Fira Sans', 'Inter', 'Lato', 'Noto Sans', 'Open Sans', 'Roboto', 'Source Sans 3', 'Ubuntu'
	]);
	SUBTITLE_FONTS.forEach((font) => {
		expect(font.regular).toMatch(/^https:\/\/fonts\.gstatic\.com\/.+\.ttf$/);
		expect(font.bold).toMatch(/^https:\/\/fonts\.gstatic\.com\/.+\.ttf$/);
		expect(font.bold).not.toBe(font.regular);
	});
});

test('tells a font file from a page a captive portal sent instead', () => {
	expect(isFontData(TTF)).toBe(true);
	expect(isFontData(bytesOf(0x4f, 0x54, 0x54, 0x4f))).toBe(true);
	expect(isFontData(HTML)).toBe(false);
	expect(isFontData(bytesOf(0, 1))).toBe(false);
	expect(isFontData(null)).toBe(false);
});

test("leaves the app's font alone for no font or one this app doesn't offer", () => {
	expect(subtitleFontFamily('', true)).toBeUndefined();
	expect(subtitleFontFamily('Comic Neue', false)).toBeUndefined();
	expect(window.fetch).not.toHaveBeenCalled();
});

test("names the face ahead of the app's font and adds it to the page once it has loaded", async () => {
	expect(subtitleFontFamily('Lato', false)).toBe("'Moonfin Subtitles Lato', 'Roboto', 'Sandstone', sans-serif");
	expect(sheet()).not.toContain('Lato');

	await settle();
	expect(window.fetch).toHaveBeenCalledWith(fontNamed('Lato').regular);
	expect(sheet()).toContain("@font-face { font-family: 'Moonfin Subtitles Lato'; font-weight: 400; src: url('blob:face') format('truetype'); }");
	expect(sheet()).not.toContain('font-weight: 700');
	expect(subtitleFontFailed('Lato')).toBe(false);

	subtitleFontFamily('Lato', false);
	await settle();
	expect(window.fetch).toHaveBeenCalledTimes(1);
});

test('fetches the bold face only once bold text needs it', async () => {
	subtitleFontFamily('Inter', false);
	await settle();
	expect(window.fetch).toHaveBeenCalledTimes(1);

	subtitleFontFamily('Inter', true);
	await settle();
	expect(window.fetch).toHaveBeenLastCalledWith(fontNamed('Inter').bold);
	expect(sheet()).toContain("font-family: 'Moonfin Subtitles Inter'; font-weight: 700;");
});

test("keeps a page that isn't a font off the page, and a pick tries it again", async () => {
	window.fetch = jest.fn(() => answer(HTML));
	subtitleFontFamily('Ubuntu', false);
	await settle();
	expect(sheet()).not.toContain('Ubuntu');
	expect(subtitleFontFailed('Ubuntu')).toBe(true);

	subtitleFontFamily('Ubuntu', false);
	await settle();
	expect(window.fetch).toHaveBeenCalledTimes(1);

	window.fetch = jest.fn(() => answer(TTF));
	retrySubtitleFont('Ubuntu');
	expect(subtitleFontFailed('Ubuntu')).toBe(false);
	subtitleFontFamily('Ubuntu', false);
	await settle();
	expect(sheet()).toContain("'Moonfin Subtitles Ubuntu'");
});

test("counts a failed request or no network as a font that couldn't be had", async () => {
	window.fetch = jest.fn(() => answer(TTF, false));
	subtitleFontFamily('Arimo', false);
	await settle();
	window.fetch = jest.fn(() => Promise.reject(new Error('offline')));
	subtitleFontFamily('Fira Sans', false);
	await settle();
	expect(subtitleFontFailed('Arimo')).toBe(true);
	expect(subtitleFontFailed('Fira Sans')).toBe(true);
	expect(sheet()).not.toContain('Arimo');
});
