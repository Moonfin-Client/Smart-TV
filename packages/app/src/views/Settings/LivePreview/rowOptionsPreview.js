// The Home preview drawn from Home's own rows. A Row Options setting draws Home the way it looks
// with the D-pad on the first row it changes: that row on top with its first card focused,
// loaded in the sort being looked at, and Home's own rows below it in Home's order. The settings
// that change which rows show or how their cards look draw Home's rows from the first one they
// change, and the media bar ones take Home's first row for the rows peeking under the bar.

import {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import $L from '@enact/i18n/$L';

import {useAuth} from '../../../context/AuthContext';
import useParentalFilter from '../../../hooks/useParentalFilter';
import {episodeArtwork, modernCardImageUrl, requestedArtwork} from '../../../components/MediaCard/cardArtwork';
import {isStaticLibraryCard} from '../../../components/MediaCard/modernCardLayout';
import {FAVORITE_ROW_IDS} from '../../../utils/homeRowGates';
import {isKidsMode, kidsModeRows, mergesContinueWatchingNextUp} from '../../../utils/kidsMode';
import {isPickedRow, isPickedRowShown} from '../../../utils/pickedRows';
import {showsWatchedCheck} from '../../../utils/playedState';
import {memoryCache, subscribeRowData} from '../../Browse/browseCache';
import {
	audioPlaylistsOf, buildLoaderContext, loadFavorites, loadGenres, loadPlaylistsAndMusic, loadStudios, readCollections,
	readMusicAlbums, readMusicArtists
} from '../../Browse/browseRowLoaders';
import {buildBrowseRows} from '../../Browse/buildBrowseRows';
import {classicShape, imageTypeRowId, rowImageType} from '../../Browse/rowPeek';
import {adaptItem} from '../../SetupWizard/setupPreviewData';
import {
	AUDIO_ROW_OPTION_KEYS, COLLECTIONS_ROW_OPTION_KEYS, FAVORITES_ROW_OPTION_KEYS, GENRES_ROW_OPTION_KEYS, HOME_LOOK_KEYS,
	MEDIA_BAR_KEYS, PLAYLISTS_ROW_OPTION_KEYS, STUDIOS_ROW_OPTION_KEYS
} from './previewRows';

const ROW_LIMIT = 20;
const ROW_TITLES = {
	audioartists: () => $L('Music Artists'),
	audioalbums: () => $L('Music Albums'),
	audioplaylists: () => $L('Music Playlists'),
	collections: () => $L('Collections')
};
const READERS = {audioartists: readMusicArtists, audioalbums: readMusicAlbums, collections: readCollections};

// The audio and Collections rows are read one by one, so a row the server fails on is told
// apart from an empty one.
const readRows = (ctx, ids) => Promise.all(ids.map(async (id) => {
	const audio = id !== 'collections';
	const sortBy = audio ? ctx.audioRowsSortBy : ctx.collectionsSortBy;
	const sortOrder = audio ? ctx.audioRowsSortOrder : ctx.collectionsSortOrder;
	const items = id === 'audioplaylists'
		? audioPlaylistsOf(await ctx.api.getPlaylists(sortBy, sortOrder))
		: (await READERS[id](ctx.api, sortBy, sortOrder, ROW_LIMIT))?.Items || [];
	return {id, title: ROW_TITLES[id](), items, type: audio ? 'square' : 'portrait'};
}));

// Home's own loader for the group, handing back the rows it would have added to Home. The loaders
// take a failed request for an empty one, so a failure shows as no rows until the sample expires.
const rowsFrom = (load) => async (ctx) => {
	const rows = [];
	await load({...ctx, appendRows: (added) => rows.push(...added)});
	return rows;
};

// When a row's group is off in Rows, the notice names the row or rows to turn on.
const singleRowOff = (name) => (on) => (on
	? $L('The {row} row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
	: $L('To see the {row} row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.')
).replace('{row}', name());

// Each group of rows its Row Options settings change, with the Display switch over the group,
// how its rows are read, and the group the Rows screen lists them under. Continue Listening
// isn't sorted by the audio settings, so it isn't one of them.
const GROUPS = {
	audio: {
		display: 'displayAudioRows',
		rowIds: ['audioartists', 'audioalbums', 'audioplaylists'],
		keys: AUDIO_ROW_OPTION_KEYS,
		load: readRows,
		switchName: () => $L('Display Audio Rows'),
		rowsGroup: () => $L('General'),
		offText: (on) => (on
			? $L('Music Artists, Music Albums and Music Playlists are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see Music Artists, Music Albums or Music Playlists on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.')),
		empty: () => $L("There's no music to show, so Home leaves these rows out.")
	},
	collections: {
		display: 'displayCollectionsRows',
		rowIds: ['collections'],
		keys: COLLECTIONS_ROW_OPTION_KEYS,
		load: readRows,
		switchName: () => $L('Display Collections Rows'),
		rowsGroup: () => $L('Collections'),
		offText: (on) => (on
			? $L('The Collections row is turned off. To show it, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Collections row on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn it on.')),
		empty: () => $L('There are no collections to show, so Home leaves this row out.')
	},
	favorites: {
		display: 'displayFavoritesRows',
		rowIds: FAVORITE_ROW_IDS,
		keys: FAVORITES_ROW_OPTION_KEYS,
		load: rowsFrom(loadFavorites),
		switchName: () => $L('Display Favorites Rows'),
		rowsGroup: () => $L('Favorites'),
		offText: (on) => (on
			? $L('The Favorites rows are all turned off. To show one, go to Rows, open {group} under {disabled}, and turn it on.')
			: $L('To see the Favorites rows on Home, first turn on {setting}. Then go to Rows, open {group} under {disabled}, and turn one on.')),
		empty: () => $L('There are no favorites to show, so Home leaves these rows out.')
	},
	genres: {
		display: 'displayGenresRows',
		rowIds: ['genres'],
		keys: GENRES_ROW_OPTION_KEYS,
		load: rowsFrom(loadGenres),
		switchName: () => $L('Display Genres Rows'),
		rowsGroup: () => $L('Genres and Studios'),
		offText: singleRowOff(() => $L('Genres')),
		empty: () => $L('There are no genres to show, so Home leaves this row out.')
	},
	playlists: {
		display: 'displayPlaylistsRows',
		rowIds: ['playlists'],
		keys: PLAYLISTS_ROW_OPTION_KEYS,
		load: rowsFrom(loadPlaylistsAndMusic),
		switchName: () => $L('Display Playlist Rows'),
		rowsGroup: () => $L('Playlists'),
		offText: singleRowOff(() => $L('Playlists')),
		empty: () => $L('There are no playlists to show, so Home leaves this row out.')
	},
	studios: {
		display: 'displayStudiosRows',
		rowIds: ['studios'],
		keys: STUDIOS_ROW_OPTION_KEYS,
		load: rowsFrom(loadStudios),
		switchName: () => $L('Display Studio Row'),
		rowsGroup: () => $L('Genres and Studios'),
		offText: singleRowOff(() => $L('Studios')),
		empty: () => $L('There are no studios to show, so Home leaves this row out.')
	}
};

const groupOf = (key) => Object.keys(GROUPS).find((id) => GROUPS[id].keys.indexOf(key) >= 0) || null;

const drawsHomeRows = (key) => HOME_LOOK_KEYS.indexOf(key) >= 0 || MEDIA_BAR_KEYS.indexOf(key) >= 0;

// Home's rows in Home's order, without the ones Kids Mode keeps off.
const homeRowsOf = (settings) => kidsModeRows([...(settings.homeRows || [])].sort((a, b) => a.order - b.order), isKidsMode(settings));

// A single collection added as its own row in Rows, which the Collections sort settings sort too.
const isPickedCollection = (row) => row.enabled && isPickedRow(row) && row.source === 'collections';

// Why none of [group]'s rows can be on Home, or null when one can. Multi-Server Libraries draws
// Home without them, Kids Mode leaves them out, and otherwise they're all off in Rows.
const offReason = (group, settings, hasMultipleServers) => {
	if (settings.unifiedLibraryMode && hasMultipleServers) return 'unified';
	if (isKidsMode(settings)) return 'kids';
	const rows = homeRowsOf(settings);
	if (rows.some((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0)) return null;
	if (group === 'collections' && rows.some(isPickedCollection)) return null;
	return 'rows';
};

// For the inspector: what to change before the Row Options setting [key] can change Home, or
// null when nothing needs to or it isn't one of them. The Rows screen only lists the rows once
// their Display switch is on, so with the switch off that comes first.
export const rowOptionsBlockedReason = (key, settings, hasMultipleServers) => {
	const group = groupOf(key);
	if (!group) return null;
	switch (offReason(group, settings, hasMultipleServers)) {
		case 'unified': return $L('Multi-Server Libraries keeps this off Home');
		case 'kids': return $L('Kids Mode keeps this off Home');
		case 'rows': return settings[GROUPS[group].display]
			? $L('Turn on a row in Rows, under {disabled}').replace('{disabled}', $L('Disabled'))
			: $L('Turn on {setting}, then turn on a row in Rows').replace('{setting}', GROUPS[group].switchName());
		default: return null;
	}
};

// The notice over the preview while the rows can't be on Home, naming the steps in the order the
// Rows screen needs them and the group of disabled rows to open there.
const offNotice = (group, reason, settings) => {
	if (reason === 'unified') return $L("Home leaves these rows out while Multi-Server Libraries is on, so these settings don't change it.");
	if (reason === 'kids') return $L("Kids Mode keeps these rows off Home, so these settings don't change it.");
	return GROUPS[group].offText(Boolean(settings[GROUPS[group].display]))
		.replace('{setting}', GROUPS[group].switchName())
		.replace('{group}', GROUPS[group].rowsGroup())
		.replace('{disabled}', $L('Disabled'));
};

// What came back for each group and sort, kept for a few minutes so scrubbing back to a sort
// draws it at once. A load that failed or timed out isn't kept, so the next look asks again.
const SAMPLE_TTL = 5 * 60 * 1000;
const SAMPLE_TIMEOUT = 8000;
const samples = new Map();

const cachedSample = (key) => {
	const entry = samples.get(key);
	if (!entry || Date.now() - entry.at > SAMPLE_TTL) return undefined;
	return entry.rows;
};

const fetchSample = (key, load) => {
	const entry = samples.get(key);
	if (entry && entry.pending) return entry.pending;
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve(null), SAMPLE_TIMEOUT);
	});
	const pending = Promise.race([load().catch(() => null), timeout])
		.then((rows) => {
			clearTimeout(timer);
			if (rows) samples.set(key, {rows, at: Date.now()});
			else samples.delete(key);
			return rows;
		});
	samples.set(key, {pending, at: Date.now()});
	return pending;
};

