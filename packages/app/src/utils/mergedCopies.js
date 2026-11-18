// Merged libraries: every server's movie libraries behind one Movies library and their show libraries behind one TV
// Shows library, with a title several servers hold shown once. The card keeps the other servers' copies, so opening it
// can ask which one, and marking it watched or a favorite reaches each of them.

import $L from '@enact/i18n/$L';

import {foldForSearch} from './accentFolding';
import {parseServerDate} from './serverDate';

const MERGED_LIBRARY_PREFIX = 'merged-';
const MERGED_TYPES = ['movies', 'tvshows'];

// Where a card keeps the other servers' copies of its title.
export const COPIES_KEY = '_mergedCopies';

// Whether merging is switched on and has more than one server to merge.
export const mergesLibraries = (settings, hasMultipleServers) => Boolean(
	settings?.unifiedLibraryMode && settings?.mergeLibrariesByType && hasMultipleServers
);

// The library that stands for every server's libraries of `collectionType`.
export const mergedLibraryId = (collectionType) => `${MERGED_LIBRARY_PREFIX}${collectionType}`;

// The collection type `libraryId` merges, or null for a server's own library.
export const mergedLibraryType = (libraryId) => (
	typeof libraryId === 'string' && libraryId.startsWith(MERGED_LIBRARY_PREFIX)
		? libraryId.slice(MERGED_LIBRARY_PREFIX.length)
		: null
);

export const isMergedLibrary = (library) => Boolean(library && mergedLibraryType(library.Id));

export const mergedLibraryName = (collectionType) => (collectionType === 'movies' ? $L('Movies') : $L('TV Shows'));

const collectionTypeOf = (library) => (library?.CollectionType || '').toLowerCase();

// Puts every server's movie libraries behind one library and their show libraries behind another, for each type at
// least two servers hold. The merged library takes the first one's place, server and artwork.
export const mergeLibrariesByType = (libraries, nameOf = mergedLibraryName) => {
	let merged = [...(libraries || [])];
	MERGED_TYPES.forEach((type) => {
		const members = merged.filter((library) => collectionTypeOf(library) === type);
		const servers = new Set(members.map((library) => library._serverId));
		if (servers.size < 2) return;
		const first = members[0];
		const others = new Set(members.slice(1));
		merged[merged.indexOf(first)] = {
			...first,
			Id: mergedLibraryId(type),
			Name: nameOf(type),
			CollectionType: type,
			// The merged library has no artwork of its own, so its tile borrows the first library's.
			_imageItemId: first.Id,
			_mergedType: type
		};
		merged = merged.filter((library) => !others.has(library));
	});
	return merged;
};

const positiveNumber = (value) => {
	if (!/^\d+$/.test(value)) return null;
	const number = parseInt(value, 10);
	return number > 0 ? number : null;
};

// The ids that say two servers hold the same title. Placeholder ids some metadata leaves behind don't count, so a
// title without a real one never folds.
export const titleMatchKeys = (item) => {
	const keys = [];
	const providerIds = item?.ProviderIds;
	if (!providerIds || typeof providerIds !== 'object') return keys;
	Object.keys(providerIds).forEach((provider) => {
		const name = provider.toLowerCase();
		const id = String(providerIds[provider] ?? '').trim().toLowerCase();
		let number = null;
		if (name === 'tmdb' || name === 'tvdb') number = positiveNumber(id);
		else if (name === 'imdb' && id.startsWith('tt')) number = positiveNumber(id.slice(2));
		const key = `${item.Type}:${name}:${id}`;
		if (number != null && !keys.includes(key)) keys.push(key);
	});
	return keys;
};

// Every copy of `item`, itself first.
export const copiesOf = (item) => {
	if (!item) return [];
	const copies = Array.isArray(item[COPIES_KEY]) ? item[COPIES_KEY] : [];
	return [item, ...copies];
};

// How many different servers hold `item`.
export const serverCountOf = (item) => new Set(copiesOf(item).map((copy) => copy._serverId)).size;

// Whether opening `item` has a server to pick.
export const hasMergedCopies = (item) => copiesOf(item).length > 1;

// The server whose copy a merged card should be, and the other servers' copies of its titles waiting for that card to
// come up.
export class PreferredCopies {
	constructor (serverId, titles) {
		this.serverId = serverId;
		// The match keys of every title the preferred server holds.
		this.titles = titles instanceof Set ? titles : new Set(titles || []);
		this.waiting = new Map();
	}

	// Holds `item` back when the preferred server has its title, so the card shows that server's copy and sits where
	// that server sorts it.
	wait (item, keys) {
		if (item._serverId === this.serverId || !keys.some((key) => this.titles.has(key))) return false;
		keys.forEach((key) => {
			if (!this.waiting.has(key)) this.waiting.set(key, []);
			this.waiting.get(key).push(item);
		});
		return true;
	}

	take (keys) {
		const taken = new Set();
		keys.forEach((key) => {
			(this.waiting.get(key) || []).forEach((item) => taken.add(item));
			this.waiting.delete(key);
		});
		taken.forEach((item) => {
			titleMatchKeys(item).forEach((key) => {
				const list = this.waiting.get(key);
				if (!list) return;
				const rest = list.filter((entry) => entry !== item);
				if (rest.length) this.waiting.set(key, rest);
				else this.waiting.delete(key);
			});
		});
		return taken;
	}

