import mapBounded from '../../utils/mapBounded';
import {shuffleArray} from '../Details/detailsMedia';
import {recentEpisodes} from '../../utils/mediaBarNewRelease';

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

const POOL_SIZE = 40;
const FIELDS = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers,OfficialRating';
const INCLUDE_TYPES = {movies: 'Movie', tv: 'Series'};

// A null parentId reads every library. New Seasons & Episodes asks for the episodes, since a
// series' own date is its first season's.
export const readDatedSource = async (api, sourceType, parentId, {contentType, days}) => {
	const includeTypes = INCLUDE_TYPES[contentType] || 'Movie,Series';
	if (sourceType === 'newReleases') {
		// Movies only, so nothing here. The bar falls back to random titles.
		if (contentType === 'movies') return [];
		const episodes = await recentEpisodes(api, parentId, days, 300);
		const seriesIds = [...new Set(episodes.map((episode) => episode.SeriesId).filter(Boolean))].slice(0, POOL_SIZE);
		if (seriesIds.length === 0) return [];
		return (await api.getItems({Ids: seriesIds.join(','), Fields: FIELDS, EnableTotalRecordCount: false}))?.Items || [];
	}
	if (sourceType === 'recentlyReleased') {
		return (await api.getItems({
			ParentId: parentId,
			IncludeItemTypes: includeTypes,
			Recursive: true,
			SortBy: 'PremiereDate',
			SortOrder: 'Descending',
			MaxPremiereDate: new Date().toISOString(),
			Limit: POOL_SIZE,
			Fields: FIELDS,
			EnableTotalRecordCount: false
		}))?.Items || [];
	}
	const latest = await api.getLatestItems({ParentId: parentId, IncludeItemTypes: includeTypes, Limit: POOL_SIZE, Fields: FIELDS});
	return Array.isArray(latest) ? latest : [];
};
