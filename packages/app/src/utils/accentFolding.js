// Accented Latin letters folded onto the letter behind them, so that a search
// for "canco" or "canço" still turns up "Cançó", and "Ángel" files under A
// rather than in the bucket kept for symbols.
//
// The server folds accents for the searches it answers itself, so anything the
// set matches on its own has to fold the same way, or a term gives different
// results depending on which box it was typed into.
//
// Decomposing and dropping the combining marks covers every accented Latin
// letter rather than a list someone has to remember to extend. An engine old
// enough to lack normalize hands back the text as it came, which is how the
// matching behaved before any of this folded at all.

// Letters that carry no combining mark to strip, so folding has to name them.
const FOLD_EXTRAS = {
	'Æ': 'A', 'æ': 'a',
	'Ð': 'D', 'ð': 'd',
	'Đ': 'D', 'đ': 'd',
	'Ø': 'O', 'ø': 'o',
	'Þ': 'T', 'þ': 't',
	'Ł': 'L', 'ł': 'l'
};

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const UNDECOMPOSED = /[ÆæÐðĐđØøÞþŁł]/g;

// Case is left as it was found, so compare through foldForSearch below rather
// than against this directly.
export const foldAccents = (value) => {
	const text = String(value == null ? '' : value);
	const stripped = text.normalize ? text.normalize('NFD').replace(COMBINING_MARKS, '') : text;
	return stripped.replace(UNDECOMPOSED, (ch) => FOLD_EXTRAS[ch] || ch);
};

// A string folded and lowercased, ready to compare against other search text.
export const foldForSearch = (value) => foldAccents(value).toLowerCase();
