import {
	providerId,
	resolveCollectionTmdbId,
	makeMissingCollectionItem,
	fetchMissingCollectionItems,
	mergeCollectionWithMissing,
	mergeMissingByReleaseOrder
} from './seerrMissingCollectionItems';
import seerrApi from '../../services/seerrApi';

jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {
		getCollection: jest.fn(),
		getMovie: jest.fn(),
		getImageUrl: (path, size) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)
	}
}));

describe('seerrMissingCollectionItems', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('providerId', () => {
		test('extracts provider ID case-insensitively', () => {
			const item = {ProviderIds: {TmDb: '12345', TmdbCollection: '6789'}};
			expect(providerId(item, 'tmdb')).toBe('12345');
			expect(providerId(item, 'TMDBCOLLECTION')).toBe('6789');
			expect(providerId(item, 'imdb')).toBe('');
		});

		test('handles missing or empty ProviderIds', () => {
			expect(providerId(null, 'tmdb')).toBe('');
			expect(providerId({}, 'tmdb')).toBe('');
			expect(providerId({ProviderIds: null}, 'tmdb')).toBe('');
		});
	});

	describe('resolveCollectionTmdbId', () => {
		test('finds TMDB collection id on the boxSet itself', async () => {
			const boxSet = {Id: 'b1', ProviderIds: {Tmdb: '999'}};
			const id = await resolveCollectionTmdbId(boxSet, []);
			expect(id).toBe(999);
		});

		test('finds TMDB collection id on member TmdbCollection provider id', async () => {
			const boxSet = {Id: 'b1'};
			const members = [
				{Id: 'm1', Name: 'Movie 1', ProviderIds: {Tmdb: '101'}},
				{Id: 'm2', Name: 'Movie 2', ProviderIds: {Tmdb: '102', TmdbCollection: '888'}}
			];
			const id = await resolveCollectionTmdbId(boxSet, members);
			expect(id).toBe(888);
		});

		test('probes member movie on Seerr if not in provider IDs', async () => {
			const boxSet = {Id: 'b1'};
			const members = [
				{Id: 'm1', Name: 'Movie 1', Type: 'Movie', ProviderIds: {Tmdb: '101'}}
			];
			seerrApi.getMovie.mockResolvedValueOnce({id: 101, collection: {id: 777, name: 'Test Franchise'}});

			const id = await resolveCollectionTmdbId(boxSet, members);
			expect(id).toBe(777);
			expect(seerrApi.getMovie).toHaveBeenCalledWith(101);
		});
	});

	describe('makeMissingCollectionItem', () => {
		test('creates well-formed synthetic missing item', () => {
			const part = {
				id: 555,
				title: 'Critters Attack!',
				release_date: '2019-07-13',
				overview: 'Follows 20-year-old Drea...',
				poster_path: '/critters.jpg',
				backdrop_path: '/critters-bg.jpg'
			};
			const item = makeMissingCollectionItem(part);
			expect(item.Id).toBe('seerr-movie-555');
			expect(item.Name).toBe('Critters Attack!');
			expect(item.Type).toBe('Movie');
			expect(item.ProductionYear).toBe(2019);
			expect(item.PremiereDate).toBe('2019-07-13');
			expect(item._seerrMissing).toBe(true);
			expect(item._seerr).toBe(true);
			expect(item._seerrMediaId).toBe(555);
			expect(item._seerrMediaType).toBe('movie');
			expect(item._seerrRaw).toEqual({mediaId: 555, mediaType: 'movie'});
			expect(item._externalPosterUrl).toContain('/critters.jpg');
		});
	});

	describe('fetchMissingCollectionItems', () => {
		const boxSet = {Id: 'b1', ProviderIds: {Tmdb: '1000'}};
		const members = [
			{Id: 'm1', Name: 'Critters', Type: 'Movie', ProviderIds: {Tmdb: '1001'}, ProductionYear: 1986},
			{Id: 'm2', Name: 'Critters 2', Type: 'Movie', ProviderIds: {Tmdb: '1002'}, ProductionYear: 1988}
		];
		const seerrCollectionResponse = {
			id: 1000,
			name: 'Critters Collection',
			parts: [
				{id: 1001, title: 'Critters', releaseDate: '1986-04-11'},
				{id: 1002, title: 'Critters 2', releaseDate: '1988-04-29'},
				{id: 1003, title: 'Critters 3', releaseDate: '1991-12-11'},
				{id: 1004, title: 'Critters 4', releaseDate: '1992-10-14'},
				{id: 1005, title: 'Critters Attack!', releaseDate: '2019-07-13'}
			]
		};

		test('returns empty when setting is disabled', async () => {
			const items = await fetchMissingCollectionItems({
				boxSet,
				members,
				settings: {seerrShowMissingCollectionItems: false}
			});
			expect(items).toEqual([]);
			expect(seerrApi.getCollection).not.toHaveBeenCalled();
		});

		test('fetches collection from Seerr and returns only missing items', async () => {
			seerrApi.getCollection.mockResolvedValueOnce(seerrCollectionResponse);

			const items = await fetchMissingCollectionItems({
				boxSet,
				members,
				settings: {seerrShowMissingCollectionItems: true}
			});

			expect(items).toHaveLength(3);
			expect(items.map((i) => i.Name)).toEqual(['Critters 3', 'Critters 4', 'Critters Attack!']);
			expect(items.every((i) => i._seerrMissing)).toBe(true);
		});

		test('guards against franchise adoption when overlap is insufficient', async () => {
			seerrApi.getCollection.mockResolvedValueOnce(seerrCollectionResponse);
			const unrelatedMembers = [
				{Id: 'u1', Name: 'The Matrix', Type: 'Movie', ProviderIds: {Tmdb: '603'}},
				{Id: 'u2', Name: 'Inception', Type: 'Movie', ProviderIds: {Tmdb: '27205'}},
				{Id: 'u3', Name: 'Critters', Type: 'Movie', ProviderIds: {Tmdb: '1001'}}
			];

			const items = await fetchMissingCollectionItems({
				boxSet: {Id: 'custom', ProviderIds: {Tmdb: '1000'}},
				members: unrelatedMembers,
				settings: {seerrShowMissingCollectionItems: true}
			});

			expect(items).toEqual([]);
		});

		// A set holding no movies had only its own movie count to beat, and nothing
		// beats nothing, so it took the whole franchise.
		test('nothing matching is never enough, whatever the set holds', async () => {
			seerrApi.getCollection.mockResolvedValue(seerrCollectionResponse);
			const seriesOnly = [
				{Id: 's1', Name: 'Some Show', Type: 'Series', ProviderIds: {Tmdb: '9001'}},
				{Id: 's2', Name: 'Another Show', Type: 'Series', ProviderIds: {Tmdb: '9002'}}
			];

			expect(await fetchMissingCollectionItems({
				boxSet: {Id: 'shows', ProviderIds: {Tmdb: '1000'}},
				members: seriesOnly,
				settings: {seerrShowMissingCollectionItems: true}
			})).toEqual([]);
		});

		test('one match carries a single film set, and two are needed past that', async () => {
			seerrApi.getCollection.mockResolvedValue(seerrCollectionResponse);
			const oneFilm = [{Id: 'm1', Name: 'Critters', Type: 'Movie', ProviderIds: {Tmdb: '1001'}}];

			const items = await fetchMissingCollectionItems({
				boxSet: {Id: 'single', ProviderIds: {Tmdb: '1000'}},
				members: oneFilm,
				settings: {seerrShowMissingCollectionItems: true}
			});

			expect(items.length).toBeGreaterThan(0);
		});
	});

	describe('mergeCollectionWithMissing', () => {
		test('merges and sorts chronological order by release date', () => {
			const members = [
				{Id: 'm1', Name: 'Critters', PremiereDate: '1986-04-11', ProductionYear: 1986},
				{Id: 'm4', Name: 'Critters 4', PremiereDate: '1992-10-14', ProductionYear: 1992}
			];
			const missing = [
				{Id: 'seerr-movie-1002', Name: 'Critters 2', PremiereDate: '1988-04-29', ProductionYear: 1988, _seerrMissing: true},
				{Id: 'seerr-movie-1005', Name: 'Critters Attack!', PremiereDate: '2019-07-13', ProductionYear: 2019, _seerrMissing: true}
			];

			const merged = mergeCollectionWithMissing(members, missing);
			expect(merged.map((m) => m.Name)).toEqual([
				'Critters',
				'Critters 2',
				'Critters 4',
				'Critters Attack!'
			]);
		});

		test('returns original members if missing array is empty', () => {
			const members = [{Id: 'm1', Name: 'Solo'}];
			expect(mergeCollectionWithMissing(members, [])).toBe(members);
		});
	});
});

