import {buildThemeOverrideCss} from './themeOverrides';
import {resolveThemeById} from './themeRegistry';
import {contrastRatio, deepenForLightInk, inkOn, toCssColor, MIN_BUTTON_CONTRAST, MIN_LIGHT_INK_CONTRAST} from './themeSpec';

describe('deepenForLightInk', () => {
	const white = '#ffffffff';

	it('takes a bright fill down until light text reads on it', () => {
		const deepened = deepenForLightInk('#ff00a4dc');
		expect(contrastRatio('#ff00a4dc', white)).toBeLessThan(MIN_LIGHT_INK_CONTRAST);
		expect(contrastRatio(deepened, white)).toBeGreaterThanOrEqual(MIN_LIGHT_INK_CONTRAST);
		expect(inkOn(deepened)).toBe('255, 255, 255');
	});

	it('leaves a fill that is already dark enough alone', () => {
		expect(deepenForLightInk('#ff101010')).toBe('#ff101010');
	});

	// Near white is the worst case, since it has the furthest to travel.
	it('gets there even from the palest fill a theme can name', () => {
		expect(contrastRatio(deepenForLightInk('#fffefefe'), white))
			.toBeGreaterThanOrEqual(MIN_LIGHT_INK_CONTRAST);
	});

	it('keeps the alpha the theme asked for', () => {
		expect(deepenForLightInk('#8000a4dc').slice(0, 3)).toBe('#80');
	});
});

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
		expect(moonfin).not.toContain('border-radius: 0;');
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
});

