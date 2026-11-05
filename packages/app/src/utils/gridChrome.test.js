import Spotlight from '@enact/spotlight';

import {POSTER_HEIGHTS, POSTER_SIZE_OPTIONS, capitalize, createGridKeyDown, createPanelKeyDown, createRowsLeftKeyDown, createToolbarKeyDown, cycleValue, filterByStartLetter, libraryPosterSize, matchesStartLetter, pageGrid, seerrPosterSize, stopPropagation} from './gridChrome';
import {KEYS} from './keys';

jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn()}}));

const keyEvent = (keyCode) => ({
	keyCode,
	preventDefault: jest.fn(),
	stopPropagation: jest.fn()
});

// The grid is found by class name, so the tests stand one in with a scroll position.
const withGrid = (scrollTop) => {
	const grid = scrollTop == null ? null : {scrollTop};
	jest.spyOn(document, 'querySelector').mockReturnValue(grid);
};

beforeEach(() => {
	jest.clearAllMocks();
	jest.restoreAllMocks();
});

describe('cycleValue', () => {
	test('steps to the next value and wraps at the end', () => {
		const sizes = ['small', 'medium', 'large'];

		expect(cycleValue(sizes, 'small')).toBe('medium');
		expect(cycleValue(sizes, 'medium')).toBe('large');
		expect(cycleValue(sizes, 'large')).toBe('small');
	});

	// A stored setting can outlive the list of values it came from, and landing on the first
	// value is better than handing back undefined.
	test('falls to the first value when the current one is gone', () => {
		expect(cycleValue(['poster', 'thumbnail'], 'banner')).toBe('poster');
	});

	test('a single value cycles to itself', () => {
		expect(cycleValue(['only'], 'only')).toBe('only');
	});
});

describe('capitalize', () => {
	test('raises the first letter and leaves the rest alone', () => {
		expect(capitalize('medium')).toBe('Medium');
		expect(capitalize('Large')).toBe('Large');
	});

	test('copes with an empty string', () => {
		expect(capitalize('')).toBe('');
	});
});

describe('stopPropagation', () => {
	test('stops the event and nothing else', () => {
		const e = keyEvent(KEYS.DOWN);

		stopPropagation(e);

		expect(e.stopPropagation).toHaveBeenCalledTimes(1);
		expect(e.preventDefault).not.toHaveBeenCalled();
	});
});

describe('createToolbarKeyDown', () => {
	test('down moves into the grid', () => {
		const e = keyEvent(KEYS.DOWN);

		createToolbarKeyDown('favorites-grid')(e);

		expect(Spotlight.focus).toHaveBeenCalledWith('favorites-grid');
		expect(e.preventDefault).toHaveBeenCalled();
		expect(e.stopPropagation).toHaveBeenCalled();
	});

	test('every other key is left to bubble', () => {
		[KEYS.UP, KEYS.LEFT, KEYS.RIGHT, KEYS.ENTER].forEach((keyCode) => {
			const e = keyEvent(keyCode);

			createToolbarKeyDown('favorites-grid')(e);

			expect(Spotlight.focus).not.toHaveBeenCalled();
			expect(e.preventDefault).not.toHaveBeenCalled();
		});
	});
});

