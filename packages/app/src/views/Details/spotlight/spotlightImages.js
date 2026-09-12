import {getImageUrl} from '../../../utils/helpers';

// Artwork for the summary cards and the hero. The grid cells inside a modal go through
// MediaCard, which resolves its own imagery, so only the pieces MediaCard never sees are
// worked out here.
//
// A Seerr title has no id the server would recognise, so asking it for artwork only 404s.
// Those items carry the TMDB url they were built with instead.
const isLibraryItem = (item) => Boolean(item) && !item._seerr;

// The poster for an item, falling back to the TMDB art a Seerr-only title carries.
export const spotlightItemImageUrl = (serverUrl, item) => {
	if (!item) return null;
	if (isLibraryItem(item) && item.ImageTags?.Primary) {
		return getImageUrl(serverUrl, item.Id, 'Primary', {maxHeight: 360, quality: 90, tag: item.ImageTags.Primary});
	}
	if (item._externalPosterUrl) return item._externalPosterUrl;

	// A collection reached through an ancestor record can arrive without its image tag while
	// the server still holds a primary image for it. Only box sets get the tagless request:
	// any folder with children would qualify otherwise, and one with no image at all would
	// fetch a 404 in place of its placeholder.
	if (isLibraryItem(item) && item.Type === 'BoxSet') {
		return getImageUrl(serverUrl, item.Id, 'Primary', {maxHeight: 360, quality: 90});
	}
	return null;
};

// A landscape thumbnail for an item, taking 16:9 artwork over a poster. Thumb first, then the
// item's own backdrop, then the one it inherits from its parent.
export const spotlightLandscapeImageUrl = (serverUrl, item, {maxWidth = 640, fallbackUrl = null} = {}) => {
	if (!item) return fallbackUrl;
	if (isLibraryItem(item)) {
		if (item.ImageTags?.Thumb) {
			return getImageUrl(serverUrl, item.Id, 'Thumb', {maxWidth, quality: 90, tag: item.ImageTags.Thumb});
		}
		if (item.BackdropImageTags?.length) {
			return getImageUrl(serverUrl, item.Id, 'Backdrop', {maxWidth, quality: 90, tag: item.BackdropImageTags[0]});
		}
		if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
			return getImageUrl(serverUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth, quality: 90, tag: item.ParentBackdropImageTags[0]});
		}
	}
	return item._externalBackdropUrl || fallbackUrl;
};

// The first item with landscape artwork, for a card that borrows a thumbnail from what
// it holds.
export const firstLandscapeImageUrl = (serverUrl, items = []) => {
	for (const item of items) {
		const url = spotlightLandscapeImageUrl(serverUrl, item);
		if (url) return url;
	}
	return null;
};

// The first item with a poster, for the same reason.
export const firstPosterImageUrl = (serverUrl, items = []) => {
	for (const item of items) {
		const url = spotlightItemImageUrl(serverUrl, item);
		if (url) return url;
	}
	return null;
};

// The chapter still a Chapters card leads with, which is the first chapter that has one.
export const firstChapterImageUrl = (serverUrl, item) => {
	const chapters = item?.Chapters || [];
	for (let i = 0; i < chapters.length; i++) {
		if (chapters[i].ImageTag) {
			return getImageUrl(serverUrl, item.Id, `Chapter/${i}`, {maxWidth: 480, quality: 90, tag: chapters[i].ImageTag});
		}
	}
	return null;
};
