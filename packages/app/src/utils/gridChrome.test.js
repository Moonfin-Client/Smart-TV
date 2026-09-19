import Spotlight from '@enact/spotlight';

import {capitalize, createGridKeyDown, createToolbarKeyDown, cycleValue, filterByStartLetter, stopPropagation} from './gridChrome';
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
});

describe('filterByStartLetter', () => {
	const items = [
		{SortName: 'Alien'},
		{SortName: 'alien 3'},
		{SortName: 'Blade Runner'},
		{SortName: '2001'},
		{SortName: 'Ω Project'}
	];

	test('no letter picked leaves the list as it was', () => {
		expect(filterByStartLetter(items, null)).toBe(items);
	});

	test('matches on the first letter whatever the case', () => {
		expect(filterByStartLetter(items, 'A')).toEqual([{SortName: 'Alien'}, {SortName: 'alien 3'}]);
	});

	// Hash is the catch all at the front of the strip, so everything the alphabet can't
	// reach has to land there or it becomes unreachable.
	test('hash takes everything outside the latin alphabet', () => {
		expect(filterByStartLetter(items, '#')).toEqual([{SortName: '2001'}, {SortName: 'Ω Project'}]);
	});

	test('falls back to the display name when the server sent no sort name', () => {
		const noSortName = [{Name: 'Casablanca'}, {SortName: '', Name: 'Chinatown'}];

		expect(filterByStartLetter(noSortName, 'C')).toEqual(noSortName);
	});

	// An item with neither name would otherwise read as an empty first character, which
	// matches no letter but does match the hash test.
	test('an item with no name at all falls to hash', () => {
		expect(filterByStartLetter([{}], '#')).toEqual([{}]);
		expect(filterByStartLetter([{}], 'A')).toEqual([]);
	});

	test('a letter nothing starts with comes back empty', () => {
		expect(filterByStartLetter(items, 'Z')).toEqual([]);
	});

	// An accent does not make it a different word, so the strip has to reach a
	// title carrying one rather than leaving it parked under hash.
	test('an accented title files under its own letter', () => {
		const accented = [{SortName: 'Ángel'}, {SortName: 'Alien'}, {SortName: 'Øster'}];

		expect(filterByStartLetter(accented, 'A')).toEqual([{SortName: 'Ángel'}, {SortName: 'Alien'}]);
		expect(filterByStartLetter(accented, 'O')).toEqual([{SortName: 'Øster'}]);
	});

	test('folding an accent away does not empty the hash bucket', () => {
		const accented = [{SortName: 'Ángel'}, {SortName: '2001'}, {SortName: 'Ω Project'}];

		expect(filterByStartLetter(accented, '#')).toEqual([{SortName: '2001'}, {SortName: 'Ω Project'}]);
	});
});
