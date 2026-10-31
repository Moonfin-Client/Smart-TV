// A Silo server behind the same methods the app calls on a Jellyfin server, answering in Jellyfin's shapes.

import * as userDataSync from './userDataSync';
import {createSiloRequest} from './siloSession';
import {createSiloPager, siloPage} from './siloPager';
import {SILO_ORIGINAL, siloItemToJellyfin, siloLibrariesToViews, siloNamedItem, siloPersonToJellyfin, siloProgressToUserData} from './siloMapper';
import {parseSiloSeasonId, siloGenreNameOf, siloStudioNameOf, siloTypeOfId} from '../utils/siloUrls';

const LIST_IMAGES = 'medium';
const DETAIL_IMAGES = 'large';
const TITLE_TYPES = ['movie', 'series', 'season', 'episode'];
const RESUMABLE_TYPES = ['movie', 'episode'];
// The libraries, the settings and the page layout change rarely, so a read of them is kept a minute. A Home section is
// kept a few seconds, since the Home rows read the same ones at once.
const READ_LIFE_MS = 60000;
const SECTION_LIFE_MS = 5000;

const SORT_FIELDS = {
	sortname: 'title',
	name: 'title',
	seriessortname: 'title',
	productionyear: 'year',
	premieredate: 'release_date',
	datecreated: 'added_at',
	datelastcontentadded: 'latest_episode_added',
	communityrating: 'rating_tmdb',
	criticrating: 'rating_rt_critic',
	officialrating: 'content_rating',
	runtime: 'runtime',
	dateplayed: 'date_viewed',
	playcount: 'plays'
};

const unsupported = (what) => Promise.reject(Object.assign(new Error(`${what} isn't supported on Silo`), {status: 501}));

const list = (value, separator = ',') => {
	if (value == null || value === '') return [];
	return (Array.isArray(value) ? value : String(value).split(separator)).map((v) => String(v).trim()).filter(Boolean);
};

const result = (items, total = items.length, start = 0) => ({Items: items, TotalRecordCount: total, StartIndex: start});
const slice = (items, start = 0, limit) => result(items.slice(start, limit == null ? undefined : start + limit), items.length, start);
const itemsOf = (json) => (Array.isArray(json?.items) ? json.items : []);
const isLibraryId = (id) => /^\d+$/.test(String(id ?? '').trim());
// The app sends a yes or no filter as a boolean or as its text.
const flag = (value) => (value === true || value === 'true' ? true : (value === false || value === 'false' ? false : null));
const siloTypeOf = (item) => item?.[SILO_ORIGINAL]?.type || siloTypeOfId(item?.Id);

// The app's item types as Silo's. Null means any, and an empty set means none Silo has.
const siloTypesFor = (includeItemTypes) => {
	const named = list(includeItemTypes).map((t) => t.toLowerCase());
	return named.length ? new Set(named.filter((t) => TITLE_TYPES.includes(t))) : null;
};

// Silo lists one type, or films and series together. Seasons are only ever listed by their series.
const scopeFor = (types) => {
	if (types.size === 1) {
		const [only] = types;
		return only === 'season' ? null : only;
	}
	return types.size === 2 && types.has('movie') && types.has('series') ? 'video' : null;
};

export const siloSortFor = (sortBy, sortOrder) => {
	const field = SORT_FIELDS[(list(sortBy)[0] || '').toLowerCase()];
	if (!field) return null;
	return (list(sortOrder)[0] || '').toLowerCase() === 'descending' ? `-${field}` : field;
};

const rule = (field, op, value) => ({field, op, value});
const any = (rules) => (rules.length ? {match: 'any', rules} : null);

