import {memo, useState, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';

import {PORTRAIT_HEIGHT, boxArtCell, boxArtNeedsFill, gameDisplayTitle, gameFallbackColor, hideBrokenArt} from '../../utils/gameArt';

import css from './GameCard.module.less';

const SpottableDiv = Spottable('div');

// Art that doesn't fit its card shows whole over a darkened, blurred copy of itself.
export const GameBoxArt = ({url, contain, lazy, onError = hideBrokenArt}) => {
	const loading = lazy ? 'lazy' : undefined;
	if (!contain) return <img className={css.image} src={url} alt="" loading={loading} onError={onError} />;
	return (
		<>
			<img className={`${css.image} ${css.fill}`} src={url} alt="" loading={loading} onError={hideBrokenArt} />
			<img className={`${css.image} ${css.contain}`} src={url} alt="" loading={loading} onError={onError} />
		</>
	);
};

// A box-art card for one game (cover image via artUrl, seeded-color fallback). With the art's
// aspect it takes the art's shape, and cards of different shapes in a row share a bottom edge.
const GameCard = ({game, artUrl, aspect, width = 200, spotlightId, onSelect, ...rest}) => {
	const [failed, setFailed] = useState(!artUrl);
	const title = gameDisplayTitle(game.title, game.fileName);
	const cell = boxArtCell(aspect);

	const handleSelect = useCallback(() => onSelect && onSelect(game), [onSelect, game]);
	const handleError = useCallback(() => setFailed(true), []);

	return (
		<SpottableDiv
			{...rest}
			className={css.card}
			spotlightId={spotlightId}
			style={{width: width * cell.width}}
			onClick={handleSelect}
		>
			<div className={css.poster} style={{height: width * cell.height, marginTop: width * (PORTRAIT_HEIGHT - cell.height)}}>
				{failed || !artUrl ? (
					<div className={css.fallback} style={{background: gameFallbackColor(game.id)}}>
						<svg className={css.glyph} viewBox="0 0 24 24" aria-hidden="true">
							<path fill="currentColor" d="M7 8a5 5 0 0 0 0 10 5 5 0 0 0 3.9-1.9h2.2A5 5 0 0 0 17 18a5 5 0 0 0 0-10Zm-.5 3h1v1.5H9v1H7.5V15h-1v-1.5H5v-1h1.5Zm9 .5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1.5 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
						</svg>
					</div>
				) : (
					<GameBoxArt url={artUrl} contain={aspect != null && boxArtNeedsFill(aspect, cell.width / cell.height)} onError={handleError} />
				)}
			</div>
			<div className={css.title}>{title}</div>
		</SpottableDiv>
	);
};

export default memo(GameCard);
