import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';

import css from './CalendarSeeAllCard.module.less';

const SpottableDiv = Spottable('div');

/** The last card of a Home row, which opens everything the row only shows the start of. */
const CalendarSeeAllCard = ({width, height, spotlightId, onClick, onFocus, onSpotlightRight, icon = 'calendar_month'}) => (
	<SpottableDiv
		className={css.card}
		style={{width: `${width}px`, height: `${height}px`}}
		spotlightId={spotlightId}
		onClick={onClick}
		onFocus={onFocus}
		onSpotlightRight={onSpotlightRight}
		aria-label={$L('See All')}
	>
		<div className={css.content}>
			<svg className={css.icon} viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d={CORE_ICON_PATHS[icon]} />
			</svg>
			<span className={css.label}>{$L('See All')}</span>
		</div>
	</SpottableDiv>
);

export default CalendarSeeAllCard;
