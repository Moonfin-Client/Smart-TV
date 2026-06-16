import {memo, useCallback, useMemo, useRef, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';
import RatingsRow from '../RatingsRow';
import {getImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';

import css from './ModernMediaCard.module.less';

const SpottableDiv = Spottable('div');

const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4};

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
	const genres = getGenreNames(item).slice(0, 3);
	if (genres.length) parts.push(genres.join(' • '));
	const runtime = formatRuntime(item.RunTimeTicks);
	if (runtime) parts.push(runtime);
	return parts.join(' • ');
};

const getEpisodeLabel = (item) => {
	if (!item || item.Type !== 'Episode') return '';
	if (!Number.isFinite(item.ParentIndexNumber) || !Number.isFinite(item.IndexNumber)) return '';
	return `S${item.ParentIndexNumber} E${item.IndexNumber}`;
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
	isFocused = false
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

	const imageUrl = useMemo(() => {
		if (!item) return null;

		if (item.Type === 'Episode') {
			if (!isFocused && item.SeriesId && item.SeriesPrimaryImageTag) {
				return getImageUrl(itemServerUrl, item.SeriesId, 'Primary', {maxHeight: 360, quality: 80});
			}
			if (isFocused && item.ImageTags?.Primary) {
				return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
			}
			if (item.SeriesId && item.SeriesPrimaryImageTag) {
				return getImageUrl(itemServerUrl, item.SeriesId, 'Primary', {maxHeight: 360, quality: 80});
			}
			if (item.ImageTags?.Primary) {
				return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
			}
			if (item.ParentBackdropItemId) {
				return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 600, quality: 80});
			}
		}

		if (item.Type === 'Movie' || item.Type === 'Series') {
			if (isFocused) {
				if (item.ImageTags?.Thumb) {
					return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
				}
				if (item.BackdropImageTags?.length > 0) {
					return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 600, quality: 80});
				}
			}
			if (item.ImageTags?.Primary) {
				return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
			}
		}

		if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
			return getImageUrl(itemServerUrl, item.AlbumId, 'Primary', {maxHeight: 360, quality: 80});
		}

		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 360, quality: 80});
		}

		if (item.ImageTags?.Thumb) {
			return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 600, quality: 80});
		}

		if (item.BackdropImageTags?.length > 0) {
			return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 600, quality: 80});
		}
		const providerIds = item.ProviderIds || {};
		const externalPoster = item._externalPosterUrl ||
			providerIds.JellyseerrPoster ||
			providerIds.SonarrPoster ||
			providerIds.RadarrPoster ||
			providerIds.LidarrPoster ||
			providerIds.ReadarrPoster;
		if (externalPoster) {
			return toAbsoluteImageUrl(externalPoster, itemServerUrl);
		}
		return null;
	}, [item, itemServerUrl, isFocused]);

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

	const displayTitle = useMemo(() => {
		if (!item) return '';
		if (item.Type === 'Episode') return item.SeriesName || item.Name;
		return item.Name;
	}, [item]);

	const metadata = useMemo(() => getMetadataLine(item), [item]);
	const episodeLabel = useMemo(() => getEpisodeLabel(item), [item]);
	const shouldShowOverview = useMemo(() => ['Movie', 'Series', 'Episode'].includes(item?.Type), [item?.Type]);
	const overviewText = useMemo(() => {
		if (!shouldShowOverview) return '';
		const rawOverview = typeof item?.Overview === 'string' ? item.Overview.trim() : '';
		return rawOverview || $L('No description available.');
	}, [item?.Overview, shouldShowOverview]);

	const sizeMultiplier = POSTER_SIZE_MULTIPLIERS[settings.homeRowsPosterSize] || 1;
	const imageHeight = Math.round(360 * sizeMultiplier);
	const cardWidth = Math.round((imageHeight * 2) / 3);
	const expandedWidthFactor = platform === 'tizen' ? 1.5 : 1.65;
	const expandedWidth = Math.max(cardWidth, Math.round(imageHeight * expandedWidthFactor));
	const canRenderExpanded = Boolean(metadata || item?.CommunityRating || shouldShowOverview);

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
					<img
						className={css.image}
						src={imageUrl}
						alt={item?.Name}
						loading={eagerLoad ? 'eager' : 'lazy'}
						width={cardWidth}
						height={imageHeight}
						style={{height: `${imageHeight}px`}}
					/>
				) : (
					<div className={css.placeholder} style={{height: `${imageHeight}px`}}>{item?.Name?.[0]}</div>
				)}

				{showIndicators && progress > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${progress}%`}} />
					</div>
				)}

				{showServerBadge && item?._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
				)}

				{item?._seerr && [2, 3, 4, 5].includes(item?.mediaInfo?.status) && (
					<div className={`${css.seerrBadge} ${css[`seerr${item.mediaInfo.status}`]}`} />
				)}
			</div>

			<div className={css.title}>{displayTitle}</div>
			{episodeLabel && <div className={css.secondaryTitle}>{episodeLabel}</div>}

			{isFocused && canRenderExpanded && (
				<div className={css.extendedSection}>
					{metadata && <div className={css.meta}>{metadata}</div>}
					<RatingsRow
						item={item}
						serverUrl={itemServerUrl}
						compact
						pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false}
					/>
					{shouldShowOverview && <div className={css.overview}>{overviewText}</div>}
				</div>
			)}
		</SpottableDiv>
	);
};

export default memo(ModernMediaCard);
