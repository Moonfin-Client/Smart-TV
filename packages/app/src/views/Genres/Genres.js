import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId} from '../../utils/helpers';
import {useStorage} from '../../hooks/useStorage';
import {KEYS} from '../../utils/keys';

import css from './Genres.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SortPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SettingsPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const SORT_OPTIONS = [
{key: 'name-asc', label: 'Name (A-Z)'},
{key: 'name-desc', label: 'Name (Z-A)'},
{key: 'count-desc', label: 'Most Items'},
{key: 'count-asc', label: 'Least Items'},
{key: 'random', label: 'Random'}
];

const Genres = ({onSelectGenre, onHome, backHandlerRef}) => {
const {api, serverUrl, hasMultipleServers} = useAuth();
const {settings} = useSettings();
const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
const [genres, setGenres] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [sortOrder, setSortOrder] = useState('name-asc');
const [selectedLibrary, setSelectedLibrary] = useState(null);
const [libraries, setLibraries] = useState([]);
const [showSortPanel, setShowSortPanel] = useState(false);
const [showSettingsPanel, setShowSettingsPanel] = useState(false);
const [cardSize, setCardSize] = useStorage('genres_cardSize', 'medium');

const sortedGenresRef = useRef([]);

useEffect(() => {
const loadLibraries = async () => {
try {
let videoLibraries;
if (unifiedMode) {
const allLibraries = await connectionPool.getLibrariesFromAllServers();
videoLibraries = allLibraries.filter(lib =>
lib.CollectionType === 'movies' || lib.CollectionType === 'tvshows'
);
} else {
const result = await api.getLibraries();
videoLibraries = (result.Items || []).filter(lib =>
lib.CollectionType === 'movies' || lib.CollectionType === 'tvshows'
);
}
setLibraries(videoLibraries);
} catch (err) {
console.error('Failed to load libraries:', err);
}
};
loadLibraries();
}, [api, unifiedMode]);

useEffect(() => {
const loadGenres = async () => {
setIsLoading(true);
try {
let genreList;
if (unifiedMode && !selectedLibrary) {
genreList = await connectionPool.getGenresFromAllServers();

let backdropPool = [];
try {
const randomItems = await connectionPool.getRandomItemsFromAllServers('both', 30);
backdropPool = randomItems
.filter(item => getBackdropId(item) !== null)
.map(item => {
const backdropId = getBackdropId(item);
const itemServerUrl = item._serverUrl || serverUrl;
return getImageUrl(itemServerUrl, backdropId, 'Backdrop', {maxWidth: 780, quality: 80});
});
} catch (err) {
console.warn('[Genres] Failed to fetch backdrop pool:', err);
}

const unifiedGenres = genreList.map((genre, index) => ({
id: genre.Id,
name: genre.Name,
itemCount: genre.ChildCount || 0,
backdropUrl: backdropPool.length > 0 ? backdropPool[index % backdropPool.length] : null,
_unifiedGenre: true
}));
setGenres(unifiedGenres);
setIsLoading(false);
return;
} else if (unifiedMode && selectedLibrary?._serverUrl) {
const serverApi = connectionPool.getApiForItem(selectedLibrary);
if (serverApi) {
const result = await serverApi.getGenres(selectedLibrary.Id);
genreList = (result.Items || []).map(g => ({
...g,
_serverUrl: selectedLibrary._serverUrl,
_serverAccessToken: selectedLibrary._serverAccessToken,
_serverUserId: selectedLibrary._serverUserId,
_serverName: selectedLibrary._serverName,
_serverId: selectedLibrary._serverId
}));
} else {
genreList = [];
}
} else {
const genresResult = await api.getGenres(selectedLibrary?.Id);
genreList = genresResult.Items || [];
}

const BATCH_SIZE = 10;
const getGenreData = async (genre) => {
try {
const itemParams = {
Genres: genre.Name,
IncludeItemTypes: 'Movie,Series',
Recursive: true,
Limit: 5,
SortBy: 'Random',
EnableTotalRecordCount: true,
Fields: 'BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId'
};

if (selectedLibrary) {
itemParams.ParentId = selectedLibrary.Id;
}

let items, itemCount;
if (unifiedMode && selectedLibrary?._serverUrl) {
const serverApi = connectionPool.getApiForItem(selectedLibrary);
if (serverApi) {
const result = await serverApi.getItems(itemParams);
items = (result.Items || []).map(item => ({
...item,
_serverUrl: selectedLibrary._serverUrl
}));
itemCount = result.TotalRecordCount || 0;
} else {
items = [];
itemCount = 0;
}
} else {
const itemsResult = await api.getItems(itemParams);
items = itemsResult.Items || [];
itemCount = itemsResult.TotalRecordCount || 0;
}

if (itemCount === 0) return null;

let backdropUrl = null;
for (const item of items) {
const backdropId = getBackdropId(item);
if (backdropId) {
const itemServerUrl = item._serverUrl || serverUrl;
backdropUrl = getImageUrl(itemServerUrl, backdropId, 'Backdrop', {maxWidth: 780, quality: 80});
break;
}
}

return {
id: genre.Id,
name: genre.Name,
itemCount,
backdropUrl,
_serverUrl: genre._serverUrl,
_serverName: genre._serverName,
_serverId: genre._serverId,
_serverAccessToken: genre._serverAccessToken,
_serverUserId: genre._serverUserId
};
} catch (err) {
console.error(`Failed to get data for genre ${genre.Name}:`, err);
return null;
}
};

const allGenresWithData = [];
for (let i = 0; i < genreList.length; i += BATCH_SIZE) {
const batch = genreList.slice(i, i + BATCH_SIZE);
const batchResults = await Promise.all(batch.map(getGenreData));
allGenresWithData.push(...batchResults);
}

setGenres(allGenresWithData.filter(g => g !== null));
} catch (err) {
console.error('Failed to load genres:', err);
} finally {
setIsLoading(false);
}
};

loadGenres();
}, [api, serverUrl, selectedLibrary, unifiedMode]);

const sortedGenres = useMemo(() => {
const sorted = [...genres];
switch (sortOrder) {
case 'name-asc':
sorted.sort((a, b) => a.name.localeCompare(b.name));
break;
case 'name-desc':
sorted.sort((a, b) => b.name.localeCompare(a.name));
break;
case 'count-desc':
sorted.sort((a, b) => b.itemCount - a.itemCount);
break;
case 'count-asc':
sorted.sort((a, b) => a.itemCount - b.itemCount);
break;
case 'random':
sorted.sort(() => Math.random() - 0.5);
break;
default:
break;
}
sortedGenresRef.current = sorted;
return sorted;
}, [genres, sortOrder]);

const gridItemSize = useMemo(() => {
switch (cardSize) {
case 'small': return {minWidth: 240, minHeight: 130};
case 'large': return {minWidth: 400, minHeight: 230};
default: return {minWidth: 320, minHeight: 180};
}
}, [cardSize]);

const cardHeight = cardSize === 'small' ? 100 : cardSize === 'large' ? 180 : 140;

const handleGenreClick = useCallback((ev) => {
const genreIndex = ev.currentTarget?.dataset?.index;
if (genreIndex !== undefined) {
const genre = sortedGenresRef.current[parseInt(genreIndex, 10)];
if (genre) {
const library = (genre._unifiedGenre || genre._serverUrl) ? null : selectedLibrary;
onSelectGenre?.(genre, library);
}
}
}, [onSelectGenre, selectedLibrary]);

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

const handleCycleCardSize = useCallback(() => {
const sizes = ['small', 'medium', 'large'];
const idx = sizes.indexOf(cardSize);
setCardSize(sizes[(idx + 1) % sizes.length]);
}, [cardSize, setCardSize]);

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
if (showSettingsPanel) {
setTimeout(() => Spotlight.focus('genres-settings-card-size'), 100);
}
}, [showSettingsPanel]);

