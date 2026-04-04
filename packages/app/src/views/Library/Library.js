import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import {useAuth} from '../../context/AuthContext';
import {createApiForServer} from '../../services/jellyfinApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getPrimaryImageId, formatDuration} from '../../utils/helpers';
import {useSettings} from '../../context/SettingsContext';
import {fetchRatings, buildDisplayRatings} from '../../services/mdblistApi';
import {getRtFallbackIcon} from '../../components/icons/rtIcons';
import {useStorage} from '../../hooks/useStorage';
import {KEYS} from '../../utils/keys';

import css from './Library.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SortPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SettingsPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const SORT_OPTIONS = [
	{key: 'SortName', field: 'SortName', order: 'Ascending', label: 'Name'},
	{key: 'DateCreated', field: 'DateCreated', order: 'Descending', label: 'Date Added'},
	{key: 'PremiereDate', field: 'PremiereDate', order: 'Descending', label: 'Premiere Date'},
	{key: 'OfficialRating', field: 'OfficialRating', order: 'Ascending', label: 'Rating'},
	{key: 'CommunityRating', field: 'CommunityRating', order: 'Descending', label: 'Community Rating'},
	{key: 'CriticRating', field: 'CriticRating', order: 'Descending', label: 'Critic Rating'},
	{key: 'DatePlayed', field: 'DatePlayed', order: 'Descending', label: 'Last Played'},
	{key: 'Runtime', field: 'Runtime', order: 'Ascending', label: 'Runtime'}
];

const MUSIC_SORT_OPTIONS = [
	{key: 'SortName', field: 'SortName', order: 'Ascending', label: 'Name'},
	{key: 'DateCreated', field: 'DateCreated', order: 'Descending', label: 'Date Added'},
	{key: 'CommunityRating', field: 'CommunityRating', order: 'Descending', label: 'Community Rating'},
	{key: 'DatePlayed', field: 'DatePlayed', order: 'Descending', label: 'Last Played'},
	{key: 'AlbumArtist', field: 'AlbumArtist,SortName', order: 'Ascending', label: 'Album Artist'}
];