	// Every copy still waiting, once the list has run out without the preferred server's copy turning up.
	takeAllWaiting () {
		const all = new Set();
		this.waiting.forEach((items) => items.forEach((item) => all.add(item)));
		this.waiting.clear();
		return Array.from(all);
	}
}

// The item alone, without the other servers' copies, for once one copy has been picked.
export const withoutCopies = (item) => {
	const plain = {...item};
	delete plain[COPIES_KEY];
	return plain;
};

// Two servers can use the same id, so a copy is known by its server too.
export const copyKey = (copy) => `${copy._serverId ?? ''}|${copy.Id}`;

// Marks a copy the title index gave a card, which holds ids only.
const LIGHT_KEY = '_lightCopy';

// A copy already on the card is never added twice. The index gives a card a light copy, ids only, before paging reaches
// it, so the full one paging brings later takes its place, while a light one never takes the place of a full one. The
// card itself always stays.
const join = (holder, item, keys, holders, onJoin) => {
	const holderKey = copyKey(holder);
	copiesOf(item).forEach((copy) => {
		const key = copyKey(copy);
		if (key === holderKey) return;
		const at = holder[COPIES_KEY].findIndex((known) => copyKey(known) === key);
		if (at < 0) holder[COPIES_KEY].push(withoutCopies(copy));
		else if (holder[COPIES_KEY][at][LIGHT_KEY] && !copy[LIGHT_KEY]) holder[COPIES_KEY][at] = withoutCopies(copy);
	});
	if (onJoin) onJoin(holder);
	keys.forEach((key) => {
		if (!holders.has(key)) holders.set(key, holder);
	});
};

// When each card of a fold became one, so the first one shown keeps a title two cards turn out to share. It lives with
// the fold's `holders`, so pages folded together share it and an unrelated fold starts afresh.
const foldOrders = new WeakMap();
const orderOf = (holders) => {
	if (!foldOrders.has(holders)) foldOrders.set(holders, {next: 0, cards: new WeakMap()});
	return foldOrders.get(holders);
};

// Folds each item that shares a match key with an earlier one into it, as one of its copies. `holders` carries the
// titles already shown from one call to the next, so a later page folds into an earlier page's card. With
// `preferred`, another server's copy of a title the preferred server holds waits to join that server's card instead of
// becoming the card. `onJoin` hears of each card that took on a copy, so one already drawn can be drawn again, and of
// a card folded away into it, when an item shows two cards to be one title, so that one can be taken down.
export const foldCopies = (items, holders = new Map(), preferred = null, onJoin = null) => {
	let kept = [];
	const order = orderOf(holders);
	(items || []).forEach((item) => {
		if (!item) return;
		const keys = titleMatchKeys(item);
		const matched = [];
		keys.forEach((key) => {
			const found = holders.get(key);
			if (found && !matched.includes(found)) matched.push(found);
		});
		if (matched.length) {
			// The preferred server's card keeps the title, as it would have had it come first, and otherwise the card
			// shown first, so the list doesn't jump.
			const isPreferred = (card) => (preferred && card._serverId === preferred.serverId ? 0 : 1);
			matched.sort((x, y) => isPreferred(x) - isPreferred(y) || order.cards.get(x) - order.cards.get(y));
			const [holder, ...absorbed] = matched;
			// One item can carry a tmdb id one card was matched on and an imdb id another was: they are one title.
			absorbed.forEach((card) => {
				join(holder, card, [], holders, null);
				// Every key the card answered to, including ones a copy it dropped brought along, now leads here.
				holders.forEach((owner, key) => {
					if (owner === card) holders.set(key, holder);
				});
				kept = kept.filter((entry) => entry !== card);
				if (onJoin) onJoin(holder, card);
			});
			join(holder, item, keys, holders, onJoin);
			return;
		}
		if (preferred && preferred.wait(item, keys)) return;
		kept.push(item);
		if (!keys.length) return;
		// Made up front so a card copied later, as the watched state is laid over it, still shares the list later
		// copies are added to.
		if (!Array.isArray(item[COPIES_KEY])) item[COPIES_KEY] = [];
		if (!order.cards.has(item)) order.cards.set(item, order.next++);
		keys.forEach((key) => holders.set(key, item));
		if (preferred) preferred.take(keys).forEach((copy) => join(item, copy, titleMatchKeys(copy), holders, onJoin));
	});
	return kept;
};

// Every server's titles by match key, from a light read of each whole library, so a card can know its copies before
// paging reaches them. Two servers can name a title differently, and so sort it far apart, as "Title One"
// on one and "Titre Un" on the other.
export const indexCopies = (items) => {
	const index = new Map();
	(items || []).forEach((item) => {
		if (!item) return;
		titleMatchKeys(item).forEach((key) => {
			if (!index.has(key)) index.set(key, []);
			index.get(key).push(item);
		});
	});
	return index;
};

