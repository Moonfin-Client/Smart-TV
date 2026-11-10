// The Home preview for the audio, Collections, Favorites, Genres, Playlists and Studios Row
// Options. It draws Home the way it looks with the D-pad on the first row the setting changes: that
// row on top with its first card focused, loaded in the sort being looked at, and Home's own rows
// below it in Home's order.

import {useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import {useAuth} from '../../../context/AuthContext';
import {getServerUrl} from '../../../services/jellyfinApi';
import {getImageUrl} from '../../../utils/helpers';
import useParentalFilter from '../../../hooks/useParentalFilter';
import {isKidsMode, kidsModeRows} from '../../../utils/kidsMode';
import {isPickedRow, isPickedRowShown} from '../../../utils/pickedRows';
import {memoryCache} from '../../Browse/browseCache';
import {FAVORITE_ROW_IDS} from '../../../utils/homeRowGates';
import {FAVORITE_ROW_CONFIGS} from '../../Browse/browseFilters';
import {isPlaylistOrder} from '../../../utils/homeRowSorting';
import {
	audioPlaylistsOf, buildLoaderContext, readCollections, readFavorites, readGenres, readMusicAlbums, readMusicArtists, readPlaylists, readStudios
} from '../../Browse/browseRowLoaders';
import {buildBrowseRows} from '../../Browse/buildBrowseRows';
import {classicShape, rowImageType} from '../../Browse/rowPeek';
import {adaptItem} from '../../SetupWizard/setupPreviewData';
import {
	AUDIO_ROW_OPTION_KEYS, COLLECTIONS_ROW_OPTION_KEYS, FAVORITES_ROW_OPTION_KEYS, GENRES_ROW_OPTION_KEYS, PLAYLISTS_ROW_OPTION_KEYS, STUDIOS_ROW_OPTION_KEYS
} from './previewRows';

// Each group of rows its Row Options settings change, with the Display switch over the group.
// Continue Listening isn't sorted by the audio settings, so it isn't one of them.
const GROUPS = {
	audio: {
		display: 'displayAudioRows',
		rowIds: ['audioartists', 'audioalbums', 'audioplaylists'],
		keys: AUDIO_ROW_OPTION_KEYS
	},
	collections: {
		display: 'displayCollectionsRows',
		rowIds: ['collections'],
		keys: COLLECTIONS_ROW_OPTION_KEYS
	},
	favorites: {
		display: 'displayFavoritesRows',
		rowIds: FAVORITE_ROW_IDS,
		keys: FAVORITES_ROW_OPTION_KEYS
	},
	genres: {
		display: 'displayGenresRows',
		rowIds: ['genres'],
		keys: GENRES_ROW_OPTION_KEYS
	},
	playlists: {
		display: 'displayPlaylistsRows',
		rowIds: ['playlists'],
		keys: PLAYLISTS_ROW_OPTION_KEYS
	},
	studios: {
		display: 'displayStudiosRows',
		rowIds: ['studios'],
		keys: STUDIOS_ROW_OPTION_KEYS
	}
};

const groupOf = (key) => Object.keys(GROUPS).find((id) => GROUPS[id].keys.indexOf(key) >= 0) || null;

const DISPLAY_SWITCH_NAMES = {
	audio: () => $L('Display Audio Rows'),
	collections: () => $L('Display Collections Rows'),
	favorites: () => $L('Display Favorites Rows'),
	genres: () => $L('Display Genres Rows'),
	playlists: () => $L('Display Playlist Rows'),
	studios: () => $L('Display Studio Row')
};
const displaySwitchName = (group) => DISPLAY_SWITCH_NAMES[group]();

// The heading the Rows screen lists each group's disabled rows under.
const ROWS_GROUP_NAMES = {
	audio: () => $L('General'),
	collections: () => $L('Collections'),
	favorites: () => $L('Favorites'),
	genres: () => $L('Genres and Studios'),
	playlists: () => $L('Playlists'),
	studios: () => $L('Genres and Studios')
};

// Home's rows in Home's order, without the ones Kids Mode keeps off.
const homeRowsOf = (settings) => kidsModeRows([...(settings.homeRows || [])].sort((a, b) => a.order - b.order), isKidsMode(settings));

// A single collection, genre or playlist added as its own row in Rows that Home shows on this
// server, which its group's sort settings sort too.
const isPickedOf = (group, settings, serverUrl, serverType) => (row) => row.enabled && isPickedRow(row) && row.source === group &&
	isPickedRowShown(row, settings, serverUrl, serverType);
const PICKED_GROUPS = ['collections', 'genres', 'playlists'];

// Why none of [group]'s rows can be on Home, or null when one can. Multi-Server Libraries draws
// Home without them, Kids Mode leaves them out, and otherwise they're all off in Rows.
const offReason = (group, settings, hasMultipleServers, serverUrl, serverType) => {
	if (settings.unifiedLibraryMode && hasMultipleServers) return 'unified';
	if (isKidsMode(settings)) return 'kids';
	const rows = homeRowsOf(settings);
	if (rows.some((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0)) return null;
	if (PICKED_GROUPS.indexOf(group) >= 0 && rows.some(isPickedOf(group, settings, serverUrl, serverType))) return null;
	return 'rows';
};

// For the inspector: what to change before the Row Options setting [key] can change Home, or
// null when nothing needs to or it isn't one of them. The Rows screen only lists the rows once
// their Display switch is on, so with the switch off that comes first.
export const rowOptionsBlockedReason = (key, settings, hasMultipleServers, serverUrl, serverType) => {
	const group = groupOf(key);
	if (!group) return null;
	switch (offReason(group, settings, hasMultipleServers, serverUrl, serverType)) {
		case 'unified': return $L('Multi-Server Libraries keeps this off Home');
		case 'kids': return $L('Kids Mode keeps this off Home');
		case 'rows': return settings[GROUPS[group].display]
			? $L('Turn on a row in Rows, under {disabled}').replace('{disabled}', $L('Disabled'))
			: $L('Turn on {setting}, then turn on a row in Rows').replace('{setting}', displaySwitchName(group));
		default: return null;
	}
};

// The notice over the preview while the rows can't be on Home, naming the steps in the order the
// Rows screen needs them and the group of disabled rows to open there.
const offNotice = (group, reason, settings) => {
	if (reason === 'unified') return $L("Home leaves these rows out while Multi-Server Libraries is on, so these settings don't change it.");
	if (reason === 'kids') return $L("Kids Mode keeps these rows off Home, so these settings don't change it.");
	const on = settings[GROUPS[group].display];
	let text;
	if (group === 'audio') {
		text = on
			? $L('Music Artists, Music Albums and Music Playlists are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see Music Artists, Music Albums or Music Playlists on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.');
	} else if (group === 'favorites') {
		text = on
			? $L('The Favorites rows are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see a Favorites row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.');
	} else if (group === 'genres') {
		text = on
			? $L('The Genres row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Genres row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.');
	} else if (group === 'playlists') {
		text = on
			? $L('The Playlists row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Playlists row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.');
	} else if (group === 'studios') {
		text = on
			? $L('The Studios row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Studios row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.');
	} else {
		text = on
			? $L('The Collections row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Collections row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.');
	}
	return text
		.replace('{setting}', displaySwitchName(group))
		.replace('{group}', ROWS_GROUP_NAMES[group]())
		.replace('{disabled}', $L('Disabled'));
};

const FAVORITE_ROWS = Object.fromEntries(FAVORITE_ROW_CONFIGS.map((row) => [row.id, row]));

// Each row's title and card type, the same as Home gives it.
const ROWS = {
	audioartists: {title: () => $L('Music Artists'), type: 'square'},
	audioalbums: {title: () => $L('Music Albums'), type: 'square'},
	audioplaylists: {title: () => $L('Music Playlists'), type: 'square'},
	collections: {title: () => $L('Collections'), type: 'portrait'},
	genres: {title: () => $L('Genres'), type: 'portrait'},
	playlists: {title: () => $L('Playlists'), type: 'square'},
	studios: {title: () => $L('Studios'), type: 'landscape'},
	...Object.fromEntries(FAVORITE_ROW_CONFIGS.map((row) => [row.id, {title: () => $L(row.title), type: row.type}]))
};

const ROW_LIMIT = 20;
const READERS = {audioartists: readMusicArtists, audioalbums: readMusicAlbums, collections: readCollections};

const readRow = async (api, rowId, sort, serverUrl) => {
	const {sortBy, sortOrder} = sort;
	if (rowId === 'genres') return readGenres(api, sort);
	if (rowId === 'playlists') return readPlaylists(api, sort);
	if (rowId === 'studios') return readStudios(api, sort, serverUrl);
	if (rowId === 'audioplaylists') return audioPlaylistsOf(await api.getPlaylists(sortBy, sortOrder));
	if (FAVORITE_ROWS[rowId]) return (await readFavorites(api, FAVORITE_ROWS[rowId].includeItemTypes, sortBy, sortOrder, ROW_LIMIT))?.Items || [];
	return (await READERS[rowId](api, sortBy, sortOrder, ROW_LIMIT))?.Items || [];
};

// The sort each group's rows load with, worked out the way Home works it out, along with
// anything else that changes what the row holds.
const sortFor = (group, settings) => {
	const ctx = buildLoaderContext({settings, homeRowsConfig: []});
	if (group === 'audio') return {sortBy: ctx.audioRowsSortBy, sortOrder: ctx.audioRowsSortOrder};
	if (group === 'favorites') return {sortBy: ctx.favoriteSortBy, sortOrder: ctx.favoriteSortOrder};
	if (group === 'genres') {
		return {sortBy: ctx.genresSortBy, sortOrder: ctx.genresSortOrder, includeTypes: ctx.genresIncludeTypes, rowSortBy: settings.genresRowSortBy || 'SortName'};
	}
	if (group === 'playlists') {
		return {
			sortBy: ctx.playlistsSortBy,
			sortOrder: ctx.playlistsSortOrder,
			showEpisodes: Boolean(settings.playlistsRowShowEpisodes),
			playlistOrder: isPlaylistOrder(settings.playlistsRowSortBy)
		};
	}
	if (group === 'studios') return {sortBy: ctx.studiosSortBy, sortOrder: ctx.studiosSortOrder, useMoonfinPlugin: Boolean(settings.useMoonfinPlugin)};
	return {sortBy: ctx.collectionsSortBy, sortOrder: ctx.collectionsSortOrder};
};

// What came back for each row and sort, kept for a few minutes so scrubbing back to a sort
// draws it at once. A row that failed or timed out isn't kept, so the next look asks again.
const SAMPLE_TTL = 5 * 60 * 1000;
const SAMPLE_TIMEOUT = 8000;
const samples = new Map();

const sampleKey = (owner, rowId, sort) => [owner, rowId, ...Object.keys(sort).map((name) => sort[name])].join('|');

const cachedSample = (key) => {
	const entry = samples.get(key);
	if (!entry || Date.now() - entry.at > SAMPLE_TTL) return undefined;
	return entry.items;
};

const fetchSample = (api, key, rowId, sort, serverUrl) => {
	const entry = samples.get(key);
	if (entry && entry.pending) return entry.pending;
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve(null), SAMPLE_TIMEOUT);
	});
	const pending = Promise.race([readRow(api, rowId, sort, serverUrl).catch(() => null), timeout])
		.then((items) => {
			clearTimeout(timer);
			if (items) samples.set(key, {items, at: Date.now()});
			else samples.delete(key);
			return items;
		});
	samples.set(key, {pending, at: Date.now()});
	return pending;
};

