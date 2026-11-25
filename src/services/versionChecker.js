// Checks GitHub's releases for a newer version at most once a day, and stays quiet about one the
// user dismissed. A release only counts when it carries this platform's package.

import $L, {stringFiles} from './i18n.js';

import {getFromStorage, saveToStorage} from './storage';
import {isTizen, isVega, isWebOS, isXbox} from '../platform';
import packageJson from '../../package.json';
const APP_VERSION = packageJson.version;

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Moonfin-Client/Smart-TV/releases';
const CHECK_COOLDOWN_HOURS = 24;
const STORAGE_KEY_LAST_CHECK = 'version_last_check';
const STORAGE_KEY_DISMISSED_VERSION = 'version_dismissed';

const getCurrentVersion = () => {
	return APP_VERSION;
};

// -1, 0 or 1 as v1 is older than, the same as or newer than v2.
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

const markChecked = async () => {
	try {
		await saveToStorage(STORAGE_KEY_LAST_CHECK, Date.now().toString());
	} catch (e) {
		console.warn('[VERSION] Failed to save check timestamp:', e);
	}
};

const isVersionDismissed = async (version) => {
	try {
		const dismissedVersion = await getFromStorage(STORAGE_KEY_DISMISSED_VERSION);
		return dismissedVersion === version;
	} catch {
		return false;
	}
};

export const dismissVersion = async (version) => {
	try {
		await saveToStorage(STORAGE_KEY_DISMISSED_VERSION, version);
	} catch (e) {
		console.warn('[VERSION] Failed to save dismissed version:', e);
	}
};

const getPlatformAssetExtension = () => {
	if (isWebOS()) return '.ipk';
	if (isTizen()) return '.wgt';
	if (isVega()) return '.vpkg';
	if (isXbox()) return '.msix';
	return '';
};

const releaseHasPlatformAsset = (release) => {
	const ext = getPlatformAssetExtension();
	if (!ext) return true;
	const assets = release.assets || [];
	return assets.some(a => a.name?.toLowerCase().endsWith(ext));
};

// The newest of the last 10 releases that carries this platform's package.
const fetchLatestRelease = async () => {
	try {
		const response = await fetch(`${GITHUB_RELEASES_URL}?per_page=10`, {
			headers: {
				'Accept': 'application/vnd.github+json',
				'User-Agent': 'Moonfin-Client'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const releases = await response.json();
		if (!Array.isArray(releases)) return null;

		for (const release of releases) {
			if (release.draft || release.prerelease) continue;
			if (releaseHasPlatformAsset(release)) {
				return release;
			}
		}

		return null;
	} catch (e) {
		console.warn('[VERSION] Failed to fetch release info:', e);
		return null;
	}
};

// Notes to show in the update panel, or a line to stand in when a release carried none. The
// panel renders the markdown itself.
export const formatReleaseNotes = (notes) => {
	if (!notes) return $L('A new version is available. Visit GitHub to download.');
	return notes;
};

// The settings row wants an answer either way, unlike the launch check below
// that stays quiet when a version was dismissed or nothing is new.
export const checkForUpdatesDetailed = async () => {
	const currentVersion = getCurrentVersion();
	try {
		const releaseInfo = await fetchLatestRelease();
		await markChecked();
		if (!releaseInfo || !releaseInfo.tag_name) return {status: 'error', currentVersion};
		const latestVersion = releaseInfo.tag_name.replace(/^v/, '');
		if (compareVersions(currentVersion, latestVersion) < 0) {
			return {status: 'update', currentVersion, latestVersion};
		}
		return {status: 'current', currentVersion, latestVersion};
	} catch {
		return {status: 'error', currentVersion};
	}
};

// A sideloaded TV build can install a release in place when the release carries
// an update built for this exact package. {ready} means it's already downloaded.
const checkOtaUpdate = async (version) => {
	const ota = typeof window !== 'undefined' && window.__moonfinOta;
	if (!ota) return null;
	if (ota.ready() === version) return {ready: true};
	const manifest = await ota.check(version);
	return manifest ? {manifest} : null;
};

// The update also keeps this language's strings, which a release usually changes.
export const downloadOtaUpdate = (manifest, onProgress) => window.__moonfinOta.download(manifest, onProgress, stringFiles());

// The newer release to offer, or null. forceCheck skips the daily cooldown, and
// includeDismissed offers a version the user closed before.
export const checkForUpdates = async (forceCheck = false, {includeDismissed = false} = {}) => {
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
		const dismissed = !includeDismissed && await isVersionDismissed(latestVersion);
		if (!dismissed) {
			return {
				currentVersion,
				latestVersion,
				releaseNotes: releaseInfo.body,
				releaseUrl: releaseInfo.html_url,
				publishedAt: releaseInfo.published_at,
				ota: await checkOtaUpdate(latestVersion)
			};
		}
	}

	return null;
};
