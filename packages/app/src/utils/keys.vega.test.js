jest.mock('../platform', () => ({getPlatform: () => 'vega'}));

import {KEYS, isBackKey, isMenuKey, remoteShortcut} from './keys';

describe('keys on Vega', () => {
	test('back is the escape code the WebView hands the page', () => {
		expect(KEYS.BACK).toBe(27);
		expect(isBackKey({keyCode: 27})).toBe(true);
		expect(isBackKey({keyCode: 461})).toBe(false);
	});

	test('the remote menu key is the context menu code', () => {
		expect(KEYS.MENU).toBe(93);
		expect(isMenuKey({keyCode: 93})).toBe(true);
		expect(isMenuKey({keyCode: 13})).toBe(false);
	});

	test('the transport keys use their media key codes', () => {
		expect(KEYS.PLAY_PAUSE).toBe(179);
		expect(KEYS.REWIND).toBe(227);
		expect(KEYS.FAST_FORWARD).toBe(228);
		expect(KEYS.PLAY).toBeUndefined();
	});

	test('the Tizen shortcut codes mean nothing here', () => {
		expect(remoteShortcut({keyCode: 458})).toBeNull();
		expect(remoteShortcut({keyCode: 10221})).toBeNull();
	});
});