// Home's rows as the preview last found them, for the user they belong to. Every Row Options
// change reloads Home behind Settings, and a list caught mid-reload is missing rows, so a row
// stays as it was until Home has it again.
const seenRows = new Map();
let seenFor = null;

const rememberHomeRows = (owner, rowData) => {
	if (seenFor !== owner) {
		seenRows.clear();
		seenFor = owner;
	}
	(rowData || []).forEach((row) => {
		if (row && row.id && Array.isArray(row.items) && row.items.length > 0) seenRows.set(row.id, row);
	});
};

const loadedRows = (group, ids, results) => ({group, rows: Object.fromEntries(ids.map((id, index) => [id, results[index]]))});

// Wait this long after a sort changes before asking for it, so scrubbing through the choices
// only loads the one that's stopped on.
const SETTLE_MS = 150;
// The edited row and up to this many below it, which is all the preview has room for.
const ROWS_SHOWN = 4;

// A genre card draws one of its titles with the genre's name across it, as on Home.
const adaptGenre = (genre) => {
	const art = genre._representative ? adaptItem(genre._representative) : adaptItem(genre);
	return {
		...adaptItem({Id: genre.Id, Name: genre.Name, Type: 'Genre'}),
		posterUrl: art.posterUrl,
		backdropUrl: art.backdropUrl,
		label: genre.Name || ''
	};
};

