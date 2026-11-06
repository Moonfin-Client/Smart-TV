import {applyThemeOverrides, buildThemeOverrideCss, registerThemeSheet} from './themeOverrides';
import {resolveThemeById} from './themeRegistry';
import {contrastRatio, inkOn, resolveFocusBorderColor, toCssColor, MIN_BUTTON_CONTRAST} from './themeSpec';

describe('buildThemeOverrideCss', () => {
	it('scopes every rule to the active theme id', () => {
		const css = buildThemeOverrideCss(resolveThemeById('moonfin'));
		const selectors = css.split('\n').filter(Boolean);
		expect(selectors.length).toBeGreaterThan(50);
		for (const line of selectors) {
			expect(line.startsWith("html[data-theme-id='moonfin'][data-theme-id]")).toBe(true);
		}
	});

	it('emits literal theme colors instead of custom properties', () => {
		const css = buildThemeOverrideCss(resolveThemeById('moonfin'));
		expect(css).toContain('rgb(0, 164, 220)');
		expect(css).not.toContain('var(--theme');
	});

	it('emits the nav color cycle per slot for themes that have one', () => {
		const css = buildThemeOverrideCss(resolveThemeById('neon_pulse'));
		expect(css).toContain("[data-nav-slot='1'] { color: rgb(255, 46, 146); }");
		expect(css).toContain("[data-nav-slot='2'] { color: rgb(0, 229, 255); }");
		const moonfin = buildThemeOverrideCss(resolveThemeById('moonfin'));
		expect(moonfin).not.toContain('data-nav-slot');
	});

	it('squares off radii for pixel themes', () => {
		const css = buildThemeOverrideCss(resolveThemeById('8bit_hero'));
		expect(css).toContain('border-radius: 0;');
		const moonfin = buildThemeOverrideCss(resolveThemeById('moonfin'));
		const rounded = moonfin.split('\n').filter((line) => !line.includes('].vega '));
		expect(rounded.join('\n')).not.toContain('border-radius: 0;');
	});

	it('squares the preview frame, ring and container on the Fire TV for both card styles', () => {
		const css = buildThemeOverrideCss(resolveThemeById('moonfin'));
		const squared = css.split('\n').filter((line) => line.includes('border-radius: 0;'));
		expect(squared).toHaveLength(2);
		for (const line of squared) {
			expect(line.startsWith("html[data-theme-id='moonfin'][data-theme-id].vega .")).toBe(true);
			expect(line.split('].vega .')).toHaveLength(4);
		}
	});

	it('writes the Seerr banner in dark ink only on a light fill', () => {
		const lines = buildThemeOverrideCss(resolveThemeById('moonfin')).split('\n');
		const ruleFor = (fill) => lines.find((line) => line.includes(`.banner.${fill} {`));
		expect(ruleFor('pending')).toContain('color: #000000;');
		['available', 'processing'].forEach((fill) => {
			expect(ruleFor(fill)).not.toContain('#000000');
		});
	});

	it('carries theme fonts as far as the wrapper that names its own', () => {
		const eightbit = buildThemeOverrideCss(resolveThemeById('8bit_hero'));
		expect(eightbit).toContain('.sandstone-theme');
		expect(eightbit).toContain("font-family: 'EightBitHero', sans-serif;");
		// Neon Pulse saves its display face for titles and reads body copy in the
		// condensed companion.
		const neon = buildThemeOverrideCss(resolveThemeById('neon_pulse'));
		expect(neon).toContain("font-family: 'NeonPulseBody', sans-serif; letter-spacing: 0.6px;");
		const moonfin = buildThemeOverrideCss(resolveThemeById('moonfin'));
		expect(moonfin).not.toContain('font-family');
	});

	it('fills the media bar card from its own overlay setting', () => {
		const theme = resolveThemeById('moonfin');
		// Three quarters of the chosen opacity.
		expect(buildThemeOverrideCss(theme, {mediaBarOverlayColor: 'black', mediaBarOverlayOpacity: 100}))
			.toContain('background-color: rgba(0, 0, 0, 0.75)');
		expect(buildThemeOverrideCss(theme)).toContain('background-color: rgba(107, 114, 128, 0.375)');
	});

	it('prefers the focus border color setting over the theme focus border', () => {
		const theme = resolveThemeById('moonfin');
		expect(buildThemeOverrideCss(theme, {focusBorderColor: '#ff0000'})).toContain('rgb(255, 0, 0)');
		expect(buildThemeOverrideCss(theme, {focusBorderColor: 'nonsense'})).not.toContain('nonsense');
	});

	it('rings the Seerr screens in the focus border color, falling back to the theme\'s', async () => {
		const theme = resolveThemeById('moonfin');
		registerThemeSheet('seerrDiscover', {tileRing: 'tileRing', pill: 'pill'});
		registerThemeSheet('seerrBrowse', {chip: 'chip', letter: 'letter', toolButton: 'toolButton'});
		registerThemeSheet('seerrPosterCard', {ring: 'ring'});
		const prefix = "html[data-theme-id='moonfin'][data-theme-id]";
		const css = buildThemeOverrideCss(theme, {focusBorderColor: '#ff0000'});
		expect(css).toContain(`${prefix} .tileRing { border-color: rgb(255, 0, 0); }`);
		expect(css).toContain(`${prefix} .ring { border-color: rgb(255, 0, 0); }`);
		expect(css).toContain(`${prefix} .chip:focus, ${prefix} .letter:focus, ${prefix} .toolButton:focus { box-shadow: inset 0 0 0 2px rgb(255, 0, 0); }`);
		const themeColor = resolveFocusBorderColor(theme, '');
		expect(buildThemeOverrideCss(theme, {focusBorderColor: ''})).toContain(`${prefix} .ring { border-color: ${themeColor}; }`);
	});

	it('rings the screens that load on demand once they hand their stylesheets over', async () => {
		const theme = resolveThemeById('moonfin');
		applyThemeOverrides(theme, {focusBorderColor: '#ff0000'});
		expect(document.getElementById('moonfin-theme-overrides').textContent).not.toContain('chapterItem');
		registerThemeSheet('player', {liveBtn: 'liveBtn', chapterItem: 'chapterItem', trackItem: 'trackItem'});
		registerThemeSheet('playerOverlays', {offsetBtn: 'offsetBtn', actionBtn: 'actionBtn', settingItem: 'settingItem', sliderItem: 'sliderItem'});
		await Promise.resolve();
		const lines = document.getElementById('moonfin-theme-overrides').textContent.split('\n');
		const prefix = "html[data-theme-id='moonfin'][data-theme-id]";
		expect(lines).toContain(`${prefix} .liveBtn:hover, ${prefix} .liveBtn:focus, ${prefix} .chapterItem:hover, ${prefix} .chapterItem:focus { border-color: rgb(255, 0, 0); }`);
		expect(lines).toContain(`${prefix} .sliderItem:focus-within { border-color: rgb(255, 0, 0); }`);
		expect(lines).toContain(`${prefix} .trackItem:focus { background: rgba(0, 164, 220, 0.3); }`);
	});
});

