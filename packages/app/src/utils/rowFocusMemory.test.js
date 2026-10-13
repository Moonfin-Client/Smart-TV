import {focusedCardIndex, cardToRestore, focusedRowIndex, nextFocusableRow, rowToRestore, ROW_STILL_LOADING} from './rowFocusMemory';

const buildRow = (count, spotlightId = 'row-0') => {
	const row = document.createElement('div');
	row.setAttribute('data-spotlight-id', spotlightId);
	for (let i = 0; i < count; i++) {
		const card = document.createElement('div');
		card.className = 'spottable';
		row.appendChild(card);
	}
	document.body.appendChild(row);
	return row;
};

afterEach(() => {
	document.body.innerHTML = '';
});

describe('focusedCardIndex', () => {
	it('reports where the focused card sits', () => {
		const row = buildRow(4);
		expect(focusedCardIndex('row-0', row.children[2])).toBe(2);
	});

	it('counts every spottable in the row, so a See All tile shifts the cards along', () => {
		const row = buildRow(3);
		const seeAll = document.createElement('div');
		seeAll.className = 'spottable';
		row.insertBefore(seeAll, row.firstChild);
		expect(focusedCardIndex('row-0', seeAll)).toBe(0);
		expect(focusedCardIndex('row-0', row.children[1])).toBe(1);
	});

	it('reports -1 when focus is outside the row', () => {
		buildRow(3);
		const stray = document.createElement('div');
		stray.className = 'spottable';
		document.body.appendChild(stray);
		expect(focusedCardIndex('row-0', stray)).toBe(-1);
	});

	it('reports -1 for a row that is not there or nothing focused', () => {
		const row = buildRow(2);
		expect(focusedCardIndex('row-9', row.children[0])).toBe(-1);
		expect(focusedCardIndex('', row.children[0])).toBe(-1);
		expect(focusedCardIndex('row-0', null)).toBe(-1);
	});
});

describe('cardToRestore', () => {
	it('brings back the card that was left', () => {
		const row = buildRow(5);
		expect(cardToRestore('row-0', 3)).toBe(row.children[3]);
	});

	it('brings back the last card when the row lost items', () => {
		const row = buildRow(2);
		expect(cardToRestore('row-0', 7)).toBe(row.children[1]);
	});

	it('brings back the first card for index zero', () => {
		const row = buildRow(3);
		expect(cardToRestore('row-0', 0)).toBe(row.children[0]);
	});

	it('finds the row it is asked for', () => {
		buildRow(3, 'row-0');
		const second = buildRow(4, 'discover-row-2');
		expect(cardToRestore('discover-row-2', 1)).toBe(second.children[1]);
	});

	it('gives nothing for an empty row or an unusable index', () => {
		buildRow(3);
		expect(cardToRestore('row-0', -1)).toBeNull();
		expect(cardToRestore('row-0', NaN)).toBeNull();
		expect(cardToRestore('row-0', null)).toBeNull();
		expect(cardToRestore('row-0', undefined)).toBeNull();
		expect(cardToRestore('row-9', 1)).toBeNull();
	});

	it('gives nothing when the row has no cards', () => {
		buildRow(0, 'row-3');
		expect(cardToRestore('row-3', 0)).toBeNull();
	});
});

describe('focusedRowIndex', () => {
	const buildWrapped = (rowIndex) => {
		const wrap = document.createElement('div');
		wrap.setAttribute('data-row-index', String(rowIndex));
		const card = document.createElement('div');
		wrap.appendChild(card);
		document.body.appendChild(wrap);
		return card;
	};

	it('reports the row the focused card belongs to', () => {
		expect(focusedRowIndex(buildWrapped(4))).toBe(4);
	});

	it('reports zero for a card in the top row', () => {
		expect(focusedRowIndex(buildWrapped(0))).toBe(0);
	});

	// The navbar and the banner sit outside the rows, and back from either of them
	// should leave rather than pull the list about.
	it('counts anything outside the rows as the top', () => {
		const loose = document.createElement('div');
		document.body.appendChild(loose);
		expect(focusedRowIndex(loose)).toBe(0);
		expect(focusedRowIndex(null)).toBe(0);
		expect(focusedRowIndex(undefined)).toBe(0);
	});

	it('treats an unreadable row number as the top', () => {
		const wrap = document.createElement('div');
		wrap.setAttribute('data-row-index', 'nonsense');
		const card = document.createElement('div');
		wrap.appendChild(card);
		document.body.appendChild(wrap);
		expect(focusedRowIndex(card)).toBe(0);
	});
});

