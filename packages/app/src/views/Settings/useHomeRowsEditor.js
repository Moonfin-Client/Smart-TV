import {useCallback, useRef, useState} from 'react';

import {DEFAULT_HOME_ROWS} from '../../context/SettingsContext';
import {createApiForServer, getServerType} from '../../services/jellyfinApi';
import {SEERR_CONFIG_TO_SECTION} from '../../utils/seerrHomeRows';
import {getGenresIncludeTypes} from '../../utils/homeRowSorting';
import {isSameServer, isSectionTypeRow, makePickedRow, makeSeerrSliderRow, serverKey} from '../../utils/pickedRows';
import {loadDiscoverSliders, reconcileSliderRows} from '../../utils/seerrSliders';
import {isHomeRowVisibleByGates, mergeFoundRows} from './homeSectionsModel';
import {editedListKey} from './settingsRows';

const PICKABLE_LIMIT = 500;

const withOrder = (rows) => rows.map((row, order) => ({...row, order}));

// One sign in per server other than this one
const otherServers = (servers, serverUrl) => {
	const seen = new Set([serverKey(serverUrl)]);
	return (servers || []).filter((server) => {
		const key = serverKey(server.url);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

// Everything that can have a row of its own: the collections, genres and playlists of the lists
// switched on, and the collections of the other signed in servers while multi-server libraries is on
const findPickableRows = async ({api, serverUrl, servers, settings, rows = []}) => {
	const lists = [];
	const add = (source, url, request) => lists.push(request.then(
		(result) => (result?.Items || []).map((item) => makePickedRow({source, serverUrl: url, itemId: String(item.Id), name: item.Name}, false, 0)),
		() => []
	));
	if (settings.displayCollectionsRows) {
		add('collections', serverUrl, api.getCollections(PICKABLE_LIMIT));
		if (settings.unifiedLibraryMode) {
			otherServers(servers, serverUrl).forEach((server) => {
				const serverApi = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin');
				add('collections', server.url, serverApi.getCollections(PICKABLE_LIMIT));
			});
		}
	}
	if (settings.displayGenresRows) add('genres', serverUrl, api.getGenres(undefined, getGenresIncludeTypes(settings.genresRowItemFilter)));
	if (settings.displayPlaylistsRows) add('playlists', serverUrl, api.getPlaylists());
	// Silo's own home sections. One a section-type row (from Moonbase's defaults) already stands for isn't listed again.
	if (getServerType() === 'silo') {
		const typed = new Set(rows.filter((row) => isSectionTypeRow(row) && (!row.serverUrl || isSameServer(row.serverUrl, serverUrl)))
			.map((row) => row.itemId));
		add('server', serverUrl, api.getServerHomeSections().then((sections) => {
			const standIns = new Set(typed);
			return {Items: sections.filter((section) => !standIns.delete(`type:${section.kind}`)).map((section) => ({Id: section.id, Name: section.title}))};
		}));
	}
	return [].concat(...await Promise.all(lists));
};

// Swaps the order two entries hold, as new objects so the stored rows aren't changed under the
// screen before it writes them back
const swapOrder = (list, index, target) => {
	const next = [...list];
	next[index] = {...list[index], order: list[target].order};
	next[target] = {...list[target], order: list[index].order};
	return next.sort((a, b) => a.order - b.order);
};

// Switching a row on puts it after the last enabled one, so it joins the bottom of the Enabled
// list. Switching one off leaves it where it is among the disabled rows.
const toggleRowIn = (list, id) => {
	const row = list.find((entry) => entry.id === id);
	if (!row) return list;
	if (row.enabled) return list.map((entry) => (entry.id === id ? {...entry, enabled: false} : entry));
	const rest = list.filter((entry) => entry.id !== id);
	const after = rest.reduce((last, entry, index) => (entry.enabled ? index + 1 : last), 0);
	return [...rest.slice(0, after), {...row, enabled: true}, ...rest.slice(after)]
		.map((entry, index) => ({...entry, order: index}));
};

// The home screen row order, edited against a scratch copy and written back once the screen
// closes, and only if it ended up different. The IMDb rows are stored twice, as a row and as
// their own setting, so both are updated.
const useHomeRowsEditor = ({api, serverUrl, servers, settings, updateSetting, updateSettings, pushView}) => {
	const [tempHomeRows, setTempHomeRows] = useState([]);
	const [loading, setLoading] = useState(false);
	// Turns false once the server answers with no Live TV channels, which hides the Live TV rows.
	// A failed check keeps the last answer.
	const [serverHasLiveTv, setServerHasLiveTv] = useState(true);
	const openedRef = useRef('');
	// The rows found in the lists, and the ones among them the layout didn't hold. Those aren't
	// saved unless they're switched on, so a server with hundreds of collections doesn't fill the
	// layout with rows that are off.
	const foundRef = useRef({rows: [], added: new Set()});

	const toggleHomeRowEnabled = useCallback((sectionId) => {
		const current = Array.isArray(settings.homeRows) ? settings.homeRows : [];
		const next = current.map((row) => (row.id === sectionId ? {...row, enabled: !row.enabled} : row));
		updateSetting('homeRows', next);
	}, [settings.homeRows, updateSetting]);

	const toggleSeerrHomeRow = useCallback((rowId) => {
		toggleHomeRowEnabled(SEERR_CONFIG_TO_SECTION[rowId] || rowId);
	}, [toggleHomeRowEnabled]);

	// A slider put on Home for the first time joins the end. One taken off keeps its entry, so a
	// layout synced from a device that still has it doesn't bring it back on.
	const toggleSeerrSlider = useCallback((slider) => {
		const current = Array.isArray(settings.homeRows) ? settings.homeRows : [];
		const entry = makeSeerrSliderRow({serverUrl, sliderId: slider.id, sliderType: slider.type, name: slider.title}, true, current.length);
		const existing = current.find((row) => row.id === entry.id);
		updateSetting('homeRows', existing
			? current.map((row) => (row.id === entry.id ? {...row, enabled: !row.enabled} : row))
			: [...current, entry]);
	}, [serverUrl, settings.homeRows, updateSetting]);

	const openHomeRows = useCallback(() => {
		const rows = [...(settings.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order);
		openedRef.current = editedListKey(rows);
		foundRef.current = {rows: [], added: new Set()};
		setTempHomeRows(rows);
		setLoading(true);
		pushView({ view: 'homeRows', returnFocusTo: 'setting-homeRows' });

		api.getLiveTvChannels(0, 1)
			.then((result) => setServerHasLiveTv((result?.Items || []).length > 0))
			.catch(() => {});

		// A failed slider read leaves the slider rows alone, rather than reading as Seerr having none
		// and dropping them all.
		Promise.all([
			findPickableRows({api, serverUrl, servers, settings, rows}).catch(() => []),
			settings.useMoonfinPlugin ? loadDiscoverSliders({force: true}).catch(() => null) : null
		])
			.then(([found, sliders]) => {
				const reconciled = sliders ? reconcileSliderRows(rows, sliders, serverUrl) : {rows, changed: false};
				const merged = mergeFoundRows(reconciled.rows, found);
				// A pick or slider the server dropped or renamed is saved right away, whatever happens to the rest
				if (merged.changed || reconciled.changed) updateSetting('homeRows', withOrder(merged.rows));
				openedRef.current = editedListKey(merged.rows);
				foundRef.current = {rows: found, added: new Set(merged.added.map((row) => row.id))};
				setTempHomeRows(withOrder([...merged.rows, ...merged.added]));
				setLoading(false);
			});
	}, [api, serverUrl, servers, settings, pushView, updateSetting]);

	const commitHomeRows = useCallback(() => {
		const {added} = foundRef.current;
		const rows = withOrder(tempHomeRows.filter((row) => row.enabled || !added.has(row.id)));
		if (editedListKey(rows) === openedRef.current) return;
		openedRef.current = editedListKey(rows);
		const updates = {homeRows: rows};
		const imdbMap = {
			'imdb-top250-movies': 'imdbTop250MoviesEnabled',
			'imdb-top250-tv': 'imdbTop250TvShowsEnabled',
			'imdb-popular-movies': 'imdbMostPopularMoviesEnabled',
			'imdb-popular-tv': 'imdbMostPopularTvShowsEnabled',
			'imdb-lowest-rated': 'imdbLowestRatedMoviesEnabled',
			'imdb-top-english': 'imdbTopEnglishMoviesEnabled'
		};
		rows.forEach((row) => {
			const settingKey = imdbMap[row.id];
			if (settingKey) {
				updates[settingKey] = row.enabled;
			}
		});
		updateSettings(updates);
	}, [tempHomeRows, updateSettings]);

	// A reset keeps no picks, so everything found comes back as rows to switch on
	const resetHomeRows = useCallback(() => {
		const found = foundRef.current.rows;
		foundRef.current = {rows: found, added: new Set(found.map((row) => row.id))};
		setTempHomeRows(withOrder([...DEFAULT_HOME_ROWS, ...found]));
	}, []);

	const toggleHomeRow = useCallback((rowId) => {
		setTempHomeRows((prev) => toggleRowIn(prev, rowId));
	}, []);

	// Only enabled rows move, and a press steps over the disabled rows and the ones the gates
	// are hiding, so the row passes the next one the viewer sees in the Enabled list.
	const moveHomeRow = useCallback((rowId, direction) => {
		setTempHomeRows((prev) => {
			const visibleRows = prev.filter((row) => row.enabled && isHomeRowVisibleByGates(row, settings, serverHasLiveTv, serverUrl));
			const visibleIndex = visibleRows.findIndex((row) => row.id === rowId);
			const neighbourIndex = visibleIndex + direction;
			if (visibleIndex < 0 || neighbourIndex < 0 || neighbourIndex >= visibleRows.length) return prev;
			const targetId = visibleRows[neighbourIndex].id;
			const index = prev.findIndex((r) => r.id === rowId);
			const targetIndex = prev.findIndex((r) => r.id === targetId);
			if (index < 0 || targetIndex < 0) return prev;
			return swapOrder(prev, index, targetIndex);
		});
	}, [settings, serverHasLiveTv, serverUrl]);

	return {
		tempHomeRows,
		loading,
		serverHasLiveTv,
		toggleHomeRowEnabled,
		toggleSeerrHomeRow,
		toggleSeerrSlider,
		openHomeRows,
		commitHomeRows,
		resetHomeRows,
		toggleHomeRow,
		moveHomeRow
	};
};

export default useHomeRowsEditor;
