import {useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {getExternalHomeRowConfigs, fetchExternalPresetRow, fetchCustomHomeRow, fetchCalendarRows, buildSeasonalRow} from '../../utils/externalHomeRows';
import {fetchSeasonalRow} from '../../services/externalRowsApi';
import {resolveItemsByProviderIds} from '../../services/jellyfinApi';
import {seasonalCountryParam} from '../../utils/seasonalRow';
import {resolveDeviceCountry} from '../../utils/deviceCountry';

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
		if (enabledPresets.length === 0 && customRows.length === 0 && !calendarsEnabled && !seasonalEnabled) {
			setExternalRows([]);
			setPending([]);
			return undefined;
		}

		let cancelled = false;
		const presetConfigs = getExternalHomeRowConfigs();
		const mergedCalendars = radarrEnabled && sonarrEnabled && settings.mergeRadarrSonarrCalendars;
		setPending([
			...enabledPresets
				.map((id) => presetConfigs.find((c) => c.id === id))
				.filter(Boolean)
				.map((cfg) => ({id: cfg.id, title: cfg.title})),
			...customRows.map((row) => ({id: `external-${row.id}`, title: row.name || row.title || $L('Custom'), isCustomRow: true})),
			...(seasonalEnabled ? [{id: 'seasonal', title: $L('Seasonal Row')}] : []),
			...(mergedCalendars ? [{id: 'radarr_calendar', title: $L('Upcoming Releases'), isCalendarMerged: true}] : []),
			...(radarrEnabled && !mergedCalendars ? [{id: 'radarr_calendar', title: $L('Upcoming Movies')}] : []),
			...(sonarrEnabled && !mergedCalendars ? [{id: 'sonarr_calendar', title: $L('Upcoming Episodes')}] : [])
		]);

		(async () => {
			try {
				const presetData = await Promise.all(enabledPresets.map(async (id) => {
					const cfg = presetConfigs.find((c) => c.id === id);
					if (!cfg) return null;
					const items = await fetchExternalPresetRow(id, {language: settings.uiLanguage});
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
					sonarrCalendarShowDate: settings.sonarrCalendarShowDate,
					sonarrCalendarShowEpisodeInfo: settings.sonarrCalendarShowEpisodeInfo
				};
				const calendarRows = calendarsEnabled ? await fetchCalendarRows(calendarSettings, {radarrEnabled, sonarrEnabled}) : [];

				// Owned seasonal titles are library items already, so this row skips the
				// provider id matching the others go through.
				let seasonalRow = null;
				if (seasonalEnabled) {
					const country = seasonalCountryParam(settings.seasonalRowCountry, await resolveDeviceCountry());
					seasonalRow = buildSeasonalRow(await fetchSeasonalRow({country}), settings.seasonalRowHiddenHolidays || []);
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
					setExternalRows([...presetRows, ...builtCustomRows, seasonalRow, ...resolvedCalendarRows].filter(Boolean));
				}
			} catch (err) {
				console.warn('[Browse] Failed to fetch and resolve external rows:', err);
			}
			if (!cancelled) setPending([]);
		})();

		return () => {
			cancelled = true;
		};
	}, [settings.useMoonfinPlugin, homeRows, kidsMode, settings.homeRows, settings.customHomeRows,
		settings.uiLanguage,
		settings.seasonalRowEnabled, settings.seasonalRowCountry, settings.seasonalRowHiddenHolidays,
		settings.mergeRadarrSonarrCalendars,
		settings.radarrCalendarShowCinema, settings.radarrCalendarShowDigital, settings.radarrCalendarShowPhysical,
		settings.radarrCalendarShowDate, settings.sonarrCalendarShowDate, settings.sonarrCalendarShowEpisodeInfo]);

	return {rows: externalRows, pending};
};

export default useExternalRows;
