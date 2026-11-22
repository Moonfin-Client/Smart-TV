// The windowing itself is shared with the detail screen's rails, so it lives in utils and search
// keeps only the part that is its own.
export {
	CARD_WINDOW_EDGE,
	CARD_WINDOW_STEP,
	INITIAL_CARD_WINDOW,
	ROW_WINDOW_RADIUS,
	expandedCardCount,
	initialCardCount,
	shouldMountRow as shouldMountSearchRow
} from '../../utils/rowWindow';

// Which item's image a result card shows, and of what type. An episode, programme or recording with no still of
// its own shows its thumbnail, then its backdrop, then its series' thumbnail, backdrop or poster. A season with no
// poster shows its series', and a track its album's.
export const searchArtworkSource = (item) => {
	const primary = item.ImageTags?.Primary || item.PrimaryImageTag;
	if (primary) return {id: item.Id, type: 'Primary', tag: primary};
	const seriesPoster = item.SeriesId && item.SeriesPrimaryImageTag
		? {id: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag}
		: null;
	if (item.Type === 'Episode' || item.Type === 'Program' || item.Type === 'Recording') {
		if (item.ImageTags?.Thumb) return {id: item.Id, type: 'Thumb', tag: item.ImageTags.Thumb};
		if (item.BackdropImageTags?.length) return {id: item.Id, type: 'Backdrop', tag: item.BackdropImageTags[0]};
		if (item.ParentThumbItemId && item.ParentThumbImageTag) {
			return {id: item.ParentThumbItemId, type: 'Thumb', tag: item.ParentThumbImageTag};
		}
		if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
			return {id: item.ParentBackdropItemId, type: 'Backdrop', tag: item.ParentBackdropImageTags[0]};
		}
		if (seriesPoster) return seriesPoster;
	}
	if (item.Type === 'Season' && seriesPoster) return seriesPoster;
	if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
		return {id: item.AlbumId, type: 'Primary', tag: item.AlbumPrimaryImageTag};
	}
	return null;
};

export const searchArtworkOptions = (aspect, tag) => {
	const options = aspect === 'poster' ? {maxHeight: 300} : {maxWidth: 400};
	options.quality = 80;
	if (tag) options.tag = tag;
	return options;
};