// Adds to `card` every copy of its title in `index` that paging hasn't shown yet. `shown(copy)` says whether one
// already came up, as a card or as a copy, which the fold takes care of. The keys of each copy added now lead to the
// card, so the copy itself folds into it when paging reaches it.
export const joinIndexedCopies = (card, index, holders, shown) => {
	if (!card || !index || !index.size) return false;
	if (!Array.isArray(card[COPIES_KEY])) card[COPIES_KEY] = [];
	const before = card[COPIES_KEY].length;
	// Every copy's ids, not just the card's: a copy already on the card can carry one that leads to further copies.
	const pending = copiesOf(card).flatMap(titleMatchKeys);
	const visited = new Set();
	while (pending.length) {
		const key = pending.shift();
		if (visited.has(key)) continue;
		visited.add(key);
		(index.get(key) || []).forEach((copy) => {
			const copyKeys = titleMatchKeys(copy);
			// A copy can carry an id the card lacks, which leads to further copies, whether or not it's on the card.
			copyKeys.forEach((next) => pending.push(next));
			if (shown(copy) || copiesOf(card).some((known) => copyKey(known) === copyKey(copy))) return;
			join(card, {...copy, [LIGHT_KEY]: true}, copyKeys, holders, null);
		});
	}
	return card[COPIES_KEY].length > before;
};

const dateValue = (value) => {
	const date = parseServerDate(value);
	const time = date ? date.getTime() : NaN;
	return Number.isNaN(time) ? null : time;
};

const numberValue = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : null);

const sortValue = (item, field) => {
	switch (field) {
		// Folded so "Été" sorts with the E's, as each server lists it.
		case 'SortName': return foldForSearch(item.SortName || item.Name || '');
		case 'Name': return foldForSearch(item.Name || '');
		case 'DateCreated': return dateValue(item.DateCreated);
		// Servers sort on this name but send the date as DateLastMediaAdded.
		case 'DateLastContentAdded': return dateValue(item.DateLastMediaAdded);
		case 'PremiereDate': return dateValue(item.PremiereDate);
		case 'ProductionYear': return numberValue(item.ProductionYear);
		case 'OfficialRating': return item.OfficialRating || null;
		case 'Runtime': return numberValue(item.RunTimeTicks);
		case 'CriticRating': return numberValue(item.CriticRating) ?? numberValue(item._criticSort);
		case 'CommunityRating': return numberValue(item.CommunityRating);
		case 'DatePlayed': return dateValue(item.UserData?.LastPlayedDate);
		case 'PlayCount': return numberValue(item.UserData?.PlayCount);
		default: return null;
	}
};

// A missing value sorts first, the way the servers order a null.
const compareNullable = (a, b) => {
	if (a == null) return b == null ? 0 : -1;
	if (b == null) return 1;
	if (a === b) return 0;
	return a < b ? -1 : 1;
};

// Orders items the way a server does for `sortBy`, its comma separated sort fields, so pages from several servers can
// be merged into one list. Null for a random order, which has nothing to merge on.
export const mergedSortComparator = (sortBy, descending) => {
	const fields = String(sortBy || 'SortName').split(',').map((field) => field.trim()).filter(Boolean);
	if (fields.includes('Random')) return null;
	return (a, b) => {
		for (let i = 0; i < fields.length; i++) {
			const order = compareNullable(sortValue(a, fields[i]), sortValue(b, fields[i]));
			if (order !== 0) return descending ? -order : order;
		}
		return 0;
	};
};

// The text a merged card answers to in a library search: its sort name, and each copy's title, which another server
// can hold in another language, and the original title they share.
export const mergedSearchText = (item) => {
	const parts = [item.SortName || item.Name || ''];
	copiesOf(item).forEach((copy) => {
		if (copy.Name) parts.push(copy.Name);
		if (copy.OriginalTitle) parts.push(copy.OriginalTitle);
	});
	return parts.join('\n');
};

// The union of the filter values every server's library holds.
export const mergeFacetValues = (values) => {
	const present = (values || []).filter(Boolean);
	const union = (pick) => {
		const seen = new Set();
		present.forEach((value) => (pick(value) || []).forEach((entry) => seen.add(entry)));
		return Array.from(seen).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	};
	// Languages come as {value, name} pairs on some clients and plain strings on others.
	const unionNamed = (pick) => {
		const byValue = new Map();
		present.forEach((value) => (pick(value) || []).forEach((entry) => {
			const key = entry && typeof entry === 'object' ? entry.value ?? entry.Value ?? entry.name : entry;
			if (!byValue.has(key)) byValue.set(key, entry);
		}));
		const nameOf = (entry) => String(entry && typeof entry === 'object' ? entry.name ?? entry.Name ?? entry.value : entry);
		return Array.from(byValue.values()).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
	};
	return {
		genres: union((value) => value.genres),
		officialRatings: union((value) => value.officialRatings),
		tags: union((value) => value.tags),
		years: union((value) => value.years),
		audioLanguages: unionNamed((value) => value.audioLanguages),
		subtitleLanguages: unionNamed((value) => value.subtitleLanguages)
	};
};