const byId = (rows) => Object.fromEntries((rows || []).map((row) => [row.id, row]));

const isRecentRow = (row) => Boolean(row.isLatestRow || row.isRecentlyReleasedRow);

// Home's rows as the preview last found them, for the user they belong to. A setting change
// reloads Home behind Settings, and a list caught mid-reload is missing rows, so a row stays as
// it was until Home has it again. The recent rows arrive together, per library or merged by
// type, so a new set of them replaces the old one whole.
const seenRows = new Map();
let seenFor = null;

const rememberHomeRows = (owner, rowData) => {
	if (seenFor !== owner) {
		seenRows.clear();
		seenFor = owner;
	}
	const rows = (rowData || []).filter((row) => row && row.id && Array.isArray(row.items) && row.items.length > 0);
	if (rows.some(isRecentRow)) {
		[...seenRows.values()].filter(isRecentRow).forEach((row) => seenRows.delete(row.id));
	}
	rows.forEach((row) => seenRows.set(row.id, row));
};

// Home writes its rows as each of its loaders finishes, and the preview draws every write.
const useHomeRowData = () => useSyncExternalStore(subscribeRowData, () => memoryCache.rowData);

// Whether an item wears a watched indicator: watch progress, the watched mark or a count of
// episodes left.
const hasIndicator = (item) => item.UserData?.PlayedPercentage > 0 || showsWatchedCheck(item) || item.UserData?.UnplayedItemCount > 0;

