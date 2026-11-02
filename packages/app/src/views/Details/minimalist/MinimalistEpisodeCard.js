import {SpottableDiv} from '../detailsSpottables';

import css from './MinimalistCards.module.less';

// One episode in the rail: the still, its number, and the title.
//
// The number sits on the artwork rather than in front of the title, so anyone who cannot read the
// title still has something to count along by.
// `large` is the same card at Stage's size.
const MinimalistEpisodeCard = ({imageUrl, title, number, watched, current, width, imageHeight, selectKey, onSelect, large}) => (
	<SpottableDiv
		className={`${css.card} ${current ? css.current : ''} ${large ? css.large : ''}`}
		style={{width: `${width}px`}}
		data-select-key={selectKey}
		onClick={onSelect}
	>
		<div className={css.artwork} style={{height: `${imageHeight}px`}}>
			{imageUrl && <img className={css.artworkImage} src={imageUrl} alt="" />}
			{number != null && <div className={css.number}>{number}</div>}
			{watched && (
				<div className={css.watchedBadge}>
					<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
				</div>
			)}
		</div>
		<div className={css.title}>{title}</div>
	</SpottableDiv>
);

export default MinimalistEpisodeCard;
