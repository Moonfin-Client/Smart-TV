// Addresses and ids on a Silo server. Silo hands out artwork already signed inside each item, so an image can't be
// built from an id the way Jellyfin's can, and never gets a token added.

export const siloBase = (url) => String(url || '').replace(/\/+$/, '');

// Silo sends most addresses as a path on the server, which takes the server's address, sub-path and all.
const resolveSiloUrl = (url, baseUrl) => {
	const trimmed = typeof url === 'string' ? url.trim() : '';
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (trimmed.startsWith('//')) return `${/^https:/i.test(baseUrl) ? 'https' : 'http'}:${trimmed}`;
	return `${siloBase(baseUrl)}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

// The artwork each item was last seen with, for the callers that ask by item and type without a tag.
const images = new Map();
const imageKey = (baseUrl, itemId, type, index) => `${siloBase(baseUrl)}|${itemId}|${type}|${index}`;

// Keeps the image and returns its tag, which is the loadable address itself.
export const registerSiloImage = (baseUrl, itemId, type, url, index = 0) => {
	const resolved = resolveSiloUrl(url, baseUrl);
	if (!resolved || itemId == null) return null;
	images.set(imageKey(baseUrl, itemId, type, index), resolved);
	return resolved;
};

export const siloImageFor = (baseUrl, itemId, type = 'Primary', index = 0) => images.get(imageKey(baseUrl, itemId, type, index)) || null;

export const forgetSiloImages = () => images.clear();

export const siloIdOf = (raw) => {
	if (raw == null) return null;
	const text = String(raw).trim();
	return text || null;
};

// Silo names genres and studios without ids, so the app makes them from the name.
const GENRE_PREFIX = 'silo-genre:';
const STUDIO_PREFIX = 'silo-studio:';

export const siloGenreId = (name) => `${GENRE_PREFIX}${encodeURIComponent(name)}`;
export const siloStudioId = (name) => `${STUDIO_PREFIX}${encodeURIComponent(name)}`;

const nameAfter = (prefix, id) => {
	if (typeof id !== 'string' || !id.startsWith(prefix) || id.length === prefix.length) return null;
	const encoded = id.substring(prefix.length);
	try {
		return decodeURIComponent(encoded);
	} catch {
		return encoded;
	}
};

export const siloGenreNameOf = (id) => nameAfter(GENRE_PREFIX, id);
export const siloStudioNameOf = (id) => nameAfter(STUDIO_PREFIX, id);

// Silo names a season after its series, series-<key> having season-<key>-1, -2 and so on. An episode only carries
// its series and season number, so the app builds the season's id itself.
export const siloSeasonId = (seriesId, seasonNumber) => (typeof seriesId === 'string' && seriesId.startsWith('series-') && seriesId.length > 7
	? `season-${seriesId.substring(7)}-${seasonNumber}`
	: null);

export const parseSiloSeasonId = (seasonId) => {
	if (typeof seasonId !== 'string' || !seasonId.startsWith('season-')) return null;
	const dash = seasonId.lastIndexOf('-');
	if (dash <= 7) return null;
	const number = Number(seasonId.substring(dash + 1));
	if (!Number.isInteger(number) || number < 0) return null;
	return {seriesId: `series-${seasonId.substring(7, dash)}`, seasonNumber: number};
};

// Season and episode list entries carry no type, which the id's prefix gives.
export const siloTypeOfId = (id) => {
	const dash = typeof id === 'string' ? id.indexOf('-') : -1;
	if (dash <= 0) return null;
	const prefix = id.substring(0, dash);
	return ['movie', 'series', 'season', 'episode'].includes(prefix) ? prefix : null;
};
