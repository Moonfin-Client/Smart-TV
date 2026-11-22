// Groups the playlist library by what each playlist holds. The summary answers
// for most of them, and the rest are settled by reading their items.

import $L from '@enact/i18n/$L';

export const PLAYLIST_CATEGORIES = ['Video', 'MusicVideo', 'Audio', 'AudioBook', 'Book', 'Photo', 'Mixed'];

// How many of a playlist's items are read to classify it. One whose types only diverge past
// this many is binned by that sample.
export const PLAYLIST_SAMPLE_SIZE = 200;

export const playlistCategoryLabel = (category) => {
	switch (category) {
		case 'Video': return $L('Video Playlists');
		case 'MusicVideo': return $L('Music Video Playlists');
		case 'Audio': return $L('Audio Playlists');
		case 'AudioBook': return $L('Audiobook Playlists');
		case 'Book': return $L('Book Playlists');
		case 'Photo': return $L('Photo Playlists');
		default: return $L('Mixed Playlists');
	}
};

const categoryForMediaType = (mediaType) => {
	switch (mediaType) {
		case 'Video': return 'Video';
		case 'Audio': return 'Audio';
		case 'Book': return 'Book';
		case 'Photo': return 'Photo';
		default: return 'Unknown';
	}
};

// The category an individual item belongs to. Its concrete Type wins over
// MediaType, which reports a music video as Audio and cant tell an audiobook
// from a song.
export const resolveItemMediaType = (item) => {
	switch (item?.Type) {
		case 'MusicVideo': return 'MusicVideo';
		case 'Movie':
		case 'Episode':
		case 'Video':
		case 'Trailer':
		case 'Clip':
			return 'Video';
		case 'AudioBook': return 'AudioBook';
		case 'Audio': return 'Audio';
		case 'Book': return 'Book';
		case 'Photo': return 'Photo';
		default: return categoryForMediaType(item?.MediaType);
	}
};

// A playlist without counts is treated as holding something, so it gets judged
// by its items rather than written off as empty.
const isPlaylistNonEmpty = (item) => {
	const count = item.ChildCount ?? item.RecursiveItemCount;
	return count == null ? true : count > 0;
};

// Whether the summary alone can settle the category. Book and Photo are specific
// enough to take at face value. Video and Audio arent, since the server calls
// both music and audiobooks Audio, tags a playlist of music videos either Audio
// or Video, and gives a music video playlist the same summary as a movie one.
export const playlistNeedsItemCheck = (item) => {
	if (item.Type !== 'Playlist' || !isPlaylistNonEmpty(item)) return false;
	const summary = categoryForMediaType(item.MediaType);
	return summary !== 'Book' && summary !== 'Photo';
};

// The category the summary suggests, used until an item check can improve on it
export const playlistSummaryCategory = (item) => {
	if (item.Type !== 'Playlist') return resolveItemMediaType(item);
	if (!isPlaylistNonEmpty(item)) return 'Mixed';
	const summary = categoryForMediaType(item.MediaType);
	return summary === 'Unknown' ? 'Mixed' : summary;
};

// The category a playlist earns from its actual items, one kind or Mixed. Music
// videos with songs among them still make a music video playlist.
export const playlistCategoryFromItems = (items) => {
	if (!items || !items.length) return 'Mixed';
	const categories = [];
	for (let i = 0; i < items.length; i++) {
		const category = resolveItemMediaType(items[i]);
		if (categories.indexOf(category) === -1) categories.push(category);
	}
	if (categories.indexOf('MusicVideo') !== -1 &&
		categories.every((category) => category === 'MusicVideo' || category === 'Audio')) {
		return 'MusicVideo';
	}
	if (categories.length === 1) return categories[0] === 'Unknown' ? 'Mixed' : categories[0];
	return 'Mixed';
};

// Anything outside the known sections lands in Mixed rather than vanishing.
export const playlistCategory = (item, resolvedCategories) => {
	const resolved = resolvedCategories[item.Id] || playlistSummaryCategory(item);
	return PLAYLIST_CATEGORIES.indexOf(resolved) !== -1 ? resolved : 'Mixed';
};

export const groupPlaylists = (playlists, resolvedCategories) => {
	const buckets = {};
	for (let i = 0; i < (playlists || []).length; i++) {
		const item = playlists[i];
		const category = playlistCategory(item, resolvedCategories);
		if (!buckets[category]) buckets[category] = [];
		buckets[category].push(item);
	}
	const groups = [];
	for (let i = 0; i < PLAYLIST_CATEGORIES.length; i++) {
		const category = PLAYLIST_CATEGORIES[i];
		if (buckets[category]) {
			groups.push({name: playlistCategoryLabel(category), items: buckets[category]});
		}
	}
	return groups;
};
