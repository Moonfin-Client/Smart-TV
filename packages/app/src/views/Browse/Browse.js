import {useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo} from 'react';
import {isKidsMode, kidsModeRows, mergesContinueWatchingNextUp} from '../../utils/kidsMode';
import {withoutBlocked} from '../../utils/parentalFilter';
import {isPickedRow, isPickedRowShown} from '../../utils/pickedRows';
import useParentalFilter from '../../hooks/useParentalFilter';
import {useUserDataRows} from '../../hooks/useUserDataSync';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {ClassicMediaRow, ModernMediaRow} from '../../components/MediaRow';
import MediaPreviewContext from '../../components/MediaCard/MediaPreviewContext';
import {modernRowSpacing} from '../../components/MediaCard/modernCardLayout';
import SeerrTileRow from '../../components/SeerrTileRow';
import LibraryButtonRow from '../../components/LibraryButtonRow';
import {SkeletonShimmer, skeletonTitleWidths} from '../../components/Skeleton';
import {getImageUrl, getBackdropId} from '../../utils/helpers';
import {channelForProgram, isLiveTvProgram} from '../../utils/liveTvLibrary';
import {focusedCardIndex, cardToRestore, focusedRowIndex, rowToRestore} from '../../utils/rowFocusMemory';
import {radiusToCss, shadowToCss, toCssColor} from '../../theme/themeSpec';
import DetailSection from './DetailSection';
import FeaturedBanner from './FeaturedBanner';
import MakdBanner from './MakdBanner';
import GalleryBanner from './GalleryBanner';
import AyaBanner from './AyaBanner';
import BannerBar from './BannerBar';
import BookshelfBar from './BookshelfBar';
import BackdropLayer from '../../components/BackdropLayer';
import useBrowseData from './useBrowseData';
import useSeerrRows from './useSeerrRows';
import useExternalRows from './useExternalRows';
import useMediaPreview from './useMediaPreview';
import {buildBrowseRows, sameRowList} from './buildBrowseRows';
import {markHomeReady} from '../../utils/homeReady';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const BACKDROP_SETTLE_MS = 250;
// Home draws its first rows and adds the rest one at a time, so a slow TV shows something to focus
// sooner. Focus always has a couple of built rows below it.
const FIRST_ROWS = 3;
const ROWS_AHEAD = 2;
const ROW_MOUNT_GAP_MS = 50;
// Engines without lazy loading fetch every poster on the page, so rows further down wait for theirs
// until focus comes near.
const NATIVE_LAZY_IMAGES = typeof document === 'undefined' || 'loading' in document.createElement('img');

