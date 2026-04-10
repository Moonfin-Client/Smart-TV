import {memo, useCallback, useMemo, useRef, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {getImageUrl} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';

import css from './MediaCard.module.less';

const SpottableDiv = Spottable('div');

const POSTER_SIZE_MULTIPLIERS = {small: 0.8, default: 1, large: 1.2, xlarge: 1.4};
const BASE_SIZES = {portrait: [240, 360], landscape: [384, 216], square: [240, 240]};

const MediaCard = ({item, serverUrl, cardType = 'portrait', onSelect, onFocusItem, showServerBadge = false, showOverview = false, eagerLoad = false}) => {
	const {settings} = useSettings();
	const isLandscape = cardType === 'landscape';
	const isSquare = cardType === 'square' || (cardType === 'portrait' && (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'Audio'));
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

	const imageUrl = useMemo(() => {
		const imageType = settings.homeRowsImageType || 'poster';

		if (isLandscape && item.Type === 'Episode') {
			if (settings.useSeriesThumbnails && item.SeriesId && item.SeriesPrimaryImageTag) {
				return getImageUrl(itemServerUrl, item.SeriesId, 'Primary', {maxHeight: 300, quality: 80});
			}
			if (item.ImageTags?.Primary) {
				return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxWidth: 400, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
			}
			if (item.ParentBackdropItemId) {
				return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80});
			}
		}

		if (imageType === 'backdrop') {
			if (item.BackdropImageTags?.length > 0) {
				return getImageUrl(itemServerUrl, item.Id, 'Backdrop', {maxWidth: 400, quality: 80});
			}
			if (item.ParentBackdropItemId) {
				return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 400, quality: 80});
			}
		} else if (imageType === 'thumb') {
			if (item.ImageTags?.Thumb) {
				return getImageUrl(itemServerUrl, item.Id, 'Thumb', {maxWidth: 400, quality: 80});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 400, quality: 80});
			}
		} else if (imageType === 'logo') {
			if (item.ImageTags?.Logo) {
				return getImageUrl(itemServerUrl, item.Id, 'Logo', {maxWidth: 400, quality: 80});
			}
			if (item.ParentLogoItemId) {
				return getImageUrl(itemServerUrl, item.ParentLogoItemId, 'Logo', {maxWidth: 400, quality: 80});
			}
		}

		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 300, quality: 80});
		}

		if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
			return getImageUrl(itemServerUrl, item.AlbumId, 'Primary', {maxHeight: 300, quality: 80});
		}

		return null;
	}, [isLandscape, item.Type, item.ImageTags?.Primary, item.ImageTags?.Thumb, item.ImageTags?.Logo, item.Id, item.ParentThumbItemId, item.ParentBackdropItemId, item.BackdropImageTags, item.ParentLogoItemId, item.AlbumId, item.AlbumPrimaryImageTag, item.SeriesId, item.SeriesPrimaryImageTag, itemServerUrl, settings.homeRowsImageType, settings.useSeriesThumbnails]);

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

	const cardClass = `${css.card} ${isLandscape ? css.landscape : isSquare ? css.square : css.portrait}${settings.cardFocusZoom ? '' : ' ' + css.noZoom}`;

	const sizeMultiplier = POSTER_SIZE_MULTIPLIERS[settings.homeRowsPosterSize] || 1;
	const shapeKey = isLandscape ? 'landscape' : isSquare ? 'square' : 'portrait';
	const [baseW, baseH] = BASE_SIZES[shapeKey];
	const cardWidth = Math.round(baseW * sizeMultiplier);
	const cardHeight = Math.round(baseH * sizeMultiplier);
	const sizeStyle = sizeMultiplier !== 1 ? {width: cardWidth + 'px'} : undefined;
	const imgSizeStyle = sizeMultiplier !== 1 ? {height: cardHeight + 'px'} : undefined;

	return (
		<SpottableDiv className={cardClass} onClick={handleClick} onFocus={handleFocus} style={sizeStyle}>
			<div className={css.imageContainer}>
				{imageUrl ? (
					<img
						className={css.image}
						src={imageUrl}
						alt={item.Name}
						loading={eagerLoad ? 'eager' : 'lazy'}
						width={cardWidth}
						height={cardHeight}
						style={imgSizeStyle}
					/>
				) : (
					<div className={css.placeholder} style={imgSizeStyle}>{item.Name?.[0]}</div>
				)}

				{showIndicators && progress > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${progress}%`}} />
					</div>
				)}

				{showServerBadge && item._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
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
				) : (
					<div className={css.title}>{displayTitle}</div>
				)}
			</div>
		</SpottableDiv>
	);
};

export default memo(MediaCard);