// Silo's rule groups for the app's filters: every filter has to hold, any value within one. Filters Silo has no rule
// for, like tags, trailers and video types, are left out.
export const siloRuleGroups = (params) => {
	const flags = list(params.Filters).map((f) => f.toLowerCase());
	const genres = new Set([...list(params.Genres, '|'), ...list(params.GenreIds, '|').map((id) => siloGenreNameOf(id) || id)]);
	const studios = new Set([...list(params.Studios, '|'), ...list(params.StudioIds, '|').map((id) => siloStudioNameOf(id) || id)]);
	const played = flag(params.IsPlayed) === true || flags.includes('isplayed');
	const unplayed = flag(params.IsPlayed) === false || flags.includes('isunplayed');
	const favorite = flag(params.IsFavorite) === true || flags.includes('isfavorite');
	const hd = flag(params.IsHD);
	return [
		any([...genres].map((g) => rule('genre', 'is', g))),
		any(list(params.Years).map((y) => rule('year', 'is', Number(y)))),
		any(list(params.OfficialRatings, '|').map((r) => rule('content_rating', 'is', r))),
		// A film's studio is a series' network, and Silo keeps the two apart.
		any([...studios].flatMap((s) => [rule('studio', 'is', s), rule('network', 'is', s)])),
		played ? any([rule('watched', 'is', true)]) : null,
		unplayed ? any([rule('watched', 'is', false)]) : null,
		flags.includes('isresumable') ? any([rule('in_progress', 'is', true)]) : null,
		favorite ? any([rule('favorited', 'is', true)]) : null,
		flag(params.Is4K) === true ? any([rule('resolution', 'is', '2160p')]) : null,
		hd === true ? any([rule('resolution', 'is', '1080p'), rule('resolution', 'is', '720p')]) : null,
		...(hd === false ? ['2160p', '1080p', '720p'].map((r) => any([rule('resolution', 'is_not', r)])) : []),
		any(list(params.AudioLanguages).map((l) => rule('audio_language', 'is', l))),
		any(list(params.SubtitleLanguages).map((l) => rule('subtitle_language', 'is', l)))
	].filter(Boolean);
};

