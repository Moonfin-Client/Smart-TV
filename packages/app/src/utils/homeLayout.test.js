import {
	DEFAULT_HOME_ROWS,
	TV_TO_SERVER_ROW,
	__resetHomeLayoutPassthrough,
	hasSeenServerLayout,
	homeRowsFromProfile,
	homeRowsFromRowOrder,
	homeRowsFromSections,
	homeRowsToRowOrder,
	homeRowsToSections,
	mergeHomeRows,
	withSeasonalRow,
	withWatchingNowRow
} from './homeLayout';

const enabledIds = (rows) => rows.filter((row) => row.enabled).map((row) => row.id);
const rowById = (rows, id) => rows.find((row) => row.id === id);

beforeEach(() => {
	__resetHomeLayoutPassthrough();
});

describe('row id translation', () => {
	test('every mapped TV id round-trips through the server name', () => {
		Object.entries(TV_TO_SERVER_ROW).forEach(([tvId, serverId]) => {
			const rows = homeRowsFromRowOrder([serverId]);
			expect(enabledIds(rows)).toContain(tvId);
		});
	});

	test('Recently Added maps to the name the server actually uses', () => {
		// The server calls this row 'latestmedia'. A mismatch here doesn't error anywhere,
		// the row just quietly disappears.
		expect(TV_TO_SERVER_ROW['latest-media']).toBe('latestmedia');
		expect(enabledIds(homeRowsFromRowOrder(['latestmedia']))).toContain('latest-media');
	});

	test('every default row survives a trip to the server and back', () => {
		const allEnabled = DEFAULT_HOME_ROWS.map((row, order) => ({...row, enabled: true, order}));
		const restored = homeRowsFromSections(homeRowsToSections(allEnabled));
		expect(enabledIds(restored).sort()).toEqual(enabledIds(allEnabled).sort());
	});
});

describe('homeRowsFromSections', () => {
	const sections = [
		{kind: 'builtin', type: 'latestmedia', enabled: true, order: 1},
		{kind: 'builtin', type: 'resume', enabled: true, order: 0},
		{kind: 'builtin', type: 'genres', enabled: false, order: 2}
	];

	test('honours each row\'s own enabled flag', () => {
		const rows = homeRowsFromSections(sections);
		expect(rowById(rows, 'latest-media').enabled).toBe(true);
		expect(rowById(rows, 'resume').enabled).toBe(true);
		expect(rowById(rows, 'genres').enabled).toBe(false);
	});

	test('orders by the server order and renumbers densely', () => {
		const rows = homeRowsFromSections(sections);
		expect(rows[0].id).toBe('resume');
		expect(rows[1].id).toBe('latest-media');
		expect(rows.map((row) => row.order)).toEqual(rows.map((_, i) => i));
	});

	test('rows missing from the payload come back disabled, not absent', () => {
		const rows = homeRowsFromSections([{kind: 'builtin', type: 'resume', enabled: true, order: 0}]);
		expect(rows).toHaveLength(DEFAULT_HOME_ROWS.length);
		expect(rowById(rows, 'playlists').enabled).toBe(false);
	});

	test('ignores plugin and unknown rows rather than inventing builtins', () => {
		const rows = homeRowsFromSections([
			{kind: 'builtin', type: 'resume', enabled: true, order: 0},
			{kind: 'pluginDynamic', type: 'none', enabled: true, order: 1},
			{kind: 'builtin', type: 'not_a_real_row', enabled: true, order: 2}
		]);
		expect(enabledIds(rows)).toEqual(['resume']);
	});

	test('an empty or absent payload yields nothing so the caller can fall back', () => {
		expect(homeRowsFromSections([])).toBeUndefined();
		expect(homeRowsFromSections(undefined)).toBeUndefined();
		expect(homeRowsFromSections([{kind: 'pluginDynamic', type: 'none'}])).toBeUndefined();
	});
});

describe('homeRowsFromProfile', () => {
	test('prefers homeSections over homeRowOrder', () => {
		// homeSections says genres is off while homeRowOrder says it is on. The complete
		// view has to win, or a disabled row quietly comes back to life.
		const rows = homeRowsFromProfile({
			homeSections: [
				{kind: 'builtin', type: 'resume', enabled: true, order: 0},
				{kind: 'builtin', type: 'genres', enabled: false, order: 1}
			],
			homeRowOrder: ['resume', 'genres']
		});
		expect(rowById(rows, 'genres').enabled).toBe(false);
	});

	test('falls back to homeRowOrder when there are no sections', () => {
		const rows = homeRowsFromProfile({homeSections: null, homeRowOrder: ['resume', 'latestmedia']});
		expect(enabledIds(rows)).toEqual(['resume', 'latest-media']);
	});

	test('a profile with no layout yields nothing', () => {
		expect(homeRowsFromProfile({})).toBeUndefined();
		expect(homeRowsFromProfile(null)).toBeUndefined();
	});
});

