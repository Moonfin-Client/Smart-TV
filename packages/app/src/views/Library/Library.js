import {memo, useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import {useAuth} from '../../context/AuthContext';
import {createApiForServer} from '../../services/jellyfinApi';
import MusicBrowse from '../MusicBrowse';
import MusicCategoryScreen from '../MusicBrowse/MusicCategoryScreen';
import {musicScreenFor} from '../MusicBrowse/musicScreens';
import BookBrowse from '../BookBrowse';
import BackdropLayer from '../../components/BackdropLayer';
import TileGrid from '../../components/TileGrid';
import IncompleteBadge from '../../components/IncompleteBadge';
import PosterLabels from '../../components/PosterLabels';
import {getImageUrl, getPrimaryImageId, formatDuration} from '../../utils/helpers';
import useQuickReturnGrid from '../../hooks/useQuickReturnGrid';
import {useSettings} from '../../context/SettingsContext';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {withoutBlockedItems} from '../../services/parentalControls';
import MediaRow from '../../components/MediaRow';
import DetailsTabBar from '../../components/DetailsTabBar';
import {LIBRARY_GROUP_OPTIONS, groupByLabel, groupLibraryItems} from '../../utils/libraryGroupBy';
import {PLAYLIST_CATEGORIES, PLAYLIST_SAMPLE_SIZE, groupPlaylists, playlistCategory, playlistCategoryFromItems, playlistNeedsItemCheck, playlistSummaryCategory} from '../../utils/playlistGrouping';
import {isScrolledAway} from '../../utils/quickReturn';
import {combinedTypes, isBookLibraryType} from '../../utils/bookLibrary';
import RatingsRow from '../../components/RatingsRow';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {useStorage} from '../../hooks/useStorage';
import {NO_FILTERS, buildFilterParams, facetRows, hasActiveFilters} from '../../utils/libraryFilters';
import {alphabetApplies, librarySortKeys, orderByMyRating, savedSortOrder, sortField, sortLabel as librarySortLabel} from '../../utils/librarySorts';
import {foldForSearch} from '../../utils/accentFolding';
import {glideScroll, keepFocusInView} from '../../utils/focusScroll';
import {PanelContainer} from '../../utils/spotlightContainers';
import {KEYS} from '../../utils/keys';
import useSortSettingsPanels from '../../hooks/useSortSettingsPanels';
import {useUserDataList} from '../../hooks/useUserDataSync';
import useItemMenuHold, {cardIndexOf} from '../../hooks/useItemMenuHold';
import {FOCUS_SCALE, POSTER_HEIGHTS, POSTER_SIZE_OPTIONS, createGridKeyDown, createRowsLeftKeyDown, createToolbarKeyDown, focusOverhang, horizontalCellPad, libraryPosterSize, matchesStartLetter, stopPropagation} from '../../utils/gridChrome';
import {ARROW_DOWN_ICON, ARROW_UP_ICON, CLEAR_FILTERS_ICON, EXPAND_LESS_ICON, EXPAND_MORE_ICON, GROUP_ICON, HOME_ICON, Icon, Letters, LibraryDock, LibraryTitle, ModernBar, ModernLetters, SEARCH_ICON, SETTINGS_ICON, SHUFFLE_ICON, SORT_ICON} from './LibraryHeaders';
import LibrarySkeleton from './LibrarySkeleton';

import css from './Library.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const MUSIC_CONTENT_TYPES = [
	{key: 'albums', label: $L('Albums'), itemType: 'MusicAlbum'},
	{key: 'albumArtists', label: $L('Album Artists'), itemType: 'AlbumArtist'},
	{key: 'artists', label: $L('Artists'), itemType: 'MusicArtist'},
	{key: 'songs', label: $L('Songs'), itemType: 'Audio'},
	{key: 'playlists', label: $L('Playlists'), itemType: 'Playlist'},
	{key: 'genres', label: $L('Genres'), itemType: 'MusicGenre'}
];

const MUSIC_TITLES = {
	albums: () => $L('Albums'),
	albumArtists: () => $L('Album Artists'),
	artists: () => $L('Artists'),
	songs: () => $L('Songs')
};

const FOLDER_DETAIL_TYPES = ['Series', 'BoxSet', 'Playlist', 'MusicAlbum', 'MusicArtist'];

// The plain folders a folder view lists ahead of everything else. The server counts a series as a
// folder too, so sorting on IsFolder would put every show ahead of every movie.
const DIRECTORY_TYPES = 'Folder,CollectionFolder,UserView,PhotoAlbum';

// The inset the stylesheet keeps either side of the grid, both sides added up.
const GRID_INSET = 174;
// The Docked panel's width, matched in the stylesheet. The grid keeps its own inset beside it.
const DOCK_WIDTH = 420;
// The least room a row leaves between two cards.
const MIN_ROW_GAP = 6;
// The header, ratings and backdrop follow focus once it rests, so a move in the grid only redraws tiles.
const FOCUS_SETTLE_MS = 150;

// Opening an item takes the library off screen and it's built again on the way back, so the item
// that was opened and the folder it was in are noted here to come back to.
let returnTo = null;
// The same for a book grid the item was opened from, so Back comes to the grid rather than the
// book library.
let bookGridReturn = null;
// And for the music screen an item was opened or played from.
let musicScreenReturn = null;
// And for the book library screen.
let bookScreenReturn = null;

const PLAYED_FILTERS = [
	{key: 'all', label: $L('All')},
	{key: 'watched', label: $L('Watched')},
	{key: 'unwatched', label: $L('Unwatched')},
	{key: 'inProgress', label: $L('In Progress')}
];

const playedLabel = (key, books) => {
	if (books && key === 'watched') return $L('Read');
	if (books && key === 'unwatched') return $L('Unread');
	return $L(PLAYED_FILTERS.find((option) => option.key === key)?.label || 'All');
};

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
	{key: 'threeD', label: $L('3D'), plexless: true}
];

// A tag list can run to thousands of entries, and each one costs a focusable
// row, so a facet opens on this many and grows a page at a time.
const FACET_PAGE = 50;

// Every section starts closed, so the panel opens on Show Alphabet.
const SORT_SECTION = 'sort';
const SORT_FOCUS_ID = 'filter-show-alphabet';
const DISPLAY_FOCUS_ID = 'display-scroll-vertical';

const FILTER_FIELDS = {
	features: 'featureFilters',
	quality: 'qualityFilters',
	source: 'videoSourceFilters',
	genres: 'genreFilters',
	ratings: 'ratingFilters',
	tags: 'tagFilters',
	years: 'yearFilters',
	audio: 'audioLanguageFilters',
	subtitles: 'subtitleLanguageFilters'
};

const SCROLL_DIRECTIONS = [
	{key: 'vertical', label: () => $L('Vertical')},
	{key: 'horizontal', label: () => $L('Horizontal')}
];

const IMAGE_TYPE_OPTIONS = [
	{key: 'poster', label: () => $L('Poster')},
	{key: 'thumbnail', label: () => $L('Thumbnail')},
	{key: 'banner', label: () => $L('Banner')}
];

const PLAYLIST_TYPE_LABELS = {
	Video: () => $L('Video'),
	MusicVideo: () => $L('Music Video'),
	Audio: () => $L('Audio (Music)'),
	AudioBook: () => $L('Audiobook'),
	Book: () => $L('Book'),
	Photo: () => $L('Photo'),
	Mixed: () => $L('Mixed')
};

// The shape banner art comes in.
const BANNER_ASPECT = 1000 / 185;

// The grid's active category tab, which Up from the grid and Down from the header land on.
const GROUP_TAB_ID = 'library-group-active-tab';

const VIDEO_SOURCE_FILTERS = [
	{key: 'Dvd', label: $L('DVD')},
	{key: 'BluRay', label: $L('Blu-ray')},
	{key: 'Iso', label: $L('ISO')}
];

