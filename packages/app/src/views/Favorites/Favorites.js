import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getPrimaryImageId} from '../../utils/helpers';
import {useStorage} from '../../hooks/useStorage';
import {KEYS} from '../../utils/keys';

import css from './Favorites.module.less';

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
{key: 'CommunityRating', field: 'CommunityRating', order: 'Descending', label: 'Community Rating'},
{key: 'CriticRating', field: 'CriticRating', order: 'Descending', label: 'Critic Rating'},
{key: 'DatePlayed', field: 'DatePlayed', order: 'Descending', label: 'Last Played'},
{key: 'Runtime', field: 'Runtime', order: 'Ascending', label: 'Runtime'}
];

const TYPE_FILTERS = [
{key: 'all', label: 'All', types: 'Movie,Series,Episode,Person'},
{key: 'movies', label: 'Movies', types: 'Movie'},
{key: 'shows', label: 'Shows', types: 'Series'},
{key: 'episodes', label: 'Episodes', types: 'Episode'},
{key: 'people', label: 'People', types: 'Person'}
];

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const Favorites = ({onSelectItem, onSelectPerson, onHome, backHandlerRef}) => {
const {api, serverUrl, hasMultipleServers} = useAuth();
const {settings} = useSettings();
const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;

const [allItems, setAllItems] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [totalCount, setTotalCount] = useState(0);
const [sortKey, setSortKey] = useState('SortName');
const [typeFilterKey, setTypeFilterKey] = useState('all');
const [startLetter, setStartLetter] = useState(null);
const [showSortPanel, setShowSortPanel] = useState(false);
const [showSettingsPanel, setShowSettingsPanel] = useState(false);
const [imageSize, setImageSize] = useStorage('favorites_imageSize', 'medium');
const [imageType, setImageType] = useStorage('favorites_imageType', 'poster');
const [gridDirection, setGridDirection] = useStorage('favorites_gridDirection', 'vertical');

const loadingMoreRef = useRef(false);
const apiFetchIndexRef = useRef(0);
const initialFocusDoneRef = useRef(false);

const items = useMemo(() => {
if (!startLetter) return allItems;
return allItems.filter(item => {
const name = item.Name || '';
const firstChar = name.charAt(0).toUpperCase();
if (startLetter === '#') return !/[A-Z]/.test(firstChar);
return firstChar === startLetter;
});
}, [allItems, startLetter]);

const itemsRef = useRef(items);
itemsRef.current = items;

const clientSideSort = useCallback((arr, key) => {
const sorted = [...arr];
const opt = SORT_OPTIONS.find(o => o.key === key) || SORT_OPTIONS[0];
const asc = opt.order === 'Ascending';
sorted.sort((a, b) => {
let va, vb;
switch (key) {
case 'SortName': va = (a.SortName || a.Name || '').toLowerCase(); vb = (b.SortName || b.Name || '').toLowerCase(); return asc ? va.localeCompare(vb) : vb.localeCompare(va);
case 'DateCreated': va = a.DateCreated || ''; vb = b.DateCreated || ''; return asc ? va.localeCompare(vb) : vb.localeCompare(va);
case 'PremiereDate': va = a.PremiereDate || ''; vb = b.PremiereDate || ''; return asc ? va.localeCompare(vb) : vb.localeCompare(va);
case 'CommunityRating': va = a.CommunityRating || 0; vb = b.CommunityRating || 0; return asc ? va - vb : vb - va;
case 'CriticRating': va = a.CriticRating || 0; vb = b.CriticRating || 0; return asc ? va - vb : vb - va;
case 'DatePlayed': va = a.UserData?.LastPlayedDate || ''; vb = b.UserData?.LastPlayedDate || ''; return asc ? va.localeCompare(vb) : vb.localeCompare(va);
case 'Runtime': va = a.RunTimeTicks || 0; vb = b.RunTimeTicks || 0; return asc ? va - vb : vb - va;
default: return 0;
}
});
return sorted;
}, []);

const activeTypeFilter = useMemo(() => {
return TYPE_FILTERS.find(t => t.key === typeFilterKey) || TYPE_FILTERS[0];
}, [typeFilterKey]);

const loadItems = useCallback(async (startIndex = 0, append = false) => {
if (append && loadingMoreRef.current) return;
if (append) loadingMoreRef.current = true;

try {
if (unifiedMode) {
const result = await connectionPool.getFavoritesFromAllServers();
const typeFiltered = activeTypeFilter.key === 'all' ? result : result.filter(item => activeTypeFilter.types.split(',').includes(item.Type));
const sorted = clientSideSort(typeFiltered, sortKey);
setAllItems(sorted);
setTotalCount(sorted.length);
} else {
const sortOption = SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0];
const params = {
Recursive: true,
Filters: 'IsFavorite',
IncludeItemTypes: activeTypeFilter.types,
SortBy: sortOption.field,
SortOrder: sortOption.order,
StartIndex: startIndex,
Limit: 150,
EnableTotalRecordCount: true,
Fields: 'ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData,SortName'
};

const result = await api.getItems(params);
const newItems = result.Items || [];

apiFetchIndexRef.current = append
? apiFetchIndexRef.current + newItems.length
: newItems.length;
setAllItems(prev => append ? [...prev, ...newItems] : newItems);
setTotalCount(result.TotalRecordCount || 0);
}
} catch (err) {
console.error('Failed to load favorites:', err);
} finally {
setIsLoading(false);
loadingMoreRef.current = false;
}
}, [api, sortKey, unifiedMode, clientSideSort, activeTypeFilter]);

