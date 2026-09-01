import {focusedCardIndex, cardToRestore} from './rowFocusMemory';

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
