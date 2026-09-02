import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import {useAuth} from '../../context/AuthContext';
import {createApiForServer} from '../../services/jellyfinApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import MusicBrowse from '../MusicBrowse';
import BackdropLayer from '../Browse/BackdropLayer';
import {getImageUrl, getPrimaryImageId, formatDuration} from '../../utils/helpers';
import useQuickReturnGrid from '../../hooks/useQuickReturnGrid';
import {useSettings} from '../../context/SettingsContext';
import {isMdblistEnabled} from '../../services/mdblistApi';
import MediaRow from '../../components/MediaRow';
import {LIBRARY_GROUP_OPTIONS, groupLibraryItems} from '../../utils/libraryGroupBy';
import {groupPlaylists, playlistCategoryFromItems, playlistNeedsItemCheck} from '../../utils/playlistGrouping';
import {isScrolledAway} from '../../utils/quickReturn';
import RatingsRow from '../../components/RatingsRow';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {useStorage} from '../../hooks/useStorage';
import {buildFilterParams} from '../../utils/libraryFilters';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import useSortSettingsPanels from '../../hooks/useSortSettingsPanels';
import useStartLetter from '../../hooks/useStartLetter';
import {GRID_DIRECTIONS, IMAGE_SIZES, IMAGE_TYPES, LETTERS, capitalize, createGridKeyDown, createToolbarKeyDown, cycleValue, focusOverhang, horizontalCellPad, stopPropagation} from '../../utils/gridChrome';

import css from './Library.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SortPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SettingsPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

// Every sort ends on SortName so items the server ranks equally keep a stable
// order between pages, which a bare key leaves to whatever the database returns.
const SORT_OPTIONS = [
	{key: 'SortName', field: 'SortName', order: 'Ascending', label: $L('Name')},
	{key: 'DateCreated', field: 'DateCreated,SortName', order: 'Descending', label: $L('Date Added')},
	{key: 'DateLastContentAdded', field: 'DateLastContentAdded,SortName', order: 'Descending', label: $L('Date Episode Added'), seriesOnly: true},
	{key: 'PremiereDate', field: 'PremiereDate,SortName', order: 'Descending', label: $L('Premiere Date')},
	{key: 'OfficialRating', field: 'OfficialRating,SortName', order: 'Ascending', label: $L('Rating')},
	{key: 'CommunityRating', field: 'CommunityRating,SortName', order: 'Descending', label: $L('Community Rating')},
	{key: 'CriticRating', field: 'CriticRating,SortName', order: 'Descending', label: $L('Critic rating')},
	{key: 'DatePlayed', field: 'DatePlayed,SortName', order: 'Descending', label: $L('Last Played')},
	{key: 'PlayCount', field: 'PlayCount,SortName', order: 'Descending', label: $L('Play Count')},
	{key: 'Runtime', field: 'Runtime,SortName', order: 'Ascending', label: $L('Runtime')},
	{key: 'Random', field: 'Random', order: 'Ascending', label: $L('Random')}
];

const MUSIC_SORT_OPTIONS = [
	{key: 'SortName', field: 'SortName', order: 'Ascending', label: $L('Name')},
	{key: 'DateCreated', field: 'DateCreated,SortName', order: 'Descending', label: $L('Date Added')},
	{key: 'CommunityRating', field: 'CommunityRating,SortName', order: 'Descending', label: $L('Community Rating')},
	{key: 'DatePlayed', field: 'DatePlayed,SortName', order: 'Descending', label: $L('Last Played')},
	{key: 'AlbumArtist', field: 'AlbumArtist,Album,SortName', order: 'Ascending', label: $L('Album artist')},
	{key: 'Album', field: 'Album,SortName', order: 'Ascending', label: $L('Album')},
	{key: 'Artist', field: 'Artist,Album,SortName', order: 'Ascending', label: $L('Artist')},
	{key: 'IndexNumber', field: 'IndexNumber,SortName', order: 'Ascending', label: $L('Number')},
	{key: 'Random', field: 'Random', order: 'Ascending', label: $L('Random')}
];

const MUSIC_CONTENT_TYPES = [
	{key: 'albums', label: $L('Albums'), itemType: 'MusicAlbum'},
	{key: 'albumArtists', label: $L('Album Artists'), itemType: 'AlbumArtist'},
	{key: 'artists', label: $L('Artists'), itemType: 'MusicArtist'},
	{key: 'playlists', label: $L('Playlists'), itemType: 'Playlist'},
	{key: 'genres', label: $L('Genres'), itemType: 'MusicGenre'}
];

const FOLDER_DETAIL_TYPES = ['Series', 'BoxSet', 'Playlist', 'MusicAlbum', 'MusicArtist'];

// The inset the stylesheet keeps either side of the grid, both sides added up.
const GRID_INSET = 174;
// The least room a row leaves between two cards.
const MIN_ROW_GAP = 6;

const PLAYED_FILTERS = [
	{key: 'all', label: $L('All')},
	{key: 'watched', label: $L('Watched')},
	{key: 'unwatched', label: $L('Unwatched')},
	{key: 'inProgress', label: $L('In Progress')}
];

const FEATURE_FILTERS = [
	{key: 'HasSubtitles', label: $L('Subtitles')},
	{key: 'HasTrailer', label: $L('Trailers')},
	{key: 'HasSpecialFeature', label: $L('Extras')},
	{key: 'HasThemeSong', label: $L('Theme Songs')},
	{key: 'HasThemeVideo', label: $L('Theme Videos')}
];

const QUALITY_FILTERS = [
	{key: 'sd', label: $L('SD')},
	{key: 'hd', label: $L('HD')},
	{key: 'uhd', label: $L('4K'), jellyfinOnly: true},
	{key: 'threeD', label: $L('3D')}
];

// A tag list can run to thousands of entries, and each one costs a focusable
// row, so a facet opens on this many and grows a page at a time.
const FACET_PAGE = 50;

// Sorting is what the panel is opened for most of the time, so it is the one section
// standing open when the panel arrives.
const SORT_SECTION = 'sort';

const VIDEO_SOURCE_FILTERS = [
	{key: 'Dvd', label: $L('DVD')},
	{key: 'BluRay', label: $L('Blu-ray')},
	{key: 'Iso', label: $L('ISO')}
];

const LIKED_FILTERS = [
	{key: 'all', label: $L('All')},
	{key: 'liked', label: $L('Liked')},
	{key: 'disliked', label: $L('Disliked')}
];

const SERIES_FILTERS = [
	{key: 'all', label: $L('All')},
	{key: 'continuing', label: $L('Continuing')},
	{key: 'ended', label: $L('Ended')},
	{key: 'unreleased', label: $L('Unreleased'), jellyfinOnly: true}
];

const SERIES_STATUS_BY_KEY = {continuing: 'Continuing', ended: 'Ended', unreleased: 'Unreleased'};

// The line under a card's title. Detailed sub headings spell out the year, age
// rating, runtime, resolution and score, while the plain setting keeps the year
// on its own.
const cardSubtitle = (item, isFolder, detailed) => {
	if (isFolder) {
		return item.ChildCount != null ? `${item.ChildCount} ${$L('Items')}` : $L('Folder');
	}
	if (item.Type === 'MusicAlbum') {
		if (item.Artists?.length) return item.Artists.join(', ');
		if (item.AlbumArtist) return item.AlbumArtist;
	}
	if (item.Type === 'Playlist') {
		const count = item.ChildCount ?? item.RecursiveItemCount;
		return count != null ? `${count} ${$L('Items')}` : null;
	}
	if (!detailed) return item.ProductionYear ? String(item.ProductionYear) : null;

	const parts = [];
	if (item.ProductionYear) parts.push(String(item.ProductionYear));
	if (item.OfficialRating) parts.push(item.OfficialRating);
	if (item.RunTimeTicks > 0) {
		const dur = formatDuration(item.RunTimeTicks);
		if (dur !== '0m') parts.push(dur);
	}
	const width = item.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Video')?.Width;
	if (width >= 3800) parts.push('• 4K');
	else if (width >= 1900) parts.push('• 1080p');
	else if (width >= 1260) parts.push('• 720p');
	if (item.CommunityRating) parts.push(`★ ${item.CommunityRating.toFixed(1)}`);
	return parts.length ? parts.join('  ') : null;
};