useEffect(() => {
setIsLoading(true);
setAllItems([]);
loadingMoreRef.current = false;
apiFetchIndexRef.current = 0;
initialFocusDoneRef.current = false;
loadItems(0, false);
}, [sortKey, typeFilterKey, loadItems]);

useEffect(() => {
if (items.length > 0 && !isLoading && !initialFocusDoneRef.current) {
setTimeout(() => {
Spotlight.focus('favorites-grid');
initialFocusDoneRef.current = true;
}, 100);
}
}, [items.length, isLoading]);

useEffect(() => {
if (startLetter && items.length > 0 && !isLoading) {
setTimeout(() => Spotlight.focus('favorites-grid'), 100);
}
}, [startLetter, items.length, isLoading]);

const handleItemClick = useCallback((ev) => {
const itemIndex = ev.currentTarget?.dataset?.index;
if (itemIndex === undefined) return;
const item = itemsRef.current[parseInt(itemIndex, 10)];
if (item) {
if (item.Type === 'Person') {
onSelectPerson?.(item);
} else {
onSelectItem?.(item);
}
}
}, [onSelectItem, onSelectPerson]);

const handleScrollStop = useCallback(() => {
if (!unifiedMode && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
loadItems(apiFetchIndexRef.current, true);
}
}, [unifiedMode, totalCount, isLoading, loadItems]);

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
Spotlight.focus('favorites-grid');
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
Spotlight.focus('favorites-letter-hash');
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

const handleToggleSettingsPanel = useCallback(() => {
setShowSettingsPanel(prev => !prev);
}, []);

const handleCloseSettingsPanel = useCallback(() => {
setShowSettingsPanel(false);
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
return false;
};
return () => { if (backHandlerRef) backHandlerRef.current = null; };
}, [backHandlerRef, showSortPanel, showSettingsPanel]);

useEffect(() => {
if (showSortPanel) {
setTimeout(() => Spotlight.focus('fav-sort-option-0'), 100);
}
}, [showSortPanel]);

useEffect(() => {
if (showSettingsPanel) {
setTimeout(() => Spotlight.focus('fav-settings-image-size'), 100);
}
}, [showSettingsPanel]);

const handleSortSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.sortKey;
if (key) {
setSortKey(key);
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('favorites-grid'), 100);
}
}, []);

const handleTypeFilterSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.filterKey;
if (key) {
setTypeFilterKey(key);
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('favorites-grid'), 100);
}
}, []);

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

const stopPropagation = useCallback((e) => e.stopPropagation(), []);

const isWideImage = imageType === 'thumbnail';
const posterHeight = isWideImage
? ({small: 120, medium: 160, large: 210}[imageSize] || 160)
: ({small: 200, medium: 270, large: 350}[imageSize] || 270);

const gridItemSize = isWideImage
? ({small: {minWidth: 220, minHeight: 170}, medium: {minWidth: 280, minHeight: 220}, large: {minWidth: 360, minHeight: 280}}[imageSize] || {minWidth: 280, minHeight: 220})
: ({small: {minWidth: 130, minHeight: 270}, medium: {minWidth: 170, minHeight: 340}, large: {minWidth: 220, minHeight: 430}}[imageSize] || {minWidth: 170, minHeight: 340});

