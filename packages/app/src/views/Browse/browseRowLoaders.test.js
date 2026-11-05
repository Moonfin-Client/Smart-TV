import {buildLoaderContext, loadDeferredSections, loadSinceYouWatched} from './browseRowLoaders';
import {makePickedRow} from '../../utils/pickedRows';
import {loadSinceYouWatchedRows} from '../../services/homeRecommendations';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/jellyfinApi', () => ({HOME_ROW_ITEM_FIELDS: 'Fields', createApiForServer: jest.fn(), getServerType: () => 'jellyfin'}));
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
