import {isStaticLibraryCard, modernCardMetrics, getCardDisplayTitle, getEpisodeLabels} from './modernCardLayout';

const metrics = (over = {}) => modernCardMetrics({
	posterSize: 'default',
	platform: 'webos',
	isSquareItem: false,
	isStatic: false,
	...over
});

describe('isStaticLibraryCard', () => {
	test('holds the My Media row static only when the setting is off', () => {
		expect(isStaticLibraryCard(true, {modernCardsOnMyMediaRow: false})).toBe(true);
		expect(isStaticLibraryCard(true, {modernCardsOnMyMediaRow: true})).toBe(false);
	});

	test('leaves every other row alone, Live TV included', () => {
		// Live TV builds its tiles as collection folders, so one looks like a
		// library tile without being on the row the setting names.
		expect(isStaticLibraryCard(false, {modernCardsOnMyMediaRow: false})).toBe(false);
	});

	test('a set that has never seen the setting keeps its posters', () => {
		expect(isStaticLibraryCard(true, {})).toBe(false);
		expect(isStaticLibraryCard(true, undefined)).toBe(false);
	});
});

describe('modernCardMetrics', () => {
	test('scales the image with the size preset and falls back to the default', () => {
		expect(metrics({posterSize: 'small'}).imageHeight).toBe(288);
		expect(metrics().imageHeight).toBe(360);
		expect(metrics({posterSize: 'xlarge'}).imageHeight).toBe(504);
		expect(metrics({posterSize: 'nonsense'}).imageHeight).toBe(360);
	});

	test('a poster is two thirds of its height and a sleeve is square', () => {
		expect(metrics().cardWidth).toBe(240);
		expect(metrics({isSquareItem: true}).cardWidth).toBe(360);
	});

	test('a static My Media tile is as wide as a focused card, so the rows line up', () => {
		for (const platform of ['tizen', 'webos']) {
			const {expandedWidth, cardWidth} = metrics({platform, isStatic: true});
			expect(cardWidth).toBe(expandedWidth);
		}
	});

	test('growing on focus never makes a card narrower than it sits', () => {
		for (const platform of ['tizen', 'webos']) {
			for (const isSquareItem of [true, false]) {
				const {expandedWidth, cardWidth} = metrics({platform, isSquareItem});
				expect(expandedWidth).toBeGreaterThanOrEqual(cardWidth);
			}
		}
	});

	test('Tizen grows wider than the web players do', () => {
		expect(metrics({platform: 'tizen'}).expandedWidth).toBe(640);
		expect(metrics({platform: 'webos'}).expandedWidth).toBe(594);
	});
});

describe('Modern card labels and titles', () => {
	test('renders SeriesName as title for Episode and Season items', () => {
		expect(getCardDisplayTitle({Type: 'Episode', SeriesName: 'Party Down', Name: 'Pilot'})).toBe('Party Down');
		expect(getCardDisplayTitle({Type: 'Season', SeriesName: 'Party Down', Name: 'Season 1'})).toBe('Party Down');
		expect(getCardDisplayTitle({Type: 'Series', Name: 'Firefly'})).toBe('Firefly');
		expect(getCardDisplayTitle({Type: 'Movie', Name: 'The Matrix'})).toBe('The Matrix');
	});

	test('falls back to item Name when SeriesName is absent', () => {
		expect(getCardDisplayTitle({Type: 'Episode', Name: 'Pilot'})).toBe('Pilot');
		expect(getCardDisplayTitle({Type: 'Season', Name: 'Season 1'})).toBe('Season 1');
	});

	test('formats episode and season labels correctly', () => {
		expect(getEpisodeLabels({
			Type: 'Episode',
			ParentIndexNumber: 1,
			IndexNumber: 2,
			SeriesName: 'Party Down',
			Name: 'California College Conservative Union Caucus'
		})).toEqual({
			short: 'S1:E2',
			full: 'S1:E2 - California College Conservative Union Caucus'
		});

		expect(getEpisodeLabels({
			Type: 'Season',
			SeriesName: 'Party Down',
			Name: 'Season 1'
		})).toEqual({
			short: 'Season 1',
			full: 'Season 1'
		});

		expect(getEpisodeLabels({Type: 'Movie', Name: 'The Matrix'})).toBeNull();
		expect(getEpisodeLabels({Type: 'Series', Name: 'Firefly'})).toBeNull();
	});
});
