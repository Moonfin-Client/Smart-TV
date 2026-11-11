// The artwork Home's cards pick, kept out of the card components so the Settings preview can
// pick the same pictures without pulling the cards in.

import {getImageUrl, toAbsoluteImageUrl} from '../../utils/helpers';

// The wide artwork a row asked for, or null when the item carries none of it. Handing
// back the url rather than a yes or no is what keeps the card shape and the picture it
// ends up holding from ever disagreeing.
export const requestedArtwork = (item, imageType, serverUrl) => {
	if (imageType === 'backdrop') {
		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(serverUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
		}
		if (item.ParentBackdropItemId) {
			return getImageUrl(serverUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80});
		}
		if (item.ImageTags?.Thumb) {
			return getImageUrl(serverUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
		}
		// A title matched from an outside list keeps the list's backdrop when the library has no wide art for it.
		if (item._resolvedFromExternal && item._externalBackdropUrl) {
			return toAbsoluteImageUrl(item._externalBackdropUrl, serverUrl);
		}
	}
	if (imageType === 'thumb') {
		if (item.ImageTags?.Thumb) {
			return getImageUrl(serverUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
		}
		if (item.ParentThumbItemId) {
			return getImageUrl(serverUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 400, quality: 80});
		}
		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(serverUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
		}
	}
	if (imageType === 'banner') {
		if (item.ImageTags?.Banner) {
			return getImageUrl(serverUrl, item.Id, 'Banner', {maxWidth: 1200, quality: 80});
		}
		if (item.ImageTags?.Thumb) {
			return getImageUrl(serverUrl, item.Id, 'Thumb', {maxWidth: 1200, quality: 80});
		}
		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(serverUrl, item.Id, 'Backdrop', {maxWidth: 1200, quality: 80});
		}
	}
	if (imageType === 'logo') {
		if (item.ImageTags?.Logo) {
			return getImageUrl(serverUrl, item.Id, 'Logo', {maxWidth: 400, quality: 80});
		}
		if (item.ParentLogoItemId) {
			return getImageUrl(serverUrl, item.ParentLogoItemId, 'Logo', {maxWidth: 400, quality: 80});
		}
	}
	return null;
};

// The artwork an episode can show, each one carrying whether it's wide so the
// card can take its shape from the picture it ended up with. An episode still is
// its Primary image, episodes carry no Thumb tag of their own.
export const episodeArtwork = (item, serverUrl, imageType, useSeriesArt) => {
	const wide = (url) => (url ? {url, wide: true} : null);
	const seriesWide = (item.ParentThumbItemId
		&& wide(getImageUrl(serverUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 400, quality: 80})))
		|| (item.ParentBackdropItemId
			&& wide(getImageUrl(serverUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80})))
		|| null;
	const seriesPoster = item.SeriesId && item.SeriesPrimaryImageTag
		? {url: getImageUrl(serverUrl, item.SeriesId, 'Primary', {maxHeight: 300, quality: 80}), wide: false}
		: null;
	// Silo sends a Continue Watching episode's still as its backdrop, with the season poster as its poster.
	const still = wide(item.ImageTags?.Primary
		? getImageUrl(serverUrl, item.Id, 'Primary', {maxWidth: 400, quality: 80})
		: item.BackdropImageTags?.length > 0
			? getImageUrl(serverUrl, item.Id, 'Backdrop', {tag: item.BackdropImageTags[0], maxWidth: 400, quality: 80})
			: null);

	if (!useSeriesArt) return still || seriesWide || seriesPoster;
	// A poster row wants the series poster, anything wider wants the series thumb.
	const preferred = imageType === 'poster'
		? (seriesPoster || seriesWide)
		: (seriesWide || seriesPoster);
	return preferred || still;
};

