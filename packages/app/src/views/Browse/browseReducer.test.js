import browseReducer, {browseInitialState, mergeRowsById, replaceRecentRows} from './browseReducer';

const row = (id, items = []) => ({id, items});

describe('mergeRowsById', () => {
	test('an incoming row keeps the position of the one it replaces', () => {
		const merged = mergeRowsById([row('a'), row('b'), row('c')], [row('b', [1])]);

		expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
		expect(merged[1].items).toEqual([1]);
	});

	test('ids that are not already there go on the end', () => {
		const merged = mergeRowsById([row('a')], [row('b'), row('c')]);

		expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	test('rows it did not touch keep their identity', () => {
		const untouched = row('a');
		const merged = mergeRowsById([untouched, row('b')], [row('b', [1])]);

		expect(merged[0]).toBe(untouched);
	});
});

describe('replaceRecentRows', () => {
	const rows = [
		{id: 'resume'},
		{id: 'latest-a', isLatestRow: true},
		{id: 'released-a', isRecentlyReleasedRow: true},
		{id: 'latest-b', isLatestRow: true},
		{id: 'genres'}
	];

	test('puts the new rows where the old ones were', () => {
		expect(replaceRecentRows(rows, [{id: 'latest-a', fresh: true}]).map((r) => r.id)).toEqual(['resume', 'latest-a', 'genres']);
	});

	// A library whose Recently Added emptied has no row coming back to merge over the old one.
	test('drops a row the server no longer fills', () => {
		expect(replaceRecentRows(rows, []).map((r) => r.id)).toEqual(['resume', 'genres']);
	});

	test('adds them at the end when there were none', () => {
		expect(replaceRecentRows([{id: 'resume'}], [{id: 'latest-a'}]).map((r) => r.id)).toEqual(['resume', 'latest-a']);
	});
});

describe('browseReducer', () => {
	test('drops repeated ids and rows with no id at all', () => {
		const next = browseReducer(browseInitialState, {
			type: 'SET_INITIAL_DATA',
			rowData: [row('a'), row('b'), row('a'), null, {items: []}]
		});

		expect(next.allRowData.map((r) => r.id)).toEqual(['a', 'b']);
		expect(next.isLoading).toBe(false);
	});

	test('an empty append leaves the state alone', () => {
		const state = {...browseInitialState, allRowData: [row('a')]};

		expect(browseReducer(state, {type: 'APPEND_ROWS', rows: []})).toBe(state);
	});

	// This one fires on a timer whether or not anything moved.
	test('a volatile refresh that changed nothing returns the same state', () => {
		const resume = row('resume', [{Id: '1', UserData: {PlayedPercentage: 10}}]);
		const state = {...browseInitialState, allRowData: [resume]};

		const next = browseReducer(state, {
			type: 'REFRESH_VOLATILE',
			volatileRows: [row('resume', [{Id: '1', UserData: {PlayedPercentage: 10}}])]
		});

		expect(next).toBe(state);
	});

	test('a volatile refresh that did change something replaces the row', () => {
		const state = {...browseInitialState, allRowData: [row('resume', [{Id: '1'}]), row('other')]};

		const next = browseReducer(state, {
			type: 'REFRESH_VOLATILE',
			volatileRows: [row('resume', [{Id: '2'}])]
		});

		expect(next).not.toBe(state);
		expect(next.allRowData[0].items[0].Id).toBe('2');
		expect(next.allRowData.map((r) => r.id)).toEqual(['resume', 'other']);
	});

	test('setting a value it already holds returns the same state', () => {
		const state = {...browseInitialState, isLoading: true, browseMode: 'featured'};

		expect(browseReducer(state, {type: 'SET_LOADING', value: true})).toBe(state);
		expect(browseReducer(state, {type: 'SET_BROWSE_MODE', mode: 'featured'})).toBe(state);
		expect(browseReducer(state, {type: 'SET_LOADING', value: false})).not.toBe(state);
	});

	test('an action it does not know leaves the state alone', () => {
		expect(browseReducer(browseInitialState, {type: 'NOPE'})).toBe(browseInitialState);
	});
});

describe('pending sections', () => {
	test('a loader finishing clears only the sections it answers for', () => {
		const pending = browseReducer(browseInitialState, {type: 'SET_PENDING_SECTIONS', sections: ['collections', 'genres', 'rewatch']});
		const next = browseReducer(pending, {type: 'SECTIONS_DONE', sections: ['genres', 'rewatch']});

		expect(next.pendingSections).toEqual(['collections']);
	});

	test('nothing changes when there is nothing to clear', () => {
		const pending = browseReducer(browseInitialState, {type: 'SET_PENDING_SECTIONS', sections: ['collections']});

		expect(browseReducer(pending, {type: 'SECTIONS_DONE', sections: ['genres']})).toBe(pending);
		expect(browseReducer(browseInitialState, {type: 'SET_PENDING_SECTIONS', sections: []})).toBe(browseInitialState);
	});
});