const MUSIC_CONTENT_TYPES = [
	{key: 'albums', label: 'Albums', itemType: 'MusicAlbum'},
	{key: 'artists', label: 'Artists', itemType: 'MusicArtist'}
];

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const Library = ({library, genreFilter, onSelectItem, onViewPhoto, onHome, backHandlerRef}) => {
const {api, serverUrl} = useAuth();
const {settings} = useSettings();

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
const isPlaylistLibrary = library?.CollectionType?.toLowerCase() === 'playlists';
const isSquareDefault = isMusicLibrary || isPlaylistLibrary;

const [allItems, setAllItems] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [totalCount, setTotalCount] = useState(0);
const [sortKey, setSortKey] = useState('SortName');
const [favoritesOnly, setFavoritesOnly] = useState(false);
const [watchedOnly, setWatchedOnly] = useState(false);
const [musicContentType, setMusicContentType] = useState('albums');
const [startLetter, setStartLetter] = useState(null);
const [showSortPanel, setShowSortPanel] = useState(false);
const [showSettingsPanel, setShowSettingsPanel] = useState(false);
const [focusedItem, setFocusedItem] = useState(null);
const [focusedRatings, setFocusedRatings] = useState([]);
const libraryId = library?.Id || (genreFilter ? `genre-${genreFilter}` : 'default');
const [imageSize, setImageSize] = useStorage(`library_imageSize_${libraryId}`, 'medium');
const [imageType, setImageType] = useStorage(`library_imageType_${libraryId}`, isSquareDefault ? 'square' : 'poster');
const [gridDirection, setGridDirection] = useStorage(`library_gridDirection_${libraryId}`, 'vertical');
const [folderView, setFolderView] = useStorage(`library_folderView_${libraryId}`, 'off');
const isFolderView = folderView === 'on';
const [folderStack, setFolderStack] = useState([]);
const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : library?.Id;
const isGenreMode = !!genreFilter;

const loadingMoreRef = useRef(false);
const apiFetchIndexRef = useRef(0);
const initialFocusDoneRef = useRef(false);
const ratingsTimeoutRef = useRef(null);
const ratingsAbortRef = useRef(null);

const items = useMemo(() => {
if (!startLetter) {
return allItems;
}
return allItems.filter(item => {
const name = item.Name || '';
const firstChar = name.charAt(0).toUpperCase();
if (startLetter === '#') {
return !/[A-Z]/.test(firstChar);
}
return firstChar === startLetter;
});
}, [allItems, startLetter]);

const itemsRef = useRef(items);
itemsRef.current = items;

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
if (!library && !genreFilter) return;

if (append && loadingMoreRef.current) return;

if (append) {
loadingMoreRef.current = true;
}

try {
const sortOption = SORT_OPTIONS.find(o => o.key === sortKey) || MUSIC_SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0];

const filters = [];
if (favoritesOnly) filters.push('IsFavorite');
if (watchedOnly) filters.push('IsPlayed');

if (isFolderView) {
	const params = {
		ParentId: currentFolderId,
		StartIndex: startIndex,
		Limit: 150,
		SortBy: `IsFolder,${sortOption.field}`,
		SortOrder: sortOption.order,
		EnableTotalRecordCount: true,
		Fields: 'PrimaryImageAspectRatio,SortName,Path,ChildCount,MediaSourceCount,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData'
	};
	if (filters.length > 0) params.Filters = filters.join(',');

	const result = await effectiveApi.getItems(params);
	const newItems = result.Items || [];
	apiFetchIndexRef.current = append ? apiFetchIndexRef.current + newItems.length : newItems.length;
	setAllItems(prev => append ? [...prev, ...newItems] : newItems);
	setTotalCount(result.TotalRecordCount || 0);
} else {
	const params = {
		StartIndex: startIndex,
		Limit: 150,
		SortBy: sortOption.field,
		SortOrder: sortOption.order,
		Recursive: true,
		EnableTotalRecordCount: true,
		Fields: 'ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,ProviderIds,UserData'
	};

	if (library?.Id) params.ParentId = library.Id;
	if (genreFilter) params.Genres = genreFilter;

	const itemTypes = getItemTypeForLibrary();
	if (itemTypes) params.IncludeItemTypes = itemTypes;

	const excludeTypes = getExcludeItemTypes();
	if (excludeTypes) params.ExcludeItemTypes = excludeTypes;

	const collectionType = library?.CollectionType?.toLowerCase();
	if (collectionType === 'movies') params.CollapseBoxSetItems = false;

	if (filters.length > 0) params.Filters = filters.join(',');

	const result = isMusicLibrary && musicContentType === 'artists'
		? await effectiveApi.getAlbumArtists({
			ParentId: library.Id,
			StartIndex: startIndex,
			Limit: 150,
			SortBy: sortOption.field,
			SortOrder: sortOption.order,
			EnableTotalRecordCount: true,
			Fields: 'PrimaryImageAspectRatio,SortName,ProductionYear,ImageTags,UserData',
			ImageTypeLimit: 1,
			EnableImageTypes: 'Primary,Backdrop,Thumb',
			...(filters.length > 0 ? {Filters: filters.join(',')} : {})
		})
		: await effectiveApi.getItems(params);
	let newItems = result.Items || [];

	if (excludeTypes && newItems.length > 0) {
		newItems = newItems.filter(item => item.Type !== 'BoxSet');
	}

	apiFetchIndexRef.current = append ? apiFetchIndexRef.current + (result.Items?.length || 0) : (result.Items?.length || 0);
	setAllItems(prev => append ? [...prev, ...newItems] : newItems);
	setTotalCount(result.TotalRecordCount || 0);
}
} catch (err) { console.error('[Library] loadItems error:', err); } finally {
setIsLoading(false);
loadingMoreRef.current = false;
}
}, [effectiveApi, library, genreFilter, sortKey, favoritesOnly, watchedOnly, isFolderView, currentFolderId, isMusicLibrary, musicContentType, getItemTypeForLibrary, getExcludeItemTypes]);

