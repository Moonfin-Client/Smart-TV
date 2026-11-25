import {buildQueryString} from './urlCompat';
import {isPlexServer, plexImageUrl} from './plexUrls';
import {isSiloServer, siloImageUrl} from './siloUrls';

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

export const getImageUrl = (serverUrl, itemId, imageType = 'Primary', options = {}) => {
	if (serverUrl && isPlexServer(serverUrl)) return plexImageUrl(serverUrl, itemId, imageType, options);
	if (isSiloServer(serverUrl)) return siloImageUrl(serverUrl, itemId, imageType, options);
	if (!serverUrl || !itemId) return null;
	const params = {};
	if (options.maxWidth) params.maxWidth = options.maxWidth;
	if (options.maxHeight) params.maxHeight = options.maxHeight;
	if (options.quality) params.quality = options.quality;
	if (options.tag) params.tag = options.tag;
	const queryString = buildQueryString(params);
	return `${serverUrl}/Items/${itemId}/Images/${imageType}${queryString ? '?' + queryString : ''}`;
};

// Resolves Seerr or TMDB artwork, which can be absolute, protocol-relative, or a path on its server.
export const toAbsoluteImageUrl = (url, serverUrl) => {
	if (!url || typeof url !== 'string') return null;
	if (url.startsWith('http://') || url.startsWith('https://')) return url;
	if (url.startsWith('//')) return `https:${url}`;
	if (!serverUrl) return url;
	if (url.startsWith('/')) return `${serverUrl}${url}`;
	return `${serverUrl}/${url}`;
};

export const getBackdropId = (item) => {
	if (!item) return null;
	if (item.BackdropImageTags?.length > 0) {
		return item.Id;
	}
	// Episodes and seasons borrow their parent's backdrop.
	if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length > 0) {
		return item.ParentBackdropItemId;
	}
	return null;
};

// The tag of the backdrop getBackdropId picks. A tagged address names that exact picture, which
// Jellyfin lets the TV keep in its cache. Without one the server answers with a stale age, and the
// picture is fetched again on every view.
export const getBackdropTag = (item) => {
	const id = getBackdropId(item);
	if (!id) return undefined;
	return id === item.Id ? item.BackdropImageTags[0] : item.ParentBackdropImageTags[0];
};

// A media bar slide from an outside list brings its own backdrop, since the server has none.
export const getFeaturedBackdropUrl = (serverUrl, item, options) => (item?._external
	? item._externalBackdropUrl || null
	: getImageUrl(serverUrl, getBackdropId(item), 'Backdrop', {tag: getBackdropTag(item), ...options}));

export const getPrimaryImageId = (item) => {
	if (!item) return null;
	if (item.ImageTags?.Primary) {
		return item.Id;
	}
	if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
		return item.SeriesId;
	}
	if (item.Type === 'Season' && item.SeriesId && item.SeriesPrimaryImageTag) {
		return item.SeriesId;
	}
	return null;
};

export const getLogoUrl = (serverUrl, item, options = {}) => {
	if (!serverUrl || !item) return null;

	const maxWidth = options.maxWidth || 600;
	const quality = options.quality || 90;

	if (item.ImageTags?.Logo) {
		return getImageUrl(serverUrl, item.Id, 'Logo', {
			maxWidth,
			quality,
			tag: item.ImageTags.Logo
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

// The shorthand a video is known by, taken from what its stream measures. Both
// sides are checked because a scope film is short of the height its width would
// suggest, and a pillarboxed one is short of the width.
export const videoResolutionLabel = (item) => {
	const stream = (item?.MediaStreams || []).find((ms) => ms?.Type === 'Video');
	if (!stream) return null;

	const w = Number(stream.Width);
	const h = Number(stream.Height);
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

	const suffix = stream.IsInterlaced ? 'i' : 'p';

	if (w >= 7600 || h >= 4300) return '8K';
	if (w >= 3800 || h >= 2000) return '4K';
	if (w >= 2500 || h >= 1400) return `1440${suffix}`;
	if (w >= 1800 || h >= 1000) return `1080${suffix}`;
	if (w >= 1200 || h >= 700) return `720${suffix}`;
	if (w >= 600 || h >= 400) return `480${suffix}`;
	return 'SD';
};