const GROUP_BY_LABELS = {
	none: () => $L('None'),
	genre: () => $L('Genre'),
	parentalRating: () => $L('Parental Rating'),
	decade: () => $L('Decade'),
	studio: () => $L('Studio')
};

const handleToolbarKeyDown = createToolbarKeyDown('library-grid');
const handleToolbarKeyDownGrouped = createToolbarKeyDown('library-group-row-0');
// Up out of the grid goes to the first letter, or to the toolbar when the
// alphabet bar is switched off and that letter is not there to land on.
const handleGridKeyDown = createGridKeyDown(css.grid, 'library-letter-hash');
const handleGridKeyDownNoLetters = createGridKeyDown(css.grid, 'library-toolbar');

const Library = ({library, genreFilter, studioFilter, onSelectItem, onViewPhoto, onHome, backHandlerRef}) => {
	const {api, serverUrl, serverType} = useAuth();
	const {settings, updateSetting} = useSettings();

	const effectiveApi = useMemo(() => {
		if (library?._serverUrl && library?._serverAccessToken) {
			return createApiForServer(library._serverUrl, library._serverAccessToken, library._serverUserId);
		}
		return api;
	}, [library, api]);

	const effectiveServerUrl = useMemo(() => {
		return library?._serverUrl || serverUrl;
	}, [library, serverUrl]);

	const isMusicLibrary = library?.CollectionType?.toLowerCase() === 'music';
	const isSeriesLibrary = library?.CollectionType?.toLowerCase() === 'tvshows';
	const activeSortOptions = isMusicLibrary
		? MUSIC_SORT_OPTIONS
		: SORT_OPTIONS.filter(o => !o.seriesOnly || isSeriesLibrary);
	const isPlaylistLibrary = library?.CollectionType?.toLowerCase() === 'playlists';
	const isSquareDefault = isMusicLibrary || isPlaylistLibrary;

	const [allItems, setAllItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [totalCount, setTotalCount] = useState(0);
	const [favoritesOnly, setFavoritesOnly] = useState(false);
	const [playedFilter, setPlayedFilter] = useState('all');
	const [likedFilter, setLikedFilter] = useState('all');
	const [seriesFilter, setSeriesFilter] = useState('all');
	const [featureFilters, setFeatureFilters] = useState([]);
	const [qualityFilters, setQualityFilters] = useState([]);
	const [videoSourceFilters, setVideoSourceFilters] = useState([]);
	const [genreFilters, setGenreFilters] = useState([]);
	const [ratingFilters, setRatingFilters] = useState([]);
	const [tagFilters, setTagFilters] = useState([]);
	const [yearFilters, setYearFilters] = useState([]);
	const [audioLanguageFilters, setAudioLanguageFilters] = useState([]);
	const [subtitleLanguageFilters, setSubtitleLanguageFilters] = useState([]);
	const [facetValues, setFacetValues] = useState(null);
	const [expandedSection, setExpandedSection] = useState(SORT_SECTION);
	const [facetLimit, setFacetLimit] = useState(FACET_PAGE);
	const [musicContentType, setMusicContentType] = useState('albums');
	const [focusedItem, setFocusedItem] = useState(null);
	const [musicGridView, setMusicGridView] = useState(null);
	const libraryId = library?.Id || (genreFilter ? `genre-${genreFilter}` : studioFilter ? `studio-${studioFilter}` : 'default');
	const [imageSize, setImageSize] = useStorage(`library_imageSize_${libraryId}`, 'medium');
	const [imageType, setImageType] = useStorage(`library_imageType_${libraryId}`, isSquareDefault ? 'square' : 'poster');
	const [gridDirection, setGridDirection] = useStorage(`library_gridDirection_${libraryId}`, 'vertical');
	const [storedGroupBy, setGroupBy] = useStorage(`library_groupBy_${libraryId}`, 'none');
	const [folderView, setFolderView] = useStorage(`library_folderView_${libraryId}`, 'off');
	const [sortKey, setSortKey] = useStorage(`library_sortKey_${libraryId}`, 'SortName');
	const [sortOrder, setSortOrder] = useStorage(`library_sortOrder_${libraryId}`, '');
	const [searchQuery, setSearchQuery] = useState('');
	const [cardText, setCardText] = useStorage(`library_cardText_${libraryId}`, 'on');
	const [letterNav, setLetterNav] = useStorage(`library_letterNav_${libraryId}`, 'on');
	const showCardText = cardText !== 'off';
	const showLetterNav = letterNav !== 'off';
	const detailedSubtitles = settings.useDetailedSubHeadings !== false;
	const isMixedContentLibrary = library != null && (!library.CollectionType || library.CollectionType.toLowerCase() === 'folders');
	const folderViewMode = settings.folderViewMode || 'local';
	const isFolderView =
	isMixedContentLibrary ||
	folderViewMode === 'on' ||
	(folderViewMode !== 'off' && folderView === 'on');
	const [folderStack, setFolderStack] = useState([]);
	const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : library?.Id;
	const currentFolderCollectionType = folderStack.length > 0 ? folderStack[folderStack.length - 1].collectionType?.toLowerCase() : null;
	const isGenreMode = !!genreFilter;
	const isStudioMode = !!studioFilter;
	const isFilterMode = isGenreMode || isStudioMode;

	const loadingMoreRef = useRef(false);
	const apiFetchIndexRef = useRef(0);
	const initialFocusDoneRef = useRef(false);
	const loadItemsRef = useRef(null);
	const fetchGenerationRef = useRef(0);

	const isMusicBrowseHome = isMusicLibrary && !isFilterMode && !isFolderView && !musicGridView;

	const isMovieLibrary = library?.CollectionType?.toLowerCase() === 'movies';
	const canGroup = (isMovieLibrary || isSeriesLibrary) && !isFolderView;
	// A stored value the options no longer carry falls back to the plain grid
	const groupBy = LIBRARY_GROUP_OPTIONS.indexOf(storedGroupBy) !== -1 ? storedGroupBy : 'none';
	const playlistGroupingOn = settings.playlistsGroupByType !== false;
	const playlistGrouped = isPlaylistLibrary && playlistGroupingOn && !isFolderView;
	const groupedActive = (canGroup && groupBy !== 'none') || playlistGrouped;

	// The header search narrows the items already loaded. It reads the sort name
	// the server orders by, so a title held as "Matrix, The" still answers to
	// "matrix".
	const searchedItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return allItems;
		return allItems.filter((item) => (item.SortName || item.Name || '').toLowerCase().indexOf(query) !== -1);
	}, [allItems, searchQuery]);

	const {startLetter, handleLetterSelect, items} = useStartLetter({
		allItems: searchedItems,
		isLoading,
		gridSpotlightId: 'library-grid'
	});

	const itemsRef = useRef(items);
	itemsRef.current = items;

	const [playlistCategories, setPlaylistCategories] = useState({});
	const playlistResolveRef = useRef({});

	// Grouped over what the search left, so it narrows the categories the same
	// way it narrows the plain grid.
	const groups = useMemo(() => {
		if (playlistGrouped) return groupPlaylists(searchedItems, playlistCategories);
		if (groupedActive) return groupLibraryItems(searchedItems, groupBy);
		return null;
	}, [playlistGrouped, playlistCategories, groupedActive, searchedItems, groupBy]);
	const groupCountRef = useRef(0);
	groupCountRef.current = groups ? groups.length : 0;

	const getItemTypeForLibrary = useCallback(() => {
		if (!library) return 'Movie,Series';
		const collectionType = library.CollectionType?.toLowerCase();

		switch (collectionType) {
			case 'movies':
				return 'Movie';
			case 'tvshows':
				return 'Series';
			case 'boxsets':
				return 'BoxSet';
			case 'homevideos':
				return 'Video,Photo,PhotoAlbum';
			case 'photos':
				return 'Photo,PhotoAlbum';
			case 'music':
			{
				const mc = MUSIC_CONTENT_TYPES.find(c => c.key === musicContentType);
				return mc ? mc.itemType : 'MusicAlbum';
			}
			case 'musicvideos':
				return 'MusicVideo';
			case 'playlists':
				return 'Playlist';
			case 'books':
				return 'Book';
			case 'trailers':
				return 'Trailer';
			default:
				return '';
		}
	}, [library, musicContentType]);

	const getExcludeItemTypes = useCallback(() => {
		if (!library) return '';
		const collectionType = library.CollectionType?.toLowerCase();

		if (collectionType === 'movies' || collectionType === 'tvshows') {
			return 'BoxSet';
		}
		return '';
	}, [library]);

	const loadItems = useCallback(async (startIndex = 0, append = false) => {
		if (!library && !genreFilter && !studioFilter) return;

		if (append && loadingMoreRef.current) return;

		if (!append) {
			fetchGenerationRef.current++;
		}
		const generation = fetchGenerationRef.current;

		if (append) {
			loadingMoreRef.current = true;
		}

		try {
			const sortOption = SORT_OPTIONS.find(o => o.key === sortKey) || MUSIC_SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0];
			// Picking the sort already in use flips its direction, so a stored order
			// wins over the one the option was declared with.
			const effectiveOrder = sortOrder || sortOption.order;

			const filters = [];
			if (favoritesOnly) filters.push('IsFavorite');
			if (playedFilter === 'watched') filters.push('IsPlayed');
			if (playedFilter === 'unwatched') filters.push('IsUnplayed');
			if (playedFilter === 'inProgress') filters.push('IsResumable');
			if (likedFilter === 'liked') filters.push('Likes');
			if (likedFilter === 'disliked') filters.push('Dislikes');
			const seriesStatusParam = SERIES_STATUS_BY_KEY[seriesFilter] || null;
			const extraParams = buildFilterParams({
				featureFilters,
				qualityFilters,
				videoSourceFilters,
				// The genre being browsed owns the Genres parameter, so the facet
				// stays out of it rather than replacing the list the user opened.
				genreFilters: genreFilter ? [] : genreFilters,
				ratingFilters,
				tagFilters,
				yearFilters,
				audioLanguageFilters,
				subtitleLanguageFilters
			});

			if (isFolderView) {
				const params = {
					ParentId: currentFolderId,
					StartIndex: startIndex,
					Limit: 150,
					SortBy: `IsFolder,${sortOption.field}`,
					SortOrder: effectiveOrder,
					EnableTotalRecordCount: true,
					Fields: 'PrimaryImageAspectRatio,SortName,Path,ChildCount,MediaSourceCount,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData'
				};
				if (filters.length > 0) params.Filters = filters.join(',');
				Object.assign(params, extraParams);
				const result = await effectiveApi.getItems(params);
				let newItems = result.Items || [];
				if (currentFolderCollectionType === 'movies' || currentFolderCollectionType === 'tvshows') {
					newItems = newItems.filter(i => i.Type !== 'BoxSet');
				}
				if (generation !== fetchGenerationRef.current) return;
				apiFetchIndexRef.current = append ? apiFetchIndexRef.current + newItems.length : newItems.length;
				setAllItems(prev => {
					if (!append) return newItems;
					const combined = [...prev, ...newItems];
					const seen = new Set();
					return combined.filter(i => { if (seen.has(i.Id)) return false; seen.add(i.Id); return true; });
				});
				setTotalCount(result.TotalRecordCount || 0);
			} else {
				const params = {
					StartIndex: startIndex,
					Limit: 150,
					SortBy: sortOption.field,
					SortOrder: effectiveOrder,
					Recursive: true,
					EnableTotalRecordCount: true,
					Fields: 'SortName,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,ProviderIds,UserData,Genres,Studios'
				};

				if (isPlaylistLibrary) params.Fields += ',ChildCount,RecursiveItemCount';

				if (library?.Id) params.ParentId = library.Id;
				if (genreFilter) params.Genres = genreFilter;
				if (studioFilter) params.Studios = studioFilter;

				const itemTypes = getItemTypeForLibrary();
				if (itemTypes) params.IncludeItemTypes = itemTypes;

				const excludeTypes = getExcludeItemTypes();
				if (excludeTypes) params.ExcludeItemTypes = excludeTypes;

				const collectionType = library?.CollectionType?.toLowerCase();
				if (collectionType === 'movies') params.CollapseBoxSetItems = false;

				if (filters.length > 0) params.Filters = filters.join(',');
				if (seriesStatusParam) params.SeriesStatus = seriesStatusParam;
				Object.assign(params, extraParams);

				// Playlists are not children of the music library, so they are fetched without
				// a parent. Artists and album artists are different lists behind different
				// endpoints.
				if (isMusicLibrary && musicContentType === 'playlists') delete params.ParentId;

				const artistParams = {
					ParentId: library?.Id,
					StartIndex: startIndex,
					Limit: 150,
					SortBy: sortOption.field,
					SortOrder: effectiveOrder,
					EnableTotalRecordCount: true,
					Fields: 'PrimaryImageAspectRatio,SortName,ProductionYear,ImageTags,UserData',
					ImageTypeLimit: 1,
					EnableImageTypes: 'Primary,Backdrop,Thumb',
					...(filters.length > 0 ? {Filters: filters.join(',')} : {})
				};

				let result;
				if (isMusicLibrary && musicContentType === 'albumArtists') {
					result = await effectiveApi.getAlbumArtists(artistParams);
				} else if (isMusicLibrary && musicContentType === 'artists') {
					result = await effectiveApi.getArtists(artistParams);
				} else if (isMusicLibrary && musicContentType === 'genres') {
					result = await effectiveApi.getMusicGenres({
						ParentId: library?.Id,
						StartIndex: startIndex,
						Limit: 150,
						SortBy: sortOption.field,
						SortOrder: effectiveOrder,
						EnableTotalRecordCount: true,
						Fields: 'PrimaryImageAspectRatio,ItemCounts'
					});
				} else {
					result = await effectiveApi.getItems(params);
				}

				let newItems = result.Items || [];

				if (excludeTypes && newItems.length > 0) {
					newItems = newItems.filter(item => item.Type !== 'BoxSet');
				}

				apiFetchIndexRef.current = append ? apiFetchIndexRef.current + (result.Items?.length || 0) : (result.Items?.length || 0);
				if (generation !== fetchGenerationRef.current) return;
				setAllItems(prev => {
					if (!append) return newItems;
					const combined = [...prev, ...newItems];
					const seen = new Set();
					return combined.filter(i => { if (seen.has(i.Id)) return false; seen.add(i.Id); return true; });
				});
				setTotalCount(result.TotalRecordCount || 0);
			}
		} catch (err) { console.error('[Library] loadItems error:', err); } finally {
			setIsLoading(false);
			loadingMoreRef.current = false;
		}
	}, [isPlaylistLibrary, effectiveApi, library, genreFilter, studioFilter, sortKey, sortOrder, favoritesOnly, playedFilter, likedFilter, seriesFilter, featureFilters, qualityFilters, videoSourceFilters, genreFilters, ratingFilters, tagFilters, yearFilters, audioLanguageFilters, subtitleLanguageFilters, isFolderView, currentFolderId, currentFolderCollectionType, isMusicLibrary, musicContentType, getItemTypeForLibrary, getExcludeItemTypes]);

	loadItemsRef.current = loadItems;

	// Grouping covers the whole library, so the rest of it loads in the
	// background the way scrolling to the end would have.
	useEffect(() => {
		if (!groupedActive || isLoading || loadingMoreRef.current) return;
		if (apiFetchIndexRef.current < totalCount) {
			loadItemsRef.current?.(apiFetchIndexRef.current, true);
		}
	}, [groupedActive, isLoading, totalCount, allItems.length]);

	// The summary cant tell music from audiobooks, so those playlists are read
	// once and remembered. A small batch at a time keeps the requests gentle.
	useEffect(() => {
		if (!playlistGrouped || isLoading) return undefined;
		const pending = allItems.filter((item) => playlistNeedsItemCheck(item) && !playlistResolveRef.current[item.Id]);
		if (!pending.length) return undefined;
		let cancelled = false;
		const run = async () => {
			for (let i = 0; i < pending.length && !cancelled; i += 3) {
				const chunk = pending.slice(i, i + 3);
				const resolved = await Promise.all(chunk.map(async (item) => {
					playlistResolveRef.current[item.Id] = true;
					try {
						const res = await effectiveApi.getPlaylistItems(item.Id);
						return [item.Id, playlistCategoryFromItems(res?.Items)];
					} catch {
						return [item.Id, 'Mixed'];
					}
				}));
				if (cancelled) return;
				setPlaylistCategories((prev) => {
					const next = {...prev};
					for (let j = 0; j < resolved.length; j++) next[resolved[j][0]] = resolved[j][1];
					return next;
				});
			}
		};
		run();
		return () => {
			cancelled = true;
		};
	}, [playlistGrouped, isLoading, allItems, effectiveApi]);

	const groupRowsRef = useRef(null);
	const groupRowRefs = useRef(new Map());
	const registerGroupRowRef = useCallback((rowIndex, el) => {
		if (el) groupRowRefs.current.set(rowIndex, el);
		else groupRowRefs.current.delete(rowIndex);
	}, []);

	const scrollToGroupRow = useCallback((rowIndex) => {
		const row = groupRowRefs.current.get(rowIndex);
		const container = groupRowsRef.current;
		if (row && container) container.scrollTop = Math.max(0, row.offsetTop - 10);
		Spotlight.focus(`library-group-row-${rowIndex}`);
	}, []);

	const handleGroupNavigateUp = useCallback((rowIndex) => {
		if (rowIndex === 0) {
			Spotlight.focus('library-toolbar');
			return;
		}
		scrollToGroupRow(rowIndex - 1);
	}, [scrollToGroupRow]);

	const handleGroupNavigateDown = useCallback((rowIndex) => {
		if (rowIndex >= groupCountRef.current - 1) return;
		scrollToGroupRow(rowIndex + 1);
	}, [scrollToGroupRow]);

	useEffect(() => {
		if (isMusicBrowseHome) {
			setIsLoading(false);
			return;
		}
		if (library || genreFilter || studioFilter) {
			setIsLoading(true);
			setAllItems([]);
			setTotalCount(0);
			loadingMoreRef.current = false;
			apiFetchIndexRef.current = 0;
			initialFocusDoneRef.current = false;
			loadItemsRef.current(0, false);
		}
	}, [library, sortKey, sortOrder, favoritesOnly, playedFilter, likedFilter, seriesFilter, featureFilters, qualityFilters, videoSourceFilters, genreFilters, ratingFilters, tagFilters, yearFilters, audioLanguageFilters, subtitleLanguageFilters, musicContentType, isFolderView, currentFolderId, genreFilter, studioFilter, isMusicBrowseHome]);

	// The values the library actually holds, read once per library so opening
	// the filter panel does not wait on the network.
	useEffect(() => {
		let cancelled = false;
		setFacetValues(null);
		if (!effectiveApi?.getQueryFilters || isMusicBrowseHome) return undefined;
		effectiveApi.getQueryFilters(library?.Id, getItemTypeForLibrary())
			.then(values => {
				if (!cancelled) setFacetValues(values);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [effectiveApi, library, isMusicBrowseHome, getItemTypeForLibrary]);

	// Favorites is the albums grid with the filter on rather than a type of its own.
	const handleOpenMusicGrid = useCallback((target) => {
		if (!target) return;
		setMusicGridView(target);
		setMusicContentType(target === 'favorites' ? 'albums' : target);
		setFavoritesOnly(target === 'favorites');
		setAllItems([]);
		apiFetchIndexRef.current = 0;
		initialFocusDoneRef.current = false;
	}, []);

	useEffect(() => {
		if (items.length > 0 && !isLoading && !initialFocusDoneRef.current) {
			setTimeout(() => {
				Spotlight.focus(groupedActive ? 'library-group-row-0' : 'library-grid');
				initialFocusDoneRef.current = true;
			}, 100);
		}
	}, [items.length, isLoading, groupedActive]);

	const handleItemClick = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const item = itemsRef.current[parseInt(itemIndex, 10)];
		if (item) {
			if (isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type)) {
				setFolderStack(prev => [...prev, {id: item.Id, name: item.Name, collectionType: item.CollectionType}]);
				return;
			}
			if (item.Type === 'Photo' && onViewPhoto) {
				onViewPhoto(item, itemsRef.current);
			} else {
				onSelectItem?.(item);
			}
		}
	}, [isFolderView, onSelectItem, onViewPhoto]);

	const {getScrollTo: getGridScrollTo, quickReturn} = useQuickReturnGrid('library-grid');

	const handleScrollStop = useCallback(() => {
		if (apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
			loadItems(apiFetchIndexRef.current, true);
		}
	}, [totalCount, isLoading, loadItems]);

	const handleSearchChange = useCallback((ev) => setSearchQuery(ev.target.value), []);

	// Down out of the search lands on the toolbar rather than skipping over it
	// into the grid.
	const handleSearchKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.DOWN) return;
		ev.preventDefault();
		ev.stopPropagation();
		Spotlight.focus('library-home-btn');
	}, []);

	// Matching only sees the pages already fetched, so a query that reaches past
	// them pulls the rest in a page at a time. Typing a word would restart that
	// walk on every letter, so it waits for a pause first.
	useEffect(() => {
		if (!searchQuery.trim() || apiFetchIndexRef.current >= totalCount || isLoading) return undefined;
		const id = setTimeout(() => {
			if (!loadingMoreRef.current) loadItems(apiFetchIndexRef.current, true);
		}, 300);
		return () => clearTimeout(id);
	}, [searchQuery, allItems.length, totalCount, isLoading, loadItems]);

	// Back past the panels: leave the search box, drop out of a music grid, then
	// climb the folder stack. The global back handling runs in a capture
	// listener, so the search answers here rather than in a key handler of its
	// own, which would never see the press.
	const handleBackBeyondPanels = useCallback(() => {
		const active = document.activeElement;
		if (active && active.tagName === 'INPUT') {
			active.blur();
			Spotlight.focus('library-search');
			return true;
		}
		if (musicGridView) {
			setMusicGridView(null);
			setFavoritesOnly(false);
			return true;
		}
		if (isFolderView && folderStack.length > 0) {
			setFolderStack(prev => prev.slice(0, -1));
			return true;
		}
		if (groupedActive) {
			if (isScrolledAway(groupRowsRef.current)) {
				scrollToGroupRow(0);
				return true;
			}
			return false;
		}
		return quickReturn();
	}, [musicGridView, isFolderView, folderStack, quickReturn, groupedActive, scrollToGroupRow]);

	// There is one back slot, and the music browse screen claims it while it's up. Nothing
	// here would be true there anyway, since it only shows with no grid, panel or folder stack.
	const {
		showSortPanel, showSettingsPanel,
		handleToggleSortPanel, handleCloseSortPanel,
		handleToggleSettingsPanel, handleCloseSettingsPanel
	} = useSortSettingsPanels({
		backHandlerRef,
		sortFocusId: 'sort-option-0',
		settingsFocusId: 'settings-image-size',
		onBack: handleBackBeyondPanels,
		enabled: !isMusicBrowseHome
	});

	// Choosing the sort already in use turns it around rather than doing nothing.
	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.sortKey;
		if (key) {
			if (key === sortKey) {
				const current = sortOrder || activeSortOptions.find(o => o.key === key)?.order || 'Ascending';
				setSortOrder(current === 'Ascending' ? 'Descending' : 'Ascending');
			} else {
				setSortKey(key);
				setSortOrder('');
			}
			handleCloseSortPanel();
			setTimeout(() => Spotlight.focus('library-grid'), 100);
		}
	}, [setSortKey, handleCloseSortPanel, sortKey, sortOrder, setSortOrder, activeSortOptions]);

	const handleToggleFavorites = useCallback(() => {
		setFavoritesOnly(prev => !prev);
		handleCloseSortPanel();
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, [handleCloseSortPanel]);

	const handlePlayedFilterSelect = useCallback((ev) => {
		setPlayedFilter(ev.currentTarget.dataset.playedKey);
		handleCloseSortPanel();
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, [handleCloseSortPanel]);

	const handleLikedFilterSelect = useCallback((ev) => {
		setLikedFilter(ev.currentTarget.dataset.likedKey);
		handleCloseSortPanel();
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, [handleCloseSortPanel]);

	const handleSeriesFilterSelect = useCallback((ev) => {
		setSeriesFilter(ev.currentTarget.dataset.seriesKey);
		handleCloseSortPanel();
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, [handleCloseSortPanel]);

	// The multi choice filters leave the panel open, since picking one of them
	// is rarely the only thing the user came to do.
	const toggleFilterValue = useCallback((setter, value) => {
		setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
	}, []);

	const handleFeatureToggle = useCallback((ev) => {
		toggleFilterValue(setFeatureFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleQualityToggle = useCallback((ev) => {
		toggleFilterValue(setQualityFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleVideoSourceToggle = useCallback((ev) => {
		toggleFilterValue(setVideoSourceFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleGenreToggle = useCallback((ev) => {
		toggleFilterValue(setGenreFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleRatingToggle = useCallback((ev) => {
		toggleFilterValue(setRatingFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleTagToggle = useCallback((ev) => {
		toggleFilterValue(setTagFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleYearToggle = useCallback((ev) => {
		toggleFilterValue(setYearFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleAudioLanguageToggle = useCallback((ev) => {
		toggleFilterValue(setAudioLanguageFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	const handleSubtitleLanguageToggle = useCallback((ev) => {
		toggleFilterValue(setSubtitleLanguageFilters, ev.currentTarget.dataset.filterValue);
	}, [toggleFilterValue]);

	// A library can hold hundreds of tags or years, so every section collapses to its
	// heading and only the one opened takes up the panel.
	const handleSectionExpand = useCallback((ev) => {
		const key = ev.currentTarget.dataset.sectionKey;
		setFacetLimit(FACET_PAGE);
		setExpandedSection(prev => (prev === key ? null : key));
	}, []);

	const handleFacetShowMore = useCallback(() => {
		setFacetLimit(prev => prev + FACET_PAGE);
	}, []);

	const handleClearFilters = useCallback(() => {
		setFavoritesOnly(false);
		setPlayedFilter('all');
		setLikedFilter('all');
		setSeriesFilter('all');
		setFeatureFilters([]);
		setQualityFilters([]);
		setVideoSourceFilters([]);
		setGenreFilters([]);
		setRatingFilters([]);
		setTagFilters([]);
		setYearFilters([]);
		setAudioLanguageFilters([]);
		setSubtitleLanguageFilters([]);
		handleCloseSortPanel();
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, [handleCloseSortPanel]);

	// A facet left open on a raised limit would rebuild all of those rows the next
	// time the panel comes up, so putting the panel away starts it over.
	useEffect(() => {
		if (showSortPanel) return;
		setExpandedSection(SORT_SECTION);
		setFacetLimit(FACET_PAGE);
	}, [showSortPanel]);

	const handleCycleImageSize = useCallback(() => {
		setImageSize(cycleValue(IMAGE_SIZES, imageSize));
	}, [imageSize, setImageSize]);

	const handleCycleImageType = useCallback(() => {
		setImageType(cycleValue(IMAGE_TYPES, imageType));
	}, [imageType, setImageType]);

	const handleCycleGridDirection = useCallback(() => {
		setGridDirection(cycleValue(GRID_DIRECTIONS, gridDirection));
	}, [gridDirection, setGridDirection]);

	const handleCycleGroupBy = useCallback(() => {
		setGroupBy(cycleValue(LIBRARY_GROUP_OPTIONS, groupBy));
	}, [groupBy, setGroupBy]);

	const handleTogglePlaylistGrouping = useCallback(() => {
		updateSetting('playlistsGroupByType', !playlistGroupingOn);
	}, [playlistGroupingOn, updateSetting]);

	const handleToggleFolderView = useCallback(() => {
		if (folderViewMode !== 'local') return;
		setFolderView(isFolderView ? 'off' : 'on');
		setFolderStack([]);
	}, [folderViewMode, isFolderView, setFolderView]);

	const handleToggleCardText = useCallback(() => {
		setCardText(showCardText ? 'off' : 'on');
	}, [showCardText, setCardText]);

	const handleToggleLetterNav = useCallback(() => {
		setLetterNav(showLetterNav ? 'off' : 'on');
	}, [showLetterNav, setLetterNav]);

	const handleFolderBreadcrumb = useCallback((ev) => {
		const depth = parseInt(ev.currentTarget?.dataset?.depth, 10);
		if (!isNaN(depth)) setFolderStack(prev => prev.slice(0, depth));
	}, []);

	const handleMusicContentSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.contentKey;
		if (key) {
			setMusicContentType(key);
			handleCloseSortPanel();
			setTimeout(() => Spotlight.focus('library-grid'), 100);
		}
	}, [handleCloseSortPanel]);

	const effectiveImageType = isSquareDefault ? 'square' : imageType;
	const isWideImage = effectiveImageType === 'thumbnail';
	const isSquareImage = effectiveImageType === 'square';
	// A square and a poster share an image height and differ only in width, while
	// a thumbnail is sized off its own shorter height.
	const posterHeight = isWideImage
		? ({small: 128, medium: 160, large: 191, extraLarge: 223}[imageSize] || 160)
		: ({small: 174, medium: 217, large: 261, extraLarge: 304}[imageSize] || 217);

	// A subtitle anywhere in the library makes room for a second line on every
	// card, so the rows stay level whether or not a given item has one.
	const hasCardSubtitles = useMemo(() => (
		showCardText && items.some((item) => (
			cardSubtitle(item, isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type), detailedSubtitles)
		))
	), [items, showCardText, isFolderView, detailedSubtitles]);

	const textHeight = showCardText ? (hasCardSubtitles ? 61 : 35) : 0;
	// A square card is as wide as it is tall.
	const cardWidth = isSquareImage
		? posterHeight
		: isWideImage
			? ({small: 227, medium: 284, large: 340, extraLarge: 397}[imageSize] || 284)
			: ({small: 116, medium: 145, large: 174, extraLarge: 203}[imageSize] || 145);
	const cardHeight = posterHeight + textHeight;

	const cellPadX = horizontalCellPad(cardWidth, window.innerWidth - GRID_INSET);
	const cellPadY = Math.max(MIN_ROW_GAP, focusOverhang(cardHeight));
	const cellPadding = `${cellPadY}px ${cellPadX}px`;
	const gridItemSize = {minWidth: cardWidth + cellPadX * 2, minHeight: cardHeight + cellPadY * 2};

	const renderItem = useCallback(({index, ...rest}) => {
		const item = itemsRef.current[index];
		const isNearEnd = index >= items.length - 50;
		if (isNearEnd && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
			loadItems(apiFetchIndexRef.current, true);
		}

		if (!item) {
			return (
				<div {...rest} className={css.itemCard} style={{padding: cellPadding}}>
					<div className={css.posterPlaceholder} style={{height: posterHeight}}>
						<div className={css.loadingPlaceholder} />
					</div>
				</div>
			);
		}

		const isFolder = isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type);
		const subtitle = showCardText ? cardSubtitle(item, isFolder, detailedSubtitles) : null;
		let imageId, imgApiType;
		if (effectiveImageType === 'thumbnail') {
			if (item.ImageTags?.Thumb) {
				imageId = item.Id;
				imgApiType = 'Thumb';
			} else {
				imageId = getPrimaryImageId(item);
				imgApiType = 'Primary';
			}
		} else {
			imageId = getPrimaryImageId(item);
			imgApiType = 'Primary';
		}
		const imageUrl = imageId ? getImageUrl(effectiveServerUrl, imageId, imgApiType, {maxHeight: 300, quality: 70}) : null;

		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				style={{padding: cellPadding}}
				onClick={handleItemClick}
				// eslint-disable-next-line react/jsx-no-bind
				onFocus={() => setFocusedItem(item)}
				data-index={index}
			>
				<div className={css.itemCardInner}>
					{imageUrl ? (
						<img
							className={css.poster}
							style={{height: posterHeight}}
							src={imageUrl}
							alt={item.Name}
							loading="lazy"
						/>
					) : (
						<div className={css.posterPlaceholder} style={{height: posterHeight}}>
							{isFolder ? (
								<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
									<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
								</svg>
							) : (
								<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
									<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
								</svg>
							)}
						</div>
					)}
					{item.UserData?.IsFavorite && (
						<div className={css.favoriteBadge}>
							<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
						</div>
					)}
					{item.UserData?.Played && (
						<div className={css.watchedBadge}>
							<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
						</div>
					)}
					{showCardText && (
						<div className={css.cardText}>
							<div className={css.cardTitle}>{item.Name}</div>
							{subtitle && <div className={css.cardSubtitle}>{subtitle}</div>}
						</div>
					)}
				</div>
			</SpottableDiv>
		);
	}, [effectiveServerUrl, handleItemClick, items.length, totalCount, isLoading, loadItems, effectiveImageType, posterHeight, cellPadding, isFolderView, showCardText, detailedSubtitles]);

	const currentSort = activeSortOptions.find(o => o.key === sortKey);
	const sortLabel = currentSort ? currentSort.label : $L('Name');
	const filterParts = [];
	if (favoritesOnly) filterParts.push($L('Favorites'));
	if (playedFilter === 'watched') filterParts.push($L('Watched'));
	if (playedFilter === 'unwatched') filterParts.push($L('Unwatched'));
	if (playedFilter === 'inProgress') filterParts.push($L('In Progress'));
	if (likedFilter === 'liked') filterParts.push($L('Liked'));
	if (likedFilter === 'disliked') filterParts.push($L('Disliked'));
	if (seriesFilter === 'unreleased') filterParts.push($L('Unreleased'));
	FEATURE_FILTERS.forEach(option => {
		if (featureFilters.includes(option.key)) filterParts.push(option.label);
	});
	QUALITY_FILTERS.forEach(option => {
		if (qualityFilters.includes(option.key)) filterParts.push(option.label);
	});
	VIDEO_SOURCE_FILTERS.forEach(option => {
		if (videoSourceFilters.includes(option.key)) filterParts.push(option.label);
	});
	if (!genreFilter) filterParts.push(...genreFilters);
	filterParts.push(...ratingFilters, ...tagFilters, ...yearFilters);

	// What a closed section says it is holding. One choice reads by name, several read
	// as a count, and a group left alone says nothing.
	const chosenLabel = (options, value) => {
		const picked = options.find(o => o.key === value);
		return picked && value !== 'all' ? $L(picked.label) : null;
	};
	const countLabel = (count) => (count > 0 ? String(count) : null);

	// Every group in the panel is one of these. The body is a function so the closed
	// ones cost nothing to keep on the list, which matters for the facets that run to
	// hundreds of rows.
	const renderSection = (key, title, summary, renderBody) => {
		const expanded = expandedSection === key;
		return (
			<div className={css.filterSection}>
				<SpottableButton
					className={`${css.sectionHeader} ${expanded ? css.sectionHeaderOpen : ''}`}
					onClick={handleSectionExpand}
					data-section-key={key}
					spotlightId={`filter-section-${key}`}
				>
					<svg viewBox="0 -960 960 960" className={`${css.sectionChevron} ${expanded ? css.sectionChevronOpen : ''}`}>
						<path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
					</svg>
					<span className={css.sectionHeaderLabel}>{title}</span>
					{summary && <span className={css.sectionSummary}>{summary}</span>}
				</SpottableButton>
				{expanded && renderBody()}
			</div>
		);
	};

	// One collapsible group per facet, left out entirely when the library holds
	// no values for it. Languages carry a display name beside the code the
	// query takes, everything else is its own label.
	const renderFacetSection = (facetKey, title, values, selected, onToggle) => {
		if (!values || values.length === 0) return null;
		const options = values.map(v => (typeof v === 'string' ? {name: v, value: v} : v));
		// Tags and genres are whatever the library owner typed, and a spotlight
		// id ends up in a CSS selector, so the position identifies the row.
		const chosen = options.filter(o => selected.includes(o.value)).length;
		// Anything already picked stays on screen however far down the list it
		// sits, otherwise a page limit could hide the only way to clear it.
		let room = facetLimit;
		const visible = options.filter(option => {
			if (selected.includes(option.value)) return true;
			if (room <= 0) return false;
			room -= 1;
			return true;
		});
		const remaining = options.length - visible.length;
		return renderSection(facetKey, title, countLabel(chosen), () => (
			<>
				{visible.map((option, index) => (
					<SpottableButton
						key={option.value}
						className={`${css.sortOption} ${selected.includes(option.value) ? css.sortOptionActive : ''}`}
						onClick={onToggle}
						data-filter-value={option.value}
						spotlightId={`filter-${facetKey}-${index}`}
					>
						<span className={css.checkboxSquare}>
							{selected.includes(option.value) && (
								<svg viewBox="0 0 24 24" className={css.checkIcon}>
									<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
								</svg>
							)}
						</span>
						<span className={css.sortOptionLabel}>{option.name}</span>
					</SpottableButton>
				))}
				{remaining > 0 && (
					<SpottableButton
						className={css.sortOption}
						onClick={handleFacetShowMore}
						spotlightId={`filter-${facetKey}-more`}
					>
						<span className={css.sortOptionLabel}>
							{$L('Show more ({count} left)').replace('{count}', remaining)}
						</span>
					</SpottableButton>
				)}
			</>
		));
	};

	const filterLabel = filterParts.length > 0 ? filterParts.join(' & ') : $L('All items');
	const hasActiveFilters = filterParts.length > 0 ||
		audioLanguageFilters.length > 0 ||
		subtitleLanguageFilters.length > 0;
	const showVideoFilters = !isMusicLibrary && !isPlaylistLibrary;
	// Emby's items query has no 4K flag and its series status holds only
	// continuing and ended, so those options stay out of the panel there.
	const supported = (options) => options.filter(o => !o.jellyfinOnly || serverType !== 'emby');
	const folderName = folderStack.length > 0 ? folderStack[folderStack.length - 1].name : library?.Name;
	const displayName = genreFilter || studioFilter || library?.Name || '';
	const statusText = isFolderView
		? $L("Browsing folders in '{folderName}' sorted by {sortLabel}").replace('{folderName}', folderName).replace('{sortLabel}', sortLabel)
		: genreFilter
			? (library
				? $L("Showing {filterLabel} from '{genreFilter}' in '{libraryName}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{genreFilter}', genreFilter).replace('{libraryName}', library.Name).replace('{sortLabel}', sortLabel)
				: $L("Showing {filterLabel} from '{genreFilter}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{genreFilter}', genreFilter).replace('{sortLabel}', sortLabel))
			: studioFilter
				? $L("Showing {filterLabel} from '{genreFilter}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{genreFilter}', studioFilter).replace('{sortLabel}', sortLabel)
				: $L("Showing {filterLabel} from '{libraryName}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{libraryName}', library?.Name).replace('{sortLabel}', sortLabel);

	const backdropsEnabled = settings?.showHomeBackdrop !== false && !settings?.hideBackdropsInLibraries;

	const backdropId = focusedItem?.BackdropImageTags?.length
		? focusedItem.Id
		: (focusedItem?.ParentBackdropImageTags?.length ? focusedItem.ParentBackdropItemId : null);
	const backdropTag = focusedItem?.BackdropImageTags?.length
		? focusedItem.BackdropImageTags[0]
		: (focusedItem?.ParentBackdropImageTags?.length ? focusedItem.ParentBackdropImageTags[0] : null);

	const backdropUrl = useMemo(() => {
		if (!backdropsEnabled || !backdropId) return '';
		return getImageUrl(effectiveServerUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 80, tag: backdropTag});
	}, [backdropsEnabled, backdropId, backdropTag, effectiveServerUrl]);

	if (!library && !genreFilter && !studioFilter) {
		return (
			<div className={css.page}>
				<div className={css.empty}>{$L('No library selected')}</div>
			</div>
		);
	}

	if (isMusicBrowseHome) {
		return (
			<MusicBrowse
				library={library}
				api={effectiveApi}
				serverUrl={effectiveServerUrl}
				onSelectItem={onSelectItem}
				onOpenGrid={handleOpenMusicGrid}
				onHome={onHome}
				backHandlerRef={backHandlerRef}
			/>
		);
	}

	// Year and runtime read as plain text, while the series status and the age
	// rating are pills so they stand apart from them.
	const focusedMeta = [];
	if (focusedItem) {
		if (focusedItem.ProductionYear) focusedMeta.push({kind: 'text', text: String(focusedItem.ProductionYear)});
		if (focusedItem.RunTimeTicks > 0 && focusedItem.Type !== 'Series') {
			const dur = formatDuration(focusedItem.RunTimeTicks);
			if (dur !== '0m') focusedMeta.push({kind: 'text', text: dur});
		}
		if (focusedItem.Type === 'Series' && focusedItem.Status) {
			const continuing = focusedItem.Status === 'Continuing';
			focusedMeta.push({kind: 'status', text: continuing ? $L('Continuing') : $L('Ended'), ended: !continuing});
		}
		if (focusedItem.OfficialRating && focusedItem.Type !== 'Playlist') {
			focusedMeta.push({kind: 'rating', text: focusedItem.OfficialRating});
		}
	}

	return (
		<div className={css.page}>
			{backdropsEnabled && (
				<BackdropLayer targetUrl={backdropUrl} blurAmount={settings?.backdropBlurHome} />
			)}
			<div className={css.content}>
				<div className={css.header}>
					<div className={css.headerSide} />
					<div className={css.headerTitle}>
						{isFolderView && folderStack.length > 0 ? (
							<div className={css.breadcrumb}>
								<SpottableButton
									className={css.breadcrumbItem}
									onClick={handleFolderBreadcrumb}
									data-depth={0}
									spotlightId="breadcrumb-root"
								>
									{library.Name}
								</SpottableButton>
								{folderStack.map((f, i) => (
									<span key={f.id} className={css.breadcrumbSegment}>
										<span className={css.breadcrumbSep}>›</span>
										{i < folderStack.length - 1 ? (
											<SpottableButton
												className={css.breadcrumbItem}
												onClick={handleFolderBreadcrumb}
												data-depth={i + 1}
											>
												{f.name}
											</SpottableButton>
										) : (
											<span className={css.breadcrumbCurrent}>{f.name}</span>
										)}
									</span>
								))}
								<div className={css.itemCount}>{totalCount} {$L('Items')}</div>
							</div>
						) : (
							<>
								<div className={css.libraryTitle}>{displayName}</div>
								<div className={css.itemCount}>{totalCount} {$L('Items')}</div>
							</>
						)}
					</div>
					<div className={css.headerSide}>
						<div className={css.searchWrap}>
							<svg className={css.searchIcon} viewBox="0 -960 960 960">
								<path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
							</svg>
							<SpottableInput
								type="text"
								className={css.searchField}
								placeholder={$L('Search this library...')}
								value={searchQuery}
								onChange={handleSearchChange}
								onKeyDown={handleSearchKeyDown}
								spotlightId="library-search"
								autoComplete="off"
							/>
						</div>
					</div>
				</div>

				{settings?.showMediaDetailsOnLibraryPage !== false && (
					<div className={css.focusedInfo}>
						{focusedItem && (
							<>
								<div className={css.focusedName}>{focusedItem.Name}</div>
								<div className={css.focusedMeta}>
									{focusedMeta.map((piece, i) => (
										<span key={i} className={piece.kind === 'text' ? css.metaItem : `${css.metaPill} ${piece.kind === 'rating' ? css.metaPillRating : piece.ended ? css.metaPillEnded : css.metaPillLive}`}>
											{piece.text}
										</span>
									))}
								</div>
								<RatingsRow item={focusedItem} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />
							</>
						)}
					</div>
				)}

				<ToolbarContainer className={css.toolbar} spotlightId="library-toolbar" onKeyDown={groupedActive ? handleToolbarKeyDownGrouped : handleToolbarKeyDown}>
					<SpottableButton
						className={css.toolbarBtn}
						onClick={onHome}
						spotlightId="library-home-btn"
					>
						<svg className={css.toolbarIcon} viewBox="0 0 24 24">
							<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
						</svg>
					</SpottableButton>

					<SpottableButton
						className={css.toolbarBtn}
						onClick={handleToggleSortPanel}
						spotlightId="library-sort-btn"
					>
						<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
							<path d="m80-280 162-400h63l161 400h-63l-38-99H181l-38 99H80Zm121-151h144l-70-185h-4l-70 185Zm347 151v-62l233-286H566v-52h272v63L607-332h233v52H548ZM384-784l96-96 96 96H384Zm96 704-96-96h192l-96 96Z" />
						</svg>
					</SpottableButton>

					<SpottableButton
						className={css.toolbarBtn}
						onClick={handleToggleSettingsPanel}
						spotlightId="library-settings-btn"
					>
						<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
							<path d="m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z" />
						</svg>
					</SpottableButton>

					{showLetterNav && !groupedActive && (
						<div className={css.letterNav}>
							{LETTERS.map((letter, index) => (
								<SpottableButton
									key={letter}
									className={`${css.letterButton} ${startLetter === letter ? css.active : ''}`}
									onClick={handleLetterSelect}
									data-letter={letter}
									spotlightId={index === 0 ? 'library-letter-hash' : undefined}
								>
									{letter}
								</SpottableButton>
							))}
						</div>
					)}
				</ToolbarContainer>

				<GridContainer className={css.gridContainer}>
					{isLoading && items.length === 0 ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : items.length === 0 ? (
						<div className={css.empty}>{$L('No items found')}</div>
					) : groupedActive ? (
						<div className={css.groupRows} ref={groupRowsRef}>
							{groups.map((group, index) => (
								<MediaRow
									key={group.name}
									rowId={`library-group-${group.name}`}
									spotlightId={`library-group-row-${index}`}
									title={group.name}
									items={group.items}
									serverUrl={serverUrl}
									cardType={playlistGrouped ? 'square' : 'portrait'}
									rowIndex={index}
									onSelectItem={onSelectItem}
									onFocusItem={setFocusedItem}
									onNavigateUp={handleGroupNavigateUp}
									onNavigateDown={handleGroupNavigateDown}
									registerRowRef={registerGroupRowRef}
								/>
							))}
						</div>
					) : (
						<div className={css.gridWrapper}>
							<VirtualGridList
								className={css.grid}
								cbScrollTo={getGridScrollTo}
								dataSize={items.length}
								itemRenderer={renderItem}
								itemSize={gridItemSize}
								direction={gridDirection}
								horizontalScrollbar="hidden"
								verticalScrollbar="hidden"
								spacing={0}
								onScrollStop={handleScrollStop}
								onKeyDown={showLetterNav ? handleGridKeyDown : handleGridKeyDownNoLetters}
								spotlightId="library-grid"
							/>
						</div>
					)}
				</GridContainer>

				<div className={css.statusBar}>
					<div className={css.statusText}>{statusText}</div>
					<div className={css.statusCount}>{items.length} | {totalCount}</div>
				</div>
			</div>

			{showSortPanel && (
				<div className={css.sortPanelOverlay} onClick={handleCloseSortPanel}>
					<SortPanelContainer
						className={css.sortPanel}
						onFocus={keepFocusInView}
						spotlightId="sort-panel"
						onClick={stopPropagation}
					>
						<h2 className={css.sortPanelTitle}>{$L('Sort & Filter')}</h2>

						{renderSection(SORT_SECTION, $L('Sort By'), sortLabel, () => (
							activeSortOptions.map((option, index) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${sortKey === option.key ? css.sortOptionActive : ''}`}
									onClick={handleSortSelect}
									data-sort-key={option.key}
									spotlightId={`sort-option-${index}`}
								>
									<span className={css.radioCircle}>
										{sortKey === option.key && <span className={css.radioFill} />}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
									{sortKey === option.key && (
										<svg viewBox="0 -960 960 960" className={css.sortArrow}>
											{(sortOrder || option.order) === 'Ascending'
												? <path d="M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z" />
												: <path d="M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z" />}
										</svg>
									)}
								</SpottableButton>
							))
						))}

						{isMusicLibrary && renderSection('music', $L('Show'), chosenLabel(MUSIC_CONTENT_TYPES, musicContentType), () => (
							MUSIC_CONTENT_TYPES.map((ct) => (
								<SpottableButton
									key={ct.key}
									className={`${css.sortOption} ${musicContentType === ct.key ? css.sortOptionActive : ''}`}
									onClick={handleMusicContentSelect}
									data-content-key={ct.key}
									spotlightId={`music-content-${ct.key}`}
								>
									<span className={css.radioCircle}>
										{musicContentType === ct.key && <span className={css.radioFill} />}
									</span>
									<span className={css.sortOptionLabel}>{$L(ct.label)}</span>
								</SpottableButton>
							))
						))}

						{renderSection('favorites', $L('Filters'), favoritesOnly ? $L('Favorites') : null, () => (
							<SpottableButton
								className={`${css.sortOption} ${favoritesOnly ? css.sortOptionActive : ''}`}
								onClick={handleToggleFavorites}
								spotlightId="filter-favorites"
							>
								<span className={css.checkboxSquare}>
									{favoritesOnly && (
										<svg viewBox="0 0 24 24" className={css.checkIcon}>
											<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
										</svg>
									)}
								</span>
								<span className={css.sortOptionLabel}>{$L('Favorites Only')}</span>
							</SpottableButton>
						))}

						{renderSection('played', $L('Played Status'), chosenLabel(PLAYED_FILTERS, playedFilter), () => (
							PLAYED_FILTERS.map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${playedFilter === option.key ? css.sortOptionActive : ''}`}
									onClick={handlePlayedFilterSelect}
									data-played-key={option.key}
									spotlightId={`filter-played-${option.key}`}
								>
									<span className={css.radioCircle}>
										{playedFilter === option.key && <span className={css.radioFill} />}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{renderSection('liked', $L('My Rating'), chosenLabel(LIKED_FILTERS, likedFilter), () => (
							LIKED_FILTERS.map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${likedFilter === option.key ? css.sortOptionActive : ''}`}
									onClick={handleLikedFilterSelect}
									data-liked-key={option.key}
									spotlightId={`filter-liked-${option.key}`}
								>
									<span className={css.radioCircle}>
										{likedFilter === option.key && <span className={css.radioFill} />}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{isSeriesLibrary && renderSection('series', $L('Series Status'), chosenLabel(SERIES_FILTERS, seriesFilter), () => (
							supported(SERIES_FILTERS).map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${seriesFilter === option.key ? css.sortOptionActive : ''}`}
									onClick={handleSeriesFilterSelect}
									data-series-key={option.key}
									spotlightId={`filter-series-${option.key}`}
								>
									<span className={css.radioCircle}>
										{seriesFilter === option.key && <span className={css.radioFill} />}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{showVideoFilters && renderSection('features', $L('Features'), countLabel(featureFilters.length), () => (
							supported(FEATURE_FILTERS).map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${featureFilters.includes(option.key) ? css.sortOptionActive : ''}`}
									onClick={handleFeatureToggle}
									data-filter-value={option.key}
									spotlightId={`filter-feature-${option.key}`}
								>
									<span className={css.checkboxSquare}>
										{featureFilters.includes(option.key) && (
											<svg viewBox="0 0 24 24" className={css.checkIcon}>
												<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
											</svg>
										)}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{showVideoFilters && renderSection('quality', $L('Quality'), countLabel(qualityFilters.length), () => (
							supported(QUALITY_FILTERS).map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${qualityFilters.includes(option.key) ? css.sortOptionActive : ''}`}
									onClick={handleQualityToggle}
									data-filter-value={option.key}
									spotlightId={`filter-quality-${option.key}`}
								>
									<span className={css.checkboxSquare}>
										{qualityFilters.includes(option.key) && (
											<svg viewBox="0 0 24 24" className={css.checkIcon}>
												<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
											</svg>
										)}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{showVideoFilters && renderSection('source', $L('Source'), countLabel(videoSourceFilters.length), () => (
							VIDEO_SOURCE_FILTERS.map((option) => (
								<SpottableButton
									key={option.key}
									className={`${css.sortOption} ${videoSourceFilters.includes(option.key) ? css.sortOptionActive : ''}`}
									onClick={handleVideoSourceToggle}
									data-filter-value={option.key}
									spotlightId={`filter-source-${option.key}`}
								>
									<span className={css.checkboxSquare}>
										{videoSourceFilters.includes(option.key) && (
											<svg viewBox="0 0 24 24" className={css.checkIcon}>
												<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
											</svg>
										)}
									</span>
									<span className={css.sortOptionLabel}>{$L(option.label)}</span>
								</SpottableButton>
							))
						))}

						{!genreFilter && renderFacetSection('genres', $L('Genres'), facetValues?.genres, genreFilters, handleGenreToggle)}
						{renderFacetSection('ratings', $L('Parental Rating'), facetValues?.officialRatings, ratingFilters, handleRatingToggle)}
						{renderFacetSection('tags', $L('Tags'), facetValues?.tags, tagFilters, handleTagToggle)}
						{renderFacetSection('years', $L('Years'), facetValues?.years?.map(String), yearFilters, handleYearToggle)}
						{renderFacetSection('audio', $L('Audio Language'), facetValues?.audioLanguages, audioLanguageFilters, handleAudioLanguageToggle)}
						{renderFacetSection('subtitles', $L('Subtitle Language'), facetValues?.subtitleLanguages, subtitleLanguageFilters, handleSubtitleLanguageToggle)}

						{hasActiveFilters && (
							<div className={css.filterSection}>
								<SpottableButton
									className={css.sortOption}
									onClick={handleClearFilters}
									spotlightId="filter-clear"
								>
									<span className={css.sortOptionLabel}>{$L('Clear Filters')}</span>
								</SpottableButton>
							</div>
						)}
					</SortPanelContainer>
				</div>
			)}

			{showSettingsPanel && (
				<div className={css.sortPanelOverlay} onClick={handleCloseSettingsPanel}>
					<SettingsPanelContainer
						className={css.sortPanel}
						onFocus={keepFocusInView}
						spotlightId="settings-panel"
						onClick={stopPropagation}
					>
						<div className={css.settingsHeader}>{isStudioMode ? $L('STUDIO') : isGenreMode ? $L('Genre') : $L('Libraries')}</div>
						<h2 className={css.sortPanelTitle}>{displayName}</h2>

						<SpottableButton
							className={css.settingRow}
							onClick={handleCycleImageSize}
							spotlightId="settings-image-size"
						>
							<div className={css.settingLabel}>{$L('Image size')}</div>
							<div className={css.settingValue}>{$L(capitalize(imageSize))}</div>
						</SpottableButton>

						{!isSquareDefault && (
							<SpottableButton
								className={css.settingRow}
								onClick={handleCycleImageType}
								spotlightId="settings-image-type"
							>
								<div className={css.settingLabel}>{$L('Image Type')}</div>
								<div className={css.settingValue}>{$L(capitalize(imageType))}</div>
							</SpottableButton>
						)}

						<SpottableButton
							className={css.settingRow}
							onClick={handleCycleGridDirection}
							spotlightId="settings-grid-direction"
						>
							<div className={css.settingLabel}>{$L('Grid direction')}</div>
							<div className={css.settingValue}>{$L(capitalize(gridDirection))}</div>
						</SpottableButton>

						{canGroup && (
							<SpottableButton
								className={css.settingRow}
								onClick={handleCycleGroupBy}
								spotlightId="settings-group-by"
							>
								<div className={css.settingLabel}>{$L('Group By')}</div>
								<div className={css.settingValue}>{GROUP_BY_LABELS[groupBy]()}</div>
							</SpottableButton>
						)}

						{isPlaylistLibrary && (
							<SpottableButton
								className={css.settingRow}
								onClick={handleTogglePlaylistGrouping}
								spotlightId="settings-playlist-grouping"
							>
								<div className={css.settingLabel}>{$L('Group by Type')}</div>
								<div className={css.settingValue}>{playlistGroupingOn ? $L('On') : $L('Off')}</div>
							</SpottableButton>
						)}

						<SpottableButton
							className={css.settingRow}
							onClick={handleToggleCardText}
							spotlightId="settings-card-text"
						>
							<div className={css.settingLabel}>{$L('Titles under posters')}</div>
							<div className={css.settingValue}>{showCardText ? $L('On') : $L('Off')}</div>
						</SpottableButton>

						<SpottableButton
							className={css.settingRow}
							onClick={handleToggleLetterNav}
							spotlightId="settings-letter-nav"
						>
							<div className={css.settingLabel}>{$L('Alphabet bar')}</div>
							<div className={css.settingValue}>{showLetterNav ? $L('On') : $L('Off')}</div>
						</SpottableButton>

						{!isFilterMode && (
							<SpottableButton
								className={css.settingRow}
								onClick={handleToggleFolderView}
								spotlightId="settings-folder-view"
							>
								<div className={css.settingLabel}>{$L('Folder view')}</div>
								<div className={css.settingValue}>{isFolderView ? $L('On') : $L('Off')}</div>
							</SpottableButton>
						)}
					</SettingsPanelContainer>
				</div>
			)}
		</div>
	);
};

export default Library;
