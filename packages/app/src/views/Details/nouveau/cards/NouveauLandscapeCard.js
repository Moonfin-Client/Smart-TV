import $L from '@enact/i18n/$L';

import PosterLabels from '../../../../components/PosterLabels';
import {SpottableDiv} from '../../detailsSpottables';

import css from './NouveauCards.module.less';

// An episode, and the one card with two halves. The artwork plays it and the block underneath opens
// it, so the remote can do either without a menu in between. Both halves carry the same key, so one
// handler on each side serves the whole rail.
const NouveauLandscapeCard = ({
	imageUrl, title, overview, width, imageHeight, isNextUp = false, progress = 0,
	selectKey, onArtworkSelect, onDetailsSelect, episode, serverUrl
}) => {
	const shown = progress > 0 && progress < 1;

	return (
		<div className={css.landscape} style={{width: `${width}px`}}>
			<SpottableDiv
				className={`${css.card} ${css.landscapeArtwork}`}
				style={{height: `${imageHeight}px`}}
				data-select-key={selectKey}
				onClick={onArtworkSelect}
			>
				{imageUrl
					? <img className={css.artworkImage} src={imageUrl} alt="" />
					: <div className={css.placeholder}>{title}</div>}
				{isNextUp && <div className={css.nextUp}>{$L('Up Next')}</div>}
				{shown && (
					<div className={css.progressTrack}>
						<div className={css.progressFill} style={{width: `${Math.round(progress * 100)}%`}} />
					</div>
				)}
				<PosterLabels item={episode} serverUrl={serverUrl} scale={0.8} top={isNextUp ? 36 : 8} />
			</SpottableDiv>
			<SpottableDiv
				className={css.landscapeDetails}
				data-select-key={selectKey}
				onClick={onDetailsSelect}
			>
				<div className={css.landscapeTitle}>{title}</div>
				{/* Kept to a fixed two lines whether or not it fills them, so a rail of cards with
				    uneven summaries still lines up along the bottom. */}
				{overview && <div className={css.landscapeOverview}>{overview}</div>}
			</SpottableDiv>
		</div>
	);
};

export default NouveauLandscapeCard;