useEffect(() => {
if (library || genreFilter) {
setIsLoading(true);
setAllItems([]);
loadingMoreRef.current = false;
apiFetchIndexRef.current = 0;
initialFocusDoneRef.current = false;
loadItems(0, false);
}
}, [library, sortKey, favoritesOnly, watchedOnly, musicContentType, isFolderView, currentFolderId, loadItems, genreFilter]);

useEffect(() => {
if (items.length > 0 && !isLoading && !initialFocusDoneRef.current) {
setTimeout(() => {
Spotlight.focus('library-grid');
initialFocusDoneRef.current = true;
}, 100);
}
}, [items.length, isLoading]);

useEffect(() => {
if (startLetter && items.length > 0 && !isLoading) {
setTimeout(() => {
Spotlight.focus('library-grid');
}, 100);
}
}, [startLetter, items.length, isLoading]);

const handleItemClick = useCallback((ev) => {
const itemIndex = ev.currentTarget?.dataset?.index;
if (itemIndex === undefined) return;

const item = itemsRef.current[parseInt(itemIndex, 10)];
if (item) {
		if (isFolderView && item.IsFolder) {
			setFolderStack(prev => [...prev, {id: item.Id, name: item.Name}]);
			return;
		}
		if (item.Type === 'Photo' && onViewPhoto) {
			onViewPhoto(item, itemsRef.current);
		} else {
			onSelectItem?.(item);
		}
	}
}, [isFolderView, onSelectItem, onViewPhoto]);

const handleScrollStop = useCallback(() => {
	if (apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
		loadItems(apiFetchIndexRef.current, true);
	}
}, [totalCount, isLoading, loadItems]);

const handleLetterSelect = useCallback((ev) => {
const letter = ev.currentTarget?.dataset?.letter;
if (letter) {
setStartLetter(letter === startLetter ? null : letter);
}
}, [startLetter]);

const handleToolbarKeyDown = useCallback((e) => {
if (e.keyCode === KEYS.DOWN) {
e.preventDefault();
e.stopPropagation();
Spotlight.focus('library-grid');
}
}, []);

const handleGridKeyDown = useCallback((e) => {
if (e.keyCode === KEYS.UP) {
const grid = document.querySelector(`.${css.grid}`);
if (grid) {
const scrollTop = grid.scrollTop || 0;
if (scrollTop < 50) {
e.preventDefault();
e.stopPropagation();
Spotlight.focus('library-letter-hash');
}
}
}
}, []);

const handleToggleSortPanel = useCallback(() => {
setShowSortPanel(prev => !prev);
}, []);

const handleCloseSortPanel = useCallback(() => {
setShowSortPanel(false);
}, []);

useEffect(() => {
	if (!backHandlerRef) return;
	backHandlerRef.current = () => {
		if (showSettingsPanel) {
			setShowSettingsPanel(false);
			return true;
		}
		if (showSortPanel) {
			setShowSortPanel(false);
			return true;
		}
		if (isFolderView && folderStack.length > 0) {
			setFolderStack(prev => prev.slice(0, -1));
			return true;
		}
		return false;
	};
	return () => { if (backHandlerRef) backHandlerRef.current = null; };
}, [backHandlerRef, showSortPanel, showSettingsPanel, isFolderView, folderStack]);

useEffect(() => {
	return () => {
		if (ratingsTimeoutRef.current) clearTimeout(ratingsTimeoutRef.current);
		if (ratingsAbortRef.current && typeof ratingsAbortRef.current.abort === 'function') ratingsAbortRef.current.abort();
	};
}, []);

useEffect(() => {
	if (showSortPanel) {
		setTimeout(() => {
			Spotlight.focus('sort-option-0');
		}, 100);
	}
}, [showSortPanel]);

