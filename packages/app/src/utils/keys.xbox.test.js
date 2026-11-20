jest.mock('../platform', () => ({getPlatform: () => 'xbox'}));

import {KEYS, isBackKey, isMenuKey, isTypingBack} from './keys';

describe('keys on Xbox', () => {
	test('back is the escape code the B button is turned into', () => {
		expect(KEYS.BACK).toBe(27);
		expect(isBackKey({keyCode: 27})).toBe(true);
		expect(isBackKey({keyCode: 461})).toBe(false);
	});

	test("the X button deletes while typing, it isn't Back", () => {
		expect(isTypingBack(8)).toBe(false);
		expect(isTypingBack(27)).toBe(true);
	});

	test('the menu button is the context menu code', () => {
		expect(KEYS.MENU).toBe(93);
		expect(isMenuKey({keyCode: 93})).toBe(true);
		expect(isMenuKey({keyCode: 13})).toBe(false);
	});

	test('the transport keys are the ones the host raises for the media remote', () => {
		expect(KEYS.PLAY).toBe(250);
		expect(KEYS.PAUSE).toBe(19);
		expect(KEYS.STOP).toBe(178);
		expect(KEYS.REWIND).toBe(227);
		expect(KEYS.FAST_FORWARD).toBe(228);
	});
});
