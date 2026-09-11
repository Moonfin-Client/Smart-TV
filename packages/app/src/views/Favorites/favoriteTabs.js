// A favorites query that does not name its types comes back without any people in
// it, so each tab asks for its own types rather than one query being split up
// afterwards.

import {getPrimaryImageId} from '../../utils/helpers';

export const FAVORITE_TABS = [
	{key: 'movie', label: 'Movies', types: 'Movie', cardType: 'portrait'},
	{key: 'series', label: 'Series', types: 'Series', cardType: 'portrait'},
	{key: 'episode', label: 'Episodes', types: 'Episode', cardType: 'landscape'},
	{key: 'collection', label: 'Collections', types: 'BoxSet', cardType: 'portrait'},
	{key: 'person', label: 'People', types: 'Person', cardType: 'circle'},
	{key: 'musicVideo', label: 'Music Videos', types: 'MusicVideo', cardType: 'portrait'},
	{key: 'artist', label: 'Artists', types: 'MusicArtist', cardType: 'circle'},
	{key: 'album', label: 'Albums', types: 'MusicAlbum', cardType: 'square'},
	{key: 'song', label: 'Songs', types: 'Audio', cardType: 'square'}
];

// Status draws the continuing or ended chip, MediaStreams the resolution chip, and
// the backdrop tags the picture behind the grid. Series names, album ids and parent
// backdrop tags all arrive without being asked for.
export const FAVORITE_TAB_FIELDS = 'ProductionYear,ImageTags,BackdropImageTags,ParentBackdropItemId,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData,Status,MediaStreams,AlbumPrimaryImageTag,ProviderIds';

// Multi server mode makes one query instead of nine, so it needs the types as a list.
export const FAVORITE_TAB_TYPES = FAVORITE_TABS.map((tab) => tab.types).join(',');

export const FAVORITE_TAB_PAGE_SIZE = 30;

const TYPE_TO_TAB = FAVORITE_TABS.reduce((map, tab) => {
	tab.types.split(',').forEach((type) => { map[type] = tab.key; });
	return map;
}, {});

export const tabKeyForType = (type) => TYPE_TO_TAB[type] || null;

export const bucketByTab = (items) => {
	const buckets = {};
	FAVORITE_TABS.forEach((tab) => { buckets[tab.key] = []; });
	(items || []).forEach((item) => {
		const key = tabKeyForType(item?.Type);
		if (key) buckets[key].push(item);
	});
	return buckets;
};

export const visibleTabs = (itemsByKey) => {
	return FAVORITE_TABS.filter((tab) => (itemsByKey?.[tab.key]?.length || 0) > 0);
};

// The selected tab disappears when its last favorite is removed, so the index
// settles onto whatever is still there.
export const clampTabIndex = (index, tabs) => {
	if (!tabs || tabs.length === 0) return 0;
	if (!(index >= 0)) return 0;
	return Math.min(index, tabs.length - 1);
};

// A square is short of its cell width by the margin the card carries, so the
// picture comes out as wide as it is tall.
const CARD_METRICS = {
	portrait: {
		posterHeight: {small: 200, medium: 270, large: 350, extraLarge: 440},
		itemSize: {
			small: {minWidth: 130, minHeight: 270},
			medium: {minWidth: 170, minHeight: 340},
			large: {minWidth: 220, minHeight: 430},
			extraLarge: {minWidth: 270, minHeight: 530}
		}
	},
	landscape: {
		posterHeight: {small: 120, medium: 160, large: 210, extraLarge: 260},
		itemSize: {
			small: {minWidth: 220, minHeight: 170},
			medium: {minWidth: 280, minHeight: 220},
			large: {minWidth: 360, minHeight: 280},
			extraLarge: {minWidth: 440, minHeight: 340}
		}
	},
	square: {
		posterHeight: {small: 200, medium: 260, large: 340, extraLarge: 420},
		itemSize: {
			small: {minWidth: 220, minHeight: 260},
			medium: {minWidth: 280, minHeight: 320},
			large: {minWidth: 360, minHeight: 400},
			extraLarge: {minWidth: 440, minHeight: 480}
		}
	}
};

CARD_METRICS.circle = CARD_METRICS.square;

export const cardMetrics = (cardType, imageSize) => {
	const shape = CARD_METRICS[cardType] || CARD_METRICS.portrait;
	return {
		posterHeight: shape.posterHeight[imageSize] || shape.posterHeight.medium,
		itemSize: shape.itemSize[imageSize] || shape.itemSize.medium
	};
};

// A song with no art of its own borrows the cover of the album it came off.
export const favoriteCardImage = (item, cardType) => {
	if (!item) return {imageId: null, imageType: 'Primary'};

	if (cardType === 'landscape' && item.ImageTags?.Thumb) {
		return {imageId: item.Id, imageType: 'Thumb'};
	}

	const primaryId = getPrimaryImageId(item);
	if (primaryId) return {imageId: primaryId, imageType: 'Primary'};

	if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
		return {imageId: item.AlbumId, imageType: 'Primary'};
	}

	return {imageId: null, imageType: 'Primary'};
};
