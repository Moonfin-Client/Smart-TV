// Some metadata providers leave markup in a synopsis, and text is drawn as it is, so a "<br>" or an
// "&amp;" would reach the screen as those characters.

// A tag that stood for a line break leaves a space behind it. Stripping it outright would run
// the words either side of it together.
const BREAK_TAG = /<\s*(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi;
const HTML_TAG = /<\/?[a-z0-9]*\b[^>]*>/gi;
const HTML_ENTITY = /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi;

const NAMED_ENTITIES = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

const decodeEntity = (whole, entity) => {
	const key = entity.toLowerCase();
	if (key.startsWith('#')) {
		const hex = key.startsWith('#x');
		const code = parseInt(hex ? key.slice(2) : key.slice(1), hex ? 16 : 10);
		return Number.isNaN(code) ? whole : String.fromCharCode(code);
	}
	// One it doesn't know stays as it is, so real text is never silently removed.
	return NAMED_ENTITIES[key] || whole;
};

// Entities are decoded after the tags come out, so an escaped "&lt;b&gt;" survives as the text
// it was meant to be, and before the spaces are tidied, so a run of "&nbsp;" collapses too.
export const cleanOverview = (input) => {
	if (!input) return '';
	return String(input)
		.replace(BREAK_TAG, ' ')
		.replace(HTML_TAG, '')
		.replace(HTML_ENTITY, decodeEntity)
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
};
