import browseReducer, {browseInitialState} from './browseReducer';
import {ROW_MAX_ITEMS, extendRow, headLengthFor, moreAfter, nearRowEnd, nextHeadLength, pageableRow, readFoldedHead, withRowPage} from './rowPaging';

const cards = (from, to) => Array.from({length: to - from}, (_, i) => ({Id: `i${from + i}`}));

describe('row paging', () => {
	it('trusts the server count, and takes a full read as more without one', () => {
		expect(moreAfter({Items: cards(0, 20), TotalRecordCount: 45}, 20)).toBe(true);
		expect(moreAfter({Items: cards(0, 12), TotalRecordCount: 12}, 20)).toBe(false);
		expect(moreAfter({Items: cards(0, 20)}, 20)).toBe(true);
		expect(moreAfter({Items: cards(0, 7)}, 20)).toBe(false);
	});

	it('lets a read that cannot count say so, and stops at the cap', () => {
		expect(moreAfter({Items: cards(0, 9), hasMore: true}, 16)).toBe(true);
		expect(moreAfter({Items: cards(0, 100), TotalRecordCount: 400}, ROW_MAX_ITEMS)).toBe(false);
	});

	it('asks for a page more each time, up to the cap', () => {
		expect(nextHeadLength({items: cards(0, 20)})).toBe(35);
		expect(nextHeadLength({items: cards(0, 95)})).toBe(ROW_MAX_ITEMS);
	});

	it('adds only the cards the row lacks, keeping the ones drawn', () => {
		const row = {id: 'collections', items: cards(0, 3), hasMore: true};
		const longer = extendRow(row, [...cards(0, 3).map((card) => ({...card})), ...cards(3, 5)], true);
		expect(longer.items.map((card) => card.Id)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
		expect(longer.items[0]).toBe(row.items[0]);
		expect(longer.hasMore).toBe(true);
	});

	it('marks where the paged cards begin and keeps that mark on later pages', () => {
		const once = extendRow({id: 'resume', items: cards(0, 3), hasMore: true}, cards(0, 5), true);
		expect(once.pagedFrom).toBe(3);
		expect(extendRow(once, cards(0, 7), true).pagedFrom).toBe(3);
	});

	it('ends a row whose next page brought nothing new', () => {
		const row = {id: 'latest-1', items: cards(0, 3), hasMore: true};
		expect(extendRow(row, cards(0, 3), true).hasMore).toBe(false);
	});

	it('asks for the next page from the last five cards on', () => {
		expect(nearRowEnd(10, 16)).toBe(false);
		expect(nearRowEnd(11, 16)).toBe(true);
		expect(nearRowEnd(-1, 3)).toBe(false);
	});

	it('adds a page only to the row it was read for', () => {
		const readHead = jest.fn();
		const rows = [{id: 'latest-1', items: cards(0, 2), readHead, hasMore: true}, {id: 'latest-1', items: cards(0, 2), readHead: jest.fn(), hasMore: true}];
		const next = withRowPage(rows, 'latest-1', readHead, cards(0, 4), true);
		expect(next[0].items).toHaveLength(4);
		expect(next[1]).toBe(rows[1]);
	});

	it('reads a refreshed row back as long as the one on screen', () => {
		expect(headLengthFor(null, 12)).toBe(12);
		expect(headLengthFor({items: cards(0, 42)}, 12)).toBe(42);
	});

	it('extends the row in place through the reducer', () => {
		const readHead = jest.fn();
		const row = pageableRow({id: 'resume', items: cards(0, 2)}, {Items: cards(0, 2), TotalRecordCount: 4}, 2, readHead);
		const state = {...browseInitialState, allRowData: [{id: 'nextup', items: []}, row]};
		const next = browseReducer(state, {type: 'EXTEND_ROW', id: 'resume', readHead, items: cards(0, 4), hasMore: false});
		expect(next.allRowData[0]).toBe(state.allRowData[0]);
		expect(next.allRowData[1].items).toHaveLength(4);
		expect(next.allRowData[1].readHead).toBe(readHead);
		expect(next.allRowData[1].hasMore).toBe(false);
		expect(browseReducer(state, {type: 'EXTEND_ROW', id: 'gone', items: [], hasMore: false})).toBe(state);
	});

	it('drops a page read for a row a reload has since replaced', () => {
		const row = pageableRow({id: 'collections', items: cards(0, 2)}, {Items: cards(0, 2)}, 2, jest.fn());
		const state = {...browseInitialState, allRowData: [row]};
		expect(browseReducer(state, {type: 'EXTEND_ROW', id: 'collections', readHead: jest.fn(), items: cards(0, 4), hasMore: true})).toBe(state);
	});

	it('stops a row at the cap even when a head brings more than a page', () => {
		const row = {id: 'latest-1', items: cards(0, 95), hasMore: true};
		const longer = extendRow(row, cards(0, 110), true);
		expect(longer.items).toHaveLength(ROW_MAX_ITEMS);
		expect(longer.hasMore).toBe(false);
	});

	it('reads further when folding leaves a head short, until the list runs out', async () => {
		// 64 episodes of one show, then one film.
		const list = [...Array.from({length: 64}, (_, i) => ({Id: `e${i}`, show: 's'})), {Id: 'f', show: 'f'}];
		const fold = (items) => [...new Map(items.map((item) => [item.show, {Id: item.show}])).values()];
		const readRaw = jest.fn(async (size) => list.slice(0, size));
		const head = await readFoldedHead(readRaw, fold, 16, 32);
		expect(head.Items.map((card) => card.Id)).toEqual(['s', 'f']);
		expect(head.hasMore).toBe(false);
		expect(readRaw.mock.calls.map(([size]) => size)).toEqual([32, 64, 128]);
	});
});
