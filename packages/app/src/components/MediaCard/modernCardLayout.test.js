import {isStaticLibraryCard, modernCardMetrics, modernRowSpacing, getCardDisplayTitle, getEpisodeLabels} from './modernCardLayout';

const metrics = (over = {}) => modernCardMetrics({
	posterSize: 'default',
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

	test('a set that has never seen the setting holds the row static', () => {
		expect(isStaticLibraryCard(true, {})).toBe(true);
		expect(isStaticLibraryCard(true, undefined)).toBe(true);
	});
});

describe('modernCardMetrics', () => {
	test('scales the image with the size preset and falls back to the default', () => {
		expect(metrics({posterSize: 'small'}).imageHeight).toBe(160);
		expect(metrics().imageHeight).toBe(200);
		expect(metrics({posterSize: 'xlarge'}).imageHeight).toBe(280);
		expect(metrics({posterSize: 'nonsense'}).imageHeight).toBe(200);
	});

	test('keeps Grandparents at the Extra Large height', () => {
		expect(metrics({posterSize: 'grandparents'}).imageHeight).toBe(280);
	});

	test('a poster is two thirds of its height and a sleeve is square', () => {
		expect(metrics().cardWidth).toBe(134);
		expect(metrics({isSquareItem: true}).cardWidth).toBe(200);
	});

	test('a static My Media tile is as wide as a focused card, so the rows line up', () => {
		const {expandedWidth, cardWidth} = metrics({isStatic: true});
		expect(cardWidth).toBe(expandedWidth);
	});

	test('growing on focus never makes a card narrower than it sits', () => {
		for (const isSquareItem of [true, false]) {
			const {expandedWidth, cardWidth} = metrics({isSquareItem});
			expect(expandedWidth).toBeGreaterThanOrEqual(cardWidth);
		}
	});

	test('a focused card opens to 16:9 on every platform, as Core draws it', () => {
		expect(metrics().expandedWidth).toBe(356);
		expect(metrics({posterSize: 'small'}).expandedWidth).toBe(285);
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

describe('modernRowSpacing', () => {
	test('turns the padding slider into the space below a row, every stop changing it and none overlapping', () => {
		expect(modernRowSpacing({})).toBe(0);
		expect(modernRowSpacing({modernHomeRowsPadding: 420})).toBe(34);
		expect(modernRowSpacing({modernHomeRowsPadding: 500})).toBe(100);
		expect(modernRowSpacing({modernHomeRowsPadding: 560})).toBe(160);
		expect(modernRowSpacing({modernHomeRowsPadding: 400})).toBe(23);
		expect(modernRowSpacing({modernHomeRowsPadding: 380})).toBe(11);
		expect(modernRowSpacing({modernHomeRowsPadding: 360})).toBe(0);
	});

	test('leaves full screen rows to pace themselves', () => {
		expect(modernRowSpacing({fullScreenRows: true, modernHomeRowsPadding: 500})).toBeNull();
	});
});