// A studio card is its logo kept whole, or its name when it has no picture, as on Home. Without
// a logo from Moonbase, a wide card takes the studio's own thumb before anything else.
const adaptStudio = (studio) => {
	const card = adaptItem(studio);
	const thumb = studio.ImageTags?.Thumb ? getImageUrl(getServerUrl(), studio.Id, 'Thumb', {maxWidth: 400, quality: 80}) : null;
	const art = studio._studioLogoUrl || thumb || card.backdropUrl || card.posterUrl;
	return {...card, cardUrl: art, contain: true, label: art ? null : studio.Name || ''};
};

const ADAPTERS = {genres: adaptGenre, studios: adaptStudio};

const previewRow = (row, settings) => {
	const shape = classicShape(row.type, rowImageType(row, settings));
	return {
		id: row.id,
		title: row.title,
		items: row.items.slice(0, 8).map(ADAPTERS[row.id] || adaptItem),
		square: shape === 'square',
		thumbs: shape === 'landscape' || shape === 'banner',
		// Home keeps the Studios row Classic in either style, since Modern would crop the logos.
		wide: row.id === 'studios'
	};
};

// What the preview says when a group's rows are on but the server has nothing for them.
const EMPTY_NOTES = {
	audio: () => $L("There's no music to show, so Home leaves these rows out."),
	collections: () => $L('There are no collections to show, so Home leaves this row out.'),
	favorites: () => $L('There are no favorites to show, so Home leaves these rows out.'),
	genres: () => $L('There are no genres to show, so Home leaves this row out.'),
	playlists: () => $L('There are no playlists to show, so Home leaves this row out.'),
	studios: () => $L('There are no studios to show, so Home leaves this row out.')
};

