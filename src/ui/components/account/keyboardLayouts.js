// Key arrangements for the in-app keyboard. Single characters type themselves,
// multi character names are actions handled by the keyboard.

const BOTTOM_ROW = ['123', '@', '.', 'SPACE', 'CURSORL', 'CURSORR', 'PASTE', 'IME', 'DONE'];

const LOWER_QWERTY = [
	['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
	['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
	['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', 'BACKSPACE'],
	BOTTOM_ROW
];

const LOWER_AZERTY = [
	['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
	['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
	['SHIFT', 'w', 'x', 'c', 'v', 'b', 'n', "'", ',', 'BACKSPACE'],
	BOTTOM_ROW
];

const LOWER_QWERTZ = [
	['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
	['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
	['SHIFT', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', 'BACKSPACE'],
	BOTTOM_ROW
];

export const NUMERIC_LAYOUT = [
	['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
	['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
	['-', '_', '=', '+', ';', ':', "'", '?', '/', 'BACKSPACE'],
	['ABC', ',', '.', 'SPACE', 'CURSORL', 'CURSORR', 'PASTE', 'IME', 'DONE']
];

// Large targets for PINs and ports, arranged like a phone dialer.
export const NUMBER_PAD_LAYOUT = [
	['1', '2', '3'],
	['4', '5', '6'],
	['7', '8', '9'],
	['.', '0', 'BACKSPACE'],
	['CURSORL', 'CURSORR', 'DONE']
];

const LOWER_BY_VARIANT = {
	qwerty: LOWER_QWERTY,
	azerty: LOWER_AZERTY,
	qwertz: LOWER_QWERTZ
};

const shiftKey = (key) => {
	if (key.length > 1) return key;
	if (key === "'") return '"';
	return key.toUpperCase();
};

const upperCache = {};

export const lowerFor = (variant) => LOWER_BY_VARIANT[variant] || LOWER_QWERTY;

export const upperFor = (variant) => {
	const name = LOWER_BY_VARIANT[variant] ? variant : 'qwerty';
	if (!upperCache[name]) {
		upperCache[name] = lowerFor(name).map((row) => row.map(shiftKey));
	}
	return upperCache[name];
};

// The docked style is 12 cells a row, the mode rail, ten characters and an action.
// A key repeated in neighboring cells is one key spanning them.
const DOCKED_BOTTOM_ROW = ['IME', 'SPACE', 'SPACE', 'SPACE', 'SPACE', 'SPACE', 'SPACE', 'SPACE', 'CURSORL', 'CURSORR', 'PASTE', 'DONE'];

const dockedRows = (rows) => [
	['MODE_LOWER', ...rows[0], 'BACKSPACE'],
	['MODE_UPPER', ...rows[1], 'BACKSPACE'],
	['MODE_NUM', ...rows[2].slice(1, -1), '.', '@', 'DONE'],
	DOCKED_BOTTOM_ROW
];

// The semicolon is left out to fit, and stays one hold away on the colon and comma.
export const DOCKED_NUMERIC_LAYOUT = [
	['MODE_LOWER', ...NUMERIC_LAYOUT[0], 'BACKSPACE'],
	['MODE_UPPER', ...NUMERIC_LAYOUT[1], 'BACKSPACE'],
	['MODE_NUM', '-', '_', '=', '+', ':', "'", '?', '/', ',', '.', 'DONE'],
	DOCKED_BOTTOM_ROW
];

const dockedCache = {};

export const dockedFor = (variant, shifted) => {
	const name = `${LOWER_BY_VARIANT[variant] ? variant : 'qwerty'}-${shifted ? 'upper' : 'lower'}`;
	if (!dockedCache[name]) {
		dockedCache[name] = dockedRows(shifted ? upperFor(variant) : lowerFor(variant));
	}
	return dockedCache[name];
};

const boxCache = new WeakMap();

// Each key once, with the block of cells it covers: a run along its row, grown down
// while the rows below repeat that run.
export const keyBoxes = (layout) => {
	if (boxCache.has(layout)) return boxCache.get(layout);
	const covered = layout.map((line) => line.map(() => false));
	const repeats = (row, key, col, lastCol) => {
		for (let c = col; c <= lastCol; c++) {
			if (layout[row][c] !== key) return false;
		}
		return true;
	};
	const boxes = [];
	layout.forEach((line, row) => {
		line.forEach((key, col) => {
			if (covered[row][col]) return;
			let lastCol = col;
			while (line[lastCol + 1] === key) lastCol++;
			let lastRow = row;
			while (lastRow + 1 < layout.length && repeats(lastRow + 1, key, col, lastCol)) lastRow++;
			for (let r = row; r <= lastRow; r++) {
				for (let c = col; c <= lastCol; c++) covered[r][c] = true;
			}
			boxes.push({key, row, col, lastRow, lastCol});
		});
	});
	boxCache.set(layout, boxes);
	return boxes;
};

export const variantForLocale = (locale) => {
	const language = String(locale || '').split(/[-_]/)[0].toLowerCase();
	if (language === 'fr') return 'azerty';
	if (['de', 'cs', 'sk', 'hu', 'hr', 'sl'].includes(language)) return 'qwertz';
	return 'qwerty';
};

const ALTERNATE_CHARACTERS = {
	'a': ['a', 'à', 'á', 'â', 'ä', 'ã', 'å', 'æ'],
	'A': ['A', 'À', 'Á', 'Â', 'Ä', 'Ã', 'Å', 'Æ'],
	'c': ['c', 'ç'],
	'C': ['C', 'Ç'],
	'e': ['e', 'è', 'é', 'ê', 'ë', 'ē'],
	'E': ['E', 'È', 'É', 'Ê', 'Ë', 'Ē'],
	'i': ['i', 'ì', 'í', 'î', 'ï', 'ī'],
	'I': ['I', 'Ì', 'Í', 'Î', 'Ï', 'Ī'],
	'n': ['n', 'ñ'],
	'N': ['N', 'Ñ'],
	'o': ['o', 'ò', 'ó', 'ô', 'ö', 'õ', 'ø', 'œ'],
	'O': ['O', 'Ò', 'Ó', 'Ô', 'Ö', 'Õ', 'Ø', 'Œ'],
	's': ['s', 'ß', 'ś', 'š'],
	'S': ['S', 'Ś', 'Š'],
	'u': ['u', 'ù', 'ú', 'û', 'ü', 'ū'],
	'U': ['U', 'Ù', 'Ú', 'Û', 'Ü', 'Ū'],
	'y': ['y', 'ý', 'ÿ'],
	'Y': ['Y', 'Ý', 'Ÿ'],
	'z': ['z', 'ž', 'ź', 'ż'],
	'Z': ['Z', 'Ž', 'Ź', 'Ż'],
	'.': ['.', '!', '?', ',', ';', ':'],
	',': [',', ';', ':'],
	'?': ['?', '!', '¿', '¡'],
	'!': ['!', '¡'],
	'-': ['-', '_', '–', '—'],
	'_': ['_', '-'],
	'@': ['@', '.com', '.net', '.org'],
	'"': ['"', "'"],
	"'": ["'", '"'],
	'(': ['(', '[', '{', '<'],
	')': [')', ']', '}', '>'],
	'/': ['/', '\\', '|'],
	'=': ['=', '~', '≠'],
	':': [':', ';']
};

export const alternatesFor = (key) => {
	const options = ALTERNATE_CHARACTERS[key];
	return options && options.length > 1 ? options : null;
};

export const REPEATABLE_KEYS = ['BACKSPACE', 'CURSORL', 'CURSORR'];

// Space stretches, the labeled action keys get a little extra, and everything
// else shares one unit. The number pad keeps every key the same size.
export const keyUnitSpan = (key, uniform) => {
	if (uniform) return 1;
	if (key === 'SPACE') return 2.4;
	if (key === '123' || key === 'ABC' || key === 'DONE' || key === 'IME') return 1.22;
	return 1;
};

export const KEY_GAP_FACTOR = 0.1;

export const maxRowSpan = (layout, uniform) => layout.reduce((widest, row) => {
	const span = row.reduce((sum, key) => sum + keyUnitSpan(key, uniform), 0) +
		(row.length - 1) * KEY_GAP_FACTOR;
	return Math.max(widest, span);
}, 0);