export const createSiloApi = ({getBaseUrl, getAccount, getProfile, getDeviceInfo}) => {
	const {request} = createSiloRequest({getBaseUrl, getAccount, getProfile, getDeviceInfo});
	const pager = createSiloPager();
	const seriesNames = new Map();
	const kept = new Map();

	const keep = (key, lifeMs, read) => {
		const hit = kept.get(key);
		if (hit && hit.until > Date.now()) return hit.value;
		const value = read().catch((error) => {
			kept.delete(key);
			throw error;
		});
		kept.set(key, {until: Date.now() + lifeMs, value});
		return value;
	};

	const map = (json, options) => {
		const item = siloItemToJellyfin(json, {baseUrl: getBaseUrl(), ...options});
		if (item?.Type === 'Series') seriesNames.set(item.Id, item.Name);
		return item;
	};
	const mapAll = (entries, options) => entries.map((json) => map(json, options)).filter(Boolean);
	const seriesRef = (id) => ({id, name: seriesNames.get(id) || null});

	const libraries = () => keep('libraries', READ_LIFE_MS, async () => siloLibrariesToViews(itemsOf(await request('/user/libraries')), getBaseUrl()));

	const detail = async (itemId) => {
		const path = `/catalog/items/${encodeURIComponent(itemId)}`;
		const json = await request(path, {query: {image_size: DETAIL_IMAGES}});
		const type = json?.type || siloTypeOfId(itemId);
		// A title's detail can leave its files out, and they come from a route of their own.
		if ((type === 'movie' || type === 'episode') && !Array.isArray(json?.versions)) {
			json.versions = itemsOf(await request(`${path}/versions`, {query: {image_size: DETAIL_IMAGES}}));
		}
		return json;
	};

	const seasons = async (seriesId) => {
		const answer = await request(`/catalog/series/${encodeURIComponent(seriesId)}/seasons`, {query: {image_size: LIST_IMAGES, include_artwork: true}});
		return mapAll(itemsOf(answer), {type: 'season', series: seriesRef(seriesId)});
	};

	const seasonEpisodes = async (seasonId, series) => {
		const answer = await request(`/catalog/items/${encodeURIComponent(seasonId)}/episodes`, {query: {image_size: LIST_IMAGES}});
		return mapAll(itemsOf(answer), {type: 'episode', series});
	};

	const episodes = async (seriesId, seasonId) => {
		const series = seriesRef(siloTypeOfId(seriesId) === 'series' ? seriesId : parseSiloSeasonId(seasonId || seriesId)?.seriesId || seriesId);
		if (seasonId || siloTypeOfId(seriesId) === 'season') return seasonEpisodes(seasonId || seriesId, series);
		const ids = (await seasons(series.id)).map((season) => season.Id);
		const all = [];
		// A few seasons at a time, so a long show doesn't flood the server.
		for (let i = 0; i < ids.length; i += 4) {
			(await Promise.all(ids.slice(i, i + 4).map((id) => seasonEpisodes(id, series)))).forEach((found) => all.push(...found));
		}
		return all;
	};

	const getItem = async (itemId) => {
		if (isLibraryId(itemId)) {
			const library = (await libraries()).find((view) => view.Id === String(itemId).trim());
			if (library) return library;
			return siloPersonToJellyfin(await request(`/catalog/people/${encodeURIComponent(itemId)}`), getBaseUrl());
		}
		if (siloTypeOfId(itemId) === 'season') {
			const parsed = parseSiloSeasonId(itemId);
			const season = parsed ? (await seasons(parsed.seriesId)).find((s) => s.Id === itemId) : null;
			if (!season) throw Object.assign(new Error(`Silo has no season ${itemId}`), {status: 404});
			return season;
		}
		if (siloGenreNameOf(itemId)) return siloNamedItem(siloGenreNameOf(itemId), false);
		if (siloStudioNameOf(itemId)) return siloNamedItem(siloStudioNameOf(itemId), true);
		const item = map(await detail(itemId));
		if (!item) throw Object.assign(new Error(`Silo item ${itemId} has a type the app can't show`), {status: 404});
		return item;
	};

	// A few at a time, and an item that's gone is left out rather than failing the rest.
	const byIds = async (ids) => {
		const found = new Map();
		for (let i = 0; i < ids.length; i += 6) {
			await Promise.all(ids.slice(i, i + 6).map((id) => getItem(id).then((item) => found.set(id, item), () => null)));
		}
		return ids.map((id) => found.get(id)).filter(Boolean);
	};

	const searchCapabilities = () => keep('search', READ_LIFE_MS, () => request('/catalog/search/capabilities')
		.catch(() => ({state: 'available', allowed: true})));

	const layout = (libraryId) => {
		const base = libraryId ? `/library/${encodeURIComponent(libraryId)}` : '/home';
		return keep(`${base}/layout`, READ_LIFE_MS, async () => ({base, sections: (await request(`${base}/layout`))?.sections || []}));
	};

	// The cards of every section of one type on the Home page or a library's page, or null when there's no such section.
	const sectionCards = async (sectionType, libraryId) => {
		const {base, sections} = await layout(libraryId);
		const wanted = sections.filter((section) => section?.section_type === sectionType && section.id);
		if (!wanted.length) return null;
		const lists = await Promise.all(wanted.map((section) => {
			const path = `${base}/sections/${encodeURIComponent(section.id)}/items`;
			return keep(path, SECTION_LIFE_MS, async () => itemsOf(await request(path, {query: {image_size: LIST_IMAGES}})));
		}));
		const seen = new Set();
		return lists.flat().filter((card) => {
			if (typeof card?.content_id !== 'string' || seen.has(card.content_id)) return false;
			seen.add(card.content_id);
			return true;
		});
	};

	const resumeFromProgress = async (wanted) => {
		const entries = itemsOf(await request('/progress', {query: {status: 'in_progress', limit: Math.min(200, Math.max(1, wanted))}}))
			.filter((entry) => typeof entry.media_item_id === 'string');
		const found = await byIds(entries.map((entry) => entry.media_item_id));
		return found.filter((item) => RESUMABLE_TYPES.includes(siloTypeOf(item))).map((item) => {
			const entry = entries.find((e) => e.media_item_id === item.Id);
			return {...item, UserData: {...item.UserData, ...siloProgressToUserData(entry)}};
		});
	};

	const hidesWatchedOnHome = () => keep('hide-watched', READ_LIFE_MS, async () => {
		const answer = await request('/settings/values/effective', {query: {keys: 'home.hide_watched_items'}});
		return itemsOf(answer).some((setting) => setting.key === 'home.hide_watched_items' && setting.value === true);
	}).catch(() => false);

	// The newest titles of a library, or of every library: films by when they arrived, and shows by their newest episode.
	const newestScope = async (libraryId, includeItemTypes, episodesAsSeries) => {
		const types = siloTypesFor(includeItemTypes);
		if (types) {
			const listed = new Set([...types].map((t) => (t === 'season' || (episodesAsSeries && t === 'episode') ? 'series' : t)));
			return listed.size ? scopeFor(listed) || 'video' : null;
		}
		if (!libraryId) return 'video';
		const library = (await libraries().catch(() => [])).find((view) => view.Id === libraryId);
		return {movies: 'movie', tvshows: 'series'}[library?.CollectionType] || 'video';
	};

	const catalogPage = async (query, startIndex = 0, limit, keepItem = () => true) => {
		const signature = JSON.stringify(Object.keys(query).sort().map((key) => [key, query[key]]));
		const fetchPage = async ({cursor, seek, limit: size}) => siloPage(await request('/catalog', {query: {...query, cursor, seek, limit: size}}));
		const {items, total} = await pager.page({signature, startIndex, limit, fetchPage});
		return result(mapAll(items).filter(keepItem), total, startIndex);
	};

	const getItems = async (params = {}) => {
		const start = params.StartIndex || 0;
		const limit = params.Limit;
		const ids = list(params.Ids);
		if (ids.length) return slice(await byIds(ids), 0, limit);
		const parentId = params.ParentId ? String(params.ParentId) : null;
		const types = siloTypesFor(params.IncludeItemTypes);
		// A series' children are its seasons, or its episodes when those are what's asked for, and a season's are its episodes.
		if (parentId && siloTypeOfId(parentId) === 'series') {
			if (types?.has('episode') && !types.has('season')) {
				const flags = list(params.Filters).map((f) => f.toLowerCase());
				const all = (await episodes(parentId)).filter((e) => (!flags.includes('isplayed') || e.UserData.Played) && (!flags.includes('isunplayed') || !e.UserData.Played));
				return slice(all, start, limit);
			}
			return slice(await seasons(parentId), start, limit);
		}
		if (parentId && siloTypeOfId(parentId) === 'season') return slice(await episodes(parseSiloSeasonId(parentId)?.seriesId || parentId, parentId), start, limit);
		const libraryId = isLibraryId(parentId) ? parentId.trim() : null;
		const genreParent = siloGenreNameOf(parentId);
		const studioParent = siloStudioNameOf(parentId);
		if (parentId && !libraryId && !genreParent && !studioParent) return unsupported(`Listing the items of ${parentId}`);
		if (types && !types.size) return result([], 0, start);
		const searchText = String(params.SearchTerm || '').trim() || null;
		let scope = types ? scopeFor(types) : null;
		if (searchText) {
			const search = await searchCapabilities();
			if (!search.allowed || search.state !== 'available') return result([], 0, start);
			const wanted = types || new Set(['movie', 'series', 'episode']);
			if (search.video_with_episodes_scope && wanted.size > 1 && wanted.has('episode') && [...wanted].every((t) => t !== 'season')) scope = 'video_with_episodes';
		}
		const groups = siloRuleGroups({
			...params,
			Genres: [...list(params.Genres, '|'), ...(genreParent ? [genreParent] : [])],
			Studios: [...list(params.Studios, '|'), ...(studioParent ? [studioParent] : [])]
		});
		const personId = list(params.PersonIds)[0] || null;
		const nameStartsWith = String(params.NameStartsWith || '').trim();
		const query = {
			source: personId ? 'person' : undefined,
			person_id: personId || undefined,
			library_id: libraryId || undefined,
			q: searchText || undefined,
			type: scope || undefined,
			sort: siloSortFor(params.SortBy, params.SortOrder) || undefined,
			groups: groups.length ? JSON.stringify(groups) : undefined,
			name_prefix: nameStartsWith && nameStartsWith !== '#' ? nameStartsWith : undefined,
			image_size: LIST_IMAGES
		};
		const excluded = list(params.ExcludeItemTypes).map((t) => t.toLowerCase());
		const statuses = list(params.SeriesStatus);
		// A scope can be wider than the types asked for, so what wasn't asked for is dropped here.
		const keepItem = (item) => !excluded.includes(item.Type.toLowerCase()) &&
			(!statuses.length || item.Type !== 'Series' || statuses.includes(item.Status)) &&
			(types ? types.has(siloTypeOf(item)) : TITLE_TYPES.includes(siloTypeOf(item)));
		return catalogPage(query, start, limit, keepItem);
	};

	const getResumeItems = async (limit = 12) => {
		const cards = await sectionCards('continue_watching');
		const items = cards
			? mapAll(cards.filter((card) => card.item_source !== 'next_up' && RESUMABLE_TYPES.includes(card.type)))
			: await resumeFromProgress(limit);
		return slice(items, 0, limit);
	};

	const getNextUp = async (limit = 24, seriesId = null) => {
		const unwatched = (item) => item.UserData?.Played !== true;
		if (seriesId) {
			const next = siloTypeOfId(seriesId) === 'series' ? (await getItem(seriesId))[SILO_ORIGINAL]?.play_content_id : null;
			const episode = siloTypeOfId(next) === 'episode' ? await getItem(next) : null;
			return slice(episode && unwatched(episode) ? [episode] : [], 0, limit);
		}
		// Silo can put a Next Up card in Continue Watching, so both rows are read.
		const [watching, nextUp] = await Promise.all([sectionCards('continue_watching'), sectionCards('next_up')]);
		const seen = new Set();
		const cards = [...(watching || []).filter((card) => card.item_source === 'next_up'), ...(nextUp || [])].filter((card) => {
			if (card.type !== 'episode' || seen.has(card.content_id)) return false;
			seen.add(card.content_id);
			return true;
		});
		return slice(mapAll(cards).filter(unwatched), 0, limit);
	};

	const getLatest = async (libraryId, limit = 20) => {
		const scope = await newestScope(libraryId, null, true);
		if (!scope) return [];
		const hideWatched = await hidesWatchedOnHome();
		const page = await catalogPage({
			library_id: libraryId || undefined,
			type: scope,
			sort: scope === 'series' ? '-latest_episode_added' : '-added_at',
			groups: hideWatched ? JSON.stringify(siloRuleGroups({Filters: 'IsUnplayed'})) : undefined,
			image_size: LIST_IMAGES
		}, 0, limit);
		return page.Items;
	};

	const getRecentlyReleased = async (libraryId, limit = 20, includeItemTypes = 'Movie,Series') => {
		const scope = await newestScope(libraryId, includeItemTypes, false);
		if (!scope) return result([]);
		const now = new Date();
		const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const pad = (n) => String(n).padStart(2, '0');
		const releasedBy = {match: 'all', rules: [rule('release_date', 'lt', `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`)]};
		const hideWatched = await hidesWatchedOnHome();
		return catalogPage({
			library_id: libraryId || undefined,
			type: scope,
			sort: '-release_date',
			groups: JSON.stringify([releasedBy, ...(hideWatched ? siloRuleGroups({Filters: 'IsUnplayed'}) : [])]),
			image_size: LIST_IMAGES
		}, 0, limit);
	};

	const getGenres = async (libraryId, includeItemTypes = 'Movie,Series', sortBy, sortOrder = 'Ascending') => {
		const types = siloTypesFor(includeItemTypes);
		const filters = await request('/catalog/filters', {query: {
			library_id: isLibraryId(libraryId) ? String(libraryId).trim() : undefined,
			type: types && types.size ? scopeFor(types) || undefined : undefined
		}});
		const names = [...new Set(list(filters?.genres))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		if (String(sortOrder).toLowerCase() === 'descending') names.reverse();
		return result(names.map((name) => siloNamedItem(name, false)));
	};

	const changed = (itemId, patch) => () => userDataSync.publish(itemId, patch);

	// Silo keeps favorites, watched state and ratings on titles only.
	const titleId = (itemId, what) => {
		const id = String(itemId || '').trim();
		if (!id || isLibraryId(id) || siloGenreNameOf(id) || siloStudioNameOf(id)) {
			throw Object.assign(new Error(`Silo keeps ${what} on films, shows, seasons and episodes only`), {status: 501});
		}
		return encodeURIComponent(id);
	};

	const setStars = (itemId, stars) => request(`/ratings/${titleId(itemId, 'ratings')}`, {method: 'PUT', body: {rating: stars}})
		.then(changed(itemId, {Rating: stars * 2}));

	return {
		getLibraries: async () => result(await libraries()),
		getAllLibraries: async () => result(await libraries()),
		getItems,
		getItem,
		getItemForDetail: getItem,
		getItemWithChapters: getItem,
		getItemMediaInfo: getItem,
		getSeasons: async (seriesId) => result(await seasons(seriesId)),
		getEpisodes: async (seriesId, seasonId = null) => result(await episodes(seriesId, seasonId)),
		getResumeItems,
		getNextUp,
		getLatest,
		getRecentlyReleased,
		getGenres,
		getItemsByGenre: (genreId, libraryId, limit = 50) => getItems({ParentId: libraryId, GenreIds: genreId, IncludeItemTypes: 'Movie,Series', Limit: limit}),
		search: (query, limit = 240) => getItems({SearchTerm: query, Limit: limit, IncludeItemTypes: 'Movie,Series,Episode'}),
		getPerson: (personId) => getItem(personId),
		getItemsByPerson: (personId, limit = 100) => getItems({PersonIds: personId, Limit: limit, SortBy: 'PremiereDate', SortOrder: 'Descending'}),
		getFavorites: (limit = 50) => getItems({Filters: 'IsFavorite', Limit: limit, IncludeItemTypes: 'Movie,Series,Episode'}),
		getSimilar: async (itemId, limit = 15) => {
			const answer = await request(`/recommendations/similar/${encodeURIComponent(itemId)}`, {query: {limit}});
			return result(mapAll(itemsOf(answer)).filter((item) => TITLE_TYPES.includes(siloTypeOf(item))));
		},
		setFavorite: (itemId, isFavorite) => request(`/favorites/${titleId(itemId, 'favorites')}`, {method: isFavorite ? 'PUT' : 'DELETE'})
			.then(changed(itemId, {IsFavorite: isFavorite})),
		setWatched: (itemId, watched) => request(`/watched/${titleId(itemId, 'watched state')}`, {method: watched ? 'POST' : 'DELETE'})
			.then(changed(itemId, {Played: watched, PlayedPercentage: null, PlaybackPositionTicks: 0})),
		// Silo hides a title from Continue Watching only for the resume point it had, which its card names.
		hideFromResume: async (itemId) => {
			const card = (await sectionCards('continue_watching') || []).find((c) => c.content_id === itemId);
			if (!card?.progress_updated_at) throw Object.assign(new Error(`Silo has no resume point for ${itemId} to hide`), {status: 404});
			await request(`/home/dismissals/continue_watching/${encodeURIComponent(itemId)}`, {method: 'PUT', body: {progress_updated_at: card.progress_updated_at}});
			[...kept.keys()].filter((key) => key.includes('/sections/')).forEach((key) => kept.delete(key));
		},
		// Silo rates in whole stars from 1 to 5, and the app out of 10.
		setNumericRating: (itemId, rating) => setStars(itemId, Math.min(5, Math.max(1, Math.round(rating / 2)))),
		setRating: (itemId, likes) => setStars(itemId, likes ? 5 : 1),
		clearRating: (itemId) => request(`/ratings/${titleId(itemId, 'ratings')}`, {method: 'DELETE'}).then(changed(itemId, {Rating: null, Likes: null})),
		getServerInfo: () => ({serverUrl: getBaseUrl(), accessToken: getAccount?.()?.tokens?.accessToken || null, userId: getProfile?.()?.id || null})
	};
};
