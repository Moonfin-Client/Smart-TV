import browseReducer, {browseInitialState} from './browseReducer';
import {ROW_MAX_ITEMS, extendRow, headLengthFor, moreAfter, nextHeadLength, pageableRow} from './rowPaging';

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

	it('ends a row whose next page brought nothing new', () => {
		const row = {id: 'latest-1', items: cards(0, 3), hasMore: true};
		expect(extendRow(row, cards(0, 3), true).hasMore).toBe(false);
	});

	it('reads a refreshed row back as long as the one on screen', () => {
		expect(headLengthFor(null, 12)).toBe(12);
		expect(headLengthFor({items: cards(0, 42)}, 12)).toBe(42);
	});

	it('extends the row in place through the reducer', () => {
		const readHead = jest.fn();
		const row = pageableRow({id: 'resume', items: cards(0, 2)}, {Items: cards(0, 2), TotalRecordCount: 4}, 2, readHead);
		const state = {...browseInitialState, allRowData: [{id: 'nextup', items: []}, row]};
		const next = browseReducer(state, {type: 'EXTEND_ROW', id: 'resume', items: cards(0, 4), hasMore: false});
		expect(next.allRowData[0]).toBe(state.allRowData[0]);
		expect(next.allRowData[1].items).toHaveLength(4);
		expect(next.allRowData[1].readHead).toBe(readHead);
		expect(next.allRowData[1].hasMore).toBe(false);
		expect(browseReducer(state, {type: 'EXTEND_ROW', id: 'gone', items: [], hasMore: false})).toBe(state);
	});
});
