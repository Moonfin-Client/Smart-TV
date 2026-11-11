import {trackShortcutAction} from './trackShortcut';

const idle = {activeModal: null, hasSubtitles: true, audioTrackCount: 2, recordable: true};

describe('trackShortcutAction', () => {
	test('opens what the OSD button would and closes it on a second press', () => {
		expect(trackShortcutAction('subtitle', idle)).toBe('open');
		expect(trackShortcutAction('subtitle', {...idle, activeModal: 'subtitle'})).toBe('close');
		expect(trackShortcutAction('subtitle', {...idle, activeModal: 'subtitleSlot'})).toBe('close');
		expect(trackShortcutAction('subtitle', {...idle, activeModal: 'secondarySubtitleOffset'})).toBe('close');
		expect(trackShortcutAction('audio', idle)).toBe('open');
		expect(trackShortcutAction('audio', {...idle, activeModal: 'audio'})).toBe('close');
		expect(trackShortcutAction('record', idle)).toBe('open');
		expect(trackShortcutAction('record', {...idle, activeModal: 'record'})).toBe('close');
	});

	test('leaves another dialog alone', () => {
		expect(trackShortcutAction('subtitle', {...idle, activeModal: 'audio'})).toBe('ignore');
		expect(trackShortcutAction('audio', {...idle, activeModal: 'subtitle'})).toBe('ignore');
		expect(trackShortcutAction('record', {...idle, activeModal: 'quality'})).toBe('ignore');
	});

	test('a single audio track says so, and an unrecordable program ignores Record', () => {
		expect(trackShortcutAction('audio', {...idle, audioTrackCount: 1})).toBe('noTracks');
		expect(trackShortcutAction('audio', {...idle, audioTrackCount: 0})).toBe('noTracks');
		expect(trackShortcutAction('record', {...idle, recordable: false})).toBe('ignore');
		expect(trackShortcutAction('subtitle', {...idle, hasSubtitles: false})).toBe('ignore');
	});

	test("other keys aren't its business", () => {
		expect(trackShortcutAction('guide', idle)).toBeNull();
		expect(trackShortcutAction(null, idle)).toBeNull();
	});
});
