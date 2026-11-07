import {useCallback, useState} from 'react';
import {bareId} from '../../utils/libraryScopeRules';

const withIdToggled = (id) => (prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]);

// Synced picks come back with dashes, while the server lists libraries and collections without
// them, so the picker reads them in that form or it shows them unticked.
const pickedIds = (ids) => (Array.isArray(ids) ? [...new Set(ids.map(bareId))] : []);

// A mixed library names no collection type, so the bar takes it for either kind. Folders
// and recordings name none either, but a query on one of those reaches every library, so
// they go out by name.
const MEDIA_BAR_COLLECTION_TYPES = ['movies', 'tvshows', '', 'mixed', 'unknown'];

const isMediaBarLibrary = (lib) => {
	const name = String(lib?.Name || '').trim().toLowerCase();
	if (name === 'folders' || name === 'recordings') return false;

	return MEDIA_BAR_COLLECTION_TYPES.includes(String(lib?.CollectionType || '').trim().toLowerCase());
};

// Which libraries or collections the featured bar draws from. Saving either one also sets
// the source type, since picking a set is how the viewer says which kind they want.
const useMediaBarSources = ({api, settings, updateSettings, pushView, popView}) => {
	const [mediaBarLibraries, setMediaBarLibraries] = useState([]);
	const [mediaBarCollections, setMediaBarCollections] = useState([]);
	const [tempMediaBarLibraryIds, setTempMediaBarLibraryIds] = useState([]);
	const [tempMediaBarCollectionIds, setTempMediaBarCollectionIds] = useState([]);
	const [tempMediaBarExternalLists, setTempMediaBarExternalLists] = useState([]);
	const [mediaBarSourcesLoading, setMediaBarSourcesLoading] = useState(false);

	const openMediaBarLibraries = useCallback(async () => {
		pushView({view: 'mediaBarLibraries', returnFocusTo: 'setting-sourceLibraries'});
		setMediaBarSourcesLoading(true);
		setTempMediaBarLibraryIds(pickedIds(settings.mediaBarLibraryIds));
		try {
			const viewsResult = await api.getAllLibraries();
			const libs = (viewsResult?.Items || []).filter(isMediaBarLibrary);
			setMediaBarLibraries(libs);
		} catch (err) {
			void err;
			setMediaBarLibraries([]);
		} finally {
			setMediaBarSourcesLoading(false);
		}
	}, [api, pushView, settings.mediaBarLibraryIds]);

	const openMediaBarCollections = useCallback(async () => {
		pushView({view: 'mediaBarCollections', returnFocusTo: 'setting-sourceCollections'});
		setMediaBarSourcesLoading(true);
		setTempMediaBarCollectionIds(pickedIds(settings.mediaBarCollectionIds));
		try {
			const result = await api.getCollections(500, 'SortName', 'Ascending');
			setMediaBarCollections(result?.Items || []);
		} catch (err) {
			void err;
			setMediaBarCollections([]);
		} finally {
			setMediaBarSourcesLoading(false);
		}
	}, [api, pushView, settings.mediaBarCollectionIds]);

	const openMediaBarExternalLists = useCallback(() => {
		pushView({view: 'mediaBarExternalLists', returnFocusTo: 'setting-sourceExternalLists'});
		setTempMediaBarExternalLists(Array.isArray(settings.mediaBarExternalLists) ? [...settings.mediaBarExternalLists] : []);
	}, [pushView, settings.mediaBarExternalLists]);

	const toggleMediaBarLibrary = useCallback((libraryId) => {
		setTempMediaBarLibraryIds(withIdToggled(libraryId));
	}, []);

	const toggleMediaBarCollection = useCallback((collectionId) => {
		setTempMediaBarCollectionIds(withIdToggled(collectionId));
	}, []);

	const toggleMediaBarExternalList = useCallback((listId) => {
		setTempMediaBarExternalLists(withIdToggled(listId));
	}, []);

	// The picks only say where the bar draws from, so saving them leaves the source type alone.
	const saveMediaBarExternalLists = useCallback(() => {
		updateSettings({mediaBarExternalLists: tempMediaBarExternalLists});
		popView();
	}, [tempMediaBarExternalLists, updateSettings, popView]);

	const saveMediaBarLibraries = useCallback(() => {
		updateSettings({mediaBarLibraryIds: tempMediaBarLibraryIds});
		popView();
	}, [tempMediaBarLibraryIds, updateSettings, popView]);

	const saveMediaBarCollections = useCallback(() => {
		updateSettings({mediaBarCollectionIds: tempMediaBarCollectionIds});
		popView();
	}, [tempMediaBarCollectionIds, updateSettings, popView]);

	return {
		mediaBarLibraries,
		mediaBarCollections,
		tempMediaBarLibraryIds,
		tempMediaBarCollectionIds,
		tempMediaBarExternalLists,
		mediaBarSourcesLoading,
		openMediaBarLibraries,
		openMediaBarCollections,
		openMediaBarExternalLists,
		toggleMediaBarLibrary,
		toggleMediaBarCollection,
		toggleMediaBarExternalList,
		saveMediaBarLibraries,
		saveMediaBarCollections,
		saveMediaBarExternalLists
	};
};

export default useMediaBarSources;
