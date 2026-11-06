// Turns everything that was loaded into the list of rows the home screen actually draws.
// Rows are gathered from several places and cached across locales and setting changes, so
// this decides which survive, what they are called now, and what order they sit in.

import $L from '@enact/i18n/$L';
import {isKidsMode} from '../../utils/kidsMode';
import {isLiveTvLibrary} from '../../utils/liveTvLibrary';
import {withoutBlocked, withoutBlockedOrUnrated} from '../../utils/parentalFilter';

import {SERVER_TO_TV_ROW, TV_TO_SERVER_ROW} from '../../utils/homeLayout';
import {FAVORITE_ROW_CONFIGS, isHiddenByMap, parseHiddenMap} from './browseFilters';
import {ROW_MAX_ITEMS} from './rowPaging';
import {isRowEnabledBySetting} from '../../utils/homeRowGates';

// Titles are resolved on every build rather than stored, so a row that came out of the cache
// is named in the language being read now.
const ROW_TITLES = {
	resume: () => $L('Continue Watching'),
	'continue-nextup': () => $L('Continue Watching & Next Up'),
	nextup: () => $L('Next Up'),
	'library-tiles': () => $L('My Media'),
	librarybuttons: () => $L('Library Buttons'),
	collections: () => $L('Collections'),
	genres: () => $L('Genres'),
	playlists: () => $L('Playlists'),
	audioartists: () => $L('Music Artists'),
	audioalbums: () => $L('Music Albums'),
	audioplaylists: () => $L('Music Playlists'),
	resumeaudio: () => $L('Continue Listening'),
	activerecordings: () => $L('Recordings'),
	livetv: () => $L('Live TV'),
	onnow: () => $L('On Now'),
	mdblist_watching_now: () => $L('Watching on MDBList')
};

const libraryTitle = (library) => (library._serverName
	? `${library.Name} (${library._serverName})`
	: library.Name);

const resolveTitle = (row, favoriteLabelMap) => {
	if (ROW_TITLES[row.id]) return ROW_TITLES[row.id]();
	if (favoriteLabelMap.has(row.id)) return favoriteLabelMap.get(row.id);
	if (row.isLatestRow && row.library) {
		return $L('Recently Added {libraryName}').replace('{libraryName}', libraryTitle(row.library));
	}
	if (row.isRecentlyReleasedRow && row.library) {
		return $L('Recently Released {libraryName}').replace('{libraryName}', libraryTitle(row.library));
	}
	return undefined;
};

// A row can be listed under either the name this app uses or the one the server uses, so
// both spellings count as the same row when checking whether it is switched on.
const buildEnabledIds = (homeRowsConfig) => {
	const ids = homeRowsConfig.filter((r) => r.enabled).map((r) => r.id);
	const set = new Set(ids);
	ids.forEach((id) => {
		const mappedId = TV_TO_SERVER_ROW[id] || SERVER_TO_TV_ROW[id];
		if (mappedId) set.add(mappedId);
	});
	return set;
};

const buildRowOrder = (homeRowsConfig) => {
	const rowOrderMap = new Map();
	homeRowsConfig.forEach((row) => {
		rowOrderMap.set(row.id, row.order);
		const mappedId = TV_TO_SERVER_ROW[row.id] || SERVER_TO_TV_ROW[row.id];
		if (mappedId) rowOrderMap.set(mappedId, row.order);
	});
	return rowOrderMap;
};

// Every per library latest row rides on the one latest-media id, so a Live TV library would keep
// its row even in Kids Mode, which is the one thing the mode takes away everywhere else.
const isLiveTvRow = (row) =>
	Boolean(row.isLatestRow) &&
	(row.id === 'latest-merged-livetv' || (row.library && isLiveTvLibrary(row.library)));

const isRowEnabled = (row, {enabledRowIdsSet, enabledPluginIds, settings}) => {
	if (row.isPluginRow) return enabledPluginIds.includes(row.id);
	if (isKidsMode(settings) && isLiveTvRow(row)) return false;
	if (!isRowEnabledBySetting(row.id, settings)) return false;
	if (row.isLatestRow) return enabledRowIdsSet.has('latest-media') || enabledRowIdsSet.has('latestmedia');
	if (row.isRecentlyReleasedRow) return enabledRowIdsSet.has('recently-released') || enabledRowIdsSet.has('recentlyreleased');
	return enabledRowIdsSet.has(row.id) || enabledRowIdsSet.has(TV_TO_SERVER_ROW[row.id]) || enabledRowIdsSet.has(SERVER_TO_TV_ROW[row.id]);
};

