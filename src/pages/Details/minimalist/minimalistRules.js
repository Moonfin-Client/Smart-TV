import $L from '../../../services/i18n.js';

import {getImageUrl} from '../../../utils/helpers';
import {seriesThumbUrl} from '../detailsMedia';
import {getExtraCategoryLabel, groupExtrasByCategory} from '../extraCategories';

// The item types Minimalist draws. Everything else falls through to the Spotlight style, which knows
// how to draw a person, an album or a playlist.
const MINIMALIST_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo', 'BoxSet'];

export const drawsMinimalist = (type) => MINIMALIST_TYPES.indexOf(type) >= 0;

// An episode carries the season tabs as well, so arriving on one still leaves the rest of the show
// a press away.
const TYPES_WITH_EPISODES = ['Series', 'Season', 'Episode'];

export const showsEpisodes = (type) => TYPES_WITH_EPISODES.indexOf(type) >= 0;

// A page without episodes has no rail to put extras in, so they open from a button in the row
// instead. Kids Mode keeps to its own fixed set of buttons. The list is already empty when the
// Extras section is switched off.
export const showsExtrasButton = (type, extras, kidsMode) =>
	!showsEpisodes(type) && !kidsMode && extras.length > 0;

// What the Extras button opens, one widescreen grid per kind of extra.
export const minimalistExtrasCard = (extras) => ({
	id: 'extras',
	title: $L('Extras'),
	icon: 'videoLibraryOutlined',
	sections: groupExtrasByCategory(extras).map(({key, items}) => ({
		kind: 'media', title: getExtraCategoryLabel(key), count: items.length, items, aspect: 'landscape'
	}))
});

// What a collection's own button opens, one poster grid per kind of title it holds.
export const minimalistCollectionCard = (item, groups) => ({
	id: 'collection',
	title: item.Name,
	icon: 'collectionsBookmarkOutlined',
	sections: groups.map((group) => ({
		kind: 'media', title: group.title, count: group.items.length, items: group.items, aspect: 'portrait'
	}))
});

// A flat darkening rather than a gradient, since the title and buttons sit straight on the
// artwork. It keeps a floor, so the bottom of the slider still leaves the screen readable.
const MIN_ALPHA = 0.35;
const MAX_ALPHA = 0.85;

export const minimalistScrimAlpha = (blurAmount) => {
	const factor = Math.min(1, Math.max(0, Number(blurAmount ?? 20) / 25));
	return MIN_ALPHA + factor * (MAX_ALPHA - MIN_ALPHA);
};

// The text in the logo's place when the server has none. An episode names the show first and its
// own name under it.
export const minimalistBranding = (item) => {
	const isEpisode = item?.Type === 'Episode';
	const named = isEpisode || item?.Type === 'Season' ? item?.SeriesName : null;
	return {
		title: named || item?.Name || '',
		episodeName: isEpisode ? item?.Name || '' : ''
	};
};

// The episode's own still, opposite the title. Only ever its own picture: the show's artwork here
// would put a second copy of the backdrop on screen, and the series thumbnail setting exists to
// keep stills out of sight, so with it on there is nothing to show.
export const minimalistStillUrl = (serverUrl, item, {settings, width}) => {
	if (item?.Type !== 'Episode' || settings?.detailUseSeriesThumbnails) return null;
	const tag = item.ImageTags?.Primary;
	if (!tag) return null;
	return getImageUrl(serverUrl, item.Id, 'Primary', {maxWidth: Math.round(width * 2), quality: 90, tag});
};

// A special often has no still of its own, so the series thumbnail stands in.
export const minimalistCardUrl = (serverUrl, episode, {settings, cardWidth}) => {
	const options = {maxWidth: Math.round(cardWidth * 2), quality: 90};

	if (settings?.detailUseSeriesThumbnails) {
		const series = seriesThumbUrl(serverUrl, episode, options);
		if (series) return series;
	}
	const own = episode?.ImageTags?.Primary;
	if (own) return getImageUrl(serverUrl, episode.Id, 'Primary', {...options, tag: own});
	return seriesThumbUrl(serverUrl, episode, options);
};
