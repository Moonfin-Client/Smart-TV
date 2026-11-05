import {copyReaches} from './copySeek';

const playlist = (count, duration = 2, start = 0) => ({
	fragments: Array.from({length: count}, (_, i) => ({start: start + i * duration, duration}))
});

describe('copyReaches', () => {
	it('reaches anywhere the playlist already lists, short of its last second', () => {
		const details = playlist(10);
		expect(copyReaches(details, 0)).toBe(true);
		expect(copyReaches(details, 18.5)).toBe(true);
		expect(copyReaches(details, 19.5)).toBe(false);
		expect(copyReaches(details, 40)).toBe(false);
	});

	it('does not reach before a stream that starts mid-title', () => {
		expect(copyReaches(playlist(5, 2, 30), 20)).toBe(false);
	});

	it('reaches nothing before a playlist has loaded', () => {
		expect(copyReaches(null, 5)).toBe(false);
		expect(copyReaches({fragments: []}, 5)).toBe(false);
	});
});