const LOADING_ROW_TITLE_WIDTHS = skeletonTitleWidths(4, 24);

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
	onHoldThemeMusic,
	backHandlerRef
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers, user} = useAuth();
	const {settings, activeTheme, loaded: settingsLoaded} = useSettings();
	// The one place the saved rows are read, so filtering here covers both what gets fetched and
	// what gets drawn.
	const kidsMode = isKidsMode(settings);

	const homeRowsConfig = useMemo(() => {
		return kidsModeRows([...(settings.homeRows || [])].sort((a, b) => a.order - b.order), kidsMode);
	}, [settings.homeRows, kidsMode]);

	// The collections, genres and playlists given a row of their own. Kids Mode left them out above.
	const {displayCollectionsRows, displayGenresRows, displayPlaylistsRows, unifiedLibraryMode} = settings;
	const pluginSectionsConfig = useMemo(() => {
		const gates = {displayCollectionsRows, displayGenresRows, displayPlaylistsRows, unifiedLibraryMode};
		return homeRowsConfig.filter((row) => isPickedRow(row) && isPickedRowShown(row, gates, serverUrl));
	}, [homeRowsConfig, displayCollectionsRows, displayGenresRows, displayPlaylistsRows, unifiedLibraryMode, serverUrl]);
	const {isEnabled: seerrEnabled, isAuthenticated: seerrAuthenticated, user: seerrUser, pluginInfo} = useSeerr();
	const recommendationsSupported = pluginInfo?.recommendationsSupported === true;
	const seerrUserId = seerrUser?.seerrUserId;
	const {rows: seerrRows, pending: seerrPending} = useSeerrRows({
		seerrEnabled,
		seerrAuthenticated,
		seerrUserId,
		homeRows: homeRowsConfig
	});
	const {rows: externalRows, pending: externalPending} = useExternalRows({settings, homeRows: homeRowsConfig, kidsMode});
	const pendingRows = useMemo(() => [...seerrPending, ...externalPending], [seerrPending, externalPending]);
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
	const filteredRowsRef = useRef([]);
	const rowRefsMap = useRef(new Map());
	const rowNodesRef = useRef(new Map());
	const initialFocusSetRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const contentRowsRef = useRef(null);
	const scrollsRef = useRef(new Map());
	const isVisibleRef = useRef(isVisible);
	isVisibleRef.current = isVisible;
	// Coming back to a card means its row has to be there already.
	const [mountedRows, setMountedRows] = useState(() => (lastFocusState ? Infinity : FIRST_ROWS));
	const mountedRowsRef = useRef(mountedRows);
	mountedRowsRef.current = mountedRows;
	const pendingScrollRef = useRef(null);
	const [imageRows, setImageRows] = useState(FIRST_ROWS);

	const showFeaturedBar = (settings.featuredBarStyle !== 'off');

	const registerRowRef = useCallback((rowIndex, element) => {
		rowNodesRef.current.delete(rowIndex);
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
		? modernRowSpacing(settings)
		: Math.max(0, settings.classicHomeRowsPadding ?? 30);

	const {
		isLoading, browseMode, allRowData, featuredItems: loadedFeaturedItems, pendingSections,
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
		recommendationsSupported,
		getItemServerUrl,
		homeRowsConfig
	});

	// The rows keep the focus callbacks they mounted with, so those read the current values here.
	const liveRef = useRef(null);
	liveRef.current = {
		browseMode,
		showTopInfoArea,
		useModernRows,
		navbarPosition: settings.navbarPosition,
		onFocusItemThemeMusic,
		onBlurItemThemeMusic
	};

	// Filtered here rather than where the bar loads, so slides cached before a rating was blocked
	// drop out too.
	const {parentalFilter} = useParentalFilter();
	const featuredItems = useMemo(
		() => withoutBlocked(loadedFeaturedItems, parentalFilter),
		[loadedFeaturedItems, parentalFilter]
	);

	const mergeContinueWatchingNextUp = mergesContinueWatchingNextUp(settings);

	// Only the settings the row list is built from, so a change to any other one doesn't
	// rebuild every row.
	const rowBuildSettings = useMemo(() => ({
		mergeContinueWatchingNextUp,
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
		seasonalRowEnabled: settings.seasonalRowEnabled,
		parentalFilter,
		kidsModeEnabled: settings.kidsModeEnabled
	}), [settings.kidsModeEnabled, parentalFilter, mergeContinueWatchingNextUp, settings.hiddenContinueWatchingItems, settings.hiddenNextUpSeries,
		settings.displayFavoritesRows, settings.displayCollectionsRows, settings.displayGenresRows, settings.displayPlaylistsRows,
		settings.displayAudioRows, settings.displayStudiosRows, settings.displayRewatchRow,
		settings.imdbTop250MoviesEnabled, settings.imdbTop250TvShowsEnabled, settings.imdbMostPopularMoviesEnabled,
		settings.imdbMostPopularTvShowsEnabled, settings.imdbLowestRatedMoviesEnabled, settings.imdbTopEnglishMoviesEnabled,
		settings.seasonalRowEnabled]);

	const builtRows = useMemo(() => {
		const result = buildBrowseRows({
			allRowData,
			seerrRows,
			externalRows,
			homeRowsConfig,
			pluginSectionsConfig,
			settings: rowBuildSettings,
			pendingSections,
			pendingRows
		});
		const prev = prevFilteredRowsRef.current;
		if (sameRowList(prev, result)) return prev;
		prevFilteredRowsRef.current = result;
		return result;
	}, [allRowData, seerrRows, externalRows, homeRowsConfig, pluginSectionsConfig, rowBuildSettings, pendingSections, pendingRows]);
	// The rows can come back from a cache built before the watched state last moved, so what's
	// known now is laid over them rather than fetched again.
	const filteredRows = useUserDataRows(builtRows);
	const hasFocusableRow = filteredRows.some((row) => !row.isPlaceholder);

	const focusRow = useCallback((rowIndex, cardIndex, cardId) => {
		if (cardId && Spotlight.focus(cardId)) return true;
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
		let targetRow = rowNodesRef.current.get(rowIndex);
		if (!targetRow) {
			const registered = rowRefsMap.current.get(rowIndex);
			targetRow = registered && typeof registered.offsetTop === 'number'
				? registered
				: container.querySelector(`[data-row-index="${rowIndex}"]`);
			if (!targetRow) return;
			rowNodesRef.current.set(rowIndex, targetRow);
		}
		const {showTopInfoArea: overlay, navbarPosition} = liveRef.current;
		const topbarOffset = overlay && navbarPosition !== 'left' ? 20 : 0;
		const top = Math.max(0, targetRow.offsetTop - topbarOffset);
		if (Math.abs(container.scrollTop - top) > 1) container.scrollTop = top;
	}, []);

	// Focus scrolling lands wherever the engine likes, sometimes with the row's bottom past the
	// screen, and it lands after the focus handlers, so the row is put back at its resting spot on
	// the frames behind it. However many moves ask, each frame settles once.
	const settleRef = useRef({row: -1, passes: 0, frame: 0});
	const settleRow = useCallback((rowIndex, passes) => {
		const settle = settleRef.current;
		settle.row = rowIndex;
		settle.passes = Math.max(settle.passes, passes);
		if (settle.frame) return;
		const step = () => {
			settle.frame = 0;
			pinMainScroll();
			restRowScroll(settle.row);
			settle.passes -= 1;
			if (settle.passes > 0) settle.frame = window.requestAnimationFrame(step);
		};
		settle.frame = window.requestAnimationFrame(step);
	}, [pinMainScroll, restRowScroll]);

	const scrollToRow = useCallback((rowIndex, thenFocus, cardIndex, cardId) => {
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		if (rowIndex >= mountedRowsRef.current) {
			pendingScrollRef.current = [rowIndex, thenFocus, cardIndex, cardId];
			setMountedRows(rowIndex + 1 + ROWS_AHEAD);
			return;
		}

		const targetRow = rowRefsMap.current.get(rowIndex);
		const container = contentRowsRef.current;
		if (!targetRow || !container) {
			if (thenFocus) focusRow(rowIndex, cardIndex, cardId);
			return;
		}

		// A row is only measured once it renders, so landing on one that was still
		// standing in at a guessed height leaves it above the screen with its cards
		// cut off. Settling once it is real puts it where it was asked to go.
		restRowScroll(rowIndex);
		settleRow(rowIndex, 2);

		if (thenFocus) {
			let attempts = 0;
			const tryFocus = () => {
				attempts += 1;
				if (focusRow(rowIndex, cardIndex, cardId)) {
					return;
				}
				if (attempts < 6) {
					scrollTimeoutRef.current = setTimeout(tryFocus, 16);
				}
			};
			scrollTimeoutRef.current = setTimeout(tryFocus, 0);
		}
	}, [focusRow, restRowScroll, settleRow]);

	// Run after the new rows have registered themselves.
	useEffect(() => {
		const pending = pendingScrollRef.current;
		if (!pending) return;
		pendingScrollRef.current = null;
		scrollToRow(...pending);
	}, [mountedRows, scrollToRow]);

	useEffect(() => {
		if (isLoading || mountedRows >= filteredRows.length) return undefined;
		const timer = setTimeout(() => setMountedRows((count) => count + 1), ROW_MOUNT_GAP_MS);
		return () => clearTimeout(timer);
	}, [isLoading, mountedRows, filteredRows.length]);

	useEffect(() => {
		if (!isLoading && isVisible) markHomeReady();
	}, [isLoading, isVisible]);

	// A pointer scrolls the rows without moving focus, so where posters wait for focus they also
	// follow whichever rows have come on screen.
	useEffect(() => {
		const node = contentRowsRef.current;
		if (NATIVE_LAZY_IMAGES || isLoading || !node) return undefined;
		let frame = 0;
		const reveal = () => {
			frame = 0;
			const bottom = node.scrollTop + node.clientHeight;
			const rows = node.querySelectorAll('[data-row-index]');
			let last = -1;
			for (let i = 0; i < rows.length; i++) {
				if (rows[i].offsetTop < bottom) last = Math.max(last, Number(rows[i].getAttribute('data-row-index')));
			}
			if (last >= 0) setImageRows((count) => Math.max(count, last + 1 + ROWS_AHEAD));
		};
		const onScroll = () => {
			if (!frame) frame = window.requestAnimationFrame(reveal);
		};
		node.addEventListener('scroll', onScroll);
		return () => {
			node.removeEventListener('scroll', onScroll);
			window.cancelAnimationFrame(frame);
		};
	}, [isLoading]);

	// A placeholder holds a loading section's place but has nothing to focus, so moving between
	// rows steps over it.
	const focusableRowFrom = useCallback((fromRowIndex, step) => {
		const rows = filteredRowsRef.current;
		for (let i = fromRowIndex; i >= 0 && i < rows.length; i += step) {
			if (!rows[i].isPlaceholder) return i;
		}
		return -1;
	}, []);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		const targetIndex = focusableRowFrom(fromRowIndex - 1, -1);
		if (targetIndex < 0) {
			if (showFeaturedBar !== false) {
				setBrowseMode('featured');
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		scrollToRow(targetIndex, true);
	}, [showFeaturedBar, settings.navbarPosition, scrollToRow, setBrowseMode, focusableRowFrom]);

	filteredRowsRef.current = filteredRows;

	// The row focus goes back to, stepping off a placeholder to the nearest real row above it.
	const returnRow = useCallback((state) => {
		const nearest = rowToRestore(filteredRowsRef.current, state);
		const above = focusableRowFrom(nearest, -1);
		return above >= 0 ? above : focusableRowFrom(nearest, 1);
	}, [focusableRowFrom]);

	// Hiding Home drops how far each row was scrolled, so that's noted as it changes and put back
	// when Home shows again.
	useEffect(() => {
		const rows = contentRowsRef.current;
		const scrolls = scrollsRef.current;
		if (!rows) return undefined;
		const note = (event) => {
			if (isVisibleRef.current) scrolls.set(event.target, event.target.scrollLeft);
		};
		rows.addEventListener('scroll', note, true);
		return () => {
			rows.removeEventListener('scroll', note, true);
			scrolls.clear();
		};
	}, [isLoading]);

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = focusableRowFrom(fromRowIndex + 1, 1);
		if (targetIndex < 0) return;
		scrollToRow(targetIndex, true);
	}, [scrollToRow, focusableRowFrom]);

	useEffect(() => {
		if (showFeaturedBar === false) {
			setBrowseMode('rows');
		}
	}, [showFeaturedBar, setBrowseMode]);

	// Run before paint, so a card that's come back to already has its focus and its row's scroll
	// when Home shows again.
	useLayoutEffect(() => {
		if (!isVisible) {
			wasVisibleRef.current = false;
			return;
		}
		if (isLoading || !hasFocusableRow) return;
		// Home is built again after sign in and playback, so the ref that marks a first run starts
		// over with it. A place to return to is what tells the two apart.
		if (wasVisibleRef.current && lastFocusState === null) return;
		wasVisibleRef.current = true;
		scrollsRef.current.forEach((left, node) => {
			node.scrollLeft = left;
		});

		fetchFreshFeaturedItems();
		refreshVolatileData(true);

		// The first row is somewhere the user was too, so it comes back like any other rather than
		// handing the screen to the banner.
		if (lastFocusState) {
			const {cardIndex, cardId} = lastFocusState;
			const row = returnRow(lastFocusState);
			lastFocusState = null;
			// Marked as placed, or the first focus would still take the media bar once its items land.
			initialFocusSetRef.current = true;
			setBrowseMode('rows');
			scrollToRow(row, !focusRow(row, cardIndex, cardId), cardIndex, cardId);
			return;
		}
		setTimeout(() => {
			if (showFeaturedBar !== false && featuredItems.length > 0) {
				setBrowseMode('featured');
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else {
				scrollToRow(focusableRowFrom(0, 1), true);
			}
		}, FOCUS_DELAY_MS);
	}, [isVisible, isLoading, filteredRows.length, hasFocusableRow, fetchFreshFeaturedItems, refreshVolatileData, showFeaturedBar, featuredItems.length, scrollToRow, setBrowseMode, focusableRowFrom, returnRow, focusRow]);

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
				} else if (hasFocusableRow) {
					Spotlight.focus(`row-${focusableRowFrom(0, 1)}`);
					initialFocusSetRef.current = true;
				}
			}, FOCUS_DELAY_MS);
		}
	}, [isVisible, isLoading, featuredItems.length, hasFocusableRow, showFeaturedBar, setBrowseMode, focusableRowFrom]);

	useEffect(() => {
		initialFocusSetRef.current = false;
	}, [accessToken]);

	// The card preview for the home rows. Only the rows get the provider, so the
	// same cards drawn by Seerr Discover and the library never start one.
	const mediaPreview = useMediaPreview({api, settings, isVisible, browseMode, onThemeMusicHold: onHoldThemeMusic});

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
		const active = document.activeElement;
		lastFocusState = {
			rowIndex,
			rowId: filteredRowsRef.current[rowIndex]?.id,
			cardIndex: focusedCardIndex(`row-${rowIndex}`, active),
			cardId: active?.getAttribute('data-spotlight-id') || null
		};
	}, []);

	const handleSelectItem = useCallback((item, autoPlay = false) => {
		mediaPreview.stop('select');
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		rememberFocus();
		if (item.isRecordingsShortcut) {
			onOpenRecordings?.();
		} else if (item.isLibraryTile) {
			onSelectLibrary?.(item);
		} else if (item.Type === 'Recording') {
			onPlayRecording?.(item);
		} else if (isLiveTvProgram(item)) {
			onSelectItem?.(channelForProgram(item));
		} else {
			onSelectItem?.(item, autoPlay);
		}
	}, [onSelectItem, onSelectLibrary, onOpenRecordings, onPlayRecording, onBlurItemThemeMusic, onLeaveThemeMusic, rememberFocus, mediaPreview]);

	const handleSelectGenreItem = useCallback((item) => {
		mediaPreview.stop('select');
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
	}, [onSelectGenre, onBlurItemThemeMusic, onLeaveThemeMusic, rememberFocus, mediaPreview]);

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

	// The rows ignore a changed callback, so one drawn while Home sat hidden behind Details kept a
	// handler that cant navigate. These always call the current one.
	const latestSelectRef = useRef(null);
	useLayoutEffect(() => {
		latestSelectRef.current = {item: handleSelectItem, genre: handleSelectGenreItem, seerr: handleSelectSeerrItem, external: handleSelectExternalItem};
	}, [handleSelectItem, handleSelectGenreItem, handleSelectSeerrItem, handleSelectExternalItem]);
	const rowSelect = useMemo(() => ({
		item: (picked, autoPlay) => latestSelectRef.current.item(picked, autoPlay),
		genre: (picked) => latestSelectRef.current.genre(picked),
		seerr: (picked) => latestSelectRef.current.seerr(picked),
		external: (picked) => latestSelectRef.current.external(picked)
	}), []);

	// The banner unmounts as soon as the mode flips, so the row takes focus right away.
	const handleNavigateDownFromFeatured = useCallback(() => {
		setBrowseMode('rows');
		scrollToRow(focusableRowFrom(0, 1), true);
	}, [scrollToRow, setBrowseMode, focusableRowFrom]);

	// Back below the top row returns the list to it rather than leaving, so the exit
	// prompt only shows from the top of the screen.
	useEffect(() => {
		if (!backHandlerRef || !isVisible) return undefined;
		const handler = () => {
			const top = focusableRowFrom(0, 1);
			if (browseMode === 'featured' || focusedRowIndex(document.activeElement) === top) return false;
			scrollToRow(top, true);
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, isVisible, browseMode, scrollToRow, focusableRowFrom]);

	const handleFeaturedFocusCallback = useCallback(() => {
		setBrowseMode('featured');
		// Picking from the bar should come back to the bar, not to a row left earlier.
		lastFocusedRowRef.current = null;
		detailSectionRef.current?.clearFocusedItem();
	}, [setBrowseMode]);

	const handleRowFocus = useCallback((rowIndex) => {
		if (liveRef.current.browseMode !== 'rows') {
			setBrowseMode('rows');
		}
		if (typeof rowIndex !== 'number') return;
		const rowChanged = rowIndex !== lastFocusedRowRef.current;
		lastFocusedRowRef.current = rowIndex;
		if (rowChanged) {
			const wanted = rowIndex + 1 + ROWS_AHEAD;
			setMountedRows((count) => Math.max(count, wanted));
			if (!NATIVE_LAZY_IMAGES) setImageRows((count) => Math.max(count, wanted));
		}
		// A pointer hover focuses whatever it crosses, and pulling that row
		// to its resting spot would make the screen chase the cursor, so the
		// pin only answers key driven focus.
		if (Spotlight.getPointerMode()) {
			pinMainScroll();
			return;
		}
		settleRow(rowIndex, rowChanged ? 2 : 1);
	}, [setBrowseMode, pinMainScroll, settleRow]);

	const backdropTimerRef = useRef(null);
	const handleFocusItem = useCallback((item) => {
		const live = liveRef.current;
		if (live.showTopInfoArea) {
			detailSectionRef.current?.handleFocusItem(item);
		} else if (!live.useModernRows) {
			// The info overlay used to be the only feed into the backdrop, so
			// turning it off silently killed backdrops with it. Classic rows hand
			// the item over directly when the overlay isn't there to do it, once
			// focus stops moving.
			clearTimeout(backdropTimerRef.current);
			backdropTimerRef.current = setTimeout(() => setFocusedItemForBackdrop(item), BACKDROP_SETTLE_MS);
		}
		if (item?.Id && (item.Type === 'Movie' || item.Type === 'Series')) {
			live.onFocusItemThemeMusic?.(item.Id);
		} else {
			live.onBlurItemThemeMusic?.();
		}
	}, []);

	useEffect(() => () => {
		clearTimeout(backdropTimerRef.current);
		window.cancelAnimationFrame(settleRef.current.frame);
	}, []);

	const navOffsetClass = settings.navbarPosition === 'left' ? css.sidebarOffset : css.topbarOffset;
	const rowsClipClass = showTopInfoArea ? '' : css.rowsClipTop;

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={`${css.mainContent} ${navOffsetClass}`}>
					<SkeletonShimmer className={`${css.contentRows} ${rowsClipClass}`}>
						{LOADING_ROW_TITLE_WIDTHS.map((titleWidth, index) => (
							<RowComponent key={index} loading titleWidth={titleWidth} rowSpacing={rowSpacing} />
						))}
					</SkeletonShimmer>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={`${css.mainContent} ${navOffsetClass}`} ref={mainContentRef}>
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

				<MediaPreviewContext.Provider value={mediaPreview}>
				<div
					ref={contentRowsRef}
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''} ${rowsClipClass}`}
					data-pointer-rows
				>
					{filteredRows.map((row, index) => {
						if (row.isPlaceholder || index >= mountedRows) {
							return (
								<RowComponent
									key={row.id}
									loading
									title={row.title}
									subtitle={row.subtitle}
									cardType={row.type}
									rowSpacing={rowSpacing}
								/>
							);
						}
						if (row.isButtonRow) {
							return (
								<LibraryButtonRow
									key={row.id}
									rowId={row.id}
									title={row.title}
									items={row.items}
									onSelectItem={rowSelect.item}
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
									onSelectItem={rowSelect.seerr}
									onFocus={handleRowFocus}
									onFocusItem={handleFocusItem}
									rowIndex={index}
									onNavigateUp={handleNavigateUp}
									onNavigateDown={handleNavigateDown}
									registerRowRef={registerRowRef}
								/>
							);
						}
						const isCwOrNextUp = row.id === 'continue-nextup' || row.id === 'resume' || row.id === 'nextup';
						const shouldPlayImmediately = isCwOrNextUp && settings.continueWatchingDefaultAction === 'play';
						let selectHandler = shouldPlayImmediately
							? (picked) => rowSelect.item(picked, true)
							: rowSelect.item;
						if (row.isSeerrRow || row.isOnlineRecoRow) selectHandler = rowSelect.seerr;
						else if (row.isExternalRow) selectHandler = rowSelect.external;
						else if (row.isGenreRow) selectHandler = rowSelect.genre;
						// Per library rows share one override under the id that gates them.
						// Overrides are a classic rows feature, the modern layout keeps its
						// own arrangement untouched.
						const imageTypeKey = row.isLatestRow ? 'latest-media'
							: row.isRecentlyReleasedRow ? 'recently-released' : row.id;
						const rowImageOverride = settings.homeRowsStyle === 'v1'
							? (settings.homeRowImageTypes || {})[imageTypeKey]
							: undefined;
						const rowMenuOptions = isCwOrNextUp
							? {isContinueWatchingOrNextUp: true, playImmediately: settings.continueWatchingDefaultAction === 'play'}
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
								deferImages={!NATIVE_LAZY_IMAGES && index >= imageRows}
								menuOptions={rowMenuOptions}
							/>
						);
					})}
					{filteredRows.length === 0 && (
						<div className={css.empty}>{$L('No content found')}</div>
					)}
				</div>
				</MediaPreviewContext.Provider>
			</div>
		</div>
	);
};

export default Browse;
