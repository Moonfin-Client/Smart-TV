import {useCallback, useState} from 'react';

const withValueToggled = (value) => (prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]);

const listOf = (value) => (Array.isArray(value) ? [...value] : []);

// Which libraries, collections and genres the library art screensaver draws from. Genres
// are stored by name, so they go through the same picker with the name standing in as the id.
const useScreensaverSources = ({api, settings, updateSettings, pushView, popView}) => {
	const [screensaverLibraries, setScreensaverLibraries] = useState([]);
	const [screensaverCollections, setScreensaverCollections] = useState([]);
	const [screensaverGenres, setScreensaverGenres] = useState([]);
	const [tempScreensaverLibraryIds, setTempScreensaverLibraryIds] = useState([]);
	const [tempScreensaverCollectionIds, setTempScreensaverCollectionIds] = useState([]);
	const [tempScreensaverGenres, setTempScreensaverGenres] = useState([]);
	const [screensaverSourcesLoading, setScreensaverSourcesLoading] = useState(false);

	const openScreensaverLibraries = useCallback(async () => {
		pushView({view: 'screensaverLibraries', returnFocusTo: 'setting-screensaverLibraries'});
		setScreensaverSourcesLoading(true);
		setTempScreensaverLibraryIds(listOf(settings.screensaverLibraryIds));
		try {
			const viewsResult = await api.getAllLibraries();
			const libs = (viewsResult?.Items || []).filter((lib) => {
				const type = lib?.CollectionType;
				return type === 'movies' || type === 'tvshows' || !type;
			});
			setScreensaverLibraries(libs);
		} catch (err) {
			void err;
			setScreensaverLibraries([]);
		} finally {
			setScreensaverSourcesLoading(false);
		}
	}, [api, pushView, settings.screensaverLibraryIds]);

	const openScreensaverCollections = useCallback(async () => {
		pushView({view: 'screensaverCollections', returnFocusTo: 'setting-screensaverCollections'});
		setScreensaverSourcesLoading(true);
		setTempScreensaverCollectionIds(listOf(settings.screensaverCollectionIds));
		try {
			const result = await api.getCollections(500, 'SortName', 'Ascending');
			setScreensaverCollections(result?.Items || []);
		} catch (err) {
			void err;
			setScreensaverCollections([]);
		} finally {
			setScreensaverSourcesLoading(false);
		}
	}, [api, pushView, settings.screensaverCollectionIds]);

	const openScreensaverGenres = useCallback(async () => {
		pushView({view: 'screensaverGenres', returnFocusTo: 'setting-screensaverGenres'});
		setScreensaverSourcesLoading(true);
		setTempScreensaverGenres(listOf(settings.screensaverExcludedGenres));
		try {
			const result = await api.getGenres();
			const names = [];
			(result?.Items || []).forEach((item) => {
				const name = (item?.Name || '').trim();
				if (name && names.indexOf(name) === -1) names.push(name);
			});
			setScreensaverGenres(names.map((name) => ({Id: name, Name: name})));
		} catch (err) {
			void err;
			setScreensaverGenres([]);
		} finally {
			setScreensaverSourcesLoading(false);
		}
	}, [api, pushView, settings.screensaverExcludedGenres]);

	const toggleScreensaverLibrary = useCallback((libraryId) => {
		setTempScreensaverLibraryIds(withValueToggled(libraryId));
	}, []);

	const toggleScreensaverCollection = useCallback((collectionId) => {
		setTempScreensaverCollectionIds(withValueToggled(collectionId));
	}, []);

	const toggleScreensaverGenre = useCallback((genre) => {
		setTempScreensaverGenres(withValueToggled(genre));
	}, []);

	const saveScreensaverLibraries = useCallback(() => {
		updateSettings({screensaverLibraryIds: tempScreensaverLibraryIds});
		popView();
	}, [tempScreensaverLibraryIds, updateSettings, popView]);

	const saveScreensaverCollections = useCallback(() => {
		updateSettings({screensaverCollectionIds: tempScreensaverCollectionIds});
		popView();
	}, [tempScreensaverCollectionIds, updateSettings, popView]);

	const saveScreensaverGenres = useCallback(() => {
		updateSettings({screensaverExcludedGenres: tempScreensaverGenres});
		popView();
	}, [tempScreensaverGenres, updateSettings, popView]);

	return {
		screensaverLibraries,
		screensaverCollections,
		screensaverGenres,
		tempScreensaverLibraryIds,
		tempScreensaverCollectionIds,
		tempScreensaverGenres,
		screensaverSourcesLoading,
		openScreensaverLibraries,
		openScreensaverCollections,
		openScreensaverGenres,
		toggleScreensaverLibrary,
		toggleScreensaverCollection,
		toggleScreensaverGenre,
		saveScreensaverLibraries,
		saveScreensaverCollections,
		saveScreensaverGenres
	};
};

export default useScreensaverSources;
