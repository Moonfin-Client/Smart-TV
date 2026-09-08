import {HOME_ROW_ITEM_FIELDS} from './jellyfinApi';
import seerrApi from './seerrApi';
import {normalizeMediaItem} from '../utils/seerrHomeRows';

// Fields needed to score candidates without extra detail calls.
const CANDIDATE_FIELDS = 'Genres,Tags,People,UserData,OfficialRating,ProductionYear,CommunityRating,Studios';
const SEED_FIELDS = `${HOME_ROW_ITEM_FIELDS},Tags,People,Studios,SeriesId`;
const SERIES_SEED_FIELDS = `${HOME_ROW_ITEM_FIELDS},Tags,People,Studios`;

const SEQUEL_STOP_WORDS = new Set([
	'the', 'and', 'with', 'from', 'under', 'over', 'about', 'chapter', 'part', 'movie', 'film'
]);

function keyWords(title) {
	return String(title || '')
		.toLowerCase()
		.replace(/[^\w\s]/g, ' ')
		.split(/\s+/)
		.filter((word) => word.length >= 4 && !SEQUEL_STOP_WORDS.has(word));
}

// True when two titles share their meaningful words, so sequels and franchise
// entries score higher without matching something unrelated.
function isSequelOrSimilarTitle(titleA, titleB) {
	const a = keyWords(titleA);
	const b = keyWords(titleB);
	if (a.length === 0 || b.length === 0) return false;

	const setA = new Set(a);
	const setB = new Set(b);
	const containsAll = (big, small) => [...small].every((word) => big.has(word));
	if (containsAll(setA, setB) || containsAll(setB, setA)) return true;

	if (setA.size === 1 && setB.size === 1) {
		const short = a[0].length <= b[0].length ? a[0] : b[0];
		const long = a[0].length <= b[0].length ? b[0] : a[0];
		return long.startsWith(short) && long.length - short.length <= 2;
	}
	return false;
}

function namesOf(people, type) {
	return (people || []).filter((p) => p && p.Type === type).map((p) => p.Name).filter(Boolean);
}

function idsOf(people, type) {
	return (people || []).filter((p) => p && p.Type === type).map((p) => p.Id).filter(Boolean);
}

function studioNames(studios) {
	return (studios || []).map((s) => (s && typeof s === 'object' ? s.Name : s)).filter(Boolean);
}

function genreList(item) {
	return (item.Genres || []).map((g) => String(g)).filter(Boolean);
}

function tagList(item) {
	return (item.Tags || []).map((t) => String(t)).filter(Boolean);
}

function isPlayed(item) {
	return !!(item.UserData && item.UserData.Played === true);
}

function shuffle(items) {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = items[i];
		items[i] = items[j];
		items[j] = tmp;
	}
}

// Descending string compare that keeps the later date first.
function byDateDesc(dateA, dateB) {
	if (dateB < dateA) return -1;
	if (dateB > dateA) return 1;
	return 0;
}

function scoreCandidate(candidate, ctx) {
	let score = 0;

	const cGenres = new Set(genreList(candidate));
	for (const g of ctx.genres) if (cGenres.has(g)) score += 3;

	const cTags = new Set(tagList(candidate));
	for (const t of ctx.tags) if (cTags.has(t)) score += 3;

	const cPeople = candidate.People || [];
	const cActors = new Set(namesOf(cPeople, 'Actor'));
	const cDirectors = new Set(namesOf(cPeople, 'Director'));
	const cWriters = new Set(namesOf(cPeople, 'Writer'));
	for (const a of ctx.actorNames) if (cActors.has(a)) score += 5;
	for (const d of ctx.directorNames) if (cDirectors.has(d)) score += 6;
	for (const w of ctx.writerNames) if (cWriters.has(w)) score += 6;

	const cStudios = new Set(studioNames(candidate.Studios));
	for (const s of ctx.baseStudios) if (cStudios.has(s)) score += 3;

	const candYear = candidate.ProductionYear;
	if (typeof candYear === 'number' && typeof ctx.baseYear === 'number') {
		if (candYear === ctx.baseYear) score += 2;
		else if (Math.abs(candYear - ctx.baseYear) <= 3) score += 1;
	}

	if (isSequelOrSimilarTitle(ctx.baseName, candidate.Name || '')) score += 10;

	const comm = candidate.CommunityRating;
	if (typeof comm === 'number') score += comm / 10;

	return score;
}

