// Addresses on a Plex server, which carry the token in the query since players and images load them without the client's headers.

// Plex reads a + in the profile as the break between two directives, so a space has to go as %20, never as +.
// A list repeats its key, which is how Plex wants a filter that every value has to match.
export const plexQuery = (params) => Object.keys(params)
	.filter((key) => params[key] !== undefined && params[key] !== null)
	.map((key) => [].concat(params[key])
		.map((value) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
		.join('&'))
	.join('&');

// The Plex servers the app knows, by address, so a URL built from an address alone can carry the right token.
const plexServers = {};

export const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

export const registerPlexServer = (serverUrl, token) => {
	if (serverUrl) plexServers[trimSlash(serverUrl)] = token || null;
};

export const isPlexServer = (serverUrl) => Object.prototype.hasOwnProperty.call(plexServers, trimSlash(serverUrl));

// Whether an address is on a Plex server the app knows, path prefix and all.
export const isPlexUrl = (url) => Object.keys(plexServers).some((base) => url === base || String(url).startsWith(`${base}/`));

const plexTokenFor = (serverUrl) => plexServers[trimSlash(serverUrl)] || null;

export const withPlexToken = (url, token) => (token
	? `${url}${url.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token)}`
	: url);

const IMAGE_ROUTES = {Primary: 'thumb', Backdrop: 'art', Thumb: 'art', Logo: 'clearLogo', Banner: 'banner', Chapter: 'thumb'};
// Ids the app makes up for things Plex keeps no picture of under that key.
export const PREFIXED_ID = /^(section|genre|studio|person|channel|airing|new-collection)[-:]/;

// The tag is the Plex image path the mapper stored, or a full URL for cast photos, which plex.tv serves.
// The transcoder wants both sides and fits the image inside them, so a generous other side leaves the given one in charge.
export const plexImageUrl = (serverUrl, itemId, imageType = 'Primary', options = {}) => {
	const tag = options.tag;
	if (typeof tag === 'string' && /^https?:/.test(tag)) return tag;
	let path = typeof tag === 'string' && tag.startsWith('/') ? tag : null;
	if (!path) {
		if (!itemId || PREFIXED_ID.test(String(itemId))) return null;
		path = `/library/metadata/${itemId}/${IMAGE_ROUTES[imageType] || 'thumb'}`;
	}
	const base = trimSlash(serverUrl);
	const token = plexTokenFor(base);
	const width = options.maxWidth || options.fillWidth || options.width;
	const height = options.maxHeight || options.fillHeight || options.height;
	if (!width && !height) return withPlexToken(`${base}${path}`, token);
	const query = plexQuery({width: width || height * 4, height: height || width * 4, url: path});
	return withPlexToken(`${base}/photo/:/transcode?${query}`, token);
};

export const plexTrickplayFrameUrl = (serverUrl, info, imageIndex) =>
	withPlexToken(`${trimSlash(serverUrl)}/library/parts/${info.PlexPartId}/indexes/sd/${imageIndex * info.Interval}`, plexTokenFor(serverUrl));
