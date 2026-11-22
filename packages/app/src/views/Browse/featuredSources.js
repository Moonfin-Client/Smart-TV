import mapBounded from '../../utils/mapBounded';
import {shuffleArray} from '../Details/detailsMedia';
import {newMovieOf, recentEpisodes} from '../../utils/mediaBarNewRelease';
import {isWatchedForRecentRow} from '../../utils/latestMediaRowNormalizer';

const SOURCE_CONCURRENCY = 6;

// Reads the media bar's libraries or collections six at a time in a shuffled order, and skips a
// source still waiting for a slot once there are twice as many usable titles as the bar shows.
// The shuffle changes which ones get skipped from one load to the next.
export const readFeaturedSources = async (sourceIds, fetchSource, isUsable, count) => {
	const items = [];
	const seen = new Set();
	let usable = 0;
	await mapBounded(shuffleArray(sourceIds), SOURCE_CONCURRENCY, async (sourceId) => {
		if (usable >= count * 2) return;
		const result = await fetchSource(sourceId).catch(() => null);
		(result?.Items || []).forEach((item) => {
			if (seen.has(item.Id)) return;
			seen.add(item.Id);
			items.push(item);
			if (isUsable(item)) usable++;
		});
	});
	return items;
};

// The plugin's media bar cards leave out the ids the ratings look up and the season count, so one
// call fills them in. A field the plugin already sends wins, and a failed call keeps the cards as they are.
export const withBarFields = async (items, fetchItems) => {
	const res = await fetchItems({Ids: items.map((item) => item.Id).join(','), Fields: 'ProviderIds,ChildCount', EnableImages: false}).catch(() => null);
	const byId = new Map((res?.Items || []).map((item) => [item.Id, item]));
	return items.map((item) => ({ProviderIds: byId.get(item.Id)?.ProviderIds, ChildCount: byId.get(item.Id)?.ChildCount, ...item}));
};

const POOL_SIZE = 40;
const FIELDS = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers,OfficialRating,ChildCount,Taglines';
const INCLUDE_TYPES = {movies: 'Movie', tv: 'Series'};

// The series [children] belong to, in their order. Silo lists no seasons and answers a season request with the
// series themselves.
const seriesIdsOf = (children) => [...new Set(children.map((child) => (child.Type === 'Series' ? child.Id : child.SeriesId)).filter(Boolean))]
	.slice(0, POOL_SIZE);

// A null parentId reads every library. New Releases asks for the episodes, since a series' own date is its first
// season's, and for the movies that came out within their own window.
export const readDatedSource = async (api, sourceType, parentId, {contentType, days, movieDays, seriesType, count, hideWatched = false}) => {
	const includeTypes = INCLUDE_TYPES[contentType] || 'Movie,Series';
	const unwatched = (items) => (hideWatched ? items.filter((item) => !isWatchedForRecentRow(item)) : items);
	const now = new Date();
	// The server leaves watched ones out of these reads while Hide Watched is on.
	const released = async (types, limit, {sinceDays, unplayed = false} = {}) => (await api.getItems({
		ParentId: parentId,
		IncludeItemTypes: types,
		Recursive: true,
		SortBy: 'PremiereDate',
		SortOrder: 'Descending',
		MaxPremiereDate: now.toISOString(),
		MinPremiereDate: sinceDays ? new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000).toISOString() : null,
		Filters: unplayed ? 'IsUnplayed' : null,
		Limit: limit,
		Fields: FIELDS,
		EnableTotalRecordCount: false
	}))?.Items || [];
	const seriesOf = async (ids) => (ids.length ? (await api.getItems({Ids: ids.join(','), Fields: FIELDS, EnableTotalRecordCount: false}))?.Items || [] : []);

	if (sourceType === 'newReleases') {
		const [series, movies] = await Promise.all([
			contentType === 'movies' ? [] : recentEpisodes(api, parentId, days, 300).then((episodes) => seriesOf(seriesIdsOf(episodes))),
			contentType === 'tv' ? [] : released('Movie', POOL_SIZE, {sinceDays: movieDays, unplayed: hideWatched})
		]);
		// Silo ignores the date floor, so each movie is checked against the window again.
		return [...series, ...movies.filter((movie) => newMovieOf(movie, now, movieDays))];
	}
	if (sourceType === 'recentlyReleased') {
		const childType = contentType !== 'movies' && {season: 'Season', episode: 'Episode'}[seriesType];
		if (!childType) return unwatched(await released(includeTypes, POOL_SIZE));
		// Series by their latest season or episode, the way the home row reads them in that mode. Several share a
		// series, so more are read, and one show can fill that whole read, so a short answer is read again at the
		// home row's ceiling. A collection lists its shows but not their seasons or episodes, so it keeps its series.
		const latestSeries = async () => {
			const children = await released(childType, POOL_SIZE * 4, {unplayed: hideWatched});
			if (children.length === 0) return released('Series', POOL_SIZE, {unplayed: hideWatched});
			let ids = seriesIdsOf(children);
			if (ids.length < count && children.length >= POOL_SIZE * 4) {
				ids = seriesIdsOf(await released(childType, 500, {unplayed: hideWatched}).catch(() => children));
			}
			return seriesOf(ids);
		};
		const [series, movies] = await Promise.all([
			latestSeries(),
			contentType === 'tv' ? [] : released('Movie', POOL_SIZE, {unplayed: hideWatched})
		]);
		return unwatched([...series, ...movies]);
	}
	const latest = await api.getLatestItems({ParentId: parentId, IncludeItemTypes: includeTypes, Limit: POOL_SIZE, Fields: FIELDS});
	return Array.isArray(latest) ? unwatched(latest) : [];
};
