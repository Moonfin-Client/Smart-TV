import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {activeSyncProfile, defaultSettings, localToProfile, profileToLocal} from '../../context/SettingsContext';
import {deleteMoonfinProfile, getMoonfinResolvedProfile, saveMoonfinProfile} from '../../services/seerrApi';
import {homeRowsFromProfile} from '../../utils/homeLayout';
import {seedLanguagePreferences} from '../../utils/languagePrefSeed';

const resolvedToLocal = (resolved) => {
	const local = profileToLocal(resolved);
	const homeRows = homeRowsFromProfile(resolved, {
		seasonal: local.seasonalRowEnabled === true,
		mdblist_watching_now: local.mdblistWatchingNowEnabled === true
	});
	if (homeRows !== undefined) local.homeRows = homeRows;
	return local;
};

// The profile picker and the Load, Save and Reset actions on the Moonbase screen. They all
// work on the profile automatic sync follows, so picking one is also what they act on.
const useProfileSync = ({
	settings, selectSyncProfile, applyServerProfile, restoreSyncedDefaults,
	serverUrl, accessToken, user, currentView
}) => {
	const activeProfile = activeSyncProfile(settings.syncProfile);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	// Reset asks for a second press instead of raising a dialog.
	const [resetArmed, setResetArmed] = useState(false);

	// An armed reset left behind shouldn't fire from a later visit, and its prompt goes with it.
	useEffect(() => {
		setResetArmed(false);
		setMessage('');
	}, [currentView]);

	// The language seeder refills an empty audio or subtitle preference the moment settings
	// change, and that write pushes to the server. Filling them here means what lands is
	// already complete and nothing follows it up.
	const withSeededLanguages = useCallback((values, base) => {
		const merged = {...base, ...values};
		return {
			...values,
			...seedLanguagePreferences(merged, user?.Configuration || {}, merged.uiLanguage, window.navigator?.language)
		};
	}, [user]);

	const pickProfile = useCallback((profile) => {
		selectSyncProfile(profile);
		setMessage('');
		setResetArmed(false);
	}, [selectSyncProfile]);

	// Runs one action against the server, with the screen showing it's busy until it answers
	const run = useCallback(async (action) => {
		if (busy) return;
		setBusy(true);
		setMessage('');
		setResetArmed(false);
		try {
			setMessage(await action());
		} catch {
			setMessage($L('Could not reach the server'));
		}
		setBusy(false);
	}, [busy]);

	const loadProfile = useCallback(() => run(async () => {
		const resolved = await getMoonfinResolvedProfile(activeProfile, serverUrl, accessToken);
		if (!resolved) return $L('No stored settings for this profile');
		applyServerProfile(withSeededLanguages(resolvedToLocal(resolved), settings));
		return $L('Profile loaded');
	}), [run, activeProfile, serverUrl, accessToken, applyServerProfile, withSeededLanguages, settings]);

	const saveProfile = useCallback(() => run(async () => {
		await saveMoonfinProfile(activeProfile, localToProfile(settings), serverUrl, accessToken);
		return $L('Settings synced to profile');
	}), [run, activeProfile, settings, serverUrl, accessToken]);

	const resetProfile = useCallback(() => {
		if (busy) return;
		if (!resetArmed) {
			setResetArmed(true);
			setMessage(activeProfile === 'global'
				? $L('Press again to erase every stored profile on the server')
				: $L('Press again to reset this profile to global'));
			return;
		}
		run(async () => {
			await deleteMoonfinProfile(activeProfile, serverUrl, accessToken);
			// What still stands on the server, admin defaults plus global when a device
			// profile was reset, is what this device should show from here on.
			const resolved = await getMoonfinResolvedProfile(activeProfile, serverUrl, accessToken).catch(() => null);
			restoreSyncedDefaults(withSeededLanguages(resolved ? resolvedToLocal(resolved) : {}, defaultSettings));
			return $L('Profile reset');
		});
	}, [busy, resetArmed, activeProfile, run, serverUrl, accessToken, restoreSyncedDefaults, withSeededLanguages]);

	return {
		activeProfile,
		profileSyncBusy: busy,
		profileSyncMessage: message,
		pickProfile,
		loadProfile,
		saveProfile,
		resetProfile
	};
};

export default useProfileSync;
