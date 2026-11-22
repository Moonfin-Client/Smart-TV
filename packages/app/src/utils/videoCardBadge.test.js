jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {showsVideoBadge, videoBadgeDuration} from './videoCardBadge';

const SECOND = 10000000;

describe('showsVideoBadge', () => {
	test('marks the clips in home video and photo libraries', () => {
		expect(showsVideoBadge({Type: 'Video'})).toBe(true);
	});

	test('leaves photos, folders, movies and episodes alone', () => {
		['Photo', 'PhotoAlbum', 'Folder', 'Movie', 'Episode'].forEach((Type) => {
			expect(showsVideoBadge({Type})).toBe(false);
		});
		expect(showsVideoBadge(null)).toBe(false);
	});
});

describe('videoBadgeDuration', () => {
	test('reads a short clip in minutes and seconds', () => {
		expect(videoBadgeDuration({RunTimeTicks: 42 * SECOND})).toBe('0:42');
		expect(videoBadgeDuration({RunTimeTicks: ((3 * 60) + 7) * SECOND})).toBe('3:07');
	});

	test('adds the hour for a long recording', () => {
		expect(videoBadgeDuration({RunTimeTicks: ((1 * 3600) + (2 * 60) + 3) * SECOND})).toBe('1:02:03');
	});

	test('is empty when the server has no length', () => {
		expect(videoBadgeDuration({})).toBe('');
		expect(videoBadgeDuration({RunTimeTicks: 0})).toBe('');
	});
});
