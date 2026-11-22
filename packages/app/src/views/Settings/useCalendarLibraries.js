import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import {asOptions} from './useMediaBarSources';

// Sonarr and Radarr titles only land in these, so other kinds of library aren't offered.
const CALENDAR_LIBRARY_TYPES = ['movies', 'tvshows', 'mixed'];

/**
 * The libraries the Calendar screen lists, loaded with the settings since the row names the
 * picked ones the way Core's does, and the checklist that picks them in the server's order.
 */
const useCalendarLibraries = ({api, settings, updateSettings, openChecklist}) => {
	const [calendarLibraries, setCalendarLibraries] = useState([]);

	useEffect(() => {
		let live = true;
		Promise.resolve(api.getAllLibraries()).then((result) => {
			if (!live) return;
			setCalendarLibraries((result?.Items || [])
				.filter((lib) => !lib?.CollectionType || CALENDAR_LIBRARY_TYPES.indexOf(lib.CollectionType) >= 0));
		}, (err) => {
			void err;
		});
		return () => {
			live = false;
		};
	}, [api]);

	const openCalendarLibraries = useCallback(() => {
		openChecklist({
			title: $L('Libraries'),
			options: asOptions(calendarLibraries),
			picked: Array.isArray(settings.calendarLibraryIds) ? settings.calendarLibraryIds : [],
			onSave: (picked) => updateSettings({calendarLibraryIds: picked}),
			returnFocusTo: 'setting-calendarLibraries'
		});
	}, [calendarLibraries, openChecklist, settings.calendarLibraryIds, updateSettings]);

	return {calendarLibraries, openCalendarLibraries};
};

export default useCalendarLibraries;