// Local recommender. Pulls candidates that share the seeds genres, tags, or
// people, scores them, and returns the best matches sorted by score.
async function getRecommendations(api, seed, {includeWatched, candidateItemTypes, limit}) {
	const types = candidateItemTypes || (seed.Type === 'Series' ? 'Series' : 'Movie');
	const genres = genreList(seed);
	const tags = tagList(seed);
	const people = seed.People || [];
	const baseStudios = studioNames(seed.Studios);
	const baseYear = typeof seed.ProductionYear === 'number' ? seed.ProductionYear : null;
	const baseId = String(seed.Id || '');

	const ctx = {
		genres,
		tags,
		baseStudios,
		baseYear,
		baseName: seed.Name || '',
		actorNames: namesOf(people, 'Actor'),
		directorNames: namesOf(people, 'Director'),
		writerNames: namesOf(people, 'Writer')
	};

	const candidatesMap = new Map();
	const addItems = (items) => {
		for (const item of items || []) {
			const id = item && item.Id ? String(item.Id) : '';
			if (id) candidatesMap.set(id, item);
		}
	};

	const queries = [];
	if (genres.length) {
		queries.push(api.getItems({
			IncludeItemTypes: types,
			Genres: genres.join('|'),
			Recursive: true,
			Limit: 40,
			Fields: CANDIDATE_FIELDS
		}).then((res) => addItems(res && res.Items)).catch(() => {}));
	}
	if (tags.length) {
		queries.push(api.getItems({
			IncludeItemTypes: types,
			Tags: tags.join('|'),
			Recursive: true,
			Limit: 40,
			Fields: CANDIDATE_FIELDS
		}).then((res) => addItems(res && res.Items)).catch(() => {}));
	}
	const allPersonIds = [...idsOf(people, 'Director'), ...idsOf(people, 'Writer'), ...idsOf(people, 'Actor').slice(0, 10)];
	if (allPersonIds.length) {
		queries.push(api.getItems({
			IncludeItemTypes: types,
			PersonIds: allPersonIds.join(','),
			Recursive: true,
			Limit: 40,
			Fields: CANDIDATE_FIELDS
		}).then((res) => addItems(res && res.Items)).catch(() => {}));
	}
	await Promise.all(queries);

	const scored = [];
	for (const candidate of candidatesMap.values()) {
		const id = candidate.Id ? String(candidate.Id) : '';
		if (!id || id === baseId) continue;
		if (!includeWatched && isPlayed(candidate)) continue;
		scored.push({item: candidate, score: scoreCandidate(candidate, ctx)});
	}

	// Not enough matches, so pull recent titles in the same genres as filler.
	if (scored.length < 15) {
		try {
			const res = await api.getItems({
				IncludeItemTypes: types,
				Genres: genres.length ? genres.join('|') : undefined,
				Recursive: true,
				Limit: 30,
				SortBy: 'ProductionYear,SortName',
				SortOrder: 'Descending',
				Fields: CANDIDATE_FIELDS
			});
			for (const item of (res && res.Items) || []) {
				const id = item && item.Id ? String(item.Id) : '';
				if (!id || candidatesMap.has(id) || id === baseId) continue;
				if (!includeWatched && isPlayed(item)) continue;
				candidatesMap.set(id, item);
				scored.push({item, score: scoreCandidate(item, ctx)});
				if (scored.length >= 30) break;
			}
		} catch (_error) {
			// Filler is best effort.
		}
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return byDateDesc(a.item.PremiereDate || '', b.item.PremiereDate || '');
	});

	return scored.slice(0, limit).map((entry) => entry.item);
}

function seedItemTypes(sourceItem, sourceType) {
	if (sourceItem === 'recentlyWatched') {
		if (sourceType === 'movies') return 'Movie';
		if (sourceType === 'shows') return 'Episode';
		return 'Movie,Episode';
	}
	if (sourceType === 'movies') return 'Movie';
	if (sourceType === 'shows') return 'Series';
	return 'Movie,Series';
}

function candidateTypesFor(sourceType) {
	if (sourceType === 'movies') return 'Movie';
	if (sourceType === 'shows') return 'Series';
	return 'Movie,Series';
}

// Keep movies and series in order, dropping duplicate series.
function dedupeSeeds(rawItems) {
	const out = [];
	const addedSeries = new Set();
	for (const item of rawItems) {
		if (item.Type === 'Movie') {
			out.push(item);
		} else if (item.Type === 'Series') {
			const id = String(item.Id);
			if (!addedSeries.has(id)) {
				addedSeries.add(id);
				out.push(item);
			}
		}
	}
	return out;
}