useEffect(() => {
if (showSortPanel) {
setTimeout(() => Spotlight.focus('genre-sort-option-0'), 100);
}
}, [showSortPanel]);

const handleSortSelect = useCallback((ev) => {
const key = ev.currentTarget?.dataset?.sortKey;
if (key) {
setSortOrder(key);
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('genres-grid'), 100);
}
}, []);

const handleLibrarySelect = useCallback((ev) => {
const libIndex = ev.currentTarget?.dataset?.libIndex;
if (libIndex === 'all') {
setSelectedLibrary(null);
} else if (libIndex !== undefined) {
setSelectedLibrary(libraries[parseInt(libIndex, 10)]);
}
setShowSortPanel(false);
setTimeout(() => Spotlight.focus('genres-grid'), 100);
}, [libraries]);

const handleToolbarKeyDown = useCallback((e) => {
if (e.keyCode === KEYS.DOWN) {
e.preventDefault();
e.stopPropagation();
Spotlight.focus('genres-grid');
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
Spotlight.focus('genres-home-btn');
}
}
}
}, []);

const renderGenreCard = useCallback(({index, ...rest}) => {
const genre = sortedGenresRef.current[index];
if (!genre) return null;

return (
<SpottableDiv
{...rest}
className={css.genreCard}
style={{height: cardHeight}}
onClick={handleGenreClick}
data-index={index}
>
<div className={css.genreBackdrop}>
{genre.backdropUrl ? (
<img
className={css.genreBackdropImage}
src={genre.backdropUrl}
alt=""
loading="lazy"
/>
) : (
<div className={css.genreBackdropPlaceholder} />
)}
<div className={css.genreBackdropOverlay} />
</div>
<div className={css.genreInfo}>
<div className={css.genreName}>{genre.name}</div>
{genre.itemCount > 0 && (
<div className={css.genreCount}>{genre.itemCount} items</div>
)}
</div>
</SpottableDiv>
);
}, [handleGenreClick, cardHeight]);

const currentSort = SORT_OPTIONS.find(o => o.key === sortOrder);
const statusText = selectedLibrary
? `${sortedGenres.length} genres in '${selectedLibrary.Name}' sorted by ${currentSort?.label}`
: `${sortedGenres.length} genres sorted by ${currentSort?.label}`;

