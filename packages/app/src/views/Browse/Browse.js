import {useState, useEffect, useCallback, useRef, useMemo, useReducer} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings, TV_TO_SERVER_ROW, SERVER_TO_TV_ROW} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {ClassicMediaRow, ModernMediaRow} from '../../components/MediaRow';
import SeerrTileRow from '../../components/SeerrTileRow';
import {getSeerrHomeRowConfigs, fetchSeerrHomeRow, SEERR_SECTION_TO_CONFIG} from '../../utils/seerrHomeRows';
import {getExternalHomeRowConfigs, fetchExternalPresetRow, fetchCustomHomeRow, fetchCalendarRows} from '../../utils/externalHomeRows';
import {mergeRowPreservingRefs} from '../../utils/volatileRows';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {HOME_ROW_ITEM_FIELDS, resolveItemsByProviderIds} from '../../services/jellyfinApi';
import {loadSinceYouWatchedRows, loadRewatchItems} from '../../services/homeRecommendations';
import * as connectionPool from '../../services/connectionPool';
import * as seerrApi from '../../services/seerrApi';
import {toCssColor} from '../../theme/themeSpec';
import DetailSection from './DetailSection';
import FeaturedBanner from './FeaturedBanner';
import MakdBanner from './MakdBanner';
import GalleryBanner from './GalleryBanner';
import BannerBar from './BannerBar';
import BookshelfBar from './BookshelfBar';
import BackdropLayer from './BackdropLayer';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const TRANSITION_DELAY_MS = 450;

// Cache TTL in milliseconds (5 minutes for volatile data, 30 minutes for libraries)
const CACHE_TTL_VOLATILE = 5 * 60 * 1000;
const CACHE_TTL_LIBRARIES = 30 * 60 * 1000;
const VOLATILE_REFRESH_COOLDOWN_MS = 60 * 1000;
const CACHE_SAVE_DEBOUNCE_MS = 3000;
const STORAGE_KEY_BROWSE = 'browse_cache_v4';

let cachedRowData = null;
let cachedLibraries = null;
let cachedFeaturedItems = null;
let cacheTimestamp = null;

let lastFocusState = null;

const parseHiddenMap = (val) => {
	if (!val) return {};
	try {
		return typeof val === 'string' ? JSON.parse(val) : val;
	} catch (e) {
		return {};
	}
};

// seriesOnly keys on the series id only, otherwise it falls back to the item id.
const isHiddenByMap = (item, hiddenMap, seriesOnly) => {
	const key = seriesOnly ? item.SeriesId : (item.SeriesId || item.Id);
	if (!key || !hiddenMap[key]) return false;
	// Hide timestamps are stored as ISO strings, so parse before comparing.
	const hideTimeMs = Date.parse(hiddenMap[key]);
	// An unparseable hide timestamp can't be reasoned about; treat it as not hidden
	// rather than hiding the item permanently (NaN comparisons below are always false).
	if (!Number.isFinite(hideTimeMs)) return false;
	const lastPlayed = item.UserData?.LastPlayedDate;
	if (lastPlayed) {
		const lastPlayedMs = Date.parse(lastPlayed);
		if (lastPlayedMs > hideTimeMs) return false;
	}
	return true;
};

const EXCLUDED_COLLECTION_TYPES = ['boxsets', 'books', 'musicvideos', 'homevideos', 'photos'];

const FAVORITE_ROW_CONFIGS = [
	{id: 'favoriteMovies', title: $L('Favorite Movies'), includeItemTypes: 'Movie', type: 'portrait'},
	{id: 'favoriteSeries', title: $L('Favorite Series'), includeItemTypes: 'Series', type: 'portrait'},
	{id: 'favoriteEpisodes', title: $L('Favorite Episodes'), includeItemTypes: 'Episode', type: 'landscape'},
	{id: 'favoritePeople', title: $L('Favorite People'), includeItemTypes: 'Person', type: 'portrait'},
	{id: 'favoriteArtists', title: $L('Favorite Artists'), includeItemTypes: 'MusicArtist', type: 'square'},
	{id: 'favoriteMusicVideos', title: $L('Favorite Music Videos'), includeItemTypes: 'MusicVideo', type: 'landscape'},
	{id: 'favoriteAlbums', title: $L('Favorite Albums'), includeItemTypes: 'MusicAlbum', type: 'square'},
	{id: 'favoriteSongs', title: $L('Favorite Songs'), includeItemTypes: 'Audio', type: 'square'}
];

const FAVORITE_ROW_IDS = FAVORITE_ROW_CONFIGS.map((row) => row.id);

const getSortOrderFromSortBy = (sortBy) => {
	const lower = (sortBy || '').toLowerCase();
	if (lower === 'sortname' || lower === 'name') return 'Ascending';
	if (lower === 'random') return 'Ascending';
	return 'Descending';
};

const getGenresIncludeTypes = (filter) => {
	if (filter === 'Movie') return 'Movie';
	if (filter === 'Series') return 'Series';
	return 'Movie,Series';
};

const getItemGenreNames = (item) => {
	if (!item || typeof item !== 'object') return [];
	const directGenres = Array.isArray(item.Genres) ? item.Genres : [];
	const genreItems = Array.isArray(item.GenreItems)
		? item.GenreItems.map((genreItem) => genreItem?.Name).filter(Boolean)
		: [];
	return [...directGenres, ...genreItems]
		.map((name) => String(name).trim().toLowerCase())
		.filter(Boolean);
};

// Picks an arbitrary but repeatable index for a name, so a genre lands on the same
// representative item every load and the server can serve a thumbnail it has already
// generated. Re-rolling at random asks it to decode and resize artwork it has never seen
// before, every single time.
const stableIndex = (seed, length) => {
	if (length <= 0) return 0;
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % length;
};

const resolveExternalImageUrl = (url, width) => {
	if (!url) return null;
	if (url.startsWith('/')) {
		return seerrApi.getImageUrl(url, width);
	}
	return url;
};

const filterItemsByExcludedGenres = (items, excludedGenres) => {
	const excluded = Array.isArray(excludedGenres)
		? excludedGenres.map((genre) => String(genre).trim().toLowerCase()).filter(Boolean)
		: [];
	if (excluded.length === 0) return items;
	const excludedSet = new Set(excluded);
	return items.filter((item) => {
		const genres = getItemGenreNames(item);
		if (genres.length === 0) return true;
		return !genres.some((genre) => excludedSet.has(genre));
	});
};

const parsePluginSpec = (specJson) => {
	if (!specJson) return null;
	try {
		return JSON.parse(specJson);
	} catch (e) {
		return null;
	}
};

const browseInitialState = {
	isLoading: true,
	browseMode: 'featured',
	allRowData: [],
	featuredItems: [],
};

// Merges freshly loaded rows into an existing list by row id. An incoming row wins and
// keeps the position of the row it replaces, and new ids go on the end. Rows arrive in
// waves, the cache first and then each loader, so keeping the existing row would leave a
// stale copy on screen and never let the fresh one through.
function mergeRowsById(existingRows, incomingRows) {
	const incoming = new Map();
	incomingRows.forEach((row) => {
		if (row && row.id) incoming.set(row.id, row);
	});
	const merged = existingRows.map((row) => {
		if (!row || !incoming.has(row.id)) return row;
		const replacement = incoming.get(row.id);
		incoming.delete(row.id);
		return replacement;
	});
	return [...merged, ...incoming.values()];
}

function browseReducer(state, action) {
	switch (action.type) {
		case 'SET_INITIAL_DATA': {
			const unique = [];
			const seen = new Set();
			(action.rowData || []).forEach(row => {
				if (row && row.id && !seen.has(row.id)) {
					seen.add(row.id);
					unique.push(row);
				}
			});
			return {
				...state,
				isLoading: false,
				allRowData: unique,
				featuredItems: action.featuredItems || state.featuredItems,
			};
		}
		case 'APPEND_ROWS': {
			if (action.rows.length === 0) return state;
			return { ...state, allRowData: mergeRowsById(state.allRowData, action.rows) };
		}
		case 'REFRESH_VOLATILE': {
			const prevVolatile = new Map();
			state.allRowData.forEach((row) => {
				if (row.id === 'resume' || row.id === 'nextup') prevVolatile.set(row.id, row);
			});
			const mergedVolatile = action.volatileRows.map((row) => mergeRowPreservingRefs(prevVolatile.get(row.id), row));
			const filtered = state.allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
			const next = [...mergedVolatile, ...filtered];
			if (next.length === state.allRowData.length) {
				let unchanged = true;
				for (let i = 0; i < next.length; i++) {
					if (next[i] !== state.allRowData[i]) {
						unchanged = false;
						break;
					}
				}
				if (unchanged) return state;
			}
			return { ...state, allRowData: next };
		}
		case 'SET_ROW_DATA': {
			const unique = [];
			const seen = new Set();
			(action.rowData || []).forEach(row => {
				if (row && row.id && !seen.has(row.id)) {
					seen.add(row.id);
					unique.push(row);
				}
			});
			return { ...state, allRowData: unique };
		}
		case 'SET_LOADING':
			if (state.isLoading === action.value) return state;
			return { ...state, isLoading: action.value };
		case 'SET_BROWSE_MODE':
			if (state.browseMode === action.mode) return state;
			return { ...state, browseMode: action.mode };
		case 'SET_FEATURED_ITEMS':
			return { ...state, featuredItems: action.items };
		default:
			return state;
	}
}

// Genre tiles borrow a library item's artwork. Keeping only the fields the card reads
// stops the cache growing for no gain on memory tight TVs.
const stripRepresentativeForCache = (rep) => (rep ? {
	Id: rep.Id,
	ImageTags: rep.ImageTags,
	BackdropImageTags: rep.BackdropImageTags
} : undefined);

