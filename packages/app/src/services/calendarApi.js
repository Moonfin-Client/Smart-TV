import seerrApi from './seerrApi';
import {PROBLEM, addDays, buildEntries, isoDay, problemFrom, seriesProgressOf, worstProblem} from '../utils/calendarEntries';

// The Calendar screen's data: one window of the Sonarr and Radarr calendars, fetched once and shared
// by the styles and the month grid, with the watch state My shows and spoiler safe need.

const CACHE_MS = 2 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

/**
 * Entries on local days from start up to but not including end, as {entries, problem}. problem is
 * set only when neither source answered.
 */
export const loadCalendar = ({serverUrl, token, start, end, unmonitored = false, refresh = false}) => {
	const key = `${serverUrl}|${token}|${isoDay(start)}|${isoDay(end)}|${unmonitored}`;
	const hit = cache.get(key);
	if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.result);
	if (!refresh && inFlight.has(key)) return inFlight.get(key);

	// Sonarr's range is in UTC, so a day either side keeps evening episodes in far time zones. The
	// local day filter trims the extra.
	const query = {start: isoDay(addDays(start, -1)), end: isoDay(addDays(end, 1)), unmonitored};
	const run = Promise.all([
		seerrApi.getArrCalendar('Sonarr', query, serverUrl, token),
		seerrApi.getArrCalendar('Radarr', query, serverUrl, token)
	]).then(([sonarr, radarr]) => {
		const entries = buildEntries(sonarr.items, radarr.items, start, end);
		const problem = !sonarr.items && !radarr.items
			? worstProblem(problemFrom(sonarr.status, sonarr.body), problemFrom(radarr.status, radarr.body))
			: null;
		const result = {entries, problem};
		if (!problem) cache.set(key, {at: Date.now(), result});
		return result;
	}, (err) => {
		console.warn('[Calendar] Load failed:', err);
		return {entries: [], problem: PROBLEM.failed};
	});
	inFlight.set(key, run);
	run.then(() => inFlight.delete(key));
	return run;
};

/** Favorite and watch state of the given library series, keyed by id. */
export const seriesProgress = async (api, seriesIds) => {
	const out = {};
	for (let i = 0; i < seriesIds.length; i += 50) {
		try {
			const page = await api.getItems({
				Ids: seriesIds.slice(i, i + 50).join(','),
				Fields: 'RecursiveItemCount',
				EnableTotalRecordCount: false
			});
			(page?.Items || []).forEach((item) => {
				const progress = seriesProgressOf(item);
				if (progress) out[item.Id] = progress;
			});
		} catch (err) {
			console.warn('[Calendar] Series progress failed:', err);
		}
	}
	return out;
};