// Watched episodes are replaced by their parent series so the seed represents a
// show, not a single episode.
async function resolveSeedEpisodes(api, rawItems) {
	const seriesIdsToFetch = [];
	const seenSeries = new Set();
	let hasEpisodes = false;
	for (const item of rawItems) {
		if (item.Type !== 'Episode') continue;
		const sId = item.SeriesId ? String(item.SeriesId) : '';
		if (!sId) continue;
		hasEpisodes = true;
		if (!seenSeries.has(sId)) {
			seenSeries.add(sId);
			seriesIdsToFetch.push(sId);
		}
	}
	if (!hasEpisodes) return dedupeSeeds(rawItems);

	const seriesMap = new Map();
	try {
		const seriesRes = await api.getItems({
			Ids: seriesIdsToFetch.join(','),
			Fields: SERIES_SEED_FIELDS
		});
		for (const series of (seriesRes && seriesRes.Items) || []) {
			if (series && series.Id) seriesMap.set(String(series.Id), series);
		}
	} catch (_error) {
		return rawItems;
	}

	const finalItems = [];
	const added = new Set();
	for (const item of rawItems) {
		if (item.Type === 'Movie') {
			finalItems.push(item);
		} else if (item.Type === 'Episode') {
			const sId = item.SeriesId ? String(item.SeriesId) : '';
			const series = sId ? seriesMap.get(sId) : null;
			if (series && !added.has(sId)) {
				added.add(sId);
				finalItems.push(series);
			}
		} else if (item.Type === 'Series') {
			const id = String(item.Id);
			if (!added.has(id)) {
				added.add(id);
				finalItems.push(item);
			}
		}
	}
	return finalItems;
}

async function loadSeeds(api, sourceItem, sourceType) {
	const includeItemTypes = seedItemTypes(sourceItem, sourceType);
	if (sourceItem === 'favorites') {
		const favRes = await api.getItems({
			Filters: 'IsPlayed,IsFavorite',
			Recursive: true,
			IncludeItemTypes: includeItemTypes,
			Limit: 30,
			Fields: SEED_FIELDS
		});
		return (favRes && favRes.Items) || [];
	}
	if (sourceItem === 'random') {
		const randomRes = await api.getItems({
			SortBy: 'Random',
			Filters: 'IsPlayed',
			Recursive: true,
			IncludeItemTypes: includeItemTypes,
			Limit: 30,
			Fields: SEED_FIELDS
		});
		return (randomRes && randomRes.Items) || [];
	}

	const res = await api.getItems({
		SortBy: 'DatePlayed',
		SortOrder: 'Descending',
		Filters: 'IsPlayed',
		Recursive: true,
		IncludeItemTypes: includeItemTypes,
		Limit: 30,
		Fields: SEED_FIELDS
	});
	return resolveSeedEpisodes(api, (res && res.Items) || []);
}

function filterRecommendedItems(items, includeWatched) {
	return (items || []).filter((item) => {
		if (!item || !item.Id) return false;
		if (!includeWatched && isPlayed(item)) return false;
		return true;
	});
}

// Builds one row per enabled index. Row N is seeded from the Nth item in the
// shared seed pool, so seeds are only fetched once.
export async function loadSinceYouWatchedRows(api, settings, enabledIndexes, onlineAllowed) {
	if (!enabledIndexes || enabledIndexes.length === 0) return [];

	const sourceItem = settings.sinceYouWatchedSourceItem || 'recentlyWatched';
	const sourceType = settings.sinceYouWatchedSourceType || 'movies';
	const includeWatched = settings.sinceYouWatchedIncludeWatched === true;
	const candidateItemTypes = candidateTypesFor(sourceType);
	const source = settings.sinceYouWatchedSource || 'local';
	const online = source === 'online' && onlineAllowed;
	const isServer = source === 'server';

	const seeds = await loadSeeds(api, sourceItem, sourceType);
	if (seeds.length === 0) return [];

	const rows = await Promise.all(
		enabledIndexes.map(async (idx) => {
			const seed = seeds[idx - 1];
			if (!seed) return null;

			if (online) {
				const onlineItems = await getOnlineRecommendations(settings, seed).catch(() => []);
				if (onlineItems.length) {
					return {
						id: `sinceyouwatched${idx}`,
						seedName: seed.Name || '',
						items: onlineItems,
						isSeerr: true
					};
				}
			}

			if (isServer && api.getSimilar) {
				try {
					const res = await api.getSimilar(seed.Id, 100, 'moonfin');
					const filtered = filterRecommendedItems(res && res.Items, includeWatched).slice(0, 15);
					if (filtered.length) {
						return {
							id: `sinceyouwatched${idx}`,
							seedName: seed.Name || '',
							items: filtered
						};
					}
				} catch (_e) {
					// Fall through to local
				}
			}

			if (api.getMoonfinSimilar) {
				try {
					const res = await api.getMoonfinSimilar(seed.Id, 100);
					const filtered = filterRecommendedItems(res && res.Items, includeWatched).slice(0, 15);
					if (filtered.length) {
						return {
							id: `sinceyouwatched${idx}`,
							seedName: seed.Name || '',
							items: filtered
						};
					}
				} catch (_e) {
					// Moonbase unavailable, fall back to client scoring
				}
			}

			const items = await getRecommendations(api, seed, {
				includeWatched,
				candidateItemTypes,
				limit: 15
			}).catch(() => []);
			if (!items.length) return null;
			return {
				id: `sinceyouwatched${idx}`,
				seedName: seed.Name || '',
				items
			};
		})
	);
	return rows.filter(Boolean);
}

