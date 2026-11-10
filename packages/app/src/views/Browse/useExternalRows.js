import {useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {getExternalHomeRowConfigs, fetchExternalPresetRow, fetchCustomHomeRow, fetchCalendarRows, buildSeasonalRow, formatWatchingNowSubtitle, normalizeWatchingNowItem} from '../../utils/externalHomeRows';
import {fetchSeasonalRow} from '../../services/externalRowsApi';
import {fetchWatchingNow} from '../../services/mdblistApi';
import {resolveItemsByProviderIds} from '../../services/jellyfinApi';
import {seasonalCountryParam} from '../../utils/seasonalRow';
import {resolveDeviceCountry} from '../../utils/deviceCountry';
import {settleSections} from './browseCache';

// Owned titles become library items so they open and play without Seerr, the rest open in Seerr.
const loadWatchingNowRow = async (forceRefresh = false) => {
	const data = await fetchWatchingNow(null, {forceRefresh});
	const identified = (data?.items || []).filter((item) => item && (item.imdb_id || item.tmdb_id));
	if (identified.length === 0) return null;
	return {
		id: 'mdblist_watching_now',
		title: $L('Watching on MDBList'),
		subtitle: formatWatchingNowSubtitle(data),
		items: await resolveItemsByProviderIds(identified.map(normalizeWatchingNowItem)),
		isExternalRow: true,
		isWatchingNowRow: true
	};
};

const withRow = (rows, row) => {
	const index = rows.findIndex((r) => r.id === row.id);
	if (index < 0) return [...rows, row];
	const updated = [...rows];
	updated[index] = row;
	return updated;
};

// Home rows built from TMDB and IMDb charts, lists the viewer pasted a URL for, and the
// Radarr and Sonarr calendars. Items arrive as provider ids, so every row is resolved against
// the local library first: what the server owns becomes playable, the rest falls back to Seerr.
// The rows still on their way come back as [pending], so they can hold their place.
const useExternalRows = ({settings, homeRows, kidsMode}) => {
	const [externalRows, setExternalRows] = useState([]);
	const [pending, setPending] = useState([]);

	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			setExternalRows([]);
			setPending([]);
			return undefined;
		}
		// The rows arrive already filtered, and the pasted list rows go the way the plugin rows do,
		// since nothing here can vouch for what an outside catalogue returns.
		const rows = homeRows || settings.homeRows || [];
		const enabledPresets = rows.filter((r) => r.enabled && (r.id.startsWith('tmdb_') || r.id.startsWith('imdb-'))).map((r) => r.id);
		const customRows = kidsMode ? [] : (settings.customHomeRows || []).filter((r) => r.enabled);
		const radarrEnabled = rows.some((r) => r.enabled && r.id === 'radarr_calendar');
		const sonarrEnabled = rows.some((r) => r.enabled && r.id === 'sonarr_calendar');
		const calendarsEnabled = radarrEnabled || sonarrEnabled;
		// The seasonal row is stored as a home row and as its own synced toggle, and both have to be on.
		const seasonalEnabled = settings.seasonalRowEnabled === true && rows.some((r) => r.enabled && r.id === 'seasonal');
		const watchingNowEnabled = settings.mdblistWatchingNowEnabled === true && rows.some((r) => r.enabled && r.id === 'mdblist_watching_now');
		if (enabledPresets.length === 0 && customRows.length === 0 && !calendarsEnabled && !seasonalEnabled && !watchingNowEnabled) {
			setExternalRows([]);
			setPending([]);
			return undefined;
		}

		let cancelled = false;
		let refreshTimer = null;
		const presetConfigs = getExternalHomeRowConfigs();
		const mergedCalendars = radarrEnabled && sonarrEnabled && settings.mergeRadarrSonarrCalendars;
		const pendingRows = [
			...enabledPresets
				.map((id) => presetConfigs.find((c) => c.id === id))
				.filter(Boolean)
				.map((cfg) => ({id: cfg.id, title: cfg.title})),
			...customRows.map((row) => ({id: `external-${row.id}`, title: row.name || row.title || $L('Custom'), isCustomRow: true})),
			...(seasonalEnabled ? [{id: 'seasonal', title: $L('Seasonal Row')}] : []),
			...(watchingNowEnabled ? [{id: 'mdblist_watching_now', title: $L('Watching on MDBList')}] : []),
			...(mergedCalendars ? [{id: 'radarr_calendar', title: $L('Upcoming Releases'), isCalendarMerged: true}] : []),
			...(radarrEnabled && !mergedCalendars ? [{id: 'radarr_calendar', title: $L('Upcoming Movies')}] : []),
			...(sonarrEnabled && !mergedCalendars ? [{id: 'sonarr_calendar', title: $L('Upcoming Episodes')}] : [])
		];
		setPending(pendingRows);

		(async () => {
			try {
				const presetData = await Promise.all(enabledPresets.map(async (id) => {
					const cfg = presetConfigs.find((c) => c.id === id);
					if (!cfg) return null;
					const imdb = id.startsWith('imdb-');
					const items = await fetchExternalPresetRow(id, {
						language: settings.uiLanguage,
						sortBy: imdb ? settings.imdbRowsSortBy : settings.tmdbRowsSortBy,
						sortOrder: imdb ? settings.imdbRowsSortOrder : settings.tmdbRowsSortOrder
					});
					return {id, title: cfg.title, items: items || []};
				}));

				const customData = await Promise.all(customRows.map(async (row) => {
					const items = await fetchCustomHomeRow(row, {language: settings.uiLanguage});
					return {id: `external-${row.id}`, title: row.name || row.title || $L('Custom'), items: items || [], isCustomRow: true};
				}));

				const calendarSettings = {
					mergeRadarrSonarrCalendars: settings.mergeRadarrSonarrCalendars,
					radarrCalendarShowCinema: settings.radarrCalendarShowCinema,
					radarrCalendarShowDigital: settings.radarrCalendarShowDigital,
					radarrCalendarShowPhysical: settings.radarrCalendarShowPhysical,
					radarrCalendarShowDate: settings.radarrCalendarShowDate,
					radarrCalendarHideDownloaded: settings.radarrCalendarHideDownloaded,
					sonarrCalendarShowDate: settings.sonarrCalendarShowDate,
					sonarrCalendarShowEpisodeInfo: settings.sonarrCalendarShowEpisodeInfo,
					sonarrCalendarHideDownloaded: settings.sonarrCalendarHideDownloaded,
					dateFormat: settings.dateFormat
				};
				const calendarRows = calendarsEnabled ? await fetchCalendarRows(calendarSettings, {radarrEnabled, sonarrEnabled}) : [];

				// Owned seasonal titles are library items already, so this row skips the
				// provider id matching the others go through.
				let seasonalRow = null;
				if (seasonalEnabled) {
					const country = seasonalCountryParam(settings.seasonalRowCountry, await resolveDeviceCountry());
					seasonalRow = buildSeasonalRow(await fetchSeasonalRow({country, allYear: settings.seasonalRowAllYear === true}), settings.seasonalRowHiddenHolidays || []);
				}

				const allRows = [
					...presetData,
					...customData,
					...calendarRows.map((r) => ({...r, isCalendarRow: true}))
				].filter((r) => r && r.items && r.items.length > 0);

				// Every row's items go out in one request rather than one per row, then each
				// row takes back the slice it put in.
				const allItemsToResolve = [];
				const rowIndices = [];
				for (const r of allRows) {
					rowIndices.push({start: allItemsToResolve.length, count: r.items.length});
					allItemsToResolve.push(...r.items);
				}

				const resolvedAllItems = await resolveItemsByProviderIds(allItemsToResolve);

				const presetRows = [];
				const builtCustomRows = [];
				const resolvedCalendarRows = [];

				for (let i = 0; i < allRows.length; i++) {
					const r = allRows[i];
					const sliceInfo = rowIndices[i];
					const resolvedItems = resolvedAllItems.slice(sliceInfo.start, sliceInfo.start + sliceInfo.count);

					if (r.isCalendarRow) {
						resolvedCalendarRows.push({...r, items: resolvedItems});
					} else {
						const resolvedRow = {
							id: r.id,
							title: r.title,
							items: resolvedItems,
							isExternalRow: true,
							isCustomRow: r.isCustomRow
						};
						if (r.isCustomRow) {
							builtCustomRows.push(resolvedRow);
						} else {
							presetRows.push(resolvedRow);
						}
					}
				}

				if (!cancelled) {
					const built = [...presetRows, ...builtCustomRows, seasonalRow, ...resolvedCalendarRows].filter(Boolean);
					settleSections(pendingRows.filter((row) => row.id !== 'mdblist_watching_now').map((row) => row.id), built);
					// Watching Now loads on its own, so a row it already put up stays.
					setExternalRows((prevRows) => [...built, ...(watchingNowEnabled ? prevRows.filter((r) => r.id === 'mdblist_watching_now') : [])]);
				}
			} catch (err) {
				console.warn('[Browse] Failed to fetch and resolve external rows:', err);
			}
			if (!cancelled) setPending((prevPending) => prevPending.filter((row) => row.id === 'mdblist_watching_now'));
		})();

		if (watchingNowEnabled) {
			// Loaded apart so a slow MDBList answer doesn't hold back the other rows.
			loadWatchingNowRow().then((row) => {
				if (cancelled) return;
				settleSections(['mdblist_watching_now'], row ? [row] : []);
				setExternalRows((prevRows) => (row ? withRow(prevRows, row) : prevRows.filter((r) => r.id !== 'mdblist_watching_now')));
				setPending((prevPending) => prevPending.filter((r) => r.id !== 'mdblist_watching_now'));
			});

			refreshTimer = setInterval(async () => {
				// The player takes Home down with it, so only a hidden app is left to skip.
				if (document.hidden) return;
				const row = await loadWatchingNowRow(true);
				if (!row || cancelled) return;
				setExternalRows((prevRows) => withRow(prevRows, row));
			}, 5 * 60 * 1000);
		}

		return () => {
			cancelled = true;
			if (refreshTimer) clearInterval(refreshTimer);
		};
	}, [settings.useMoonfinPlugin, homeRows, kidsMode, settings.homeRows, settings.customHomeRows,
		settings.uiLanguage, settings.mdblistWatchingNowEnabled,
		settings.seasonalRowEnabled, settings.seasonalRowCountry, settings.seasonalRowHiddenHolidays, settings.seasonalRowAllYear,
		settings.mergeRadarrSonarrCalendars,
		settings.radarrCalendarShowCinema, settings.radarrCalendarShowDigital, settings.radarrCalendarShowPhysical,
		settings.radarrCalendarShowDate, settings.sonarrCalendarShowDate, settings.sonarrCalendarShowEpisodeInfo,
		settings.radarrCalendarHideDownloaded, settings.sonarrCalendarHideDownloaded, settings.dateFormat,
		settings.imdbRowsSortBy, settings.imdbRowsSortOrder, settings.tmdbRowsSortBy, settings.tmdbRowsSortOrder]);

	return {rows: externalRows, pending};
};

export default useExternalRows;