// A row's cards from before it paged, and the ones paging added.
const headAndTail = (row) => {
	const items = row?.items || [];
	const from = row?.pagedFrom ?? items.length;
	return [items.slice(0, from), items.slice(from)];
};

// Continue Watching and Next Up become one row, ordered by what was played most recently. An
// episode queued as next up has never been played, so it borrows the date from its series to
// sit in the right place. Pages added later go after the cards already drawn, so the row never
// shifts under focus.
const mergeContinueAndNextUp = (allRowData, hiddenCWMap, hiddenNUMap) => {
	const resumeRow = allRowData.find((r) => r.id === 'resume');
	const nextUpRow = allRowData.find((r) => r.id === 'nextup');
	const recentlyPlayed = allRowData.find((r) => r.id === 'recentlyplayed');
	if (!resumeRow && !nextUpRow) return null;

	const [resumeHead, resumeTail] = headAndTail(resumeRow).map((items) => items.filter((item) => !isHiddenByMap(item, hiddenCWMap, false)));
	const [nextUpHead, nextUpTail] = headAndTail(nextUpRow).map((items) => items.filter((item) => !isHiddenByMap(item, hiddenNUMap, true)));

	const seriesLastPlayedMap = new Map();
	[...resumeHead, ...headAndTail(recentlyPlayed)[0]].forEach((item) => {
		const seriesId = item.SeriesId;
		const lastPlayed = item.UserData?.LastPlayedDate;
		if (!seriesId || !lastPlayed) return;
		const existing = seriesLastPlayedMap.get(seriesId);
		if (!existing || lastPlayed > existing) seriesLastPlayedMap.set(seriesId, lastPlayed);
	});

	const resumeItemIds = new Set(resumeHead.map((item) => item.Id));
	const filteredNextUp = nextUpHead
		.filter((item) => !resumeItemIds.has(item.Id))
		.map((item) => {
			const seriesLastPlayed = seriesLastPlayedMap.get(item.SeriesId);
			if (seriesLastPlayed && !item.UserData?.LastPlayedDate) {
				return {...item, UserData: {...item.UserData, LastPlayedDate: seriesLastPlayed}};
			}
			return item;
		});

	const headItems = [...resumeHead, ...filteredNextUp].sort((a, b) => {
		const aLastPlayed = a.UserData?.LastPlayedDate;
		const bLastPlayed = b.UserData?.LastPlayedDate;
		if (aLastPlayed && bLastPlayed) return bLastPlayed.localeCompare(aLastPlayed);
		if (aLastPlayed) return -1;
		if (bLastPlayed) return 1;
		return 0;
	});
	const seen = new Set(headItems.map((item) => item.Id));
	const pagedItems = [...resumeTail, ...nextUpTail].filter((item) => {
		if (seen.has(item.Id)) return false;
		seen.add(item.Id);
		return true;
	});
	const combinedItems = [...headItems, ...pagedItems];

	if (combinedItems.length === 0) return null;
	// Each row it's drawn from pages up to the cap, so the two together are held to it too.
	return {
		id: 'continue-nextup',
		title: $L('Continue Watching & Next Up'),
		items: combinedItems.slice(0, ROW_MAX_ITEMS),
		type: 'landscape',
		hasMore: combinedItems.length < ROW_MAX_ITEMS && Boolean(resumeRow?.hasMore || nextUpRow?.hasMore)
	};
};

// The source label the other clients print under external row titles.
const rowSubtitleFor = (row) => {
	if (row.subtitle) return row.subtitle;
	if (row.id?.startsWith('imdb-')) return $L('IMDb List');
	if (row.id?.startsWith('tmdb_')) return $L('TMDB Lists');
	if (row.isCalendarMerged) return $L('Radarr and Sonarr Calendars');
	if (row.id === 'radarr_calendar') return $L('Radarr Calendar');
	if (row.id === 'sonarr_calendar') return $L('Sonarr Calendar');
	if (row.id === 'seasonal') return $L('Seasonal');
	return undefined;
};

