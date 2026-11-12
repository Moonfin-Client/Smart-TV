import {buildLoaderContext, loadDeferredSections, loadGenres, loadLatestAndRecentlyReleased, loadSinceYouWatched, withStudioLogos} from './browseRowLoaders';
import {makePickedRow} from '../../utils/pickedRows';
import {loadSinceYouWatchedRows} from '../../services/homeRecommendations';
import {getServerType} from '../../services/jellyfinApi';
import {getRecentGames} from '../../services/gamesApi';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/jellyfinApi', () => ({HOME_ROW_ITEM_FIELDS: 'Fields', createApiForServer: jest.fn(), getServerType: jest.fn(() => 'jellyfin'), getTokenParam: () => 'ApiKey', getApiKey: () => 'tok'}));
jest.mock('../../services/multiServerManager', () => ({getAllServersArray: async () => []}));
jest.mock('../../services/homeRecommendations', () => ({loadSinceYouWatchedRows: jest.fn(), loadRewatchItems: jest.fn()}));
jest.mock('../../services/gamesApi', () => ({getRecentGames: jest.fn()}));
jest.mock('../../utils/gameLibrary', () => ({
	refreshGameLibraries: async () => {},
	isGameLibrary: (id) => id === 'games',
	resolveGameLibraryId: (lib) => `plugin-${lib.Id}`
}));

const SERVER = 'http://server';
const genreRow = (i) => makePickedRow({source: 'genres', serverUrl: SERVER, itemId: `g${i}`, name: `Genre ${i}`}, true, i);
const settings = {displayGenresRows: true};

const contextFor = (homeRowsConfig, extra) => buildLoaderContext({
	api: {getItems: jest.fn(async ({GenreIds}) => ({Items: GenreIds === 'g9' ? [] : [{Id: `item-${GenreIds}`}]}))},
	serverUrl: SERVER,
	settings,
	homeRowsConfig,
	eligibleLibraries: [],
	appendRows: jest.fn(),
	...extra
});