describe('mergeMissingByReleaseOrder', () => {
	const item = (Name, PremiereDate, ProductionYear) => ({Name, PremiereDate, ProductionYear});

	it('leaves the library list alone when nothing is missing', () => {
		const library = [item('B', '1990-01-01'), item('A', '1980-01-01')];
		expect(mergeMissingByReleaseOrder(library, [])).toBe(library);
	});

	it('slots a missing title in front of the first one released after it', () => {
		const library = [item('First', '1980-01-01'), item('Third', '2000-01-01')];
		const merged = mergeMissingByReleaseOrder(library, [item('Second', '1990-01-01')]);
		expect(merged.map((i) => i.Name)).toEqual(['First', 'Second', 'Third']);
	});

	it('slots ahead of the first later title without re-sorting the rest', () => {
		const library = [item('Later', '2000-01-01'), item('Earlier', '1980-01-01')];
		const merged = mergeMissingByReleaseOrder(library, [item('Missing', '1990-01-01')]);
		expect(merged.map((i) => i.Name)).toEqual(['Missing', 'Later', 'Earlier']);
	});

	it('puts a missing title with no date at the end', () => {
		const merged = mergeMissingByReleaseOrder([item('A', '1980-01-01')], [item('Undated')]);
		expect(merged.map((i) => i.Name)).toEqual(['A', 'Undated']);
	});

	it('falls back to the production year on either side', () => {
		const merged = mergeMissingByReleaseOrder([item('A', null, 1980), item('C', null, 2000)], [item('B', null, 1990)]);
		expect(merged.map((i) => i.Name)).toEqual(['A', 'B', 'C']);
	});

	it('appends when everything in the library came out earlier', () => {
		const merged = mergeMissingByReleaseOrder([item('A', '1980-01-01')], [item('B', '1990-01-01')]);
		expect(merged.map((i) => i.Name)).toEqual(['A', 'B']);
	});
});