describe('resolveFocusBorderColor', () => {
	it('falls back to the theme focus border for Theme Default and anything that isn\'t a hex color', () => {
		const theme = resolveThemeById('moonfin');
		expect(resolveFocusBorderColor(theme, '#ff0000')).toBe('rgb(255, 0, 0)');
		expect(resolveFocusBorderColor(theme, '')).toBe('rgb(0, 164, 220)');
		expect(resolveFocusBorderColor(theme, 'moonfinCyan')).toBe('rgb(0, 164, 220)');
	});
});

describe('ink on a focused row', () => {
	it('picks dark text on a bright fill and light on a dim one', () => {
		expect(inkOn('#FF00E5FF')).toBe('0, 0, 0');
		expect(inkOn('#FFFFCD75')).toBe('0, 0, 0');
		expect(inkOn('#FF00A4DC')).toBe('0, 0, 0');
		expect(inkOn('#FF101010')).toBe('255, 255, 255');
		expect(inkOn('#FF2A2A2A')).toBe('255, 255, 255');
	});

	// A focused settings row fills with the theme's focused button colour and writes on it in that
	// colour's ink.
	it('fills every theme\'s focused settings rows with its focused button colour and writes in its ink', () => {
		for (const id of ['moonfin', 'neon_pulse', '8bit_hero']) {
			const theme = resolveThemeById(id);
			const fill = theme.colors.buttonFocused;
			const ink = inkOn(fill);
			const css = buildThemeOverrideCss(theme);

			expect(css).toContain(`rgba(${ink}, 0.87)`);
			expect(css).toContain(`rgba(${ink}, 0.54)`);
			expect(css).toContain(`background: ${toCssColor(fill)};`);
		}
	});

	// The one rule that fills a button with the theme's focus colour and writes on it.
	const focusedButtonRule = (id) => buildThemeOverrideCss(resolveThemeById(id))
		.split('\n')
		.find((line) => line.includes('.actionButton:focus'));

	it('drops a button colour the theme asked for when it cannot be read on its own fill', () => {
		// Neon Pulse asks for white on a bright cyan, which comes to 1.5 to 1.
		const neon = resolveThemeById('neon_pulse');
		expect(contrastRatio(neon.colors.buttonFocused, neon.colors.onButtonFocused)).toBeLessThan(MIN_BUTTON_CONTRAST);
		expect(focusedButtonRule('neon_pulse')).toContain('color: rgba(0, 0, 0, 0.92)');
	});

	it('keeps a button colour the theme asked for when it holds up', () => {
		// 8bit Hero pairs a dark ink with its own amber, which reads at 11 to 1.
		const pixel = resolveThemeById('8bit_hero');
		expect(contrastRatio(pixel.colors.buttonFocused, pixel.colors.onButtonFocused)).toBeGreaterThan(MIN_BUTTON_CONTRAST);
		expect(focusedButtonRule('8bit_hero')).toContain(`color: ${toCssColor(pixel.colors.onButtonFocused)}`);
	});

	it('leaves every theme with readable text on a focused button', () => {
		for (const id of ['moonfin', 'neon_pulse', '8bit_hero']) {
			const theme = resolveThemeById(id);
			const declared = contrastRatio(theme.colors.buttonFocused, theme.colors.onButtonFocused);
			const fallback = contrastRatio(theme.colors.buttonFocused, inkOn(theme.colors.buttonFocused) === '0, 0, 0' ? '#FF000000' : '#FFFFFFFF');
			expect(Math.max(declared, fallback)).toBeGreaterThanOrEqual(MIN_BUTTON_CONTRAST);
		}
	});

	it('draws Frost in the theme rather than white on glass', () => {
		const lines = buildThemeOverrideCss(resolveThemeById('neon_pulse')).split('\n');
		const ruleFor = (selector) => lines.find((line) => line.includes(`] ${selector} {`) || line.includes(`] ${selector}, `)) || '';
		expect(ruleFor('.actionsFrosted > .actionBtn:first-child')).toContain('background: rgba(255, 46, 146, 0.86)');
		expect(ruleFor('.actionsFrosted > .actionBtn:first-child:focus')).toContain('background: rgb(0, 229, 255)');
		expect(lines.find((line) => line.includes('] .pill:focus, ') && line.includes('] .tab:focus {'))).toContain('background: rgba(0, 229, 255, 0.38)');
		expect(ruleFor('.window')).toContain('background: rgba(30, 10, 63, 0.55)');
		expect(lines.filter((line) => line.includes('.actionsFrosted') && /#fff\b|#000\b|#30d158/.test(line))).toEqual([]);
	});
});
