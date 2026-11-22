import PosterLabels from '../../../../components/PosterLabels';
import {SpottableDiv} from '../../detailsSpottables';
import {iconViewBox} from '../../../../components/icons/iconViewBox';
import {DETAIL_ICON_PATHS} from '../../detailIcons';

import css from './NouveauCards.module.less';

// A portrait card, which is what the collection, discovery and filmography rails are made of. The
// rail works out the width and the height follows from it, so nothing here guesses at a size.
const NouveauPosterCard = ({
	imageUrl, title, subtitle, width, height, progress = 0, badgeIcon,
	selectKey, onSelect, spotlightId, item, serverUrl
}) => {
	// Only part way through counts. A finished item would otherwise wear a full bar for good.
	const shown = progress > 0 && progress < 1;

	return (
		<SpottableDiv
			className={css.card}
			style={{width: `${width}px`}}
			spotlightId={spotlightId}
			data-select-key={selectKey}
			onClick={onSelect}
		>
			<div className={css.artwork} style={{height: `${height}px`}}>
				{imageUrl
					? <img className={css.artworkImage} src={imageUrl} alt="" />
					: (
						<div className={css.placeholder}>
							<svg
								className={css.placeholderIcon}
								viewBox={iconViewBox(DETAIL_ICON_PATHS.series)}
								fill="currentColor"
								aria-hidden="true"
							>
								<path d={DETAIL_ICON_PATHS.series} />
							</svg>
						</div>
					)}
				{badgeIcon && (
					<div className={css.badge}>
						<svg className={css.badgeIcon} viewBox={iconViewBox(badgeIcon)} fill="currentColor" aria-hidden="true">
							<path d={badgeIcon} />
						</svg>
					</div>
				)}
				{shown && (
					<div className={css.progressTrack}>
						<div className={css.progressFill} style={{width: `${Math.round(progress * 100)}%`}} />
					</div>
				)}
				<PosterLabels item={item} serverUrl={serverUrl} scale={0.8} topRight={badgeIcon ? 46 : 8} />
			</div>
			{(title || subtitle) && (
				<div className={css.caption}>
					{title && <div className={css.title}>{title}</div>}
					{subtitle && <div className={css.subtitle}>{subtitle}</div>}
				</div>
			)}
		</SpottableDiv>
	);
};

export default NouveauPosterCard;
