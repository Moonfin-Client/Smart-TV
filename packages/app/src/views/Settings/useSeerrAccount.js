import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

// Turning the Moonfin plugin on is what connects Seerr, so the plugin toggle and the sign in
// form share this state. The password is dropped whenever either one is switched off.
const useSeerrAccount = ({seerr, seerrLabel, settings, updateSetting, serverUrl, accessToken, serverType}) => {
	const [moonfinStatus, setMoonfinStatus] = useState('');
	const [moonfinConnecting, setMoonfinConnecting] = useState(false);
	const [seerrAuthType, setSeerrAuthType] = useState('jellyfin');
	const [seerrUsername, setSeerrUsername] = useState('');
	const [seerrPassword, setSeerrPassword] = useState('');
	const [seerrAuthSubmitting, setSeerrAuthSubmitting] = useState(false);
	const [seerrAuthMessage, setSeerrAuthMessage] = useState('');
	const [seerrAuthError, setSeerrAuthError] = useState('');

	useEffect(() => {
		const normalizedAuthType = seerr.moonfinAuthType === 'local' ? 'local' : 'jellyfin';
		setSeerrAuthType(normalizedAuthType);
	}, [seerr.moonfinAuthType]);

	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			setSeerrPassword('');
			setSeerrAuthMessage('');
			setSeerrAuthError('');
		}
	}, [settings.useMoonfinPlugin]);

	// Typing into either field means the last attempt's result no longer applies.
	const onSeerrUsernameChange = useCallback((value) => {
		setSeerrUsername(value);
		setSeerrAuthMessage('');
		setSeerrAuthError('');
	}, []);

	const onSeerrPasswordChange = useCallback((value) => {
		setSeerrPassword(value);
		setSeerrAuthMessage('');
		setSeerrAuthError('');
	}, []);

	const handleMoonfinToggle = useCallback(async () => {
		const enabling = !settings.useMoonfinPlugin;
		updateSetting('useMoonfinPlugin', enabling);
		setSeerrAuthMessage('');
		setSeerrAuthError('');
		if (enabling) {
			if (!serverUrl || !accessToken) {
				setMoonfinStatus($L('Not connected to a Jellyfin server'));
				return;
			}
			setMoonfinConnecting(true);
			setMoonfinStatus($L('Checking Moonfin plugin...'));
			try {
				const result = await seerr.configureWithMoonfin(serverUrl, accessToken);
				if (result.authenticated) {
					setMoonfinStatus($L('Connected via Moonfin!'));
				} else {
					setMoonfinStatus($L('Moonfin plugin found but no session. Please log in.'));
				}
			} catch (err) {
				setMoonfinStatus(`${$L('Moonfin connection failed:')} ${err.message}`);
			} finally {
				setMoonfinConnecting(false);
			}
		} else {
			seerr.disable();
			setMoonfinStatus('');
			setSeerrPassword('');
		}
	}, [settings.useMoonfinPlugin, updateSetting, serverUrl, accessToken, seerr]);

	const handleSeerrAuthTypeChange = useCallback((nextAuthType) => {
		const normalizedAuthType = nextAuthType === 'local' ? 'local' : 'jellyfin';
		setSeerrAuthType(normalizedAuthType);
		setSeerrAuthMessage('');
		setSeerrAuthError('');
		seerr.setMoonfinAuthType?.(normalizedAuthType).catch((err) => {
			console.log('[Seerr] Failed to save auth type:', err.message);
		});
	}, [seerr]);

	const handleSeerrLogin = useCallback(async () => {
		const plexAccount = serverType === 'plex' && seerrAuthType !== 'local';
		const username = seerrUsername.trim();
		if (!username && !plexAccount) {
			setSeerrAuthMessage('');
			setSeerrAuthError($L('Enter username/email.'));
			return;
		}

		setSeerrAuthSubmitting(true);
		setSeerrAuthMessage('');
		setSeerrAuthError('');

		try {
			await seerr.loginWithMoonfin(username, seerrPassword, plexAccount ? 'plex' : seerrAuthType);
			setSeerrPassword('');
			setSeerrAuthMessage($L('Signed in to {seerrLabel}.').replace('{seerrLabel}', seerrLabel));
			setMoonfinStatus($L('Connected via Moonfin!'));
		} catch (err) {
			const message = typeof err?.message === 'string' && err.message.trim()
				? err.message.trim()
				: $L('Login failed');
			setSeerrAuthError(message);
		} finally {
			setSeerrAuthSubmitting(false);
		}
	}, [seerr, seerrUsername, seerrPassword, seerrAuthType, seerrLabel, serverType]);

	const handleSeerrPasswordKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		if ((code === 13 || e.key === 'Enter') && !seerrAuthSubmitting) {
			e.preventDefault();
			handleSeerrLogin();
		}
	}, [handleSeerrLogin, seerrAuthSubmitting]);

	const handleSeerrLogout = useCallback(async () => {
		setSeerrAuthSubmitting(true);
		setSeerrAuthMessage('');
		setSeerrAuthError('');

		try {
			await seerr.logout();
			setSeerrPassword('');
			setSeerrAuthMessage($L('Signed out from {seerrLabel}.').replace('{seerrLabel}', seerrLabel));
			setMoonfinStatus($L('Moonfin plugin found but no session. Please log in.'));
		} catch (err) {
			const message = typeof err?.message === 'string' && err.message.trim()
				? err.message.trim()
				: $L('Sign-out failed');
			setSeerrAuthError(message);
		} finally {
			setSeerrAuthSubmitting(false);
		}
	}, [seerr, seerrLabel]);

	return {
		moonfinStatus,
		moonfinConnecting,
		seerrAuthType,
		seerrUsername,
		onSeerrUsernameChange,
		seerrPassword,
		onSeerrPasswordChange,
		seerrAuthSubmitting,
		seerrAuthMessage,
		seerrAuthError,
		handleMoonfinToggle,
		handleSeerrAuthTypeChange,
		handleSeerrLogin,
		handleSeerrPasswordKeyDown,
		handleSeerrLogout
	};
};

export default useSeerrAccount;
