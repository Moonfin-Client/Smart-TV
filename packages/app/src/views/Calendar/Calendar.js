import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import {useCalendarActions, useCalendarLook} from './calendarParts';
import CalendarAgenda from './CalendarAgenda';
import CalendarCountdown from './CalendarCountdown';
import useCalendar from './useCalendar';

import css from './Calendar.module.less';

const PageContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

/**
 * What the Calendar button opens: the calendar style the user picked. Both have a Full calendar button.
 * [settingsPreview] draws it in the settings preview, which sits over this screen when Settings opens
 * from it, so the preview keeps out of Spotlight and leaves the screen's ids and focus alone.
 */
const Calendar = ({onSelectItem, onSelectSeerrItem, onOpenMonth, settingsPreview = false}) => {
	const {settings} = useSettings();
	const countdown = settings.calendarStyle === 'countdown';
	const c = useCalendar({tick: countdown});
	const look = useCalendarLook();
	const actions = useCalendarActions({onSelectItem, onSelectSeerrItem});
	const sidebar = settings.navbarPosition === 'left';
	const View = countdown ? CalendarCountdown : CalendarAgenda;
	return (
		<PageContainer className={`${css.page} ${sidebar ? css.pageSidebar : ''}`} spotlightId={settingsPreview ? undefined : 'calendar-view'} spotlightDisabled={settingsPreview} style={{background: look.bg(1)}}>
			<View c={c} look={look} actions={actions} onOpenMonth={onOpenMonth} settingsPreview={settingsPreview} />
		</PageContainer>
	);
};

export default Calendar;
