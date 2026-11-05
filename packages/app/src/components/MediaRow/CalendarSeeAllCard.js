import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';

import css from './CalendarSeeAllCard.module.less';

const SpottableDiv = Spottable('div');

/** The last card of the Upcoming rows, which opens the calendar's month grid. */
const CalendarSeeAllCard = ({width, height, spotlightId, onClick, onFocus, onSpotlightRight}) => (
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
				<path fill="currentColor" d={CORE_ICON_PATHS.calendar_month} />
			</svg>
			<span className={css.label}>{$L('See All')}</span>
		</div>
	</SpottableDiv>
);

export default CalendarSeeAllCard;