const stripItemForCache = (item) => ({
	Id: item.Id,
	Name: item.Name,
	Type: item.Type,
	ImageTags: item.ImageTags,
	// Everything below is needed to render a card. Anything left out is quietly gone on
	// the next load, because a warm cache skips the fetch that would rebuild it.
	BackdropImageTags: item.BackdropImageTags,
	ProviderIds: item.ProviderIds,
	UserRating: item.UserRating,
	_representative: stripRepresentativeForCache(item._representative),
	_external: item._external,
	_externalPosterUrl: item._externalPosterUrl,
	_externalBackdropUrl: item._externalBackdropUrl,
	_resolvedFromExternal: item._resolvedFromExternal,
	_seerr: item._seerr,
	_seerrType: item._seerrType,
	_seerrMediaType: item._seerrMediaType,
	_seerrRaw: item._seerrRaw,
	mediaInfo: item.mediaInfo,
	SeriesName: item.SeriesName,
	SeriesId: item.SeriesId,
	ParentIndexNumber: item.ParentIndexNumber,
	IndexNumber: item.IndexNumber,
	ParentThumbItemId: item.ParentThumbItemId,
	ParentBackdropItemId: item.ParentBackdropItemId,
	CommunityRating: item.CommunityRating,
	Genres: item.Genres,
	GenreItems: item.GenreItems,
	Overview: item.Overview,
	ProductionYear: item.ProductionYear,
	RunTimeTicks: item.RunTimeTicks,
	AlbumId: item.AlbumId,
	AlbumPrimaryImageTag: item.AlbumPrimaryImageTag,
	AlbumArtist: item.AlbumArtist,
	CollectionType: item.CollectionType,
	UserData: item.UserData ? {
		PlayedPercentage: item.UserData.PlayedPercentage,
		Played: item.UserData.Played,
		LastPlayedDate: item.UserData.LastPlayedDate,
	} : undefined,
	_serverUrl: item._serverUrl,
	_serverType: item._serverType,
	_serverName: item._serverName,
	_serverAccessToken: item._serverAccessToken,
	_serverUserId: item._serverUserId,
	_serverId: item._serverId,
	isLibraryTile: item.isLibraryTile,
	isRecordingsShortcut: item.isRecordingsShortcut,
});

