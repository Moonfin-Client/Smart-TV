import {memo, useEffect} from 'react';

import css from './SeerrNotificationToast.module.less';

const AUTO_DISMISS_MS = 7000;

// Passive banner for Seerr notifications pushed over the settings stream.
// It never takes focus so D-pad navigation is undisturbed.
const SeerrNotificationToast = ({notification, onDismiss}) => {
	useEffect(() => {
		if (!notification) return;
		const timer = setTimeout(() => onDismiss?.(), AUTO_DISMISS_MS);
		return () => clearTimeout(timer);
	}, [notification, onDismiss]);

	if (!notification) return null;

	return (
		<div className={css.toast} key={notification.key}>
			<div className={css.title}>{notification.title}</div>
			{notification.body ? <div className={css.body}>{notification.body}</div> : null}
		</div>
	);
};

export default memo(SeerrNotificationToast);
