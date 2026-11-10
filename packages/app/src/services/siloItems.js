// Silo's catalog behind the app's item reads: libraries, grids, details, seasons and episodes, people, genres, studios
// and collections, answered in Jellyfin's shapes. `call(path, options)` sends one request as the signed-in profile.

import {
	inViewOrder, parseSiloCollectionId, parseSiloEpisodeId, parseSiloSeasonId, siloCatalogScopeFor, siloCollectionId,
	siloExtrasOf, siloGenreNameOf, siloIdOf, siloItemToBaseItem, siloLibrariesToViews, siloLibraryCollectionId,
	siloLibraryIdOf, siloMatchesSeriesStatus, siloNamedItem, siloRuleGroups, siloSearchScopeFor, siloSeasonId,
	siloProgressToUserData, siloSortFor, siloStudioNameOf, siloTypeOfId, siloTypesForQuery, siloWantsRandom, splitList, SILO_SUPPORTED_TYPES
} from './siloMapper';
import {createSiloPager, siloPage, siloPageSignature} from './siloPager';

import {createSiloShuffles} from './siloShuffles';

const CATALOG = '/api/v2/catalog';
// Silo sizes artwork when the item is read: lists take medium, detail pages large.
export const SILO_LIST_IMAGE_SIZE = 'medium';
export const SILO_DETAIL_IMAGE_SIZE = 'large';

const RANDOM_POOL = 100;
const RANDOM_PAGES = 4;
const FILTERED_LIST_TTL = 2 * 60 * 1000;
const FILTERED_LIST_MAX = 4;
const READ_ALL_CHUNK = 1000;
const LIST_READ_TTL = 10 * 1000;

const empty = (startIndex) => ({Items: [], TotalRecordCount: 0, StartIndex: startIndex || 0});

const slice = (items, startIndex, limit) => {
	const start = Math.min(Math.max(startIndex || 0, 0), items.length);
	const end = limit > 0 ? Math.min(start + limit, items.length) : items.length;
	return {Items: items.slice(start, end), TotalRecordCount: items.length, StartIndex: start};
};

const shuffle = (list) => {
	for (let i = list.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[list[i], list[j]] = [list[j], list[i]];
	}
	return list;
};

// Answers for a short while, so a screen opening asks once. A failed read is dropped at once.
export const keptReads = (lifetime, maxKeys) => {
	const kept = new Map();
	return {
		get (key, read) {
			const hit = kept.get(key);
			if (hit && Date.now() - hit.at < lifetime) return hit.value;
			const value = read();
			kept.delete(key);
			kept.set(key, {at: Date.now(), value});
			while (maxKeys && kept.size > maxKeys) kept.delete(kept.keys().next().value);
			value.catch(() => {
				if (kept.get(key)?.value === value) kept.delete(key);
			});
			return value;
		},
		forget: (key) => (key == null ? kept.clear() : kept.delete(key))
	};
};

// Answers are kept and handed out more than once, so each caller gets its own copy to change.
const copy = (value) => JSON.parse(JSON.stringify(value));

const itemsOf = (json) => (Array.isArray(json?.items) ? json.items.filter((i) => i && typeof i === 'object') : []);

const searchCapabilitiesOf = (json) => ({
	state: typeof json?.state === 'string' ? json.state : '',
	allowed: json?.allowed === true,
	videoWithEpisodes: json?.video_with_episodes_scope === true,
	peopleMediaScope: json?.people_media_scope === true
});
// When the document can't be read, search is tried with no optional scope.
const UNKNOWN_SEARCH = {state: 'available', allowed: true, videoWithEpisodes: false, peopleMediaScope: false};
const canSearch = (caps) => caps.allowed && caps.state === 'available';

const searchTextOf = (term) => {
	const value = typeof term === 'string' ? term.trim() : '';
	return value || null;
};

// '#' (titles before A) has no Silo prefix, so it narrows nothing.
const namePrefix = (nameStartsWith) => {
	const prefix = typeof nameStartsWith === 'string' ? nameStartsWith.trim() : '';
	return prefix && prefix !== '#' ? prefix : null;
};

