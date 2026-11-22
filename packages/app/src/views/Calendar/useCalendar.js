import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {loadCalendar, seriesProgress} from '../../services/calendarApi';
import {shiftedNow} from '../../utils/clock';
import {addDays, behindOnSeries, calendarAllows, followsSeries, isEpisode, isoDay, startOfDay} from '../../utils/calendarEntries';

// Minutes are the smallest unit the countdown shows, so a tick every 20 s keeps it within a third
// of a minute.
const TICK_MS = 20000;

const count = (value, fallback) => (typeof value === 'number' && value >= 0 ? Math.trunc(value) : fallback);

/**
 * Loads the whole calendar window once and filters it with the calendar settings. Each screen has
 * its own, and loadCalendar caches the fetch between them.
 */
const useCalendar = ({tick = false} = {}) => {
	const {serverUrl, accessToken, api} = useAuth();
	const {settings} = useSettings();
	const {pluginInfo} = useSeerr();
	const daysBack = count(pluginInfo?.calendarDaysBack, 14);
	const daysAhead = count(pluginInfo?.calendarDaysAhead, 90);
	const offset = settings.timeOffsetHours;
	const [now, setNow] = useState(() => shiftedNow(offset));
	const todayKey = isoDay(now);
	// Only a new day moves the window, so the countdown's tick doesn't refetch.
	const today = useMemo(() => startOfDay(now), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
	const windowStart = useMemo(() => addDays(today, -daysBack), [today, daysBack]);
	const windowEnd = useMemo(() => addDays(today, daysAhead + 1), [today, daysAhead]);

	const [state, setState] = useState({loading: true, all: [], problem: null});
	const [progress, setProgress] = useState({});
	const progressRef = useRef(progress);
	const generationRef = useRef(0);

	const unmonitored = settings.calendarIncludeUnmonitored === true;
	const needsProgress = settings.calendarScope === 'myShows' || settings.calendarSpoilerSafe === true;

	useEffect(() => {
		if (!tick) return undefined;
		const timer = setInterval(() => setNow(shiftedNow(offset)), TICK_MS);
		return () => clearInterval(timer);
	}, [tick, offset]);

	const load = useCallback(async (refresh = false) => {
		const generation = ++generationRef.current;
		setState((prev) => (prev.all.length ? prev : {...prev, loading: true}));
		const result = await loadCalendar({serverUrl, token: accessToken, start: windowStart, end: windowEnd, unmonitored, refresh});
		// My shows and spoiler safe read watch state, fetched once per series.
		let nextProgress = progressRef.current;
		if (needsProgress && api) {
			const ids = [];
			result.entries.forEach((e) => {
				if (isEpisode(e) && e.itemId && !nextProgress[e.itemId] && ids.indexOf(e.itemId) < 0) ids.push(e.itemId);
			});
			if (ids.length) nextProgress = {...nextProgress, ...(await seriesProgress(api, ids))};
		}
		if (generation !== generationRef.current) return;
		progressRef.current = nextProgress;
		setProgress(nextProgress);
		setNow(shiftedNow(offset));
		setState({loading: false, all: result.entries, problem: result.problem});
	}, [serverUrl, accessToken, api, windowStart, windowEnd, unmonitored, needsProgress, offset]);

	useEffect(() => {
		load(false);
	}, [load]);

	const followed = useMemo(() => {
		const ids = new Set();
		Object.keys(progress).forEach((id) => {
			if (followsSeries(progress[id])) ids.add(id);
		});
		return ids;
	}, [progress]);

	const {calendarShowEpisodes, calendarShowMovies, calendarShowSpecials, calendarScope, calendarLibraryIds,
		radarrCalendarShowCinema, radarrCalendarShowDigital, radarrCalendarShowPhysical} = settings;
	const entries = useMemo(() => {
		const filter = {calendarShowEpisodes, calendarShowMovies, calendarShowSpecials, calendarScope, calendarLibraryIds,
			radarrCalendarShowCinema, radarrCalendarShowDigital, radarrCalendarShowPhysical};
		return state.all.filter((e) => calendarAllows(e, filter, followed));
	}, [state.all, followed, calendarShowEpisodes, calendarShowMovies, calendarShowSpecials, calendarScope, calendarLibraryIds,
		radarrCalendarShowCinema, radarrCalendarShowDigital, radarrCalendarShowPhysical]);

	const spoilerSafe = settings.calendarSpoilerSafe === true;
	// Spoiler safe hides an episode's name and still for a series the user is part way through.
	const hidesSpoilers = useCallback((e) => spoilerSafe && isEpisode(e) && behindOnSeries(progress[e.itemId]), [spoilerSafe, progress]);
	const reload = useCallback(() => load(true), [load]);

	return {loading: state.loading, problem: state.problem, entries, now, today, windowStart, windowEnd, hidesSpoilers, reload};
};

export default useCalendar;
