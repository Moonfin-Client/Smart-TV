import {buildQueryString} from './urlCompat';

export const formatDuration = (ticks) => {
	if (!ticks) return '';
	const totalMinutes = Math.floor(ticks / 600000000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
};

export const formatDate = (dateString) => {
	if (!dateString) return '';
	const date = new Date(dateString);
	return date.toLocaleDateString();
};

export const getImageUrl = (serverUrl, itemId, imageType = 'Primary', options = {}) => {
	if (!serverUrl || !itemId) return null;
	const params = {};
	if (options.maxWidth) params.maxWidth = options.maxWidth;
	if (options.maxHeight) params.maxHeight = options.maxHeight;
	if (options.quality) params.quality = options.quality;
	if (options.tag) params.tag = options.tag;
	const queryString = buildQueryString(params);
	return `${serverUrl}/Items/${itemId}/Images/${imageType}${queryString ? '?' + queryString : ''}`;
};

export const getBackdropId = (item) => {
	if (!item) return null;
	// Only return ID if the item actually has backdrop images
	if (item.BackdropImageTags?.length > 0) {
		return item.Id;
	}
	// Check for parent backdrop (for episodes/seasons)
	if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length > 0) {
		return item.ParentBackdropItemId;
	}
	return null;
};

// Check if item has a Primary image and return the item ID to use
export const getPrimaryImageId = (item) => {
	if (!item) return null;
	// Item has its own Primary image
	if (item.ImageTags?.Primary) {
		return item.Id;
	}
	// Episode without image - use series image
	if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
		return item.SeriesId;
	}
	// Season without image - use series image
	if (item.Type === 'Season' && item.SeriesId && item.SeriesPrimaryImageTag) {
		return item.SeriesId;
	}
	return null;
};

// Check if item has any usable image
export const hasImage = (item, imageType = 'Primary') => {
	if (!item) return false;
	if (imageType === 'Primary') {
		return !!(item.ImageTags?.Primary || (item.SeriesId && item.SeriesPrimaryImageTag));
	}
	if (imageType === 'Backdrop') {
		return !!(item.BackdropImageTags?.length > 0 || (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length > 0));
	}
	return !!item.ImageTags?.[imageType];
};

export const getLogoUrl = (serverUrl, item, options = {}) => {
	if (!serverUrl || !item) return null;

	const maxWidth = options.maxWidth || 600;
	const quality = options.quality || 90;

	if (item.ImageTags?.Logo) {
		return getImageUrl(serverUrl, item.Id, 'Logo', {
			maxWidth,
			quality
		});
	}

	if (item.ParentLogoImageTag && item.ParentLogoItemId) {
		return getImageUrl(serverUrl, item.ParentLogoItemId, 'Logo', {
			maxWidth,
			quality,
			tag: item.ParentLogoImageTag
		});
	}

	return null;
};