// The art a modern card shows, at rest or focused.
export const modernCardImageUrl = (item, focused, {itemServerUrl, isStaticMyMedia, seerrWide, useSeriesThumbnails}) => {
	if (!item) return null;

	if (seerrWide) return toAbsoluteImageUrl(seerrWide, itemServerUrl);

	const providerIds = item.ProviderIds || {};
	const externalPoster = item._externalPosterUrl ||
		providerIds.SeerrPoster ||
		providerIds.SonarrPoster ||
		providerIds.RadarrPoster ||
		providerIds.LidarrPoster ||
		providerIds.ReadarrPoster;

	// A title the server owns shows the library's own art, with the outside poster as the
	// last resort further down.
	if ((item._external || externalPoster) && !item._resolvedFromExternal) {
		if (focused && item._externalBackdropUrl) {
			return toAbsoluteImageUrl(item._externalBackdropUrl, itemServerUrl);
		}
		if (externalPoster) {
			return toAbsoluteImageUrl(externalPoster, itemServerUrl);
		}
	}

	if (item.Type === 'Episode') {
		// An episode at rest wears its series poster. The image tag only names the
		// exact version when the server sent one, so a missing tag still asks the
		// series itself rather than letting a cropped episode still stand in.
		const seriesPosterId = (item.SeriesPrimaryImageTag && item.SeriesId) || item.ParentPrimaryImageItemId || item.SeriesId;
		const seriesPoster = seriesPosterId
			? getImageUrl(itemServerUrl, seriesPosterId, 'Primary', {maxHeight: 360, quality: 80})
			: null;
		const seriesThumb = item.ParentThumbItemId
			? getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 600, quality: 80})
			: null;
		const episodeThumb = item.ImageTags?.Primary
			? getImageUrl(itemServerUrl, item.Id, 'Primary', {maxWidth: 600, quality: 80})
			: item.ImageTags?.Thumb
				? getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80})
				: item.BackdropImageTags?.length > 0
					? getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 600, quality: 80})
					: item.ParentBackdropItemId
						? getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 600, quality: 80})
						: null;

		if (focused) {
			return (useSeriesThumbnails ? (seriesThumb || episodeThumb) : (episodeThumb || seriesThumb)) || seriesPoster;
		} else {
			return seriesPoster || episodeThumb || seriesThumb;
		}
	}

	if (item.Type === 'Genre' && item._representative) {
		const rep = item._representative;
		const repServerUrl = itemServerUrl;
		if (focused) {
			if (rep.ImageTags?.Thumb) {
				return getImageUrl(repServerUrl, rep.Id, 'Thumb', {maxWidth: 600, quality: 80});
			}
			if (rep.BackdropImageTags?.length > 0) {
				return getImageUrl(repServerUrl, rep.Id, 'Backdrop', {maxWidth: 600, quality: 80});
			}
		}
		if (rep.ImageTags?.Primary) {
			return getImageUrl(repServerUrl, rep.Id, 'Primary', {maxHeight: 360, quality: 80});
		}
	}

	if (item.Type === 'Movie' || item.Type === 'Series' || item.Type === 'BoxSet') {
		if (focused) {
			if (item.ImageTags?.Thumb) {
				return getImageUrl(itemServerUrl, item.Id, 'Thumb', {tag: item.ImageTags.Thumb, maxWidth: 600, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 600, quality: 80});
			}
			if (item.BackdropImageTags?.length > 0) {
				return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {tag: item.BackdropImageTags[0], maxWidth: 600, quality: 80});
			}
			if (item._externalBackdropUrl) {
				return toAbsoluteImageUrl(item._externalBackdropUrl, itemServerUrl);
			}
		}
		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {tag: item.ImageTags.Primary, maxHeight: 360, quality: 80});
		}
	}

	if (item.Type === 'CollectionFolder' || item.isLibraryTile) {
		if (isStaticMyMedia || focused) {
			if (item.ImageTags?.Thumb) {
				return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
			}
			if (item.BackdropImageTags?.length > 0) {
				return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 600, quality: 80});
			}
		}

		if (!isStaticMyMedia && item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
		}
		if (item.ImageTags?.Thumb) {
			return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
		}
		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxWidth: 600, quality: 80});
		}
	}

	if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
		return getImageUrl(itemServerUrl, item.AlbumId, 'Primary', {maxHeight: 360, quality: 80});
	}

	if (focused) {
		if (item.ImageTags?.Thumb) {
			return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
		}
		if (item.ParentThumbItemId) {
			return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 600, quality: 80});
		}
		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 600, quality: 80});
		}
	}

	if (item.ImageTags?.Primary) {
		return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
	}

	if (externalPoster) {
		return toAbsoluteImageUrl(externalPoster, itemServerUrl);
	}

	return null;
};