const Browse = ({
	onSelectItem,
	onSelectLibrary,
	onOpenRecordings,
	onPlayRecording,
	onSelectGenre,
	onSelectSeerrItem,
	onSelectSeerrGenre,
	onSelectSeerrStudio,
	onSelectSeerrNetwork,
	isVisible = true,
	onFocusItemThemeMusic,
	onBlurItemThemeMusic,
	onLeaveThemeMusic
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers, user} = useAuth();
	const {settings, activeTheme} = useSettings();
	const {isEnabled: seerrEnabled, isAuthenticated: seerrAuthenticated, user: seerrUser} = useSeerr();
	const seerrUserId = seerrUser?.seerrUserId;
	const [seerrRows, setSeerrRows] = useState([]);
	const [externalRows, setExternalRows] = useState([]);
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const isLegacy = typeof document !== 'undefined' && (' ' + document.documentElement.className + ' ').indexOf(' legacy ') >= 0;
	const [state, dispatch] = useReducer(browseReducer, browseInitialState);
	const {isLoading, browseMode, allRowData, featuredItems} = state;
	const [focusedItemForBackdrop, setFocusedItemForBackdrop] = useState(null);
	const mainContentRef = useRef(null);
	const detailSectionRef = useRef(null);
	const lastFocusedRowRef = useRef(null);
	const wasVisibleRef = useRef(true);
	const lastVolatileRefreshRef = useRef(0);
	const cacheSaveTimerRef = useRef(null);
	const lastCacheSignatureRef = useRef('');
	const prevFilteredRowsRef = useRef([]);
	const filteredRowsLengthRef = useRef(0);
	const filteredRowsRef = useRef([]);
	const rowRefsMap = useRef(new Map());
	const initialFocusSetRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const contentRowsRef = useRef(null);

	const showFeaturedBar = (settings.featuredBarStyle !== 'off');

	const registerRowRef = useCallback((rowIndex, element) => {
		if (element) {
			rowRefsMap.current.set(rowIndex, element);
		} else {
			rowRefsMap.current.delete(rowIndex);
		}
	}, []);

	const getItemServerUrl = useCallback((item) => {
		return item?._serverUrl || serverUrl;
	}, [serverUrl]);

	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const fetchFreshFeaturedItems = useCallback(async (fallbackItems = null) => {
		const s = settingsRef.current;
		const sourceType = s.mediaBarSourceType || 'library';
		const libraryIds = s.mediaBarLibraryIds || [];
		const collectionIds = s.mediaBarCollectionIds || [];
		const hasSourceFilter = (sourceType === 'collection' && collectionIds.length > 0) || libraryIds.length > 0;

		try {
			let items = [];

			if (s.useMoonfinPlugin) {
				const mediaBarResult = await seerrApi.getMoonfinMediaBar(serverUrl, accessToken, 'tv');
				if (mediaBarResult?.Items?.length) {
					items = mediaBarResult.Items;
				}
			}

			if (items.length === 0) {
				if (sourceType === 'collection' && collectionIds.length > 0) {
					const results = await Promise.all(
						collectionIds.map(cid => api.getCollectionItems(cid, 50).catch(() => null))
					);
					const allItems = [];
					results.forEach(r => { if (r?.Items) allItems.push(...r.Items); });
					items = allItems
						.filter(item => item.Type !== 'BoxSet' && item.BackdropImageTags?.length)
						.sort(() => Math.random() - 0.5)
						.slice(0, s.featuredItemCount);
				} else if (unifiedMode) {
					items = await connectionPool.getRandomItemsFromAllServers(s.featuredContentType, s.featuredItemCount, libraryIds);
				} else if (libraryIds.length > 0) {
					const perLib = Math.ceil((s.featuredItemCount * 2) / libraryIds.length);
					const results = await Promise.all(
						libraryIds.map(lid => api.getRandomItems(s.featuredContentType, perLib, lid).catch(() => null))
					);
					const allItems = [];
					results.forEach(r => { if (r?.Items) allItems.push(...r.Items); });
					items = allItems.sort(() => Math.random() - 0.5).slice(0, s.featuredItemCount);
				} else {
					const randomItems = await api.getRandomItems(s.featuredContentType, s.featuredItemCount);
					items = randomItems?.Items || [];
				}
			}

			if (items.length > 0) {
				const filteredItems = filterItemsByExcludedGenres(
					items.filter(item => item.Type !== 'BoxSet'),
					s.excludedGenres
				);
				const featuredWithLogos = filteredItems.map(item => ({
					...item,
					LogoUrl: getLogoUrl(getItemServerUrl(item), item, {maxWidth: 800, quality: 90})
				}));
				dispatch({type: 'SET_FEATURED_ITEMS', items: featuredWithLogos});
				cachedFeaturedItems = featuredWithLogos;
				return featuredWithLogos;
			} else if (fallbackItems && !hasSourceFilter) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		} catch (e) {
			console.warn('[Browse] Failed to fetch fresh featured items:', e);
			if (fallbackItems && !hasSourceFilter) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		}
		return null;
	}, [api, serverUrl, accessToken, unifiedMode, getItemServerUrl]);

	const refreshVolatileData = useCallback(async (force = false) => {
		if (!force && Date.now() - lastVolatileRefreshRef.current < VOLATILE_REFRESH_COOLDOWN_MS) return;
		lastVolatileRefreshRef.current = Date.now();
		try {
			let resumeItems, nextUp;

			if (unifiedMode) {
				[resumeItems, nextUp] = await Promise.all([
					connectionPool.getResumeItemsFromAllServers(),
					connectionPool.getNextUpFromAllServers()
				]);
				resumeItems = {Items: resumeItems};
				nextUp = {Items: nextUp};
			} else {
				[resumeItems, nextUp] = await Promise.all([
					api.getResumeItems(),
					api.getNextUp()
				]);
			}

			const volatileRows = [];

			if (resumeItems.Items?.length > 0) {
				volatileRows.push({
					id: 'resume',
					title: $L('Continue Watching'),
					items: resumeItems.Items,
					type: 'landscape'
				});
			}

			if (nextUp.Items?.length > 0) {
				volatileRows.push({
					id: 'nextup',
					title: $L('Next Up'),
					items: nextUp.Items,
					type: 'landscape'
				});
			}

			dispatch({type: 'REFRESH_VOLATILE', volatileRows});
			if (cachedRowData) {
				const filtered = cachedRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
				cachedRowData = [...volatileRows, ...filtered];
				cacheTimestamp = Date.now();
				if (!unifiedMode) {
					saveBrowseCache(cachedRowData, cachedLibraries, cachedFeaturedItems); // eslint-disable-line no-use-before-define
				}
			}
		} catch (e) {
			console.warn('[Browse] Background refresh failed:', e);
		}
	}, [api, unifiedMode, saveBrowseCache]); // eslint-disable-line no-use-before-define

	const uiPanelStyle = useMemo(() => {
		return {
			background: toCssColor(activeTheme.colors.surface),
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			border: 'var(--theme-card-border)',
			boxShadow: 'var(--theme-focus-glow)'
		};
	}, [activeTheme]);

	const uiButtonStyle = useMemo(() => {
		return {
			background: toCssColor(activeTheme.colors.buttonNormal),
			color: toCssColor(activeTheme.colors.onButtonNormal),
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			border: 'var(--theme-chip-border)',
			borderRadius: 'var(--theme-chip-radius)'
		};
	}, [activeTheme]);

	const useModernRows = settings.homeRowsStyle !== 'v1';
	const RowComponent = useModernRows ? ModernMediaRow : ClassicMediaRow;
	const showTopInfoArea = !useModernRows;

	const homeRowsConfig = useMemo(() => {
		return [...(settings.homeRows || [])].sort((a, b) => a.order - b.order);
	}, [settings.homeRows]);

	const pluginSectionsConfig = useMemo(() => {
		return [...(settings.pluginSections || [])].sort((a, b) => a.order - b.order);
	}, [settings.pluginSections]);

	const isRowVisibleByGates = useCallback((rowId) => {
		if (FAVORITE_ROW_IDS.includes(rowId)) return settings.displayFavoritesRows;
		if (rowId === 'collections') return settings.displayCollectionsRows;
		if (rowId === 'genres') return settings.displayGenresRows;
		if (rowId === 'playlists') return settings.displayPlaylistsRows;
		if (rowId === 'imdb-top250-movies') return settings.imdbTop250MoviesEnabled;
		if (rowId === 'imdb-top250-tv') return settings.imdbTop250TvShowsEnabled;
		if (rowId === 'imdb-popular-movies') return settings.imdbMostPopularMoviesEnabled;
		if (rowId === 'imdb-popular-tv') return settings.imdbMostPopularTvShowsEnabled;
		if (rowId === 'imdb-lowest-rated') return settings.imdbLowestRatedMoviesEnabled;
		if (rowId === 'imdb-top-english') return settings.imdbTopEnglishMoviesEnabled;
		return true;
	}, [settings.displayFavoritesRows, settings.displayCollectionsRows, settings.displayGenresRows, settings.displayPlaylistsRows,
		settings.imdbTop250MoviesEnabled, settings.imdbTop250TvShowsEnabled, settings.imdbMostPopularMoviesEnabled,
		settings.imdbMostPopularTvShowsEnabled, settings.imdbLowestRatedMoviesEnabled, settings.imdbTopEnglishMoviesEnabled]);

	const filteredRows = useMemo(() => {
		const enabledRowIds = homeRowsConfig.filter(r => r.enabled).map(r => r.id);
		const enabledRowIdsSet = new Set(enabledRowIds);
		enabledRowIds.forEach((id) => {
			const mappedId = TV_TO_SERVER_ROW[id] || SERVER_TO_TV_ROW[id];
			if (mappedId) enabledRowIdsSet.add(mappedId);
		});
		const enabledPluginIds = pluginSectionsConfig.filter((section) => section.enabled).map((section) => section.id);
		const rowOrderMap = new Map();
		homeRowsConfig.forEach((row) => {
			rowOrderMap.set(row.id, row.order);
			const mappedId = TV_TO_SERVER_ROW[row.id] || SERVER_TO_TV_ROW[row.id];
			if (mappedId) rowOrderMap.set(mappedId, row.order);
		});
		pluginSectionsConfig.forEach((section, index) => rowOrderMap.set(section.id, (section.order ?? index) + 1000));

		const hiddenCWMap = parseHiddenMap(settings.hiddenContinueWatchingItems);
		const hiddenNUMap = parseHiddenMap(settings.hiddenNextUpSeries);

		let result;

		if (settings.mergeContinueWatchingNextUp) {
			const mergeResumeRow = allRowData.find(r => r.id === 'resume');
			const nextUpRow = allRowData.find(r => r.id === 'nextup');
			const recentlyPlayed = allRowData.find(r => r.id === 'recentlyplayed');

			result = allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');

			if (mergeResumeRow || nextUpRow) {
				const resumeItems = (mergeResumeRow?.items || []).filter(item => !isHiddenByMap(item, hiddenCWMap, false));
				const nextUpItems = (nextUpRow?.items || []).filter(item => !isHiddenByMap(item, hiddenNUMap, true));
				const recentlyPlayedItems = recentlyPlayed?.items || [];

				const seriesLastPlayedMap = new Map();
				resumeItems.forEach(item => {
					const seriesId = item.SeriesId;
					const lastPlayed = item.UserData?.LastPlayedDate;
					if (seriesId && lastPlayed) {
						const existing = seriesLastPlayedMap.get(seriesId);
						if (!existing || lastPlayed > existing) {
							seriesLastPlayedMap.set(seriesId, lastPlayed);
						}
					}
				});

				recentlyPlayedItems.forEach(item => {
					const seriesId = item.SeriesId;
					const lastPlayed = item.UserData?.LastPlayedDate;
					if (seriesId && lastPlayed) {
						const existing = seriesLastPlayedMap.get(seriesId);
						if (!existing || lastPlayed > existing) {
							seriesLastPlayedMap.set(seriesId, lastPlayed);
						}
					}
				});

				const mergeResumeItemIds = new Set(resumeItems.map(item => item.Id));

				const filteredNextUp = nextUpItems
					.filter(item => !mergeResumeItemIds.has(item.Id))
					.map(item => {
						const seriesLastPlayed = seriesLastPlayedMap.get(item.SeriesId);
						if (seriesLastPlayed && !item.UserData?.LastPlayedDate) {
							return {
								...item,
								UserData: {
									...item.UserData,
									LastPlayedDate: seriesLastPlayed
								}
							};
						}
						return item;
					});

				const combinedItems = [...resumeItems, ...filteredNextUp].sort((a, b) => {
					const aLastPlayed = a.UserData?.LastPlayedDate;
					const bLastPlayed = b.UserData?.LastPlayedDate;

					if (aLastPlayed && bLastPlayed) {
						return bLastPlayed.localeCompare(aLastPlayed);
					}
					if (aLastPlayed) return -1;
					if (bLastPlayed) return 1;
					return 0;
				});

				if (combinedItems.length > 0) {
					if (enabledRowIdsSet.has('resume') || enabledRowIdsSet.has('nextup')) {
						result = [{
							id: 'continue-nextup',
							title: $L('Continue Watching'),
							items: combinedItems,
							type: 'landscape'
						}, ...result];
					}
				}
			}

			result = result.filter((row) => {
				if (row.id === 'continue-nextup') return true;
				if (row.isPluginRow) return enabledPluginIds.includes(row.id);
				if (!isRowVisibleByGates(row.id)) return false;
				if (row.isLatestRow) return enabledRowIdsSet.has('latest-media') || enabledRowIdsSet.has('latestmedia');
				if (row.isRecentlyReleasedRow) return enabledRowIdsSet.has('recently-released') || enabledRowIdsSet.has('recentlyreleased');
				return enabledRowIdsSet.has(row.id) || enabledRowIdsSet.has(TV_TO_SERVER_ROW[row.id]) || enabledRowIdsSet.has(SERVER_TO_TV_ROW[row.id]);
			});
		} else {
			const resumeRow = allRowData.find(r => r.id === 'resume');
			const resumeItems = (resumeRow?.items || []).filter(item => !isHiddenByMap(item, hiddenCWMap, false));
			const resumeItemIds = new Set(resumeItems.map(item => item.Id));

			result = allRowData
				.map(row => {
					if (row.id === 'resume') {
						return resumeItems.length > 0 ? {...row, items: resumeItems} : null;
					}
					if (row.id === 'nextup') {
						const filteredItems = row.items.filter(item => !resumeItemIds.has(item.Id) && !isHiddenByMap(item, hiddenNUMap, true));
						return filteredItems.length > 0 ? {...row, items: filteredItems} : null;
					}
					return row;
				})
				.filter(row => {
					if (!row) return false;
					if (row.isPluginRow) {
						return enabledPluginIds.includes(row.id);
					}
					if (row.id === 'resume' || row.id === 'nextup') {
						return enabledRowIdsSet.has(row.id);
					}
					if (row.isLatestRow) {
						return enabledRowIdsSet.has('latest-media') || enabledRowIdsSet.has('latestmedia');
					}
					if (row.isRecentlyReleasedRow) {
						return enabledRowIdsSet.has('recently-released') || enabledRowIdsSet.has('recentlyreleased');
					}
					if (!isRowVisibleByGates(row.id)) {
						return false;
					}
					return enabledRowIdsSet.has(row.id) || enabledRowIdsSet.has(TV_TO_SERVER_ROW[row.id]) || enabledRowIdsSet.has(SERVER_TO_TV_ROW[row.id]);
				});
		}

		// Re-translate titles so cached rows pick up the current locale
		const favoriteLabelMap = new Map(FAVORITE_ROW_CONFIGS.map((row) => [row.id, $L(row.title)]));
		result = result.map(row => {
			let title;
			if (row.id === 'resume' || row.id === 'continue-nextup') title = $L('Continue Watching');
			else if (row.id === 'nextup') title = $L('Next Up');
			else if (row.id === 'library-tiles') title = $L('My Media');
			else if (row.id === 'collections') title = $L('Collections');
			else if (row.id === 'genres') title = $L('Genres');
			else if (row.id === 'playlists') title = $L('Playlists');
			else if (row.id === 'audioartists') title = $L('Music Artists');
			else if (row.id === 'audioalbums') title = $L('Music Albums');
			else if (row.id === 'audioplaylists') title = $L('Music Playlists');
			else if (row.id === 'resumeaudio') title = $L('Continue Listening');
			else if (row.id === 'activerecordings') title = $L('Recordings');
			else if (row.id === 'livetv') title = $L('Live TV');
			else if (favoriteLabelMap.has(row.id)) title = favoriteLabelMap.get(row.id);
			else if (row.isLatestRow && row.library) {
				const libName = row.library._serverName
					? `${row.library.Name} (${row.library._serverName})`
					: row.library.Name;
				title = $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', libName);
			} else if (row.isRecentlyReleasedRow && row.library) {
				const libName = row.library._serverName
					? `${row.library.Name} (${row.library._serverName})`
					: row.library.Name;
				title = $L('Recently Released in {libraryTitle}').replace('{libraryTitle}', libName);
			}
			return title && title !== row.title ? {...row, title} : row;
		});

		result = [...result, ...seerrRows, ...externalRows];

		const resumeOrder = rowOrderMap.get('resume');
		const nextUpOrder = rowOrderMap.get('nextup');
		const continueOrder = Math.min(
			Number.isFinite(resumeOrder) ? resumeOrder : Number.MAX_SAFE_INTEGER,
			Number.isFinite(nextUpOrder) ? nextUpOrder : Number.MAX_SAFE_INTEGER
		);

		result = result
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

		const prev = prevFilteredRowsRef.current;
		if (prev.length === result.length) {
			let unchanged = true;
			for (let i = 0; i < result.length; i++) {
				if (result[i].id !== prev[i].id || result[i].items.length !== prev[i].items.length || result[i].title !== prev[i].title) {
					unchanged = false;
					break;
				}
				const rItems = result[i].items;
				const pItems = prev[i].items;
				if (rItems[0]?.Id !== pItems[0]?.Id || rItems[rItems.length - 1]?.Id !== pItems[pItems.length - 1]?.Id) {
					unchanged = false;
					break;
				}
			}
			if (unchanged) return prev;
		}

		prevFilteredRowsRef.current = result;
		return result;
	}, [allRowData, seerrRows, externalRows, homeRowsConfig, pluginSectionsConfig, settings.mergeContinueWatchingNextUp, settings.hiddenContinueWatchingItems, settings.hiddenNextUpSeries, isRowVisibleByGates]);

	const focusRow = useCallback((rowIndex) => {
		if (Spotlight.focus(`row-${rowIndex}`)) {
			return true;
		}

		const row = filteredRowsRef.current[rowIndex];
		const firstItemId = row?.items?.[0]?.Id;
		const keyPrefix = row?.id || rowIndex;

		if (firstItemId !== undefined && firstItemId !== null) {
			const firstCardSpotlightId = `media-${keyPrefix}-${firstItemId}`;
			if (Spotlight.focus(firstCardSpotlightId)) {
				return true;
			}
		}

		return false;
	}, []);

	const scrollToRow = useCallback((rowIndex, thenFocus) => {
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

		const targetRow = rowRefsMap.current.get(rowIndex);
		const container = contentRowsRef.current;
		if (!targetRow || !container) {
			if (thenFocus) focusRow(rowIndex);
			return;
		}

		container.scrollTop = targetRow.offsetTop;

		if (thenFocus) {
			let attempts = 0;
			const tryFocus = () => {
				attempts += 1;
				if (focusRow(rowIndex)) {
					return;
				}
				if (attempts < 6) {
					scrollTimeoutRef.current = setTimeout(tryFocus, 16);
				}
			};
			scrollTimeoutRef.current = setTimeout(tryFocus, 0);
		}
	}, [focusRow]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			if (showFeaturedBar !== false) {
				dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		const targetIndex = fromRowIndex - 1;
		scrollToRow(targetIndex, true);
	}, [showFeaturedBar, settings.navbarPosition, scrollToRow]);

	filteredRowsRef.current = filteredRows;
	filteredRowsLengthRef.current = filteredRows.length;

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= filteredRowsLengthRef.current) return;
		scrollToRow(targetIndex, true);
	}, [scrollToRow]);

	useEffect(() => {
		if (showFeaturedBar === false) {
			dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		}
	}, [showFeaturedBar]);

	useEffect(() => {
		if (isVisible && !wasVisibleRef.current && !isLoading && filteredRows.length > 0) {
			fetchFreshFeaturedItems();
			refreshVolatileData();

			setTimeout(() => {
				if (lastFocusState && lastFocusState.rowIndex > 0) {
					const {rowIndex} = lastFocusState;
					const targetRowIndex = Math.min(rowIndex, filteredRows.length - 1);
					scrollToRow(targetRowIndex, true);
				} else if (showFeaturedBar !== false && featuredItems.length > 0) {
					dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
					setTimeout(() => Spotlight.focus('featured-banner'), 50);
				} else {
					scrollToRow(0, true);
				}
				lastFocusState = null;
			}, FOCUS_DELAY_MS);
		}
		wasVisibleRef.current = isVisible;
	}, [isVisible, isLoading, filteredRows.length, fetchFreshFeaturedItems, refreshVolatileData, showFeaturedBar, featuredItems.length, scrollToRow]);

	useEffect(() => {
		if (!isVisible) return;
		if (!isLoading && !initialFocusSetRef.current) {
			setTimeout(() => {
				if (lastFocusState || initialFocusSetRef.current) {
					return;
				}
				if (showFeaturedBar !== false && featuredItems.length > 0) {
					Spotlight.focus('featured-banner');
					initialFocusSetRef.current = true;
				} else if (filteredRows.length > 0) {
					Spotlight.focus('row-0');
					initialFocusSetRef.current = true;
				}
			}, FOCUS_DELAY_MS);
		}
	}, [isVisible, isLoading, featuredItems.length, filteredRows.length, showFeaturedBar]);

	useEffect(() => {
		cachedRowData = null;
		cachedLibraries = null;
		cachedFeaturedItems = null;
		cacheTimestamp = null;
		initialFocusSetRef.current = false;
	}, [accessToken]);

	useEffect(() => {
		const handleBrowseRefresh = () => {
			cachedRowData = null;
			cachedLibraries = null;
			cachedFeaturedItems = null;
			cacheTimestamp = null;
		};

		window.addEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		return () => {
			window.removeEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		};
	}, []);

	const isCacheValid = useCallback((timestamp, ttl) => {
		if (!timestamp) return false;
		return Date.now() - timestamp < ttl;
	}, []);

	const saveBrowseCache = useCallback((rowData, libs, featured) => {
		const signature = rowData.map((row) => {
			let progressSum = 0;
			if (row.id === 'resume' || row.id === 'nextup') {
				row.items.forEach((item) => {
					progressSum += item.UserData?.PlayedPercentage || 0;
				});
			}
			return `${row.id}:${row.items.length}:${row.items[0]?.Id || ''}:${Math.round(progressSum)}`;
		}).join('|');
		if (signature === lastCacheSignatureRef.current) return;

		if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
		cacheSaveTimerRef.current = setTimeout(async () => {
			cacheSaveTimerRef.current = null;
			try {
				const strippedRows = rowData.map(row => ({
					...row,
					items: row.items.map(stripItemForCache)
				}));
				const cacheData = {
					rowData: strippedRows,
					libraries: libs,
					featuredItems: featured,
					timestamp: Date.now(),
					serverUrl,
					userId: user?.Id || null
				};
				await saveToStorage(STORAGE_KEY_BROWSE, cacheData);
				lastCacheSignatureRef.current = signature;
			} catch (e) {
				console.warn('[Browse] Failed to save cache:', e);
			}
		}, CACHE_SAVE_DEBOUNCE_MS);
	}, [serverUrl, user?.Id]);

	useEffect(() => {
		return () => {
			if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
		};
	}, []);

	const loadBrowseCache = useCallback(async () => {
		try {
			const cached = await getFromStorage(STORAGE_KEY_BROWSE);
			if (cached && cached.serverUrl === serverUrl && cached.userId === (user?.Id || null)) {
				return cached;
			}
		} catch (e) {
			console.warn('[Browse] Failed to load cache:', e);
		}
		return null;
	}, [serverUrl, user?.Id]);

	useEffect(() => {
		let cancelled = false;
		const loadData = async () => {
			// IMDb rows are only fetched by fetchAllData, so treat an enabled IMDb list as
			// dynamic config. Otherwise enabling one shows nothing until the browse cache expires.
			const hasEnabledImdbRow = homeRowsConfig.some(
				(row) => row.enabled && row.id.startsWith('imdb-')
			);
			// Recommendation rows are only built by fetchAllData, so treat an enabled one
			// as dynamic config. Otherwise enabling it shows nothing until the cache expires.
			const hasEnabledRecommendationRow = homeRowsConfig.some(
				(row) => row.enabled && (row.id.startsWith('sinceyouwatched') || row.id === 'rewatch')
			);
			const hasEnabledMediaSectionRow = homeRowsConfig.some(
				(row) => row.enabled && ['audioartists', 'audioalbums', 'audioplaylists', 'resumeaudio', 'activerecordings'].includes(row.id)
			);
			const hasDynamicRowConfig =
				settings.displayFavoritesRows ||
				settings.displayCollectionsRows ||
				settings.displayGenresRows ||
				settings.displayPlaylistsRows ||
				hasEnabledImdbRow ||
				hasEnabledRecommendationRow ||
				hasEnabledMediaSectionRow ||
				(settings.pluginSections || []).some((section) => section?.enabled);

			if (hasDynamicRowConfig || unifiedMode) {
				dispatch({type: 'SET_LOADING', value: true});
				await fetchAllData(); // eslint-disable-line no-use-before-define
				return;
			}

			if (cachedRowData && cachedLibraries && cachedFeaturedItems && isCacheValid(cacheTimestamp, CACHE_TTL_VOLATILE)) {
				dispatch({type: 'SET_ROW_DATA', rowData: cachedRowData});
				await fetchFreshFeaturedItems(cachedFeaturedItems);
				dispatch({type: 'SET_LOADING', value: false});
				return;
			}

			const persistedCache = await loadBrowseCache();
			const hasValidPersistedCache = persistedCache &&
				isCacheValid(persistedCache.timestamp, CACHE_TTL_LIBRARIES) &&
				Array.isArray(persistedCache.libraries) &&
				persistedCache.libraries.length > 0;

			if (hasValidPersistedCache) {
				dispatch({type: 'SET_ROW_DATA', rowData: persistedCache.rowData});
				await fetchFreshFeaturedItems(persistedCache.featuredItems);
				cachedLibraries = persistedCache.libraries;
				cachedRowData = persistedCache.rowData;
				cacheTimestamp = persistedCache.timestamp;
				dispatch({type: 'SET_LOADING', value: false});

				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					refreshVolatileData(true);
				}
				return;
			}

			dispatch({type: 'SET_LOADING', value: true});
			await fetchAllData(); // eslint-disable-line no-use-before-define
		};

		const fetchAllData = async () => {
			try {
				let libs, resumeItems, nextUp, userConfig, recentlyPlayed;

				if (unifiedMode) {
					const [libsArray, resumeArray, nextUpArray] = await Promise.all([
						connectionPool.getLibrariesFromAllServers(),
						connectionPool.getResumeItemsFromAllServers(),
						connectionPool.getNextUpFromAllServers()
					]);
					libs = libsArray;
					resumeItems = {Items: resumeArray};
					nextUp = {Items: nextUpArray};
					userConfig = null; // Not supported in unified mode
					recentlyPlayed = null;
					// IMDb custom rows are single-server only, so imdbResults stays empty in unified mode.
				} else {
					const results = await Promise.all([
						api.getLibraries().catch(() => ({Items: []})),
						api.getResumeItems().catch(() => ({Items: []})),
						api.getNextUp().catch(() => ({Items: []})),
						api.getUserConfiguration().catch(() => null),
						settings.mergeContinueWatchingNextUp ? api.getItems({
							IncludeItemTypes: 'Episode',
							Filters: 'IsPlayed',
							Recursive: true,
							SortBy: 'DatePlayed',
							SortOrder: 'Descending',
							Limit: 100,
							Fields: 'UserData,SeriesId'
						}).catch(() => null) : Promise.resolve(null)
					]);
					libs = results[0].Items || [];
					resumeItems = results[1];
					nextUp = results[2];
					userConfig = results[3];
					recentlyPlayed = results[4];
				}

				cachedLibraries = libs;

				const latestItemsExcludes = userConfig?.Configuration?.LatestItemsExcludes || [];

				const rowData = [];

				if (resumeItems.Items?.length > 0) {
					rowData.push({
						id: 'resume',
						title: $L('Continue Watching'),
						items: resumeItems.Items,
						type: 'landscape'
					});
				}

				if (nextUp.Items?.length > 0) {
					rowData.push({
						id: 'nextup',
						title: $L('Next Up'),
						items: nextUp.Items,
						type: 'landscape'
					});
				}

				if (libs.length > 0) {
					const visibleLibs = libs.filter(lib => !EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase()));
					if (visibleLibs.length > 0) {
						rowData.push({
							id: 'library-tiles',
							title: $L('My Media'),
							items: visibleLibs.map(lib => ({
								...lib,
								Type: 'CollectionFolder',
								isLibraryTile: true
							})),
							type: 'landscape',
							isLibraryRow: true
						});
					}

					const liveTvLibrary = libs.find(lib => lib.CollectionType?.toLowerCase() === 'livetv');
					if (liveTvLibrary) {
						rowData.push({
							id: 'livetv',
							title: $L('Live TV'),
							items: [
								{...liveTvLibrary, Name: $L('Guide'), Type: 'CollectionFolder', isLibraryTile: true},
								{Id: 'livetv-recordings', Name: $L('Recordings'), Type: 'CollectionFolder', isRecordingsShortcut: true}
							],
							type: 'landscape',
							isLiveTvRow: true
						});
					}
				}

				if (recentlyPlayed?.Items?.length > 0) {
					rowData.push({
						id: 'recentlyplayed',
						items: recentlyPlayed.Items
					});
				}

				dispatch({type: 'SET_INITIAL_DATA', rowData});
				cachedRowData = [...rowData];
				// The Mediabar is populated only by the settings-aware loader so it can
				// never show a library outside the selected sources.
				fetchFreshFeaturedItems();

				const eligibleLibraries = libs.filter(lib => {
					if (EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase())) {
						return false;
					}
					if (latestItemsExcludes.includes(lib.Id)) {
						return false;
					}
					return true;
				});

				if (unifiedMode) {
					const latestResults = await connectionPool.getLatestPerLibraryFromAllServers(
						latestItemsExcludes,
						EXCLUDED_COLLECTION_TYPES
					);
					const newRows = [];
					for (const result of latestResults) {
						if (result && result.latest?.length > 0) {
							const libraryTitle = result.lib._serverName
								? `${result.lib.Name} (${result.lib._serverName})`
								: result.lib.Name;
							const rowId = `latest-${result.lib.Id}${result.lib._serverName ? '-' + result.lib._serverName : ''}`;

							newRows.push({
								id: rowId,
								title: $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
								items: result.latest,
								library: result.lib,
								type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
								isLatestRow: true
							});
						}
					}
					dispatch({type: 'APPEND_ROWS', rows: newRows});
					cachedRowData = [...rowData, ...newRows];
					cacheTimestamp = Date.now();
					dispatch({type: 'SET_LOADING', value: false});
					return;
				}

				const favoriteSortBy = settings.favoritesRowSortBy || 'SortName';
				const favoriteSortOrder = getSortOrderFromSortBy(favoriteSortBy);
				const collectionsSortBy = settings.collectionsRowSortBy || 'SortName';
				const collectionsSortOrder = getSortOrderFromSortBy(collectionsSortBy);
				const genresSortBy = settings.genresRowSortBy || 'SortName';
				const genresSortOrder = getSortOrderFromSortBy(genresSortBy);
				const genresIncludeTypes = getGenresIncludeTypes(settings.genresRowItemFilter);
				const playlistsSortBy = settings.playlistsRowSortBy || 'SortName';
				const playlistsSortOrder = getSortOrderFromSortBy(playlistsSortBy);
				const audioRowsSortBy = settings.audioRowsSortBy || 'SortName';
				const audioRowsSortOrder = getSortOrderFromSortBy(audioRowsSortBy);
				const audioArtistsEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'audioartists');
				const audioAlbumsEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'audioalbums');
				const audioPlaylistsEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'audioplaylists');
				const resumeAudioEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'resumeaudio');
				const recordingsEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'activerecordings');
				const enabledPluginSections = (settings.pluginSections || []).filter((section) => section.enabled);
				const sinceYouWatchedIndexes = homeRowsConfig
					.filter((row) => row.enabled && row.id.startsWith('sinceyouwatched'))
					.map((row) => parseInt(row.id.replace('sinceyouwatched', ''), 10))
					.filter((idx) => idx >= 1)
					.sort((a, b) => a - b);
				const rewatchEnabled = homeRowsConfig.some((row) => row.enabled && row.id === 'rewatch');

				const appendRows = (rows) => {
					if (cancelled || rows.length === 0) return;
					dispatch({type: 'APPEND_ROWS', rows});
					cachedRowData = mergeRowsById(cachedRowData || [], rows);
					cacheTimestamp = Date.now();
					// Unified mode spans several servers, so its rows never go to the disk cache.
					if (!unifiedMode) {
						saveBrowseCache(cachedRowData, libs, cachedFeaturedItems);
					}
				};

				const loadLatestAndRecentlyReleased = async () => {
					try {
						const [latestResults, recentlyReleasedResults] = await Promise.all([
							Promise.all(
								eligibleLibraries.map(lib =>
									api.getLatest(lib.Id, 16)
										.then(latest => ({lib, latest}))
										.catch(() => null)
								)
							),
							Promise.all(
								eligibleLibraries.map(lib =>
									api.getRecentlyReleased(lib.Id, 16)
										.then(latest => ({lib, latest}))
										.catch(() => null)
								)
							)
						]);

						const rows = [];
						for (const result of latestResults) {
							if (result && result.latest?.length > 0) {
								const libraryTitle = result.lib.Name;
								const rowId = `latest-${result.lib.Id}`;
								rows.push({
									id: rowId,
									title: $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
									items: result.latest,
									library: result.lib,
									type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
									isLatestRow: true
								});
							}
						}
						for (const result of recentlyReleasedResults) {
							if (result && result.latest?.Items?.length > 0) {
								const libraryTitle = result.lib.Name;
								const rowId = `recently-released-${result.lib.Id}`;
								rows.push({
									id: rowId,
									title: $L('Recently Released in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
									items: result.latest.Items,
									library: result.lib,
									type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
									isRecentlyReleasedRow: true
								});
							}
						}
						appendRows(rows);
					} catch (e) {
						console.warn('[Browse] Failed to load latest items:', e);
					}
				};

				const loadCollections = async () => {
					if (!settings.displayCollectionsRows) return;
					try {
						const collectionsResult = await api.getCollections(20, collectionsSortBy, collectionsSortOrder).catch(() => null);
						if (collectionsResult?.Items?.length > 0) {
							appendRows([{
								id: 'collections',
								title: $L('Collections'),
								items: collectionsResult.Items,
								type: 'portrait'
							}]);
						}
					} catch (e) {
						console.warn('[Browse] Failed to load collections:', e);
					}
				};

				const loadFavorites = async () => {
					if (!settings.displayFavoritesRows) return;
					try {
						const favoriteResults = await Promise.all(
							FAVORITE_ROW_CONFIGS.map((rowConfig) =>
								api.getItems({
									IncludeItemTypes: rowConfig.includeItemTypes,
									Filters: 'IsFavorite',
									SortBy: favoriteSortBy,
									SortOrder: favoriteSortOrder,
									Recursive: true,
									Limit: 20,
									Fields: HOME_ROW_ITEM_FIELDS
								})
								.then((result) => ({rowConfig, result}))
								.catch(() => null)
							)
						);
						const rows = [];
						favoriteResults.filter(Boolean).forEach((favoriteResult) => {
							const items = favoriteResult?.result?.Items || [];
							if (items.length === 0) return;
							rows.push({
								id: favoriteResult.rowConfig.id,
								title: $L(favoriteResult.rowConfig.title),
								items,
								type: favoriteResult.rowConfig.type
							});
						});
						appendRows(rows);
					} catch (e) {
						console.warn('[Browse] Failed to load favorites:', e);
					}
				};

				const loadGenres = async () => {
					if (!settings.displayGenresRows) return;
					try {
						const genresResult = await api.getGenres(undefined, genresIncludeTypes, genresSortBy, genresSortOrder).catch(() => null);
						if (genresResult?.Items?.length > 0) {
							let enrichedItems = genresResult.Items;
							const genresSortByLower = (settings.genresRowSortBy || 'SortName').toLowerCase();
							if (genresSortByLower === 'sortname' || genresSortByLower === 'name') {
								enrichedItems = [...enrichedItems].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
							} else if (genresSortByLower === 'random') {
								enrichedItems = [...enrichedItems].sort(() => Math.random() - 0.5);
							}

							try {
								const genreNames = enrichedItems.map((genre) => genre.Name).filter(Boolean);
								// One query, filtered to the genres we actually have. Sorting at
								// random turns into ORDER BY RANDOM() on the server, a full scan of
								// the item table that no index can help, which is far too expensive
								// to run on every home load. Any stable sort avoids it.
								const repResult = await api.getItems({
									IncludeItemTypes: genresIncludeTypes,
									Recursive: true,
									Fields: 'PrimaryImageAspectRatio,Genres,ImageTags,BackdropImageTags',
									Genres: genreNames.join('|'),
									Limit: Math.min(Math.max(genreNames.length * 8, 50), 300),
									SortBy: 'SortName'
								});
								const repItems = repResult?.Items || [];

								enrichedItems = enrichedItems.map(genre => {
									const genreLower = genre.Name.toLowerCase();
									const matchingItems = repItems.filter(item =>
										getItemGenreNames(item).includes(genreLower)
									);
									const matchingWithBackdrop = matchingItems.filter(item =>
										item.BackdropImageTags?.length > 0 || item.ImageTags?.Thumb
									);
									const pool = matchingWithBackdrop.length > 0 ? matchingWithBackdrop : matchingItems;
									const rep = pool.length > 0 ? pool[stableIndex(genre.Name, pool.length)] : null;

									if (rep) {
										return {
											...genre,
											Type: 'Genre',
											_representative: rep
										};
									}
									return {
										...genre,
										Type: 'Genre'
									};
								});

								// Fallback resolution for any genres that missed the bulk query
								const missingGenres = enrichedItems.filter(g => !g._representative);
								if (missingGenres.length > 0) {
									const fallbackResults = await Promise.all(
										missingGenres.map(async (genre) => {
											try {
												const res = await api.getItems({
													IncludeItemTypes: genresIncludeTypes,
													Recursive: true,
													Fields: 'PrimaryImageAspectRatio,Genres,ImageTags,BackdropImageTags',
													Genres: genre.Name,
													Limit: 1,
													SortBy: 'SortName'
												});
												return { genreId: genre.Id, rep: res?.Items?.[0] || null };
											} catch (err) {
												return { genreId: genre.Id, rep: null };
											}
										})
									);

									enrichedItems = enrichedItems.map(genre => {
										if (genre._representative) return genre;
										const found = fallbackResults.find(r => r.genreId === genre.Id);
										if (found && found.rep) {
											return {
												...genre,
												Type: 'Genre',
												_representative: found.rep
											};
										}
										return genre;
									});
								}
							} catch (e) {
								console.warn('[Browse] Failed to enrich genres:', e);
							}

							appendRows([{
								id: 'genres',
								title: $L('Genres'),
								items: enrichedItems,
								type: 'portrait',
								isGenreRow: true
							}]);
						}
					} catch (e) {
						console.warn('[Browse] Failed to load genres:', e);
					}
				};

				const loadPlaylistsAndMusic = async () => {
					try {
						const [playlistsResult, audioArtistsResult, audioAlbumsResult, audioPlaylistsResult, resumeAudioResult, recordingsResult] = await Promise.all([
							settings.displayPlaylistsRows ? api.getPlaylists(playlistsSortBy, playlistsSortOrder).catch(() => null) : Promise.resolve(null),
							audioArtistsEnabled ? api.getAlbumArtists({Limit: 20, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Fields: HOME_ROW_ITEM_FIELDS}).catch(() => null) : Promise.resolve(null),
							audioAlbumsEnabled ? api.getItems({IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: audioRowsSortBy, SortOrder: audioRowsSortOrder, Limit: 20, Fields: HOME_ROW_ITEM_FIELDS}).catch(() => null) : Promise.resolve(null),
							audioPlaylistsEnabled ? api.getPlaylists(audioRowsSortBy, audioRowsSortOrder).catch(() => null) : Promise.resolve(null),
							resumeAudioEnabled ? api.getResumeAudioItems(20).catch(() => null) : Promise.resolve(null),
							recordingsEnabled ? api.getLiveTvRecordings().catch(() => null) : Promise.resolve(null)
						]);

						const rows = [];
						if (playlistsResult?.Items?.length > 0) {
							rows.push({
								id: 'playlists',
								title: $L('Playlists'),
								items: playlistsResult.Items,
								type: 'square'
							});
						}
						if (audioArtistsResult?.Items?.length > 0) {
							rows.push({
								id: 'audioartists',
								title: $L('Music Artists'),
								items: audioArtistsResult.Items,
								type: 'square'
							});
						}
						if (audioAlbumsResult?.Items?.length > 0) {
							rows.push({
								id: 'audioalbums',
								title: $L('Music Albums'),
								items: audioAlbumsResult.Items,
								type: 'square'
							});
						}
						if (audioPlaylistsResult?.Items?.length > 0) {
							const audioPlaylists = audioPlaylistsResult.Items.filter(item => item.MediaType === 'Audio');
							if (audioPlaylists.length > 0) {
								rows.push({
									id: 'audioplaylists',
									title: $L('Music Playlists'),
									items: audioPlaylists,
									type: 'square'
								});
							}
						}
						if (resumeAudioResult?.Items?.length > 0) {
							rows.push({
								id: 'resumeaudio',
								title: $L('Continue Listening'),
								items: resumeAudioResult.Items,
								type: 'square'
							});
						}
						if (recordingsResult?.Items?.length > 0) {
							rows.push({
								id: 'activerecordings',
								title: $L('Recordings'),
								items: recordingsResult.Items,
								type: 'landscape'
							});
						}
						appendRows(rows);
					} catch (e) {
						console.warn('[Browse] Failed to load playlists/music:', e);
					}
				};

				const loadImdbRows = async () => {
					try {
						const enabledImdbRows = homeRowsConfig.filter(
							(row) => row.enabled && (row.id.startsWith('imdb-') || row.id.startsWith('imdb_'))
						);
						if (enabledImdbRows.length === 0) return;
						const imdbListResults = await Promise.all(
							enabledImdbRows.map((row) => {
								const serverId = TV_TO_SERVER_ROW[row.id] || row.id;
								return api.getCustomRow('imdb', serverId)
									.then((res) => {
										if (!res || res.success !== true || !Array.isArray(res.items)) {
											return { row, items: [] };
										}
										const items = res.items.map((it) => {
											const imdbId = it.providerIds?.Imdb || null;
											const mediaType = it.type === 'Series' ? 'tv' : 'movie';
											return {
												Id: `imdb-${imdbId || `${serverId}-${it.rank}`}`,
												Name: it.name,
												Type: it.type === 'Series' ? 'Series' : 'Movie',
												ProductionYear: it.productionYear,
												ProviderIds: {Imdb: imdbId, Tmdb: it.providerIds?.Tmdb},
												Overview: it.overview || null,
												_externalPosterUrl: resolveExternalImageUrl(it.posterUrl, 'w342'),
												_externalBackdropUrl: resolveExternalImageUrl(it.backdropUrl, 'w780'),
												_external: true,
												_serverName: 'IMDb',
												mediaInfo: {},
												_seerr: true,
												_seerrType: 'item',
												_seerrMediaType: mediaType,
												_seerrRaw: it.providerIds?.Tmdb ? {mediaId: Number(it.providerIds.Tmdb), mediaType} : null
											};
										});
										return { row, items };
									})
									.catch(() => ({ row, items: [] }));
							})
						);
						const rows = [];
						imdbListResults.forEach((res) => {
							if (res.items?.length > 0) {
								rows.push({
									id: res.row.id,
									title: $L(res.row.name),
									items: res.items,
									type: 'portrait'
								});
							}
						});
						appendRows(rows);
					} catch (e) {
						console.warn('[Browse] Failed to load IMDb rows:', e);
					}
				};

				const loadPluginsAndRecos = async () => {
					const fetchPluginSectionRow = async (section) => {
						if (!section?.enabled) return null;
						const spec = parsePluginSpec(section.specJson);
						if (!spec || typeof spec !== 'object') return null;
						const limit = Number.isFinite(Number(spec.limit)) ? Number(spec.limit) : 20;
						const title = section.name || section.displayText || $L('Plugin Section');
						const fields = HOME_ROW_ITEM_FIELDS;

						try {
							let items = [];
							switch (spec.kind) {
								case 'recentlyReleasedMovies': {
									const result = await api.getItems({
										IncludeItemTypes: 'Movie',
										SortBy: 'PremiereDate',
										SortOrder: 'Descending',
										Recursive: true,
										Limit: limit,
										Fields: fields
									});
									items = result?.Items || [];
									break;
								}
								case 'recentlyReleasedEpisodes': {
									const result = await api.getItems({
										IncludeItemTypes: 'Episode',
										SortBy: 'PremiereDate',
										SortOrder: 'Descending',
										Recursive: true,
										Limit: limit,
										Fields: fields
									});
									items = result?.Items || [];
									break;
								}
								case 'watchAgain': {
									const result = await api.getItems({
										IncludeItemTypes: 'Movie,Series',
										Filters: 'IsPlayed',
										SortBy: 'DatePlayed',
										SortOrder: 'Descending',
										Recursive: true,
										Limit: limit,
										Fields: fields
									});
									items = result?.Items || [];
									break;
								}
								case 'recentlyAddedInLibrary': {
									const libraryIds = Array.isArray(spec.libraryIds) ? spec.libraryIds : [];
									const responses = await Promise.all(
										libraryIds.map((libraryId) => api.getItems({
											ParentId: libraryId,
											IncludeItemTypes: 'Movie,Series',
											SortBy: 'DateCreated',
											SortOrder: 'Descending',
											Recursive: true,
											Limit: limit,
											Fields: fields
										}).catch(() => null))
									);
									items = responses.flatMap((response) => response?.Items || []).slice(0, limit);
									break;
								}
								case 'custom': {
									const includeItemTypes = Array.isArray(spec.includeItemTypes)
										? spec.includeItemTypes.join(',')
										: 'Movie,Series';
									const sortBy = spec.sortBy || 'Random';
									const sortOrder = spec.sortOrderDirection || 'Ascending';
									const params = {
										IncludeItemTypes: includeItemTypes,
										SortBy: sortBy,
										SortOrder: sortOrder,
										Recursive: true,
										Limit: limit,
										Fields: fields
									};
									if (spec.type === 'genre' && spec.source) params.Genres = spec.source;
									if (spec.type === 'person' && spec.source) params.PersonIds = spec.source;
									if (spec.type === 'studio' && spec.source) params.StudioIds = spec.source;
									if (spec.type === 'collection' && spec.source) params.ParentId = spec.source;
									const result = await api.getItems(params);
									items = result?.Items || [];
									break;
								}
								case 'collection': {
									const collectionId = spec.collectionId || null;
									if (!collectionId) {
										items = [];
										break;
									}
									const result = await api.getCollectionItems(collectionId, limit);
									items = result?.Items || [];
									break;
								}
								case 'genre': {
									const params = {
										IncludeItemTypes: spec.includeItemTypes || 'Movie,Series',
										SortBy: spec.sortBy || 'SortName',
										SortOrder: spec.sortOrder || 'Ascending',
										Recursive: true,
										Limit: limit,
										Fields: fields
									};
									if (spec.genreId) {
										params.GenreIds = spec.genreId;
									} else if (spec.genreName) {
										params.Genres = spec.genreName;
									}
									const result = await api.getItems(params);
									items = result?.Items || [];
									break;
								}
								default:
									items = [];
							}

							if (items.length === 0) return null;
							const cardTypeHint = spec.cardType || spec.section?.CardType || spec.section?.cardType || spec.section?.Layout || spec.section?.layout;
							const normalizedCardType = typeof cardTypeHint === 'string' ? cardTypeHint.toLowerCase() : '';
							const viewModeHint = spec.viewMode || spec.section?.ViewMode || spec.section?.viewMode || '';
							const normalizedViewMode = typeof viewModeHint === 'string' ? viewModeHint.toLowerCase() : '';
							let rowType = 'portrait';
							if (normalizedViewMode.includes('portrait')) {
								rowType = 'portrait';
							} else if (normalizedViewMode.includes('square')) {
								rowType = 'square';
							} else if (
								normalizedViewMode.includes('landscape') ||
								normalizedViewMode.includes('small') ||
								normalizedViewMode.includes('backdrop') ||
								normalizedCardType.includes('landscape') ||
								normalizedCardType.includes('thumb') ||
								spec.kind === 'recentlyReleasedEpisodes'
							) {
								rowType = 'landscape';
							}
							return {
								id: section.id,
								title,
								items,
								type: rowType,
								isPluginRow: true,
								pluginSource: section.source
							};
						} catch (_error) {
							return null;
						}
					};

					try {
						const [pluginRows, sinceYouWatchedRows, rewatchItems] = await Promise.all([
							Promise.all(enabledPluginSections.map((section) => fetchPluginSectionRow(section))),
							sinceYouWatchedIndexes.length
								? loadSinceYouWatchedRows(api, {
									sinceYouWatchedSource: settings.sinceYouWatchedSource,
									sinceYouWatchedSourceItem: settings.sinceYouWatchedSourceItem,
									sinceYouWatchedSourceType: settings.sinceYouWatchedSourceType,
									sinceYouWatchedIncludeWatched: settings.sinceYouWatchedIncludeWatched,
									tmdbApiKey: settings.tmdbApiKey
								}, sinceYouWatchedIndexes, seerrEnabled && seerrAuthenticated).catch(() => [])
								: Promise.resolve([]),
							rewatchEnabled
								? loadRewatchItems(api, {
									rewatchIncludeMovies: settings.rewatchIncludeMovies,
									rewatchIncludeShows: settings.rewatchIncludeShows,
									rewatchIncludeCollections: settings.rewatchIncludeCollections,
									rewatchSortBy: settings.rewatchSortBy
								}).catch(() => null)
								: Promise.resolve(null)
						]);

						const rows = [];
						pluginRows.filter(Boolean).forEach((pluginRow) => rows.push(pluginRow));
						sinceYouWatchedRows.forEach((row) => {
							rows.push({
								id: row.id,
								title: $L('Because you watched {name}').replace('{name}', row.seedName),
								items: row.items,
								type: 'portrait',
								isOnlineRecoRow: row.isSeerr === true
							});
						});
						if (rewatchItems && rewatchItems.length > 0) {
							rows.push({
								id: 'rewatch',
								title: $L('Rewatch'),
								items: rewatchItems,
								type: 'portrait'
							});
						}
						appendRows(rows);
					} catch (e) {
						console.warn('[Browse] Failed to load plugins/recos:', e);
					}
				};

				dispatch({type: 'SET_LOADING', value: false});
				// Each loader appends its rows as it finishes. They start together and their
				// requests line up in the media server queue, so holding the later ones back
				// would only delay those rows without easing the load.
				if (!cancelled) {
					[
						loadLatestAndRecentlyReleased,
						loadCollections,
						loadFavorites,
						loadGenres,
						loadPlaylistsAndMusic,
						loadImdbRows,
						loadPluginsAndRecos
					].forEach((loader) => loader());
				}

			} catch (err) {
				console.error('Failed to load browse data:', err);
			} finally {
				dispatch({type: 'SET_LOADING', value: false});
			}
		};

		loadData();
		return () => {
			cancelled = true;
		};
	}, [
		api,
		serverUrl,
		accessToken,
		settings.featuredContentType,
		settings.featuredItemCount,
		settings.displayFavoritesRows,
		settings.displayCollectionsRows,
		settings.displayGenresRows,
		settings.displayPlaylistsRows,
		settings.favoritesRowSortBy,
		settings.collectionsRowSortBy,
		settings.genresRowSortBy,
		settings.genresRowItemFilter,
		settings.playlistsRowSortBy,
		settings.audioRowsSortBy,
		settings.uiLanguage,
		settings.pluginSections,
		settings.mergeContinueWatchingNextUp,
		settings.sinceYouWatchedSource,
		settings.sinceYouWatchedSourceItem,
		settings.sinceYouWatchedSourceType,
		settings.sinceYouWatchedIncludeWatched,
		settings.tmdbApiKey,
		seerrEnabled,
		seerrAuthenticated,
		settings.rewatchIncludeMovies,
		settings.rewatchIncludeShows,
		settings.rewatchIncludeCollections,
		settings.rewatchSortBy,
		isCacheValid,
		loadBrowseCache,
		saveBrowseCache,
		fetchFreshFeaturedItems,
		unifiedMode,
		getItemServerUrl,
		refreshVolatileData,
		homeRowsConfig
	]); // eslint-disable-line no-use-before-define

	const targetBackdropUrl = useMemo(() => {
		if (browseMode === 'featured') return '';
		if (!focusedItemForBackdrop || isLegacy || settings.showHomeBackdrop === false) return '';

		if (focusedItemForBackdrop._externalBackdropUrl) {
			return focusedItemForBackdrop._externalBackdropUrl;
		}

		let targetItem = focusedItemForBackdrop;
		if (focusedItemForBackdrop.Type === 'Genre' && focusedItemForBackdrop._representative) {
			targetItem = focusedItemForBackdrop._representative;
		}

		const backdropId = getBackdropId(targetItem);
		if (!backdropId) return '';
		const itemUrl = getItemServerUrl(targetItem);
		return getImageUrl(itemUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
	}, [browseMode, focusedItemForBackdrop, isLegacy, settings.showHomeBackdrop, getItemServerUrl]);

	const handleSelectItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		if (lastFocusedRowRef.current !== null) {
			lastFocusState = {
				rowIndex: lastFocusedRowRef.current
			};
		}
		if (item.isRecordingsShortcut) {
			onOpenRecordings?.();
		} else if (item.isLibraryTile) {
			onSelectLibrary?.(item);
		} else if (item.Type === 'Recording') {
			onPlayRecording?.(item);
		} else {
			onSelectItem?.(item);
		}
	}, [onSelectItem, onSelectLibrary, onOpenRecordings, onPlayRecording, onBlurItemThemeMusic, onLeaveThemeMusic]);

	const handleSelectGenreItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		if (lastFocusedRowRef.current !== null) {
			lastFocusState = {
				rowIndex: lastFocusedRowRef.current
			};
		}
		onSelectGenre?.({
			id: item.Id,
			name: item.Name,
			_serverUrl: item._serverUrl,
			_serverType: item._serverType,
			_serverName: item._serverName,
			_serverAccessToken: item._serverAccessToken,
			_serverUserId: item._serverUserId,
			_serverId: item._serverId
		});
	}, [onSelectGenre, onBlurItemThemeMusic, onLeaveThemeMusic]);

	const handleSelectSeerrItem = useCallback((item) => {
		const raw = item._seerrRaw || {};
		switch (item._seerrType) {
			case 'genre':
				onSelectSeerrGenre?.(raw.genreId, raw.genreName, raw.mediaType);
				break;
			case 'studio':
				onSelectSeerrStudio?.(raw.studioId, raw.studioName);
				break;
			case 'network':
				onSelectSeerrNetwork?.(raw.networkId, raw.networkName);
				break;
			default:
				onSelectSeerrItem?.(raw);
				break;
		}
	}, [onSelectSeerrItem, onSelectSeerrGenre, onSelectSeerrStudio, onSelectSeerrNetwork]);

	// External row items that resolved to a library item are real Jellyfin items
	// and open normally, unresolved ones fall back to the Seerr detail.
	const handleSelectExternalItem = useCallback((item) => {
		if (item && item._seerr && !item._resolvedFromExternal) {
			handleSelectSeerrItem(item);
		} else {
			handleSelectItem(item);
		}
	}, [handleSelectSeerrItem, handleSelectItem]);

	useEffect(() => {
		if (!seerrEnabled || !seerrAuthenticated) {
			setSeerrRows([]);
			return;
		}
		const enabledSections = (settings.homeRows || []).filter((r) => r.enabled && SEERR_SECTION_TO_CONFIG[r.id]);
		if (enabledSections.length === 0) {
			setSeerrRows([]);
			return;
		}

		let cancelled = false;
		const configs = getSeerrHomeRowConfigs();

		(async () => {
			const built = await Promise.all(enabledSections.map(async (section) => {
				const configId = SEERR_SECTION_TO_CONFIG[section.id];
				const cfg = configs.find((c) => c.id === configId);
				if (!cfg) return null;
				const items = await fetchSeerrHomeRow(configId, {userId: seerrUserId});
				if (!items.length) return null;
				return {
					id: section.id,
					title: cfg.title,
					items,
					type: cfg.cardType,
					isSeerrRow: true,
					isTileRow: cfg.type === 'genre' || cfg.type === 'studio' || cfg.type === 'network'
				};
			}));
			if (!cancelled) setSeerrRows(built.filter(Boolean));
		})();

		return () => {
			cancelled = true;
		};
	}, [seerrEnabled, seerrAuthenticated, seerrUserId, settings.homeRows]);

	// External home rows (TMDB/IMDb presets and user custom rows). Items come back
	// as provider ids, so each row is resolved against the local library before
	// rendering: owned titles become playable, unowned fall back to Seerr.
	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			setExternalRows([]);
			return;
		}
		const enabledPresets = (settings.homeRows || []).filter((r) => r.enabled && r.id.startsWith('tmdb_')).map((r) => r.id);
		const customRows = (settings.customHomeRows || []).filter((r) => r.enabled);
		const radarrEnabled = (settings.homeRows || []).some((r) => r.enabled && r.id === 'radarr_calendar');
		const sonarrEnabled = (settings.homeRows || []).some((r) => r.enabled && r.id === 'sonarr_calendar');
		const calendarsEnabled = radarrEnabled || sonarrEnabled;
		if (enabledPresets.length === 0 && customRows.length === 0 && !calendarsEnabled) {
			setExternalRows([]);
			return;
		}

		let cancelled = false;
		const presetConfigs = getExternalHomeRowConfigs();

		(async () => {
			try {
				const presetData = await Promise.all(enabledPresets.map(async (id) => {
					const cfg = presetConfigs.find((c) => c.id === id);
					if (!cfg) return null;
					const items = await fetchExternalPresetRow(id);
					return {id, title: cfg.title, items: items || []};
				}));

				const customData = await Promise.all(customRows.map(async (row) => {
					const items = await fetchCustomHomeRow(row);
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

				const allRows = [
					...presetData,
					...customData,
					...calendarRows.map(r => ({...r, isCalendarRow: true}))
				].filter(r => r && r.items && r.items.length > 0);

				const allItemsToResolve = [];
				const rowIndices = [];
				for (const r of allRows) {
					rowIndices.push({
						start: allItemsToResolve.length,
						count: r.items.length
					});
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
						resolvedCalendarRows.push({
							...r,
							items: resolvedItems
						});
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
					setExternalRows([...presetRows, ...builtCustomRows, ...resolvedCalendarRows].filter(Boolean));
				}
			} catch (err) {
				console.warn('[Browse] Failed to fetch and resolve external rows:', err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [settings.useMoonfinPlugin, settings.homeRows, settings.customHomeRows,
		settings.mergeRadarrSonarrCalendars,
		settings.radarrCalendarShowCinema, settings.radarrCalendarShowDigital, settings.radarrCalendarShowPhysical,
		settings.radarrCalendarShowDate, settings.sonarrCalendarShowDate, settings.sonarrCalendarShowEpisodeInfo]);

	const handleNavigateDownFromFeatured = useCallback(() => {
		dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		setTimeout(() => {
			scrollToRow(0, true);
		}, TRANSITION_DELAY_MS);
	}, [scrollToRow]);

	const handleFeaturedFocusCallback = useCallback(() => {
		dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
		detailSectionRef.current?.clearFocusedItem();
	}, []);

	const handleRowFocus = useCallback((rowIndex) => {
		if (browseMode !== 'rows') {
			dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		}
		if (typeof rowIndex === 'number') {
			lastFocusedRowRef.current = rowIndex;
		}
	}, [browseMode]);

	const handleFocusItem = useCallback((item) => {
		if (showTopInfoArea) {
			detailSectionRef.current?.handleFocusItem(item);
		}
		if (item?.Id && (item.Type === 'Movie' || item.Type === 'Series')) {
			onFocusItemThemeMusic?.(item.Id);
		} else {
			onBlurItemThemeMusic?.();
		}
	}, [onFocusItemThemeMusic, onBlurItemThemeMusic, showTopInfoArea]);

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
					<p>{$L('Loading your library...')}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={`${css.mainContent} ${settings.navbarPosition === 'left' ? css.sidebarOffset : css.topbarOffset}`} ref={mainContentRef}>
				<BackdropLayer
					targetUrl={targetBackdropUrl}
					blurAmount={settings.backdropBlurHome}
				/>

				{featuredItems.length > 0 && showFeaturedBar !== false && (
					settings.featuredBarStyle === 'gallery' ? (
						<GalleryBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							api={api}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'banner' ? (
						<BannerBar
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'bookshelf' ? (
						<BookshelfBar
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'makd' ? (
						<MakdBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : (
						<FeaturedBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							api={api}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
							uiPanelStyle={uiPanelStyle}
							uiButtonStyle={uiButtonStyle}
						/>
					)
				)}

				{showTopInfoArea && (
					<DetailSection
						ref={detailSectionRef}
						browseMode={browseMode}
						api={api}
						getItemServerUrl={getItemServerUrl}
						settings={settings}
						onFocusedItemChange={setFocusedItemForBackdrop}
					/>
				)}

				<div
					ref={contentRowsRef}
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''}`}
				>
					{filteredRows.map((row, index) => {
						if (row.isTileRow) {
							return (
								<SeerrTileRow
									key={row.id}
									rowId={row.id}
									title={row.title}
									items={row.items}
									cardType={row.type}
									onSelectItem={handleSelectSeerrItem}
									onFocus={handleRowFocus}
									onFocusItem={handleFocusItem}
									rowIndex={index}
									onNavigateUp={handleNavigateUp}
									onNavigateDown={handleNavigateDown}
									registerRowRef={registerRowRef}
								/>
							);
						}
						let selectHandler = handleSelectItem;
						if (row.isSeerrRow || row.isOnlineRecoRow) selectHandler = handleSelectSeerrItem;
						else if (row.isExternalRow) selectHandler = handleSelectExternalItem;
						else if (row.isGenreRow) selectHandler = handleSelectGenreItem;
						return (
							<RowComponent
								key={row.id}
								rowId={row.id}
								title={row.title}
								items={row.items}
								serverUrl={serverUrl}
								cardType={row.type}
								onSelectItem={selectHandler}
								onFocus={handleRowFocus}
								onFocusItem={handleFocusItem}
								rowIndex={index}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								showServerBadge={unifiedMode}
								showOverview={settings.homeRowOverlay === 'on'}
								registerRowRef={registerRowRef}
							/>
						);
					})}
					{filteredRows.length === 0 && (
						<div className={css.empty}>{$L('No content found')}</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Browse;
