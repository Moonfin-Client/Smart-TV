import {memo, useCallback, useMemo, useRef, useEffect, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {getImageUrl, toAbsoluteImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';
import {SeerrSeasonDot} from '../seerr/SeerrStatusBadge';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle, seerrTitleStatus} from '../seerr/SeerrStatusBanner';
import {showsWatchedCheck} from '../../utils/playedState';
import SeerrIcon from '../icons/SeerrIcon';
import {AnimeCardPill} from '../AnimeMarkerPills';
import IncompleteBadge from '../IncompleteBadge';
import PosterLabels from '../PosterLabels';
import LoopMarquee from '../LoopMarquee';
import useItemMenuHold from '../../hooks/useItemMenuHold';
import useImageReveal, {pendingArtStyle} from '../../hooks/useImageReveal';
import {isUnownedSeerrTitle, seerrThumbUrl, seerrWideArtUrl, useTmdbThumbsAvailable} from '../../utils/tmdbThumb';
import {useMediaPreviewSlot} from './MediaPreviewContext';

import css from './MediaCard.module.less';

const SpottableDiv = Spottable('div');

const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4, grandparents: 2};
const BASE_SIZES = {portrait: [240, 360], landscape: [384, 216], square: [240, 240], banner: [1168, 216]};

// How big a card of each shape draws, grown or shrunk by the poster size setting.
export const classicCardSize = (shape, posterSize) => {
	const multiplier = POSTER_SIZE_MULTIPLIERS[posterSize] || 1;
	const [width, height] = BASE_SIZES[shape];
	return {width: Math.round(width * multiplier), height: Math.round(height * multiplier)};
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

// The artwork an episode can show, each one carrying whether it is wide so the
// card can take its shape from the picture it ended up with. An episode still is
// its Primary image, episodes carry no Thumb tag of their own.
const episodeArtwork = (item, serverUrl, imageType, useSeriesArt) => {
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

const MediaCard = ({item, serverUrl, cardType = 'portrait', rowImageType = 'poster', onSelect, onFocusItem, showServerBadge = false, eagerLoad = false, deferImage = false, seerrSeasonStatus, spotlightId, onSpotlightLeft, onSpotlightRight, menuOptions, size, current = false, homeText = false, overlay = null, showInfo = true, posterLabels = false}) => {
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
	// A Seerr or outside list title has no library art, so a thumb row shows the titled
	// thumb the plugin picks for it, or its plain backdrop, and turns landscape like a
	// library thumb. A thumb that fails to load hands over to the backdrop.
	const [failedThumb, setFailedThumb] = useState(null);
	const wantsSeerrWide = imageType === 'thumb' && (cardType === 'portrait' || cardType === 'landscape') && isUnownedSeerrTitle(item);
	useTmdbThumbsAvailable(wantsSeerrWide);
	const seerrThumb = wantsSeerrWide ? seerrThumbUrl(item) : null;
	const seerrWide = wantsSeerrWide ? toAbsoluteImageUrl(seerrWideArtUrl(item, failedThumb), itemServerUrl) : null;
	const isBanner = imageType === 'banner' && cardType !== 'square' && cardType !== 'circle';
	// An episode is the one item the series switch speaks for, so its picture is
	// picked here instead of taking whatever wide art the row asked for. A banner
	// row is left alone because that artwork is the row's own shape.
	const episodeArt = (item.Type === 'Episode' && !isBanner)
		? episodeArtwork(item, itemServerUrl, imageType, settings.useSeriesThumbnails)
		: null;
	// The url rather than the object, so the memo below still holds between renders.
	const episodeArtUrl = episodeArt?.url || null;
	const wideArtwork = episodeArt ? episodeArt.wide : Boolean(rowArtwork || seerrWide);
	const isLandscape = !isBanner && (cardType === 'landscape' || (cardType === 'portrait' && wideArtwork));
	// Artists read as circles in the music library. It rides on the square path
	// since the art is the same 1:1 either way, only the radius differs.
	const isCircle = cardType === 'circle';
	const isSquare = !isBanner && (isCircle || cardType === 'square' || (cardType === 'portrait' && !isLandscape && (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'Audio')));

	const imageUrl = useMemo(() => {
		if (item._studioLogoUrl) return item._studioLogoUrl;
		// Ahead of the external poster, which would otherwise keep the card a poster.
		if (seerrWide) return seerrWide;

		const providerIds = item.ProviderIds || {};
		const externalPoster = item._externalPosterUrl ||
			providerIds.SeerrPoster ||
			providerIds.SonarrPoster ||
			providerIds.RadarrPoster ||
			providerIds.LidarrPoster ||
			providerIds.ReadarrPoster;

		// A title the server owns shows the library's own art.
		if (externalPoster && ((item._external && !item._resolvedFromExternal) || !item.ImageTags?.Primary)) {
			return toAbsoluteImageUrl(externalPoster, itemServerUrl);
		}

		if (episodeArtUrl) return episodeArtUrl;

		if (rowArtwork) return rowArtwork;

		if (item.Type === 'Genre' && item._representative && item._representative.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item._representative.Id, 'Primary', {maxHeight: 300, quality: 80});
		}

		if (isLandscape) {
			if (item.ImageTags?.Thumb) {
				return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {tag: item.ParentThumbImageTag, maxWidth: 400, quality: 80});
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
	}, [isLandscape, item, itemServerUrl, rowArtwork, episodeArtUrl, seerrWide]);

	const {shown: artShown, bind: artBind} = useImageReveal(deferImage ? null : imageUrl);

	const handleImageError = useCallback(() => {
		if (seerrThumb && imageUrl === seerrThumb) setFailedThumb(seerrThumb);
	}, [imageUrl, seerrThumb]);

	const {
		phase: previewPhase,
		frameRef: previewFrameRef,
		onFocus: onPreviewFocus,
		onBlur: onPreviewBlur,
		stopForSelect: stopPreviewForSelect
	} = useMediaPreviewSlot(spotlightId, item);

	const handleClick = useCallback(() => {
		stopPreviewForSelect();
		onSelect?.(item);
	}, [item, onSelect, stopPreviewForSelect]);

	const itemAt = useCallback(() => item, [item]);
	const {onMouseLeave: onMenuMouseLeave, ...menuHold} = useItemMenuHold(itemAt, menuOptions);

	// Only home cards track focus, for their marquee, so other cards don't render again on every move.
	const [focused, setFocused] = useState(false);

	const handleFocus = useCallback(() => {
		if (focusTimeoutRef.current) {
			clearTimeout(focusTimeoutRef.current);
		}
		focusTimeoutRef.current = setTimeout(() => {
			onFocusItem?.(item);
		}, 50);
		onPreviewFocus();
		if (homeText) setFocused(true);
	}, [item, onFocusItem, onPreviewFocus, homeText]);

	const handleBlur = useCallback(() => {
		onPreviewBlur();
		setFocused(false);
	}, [onPreviewBlur]);

	// The menu hold watches the pointer leaving too, so both hear it.
	const handleMouseLeave = useCallback((e) => {
		onMenuMouseLeave?.(e);
		onPreviewBlur();
	}, [onMenuMouseLeave, onPreviewBlur]);

	const progress = item.UserData?.PlayedPercentage || 0;
	const watchedBehavior = settings.watchedIndicatorBehavior || 'always';
	const showIndicators = watchedBehavior === 'always' || watchedBehavior === 'hideCount' || (watchedBehavior === 'episodesOnly' && item.Type === 'Episode');
	const unplayedCount = item.UserData?.UnplayedItemCount;
	const showUnplayedCount = showIndicators && watchedBehavior !== 'hideCount' && !item.UserData?.Played && unplayedCount > 0;

	const seerrStyle = seerrBadgeStyle(settings);
	const bannerStatus = seerrStyle !== 'banner' ? null
		: seerrTitleStatus(item) ?? (hasSeerrDot(seerrSeasonStatus) ? seerrSeasonStatus : null);

	const displayTitle = useMemo(() => {
		if (item.Type === 'Episode' || item.Type === 'Season') {
			return item.SeriesName || item.Name;
		}
		return item.Name;
	}, [item.Type, item.SeriesName, item.Name]);

	const episodeInfo = useMemo(() => {
		if (item.Type === 'Episode' && item.ParentIndexNumber !== undefined) {
			return `S${item.ParentIndexNumber}:E${item.IndexNumber} - ${item.Name}`;
		}
		if (item.Type === 'Season' && item.SeriesName) {
			return item.Name;
		}
		return null;
	}, [item.Type, item.ParentIndexNumber, item.IndexNumber, item.Name, item.SeriesName]);

	const musicInfo = useMemo(() => {
		if (item.Type === 'MusicAlbum') {
			return item.AlbumArtist || item.AlbumArtists?.[0]?.Name || '';
		}
		if (item.Type === 'Audio') {
			return item.AlbumArtist || item.Artists?.[0] || '';
		}
		return null;
	}, [item.Type, item.AlbumArtist, item.AlbumArtists, item.Artists]);

	// Classic home rows give a movie or series its year as the second line, and a calendar card says when it releases.
	const yearInfo = homeText && (item.Type === 'Movie' || item.Type === 'Series') && item.ProductionYear
		? String(item.ProductionYear)
		: null;
	const secondLine = (item._calendarDate && item.Subtitle) || yearInfo || item.Subtitle;
	// A home card's line that doesn't fit scrolls while the card has focus.
	const line = (className, text) => (homeText
		? <LoopMarquee className={className} text={text} active={focused} />
		: <div className={className}>{text}</div>);

	// The zoom comes off while the video shows so the card holds still under it.
	const cardClass = `${css.card} ${isBanner ? css.banner : isLandscape ? css.landscape : isSquare ? css.square : css.portrait}${isCircle ? ' ' + css.circle : ''}${settings.cardFocusZoom ? '' : ' ' + css.noZoom}${previewPhase === 'playing' ? ' ' + css.previewing : ''}${current ? ' ' + css.current : ''}${homeText ? ' ' + css.homeText : ''}`;

	const sizeMultiplier = POSTER_SIZE_MULTIPLIERS[settings.homeRowsPosterSize] || 1;
	const shapeKey = isBanner ? 'banner' : isLandscape ? 'landscape' : isSquare ? 'square' : 'portrait';
	// A screen laying cards out to its own measure hands over the size, and the poster size setting stays out of it.
	const {width: cardWidth, height: cardHeight} = size || classicCardSize(shapeKey, settings.homeRowsPosterSize);
	// The genre name grows with the card so it reads on a poster and on a
	// focused thumbnail alike, and the seerr genre cards use the same scale.
	const genreLabelSize = Math.min(24, Math.max(14, cardWidth * (14 / 200)));
	const sized = size || sizeMultiplier !== 1;
	const sizeStyle = sized ? {width: cardWidth + 'px'} : undefined;
	const imgSizeStyle = sized ? {height: cardHeight + 'px'} : undefined;
	// Logos and studio art have to sit inside the card whole. Everything else takes
	// the cover the stylesheet already applies, so it stays out of the inline style.
	const fitStyle = imageType === 'logo' || item.Type === 'Studio' || item.Type === 'Network'
		? {...imgSizeStyle, objectFit: 'contain'}
		: imgSizeStyle;
	const imgStyle = artShown ? fitStyle : {...fitStyle, ...pendingArtStyle};

	return (
		<SpottableDiv {...menuHold} className={cardClass} data-media-card onClick={handleClick} onFocus={handleFocus} onBlur={handleBlur} onMouseEnter={onPreviewFocus} onMouseLeave={handleMouseLeave} style={sizeStyle} spotlightId={spotlightId} onSpotlightLeft={onSpotlightLeft} onSpotlightRight={onSpotlightRight}>
			<div className={`${css.imageContainer}${previewPhase !== 'idle' ? ' ' + css.previewHost : ''}${bannerStatus ? ' ' + css.underSeerrBanner : ''}`} data-card-art>
				{imageUrl ? (
					<>
						<img
							className={css.image}
							src={deferImage ? undefined : imageUrl}
							alt={deferImage ? '' : item.Name}
							loading={eagerLoad ? 'eager' : 'lazy'}
							decoding="async"
							width={cardWidth}
							height={cardHeight}
							style={imgStyle}
							{...artBind}
							onError={handleImageError}
						/>
						{(item?.Type === 'Genre' || item?.Type === 'MusicGenre') && (
							<>
								<div className={`${css.genreOverlay} ${item._seerr ? css.genreOverlaySeerr : ''}`} />
								<div
									className={css.genreTitle}
									style={{fontSize: `${genreLabelSize}px`, letterSpacing: `${genreLabelSize * 0.18}px`}}
								>
									{item.Name?.toUpperCase()}
								</div>
							</>
						)}
					</>
				) : (
					<div className={css.placeholder} style={imgSizeStyle}>
						<div className={css.placeholderTitle}>{item.Name}</div>
					</div>
				)}

				{previewPhase !== 'idle' && (
					<>
						<div ref={previewFrameRef} className={previewPhase === 'playing' ? `${css.previewFrame} ${css.previewVisible}` : css.previewFrame} />
						<div className={css.previewRing} />
					</>
				)}

				{overlay || (
					<>
						{showIndicators && progress > 0 && (
							<div className={css.progressBar}>
								<div className={css.progress} style={{width: `${progress}%`}} />
							</div>
						)}

						{(showServerBadge || item._external) && item._serverName && (
							<div className={css.serverBadge}>{item._serverName}</div>
						)}

						{item._seerr && item._seerrMissing ? (
							<div className={`${css.seerrBadge} ${css.seerrMissing}`}>
								<SeerrIcon />
							</div>
						) : seerrStyle === 'badge' && item._seerr && [2, 3, 4, 5].includes(item.mediaInfo?.status) ? (
							<div className={`${css.seerrBadge} ${css[`seerr${item.mediaInfo.status}`]}`} />
						) : null}

						<SeerrSeasonDot status={seerrStyle === 'badge' ? seerrSeasonStatus : null} />
						{bannerStatus && <SeerrStatusBanner status={bannerStatus} className={css.seerrBanner} />}

						{showIndicators && showsWatchedCheck(item) && (
							<div className={css.watchedBadge}>
								<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
							</div>
						)}

						{showUnplayedCount && (
							<div className={css.unplayedCount}>{unplayedCount}</div>
						)}

						{item.UserData?.IsFavorite && (
							<div className={css.favoriteBadge}>
								<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
							</div>
						)}

						<IncompleteBadge itemId={item.Id} belowFavorite={item.UserData?.IsFavorite} belowBanner={Boolean(bannerStatus)} />
						<AnimeCardPill item={item} serverUrl={itemServerUrl} hasProgressBar={showIndicators && progress > 0} />
						{posterLabels && (
							<PosterLabels
								item={item}
								serverUrl={itemServerUrl}
								top={item.UserData?.IsFavorite ? 40 : 8}
								topRight={(showIndicators && showsWatchedCheck(item)) || ((showServerBadge || item._external) && item._serverName) ? 40 : 8}
								bottom={showIndicators && progress > 0 ? 26 : 8}
							/>
						)}
					</>
				)}
			</div>

			{showInfo && <div className={css.info}>
				{isBanner ? (
					line(css.title, [displayTitle, episodeInfo || musicInfo || item.Subtitle].filter(Boolean).join('  \u2022  '))
				) : episodeInfo ? (
					<>
						{line(css.seriesName, displayTitle)}
						{line(css.episodeInfo, episodeInfo)}
					</>
				) : musicInfo ? (
					<>
						{line(css.title, displayTitle)}
						{line(css.episodeInfo, musicInfo)}
					</>
				) : secondLine ? (
					<>
						{line(css.title, displayTitle)}
						{line(css.episodeInfo, secondLine)}
					</>
				) : (
					line(css.title, displayTitle)
				)}
			</div>}
		</SpottableDiv>
	);
};

export default memo(MediaCard);
