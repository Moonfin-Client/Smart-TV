import {memo, useState, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';

import {boxartUrl, gameDisplayTitle, gameFallbackColor} from '../../utils/gameArt';

import css from './GameCard.module.less';

const SpottableDiv = Spottable('div');

// A box-art card for one game (libretro cover keyed on the ROM filename, seeded-color +
// controller-glyph fallback). Focusable for 5-way remote navigation.
const GameCard = ({game, width = 200, spotlightId, onSelect}) => {
	const url = boxartUrl(game.core, game.fileName);
	const [failed, setFailed] = useState(!url);
	const title = gameDisplayTitle(game.title, game.fileName);

	const handleSelect = useCallback(() => onSelect && onSelect(game), [onSelect, game]);
	const handleError = useCallback(() => setFailed(true), []);

	return (
		<SpottableDiv
			className={css.card}
			spotlightId={spotlightId}
			style={{width}}
			onClick={handleSelect}
		>
			<div className={css.poster} style={{height: width * 1.34}}>
				{failed || !url ? (
					<div className={css.fallback} style={{background: gameFallbackColor(game.id)}}>
						<svg className={css.glyph} viewBox="0 0 24 24" aria-hidden="true">
							<path fill="currentColor" d="M7 8a5 5 0 0 0 0 10 5 5 0 0 0 3.9-1.9h2.2A5 5 0 0 0 17 18a5 5 0 0 0 0-10Zm-.5 3h1v1.5H9v1H7.5V15h-1v-1.5H5v-1h1.5Zm9 .5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1.5 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
						</svg>
					</div>
				) : (
					<img className={css.image} src={url} alt="" onError={handleError} />
				)}
			</div>
			<div className={css.title}>{title}</div>
		</SpottableDiv>
	);
};

export default memo(GameCard);