describe('ink on a focused row', () => {
	it('picks dark text on a bright fill and light on a dim one', () => {
		expect(inkOn('#FF00E5FF')).toBe('0, 0, 0');
		expect(inkOn('#FFFFCD75')).toBe('0, 0, 0');
		expect(inkOn('#FF00A4DC')).toBe('0, 0, 0');
		expect(inkOn('#FF101010')).toBe('255, 255, 255');
		expect(inkOn('#FF2A2A2A')).toBe('255, 255, 255');
	});

	// A focused row is deepened rather than inverted, so every theme writes it in light ink on a
	// fill taken far enough down to carry it.
	it('writes every theme\'s focused rows in light ink on a fill deepened to take it', () => {
		for (const id of ['moonfin', 'neon_pulse', '8bit_hero']) {
			const theme = resolveThemeById(id);
			const fill = deepenForLightInk(theme.colors.buttonFocused);
			const css = buildThemeOverrideCss(theme);

			expect(inkOn(fill)).toBe('255, 255, 255');
			expect(contrastRatio(fill, '#ffffffff')).toBeGreaterThanOrEqual(MIN_LIGHT_INK_CONTRAST);
			expect(css).toContain('rgba(255, 255, 255, 0.96)');
			expect(css).toContain('rgba(255, 255, 255, 0.78)');
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
});

describe('per-surface accents', () => {
	const moonfin = resolveThemeById('moonfin');
	const rulesFor = (accents) => buildThemeOverrideCss(moonfin, {accents}).split('\n');
	const withHandRule = (lines, needle) => lines.find((line) => line.includes(needle));

	it('changes nothing until a surface is given a color', () => {
		expect(buildThemeOverrideCss(moonfin, {accents: {}})).toBe(buildThemeOverrideCss(moonfin));
	});

	it('colors only the surface it was given to', () => {
		const lines = rulesFor({settings: '#ff0000'});
		expect(withHandRule(lines, '.toggleOn')).toContain('rgb(255, 0, 0)');
		// The details screen and the nav pill keep the theme's cyan.
		expect(withHandRule(lines, '.seasonEpCheck')).toContain('rgb(0, 164, 220)');
		expect(withHandRule(lines, '.active')).toContain('rgba(0, 164, 220');
	});

	it('takes each surface from its own pick', () => {
		const lines = rulesFor({navigation: '#00ff00', details: '#3b82f6'});
		expect(withHandRule(lines, '.active')).toContain('rgba(0, 255, 0');
		expect(withHandRule(lines, '.episodeProgressBar')).toContain('rgb(59, 130, 246)');
		expect(withHandRule(lines, '.toggleOn')).toContain('rgb(0, 164, 220)');
	});

	it('replays the stylesheets\' own accent declarations for a surface that has a pick', () => {
		const none = buildThemeOverrideCss(moonfin);
		const player = buildThemeOverrideCss(moonfin, {accents: {player: '#ff8800'}});
		expect(player.length).toBeGreaterThan(none.length);
		expect(player).toContain('rgb(255, 136, 0)');
		expect(player).toContain('rgba(255, 136, 0, 0.3)');
		expect(player).not.toContain('var(--');
	});

	it('keeps every rule scoped to the theme, media queries included', () => {
		const css = buildThemeOverrideCss(moonfin, {accents: {other: '#ff8800', liveTv: '#ff8800', home: '#ff8800'}});
		for (const line of css.split('\n').filter(Boolean)) {
			const body = line.startsWith('@') ? line.slice(line.indexOf('{') + 1).trim() : line;
			expect(body.startsWith("html[data-theme-id='moonfin'][data-theme-id]")).toBe(true);
		}
	});

	it('gives one selector its own rule so an unknown pseudo cannot void the rest', () => {
		const css = buildThemeOverrideCss(moonfin, {accents: {player: '#ff8800'}});
		const withFocusWithin = css.split('\n').filter((line) => line.includes(':focus-within'));
		expect(withFocusWithin.length).toBeGreaterThan(0);
		withFocusWithin.forEach((line) => expect(line.split('{')[0]).not.toContain(','));
	});

	it('ignores a value that is not a color', () => {
		expect(buildThemeOverrideCss(moonfin, {accents: {player: 'nonsense'}})).not.toContain('nonsense');
	});

	it('writes readable ink on a bright pick and keeps the theme ink on a dark one', () => {
		const bright = withHandRule(rulesFor({settings: '#ffff00'}), '.toggleOn .');
		const dark = withHandRule(rulesFor({settings: '#000080'}), '.toggleOn .');
		expect(bright).toContain('rgba(0, 0, 0, 0.92)');
		expect(dark).toBeDefined();
		expect(dark).not.toContain('rgba(0, 0, 0, 0.92)');
	});

	describe('visibility', () => {
		it('lifts a black pick so text drawn in the accent still shows on the dark screens', () => {
			const lines = rulesFor({details: '#000000'});
			const readMore = withHandRule(lines, '.readMoreBtn');
			expect(readMore).not.toContain('color: rgb(0, 0, 0)');
			const [r, g, b] = readMore.match(/rgb\((\d+), (\d+), (\d+)\)/).slice(1).map(Number);
			expect(r).toBeGreaterThan(60);
			expect([r, g, b].every((v) => v === r)).toBe(true);
		});

		it('leaves a pick that already shows exactly as it was picked', () => {
			expect(withHandRule(rulesFor({details: '#ffffff'}), '.readMoreBtn')).toContain('rgb(255, 255, 255)');
		});

		it('writes dark ink on the buttons of a surface that was given white, in the label as well', () => {
			const css = buildThemeOverrideCss(moonfin, {accents: {other: '#ffffff'}});
			const lines = css.split('\n');
			const button = lines.find((line) => line.includes('.btn:focus {') && line.includes('background: rgb(255, 255, 255)'));
			expect(button).toContain('color: rgba(0, 0, 0, 0.92)');
			expect(lines.some((line) => line.includes('.btn:focus *') && line.includes('color: rgba(0, 0, 0, 0.92)'))).toBe(true);
		});

		it('keeps the stylesheet\'s own text on a fill that white text still reads on', () => {
			const css = buildThemeOverrideCss(moonfin, {accents: {other: '#0a3d91'}});
			expect(css).not.toContain('.btn:focus *');
		});

		it('gives a heavy white tint dark ink and leaves a faint one alone', () => {
			const css = buildThemeOverrideCss(moonfin, {accents: {other: '#ffffff'}});
			const heavy = css.split('\n').find((line) => line.includes('.createBtn {') && line.includes('rgba(255, 255, 255, 0.85)'));
			expect(heavy).toContain('rgba(0, 0, 0, 0.92)');
			const faint = css.split('\n').find((line) => line.includes('rgba(255, 255, 255, 0.2)') && !line.includes('rgba(0, 0, 0, 0.92)'));
			expect(faint).toBeDefined();
		});

		it('keeps a black focus outline visible', () => {
			const css = buildThemeOverrideCss(moonfin, {focusBorderColor: '#000000'});
			expect(css).not.toContain('border-color: rgb(0, 0, 0)');
		});

		it('picks ink that reads on a bright accent for the hand written buttons too', () => {
			expect(withHandRule(rulesFor({settings: '#ffffff'}), '.toggleOn .')).toContain('rgba(0, 0, 0, 0.92)');
		});
	});

	describe('focused fills', () => {
		const focusRule = (lines, selector) => lines.find((line) => line.includes(`${selector} {`));

		it('gives Settings rows the picked color as their focused fill, with dark text on a white one', () => {
			const lines = rulesFor({settingsFocus: '#ffffff'});
			const row = focusRule(lines, '.themeCard:focus');
			expect(row).toContain('background: rgb(255, 255, 255)');
			expect(withHandRule(lines, '.listItem:focus .listItemHeading')).toContain('rgba(0, 0, 0, 0.96)');
			expect(lines.find((line) => line.includes('.actionButton:focus {') && line.includes('background'))).toContain('background: rgb(255, 255, 255)');
			expect(withHandRule(lines, '.actionButtonActive')).toContain('background: rgb(255, 255, 255)');
		});

		it('picks the text ink from the fill, dark on a bright pick', () => {
			const lines = rulesFor({settingsFocus: '#4a72d7'});
			expect(focusRule(lines, '.themeCard:focus')).toContain('background: rgb(74, 114, 215)');
			expect(withHandRule(lines, '.listItem:focus .listItemHeading')).toContain('rgba(0, 0, 0, 0.96)');
		});

		it('gives the details buttons the picked fill and readable icons', () => {
			const lines = rulesFor({details: '#ffffff'});
			expect(withHandRule(lines, '.btnWrapper:focus .btnAction {')).toContain('background: rgb(255, 255, 255)');
			expect(withHandRule(lines, '.btnWrapper:focus .btnAction .btnIcon')).toContain('rgba(0, 0, 0, 0.92)');
		});

		it('keeps the focused fill and the rest of Settings apart, so each takes only its own pick', () => {
			const focusOnly = rulesFor({settingsFocus: '#ffffff'});
			expect(focusRule(focusOnly, '.themeCard:focus')).toContain('background: rgb(255, 255, 255)');
			// The theme's own cyan only reads at 2.86:1 against white, under the 3:1 floor, so
			// picking white for Settings Focus alone (with no pick of its own for Settings) is
			// already enough to nudge the toggle just off the theme's blue to stay visible on it -
			// not snapped to the focus pick itself, which would be a much bigger jump than this.
			const toggleOnFocusWhite = withHandRule(focusOnly, '.toggleOn');
			expect(toggleOnFocusWhite).not.toContain('rgb(0, 164, 220)');
			expect(toggleOnFocusWhite).not.toContain('rgb(255, 255, 255)');

			const restOnly = rulesFor({settings: '#ff0000'});
			expect(withHandRule(restOnly, '.toggleOn')).toContain('rgb(255, 0, 0)');
			expect(focusRule(restOnly, '.themeCard:focus')).not.toContain('background: rgb(255, 0, 0)');
		});

		it('leaves the theme\'s fill alone on a surface that was not picked', () => {
			const lines = rulesFor({details: '#ffffff'});
			expect(focusRule(lines, '.themeCard:focus')).not.toContain('background: rgb(255, 255, 255)');
		});
	});
});

