import {canDrawPosterLabel, posterLabelColors, posterLabelCorners, posterLabelFlag, posterLabelLook} from './posterLabelLook';

const badge = (extra = {}) => ({label: '4K', color: '#2563EB', textColor: '', style: 'solid', opacity: 100, size: 'medium', corner: 'topLeft', shape: 'rounded', icon: '', ...extra});

// Back to this app's design pixels from the rem a style carries.
const px = (value) => parseFloat(value) * 24;
const POINT = 1920 / 1150;

describe('posterLabelColors', () => {
	test('a solid label is the color itself, with text that stays readable on it', () => {
		expect(posterLabelColors(badge())).toEqual({background: 'rgba(37, 99, 235, 1)', border: null, text: 'rgb(255, 255, 255)'});
		expect(posterLabelColors(badge({color: '#FACC15'})).text).toBe('rgb(0, 0, 0)');
	});

	test('opacity fades the fill and border but never the text, from 10 to 100', () => {
		expect(posterLabelColors(badge({opacity: 0})).background).toBe('rgba(37, 99, 235, 0.1)');
		expect(posterLabelColors(badge({opacity: 150})).background).toBe('rgba(37, 99, 235, 1)');
		const glass = posterLabelColors(badge({style: 'glass', opacity: 50}));
		expect(glass).toEqual({
			background: 'rgba(37, 99, 235, 0.225)',
			border: {width: 1, color: 'rgba(255, 255, 255, 0.175)'},
			text: 'rgb(255, 255, 255)'
		});
	});

	test('outline and dark take the color for their text unless it\'s near black', () => {
		expect(posterLabelColors(badge({style: 'outline', color: '#22C55E'}))).toEqual({
			background: 'rgba(0, 0, 0, 0.55)',
			border: {width: 1.5, color: 'rgba(34, 197, 94, 1)'},
			text: 'rgb(34, 197, 94)'
		});
		expect(posterLabelColors(badge({style: 'outline', color: '#111111'})).text).toBe('rgb(255, 255, 255)');
		expect(posterLabelColors(badge({style: 'dark', color: '#475569'}))).toEqual({
			background: 'rgba(12, 12, 16, 0.85)',
			border: null,
			text: 'rgb(71, 85, 105)'
		});
		expect(posterLabelColors(badge({style: 'dark', color: '#000000'})).text).toBe('rgb(255, 255, 255)');
	});

	test('light turns a bright color\'s text near black', () => {
		expect(posterLabelColors(badge({style: 'light', color: '#6D28D9'}))).toEqual({
			background: 'rgba(255, 255, 255, 0.92)',
			border: null,
			text: 'rgb(109, 40, 217)'
		});
		expect(posterLabelColors(badge({style: 'light', color: '#FACC15'})).text).toBe('rgb(17, 17, 17)');
	});

	test('the admin\'s text color wins, and a color that doesn\'t parse falls back', () => {
		expect(posterLabelColors(badge({textColor: '#FF0000'})).text).toBe('rgb(255, 0, 0)');
		expect(posterLabelColors(badge({textColor: 'red'})).text).toBe('rgb(255, 255, 255)');
		expect(posterLabelColors(badge({color: 'nope'})).background).toBe('rgba(37, 99, 235, 1)');
	});
});