const LIKED_FILTERS = [
	{key: 'all', label: $L('All')},
	{key: 'liked', label: $L('Like')},
	{key: 'disliked', label: $L('Dislike')}
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

const handleToolbarKeyDown = createToolbarKeyDown('library-grid');
const handleToolbarKeyDownGrouped = createToolbarKeyDown('library-group-row-0');
const handleToolbarKeyDownTabs = createToolbarKeyDown(GROUP_TAB_ID);
// Up out of the grid goes to the first letter, or to the toolbar when the
// alphabet bar is switched off and that letter is not there to land on.
const handleGridKeyDown = createGridKeyDown(css.grid, 'library-letter-hash');
const handleGridKeyDownNoLetters = createGridKeyDown(css.grid, 'library-toolbar');
// Each style's controls sit in a container of their own. A shared id would break on a
// style change, since the outgoing container lets go of the id after the new one took it.
const HEADER_IDS = {classic: 'library-toolbar', modern: 'library-bar', docked: 'library-dock'};
// The Modern bar drops onto the letter row under it when that is showing.
const handleBarKeyDownLetters = createToolbarKeyDown('library-letter-hash');
const handleGridKeyDownNoLettersModern = createGridKeyDown(css.grid, HEADER_IDS.modern);
// Docked has nothing above the grid, so Up from its top row and Left from its first
// column both go to the panel.
const handleGridKeyDownDocked = createGridKeyDown(css.grid, HEADER_IDS.docked, HEADER_IDS.docked);
const handleRowsKeyDownDocked = createRowsLeftKeyDown(HEADER_IDS.docked);
// In a grouped grid, Up from the grid lands on the category tabs above it.
const handleGridKeyDownTabs = createGridKeyDown(css.grid, GROUP_TAB_ID);
const handleGridKeyDownTabsDocked = createGridKeyDown(css.grid, GROUP_TAB_ID, HEADER_IDS.docked);
const handleTabsKeyDown = {
	classic: createToolbarKeyDown('library-grid', HEADER_IDS.classic),
	modern: createToolbarKeyDown('library-grid', HEADER_IDS.modern),
	docked: createToolbarKeyDown('library-grid')
};

// The list redraws every card it holds each time it renders, so without this a
// focus move that only changes the header would redraw the whole grid.
const GridList = memo(VirtualGridList);

// [settingsPreview] draws the library in the settings preview with its first card held as the
// focused one. It stays out of Spotlight and leaves focus and the places Back returns to alone.
const Library = ({library, genreFilter, studioFilter, onSelectItem, onViewPhoto, onHome, onPlay, onSearch, backHandlerRef, settingsPreview = false}) => {
	const {api, serverUrl, serverType} = useAuth();
	const {settings, updateSetting} = useSettings();
	const libraryServerType = library?._serverType || serverType;

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
	const isBookLibrary = isBookLibraryType(library?.CollectionType);
	const [restoredBookGrid] = useState(() => (!settingsPreview && bookGridReturn?.libraryId === library?.Id ? bookGridReturn : null));
	// The music category screen that's open, from musicScreenFor.
	const [musicScreen, setMusicScreen] = useState(() => (!settingsPreview && musicScreenReturn && musicScreenReturn.libraryId === library?.Id ? musicScreenReturn.screen : null));
	// The book library screen that's open, from bookScreens, kept with its library so another one
	// opens at its own root.
	const [bookScreenOf, setBookScreenOf] = useState(() => (!settingsPreview && bookScreenReturn?.libraryId === library?.Id ? bookScreenReturn : null));
	const bookScreen = bookScreenOf && bookScreenOf.libraryId === library?.Id ? bookScreenOf.screen : null;
	useEffect(() => {
		if (settingsPreview) return;
		bookGridReturn = null;
		musicScreenReturn = null;
		bookScreenReturn = null;
	}, [settingsPreview]);
	const isSeriesLibrary = library?.CollectionType?.toLowerCase() === 'tvshows';
	const isPlaylistLibrary = library?.CollectionType?.toLowerCase() === 'playlists';
	const isSquareDefault = isMusicLibrary || isPlaylistLibrary;

	const [allItems, setAllItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [totalCount, setTotalCount] = useState(0);
	// What the ratings filter dropped from the fetched pages, so the count shown leaves it out.
	const [blockedCount, setBlockedCount] = useState(0);
	const shownCount = Math.max(0, totalCount - blockedCount);
	const [facetValues, setFacetValues] = useState(null);
	const [expandedSection, setExpandedSection] = useState(null);
	const [facetLimit, setFacetLimit] = useState(FACET_PAGE);
	const [facetQuery, setFacetQuery] = useState('');
	const [musicContentType, setMusicContentType] = useState('albums');
	const [focusedItem, setFocusedItem] = useState(null);
	const [musicGridView, setMusicGridView] = useState(null);
	const [bookGridView, setBookGridView] = useState(() => restoredBookGrid?.view || null);
	// The genre a music or book genre card opened its grid on. It narrows the grid the way a genre
	// browse does, and goes with the grid rather than being saved with the filters.
	const [openedGenre, setOpenedGenre] = useState(() => restoredBookGrid?.genre || null);
	const [showGroupDialog, setShowGroupDialog] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState(null);
	// Not saved, so every visit starts with all playlist types shown.
	const [playlistTypes, setPlaylistTypes] = useState(PLAYLIST_CATEGORIES);
	const [genreLibraries, setGenreLibraries] = useState([]);
	const [pickedGenreLibrary, setPickedGenreLibrary] = useState(null);
	const libraryId = library?.Id || (genreFilter ? `genre-${genreFilter}` : studioFilter ? `studio-${studioFilter}` : 'default');
	const [imageType, setImageType] = useStorage(`library_imageType_${libraryId}`, 'poster');
	const [gridDirection, setGridDirection] = useStorage(`library_gridDirection_${libraryId}`, 'vertical');
	const [storedGroupBy, setGroupBy] = useStorage(`library_groupBy_${libraryId}`, 'none');
	const [folderView, setFolderView, folderViewLoaded] = useStorage(`library_folderView_${libraryId}`, null);
	const [storedSortKey, setSortKey, sortKeyLoaded] = useStorage(`library_sortKey_${libraryId}`, null);
	const [sortOrder, setSortOrder, sortOrderLoaded] = useStorage(`library_sortOrder_${libraryId}`, '');
	// Each music grid keeps its own filters.
	const filterScope = isMusicLibrary && musicGridView ? `${libraryId}_${musicGridView}` : libraryId;
	const [storedFilters, setStoredFilters, filtersLoaded] = useStorage(`library_filters_${filterScope}`, NO_FILTERS);
	const filters = useMemo(() => ({...NO_FILTERS, ...storedFilters}), [storedFilters]);
	const filtersRef = useRef(filters);
	filtersRef.current = filters;
	// The first page waits for what this device saved, rather than fetching with the defaults and
	// again once the saved values land.
	const storageReady = folderViewLoaded && sortKeyLoaded && sortOrderLoaded && filtersLoaded;
	const [searchQuery, setSearchQuery] = useState(() => restoredBookGrid?.search || '');
	const showCardText = settings.libraryCardTitles !== false;
	const showAlphabet = settings.showAlphabeticalFilters === true;
	// A style this app doesn't know, say one a newer client synced, reads as Classic.
	const libraryStyle = settings.libraryStyle === 'modern' || settings.libraryStyle === 'docked' ? settings.libraryStyle : 'classic';
	const isDocked = libraryStyle === 'docked';
	const detailedSubtitles = settings.useDetailedSubHeadings !== false;
	const isMixedContentLibrary = library != null && (!library.CollectionType || library.CollectionType.toLowerCase() === 'folders');
	const isHomeVideosLibrary = library?.CollectionType?.toLowerCase() === 'homevideos';
	const isGenreMode = !!genreFilter;
	const isStudioMode = !!studioFilter;
	const isFilterMode = isGenreMode || isStudioMode;
	// Folder view belongs to the plain browse of a library. Home videos and untyped libraries start
	// in it and everything else starts flat, until it's switched for that library.
	const canFolderView = library != null && !isFilterMode && !musicGridView && !bookGridView;
	const isFolderView = (canFolderView && (folderView === 'on' || (folderView !== 'off' && (isMixedContentLibrary || isHomeVideosLibrary)))) ||
		Boolean(bookGridView?.folders);
	const [folderStack, setFolderStack] = useState(() => (!settingsPreview && returnTo?.libraryId === libraryId && returnTo.folderStack) || []);
	const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : library?.Id;
	const currentFolderCollectionType = folderStack.length > 0 ? folderStack[folderStack.length - 1].collectionType?.toLowerCase() : null;
	// A genre browse can be narrowed to one library from the panel, which holds until the next genre.
	const parentId = isGenreMode && pickedGenreLibrary?.genre === genreFilter && pickedGenreLibrary.base === library
		? pickedGenreLibrary.id
		: library?.Id;

	const loadingMoreRef = useRef(false);
	const apiFetchIndexRef = useRef(0);
	// How many plain folders lead a folder view, which the item pages start after.
	const directoryCountRef = useRef(0);
	const initialFocusDoneRef = useRef(false);
	// Whether focus has landed on this view yet. The first time it goes to Home.
	const landedRef = useRef(false);
	const loadItemsRef = useRef(null);
	const fetchGenerationRef = useRef(0);

	const isMusicBrowseHome = isMusicLibrary && !isFilterMode && !isFolderView && !musicGridView;
	const isBookBrowseHome = isBookLibrary && !isFilterMode && !isFolderView && !bookGridView;
	const isBrowseHome = isMusicBrowseHome || isBookBrowseHome;
	const isSongs = isMusicLibrary && musicContentType === 'songs';
	const favoritesOnly = filters.favoritesOnly;

	const isMovieLibrary = library?.CollectionType?.toLowerCase() === 'movies';
	const canGroup = (isMovieLibrary || isSeriesLibrary) && !isFolderView;
	// A stored value the options no longer carry falls back to the plain grid
	const groupBy = LIBRARY_GROUP_OPTIONS.indexOf(storedGroupBy) !== -1 ? storedGroupBy : 'none';
	const playlistGroupingOn = settings.playlistsGroupByType !== false;
	const playlistGrouped = isPlaylistLibrary && playlistGroupingOn && !isFolderView;
	const groupedActive = (canGroup && groupBy !== 'none') || playlistGrouped;

	const sortKeys = librarySortKeys({
		songs: isSongs,
		music: isMusicLibrary,
		series: isSeriesLibrary,
		books: isBookLibrary,
		folders: isFolderView,
		movieOrSeries: isMovieLibrary || isSeriesLibrary,
		myRating: Boolean(settings.useMoonfinPlugin) && libraryServerType !== 'plex'
	});
	// Folders come first until something else is picked, and a saved sort this library doesn't
	// offer goes back to that, or to the name sort everywhere else.
	const sortKey = sortKeys.includes(storedSortKey) ? storedSortKey : isFolderView ? 'FoldersFirst' : 'SortName';
	const sortAscending = savedSortOrder(sortOrder, sortKey) !== 'Descending';
	const effectiveOrder = sortAscending ? 'Ascending' : 'Descending';
	const showLetters = showAlphabet && !groupedActive && alphabetApplies({sortKey, music: isMusicLibrary, songs: isSongs});

	// The watched state can move while the grid is up, so it draws from the items
	// with what's known now laid over them.
	const syncedItems = useUserDataList(allItems);

	// The header search narrows the items already loaded. It reads the sort name
	// the server orders by, so a title held as "Matrix, The" still answers to
	// "matrix". The server folds accents for the searches it answers, so this
	// does too, and the folded names are kept per set of loaded items rather
	// than worked out again on each keystroke. Laying the watched state over the
	// items keeps their order, so the names still line up with them.
	const foldedNamesRef = useRef({source: null, names: []});
	const searchedItems = useMemo(() => {
		const query = foldForSearch(searchQuery.trim());
		if (!query) return syncedItems;
		const folded = foldedNamesRef.current;
		if (folded.source !== allItems) {
			folded.names = allItems.map((item) => foldForSearch(item.SortName || item.Name || ''));
			folded.source = allItems;
		}
		return syncedItems.filter((item, index) => folded.names[index].indexOf(query) !== -1);
	}, [allItems, syncedItems, searchQuery]);

	const [playlistCategories, setPlaylistCategories] = useState({});
	const playlistResolveRef = useRef({});

	// The playlist type boxes filter what's loaded, so ticking one redraws rather than fetching.
	const playlistTypesFiltered = isPlaylistLibrary && playlistTypes.length < PLAYLIST_CATEGORIES.length;
	const visibleItems = useMemo(() => (
		playlistTypesFiltered
			? searchedItems.filter((item) => item.Type !== 'Playlist' || playlistTypes.includes(playlistCategory(item, playlistCategories)))
			: searchedItems
	), [playlistTypesFiltered, searchedItems, playlistTypes, playlistCategories]);

	// Grouped over what the search left, so it narrows the categories the same
	// way it narrows the plain grid.
	const groups = useMemo(() => {
		if (playlistGrouped) return groupPlaylists(visibleItems, playlistCategories);
		if (groupedActive) return groupLibraryItems(visibleItems, groupBy);
		return null;
	}, [playlistGrouped, playlistCategories, groupedActive, visibleItems, groupBy]);
	const groupCountRef = useRef(0);
	groupCountRef.current = groups ? groups.length : 0;

	// A vertical grid shows one category at a time under tabs, where a horizontal one keeps a row
	// for each. A filter can retire the picked category, which falls back to the first.
	const groupTabs = groupedActive && !playlistGrouped && gridDirection === 'vertical' && groups.length > 0;
	const activeGroup = groupTabs ? groups.find((group) => group.name === selectedCategory) || groups[0] : null;
	const showGroupRows = groupedActive && !groupTabs;
	const items = activeGroup ? activeGroup.items : visibleItems;

	const itemsRef = useRef(items);
	itemsRef.current = items;

	const itemAtCard = useCallback((target) => itemsRef.current[cardIndexOf(target)] || null, []);
	const menuHold = useItemMenuHold(itemAtCard);

	const getItemTypeForLibrary = useCallback(() => {
		const groupCollections = Boolean(settings.groupItemsIntoCollections);
		if (!library) return groupCollections ? 'Movie,Series,BoxSet' : 'Movie,Series';
		const collectionType = library.CollectionType?.toLowerCase();

		switch (collectionType) {
			case 'movies':
				return groupCollections ? 'Movie,BoxSet' : 'Movie';
			case 'tvshows':
				return groupCollections ? 'Series,BoxSet' : 'Series';
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
			case 'audiobooks':
				return bookGridView?.types || 'Book';
			case 'trailers':
				return 'Trailer';
			default:
				return '';
		}
	}, [library, musicContentType, bookGridView, settings.groupItemsIntoCollections]);

	const getExcludeItemTypes = useCallback(() => {
		const groupCollections = Boolean(settings.groupItemsIntoCollections);
		if (isGenreMode) {
			return groupCollections ? 'Playlist,Episode,Season,Folder' : 'BoxSet,Playlist,Episode,Season,Folder';
		}
		if (!library) return '';
		const collectionType = library.CollectionType?.toLowerCase();

		if ((collectionType === 'movies' || collectionType === 'tvshows') && !groupCollections) {
			return 'BoxSet';
		}
		// A flat list leaves out the folders the files sit in.
		if (isMixedContentLibrary || collectionType === 'homevideos') return DIRECTORY_TYPES;
		return '';
	}, [library, isGenreMode, isMixedContentLibrary, settings.groupItemsIntoCollections]);

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

		// Paging runs on what the server sent, while the list and count leave out what the ratings
		// filter dropped.
		const showPage = (fetched) => {
			const allowed = withoutBlockedItems(fetched);
			setBlockedCount(prev => (append ? prev : 0) + fetched.length - allowed.length);
			setAllItems(prev => {
				if (!append) return allowed;
				const combined = [...prev, ...allowed];
				const seen = new Set();
				return combined.filter(i => { if (seen.has(i.Id)) return false; seen.add(i.Id); return true; });
			});
		};

		try {
			const statusFilters = [];
			if (favoritesOnly) statusFilters.push('IsFavorite');
			if (filters.playedFilter === 'watched') statusFilters.push('IsPlayed');
			if (filters.playedFilter === 'unwatched') statusFilters.push('IsUnplayed');
			if (filters.playedFilter === 'inProgress') statusFilters.push('IsResumable');
			if (filters.likedFilter === 'liked') statusFilters.push('Likes');
			if (filters.likedFilter === 'disliked') statusFilters.push('Dislikes');
			const seriesStatusParam = SERIES_STATUS_BY_KEY[filters.seriesFilter] || null;
			const extraParams = buildFilterParams({
				...filters,
				// The genre being browsed owns the Genres parameter, so the facet
				// stays out of it rather than replacing the list the user opened.
				genreFilters: genreFilter ? [] : openedGenre ? [openedGenre] : filters.genreFilters
			});

			if (isFolderView) {
				// Folders First lists the plain folders ahead of the items, read in full with the
				// first page, while any other sort mixes them in.
				const foldersFirst = sortKey === 'FoldersFirst';
				const shared = {
					ParentId: currentFolderId,
					SortOrder: effectiveOrder,
					Fields: 'PrimaryImageAspectRatio,SortName,Path,ChildCount,MediaSourceCount,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData',
					...(statusFilters.length > 0 ? {Filters: statusFilters.join(',')} : {}),
					...extraParams
				};
				const firstPage = startIndex === 0;
				const [result, directories] = await Promise.all([
					effectiveApi.getItems({
						...shared,
						StartIndex: firstPage ? 0 : startIndex - directoryCountRef.current,
						Limit: 150,
						SortBy: sortField(sortKey),
						...(foldersFirst ? {ExcludeItemTypes: DIRECTORY_TYPES} : {}),
						EnableTotalRecordCount: true
					}),
					firstPage && foldersFirst ? effectiveApi.getItems({...shared, SortBy: 'SortName', IncludeItemTypes: DIRECTORY_TYPES, EnableTotalRecordCount: false}) : null
				]);
				let newItems = result.Items || [];
				if (currentFolderCollectionType === 'movies' || currentFolderCollectionType === 'tvshows') {
					newItems = newItems.filter(i => i.Type !== 'BoxSet');
				}
				if (generation !== fetchGenerationRef.current) return;
				if (firstPage) {
					const folders = directories?.Items || [];
					directoryCountRef.current = folders.length;
					newItems = folders.concat(newItems);
				}
				apiFetchIndexRef.current = append ? apiFetchIndexRef.current + newItems.length : newItems.length;
				showPage(newItems);
				setTotalCount((result.TotalRecordCount || 0) + directoryCountRef.current);
			} else {
				const params = {
					StartIndex: startIndex,
					Limit: 150,
					SortBy: sortField(sortKey),
					SortOrder: effectiveOrder,
					Recursive: true,
					EnableTotalRecordCount: true,
					Fields: 'SortName,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,ProviderIds,UserData,Genres,Studios'
				};

				if (isPlaylistLibrary) params.Fields += ',ChildCount,RecursiveItemCount';

				if (parentId) params.ParentId = parentId;
				if (genreFilter) params.Genres = genreFilter;
				if (studioFilter) params.Studios = studioFilter;

				const itemTypes = getItemTypeForLibrary();
				if (itemTypes) params.IncludeItemTypes = itemTypes;

				const excludeTypes = getExcludeItemTypes();
				if (excludeTypes) params.ExcludeItemTypes = excludeTypes;

				const collectionType = library?.CollectionType?.toLowerCase();
				const groupCollections = Boolean(settings.groupItemsIntoCollections);
				if (isGenreMode || collectionType === 'movies' || collectionType === 'tvshows') {
					params.CollapseBoxSetItems = groupCollections;
				}

				if (statusFilters.length > 0) params.Filters = statusFilters.join(',');
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
					SortBy: sortField(sortKey),
					SortOrder: effectiveOrder,
					EnableTotalRecordCount: true,
					Fields: 'PrimaryImageAspectRatio,SortName,ProductionYear,ImageTags,UserData',
					ImageTypeLimit: 1,
					EnableImageTypes: 'Primary,Backdrop,Thumb',
					...(statusFilters.length > 0 ? {Filters: statusFilters.join(',')} : {})
				};

				const ownEndpoint = (isMusicLibrary && ['albumArtists', 'artists', 'genres'].includes(musicContentType)) || bookGridView?.genres;
				// Everything the viewer rated loads as one page, since the plugin serves ids and
				// scores rather than a sorted stream. With the plugin unreachable this stays null and
				// the browse falls back to the name sort instead of coming up empty.
				const ratedIds = sortKey === 'MyRating' && startIndex === 0 && !ownEndpoint && effectiveApi.getMyUserRatings
					? await effectiveApi.getMyUserRatings().then((res) => orderByMyRating(res?.Items, sortAscending)).catch(() => null)
					: null;

				let result;
				if (ratedIds) {
					const plainId = (id) => String(id).replace(/-/g, '').toLowerCase();
					const found = {};
					for (let i = 0; i < ratedIds.length; i += 100) {
						const chunk = ratedIds.slice(i, i + 100);
						const res = await effectiveApi.getItems({...params, StartIndex: 0, Limit: chunk.length, Ids: chunk.join(',')});
						(res?.Items || []).forEach((item) => { found[plainId(item.Id)] = item; });
					}
					const ordered = ratedIds.map((id) => found[plainId(id)]).filter(Boolean);
					result = {Items: ordered, TotalRecordCount: ordered.length};
				} else if (isMusicLibrary && musicContentType === 'albumArtists') {
					result = await effectiveApi.getAlbumArtists(artistParams);
				} else if (isMusicLibrary && musicContentType === 'artists') {
					result = await effectiveApi.getArtists(artistParams);
				} else if ((isMusicLibrary && musicContentType === 'genres') || bookGridView?.genres) {
					result = await effectiveApi.getMusicGenres({
						...(bookGridView ? {IncludeItemTypes: bookGridView.types} : {}),
						ParentId: library?.Id,
						StartIndex: startIndex,
						Limit: 150,
						SortBy: sortField(sortKey),
						SortOrder: effectiveOrder,
						EnableTotalRecordCount: true,
						Fields: 'PrimaryImageAspectRatio,ItemCounts'
					});
				} else {
					result = await effectiveApi.getItems(params);
				}

				let newItems = result.Items || [];

				if (excludeTypes && newItems.length > 0) {
					const excludedList = excludeTypes.split(',').map(t => t.trim());
					newItems = newItems.filter(item => !excludedList.includes(item.Type));
				}

				apiFetchIndexRef.current = append ? apiFetchIndexRef.current + (result.Items?.length || 0) : (result.Items?.length || 0);
				if (generation !== fetchGenerationRef.current) return;
				showPage(newItems);
				setTotalCount(result.TotalRecordCount || 0);
			}
		} catch (err) { console.error('[Library] loadItems error:', err); } finally {
			setIsLoading(false);
			loadingMoreRef.current = false;
		}
	}, [isPlaylistLibrary, effectiveApi, library, genreFilter, studioFilter, sortKey, sortAscending, effectiveOrder, favoritesOnly, filters, openedGenre, parentId, isFolderView, currentFolderId, currentFolderCollectionType, isMusicLibrary, musicContentType, bookGridView, getItemTypeForLibrary, getExcludeItemTypes, settings.groupItemsIntoCollections, isGenreMode]);

	loadItemsRef.current = loadItems;

	// Grouping covers the whole library, so the rest of it loads in the
	// background the way scrolling to the end would have.
	useEffect(() => {
		if (!groupedActive || isLoading || loadingMoreRef.current) return;
		if (apiFetchIndexRef.current < totalCount) {
			loadItemsRef.current?.(apiFetchIndexRef.current, true);
		}
	}, [groupedActive, isLoading, totalCount, allItems.length]);

	// The summary cant tell music from audiobooks or music videos from movies, so
	// those playlists are read once and remembered. A small batch at a time keeps
	// the requests gentle.
	useEffect(() => {
		if (!(playlistGrouped || playlistTypesFiltered) || isLoading) return undefined;
		const pending = allItems.filter((item) => playlistNeedsItemCheck(item) && !playlistResolveRef.current[item.Id]);
		if (!pending.length) return undefined;
		let cancelled = false;
		const run = async () => {
			for (let i = 0; i < pending.length && !cancelled; i += 3) {
				const chunk = pending.slice(i, i + 3);
				const resolved = await Promise.all(chunk.map(async (item) => {
					playlistResolveRef.current[item.Id] = true;
					try {
						const res = await effectiveApi.getPlaylistItems(item.Id, PLAYLIST_SAMPLE_SIZE);
						return [item.Id, playlistCategoryFromItems(res?.Items)];
					} catch {
						return [item.Id, playlistSummaryCategory(item)];
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
	}, [playlistGrouped, playlistTypesFiltered, isLoading, allItems, effectiveApi]);

	const groupRowsRef = useRef(null);

	const scrollToGroupRow = useCallback((rowIndex) => {
		const container = groupRowsRef.current;
		const row = container?.querySelector(`[data-row-index="${rowIndex}"]`);
		if (row) glideScroll(container, 'y', row.offsetTop - 10);
		Spotlight.focus(`library-group-row-${rowIndex}`);
	}, []);

	// A ref, since the rows hold on to the first handler they were given.
	const headerIdRef = useRef(HEADER_IDS.classic);
	headerIdRef.current = HEADER_IDS[libraryStyle];
	const handleGroupNavigateUp = useCallback((rowIndex) => {
		if (rowIndex === 0) {
			Spotlight.focus(headerIdRef.current);
			return;
		}
		scrollToGroupRow(rowIndex - 1);
	}, [scrollToGroupRow]);

	const handleGroupNavigateDown = useCallback((rowIndex) => {
		if (rowIndex >= groupCountRef.current - 1) return;
		scrollToGroupRow(rowIndex + 1);
	}, [scrollToGroupRow]);

	useEffect(() => {
		if (isBrowseHome) {
			setIsLoading(false);
			return;
		}
		if (library || genreFilter || studioFilter) {
			setIsLoading(true);
			setAllItems([]);
			setTotalCount(0);
			setBlockedCount(0);
			loadingMoreRef.current = false;
			apiFetchIndexRef.current = 0;
			initialFocusDoneRef.current = false;
			if (storageReady) loadItemsRef.current(0, false);
		}
	}, [library, sortKey, effectiveOrder, favoritesOnly, filters, openedGenre, parentId, musicContentType, bookGridView, isFolderView, currentFolderId, genreFilter, studioFilter, isBrowseHome, storageReady, settings.groupItemsIntoCollections]);

	// The values the library actually holds, read once per library so opening
	// the filter panel does not wait on the network.
	useEffect(() => {
		let cancelled = false;
		setFacetValues(null);
		if (!effectiveApi?.getQueryFilters || isBrowseHome) return undefined;
		effectiveApi.getQueryFilters(parentId, getItemTypeForLibrary())
			.then(values => {
				if (!cancelled) setFacetValues(values);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [effectiveApi, parentId, isBrowseHome, getItemTypeForLibrary]);

	// The libraries a genre browse can be narrowed to, which are the ones genres are browsed in.
	useEffect(() => {
		let cancelled = false;
		if (!isGenreMode || !effectiveApi?.getLibraries) return undefined;
		effectiveApi.getLibraries()
			.then((res) => {
				if (cancelled) return;
				setGenreLibraries((res?.Items || []).filter((lib) => {
					const type = lib.CollectionType?.toLowerCase();
					return !type || type === 'movies' || type === 'tvshows';
				}));
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [isGenreMode, effectiveApi]);

	const handleOpenMusicGrid = useCallback((target, genre) => {
		if (!target) return;
		setMusicGridView(target);
		setMusicContentType(target);
		setOpenedGenre(genre || null);
		setAllItems([]);
		apiFetchIndexRef.current = 0;
		initialFocusDoneRef.current = false;
		landedRef.current = false;
	}, []);

	// The music categories and See All links open their own screens. A genre tile still opens the
	// albums grid narrowed to it, and the Songs screen opens the full songs grid, which Back leaves
	// for the screen.
	const handleOpenMusicCategory = useCallback((target, genre) => {
		const screen = genre ? null : musicScreenFor(target);
		if (screen) setMusicScreen(screen);
		else handleOpenMusicGrid(target, genre);
	}, [handleOpenMusicGrid]);
	const handleOpenSongsGrid = useCallback(() => handleOpenMusicGrid('songs'), [handleOpenMusicGrid]);
	const handleCloseMusicScreen = useCallback(() => setMusicScreen(null), []);
	const handleMusicScreenSelect = useCallback((item) => {
		musicScreenReturn = {libraryId, screen: musicScreen};
		onSelectItem?.(item);
	}, [libraryId, musicScreen, onSelectItem]);
	const handleMusicScreenPlay = useCallback((item, resume, options) => {
		musicScreenReturn = {libraryId, screen: musicScreen};
		onPlay?.(item, resume, options);
	}, [libraryId, musicScreen, onPlay]);
	const handleOpenBookScreen = useCallback((screen) => setBookScreenOf({libraryId, screen}), [libraryId]);
	const handleBookScreenSelect = useCallback((item) => {
		bookScreenReturn = {libraryId, screen: bookScreen};
		onSelectItem?.(item);
	}, [libraryId, bookScreen, onSelectItem]);
	const handleBookScreenPlay = useCallback((item, resume, options) => {
		bookScreenReturn = {libraryId, screen: bookScreen};
		onPlay?.(item, resume, options);
	}, [libraryId, bookScreen, onPlay]);

	// The book library's See All and its series, genre and folder cards. A series with no folder of
	// its own is looked for by name, and a folder series opens at its folder with Back going home.
	const handleOpenBookGrid = useCallback((target) => {
		setBookGridView({
			types: target.types || combinedTypes(library),
			genres: Boolean(target.genres),
			folders: Boolean(target.folder),
			baseDepth: target.folder?.Id ? 1 : 0
		});
		setFolderStack(target.folder?.Id ? [{id: target.folder.Id, name: target.folder.Name}] : []);
		setOpenedGenre(target.genre || null);
		setSearchQuery(target.search || '');
		setAllItems([]);
		apiFetchIndexRef.current = 0;
		initialFocusDoneRef.current = false;
		landedRef.current = false;
	}, [library]);

	const handleItemClick = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;

		const index = parseInt(itemIndex, 10);
		const item = itemsRef.current[index];
		if (item) {
			if (bookGridView?.genres && item.Type === 'Genre') {
				handleOpenBookGrid({genre: item.Name});
				return;
			}
			if (isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type)) {
				setFolderStack(prev => [...prev, {id: item.Id, name: item.Name, collectionType: item.CollectionType}]);
				return;
			}
			if (item.Type === 'Photo' && onViewPhoto) {
				onViewPhoto(item, itemsRef.current);
			} else {
				returnTo = {libraryId, itemId: item.Id, index, folderStack};
				bookGridReturn = bookGridView ? {libraryId, view: bookGridView, genre: openedGenre, search: searchQuery} : null;
				musicScreenReturn = musicScreen ? {libraryId, screen: musicScreen} : null;
				bookScreenReturn = bookScreen ? {libraryId, screen: bookScreen} : null;
				onSelectItem?.(item);
			}
		}
	}, [isFolderView, onSelectItem, onViewPhoto, libraryId, bookGridView, folderStack, openedGenre, searchQuery, handleOpenBookGrid, musicScreen, bookScreen]);

	const {getScrollTo: getGridScrollTo, quickReturn, scrollTo: scrollGridTo} = useQuickReturnGrid('library-grid');

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

	// Back past the panels: close the Group By dialog, leave the search box, go up to the letters
	// from the grid, drop out of a music or book grid, then climb the folder stack. The global back
	// handling runs in a capture listener, so the search answers here rather than in a key handler
	// of its own, which would never see the press.
	const handleBackBeyondPanels = useCallback(() => {
		if (showGroupDialog) {
			setShowGroupDialog(false);
			return true;
		}
		const active = document.activeElement;
		if (active && active.tagName === 'INPUT') {
			active.blur();
			Spotlight.focus('library-search');
			return true;
		}
		if (showLetters && active?.closest?.('[data-spotlight-id="library-grid-area"]')) {
			Spotlight.focus('library-letter-hash');
			return true;
		}
		if (musicGridView) {
			setMusicGridView(null);
			setOpenedGenre(null);
			return true;
		}
		if (bookGridView) {
			if (folderStack.length > bookGridView.baseDepth) {
				setFolderStack(prev => prev.slice(0, -1));
			} else {
				setBookGridView(null);
				setFolderStack([]);
				setOpenedGenre(null);
				setSearchQuery('');
			}
			return true;
		}
		if (isFolderView && folderStack.length > 0) {
			setFolderStack(prev => prev.slice(0, -1));
			return true;
		}
		if (showGroupRows) {
			if (isScrolledAway(groupRowsRef.current)) {
				scrollToGroupRow(0);
				return true;
			}
			return false;
		}
		return quickReturn();
	}, [showGroupDialog, showLetters, musicGridView, bookGridView, isFolderView, folderStack, quickReturn, showGroupRows, scrollToGroupRow]);

	// Where focus lands as the panel opens. Show opens it on the played status it names.
	const [sortFocusId, setSortFocusId] = useState(SORT_FOCUS_ID);

	// There is one back slot, and the music or book browse screen claims it while it's up. Nothing
	// here would be true there anyway, since it only shows with no grid, panel or folder stack.
	const {
		showSortPanel, showSettingsPanel,
		handleToggleSortPanel, handleCloseSortPanel,
		handleToggleSettingsPanel, handleCloseSettingsPanel
	} = useSortSettingsPanels({
		backHandlerRef,
		sortFocusId,
		settingsFocusId: DISPLAY_FOCUS_ID,
		onBack: handleBackBeyondPanels,
		enabled: !isBrowseHome
	});
	const dialogOpen = showSortPanel || showSettingsPanel || showGroupDialog;

	// A closed dialog hands focus back to the control that opened it, whatever reloaded behind it.
	// It runs ahead of the landing below, so a reload made from the dialog doesn't pull focus away.
	const openerRef = useRef('library-sort-btn');
	const dialogWasOpenRef = useRef(false);
	useEffect(() => {
		if (dialogOpen) {
			dialogWasOpenRef.current = true;
			return;
		}
		if (!dialogWasOpenRef.current) return;
		dialogWasOpenRef.current = false;
		initialFocusDoneRef.current = true;
		landedRef.current = true;
		Spotlight.focus(openerRef.current);
	}, [dialogOpen]);

	// Focus lands on Home the first time a view comes up, and on the grid once a reload has
	// cleared it, but not while a dialog is up, since that's the viewer still picking.
	//
	// Coming back from an item lands on it, pulling in pages until it turns up, or giving up a page
	// past where it was.
	useEffect(() => {
		if (settingsPreview || dialogOpen || apiFetchIndexRef.current === 0) return undefined;
		if (items.length === 0 || isLoading || initialFocusDoneRef.current) return undefined;
		const back = returnTo && returnTo.libraryId === libraryId && !groupedActive ? returnTo : null;
		const index = back ? items.findIndex((item) => item.Id === back.itemId) : -1;
		if (back && index < 0 && apiFetchIndexRef.current < totalCount && items.length <= back.index + 150) {
			loadItems(apiFetchIndexRef.current, true);
			return undefined;
		}
		const id = setTimeout(() => {
			returnTo = null;
			if (index >= 0) scrollGridTo({index, focus: true});
			else if (!landedRef.current) Spotlight.focus('library-home-btn');
			else Spotlight.focus(showGroupRows ? 'library-group-row-0' : 'library-grid');
			landedRef.current = true;
			initialFocusDoneRef.current = true;
		}, 100);
		return () => clearTimeout(id);
	}, [items, isLoading, groupedActive, showGroupRows, dialogOpen, libraryId, totalCount, loadItems, scrollGridTo, settingsPreview]);

	useEffect(() => {
		if (settingsPreview) setFocusedItem(items[0] || null);
	}, [settingsPreview, items]);

	// The preview's containers go without the screen's ids, so Spotlight can't mistake one for the other.
	const ownId = (id) => (settingsPreview ? undefined : id);

	const handleOpenSort = useCallback(() => {
		openerRef.current = 'library-sort-btn';
		handleToggleSortPanel();
	}, [handleToggleSortPanel]);

	const handleOpenDisplay = useCallback(() => {
		openerRef.current = 'library-settings-btn';
		handleToggleSettingsPanel();
	}, [handleToggleSettingsPanel]);

	const handleOpenGroupBy = useCallback(() => {
		openerRef.current = 'library-group-btn';
		setShowGroupDialog(true);
	}, []);

	const handleCloseGroupDialog = useCallback(() => setShowGroupDialog(false), []);

	useEffect(() => {
		if (!showGroupDialog) return undefined;
		const id = setTimeout(() => Spotlight.focus(`group-by-${groupBy}`), 100);
		return () => clearTimeout(id);
		// Only on opening, since a pick closes it anyway.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showGroupDialog]);

	const handleGroupBySelect = useCallback((ev) => {
		setGroupBy(ev.currentTarget.dataset.value);
		setSelectedCategory(null);
		setShowGroupDialog(false);
	}, [setGroupBy]);

	const handleGroupTab = useCallback((id) => {
		setSelectedCategory(id);
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}, []);

	// A letter jumps to the first item under it, pulling in pages until one turns up or the
	// library runs out.
	const [jumpLetter, setJumpLetter] = useState(null);
	const handleLetterSelect = useCallback((ev) => {
		const letter = ev.currentTarget?.dataset?.letter;
		if (letter) setJumpLetter(letter);
	}, []);

	useEffect(() => {
		if (!jumpLetter || isLoading) return undefined;
		const index = items.findIndex((item) => matchesStartLetter(item, jumpLetter));
		if (index < 0 && apiFetchIndexRef.current < totalCount) {
			if (!loadingMoreRef.current) loadItems(apiFetchIndexRef.current, true);
			return undefined;
		}
		setJumpLetter(null);
		// The grid lays out the pages that just landed before it can scroll to them. Clearing the
		// letter runs this again, so the wait can't be canceled from here.
		if (index >= 0) setTimeout(() => scrollGridTo({index, focus: true}), 100);
		return undefined;
	}, [jumpLetter, items, isLoading, totalCount, loadItems, scrollGridTo]);

	// The panel stays open on every pick. Choosing the sort already in use turns it around, and
	// another sort keeps the direction already picked.
	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget.dataset.value;
		if (key === sortKey) {
			setSortOrder(sortAscending ? 'Descending' : 'Ascending');
		} else {
			setSortKey(key);
			setSortOrder(sortAscending ? 'Ascending' : 'Descending');
		}
	}, [setSortKey, sortKey, sortAscending, setSortOrder]);

	const updateFilters = useCallback((change) => {
		if (Object.keys(change).every((key) => filtersRef.current[key] === change[key])) return;
		setStoredFilters({...filtersRef.current, ...change});
	}, [setStoredFilters]);

	const handleToggleFavorites = useCallback(() => {
		updateFilters({favoritesOnly: !filtersRef.current.favoritesOnly});
	}, [updateFilters]);

	const handlePlayedFilterSelect = useCallback((ev) => {
		updateFilters({playedFilter: ev.currentTarget.dataset.value});
	}, [updateFilters]);

	const handleLikedFilterSelect = useCallback((ev) => {
		updateFilters({likedFilter: ev.currentTarget.dataset.value});
	}, [updateFilters]);

	const handleSeriesFilterSelect = useCallback((ev) => {
		updateFilters({seriesFilter: ev.currentTarget.dataset.value});
	}, [updateFilters]);

	const handleFilterToggle = useCallback((ev) => {
		const field = FILTER_FIELDS[ev.currentTarget.dataset.sectionKey];
		const value = ev.currentTarget.dataset.filterValue;
		const current = filtersRef.current[field];
		updateFilters({[field]: current.includes(value) ? current.filter(v => v !== value) : [...current, value]});
	}, [updateFilters]);

	const handleGenreLibrarySelect = useCallback((ev) => {
		setPickedGenreLibrary({genre: genreFilter, base: library, id: ev.currentTarget.dataset.value || null});
	}, [genreFilter, library]);

	const handleToggleAlphabet = useCallback(() => {
		updateSetting('showAlphabeticalFilters', !showAlphabet);
	}, [showAlphabet, updateSetting]);

	// A music or book library out of folder view goes back to its own browse screen, which has no
	// room for the panel.
	const handleToggleFolderView = useCallback(() => {
		setFolderView(isFolderView ? 'off' : 'on');
		setFolderStack([]);
		if (isFolderView && (isMusicLibrary || isBookLibrary)) handleCloseSortPanel();
	}, [isFolderView, isMusicLibrary, isBookLibrary, setFolderView, handleCloseSortPanel]);

	// A library can hold hundreds of tags or years, so every section collapses to its
	// heading and only the one opened takes up the panel.
	const handleSectionExpand = useCallback((ev) => {
		const key = ev.currentTarget.dataset.sectionKey;
		setFacetLimit(FACET_PAGE);
		setFacetQuery('');
		setExpandedSection(prev => (prev === key ? null : key));
	}, []);

	const handleFacetShowMore = useCallback(() => {
		setFacetLimit(prev => prev + FACET_PAGE);
	}, []);

	const handleFacetQueryChange = useCallback((ev) => setFacetQuery(ev.target.value), []);

	// The tile goes away once its group is empty, so focus moves to the heading first
	// rather than being left on nothing.
	const handleClearGroup = useCallback((ev) => {
		const key = ev.currentTarget.dataset.sectionKey;
		Spotlight.focus(`filter-section-${key}`);
		updateFilters({[FILTER_FIELDS[key]]: []});
	}, [updateFilters]);

	// Closing hands focus back to the opener, since the row it was on just removed itself.
	const handleClearFilters = useCallback(() => {
		setStoredFilters(NO_FILTERS);
		handleCloseSortPanel();
	}, [setStoredFilters, handleCloseSortPanel]);

	// A facet left open on a raised limit would rebuild all of those rows the next
	// time the panel comes up, so putting the panel away starts it over.
	useEffect(() => {
		if (showSortPanel) return;
		setExpandedSection(null);
		setFacetLimit(FACET_PAGE);
		setFacetQuery('');
		setSortFocusId(SORT_FOCUS_ID);
	}, [showSortPanel]);

	const handleOpenPlayedFilter = useCallback(() => {
		openerRef.current = 'library-show-btn';
		setExpandedSection('played');
		setSortFocusId(`filter-played-${filters.playedFilter}`);
		handleToggleSortPanel();
	}, [filters.playedFilter, handleToggleSortPanel]);

	const handleScrollDirectionSelect = useCallback((ev) => {
		setGridDirection(ev.currentTarget.dataset.value);
	}, [setGridDirection]);

	const handleImageTypeSelect = useCallback((ev) => {
		setImageType(ev.currentTarget.dataset.value);
	}, [setImageType]);

	const handlePosterSizeSelect = useCallback((ev) => {
		updateSetting(isPlaylistLibrary ? 'playlistPosterSize' : 'libraryPosterSize', ev.currentTarget.dataset.value);
	}, [isPlaylistLibrary, updateSetting]);

	const handleTogglePlaylistGrouping = useCallback(() => {
		updateSetting('playlistsGroupByType', !playlistGroupingOn);
	}, [playlistGroupingOn, updateSetting]);

	// Unticking the last type would leave nothing on screen and no way back to it.
	const handlePlaylistTypeToggle = useCallback((ev) => {
		const type = ev.currentTarget.dataset.filterValue;
		setPlaylistTypes((prev) => {
			if (!prev.includes(type)) return [...prev, type];
			return prev.length === 1 ? prev : prev.filter((t) => t !== type);
		});
	}, []);

	const handleShuffle = useCallback(async () => {
		const res = await effectiveApi.getItems({
			ParentId: library?.Id,
			IncludeItemTypes: 'Audio',
			Recursive: true,
			SortBy: 'Random',
			Limit: 300,
			Fields: 'MediaSources,MediaStreams'
		}).catch(() => null);
		const tracks = res?.Items || [];
		if (tracks.length > 0) onPlay?.(tracks[0], false, {audioPlaylist: tracks});
	}, [effectiveApi, library, onPlay]);

	const handleFolderBreadcrumb = useCallback((ev) => {
		const depth = parseInt(ev.currentTarget?.dataset?.depth, 10);
		if (!isNaN(depth)) setFolderStack(prev => prev.slice(0, depth));
	}, []);

	const handleMusicContentSelect = useCallback((ev) => {
		setMusicContentType(ev.currentTarget.dataset.value);
	}, []);

	const effectiveImageType = isSquareDefault ? 'square' : imageType;
	const isWideImage = effectiveImageType === 'thumbnail';
	const isSquareImage = effectiveImageType === 'square';
	const isBanner = effectiveImageType === 'banner';
	const imageSize = libraryPosterSize(settings, isPlaylistLibrary);
	const gridWidth = window.innerWidth - GRID_INSET - (isDocked ? DOCK_WIDTH : 0);
	// Banners sit two to a row whatever the room, with space left for the focused one to grow.
	const bannerWidth = Math.floor(gridWidth / 2 / FOCUS_SCALE);
	// A square and a poster share an image height and differ only in width, while
	// a thumbnail is sized off its own shorter height.
	const posterHeight = isBanner
		? Math.round(bannerWidth / BANNER_ASPECT)
		: isWideImage
			? ({small: 128, medium: 160, large: 191, extraLarge: 223}[imageSize] || 160)
			: POSTER_HEIGHTS[imageSize];

	// A subtitle anywhere in the library makes room for a second line on every
	// card, so the rows stay level whether or not a given item has one.
	const hasCardSubtitles = useMemo(() => (
		showCardText && items.some((item) => (
			cardSubtitle(item, isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type), detailedSubtitles)
		))
	), [items, showCardText, isFolderView, detailedSubtitles]);

	const textHeight = showCardText ? (hasCardSubtitles ? 61 : 35) : 0;
	// A square card is as wide as it is tall.
	const cardWidth = isBanner
		? bannerWidth
		: isSquareImage
		? posterHeight
		: isWideImage
			? ({small: 227, medium: 284, large: 340, extraLarge: 397}[imageSize] || 284)
			: ({small: 116, medium: 145, large: 174, extraLarge: 203}[imageSize] || 145);
	const cardHeight = posterHeight + textHeight;

	const cellPadX = horizontalCellPad(cardWidth, gridWidth);
	const cellPadY = Math.max(MIN_ROW_GAP, focusOverhang(cardHeight));
	const cellPadding = `${cellPadY}px ${cellPadX}px`;
	const gridItemSize = useMemo(() => (
		{minWidth: cardWidth + cellPadX * 2, minHeight: cardHeight + cellPadY * 2}
	), [cardWidth, cardHeight, cellPadX, cellPadY]);

	const renderCard = useCallback((index) => {
		const item = items[index];
		const isNearEnd = index >= items.length - 50;
		if (isNearEnd && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
			loadItems(apiFetchIndexRef.current, true);
		}

		if (!item) {
			return (
				<div className={css.posterPlaceholder} style={{height: posterHeight}}>
					<div className={css.loadingPlaceholder} />
				</div>
			);
		}

		const isFolder = isFolderView && item.IsFolder && !FOLDER_DETAIL_TYPES.includes(item.Type);
		const subtitle = showCardText ? cardSubtitle(item, isFolder, detailedSubtitles) : null;
		let imageId = getPrimaryImageId(item);
		let imgApiType = 'Primary';
		if (isWideImage && item.ImageTags?.Thumb) {
			imageId = item.Id;
			imgApiType = 'Thumb';
		} else if (isBanner) {
			// Cropping a portrait poster down to a banner loses the most, so it comes last.
			const wide = ['Banner', 'Backdrop', 'Thumb'].find((type) => (type === 'Backdrop' ? item.BackdropImageTags?.length : item.ImageTags?.[type]));
			if (wide) {
				imageId = item.Id;
				imgApiType = wide;
			}
		}
		const imageUrl = imageId ? getImageUrl(effectiveServerUrl, imageId, imgApiType, isBanner ? {maxWidth: bannerWidth, quality: 70} : {maxHeight: 300, quality: 70}) : null;

		return (
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
				<IncompleteBadge itemId={item.Id} belowFavorite={item.UserData?.IsFavorite} />
				{item.UserData?.Played && (
					<div className={css.watchedBadge}>
						<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
					</div>
				)}
				<PosterLabels
					item={item}
					serverUrl={effectiveServerUrl}
					top={item.UserData?.IsFavorite ? 40 : 8}
					topRight={item.UserData?.Played ? 40 : 8}
					height={posterHeight}
				/>
				{showCardText && (
					<div className={css.cardText}>
						<div className={css.cardTitle}>{item.Name}</div>
						{subtitle && <div className={css.cardSubtitle}>{subtitle}</div>}
					</div>
				)}
			</div>
		);
	}, [effectiveServerUrl, items, totalCount, isLoading, loadItems, isWideImage, isBanner, bannerWidth, posterHeight, isFolderView, showCardText, detailedSubtitles]);

	const renderItem = useCallback(({index, ...rest}) => (
		items[index] ? (
			<SpottableDiv
				{...rest}
				className={settingsPreview && index === 0 ? `${css.itemCard} ${css.focused}` : css.itemCard}
				style={{padding: cellPadding}}
				onClick={handleItemClick}
				// eslint-disable-next-line react/jsx-no-bind
				onFocus={() => setFocusedItem(items[index])}
				data-index={index}
			>
				{renderCard(index)}
			</SpottableDiv>
		) : (
			<div {...rest} className={css.itemCard} style={{padding: cellPadding}}>
				{renderCard(index)}
			</div>
		)
	), [items, renderCard, cellPadding, handleItemClick, settingsPreview]);

	const renderTile = useCallback((index, focused, style) => (
		<div className={focused || (settingsPreview && index === 0) ? `${css.itemCard} ${css.focused}` : css.itemCard} style={{...style, padding: cellPadding}} data-index={index}>
			{renderCard(index)}
		</div>
	), [renderCard, cellPadding, settingsPreview]);

	const tileFocusTimerRef = useRef(null);
	const handleTileFocus = useCallback((index) => {
		clearTimeout(tileFocusTimerRef.current);
		tileFocusTimerRef.current = setTimeout(() => setFocusedItem(itemsRef.current[index] || null), FOCUS_SETTLE_MS);
	}, []);
	useEffect(() => () => clearTimeout(tileFocusTimerRef.current), []);
	const gridKeyDown = groupTabs ? (isDocked ? handleGridKeyDownTabsDocked : handleGridKeyDownTabs)
		: isDocked ? handleGridKeyDownDocked
			: showLetters ? handleGridKeyDown
				: libraryStyle === 'modern' ? handleGridKeyDownNoLettersModern : handleGridKeyDownNoLetters;
	const toolbarKeyDown = groupTabs ? handleToolbarKeyDownTabs : showGroupRows ? handleToolbarKeyDownGrouped : handleToolbarKeyDown;

	const sortLabel = librarySortLabel(sortKey, isMusicLibrary);

	// What a closed section says it is holding. One choice reads by name, several read
	// as a count, and a group left alone says nothing.
	const chosenLabel = (options, value) => {
		const picked = options.find(o => o.key === value);
		return picked && value !== 'all' ? $L(picked.label) : null;
	};
	const countLabel = (count) => (count > 0 ? String(count) : null);
	const imageTypeLabel = (IMAGE_TYPE_OPTIONS.find((option) => option.key === imageType) || IMAGE_TYPE_OPTIONS[0]).label();

	// What the Modern bar and the Docked panel share. Every value here holds still while
	// focus moves through the grid, so neither redraws with the focused item. Music has no
	// played status or display choices, so it gets neither control.
	const controlProps = {
		sortLabel,
		sortAscending,
		groupLabel: groupByLabel(groupBy),
		showLabel: playedLabel(filters.playedFilter, isBookLibrary),
		searchQuery,
		onSearchChange: handleSearchChange,
		onHome,
		onSort: handleOpenSort,
		onGroup: canGroup ? handleOpenGroupBy : null,
		onShow: isMusicLibrary ? null : handleOpenPlayedFilter,
		onShuffle: isSongs ? handleShuffle : null,
		onSettings: isMusicLibrary ? null : handleOpenDisplay,
		settingsPreview
	};
	const displayLabel = isPlaylistLibrary ? '' : imageTypeLabel;

	const renderRadioRow = ({key, label, selected, value, spotlightId, onClick, trailing}) => (
		<SpottableButton
			key={key}
			className={`${css.sortOption} ${selected ? css.sortOptionActive : ''}`}
			onClick={onClick}
			data-value={value}
			spotlightId={spotlightId}
		>
			<span className={css.radioCircle}>
				{selected && <span className={css.radioFill} />}
			</span>
			<span className={css.sortOptionLabel}>{label}</span>
			{trailing}
		</SpottableButton>
	);

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
					<span className={css.sectionHeaderLabel}>{title}</span>
					{summary && <span className={css.sectionSummary}>{summary}</span>}
					<Icon path={expanded ? EXPAND_LESS_ICON : EXPAND_MORE_ICON} className={css.sectionChevron} />
				</SpottableButton>
				{expanded && renderBody()}
			</div>
		);
	};

	const renderClearGroup = (key, count) => count > 0 && (
		<SpottableButton
			className={`${css.sortOption} ${css.clearGroup}`}
			onClick={handleClearGroup}
			data-section-key={key}
			spotlightId={`filter-${key}-clear`}
		>
			<Icon path={CLEAR_FILTERS_ICON} className={css.clearGroupIcon} />
			<span className={css.sortOptionLabel}>{$L('Clear')}</span>
		</SpottableButton>
	);

	const renderCheckRow = ({key, label, checked, value, sectionKey, spotlightId, onToggle}) => (
		<SpottableButton
			key={key}
			className={`${css.sortOption} ${checked ? css.sortOptionActive : ''}`}
			onClick={onToggle}
			data-filter-value={value}
			data-section-key={sectionKey}
			spotlightId={spotlightId}
		>
			<span className={css.checkboxSquare}>
				{checked && (
					<svg viewBox="0 0 24 24" className={css.checkIcon}>
						<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
					</svg>
				)}
			</span>
			<span className={css.sortOptionLabel}>{label}</span>
		</SpottableButton>
	);

	// Features, quality and source are fixed lists, each cleared on its own the way a facet is.
	const renderOptionSection = (key, title, options, idPrefix) => {
		const selected = filters[FILTER_FIELDS[key]];
		return renderSection(key, title, countLabel(selected.length), () => (
			<>
				{renderClearGroup(key, selected.length)}
				{options.map((option) => renderCheckRow({
					key: option.key,
					label: $L(option.label),
					checked: selected.includes(option.key),
					value: option.key,
					sectionKey: key,
					spotlightId: `filter-${idPrefix}-${option.key}`,
					onToggle: handleFilterToggle
				}))}
			</>
		));
	};

	// One collapsible group per facet, left out entirely when the library holds
	// no values for it.
	const renderFacetSection = (facetKey, title, values) => {
		if (!values || values.length === 0) return null;
		const selected = filters[FILTER_FIELDS[facetKey]];
		const {chosen, searchable, noMatches, visible, remaining} = facetRows(values, selected, facetQuery, facetLimit);
		// Tags and genres are whatever the library owner typed, and a spotlight
		// id ends up in a CSS selector, so the position identifies the row.
		return renderSection(facetKey, title, countLabel(chosen), () => (
			<>
				{renderClearGroup(facetKey, selected.length)}
				{searchable && (
					<div className={`${css.searchWrap} ${css.facetSearch}`}>
						<Icon path={SEARCH_ICON} className={css.searchIcon} />
						<SpottableInput
							type="text"
							className={css.searchField}
							placeholder={title}
							value={facetQuery}
							onChange={handleFacetQueryChange}
							spotlightId={`filter-${facetKey}-search`}
							autoComplete="off"
						/>
					</div>
				)}
				{visible.map((option, index) => renderCheckRow({
					key: option.value,
					label: option.name,
					checked: selected.includes(option.value),
					value: option.value,
					sectionKey: facetKey,
					spotlightId: `filter-${facetKey}-${index}`,
					onToggle: handleFilterToggle
				}))}
				{noMatches && <div className={css.facetNoResults}>{$L('No results')}</div>}
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

	// Only video holds a picture quality or a disc source worth filtering on.
	const showVideoFilters = !isMusicLibrary && !isBookLibrary && !isPlaylistLibrary;
	// Emby's items query has no 4K flag and its series status holds only
	// continuing and ended, so those options stay out of the panel there.
	// Plex can't filter on series status, likes, subtitles, trailers, extras, theme media, 3D or disc source.
	const onPlex = libraryServerType === 'plex';
	const supported = (options) => options.filter(o => (!o.jellyfinOnly || libraryServerType !== 'emby') && !(onPlex && o.plexless));
	const musicTitle = musicGridView ? MUSIC_TITLES[musicContentType]?.() : null;
	const displayName = genreFilter || studioFilter || musicTitle || library?.Name || '';
	const titleProps = {isFolderView, folderStack, rootName: library?.Name, displayName, shownCount, onBreadcrumb: handleFolderBreadcrumb};
	const genreLibraryName = genreLibraries.find((lib) => lib.Id === parentId)?.Name || null;
	const groupTabBarTabs = useMemo(() => (
		groupTabs ? groups.map((group) => ({id: group.name, label: `${group.name} (${group.items.length})`})) : null
	), [groupTabs, groups]);

	const backdropsEnabled = !settings?.hideBackdropsInLibraries;

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

	if (isBookBrowseHome) {
		return (
			<BookBrowse
				key={library.Id}
				library={library}
				api={effectiveApi}
				serverUrl={effectiveServerUrl}
				screen={bookScreen}
				onOpenScreen={handleOpenBookScreen}
				onSelectItem={handleBookScreenSelect}
				onOpenGrid={handleOpenBookGrid}
				onPlay={handleBookScreenPlay}
				onSearch={onSearch}
				backHandlerRef={backHandlerRef}
				settingsPreview={settingsPreview}
			/>
		);
	}

	if (isMusicBrowseHome && musicScreen) {
		return (
			<MusicCategoryScreen
				screen={musicScreen}
				library={library}
				api={effectiveApi}
				serverUrl={effectiveServerUrl}
				onSelectItem={handleMusicScreenSelect}
				onPlay={handleMusicScreenPlay}
				onBack={handleCloseMusicScreen}
				onOpenScreen={setMusicScreen}
				onOpenSongsGrid={handleOpenSongsGrid}
				onSearch={onSearch}
				backHandlerRef={backHandlerRef}
			/>
		);
	}

	if (isMusicBrowseHome) {
		return (
			<MusicBrowse
				library={library}
				api={effectiveApi}
				serverUrl={effectiveServerUrl}
				onSelectItem={onSelectItem}
				onOpenGrid={handleOpenMusicCategory}
				onPlay={onPlay}
				onSearch={onSearch}
				onHome={onHome}
				backHandlerRef={backHandlerRef}
				settingsPreview={settingsPreview}
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
			{isDocked && (
				<LibraryDock
					{...titleProps}
					{...controlProps}
					displayLabel={displayLabel}
					showLetters={showLetters}
					onLetterSelect={handleLetterSelect}
				/>
			)}
			<div className={isDocked ? `${css.content} ${css.contentDocked}` : css.content}>
				{libraryStyle === 'classic' && (
					<div className={css.header}>
						<div className={css.headerSide} />
						<div className={css.headerTitle}>
							<LibraryTitle {...titleProps} />
						</div>
						<div className={css.headerSide}>
							<div className={css.searchWrap}>
								<Icon path={SEARCH_ICON} className={css.searchIcon} />
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
				)}
				{libraryStyle === 'modern' && (
					<>
						<div className={css.modernTitle}>
							<LibraryTitle {...titleProps} />
						</div>
						<ModernBar
							{...controlProps}
							onKeyDown={showLetters ? handleBarKeyDownLetters : toolbarKeyDown}
						/>
					</>
				)}

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

				{libraryStyle === 'classic' && (
					<ToolbarContainer className={css.toolbar} spotlightId={ownId('library-toolbar')} onKeyDown={toolbarKeyDown}>
						<SpottableButton className={css.toolbarBtn} onClick={onHome} spotlightId="library-home-btn">
							<Icon path={HOME_ICON} className={css.toolbarIcon} />
						</SpottableButton>
						<SpottableButton className={css.toolbarBtn} onClick={handleOpenSort} spotlightId="library-sort-btn">
							<Icon path={SORT_ICON} className={css.toolbarIcon} />
						</SpottableButton>
						{canGroup && (
							<SpottableButton className={css.toolbarBtn} onClick={handleOpenGroupBy} spotlightId="library-group-btn">
								<Icon path={GROUP_ICON} className={css.toolbarIcon} />
							</SpottableButton>
						)}
						{isSongs && (
							<SpottableButton className={css.toolbarBtn} onClick={handleShuffle} spotlightId="library-shuffle-btn">
								<Icon path={SHUFFLE_ICON} className={css.toolbarIcon} />
							</SpottableButton>
						)}
						{!isMusicLibrary && (
							<SpottableButton className={css.toolbarBtn} onClick={handleOpenDisplay} spotlightId="library-settings-btn">
								<Icon path={SETTINGS_ICON} className={css.toolbarIcon} />
							</SpottableButton>
						)}
						{showLetters && (
							<div className={css.letterNav}>
								<Letters onSelect={handleLetterSelect} />
							</div>
						)}
					</ToolbarContainer>
				)}
				{libraryStyle === 'modern' && showLetters && (
					<ModernLetters onSelect={handleLetterSelect} settingsPreview={settingsPreview} />
				)}

				{groupTabs && (
					<div className={css.groupTabs} onKeyDown={handleTabsKeyDown[libraryStyle]}>
						<DetailsTabBar
							tabs={groupTabBarTabs}
							activeId={activeGroup.name}
							activeSpotlightId={GROUP_TAB_ID}
							onActivate={handleGroupTab}
							expanded={false}
							spotlightId={ownId('library-group-tabs')}
						/>
					</div>
				)}

				<GridContainer className={css.gridContainer} spotlightId={ownId('library-grid-area')}>
					{(isLoading || !storageReady) && items.length === 0 ? (
						<div className={css.gridWrapper}>
							<LibrarySkeleton
								gridWidth={gridWidth}
								cardWidth={cardWidth}
								posterHeight={posterHeight}
								padX={cellPadX}
								minRowGap={MIN_ROW_GAP}
								showText={showCardText}
								horizontal={gridDirection === 'horizontal'}
							/>
						</div>
					) : items.length === 0 ? (
						<div className={css.empty}>{$L('No items found')}</div>
					) : showGroupRows ? (
						<div className={css.groupRows} ref={groupRowsRef} onKeyDownCapture={isDocked ? handleRowsKeyDownDocked : undefined}>
							{groups.map((group, index) => (
								<MediaRow
									key={group.name}
									rowId={`library-group-${group.name}`}
									spotlightId={settingsPreview ? `library-preview-row-${index}` : `library-group-row-${index}`}
									title={group.name}
									items={group.items}
									serverUrl={effectiveServerUrl}
									cardType={playlistGrouped ? 'square' : 'portrait'}
									rowIndex={index}
									onSelectItem={onSelectItem}
									onFocusItem={setFocusedItem}
									onNavigateUp={handleGroupNavigateUp}
									onNavigateDown={handleGroupNavigateDown}
									posterLabels
								/>
							))}
						</div>
					) : (
						<div className={css.gridWrapper} {...menuHold}>
							{gridDirection === 'vertical' ? (
								<TileGrid
									key={libraryStyle}
									className={css.grid}
									cbScrollTo={getGridScrollTo}
									dataSize={items.length}
									itemSize={gridItemSize}
									renderTile={renderTile}
									resetKey={`${activeGroup?.name}|${items[0]?.Id}`}
									onFocusIndex={handleTileFocus}
									onKeyDown={gridKeyDown}
									onClick={handleItemClick}
									spotlightId="library-grid"
								/>
							) : (
								<GridList
									key={libraryStyle}
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
									onKeyDown={gridKeyDown}
									spotlightId={ownId('library-grid')}
								/>
							)}
						</div>
					)}
				</GridContainer>
			</div>

			{showSortPanel && (
				<div className={css.sortPanelOverlay} onClick={handleCloseSortPanel}>
					<PanelContainer
						className={css.sortPanel}
						onFocus={keepFocusInView}
						spotlightId="sort-panel"
						onClick={stopPropagation}
					>
						<h2 className={css.sortPanelTitle}>{$L('Sort & Filter')}</h2>

						{renderCheckRow({
							label: $L('Show Alphabet'),
							checked: showAlphabet,
							spotlightId: 'filter-show-alphabet',
							onToggle: handleToggleAlphabet
						})}
						{canFolderView && renderCheckRow({
							label: $L('Folder View'),
							checked: isFolderView,
							spotlightId: 'filter-folder-view',
							onToggle: handleToggleFolderView
						})}

						{renderSection(SORT_SECTION, $L('Sort By'), sortLabel, () => (
							sortKeys.map((key, index) => renderRadioRow({
								key,
								label: librarySortLabel(key, isMusicLibrary),
								selected: sortKey === key,
								value: key,
								spotlightId: `sort-option-${index}`,
								onClick: handleSortSelect,
								trailing: sortKey === key && <Icon path={sortAscending ? ARROW_UP_ICON : ARROW_DOWN_ICON} className={css.sortArrow} />
							}))
						))}

						{isMusicLibrary && renderSection('music', $L('Show'), chosenLabel(MUSIC_CONTENT_TYPES, musicContentType), () => (
							MUSIC_CONTENT_TYPES.map((ct) => renderRadioRow({
								key: ct.key,
								label: $L(ct.label),
								selected: musicContentType === ct.key,
								value: ct.key,
								spotlightId: `music-content-${ct.key}`,
								onClick: handleMusicContentSelect
							}))
						))}

						{renderSection('favorites', $L('Filters'), filters.favoritesOnly ? $L('Favorites') : null, () => renderCheckRow({
							label: $L('Favorites'),
							checked: filters.favoritesOnly,
							spotlightId: 'filter-favorites',
							onToggle: handleToggleFavorites
						}))}

						{!isMusicLibrary && renderSection('played', isBookLibrary ? $L('Reading Status') : $L('Played Status'), filters.playedFilter === 'all' ? null : playedLabel(filters.playedFilter, isBookLibrary), () => (
							PLAYED_FILTERS.map((option) => renderRadioRow({
								key: option.key,
								label: playedLabel(option.key, isBookLibrary),
								selected: filters.playedFilter === option.key,
								value: option.key,
								spotlightId: `filter-played-${option.key}`,
								onClick: handlePlayedFilterSelect
							}))
						))}

						{!onPlex && renderSection('liked', $L('My Rating'), chosenLabel(LIKED_FILTERS, filters.likedFilter), () => (
							LIKED_FILTERS.map((option) => renderRadioRow({
								key: option.key,
								label: $L(option.label),
								selected: filters.likedFilter === option.key,
								value: option.key,
								spotlightId: `filter-liked-${option.key}`,
								onClick: handleLikedFilterSelect
							}))
						))}

						{isSeriesLibrary && !onPlex && renderSection('series', $L('Series Status'), chosenLabel(SERIES_FILTERS, filters.seriesFilter), () => (
							supported(SERIES_FILTERS).map((option) => renderRadioRow({
								key: option.key,
								label: $L(option.label),
								selected: filters.seriesFilter === option.key,
								value: option.key,
								spotlightId: `filter-series-${option.key}`,
								onClick: handleSeriesFilterSelect
							}))
						))}

						{showVideoFilters && !onPlex && renderOptionSection('features', $L('Features'), supported(FEATURE_FILTERS), 'feature')}

						{showVideoFilters && renderOptionSection('quality', $L('Quality'), supported(QUALITY_FILTERS), 'quality')}

						{showVideoFilters && !onPlex && renderOptionSection('source', $L('Source'), VIDEO_SOURCE_FILTERS, 'source')}

						{!genreFilter && !openedGenre && renderFacetSection('genres', $L('Genres'), facetValues?.genres)}
						{renderFacetSection('ratings', $L('Parental Rating'), facetValues?.officialRatings)}
						{renderFacetSection('tags', $L('Tags'), facetValues?.tags)}
						{renderFacetSection('years', $L('Years'), facetValues?.years?.map(String))}
						{renderFacetSection('audio', $L('Audio Language'), facetValues?.audioLanguages)}
						{renderFacetSection('subtitles', $L('Subtitle Language'), facetValues?.subtitleLanguages)}

						{hasActiveFilters(filters) && (
							<div className={css.filterSection}>
								<SpottableButton
									className={`${css.sortOption} ${css.clearGroup}`}
									onClick={handleClearFilters}
									spotlightId="filter-clear"
								>
									<Icon path={CLEAR_FILTERS_ICON} className={css.clearGroupIcon} />
									<span className={css.sortOptionLabel}>{$L('Clear Filters')}</span>
								</SpottableButton>
							</div>
						)}

						{isGenreMode && genreLibraries.length > 0 && renderSection('library', $L('Library'), genreLibraryName, () => (
							<>
								{renderRadioRow({
									label: $L('All Libraries'),
									selected: !parentId,
									value: '',
									spotlightId: 'filter-library-all',
									onClick: handleGenreLibrarySelect
								})}
								{genreLibraries.map((lib) => renderRadioRow({
									key: lib.Id,
									label: lib.Name,
									selected: parentId === lib.Id,
									value: lib.Id,
									onClick: handleGenreLibrarySelect
								}))}
							</>
						))}
					</PanelContainer>
				</div>
			)}

			{showSettingsPanel && (
				<div className={css.sortPanelOverlay} onClick={handleCloseSettingsPanel}>
					<PanelContainer
						className={`${css.sortPanel} ${css.dialogNarrow}`}
						onFocus={keepFocusInView}
						spotlightId="settings-panel"
						onClick={stopPropagation}
					>
						<h2 className={css.sortPanelTitle}>{$L('Display')}</h2>

						<div className={css.dialogHeading}>{$L('Scroll Direction')}</div>
						{SCROLL_DIRECTIONS.map((option) => renderRadioRow({
							key: option.key,
							label: option.label(),
							selected: gridDirection === option.key,
							value: option.key,
							spotlightId: `display-scroll-${option.key}`,
							onClick: handleScrollDirectionSelect
						}))}

						{!isPlaylistLibrary && (
							<>
								<div className={css.dialogHeading}>{$L('Image Type')}</div>
								{IMAGE_TYPE_OPTIONS.map((option) => renderRadioRow({
									key: option.key,
									label: option.label(),
									selected: imageType === option.key,
									value: option.key,
									spotlightId: `display-image-${option.key}`,
									onClick: handleImageTypeSelect
								}))}
							</>
						)}

						{!isBanner && (
							<>
								<div className={css.dialogHeading}>{$L('Poster Size')}</div>
								{POSTER_SIZE_OPTIONS.map((option) => renderRadioRow({
									key: option.key,
									label: option.label(),
									selected: imageSize === option.key,
									value: option.key,
									spotlightId: `display-size-${option.key}`,
									onClick: handlePosterSizeSelect
								}))}
							</>
						)}

						{isPlaylistLibrary && (
							<>
								<div className={css.dialogHeading}>{$L('Grouping')}</div>
								{renderCheckRow({
									label: $L('Group by Type'),
									checked: playlistGroupingOn,
									spotlightId: 'display-group-by-type',
									onToggle: handleTogglePlaylistGrouping
								})}
								<div className={css.dialogHeading}>{$L('Playlist Types')}</div>
								{PLAYLIST_CATEGORIES.map((type) => renderCheckRow({
									key: type,
									label: PLAYLIST_TYPE_LABELS[type](),
									checked: playlistTypes.includes(type),
									value: type,
									spotlightId: `display-playlist-${type}`,
									onToggle: handlePlaylistTypeToggle
								}))}
							</>
						)}
					</PanelContainer>
				</div>
			)}

			{showGroupDialog && (
				<div className={css.sortPanelOverlay} onClick={handleCloseGroupDialog}>
					<PanelContainer
						className={`${css.sortPanel} ${css.dialogNarrow}`}
						spotlightId="group-by-panel"
						onClick={stopPropagation}
					>
						<h2 className={css.sortPanelTitle}>{$L('Group By')}</h2>
						<div className={css.dialogRule} />
						{LIBRARY_GROUP_OPTIONS.map((option) => renderRadioRow({
							key: option,
							label: groupByLabel(option),
							selected: groupBy === option,
							value: option,
							spotlightId: `group-by-${option}`,
							onClick: handleGroupBySelect
						}))}
					</PanelContainer>
				</div>
			)}
		</div>
	);
};

export default Library;
