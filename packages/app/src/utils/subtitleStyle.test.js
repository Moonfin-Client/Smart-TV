jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../services/subtitleFonts', () => ({
	subtitleFontFamily: (family, bold) => (family ? `'${family}'${bold ? ' bold' : ''}` : undefined)
}));

import {
	resolveSubtitleStyleSettings,
	subtitleStyleKey,
	getSubtitleTextStyle,
	getSubtitleColorOptions,
	getSubtitleShadowColorOptions,
	getSubtitleBackgroundColorOptions,
	SUBTITLE_STYLE_KEYS
} from './subtitleConstants';

const settings = {
	subtitleHdrSeparate: false,
	subtitleSize: 'medium',
	subtitleColor: '#ffffff',
	subtitleBackground: 0,
	subtitleBackgroundColor: '#000000',
	subtitleShadowColor: '#000000',
	subtitleShadowOpacity: 100,
	subtitleShadowBlur: 0.1,
	subtitleOpacity: 100,
	subtitlePosition: 'bottom',
	subtitlePositionAbsolute: 90,
	subtitleSizeHdr: 'large',
	subtitleColorHdr: '#808080',
	subtitleBackgroundHdr: 40,
	subtitleBackgroundColorHdr: '#404040',
	subtitleShadowColorHdr: '#404040',
	subtitleShadowOpacityHdr: 50,
	subtitleShadowBlurHdr: 0.5,
	subtitleOpacityHdr: 80,
	subtitlePositionHdr: 'lower',
	subtitlePositionAbsoluteHdr: 70,
	subtitleBold: false,
	subtitleBoldHdr: true
};

describe('resolveSubtitleStyleSettings', () => {
	it('returns the settings untouched for SDR', () => {
		expect(resolveSubtitleStyleSettings({...settings, subtitleHdrSeparate: true}, false)).toEqual(
			{...settings, subtitleHdrSeparate: true}
		);
	});

	it('returns the settings untouched for HDR while the separate style is off', () => {
		expect(resolveSubtitleStyleSettings(settings, true).subtitleColor).toBe('#ffffff');
	});

	it('overlays every HDR twin once the separate style is on', () => {
		const resolved = resolveSubtitleStyleSettings({...settings, subtitleHdrSeparate: true}, true);

		for (const key of SUBTITLE_STYLE_KEYS) {
			expect(resolved[key]).toEqual(settings[`${key}Hdr`]);
		}
	});

	it('leaves a base value in place when its HDR twin is unset', () => {
		const partial = {subtitleHdrSeparate: true, subtitleColor: '#ffffff', subtitleSize: 'medium', subtitleSizeHdr: 'large'};
		const resolved = resolveSubtitleStyleSettings(partial, true);

		expect(resolved.subtitleColor).toBe('#ffffff');
		expect(resolved.subtitleSize).toBe('large');
	});

	it('does not mutate the settings it was given', () => {
		const input = {...settings, subtitleHdrSeparate: true};
		resolveSubtitleStyleSettings(input, true);

		expect(input.subtitleColor).toBe('#ffffff');
	});

	it('survives missing settings', () => {
		expect(resolveSubtitleStyleSettings(undefined, true)).toBeUndefined();
	});
});

describe('subtitleStyleKey', () => {
	it('writes to the HDR twin only while HDR styling is active', () => {
		expect(subtitleStyleKey('subtitleColor', true)).toBe('subtitleColorHdr');
		expect(subtitleStyleKey('subtitleColor', false)).toBe('subtitleColor');
	});
});

describe('getSubtitleTextStyle through the resolver', () => {
	it('renders the HDR colour for HDR and the SDR colour otherwise', () => {
		const on = {...settings, subtitleHdrSeparate: true};

		expect(getSubtitleTextStyle(resolveSubtitleStyleSettings(on, true)).color).toBe('#808080');
		expect(getSubtitleTextStyle(resolveSubtitleStyleSettings(on, false)).color).toBe('#ffffff');
	});

	it('renders the HDR size for HDR', () => {
		const on = {...settings, subtitleHdrSeparate: true};

		expect(getSubtitleTextStyle(resolveSubtitleStyleSettings(on, true)).fontSize).toBe('52px');
	});
});

