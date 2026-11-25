// What goes in the two discovery rails. A title can come from the library and from Seerr, so it's
// matched by what it is rather than by id. The library leads, Seerr tops it up, and nothing shows in
// both rails.

// Whole cards plus the fraction of one more, rounded up, which is how many of the library's own
// results are kept at the head of the rail where Seerr can't push them out.
const PROTECTED_COUNT = 7;

const mediaTypeOf = (item) => {
	const type = item?.Type;
	if (type === 'Series') return 'tv';
	if (type === 'Movie') return 'movie';
	return type ? String(type).toLowerCase() : 'unknown';
};

// A Seerr card keeps the id it was built from, and a library item carries the same id among its
// providers, which is what lets the two be recognized as one title.
const tmdbIdOf = (item) => {
	const raw = item?._seerrRaw?.mediaId ?? item?.ProviderIds?.Tmdb ?? item?.ProviderIds?.tmdb;
	const text = raw == null ? '' : String(raw).trim();
	return text || null;
};

const identityKeys = (item) => {
	const keys = new Set();
	if (!item) return keys;

	const mediaType = mediaTypeOf(item);

	const tmdbId = tmdbIdOf(item);
	if (tmdbId) keys.add(`tmdb:${mediaType}:${tmdbId}`);

	const name = String(item.Name || '').trim().toLowerCase().replace(/\s+/g, ' ');
	if (name) keys.add(`title:${mediaType}:${name}|year:${item.ProductionYear ?? ''}`);

	// Nothing to recognize it by, so it can only ever match itself.
	if (!keys.size) keys.add(`id:${item.Id}`);

	return keys;
};

const sharesIdentity = (keys, others) => [...keys].some((key) => others.has(key));

const keysOf = (items) => {
	const all = new Set();
	items.forEach((item) => identityKeys(item).forEach((key) => all.add(key)));
	return all;
};

// Keeps the first of anything that turns up more than once, and drops whatever the caller has
// already placed somewhere else.
const dedupe = (items, excluded) => {
	const seen = new Set();
	const out = [];

	items.forEach((item) => {
		const keys = identityKeys(item);
		if (sharesIdentity(keys, excluded) || sharesIdentity(keys, seen)) return;
		keys.forEach((key) => seen.add(key));
		out.push(item);
	});

	return out;
};

const union = (...sets) => {
	const all = new Set();
	sets.forEach((set) => set.forEach((key) => all.add(key)));
	return all;
};

export const buildDiscoveryRails = ({
	item, similar = [], seerrSimilar = [], seerrRecommendations = [], hasSeerr = false
} = {}) => {
	const currentKeys = identityKeys(item);

	const base = dedupe(similar, currentKeys);
	const head = base.slice(0, PROTECTED_COUNT);
	const tail = base.slice(PROTECTED_COUNT);

	if (!hasSeerr) return {related: [...head, ...tail], recommendations: []};

	// The head of the library list keeps its place, so a recommendation repeating one of those
	// titles gives way rather than the other way round.
	const recommendations = dedupe(seerrRecommendations, union(currentKeys, keysOf(head)));
	const recommendationKeys = keysOf(recommendations);

	const related = [...head, ...dedupe(tail, recommendationKeys)];

	// Seerr's own similar list fills whatever room is left, without repeating either rail.
	const placed = union(currentKeys, keysOf(related), recommendationKeys);
	related.push(...dedupe(seerrSimilar, placed));

	return {related, recommendations};
};
