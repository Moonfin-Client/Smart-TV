// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {numberedTrackName, sortSubtitleStreams} from './trackLabels';

describe('numberedTrackName', () => {
	test('every row leads with its position', () => {
		expect(numberedTrackName(1, 'English 5.1', 'Audio')).toBe('1 - English 5.1');
		expect(numberedTrackName(3, 'Portuguese (Brazil) SDH', 'Subtitle')).toBe('3 - Portuguese (Brazil) SDH');
	});

	test('a nameless track falls back to its position', () => {
		expect(numberedTrackName(2, '', 'Subtitle')).toBe('2 - Subtitle 2');
		expect(numberedTrackName(2, null)).toBe('2 - Track 2');
	});
});

describe('sortSubtitleStreams', () => {
	test('the file\'s own tracks come before downloaded ones', () => {
		const internal = {index: 1};
		const external = {index: 2, isExternal: true};
		const delivered = {index: 3, deliveryMethod: 'External'};
		expect(sortSubtitleStreams([external, internal, delivered])).toEqual([internal, external, delivered]);
	});

	// The player works in mapped streams and the detail screen in raw server ones.
	test('either spelling of the external flag counts', () => {
		const internal = {Index: 1};
		const external = {Index: 2, IsExternal: true};
		const delivered = {Index: 3, DeliveryMethod: 'External'};

		expect(sortSubtitleStreams([external, delivered, internal])).toEqual([internal, external, delivered]);
	});

	test('external tracks come first when preferExternal is true', () => {
		const internal = {index: 1};
		const external = {index: 2, isExternal: true};
		const delivered = {index: 3, deliveryMethod: 'External'};
		expect(sortSubtitleStreams([internal, external, delivered], true)).toEqual([external, delivered, internal]);
	});
});
