import {buildLoaderContext, loadDeferredSections, loadSinceYouWatched, withStudioLogos} from './browseRowLoaders';
import {makePickedRow} from '../../utils/pickedRows';
import {loadSinceYouWatchedRows} from '../../services/homeRecommendations';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/jellyfinApi', () => ({HOME_ROW_ITEM_FIELDS: 'Fields', createApiForServer: jest.fn(), getServerType: () => 'jellyfin', getTokenParam: () => 'ApiKey', getApiKey: () => 'tok'}));
jest.mock('../../services/multiServerManager', () => ({getAllServersArray: async () => []}));
jest.mock('../../services/homeRecommendations', () => ({loadSinceYouWatchedRows: jest.fn(), loadRewatchItems: jest.fn()}));

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
