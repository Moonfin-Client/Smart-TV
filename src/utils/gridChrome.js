import $L from '../services/i18n.js';

import {foldAccents} from './accentFolding';

export const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const LEADING_LETTER = /^[A-Z]/;

// A letter on the alphabet strip matches the name the server sorts by, falling back to the
// display name when it sent no sort name. Accents fold away first, since an accent doesn't make
// it a different word and the viewer looking for Ángel reaches for A. Hash collects everything
// that doesn't start with a letter, which is where numbers and non-Latin titles land.
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

export const FOCUS_SCALE = 1.05;

// Half the gap between two cards, and the least a cell can be padded by.
const MIN_CELL_GAP = 9;

// A focused card grows about its center and paints past its cell while the grid clips at its own
// edge, so padding the cell by this much keeps the growth inside room the card already had.
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