useEffect(() => {
	if (showSettingsPanel) {
		setTimeout(() => {
			Spotlight.focus('settings-image-size');
		}, 100);
	}
}, [showSettingsPanel]);

const handleSortSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.sortKey;
if (key) {
setSortKey(key);
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('library-grid'), 100);
}
}, []);

const handleToggleFavorites = useCallback(() => {
setFavoritesOnly(prev => !prev);
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('library-grid'), 100);
}, []);

const handleToggleWatched = useCallback(() => {
	setWatchedOnly(prev => !prev);
	setShowSortPanel(false);
	setTimeout(() => Spotlight.focus('library-grid'), 100);
}, []);

const handleToggleSettingsPanel = useCallback(() => {
	setShowSettingsPanel(prev => !prev);
}, []);

const handleCloseSettingsPanel = useCallback(() => {
	setShowSettingsPanel(false);
}, []);

const stopPropagation = useCallback((e) => e.stopPropagation(), []);

const handleCycleImageSize = useCallback(() => {
	const sizes = ['small', 'medium', 'large'];
	const idx = sizes.indexOf(imageSize);
	setImageSize(sizes[(idx + 1) % sizes.length]);
}, [imageSize, setImageSize]);

const handleCycleImageType = useCallback(() => {
	const types = ['poster', 'thumbnail'];
	const idx = types.indexOf(imageType);
	setImageType(types[(idx + 1) % types.length]);
}, [imageType, setImageType]);

const handleCycleGridDirection = useCallback(() => {
	const dirs = ['vertical', 'horizontal'];
	const idx = dirs.indexOf(gridDirection);
	setGridDirection(dirs[(idx + 1) % dirs.length]);
}, [gridDirection, setGridDirection]);

const handleToggleFolderView = useCallback(() => {
	setFolderView(isFolderView ? 'off' : 'on');
	setFolderStack([]);
}, [isFolderView, setFolderView]);

const handleFolderBreadcrumb = useCallback((ev) => {
	const depth = parseInt(ev.currentTarget?.dataset?.depth, 10);
	if (!isNaN(depth)) setFolderStack(prev => prev.slice(0, depth));
}, []);

const handleMusicContentSelect = useCallback((ev) => {
	const key = ev.currentTarget?.dataset?.contentKey;
	if (key) {
		setMusicContentType(key);
		setShowSortPanel(false);
		setTimeout(() => Spotlight.focus('library-grid'), 100);
	}
}, []);

const effectiveImageType = isSquareDefault ? 'square' : imageType;
const isWideImage = effectiveImageType === 'thumbnail';
const isSquareImage = effectiveImageType === 'square';
const activeSortOptions = isMusicLibrary ? MUSIC_SORT_OPTIONS : SORT_OPTIONS;
const posterHeight = isSquareImage
	? ({small: 140, medium: 180, large: 240}[imageSize] || 180)
	: isWideImage
		? ({small: 120, medium: 160, large: 210}[imageSize] || 160)
		: ({small: 200, medium: 270, large: 350}[imageSize] || 270);

const gridItemSize = isSquareImage
	? ({small: {minWidth: 130, minHeight: 180}, medium: {minWidth: 170, minHeight: 220}, large: {minWidth: 220, minHeight: 280}}[imageSize] || {minWidth: 170, minHeight: 220})
	: isWideImage
		? ({small: {minWidth: 220, minHeight: 170}, medium: {minWidth: 280, minHeight: 220}, large: {minWidth: 360, minHeight: 280}}[imageSize] || {minWidth: 280, minHeight: 220})
		: ({small: {minWidth: 130, minHeight: 270}, medium: {minWidth: 170, minHeight: 340}, large: {minWidth: 220, minHeight: 430}}[imageSize] || {minWidth: 170, minHeight: 340});