// The first of Home's rows that shows what [key] changes: the row being given an image type,
// a row with watched indicators, one with episodes, or My Media. Null for a setting any row shows.
const rowShowing = (key, focusRowId) => {
	if (focusRowId) {
		return (row) => {
			const id = imageTypeRowId(row);
			return id === focusRowId || (id === 'continue-nextup' && (focusRowId === 'resume' || focusRowId === 'nextup'));
		};
	}
	if (key === 'watchedIndicatorBehavior') return (row) => row.items.some(hasIndicator);
	if (key === 'hideHomeWatchProgress') return (row) => row.items.some((item) => item.UserData?.PlayedPercentage > 0);
	if (key === 'hideHomeUnwatchedCount') return (row) => row.items.some((item) => item.UserData?.UnplayedItemCount > 0);
	if (key === 'useSeriesThumbnails') return (row) => row.items.some((item) => item.Type === 'Episode');
	if (key === 'modernCardsOnMyMediaRow') return (row) => row.id === 'library-tiles';
	return null;
};

// An item with the artwork its card on Home picks: the modern card's at rest and focused, or the
// classic card's for the row's image type. A wide classic card without that art falls back to
// a thumb or backdrop, and a genre card draws on one of its own items.
const previewItem = (item, {modern, imageType, shape, serverUrl, useSeriesThumbnails, isStaticMyMedia}) => {
	const adapted = adaptItem(item);
	const itemServerUrl = item._serverUrl || serverUrl;
	if (modern) {
		const look = {itemServerUrl, isStaticMyMedia, useSeriesThumbnails};
		return {...adapted, cardUrl: modernCardImageUrl(item, false, look), focusUrl: modernCardImageUrl(item, true, look)};
	}
	const art = (item.Type === 'Genre' && item._representative) || item;
	const episode = item.Type === 'Episode' && shape !== 'banner' ? episodeArtwork(item, itemServerUrl, imageType, useSeriesThumbnails) : null;
	const wide = shape === 'landscape' ? requestedArtwork(art, 'thumb', itemServerUrl) || adapted.backdropUrl : null;
	return {
		...adapted,
		cardUrl: item._studioLogoUrl || (episode && episode.url) || requestedArtwork(art, imageType, itemServerUrl) || wide ||
			(art === item ? adapted : adaptItem(art)).posterUrl
	};
};

