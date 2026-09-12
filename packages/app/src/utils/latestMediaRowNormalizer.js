// Normalizes Latest Media items from Jellyfin.
// Jellyfin 12's /Items/Latest endpoint returns Season entities when an entire season
// of a multi-season show is added, or Episode entities when individual episodes are added.
// This normalizer collapses Season and Episode items into true Series cards with the
// show's ID, name, and primary artwork, matching Moonfin-Core.

export const latestMediaFetchLimitForCollection = (collectionType, defaultLimit = 16, maxLimit = 64) => {
	const normalizedType = collectionType?.toLowerCase();
	if (normalizedType === 'tvshows' || normalizedType === 'shows') {
		const expanded = defaultLimit * 2;
		return expanded > maxLimit ? maxLimit : expanded;
	}
	return defaultLimit;
};

export const seriesCardForLatestTvItem = (item) => {
	if (!item) return null;
	if (item.Type === 'Series') return item;
	if (item.Type !== 'Episode' && item.Type !== 'Season') return null;

	const seriesId = item.SeriesId || item.ParentId;
	const seriesName = item.SeriesName?.trim();
	if (!seriesId || !seriesName) return null;

	const seriesPrimaryImageTag = item.SeriesPrimaryImageTag || item.ParentPrimaryImageTag;
	const imageTags = {...(item.ImageTags || {})};
	if (seriesPrimaryImageTag) {
		imageTags.Primary = seriesPrimaryImageTag;
	}

	const normalized = {
		...item,
		Id: seriesId,
		Type: 'Series',
		Name: seriesName,
		ImageTags: imageTags,
		PrimaryImageTag: seriesPrimaryImageTag || item.PrimaryImageTag,
		PrimaryImageItemId: seriesId
	};

	delete normalized.IndexNumber;
	delete normalized.ParentIndexNumber;
	// Do not retain season/episode-specific ProviderIds on the synthetic series card
	delete normalized.ProviderIds;

	if (item.Type === 'Episode') {
		normalized.LatestEpisodeId = item.Id;
		normalized.LatestEpisodePrimaryImageTag = item.ImageTags?.Primary || item.PrimaryImageTag;
	}

	return normalized;
};

export const collapseLatestTvItems = (items) => {
	if (!Array.isArray(items)) return [];
	const collapsed = [];
	const seenIds = new Set();

	for (const item of items) {
		const normalized = seriesCardForLatestTvItem(item) || item;
		if (!seenIds.has(normalized.Id)) {
			seenIds.add(normalized.Id);
			collapsed.push(normalized);
		}
	}

	return collapsed;
};

export const normalizeLatestMediaItems = (items, {collectionType, limit = 16} = {}) => {
	if (!Array.isArray(items)) return [];
	const normalizedType = collectionType?.toLowerCase();
	const isTvCollection = normalizedType === 'tvshows' || normalizedType === 'shows';
	const hasTvItems = items.some((i) => i.Type === 'Episode' || i.Type === 'Season');
	const shouldCollapse = isTvCollection || (!normalizedType && hasTvItems);

	const normalized = shouldCollapse ? collapseLatestTvItems(items) : items;

	if (limit && normalized.length > limit) {
		return normalized.slice(0, limit);
	}
	return normalized;
};