describe('the subtitle palette', () => {
	it('offers all fifteen colors for the stroke and the background', () => {
		expect(getSubtitleShadowColorOptions()).toHaveLength(15);
		expect(getSubtitleBackgroundColorOptions()).toHaveLength(15);
	});

	it('leaves Transparent out of the text fill, which would hide the text', () => {
		const fill = getSubtitleColorOptions();
		expect(fill).toHaveLength(14);
		expect(fill.some((option) => option.value === '#00000000')).toBe(false);
	});
});

describe('getSubtitleTextStyle colors', () => {
	it('keeps an opaque color as hex', () => {
		expect(getSubtitleTextStyle(settings).color).toBe('#ffffff');
	});

	it('applies the opacity slider as rgba, which older engines can read', () => {
		expect(getSubtitleTextStyle({...settings, subtitleBackground: 50}).backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
	});

	it('carries a see-through color\'s own alpha under the slider', () => {
		const style = getSubtitleTextStyle({...settings, subtitleBackgroundColor: '#ffffff80', subtitleBackground: 100, subtitleColor: '#00000080'});
		expect(style.backgroundColor).toBe('rgba(255, 255, 255, 0.502)');
		expect(style.color).toBe('rgba(0, 0, 0, 0.502)');
	});

	it('draws Transparent as nothing at all', () => {
		expect(getSubtitleTextStyle({...settings, subtitleBackgroundColor: '#00000000', subtitleBackground: 100}).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	});
});

describe('getSubtitleTextStyle outline, drop shadow, bold and font', () => {
	const outline = '-2px -2px 0.1em #000000, 2px -2px 0.1em #000000, -2px 2px 0.1em #000000, 2px 2px 0.1em #000000, 0 0 0.1em #000000';

	it('draws the outline as before and leaves the weight and font to the stylesheet by default', () => {
		const style = getSubtitleTextStyle({...settings, subtitleStrokeWidth: 100, subtitleFont: ''});
		expect(style.textShadow).toBe(outline);
		expect(style.fontWeight).toBeUndefined();
		expect(style.fontFamily).toBeUndefined();
	});

	it('widens the outline ring with the stroke width', () => {
		expect(getSubtitleTextStyle({...settings, subtitleStrokeWidth: 200}).textShadow).toBe(outline.replace(/2px/g, '4px'));
	});

	it('paints the drop shadow last so it sits under the outline', () => {
		const style = getSubtitleTextStyle({
			...settings,
			subtitleDropShadow: true,
			subtitleDropShadowIntensity: 50,
			subtitleDropShadowOffset: 3,
			subtitleDropShadowBlur: 1
		});
		expect(style.textShadow).toBe(`${outline}, 0.06em 0.06em 0.02em rgba(0, 0, 0, 0.5)`);
	});

	it('leaves the drop shadow off while its switch is off', () => {
		expect(getSubtitleTextStyle({...settings, subtitleDropShadowOffset: 8}).textShadow).toBe(outline);
	});

	it('draws bold and asks for the bold face of the picked font, in the HDR style when HDR is on screen', () => {
		const sdr = getSubtitleTextStyle({...settings, subtitleFont: 'Lato'});
		expect(sdr.fontWeight).toBeUndefined();
		expect(sdr.fontFamily).toBe("'Lato'");

		const hdr = getSubtitleTextStyle(resolveSubtitleStyleSettings({...settings, subtitleHdrSeparate: true, subtitleFont: 'Lato'}, true));
		expect(hdr.fontWeight).toBe(700);
		expect(hdr.fontFamily).toBe("'Lato' bold");
	});
});
