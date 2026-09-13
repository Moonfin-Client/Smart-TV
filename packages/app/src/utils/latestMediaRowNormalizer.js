// Jellyfin 12's /Items/Latest hands back a Season when a whole season is added, or an Episode when
// single ones are, so a Latest row reads "Season 1" where the show name belongs. These collapse
// those down to one card per show.

const isTvCollectionType = (collectionType) => {
	const normalized = collectionType?.toLowerCase();
	return normalized === 'tvshows' || normalized === 'shows';
};

export const latestMediaFetchLimitForCollection = (collectionType, defaultLimit = 16, maxLimit = 64) => {
	if (!isTvCollectionType(collectionType)) return defaultLimit;
	const expanded = defaultLimit * 2;
	return expanded > maxLimit ? maxLimit : expanded;
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
		PrimaryImageTag: seriesPrimaryImageTag || item.PrimaryImageTag
	};

	// What described the season goes with it, or a watched season would tick the whole show and one
	// episode's runtime would read as the show's.
	delete normalized.IndexNumber;
	delete normalized.ParentIndexNumber;
	delete normalized.ProviderIds;
	delete normalized.UserData;
	delete normalized.RunTimeTicks;

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
	const shouldCollapse = isTvCollectionType(collectionType) ||
		(!collectionType && items.some((i) => i.Type === 'Episode' || i.Type === 'Season'));

	const normalized = shouldCollapse ? collapseLatestTvItems(items) : items;

	if (limit && normalized.length > limit) {
		return normalized.slice(0, limit);
	}
	return normalized;
};