describe('createGridKeyDown', () => {
	test('up from the top of the grid goes back to the toolbar', () => {
		withGrid(0);
		const e = keyEvent(KEYS.UP);

		createGridKeyDown('grid-class', 'favorites-letter-hash')(e);

		expect(Spotlight.focus).toHaveBeenCalledWith('favorites-letter-hash');
		expect(e.preventDefault).toHaveBeenCalled();
	});

	// Below the threshold the same key has to keep scrolling the grid, so the handler has to
	// leave the event alone rather than swallow it.
	test('up further down the grid keeps scrolling', () => {
		withGrid(200);
		const e = keyEvent(KEYS.UP);

		createGridKeyDown('grid-class', 'favorites-letter-hash')(e);

		expect(Spotlight.focus).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(e.stopPropagation).not.toHaveBeenCalled();
	});

	test('50 pixels is the point it stops counting as the top', () => {
		withGrid(49);
		createGridKeyDown('grid-class', 'target')(keyEvent(KEYS.UP));
		expect(Spotlight.focus).toHaveBeenCalledWith('target');

		jest.clearAllMocks();

		withGrid(50);
		createGridKeyDown('grid-class', 'target')(keyEvent(KEYS.UP));
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('does nothing without a grid on screen', () => {
		withGrid(null);
		const e = keyEvent(KEYS.UP);

		createGridKeyDown('grid-class', 'target')(e);

		expect(Spotlight.focus).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	test('every other key is left to bubble', () => {
		withGrid(0);
		[KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT].forEach((keyCode) => {
			const e = keyEvent(keyCode);

			createGridKeyDown('grid-class', 'target')(e);

			expect(Spotlight.focus).not.toHaveBeenCalled();
			expect(e.preventDefault).not.toHaveBeenCalled();
		});
	});

	// The grids only pass Left on from their first column, so the handler can send it
	// straight to the panel beside them wherever the grid has scrolled to.
	test('left goes to the panel beside the grid when there is one', () => {
		withGrid(200);
		const e = keyEvent(KEYS.LEFT);

		createGridKeyDown('grid-class', 'above', 'panel')(e);

		expect(Spotlight.focus).toHaveBeenCalledWith('panel');
		expect(e.preventDefault).toHaveBeenCalled();
		expect(e.stopPropagation).toHaveBeenCalled();
	});

	test('up still goes above with a panel beside the grid', () => {
		withGrid(0);

		createGridKeyDown('grid-class', 'above', 'panel')(keyEvent(KEYS.UP));

		expect(Spotlight.focus).toHaveBeenCalledWith('above');
	});
});

describe('createRowsLeftKeyDown', () => {
	// Two rows of two cards, the way the grouped library lays them out.
	const rows = () => {
		const root = document.createElement('div');
		root.innerHTML = [0, 1].map((row) => (
			`<div data-row-index="${row}"><h2>Row</h2><div><div data-media-card></div><div data-media-card></div></div></div>`
		)).join('');
		return root.querySelectorAll('[data-media-card]');
	};
	const leftFrom = (target) => ({...keyEvent(KEYS.LEFT), target});

	test('left from the first card of any row goes to the panel', () => {
		const cards = rows();
		[cards[0], cards[2]].forEach((card) => {
			jest.clearAllMocks();
			const e = leftFrom(card);

			createRowsLeftKeyDown('panel')(e);

			expect(Spotlight.focus).toHaveBeenCalledWith('panel');
			expect(e.preventDefault).toHaveBeenCalled();
			expect(e.stopPropagation).toHaveBeenCalled();
		});
	});

	test('left further along a row is left for the row to move', () => {
		const e = leftFrom(rows()[1]);

		createRowsLeftKeyDown('panel')(e);

		expect(Spotlight.focus).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	test('other keys and presses outside a row are left alone', () => {
		const first = rows()[0];
		const outside = document.createElement('div');

		createRowsLeftKeyDown('panel')({...keyEvent(KEYS.RIGHT), target: first});
		createRowsLeftKeyDown('panel')(leftFrom(outside));

		expect(Spotlight.focus).not.toHaveBeenCalled();
	});
});

describe('createPanelKeyDown', () => {
	const rightFrom = (target) => ({...keyEvent(KEYS.RIGHT), target});

	test('right from a panel control goes to the grid', () => {
		const e = rightFrom(document.createElement('button'));

		createPanelKeyDown('grid-area')(e);

		expect(Spotlight.focus).toHaveBeenCalledWith('grid-area');
		expect(e.preventDefault).toHaveBeenCalled();
		expect(e.stopPropagation).toHaveBeenCalled();
	});

	// The letters sit seven to a row, so Right has to keep stepping along them.
	test('right from a letter is left to the five-way', () => {
		const letter = document.createElement('button');
		letter.setAttribute('data-letter', 'B');
		const e = rightFrom(letter);

		createPanelKeyDown('grid-area')(e);

		expect(Spotlight.focus).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	test('right in a search being typed into moves the caret instead', () => {
		const e = rightFrom(document.createElement('input'));

		createPanelKeyDown('grid-area')(e);

		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('every other key is left to bubble', () => {
		[KEYS.LEFT, KEYS.UP, KEYS.DOWN].forEach((keyCode) => {
			const e = {...keyEvent(keyCode), target: document.createElement('button')};

			createPanelKeyDown('grid-area')(e);

			expect(Spotlight.focus).not.toHaveBeenCalled();
		});
	});
});

describe('matchesStartLetter', () => {
	const items = [
		{SortName: 'Alien'},
		{SortName: 'alien 3'},
		{SortName: 'Blade Runner'},
		{SortName: '2001'},
		{SortName: 'Ω Project'}
	];
	const under = (list, letter) => list.filter((item) => matchesStartLetter(item, letter));

	test('no letter picked leaves the list as it was', () => {
		expect(filterByStartLetter(items, null)).toBe(items);
	});

	test('matches on the first letter whatever the case', () => {
		expect(under(items, 'A')).toEqual([{SortName: 'Alien'}, {SortName: 'alien 3'}]);
	});

	// Hash is the catch all at the front of the strip, so everything the alphabet can't
	// reach has to land there or it becomes unreachable.
	test('hash takes everything outside the latin alphabet', () => {
		expect(under(items, '#')).toEqual([{SortName: '2001'}, {SortName: 'Ω Project'}]);
	});

	test('falls back to the display name when the server sent no sort name', () => {
		const noSortName = [{Name: 'Casablanca'}, {SortName: '', Name: 'Chinatown'}];

		expect(under(noSortName, 'C')).toEqual(noSortName);
	});

	test('an item with no name at all matches nothing', () => {
		expect(matchesStartLetter({}, '#')).toBe(false);
		expect(matchesStartLetter({}, 'A')).toBe(false);
	});

	test('a letter nothing starts with matches nothing', () => {
		expect(under(items, 'Z')).toEqual([]);
	});

	// An accent doesn't make it a different word, and the viewer looking for it reaches for A
	// rather than the bucket the symbols sit in.
	test('files an accented name under the letter under the accent', () => {
		const accented = [{Name: 'Ángel'}, {Name: 'Øster'}, {Name: 'Łódź'}, {Name: '東京'}];

		expect(under(accented, 'A')).toEqual([{Name: 'Ángel'}]);
		expect(under(accented, 'O')).toEqual([{Name: 'Øster'}]);
		expect(under(accented, 'L')).toEqual([{Name: 'Łódź'}]);
		expect(under(accented, '#')).toEqual([{Name: '東京'}]);
	});
});

describe('libraryPosterSize', () => {
	test('uses the size picked for library grids', () => {
		expect(libraryPosterSize({libraryPosterSize: 'large', homeRowsPosterSize: 'small'}, false)).toBe('large');
	});

	test('a playlist library reads its own size', () => {
		const settings = {libraryPosterSize: 'large', playlistPosterSize: 'small', homeRowsPosterSize: 'default'};

		expect(libraryPosterSize(settings, true)).toBe('small');
		expect(libraryPosterSize(settings, false)).toBe('large');
	});

	test('falls back to the home card size until one is picked', () => {
		expect(libraryPosterSize({libraryPosterSize: null, homeRowsPosterSize: 'default'}, false)).toBe('medium');
		expect(libraryPosterSize({libraryPosterSize: null, homeRowsPosterSize: 'xlarge'}, false)).toBe('extraLarge');
		expect(libraryPosterSize({libraryPosterSize: null, homeRowsPosterSize: 'grandparents'}, false)).toBe('extraLarge');
		expect(libraryPosterSize({playlistPosterSize: null, homeRowsPosterSize: 'small'}, true)).toBe('small');
	});

	test('anything it does not know reads as medium', () => {
		expect(libraryPosterSize({libraryPosterSize: 'huge', homeRowsPosterSize: 'nonsense'}, false)).toBe('medium');
		expect(libraryPosterSize({}, false)).toBe('medium');
	});
});

describe('seerrPosterSize', () => {
	test("follows the library size until it's picked", () => {
		expect(seerrPosterSize({seerrPosterSize: null, libraryPosterSize: 'large', homeRowsPosterSize: 'default'})).toBe('large');
		expect(seerrPosterSize({seerrPosterSize: null, libraryPosterSize: null, homeRowsPosterSize: 'xlarge'})).toBe('extraLarge');
	});

	test('a pick there leaves the library size alone', () => {
		const settings = {seerrPosterSize: 'small', libraryPosterSize: 'large', homeRowsPosterSize: 'default'};

		expect(seerrPosterSize(settings)).toBe('small');
		expect(libraryPosterSize(settings)).toBe('large');
		expect(seerrPosterSize({...settings, libraryPosterSize: 'medium'})).toBe('small');
	});

	test("a size it doesn't know follows the library size", () => {
		expect(seerrPosterSize({seerrPosterSize: 'grandparents', libraryPosterSize: 'large'})).toBe('large');
	});

	test('every size it can pick has a poster height', () => {
		for (const option of POSTER_SIZE_OPTIONS) expect(POSTER_HEIGHTS[option.key]).toBeGreaterThan(0);
	});
});

describe('pageGrid', () => {
	// Ten columns of 95 items, with two whole rows on screen and a third cut off.
	const grid = {count: 95, columns: 10, stride: 304, cardTop: 10, cardHeight: 284, viewport: 754};

	test('forward moves focus a page down its column and scrolls the cut off row to the top', () => {
		expect(pageGrid({...grid, from: 3, direction: 1, scrollTop: 0})).toEqual({target: 23, scrollTop: 608});
	});

	test('back does the reverse', () => {
		expect(pageGrid({...grid, from: 23, direction: -1, scrollTop: 608})).toEqual({target: 3, scrollTop: 0});
	});

	test('a short last row takes focus to the last item', () => {
		expect(pageGrid({...grid, from: 77, direction: 1, scrollTop: 1824})).toEqual({target: 94, scrollTop: 2432});
	});

	test('nothing moves at either end', () => {
		expect(pageGrid({...grid, from: 3, direction: -1, scrollTop: 0})).toBeNull();
		expect(pageGrid({...grid, from: 94, direction: 1, scrollTop: 2128})).toBeNull();
	});

	test('a screen too short for a whole card still pages a row', () => {
		expect(pageGrid({...grid, viewport: 200, from: 3, direction: 1, scrollTop: 0})).toEqual({target: 13, scrollTop: 304});
	});
});
