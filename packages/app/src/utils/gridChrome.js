// The pieces the favorites, genres and library grids all share: the alphabet strip, the
// arrow keys that carry focus in and out of the grid, and the settings each grid cycles
// through. The two key handlers are built once per view rather than per render, since the
// only thing they close over is the id they were given.

import Spotlight from '@enact/spotlight';

import {KEYS} from './keys';
import {foldAccents} from './accentFolding';

export const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

// The alphabet strip filters on the name the server sorts by, falling back to the display
// name when it sent no sort name. Hash collects everything that doesn't start with a letter,
// which is where numbers and non-latin titles land.
export const filterByStartLetter = (items, startLetter) => {
	if (!startLetter) return items;

	return items.filter((item) => {
		// An accent does not make it a different word, so "Ángel" files under A
		// rather than in the bucket kept for titles that start with a symbol.
		const firstChar = foldAccents((item.SortName || item.Name || '').charAt(0)).toUpperCase();
		if (startLetter === '#') return !/[A-Z]/.test(firstChar);
		return firstChar === startLetter;
	});
};

// What the image and layout rows on the settings panel step through.
export const IMAGE_SIZES = ['small', 'medium', 'large', 'extraLarge'];
export const IMAGE_TYPES = ['poster', 'thumbnail'];
export const GRID_DIRECTIONS = ['vertical', 'horizontal'];

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const stopPropagation = (e) => e.stopPropagation();

export const cycleValue = (values, current) => values[(values.indexOf(current) + 1) % values.length];

// How far a focused card grows, matched in the stylesheets.
export const FOCUS_SCALE = 1.05;

// Half the gap between two cards, and the least a cell can be padded by.
const MIN_CELL_GAP = 9;

// A focused card grows about its centre and paints past the cell it was given,
// while the grid clips at its own edge. Padding the cell by this much means the
// growth lands in room the card already had.
export const focusOverhang = (size) => Math.ceil(size * (FOCUS_SCALE - 1) / 2);

// The grid stretches every cell to fill its row, so a card ends up wider than
// the size it asked for and grows further than that again when focused. Working
// the columns out the way the grid does gives the width the padding has to
// cover, and a wider pad can drop a column, so it settles rather than guesses.
export const horizontalCellPad = (cardWidth, gridWidth) => {
	let pad = Math.max(MIN_CELL_GAP, focusOverhang(cardWidth));
	for (let i = 0; i < 3; i++) {
		const columns = Math.max(1, Math.floor(gridWidth / (cardWidth + pad * 2)));
		const needed = focusOverhang(gridWidth / columns - pad * 2);
		if (needed <= pad) break;
		pad = needed;
	}
	return pad;
};

// Down out of the toolbar drops into the grid. A screen with something focusable
// above the toolbar passes it too, since the row it sits on is too wide for the
// five-way to find it on its own.
export const createToolbarKeyDown = (gridSpotlightId, aboveSpotlightId) => (e) => {
	if (e.keyCode === KEYS.UP && aboveSpotlightId) {
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(aboveSpotlightId);
		return;
	}
	if (e.keyCode !== KEYS.DOWN) return;

	e.preventDefault();
	e.stopPropagation();
	Spotlight.focus(gridSpotlightId);
};

// Up out of the grid goes back to the toolbar, but only from the top of the list. Further
// down it's left alone so the same key keeps scrolling.
export const createGridKeyDown = (gridClassName, aboveSpotlightId) => (e) => {
	if (e.keyCode !== KEYS.UP) return;

	const grid = document.querySelector(`.${gridClassName}`);
	if (!grid || (grid.scrollTop || 0) >= 50) return;

	e.preventDefault();
	e.stopPropagation();
	Spotlight.focus(aboveSpotlightId);
};