// What the whole thing is for: a screen that throws its rows away and builds them again
// still comes back to the card the user left, which is the part Spotlight cannot do.
describe('going back to a row that was rebuilt', () => {
	it('lands on the same card as before', () => {
		const before = buildRow(6, 'discover-row-1');
		const index = focusedCardIndex('discover-row-1', before.children[3]);

		document.body.innerHTML = '';
		const after = buildRow(6, 'discover-row-1');

		const card = cardToRestore('discover-row-1', index);
		expect(card).toBe(after.children[3]);
		expect(card).not.toBe(before.children[3]);
	});

	it('lands on the last card when the row came back shorter', () => {
		const before = buildRow(6, 'row-2');
		const index = focusedCardIndex('row-2', before.children[5]);

		document.body.innerHTML = '';
		const after = buildRow(3, 'row-2');

		expect(cardToRestore('row-2', index)).toBe(after.children[2]);
	});
});

const filled = (id) => ({id, items: [{Id: `${id}-1`}]});
const placeholder = (id) => ({id, items: [], isPlaceholder: true});

describe('nextFocusableRow', () => {
	const rows = [filled('resume'), placeholder('imdb-top250-movies'), filled('latest-tv'), placeholder('seasonal')];

	it('steps over a placeholder going down', () => {
		expect(nextFocusableRow(rows, 1, 1)).toBe(2);
	});

	it('steps over a placeholder going up', () => {
		expect(nextFocusableRow(rows, 1, -1)).toBe(0);
	});

	it('reports -1 past either end', () => {
		expect(nextFocusableRow(rows, 3, 1)).toBe(-1);
		expect(nextFocusableRow(rows, -1, -1)).toBe(-1);
		expect(nextFocusableRow(rows, 4, 1)).toBe(-1);
	});

	it('reports -1 when every row is still loading', () => {
		expect(nextFocusableRow([placeholder('a'), placeholder('b')], 0, 1)).toBe(-1);
	});
});

describe('rowToRestore', () => {
	it('finds the remembered row by its id after the rows were reordered', () => {
		const rows = [filled('resume'), filled('latest-tv'), filled('imdb-top250-movies')];
		expect(rowToRestore(rows, {rowId: 'imdb-top250-movies', rowIndex: 1, cardIndex: 4}))
			.toEqual({rowIndex: 2, cardIndex: 4});
	});

	it('waits while the remembered row is still a placeholder', () => {
		const rows = [filled('resume'), placeholder('imdb-top250-movies'), filled('latest-tv')];
		expect(rowToRestore(rows, {rowId: 'imdb-top250-movies', rowIndex: 1, cardIndex: 4})).toBe(ROW_STILL_LOADING);
	});

	it('falls back to the nearest row with cards above when the remembered row is gone', () => {
		const rows = [filled('resume'), filled('latest-tv'), placeholder('seasonal'), filled('latest-movies')];
		expect(rowToRestore(rows, {rowId: 'imdb-top250-movies', rowIndex: 2, cardIndex: 0}))
			.toEqual({rowIndex: 1, cardIndex: 0});
	});

	it('falls back to the nearest row below when nothing above has cards', () => {
		const rows = [placeholder('resume'), placeholder('nextup'), filled('latest-tv')];
		expect(rowToRestore(rows, {rowId: 'gone', rowIndex: 1, cardIndex: 2}))
			.toEqual({rowIndex: 2, cardIndex: 2});
	});

	it('clamps a remembered index past the end of the list', () => {
		const rows = [filled('resume'), filled('latest-tv')];
		expect(rowToRestore(rows, {rowIndex: 7, cardIndex: 1})).toEqual({rowIndex: 1, cardIndex: 1});
	});

	it('gives nothing when there is nothing to come back to', () => {
		expect(rowToRestore([filled('resume')], null)).toBeNull();
		expect(rowToRestore([filled('resume')], {rowIndex: -1, cardIndex: 0})).toBeNull();
		expect(rowToRestore([], {rowId: 'imdb-top250-movies', rowIndex: 0, cardIndex: 0})).toBeNull();
		expect(rowToRestore([placeholder('a')], {rowIndex: 0, cardIndex: 0})).toBeNull();
	});
});

// Back from a title picked out of an external row: the library rows are in first and the
// external row still holds its place, so the decision waits for it rather than settling for
// the row above it.
describe('going back to an external row that was still loading', () => {
	const remembered = {rowId: 'imdb-top250-movies', rowIndex: 5, cardIndex: 3};
	const library = [filled('resume'), filled('nextup'), filled('latest-movies'), filled('latest-tv'), filled('latest-music')];

	it('waits first, then lands on the same card of the same row', () => {
		expect(rowToRestore([...library, placeholder('imdb-top250-movies')], remembered)).toBe(ROW_STILL_LOADING);
		expect(rowToRestore([...library, filled('imdb-top250-movies')], remembered)).toEqual({rowIndex: 5, cardIndex: 3});
	});

	it('lands on the row above only once the row is known to be gone', () => {
		expect(rowToRestore(library, remembered)).toEqual({rowIndex: 4, cardIndex: 3});
	});
});
