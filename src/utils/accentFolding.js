// Folds accented Latin letters onto the plain letter behind them, so searching for "canco" or
// "canço" still turns up "Cançó". The server already does this for the searches it answers, so
// anything matched here has to fold too or the same query finds different things depending on
// which box ran it.

const ACCENT_FOLDS = {
	'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Ā': 'A', 'Ă': 'A', 'Ą': 'A', 'Æ': 'A',
	'Ç': 'C', 'Ć': 'C', 'Č': 'C',
	'Ð': 'D', 'Ď': 'D', 'Đ': 'D',
	'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ē': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
	'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ī': 'I', 'Į': 'I',
	'Ł': 'L',
	'Ñ': 'N', 'Ń': 'N', 'Ň': 'N',
	'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O', 'Ō': 'O', 'Ő': 'O',
	'Ś': 'S', 'Š': 'S', 'Ş': 'S',
	'Þ': 'T',
	'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ū': 'U', 'Ů': 'U', 'Ű': 'U',
	'Ý': 'Y', 'Ÿ': 'Y',
	'Ź': 'Z', 'Ž': 'Z', 'Ż': 'Z'
};

const NON_ASCII = /[\u0080-\uffff]/g;

// Every accented letter the table knows comes back as its upper case base letter, and anything
// else is left exactly as it was, so compare through foldForSearch or case fold it yourself.
export const foldAccents = (value) =>
	String(value ?? '').replace(NON_ASCII, (character) => ACCENT_FOLDS[character.toUpperCase()] || character);

export const foldForSearch = (value) => foldAccents(value).toLowerCase();
