import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import {useAuth} from '../../context/AuthContext';
import {createApiForServer} from '../../services/jellyfinApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getPrimaryImageId} from '../../utils/helpers';

import css from './Library.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const SORT_OPTIONS = [
{key: 'SortName,Ascending', label: 'Name (A-Z)'},
{key: 'SortName,Descending', label: 'Name (Z-A)'},
{key: 'CommunityRating,Descending', label: 'Rating'},
{key: 'DateCreated,Descending', label: 'Date Added'},
{key: 'PremiereDate,Descending', label: 'Release Date'},
{key: 'Random,Ascending', label: 'Random'}
];

const FILTER_OPTIONS = [
{key: 'all', label: 'All'},
{key: 'Favorites', label: 'Favorites'},
{key: 'Unplayed', label: 'Unplayed'},
{key: 'Played', label: 'Played'},
{key: 'Resumable', label: 'Resumable'}
];

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const Library = ({library, onSelectItem, backHandlerRef}) => {
const {api, serverUrl} = useAuth();

// Support cross-server libraries
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

const [allItems, setAllItems] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [totalCount, setTotalCount] = useState(0);
const [sortBy, setSortBy] = useState('SortName,Ascending');
const [filter, setFilter] = useState('all');
const [startLetter, setStartLetter] = useState(null);
const [showSortModal, setShowSortModal] = useState(false);
const [showFilterModal, setShowFilterModal] = useState(false);

const loadingMoreRef = useRef(false);
const apiFetchIndexRef = useRef(0);
const initialFocusDoneRef = useRef(false);

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
return 'Video';
case 'music':
return 'MusicAlbum,MusicArtist';
case 'playlists':
return 'Playlist';
default:
return 'Movie,Series';
}
}, [library]);

const getExcludeItemTypes = useCallback(() => {
if (!library) return '';
const collectionType = library.CollectionType?.toLowerCase();

if (collectionType === 'movies' || collectionType === 'tvshows') {
return 'BoxSet';
}
return '';
}, [library]);

const loadItems = useCallback(async (startIndex = 0, append = false) => {
if (!library) return;

if (append && loadingMoreRef.current) return;

if (append) {
loadingMoreRef.current = true;
}

try {
const [sortField, sortOrder] = sortBy.split(',');
const collectionType = library.CollectionType?.toLowerCase();

const params = {
ParentId: library.Id,
StartIndex: startIndex,
Limit: 150,
SortBy: sortField,
SortOrder: sortOrder,
Recursive: true,
IncludeItemTypes: getItemTypeForLibrary(),
EnableTotalRecordCount: true,
Fields: 'ProductionYear,ImageTags'
};

const excludeTypes = getExcludeItemTypes();
if (excludeTypes) {
params.ExcludeItemTypes = excludeTypes;
}

if (collectionType === 'movies') {
params.CollapseBoxSetItems = false;
}

if (filter !== 'all') {
if (filter === 'Favorites') {
params.Filters = 'IsFavorite';
} else if (filter === 'Unplayed') {
params.Filters = 'IsUnplayed';
} else if (filter === 'Played') {
params.Filters = 'IsPlayed';
} else if (filter === 'Resumable') {
params.Filters = 'IsResumable';
}
}

const result = await effectiveApi.getItems(params);
let newItems = result.Items || [];

if (excludeTypes && newItems.length > 0) {
newItems = newItems.filter(item => item.Type !== 'BoxSet');
}

apiFetchIndexRef.current = append ? apiFetchIndexRef.current + (result.Items?.length || 0) : (result.Items?.length || 0);

setAllItems(prev => append ? [...prev, ...newItems] : newItems);
setTotalCount(result.TotalRecordCount || 0);
} catch (err) {
// Silent fail
} finally {
setIsLoading(false);
loadingMoreRef.current = false;
}
}, [effectiveApi, library, sortBy, filter, getItemTypeForLibrary, getExcludeItemTypes]);

useEffect(() => {
if (library) {
setIsLoading(true);
setAllItems([]);
loadingMoreRef.current = false;
apiFetchIndexRef.current = 0;
initialFocusDoneRef.current = false;
loadItems(0, false);
}
}, [library, sortBy, filter, loadItems]);

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
onSelectItem?.(item);
}
}, [onSelectItem]);

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
if (e.keyCode === 38) {
e.preventDefault();
e.stopPropagation();
Spotlight.focus('navbar');
} else if (e.keyCode === 40) {
e.preventDefault();
e.stopPropagation();
Spotlight.focus('library-grid');
}
}, []);

