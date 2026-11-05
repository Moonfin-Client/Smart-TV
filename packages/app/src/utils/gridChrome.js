// The pieces the favorites, genres and library grids all share: the alphabet strip, the
// arrow keys that carry focus in and out of the grid, and the library poster sizes. The key
// handlers are built once per view rather than per render, since the only thing they close
// over is the id they were given.

import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {foldAccents} from './accentFolding';
import {KEYS} from './keys';

export const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const LEADING_LETTER = /^[A-Z]/;

// A letter on the alphabet strip matches the name the server sorts by, falling back to the
// display name when it sent no sort name. Accents fold away first, since an accent doesn't make
// it a different word and the viewer looking for Ángel reaches for A. Hash collects everything
// that doesn't start with a letter, which is where numbers and non-latin titles land.
export const matchesStartLetter = (item, letter) => {
	const name = foldAccents((item.SortName || item.Name || '').trim()).toUpperCase();
	if (!name) return false;
	if (letter === '#') return !LEADING_LETTER.test(name);
	return name.indexOf(letter) === 0;
};

// The favorites grid narrows itself to a letter rather than jumping to it.
export const filterByStartLetter = (items, startLetter) => {
	if (!startLetter) return items;
	return items.filter((item) => matchesStartLetter(item, startLetter));
};

// The library grid sizes, under the names they sync by.
export const IMAGE_SIZES = ['small', 'medium', 'large', 'extraLarge'];
export const IMAGE_TYPES = ['poster', 'thumbnail'];
export const GRID_DIRECTIONS = ['vertical', 'horizontal'];

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const stopPropagation = (e) => e.stopPropagation();

export const cycleValue = (values, current) => values[(values.indexOf(current) + 1) % values.length];

// The home card size calls two of these default and xlarge, and has a Grandparents size the
// grids don't draw.
const HOME_TO_GRID_SIZE = {default: 'medium', xlarge: 'extraLarge', grandparents: 'extraLarge'};

// A library grid follows the home card size until a size is picked for library grids, and
// playlist libraries keep a size of their own.
export const libraryPosterSize = (settings, playlist) => {
	const own = playlist ? settings.playlistPosterSize : settings.libraryPosterSize;
	if (IMAGE_SIZES.includes(own)) return own;
	const home = HOME_TO_GRID_SIZE[settings.homeRowsPosterSize] || settings.homeRowsPosterSize;
	return IMAGE_SIZES.includes(home) ? home : 'medium';
};

// The Seerr browse grid follows the library size until a size is picked on that screen.
export const seerrPosterSize = (settings) => (
	IMAGE_SIZES.includes(settings.seerrPosterSize) ? settings.seerrPosterSize : libraryPosterSize(settings)
);

export const POSTER_SIZE_OPTIONS = [
	{key: 'small', label: () => $L('Small')},
	{key: 'medium', label: () => $L('Medium')},
	{key: 'large', label: () => $L('Large')},
	{key: 'extraLarge', label: () => $L('Extra Large')}
];

// A poster's image height at each grid size, with its width two thirds of that.
export const POSTER_HEIGHTS = {small: 174, medium: 217, large: 261, extraLarge: 304};

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

// Where a page key takes a grid. A page is the rows whose cards are fully on screen. Forward
// scrolls the first row cut off at the bottom up to the top, back does the reverse, and focus
// moves as many rows in its column, landing on the last item from a short last row. Rows start
// stride apart, each card cardTop below its row's start. Null when focus has nowhere to go.
export const pageGrid = ({from, direction, count, columns, stride, cardTop, cardHeight, scrollTop, viewport}) => {
	const firstVisibleRow = Math.ceil((scrollTop - 0.5) / stride);
	const firstCutOffRow = Math.floor((scrollTop + viewport + 0.5 - cardTop - cardHeight) / stride) + 1;
	const rows = Math.max(1, firstCutOffRow - firstVisibleRow);
	const lastRow = Math.floor((count - 1) / columns);
	const clampRow = (row) => Math.max(0, Math.min(lastRow, row));
	const target = Math.min(count - 1, clampRow(Math.floor(from / columns) + direction * rows) * columns + from % columns);
	if (target === from) return null;
	return {target, scrollTop: clampRow(firstVisibleRow + direction * rows) * stride};
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
// down it's left alone so the same key keeps scrolling. A grid with a panel beside it sends
// Left there too. Both grids only pass on a Left they have no column for, so any Left that
// gets here comes from the first column.
export const createGridKeyDown = (gridClassName, aboveSpotlightId, leftSpotlightId) => (e) => {
	if (e.keyCode === KEYS.LEFT && leftSpotlightId) {
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(leftSpotlightId);
		return;
	}
	if (e.keyCode !== KEYS.UP) return;

	const grid = document.querySelector(`.${gridClassName}`);
	if (!grid || (grid.scrollTop || 0) >= 50) return;

	e.preventDefault();
	e.stopPropagation();
	Spotlight.focus(aboveSpotlightId);
};

// Right out of a panel beside the grid goes back to the grid. The letters keep the five-way,
// since Right steps along their rows and only leaves from the end of one, and so does a
// search being typed into.
export const createPanelKeyDown = (gridSpotlightId) => (e) => {
	if (e.keyCode !== KEYS.RIGHT || e.target.hasAttribute('data-letter') || e.target.tagName === 'INPUT') return;

	e.preventDefault();
	e.stopPropagation();
	Spotlight.focus(gridSpotlightId);
};

// The same Left for a stack of rows, from the first card of any of them. A row wraps Left
// round to its last card, so this listens in the capture phase to hear the press first.
export const createRowsLeftKeyDown = (leftSpotlightId) => (e) => {
	if (e.keyCode !== KEYS.LEFT) return;

	const row = e.target.closest('[data-row-index]');
	if (!row || row.querySelector('[data-media-card]') !== e.target) return;

	e.preventDefault();
	e.stopPropagation();
	Spotlight.focus(leftSpotlightId);
};