describe('picked rows far down Home', () => {
	const layout = [{id: 'resume', enabled: true}, {id: 'nextup', enabled: false}, ...Array.from({length: 10}, (_, i) => genreRow(i))];

	test('wait unless they are among the first eight sections', () => {
		const ctx = contextFor(layout);
		expect(ctx.enabledPluginSections.map((row) => row.itemId)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
		expect(ctx.deferredPluginSections.map((row) => row.itemId)).toEqual(['g7', 'g8', 'g9']);
	});

	test('land one by one when asked for, and an empty one only reports done', async () => {
		const ctx = contextFor(layout);
		const done = jest.fn();
		await loadDeferredSections(ctx, ctx.deferredPluginSections, done);
		expect(ctx.appendRows.mock.calls.map(([rows]) => rows.map((row) => row.title))).toEqual([['Genre 7'], ['Genre 8']]);
		expect(done.mock.calls.map(([id]) => id)).toEqual(ctx.deferredPluginSections.map((row) => row.id));
	});

	test('carry the collection a picked collection row opens from its See All card', async () => {
		const collection = makePickedRow({source: 'collections', serverUrl: SERVER, itemId: 'c1', name: 'Heists'}, true, 0);
		const ctx = contextFor([collection, genreRow(0)]);
		await loadDeferredSections(ctx, [collection, genreRow(0)], () => {});
		const rows = ctx.appendRows.mock.calls.map(([[row]]) => row);
		expect(rows.find((row) => row.id === collection.id).collection).toEqual({Id: 'c1', Name: 'Heists', Type: 'BoxSet'});
		expect(rows.find((row) => row.id === genreRow(0).id).collection).toBeUndefined();
	});
});

describe('Silo home sections', () => {
	afterEach(() => getServerType.mockReturnValue('jellyfin'));

	test('land as rows, and page past the first read', async () => {
		getServerType.mockReturnValue('silo');
		const cards = Array.from({length: 50}, (_, i) => ({Id: `card-${i}`}));
		const getServerHomeSectionItems = jest.fn(async (id, limit) => ({Items: cards.slice(0, limit), TotalRecordCount: cards.length}));
		const row = makePickedRow({source: 'server', serverUrl: '', itemId: 'type:hidden_gems', name: 'Hidden gems'}, true, 0);
		const ctx = contextFor([row], {api: {getServerHomeSectionItems}});
		expect(ctx.enabledPluginSections).toEqual([row]);
		await loadDeferredSections(ctx, ctx.enabledPluginSections, jest.fn());

		const [[[landed]]] = ctx.appendRows.mock.calls;
		expect(landed.title).toBe('Hidden gems');
		expect(getServerHomeSectionItems).toHaveBeenCalledWith('type:hidden_gems', 40);
		expect(landed.items).toHaveLength(40);
		expect(landed.hasMore).toBe(true);
		expect((await landed.readHead(55)).Items).toHaveLength(50);
		expect(getServerHomeSectionItems).toHaveBeenLastCalledWith('type:hidden_gems', 55);
	});
});

describe('loadSinceYouWatched', () => {
	test('reads the Seerr state when it runs and drops rows the state moved past', async () => {
		let state = {seerrEnabled: true, seerrAuthenticated: false};
		const ctx = contextFor([{id: 'sinceyouwatched1', enabled: true}], {recommendations: () => state});
		loadSinceYouWatchedRows.mockImplementationOnce(async () => {
			state = {seerrEnabled: true, seerrAuthenticated: true};
			return [{id: 'sinceyouwatched1', seedName: 'Old', items: []}];
		});
		await loadSinceYouWatched(ctx);
		expect(ctx.appendRows).not.toHaveBeenCalled();

		loadSinceYouWatchedRows.mockResolvedValueOnce([{id: 'sinceyouwatched1', seedName: 'Heat', items: [], isSeerr: true}]);
		await loadSinceYouWatched(ctx);
		expect(loadSinceYouWatchedRows.mock.calls[1][3]).toBe(true);
		expect(ctx.appendRows).toHaveBeenCalledWith([expect.objectContaining({title: 'Since you watched Heat', isOnlineRecoRow: true})]);
	});
});

describe('withStudioLogos', () => {
	const logoList = {success: true, companies: [
		{id: 25, name: '20th Century Fox', hasLogo: true},
		{id: -49, name: 'HBO', hasLogo: true},
		{id: 7, name: 'No Logo Films', hasLogo: false}
	]};

	test('gives a studio the logo whose name matches, whatever its case or spacing', () => {
		const [fox, indie] = withStudioLogos([{Id: 'a', Name: '20th century FOX '}, {Id: 'b', Name: 'No Logo Films'}], logoList, SERVER, 'tok');
		expect(fox._studioLogoUrl).toBe(`${SERVER}/Moonfin/Tmdb/StudioImage/25?ApiKey=tok`);
		expect(indie._studioLogoUrl).toBeUndefined();
	});

	test('uses the image the plugin links on TMDB when it gives one', () => {
		const white = 'https://image.tmdb.org/t/p/w500_filter(duotone,ffffff,bababa)/hbo.png';
		const list = {success: true, companies: [{id: -49, name: 'HBO', hasLogo: true, logoUrl: white}]};
		const [hbo] = withStudioLogos([{Id: 'a', Name: 'HBO'}], list, SERVER, 'tok');
		expect(hbo._studioLogoUrl).toBe(white);
	});

	test('leaves a near miss alone rather than guess', () => {
		const [studio] = withStudioLogos([{Id: 'a', Name: '20th Century Fox Animation'}], logoList, SERVER, 'tok');
		expect(studio._studioLogoUrl).toBeUndefined();
	});

	test('hands the studios back untouched when the plugin has no list', () => {
		const studios = [{Id: 'a', Name: 'HBO'}];
		expect(withStudioLogos(studios, null, SERVER, 'tok')).toBe(studios);
	});
});

describe('loadGenres', () => {
	const genres = ['Action', 'War', 'Drama'].map((Name) => ({Id: Name, Name}));
	const loadWith = async (genresRowSortOrder) => {
		const ctx = buildLoaderContext({
			api: {getGenres: jest.fn(async () => ({Items: genres})), getItems: jest.fn(async () => ({Items: []}))},
			serverUrl: SERVER,
			settings: {displayGenresRows: true, genresRowSortBy: 'SortName', genresRowSortOrder},
			homeRowsConfig: [{id: 'genres', enabled: true}],
			eligibleLibraries: [],
			appendRows: jest.fn()
		});
		await loadGenres(ctx);
		expect(ctx.api.getGenres).toHaveBeenCalledWith(undefined, 'Movie,Series', 'SortName', genresRowSortOrder === 'Descending' ? 'Descending' : 'Ascending');
		return ctx.appendRows.mock.calls[0][0][0].items.map((genre) => genre.Name);
	};

	test('keeps a name sort in the chosen order', async () => {
		expect(await loadWith('Descending')).toEqual(['War', 'Drama', 'Action']);
		expect(await loadWith('Ascending')).toEqual(['Action', 'Drama', 'War']);
		expect(await loadWith('auto')).toEqual(['Action', 'Drama', 'War']);
	});
});

describe('Recently Added with watched titles hidden', () => {
	const lib = {Id: 'films', Name: 'Films', CollectionType: 'movies'};
	const movies = Array.from({length: 200}, (_, i) => ({Id: `m${i}`, Type: 'Movie', UserData: {Played: i < 150}}));
	const load = async (settingsFor) => {
		const getLatest = jest.fn(async (id, limit) => movies.slice(0, limit));
		const getRecentlyReleased = jest.fn(async () => ({Items: []}));
		const appendRows = jest.fn();
		await loadLatestAndRecentlyReleased({api: {getLatest, getRecentlyReleased}, appendRows, eligibleLibraries: [lib], settings: settingsFor});
		return {getLatest, getRecentlyReleased, rows: appendRows.mock.calls[0]?.[0] || []};
	};

	test('a full read that leaves the row short is read again further', async () => {
		const {getLatest, getRecentlyReleased, rows} = await load({hideWatchedInRecentRows: true});
		expect(getLatest.mock.calls.map(([, limit]) => limit)).toEqual([64, 500]);
		expect(getRecentlyReleased).toHaveBeenCalledWith('films', 16, 'Movie,Series', true);
		expect(rows[0].items.map((item) => item.Id)).toEqual(Array.from({length: 16}, (_, i) => `m${150 + i}`));
	});

	test('with nothing hidden the library is read once, as before', async () => {
		const {getLatest, rows} = await load({});
		expect(getLatest.mock.calls.map(([, limit]) => limit)).toEqual([16]);
		expect(rows[0].items[0].Id).toBe('m0');
	});
});

describe('a game library\'s recent rows', () => {
	const games = {Id: 'games', Name: 'Games', CollectionType: null};
	const films = {Id: 'films', Name: 'Films', CollectionType: 'movies'};
	const load = async (extra = {}) => {
		getRecentGames.mockImplementation(async (id, released) => (released
			? [{id: 'old', title: 'Old', system: 'NES', year: 1985}]
			: [{id: 'wide', title: 'Wide', system: 'SNES', boxart: {width: 512, height: 357}}, {id: 'plain', title: 'Plain', system: 'GBA'}]));
		const getLatest = jest.fn(async () => [{Id: 'm1', Type: 'Movie'}]);
		const getRecentlyReleased = jest.fn(async () => ({Items: [{Id: 'm2', Type: 'Movie'}]}));
		const appendRows = jest.fn();
		await loadLatestAndRecentlyReleased({api: {getLatest, getRecentlyReleased}, appendRows, eligibleLibraries: [games, films], settings: extra});
		return {getLatest, rows: appendRows.mock.calls[0]?.[0] || []};
	};

	test('come from Moonbase as game cards, in library order', async () => {
		const {getLatest, rows} = await load();
		expect(getLatest.mock.calls.map(([id]) => id)).toEqual(['films']);
		expect(getRecentGames.mock.calls).toEqual([['plugin-games', false], ['plugin-games', true]]);
		expect(rows.map((row) => row.id)).toEqual(['latest-games', 'latest-films', 'recently-released-games', 'recently-released-films']);
		const [added] = rows;
		expect(added).toMatchObject({type: 'game', isGameRow: true, isLatestRow: true, library: games});
		expect(added.items.map((item) => [item.Id, item.isGame, item._library.Id])).toEqual([['wide', true, 'plugin-games'], ['plain', true, 'plugin-games']]);
		expect(added.items[0]._aspect).toBeCloseTo(1.434, 3);
		expect(added.items[1]._aspect).toBeNull();
		expect(added.items[0]).toMatchObject({Name: 'Wide', title: 'Wide'});
		expect(rows[2]).toMatchObject({isRecentlyReleasedRow: true, isLatestRow: false});
	});

	test('stay out of merged rows', async () => {
		const {rows} = await load({mergeRecentRowsByType: true});
		expect(rows.filter((row) => row.isGameRow).map((row) => row.id)).toEqual(['latest-games', 'recently-released-games']);
		expect(rows.filter((row) => !row.isGameRow).every((row) => row.items.every((item) => !item.isGame))).toBe(true);
	});
});
