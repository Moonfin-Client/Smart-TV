// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {trackName, numberedTrackName, sortSubtitleStreams, versionLabel} from './trackLabels';

describe('trackName', () => {
	test('subtitle rows read as the track is named, with nothing in front', () => {
		expect(trackName(1, 'English', 'Subtitle')).toBe('English');
		expect(trackName(3, 'Portuguese (Brazil) SDH', 'Subtitle')).toBe('Portuguese (Brazil) SDH');
	});

	test('a nameless track falls back to its position', () => {
		expect(trackName(2, '', 'Subtitle')).toBe('Subtitle 2');
		expect(trackName(2, null)).toBe('Track 2');
	});
});

describe('numberedTrackName', () => {
	test('audio rows still lead with their position', () => {
		expect(numberedTrackName(1, 'English 5.1', 'Audio')).toBe('1 - English 5.1');
		expect(numberedTrackName(2, '', 'Audio')).toBe('2 - Audio 2');
	});
});

describe('sortSubtitleStreams', () => {
	test('the file\'s own tracks come before downloaded ones', () => {
		const internal = {index: 1};
		const external = {index: 2, isExternal: true};
		const delivered = {index: 3, deliveryMethod: 'External'};
		expect(sortSubtitleStreams([external, internal, delivered])).toEqual([internal, external, delivered]);
	});
});

describe('versionLabel', () => {
	test('the library leads the name when it is what tells the versions apart', () => {
		expect(versionLabel('1080p', '4K Movies')).toBe('[4K Movies] - 1080p');
	});

	test('a version with no library beside it stands on its own name', () => {
		expect(versionLabel('1080p')).toBe('1080p');
		expect(versionLabel('1080p', '')).toBe('1080p');
	});
});