const previewRow = (row, settings, serverUrl) => {
	const imageType = rowImageType(row, settings);
	const shape = classicShape(row.type, imageType);
	const modern = settings.homeRowsStyle !== 'v1';
	const staticCards = modern && isStaticLibraryCard(row.id === 'library-tiles', settings);
	// Home leaves the poster labels off its Seerr, recommendation and genre rows.
	const labels = !row.isSeerrRow && !row.isOnlineRecoRow && !row.isGenreRow;
	const look = {modern, imageType, shape, serverUrl, useSeriesThumbnails: settings.useSeriesThumbnails, isStaticMyMedia: staticCards};
	const items = row.items.slice(0, 8).map((item) => ({...previewItem(item, look), labelItem: labels ? item : null}));
	return {id: row.id, title: row.title, items, shape, staticCards};
};

// Wait this long after a sort changes before asking for it, so scrubbing through the choices
// only loads the one that's stopped on.
const SETTLE_MS = 150;
// The focused row and up to this many below it, which is all the preview has room for.
const ROWS_SHOWN = 4;

// What the Home preview draws for the setting [key] with [settings], the saved ones with the value
// being tried laid over them, and [focusRowId] the row an image type is being set for. Null for a
// setting it doesn't draw. Otherwise [rows] are Home's rows to draw, the focused one first, or
// null to draw the sample rows. [notice] says why a Row Options setting's rows can't be on Home,
// and [caption] is a note under the preview.
export const useRowOptionsHome = (key, settings, focusRowId = null) => {
	const {api, serverUrl, serverType, hasMultipleServers, user} = useAuth();
	const {parentalFilter} = useParentalFilter();
	const rowData = useHomeRowData();
	// Rows differ between users of one server, so everything kept is kept per user.
	const owner = `${serverUrl}|${user?.Id || ''}`;
	const group = groupOf(key);
	const handled = Boolean(group) || drawsHomeRows(key);
	const reason = group ? offReason(group, settings, hasMultipleServers) : null;
	const displayOn = Boolean(group && settings[GROUPS[group].display]);
	const homeRows = useMemo(() => homeRowsOf(settings), [settings]);
	const wanted = useMemo(() => (group
		? homeRows.filter((row) => row.enabled && GROUPS[group].rowIds.indexOf(row.id) >= 0).map((row) => row.id)
		: []), [group, homeRows]);
	const active = Boolean(group && !reason && displayOn && api && wanted.length > 0);
	const sampleKey = active ? [owner, group, wanted.join(','), ...GROUPS[group].keys.map((name) => settings[name])].join('|') : null;

	// The rows last loaded for this group, kept up while a new sort loads so nothing flashes.
	const [loaded, setLoaded] = useState(null);
	const cached = sampleKey ? cachedSample(sampleKey) : undefined;
	const ready = cached !== undefined;

	useEffect(() => {
		if (!active || ready) return undefined;
		let cancelled = false;
		const timer = setTimeout(() => {
			const ctx = buildLoaderContext({api, serverUrl, settings, homeRowsConfig: homeRows.filter((row) => wanted.indexOf(row.id) >= 0)});
			fetchSample(sampleKey, () => GROUPS[group].load(ctx, wanted)).then((rows) => {
				if (!cancelled) setLoaded({group, rows: byId(rows)});
			});
		}, SETTLE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// The sample key names every row and setting the load reads.
	}, [active, ready, sampleKey]); // eslint-disable-line react-hooks/exhaustive-deps

	// A sort drawn straight from what was kept becomes the one held up while the next one loads.
	useEffect(() => {
		if (ready) setLoaded({group, rows: byId(cached)});
	}, [ready, sampleKey]); // eslint-disable-line react-hooks/exhaustive-deps

	const built = useMemo(() => {
		if (!handled) return null;
		rememberHomeRows(owner, rowData);
		const groupIds = active ? GROUPS[group].rowIds : [];
		// A row loaded for an older sort stays up until the new one is in, and until the group's
		// rows first load, Home's own rows stand in for them. A row that failed to load keeps Home's.
		const results = ready ? byId(cached) : (loaded && loaded.group === group ? loaded.rows : {});
		const fetched = Object.fromEntries(wanted.map((id) => [id, results[id] || seenRows.get(id) || null]));
		const allRowData = [
			...[...seenRows.values()].filter((row) => groupIds.indexOf(row.id) < 0),
			...(active ? wanted.map((id) => fetched[id]).filter((row) => row && row.items.length > 0) : [])
		];
		const pluginSectionsConfig = homeRows.filter((row) => isPickedRow(row) && isPickedRowShown(row, settings, serverUrl, serverType));
		const rows = buildBrowseRows({
			allRowData,
			seerrRows: [],
			externalRows: [],
			homeRowsConfig: homeRows,
			pluginSectionsConfig,
			settings: {...settings, mergeContinueWatchingNextUp: mergesContinueWatchingNextUp(settings), parentalFilter}
		}).filter((row) => Array.isArray(row.items) && row.items.length > 0 && !row.isPlaceholder);
		const groupAt = rows.findIndex((row) => groupIds.indexOf(row.id) >= 0);
		const showing = rowShowing(key, focusRowId);
		const focusedAt = groupAt >= 0 ? groupAt : Math.max(0, showing ? rows.findIndex(showing) : 0);
		return {
			rows: rows.length > 0 ? rows.slice(focusedAt, focusedAt + ROWS_SHOWN).map((row) => previewRow(row, settings, serverUrl)) : null,
			inGroup: groupAt >= 0,
			empty: active && ready && wanted.every((id) => !fetched[id] || fetched[id].items.length === 0)
		};
		// The sample key and ready cover what was loaded and kept, and loaded what's held up.
	}, [handled, active, sampleKey, ready, loaded, owner, rowData, homeRows, settings, parentalFilter, serverUrl, serverType, key, focusRowId]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!handled) return null;
	const drawn = built.rows;
	if (!group) return {rows: drawn, notice: null, caption: null};
	const caption = key === 'collectionsRowShowEpisodes'
		? $L('This only changes rows for a single collection added in Rows. The Collections row looks the same.')
		: null;
	if (reason) return {rows: drawn, notice: offNotice(group, reason, settings), caption: null};
	// With the switch off Home simply goes without these rows, which is what it already shows.
	if (!displayOn || !api) return {rows: drawn, notice: null, caption};
	// Only single collections added in Rows are on Home, and the preview doesn't draw those yet.
	if (wanted.length === 0) {
		return {rows: drawn, notice: null, caption: $L('The Collections row is off, so this only changes the single collections added in Rows.')};
	}
	// Home leaves an empty row out.
	return {rows: drawn, notice: !built.inGroup && built.empty ? GROUPS[group].empty() : null, caption};
};