// Anything without a place in the stored order goes after the rows that have one, keeping
// whatever order it arrived in.
const orderRows = (rows, rowOrderMap) => {
	const resumeOrder = rowOrderMap.get('resume');
	const nextUpOrder = rowOrderMap.get('nextup');
	const continueOrder = Math.min(
		Number.isFinite(resumeOrder) ? resumeOrder : Number.MAX_SAFE_INTEGER,
		Number.isFinite(nextUpOrder) ? nextUpOrder : Number.MAX_SAFE_INTEGER
	);

	return rows
		.map((row, index) => {
			let order = rowOrderMap.get(row.id);
			if (row.id === 'continue-nextup') {
				order = Number.isFinite(continueOrder) ? continueOrder : 0;
			} else if (row.isLatestRow) {
				order = rowOrderMap.get('latest-media');
			} else if (row.isRecentlyReleasedRow) {
				order = rowOrderMap.get('recently-released');
			} else if (row.isCalendarMerged) {
				const radarrOrder = rowOrderMap.get('radarr_calendar');
				const sonarrOrder = rowOrderMap.get('sonarr_calendar');
				order = Math.min(
					Number.isFinite(radarrOrder) ? radarrOrder : Number.MAX_SAFE_INTEGER,
					Number.isFinite(sonarrOrder) ? sonarrOrder : Number.MAX_SAFE_INTEGER
				);
			} else if (row.isCustomRow) {
				order = 6000 + index;
			}
			if (!Number.isFinite(order)) {
				order = row.isPluginRow ? 2000 + index : 1000 + index;
			}
			return {row, index, order};
		})
		.sort((left, right) => left.order - right.order || left.index - right.index)
		.map((entry) => entry.row);
};

// Unrated library items always pass, since a server that rates nothing can't be told apart from
// one that just didn't rate this item. Rows from outside lists are the exception: their ratings
// come from a lookup, so an unrated title there is one nobody vouched for. The calendars carry
// no ratings at all and keep the library rule.
const filterRowItems = (row, parentalFilter) => {
	if (row.isSeasonalRow) return withoutBlockedOrUnrated(row.items, parentalFilter, false);
	if (row.isExternalRow && !row.isCalendarRow && !row.isCalendarMerged) return withoutBlockedOrUnrated(row.items, parentalFilter);
	return withoutBlocked(row.items, parentalFilter);
};

const filterBlockedRatings = (rows, parentalFilter) => {
	if (!parentalFilter?.isActive) return rows;
	return rows
		.map((row) => {
			if (!Array.isArray(row.items)) return row;
			const items = filterRowItems(row, parentalFilter);
			return items === row.items ? row : {...row, items};
		})
		.filter((row) => !Array.isArray(row.items) || row.items.length > 0);
};

// Rows of music show square cards, so a section of them waits on square placeholders.
const AUDIO_SECTIONS = ['audioartists', 'audioalbums', 'audioplaylists'];

const sectionTitle = (id, homeRowsConfig, pluginSection, favoriteLabelMap) => {
	if (ROW_TITLES[id]) return ROW_TITLES[id]();
	if (favoriteLabelMap.has(id)) return favoriteLabelMap.get(id);
	if (id.startsWith('sinceyouwatched')) return $L('Since you watched');
	if (pluginSection) return pluginSection.name;
	const config = homeRowsConfig.find((row) => row.id === id);
	return config ? $L(config.name) : id;
};

// A section still loading holds its place with its title over placeholder cards, then gives way
// to whatever rows it turns out to have. One known to come back empty shows nothing while it
// loads. [pendingRows] come already titled from the sources that only ever report enabled rows.
const placeholderRows = ({pendingSections, pendingRows, placedIds, emptySections, gates, homeRowsConfig, pluginSectionsConfig, favoriteLabelMap}) => {
	const fromSections = pendingSections
		.map((id) => {
			const pluginSection = pluginSectionsConfig.find((section) => section.id === id);
			return {id, isPluginRow: Boolean(pluginSection), title: sectionTitle(id, homeRowsConfig, pluginSection, favoriteLabelMap)};
		})
		.filter((row) => isRowEnabled(row, gates));
	return [...fromSections, ...pendingRows]
		.filter((row) => !placedIds.has(row.id) && !emptySections.has(row.id))
		.map((row) => ({
			...row,
			items: [],
			type: AUDIO_SECTIONS.includes(row.id) ? 'square' : 'portrait',
			isPlaceholder: true
		}));
};

