import {useCallback, useRef, useState} from 'react';

import {DEFAULT_HOME_ROWS} from '../../context/SettingsContext';
import {SEERR_CONFIG_TO_SECTION} from '../../utils/seerrHomeRows';
import {
	COLLECTIONS_SECTION_SOURCE,
	GENRES_SECTION_SOURCE,
	INITIAL_PLUGIN_SECTION_RENDER_COUNT,
	buildCollectionPluginSections,
	buildGenrePluginSections,
	builtInSectionToPluginSection,
	isHomeRowVisibleByGates,
	mergeDiscoveredPluginSections
} from './homeSectionsModel';
import {apiSortBy, getGenresIncludeTypes, resolveSortOrder} from '../../utils/homeRowSorting';
import {editedListKey} from './settingsRows';

// Swaps the order two entries hold, as new objects so the stored rows aren't changed under the
// screen before it writes them back
const swapOrder = (list, index, target) => {
	const next = [...list];
	next[index] = {...list[index], order: list[target].order};
	next[target] = {...list[target], order: list[index].order};
	return next.sort((a, b) => a.order - b.order);
};

// The home screen row order, edited against a scratch copy and written back once the screen
// closes, and only if it ended up different. The IMDb rows are stored twice, as a row and as
// their own setting, so both are updated.
const useHomeRowsEditor = ({api, settings, updateSetting, updateSettings, pushView}) => {
	const [tempHomeRows, setTempHomeRows] = useState([]);
	const [tempPluginSections, setTempPluginSections] = useState([]);
	const [pluginSectionRenderLimit, setPluginSectionRenderLimit] = useState(INITIAL_PLUGIN_SECTION_RENDER_COUNT);
	const openedRef = useRef({rows: '', sections: ''});

	const refreshBuiltInCollectionGenreSections = useCallback(async () => {
		const collectionsSortBy = apiSortBy(settings.collectionsRowSortBy || 'SortName');
		const collectionsSortOrder = resolveSortOrder(collectionsSortBy, settings.collectionsRowSortOrder);
		const genresSortBy = settings.genresRowSortBy || 'SortName';
		const genresSortOrder = resolveSortOrder(genresSortBy, settings.genresRowSortOrder);
		const genresIncludeTypes = getGenresIncludeTypes(settings.genresRowItemFilter);

		const [collectionsResult, genresResult] = await Promise.all([
			settings.displayCollectionsRows
				? api.getCollections(500, collectionsSortBy, collectionsSortOrder).catch(() => null)
				: Promise.resolve(null),
			settings.displayGenresRows
				? api.getGenres(undefined, genresIncludeTypes, genresSortBy, genresSortOrder).catch(() => null)
				: Promise.resolve(null)
		]);

		return {
			collections: buildCollectionPluginSections(collectionsResult?.Items || [], collectionsSortBy, collectionsSortOrder),
			genres: buildGenrePluginSections(genresResult?.Items || [], genresIncludeTypes, genresSortBy, genresSortOrder)
		};
	}, [
		api,
		settings.collectionsRowSortBy,
		settings.collectionsRowSortOrder,
		settings.displayCollectionsRows,
		settings.displayGenresRows,
		settings.genresRowItemFilter,
		settings.genresRowSortBy,
		settings.genresRowSortOrder
	]);

	const toggleHomeRowEnabled = useCallback((sectionId) => {
		const current = Array.isArray(settings.homeRows) ? settings.homeRows : [];
		const next = current.map((row) => (row.id === sectionId ? {...row, enabled: !row.enabled} : row));
		updateSetting('homeRows', next);
	}, [settings.homeRows, updateSetting]);

	const toggleSeerrHomeRow = useCallback((rowId) => {
		toggleHomeRowEnabled(SEERR_CONFIG_TO_SECTION[rowId] || rowId);
	}, [toggleHomeRowEnabled]);

	const openHomeRows = useCallback(() => {
		const rows = [...(settings.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order);
		openedRef.current = {rows: editedListKey(rows), sections: null};
		setTempHomeRows(rows);
		setTempPluginSections([...(settings.pluginSections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
		setPluginSectionRenderLimit(INITIAL_PLUGIN_SECTION_RENDER_COUNT);
		pushView({ view: 'homeRows', returnFocusTo: 'setting-homeRows' });

		refreshBuiltInCollectionGenreSections()
			.then((builtInSections) => {
				setTempPluginSections((prev) => {
					let merged = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
					if ((builtInSections.collections || []).length > 0) {
						merged = mergeDiscoveredPluginSections(
							merged,
							builtInSections.collections,
							COLLECTIONS_SECTION_SOURCE,
							builtInSectionToPluginSection
						);
					}
					if ((builtInSections.genres || []).length > 0) {
						merged = mergeDiscoveredPluginSections(
							merged,
							builtInSections.genres,
							GENRES_SECTION_SOURCE,
							builtInSectionToPluginSection
						);
					}
					// The discovered rows join the list as it opened, so they alone are no change
					if (openedRef.current.sections === null) openedRef.current.sections = editedListKey(merged);
					return merged;
				});
			})
			.catch(() => {});
	}, [settings.homeRows, settings.pluginSections, pushView, refreshBuiltInCollectionGenreSections]);

	const commitHomeRows = useCallback(() => {
		const rowsChanged = editedListKey(tempHomeRows) !== openedRef.current.rows;
		const sectionsChanged = openedRef.current.sections !== null && editedListKey(tempPluginSections) !== openedRef.current.sections;
		if (!rowsChanged && !sectionsChanged) return;
		openedRef.current = {rows: editedListKey(tempHomeRows), sections: editedListKey(tempPluginSections)};
		const updates = {homeRows: tempHomeRows, pluginSections: tempPluginSections};
		const imdbMap = {
			'imdb-top250-movies': 'imdbTop250MoviesEnabled',
			'imdb-top250-tv': 'imdbTop250TvShowsEnabled',
			'imdb-popular-movies': 'imdbMostPopularMoviesEnabled',
			'imdb-popular-tv': 'imdbMostPopularTvShowsEnabled',
			'imdb-lowest-rated': 'imdbLowestRatedMoviesEnabled',
			'imdb-top-english': 'imdbTopEnglishMoviesEnabled'
		};
		tempHomeRows.forEach((row) => {
			const settingKey = imdbMap[row.id];
			if (settingKey) {
				updates[settingKey] = row.enabled;
			}
		});
		updateSettings(updates);
	}, [tempHomeRows, tempPluginSections, updateSettings]);

	const resetHomeRows = useCallback(() => {
		setTempHomeRows([...DEFAULT_HOME_ROWS]);
	}, []);

	const toggleHomeRow = useCallback((rowId) => {
		setTempHomeRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, enabled: !row.enabled } : row)));
	}, []);

	// Reordering steps over the rows the gates are hiding, so a press moves the row past
	// the next one the viewer can actually see.
	const moveHomeRow = useCallback((rowId, direction) => {
		setTempHomeRows((prev) => {
			const visibleRows = prev.filter((row) => isHomeRowVisibleByGates(row.id, settings));
			const visibleIndex = visibleRows.findIndex((row) => row.id === rowId);
			const neighbourIndex = visibleIndex + direction;
			if (visibleIndex < 0 || neighbourIndex < 0 || neighbourIndex >= visibleRows.length) return prev;
			const targetId = visibleRows[neighbourIndex].id;
			const index = prev.findIndex((r) => r.id === rowId);
			const targetIndex = prev.findIndex((r) => r.id === targetId);
			if (index < 0 || targetIndex < 0) return prev;
			return swapOrder(prev, index, targetIndex);
		});
	}, [settings]);

	// A section touched before the discovered ones came back still counts against the list it had
	const noteSectionsOpened = (prev) => {
		if (openedRef.current.sections === null) openedRef.current.sections = editedListKey(prev);
	};

	const togglePluginSection = useCallback((sectionId) => {
		setTempPluginSections((prev) => {
			noteSectionsOpened(prev);
			return prev.map((section) => (section.id === sectionId ? {...section, enabled: !section.enabled} : section));
		});
	}, []);

	const movePluginSection = useCallback((sectionId, direction) => {
		setTempPluginSections((prev) => {
			noteSectionsOpened(prev);
			const index = prev.findIndex((section) => section.id === sectionId);
			const target = index + direction;
			if (index < 0 || target < 0 || target >= prev.length) return prev;
			return swapOrder(prev, index, target);
		});
	}, []);

	return {
		tempHomeRows,
		tempPluginSections,
		pluginSectionRenderLimit,
		setPluginSectionRenderLimit,
		toggleHomeRowEnabled,
		toggleSeerrHomeRow,
		openHomeRows,
		commitHomeRows,
		resetHomeRows,
		toggleHomeRow,
		moveHomeRow,
		togglePluginSection,
		movePluginSection
	};
};

export default useHomeRowsEditor;
