// How the home row editor decides what a viewer is allowed to see and reorder, and how the
// collections, genres and playlists it finds join the rows already arranged.

import $L from '@enact/i18n/$L';

import {FAVORITE_ROW_IDS, isExternalRowAvailable, isPluginSourcedRow, isRowEnabledBySetting} from '../../utils/homeRowGates';
import {CHART_ROWS} from '../../utils/homeLayout';
import {getServerType} from '../../services/jellyfinApi';
import {isPickedRow, isPickedRowShown, isSameServer, isSectionTypeRow, isSeerrSliderRow} from '../../utils/pickedRows';
import {isSliderRowLive} from '../../utils/seerrSliders';

const LIVE_TV_ROW_IDS = ['livetv', 'onnow', 'activerecordings'];

export const isHomeRowVisibleByGates = (row, settings, serverHasLiveTv = true, serverUrl, pluginInfo = null) => {
	if (isPickedRow(row)) return isPickedRowShown(row, settings, serverUrl, getServerType());
	if (isSeerrSliderRow(row)) return Boolean(settings.useMoonfinPlugin) && isSameServer(row.serverUrl, serverUrl) && isSliderRowLive(row);
	if (!serverHasLiveTv && LIVE_TV_ROW_IDS.includes(row.id)) return false;
	const external = isExternalRowAvailable(row.id, {settings, pluginInfo, serverType: getServerType()});
	if (external !== null) return external;
	if (isPluginSourcedRow(row.id)) return Boolean(settings.useMoonfinPlugin) && isRowEnabledBySetting(row.id, settings);
	return isRowEnabledBySetting(row.id, settings);
};

// The editor lists the disabled rows under one heading per kind, in this order
export const HOME_ROW_GROUPS = ['general', 'collections', 'favorites', 'genres', 'playlists', 'seerr', 'imdb', 'tmdb', 'streaming', 'mdblist', 'justwatch'];

const STREAMING_ROW_IDS = CHART_ROWS.filter((row) => row.type.startsWith('provider_')).map((row) => row.id);

export const homeRowGroup = (row) => {
	if (row.source === 'collections' || row.id === 'collections') return 'collections';
	if (row.source === 'genres' || row.id === 'genres' || row.id === 'studios') return 'genres';
	if (FAVORITE_ROW_IDS.includes(row.id)) return 'favorites';
	if (row.source === 'playlists' || row.id === 'playlists') return 'playlists';
	if (row.source === 'seerr' || row.id.startsWith('seerr_') || row.id === 'radarr_calendar' || row.id === 'sonarr_calendar') return 'seerr';
	// The outside lists go by where they come from, with the streaming service charts on their own
	if (row.id.startsWith('imdb-')) return 'imdb';
	if (STREAMING_ROW_IDS.includes(row.id)) return 'streaming';
	if (row.id.startsWith('tmdb_')) return 'tmdb';
	if (row.id.startsWith('mdblist_')) return 'mdblist';
	if (row.id.startsWith('justwatch_')) return 'justwatch';
	return 'general';
};

// Where an outside list comes from, shown under its name in the editor
export const homeRowSource = (row) => {
	const group = homeRowGroup(row);
	if (group === 'mdblist') return row.id === 'mdblist_watching_now' ? 'MDBList' : 'MDBList Lists';
	return {imdb: 'IMDb List', tmdb: 'TMDB Lists', streaming: 'TMDB Lists', justwatch: 'JustWatch'}[group];
};

// The editor leaves an outside list's source to its group and subtitle
export const editorRowName = (name) => name.replace(/^(IMDb|TMDB|TMDb) /, '');

// A row's id without the item on the end names the list and server it was picked from
const listOf = (row) => row.id.slice(0, row.id.length - row.itemId.length).toLowerCase();

// The rows found in the lists, joined to the arranged ones. A pick its list came back without is
// gone, and the rest take the name their server gives them now. A list that came back empty proves
// nothing, since a failed request looks the same, so its picks stay. What's new comes back in
// added, switched off.
export const mergeFoundRows = (rows, found) => {
	const foundById = new Map(found.map((row) => [row.id.toLowerCase(), row]));
	const lists = new Set(found.map(listOf));
	const known = new Set();
	let changed = false;
	const kept = [];
	rows.forEach((row) => {
		// A section-type row stands for whatever section of that type the server has, so it never goes stale.
		if (!isPickedRow(row) || isSectionTypeRow(row)) {
			kept.push(row);
			return;
		}
		const fresh = foundById.get(row.id.toLowerCase());
		known.add(row.id.toLowerCase());
		if (fresh && fresh.name !== row.name) {
			kept.push({...row, name: fresh.name});
			changed = true;
		} else if (fresh || !lists.has(listOf(row))) {
			kept.push(row);
		} else {
			changed = true;
		}
	});
	return {rows: kept, added: found.filter((row) => !known.has(row.id.toLowerCase())), changed};
};

export const pickedRowLabel = (row, serverUrl, servers) => {
	if (row.source === 'server') return $L('Silo Home row');
	if (row.source === 'genres') return $L('Genres row');
	if (row.source === 'playlists') return $L('Playlists row');
	if (isSameServer(row.serverUrl, serverUrl)) return $L('Collections row');
	const server = (servers || []).find((entry) => isSameServer(entry.url, row.serverUrl));
	return $L('Collections row from {server}').replace('{server}', server?.name || row.serverUrl);
};