describe('writing the layout back', () => {
	test('homeSections carries disabled rows; homeRowOrder carries only enabled ones', () => {
		const rows = homeRowsFromProfile({
			homeSections: [
				{kind: 'builtin', type: 'resume', enabled: true, order: 0},
				{kind: 'builtin', type: 'genres', enabled: false, order: 1}
			]
		});
		const sections = homeRowsToSections(rows);
		const order = homeRowsToRowOrder(rows);

		expect(sections.find((s) => s.type === 'genres').enabled).toBe(false);
		expect(order).not.toContain('genres');
		expect(order).toContain('resume');
	});

	test('plugin rows are handed back untouched', () => {
		// This client can't render them, but it mustn't delete them either. Writing a
		// layout without them would strip them from every other client on the account.
		const pluginRow = {
			kind: 'pluginDynamic',
			type: 'none',
			enabled: true,
			order: 9,
			pluginSource: 'collections',
			pluginSection: 'featured'
		};
		const rows = homeRowsFromProfile({
			homeSections: [{kind: 'builtin', type: 'resume', enabled: true, order: 0}, pluginRow]
		});
		expect(homeRowsToSections(rows)).toContainEqual(pluginRow);
	});

	test('a row type this client has none of its own for is handed back untouched', () => {
		// Rows another client renders and this one doesn't, arriving with no kind on them
		// the way the server sends them. Writing a layout without them deletes them from
		// the account.
		const mediabar = {type: 'mediabar', enabled: false, order: 64};
		const resumebook = {type: 'resumebook', enabled: true, order: 65};
		const rows = homeRowsFromProfile({
			homeSections: [{type: 'resume', enabled: true, order: 0}, mediabar, resumebook]
		});
		const written = homeRowsToSections(rows);
		expect(written).toContainEqual(mediabar);
		expect(written).toContainEqual(resumebook);
	});

	test('a layout read as homeRowOrder is written back as both views', () => {
		const rows = homeRowsFromProfile({homeRowOrder: ['resume']});
		expect(hasSeenServerLayout()).toBe(true);
		expect(homeRowsToSections(rows).length).toBeGreaterThan(0);
	});
});

describe('write suppression before the layout is known', () => {
	test('hasSeenServerLayout is false until a layout has been read', () => {
		// The caller uses this to decide whether to send a layout at all. Sending
		// homeRowOrder without homeSections makes the server throw away its stored
		// sections, so guessing is worse than staying quiet.
		expect(hasSeenServerLayout()).toBe(false);
	});

	test('reading any layout flips it', () => {
		homeRowsFromProfile({homeSections: [{kind: 'builtin', type: 'resume', enabled: true, order: 0}]});
		expect(hasSeenServerLayout()).toBe(true);
	});

	test('a profile without a layout leaves it unknown', () => {
		homeRowsFromProfile({});
		expect(hasSeenServerLayout()).toBe(false);
	});
});

describe('picked rows in the layout', () => {
	const picked = {
		kind: 'pluginDynamic',
		type: 'none',
		enabled: true,
		order: 1,
		serverId: 'http://server:8096/',
		pluginSource: 'collections',
		pluginSection: 'collection',
		pluginAdditionalData: 'c1',
		pluginDisplayText: 'Alien Collection'
	};
	const pickedId = 'pluginDynamic:collections:http://server:8096:collection:c1';

	test('a collection picked on another client becomes a row in its place, under the id that client gave it', () => {
		const rows = homeRowsFromProfile({
			homeSections: [{type: 'resume', enabled: true, order: 0}, picked, {type: 'nextup', enabled: true, order: 2}]
		});
		expect(enabledIds(rows)).toEqual(['resume', pickedId, 'nextup']);
		expect(rowById(rows, pickedId)).toMatchObject({name: 'Alien Collection', source: 'collections', serverUrl: 'http://server:8096', itemId: 'c1'});
	});

	test('it goes back the way the other clients write it, once, and stays out of the flat order', () => {
		const rows = homeRowsFromProfile({homeSections: [{type: 'resume', enabled: true, order: 0}, picked]});
		const sections = homeRowsToSections(rows);
		expect(sections).toContainEqual({...picked, serverId: 'http://server:8096'});
		expect(sections.filter((section) => section.kind === 'pluginDynamic')).toHaveLength(1);
		expect(homeRowsToRowOrder(rows)).toEqual(['resume']);
	});

	test('a pick with no item or server to load from is handed back untouched', () => {
		const loose = {...picked, serverId: ''};
		const rows = homeRowsFromProfile({homeSections: [{type: 'resume', enabled: true, order: 0}, loose]});
		expect(rows.some((row) => row.source)).toBe(false);
		expect(homeRowsToSections(rows)).toContainEqual(loose);
	});
});

describe('Seerr slider rows in the layout', () => {
	const slider = {
		kind: 'pluginDynamic',
		type: 'none',
		enabled: true,
		order: 1,
		serverId: 'http://server:8096/',
		pluginSource: 'seerr',
		pluginSection: '7',
		pluginAdditionalData: '18',
		pluginDisplayText: 'A24 Films'
	};
	const sliderId = 'pluginDynamic:seerr:http://server:8096:7:18';

	test('a slider put on Home by another client becomes a row under the id that client gave it, and goes back the same way', () => {
		const rows = homeRowsFromProfile({homeSections: [{type: 'resume', enabled: true, order: 0}, slider]});
		expect(rowById(rows, sliderId)).toMatchObject({name: 'A24 Films', source: 'seerr', sliderId: '7', sliderType: '18'});
		expect(homeRowsToSections(rows)).toContainEqual({...slider, serverId: 'http://server:8096'});
		expect(homeRowsToRowOrder(rows)).toEqual(['resume']);
	});
});

