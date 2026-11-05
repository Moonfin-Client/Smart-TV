import $L from '@enact/i18n/$L';

import {getImageUrl} from '../../../utils/helpers';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {seriesThumbUrl} from '../detailsMedia';
import {getExtraCategoryLabel, groupExtrasByCategory} from '../extraCategories';

// The item types Minimalist draws. Everything else falls through to Spotlight, which already knows
// how to draw a person, an album or a playlist.
const MINIMALIST_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo'];

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
	icon: DETAIL_ICON_PATHS.videoLibraryOutlined,
	sections: groupExtrasByCategory(extras).map(({key, items}) => ({
		kind: 'media', title: getExtraCategoryLabel(key), count: items.length, items, aspect: 'landscape'
	}))
});

// A flat darkening over the artwork rather than a gradient.
//
// The other styles lay gradients under their text and can fade the picture all the way out.
// Minimalist puts the title and the buttons straight on it, so the darkening keeps a floor: at the
// bottom of the slider the screen is still readable rather than merely bright.
const MIN_ALPHA = 0.35;
const MAX_ALPHA = 0.85;

export const minimalistScrimAlpha = (blurAmount) => {
	const factor = Math.min(1, Math.max(0, Number(blurAmount ?? 20) / 25));
	return MIN_ALPHA + factor * (MAX_ALPHA - MIN_ALPHA);
};

// The text that stands in where the logo would go, for when the server has none to give.
//
// On an episode the show is named first and the episode's own name sits under it, so the artwork
// still says what you are in while the line below says which part of it.
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

// The picture for one episode card.
//
// Specials are the case worth knowing about: an episode outside a numbered season often has no
// still of its own, so the series thumbnail is all there is.
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
