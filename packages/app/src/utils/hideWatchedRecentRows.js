import {api} from '../services/jellyfinApi';

// Hide Watched starts from the account's own setting, which the server's Recently Added follows.
export const seedHideWatched = (settings = {}, userConfiguration = {}) => (
	settings.hideWatchedInRecentRows == null && userConfiguration?.HidePlayedInLatest === true
		? {hideWatchedInRecentRows: true}
		: {}
);

// The account keeps the same answer, so the server's Recently Added agrees with the rows here.
// Plex has no such setting. True when the account changed.
export const writeHidePlayedInLatest = async (serverApi, hideWatched) => {
	const config = (await serverApi.getUserConfiguration())?.Configuration;
	if (typeof config?.HidePlayedInLatest !== 'boolean' || config.HidePlayedInLatest === hideWatched) return false;
	await serverApi.updateUserConfiguration({...config, HidePlayedInLatest: hideWatched});
	return true;
};

export const toggleHideWatched = (settings, setSetting) => {
	const next = settings.hideWatchedInRecentRows !== true;
	setSetting('hideWatchedInRecentRows', next);
	// Home already reloaded for the new setting, but Recently Added comes from the server, so it's
	// read again once the account has the new answer.
	return writeHidePlayedInLatest(api, next).then((changed) => {
		if (changed) window.dispatchEvent(new window.CustomEvent('moonfin:browseRefresh', {detail: {libraries: true}}));
	}, (e) => console.warn('[Settings] Could not update Hide watched on the server:', e));
};
