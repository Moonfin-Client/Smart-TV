import {memo, useCallback, useMemo, useRef, useEffect} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';
import RatingsRow from '../RatingsRow';
import {getImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';
import {isStaticLibraryCard, modernCardMetrics, getEpisodeLabels, getCardDisplayTitle} from './modernCardLayout';
import SeerrIcon from '../icons/SeerrIcon';

import css from './ModernMediaCard.module.less';

const SpottableDiv = Spottable('div');

const toAbsoluteImageUrl = (url, serverUrl) => {
	if (!url || typeof url !== 'string') return null;
	if (url.startsWith('http://') || url.startsWith('https://')) return url;
	if (url.startsWith('//')) return `https:${url}`;
	if (!serverUrl) return url;
	if (url.startsWith('/')) return `${serverUrl}${url}`;
	return `${serverUrl}/${url}`;
};

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

const ModernMediaCard = ({
	item,
	serverUrl,
	onSelect,
	onFocusItem,
	onFocused,
	showServerBadge = false,
	eagerLoad = false,
	spotlightId,
	onSpotlightLeft,
	onSpotlightRight,
	isFocused = false,
	isLibraryRow = false
}) => {
	const {settings} = useSettings();
	const focusTimeoutRef = useRef(null);
	const platform = useMemo(() => getPlatform(), []);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) {
				clearTimeout(focusTimeoutRef.current);
			}
		};
	}, []);

	const itemServerUrl = useMemo(() => item?._serverUrl || serverUrl, [item?._serverUrl, serverUrl]);

	const isStaticMyMedia = isStaticLibraryCard(isLibraryRow, settings);

	const imageUrl = useMemo(() => {
		if (!item) return null;

		const providerIds = item.ProviderIds || {};
		const externalPoster = item._externalPosterUrl ||
			providerIds.SeerrPoster ||
			providerIds.SonarrPoster ||
			providerIds.RadarrPoster ||
			providerIds.LidarrPoster ||
			providerIds.ReadarrPoster;

		if (item._external || externalPoster) {
			if (isFocused && item._externalBackdropUrl) {
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
				? getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 600, quality: 80})
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

			if (isFocused) {
				return (settings.useSeriesThumbnails ? (seriesThumb || episodeThumb) : (episodeThumb || seriesThumb)) || seriesPoster;
			} else {
				return seriesPoster || episodeThumb || seriesThumb;
			}
		}

		if (item.Type === 'Genre' && item._representative) {
			const rep = item._representative;
			const repServerUrl = itemServerUrl;
			if (isFocused) {
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
			if (isFocused) {
				if (item.ImageTags?.Thumb) {
					return getImageUrl(itemServerUrl, item.Id, 'Thumb', {tag: item.ImageTags.Thumb, maxWidth: 600, quality: 80});
				}
				if (item.ParentThumbItemId) {
					return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 600, quality: 80});
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
			if (isStaticMyMedia || isFocused) {
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

		if (isFocused) {
			if (item.ImageTags?.Thumb) {
				return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 600, quality: 80});
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
	}, [item, itemServerUrl, isFocused, isStaticMyMedia, settings.useSeriesThumbnails]);

	const handleClick = useCallback(() => {
		onSelect?.(item);
	}, [item, onSelect]);

	const handleFocus = useCallback(() => {
		onFocused?.(item?.Id || null);
		if (focusTimeoutRef.current) {
			clearTimeout(focusTimeoutRef.current);
		}
		focusTimeoutRef.current = setTimeout(() => {
			onFocusItem?.(item);
		}, 50);
	}, [item, onFocusItem, onFocused]);

	const progress = item?.UserData?.PlayedPercentage || 0;
	const watchedBehavior = settings.watchedIndicatorBehavior || 'always';
	const showIndicators = watchedBehavior === 'always' || watchedBehavior === 'hideCount' || (watchedBehavior === 'episodesOnly' && item?.Type === 'Episode');
	const unplayedCount = item?.UserData?.UnplayedItemCount;
	const showUnplayedCount = showIndicators && watchedBehavior !== 'hideCount' && !item?.UserData?.Played && unplayedCount > 0;

	const displayTitle = useMemo(() => getCardDisplayTitle(item), [item]);

	const metadata = useMemo(() => getMetadataLine(item), [item]);
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
		platform,
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

	const cardClassName = [
		css.card,
		isFocused ? css.focused : '',
		platform === 'webos' ? css.platformWebos : '',
		platform === 'tizen' ? css.platformTizen : '',
		(platform === 'tizen' || platform === 'webos') && typeof document !== 'undefined' && document.documentElement.classList.contains('legacy')
			? css.platformLegacy
			: ''
	].filter(Boolean).join(' ');

	return (
		<SpottableDiv
			className={cardClassName}
			onClick={handleClick}
			onFocus={handleFocus}
			style={{
				width: `${isFocused && canRenderExpanded ? expandedWidth : cardWidth}px`,
				'--modern-card-image-height': `${imageHeight}px`,
				'--modern-card-expanded-width': `${expandedWidth}px`
			}}
			spotlightId={spotlightId}
			onSpotlightLeft={onSpotlightLeft}
			onSpotlightRight={onSpotlightRight}
		>
			<div className={css.imageContainer}>
				{imageUrl ? (
					<>
						<img
							className={css.image}
							src={imageUrl}
							alt={item?.Name}
							loading={eagerLoad ? 'eager' : 'lazy'}
							width={cardWidth}
							height={imageHeight}
							style={{height: `${imageHeight}px`}}
						/>
						{(item?.Type === 'Genre' || item?.Type === 'MusicGenre') && (
							<>
								<div className={css.genreOverlay} />
								<div className={css.genreTitle}>{item?.Name?.toUpperCase()}</div>
							</>
						)}
					</>
				) : (
					<div className={css.placeholder} style={{height: `${imageHeight}px`}}>
						{item?.Type === 'Person' ? (
							<svg className={css.placeholderIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
								<path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/>
							</svg>
						) : (
							<span className={css.placeholderTitle}>{item?.Name}</span>
						)}
					</div>
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
				) : item?._seerr && [2, 3, 4, 5].includes(item?.mediaInfo?.status) ? (
					<div className={`${css.seerrBadge} ${css[`seerr${item.mediaInfo.status}`]}`} />
				) : null}

				{showIndicators && item?.UserData?.Played && (
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
			</div>

			<div className={css.title}>{displayTitle}</div>
			{isFocused ? (
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

			{isFocused && canRenderExpanded && (
				<div className={css.extendedSection} style={{width: `${expandedWidth}px`}}>
					<RatingsRow
						item={item}
						serverUrl={itemServerUrl}
						compact
						pluginEnabled={isMdblistEnabled(settings)}
					/>
					{shouldShowOverview && <div className={css.overview}>{overviewText}</div>}
				</div>
			)}
		</SpottableDiv>
	);
};

export default memo(ModernMediaCard);
