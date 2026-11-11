jest.mock('../platform', () => ({getPlatform: () => 'tizen'}));

import {ESSENTIAL_KEY_NAMES, remoteShortcut} from './keys';

describe('remote shortcuts on Tizen', () => {
	test('the documented codes map to their buttons', () => {
		expect(remoteShortcut({keyCode: 458})).toBe('guide');
		expect(remoteShortcut({keyCode: 10221})).toBe('subtitle');
		expect(remoteShortcut({keyCode: 10195})).toBe('audio');
		expect(remoteShortcut({keyCode: 416})).toBe('record');
		expect(remoteShortcut({keyCode: 13})).toBeNull();
		expect(remoteShortcut({keyCode: 0})).toBeNull();
	});

	test('a DVR button goes by its key name', () => {
		expect(remoteShortcut({key: 'DVR', keyCode: 0})).toBe('recordings');
		expect(remoteShortcut({key: 'TVContentsMenu', keyCode: 0})).toBe('recordings');
	});

	test('the buttons are registered, or the TV keeps them', () => {
		['Caption', 'MTS', 'Guide', 'MediaRecord'].forEach((name) => expect(ESSENTIAL_KEY_NAMES).toContain(name));
	});
});
