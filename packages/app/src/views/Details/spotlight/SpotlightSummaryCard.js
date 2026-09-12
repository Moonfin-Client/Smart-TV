import {useCallback} from 'react';

import {SpottableDiv} from '../detailsSpottables';
import {iconViewBox} from '../../../components/icons/iconViewBox';
import {DETAIL_ICON_PATHS} from '../detailIcons';

import css from './SpotlightSummaryCard.module.less';

// One card in the band under the hero: landscape artwork under a scrim, an icon badge naming
// the card, its title and counts, and an arrow saying it opens something.
const SpotlightSummaryCard = ({card, width, height, spotlightId, onOpen}) => {
	const handleClick = useCallback(() => onOpen?.(card), [onOpen, card]);

	return (
		<SpottableDiv
			className={css.card}
			style={{width: `${width}px`, height: `${height}px`}}
			spotlightId={spotlightId}
			onClick={handleClick}
		>
			{card.imageUrl
				? <img className={css.image} src={card.imageUrl} alt="" />
				: <div className={css.imageEmpty} />}
			<div className={css.scrim} />
			<span className={css.badge}>
				<svg className={css.badgeIcon} viewBox={iconViewBox(card.icon)} fill="currentColor" aria-hidden="true">
					<path d={card.icon} />
				</svg>
			</span>
			<svg className={css.arrow} viewBox={iconViewBox(DETAIL_ICON_PATHS.play)} fill="currentColor" aria-hidden="true">
				<path d={DETAIL_ICON_PATHS.play} />
			</svg>
			<span className={css.text}>
				<span className={css.title}>{card.title}</span>
				{card.subtitle && <span className={css.subtitle}>{card.subtitle}</span>}
			</span>
		</SpottableDiv>
	);
};

export default SpotlightSummaryCard;
