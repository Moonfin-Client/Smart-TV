import {
	DETAIL_METADATA,
	DETAIL_METADATA_ORDER_KEY,
	DETAIL_METADATA_HIDDEN_KEY,
	ordered,
	arrange,
	hiddenSet,
	withUnknownIds
} from './detailMetadataLayout';

describe('detailMetadataLayout', () => {
	it('defines storage keys that match Moonfin-Core and Moonbase', () => {
		expect(DETAIL_METADATA_ORDER_KEY).toBe('detailMetadataOrderTv');
		expect(DETAIL_METADATA_HIDDEN_KEY).toBe('hiddenDetailMetadataTv');
	});

	it('includes all 7 metadata entries with subtitles on status, upcoming, and seerr', () => {
		const ids = DETAIL_METADATA.map((m) => m.id);
		expect(ids).toEqual([
			'year',
			'parentalRating',
			'runtimeAndSeasons',
			'status',
			'upcomingEpisodeDate',
			'genres',
			'seerrAvailability'
		]);

		const statusItem = DETAIL_METADATA.find((m) => m.id === 'status');
		const upcomingItem = DETAIL_METADATA.find((m) => m.id === 'upcomingEpisodeDate');
		const seerrItem = DETAIL_METADATA.find((m) => m.id === 'seerrAvailability');

		expect(statusItem.subtitle).toBeTruthy();
		expect(upcomingItem.subtitle).toBeTruthy();
		expect(seerrItem.subtitle).toBeTruthy();
	});

	it('arranges metadata according to stored order and hidden items', () => {
		const arranged = arrange(DETAIL_METADATA, {
			order: ['upcomingEpisodeDate', 'year', 'genres'],
			hidden: ['parentalRating', 'status']
		});

		const arrangedIds = arranged.map((m) => m.id);
		expect(arrangedIds[0]).toBe('upcomingEpisodeDate');
		expect(arrangedIds).toContain('year');
		expect(arrangedIds).not.toContain('parentalRating');
		expect(arrangedIds).not.toContain('status');
	});

	it('extracts hiddenSet and orders items', () => {
		const set = hiddenSet(['year', 'status']);
		expect(set.has('year')).toBe(true);
		expect(set.has('genres')).toBe(false);

		const sampleCatalogue = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
		const ord = ordered(sampleCatalogue, ['c', 'a', 'b']);
		expect(ord.map((i) => i.id)).toEqual(['c', 'a', 'b']);
	});

	it('preserves unknown IDs across clients when saving', () => {
		const catalogue = [{id: 'year'}, {id: 'genres'}];
		const stored = {
			order: ['mobileOnlyItem', 'year', 'desktopOnlyItem', 'genres'],
			hidden: ['mobileHiddenItem']
		};
		const saved = {
			order: ['genres', 'year'],
			hidden: ['year']
		};

		const merged = withUnknownIds(catalogue, saved, stored);
		expect(merged.order).toContain('mobileOnlyItem');
		expect(merged.order).toContain('desktopOnlyItem');
		expect(merged.hidden).toContain('mobileHiddenItem');
		expect(merged.hidden).toContain('year');
	});
});
