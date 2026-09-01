import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {ClassicMediaRow, ModernMediaRow} from '../../components/MediaRow';
import SeerrTileRow from '../../components/SeerrTileRow';
import LibraryButtonRow from '../../components/LibraryButtonRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId} from '../../utils/helpers';
import {focusedCardIndex, cardToRestore, focusedRowIndex} from '../../utils/rowFocusMemory';
import {radiusToCss, shadowToCss, toCssColor} from '../../theme/themeSpec';
import DetailSection from './DetailSection';
import FeaturedBanner from './FeaturedBanner';
import MakdBanner from './MakdBanner';
import GalleryBanner from './GalleryBanner';
import AyaBanner from './AyaBanner';
import BannerBar from './BannerBar';
import BookshelfBar from './BookshelfBar';
import BackdropLayer from './BackdropLayer';
import useBrowseData from './useBrowseData';
import useSeerrRows from './useSeerrRows';
import useExternalRows from './useExternalRows';
import {buildBrowseRows, sameRowList} from './buildBrowseRows';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const TRANSITION_DELAY_MS = 450;

let lastFocusState = null;

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
	onOpenSeerrShortcut,
	isVisible = true,
	onFocusItemThemeMusic,
	onBlurItemThemeMusic,
	onLeaveThemeMusic,
	backHandlerRef
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers, user} = useAuth();
	const {settings, activeTheme, loaded: settingsLoaded} = useSettings();
	const {isEnabled: seerrEnabled, isAuthenticated: seerrAuthenticated, user: seerrUser} = useSeerr();
	const seerrUserId = seerrUser?.seerrUserId;
	const seerrRows = useSeerrRows({
		seerrEnabled,
		seerrAuthenticated,
		seerrUserId,
		homeRows: settings.homeRows
	});
	const externalRows = useExternalRows({settings});
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const isLegacy = typeof document !== 'undefined' && (' ' + document.documentElement.className + ' ').indexOf(' legacy ') >= 0;
	const [focusedItemForBackdrop, setFocusedItemForBackdrop] = useState(null);
	const mainContentRef = useRef(null);

	// Moving focus scrolls every scrollable ancestor, overflow hidden included,
	// and this one holds the info overlay, which ends up clipped at the top of
	// the screen and under the navbar. The engine emits no scroll event for it,
	// so the focus handlers put it back rather than a listener.
	const pinMainScroll = useCallback(() => {
		const node = mainContentRef.current;
		if (!node) return;
		if (node.scrollTop !== 0) node.scrollTop = 0;
		if (node.scrollLeft !== 0) node.scrollLeft = 0;
	}, []);
	const detailSectionRef = useRef(null);
	const lastFocusedRowRef = useRef(null);
	const wasVisibleRef = useRef(true);
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

	// Only the parts a theme owns belong here. Painting a surface color or clearing
	// the filter would flatten the frosted treatment the stylesheet applies.
	const uiPanelStyle = useMemo(() => {
		return {
			boxShadow: activeTheme.borders.focusGlow.length
				? activeTheme.borders.focusGlow.map(shadowToCss).join(', ')
				: 'none'
		};
	}, [activeTheme]);

	const uiButtonStyle = useMemo(() => {
		return {
			color: toCssColor(activeTheme.colors.onButtonNormal),
			borderRadius: radiusToCss(activeTheme.borders.chipRadius)
		};
	}, [activeTheme]);

	const useModernRows = settings.homeRowsStyle !== 'v1';
	const RowComponent = useModernRows ? ModernMediaRow : ClassicMediaRow;
	const showTopInfoArea = !useModernRows && settings.homeRowOverlay !== false;
	// The other clients size these sliders in their own units, so the stored value
	// lands here as the space below each row. Full screen rows pace themselves.
	const rowSpacing = settings.fullScreenRows ? null : useModernRows
		? Math.max(0, Math.min(Math.max((settings.modernHomeRowsPadding ?? 460) - 400, -40), 200) - 34)
		: Math.max(0, settings.classicHomeRowsPadding ?? 30);

	const homeRowsConfig = useMemo(() => {
		return [...(settings.homeRows || [])].sort((a, b) => a.order - b.order);
	}, [settings.homeRows]);

	const pluginSectionsConfig = useMemo(() => {
		return [...(settings.pluginSections || [])].sort((a, b) => a.order - b.order);
	}, [settings.pluginSections]);

	const {
		isLoading, browseMode, allRowData, featuredItems,
		setBrowseMode, fetchFreshFeaturedItems, refreshVolatileData
	} = useBrowseData({
		api,
		serverUrl,
		accessToken,
		userId: user?.Id || null,
		settings,
		unifiedMode,
		seerrEnabled,
		seerrAuthenticated,
		getItemServerUrl,
		homeRowsConfig
	});

	// Only the settings the row list is built from, so a change to any other one doesn't
	// rebuild every row.
	const rowBuildSettings = useMemo(() => ({
		mergeContinueWatchingNextUp: settings.mergeContinueWatchingNextUp,
		hiddenContinueWatchingItems: settings.hiddenContinueWatchingItems,
		hiddenNextUpSeries: settings.hiddenNextUpSeries,
		displayFavoritesRows: settings.displayFavoritesRows,
		displayCollectionsRows: settings.displayCollectionsRows,
		displayGenresRows: settings.displayGenresRows,
		displayPlaylistsRows: settings.displayPlaylistsRows,
		displayAudioRows: settings.displayAudioRows,
		displayStudiosRows: settings.displayStudiosRows,
		displayRewatchRow: settings.displayRewatchRow,
		imdbTop250MoviesEnabled: settings.imdbTop250MoviesEnabled,
		imdbTop250TvShowsEnabled: settings.imdbTop250TvShowsEnabled,
		imdbMostPopularMoviesEnabled: settings.imdbMostPopularMoviesEnabled,
		imdbMostPopularTvShowsEnabled: settings.imdbMostPopularTvShowsEnabled,
		imdbLowestRatedMoviesEnabled: settings.imdbLowestRatedMoviesEnabled,
		imdbTopEnglishMoviesEnabled: settings.imdbTopEnglishMoviesEnabled,
		blockedRatings: settings.blockedRatings
	}), [settings.mergeContinueWatchingNextUp, settings.hiddenContinueWatchingItems, settings.hiddenNextUpSeries,
		settings.displayFavoritesRows, settings.displayCollectionsRows, settings.displayGenresRows, settings.displayPlaylistsRows,
		settings.displayAudioRows, settings.displayStudiosRows, settings.displayRewatchRow,
		settings.imdbTop250MoviesEnabled, settings.imdbTop250TvShowsEnabled, settings.imdbMostPopularMoviesEnabled,
		settings.imdbMostPopularTvShowsEnabled, settings.imdbLowestRatedMoviesEnabled, settings.imdbTopEnglishMoviesEnabled,
		settings.blockedRatings]);

	const filteredRows = useMemo(() => {
		const result = buildBrowseRows({
			allRowData,
			seerrRows,
			externalRows,
			homeRowsConfig,
			pluginSectionsConfig,
			settings: rowBuildSettings
		});
		const prev = prevFilteredRowsRef.current;
		if (sameRowList(prev, result)) return prev;
		prevFilteredRowsRef.current = result;
		return result;
	}, [allRowData, seerrRows, externalRows, homeRowsConfig, pluginSectionsConfig, rowBuildSettings]);

	const focusRow = useCallback((rowIndex, cardIndex) => {
		const card = cardToRestore(`row-${rowIndex}`, cardIndex);
		if (card && Spotlight.focus(card)) {
			return true;
		}

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

	// With the info overlay above the rows the row pins right under the overlay,
	// leaving a tall row its room below at every UI scale. Without the overlay
	// the scroller itself starts under the navbar, so the row pins at its top.
	const restRowScroll = useCallback((rowIndex) => {
		const container = contentRowsRef.current;
		if (!container) return;
		// The ref a row hands over is the spotlight container component rather
		// than its div, so the real node is looked up by the index stamped on it.
		const registered = rowRefsMap.current.get(rowIndex);
		const targetRow = registered && typeof registered.offsetTop === 'number'
			? registered
			: container.querySelector(`[data-row-index="${rowIndex}"]`);
		if (!targetRow) return;
		const topbarOffset = showTopInfoArea && settings.navbarPosition !== 'left' ? 20 : 0;
		const top = Math.max(0, targetRow.offsetTop - topbarOffset);
		if (Math.abs(container.scrollTop - top) > 1) container.scrollTop = top;
	}, [settings.navbarPosition, showTopInfoArea]);

	const scrollToRow = useCallback((rowIndex, thenFocus, cardIndex) => {
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

		const targetRow = rowRefsMap.current.get(rowIndex);
		const container = contentRowsRef.current;
		if (!targetRow || !container) {
			if (thenFocus) focusRow(rowIndex, cardIndex);
			return;
		}

		// A row is only measured once it renders, so landing on one that was still
		// standing in at a guessed height leaves it above the screen with its cards
		// cut off. Settling once it is real puts it where it was asked to go.
		const settle = (passes) => {
			restRowScroll(rowIndex);
			if (passes > 0) window.requestAnimationFrame(() => settle(passes - 1));
		};
		settle(2);

		if (thenFocus) {
			let attempts = 0;
			const tryFocus = () => {
				attempts += 1;
				if (focusRow(rowIndex, cardIndex)) {
					return;
				}
				if (attempts < 6) {
					scrollTimeoutRef.current = setTimeout(tryFocus, 16);
				}
			};
			scrollTimeoutRef.current = setTimeout(tryFocus, 0);
		}
	}, [focusRow, restRowScroll]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			if (showFeaturedBar !== false) {
				setBrowseMode('featured');
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		const targetIndex = fromRowIndex - 1;
		scrollToRow(targetIndex, true);
	}, [showFeaturedBar, settings.navbarPosition, scrollToRow, setBrowseMode]);

	filteredRowsRef.current = filteredRows;
	filteredRowsLengthRef.current = filteredRows.length;

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= filteredRowsLengthRef.current) return;
		scrollToRow(targetIndex, true);
	}, [scrollToRow]);

	useEffect(() => {
		if (showFeaturedBar === false) {
			setBrowseMode('rows');
		}
	}, [showFeaturedBar, setBrowseMode]);

	useEffect(() => {
		if (!isVisible) {
			wasVisibleRef.current = false;
			return;
		}
		if (isLoading || filteredRows.length === 0) return;
		// The panel is built again on the way back in, so the ref that marks a first run
		// starts over with it. A place to return to is what tells the two apart.
		if (wasVisibleRef.current && lastFocusState === null) return;
		wasVisibleRef.current = true;

		fetchFreshFeaturedItems();
		refreshVolatileData(true);

		setTimeout(() => {
			// The first row is somewhere the user was too, so it comes back like any other
			// rather than handing the screen to the banner.
			if (lastFocusState && lastFocusState.rowIndex >= 0) {
				const {rowIndex, cardIndex} = lastFocusState;
				const targetRowIndex = Math.min(rowIndex, filteredRows.length - 1);
				setBrowseMode('rows');
				scrollToRow(targetRowIndex, true, cardIndex);
			} else if (showFeaturedBar !== false && featuredItems.length > 0) {
				setBrowseMode('featured');
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else {
				scrollToRow(0, true);
			}
			lastFocusState = null;
		}, FOCUS_DELAY_MS);
	}, [isVisible, isLoading, filteredRows.length, fetchFreshFeaturedItems, refreshVolatileData, showFeaturedBar, featuredItems.length, scrollToRow, setBrowseMode]);

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
	}, [isVisible, isLoading, featuredItems.length, filteredRows.length, showFeaturedBar, setBrowseMode]);

	useEffect(() => {
		initialFocusSetRef.current = false;
	}, [accessToken]);

	const targetBackdropUrl = useMemo(() => {
		// The aya frame floats inside the page, so its ambient backdrop stays up
		// in featured mode where the full screen bars blank it.
		if (browseMode === 'featured' && settings.featuredBarStyle !== 'aya') return '';
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
	}, [browseMode, focusedItemForBackdrop, isLegacy, settings.showHomeBackdrop, getItemServerUrl, settings.featuredBarStyle]);

	const rememberFocus = useCallback(() => {
		const rowIndex = lastFocusedRowRef.current;
		if (rowIndex === null) return;
		lastFocusState = {
			rowIndex,
			cardIndex: focusedCardIndex(`row-${rowIndex}`, document.activeElement)
		};
	}, []);

	const handleSelectItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		rememberFocus();
		if (item.isRecordingsShortcut) {
			onOpenRecordings?.();
		} else if (item.isLibraryTile) {
			onSelectLibrary?.(item);
		} else if (item.Type === 'Recording') {
			onPlayRecording?.(item);
		} else {
			onSelectItem?.(item);
		}
	}, [onSelectItem, onSelectLibrary, onOpenRecordings, onPlayRecording, onBlurItemThemeMusic, onLeaveThemeMusic, rememberFocus]);

	const handleSelectGenreItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		rememberFocus();
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
	}, [onSelectGenre, onBlurItemThemeMusic, onLeaveThemeMusic, rememberFocus]);

	const handleSelectSeerrItem = useCallback((item) => {
		const raw = item._seerrRaw || {};
		rememberFocus();
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
			case 'shortcut':
				onOpenSeerrShortcut?.(raw.shortcut);
				break;
			default:
				// This is all the handler is given, so the library id has to travel with the
				// pick or a title the server already holds cant be told from one it has not.
				onSelectSeerrItem?.({...raw, libraryId: item._seerrLibraryId});
				break;
		}
	}, [onSelectSeerrItem, onSelectSeerrGenre, onSelectSeerrStudio, onSelectSeerrNetwork, onOpenSeerrShortcut, rememberFocus]);

	// External row items that resolved to a library item open as the library item, and the ones
	// that did not open as the Seerr title they came from.
	const handleSelectExternalItem = useCallback((item) => {
		if (item && item._seerr && !item._resolvedFromExternal) {
			handleSelectSeerrItem(item);
		} else {
			handleSelectItem(item);
		}
	}, [handleSelectSeerrItem, handleSelectItem]);

	const handleNavigateDownFromFeatured = useCallback(() => {
		setBrowseMode('rows');
		setTimeout(() => {
			scrollToRow(0, true);
		}, TRANSITION_DELAY_MS);
	}, [scrollToRow, setBrowseMode]);

	// Back below the top row returns the list to it rather than leaving, so the exit
	// prompt only shows from the top of the screen.
	useEffect(() => {
		if (!backHandlerRef || !isVisible) return undefined;
		const handler = () => {
			if (browseMode === 'featured' || focusedRowIndex(document.activeElement) === 0) return false;
			scrollToRow(0, true);
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, isVisible, browseMode, scrollToRow]);

	const handleFeaturedFocusCallback = useCallback(() => {
		setBrowseMode('featured');
		detailSectionRef.current?.clearFocusedItem();
	}, [setBrowseMode]);

	const handleRowFocus = useCallback((rowIndex) => {
		pinMainScroll();
		if (browseMode !== 'rows') {
			setBrowseMode('rows');
		}
		if (typeof rowIndex === 'number') {
			lastFocusedRowRef.current = rowIndex;
			// A pointer hover focuses whatever it crosses, and pulling that row
			// to its resting spot would make the screen chase the cursor, so the
			// pin only answers key driven focus.
			if (!Spotlight.getPointerMode()) {
				// Focus scrolling lands wherever the engine likes, sometimes with the
				// row's bottom past the screen, and it lands after this handler, so the
				// focused row is put back at its resting spot on the frames behind it.
				restRowScroll(rowIndex);
				window.requestAnimationFrame(() => restRowScroll(rowIndex));
				window.requestAnimationFrame(() => window.requestAnimationFrame(() => restRowScroll(rowIndex)));
			}
		}
	}, [browseMode, setBrowseMode, pinMainScroll, restRowScroll]);

	const handleFocusItem = useCallback((item) => {
		pinMainScroll();
		if (showTopInfoArea) {
			detailSectionRef.current?.handleFocusItem(item);
		} else if (!useModernRows) {
			// The info overlay used to be the only feed into the backdrop, so
			// turning it off silently killed backdrops with it. Classic rows hand
			// the item over directly when the overlay is not there to do it.
			setFocusedItemForBackdrop(item);
		}
		if (item?.Id && (item.Type === 'Movie' || item.Type === 'Series')) {
			onFocusItemThemeMusic?.(item.Id);
		} else {
			onBlurItemThemeMusic?.();
		}
	}, [onFocusItemThemeMusic, onBlurItemThemeMusic, showTopInfoArea, useModernRows, pinMainScroll]);

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
					settings.featuredBarStyle === 'aya' ? (
						<AyaBanner
							isVisible={browseMode === 'featured'}
							browseVisible={isVisible}
							featuredItems={featuredItems}
							api={api}
							settings={settings}
							settingsLoaded={settingsLoaded}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
							onAmbientItemChange={setFocusedItemForBackdrop}
						/>
					) : settings.featuredBarStyle === 'gallery' ? (
						<GalleryBanner
							isVisible={browseMode === 'featured'}
							browseVisible={isVisible}
							featuredItems={featuredItems}
							api={api}
							settings={settings}
							settingsLoaded={settingsLoaded}
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
							browseVisible={isVisible}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							api={api}
							settings={settings}
							settingsLoaded={settingsLoaded}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : (
						<FeaturedBanner
							isVisible={browseMode === 'featured'}
							browseVisible={isVisible}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							api={api}
							settings={settings}
							settingsLoaded={settingsLoaded}
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
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''} ${showTopInfoArea ? '' : css.rowsClipTop}`}
				>
					{filteredRows.map((row, index) => {
						if (row.isButtonRow) {
							return (
								<LibraryButtonRow
									key={row.id}
									rowId={row.id}
									title={row.title}
									items={row.items}
									onSelectItem={handleSelectItem}
									onFocus={handleRowFocus}
									onFocusItem={handleFocusItem}
									rowIndex={index}
									onNavigateUp={handleNavigateUp}
									onNavigateDown={handleNavigateDown}
									registerRowRef={registerRowRef}
								/>
							);
						}
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
						// Per library rows share one override under the id that gates them.
						// Overrides are a classic rows feature, the modern layout keeps its
						// own arrangement untouched.
						const imageTypeKey = row.isLatestRow ? 'latest-media'
							: row.isRecentlyReleasedRow ? 'recently-released' : row.id;
						const rowImageOverride = settings.homeRowsStyle === 'v1'
							? (settings.homeRowImageTypes || {})[imageTypeKey]
							: undefined;
						return (
							<RowComponent
								key={row.id}
								rowId={row.id}
								title={row.title}
								items={row.items}
								serverUrl={serverUrl}
								cardType={row.type}
								rowImageType={rowImageOverride || settings.homeRowsImageType}
								onSelectItem={selectHandler}
								onFocus={handleRowFocus}
								onFocusItem={handleFocusItem}
								rowIndex={index}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								showServerBadge={unifiedMode}
								rowSpacing={rowSpacing}
								subtitle={row.subtitle}
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
