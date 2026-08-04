import {memo, useCallback, useMemo, useRef, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {getImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';

import css from './MediaCard.module.less';

const SpottableDiv = Spottable('div');

const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4};
const BASE_SIZES = {portrait: [240, 360], landscape: [384, 216], square: [240, 240]};

const toAbsoluteImageUrl = (url, serverUrl) => {
	if (!url || typeof url !== 'string') return null;
	if (url.startsWith('http://') || url.startsWith('https://')) return url;
	if (url.startsWith('//')) return `https:${url}`;
	if (!serverUrl) return url;
	if (url.startsWith('/')) return `${serverUrl}${url}`;
	return `${serverUrl}/${url}`;
};

// The wide artwork a row asked for, or null when the item carries none of it. Handing
// back the url rather than a yes or no is what keeps the card shape and the picture it
// ends up holding from ever disagreeing.
const requestedArtwork = (item, imageType, serverUrl) => {
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
	}
	if (imageType === 'thumb') {
		if (item.ImageTags?.Thumb) {
			return getImageUrl(serverUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
		}
		if (item.ParentThumbItemId) {
			return getImageUrl(serverUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
		}
		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(serverUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
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

const MediaCard = ({item, serverUrl, cardType = 'portrait', rowImageType = 'poster', onSelect, onFocusItem, showServerBadge = false, showOverview = false, eagerLoad = false, spotlightId, onSpotlightLeft, onSpotlightRight}) => {
	const {settings} = useSettings();
	const focusTimeoutRef = useRef(null);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) {
				clearTimeout(focusTimeoutRef.current);
			}
		};
	}, []);

	const itemServerUrl = useMemo(() => {
		return item._serverUrl || serverUrl;
	}, [item._serverUrl, serverUrl]);

	// The row decides what its cards show, so anywhere else keeps posters. A genre card
	// draws on one of its own items, so that is where its artwork has to be looked for.
	const imageType = rowImageType || 'poster';
	const artworkItem = (item.Type === 'Genre' && item._representative) || item;
	const rowArtwork = requestedArtwork(artworkItem, imageType, itemServerUrl);
	const isLandscape = cardType === 'landscape' || (cardType === 'portrait' && Boolean(rowArtwork));
	// Artists read as circles in the music library. It rides on the square path
	// since the art is the same 1:1 either way, only the radius differs.
	const isCircle = cardType === 'circle';
	const isSquare = isCircle || cardType === 'square' || (cardType === 'portrait' && !isLandscape && (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'Audio'));

	const imageUrl = useMemo(() => {
		const providerIds = item.ProviderIds || {};
		const externalPoster = item._externalPosterUrl ||
			providerIds.SeerrPoster ||
			providerIds.SonarrPoster ||
			providerIds.RadarrPoster ||
			providerIds.LidarrPoster ||
			providerIds.ReadarrPoster;

		if (externalPoster && (item._external || !item.ImageTags?.Primary)) {
			return toAbsoluteImageUrl(externalPoster, itemServerUrl);
		}

		if (rowArtwork) return rowArtwork;

		if (item.Type === 'Genre' && item._representative && item._representative.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item._representative.Id, 'Primary', {maxHeight: 300, quality: 80});
		}

		if (isLandscape) {
			if (item.Type === 'Episode') {
				// A parent thumb id only arrives when the series really has one, so it is
				// the series image an episode can ask for without guessing.
				if (settings.useSeriesThumbnails && item.ParentThumbItemId) {
					return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
				}
				if (item.ImageTags?.Thumb) {
					return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
				}
				if (item.ParentThumbItemId) {
					return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
				}
				if (item.BackdropImageTags?.length > 0) {
					return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
				}
				if (item.ParentBackdropItemId) {
					return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80});
				}
				if (item.ImageTags?.Primary) {
					return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxWidth: 400, quality: 80});
				}
				if (item.SeriesId && item.SeriesPrimaryImageTag) {
					return getImageUrl(itemServerUrl, item.SeriesId, 'Primary', {maxHeight: 300, quality: 80});
				}
			} else {
				if (item.ImageTags?.Thumb) {
					return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
				}
				if (item.ParentThumbItemId) {
					return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
				}
				if (item.BackdropImageTags?.length > 0) {
					return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
				}
				if (item.ParentBackdropItemId) {
					return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80});
				}
				if (item.ImageTags?.Primary) {
					return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 300, quality: 80});
				}
			}
		}

		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 300, quality: 80});
		}

		if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
			return getImageUrl(itemServerUrl, item.AlbumId, 'Primary', {maxHeight: 300, quality: 80});
		}

		if (externalPoster) {
			return toAbsoluteImageUrl(externalPoster, itemServerUrl);
		}

		// The card shows its lettered placeholder rather than guessing at a url the
		// item already said it has nothing behind.
		return null;
	}, [isLandscape, item, itemServerUrl, rowArtwork, settings.useSeriesThumbnails]);

	const handleClick = useCallback(() => {
		onSelect?.(item);
	}, [item, onSelect]);

	const handleFocus = useCallback(() => {
		if (focusTimeoutRef.current) {
			clearTimeout(focusTimeoutRef.current);
		}
		focusTimeoutRef.current = setTimeout(() => {
			onFocusItem?.(item);
		}, 50);
	}, [item, onFocusItem]);

	const progress = item.UserData?.PlayedPercentage || 0;
	const watchedBehavior = settings.watchedIndicatorBehavior || 'always';
	const showIndicators = watchedBehavior === 'always' || watchedBehavior === 'hideCount' || (watchedBehavior === 'episodesOnly' && item.Type === 'Episode');

	const displayTitle = useMemo(() => {
		if (item.Type === 'Episode') {
			return item.SeriesName || item.Name;
		}
		return item.Name;
	}, [item.Type, item.SeriesName, item.Name]);

	const episodeInfo = useMemo(() => {
		if (item.Type === 'Episode' && item.ParentIndexNumber !== undefined) {
			return `S${item.ParentIndexNumber} E${item.IndexNumber} - ${item.Name}`;
		}
		return null;
	}, [item.Type, item.ParentIndexNumber, item.IndexNumber, item.Name]);

	const musicInfo = useMemo(() => {
		if (item.Type === 'MusicAlbum') {
			return item.AlbumArtist || item.AlbumArtists?.[0]?.Name || '';
		}
		if (item.Type === 'Audio') {
			return item.AlbumArtist || item.Artists?.[0] || '';
		}
		return null;
	}, [item.Type, item.AlbumArtist, item.AlbumArtists, item.Artists]);

	const cardClass = `${css.card} ${isLandscape ? css.landscape : isSquare ? css.square : css.portrait}${isCircle ? ' ' + css.circle : ''}${settings.cardFocusZoom ? '' : ' ' + css.noZoom}`;

	const sizeMultiplier = POSTER_SIZE_MULTIPLIERS[settings.homeRowsPosterSize] || 1;
	const shapeKey = isLandscape ? 'landscape' : isSquare ? 'square' : 'portrait';
	const [baseW, baseH] = BASE_SIZES[shapeKey];
	const cardWidth = Math.round(baseW * sizeMultiplier);
	const cardHeight = Math.round(baseH * sizeMultiplier);
	const sizeStyle = sizeMultiplier !== 1 ? {width: cardWidth + 'px'} : undefined;
	const imgSizeStyle = sizeMultiplier !== 1 ? {height: cardHeight + 'px'} : undefined;
	// A logo has to sit inside the card whole. Everything else takes the cover the
	// stylesheet already applies, so it stays out of the inline style.
	const imgStyle = imageType === 'logo'
		? {...imgSizeStyle, objectFit: 'contain'}
		: imgSizeStyle;

	return (
		<SpottableDiv className={cardClass} data-media-card onClick={handleClick} onFocus={handleFocus} style={sizeStyle} spotlightId={spotlightId} onSpotlightLeft={onSpotlightLeft} onSpotlightRight={onSpotlightRight}>
			<div className={css.imageContainer}>
				{imageUrl ? (
					<>
						<img
							className={css.image}
							src={imageUrl}
							alt={item.Name}
							loading={eagerLoad ? 'eager' : 'lazy'}
							width={cardWidth}
							height={cardHeight}
							style={imgStyle}
						/>
						{(item?.Type === 'Genre' || item?.Type === 'MusicGenre') && (
							<>
								<div className={css.genreOverlay} />
								<div className={css.genreTitle}>{item.Name?.toUpperCase()}</div>
							</>
						)}
					</>
				) : (
					<div className={css.placeholder} style={imgSizeStyle}>{item.Name?.[0]}</div>
				)}

				{showIndicators && progress > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${progress}%`}} />
					</div>
				)}

				{(showServerBadge || item._external) && item._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
				)}

				{item._seerr && [2, 3, 4, 5].includes(item.mediaInfo?.status) && (
					<div className={`${css.seerrBadge} ${css[`seerr${item.mediaInfo.status}`]}`} />
				)}

				{showIndicators && item.UserData?.Played && (
					<div className={css.watchedBadge}>
						<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					</div>
				)}
			</div>

			<div className={css.info}>
				{episodeInfo ? (
					<>
						<div className={css.seriesName}>{displayTitle}</div>
						<div className={css.episodeInfo}>{episodeInfo}</div>
						{showOverview && item.Overview && (
							<div className={css.overview}>{item.Overview}</div>
						)}
					</>
				) : musicInfo ? (
					<>
						<div className={css.title}>{displayTitle}</div>
						<div className={css.episodeInfo}>{musicInfo}</div>
					</>
				) : item.Subtitle ? (
					<>
						<div className={css.title}>{displayTitle}</div>
						<div className={css.episodeInfo}>{item.Subtitle}</div>
					</>
				) : (
					<div className={css.title}>{displayTitle}</div>
				)}
			</div>
		</SpottableDiv>
	);
};

export default memo(MediaCard);
