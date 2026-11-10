import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {asOptions, loadGenreNames, openWhenLoaded} from './useMediaBarSources';

const listOf = (value) => (Array.isArray(value) ? value : []);

// Genres are stored by name, so the name stands in as the id
const useScreensaverSources = ({api, settings, updateSettings, openChecklist}) => {
	const openScreensaverLibraries = useCallback(() => openWhenLoaded(
		openChecklist,
		async () => ((await api.getAllLibraries())?.Items || []).filter((lib) => {
			const type = lib?.CollectionType;
			return type === 'movies' || type === 'tvshows' || !type;
		}),
		(libraries) => ({
			title: $L('Source Libraries'),
			options: asOptions(libraries),
			picked: listOf(settings.screensaverLibraryIds),
			sortByLabel: true,
			onSave: (picked) => updateSettings({screensaverLibraryIds: picked}),
			returnFocusTo: 'setting-screensaverLibraries'
		})
	), [api, openChecklist, settings.screensaverLibraryIds, updateSettings]);

	const openScreensaverCollections = useCallback(() => openWhenLoaded(
		openChecklist,
		async () => (await api.getCollections(500, 'SortName', 'Ascending'))?.Items || [],
		(collections) => ({
			title: $L('Source Collections'),
			options: asOptions(collections),
			picked: listOf(settings.screensaverCollectionIds),
			sortByLabel: true,
			onSave: (picked) => updateSettings({screensaverCollectionIds: picked}),
			returnFocusTo: 'setting-screensaverCollections'
		})
	), [api, openChecklist, settings.screensaverCollectionIds, updateSettings]);

	const openScreensaverGenres = useCallback(() => openWhenLoaded(
		openChecklist,
		() => loadGenreNames(api),
		(names) => ({
			title: $L('Excluded Genres'),
			options: names.map((name) => ({value: name, label: name})),
			picked: listOf(settings.screensaverExcludedGenres),
			sortByLabel: true,
			onSave: (picked) => updateSettings({screensaverExcludedGenres: picked}),
			returnFocusTo: 'setting-screensaverGenres'
		})
	), [api, openChecklist, settings.screensaverExcludedGenres, updateSettings]);

	return {openScreensaverLibraries, openScreensaverCollections, openScreensaverGenres};
};

export default useScreensaverSources;