export const buildBrowseRows = ({allRowData, seerrRows, externalRows, homeRowsConfig, pluginSectionsConfig, settings, pendingSections = [], pendingRows = [], emptySections = new Set()}) => {
	const enabledRowIdsSet = buildEnabledIds(homeRowsConfig);
	const enabledPluginIds = pluginSectionsConfig.filter((section) => section.enabled).map((section) => section.id);
	const rowOrderMap = buildRowOrder(homeRowsConfig);
	const gates = {enabledRowIdsSet, enabledPluginIds, settings};

	const hiddenCWMap = parseHiddenMap(settings.hiddenContinueWatchingItems);
	const hiddenNUMap = parseHiddenMap(settings.hiddenNextUpSeries);

	let result;

	if (settings.mergeContinueWatchingNextUp) {
		result = allRowData.filter((r) => r.id !== 'resume' && r.id !== 'nextup');
		const merged = mergeContinueAndNextUp(allRowData, hiddenCWMap, hiddenNUMap);
		if (merged && (enabledRowIdsSet.has('resume') || enabledRowIdsSet.has('nextup'))) {
			result = [merged, ...result];
		}
		result = result.filter((row) => row.id === 'continue-nextup' || isRowEnabled(row, gates));
	} else {
		const resumeRow = allRowData.find((r) => r.id === 'resume');
		const resumeItems = (resumeRow?.items || []).filter((item) => !isHiddenByMap(item, hiddenCWMap, false));
		const resumeItemIds = new Set(resumeItems.map((item) => item.Id));

		result = allRowData
			.map((row) => {
				if (row.id === 'resume') {
					return resumeItems.length > 0 ? {...row, items: resumeItems} : null;
				}
				if (row.id === 'nextup') {
					const filteredItems = row.items.filter((item) => !resumeItemIds.has(item.Id) && !isHiddenByMap(item, hiddenNUMap, true));
					return filteredItems.length > 0 ? {...row, items: filteredItems} : null;
				}
				return row;
			})
			.filter((row) => {
				if (!row) return false;
				if (row.id === 'resume' || row.id === 'nextup') return enabledRowIdsSet.has(row.id);
				return isRowEnabled(row, gates);
			});
	}

	const favoriteLabelMap = new Map(FAVORITE_ROW_CONFIGS.map((row) => [row.id, $L(row.title)]));
	result = result.map((row) => {
		const title = resolveTitle(row, favoriteLabelMap);
		return title && title !== row.title ? {...row, title} : row;
	});

	const withSubtitles = (row) => {
		const subtitle = rowSubtitleFor(row);
		return subtitle && subtitle !== row.subtitle ? {...row, subtitle} : row;
	};

	const rows = filterBlockedRatings([...result, ...seerrRows, ...externalRows].map(withSubtitles), settings.parentalFilter);
	const placeholders = placeholderRows({
		pendingSections,
		pendingRows,
		placedIds: new Set(rows.map((row) => row.id)),
		emptySections,
		gates,
		homeRowsConfig,
		pluginSectionsConfig,
		favoriteLabelMap
	});
	return orderRows([...rows, ...placeholders.map(withSubtitles)], rowOrderMap);
};

const sameWatchingNowItem = (next, prev) =>
	next?.Id === prev?.Id &&
	next?.Name === prev?.Name &&
	next?.Type === prev?.Type &&
	next?.Rank === prev?.Rank &&
	next?.Watchers === prev?.Watchers &&
	next?._externalBackdropUrl === prev?._externalBackdropUrl &&
	next?._externalPosterUrl === prev?._externalPosterUrl &&
	next?._externalLogoUrl === prev?._externalLogoUrl;

// Rebuilding produces a new array every time, which would reload every card on screen. Only
// the parts a row is drawn from are compared, since nothing else can change its appearance.
export const sameRowList = (prev, next) => {
	if (prev.length !== next.length) return false;
	for (let i = 0; i < next.length; i++) {
		if (next[i].id !== prev[i].id || next[i].items.length !== prev[i].items.length || next[i].title !== prev[i].title) {
			return false;
		}
		const nextItems = next[i].items;
		const prevItems = prev[i].items;
		if (next[i].isWatchingNowRow && next[i].subtitle !== prev[i].subtitle) return false;
		if (next[i].isWatchingNowRow && nextItems.some((item, index) => !sameWatchingNowItem(item, prevItems[index]))) {
			return false;
		}
		if (nextItems[0]?.Id !== prevItems[0]?.Id ||
			nextItems[nextItems.length - 1]?.Id !== prevItems[prevItems.length - 1]?.Id) {
			return false;
		}
	}
	return true;
};
