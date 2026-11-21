// MediaCard.js pulls in components that need the app's React, so its sizes are stood in here.
jest.mock('../../components/MediaCard/MediaCard', () => ({
	classicCardSize: (shape, posterSize) => ({height: {portrait: 360, landscape: 216, square: 240, banner: 216}[shape] * (posterSize === 'small' ? 0.8 : 1)})
}));

import {defaultSettings} from '../../context/defaultSettings';

import {rowCardType, rowImageType, rowPeekHeight} from './rowPeek';

const continueRow = {id: 'continue-nextup', type: 'landscape'};
const latestRow = {id: 'latest-movies', isLatestRow: true, type: 'portrait'};
const peek = (overrides, row = continueRow) => rowPeekHeight({...defaultSettings, mediaBarRowPeek: true, ...overrides}, row);

describe('rowPeekHeight', () => {
	test('is zero when the setting is off, the bar has no peek or there is no row', () => {
		expect(rowPeekHeight(defaultSettings, continueRow)).toBe(0);
		expect(peek({featuredBarStyle: 'banner'})).toBe(0);
		expect(peek({featuredBarStyle: 'off'})).toBe(0);
		expect(peek({}, null)).toBe(0);
	});

	test('modern rows show the title and half of a poster at the chosen size', () => {
		expect(peek({homeRowsStyle: 'v2'})).toBe(230);
		expect(peek({homeRowsStyle: 'v2', homeRowsPosterSize: 'large'})).toBe(266);
	});

	test('classic rows follow the shape of the first row', () => {
		expect(peek({homeRowsStyle: 'v1'})).toBe(177);
		expect(peek({homeRowsStyle: 'v1'}, latestRow)).toBe(249);
		expect(peek({homeRowsStyle: 'v1', homeRowImageTypes: {'latest-media': 'thumb'}}, latestRow)).toBe(177);
		expect(peek({homeRowsStyle: 'v1', homeRowsPosterSize: 'small'}, {id: 'favoriteAlbums', type: 'square'})).toBe(165);
	});
});

describe('rowImageType', () => {
	const classic = {...defaultSettings, homeRowsStyle: 'v1', homeRowsImageType: 'poster'};

	test('the merged Continue Watching row takes the Continue Watching override, then Next Up', () => {
		expect(rowImageType(continueRow, {...classic, homeRowImageTypes: {resume: 'thumb'}})).toBe('thumb');
		expect(rowImageType(continueRow, {...classic, homeRowImageTypes: {nextup: 'banner'}})).toBe('banner');
		expect(rowImageType(continueRow, {...classic, homeRowImageTypes: {resume: 'thumb', nextup: 'banner'}})).toBe('thumb');
		expect(rowImageType(continueRow, classic)).toBe('poster');
	});

	test('modern rows ignore the overrides', () => {
		expect(rowImageType(continueRow, {...classic, homeRowsStyle: 'v2', homeRowImageTypes: {resume: 'thumb'}})).toBe('poster');
	});
});

describe('rowCardType', () => {
	const classic = {...defaultSettings, homeRowsStyle: 'v1', homeRowsImageType: 'poster'};

	test('a Poster set on Continue Watching or Next Up turns their cards into posters', () => {
		expect(rowCardType({id: 'resume', type: 'landscape'}, {...classic, homeRowImageTypes: {resume: 'poster'}})).toBe('portrait');
		expect(rowCardType({id: 'nextup', type: 'landscape'}, {...classic, homeRowImageTypes: {nextup: 'poster'}})).toBe('portrait');
		expect(rowCardType(continueRow, {...classic, homeRowImageTypes: {nextup: 'poster'}})).toBe('portrait');
		expect(peek({homeRowsStyle: 'v1', homeRowImageTypes: {resume: 'poster'}})).toBe(249);
	});

	test('the rows stay wide under the default image type, another override or modern rows', () => {
		expect(rowCardType(continueRow, classic)).toBe('landscape');
		expect(rowCardType(continueRow, {...classic, homeRowImageTypes: {resume: 'thumb', nextup: 'poster'}})).toBe('landscape');
		expect(rowCardType(continueRow, {...classic, homeRowsStyle: 'v2', homeRowImageTypes: {resume: 'poster'}})).toBe('landscape');
	});

	test('other rows keep their own type', () => {
		expect(rowCardType({id: 'favoriteEpisodes', type: 'landscape'}, {...classic, homeRowImageTypes: {favoriteEpisodes: 'poster'}})).toBe('landscape');
		expect(rowCardType(latestRow, classic)).toBe('portrait');
	});
});
