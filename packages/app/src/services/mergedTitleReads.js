// Every title a server library holds, read with ids only, and the copies of one title they show across servers. A
// merged library reads them to know each card's copies before paging reaches them, and a card from anywhere else, as
// Home's Recently Added rows, reads them to find the copies its own row left out.

import connectionPool from './connectionPool';
import {getBlockedRatings, withoutBlockedItems} from './parentalControls';
import {COPIES_KEY, indexCopies, joinIndexedCopies, titleMatchKeys} from '../utils/mergedCopies';
import {isLegacyTizen, isLegacyWebOS} from '../platform';

const PAGE_SIZE = 1000;
// A stop for a server that ignores StartIndex and sends the same page every time.
const MAX_PAGES = 100;
// How long a library's titles are kept for the next time they're asked for, as after leaving a title's details.
const TITLE_READ_TTL_MS = 5 * 60 * 1000;
// How long opening a card waits on a first read before going ahead with the copies it knows.
const FIND_WAIT_MS = 1500;

const titleReads = new Map();
const sourceReads = new Map();

// Whether this TV can read every title of every server to find a card's copies. webOS 4 and older and Tizen 3.0 and
// older only do it for a change made to every copy.
export const readsEveryTitle = () => !isLegacyWebOS() && !isLegacyTizen();

const fresh = (kept) => kept && Date.now() - kept.at < TITLE_READ_TTL_MS;

// Keeps `read` under `key` while it's fresh. A read that failed is tried again by the next one to ask.
const keep = (cache, key, read) => {
	cache.set(key, {at: Date.now(), read});
	read.catch(() => {
		if (cache.get(key)?.read === read) cache.delete(key);
	});
	return read;
};

// Each title read carries the account that read it, whose token opens it later, and leaves out the titles that
// account's ratings block, so a read only serves that account with those ratings.
const sourcePrefix = (source) => [
	source.server._serverId, source.server._serverUserId || '', source.server._serverAccessToken || '',
	getBlockedRatings().join(','), source.libraryId, ''
].join('|');

// Forgets every read, for when the session ends or another account signs in, so nothing read with an account's token
// outlives it.
export const clearMergedTitleReads = () => {
	titleReads.clear();
	sourceReads.clear();
};

// Every title of one server library, with only its ids, read with the grid's own query so a movie folded into a
// collection there isn't counted. Paged, since some servers cap a request without a limit to a small first page. Each
// page starts where the last one's items ended, so a server that sends fewer than were asked for skips nothing, and
// paging runs to the server's own count, so a page the client filtered down doesn't end it.
const readTitles = async (source, params) => {
	const query = {
		Recursive: true,
		Fields: 'ProviderIds',
		EnableTotalRecordCount: true,
		EnableUserData: false,
		ImageTypeLimit: 0,
		...(params.IncludeItemTypes ? {IncludeItemTypes: params.IncludeItemTypes} : {}),
		...(params.ExcludeItemTypes ? {ExcludeItemTypes: params.ExcludeItemTypes} : {}),
		...(params.CollapseBoxSetItems != null ? {CollapseBoxSetItems: params.CollapseBoxSetItems} : {})
	};
	const titles = [];
	let start = 0;
	for (let page = 0; page < MAX_PAGES; page++) {
		// eslint-disable-next-line no-await-in-loop
		const response = await source.api.getItems({...query, ParentId: source.libraryId, StartIndex: start, Limit: PAGE_SIZE});
		const got = (response?.Items || []).filter(Boolean);
		// A title the account's ratings block stays out, as it does from paging, so it never turns up as a copy.
		withoutBlockedItems(got).forEach((raw) => {
			// Each title carries its server, since one index holds several servers' titles.
			if (raw.Id) titles.push({...raw, ...source.server});
		});
		const total = response?.TotalRecordCount;
		start += got.length;
		const done = typeof total === 'number' ? start >= total : got.length < PAGE_SIZE;
		if (!got.length || done) break;
	}
	return titles;
};

// The titles of one server library, read once and shared by whatever asks while the read is fresh.
export const readSharedTitles = (source, params) => {
	const key = sourcePrefix(source) + [params.IncludeItemTypes || '', params.ExcludeItemTypes || '', String(params.CollapseBoxSetItems)].join('|');
	const kept = titleReads.get(key);
	if (fresh(kept)) return kept.read;
	return keep(titleReads, key, readTitles(source, params));
};

// Any fresh read of one server library, whatever query made it, as the one a merged library's grid made, else a read
// of `params`. A title is in the library either way, which is all finding its copies needs, except in a read that
// collapsed collections, which leaves out the movies inside one.
const anyTitlesOf = (source, params) => {
	const prefix = sourcePrefix(source);
	let found = null;
	titleReads.forEach((kept, key) => {
		if (!found && key.startsWith(prefix) && !key.endsWith('|true') && fresh(kept)) found = kept.read;
	});
	return found || readSharedTitles(source, params);
};

// The libraries of `collectionType` on every server, looked up again once one didn't answer or the lookup went stale.
const sourcesOf = (collectionType) => {
	const kept = sourceReads.get(collectionType);
	if (fresh(kept)) return kept.read;
	const read = connectionPool.getMergedLibrarySources(collectionType).then(({sources, complete}) => {
		if (!complete) sourceReads.delete(collectionType);
		return sources;
	});
	return keep(sourceReads, collectionType, read);
};

const LOOKUPS = {
	Movie: {collectionType: 'movies', params: {IncludeItemTypes: 'Movie'}},
	Series: {collectionType: 'tvshows', params: {IncludeItemTypes: 'Series'}}
};

const findAll = async (item, lookup) => {
	const sources = await sourcesOf(lookup.collectionType);
	const read = await Promise.all(sources.map((source) => anyTitlesOf(source, lookup.params).catch(() => null)));
	const index = indexCopies(read.filter(Boolean).flat());
	const card = {...item, [COPIES_KEY]: Array.isArray(item[COPIES_KEY]) ? [...item[COPIES_KEY]] : []};
	joinIndexedCopies(card, index, new Map(), () => false);
	return card;
};

// `item` with every server's copy of its title, for a card whose list may have left some out, as one Home row
// holds only each server's most recent titles. A copy found this way holds ids only, like those the title index adds
// to a merged library's cards. A first read slower than `waitMs` lets the card go ahead with the copies it knows,
// while the read goes on for the next time. A null `waitMs` waits for the read, as a change made to every copy must.
export const findEveryCopy = async (item, waitMs = FIND_WAIT_MS) => {
	const lookup = LOOKUPS[item?.Type];
	// A card that doesn't name its server can't be told apart from that server's own copy, so it opens as it always did.
	if (!lookup || !item._serverId || !titleMatchKeys(item).length) return item;
	if (waitMs == null) return findAll(item, lookup).catch(() => item);
	if (!readsEveryTitle()) return item;
	let timer = null;
	const late = new Promise((resolve) => {
		timer = setTimeout(() => resolve(item), waitMs);
	});
	try {
		return await Promise.race([findAll(item, lookup).catch(() => item), late]);
	} finally {
		clearTimeout(timer);
	}
};