return (
<div className={css.page}>
<div className={css.content}>
<div className={css.header}>
<div className={css.title}>Genres</div>
{selectedLibrary && <div className={css.subtitle}>{selectedLibrary.Name}</div>}
<div className={css.counter}>{sortedGenres.length} genres</div>
</div>

<ToolbarContainer className={css.toolbar} spotlightId="genres-toolbar" onKeyDown={handleToolbarKeyDown}>
<SpottableButton className={css.toolbarBtn} onClick={onHome} spotlightId="genres-home-btn">
<svg className={css.toolbarIcon} viewBox="0 0 24 24">
<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
</svg>
</SpottableButton>

<SpottableButton className={css.toolbarBtn} onClick={handleToggleSortPanel} spotlightId="genres-sort-btn">
<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
<path d="m80-280 162-400h63l161 400h-63l-38-99H181l-38 99H80Zm121-151h144l-70-185h-4l-70 185Zm347 151v-62l233-286H566v-52h272v63L607-332h233v52H548ZM384-784l96-96 96 96H384Zm96 704-96-96h192l-96 96Z" />
</svg>
</SpottableButton>

<SpottableButton className={css.toolbarBtn} onClick={handleToggleSettingsPanel} spotlightId="genres-settings-btn">
<svg className={css.toolbarIcon} viewBox="0 -960 960 960">
<path d="m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z" />
</svg>
</SpottableButton>
</ToolbarContainer>

<GridContainer className={css.gridContainer} onKeyDown={handleGridKeyDown}>
{isLoading ? (
<div className={css.loading}><LoadingSpinner /></div>
) : sortedGenres.length === 0 ? (
<div className={css.empty}>No genres found</div>
) : (
<VirtualGridList
className={css.grid}
dataSize={sortedGenres.length}
itemRenderer={renderGenreCard}
itemSize={gridItemSize}
horizontalScrollbar="hidden"
verticalScrollbar="hidden"
spacing={20}
spotlightId="genres-grid"
/>
)}
</GridContainer>

<div className={css.statusBar}>
<div className={css.statusText}>{statusText}</div>
</div>
</div>

{showSortPanel && (
<div className={css.sortPanelOverlay} onClick={handleCloseSortPanel}>
<SortPanelContainer
className={css.sortPanel}
spotlightId="genres-sort-panel"
onClick={(e) => e.stopPropagation()}
>
<h2 className={css.sortPanelTitle}>Sort & Filter</h2>

<div className={css.sortSection}>
<div className={css.sortSectionLabel}>Sort By</div>
{SORT_OPTIONS.map((option, index) => (
<SpottableButton
key={option.key}
className={`${css.sortOption} ${sortOrder === option.key ? css.sortOptionActive : ''}`}
onClick={handleSortSelect}
data-sort-key={option.key}
spotlightId={`genre-sort-option-${index}`}
>
<span className={css.radioCircle}>
{sortOrder === option.key && <span className={css.radioFill} />}
</span>
<span className={css.sortOptionLabel}>{option.label}</span>
</SpottableButton>
))}
</div>

{libraries.length > 0 && (
<div className={css.filterSection}>
<div className={css.sortSectionLabel}>Library</div>
<SpottableButton
className={`${css.sortOption} ${!selectedLibrary ? css.sortOptionActive : ''}`}
onClick={handleLibrarySelect}
data-lib-index="all"
spotlightId="genre-lib-all"
>
<span className={css.radioCircle}>
{!selectedLibrary && <span className={css.radioFill} />}
</span>
<span className={css.sortOptionLabel}>All Libraries</span>
</SpottableButton>
{libraries.map((lib, index) => (
<SpottableButton
key={lib.Id + (lib._serverId || '')}
className={`${css.sortOption} ${selectedLibrary?.Id === lib.Id ? css.sortOptionActive : ''}`}
onClick={handleLibrarySelect}
data-lib-index={index}
spotlightId={`genre-lib-${index}`}
>
<span className={css.radioCircle}>
{selectedLibrary?.Id === lib.Id && <span className={css.radioFill} />}
</span>
<span className={css.sortOptionLabel}>
{unifiedMode && lib._serverName ? `${lib.Name} (${lib._serverName})` : lib.Name}
</span>
</SpottableButton>
))}
</div>
)}
</SortPanelContainer>
</div>
)}

{showSettingsPanel && (
<div className={css.sortPanelOverlay} onClick={handleCloseSettingsPanel}>
<SettingsPanelContainer
className={css.sortPanel}
spotlightId="genres-settings-panel"
onClick={(e) => e.stopPropagation()}
>
<div className={css.settingsHeader}>GENRES</div>
<h2 className={css.sortPanelTitle}>Settings</h2>

<SpottableButton
className={css.settingRow}
onClick={handleCycleCardSize}
spotlightId="genres-settings-card-size"
>
<div className={css.settingLabel}>Card size</div>
<div className={css.settingValue}>{capitalize(cardSize)}</div>
</SpottableButton>
</SettingsPanelContainer>
</div>
)}
</div>
);
};

export default Genres;
