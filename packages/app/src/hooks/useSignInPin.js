import {useCallback, useMemo, useRef} from 'react';

import {useAuth} from '../context/AuthContext';
import {useSettings} from '../context/SettingsContext';
import {signInPinChanges, signInPinFor} from '../utils/signInPin';

// The signed in account's PIN, the account its server is asked with, and a way to save it. A check
// that finishes later reads and writes the settings as they are by then.
const useSignInPin = () => {
	const {user, serverUrl, accessToken, serverType} = useAuth();
	const {settings, updateSettings} = useSettings();
	const userId = user?.Id;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const record = useMemo(() => signInPinFor(settings, userId), [settings, userId]);
	// On Silo the PIN belongs to the profile, which is the user.
	const account = useMemo(() => (serverUrl && accessToken ? {serverUrl, accessToken, serverType, userId} : null), [serverUrl, accessToken, serverType, userId]);
	const latest = useCallback(() => signInPinFor(settingsRef.current, userId), [userId]);
	const save = useCallback((next) => updateSettings(signInPinChanges(settingsRef.current, userId, next)), [updateSettings, userId]);

	return {userId, record, account, latest, save};
};

export default useSignInPin;
