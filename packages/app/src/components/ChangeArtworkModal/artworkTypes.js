import $L from '@enact/i18n/$L';

// Lookups shared by the modal, its rows and its grid.

export const RESOLUTIONS = ['All', 'High (1080p+)', 'Medium (720p)', 'Low (<720p)'];

// Silo keeps a poster, backdrops and a logo, whatever the title.
const SILO_IMAGE_TYPES = ['Primary', 'Backdrop', 'Logo'];

export const getSupportedImageTypes = (itemType, serverType) => {
	if (serverType === 'silo') return SILO_IMAGE_TYPES;
	const type = itemType?.toLowerCase();
	switch (type) {
		case 'movie':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Art', 'Disc'];
		case 'series':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Art'];
		case 'season':
			return ['Primary', 'Backdrop', 'Banner'];
		case 'episode':
			return ['Primary'];
		case 'musicvideo':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb'];
		case 'trailer':
			return ['Primary', 'Backdrop', 'Thumb'];
		case 'boxset':
			return ['Primary', 'Backdrop', 'Banner', 'Logo', 'Thumb'];
		case 'playlist':
			return ['Primary', 'Backdrop'];
		case 'musicartist':
			return ['Primary', 'Backdrop', 'Banner', 'Logo'];
		case 'musicalbum':
			return ['Primary', 'Backdrop', 'Disc'];
		case 'audio':
			return ['Primary'];
		case 'book':
		case 'audiobook':
			return ['Primary'];
		case 'folder':
		case 'collectionfolder':
		case 'userview':
		case 'genre':
		case 'musicgenre':
			return ['Primary', 'Backdrop', 'Thumb'];
		default:
			return ['Primary', 'Backdrop'];
	}
};

// Genres have no provider to query, so the fetch is skipped for them.
export const hasRemoteImages = (itemType) => {
	const type = itemType?.toLowerCase();
	return type !== 'genre' && type !== 'musicgenre';
};

export const getCategoryDisplayName = (category, itemType) => {
	switch (category) {
		case 'Primary':
			return itemType?.toLowerCase() === 'episode' ? $L('Thumbnail') : $L('Poster');
		case 'Backdrop':
			return $L('Backdrops');
		case 'Banner':
			return $L('Banner');
		case 'Logo':
			return $L('Logo');
		case 'Thumb':
			return $L('Thumbnail');
		case 'Art':
			return $L('Art');
		case 'Disc':
			return $L('Disc Art');
		default:
			return category;
	}
};

// How wide the card renders, so we can ask a provider for a matching size. The
// height comes from the css size class below.
export const getRemoteImageWidth = (category, itemType) => {
	if (category === 'Primary') {
		return itemType?.toLowerCase() === 'episode' ? 280 : 160;
	}
	switch (category) {
		case 'Backdrop':
		case 'Thumb':
		case 'Screenshot':
			return 280;
		case 'Banner':
			return 350;
		case 'Logo':
		case 'Art':
			return 200;
		case 'Disc':
			return 160;
		default:
			return 160;
	}
};

// Card sizing lives in css rather than in inline style objects.
export const getCardSizeClass = (category, itemType) => {
	if (category === 'Primary') {
		return itemType?.toLowerCase() === 'episode' ? 'sizeWide' : 'sizePoster';
	}
	switch (category) {
		case 'Backdrop':
		case 'Thumb':
		case 'Screenshot':
			return 'sizeWide';
		case 'Banner':
			return 'sizeBanner';
		case 'Logo':
		case 'Art':
			return 'sizeLogo';
		case 'Disc':
			return 'sizeSquare';
		default:
			return 'sizePoster';
	}
};

export const getCurrentTags = (item, category) => {
	if (category === 'Backdrop') {
		return item.BackdropImageTags || [];
	}
	const tag = item.ImageTags?.[category];
	return tag ? [tag] : [];
};

// Backdrops are a list, so a delete needs the position. Every other category
// holds a single image and the server wants the index left off.
export const getDeleteIndex = (category, index) => (category === 'Backdrop' ? index : null);

// TMDB serves originals that are far larger than any card needs, so the url is
// swapped for the nearest size it offers.
export const getOptimizedRemoteImageUrl = (url, category, targetWidth) => {
	if (!url) return '';

	if (url.includes('image.tmdb.org/t/p/original/')) {
		if (targetWidth) {
			if (category === 'Backdrop' || category === 'Thumb' || category === 'Screenshot') {
				return targetWidth <= 780 ? url.replace('/original/', '/w780/') : url.replace('/original/', '/w1280/');
			} else if (category === 'Primary') {
				if (targetWidth <= 342) return url.replace('/original/', '/w342/');
				if (targetWidth <= 500) return url.replace('/original/', '/w500/');
				return url.replace('/original/', '/w780/');
			} else if (category === 'Logo' || category === 'Art') {
				return targetWidth <= 300 ? url.replace('/original/', '/w300/') : url.replace('/original/', '/w500/');
			}
		} else {
			if (category === 'Backdrop' || category === 'Thumb' || category === 'Screenshot') {
				return url.replace('/original/', '/w780/');
			} else if (category === 'Primary') {
				return url.replace('/original/', '/w342/');
			} else if (category === 'Logo' || category === 'Art') {
				return url.replace('/original/', '/w300/');
			}
		}
	}
	return url;
};

export const matchesResolution = (img, selectedResolution) => {
	if (selectedResolution === 'All') return true;
	const w = img.Width;
	const h = img.Height;
	if (!w || !h) return true;
	const maxDim = Math.max(w, h);
	if (selectedResolution === 'High (1080p+)') return maxDim >= 1080;
	if (selectedResolution === 'Medium (720p)') return maxDim >= 720 && maxDim < 1080;
	if (selectedResolution === 'Low (<720p)') return maxDim < 720;
	return true;
};

export const matchesLanguage = (img, uiLanguage) => {
	const lang = img.Language?.toLowerCase();
	if (!lang || lang === 'all' || lang === 'none' || lang === 'mul') return true;
	return lang === (uiLanguage || 'en').split('-')[0].toLowerCase();
};
