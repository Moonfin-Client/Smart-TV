import {homeBackdropStyle, homeBackdropSettings} from './homeBackdropStyle';

describe('homeBackdropStyle', () => {
	test('the switch being off wins over any style', () => {
		expect(homeBackdropStyle({showHomeBackdrop: false, homeBackdropStyle: 'corner'})).toBe('off');
		expect(homeBackdropStyle({showHomeBackdrop: false})).toBe('off');
	});

	test('a switch that is on goes in the corner or across the top only when asked to', () => {
		expect(homeBackdropStyle({showHomeBackdrop: true, homeBackdropStyle: 'corner'})).toBe('corner');
		expect(homeBackdropStyle({showHomeBackdrop: true, homeBackdropStyle: 'top'})).toBe('top');
		expect(homeBackdropStyle({showHomeBackdrop: true, homeBackdropStyle: 'fullScreen'})).toBe('fullScreen');
	});

	test('a profile from before the style lands on Full Screen', () => {
		expect(homeBackdropStyle({showHomeBackdrop: true})).toBe('fullScreen');
		expect(homeBackdropStyle({})).toBe('fullScreen');
		expect(homeBackdropStyle(null)).toBe('fullScreen');
		// An older app turning the switch back on after Off was picked here
		expect(homeBackdropStyle({showHomeBackdrop: true, homeBackdropStyle: 'off'})).toBe('fullScreen');
		expect(homeBackdropStyle({showHomeBackdrop: true, homeBackdropStyle: 'something new'})).toBe('fullScreen');
	});
});

describe('homeBackdropSettings', () => {
	test('writes the switch and the style together', () => {
		expect(homeBackdropSettings('off')).toEqual({showHomeBackdrop: false, homeBackdropStyle: 'off'});
		expect(homeBackdropSettings('fullScreen')).toEqual({showHomeBackdrop: true, homeBackdropStyle: 'fullScreen'});
		expect(homeBackdropSettings('corner')).toEqual({showHomeBackdrop: true, homeBackdropStyle: 'corner'});
	});
});
