import {useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {useSeerr} from '../../context/SeerrContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import {PROBLEM} from '../../utils/calendarEntries';
import {CalendarButton, CalendarIcon, problemText} from './calendarParts';

import css from './Calendar.module.less';

/** The loading, problem and empty states every view shares, or the children once there's something to show. */
const CalendarState = ({c, empty, emptyText, settingsPreview, children}) => {
	const {displayName} = useSeerr();
	const retry = c.problem && c.problem !== PROBLEM.adminsOnly;
	useEffect(() => {
		if (retry && !settingsPreview) Spotlight.focus('calendar-retry');
	}, [retry, settingsPreview]);

	if (c.loading) return <div className={css.message}><LoadingSpinner /></div>;
	if (c.problem) {
		return (
			<div className={css.message}>
				<CalendarIcon name="event_busy_rounded" className={css.messageIcon} />
				<div className={css.messageText}>{problemText(c.problem, displayName)}</div>
				{retry && <CalendarButton label={$L('Retry')} icon="refresh_rounded" onClick={c.reload} spotlightId="calendar-retry" />}
			</div>
		);
	}
	if (empty) {
		return (
			<div className={css.message}>
				<CalendarIcon name="event_available_rounded" className={css.messageIcon} />
				<div className={css.messageText}>{emptyText}</div>
			</div>
		);
	}
	return children;
};

export default CalendarState;