const renderItem = useCallback(({index, ...rest}) => {
const isNearEnd = index >= items.length - 50;
if (isNearEnd && !unifiedMode && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
loadItems(apiFetchIndexRef.current, true);
}

const item = itemsRef.current[index];
if (!item) {
return (
<div {...rest} className={css.itemCard}>
<div className={css.posterPlaceholder} style={{height: posterHeight}} />
</div>
);
}

const isPerson = item.Type === 'Person';
let imageId, imgApiType;
if (imageType === 'thumbnail') {
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
const itemServerUrl = item._serverUrl || serverUrl;
const imageUrl = imageId ? getImageUrl(itemServerUrl, imageId, imgApiType, {maxHeight: 400, quality: 80}) : null;

return (
<SpottableDiv
{...rest}
className={css.itemCard}
onClick={handleItemClick}
data-index={index}
>
{imageUrl ? (
<img
className={`${css.poster} ${isPerson ? css.personPoster : ''}`}
style={{height: posterHeight}}
src={imageUrl}
alt={item.Name}
loading="lazy"
/>
) : (
<div className={css.posterPlaceholder} style={{height: posterHeight}}>
<svg viewBox="0 0 24 24" className={css.placeholderIcon}>
{isPerson
? <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
: <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
}
</svg>
</div>
)}
{unifiedMode && item._serverName && (
<div className={css.serverBadge}>{item._serverName}</div>
)}
{item.UserData?.Played && (
<div className={css.watchedBadge}>
<svg viewBox="0 0 24 24"><path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
</div>
)}
</SpottableDiv>
);
}, [serverUrl, handleItemClick, items.length, totalCount, isLoading, loadItems, imageType, posterHeight, unifiedMode]);

const currentSort = SORT_OPTIONS.find(o => o.key === sortKey);
const sortLabel = currentSort ? $L(currentSort.label) : $L('Name');
const typeLabel = activeTypeFilter.key === 'all' ? '' : ` · ${$L(activeTypeFilter.label)}`;
const statusText = $L('{count} favorites sorted by {sortLabel}').replace('{count}', totalCount).replace('{sortLabel}', sortLabel) + typeLabel;

return (
<div className={css.page}>
<div className={css.content}>
<div className={css.header}>
<div className={css.title}>{$L('Favorites')}</div>
<div className={css.itemCount}>{totalCount} {$L('Items')}</div>
</div>

<ToolbarContainer className={css.toolbar} spotlightId="favorites-toolbar" onKeyDown={handleToolbarKeyDown}>
<SpottableButton className={css.toolbarBtn} onClick={onHome} spotlightId="favorites-home-btn">
<svg className={css.toolbarIcon} viewBox="0 0 24 24">
<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
</svg>
</SpottableButton>

<SpottableButton className={css.toolbarBtn} onClick={handleToggleSortPanel} spotlightId="favorites-sort-btn">
<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
<path d="m80-280 162-400h63l161 400h-63l-38-99H181l-38 99H80Zm121-151h144l-70-185h-4l-70 185Zm347 151v-62l233-286H566v-52h272v63L607-332h233v52H548ZM384-784l96-96 96 96H384Zm96 704-96-96h192l-96 96Z" />
</svg>
</SpottableButton>

<SpottableButton className={css.toolbarBtn} onClick={handleToggleSettingsPanel} spotlightId="favorites-settings-btn">
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
spotlightId={index === 0 ? 'favorites-letter-hash' : undefined}
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
<div className={css.empty}>{$L('No favorites found')}</div>
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
spotlightId="favorites-grid"
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
spotlightId="fav-sort-panel"
onClick={stopPropagation}
>
<h2 className={css.sortPanelTitle}>{$L('Sort & Filter')}</h2>

<div className={css.sortSection}>
<div className={css.sortSectionLabel}>{$L('Sort By')}</div>
{SORT_OPTIONS.map((option, index) => (
<SpottableButton
key={option.key}
className={`${css.sortOption} ${sortKey === option.key ? css.sortOptionActive : ''}`}
onClick={handleSortSelect}
data-sort-key={option.key}
spotlightId={`fav-sort-option-${index}`}
>
<span className={css.radioCircle}>
{sortKey === option.key && <span className={css.radioFill} />}
</span>
<span className={css.sortOptionLabel}>{$L(option.label)}</span>
</SpottableButton>
))}
</div>

<div className={css.filterSection}>
<div className={css.sortSectionLabel}>{$L('Type')}</div>
{TYPE_FILTERS.map((filter, index) => (
<SpottableButton
key={filter.key}
className={`${css.sortOption} ${typeFilterKey === filter.key ? css.sortOptionActive : ''}`}
onClick={handleTypeFilterSelect}
data-filter-key={filter.key}
spotlightId={`fav-filter-option-${index}`}
>
<span className={css.radioCircle}>
{typeFilterKey === filter.key && <span className={css.radioFill} />}
</span>
<span className={css.sortOptionLabel}>{$L(filter.label)}</span>
</SpottableButton>
))}
</div>
</SortPanelContainer>
</div>
)}

{showSettingsPanel && (
<div className={css.sortPanelOverlay} onClick={handleCloseSettingsPanel}>
<SettingsPanelContainer
className={css.sortPanel}
spotlightId="fav-settings-panel"
onClick={stopPropagation}
>
<div className={css.settingsHeader}>{$L('FAVORITES')}</div>
<h2 className={css.sortPanelTitle}>{$L('Settings')}</h2>

<SpottableButton
className={css.settingRow}
onClick={handleCycleImageSize}
spotlightId="fav-settings-image-size"
>
<div className={css.settingLabel}>{$L('Image size')}</div>
<div className={css.settingValue}>{$L(capitalize(imageSize))}</div>
</SpottableButton>

<SpottableButton
className={css.settingRow}
onClick={handleCycleImageType}
spotlightId="fav-settings-image-type"
>
<div className={css.settingLabel}>{$L('Image type')}</div>
<div className={css.settingValue}>{$L(capitalize(imageType))}</div>
</SpottableButton>

<SpottableButton
className={css.settingRow}
onClick={handleCycleGridDirection}
spotlightId="fav-settings-grid-direction"
>
<div className={css.settingLabel}>{$L('Grid direction')}</div>
<div className={css.settingValue}>{$L(capitalize(gridDirection))}</div>
</SpottableButton>
</SettingsPanelContainer>
</div>
)}
</div>
);
};

export default Favorites;