// Online recommendations come from TMDB using the plugin synced key, falling back
// to the Seerr proxy. Results are normalized to the external card shape.
async function fetchTmdbRecommendations(tmdbApiKey, tmdbId, mediaType) {
	if (!tmdbApiKey) return [];
	try {
		let url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/recommendations?language=en-US&page=1`;
		const options = {};
		if (tmdbApiKey.startsWith('eyJ')) {
			options.headers = {Authorization: `Bearer ${tmdbApiKey}`};
		} else {
			url += `&api_key=${encodeURIComponent(tmdbApiKey)}`;
		}
		const res = await fetch(url, options);
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data && data.results) ? data.results : [];
	} catch (_error) {
		return [];
	}
}

async function fetchSeerrRecommendations(tmdbId, mediaType) {
	try {
		const res = mediaType === 'tv'
			? await seerrApi.getTvRecommendations(tmdbId)
			: await seerrApi.getMovieRecommendations(tmdbId);
		return Array.isArray(res && res.results) ? res.results : [];
	} catch (_error) {
		return [];
	}
}

export async function getOnlineRecommendations(settings, seed) {
	const tmdbId = seed.ProviderIds && seed.ProviderIds.Tmdb;
	if (!tmdbId) return [];
	const mediaType = seed.Type === 'Series' ? 'tv' : 'movie';

	let results = await fetchTmdbRecommendations(settings.tmdbApiKey, String(tmdbId), mediaType);
	if (!results.length) results = await fetchSeerrRecommendations(String(tmdbId), mediaType);

	return results.filter((item) => item && item.id).slice(0, 15).map(normalizeMediaItem);
}

// A series counts as fully watched only when nothing is left unplayed.
async function verifyFullyWatchedSeries(api, series) {
	const userData = series.UserData || {};
	const played = userData.Played === true;
	const unplayed = typeof series.UnplayedItemCount === 'number'
		? series.UnplayedItemCount
		: (typeof userData.UnplayedItemCount === 'number' ? userData.UnplayedItemCount : 0);
	if (!played || unplayed > 0) return null;

	try {
		const res = await api.getItems({
			ParentId: series.Id,
			IncludeItemTypes: 'Episode',
			Recursive: true,
			Filters: 'IsUnplayed',
			Limit: 1
		});
		const count = res && (typeof res.TotalRecordCount === 'number'
			? res.TotalRecordCount
			: ((res.Items || []).length));
		return count === 0 ? series : null;
	} catch (_error) {
		return series;
	}
}

// A collection counts as fully watched only when every child is played.
async function verifyFullyWatchedCollection(api, col) {
	try {
		const res = await api.getItems({
			ParentId: col.Id,
			Recursive: true,
			Fields: 'UserData'
		});
		const children = (res && res.Items) || [];
		if (children.length > 0 && children.every((c) => c.UserData && c.UserData.Played === true)) {
			let lastPlayed = '';
			for (const child of children) {
				const lp = (child.UserData && child.UserData.LastPlayedDate) || '';
				if (lp > lastPlayed) lastPlayed = lp;
			}
			return {col, isPlayed: true, lastPlayed};
		}
	} catch (_error) {
		// Treat as not fully watched.
	}
	return {col, isPlayed: false, lastPlayed: ''};
}

// A series card should open its first episode when selected.
async function resolveRewatchItem(api, item) {
	if (item.Type === 'Series') {
		try {
			const res = await api.getItems({
				ParentId: item.Id,
				IncludeItemTypes: 'Episode',
				Recursive: true,
				SortBy: 'SortName,ProductionYear',
				SortOrder: 'Ascending',
				Limit: 1,
				Fields: HOME_ROW_ITEM_FIELDS
			});
			const eps = (res && res.Items) || [];
			if (eps.length) return eps[0];
		} catch (_error) {
			// Fall back to the series item.
		}
	}
	return item;
}

// Gathers movies, series, and collections the user has fully watched.
export async function loadRewatchItems(api, settings) {
	const includeMovies = settings.rewatchIncludeMovies !== false;
	const includeShows = settings.rewatchIncludeShows !== false;
	const includeCollections = settings.rewatchIncludeCollections !== false;
	const sortBy = settings.rewatchSortBy || 'recentlyWatched';

	const watchedItems = [];
	const seriesLastPlayed = new Map();
	const collectionLastPlayed = new Map();

	if (includeMovies) {
		try {
			const res = await api.getItems({
				IncludeItemTypes: 'Movie',
				Filters: 'IsPlayed',
				SortBy: 'DatePlayed',
				SortOrder: 'Descending',
				Recursive: true,
				Limit: 50,
				Fields: `${HOME_ROW_ITEM_FIELDS},UserData`
			});
			for (const movie of (res && res.Items) || []) watchedItems.push(movie);
		} catch (_error) {
			// Skip movies on failure.
		}
	}

	if (includeShows) {
		try {
			const res = await api.getItems({
				IncludeItemTypes: 'Episode',
				Filters: 'IsPlayed',
				SortBy: 'DatePlayed',
				SortOrder: 'Descending',
				Recursive: true,
				Limit: 100,
				Fields: 'SeriesId,UserData'
			});
			const episodes = (res && res.Items) || [];
			const seriesIds = [];
			for (const ep of episodes) {
				const sId = ep.SeriesId ? String(ep.SeriesId) : '';
				if (!sId) continue;
				const lp = (ep.UserData && ep.UserData.LastPlayedDate) || '';
				if (lp) {
					const existing = seriesLastPlayed.get(sId) || '';
					if (lp > existing) seriesLastPlayed.set(sId, lp);
				}
				if (!seriesIds.includes(sId)) seriesIds.push(sId);
			}
			if (seriesIds.length) {
				const seriesRes = await api.getItems({
					Ids: seriesIds.join(','),
					Fields: `${HOME_ROW_ITEM_FIELDS},UserData`
				});
				const parsedSeries = (seriesRes && seriesRes.Items) || [];
				const checked = await Promise.all(parsedSeries.map((s) => verifyFullyWatchedSeries(api, s)));
				for (const series of checked) if (series) watchedItems.push(series);
			}
		} catch (_error) {
			// Skip shows on failure.
		}
	}

	if (includeCollections) {
		try {
			const res = await api.getItems({
				IncludeItemTypes: 'BoxSet',
				Recursive: true,
				Limit: 50,
				Fields: HOME_ROW_ITEM_FIELDS
			});
			const collections = (res && res.Items) || [];
			const infos = await Promise.all(collections.map((col) => verifyFullyWatchedCollection(api, col)));
			for (const info of infos) {
				if (info && info.isPlayed) {
					watchedItems.push(info.col);
					collectionLastPlayed.set(String(info.col.Id), info.lastPlayed);
				}
			}
		} catch (_error) {
			// Skip collections on failure.
		}
	}

	if (watchedItems.length === 0) return null;

	const lastPlayedOf = (item) => {
		const id = String(item.Id);
		if (item.Type === 'BoxSet' && collectionLastPlayed.has(id)) return collectionLastPlayed.get(id);
		if (item.Type === 'Series' && seriesLastPlayed.has(id)) return seriesLastPlayed.get(id);
		return (item.UserData && item.UserData.LastPlayedDate) || '';
	};

	if (sortBy === 'random') {
		shuffle(watchedItems);
	} else {
		watchedItems.sort((a, b) => byDateDesc(lastPlayedOf(a), lastPlayedOf(b)));
	}

	const top = watchedItems.slice(0, 15);
	const resolved = await Promise.all(top.map((item) => resolveRewatchItem(api, item)));
	return resolved.filter(Boolean);
}
