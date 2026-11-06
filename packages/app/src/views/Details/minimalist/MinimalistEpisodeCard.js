import PosterLabels from '../../../components/PosterLabels';
import {SpottableDiv} from '../detailsSpottables';

import css from './MinimalistCards.module.less';

// One episode in the rail: the still, its number, and the title.
//
// The number sits on the artwork rather than in front of the title, so anyone who cannot read the
// title still has something to count along by.
// `large` is the same card at Stage's size, and `wide` a large one with room for a bigger title.
// `episode` and `serverUrl` give it the admin's poster labels, clear of the number and the tick.
const MinimalistEpisodeCard = ({imageUrl, title, number, watched, current, width, imageHeight, selectKey, onSelect, large, wide, episode, serverUrl}) => (
	<SpottableDiv
		className={`${css.card} ${current ? css.current : ''} ${large ? css.large : ''} ${wide ? css.wide : ''}`}
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
			<PosterLabels
				item={episode}
				serverUrl={serverUrl}
				scale={0.8}
				inset={large ? 13 : 8}
				top={large ? 13 : 8}
				topRight={watched ? (large ? 56 : 36) : (large ? 13 : 8)}
				bottom={large ? 13 : 8}
				bottomLeft={number != null ? (large ? 57 : 36) : (large ? 13 : 8)}
			/>
		</div>
		<div className={css.title}>{title}</div>
	</SpottableDiv>
);

export default MinimalistEpisodeCard;
