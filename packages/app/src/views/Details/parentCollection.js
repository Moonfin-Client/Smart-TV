// Which collections a title belongs to.
//
// Jellyfin 12 answers this outright, so on a server carrying that route it is one request.
// Older servers and Emby have nothing of the sort. Ancestors describes the folders above
// an item, and a collection is a link rather than a folder, so a title in one comes back
// with nothing but its library.
//
// Provider ids are what settle it on the rest. A collection built from TMDB carries the
// same id the title names, so the collections and a local match are enough. Anything hand
// made carries no such id and has to be asked what it holds, which is dear enough that
// the answers are kept and the asking done at most once.

const MAX_COLLECTIONS = 500;
const MEMBER_LOOKUPS_AT_ONCE = 8;

const providerId = (item, name) => {
	const ids = item?.ProviderIds;
	if (!ids) return '';
	const key = Object.keys(ids).find((entry) => entry.trim().toLowerCase() === name);
	return key ? String(ids[key] ?? '').trim() : '';
};

// The collection a title names as its own.
const namedCollection = (item, collections) => {
	const wanted = providerId(item, 'tmdbcollection');
	if (!wanted) return null;
	return collections.find((collection) => providerId(collection, 'tmdb') === wanted) || null;
};

// Only the ids and names are read here, and the artwork and watch state the server
// sends by default are the bulk of the answer.
const LEAN = {EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false};

let membershipCache = null;

// Exported so tests can clear the module state between cases.
export const __resetCollectionMembership = () => {
	membershipCache = null;
};

// A server without the route answers 404, and so does one asked about a title it does not
// hold. Those cant be told apart, so neither is remembered and a refusal only ever means
// going the long way round.
const directCollections = (api, item) =>
	api.getItemCollections(item.Id).then((result) => result?.Items || []).catch(() => null);

const allCollections = (api) => api.getItems({
	...LEAN,
	IncludeItemTypes: 'BoxSet',
	Recursive: true,
	Limit: MAX_COLLECTIONS,
	Fields: 'ProviderIds'
}).then((result) => result?.Items || []).catch(() => []);

// Every collection asked what it holds, kept for the rest of the session. Built only
// when a title turns out not to name a collection of its own, which on a library of
// TMDB collections is never.
const membershipFor = async (api, collections) => {
	if (membershipCache) return membershipCache;
	const owners = {};
	for (let start = 0; start < collections.length; start += MEMBER_LOOKUPS_AT_ONCE) {
		const batch = collections.slice(start, start + MEMBER_LOOKUPS_AT_ONCE);
		// eslint-disable-next-line no-await-in-loop
		await Promise.all(batch.map(async (collection) => {
			const members = await api.getItems({...LEAN, ParentId: collection.Id})
				.then((result) => result?.Items || [])
				.catch(() => []);
			members.forEach((member) => {
				if (!member?.Id) return;
				const held = owners[member.Id];
				if (held) held.push(collection);
				else owners[member.Id] = [collection];
			});
		}));
	}
	membershipCache = owners;
	return owners;
};

// The collection a title names is the one it most belongs to, so it leads whatever else
// holds the title.
const namedFirst = (item, collections) => {
	const named = namedCollection(item, collections);
	if (!named) return collections;
	return [named, ...collections.filter((collection) => collection.Id !== named.Id)];
};

export const findParentCollections = async (api, item) => {
	if (!api || !item?.Id) return [];

	// The route hands back every collection the title is in, ordered by name. An empty
	// answer from it settles the question, where a refusal settles nothing.
	const direct = await directCollections(api, item);
	if (direct) return namedFirst(item, direct);

	const collections = await allCollections(api);
	if (collections.length === 0) return [];

	// A title that names its own collection is answered without the scan below. That leaves
	// any second collection holding it unlisted, which only happens on a server old enough
	// to lack the route, and is worth far more than asking every collection what it holds.
	const named = namedCollection(item, collections);
	if (named) return [named];

	const owners = await membershipFor(api, collections);
	return owners[item.Id] || [];
};

export const findParentCollection = async (api, item) => (await findParentCollections(api, item))[0] || null;
