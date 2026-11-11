// Jellyfin 12's /Items/Latest hands back a Season when a whole season is added, or an Episode when
// single ones are, so a Latest row reads "Season 1" where the show name belongs. These collapse
// those down to one card per show.

const isTvCollectionType = (collectionType) => {
	const normalized = collectionType?.toLowerCase();
	return normalized === 'tvshows' || normalized === 'shows';
};

// Hiding watched titles reads four times the row, so the row still fills.
export const latestMediaFetchLimitForCollection = (collectionType, defaultLimit = 16, maxLimit = 64, hideWatched = false) => {
	if (!hideWatched && !isTvCollectionType(collectionType)) return defaultLimit;
	const expanded = defaultLimit * (hideWatched ? 4 : 2);
	return expanded > maxLimit ? maxLimit : expanded;
};

// A show counts as watched once none of its episodes are left, unless it has no episodes at all.
export const isWatchedForRecentRow = (item) => {
	const userData = item?.UserData;
	if (!userData) return false;
	if (userData.Played === true) return true;
	const unplayed = Number(userData.UnplayedItemCount);
	const children = item.ChildCount == null ? null : Number(item.ChildCount);
	return (item.Type === 'Series' || item.Type === 'Season') && userData.UnplayedItemCount != null &&
		unplayed <= 0 && (children == null || children > 0);
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

export const normalizeLatestMediaItems = (items, {collectionType, limit = 16, hideWatched = false} = {}) => {
	if (!Array.isArray(items)) return [];
	const source = hideWatched ? items.filter((item) => !isWatchedForRecentRow(item)) : items;
	const shouldCollapse = isTvCollectionType(collectionType) ||
		(!collectionType && source.some((i) => i.Type === 'Episode' || i.Type === 'Season'));

	const normalized = shouldCollapse ? collapseLatestTvItems(source) : source;

	if (limit && normalized.length > limit) {
		return normalized.slice(0, limit);
	}
	return normalized;
};
