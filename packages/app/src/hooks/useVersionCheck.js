/**
 * useVersionCheck hook
 * Checks for app updates on mount and provides update info
 */

import {useState, useEffect, useCallback} from 'react';
import {checkForUpdates, dismissVersion, formatReleaseNotes} from '../services/versionChecker';

const useVersionCheck = (delay = 3000) => {
	const [updateInfo, setUpdateInfo] = useState(null);
	const [isChecking, setIsChecking] = useState(false);

	useEffect(() => {
		// Don't check if delay is null (not authenticated yet)
		if (delay === null) {
			setUpdateInfo(null);
			setIsChecking(false);
			return;
		}

		const timer = setTimeout(async () => {
			setIsChecking(true);
			try {
				const info = await checkForUpdates();
				setUpdateInfo(info);
			} catch (e) {
				console.warn('[VERSION] Check failed:', e);
			} finally {
				setIsChecking(false);
			}
		}, delay);

		return () => clearTimeout(timer);
	}, [delay]);

	// Settings' Check for Updates opens the panel even for a version closed before, which is how
	// someone who stayed on an older version gets back to the update.
	useEffect(() => {
		const show = async () => {
			try {
				const info = await checkForUpdates(true, {includeDismissed: true});
				if (info) setUpdateInfo(info);
			} catch (e) {
				console.warn('[VERSION] Check failed:', e);
			}
		};
		window.addEventListener('moonfin:show-update', show);
		return () => window.removeEventListener('moonfin:show-update', show);
	}, []);

	const dismiss = useCallback(async () => {
		if (updateInfo?.latestVersion) {
			await dismissVersion(updateInfo.latestVersion);
			setUpdateInfo(null);
		}
	}, [updateInfo]);

	const manualCheck = useCallback(async () => {
		setIsChecking(true);
		try {
			const info = await checkForUpdates(true);
			setUpdateInfo(info);
			return info;
		} catch (e) {
			console.warn('[VERSION] Manual check failed:', e);
			return null;
		} finally {
			setIsChecking(false);
		}
	}, []);

	return {
		updateInfo,
		isChecking,
		dismiss,
		manualCheck,
		formattedNotes: updateInfo?.releaseNotes ? formatReleaseNotes(updateInfo.releaseNotes) : null
	};
};

export default useVersionCheck;
export {useVersionCheck};
