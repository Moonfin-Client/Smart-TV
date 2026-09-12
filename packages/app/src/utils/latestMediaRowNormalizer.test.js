import {
	latestMediaFetchLimitForCollection,
	seriesCardForLatestTvItem,
	collapseLatestTvItems,
	normalizeLatestMediaItems
} from './latestMediaRowNormalizer';

describe('latestMediaRowNormalizer', () => {
	describe('latestMediaFetchLimitForCollection', () => {
		test('expands limit for tvshows and shows collections', () => {
			expect(latestMediaFetchLimitForCollection('tvshows', 16, 64)).toBe(32);
			expect(latestMediaFetchLimitForCollection('shows', 16, 64)).toBe(32);
			expect(latestMediaFetchLimitForCollection('TVSHOWS', 16, 64)).toBe(32);
		});

		test('respects maxLimit when expanded limit exceeds it', () => {
			expect(latestMediaFetchLimitForCollection('tvshows', 40, 50)).toBe(50);
		});

		test('returns defaultLimit for other types or null', () => {
			expect(latestMediaFetchLimitForCollection('movies', 16, 64)).toBe(16);
			expect(latestMediaFetchLimitForCollection('music', 16, 64)).toBe(16);
			expect(latestMediaFetchLimitForCollection(null, 16, 64)).toBe(16);
			expect(latestMediaFetchLimitForCollection(undefined, 16, 64)).toBe(16);
		});
	});

	describe('seriesCardForLatestTvItem', () => {
		test('returns item unchanged if already a Series', () => {
			const seriesItem = {Id: 'series-1', Type: 'Series', Name: 'Firefly'};
			expect(seriesCardForLatestTvItem(seriesItem)).toBe(seriesItem);
		});

		test('returns null for non-TV items', () => {
			expect(seriesCardForLatestTvItem({Id: 'm1', Type: 'Movie', Name: 'The Matrix'})).toBeNull();
		});

		test('converts Season item to synthetic Series item', () => {
			const seasonItem = {
				Id: 'season-1',
				Type: 'Season',
				Name: 'Season 1',
				SeriesId: 'series-party-down',
				SeriesName: 'Party Down',
				SeriesPrimaryImageTag: 'tag-series-1',
				ImageTags: {Primary: 'tag-season-1'},
				IndexNumber: 1,
				ProviderIds: {Tmdb: '99999'}
			};

			const result = seriesCardForLatestTvItem(seasonItem);
			expect(result).toEqual({
				Id: 'series-party-down',
				Type: 'Series',
				Name: 'Party Down',
				SeriesId: 'series-party-down',
				SeriesName: 'Party Down',
				SeriesPrimaryImageTag: 'tag-series-1',
				ImageTags: {Primary: 'tag-series-1'},
				PrimaryImageTag: 'tag-series-1',
				PrimaryImageItemId: 'series-party-down'
			});
			expect(result.IndexNumber).toBeUndefined();
			expect(result.ProviderIds).toBeUndefined();
		});

		test('falls back to ParentPrimaryImageTag and ParentId', () => {
			const seasonItem = {
				Id: 'season-2',
				Type: 'Season',
				Name: 'Season 2',
				ParentId: 'series-misfits',
				SeriesName: 'Misfits',
				ParentPrimaryImageTag: 'parent-tag-1'
			};

			const result = seriesCardForLatestTvItem(seasonItem);
			expect(result.Id).toBe('series-misfits');
			expect(result.Name).toBe('Misfits');
			expect(result.PrimaryImageTag).toBe('parent-tag-1');
			expect(result.ImageTags.Primary).toBe('parent-tag-1');
		});

		test('converts Episode item to synthetic Series item with latest episode fields', () => {
			const episodeItem = {
				Id: 'ep-1',
				Type: 'Episode',
				Name: 'Pilot',
				SeriesId: 'series-fleabag',
				SeriesName: 'Fleabag',
				SeriesPrimaryImageTag: 'tag-fleabag',
				PrimaryImageTag: 'tag-ep-art',
				ParentIndexNumber: 1,
				IndexNumber: 1
			};

			const result = seriesCardForLatestTvItem(episodeItem);
			expect(result.Id).toBe('series-fleabag');
			expect(result.Type).toBe('Series');
			expect(result.Name).toBe('Fleabag');
			expect(result.LatestEpisodeId).toBe('ep-1');
			expect(result.LatestEpisodePrimaryImageTag).toBe('tag-ep-art');
			expect(result.IndexNumber).toBeUndefined();
			expect(result.ParentIndexNumber).toBeUndefined();
		});
	});

	describe('collapseLatestTvItems', () => {
		test('deduplicates multiple seasons of the same show', () => {
			const items = [
				{Id: 'season-3', Type: 'Season', Name: 'Season 3', SeriesId: 'show-1', SeriesName: 'Party Down'},
				{Id: 'season-2', Type: 'Season', Name: 'Season 2', SeriesId: 'show-1', SeriesName: 'Party Down'},
				{Id: 'season-1', Type: 'Season', Name: 'Series 1', SeriesId: 'show-2', SeriesName: 'Misfits'}
			];

			const collapsed = collapseLatestTvItems(items);
			expect(collapsed).toHaveLength(2);
			expect(collapsed[0].Id).toBe('show-1');
			expect(collapsed[0].Name).toBe('Party Down');
			expect(collapsed[1].Id).toBe('show-2');
			expect(collapsed[1].Name).toBe('Misfits');
		});
	});

	describe('normalizeLatestMediaItems', () => {
		test('collapses TV items when collectionType is tvshows or shows', () => {
			const items = [
				{Id: 's1', Type: 'Season', Name: 'Season 1', SeriesId: 'show-1', SeriesName: 'Party Down'}
			];

			const result = normalizeLatestMediaItems(items, {collectionType: 'tvshows'});
			expect(result[0].Type).toBe('Series');
			expect(result[0].Name).toBe('Party Down');
		});

		test('auto-detects TV items and collapses when collectionType is null', () => {
			const items = [
				{Id: 's1', Type: 'Season', Name: 'Season 1', SeriesId: 'show-1', SeriesName: 'Party Down'}
			];

			const result = normalizeLatestMediaItems(items);
			expect(result[0].Type).toBe('Series');
			expect(result[0].Name).toBe('Party Down');
		});

		test('does not collapse movie items', () => {
			const items = [
				{Id: 'm1', Type: 'Movie', Name: 'The Matrix'}
			];

			const result = normalizeLatestMediaItems(items, {collectionType: 'movies'});
			expect(result[0].Type).toBe('Movie');
			expect(result[0].Name).toBe('The Matrix');
		});

		test('respects limit argument', () => {
			const items = [
				{Id: 'm1', Type: 'Movie', Name: 'Movie 1'},
				{Id: 'm2', Type: 'Movie', Name: 'Movie 2'},
				{Id: 'm3', Type: 'Movie', Name: 'Movie 3'}
			];

			const result = normalizeLatestMediaItems(items, {collectionType: 'movies', limit: 2});
			expect(result).toHaveLength(2);
		});
	});
});
