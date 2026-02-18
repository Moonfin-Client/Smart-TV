import {memo, useCallback, useMemo, useRef, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {getImageUrl} from '../../utils/helpers';

import css from './MediaCard.module.less';

const SpottableDiv = Spottable('div');

const MediaCard = ({item, serverUrl, cardType = 'portrait', onSelect, onFocusItem, showServerBadge = false}) => {
	const isLandscape = cardType === 'landscape';
	const isSquare = cardType === 'square' || (cardType === 'portrait' && (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'Audio'));
	const focusTimeoutRef = useRef(null);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) {
				clearTimeout(focusTimeoutRef.current);
			}
		};
	}, []);

	// Support cross-server items that have their own server URL
	const itemServerUrl = useMemo(() => {
		return item._serverUrl || serverUrl;
	}, [item._serverUrl, serverUrl]);

	const imageUrl = useMemo(() => {
		if (isLandscape && item.Type === 'Episode') {
			if (item.ImageTags?.Primary) {
				return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxWidth: 500, quality: 90});
			}
			if (item.ParentThumbItemId) {
				return getImageUrl(itemServerUrl, item.ParentThumbItemId, 'Thumb', {maxWidth: 500, quality: 90});
			}
			if (item.ParentBackdropItemId) {
				return getImageUrl(itemServerUrl, item.ParentBackdropItemId, 'Backdrop', {maxWidth: 500, quality: 90});
			}
		}

		if (item.ImageTags?.Primary) {
			return getImageUrl(itemServerUrl, item.Id, 'Primary', {maxHeight: 400, quality: 90});
		}

		// Audio tracks: use parent album art
		if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
			return getImageUrl(itemServerUrl, item.AlbumId, 'Primary', {maxHeight: 400, quality: 90});
		}

		return null;
	}, [isLandscape, item.Type, item.ImageTags?.Primary, item.Id, item.ParentThumbItemId, item.ParentBackdropItemId, item.AlbumId, item.AlbumPrimaryImageTag, itemServerUrl]);

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

	const cardClass = `${css.card} ${isLandscape ? css.landscape : isSquare ? css.square : css.portrait}`;

	return (
		<SpottableDiv className={cardClass} onClick={handleClick} onFocus={handleFocus}>
			<div className={css.imageContainer}>
				{imageUrl ? (
					<img className={css.image} src={imageUrl} alt={item.Name} loading="lazy" />
				) : (
					<div className={css.placeholder}>{item.Name?.[0]}</div>
				)}

				{progress > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${progress}%`}} />
					</div>
				)}

				{showServerBadge && item._serverName && (
					<div className={css.serverBadge}>{item._serverName}</div>
				)}
			</div>

			<div className={css.info}>
				{episodeInfo ? (
					<>
						<div className={css.seriesName}>{displayTitle}</div>
						<div className={css.episodeInfo}>{episodeInfo}</div>
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
