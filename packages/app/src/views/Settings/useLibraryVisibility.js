import {useCallback, useState} from 'react';

import connectionPool from '../../services/connectionPool';
import {resetLibraryScope} from '../../services/libraryScope';
import serverLogger from '../../services/serverLogger';

// Jellyfin's 400 doesn't say which field it couldn't read, so the library ids that were sent go
// into the diagnostics log along with its reply.
const logRefusedSave = (err, config) => {
	if (!(err?.status >= 400 && err.status < 500)) return;
	serverLogger.error(serverLogger.LOG_CATEGORIES.NETWORK, `User configuration rejected with ${err.status}.${err.body ? ' ' + err.body : ''}`, {
		OrderedViews: config.OrderedViews,
		MyMediaExcludes: config.MyMediaExcludes,
		LatestItemsExcludes: config.LatestItemsExcludes,
		GroupedFolders: config.GroupedFolders
	});
};

const saveLogged = (saving, config) => saving.catch((err) => {
	logRefusedSave(err, config);
	throw err;
});

// Which libraries the viewer has hidden. This lives on the Jellyfin user configuration
// rather than in app settings, and in unified mode it has to be written to every server.
const useLibraryVisibility = ({api, settings, hasMultipleServers, pushView, popView, onLibrariesChanged}) => {
	const [allLibraries, setAllLibraries] = useState([]);
	const [hiddenLibraries, setHiddenLibraries] = useState([]);
	const [libraryLoading, setLibraryLoading] = useState(false);
	const [librarySaving, setLibrarySaving] = useState(false);
	const [serverConfigs, setServerConfigs] = useState([]);
	const [saveFailures, setSaveFailures] = useState(0);

	const openLibraries = useCallback(async () => {
		pushView({ view: 'libraries', returnFocusTo: 'setting-hideLibraries' });
		setLibraryLoading(true);
		try {
			const isUnified = settings.unifiedLibraryMode && hasMultipleServers;
			if (isUnified) {
				const [allLibs, configs] = await Promise.all([
					connectionPool.getAllLibrariesFromAllServers(),
					connectionPool.getUserConfigFromAllServers()
				]);
				const libs = allLibs.filter((lib) => lib.CollectionType);
				setAllLibraries(libs);
				setServerConfigs(configs);
				const allExcludes = configs.reduce((acc, cfg) => acc.concat(cfg.configuration?.MyMediaExcludes || []), []);
				setHiddenLibraries([...new Set(allExcludes)]);
			} else {
				const [viewsResult, userData] = await Promise.all([api.getAllLibraries(), api.getUserConfiguration()]);
				const libs = (viewsResult.Items || []).filter((lib) => lib.CollectionType);
				setAllLibraries(libs);
				setHiddenLibraries([...(userData.Configuration?.MyMediaExcludes || [])]);
			}
		} catch (err) {
			console.error('Failed to load libraries:', err);
		} finally {
			setLibraryLoading(false);
		}
	}, [api, settings.unifiedLibraryMode, hasMultipleServers, pushView]);

	const toggleLibraryVisibility = useCallback((libraryId) => {
		setHiddenLibraries((prev) => {
			if (prev.includes(libraryId)) return prev.filter((id) => id !== libraryId);
			return [...prev, libraryId];
		});
	}, []);

	const saveLibraryVisibility = useCallback(async () => {
		setLibrarySaving(true);
		try {
			const isUnified = settings.unifiedLibraryMode && hasMultipleServers;
			if (isUnified) {
				const serverExcludes = {};
				for (const lib of allLibraries) {
					const key = lib._serverUrl;
					if (!serverExcludes[key]) serverExcludes[key] = [];
					if (hiddenLibraries.includes(lib.Id)) serverExcludes[key].push(lib.Id);
				}
				const savePromises = serverConfigs.map((cfg) => {
					const excludes = serverExcludes[cfg.serverUrl] || [];
					const updatedConfig = { ...cfg.configuration, MyMediaExcludes: excludes };
					return saveLogged(connectionPool.updateUserConfigOnServer(cfg.serverUrl, cfg.accessToken, cfg.userId, updatedConfig, cfg.serverType), updatedConfig);
				});
				await Promise.all(savePromises);
			} else {
				const userData = await api.getUserConfiguration();
				const updatedConfig = { ...userData.Configuration, MyMediaExcludes: hiddenLibraries };
				await saveLogged(api.updateUserConfiguration(updatedConfig), updatedConfig);
			}
			popView();
			setAllLibraries([]);
			setHiddenLibraries([]);
			setServerConfigs([]);
			// The rows narrow themselves against this list, so it has to be re-read before the
			// refresh rather than on the next launch.
			resetLibraryScope();
			onLibrariesChanged?.();
			// Hiding a library can change the media bar, so this refresh redraws it, and the rows
			// load again now rather than from what was stored.
			window.dispatchEvent(new window.CustomEvent('moonfin:browseRefresh', {detail: {featured: true, libraries: true}}));
		} catch (err) {
			console.error('Failed to save library visibility:', err);
			setSaveFailures((count) => count + 1);
		} finally {
			setLibrarySaving(false);
		}
	}, [
		api,
		hiddenLibraries,
		allLibraries,
		serverConfigs,
		settings.unifiedLibraryMode,
		hasMultipleServers,
		onLibrariesChanged,
		popView
	]);

	return {
		allLibraries,
		hiddenLibraries,
		libraryLoading,
		librarySaving,
		librarySaveFailures: saveFailures,
		openLibraries,
		toggleLibraryVisibility,
		saveLibraryVisibility
	};
};

export default useLibraryVisibility;
