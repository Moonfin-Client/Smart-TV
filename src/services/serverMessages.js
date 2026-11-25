// Messages a server admin writes, as the plugin sends them.

// The color the admin picked, as drawn in the app. Fixed values rather than
// theme tokens, so a message marked blue looks blue on every theme.
export const MESSAGE_COLORS = {
	green: '#4CAF6D',
	red: '#E05260',
	yellow: '#E0B040',
	blue: '#4A9EE0',
	white: '#E8EAED'
};

const KNOWN_COLORS = Object.keys(MESSAGE_COLORS);

// Reads a key tolerating PascalCase, since both servers capitalize theirs.
const value = (json, key) => {
	if (json[key] !== undefined) return json[key];
	return json[key.charAt(0).toUpperCase() + key.slice(1)];
};

const string = (json, key) => {
	const v = value(json, key);
	return typeof v === 'string' ? v : '';
};

const nullableString = (json, key) => string(json, key).trim() || null;

const date = (json, key) => {
	const v = string(json, key).trim();
	if (!v || isNaN(Date.parse(v))) return null;
	return v;
};

// Only a host that reads as one. A bracketed host is an IPv6 address.
const WEB_ADDRESS = /^https?:\/\/(?:[a-z0-9\-._~%]+|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;

// The address as sent when it's a web link, otherwise null. The body and the
// action come from the admin as free text and end up on the viewer's phone, so
// anything that isn't http or https is dropped rather than handed over.
const webLink = (raw) => {
	const trimmed = typeof raw === 'string' ? raw.trim() : '';
	if (!trimmed || /\s/.test(trimmed)) return null;
	return WEB_ADDRESS.test(trimmed) ? trimmed : null;
};

const parseServerMessage = (json) => {
	if (!json || typeof json !== 'object') return null;
	const id = string(json, 'id').trim();
	if (!id) return null;

	const title = string(json, 'title').trim();
	const body = string(json, 'body').trim();
	if (!title && !body) return null;

	const color = string(json, 'color').toLowerCase();
	const actionUrl = webLink(nullableString(json, 'actionUrl'));
	const actionLabel = nullableString(json, 'actionLabel');

	return {
		id,
		title,
		body,
		color: KNOWN_COLORS.includes(color) ? color : 'white',
		delivery: string(json, 'delivery').toLowerCase() === 'popup' ? 'popup' : 'inbox',
		actionLabel,
		actionUrl,
		createdUtc: date(json, 'createdUtc')
	};
};

export const hasAction = (message) => !!(message?.actionUrl && message?.actionLabel);

// The list the plugin sends, or the cached copy of it, in the order the admin
// arranged. Anything that doesn't read as a message is skipped.
export const parseServerMessages = (payload) => {
	let raw = payload;
	if (raw && !Array.isArray(raw) && typeof raw === 'object') {
		raw = raw.items || raw.Items || [];
	}
	if (!Array.isArray(raw)) return [];
	return raw.map(parseServerMessage).filter(Boolean);
};

// Markdown syntax to drop from the preview on a closed card, so it reads as a
// sentence instead of showing asterisks and hashes.
const MARKDOWN_NOISE = /^\s{0,3}#{1,6}\s+|^\s{0,3}>\s?|^\s{0,3}[-*+]\s+/gm;
const MARKDOWN_EMPHASIS = /(\*{1,3}|_{1,3}|`)/g;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

export const stripMarkdown = (source) => (source || '')
	.replace(MARKDOWN_NOISE, '')
	.replace(MARKDOWN_LINK, '$1')
	.replace(MARKDOWN_EMPHASIS, '')
	.replace(/\n{2,}/g, '\n')
	.trim();