describe('posterLabelLook', () => {
	test('a label with an icon draws both, and one with an unknown icon draws only its text', () => {
		const both = posterLabelLook(badge({label: 'MULTI', icon: 'translate'}), 1);
		expect(both.text).toBe('MULTI');
		expect(both.icon).toBe('translate');
		expect(px(both.iconStyle.marginRight)).toBeCloseTo(3 * POINT);

		const unknown = posterLabelLook(badge({label: 'VFQ', icon: 'dolby'}), 1);
		expect(unknown.text).toBe('VFQ');
		expect(unknown.icon).toBeNull();
	});

	test('an icon alone sits in a squarer pill and is named for screen readers', () => {
		const look = posterLabelLook(badge({label: '', icon: 'surround_sound'}), 1);
		expect(look.text).toBeNull();
		expect(look.icon).toBe('surround_sound');
		expect(look.name).toBe('surround sound');
		const [vertical, horizontal] = look.style.padding.split(' ').map(px);
		expect(vertical).toBeCloseTo(2 * POINT);
		expect(horizontal).toBeCloseTo(3 * POINT);
	});

	test('nothing draws for a label with no text and nothing this app knows to show', () => {
		expect(posterLabelLook(badge({label: '', icon: 'dolby'}), 1)).toBeNull();
		expect(posterLabelLook(badge({label: '  ', icon: 'flag-zz'}), 1)).toBeNull();
		expect(canDrawPosterLabel(badge({label: '', icon: 'flag-es-ct'}))).toBe(true);
	});

	test('a flag stands in for the icon beside text, and only known codes count', () => {
		const look = posterLabelLook(badge({label: 'VFQ', icon: 'flag-ca'}), 1);
		expect(look.flag).toBe('ca');
		expect(look.icon).toBeNull();
		expect(px(look.flagStyle.width) / px(look.flagStyle.height)).toBeCloseTo(4 / 3);
		expect(posterLabelFlag('flag-zz')).toBeNull();
		expect(posterLabelLook(badge({label: 'X', icon: 'flag-zz'}), 1).flag).toBeNull();
	});

	test('a flag alone has no fill and is as tall as a text label', () => {
		const look = posterLabelLook(badge({label: '', icon: 'flag-fr'}), 0.85);
		expect(look.flagOnly).toBe(true);
		expect(look.name).toBe('flag FR');
		expect(look.style.background).toBeUndefined();
		// The text's line plus the pill's padding above and below it.
		expect(px(look.style.height)).toBeCloseTo((10 * 1.2 + 4) * POINT * 0.85);
		expect(px(look.style.width) / px(look.style.height)).toBeCloseTo(4 / 3);
		expect(posterLabelLook(badge({label: '', icon: 'flag-fr', shape: 'square'}), 1).style.borderRadius).toBe(0);
		expect(px(posterLabelLook(badge({label: '', icon: 'flag-fr', shape: 'pill'}), 1).style.borderRadius)).toBeCloseTo(5 * POINT);
	});

	test('sizes and the card scale grow the label together', () => {
		const font = (extra, scale = 1) => px(posterLabelLook(badge(extra), scale).style.fontSize);
		expect(font({})).toBeCloseTo(10 * POINT);
		expect(font({size: 'small'}) / font({})).toBeCloseTo(0.8);
		expect(font({size: 'large'}) / font({})).toBeCloseTo(1.25);
		expect(font({size: 'xlarge'}) / font({})).toBeCloseTo(1.5);
		expect(font({}, 0.85) / font({})).toBeCloseTo(0.85);
	});

	test('shapes round the corners', () => {
		expect(posterLabelLook(badge({shape: 'pill'}), 1).style.borderRadius).toBe('999px');
		expect(posterLabelLook(badge({shape: 'square'}), 1).style.borderRadius).toBe(0);
		expect(px(posterLabelLook(badge(), 1).style.borderRadius)).toBeCloseTo(4 * POINT);
		expect(posterLabelLook(badge(), 1).style.border).toBe('none');
		expect(posterLabelLook(badge({style: 'outline'}), 1).style.border).toMatch(/ solid rgba\(37, 99, 235, 1\)$/);
	});
});

describe('posterLabelCorners', () => {
	test('each corner keeps the admin\'s order up to its limit, and skips what can\'t draw', () => {
		const corners = posterLabelCorners([
			badge({label: '', icon: 'dolby'}),
			badge({label: 'A'}),
			badge({label: 'B'}),
			badge({label: 'C'}),
			badge({label: 'D', corner: 'bottomRight'})
		], 2, 1);
		expect(corners.topLeft.map((look) => look.text)).toEqual(['A', 'B']);
		expect(corners.bottomRight.map((look) => look.text)).toEqual(['D']);
		expect(corners.topRight).toBeUndefined();
	});

	test('nothing to draw anywhere is null, so the card draws nothing', () => {
		expect(posterLabelCorners([], 2, 1)).toBeNull();
		expect(posterLabelCorners([badge({label: '', icon: 'dolby'})], 2, 1)).toBeNull();
	});
});