const handleGridKeyDown = useCallback((e) => {
if (e.keyCode === 38) {
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

const handleOpenSortModal = useCallback(() => {
setShowSortModal(true);
}, []);

const handleOpenFilterModal = useCallback(() => {
setShowFilterModal(true);
}, []);

const handleCloseModal = useCallback(() => {
setShowSortModal(false);
setShowFilterModal(false);
}, []);

useEffect(() => {
	if (!backHandlerRef) return;
	backHandlerRef.current = () => {
		if (showSortModal || showFilterModal) {
			setShowSortModal(false);
			setShowFilterModal(false);
			return true;
		}
		return false;
	};
	return () => { if (backHandlerRef) backHandlerRef.current = null; };
}, [backHandlerRef, showSortModal, showFilterModal]);

const handleSortSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.sortKey;
if (key) {
setSortBy(key);
setShowSortModal(false);
}
}, []);

const handleFilterSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.filterKey;
if (key) {
setFilter(key);
setShowFilterModal(false);
}
}, []);

const renderItem = useCallback(({index, ...rest}) => {
const item = itemsRef.current[index];
const isNearEnd = index >= items.length - 50;
if (isNearEnd && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
loadItems(apiFetchIndexRef.current, true);
}

if (!item) {
return (
<div {...rest} className={css.itemCard}>
<div className={css.posterPlaceholder}>
<div className={css.loadingPlaceholder} />
</div>
</div>
);
}

const imageId = getPrimaryImageId(item);
const imageUrl = imageId ? getImageUrl(effectiveServerUrl, imageId, 'Primary', {maxHeight: 300, quality: 80}) : null;

return (
<SpottableDiv
{...rest}
className={`${css.itemCard} ${isMusicLibrary ? css.squareCard : ''}`}
onClick={handleItemClick}
data-index={index}
>
{imageUrl ? (
<img
className={css.poster}
src={imageUrl}
alt={item.Name}
loading="lazy"
/>
) : (
<div className={css.posterPlaceholder}>
<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
</svg>
</div>
)}
<div className={css.itemInfo}>
<div className={css.itemName}>{item.Name}</div>
{item.Type === 'MusicAlbum' && item.AlbumArtist ? (
	<div className={css.itemYear}>{item.AlbumArtist}</div>
) : item.ProductionYear && (
<div className={css.itemYear}>{item.ProductionYear}</div>
)}
</div>
</SpottableDiv>
);
}, [effectiveServerUrl, handleItemClick, items.length, totalCount, isLoading, loadItems, isMusicLibrary]);

const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);
const currentFilter = FILTER_OPTIONS.find(o => o.key === filter);

if (!library) {
return (
<div className={css.page}>
<div className={css.empty}>No library selected</div>
</div>
);
}

return (
<div className={css.page}>
<div className={css.content}>
<div className={css.header}>
<div className={css.titleSection}>
<div className={css.title}>{library.Name}</div>
<div className={css.subtitle}>
{currentSort?.label} • {currentFilter?.label}
{startLetter && ` • Starting with "${startLetter}"`}
</div>
</div>
<div className={css.counter}>{totalCount} items</div>
</div>

<ToolbarContainer className={css.toolbar} spotlightId="library-toolbar" onKeyDown={handleToolbarKeyDown}>
<SpottableButton
className={css.sortButton}
onClick={handleOpenSortModal}
>
<svg viewBox="0 0 24 24">
<path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
</svg>
{currentSort?.label}
</SpottableButton>

<SpottableButton
className={css.filterButton}
onClick={handleOpenFilterModal}
>
<svg viewBox="0 0 24 24">
<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
</svg>
{currentFilter?.label}
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
<div className={css.empty}>No items found</div>
) : (
<VirtualGridList
className={css.grid}
dataSize={items.length}
itemRenderer={renderItem}
itemSize={isMusicLibrary ? {minWidth: 180, minHeight: 260} : {minWidth: 180, minHeight: 340}}
spacing={20}
onScrollStop={handleScrollStop}
onKeyDown={handleGridKeyDown}
spotlightId="library-grid"
/>
)}
</GridContainer>
</div>

<Popup
open={showSortModal}
onClose={handleCloseModal}
position="center"
scrimType="translucent"
noAutoDismiss
>
<div className={css.popupContent}>
<div className={css.modalTitle}>Sort By</div>
{SORT_OPTIONS.map((option) => (
<Button
key={option.key}
className={css.popupOption}
selected={sortBy === option.key}
onClick={handleSortSelect}
data-sort-key={option.key}
>
{option.label}
</Button>
))}
</div>
</Popup>

<Popup
open={showFilterModal}
onClose={handleCloseModal}
position="center"
scrimType="translucent"
noAutoDismiss
>
<div className={css.popupContent}>
<div className={css.modalTitle}>Filter</div>
{FILTER_OPTIONS.map((option) => (
<Button
key={option.key}
className={css.popupOption}
selected={filter === option.key}
onClick={handleFilterSelect}
data-filter-key={option.key}
>
{option.label}
</Button>
))}
</div>
</Popup>
</div>
);
};

export default Library;
