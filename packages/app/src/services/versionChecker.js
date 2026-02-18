/**
 * Version Checker Service
 * Checks GitHub releases API for newer versions with 24-hour cooldown
 * and version dismissal capability.
 */

import {getFromStorage, saveToStorage} from './storage';
import packageJson from '../../package.json';
const APP_VERSION = packageJson.version;

const GITHUB_API_URL = 'https://api.github.com/repos/Moonfin-Client/WebOS/releases/latest';
const CHECK_COOLDOWN_HOURS = 24;
const STORAGE_KEY_LAST_CHECK = 'version_last_check';
const STORAGE_KEY_DISMISSED_VERSION = 'version_dismissed';

/**
 * Get current application version
 * @returns {string} Current version string
 */
export const getCurrentVersion = () => {
	return APP_VERSION;
};

/**
 * Compare two version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export const compareVersions = (v1, v2) => {
	const cleanV1 = v1.replace(/^v/, '');
	const cleanV2 = v2.replace(/^v/, '');

	const parts1 = cleanV1.split('.').map(n => parseInt(n, 10) || 0);
	const parts2 = cleanV2.split('.').map(n => parseInt(n, 10) || 0);

	const maxLength = Math.max(parts1.length, parts2.length);

	for (let i = 0; i < maxLength; i++) {
		const part1 = parts1[i] || 0;
		const part2 = parts2[i] || 0;

		if (part1 < part2) return -1;
		if (part1 > part2) return 1;
	}

	return 0;
};

/**
 * Check if enough time has passed since last check
 * @returns {Promise<boolean>} True if we should check for updates
 */
const shouldCheckForUpdate = async () => {
	try {
		const lastCheck = await getFromStorage(STORAGE_KEY_LAST_CHECK);
		if (!lastCheck) return true;

		const lastCheckTime = parseInt(lastCheck, 10);
		const now = Date.now();
		const hoursSinceCheck = (now - lastCheckTime) / (1000 * 60 * 60);

		return hoursSinceCheck >= CHECK_COOLDOWN_HOURS;
	} catch {
		return true;
	}
};

/**
 * Mark that we've checked for updates
 */
const markChecked = async () => {
	try {
		await saveToStorage(STORAGE_KEY_LAST_CHECK, Date.now().toString());
	} catch (e) {
		console.warn('[VERSION] Failed to save check timestamp:', e);
	}
};

/**
 * Check if user dismissed this version
 * @param {string} version - Version to check
 * @returns {Promise<boolean>} True if dismissed
 */
const isVersionDismissed = async (version) => {
	try {
		const dismissedVersion = await getFromStorage(STORAGE_KEY_DISMISSED_VERSION);
		return dismissedVersion === version;
	} catch {
		return false;
	}
};

/**
 * Mark version as dismissed
 * @param {string} version - Version to dismiss
 */
export const dismissVersion = async (version) => {
	try {
		await saveToStorage(STORAGE_KEY_DISMISSED_VERSION, version);
	} catch (e) {
		console.warn('[VERSION] Failed to save dismissed version:', e);
	}
};

/**
 * Clear version check cache (for testing)
 * Resets cooldown timer and dismissed version
 */
export const clearVersionCache = async () => {
	try {
		await saveToStorage(STORAGE_KEY_LAST_CHECK, null);
		await saveToStorage(STORAGE_KEY_DISMISSED_VERSION, null);
	} catch (e) {
		console.warn('[VERSION] Failed to clear cache:', e);
	}
};

/**
 * Fetch latest release info from GitHub
 * @returns {Promise<Object|null>} Release info object or null
 */
const fetchLatestRelease = async () => {
	try {
		const response = await fetch(GITHUB_API_URL, {
			headers: {
				'Accept': 'application/vnd.github+json',
				'User-Agent': 'Moonfin-webOS-Client'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return await response.json();
	} catch (e) {
		console.warn('[VERSION] Failed to fetch release info:', e);
		return null;
	}
};

/**
 * Format release notes for display
 * @param {string} notes - Raw release notes
 * @returns {string} Formatted text (truncated)
 */
export const formatReleaseNotes = (notes) => {
	if (!notes) return 'A new version is available. Visit GitHub to download.';

	// Keep full notes, only clean up links for display
	let formatted = notes
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');  // Convert links to just text

	return formatted;
};

/**
 * Check for updates
 * @param {boolean} forceCheck - Skip cooldown check
 * @returns {Promise<Object|null>} Update info if available, null otherwise
 */
export const checkForUpdates = async (forceCheck = false) => {
	if (!forceCheck) {
		const shouldCheck = await shouldCheckForUpdate();
		if (!shouldCheck) {
			return null;
		}
	}

	const currentVersion = getCurrentVersion();
	const releaseInfo = await fetchLatestRelease();

	await markChecked();

	if (!releaseInfo || !releaseInfo.tag_name) {
		return null;
	}

	const latestVersion = releaseInfo.tag_name.replace(/^v/, '');

	if (compareVersions(currentVersion, latestVersion) < 0) {
		const dismissed = await isVersionDismissed(latestVersion);
		if (!dismissed) {
			return {
				currentVersion,
				latestVersion,
				releaseNotes: releaseInfo.body,
				releaseUrl: releaseInfo.html_url,
				publishedAt: releaseInfo.published_at
			};
		}
	}

	return null;
};