export const siloPersonToBaseItem = (person, register) => {
	const date = (value) => {
		const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '');
		return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.0000000Z` : null;
	};
	const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
	const id = siloIdOf(person.id) || '';
	const name = text(person.name) || '';
	const photo = register(id, 'Primary', person.photo_url);
	const providerIds = {};
	if (text(person.imdb_id)) providerIds.Imdb = text(person.imdb_id);
	if (siloIdOf(person.tmdb_id)) providerIds.Tmdb = siloIdOf(person.tmdb_id);
	if (siloIdOf(person.tvdb_id)) providerIds.Tvdb = siloIdOf(person.tvdb_id);
	return {
		Id: id,
		Name: name,
		SortName: name,
		Type: 'Person',
		IsFolder: false,
		...(text(person.bio) ? {Overview: text(person.bio)} : null),
		...(date(person.birth_date) ? {PremiereDate: date(person.birth_date)} : null),
		...(date(person.death_date) ? {EndDate: date(person.death_date)} : null),
		ProductionLocations: text(person.birthplace) ? [text(person.birthplace)] : [],
		ProviderIds: providerIds,
		ImageTags: photo ? {Primary: photo} : {},
		BackdropImageTags: [],
		...(text(person.homepage) ? {ExternalUrls: [{Name: 'Website', Url: text(person.homepage)}]} : null)
	};
};

// A personal collection, or one of a library's.
export const siloCollectionToBoxSet = (collection, register, libraryId = null) => {
	const raw = siloIdOf(collection?.id);
	if (!raw) return null;
	const id = libraryId ? siloLibraryCollectionId(libraryId, raw) : siloCollectionId(raw);
	const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
	const name = text(collection.title) || text(collection.name) || '';
	const poster = register(id, 'Primary', collection.poster_url);
	const backdrop = register(id, 'Backdrop', collection.backdrop_url);
	return {
		Id: id,
		Name: name,
		SortName: name,
		Type: 'BoxSet',
		IsFolder: true,
		CollectionType: 'boxsets',
		...(text(collection.description) ? {Overview: text(collection.description)} : null),
		...(typeof collection.item_count === 'number' ? {ChildCount: Math.trunc(collection.item_count)} : null),
		...(libraryId ? {ParentId: libraryId} : null),
		ImageTags: poster ? {Primary: poster} : {},
		BackdropImageTags: backdrop ? [backdrop] : [],
		...(poster ? {PrimaryImageAspectRatio: 2 / 3} : null),
		_silo: collection
	};
};

// Silo keeps favorites, watched state and ratings on titles: films, shows, seasons and episodes.
const titleId = (itemId, action) => {
	const id = String(itemId || '').trim();
	if (!id || siloGenreNameOf(id) || siloStudioNameOf(id) || parseSiloCollectionId(id) || /^\d+$/.test(id)) {
		throw Object.assign(new Error(`Silo keeps a ${action} only on films, shows, seasons and episodes, not on ${itemId}`), {status: 501});
	}
	return encodeURIComponent(id);
};

// The app's ratings are out of 10; Silo's are 1 to 5 stars.
export const siloStarsFromRating = (rating) => Math.min(Math.max(Math.round(rating / 2), 1), 5);

export const createSiloItems = ({call, images, getConfiguration, mediaSources, getUserId, publishUserData}) => {
	const pager = createSiloPager();
	const register = (itemId, type, url, index) => images.register(itemId, type, url, index);
	const map = (raw, extra) => siloItemToBaseItem(raw, {images, mediaSources, ...extra});

	const details = keptReads(LIST_READ_TTL, 32);
	const seasonLists = keptReads(LIST_READ_TTL, 16);
	const episodeLists = keptReads(LIST_READ_TTL, 32);
	const viewsRead = keptReads(5 * 60 * 1000);
	let searchCaps = null;
	const filteredLists = new Map();
	const layouts = keptReads(60 * 1000);
	const sectionCards = keptReads(5 * 1000);
	// The profile's "hide watched items on Home" setting, which the newest rows follow.
	let hideWatched = null;

	// The caches of this profile's catalog and home, dropped when something they show changes.
	const forgetAll = () => {
		details.forget();
		seasonLists.forget();
		episodeLists.forget();
		filteredLists.clear();
		pager.clear();
		layouts.forget();
		sectionCards.forget();
		hideWatched = null;
	};

	// Where each item was last listed, so a detail page knows its library, and the names of series seen, for the
	// season and episode lists that don't repeat them.
	const libraryOfItem = new Map();
	const seriesNames = {};
	const rememberLibrary = (itemId, libraryId) => {
		libraryOfItem.delete(itemId);
		libraryOfItem.set(itemId, libraryId);
		if (libraryOfItem.size > 5000) libraryOfItem.delete(libraryOfItem.keys().next().value);
	};
	const rememberSeries = (item) => {
		if (item.Type === 'Series' && item.Id) seriesNames[item.Id] = item.Name || '';
	};
	const seriesRef = (seriesId) => ({id: seriesId, name: seriesNames[seriesId]});
	const withKnownLibrary = (item) => {
		const library = libraryOfItem.get(item.Id);
		if (library && item.ParentId == null) item.ParentId = library;
		return item;
	};

	// ---- Libraries

	const loadViews = async (includeHidden) => {
		const [answer, config] = await Promise.all([
			call('/api/v2/user/libraries', {query: includeHidden ? {include_hidden: true} : null}),
			getConfiguration().catch(() => null)
		]);
		let views = siloLibrariesToViews(answer?.items, register);
		if (config) {
			const hidden = config.MyMediaExcludes || [];
			if (!includeHidden && hidden.length) views = views.filter((v) => !hidden.includes(v.Id));
			views = inViewOrder(views, config.OrderedViews);
		}
		return {Items: views, TotalRecordCount: views.length, StartIndex: 0};
	};
	const getViews = (includeHidden = false) => viewsRead.get(includeHidden, () => loadViews(includeHidden)).then(copy);

	const libraryView = async (libraryId) => {
		const found = (await getViews(true)).Items.find((view) => view.Id === libraryId);
		if (!found) throw Object.assign(new Error(`Silo library ${libraryId} is not visible to this profile`), {status: 404});
		return found;
	};
	const libraryName = (libraryId) => libraryView(libraryId).then((v) => v.Name || '', () => '');

	// ---- Catalog pages

	const fetchPage = (params, start, limit) => pager.page({
		signature: siloPageSignature(CATALOG, params),
		startIndex: start,
		limit,
		fetch: async ({cursor, seek, limit: size}) => siloPage(await call(CATALOG, {query: {...params, limit: size, cursor, seek}}))
	});

	const mapPage = (raw, keep, libraryId) => {
		const items = [];
		raw.forEach((entry) => {
			const item = map(entry);
			if (!item || (keep && !keep(item))) return;
			rememberSeries(item);
			if (libraryId) {
				rememberLibrary(item.Id, libraryId);
				if (item.ParentId == null) item.ParentId = libraryId;
			}
			items.push(item);
		});
		return items;
	};

	const page = async (params, startIndex, limit, keep, libraryId) => {
		const start = startIndex || 0;
		const result = await fetchPage(params, start, limit);
		return {Items: mapPage(result.items, keep, libraryId), TotalRecordCount: result.totalRecordCount, StartIndex: start};
	};

	const readAll = async (params, keep, libraryId) => {
		const all = [];
		let offset = 0;
		for (;;) {
			// eslint-disable-next-line no-await-in-loop
			const result = await fetchPage(params, offset, READ_ALL_CHUNK);
			all.push(...mapPage(result.items, keep, libraryId));
			offset += result.items.length;
			if (!result.items.length || offset >= result.totalRecordCount) break;
		}
		return all;
	};

	// A list Silo can't filter or order the way it's asked is read whole once, kept for a short while, and paged here.
	const clientFiltered = async (params, {filter, keep, startIndex, limit, libraryId, shuffled = false, read}) => {
		const key = `${siloPageSignature(CATALOG, params)}#${filter}`;
		let entry = filteredLists.get(key);
		filteredLists.delete(key);
		if (!entry || Date.now() - entry.at > FILTERED_LIST_TTL) {
			const list = read ? read() : readAll(params, keep, libraryId);
			entry = {at: Date.now(), items: shuffled ? list.then(shuffle) : list};
		} else if (shuffled && !(startIndex > 0)) {
			// A random grid opened again gets a new order.
			const previous = entry.items;
			entry = {at: entry.at, items: previous.then((l) => shuffle(l.slice()))};
		}
		filteredLists.set(key, entry);
		while (filteredLists.size > FILTERED_LIST_MAX) filteredLists.delete(filteredLists.keys().next().value);
		let items;
		try {
			items = await entry.items;
		} catch (err) {
			filteredLists.delete(key);
			throw err;
		}
		const result = slice(items, startIndex, limit);
		return {...result, Items: result.Items.map((item) => ({...item})), StartIndex: startIndex || 0};
	};

	// A few random titles: whole pages picked at random from the first hundred's count, then shuffled.
	const shuffledPage = async (params, startIndex, limit, keep, libraryId) => {
		const first = await page(params, 0, RANDOM_POOL, keep, libraryId);
		const pageCount = Math.ceil((first.TotalRecordCount || 0) / RANDOM_POOL);
		const picked = shuffle(Array.from({length: pageCount}, (_, p) => p))
			.slice(0, Math.min(Math.max(Math.ceil((limit || RANDOM_POOL) / 5), 1), RANDOM_PAGES));
		const pages = await Promise.all(picked.map((p) => (p === 0 ? first : page(params, p * RANDOM_POOL, RANDOM_POOL, keep, libraryId))));
		const items = shuffle([].concat(...(pages.length ? pages : [first]).map((p) => p.Items)));
		return {...first, Items: items.slice(0, limit || items.length)};
	};

	// Shows by last played: Silo has no watch date for a show, so its watch history gives the order.
	const showsByLastPlayed = async (params, keep, libraryId, descending) => {
		const [shows, history] = await Promise.all([
			readAll(params, keep, libraryId),
			readAll({source: 'history', library_id: libraryId || undefined, image_size: SILO_LIST_IMAGE_SIZE}, () => true, null)
		]);
		const rank = {};
		history.forEach((item) => {
			if (rank[item.Id] == null) rank[item.Id] = Object.keys(rank).length;
		});
		const watched = shows.filter((item) => rank[item.Id] != null).sort((a, b) => rank[a.Id] - rank[b.Id]);
		const unwatched = shows.filter((item) => rank[item.Id] == null);
		return descending ? watched.concat(unwatched) : unwatched.concat(watched.reverse());
	};

	// Shortest first, with the titles that have no runtime last: Silo's ascending runtime lists those first.
	const runtimeAscending = async (params, groups, startIndex, limit, keep, libraryId) => {
		const start = startIndex || 0;
		let total;
		let withRuntime;
		try {
			const countParams = {...params, groups: JSON.stringify(groups.concat([{match: 'all', rules: [{field: 'runtime', op: 'gt', value: 0}]}]))};
			delete countParams.sort;
			[total, withRuntime] = await Promise.all([
				fetchPage(params, 0, 1).then((r) => r.totalRecordCount),
				fetchPage(countParams, 0, 1).then((r) => r.totalRecordCount)
			]);
		} catch {
			return page(params, startIndex, limit, keep, libraryId);
		}
		const nulls = total - withRuntime;
		if (nulls <= 0 || withRuntime <= 0) return page(params, startIndex, limit, keep, libraryId);
		const end = limit > 0 ? Math.min(Math.max(start + limit, start), total) : total;
		const raw = [];
		if (start < withRuntime) {
			const n = Math.min(end, withRuntime) - start;
			raw.push(...(await fetchPage(params, nulls + start, n)).items.slice(0, n));
		}
		if (end > withRuntime) {
			const from = Math.max(start, withRuntime) - withRuntime;
			const n = end - withRuntime - from;
			raw.push(...(await fetchPage(params, from, n)).items.slice(0, n));
		}
		return {Items: mapPage(raw, keep, libraryId), TotalRecordCount: total, StartIndex: start};
	};

	// ---- Search

	const searchCapabilities = () => {
		if (!searchCaps || Date.now() - searchCaps.at > 10 * 60 * 1000) {
			searchCaps = {
				at: Date.now(),
				value: call('/api/v2/catalog/search/capabilities').then(searchCapabilitiesOf, () => UNKNOWN_SEARCH)
			};
		}
		return searchCaps.value;
	};

	// ---- Seasons and episodes

	const getSeasons = async (seriesId) => {
		const raw = copy(await seasonLists.get(seriesId, async () => itemsOf(await call(
			`${CATALOG}/series/${encodeURIComponent(seriesId)}/seasons`,
			{query: {image_size: SILO_LIST_IMAGE_SIZE, include_artwork: true}}
		))));
		const series = seriesRef(seriesId);
		const seasons = raw.map((season) => map(season, {type: 'season', series})).filter(Boolean);
		return {Items: seasons, TotalRecordCount: seasons.length, StartIndex: 0};
	};

	const seasonById = async (seasonId) => {
		const parsed = parseSiloSeasonId(seasonId);
		if (!parsed) throw Object.assign(new Error(`${seasonId} is not a Silo season id`), {status: 404});
		const found = (await getSeasons(parsed.seriesId)).Items.find((s) => s.Id === seasonId);
		if (!found) throw Object.assign(new Error(`Silo has no season ${seasonId}`), {status: 404});
		return found;
	};

	const seasonEpisodes = async (seasonId, series) => {
		const raw = copy(await episodeLists.get(seasonId, async () => itemsOf(await call(
			`${CATALOG}/items/${encodeURIComponent(seasonId)}/episodes`,
			{query: {image_size: SILO_LIST_IMAGE_SIZE}}
		))));
		return raw.map((episode) => map(episode, {type: 'episode', series})).filter(Boolean);
	};

	const getEpisodes = async (seriesId, seasonId = null) => {
		const series = seriesRef(siloTypeOfId(seriesId) === 'series'
			? seriesId
			: (parseSiloSeasonId(seasonId || seriesId)?.seriesId || seriesId));
		let episodes = [];
		if (seasonId || siloTypeOfId(seriesId) === 'season') {
			episodes = await seasonEpisodes(seasonId || seriesId, series);
		} else {
			const ids = (await getSeasons(series.id)).Items.map((s) => s.Id);
			for (let i = 0; i < ids.length; i += 4) {
				// eslint-disable-next-line no-await-in-loop
				const batch = await Promise.all(ids.slice(i, i + 4).map((id) => seasonEpisodes(id, series)));
				batch.forEach((list) => episodes.push(...list));
			}
		}
		return {Items: episodes, TotalRecordCount: episodes.length, StartIndex: 0};
	};

	const seriesEpisodes = async (seriesId, filters, startIndex, limit) => {
		const flags = filters.map((f) => f.toLowerCase());
		const all = (await getEpisodes(seriesId)).Items.filter((e) => {
			const played = e.UserData?.Played === true;
			if (flags.includes('isplayed') && !played) return false;
			if (flags.includes('isunplayed') && played) return false;
			return true;
		});
		return slice(all, startIndex, limit);
	};

	// ---- Collections

	const personalCollections = async (containing = null) => {
		const answer = await call('/api/v2/collections', {query: containing ? {contains_item: containing} : null});
		return itemsOf(answer)
			.filter((c) => !containing || c.contains === true)
			.map((c) => siloCollectionToBoxSet(c, register))
			.filter(Boolean);
	};

	const libraryCollections = async (libraryId) => {
		const answer = await call(`/api/v2/library/${encodeURIComponent(libraryId)}/collections`);
		return (Array.isArray(answer?.collections) ? answer.collections : [])
			.map((c) => siloCollectionToBoxSet(c, register, libraryId))
			.filter(Boolean);
	};

	const everyLibraryCollections = async () => {
		let views;
		try {
			views = await getViews();
		} catch {
			return [];
		}
		const lists = await Promise.all(views.Items.map((v) => libraryCollections(v.Id).catch(() => [])));
		return [].concat(...lists);
	};

	const collections = async ({libraryId, sortBy, sortOrder, startIndex, limit}) => {
		const all = libraryId
			? await libraryCollections(libraryId)
			: (await personalCollections()).concat(await everyLibraryCollections());
		const first = String(splitList(sortBy)[0] || '').toLowerCase();
		if (first === 'sortname' || first === 'name') {
			const descending = String(splitList(sortOrder)[0] || '').toLowerCase() === 'descending';
			all.sort((a, b) => {
				const order = (a.Name || '').toLowerCase().localeCompare((b.Name || '').toLowerCase());
				return descending ? -order : order;
			});
		}
		return slice(all, startIndex, limit);
	};

	const collection = async (collectionId) => {
		const parsed = parseSiloCollectionId(collectionId);
		const list = parsed.libraryId ? await libraryCollections(parsed.libraryId) : await personalCollections();
		const found = list.find((box) => box.Id === collectionId);
		if (!found) throw Object.assign(new Error(`Silo has no collection ${collectionId} for this profile`), {status: 404});
		return found;
	};

	// Collections are asked for as BoxSets, and only alone.
	const asksForCollections = (includeItemTypes) => {
		const named = splitList(includeItemTypes).map((t) => t.toLowerCase());
		if (!named.includes('boxset')) return false;
		const others = siloTypesForQuery(includeItemTypes);
		return others == null || !others.length;
	};

	// ---- Detail

	const readDetail = async (itemId, mediaSourceId) => {
		const path = `${CATALOG}/items/${encodeURIComponent(itemId)}`;
		const query = {image_size: SILO_DETAIL_IMAGE_SIZE, file_id: mediaSourceId || undefined};
		const json = await call(path, {query});
		const type = json?.type || siloTypeOfId(itemId);
		// A playable title's files come separately when the detail leaves them out.
		if ((type === 'movie' || type === 'episode') && !Array.isArray(json.versions)) {
			const versions = await call(`${path}/versions`, {query}).catch(() => null);
			if (Array.isArray(versions?.items)) json.versions = versions.items;
		}
		return json;
	};

	const detailJson = async (itemId, mediaSourceId = null) =>
		copy(await details.get(`${itemId}#${mediaSourceId || ''}`, () => readDetail(itemId, mediaSourceId)));

	const person = async (personId) => siloPersonToBaseItem(await call(`${CATALOG}/people/${encodeURIComponent(personId)}`), register);

	const getItem = async (itemId, mediaSourceId = null) => {
		const libraryId = siloLibraryIdOf(itemId);
		if (libraryId) {
			// A number is a library, or else a person: Silo's person ids are numbers too.
			try {
				return await libraryView(libraryId);
			} catch (err) {
				if (err.status !== 404) throw err;
				return person(libraryId);
			}
		}
		if (siloTypeOfId(itemId) === 'season') return seasonById(itemId);
		const genre = siloGenreNameOf(itemId);
		if (genre) return siloNamedItem(genre, false);
		const studio = siloStudioNameOf(itemId);
		if (studio) return siloNamedItem(studio, true);
		if (parseSiloCollectionId(itemId)) return collection(itemId);
		const item = map(await detailJson(itemId, mediaSourceId));
		if (!item) throw Object.assign(new Error(`Silo item ${itemId} has a type the app can't show`), {status: 404});
		rememberSeries(item);
		return withKnownLibrary(item);
	};

	// A few items by id. Episodes of one season and seasons of one series are read from their lists, everything else
	// one at a time, six at once; an id that fails is left out.
	const byIds = async (ids, startIndex, limit, userDataOnly) => {
		const start = startIndex || 0;
		const wanted = ids.slice(start, limit > 0 ? start + limit : undefined);
		const found = {};
		if (userDataOnly) {
			const bySeason = {};
			const seriesOfSeasons = {};
			wanted.forEach((id) => {
				const episode = parseSiloEpisodeId(id);
				const parsedSeason = episode ? null : parseSiloSeasonId(id);
				if (episode) {
					const seasonId = siloSeasonId(episode.seriesId, episode.seasonNumber);
					if (seasonId) bySeason[seasonId] = (bySeason[seasonId] || 0) + 1;
				} else if (parsedSeason) {
					seriesOfSeasons[parsedSeason.seriesId] = true;
				}
			});
			const lists = await Promise.all([
				...Object.keys(bySeason).filter((s) => bySeason[s] > 1).map((s) => getEpisodes(s, s).then((p) => p.Items, () => [])),
				...Object.keys(seriesOfSeasons).map((s) => getSeasons(s).then((p) => p.Items, () => []))
			]);
			lists.forEach((list) => list.forEach((item) => {
				if (wanted.includes(item.Id)) found[item.Id] = item;
			}));
		}
		const rest = wanted.filter((id) => !found[id]);
		for (let i = 0; i < rest.length; i += 6) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.all(rest.slice(i, i + 6).map((id) => getItem(id).then((item) => {
				found[id] = item;
			}, () => {})));
		}
		return {Items: wanted.map((id) => found[id]).filter(Boolean), TotalRecordCount: ids.length, StartIndex: start};
	};

	// ---- Items query

	/**
	 * A library grid, the whole catalog, or the children of a series, season, genre, studio or collection, from the
	 * app's Jellyfin query. Filters go to Silo as rule groups; the series status (which Silo can't filter), a random
	 * order and shows by last played are read whole and paged here.
	 */
	const getItems = async (q = {}) => {
		const startIndex = q.StartIndex != null ? Number(q.StartIndex) : null;
		const limit = q.Limit != null ? Number(q.Limit) : null;
		const filters = splitList(q.Filters);
		const isFavorite = q.IsFavorite === true || q.IsFavorite === 'true';
		const ids = splitList(q.Ids);
		if (ids.length) return byIds(ids, startIndex, limit, String(q.Fields || '').trim() === 'UserData');

		const parentId = q.ParentId || null;
		const libraryId = siloLibraryIdOf(parentId);
		const genreParent = parentId ? siloGenreNameOf(parentId) : null;
		const studioParent = parentId ? siloStudioNameOf(parentId) : null;
		const parentCollection = parentId ? parseSiloCollectionId(parentId) : null;

		if (asksForCollections(q.IncludeItemTypes)) {
			// Silo's favorites are titles only.
			if (isFavorite || filters.some((f) => f.toLowerCase() === 'isfavorite')) return empty(startIndex);
			return collections({libraryId, sortBy: q.SortBy, sortOrder: q.SortOrder, startIndex, limit});
		}
		// A series' children are its seasons, or its episodes when those are asked for; a season's are its episodes.
		if (parentId && siloTypeOfId(parentId) === 'series') {
			const childTypes = siloTypesForQuery(q.IncludeItemTypes);
			if (childTypes && childTypes.includes('episode') && !childTypes.includes('season')) return seriesEpisodes(parentId, filters, startIndex, limit);
			return getSeasons(parentId);
		}
		if (parentId && siloTypeOfId(parentId) === 'season') {
			return getEpisodes(parseSiloSeasonId(parentId)?.seriesId || parentId, parentId);
		}
		if (parentId && !libraryId && !genreParent && !studioParent && !parentCollection) {
			return Promise.reject(Object.assign(new Error(`getItems(ParentId: ${parentId}) isn't supported on Silo`), {status: 501}));
		}

		const types = siloTypesForQuery(q.IncludeItemTypes, q.MediaTypes);
		if (types && !types.length) return empty(startIndex);

		const searchText = searchTextOf(q.SearchTerm || q.searchTerm);
		let search = null;
		if (searchText) {
			search = await searchCapabilities();
			if (!canSearch(search)) return empty(startIndex);
		}
		let scope = null;
		if (search) scope = siloSearchScopeFor(types, search.videoWithEpisodes);
		else if (types) scope = siloCatalogScopeFor(types);

		const groups = siloRuleGroups({
			genres: splitList(q.Genres ? String(q.Genres).split('|').join(',') : null)
				.concat(splitList(q.GenreIds).map((id) => siloGenreNameOf(id) || id))
				.concat(genreParent ? [genreParent] : []),
			studios: splitList(q.Studios ? String(q.Studios).split('|').join(',') : null)
				.concat(splitList(q.StudioIds).map((id) => siloStudioNameOf(id) || id))
				.concat(studioParent ? [studioParent] : []),
			years: splitList(q.Years),
			officialRatings: q.OfficialRatings ? String(q.OfficialRatings).split('|').filter(Boolean) : [],
			filters,
			isFavorite,
			is4K: q.Is4K === true || q.Is4K === 'true' ? true : null,
			isHd: q.IsHD === true || q.IsHD === 'true' ? true : (q.IsHD === false || q.IsHD === 'false' ? false : null),
			audioLanguages: splitList(q.AudioLanguages),
			subtitleLanguages: splitList(q.SubtitleLanguages)
		});

		// A person's titles: Silo pages one person at a time.
		const personId = splitList(q.PersonIds)[0] || null;
		const params = {
			...(personId ? {source: 'person', person_id: personId} : null),
			...(parentCollection ? {
				source: parentCollection.libraryId ? 'library_collection' : 'user_collection',
				collection_id: parentCollection.id,
				...(parentCollection.libraryId ? {library_id: parentCollection.libraryId} : null)
			} : null),
			...(libraryId ? {library_id: libraryId} : null),
			...(searchText ? {q: searchText} : null),
			...(scope ? {type: scope} : null),
			...(siloSortFor(q.SortBy, q.SortOrder) ? {sort: siloSortFor(q.SortBy, q.SortOrder)} : null),
			...(groups.length ? {groups: JSON.stringify(groups)} : null),
			...(namePrefix(q.NameStartsWith) ? {name_prefix: namePrefix(q.NameStartsWith)} : null),
			image_size: SILO_LIST_IMAGE_SIZE
		};

		const excluded = splitList(q.ExcludeItemTypes).map((t) => t.toLowerCase());
		const seriesStatus = splitList(q.SeriesStatus);
		// A scope can be wider than the asked types (a search's movies-series-episodes scope), so what wasn't asked
		// for is dropped here.
		const keep = (item) => {
			const siloType = item._silo?.type || String(item.Type || '').toLowerCase();
			if (excluded.includes(String(item.Type || '').toLowerCase())) return false;
			if (!siloMatchesSeriesStatus(item, seriesStatus)) return false;
			return types ? types.includes(siloType) : SILO_SUPPORTED_TYPES.includes(siloType);
		};

		const random = siloWantsRandom(q.SortBy);
		const filtered = seriesStatus.length > 0;
		const sort = params.sort;
		const plainList = !personId && !parentCollection && !searchText && !params.name_prefix;

		if (scope === 'series' && (sort === 'date_viewed' || sort === '-date_viewed') && plainList) {
			const listParams = {...params};
			delete listParams.sort;
			const descending = sort === '-date_viewed';
			return clientFiltered(listParams, {
				filter: [filtered ? `series_status=${seriesStatus.join(',')}` : null, descending ? 'last_played_desc' : 'last_played_asc']
					.filter(Boolean).join('&'),
				keep,
				startIndex,
				limit,
				libraryId,
				read: () => showsByLastPlayed(listParams, keep, libraryId, descending)
			});
		}
		// A random grid is shuffled whole. A grid always sends StartIndex; rows and genre cards, which want only a few,
		// don't.
		const smallRandom = random && startIndex == null && limit > 0 && limit < RANDOM_POOL;
		if (filtered || (random && !smallRandom)) {
			return clientFiltered(params, {
				filter: [filtered ? `series_status=${seriesStatus.join(',')}` : null, random ? 'random' : null].filter(Boolean).join('&'),
				keep,
				startIndex,
				limit,
				libraryId,
				shuffled: random
			});
		}
		if (random) return shuffledPage(params, startIndex, limit, keep, libraryId);
		if (sort === 'runtime') return runtimeAscending(params, groups, startIndex, limit, keep, libraryId);
		return page(params, startIndex, limit, keep, libraryId);
	};

	// ---- Writes

	// Anything the profile changes can show in a cached list or home row, so those are read again.
	const changed = (itemId, patch) => {
		forgetAll();
		if (patch) publishUserData(itemId, patch);
	};

	const setStars = async (itemId, stars, patch) => {
		await call(`/api/v2/ratings/${titleId(itemId, 'rating')}`, {method: 'PUT', body: {rating: stars}});
		changed(itemId, patch);
	};

	// Only manual collections the profile made itself can be changed; a library's belong to the library.
	const canEditCollection = (box) => {
		const parsed = parseSiloCollectionId(box?.Id);
		const silo = box?._silo;
		return Boolean(parsed && !parsed.libraryId && silo && silo.collection_type === 'manual' && String(silo.creator_profile_id) === String(getUserId()));
	};

	const ownCollectionId = (collectionId) => {
		const parsed = parseSiloCollectionId(collectionId);
		if (!parsed || parsed.libraryId) {
			throw Object.assign(new Error(`Only your own collections can be changed on Silo; ${collectionId} is a library's`), {status: 501});
		}
		return encodeURIComponent(parsed.id);
	};

	const editCollection = async (collectionId, itemIds, method) => {
		const collectionPath = `/api/v2/collections/${ownCollectionId(collectionId)}/items/`;
		try {
			for (const itemId of itemIds) {
				// eslint-disable-next-line no-await-in-loop
				await call(`${collectionPath}${encodeURIComponent(itemId)}`, method === 'PUT' ? {method, body: {position: 0}} : {method});
			}
		} finally {
			forgetAll();
		}
	};

	const createCollection = async (name, itemIds = []) => {
		const box = siloCollectionToBoxSet(await call('/api/v2/collections', {
			method: 'POST', body: {name: String(name).trim(), collection_type: 'manual'}
		}), register);
		if (!box) throw new Error('Silo answered without the new collection');
		forgetAll();
		if (itemIds.length) await editCollection(box.Id, itemIds, 'PUT');
		return box;
	};

	// A personal collection's own order, kept on Silo and changed against its current version.
	const collectionOrderPath = (collectionId) => `/api/v2/collections/${ownCollectionId(collectionId)}/items/order`;

	// ---- Everything else that reads

	const scopeOf = (includeItemTypes) => {
		const asked = siloTypesForQuery(includeItemTypes);
		return asked && asked.length ? siloCatalogScopeFor(asked) : null;
	};

	const namedList = (names, studio, descending, startIndex, limit) => {
		const unique = names.filter((n, i) => names.indexOf(n) === i)
			.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		const ordered = descending ? unique.reverse() : unique;
		return slice(ordered.map((n) => siloNamedItem(n, studio)), startIndex, limit);
	};

	const filterValues = (parentId, includeItemTypes, extra) => call(`${CATALOG}/filters`, {
		query: {library_id: siloLibraryIdOf(parentId) || undefined, type: scopeOf(includeItemTypes) || undefined, ...extra}
	});

	const languageNames = (codes) => {
		let display = null;
		try {
			display = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(undefined, {type: 'language'}) : null;
		} catch {
			display = null;
		}
		return (Array.isArray(codes) ? codes : []).filter((c) => typeof c === 'string' && c).map((code) => {
			let name = code;
			try {
				name = (display && display.of(code)) || code;
			} catch {
				name = code;
			}
			return {name, value: code};
		});
	};

	const getAncestors = async (itemId) => {
		const ancestors = [];
		let seriesId = null;
		const episode = parseSiloEpisodeId(itemId);
		const parsedSeason = parseSiloSeasonId(itemId);
		if (episode) {
			seriesId = episode.seriesId;
			const seasonId = siloSeasonId(seriesId, episode.seasonNumber);
			if (seasonId) {
				ancestors.push({
					Id: seasonId,
					Name: episode.seasonNumber === 0 ? 'Specials' : `Season ${episode.seasonNumber}`,
					Type: 'Season',
					IsFolder: true,
					IndexNumber: episode.seasonNumber,
					SeriesId: seriesId,
					...(seriesNames[seriesId] != null ? {SeriesName: seriesNames[seriesId]} : null)
				});
			}
		} else if (parsedSeason) {
			seriesId = parsedSeason.seriesId;
		}
		if (seriesId) ancestors.push({Id: seriesId, Name: seriesNames[seriesId] || '', Type: 'Series', IsFolder: true});
		const libraryId = libraryOfItem.get(itemId) || (seriesId ? libraryOfItem.get(seriesId) : null);
		if (libraryId) ancestors.push({Id: libraryId, Name: await libraryName(libraryId), Type: 'CollectionFolder', IsFolder: true});
		try {
			ancestors.push(...(await personalCollections(itemId)));
		} catch {
			// Collections are extra; the ancestors stand without them.
		}
		return ancestors;
	};

	const extras = async (itemId, trailers) => {
		const item = await getItem(itemId);
		return item._silo ? siloExtrasOf(item._silo, trailers, itemId) : [];
	};

	const asResult = (items) => ({Items: items, TotalRecordCount: items.length, StartIndex: 0});


	// ---- Home

	// Silo's home page: its layout of sections, and the cards in each. Continue Watching and Next Up come from there,
	// as on Silo's own home, so what's hidden there is hidden here too.
	const pageKey = (libraryId) => (libraryId ? `library:${libraryId}` : 'home');
	const homeLayout = (libraryId = null) => layouts.get(pageKey(libraryId), async () => {
		const answer = await call(libraryId ? `/api/v2/library/${encodeURIComponent(libraryId)}/layout` : '/api/v2/home/layout');
		return (Array.isArray(answer?.sections) ? answer.sections : [])
			.filter((sec) => sec && typeof sec.id === 'string' && sec.id && typeof sec.section_type === 'string' && sec.section_type)
			.map((sec) => ({
				id: sec.id,
				sectionType: sec.section_type,
				title: typeof sec.title === 'string' ? sec.title : '',
				itemLimit: typeof sec.item_limit === 'number' ? sec.item_limit : null
			}));
	});
	const sectionItems = (section, libraryId = null) => sectionCards.get(`${pageKey(libraryId)}#${section.id}`, async () => {
		const id = encodeURIComponent(section.id);
		const answer = await call(libraryId
			? `/api/v2/library/${encodeURIComponent(libraryId)}/sections/${id}/items`
			: `/api/v2/home/sections/${id}/items`, {query: {image_size: SILO_LIST_IMAGE_SIZE}});
		return itemsOf(answer);
	});
	// Every card of a section type, once each, or null when the page has no such section.
	const cardsOf = async (sectionType, libraryId = null) => {
		const sections = (await homeLayout(libraryId)).filter((sec) => sec.sectionType === sectionType);
		if (!sections.length) return null;
		const lists = await Promise.all(sections.map((sec) => sectionItems(sec, libraryId)));
		const seen = {};
		return [].concat(...lists).filter((card) => {
			if (typeof card.content_id !== 'string' || seen[card.content_id]) return false;
			seen[card.content_id] = true;
			return true;
		});
	};

	const rememberHomeRow = (items, libraryId) => items.forEach((item) => {
		rememberSeries(item);
		if (libraryId) {
			rememberLibrary(item.Id, libraryId);
			if (item.ParentId == null) item.ParentId = libraryId;
		}
	});

	const hidesWatchedOnHome = () => {
		if (!hideWatched || Date.now() - hideWatched.at > 60 * 1000) {
			hideWatched = {
				at: Date.now(),
				value: call('/api/v2/settings/values/effective', {query: {keys: 'home.hide_watched_items'}})
					.then((answer) => itemsOf(answer).some((setting) => setting.key === 'home.hide_watched_items' && setting.value === true), () => false)
			};
		}
		return hideWatched.value;
	};

	// The scope of a newest row: what's asked for, or what the library holds. Latest lists a show once for its new
	// episodes; Recently Released lists episodes as they are.
	const newestRowScope = async (libraryId, includeItemTypes, episodesAsSeries) => {
		const asked = siloTypesForQuery(includeItemTypes);
		if (asked) {
			const listed = asked.map((t) => (t === 'season' || (episodesAsSeries && t === 'episode') ? 'series' : t))
				.filter((t, i, all) => all.indexOf(t) === i);
			if (!listed.length) return null;
			return siloCatalogScopeFor(listed) || 'video';
		}
		if (!libraryId) return 'video';
		const collectionType = await libraryView(libraryId).then((v) => v.CollectionType, () => null);
		return {movies: 'movie', tvshows: 'series'}[collectionType] || 'video';
	};

	// Continue Watching without a Continue Watching section on the page: the profile's progress list, read item by item.
	const resumeFromProgress = async (libraryId, types, wanted) => {
		const answer = await call('/api/v2/progress', {query: {
			status: 'in_progress', library_id: libraryId || undefined, limit: Math.min(Math.max(wanted, 1), 200)
		}});
		const entries = {};
		itemsOf(answer).forEach((entry) => {
			if (typeof entry.media_item_id === 'string') entries[entry.media_item_id] = entry;
		});
		const found = await byIds(Object.keys(entries));
		return found.Items
			.filter((item) => entries[item.Id] && types.includes(item._silo?.type || siloTypeOfId(item.Id)))
			.map((item) => ({...item, UserData: {...item.UserData, ...siloProgressToUserData(entries[item.Id])}}));
	};

	const RESUMABLE_TYPES = ['movie', 'episode'];

	const getResumeItems = async (limit = 12, parentId = null) => {
		const libraryId = siloLibraryIdOf(parentId);
		if (parentId && !libraryId) return empty(0);
		const cards = await cardsOf('continue_watching', libraryId);
		const items = cards
			? cards.filter((card) => card.item_source !== 'next_up' && RESUMABLE_TYPES.includes(card.type)).map((card) => map(card)).filter(Boolean)
			: await resumeFromProgress(libraryId, RESUMABLE_TYPES, limit || 50);
		rememberHomeRow(items, libraryId);
		return slice(items, 0, limit);
	};

	const seriesNextEpisode = async (seriesId) => {
		if (siloTypeOfId(seriesId) !== 'series') return null;
		const series = await getItem(seriesId);
		const next = series._silo?.play_content_id;
		return typeof next === 'string' && siloTypeOfId(next) === 'episode' ? getItem(next) : null;
	};

	// Next Up is the episodes Silo's Continue Watching lists as next up, then its Next Up section, unwatched. Silo
	// decides how old a show can be to stay in it, so the app's day limit isn't sent.
	// eslint-disable-next-line no-unused-vars
	const getNextUp = async (limit = 24, seriesId = null, maxDays = 0, parentId = null) => {
		const unwatched = (item) => item.UserData?.Played !== true;
		if (seriesId) {
			const episode = await seriesNextEpisode(seriesId);
			return slice(episode && unwatched(episode) ? [episode] : [], 0, limit);
		}
		const libraryId = siloLibraryIdOf(parentId);
		if (parentId && !libraryId) return empty(0);
		const [resume, next] = await Promise.all([cardsOf('continue_watching', libraryId), cardsOf('next_up', libraryId)]);
		const seen = {};
		const items = (resume || []).filter((c) => c.item_source === 'next_up').concat(next || [])
			.filter((card) => {
				if (card.type !== 'episode' || seen[card.content_id]) return false;
				seen[card.content_id] = true;
				return true;
			})
			.map((card) => map(card))
			.filter((item) => item && unwatched(item));
		rememberHomeRow(items, libraryId);
		return slice(items, 0, limit);
	};

	const unplayedGroups = () => siloRuleGroups({filters: ['IsUnplayed']});

	const getLatest = async (libraryId, limit = 20, includeItemTypes = null) => {
		const id = siloLibraryIdOf(libraryId);
		if (libraryId && !id) return [];
		const scope = await newestRowScope(id, includeItemTypes, true);
		if (!scope) return [];
		const groups = (await hidesWatchedOnHome()) ? unplayedGroups() : [];
		const result = await page({
			...(id ? {library_id: id} : null),
			type: scope,
			sort: scope === 'series' ? '-latest_episode_added' : '-added_at',
			...(groups.length ? {groups: JSON.stringify(groups)} : null),
			image_size: SILO_LIST_IMAGE_SIZE
		}, 0, limit > 0 ? limit : 20, null, id);
		// Jellyfin's latest route answers a bare list.
		return result.Items;
	};

	const getRecentlyReleased = async (libraryId, limit = 20, includeItemTypes = 'Movie,Series') => {
		const id = siloLibraryIdOf(libraryId);
		if (libraryId && !id) return empty(0);
		const scope = await newestRowScope(id, includeItemTypes, false);
		if (!scope) return empty(0);
		const now = new Date();
		const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const isoDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
		const groups = [{match: 'all', rules: [{field: 'release_date', op: 'lt', value: isoDate}]}]
			.concat((await hidesWatchedOnHome()) ? unplayedGroups() : []);
		return page({
			...(id ? {library_id: id} : null),
			type: scope,
			sort: '-release_date',
			groups: JSON.stringify(groups),
			image_size: SILO_LIST_IMAGE_SIZE
		}, 0, limit > 0 ? limit : 20, null, id);
	};

	// Continue Watching hides a title as of its last progress, so the next time it's watched it comes back.
	const progressUpdatedAt = async (item) => {
		const stamp = item?._silo?.progress_updated_at;
		if (typeof stamp === 'string' && stamp) return stamp;
		const card = ((await cardsOf('continue_watching')) || []).find((c) => c.content_id === item.Id);
		return typeof card?.progress_updated_at === 'string' && card.progress_updated_at ? card.progress_updated_at : null;
	};

	const hideFromResume = async (itemId, item = {Id: itemId}) => {
		const stamp = await progressUpdatedAt({...item, Id: itemId});
		if (!stamp) throw Object.assign(new Error(`Silo has no resume point for ${itemId} to hide`), {status: 404});
		await call(`/api/v2/home/dismissals/continue_watching/${encodeURIComponent(itemId)}`, {method: 'PUT', body: {progress_updated_at: stamp}});
		forgetAll();
	};

	const hideFromNextUp = async (item) => {
		const series = item.SeriesId || parseSiloEpisodeId(item.Id)?.seriesId;
		if (!series) throw Object.assign(new Error(`${item.Id} is not an episode of a show`), {status: 404});
		await call(`/api/v2/home/dismissals/next_up/${encodeURIComponent(item.Id)}`, {method: 'PUT', body: {series_id: series}});
		forgetAll();
	};

	// The sections Silo curates for the home page, except the two the app builds itself.
	const OWN_SECTIONS = ['continue_watching', 'next_up'];
	const getServerHomeSections = async () => (await homeLayout())
		.filter((sec) => !OWN_SECTIONS.includes(sec.sectionType))
		.map((sec) => ({id: sec.id, title: sec.title || sec.sectionType, kind: sec.sectionType}));

	// A section by its id, or `type:<section type>` (how Moonbase names one, since ids differ between servers).
	const getServerHomeSectionItems = async (sectionId, limit = null) => {
		const section = (await homeLayout()).find((sec) => sec.id === sectionId || `type:${sec.sectionType}` === sectionId);
		if (!section) return empty(0);
		const items = (await sectionItems(section)).filter((card) => SILO_SUPPORTED_TYPES.includes(card.type)).map((card) => map(card)).filter(Boolean);
		rememberHomeRow(items, null);
		return slice(items, 0, limit);
	};


	return {
		...createSiloShuffles({call, map}),
		forget: () => forgetAll(),
		cardsOf,
		hideFromResume,
		hideFromNextUp,

		setFavorite: async (itemId, isFavorite) => {
			await call(`/api/v2/favorites/${titleId(itemId, 'favorite')}`, {method: isFavorite ? 'PUT' : 'DELETE'});
			changed(itemId, {IsFavorite: isFavorite});
		},
		// Either way Silo drops the resume point.
		setWatched: async (itemId, watched) => {
			await call(`/api/v2/watched/${titleId(itemId, 'played state')}`, {method: watched ? 'POST' : 'DELETE'});
			changed(itemId, {Played: watched, PlayedPercentage: null, PlaybackPositionTicks: 0});
		},
		// Silo saves a position only while something plays.
		setPlaybackPosition: async (itemId) => {
			throw Object.assign(new Error(`Silo saves positions only during playback, not for ${itemId}`), {status: 501});
		},
		// Silo has stars and no likes: a like is five stars and a dislike one, read back as 10 and 2.
		setRating: (itemId, likes) => setStars(itemId, likes ? 5 : 1, {Likes: likes, Rating: likes ? 10 : 2}),
		setNumericRating: (itemId, rating) => setStars(itemId, siloStarsFromRating(rating), {Rating: siloStarsFromRating(rating) * 2}),
		clearRating: async (itemId) => {
			await call(`/api/v2/ratings/${titleId(itemId, 'rating')}`, {method: 'DELETE'});
			changed(itemId, {Rating: null, Likes: null});
		},

		// The profile's star ratings, as the plugin's {ItemId, Rating} list out of 10, for the My Rating sort.
		getMyUserRatings: async () => {
			const out = [];
			let cursor = null;
			do {
				// eslint-disable-next-line no-await-in-loop
				const answer = siloPage(await call('/api/v2/ratings', {query: {limit: 200, cursor: cursor || undefined}}));
				answer.items.forEach((entry) => {
					const id = siloIdOf(entry.item_id);
					if (id && typeof entry.rating === 'number') out.push({ItemId: id, Rating: entry.rating * 2});
				});
				cursor = answer.nextCursor;
			} while (cursor);
			return {Items: out};
		},

		canEditCollection,
		getEditableCollections: async () => asResult((await personalCollections()).filter(canEditCollection)
			.sort((a, b) => (a.Name || '').toLowerCase().localeCompare((b.Name || '').toLowerCase()))),
		createCollection,
		addToCollection: (collectionId, itemIds) => editCollection(collectionId, itemIds, 'PUT'),
		removeFromCollection: (collectionId, itemIds) => editCollection(collectionId, itemIds, 'DELETE'),
		getCollectionOrder: async (collectionId) => {
			const answer = await call(collectionOrderPath(collectionId));
			return Array.isArray(answer?.ordered_ids) ? answer.ordered_ids.map(String) : null;
		},
		saveCollectionOrder: async (collectionId, itemIds) => {
			const path = collectionOrderPath(collectionId);
			const current = await call(path, {raw: true});
			const etag = current.headers?.get?.('etag');
			if (!etag) throw new Error('Silo sent no version of the collection order to change');
			await call(path, {method: 'PUT', body: {ordered_ids: itemIds}, headers: {'If-Match': etag}});
			forgetAll();
			return null;
		},
		getResumeItems,
		getNextUp,
		getLatest,
		getRecentlyReleased,
		getServerHomeSections,
		getServerHomeSectionItems,
		// Silo has no music, audiobooks in these rows, playlists or Live TV.
		getResumeAudioItems: async () => empty(0),
		getPlaylists: async () => empty(0),
		forgetViews: () => viewsRead.forget(),
		detailJson,
		// A title with one of its files read in full, for playback.
		readItem: (itemId, fileId) => getItem(itemId, fileId),
		rememberRow: (items, libraryId) => items.forEach((item) => {
			rememberSeries(item);
			if (libraryId) rememberLibrary(item.Id, libraryId);
		}),
		map,
		searchCapabilities,
		personalCollections,
		libraryCollections,

		getLibraries: () => getViews(false),
		getAllLibraries: () => getViews(true),
		getItems,
		getItem: (itemId) => getItem(itemId),
		getItemForDetail: (itemId) => getItem(itemId),
		getItemWithChapters: (itemId) => getItem(itemId),
		getItemMediaInfo: (itemId) => getItem(itemId),
		getSeasons,
		getEpisodes,
		getAncestors,
		getPerson: (personId) => person(personId),

		getQueryFilters: async (parentId, includeItemTypes) => {
			const json = await filterValues(parentId, includeItemTypes).catch(() => null);
			const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
			return {
				genres: list(json?.genres),
				officialRatings: list(json?.content_ratings),
				tags: [],
				years: [],
				audioLanguages: languageNames(json?.technical?.audio_languages),
				subtitleLanguages: languageNames(json?.technical?.subtitle_languages)
			};
		},

		getGenres: async (libraryId, includeItemTypes, sortBy, sortOrder) => {
			const json = await filterValues(libraryId, includeItemTypes);
			const names = Array.isArray(json?.genres) ? json.genres.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim()) : [];
			return namedList(names, false, String(sortOrder || '').toLowerCase() === 'descending');
		},

		getStudios: async (limit, sortBy, sortOrder) => {
			const json = await filterValues(null, null, {skip_technical: true});
			const names = [].concat(json?.networks || [], json?.studios || []).filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
			return namedList(names, true, String(sortOrder || '').toLowerCase() === 'descending', 0, limit);
		},

		searchPeople: async (query, limit = 24) => {
			const caps = await searchCapabilities();
			if (!canSearch(caps)) return empty(0);
			const answer = await call(`${CATALOG}/people`, {query: {
				q: searchTextOf(query) || undefined,
				limit: limit > 0 ? Math.min(Math.max(limit, 1), 100) : undefined,
				...(caps.peopleMediaScope ? {media_scope: caps.videoWithEpisodes ? 'video_with_episodes' : 'video'} : null)
			}});
			return asResult(itemsOf(answer).filter((p) => siloIdOf(p.id)).map((p) => siloPersonToBaseItem(p, register)));
		},

		search: (query, limit = 240) => getItems({SearchTerm: query, Limit: limit, IncludeItemTypes: 'Movie,Series,Episode'}),

		getSimilar: async (itemId, limit = 15) => {
			const answer = await call(`/api/v2/recommendations/similar/${encodeURIComponent(itemId)}`, {query: {limit}});
			const items = itemsOf(answer).filter((raw) => SILO_SUPPORTED_TYPES.includes(raw.type)).map((raw) => map(raw)).filter(Boolean);
			items.forEach(rememberSeries);
			return asResult(items);
		},

		getItemsByPerson: (personId, limit = 100) => getItems({PersonIds: personId, IncludeItemTypes: 'Movie,Series,Episode', SortBy: 'PremiereDate', SortOrder: 'Descending', Limit: limit}),

		getItemsByGenre: (genreId, libraryId, limit = 50) => getItems({GenreIds: genreId, ParentId: libraryId, Limit: limit, IncludeItemTypes: 'Movie,Series'}),

		getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') => collections({sortBy, sortOrder, limit}),

		getCollectionItems: (collectionId, limit = 50, sortBy = null, sortOrder = 'Ascending') =>
			getItems({ParentId: collectionId, Limit: limit, ...(sortBy ? {SortBy: sortBy, SortOrder: sortOrder} : null)}),

		getCollectionMembers: (collectionId, limit = 500, startIndex = 0) =>
			getItems({ParentId: collectionId, Limit: limit, ...(startIndex > 0 ? {StartIndex: startIndex} : null)}),

		getItemCollections: async (itemId) => asResult(await personalCollections(itemId)),

		getFavorites: (limit = 50) => getItems({IsFavorite: true, Limit: limit, IncludeItemTypes: 'Movie,Series,Episode'}),

		getAllItems: (limit = 10000) => getItems({IncludeItemTypes: 'Movie,Series', SortBy: 'SortName', SortOrder: 'Ascending', Limit: limit}),

		getRandomItem: (includeTypes = 'Movie,Series') => getItems({IncludeItemTypes: includeTypes, SortBy: 'Random', Limit: 1}),

		getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null) => {
			const includeTypes = {movies: 'Movie', tv: 'Series'}[contentType] || 'Movie,Series';
			return getItems({IncludeItemTypes: includeTypes, SortBy: 'Random', Limit: limit, ParentId: parentId, Genres: genreName});
		},

		getPreviewItems: (limit = 10) => getItems({IncludeItemTypes: 'Movie,Series', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: limit}),

		getLocalTrailers: (itemId) => extras(itemId, true),
		getSpecialFeatures: (itemId) => extras(itemId, false),
		// Silo has no intros or additional parts.
		getIntros: async () => asResult([]),
		getAdditionalParts: async () => asResult([])
	};
};
