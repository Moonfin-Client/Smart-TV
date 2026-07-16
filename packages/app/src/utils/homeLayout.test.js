import {
	DEFAULT_HOME_ROWS,
	TV_TO_SERVER_ROW,
	__resetHomeLayoutPassthrough,
	hasSeenServerLayout,
	homeRowsFromProfile,
	homeRowsFromRowOrder,
	homeRowsFromSections,
	homeRowsToRowOrder,
	homeRowsToSections
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
