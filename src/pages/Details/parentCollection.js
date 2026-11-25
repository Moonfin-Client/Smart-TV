// Which collections hold a title. Jellyfin 12 answers in one request. Older servers and Emby
// can't, since Ancestors skips collections, so every collection is asked what it holds, once,
// and the answers are kept. The TMDB id only decides which collection leads.
import {providerId} from './seerrMissingCollectionItems.js';
import {getServerUrl, getUserId} from '../../services/jellyfinApi.js';

const MAX_COLLECTIONS = 500;
const MEMBER_LOOKUPS_AT_ONCE = 8;

// The collection a title names as its own.
const namedCollection = (item, collections) => {
	const wanted = providerId(item, 'tmdbcollection');
	if (!wanted) return null;
	return collections.find((collection) => providerId(collection, 'tmdb') === wanted) || null;
};

// Only the ids and names are read here, and the artwork and watch state the server
// sends by default are the bulk of the answer.
const LEAN = {EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false};

let membershipLookup = null;
let membershipOwner = '';

// A server without the route answers 404, and so does one asked about a title it doesn't
// hold. Those can't be told apart, so neither is remembered and a refusal only ever means
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

const scanMembership = async (api, collections) => {
	const owners = {};
	for (let start = 0; start < collections.length; start += MEMBER_LOOKUPS_AT_ONCE) {
		const batch = collections.slice(start, start + MEMBER_LOOKUPS_AT_ONCE);
		// eslint-disable-next-line no-await-in-loop
		const batchMembers = await Promise.all(batch.map((collection) => api.getItems({...LEAN, ParentId: collection.Id})
			.then((result) => result?.Items || [])
			.catch(() => [])));
		// Filled in the order the collections were listed, not the order the answers arrived,
		// so a title's collections come out the same way every time.
		batchMembers.forEach((members, index) => {
			members.forEach((member) => {
				if (!member?.Id) return;
				const held = owners[member.Id];
				if (held) held.push(batch[index]);
				else owners[member.Id] = [batch[index]];
			});
		});
	}
	return owners;
};

// The scan is kept until the server or account changes, so a title opened while it's still
// running waits on it rather than starting another.
const membershipFor = (api, collections) => {
	const owner = `${getServerUrl()}|${getUserId()}`;
	if (!membershipLookup || membershipOwner !== owner) {
		membershipOwner = owner;
		membershipLookup = scanMembership(api, collections);
	}
	return membershipLookup;
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

	const owners = await membershipFor(api, collections);
	return namedFirst(item, owners[item.Id] || []);
};
