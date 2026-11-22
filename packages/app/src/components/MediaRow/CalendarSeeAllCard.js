import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {HOME_CORE_ICON_PATHS} from '../icons/homeIconPaths';
import {rem} from '../../utils/rootScale';

import css from './CalendarSeeAllCard.module.less';

const SpottableDiv = Spottable('div');

/** The last card of a Home row, which opens everything the row only shows the start of. */
const CalendarSeeAllCard = ({width, height, spotlightId, onClick, onFocus, onSpotlightRight, icon = 'calendar_month'}) => (
	<SpottableDiv
		className={css.card}
		style={{width: rem(width), height: rem(height)}}
		spotlightId={spotlightId}
		onClick={onClick}
		onFocus={onFocus}
		onSpotlightRight={onSpotlightRight}
		aria-label={$L('See All')}
	>
		<div className={css.content}>
			<svg className={css.icon} viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d={HOME_CORE_ICON_PATHS[icon]} />
			</svg>
			<span className={css.label}>{$L('See All')}</span>
		</div>
	</SpottableDiv>
);

export default CalendarSeeAllCard;
