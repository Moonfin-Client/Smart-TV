import {useCallback, useState} from 'react';

// Sonarr and Radarr titles only land in these, so other kinds of library aren't offered.
const CALENDAR_LIBRARY_TYPES = ['movies', 'tvshows', 'mixed'];

/** The libraries the Calendar screen lists, picked the way the screensaver's sources are. */
const useCalendarLibraries = ({api, settings, updateSettings, pushView, popView}) => {
	const [calendarLibraries, setCalendarLibraries] = useState([]);
	const [tempCalendarLibraryIds, setTempCalendarLibraryIds] = useState([]);
	const [calendarLibrariesLoading, setCalendarLibrariesLoading] = useState(false);

	const openCalendarLibraries = useCallback(async () => {
		pushView({view: 'calendarLibraries', returnFocusTo: 'setting-calendarLibraries'});
		setCalendarLibrariesLoading(true);
		setTempCalendarLibraryIds(Array.isArray(settings.calendarLibraryIds) ? [...settings.calendarLibraryIds] : []);
		try {
			const result = await api.getAllLibraries();
			setCalendarLibraries((result?.Items || []).filter((lib) => !lib?.CollectionType || CALENDAR_LIBRARY_TYPES.indexOf(lib.CollectionType) >= 0));
		} catch (err) {
			void err;
			setCalendarLibraries([]);
		} finally {
			setCalendarLibrariesLoading(false);
		}
	}, [api, pushView, settings.calendarLibraryIds]);

	const toggleCalendarLibrary = useCallback((id) => {
		setTempCalendarLibraryIds((prev) => (prev.indexOf(id) >= 0 ? prev.filter((entry) => entry !== id) : [...prev, id]));
	}, []);

	const saveCalendarLibraries = useCallback(() => {
		updateSettings({calendarLibraryIds: tempCalendarLibraryIds});
		popView();
	}, [tempCalendarLibraryIds, updateSettings, popView]);

	return {calendarLibraries, tempCalendarLibraryIds, calendarLibrariesLoading, openCalendarLibraries, toggleCalendarLibrary, saveCalendarLibraries};
};

export default useCalendarLibraries;
