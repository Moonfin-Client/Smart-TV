import {useCallback} from 'react';
import $L from '@enact/i18n/$L';

import {getImageUrl} from '../../utils/helpers';
import {SpottableDiv, SpottableButton} from './artworkSpottables';
import {getDeleteIndex, getOptimizedRemoteImageUrl} from './artworkTypes';

import css from './ChangeArtworkModal.module.less';

const TRASH_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';

// An image already applied to the item, with its delete button. Used by both
// the row and the expanded grid.
export const CurrentArtworkCard = ({serverUrl, itemId, category, tag, index, sizeClass, onRequestDelete}) => {
	const handleDelete = useCallback(() => {
		onRequestDelete?.(category, getDeleteIndex(category, index));
	}, [onRequestDelete, category, index]);

	return (
		<SpottableDiv className={`${css.cardWrapper} ${sizeClass}`}>
			<img
				src={getImageUrl(serverUrl, itemId, category, {maxWidth: 400, tag})}
				className={css.cardImg}
				alt=""
			/>
			<div className={css.cardBadge}>{$L('Current')}</div>
			{onRequestDelete && (
				<SpottableButton className={css.cardActionBtn} onClick={handleDelete}>
					<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d={TRASH_PATH} /></svg>
				</SpottableButton>
			)}
		</SpottableDiv>
	);
};

// A candidate image from a metadata provider. Selecting it opens the preview.
export const RemoteArtworkCard = ({image, category, imageWidth, sizeClass, onSelect}) => {
	const handleClick = useCallback(() => {
		onSelect?.(category, image);
	}, [onSelect, category, image]);

	return (
		<SpottableDiv className={`${css.cardWrapper} ${sizeClass}`} onClick={handleClick}>
			<img
				src={getOptimizedRemoteImageUrl(image.ThumbnailUrl || image.Url, category, imageWidth)}
				className={css.cardImg}
				alt=""
			/>
			<div className={css.cardFooter}>
				<span className={css.cardProvider}>{image.ProviderName}</span>
				{image.Width && image.Height && (
					<span className={css.cardResolution}>{image.Width}x{image.Height}</span>
				)}
			</div>
		</SpottableDiv>
	);
};

export const EmptyArtworkCard = ({sizeClass = ''}) => (
	<div className={`${css.emptyCard} ${sizeClass}`}>
		<span>{$L('No artwork found')}</span>
	</div>
);

export const LoadingArtworkCard = ({sizeClass}) => (
	<div className={`${css.loaderCard} ${sizeClass}`}>
		<div className={css.spinner} />
	</div>
);
