import Spottable from '@enact/spotlight/Spottable';
import UnreadBadge from '../UnreadBadge';

import css from './Sidebar.module.less';

const SpottableButton = Spottable('button');

// One row of the sidebar, an icon plus the label that fades in when the rail
// expands. The slot lets themes with a nav color cycle tint each row on its own.
// A badge count draws as a small red circle on the icon, and zero draws nothing.
const SidebarItem = ({Icon, slot, label, onClick, spotlightId, active = false, className = '', badge = 0, children}) => (
	<SpottableButton
		className={[css.sidebarItem, active && css.active, className].filter(Boolean).join(' ')}
		onClick={onClick}
		spotlightId={spotlightId}
		data-nav-slot={slot}
	>
		<UnreadBadge count={badge} className={css.sidebarIconHost}>
			<Icon className={css.sidebarIcon} />
		</UnreadBadge>
		<span className={css.sidebarLabel}>{label}</span>
		{children}
	</SpottableButton>
);

export default SidebarItem;
