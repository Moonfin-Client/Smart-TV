import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import useQuickReturnGrid from '../../hooks/useQuickReturnGrid';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as connectionPool from '../../services/connectionPool';
import BackdropLayer from '../../components/BackdropLayer';
import DetailsTabBar from '../../components/DetailsTabBar';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getBackdropId, getImageUrl} from '../../utils/helpers';
import {useStorage} from '../../hooks/useStorage';
import useSortSettingsPanels from '../../hooks/useSortSettingsPanels';
import useStartLetter from '../../hooks/useStartLetter';
import {GRID_DIRECTIONS, IMAGE_SIZES, IMAGE_TYPES, LETTERS, capitalize, createGridKeyDown, createToolbarKeyDown, cycleValue, stopPropagation} from '../../utils/gridChrome';
import {keepFocusInView} from '../../utils/focusScroll';

import FocusedItemHud from './FocusedItemHud';
import useFavoriteTabs from './useFavoriteTabs';
import {cardMetrics, clampTabIndex, favoriteCardImage} from './favoriteTabs';

import css from './Favorites.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ToolbarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
// The grid sits under the tab bar, so it lets focus leave upward rather than
// keeping it to itself.
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const SortPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const SettingsPanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

// These labels are the plain English the translation is looked up by. Translating
// here would freeze them before the locale has been picked, so they are left alone
// until they are drawn.
const SORT_OPTIONS = [
	{key: 'SortName', field: 'SortName', order: 'Ascending', label: 'Name'},
	{key: 'DateCreated', field: 'DateCreated', order: 'Descending', label: 'Date Added'},
	{key: 'PremiereDate', field: 'PremiereDate', order: 'Descending', label: 'Premiere Date'},
	{key: 'CommunityRating', field: 'CommunityRating', order: 'Descending', label: 'Community Rating'},
	{key: 'CriticRating', field: 'CriticRating', order: 'Descending', label: 'Critic rating'},
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

const VIEW_STYLES = ['home', 'library'];
const VIEW_STYLE_LABELS = {home: 'Home View', library: 'Library View'};

// The tabbed layout leaves more of the picture showing, since the only thing
// reading over it is the one line above the cards.
const BACKDROP_OVERLAY_OPACITY = 0.85;

const PAGE_AHEAD = 15;

// Down out of the toolbar lands on the tabs in one layout and in the grid in the
// other, so the handler is built once for each.
const handleHomeToolbarKeyDown = createToolbarKeyDown('favorites-active-tab');
const handleLibraryToolbarKeyDown = createToolbarKeyDown('favorites-grid');
const handleTabsKeyDown = createToolbarKeyDown('favorites-grid', 'favorites-toolbar');
const handleHomeGridKeyDown = createGridKeyDown(css.grid, 'favorites-active-tab');
const handleLibraryGridKeyDown = createGridKeyDown(css.grid, 'favorites-letter-hash');

const Favorites = ({onSelectItem, onSelectPerson, onHome, backHandlerRef}) => {
	const {api, serverUrl, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const isLegacy = typeof document !== 'undefined' && (' ' + document.documentElement.className + ' ').indexOf(' legacy ') >= 0;

	const [allItems, setAllItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [totalCount, setTotalCount] = useState(0);
	const [sortKey, setSortKey] = useStorage('favorites_sortKey', 'SortName');
	const [typeFilterKey, setTypeFilterKey] = useState('all');
	const [imageSize, setImageSize] = useStorage('favorites_imageSize', 'medium');
	const [imageType, setImageType] = useStorage('favorites_imageType', 'poster');
	const [gridDirection, setGridDirection] = useStorage('favorites_gridDirection', 'vertical');
	// Which layout is showing is only known once it has been read back, so both
	// loaders wait on it rather than fetching for a screen about to be replaced.
	const [viewStyle, setViewStyle, viewStyleLoaded] = useStorage('favorites_viewStyle', 'home');
	const isHome = viewStyle === 'home';

	const [tabIndex, setTabIndex] = useState(0);
	const [focusedItem, setFocusedItem] = useState(null);

	const {getScrollTo: getGridScrollTo, quickReturn} = useQuickReturnGrid('favorites-grid');

	const {
		showSortPanel, showSettingsPanel,
		handleToggleSortPanel, handleCloseSortPanel,
		handleToggleSettingsPanel, handleCloseSettingsPanel
	} = useSortSettingsPanels({
		backHandlerRef,
		sortFocusId: 'fav-sort-option-0',
		settingsFocusId: 'fav-settings-image-size',
		onBack: quickReturn
	});

	const loadingMoreRef = useRef(false);
	const apiFetchIndexRef = useRef(0);
	const initialFocusDoneRef = useRef(false);

	const sortOption = useMemo(() => {
		return SORT_OPTIONS.find(o => o.key === sortKey) || SORT_OPTIONS[0];
	}, [sortKey]);

	const {
		tabs,
		itemsByKey,
		countsByKey,
		totalCount: tabsTotalCount,
		isLoading: tabsLoading,
		loadMore
	} = useFavoriteTabs({
		api,
		sortBy: sortOption.field,
		sortOrder: sortOption.order,
		unifiedMode,
		enabled: viewStyleLoaded && isHome
	});

	const {startLetter, handleLetterSelect, items} = useStartLetter({
		allItems,
		isLoading,
		gridSpotlightId: 'favorites-grid'
	});

	const activeIndex = clampTabIndex(tabIndex, tabs);
	const activeTab = tabs[activeIndex] || null;
	const cardType = isHome
		? (activeTab?.cardType || 'portrait')
		: (imageType === 'thumbnail' ? 'landscape' : 'portrait');

	const displayItems = isHome ? (activeTab ? itemsByKey[activeTab.key] || [] : []) : items;
	const displayTotal = isHome ? tabsTotalCount : totalCount;
	const displayLoading = isHome ? tabsLoading : isLoading;

	// The click and focus handlers read the list through this rather than closing
	// over it, so switching tabs cant rebuild them and drop the focus.
	const itemsRef = useRef(displayItems);
	itemsRef.current = displayItems;

	const activeKeyRef = useRef(null);
	activeKeyRef.current = activeTab?.key || null;

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
	}, [api, sortKey, sortOption, unifiedMode, clientSideSort, activeTypeFilter]);

	useEffect(() => {
		if (!viewStyleLoaded || isHome) return;
		setIsLoading(true);
		setAllItems([]);
		loadingMoreRef.current = false;
		apiFetchIndexRef.current = 0;
		initialFocusDoneRef.current = false;
		loadItems(0, false);
	}, [viewStyleLoaded, isHome, sortKey, typeFilterKey, loadItems]);

	useEffect(() => {
		if (displayItems.length > 0 && !displayLoading && !initialFocusDoneRef.current) {
			setTimeout(() => {
				Spotlight.focus('favorites-grid');
				initialFocusDoneRef.current = true;
			}, 100);
		}
	}, [displayItems.length, displayLoading]);

	// Switching layout starts the other one from the top.
	useEffect(() => {
		initialFocusDoneRef.current = false;
	}, [isHome]);

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

	const handleItemFocus = useCallback((ev) => {
		const itemIndex = ev.currentTarget?.dataset?.index;
		if (itemIndex === undefined) return;
		setFocusedItem(itemsRef.current[parseInt(itemIndex, 10)] || null);
	}, []);

	const handleScrollStop = useCallback(() => {
		if (isHome) {
			loadMore(activeKeyRef.current);
			return;
		}
		if (!unifiedMode && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
			loadItems(apiFetchIndexRef.current, true);
		}
	}, [isHome, loadMore, unifiedMode, totalCount, isLoading, loadItems]);

	const handleSortSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.sortKey;
		if (key) {
			setSortKey(key);
			handleCloseSortPanel();
			setTimeout(() => Spotlight.focus('favorites-grid'), 100);
		}
	}, [setSortKey, handleCloseSortPanel]);

	const handleTypeFilterSelect = useCallback((ev) => {
		const key = ev.currentTarget?.dataset?.filterKey;
		if (key) {
			setTypeFilterKey(key);
			handleCloseSortPanel();
			setTimeout(() => Spotlight.focus('favorites-grid'), 100);
		}
	}, [handleCloseSortPanel]);

	const handleCycleImageSize = useCallback(() => {
		setImageSize(cycleValue(IMAGE_SIZES, imageSize));
	}, [imageSize, setImageSize]);

	const handleCycleImageType = useCallback(() => {
		setImageType(cycleValue(IMAGE_TYPES, imageType));
	}, [imageType, setImageType]);

	const handleCycleGridDirection = useCallback(() => {
		setGridDirection(cycleValue(GRID_DIRECTIONS, gridDirection));
	}, [gridDirection, setGridDirection]);

	// The whole screen is rebuilt underneath, so the panel steps out of the way and
	// the focus waits on the button that opened it until the new grid can take it.
	const handleCycleViewStyle = useCallback(() => {
		setViewStyle(cycleValue(VIEW_STYLES, viewStyle));
		handleCloseSettingsPanel();
		setTimeout(() => Spotlight.focus('favorites-settings-btn'), 100);
	}, [viewStyle, setViewStyle, handleCloseSettingsPanel]);

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;

	const selectTabById = useCallback((id) => {
		const index = tabsRef.current.findIndex((tab) => tab.key === id);
		if (index >= 0) setTabIndex(index);
	}, []);

	const handleTabActivate = useCallback((id) => {
		selectTabById(id);
		setTimeout(() => Spotlight.focus('favorites-grid'), 100);
	}, [selectTabById]);

	// Moving along the tabs changes the grid under them, and rebuilding it for every
	// tab the focus crosses is more than an older set can keep up with. The same
	// list stays put and is scrolled back to the first card instead.
	const gridScrollToRef = useRef(null);
	const captureGridScrollTo = useCallback((fn) => {
		gridScrollToRef.current = fn;
		getGridScrollTo(fn);
	}, [getGridScrollTo]);

	useEffect(() => {
		gridScrollToRef.current?.({index: 0, animate: false});
		setFocusedItem(null);
	}, [activeTab]);

	const {posterHeight, itemSize: gridItemSize} = cardMetrics(cardType, imageSize);
	const isRound = cardType === 'circle';

	const targetBackdropUrl = useMemo(() => {
		if (!isHome || !focusedItem || isLegacy || settings.showHomeBackdrop === false) return '';
		const backdropId = getBackdropId(focusedItem);
		if (!backdropId) return '';
		return getImageUrl(focusedItem._serverUrl || serverUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
	}, [isHome, focusedItem, isLegacy, settings.showHomeBackdrop, serverUrl]);

	const renderItem = useCallback(({index, ...rest}) => {
		const isNearEnd = index >= itemsRef.current.length - (isHome ? PAGE_AHEAD : 50);
		if (isNearEnd) {
			if (isHome) {
				loadMore(activeKeyRef.current);
			} else if (!unifiedMode && apiFetchIndexRef.current < totalCount && !isLoading && !loadingMoreRef.current) {
				loadItems(apiFetchIndexRef.current, true);
			}
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
		const {imageId, imageType: imgApiType} = favoriteCardImage(item, cardType);
		const itemServerUrl = item._serverUrl || serverUrl;
		const imageUrl = imageId ? getImageUrl(itemServerUrl, imageId, imgApiType, {maxHeight: 400, quality: 80}) : null;
		const roundClass = isRound || isPerson ? css.personPoster : '';

		return (
			<SpottableDiv
				{...rest}
				className={css.itemCard}
				onClick={handleItemClick}
				onFocus={handleItemFocus}
				data-index={index}
			>
				<div className={css.itemCardInner}>
					{imageUrl ? (
						<img
							className={`${css.poster} ${roundClass}`}
							style={{height: posterHeight}}
							src={imageUrl}
							alt={item.Name}
							loading="lazy"
						/>
					) : (
						<div className={`${css.posterPlaceholder} ${roundClass}`} style={{height: posterHeight}}>
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
				</div>
			</SpottableDiv>
		);
	}, [serverUrl, handleItemClick, handleItemFocus, isHome, loadMore, totalCount, isLoading, loadItems, cardType, isRound, posterHeight, unifiedMode]);

	const sortLabel = $L(sortOption.label);
	const typeLabel = activeTypeFilter.key === 'all' ? '' : ` · ${$L(activeTypeFilter.label)}`;
	const statusText = $L('{count} favorites sorted by {sortLabel}').replace('{count}', totalCount).replace('{sortLabel}', sortLabel) + typeLabel;

	const tabBarTabs = useMemo(() => {
		return tabs.map((tab) => ({id: tab.key, label: `${$L(tab.label)}: ${countsByKey[tab.key] || 0}`}));
	}, [tabs, countsByKey]);

	const emptyText = isHome ? $L('No favorites yet') : $L('No favorites found');

	return (
		<div className={css.page}>
			{isHome && (
				<BackdropLayer
					targetUrl={targetBackdropUrl}
					blurAmount={settings.backdropBlurHome}
					overlayOpacity={BACKDROP_OVERLAY_OPACITY}
				/>
			)}

			<div className={css.content}>
				<div className={css.header}>
					<div className={css.title}>{$L('Favorites')}</div>
					<div className={css.itemCount}>{displayTotal} {$L('Items')}</div>
				</div>

				<ToolbarContainer
					className={css.toolbar}
					spotlightId="favorites-toolbar"
					onKeyDown={isHome ? handleHomeToolbarKeyDown : handleLibraryToolbarKeyDown}
				>
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

					{!isHome && (
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
					)}
				</ToolbarContainer>

				{isHome && (
					<div className={css.hudRow}>
						<FocusedItemHud item={focusedItem} serverUrl={serverUrl} />
					</div>
				)}

				{isHome && tabBarTabs.length > 0 && (
					<div className={css.tabRow} onKeyDown={handleTabsKeyDown} onFocus={keepFocusInView}>
						<DetailsTabBar
							tabs={tabBarTabs}
							activeId={activeTab?.key}
							activeSpotlightId="favorites-active-tab"
							onSelect={selectTabById}
							onActivate={handleTabActivate}
							spotlightId="favorites-tabs"
						/>
					</div>
				)}

				<GridContainer className={css.gridContainer}>
					{displayLoading && displayItems.length === 0 ? (
						<div className={css.loading}>
							<LoadingSpinner />
						</div>
					) : displayItems.length === 0 ? (
						<div className={css.empty}>{emptyText}</div>
					) : (
						<div className={css.gridWrapper}>
							<VirtualGridList
								className={css.grid}
								cbScrollTo={captureGridScrollTo}
								dataSize={displayItems.length}
								itemRenderer={renderItem}
								itemSize={gridItemSize}
								direction={gridDirection}
								horizontalScrollbar="hidden"
								verticalScrollbar="hidden"
								spacing={20}
								onScrollStop={handleScrollStop}
								onKeyDown={isHome ? handleHomeGridKeyDown : handleLibraryGridKeyDown}
								spotlightId="favorites-grid"
							/>
						</div>
					)}
				</GridContainer>

				{!isHome && (
					<div className={css.statusBar}>
						<div className={css.statusText}>{statusText}</div>
						<div className={css.statusCount}>{items.length} | {totalCount}</div>
					</div>
				)}
			</div>

			{showSortPanel && (
				<div className={css.sortPanelOverlay} onClick={handleCloseSortPanel}>
					<SortPanelContainer
						className={css.sortPanel}
						spotlightId="fav-sort-panel"
						onClick={stopPropagation}
					>
						<h2 className={css.sortPanelTitle}>{isHome ? $L('Sort By') : $L('Sort & Filter')}</h2>

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

						{/* The tabs are the type picker in the other layout. */}
						{!isHome && (
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
						)}
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
						<div className={css.settingsHeader}>{$L('Favorites')}</div>
						<h2 className={css.sortPanelTitle}>{$L('Settings')}</h2>

						<SpottableButton
							className={css.settingRow}
							onClick={handleCycleImageSize}
							spotlightId="fav-settings-image-size"
						>
							<div className={css.settingLabel}>{$L('Image size')}</div>
							<div className={css.settingValue}>{$L(capitalize(imageSize))}</div>
						</SpottableButton>

						{/* Each tab already knows what shape its cards are. */}
						{!isHome && (
							<SpottableButton
								className={css.settingRow}
								onClick={handleCycleImageType}
								spotlightId="fav-settings-image-type"
							>
								<div className={css.settingLabel}>{$L('Image Type')}</div>
								<div className={css.settingValue}>{$L(capitalize(imageType))}</div>
							</SpottableButton>
						)}

						<SpottableButton
							className={css.settingRow}
							onClick={handleCycleGridDirection}
							spotlightId="fav-settings-grid-direction"
						>
							<div className={css.settingLabel}>{$L('Grid direction')}</div>
							<div className={css.settingValue}>{$L(capitalize(gridDirection))}</div>
						</SpottableButton>

						<SpottableButton
							className={css.settingRow}
							onClick={handleCycleViewStyle}
							spotlightId="fav-settings-view-style"
						>
							<div className={css.settingLabel}>{$L('View style')}</div>
							<div className={css.settingValue}>{$L(VIEW_STYLE_LABELS[viewStyle] || VIEW_STYLE_LABELS.home)}</div>
						</SpottableButton>
					</SettingsPanelContainer>
				</div>
			)}
		</div>
	);
};

export default Favorites;
