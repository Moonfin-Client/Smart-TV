import {useCallback, useEffect, useRef, useState} from 'react';

import {
	NOTIFICATION_PREF_DEFAULTS, loadNotificationPrefs, setNotificationPref, subscribeNotificationPrefs
} from '../../services/notificationPrefs';

// The signed in user's Seerr notification choices, which follow the server's copy when the sign in
// read lands while Settings is open. A toggle shows at once and goes up to the server behind it.
const useNotificationPrefs = ({serverUrl, accessToken, userId}) => {
	const [prefs, setPrefs] = useState(NOTIFICATION_PREF_DEFAULTS);
	const prefsRef = useRef(prefs);
	prefsRef.current = prefs;

	useEffect(() => {
		let live = true;
		const load = () => loadNotificationPrefs(serverUrl, userId).then((next) => {
			if (live) setPrefs(next);
		});
		load();
		const unsubscribe = subscribeNotificationPrefs(load);
		return () => {
			live = false;
			unsubscribe();
		};
	}, [serverUrl, userId]);

	const toggleNotificationPref = useCallback((key) => {
		const value = !prefsRef.current[key];
		setPrefs((prev) => ({...prev, [key]: value}));
		setNotificationPref(serverUrl, accessToken, userId, key, value);
	}, [serverUrl, accessToken, userId]);

	return {notificationPrefs: prefs, toggleNotificationPref};
};

export default useNotificationPrefs;
