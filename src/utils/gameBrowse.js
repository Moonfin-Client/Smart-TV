// Search terms match word prefixes, so "river" finds "River Raid" but leaves "Night Driver" out.
// A title buckets under its first letter with accents folded off, and anything that doesn't start
// with a letter lands under the hash.

import {foldAccents, foldForSearch} from './accentFolding';

const WORD_SEPARATORS = /[\s\-_.\\,:;!?()[\]{}'"+&\u2010-\u2015\u2018\u2019\u201c\u201d\/]+/;

const searchWords = (value) => foldForSearch(value)
	.split(WORD_SEPARATORS)
	.filter((word) => word.length > 0);

// Splits a query once so it can be run against many prepared titles.
export const gameQueryWords = (query) => searchWords((query || '').trim());

const letterBucket = (title) => {
	const trimmed = String(title || '').replace(/^\s+/, '');
	if (!trimmed) return '#';
	const initial = foldAccents(trimmed.charAt(0).toUpperCase());
	return initial.length === 1 && initial >= 'A' && initial <= 'Z' ? initial : '#';
};

// A system can hold thousands of ROMs, so each title is tokenized once instead of on every
// keystroke.
export const buildGameIndex = (title, alternateText) => ({
	words: searchWords(title).concat(searchWords(alternateText)),
	bucket: letterBucket(title)
});

export const gameIndexMatches = (index, queryWords, letter) => {
	if (!index) return true;
	if (queryWords.length > 0) {
		const everyTermMatches = queryWords.every((term) => (
			index.words.some((word) => word.indexOf(term) === 0)
		));
		if (!everyTermMatches) return false;
	}
	return !letter || index.bucket === letter.toUpperCase();
};
