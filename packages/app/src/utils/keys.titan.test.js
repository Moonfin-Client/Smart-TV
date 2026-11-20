jest.mock('../platform', () => ({getPlatform: () => 'titan'}));

import {KEYS, isBackKey, isTypingBack, setBackKeyCode} from './keys';

describe('keys on Titan OS', () => {
	test('Back is 461 on JVC and Backspace on Philips', () => {
		expect(KEYS.BACK).toBe(461);
		expect(isBackKey({keyCode: 461})).toBe(true);
		expect(isBackKey({keyCode: 8})).toBe(true);
	});

	test('a Philips remote closes the keyboard with Back rather than deleting', () => {
		expect(isTypingBack(8)).toBe(true);
		expect(isTypingBack(461)).toBe(true);
		expect(isTypingBack(65)).toBe(false);
	});

	test("the media keys are the ones in Titan's table", () => {
		expect(KEYS).toMatchObject({PLAY: 415, PAUSE: 19, PLAY_PAUSE: 179, STOP: 413, REWIND: 412, FAST_FORWARD: 417, CHANNEL_UP: 33, CHANNEL_DOWN: 34});
	});

	// Last, since it changes KEYS for the rest of the file.
	test("takes the SDK's Back for a brand with its own, and ignores an empty answer", () => {
		setBackKeyCode(null);
		expect(KEYS.BACK).toBe(461);
		setBackKeyCode(166);
		expect(isBackKey({keyCode: 166})).toBe(true);
		expect(isTypingBack(166)).toBe(true);
	});
});