describe('the seasonal row in a saved layout', () => {
	test('a layout that lacks it gets it switched off unless its toggle says on', () => {
		const saved = [{id: 'resume', enabled: true, order: 0}];
		expect(rowById(mergeHomeRows(saved), 'seasonal').enabled).toBe(false);
		expect(rowById(mergeHomeRows(saved, {seasonal: true}), 'seasonal').enabled).toBe(true);
		expect(rowById(mergeHomeRows(saved, {mdblist_watching_now: true}), 'mdblist_watching_now').enabled).toBe(true);
	});

	test('a layout that names it keeps its own flag whatever the toggle says', () => {
		const saved = [{id: 'seasonal', enabled: false, order: 0}];
		expect(rowById(mergeHomeRows(saved, {seasonal: true}), 'seasonal').enabled).toBe(false);
	});

	test('a profile layout from a client that predates the row re-adds it from the toggle', () => {
		const rows = homeRowsFromProfile({homeSections: [{kind: 'builtin', type: 'resume', enabled: true, order: 0}]}, {seasonal: true});
		expect(rowById(rows, 'seasonal').enabled).toBe(true);
	});

	const layout = () => [
		{id: 'resume', enabled: true, order: 0},
		{id: 'nextup', enabled: true, order: 1},
		{id: 'latest-media', enabled: true, order: 2},
		{id: 'seasonal', enabled: false, order: 3}
	];

	test('switching it on puts it right after Continue Watching and Next Up', () => {
		const rows = withSeasonalRow(layout(), true);
		expect(rows.map((row) => row.id)).toEqual(['resume', 'nextup', 'seasonal', 'latest-media']);
		expect(rowById(rows, 'seasonal').enabled).toBe(true);
		expect(rows.map((row) => row.order)).toEqual([0, 1, 2, 3]);
	});

	test('switching it off leaves it where it is', () => {
		const rows = withSeasonalRow(withSeasonalRow(layout(), true), false);
		expect(rows.map((row) => row.id)).toEqual(['resume', 'nextup', 'seasonal', 'latest-media']);
		expect(rowById(rows, 'seasonal').enabled).toBe(false);
	});

	test('a layout without the row gets one when it is switched on', () => {
		const rows = withSeasonalRow([{id: 'resume', enabled: true, order: 0}], true);
		expect(rows.map((row) => row.id)).toEqual(['resume', 'seasonal']);
	});
});

describe('Silo home section rows in the layout', () => {
	const section = (pluginSection, serverId) => ({
		kind: 'pluginDynamic',
		type: 'none',
		enabled: true,
		order: 1,
		serverId,
		pluginSource: 'server',
		pluginSection,
		pluginDisplayText: 'Hidden gems'
	});

	test('a Silo section picked on another client comes back as it was written', () => {
		const written = section('12', 'http://silo:8090');
		const rows = homeRowsFromProfile({homeSections: [{type: 'resume', enabled: true, order: 0}, written]});
		expect(rowById(rows, 'pluginDynamic:server:http://silo:8090:server:12')).toMatchObject({source: 'server', itemId: '12', name: 'Hidden gems'});
		expect(homeRowsToSections(rows)).toContainEqual(written);
		expect(homeRowsToRowOrder(rows)).toEqual(['resume']);
	});

	test('a section-type row from Moonbase\'s defaults names no server and keeps none', () => {
		const written = section('type:hidden_gems', '');
		const rows = homeRowsFromProfile({homeSections: [written]});
		expect(rows.find((row) => row.source === 'server')).toMatchObject({serverUrl: '', itemId: 'type:hidden_gems'});
		expect(homeRowsToSections(rows)).toContainEqual({...written, order: 0});
	});
});

describe('withWatchingNowRow', () => {
	const layout = () => [
		{id: 'mdblist_watching_now', enabled: false, order: 0},
		{id: 'resume', enabled: true, order: 1},
		{id: 'latest-media', enabled: true, order: 2},
		{id: 'studios', enabled: false, order: 3}
	];

	test('switching it on moves it right after the last row that is on', () => {
		const rows = withWatchingNowRow(layout(), true);
		expect(rows.map((row) => row.id)).toEqual(['resume', 'latest-media', 'mdblist_watching_now', 'studios']);
		expect(rows.map((row) => row.order)).toEqual([0, 1, 2, 3]);
	});

	test('switching it off leaves it where it is', () => {
		const rows = withWatchingNowRow(withWatchingNowRow(layout(), true), false);
		expect(rows.map((row) => row.id)).toEqual(['resume', 'latest-media', 'mdblist_watching_now', 'studios']);
		expect(rows.find((row) => row.id === 'mdblist_watching_now').enabled).toBe(false);
	});
});
