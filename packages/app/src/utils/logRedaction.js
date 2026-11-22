// Reports get pasted into public issues, so anything saying where a server lives or how to
// reach it comes out before the entry is kept. Redaction stops at the path and keeps the
// name of a credential, because a report of bare hosts cant say which call misbehaved.

const REDACTED = '[REDACTED]';

const URL_HOST = /((?:https?|wss?):\/\/)[^\s/<>"',;()\]}]+/gi;

const HOST_LOOKUP = /((?:Failed host lookup|Unable to resolve host):? ['"])[^'"]+/gi;

// A name that says it holds an address, followed by something shaped like one.
const LABELLED_HOST = /\b(host(?:name)?|address|ip|server|url|uri|domain|origin)(\s*"?\s*[:=]\s*"?\s*)([^\s,;()<>"{}[\]']*[.0-9][^\s,;()<>"{}[\]']*)("?)/gi;

// Only the value goes. That auth was present still reads, which is worth keeping. The
// quoted tail is part of the value because this app sends its token as
// Token="...", and stopping at the opening quote would leave the secret sitting there.
const CREDENTIAL = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|authorization|token|pass(?:word|wd)?|(?:client[_-]?)?secret|sig(?:nature)?)(\s*[:=]\s*"?)((?:(?:Bearer|Basic|MediaBrowser)\s+)?[^\s&"',;<>{}[\]]*(?:"[^"]*")?)/gi;

const EMAIL = /[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// The leading boundary is captured and put back rather than looked behind for, since a
// lookbehind is a parse error on the older sets and would take the whole file with it.
const IPV6 = /(^|[^:.\w])((?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|[A-Fa-f0-9:]*::[A-Fa-f0-9:]*)(?![:.\w])/g;

// This runs on every entry, so each pass goes only when the text holds the word it
// looks for.
export const redact = (text) => {
	if (typeof text !== 'string' || text === '') return text;

	let result = text;
	const lower = result.toLowerCase();
	const has = (needle) => lower.indexOf(needle) !== -1;

	if (has('host') || has('address') || has('ip') || has('server') ||
		has('url') || has('uri') || has('domain') || has('origin')) {
		result = result.replace(LABELLED_HOST, (match, name, separator, value, tail) => name + separator + REDACTED + tail);
		if (has('host')) {
			result = result.replace(HOST_LOOKUP, (match, prefix) => prefix + REDACTED);
		}
	}

	// Stopping at the path leaves any credential sitting in the query, and the pass
	// below clears it.
	if (has('://')) {
		result = result.replace(URL_HOST, (match, scheme) => scheme + REDACTED);
	}

	if (has('key') || has('token') || has('auth') || has('pass') || has('secret') || has('sig')) {
		result = result.replace(CREDENTIAL, (match, name, separator) => name + separator + REDACTED);
	}

	if (result.indexOf('@') !== -1) result = result.replace(EMAIL, REDACTED);

	if (result.indexOf('.') !== -1) result = result.replace(IPV4, REDACTED);
	if (result.indexOf(':') !== -1) result = result.replace(IPV6, (match, lead) => lead + REDACTED);

	return result;
};

// A context object carries the same addresses in its values, so it is walked rather than
// left alone. The depth cap keeps a value that points at itself from going round forever.
const MAX_DEPTH = 6;

export const redactContext = (value, depth) => {
	const level = depth || 0;
	if (typeof value === 'string') return redact(value);
	if (!value || typeof value !== 'object' || level >= MAX_DEPTH) return value;

	if (Array.isArray(value)) {
		const list = [];
		for (let i = 0; i < value.length; i++) list.push(redactContext(value[i], level + 1));
		return list;
	}

	const keys = Object.keys(value);
	const result = {};
	for (let i = 0; i < keys.length; i++) {
		result[keys[i]] = redactContext(value[keys[i]], level + 1);
	}
	return result;
};