// What the preview says when only single rows of the group added in Rows are on Home.
const PICKED_ONLY_NOTES = {
	collections: () => $L('The Collections row is off, so this only changes the single collections added in Rows.'),
	genres: () => $L('The Genres row is off, so this only changes the single genres added in Rows.'),
	playlists: () => $L('The Playlists row is off, so this only changes the single playlists added in Rows.')
};

// What the Home preview draws for the Row Options setting [key] with [settings], the saved ones
// with the value being tried laid over them. Null for any other setting. Otherwise [rows] are
// the rows to draw, the edited one first, or null to leave Home as it is; [notice] says why the
// rows can't be on Home, and [caption] is a note under the preview.
export const useRowOptionsHome = (key, settings) => {
	const {api, serverUrl, serverType, hasMultipleServers, user} = useAuth();
	const {parentalFilter} = useParentalFilter();
	// Rows differ between users of one server, so everything kept is kept per user.
	const owner = `${serverUrl}|${user?.Id || ''}`;
	const group = groupOf(key);
	const reason = group ? offReason(group, settings, hasMultipleServers, serverUrl, serverType) : null;
	const displayOn = Boolean(group && settings[GROUPS[group].display]);
	const homeRows = useMemo(() => homeRowsOf(settings), [settings]);
	const wanted = useMemo(() => (group
		? homeRows.filter((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0).map((row) => row.id)
		: []), [group, homeRows]);
	const sort = useMemo(() => (group ? sortFor(group, settings) : null), [group, settings]);
	const active = Boolean(group && !reason && displayOn && api);
	const keys = active ? wanted.map((id) => sampleKey(owner, id, sort)) : [];
	const signature = keys.join(',');

	// The rows last loaded for this group, kept up while a new sort loads so nothing flashes.
	const [loaded, setLoaded] = useState(null);
	const cached = keys.map(cachedSample);
	const ready = keys.length > 0 && cached.every((items) => items !== undefined);

	useEffect(() => {
		if (!active || ready || wanted.length === 0) return undefined;
		let cancelled = false;
		const timer = setTimeout(() => {
			Promise.all(wanted.map((id, index) => fetchSample(api, keys[index], id, sort, serverUrl))).then((results) => {
				if (!cancelled) setLoaded(loadedRows(group, wanted, results));
			});
		}, SETTLE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// The signature names every row and sort the effect reads.
	}, [active, ready, signature]); // eslint-disable-line react-hooks/exhaustive-deps

	// A sort drawn straight from what was kept becomes the one held up while the next one loads.
	useEffect(() => {
		if (ready) setLoaded(loadedRows(group, wanted, cached));
	}, [ready, signature]); // eslint-disable-line react-hooks/exhaustive-deps

	const rowData = memoryCache.rowData;
	const built = useMemo(() => {
		if (!active || wanted.length === 0) return null;
		rememberHomeRows(owner, rowData);
		// A row loaded for an older sort stays up until the new one is in, and until the group's
		// rows first load, Home's own rows stand in for them. A row that failed to load keeps Home's.
		const earlier = loaded && loaded.group === group ? loaded.rows : {};
		const results = ready ? cached : null;
		const fetched = {};
		wanted.forEach((id, index) => {
			const home = seenRows.get(id);
			fetched[id] = (results ? results[index] : earlier[id]) || (home ? home.items : []);
		});
		const allRowData = [...seenRows.values()].filter((row) => GROUPS[group].rowIds.indexOf(row.id) < 0);
		wanted.forEach((id) => {
			if (fetched[id].length > 0) {
				allRowData.push({id, title: ROWS[id].title(), items: fetched[id], type: ROWS[id].type});
			}
		});
		const pluginSectionsConfig = homeRows.filter((row) => isPickedRow(row) && isPickedRowShown(row, settings, serverUrl, serverType));
		const rows = buildBrowseRows({
			allRowData, seerrRows: [], externalRows: [], homeRowsConfig: homeRows, pluginSectionsConfig, settings: {...settings, parentalFilter}
		});
		const focusedAt = rows.findIndex((row) => GROUPS[group].rowIds.indexOf(row.id) >= 0 && row.items.length > 0);
		if (focusedAt < 0) return {rows: null, empty: ready && wanted.every((id) => fetched[id].length === 0)};
		return {
			rows: rows.slice(focusedAt)
				.filter((row) => Array.isArray(row.items) && row.items.length > 0 && !row.isPlaceholder)
				.slice(0, ROWS_SHOWN)
				.map((row) => previewRow(row, settings)),
			empty: false
		};
		// The signature and ready cover what was loaded and kept, and loaded what's held up.
	}, [active, signature, ready, loaded, owner, rowData, homeRows, settings, parentalFilter, serverUrl, serverType]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!group) return null;
	const caption = key === 'collectionsRowShowEpisodes'
		? $L('This only changes rows for a single collection added in Rows. The Collections row looks the same.')
		: null;
	if (reason) return {rows: null, notice: offNotice(group, reason, settings), caption: null};
	// With the switch off Home simply goes without these rows, which is what it already shows.
	if (!displayOn || !api) return {rows: null, notice: null, caption};
	// Only single rows added in Rows are on Home, and the preview doesn't draw those yet.
	if (wanted.length === 0) return {rows: null, notice: null, caption: PICKED_ONLY_NOTES[group]()};
	if (built && built.rows) return {rows: built.rows, notice: null, caption};
	// Nothing came back yet, or there's nothing to show. Home leaves an empty row out.
	const empty = EMPTY_NOTES[group]();
	return {rows: null, notice: built && built.empty ? empty : null, caption};
};
