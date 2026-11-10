import {memo, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';
import RatingsRow from '../RatingsRow';
import {getImageUrl, toAbsoluteImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';
import {getPerfTier} from '../../utils/perfTier';
import {cubicBezier} from '../../utils/focusScroll';
import {isStaticLibraryCard, modernCardMetrics, getEpisodeLabels, getCardDisplayTitle} from './modernCardLayout';
import SeerrIcon from '../icons/SeerrIcon';
import SeerrStatusBanner, {seerrBadgeStyle, seerrTitleStatus} from '../seerr/SeerrStatusBanner';
import SeerrStatusDot from '../seerr/SeerrStatusDot';
import SeerrMediaTypeBadge from '../seerr/SeerrMediaTypeBadge';
import {showsWatchedCheck} from '../../utils/playedState';
import {AnimeCardPill} from '../AnimeMarkerPills';
import IncompleteBadge from '../IncompleteBadge';
import PosterLabels from '../PosterLabels';
import {isUnownedSeerrTitle, seerrThumbUrl, seerrWideArtUrl, useTmdbThumbsAvailable} from '../../utils/tmdbThumb';
import useItemMenuHold from '../../hooks/useItemMenuHold';
import useImageReveal, {markDecoded, pendingArtStyle} from '../../hooks/useImageReveal';
import {useMediaPreviewSlot} from './MediaPreviewContext';

import css from './ModernMediaCard.module.less';

const SpottableDiv = Spottable('div');

const formatRuntime = (ticks) => {
	if (!Number.isFinite(ticks) || ticks <= 0) return '';
	const totalMinutes = Math.round(ticks / 600000000);
	if (totalMinutes <= 0) return '';
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h`;
	return `${minutes}m`;
};

const getGenreNames = (item) => {
	if (!item) return [];
	if (Array.isArray(item.Genres) && item.Genres.length) return item.Genres;
	if (Array.isArray(item.GenreItems)) {
		return item.GenreItems.map((genre) => genre?.Name).filter(Boolean);
	}
	return [];
};

const getMetadataLine = (item) => {
	if (!item) return '';
	const parts = [];
	if (item.ProductionYear) parts.push(String(item.ProductionYear));
	const genres = getGenreNames(item).slice(0, 2);
	if (genres.length) parts.push(genres.join(' • '));
	const runtime = formatRuntime(item.RunTimeTicks);
	if (runtime) parts.push(runtime);
	return parts.join(' • ');
};

// The same speeds and curve Moonfin Core opens its modern cards with
const EXPAND_MS = {extraSlow: 450, slow: 300, medium: 180, fast: 90, off: 0};
const EXPAND_CURVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

// The lower tiers open the card instantly, as the rest of their effects go.
export const expandMs = (speed) => (getPerfTier() === 'high' ? EXPAND_MS[speed] || 0 : 0);
// The same curve for the row, which scrolls in step with its cards opening and closing.
export const expandEase = cubicBezier(0.65, 0, 0.35, 1);

const ART_WAIT_MS = 300;

// Core draws its cards with no border and rounds them to 8 points on its 1150 canvas, so the
// look skips the theme's card border and keeps the corners at that size.
const CORE_ART = {border: 0, borderRadius: '13px', boxShadow: 'none'};

// Wide art that has already come in, so a card focused after its art arrived opens straight away.
const ART_MEMORY = 200;
const loadedArt = new Set();
const rememberArt = (url) => {
	markDecoded(url);
	loadedArt.delete(url);
	loadedArt.add(url);
	if (loadedArt.size > ART_MEMORY) loadedArt.delete(loadedArt.values().next().value);
};

// Older engines have no decode, so loaded is as close as they get to ready to draw.
const loadArt = (url, onReady, onFail) => {
	const art = new window.Image();
	const ready = () => {
		rememberArt(url);
		onReady?.();
	};
	art.onload = () => (art.decode ? art.decode().then(ready, ready) : ready());
	art.onerror = onFail || null;
	art.src = url;
};

// The art a card shows, at rest or focused.
const cardImageUrl = (item, focused, {itemServerUrl, isStaticMyMedia, seerrWide, useSeriesThumbnails}) => {
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

const ModernMediaCard = ({
	item,
	serverUrl,
	onSelect,
	onFocusItem,
	onFocused,
	showServerBadge = false,
	eagerLoad = false,
	deferImage = false,
	spotlightId,
	onSpotlightLeft,
	onSpotlightRight,
	isFocused = false,
	detailsWidth,
	isLibraryRow = false,
	warmFocusArt = false,
	menuOptions,
	ratingsSurface,
	hideOverview = false,
	coreLook = false,
	posterLabels = false
}) => {
	const {settings} = useSettings();
	const focusTimeoutRef = useRef(null);
	const platform = useMemo(() => getPlatform(), []);
	const openMs = expandMs(settings.modernCardTransitionSpeed);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) {
				clearTimeout(focusTimeoutRef.current);
			}
		};
	}, []);

	const itemServerUrl = useMemo(() => item?._serverUrl || serverUrl, [item?._serverUrl, serverUrl]);

	const isStaticMyMedia = isStaticLibraryCard(isLibraryRow, settings);

	// A focused Seerr or outside list title grows into the titled thumb the plugin picks
	// for it, and a thumb that fails to load hands over to the plain backdrop.
	const [failedThumb, setFailedThumb] = useState(null);
	const wantsSeerrWide = isFocused && isUnownedSeerrTitle(item);
	useTmdbThumbsAvailable(wantsSeerrWide);
	const seerrThumb = wantsSeerrWide ? seerrThumbUrl(item) : null;
	const seerrWide = wantsSeerrWide ? seerrWideArtUrl(item, failedThumb) : null;

	const useSeriesThumbnails = settings.useSeriesThumbnails;
	const restingUrl = useMemo(() => cardImageUrl(item, false, {itemServerUrl, isStaticMyMedia, useSeriesThumbnails}),
		[item, itemServerUrl, isStaticMyMedia, useSeriesThumbnails]);
	const focusUrl = useMemo(() => cardImageUrl(item, true, {itemServerUrl, isStaticMyMedia, seerrWide, useSeriesThumbnails}),
		[item, itemServerUrl, isStaticMyMedia, seerrWide, useSeriesThumbnails]);

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

	const handleFocus = useCallback(() => {
		onFocused?.(item?.Id || null);
		if (focusTimeoutRef.current) {
			clearTimeout(focusTimeoutRef.current);
		}
		focusTimeoutRef.current = setTimeout(() => {
			onFocusItem?.(item);
		}, 50);
		onPreviewFocus();
	}, [item, onFocusItem, onFocused, onPreviewFocus]);

	// The menu hold watches the pointer leaving too, so both hear it.
	const handleMouseLeave = useCallback((e) => {
		onMenuMouseLeave?.(e);
		onPreviewBlur();
	}, [onMenuMouseLeave, onPreviewBlur]);

	const progress = item?.UserData?.PlayedPercentage || 0;
	const watchedBehavior = settings.watchedIndicatorBehavior || 'always';
	const showIndicators = watchedBehavior === 'always' || watchedBehavior === 'hideCount' || (watchedBehavior === 'episodesOnly' && item?.Type === 'Episode');
	const unplayedCount = item?.UserData?.UnplayedItemCount;
	const showUnplayedCount = showIndicators && watchedBehavior !== 'hideCount' && !item?.UserData?.Played && unplayedCount > 0;
	const seerrStyle = seerrBadgeStyle(settings);
	const bannerStatus = seerrStyle === 'banner' ? seerrTitleStatus(item) : null;

	const displayTitle = useMemo(() => getCardDisplayTitle(item), [item]);

	// A calendar card leads with when it releases.
	const metadata = useMemo(() => [item?._calendarDate && item.Subtitle, getMetadataLine(item)].filter(Boolean).join(' • '), [item]);
	const episodeLabels = useMemo(() => getEpisodeLabels(item), [item]);
	const shouldShowOverview = useMemo(() => ['Movie', 'Series', 'Episode'].includes(item?.Type), [item?.Type]);
	const overviewText = useMemo(() => {
		if (!shouldShowOverview) return '';
		const rawOverview = typeof item?.Overview === 'string' ? item.Overview.trim() : '';
		if (item?._external && !rawOverview) return '';
		return rawOverview || $L('No description available.');
	}, [item?.Overview, shouldShowOverview, item?._external]);

	const isSquareItem = item?.Type === 'MusicAlbum' || item?.Type === 'Audio';
	const {imageHeight, expandedWidth, cardWidth} = modernCardMetrics({
		posterSize: settings.homeRowsPosterSize,
		isSquareItem,
		isStatic: isStaticMyMedia
	});
	const canRenderExpanded = !isStaticMyMedia && !isSquareItem && (
		Boolean(metadata || item?.CommunityRating || (shouldShowOverview && overviewText)) ||
		item?.Type === 'Genre' ||
		item?.Type === 'CollectionFolder' ||
		item?.isLibraryTile ||
		item?._external === true ||
		item?._seerr === true
	);
	// A card that grows keeps its poster until the wide art has loaded, so the poster is never
	// shown cropped to the wide shape while the art comes in. Slow art gets a short wait, then
	// the card opens anyway.
	const swapsArt = canRenderExpanded && Boolean(restingUrl && focusUrl) && focusUrl !== restingUrl;
	const [artArrived, setArtArrived] = useState(false);
	useEffect(() => {
		if (!isFocused) {
			setArtArrived(false);
			return undefined;
		}
		if (!swapsArt || loadedArt.has(focusUrl)) return undefined;
		let waiting = true;
		const arrive = () => {
			if (!waiting) return;
			waiting = false;
			setArtArrived(true);
		};
		loadArt(focusUrl, arrive, arrive);
		const timer = setTimeout(arrive, ART_WAIT_MS);
		return () => {
			waiting = false;
			clearTimeout(timer);
		};
	}, [isFocused, swapsArt, focusUrl]);

	// The cards beside the focused one fetch their wide art ahead, so moving along a row opens
	// each card at once.
	useEffect(() => {
		if (warmFocusArt && swapsArt && !isUnownedSeerrTitle(item) && !loadedArt.has(focusUrl)) {
			loadArt(focusUrl);
		}
	}, [warmFocusArt, swapsArt, focusUrl, item]);

	const expanded = isFocused && canRenderExpanded && (!swapsArt || artArrived || loadedArt.has(focusUrl));

	// An animated card slides its wide art in from the poster's edge, the poster fading off it, and on the
	// way back holds the wide art while it slides shut under the poster fading back in.
	const slides = openMs > 0 && swapsArt;
	const [closingUrl, setClosingUrl] = useState(null);
	const openUrlRef = useRef(null);
	useLayoutEffect(() => {
		if (expanded) {
			openUrlRef.current = focusUrl;
			setClosingUrl(null);
			return undefined;
		}
		const wideUrl = openUrlRef.current;
		openUrlRef.current = null;
		if (!wideUrl || !slides) {
			setClosingUrl(null);
			return undefined;
		}
		setClosingUrl(wideUrl);
		const timer = setTimeout(() => setClosingUrl(null), openMs);
		return () => clearTimeout(timer);
	}, [expanded, focusUrl, slides, openMs]);
	const closing = slides && !expanded && Boolean(closingUrl);

	const imageUrl = closing ? closingUrl : isFocused && (expanded || !canRenderExpanded) ? focusUrl : restingUrl;
	const showVeil = slides && (isFocused || closing) && Boolean(restingUrl) && !deferImage;

	const {shown: artShown, bind: artBind} = useImageReveal(deferImage ? null : imageUrl);

	const handleImageError = useCallback(() => {
		if (seerrThumb && imageUrl === seerrThumb) setFailedThumb(seerrThumb);
	}, [imageUrl, seerrThumb]);

	const extendedSectionWidth = Math.max(detailsWidth || 0, expandedWidth);
	const artStyle = coreLook ? {...CORE_ART, height: `${imageHeight}px`} : {height: `${imageHeight}px`};

	const cardClassName = [
		css.card,
		isFocused ? css.focused : '',
		coreLook ? css.coreLook : '',
		platform === 'webos' ? css.platformWebos : '',
		platform === 'tizen' ? css.platformTizen : '',
		(platform === 'tizen' || platform === 'webos') && typeof document !== 'undefined' && document.documentElement.classList.contains('legacy')
			? css.platformLegacy
			: ''
	].filter(Boolean).join(' ');

	return (
		<SpottableDiv
			{...menuHold}
			className={cardClassName}
			onClick={handleClick}
			onFocus={handleFocus}
			onBlur={onPreviewBlur}
			onMouseEnter={onPreviewFocus}
			onMouseLeave={handleMouseLeave}
			style={{
				width: `${expanded ? expandedWidth : cardWidth}px`,
				transition: openMs ? `width ${openMs}ms ${EXPAND_CURVE}` : 'none',
				'--modern-card-image-height': `${imageHeight}px`,
				'--modern-card-expanded-width': `${expandedWidth}px`
			}}
			spotlightId={spotlightId}
			onSpotlightLeft={onSpotlightLeft}
			onSpotlightRight={onSpotlightRight}
		>
			<div className={`${css.imageContainer}${previewPhase !== 'idle' ? ' ' + css.previewHost : ''}${bannerStatus ? ' ' + css.underSeerrBanner : ''}`} style={coreLook ? CORE_ART : undefined} data-card-art>
				{imageUrl ? (
					<>
						<img
							className={slides && imageUrl !== restingUrl ? `${css.image} ${css.slideArt}` : css.image}
							src={deferImage ? undefined : imageUrl}
							alt={deferImage ? '' : item?.Name}
							loading={eagerLoad ? 'eager' : 'lazy'}
							decoding="async"
							width={cardWidth}
							height={imageHeight}
							style={artShown ? artStyle : {...artStyle, ...pendingArtStyle}}
							{...artBind}
							onError={handleImageError}
						/>
						{showVeil && (
							<img
								className={`${css.image} ${css.veil}`}
								src={restingUrl}
								alt=""
								width={cardWidth}
								height={imageHeight}
								style={{
									...artStyle,
									width: `${cardWidth}px`,
									opacity: expanded && artShown ? 0 : 1,
									transition: `opacity ${openMs}ms ${EXPAND_CURVE}`
								}}
							/>
						)}
						{(item?.Type === 'Genre' || item?.Type === 'MusicGenre') && (
							<>
								<div className={css.genreOverlay} />
								<div className={css.genreTitle}>{item?.Name?.toUpperCase()}</div>
							</>
						)}
					</>
				) : (
					<div className={css.placeholder} style={artStyle}>
						{item?.Type === 'Person' ? (
							<svg className={css.placeholderIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
								<path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/>
							</svg>
						) : (
							<span className={css.placeholderTitle}>{item?.Name}</span>
						)}
					</div>
				)}

				{previewPhase !== 'idle' && (
					<>
						<div ref={previewFrameRef} className={previewPhase === 'playing' ? `${css.previewFrame} ${css.previewVisible}` : css.previewFrame} />
						<div className={css.previewRing} />
					</>
				)}

				{showIndicators && progress > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${progress}%`}} />
					</div>
				)}

				{(showServerBadge || item?._external) && item?._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
				)}

				{item?._seerr && item?._seerrMissing ? (
					<div className={`${css.seerrBadge} ${css.seerrMissing}`}>
						<SeerrIcon />
					</div>
				) : seerrStyle === 'badge' && item?._seerr ? (
					<SeerrStatusDot status={item?.mediaInfo?.status} />
				) : null}
				{bannerStatus && <SeerrStatusBanner status={bannerStatus} className={coreLook ? css.seerrBannerFlush : css.seerrBanner} />}
				{coreLook && isUnownedSeerrTitle(item) && (
					<SeerrMediaTypeBadge mediaType={item._seerrMediaType} className={css.typeBadge} />
				)}

				{showIndicators && showsWatchedCheck(item) && (
					<div className={css.watchedBadge}>
						<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					</div>
				)}

				{showUnplayedCount && (
					<div className={css.unplayedCount}>{unplayedCount}</div>
				)}

				{item?.UserData?.IsFavorite && (
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
			</div>
			{coreLook && (
				<div className={css.focusRing} style={{height: `${imageHeight + 16}px`}} />
			)}

			<div className={css.title}>{displayTitle}</div>
			{coreLook ? (
				metadata ? <div className={css.secondaryTitle}>{metadata}</div> : null
			) : isFocused ? (
				episodeLabels ? (
					<>
						<div className={css.secondaryTitle}>{episodeLabels.full}</div>
						{metadata && <div className={css.secondaryTitle}>{metadata}</div>}
					</>
				) : (metadata || item?.Subtitle) ? (
					<div className={css.secondaryTitle}>{metadata || item.Subtitle}</div>
				) : null
			) : (episodeLabels || item?.Subtitle) ? (
				<div className={css.secondaryTitle}>{episodeLabels ? episodeLabels.short : item.Subtitle}</div>
			) : null}

			{expanded && (
				<div className={css.extendedSection} style={{width: `${extendedSectionWidth}px`}}>
					<RatingsRow
						item={item}
						serverUrl={itemServerUrl}
						compact
						singleLineWidth={extendedSectionWidth}
						surface={ratingsSurface}
						pluginEnabled={isMdblistEnabled(settings, ratingsSurface)}
					/>
					{shouldShowOverview && !hideOverview && <div className={css.overview}>{overviewText}</div>}
				</div>
			)}
		</SpottableDiv>
	);
};

export default memo(ModernMediaCard);
