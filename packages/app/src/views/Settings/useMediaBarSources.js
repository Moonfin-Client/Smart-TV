import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import {bareId} from '../../utils/libraryScopeRules';
import {mediaBarExternalListOptions} from '../Browse/featuredExternal';

// Synced picks come back with dashes, while the server lists libraries and collections without
// them, so the picker reads them in that form or it shows them unticked.
const pickedIds = (ids) => (Array.isArray(ids) ? [...new Set(ids.map(bareId))] : []);

export const asOptions = (items) => items.map((item) => ({value: item.Id, label: item.Name}));

export const loadGenreNames = async (api) => {
	const result = await api.getGenres();
	const names = [];
	(result?.Items || []).forEach((item) => {
		const name = (item?.Name || '').trim();
		if (name && names.indexOf(name) === -1) names.push(name);
	});
	return names;
};

// A mixed library names no collection type, so the bar takes it for either kind. Folders
// and recordings name none either, but a query on one of those reaches every library, so
// they go out by name.
const MEDIA_BAR_COLLECTION_TYPES = ['movies', 'tvshows', '', 'mixed', 'unknown'];

const isMediaBarLibrary = (lib) => {
	const name = String(lib?.Name || '').trim().toLowerCase();
	if (name === 'folders' || name === 'recordings') return false;

	return MEDIA_BAR_COLLECTION_TYPES.includes(String(lib?.CollectionType || '').trim().toLowerCase());
};

// Like Core, a list that fails to load opens nothing
export const openWhenLoaded = async (openChecklist, load, checklistOf) => {
	let loaded;
	try {
		loaded = await load();
	} catch (err) {
		return;
	}
	openChecklist(checklistOf(loaded));
};

const useMediaBarSources = ({api, settings, updateSettings, openChecklist, tmdbAvailable}) => {
	const openMediaBarLibraries = useCallback(() => openWhenLoaded(
		openChecklist,
		async () => ((await api.getAllLibraries())?.Items || []).filter(isMediaBarLibrary),
		(libraries) => ({
			title: $L('Source Libraries'),
			options: asOptions(libraries),
			picked: pickedIds(settings.mediaBarLibraryIds),
			sortByLabel: true,
			onSave: (picked) => updateSettings({mediaBarLibraryIds: picked}),
			returnFocusTo: 'setting-sourceLibraries'
		})
	), [api, openChecklist, settings.mediaBarLibraryIds, updateSettings]);

	const openMediaBarCollections = useCallback(() => openWhenLoaded(
		openChecklist,
		async () => (await api.getCollections(500, 'SortName', 'Ascending'))?.Items || [],
		(collections) => ({
			title: $L('Source Collections'),
			options: asOptions(collections),
			picked: pickedIds(settings.mediaBarCollectionIds),
			sortByLabel: true,
			onSave: (picked) => updateSettings({mediaBarCollectionIds: picked}),
			returnFocusTo: 'setting-sourceCollections'
		})
	), [api, openChecklist, settings.mediaBarCollectionIds, updateSettings]);

	// The picks only say where the bar draws from, so saving them leaves the source type alone.
	const openMediaBarExternalLists = useCallback(() => {
		openChecklist({
			title: $L('External Lists'),
			options: asOptions(mediaBarExternalListOptions(settings.customHomeRows, tmdbAvailable)),
			picked: Array.isArray(settings.mediaBarExternalLists) ? settings.mediaBarExternalLists : [],
			sortByLabel: true,
			onSave: (picked) => updateSettings({mediaBarExternalLists: picked}),
			returnFocusTo: 'setting-sourceExternalLists'
		});
	}, [openChecklist, settings.customHomeRows, settings.mediaBarExternalLists, tmdbAvailable, updateSettings]);

	// Earlier builds stored the names lowercased, so a stored name ticks the genre it matches.
	const openExcludedGenres = useCallback(() => openWhenLoaded(
		openChecklist,
		() => loadGenreNames(api),
		(names) => ({
			title: $L('Excluded Genres'),
			options: names.map((name) => ({value: name, label: name})),
			picked: (Array.isArray(settings.excludedGenres) ? settings.excludedGenres : [])
				.map((genre) => names.find((name) => name.toLowerCase() === String(genre).toLowerCase()) || genre),
			sortByLabel: true,
			onSave: (picked) => updateSettings({excludedGenres: picked}),
			returnFocusTo: 'setting-excludedGenres'
		})
	), [api, openChecklist, settings.excludedGenres, updateSettings]);

	return {openMediaBarLibraries, openMediaBarCollections, openMediaBarExternalLists, openExcludedGenres};
};

export default useMediaBarSources;