const renderItem = useCallback(({index, ...rest}) => {
const item = itemsRef.current[index];
const isNearEnd = index >= items.length - 50;
if (isNearEnd && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
loadItems(apiFetchIndexRef.current, true);
}

if (!item) {
return (
<div {...rest} className={css.itemCard}>
<div className={css.posterPlaceholder} style={{height: posterHeight}}>
<div className={css.loadingPlaceholder} />
</div>
</div>
);
}

const isFolder = isFolderView && item.IsFolder;
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
className={`${css.itemCard} ${isSquareImage ? css.squareCard : ''}`}
onClick={handleItemClick}
// eslint-disable-next-line react/jsx-no-bind
onFocus={() => {
	setFocusedItem(item);
	if (settings?.mdblistEnabled && settings?.useMoonfinPlugin) {
		if (ratingsTimeoutRef.current) {
			clearTimeout(ratingsTimeoutRef.current);
		}
		if (ratingsAbortRef.current && typeof ratingsAbortRef.current.abort === 'function') {
			ratingsAbortRef.current.abort();
		}
		ratingsTimeoutRef.current = setTimeout(() => {
			const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
			ratingsAbortRef.current = controller;
			const signal = controller ? controller.signal : undefined;
			fetchRatings(effectiveServerUrl, item, {signal}).then(r => {
				if (!(controller && controller.signal.aborted)) {
					const display = buildDisplayRatings(r, effectiveServerUrl);
					setFocusedRatings(display);
				}
			}).catch(() => {
				if (!(controller && controller.signal.aborted)) {
					setFocusedRatings([]);
				}
			});
		}, 300);
	} else {
		setFocusedRatings([]);
	}
}}
data-index={index}
>
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
{isFolder && (
<div className={css.folderLabel}>
<svg viewBox="0 0 24 24" className={css.folderIcon}><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
<span>{item.Name}</span>
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
</SpottableDiv>
);
}, [effectiveServerUrl, handleItemClick, items.length, totalCount, isLoading, loadItems, effectiveImageType, posterHeight, isSquareImage, isFolderView, settings]);

const currentSort = activeSortOptions.find(o => o.key === sortKey);
const sortLabel = currentSort ? $L(currentSort.label) : $L('Name');
const filterParts = [];
if (favoritesOnly) filterParts.push($L('Favorites'));
if (watchedOnly) filterParts.push($L('Watched'));
const filterLabel = filterParts.length > 0 ? filterParts.join(' & ') : $L('All items');
const folderName = folderStack.length > 0 ? folderStack[folderStack.length - 1].name : library?.Name;
const displayName = genreFilter || library?.Name || '';
const statusText = isFolderView
	? $L("Browsing folders in '{folderName}' sorted by {sortLabel}").replace('{folderName}', folderName).replace('{sortLabel}', sortLabel)
	: genreFilter
		? (library
			? $L("Showing {filterLabel} from '{genreFilter}' in '{libraryName}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{genreFilter}', genreFilter).replace('{libraryName}', library.Name).replace('{sortLabel}', sortLabel)
			: $L("Showing {filterLabel} from '{genreFilter}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{genreFilter}', genreFilter).replace('{sortLabel}', sortLabel))
		: $L("Showing {filterLabel} from '{libraryName}' sorted by {sortLabel}").replace('{filterLabel}', filterLabel).replace('{libraryName}', library?.Name).replace('{sortLabel}', sortLabel);

if (!library && !genreFilter) {
return (
<div className={css.page}>
<div className={css.empty}>{$L('No library selected')}</div>
</div>
);
}

const focusedInfoParts = [];
if (focusedItem) {
	if (focusedItem.ProductionYear) focusedInfoParts.push(String(focusedItem.ProductionYear));
	if (focusedItem.OfficialRating) focusedInfoParts.push(focusedItem.OfficialRating);
	if (focusedItem.RunTimeTicks > 0 && focusedItem.Type !== 'Series') {
		const dur = formatDuration(focusedItem.RunTimeTicks);
		if (dur !== '0m') focusedInfoParts.push(dur);
	}
}

const ratingElements = [];
if (focusedItem && focusedItem.CommunityRating) {
	ratingElements.push(
		<span key="community" className={css.pluginRating}>
			<span className={css.communityStar}>{"\u2605"}</span>
			<span>{focusedItem.CommunityRating.toFixed(1)}</span>
		</span>
	);
}
if (focusedItem && !(settings?.mdblistEnabled && settings?.useMoonfinPlugin) && focusedItem.CriticRating != null) {
	ratingElements.push(
		<span key="rt" className={css.pluginRating}>
			<img className={css.ratingIcon} src={getRtFallbackIcon(focusedItem.CriticRating)} alt="Rotten Tomatoes" />
			<span>{focusedItem.CriticRating}%</span>
		</span>
	);
}
for (let i = 0; i < focusedRatings.length; i++) {
	const r = focusedRatings[i];
	ratingElements.push(
		<span key={'r' + i} className={css.pluginRating}>
			{r.iconUrl && <img className={css.ratingIcon} src={r.iconUrl} alt={r.name} />}
			<span>{r.formatted}</span>
		</span>
	);
}

return (
<div className={css.page}>
<div className={css.content}>
<div className={css.header}>
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

{focusedItem && (
<div className={css.focusedInfo}>
	<div className={css.focusedName}>{focusedItem.Name}</div>
	<div className={css.focusedMeta}>
		{focusedInfoParts.map((part, i) => (
			<span key={i} className={css.metaItem}>{part}</span>
		))}
		{ratingElements.length > 0 && focusedInfoParts.length > 0 && (
			<span className={css.metaSeparator} />
		)}
		{ratingElements}
	</div>
</div>
)}

<ToolbarContainer className={css.toolbar} spotlightId="library-toolbar" onKeyDown={handleToolbarKeyDown}>
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
</ToolbarContainer>

<GridContainer className={css.gridContainer}>
{isLoading && items.length === 0 ? (
<div className={css.loading}>
<LoadingSpinner />
</div>
) : items.length === 0 ? (
<div className={css.empty}>{$L('No items found')}</div>
) : (
<div className={css.gridWrapper}>
<VirtualGridList
className={css.grid}
dataSize={items.length}
itemRenderer={renderItem}
itemSize={gridItemSize}
direction={gridDirection}
horizontalScrollbar="hidden"
verticalScrollbar="hidden"
spacing={20}
onScrollStop={handleScrollStop}
onKeyDown={handleGridKeyDown}
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
spotlightId="sort-panel"
onClick={stopPropagation}
>
<h2 className={css.sortPanelTitle}>{$L('Sort & Filter')}</h2>

<div className={css.sortSection}>
<div className={css.sortSectionLabel}>{$L('Sort By')}</div>
{activeSortOptions.map((option, index) => (
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
</SpottableButton>
))}
</div>

{isMusicLibrary && (
<div className={css.filterSection}>
<div className={css.sortSectionLabel}>{$L('Show')}</div>
{MUSIC_CONTENT_TYPES.map((ct) => (
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
))}
</div>
)}

<div className={css.filterSection}>
<div className={css.sortSectionLabel}>{$L('Filters')}</div>
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
<SpottableButton
className={`${css.sortOption} ${watchedOnly ? css.sortOptionActive : ''}`}
onClick={handleToggleWatched}
spotlightId="filter-watched"
>
<span className={css.checkboxSquare}>
{watchedOnly && (
<svg viewBox="0 0 24 24" className={css.checkIcon}>
<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
</svg>
)}
</span>
<span className={css.sortOptionLabel}>{$L('Watched Only')}</span>
</SpottableButton>
</div>
</SortPanelContainer>
</div>
)}

{showSettingsPanel && (
<div className={css.sortPanelOverlay} onClick={handleCloseSettingsPanel}>
<SettingsPanelContainer
className={css.sortPanel}
spotlightId="settings-panel"
onClick={stopPropagation}
>
<div className={css.settingsHeader}>{isGenreMode ? $L('GENRE') : $L('LIBRARIES')}</div>
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
<div className={css.settingLabel}>{$L('Image type')}</div>
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
{!isGenreMode && (
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