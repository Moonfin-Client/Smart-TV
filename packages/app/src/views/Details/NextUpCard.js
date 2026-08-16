import {useCallback} from 'react';
import $L from '@enact/i18n/$L';

import {getImageUrl} from '../../utils/helpers';
import {hidesMediaDescription, seriesThumbUrl} from './detailsMedia';
import {SpottableDiv, RowContainer} from './detailsSpottables';

import css from './Details.module.less';

const THUMB = {maxWidth: 400, quality: 80};

// The wide card that offers the episode to watch next, on a series or after an episode.
const NextUpCard = ({episode, title, serverUrl, settings, onSelectItem}) => {
	const handleClick = useCallback(() => onSelectItem?.(episode), [onSelectItem, episode]);

	const seriesThumb = settings.detailUseSeriesThumbnails ? seriesThumbUrl(serverUrl, episode, THUMB) : null;
	const thumbUrl = seriesThumb ||
		(episode.ImageTags?.Primary ? getImageUrl(serverUrl, episode.Id, 'Primary', THUMB) : null);
	const label = episode.ParentIndexNumber != null && episode.IndexNumber != null
		? `S${episode.ParentIndexNumber}:E${episode.IndexNumber}`
		: null;
	const progress = episode.UserData?.PlayedPercentage || 0;
	const hideOverview = hidesMediaDescription(episode, settings);

	return (
		<RowContainer className={css.section}>
			<div className={css.sectionHeader}>
				<h3 className={css.sectionTitle}>{$L(title)}</h3>
			</div>
			<SpottableDiv className={css.nextUpCard} onClick={handleClick}>
				<div className={css.nextUpThumb}>
					{thumbUrl ? (
						<img src={thumbUrl} alt="" />
					) : (
						<div className={css.nextUpThumbPlaceholder}>
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z"/></svg>
						</div>
					)}
					{progress > 0 && (
						<div className={css.episodeProgress}>
							<div className={css.episodeProgressBar} style={{width: `${Math.min(progress, 100)}%`}} />
						</div>
					)}
				</div>
				<div className={css.nextUpInfo}>
					<span className={css.nextUpTitle}>{label ? `${label} - ${episode.Name}` : episode.Name}</span>
					{!hideOverview && episode.Overview && <span className={css.nextUpOverview}>{episode.Overview}</span>}
				</div>
				<div className={css.nextUpPlayIcon}>
					<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
				</div>
			</SpottableDiv>
		</RowContainer>
	);
};

export default NextUpCard;
