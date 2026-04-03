import {useState, useCallback, useEffect, lazy, Suspense, useRef} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import {Panels, Panel} from '@enact/sandstone/Panels';

import {AuthProvider, useAuth} from '../context/AuthContext';
import {useSettings} from '../context/SettingsContext';
import * as playback from '../services/playback';
import * as connectionPool from '../services/connectionPool';
import {isBackKey, KEYS} from '../utils/keys';
import {isTizen, isWebOS} from '../platform';
import {initVideo, cleanupVideoElement, setupVisibilityHandler, setupPlatformLifecycle} from '../services/video';
import {SettingsProvider} from '../context/SettingsContext';
import {JellyseerrProvider} from '../context/JellyseerrContext';
import {useVersionCheck} from '../hooks/useVersionCheck';
import UpdateNotification from '../components/UpdateNotification';
import NavBar from '../components/NavBar';
import Sidebar from '../components/Sidebar';
import AccountModal from '../components/AccountModal';
import ExitDialog from '../components/ExitDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import Screensaver from '../components/Screensaver';
import SeasonalTheme from '../components/SeasonalTheme';
import PhotoViewer from '../components/PhotoViewer';
import ComicViewer from '../components/ComicViewer';
import useInactivityTimer from '../hooks/useInactivityTimer';
import {useThemeMusic} from '../hooks/useThemeMusic';
import Login from '../views/Login';
import Browse from '../views/Browse';

const Details = lazy(() => import('../views/Details'));
const Library = lazy(() => import('../views/Library'));
const Search = lazy(() => import('../views/Search'));
const Settings = lazy(() => import('../views/Settings'));
const Player = lazy(() => import('../views/Player'));
const Favorites = lazy(() => import('../views/Favorites'));
const Genres = lazy(() => import('../views/Genres'));
const GenreBrowse = lazy(() => import('../views/GenreBrowse'));
const Person = lazy(() => import('../views/Person'));
const LiveTV = lazy(() => import('../views/LiveTV'));
const Recordings = lazy(() => import('../views/Recordings'));
const JellyseerrDiscover = lazy(() => import('../views/JellyseerrDiscover'));
const JellyseerrDetails = lazy(() => import('../views/JellyseerrDetails'));
const JellyseerrRequests = lazy(() => import('../views/JellyseerrRequests'));
const JellyseerrBrowse = lazy(() => import('../views/JellyseerrBrowse'));
const JellyseerrPerson = lazy(() => import('../views/JellyseerrPerson'));

import css from './App.module.less';

const MAX_HISTORY_LENGTH = 10;

const normalizeJellyseerrSelection = (item) => {
	if (!item) return null;

	const normalizedType = item.mediaType || item.media_type || item.type || item.Type;
	const mediaType = normalizedType === 'movie' || normalizedType === 'Movie'
		? 'movie'
		: normalizedType === 'tv' || normalizedType === 'show' || normalizedType === 'Series' || normalizedType === 'Tv'
			? 'tv'
			: item.title
				? 'movie'
				: 'tv';

	const mediaId = item.mediaId || item.tmdbId || item.id || item.Id || item.media?.tmdbId || item.media?.id;
	if (mediaId == null) return null;

	return {mediaId, mediaType};
};

const PanelLoader = () => (
	<div className={css.panelLoader}>
		<LoadingSpinner />
	</div>
);

const PANELS = {
	LOGIN: 0,
	BROWSE: 1,
	DETAILS: 2,
	LIBRARY: 3,
	SEARCH: 4,
	SETTINGS: 5,
	PLAYER: 6,
	FAVORITES: 7,
	GENRES: 8,
	PERSON: 9,
	LIVETV: 10,
	JELLYSEERR_DISCOVER: 11,
	JELLYSEERR_DETAILS: 12,
	JELLYSEERR_REQUESTS: 13,
	GENRE_BROWSE: 14,
	RECORDINGS: 15,
	JELLYSEERR_BROWSE: 16,
	JELLYSEERR_PERSON: 17,
	ADD_SERVER: 18,
	ADD_USER: 19
};

const AppContent = (props) => {
	const {isAuthenticated, isLoading, logout, serverUrl, serverName, api, user, hasMultipleServers, accessToken} = useAuth();
	const {settings} = useSettings();
	const themeMusic = useThemeMusic();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [panelIndex, setPanelIndex] = useState(PANELS.LOGIN);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedLibrary, setSelectedLibrary] = useState(null);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const [selectedGenre, setSelectedGenre] = useState(null);
	const [genreFilter, setGenreFilter] = useState(null);
	const [playingItem, setPlayingItem] = useState(null);
	const [panelHistory, setPanelHistory] = useState([]);
	const [jellyseerrItem, setJellyseerrItem] = useState(null);
	const [jellyseerrBrowse, setJellyseerrBrowse] = useState(null);
	const [jellyseerrPerson, setJellyseerrPerson] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	const [libraries, setLibraries] = useState([]);
	const [showAccountModal, setShowAccountModal] = useState(false);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const cleanupHandlersRef = useRef(null);
	const backHandlerRef = useRef(null);
	const detailsItemStackRef = useRef([]);
	const jellyseerrItemStackRef = useRef([]);
	const prevUserIdRef = useRef(null);
	const [photoViewerItem, setPhotoViewerItem] = useState(null);
	const [photoViewerItems, setPhotoViewerItems] = useState([]);
	const [comicViewerItem, setComicViewerItem] = useState(null);

	const fetchLibraries = useCallback(async () => {
		if (isAuthenticated && api && user) {
			try {
				let libs;
				if (unifiedMode) {
					libs = await connectionPool.getLibrariesFromAllServers();
					libs = libs.map(lib => ({
						...lib,
						Name: `${lib.Name} (${lib._serverName})`
					}));
				} else {
					const result = await api.getLibraries();
					libs = result.Items || [];
				}
				libs.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
				setLibraries(libs);
			} catch (err) {
				console.error('Failed to fetch libraries:', err);
			}
		} else {
			setLibraries([]);
		}
	}, [isAuthenticated, api, user, unifiedMode]);

	useEffect(() => {
		fetchLibraries();
	}, [fetchLibraries]);

	useEffect(() => {
		document.documentElement.style.setProperty('--accent-color', settings.focusColor || '#00a4dc');
	}, [settings.focusColor]);

	useEffect(() => {
		const scale = settings.uiScale || 1.0;
		if (scale === 1.0) return;

		const html = document.documentElement;
		let scaled = 0;
		let unscaled = 0;

		const applyScale = () => {
			const current = parseFloat(html.style.fontSize) || 24;
			if (current === scaled) return;
			unscaled = current;
			scaled = Math.round(current * scale * 10) / 10;
			html.style.fontSize = scaled + 'px';
		};

		applyScale();

		const observer = new window.MutationObserver(applyScale);
		observer.observe(html, {attributes: true, attributeFilter: ['style']});

		return () => {
			observer.disconnect();
			if (unscaled) html.style.fontSize = unscaled + 'px';
		};
	}, [settings.uiScale]);

	const {updateInfo, formattedNotes, dismiss: dismissUpdate} = useVersionCheck(isAuthenticated ? 3000 : null);

	const screensaverActive = isAuthenticated &&
		settings.screensaverEnabled &&
		panelIndex !== PANELS.LOGIN &&
		panelIndex !== PANELS.PLAYER;
	const {isInactive: showScreensaver, dismiss: dismissScreensaver} = useInactivityTimer(
		settings.screensaverTimeout || 90,
		screensaverActive
	);

	const THEME_MUSIC_TYPES = ['Movie', 'Series', 'Season', 'Episode'];

	useEffect(() => {
		if (panelIndex === PANELS.DETAILS && selectedItem && THEME_MUSIC_TYPES.includes(selectedItem.Type)) {
			themeMusic.playThemeMusic(selectedItem.SeriesId || selectedItem.Id);
		} else if (panelIndex === PANELS.PLAYER) {
			themeMusic.stopThemeMusicImmediate();
		} else if (panelIndex !== PANELS.DETAILS) {
			themeMusic.cancelDelayed();
			themeMusic.stopThemeMusic();
		}
	}, [panelIndex, selectedItem?.Id]); // eslint-disable-line react-hooks/exhaustive-deps

	const performAppCleanup = useCallback(() => {
		console.log('[App] Performing app cleanup...');

		// Stop any active playback reporting
		playback.stopProgressReporting();
		playback.stopHealthMonitoring();

		// Try to report playback stopped if there was an active session
		const session = playback.getCurrentSession();
		if (session) {
			try {
				playback.reportStop(session.positionTicks || 0);
			} catch (e) {
				console.warn('[App] Failed to report stop during cleanup:', e);
			}
		}

		// Clean up any video elements to release hardware decoder
		const videoElements = document.querySelectorAll('video');
		videoElements.forEach(video => {
			cleanupVideoElement(video);
		});

		console.log('[App] App cleanup complete');
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		// Handle app being closed/hidden (beforeunload, pagehide)
		const handleBeforeUnload = () => {
			console.log('[App] beforeunload event - cleaning up');
			performAppCleanup();
		};

		const handlePageHide = (event) => {
			console.log('[App] pagehide event - persisted:', event.persisted);
			if (!event.persisted) {
				performAppCleanup();
			}
		};

		const handleVisibilityHidden = () => {
			console.log('[App] App hidden/suspended');
			const videoElements = document.querySelectorAll('video');
			videoElements.forEach(video => {
				if (!video.paused) {
					video.pause();
				}
			});
		};

		const handleVisibilityVisible = () => {
			console.log('[App] App visible/resumed');
		};

		const handleRelaunch = (params) => {
			console.log('[App] Platform relaunch event received:', params);
			performAppCleanup();
			setPlayingItem(null);
			setPanelHistory([]);
			if (isAuthenticated) {
				setPanelIndex(PANELS.BROWSE);
			}
			if (isWebOS()) {
				window.webOSSystem.activate();
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('pagehide', handlePageHide);

		let removeVisibilityHandler;
		let removeLifecycleHandler;
		let cancelled = false;

		initVideo().then(() => {
			if (cancelled) return;
			removeVisibilityHandler = setupVisibilityHandler(handleVisibilityHidden, handleVisibilityVisible);
			removeLifecycleHandler = setupPlatformLifecycle(handleRelaunch);
		});

		if (isTizen()) {
			import('@moonfin/platform-tizen/smarthub').then(m => m.initSmartHub()).catch(() => {});
		}

		let handlePlatformLaunch;
		if (isWebOS()) {
			handlePlatformLaunch = () => console.log('[App] webOSLaunch event received');
			document.addEventListener('webOSLaunch', handlePlatformLaunch);
		}

		cleanupHandlersRef.current = () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
			if (handlePlatformLaunch) document.removeEventListener('webOSLaunch', handlePlatformLaunch);
			removeVisibilityHandler?.();
			removeLifecycleHandler?.();
		};

		return () => {
			cancelled = true;
			if (cleanupHandlersRef.current) {
				cleanupHandlersRef.current();
			}
		};
	}, [isAuthenticated, performAppCleanup]);

	useEffect(() => {
		if (!isAuthenticated || !user?.Id) {
			prevUserIdRef.current = null;
			return;
		}

		if (user.Id !== prevUserIdRef.current) {
			prevUserIdRef.current = user.Id;
			setPanelHistory([]);
			setPanelIndex(PANELS.BROWSE);
		}
	}, [user?.Id, isAuthenticated]);


	useEffect(() => {
		if (!isLoading && !authChecked) {
			setAuthChecked(true);
			if (isAuthenticated) {
				setPanelIndex(PANELS.BROWSE);
			}
		}
	}, [isLoading, isAuthenticated, authChecked]);

	const navigateTo = useCallback((panel, addToHistory = true) => {
		if (addToHistory && panelIndex !== PANELS.LOGIN) {
			setPanelHistory(prev => {
				const newHistory = [...prev, panelIndex];
				if (newHistory.length > MAX_HISTORY_LENGTH) {
					return newHistory.slice(-MAX_HISTORY_LENGTH);
				}
				return newHistory;
			});
		}
		setPanelIndex(panel);
	}, [panelIndex]);

	const handleBack = useCallback(() => {
		detailsItemStackRef.current = [];
		jellyseerrItemStackRef.current = [];
		if (panelIndex === PANELS.ADD_SERVER || panelIndex === PANELS.ADD_USER) {
			setPanelHistory([]);
			setPanelIndex(PANELS.SETTINGS);
			return;
		}
		if (panelHistory.length > 0) {
			const prevPanel = panelHistory[panelHistory.length - 1];
			setPanelHistory(prev => prev.slice(0, -1));
			setPanelIndex(prevPanel);
		} else if (panelIndex > PANELS.BROWSE) {
			setPanelIndex(PANELS.BROWSE);
		}
	}, [panelHistory, panelIndex]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.keyCode === KEYS.BACKSPACE && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
				return;
			}
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();

				if (showExitDialog) {
					return;
				}

				if (showAccountModal) {
					setShowAccountModal(false);
					return;
				}

				if (panelIndex === PANELS.BROWSE || panelIndex === PANELS.LOGIN) {
					setShowExitDialog(true);
					return;
				}
				if (panelIndex === PANELS.PLAYER || panelIndex === PANELS.SETTINGS) {
					return;
				}
				if (backHandlerRef.current?.()) return;
				// Pop item stack for same-panel back navigation
				if (panelIndex === PANELS.DETAILS && detailsItemStackRef.current.length > 0) {
					setSelectedItem(detailsItemStackRef.current.pop());
					return;
				}
				if (panelIndex === PANELS.JELLYSEERR_DETAILS && jellyseerrItemStackRef.current.length > 0) {
					setJellyseerrItem(jellyseerrItemStackRef.current.pop());
					return;
				}
				handleBack();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [panelIndex, handleBack, performAppCleanup, showAccountModal, showExitDialog]);

	const handleLoggedIn = useCallback(() => {
		setPanelHistory([]);
		navigateTo(PANELS.BROWSE, false);
	}, [navigateTo]);

	const handleShuffle = useCallback(async () => {
		try {
			// Convert setting value to API format
			const contentType = settings.shuffleContentType || 'both';
			const includeItemTypes = contentType === 'movies' ? 'Movie'
				: contentType === 'tv' ? 'Series'
				: 'Movie,Series';

			let item;
			if (unifiedMode) {
				// Get random items from all servers
				const items = await connectionPool.getRandomItemsFromAllServers(contentType, 1);
				if (items.length > 0) {
					item = items[0];
				}
			} else {
				const result = await api.getRandomItem(includeItemTypes);
				if (result.Items?.length > 0) {
					item = result.Items[0];
				}
			}

			if (item) {
				setSelectedItem(item);
				navigateTo(PANELS.DETAILS);
			}
		} catch (err) {
			console.error('Shuffle failed:', err);
		}
	}, [api, navigateTo, settings.shuffleContentType, unifiedMode]);

	const handleSelectItem = useCallback((item) => {
		if (item.isJellyseerr) {
			const jellyseerrMapped = normalizeJellyseerrSelection(item);
			if (!jellyseerrMapped) {
				return;
			}
			if (panelIndex === PANELS.JELLYSEERR_DETAILS && jellyseerrItem) {
				jellyseerrItemStackRef.current.push(jellyseerrItem);
				setJellyseerrItem(jellyseerrMapped);
			} else {
				jellyseerrItemStackRef.current = [];
				setJellyseerrItem(jellyseerrMapped);
				navigateTo(PANELS.JELLYSEERR_DETAILS);
			}
			return;
		}
		if (item.Type === 'Photo') {
			setPhotoViewerItem(item);
			return;
		}
		if (item.Type === 'PhotoAlbum') {
			setSelectedLibrary(item);
			navigateTo(PANELS.LIBRARY);
			return;
		}
		if (panelIndex === PANELS.DETAILS && selectedItem) {
			detailsItemStackRef.current.push(selectedItem);
			setSelectedItem(item);
		} else {
			detailsItemStackRef.current = [];
			setSelectedItem(item);
			navigateTo(PANELS.DETAILS);
		}
	}, [navigateTo, panelIndex, selectedItem, jellyseerrItem]);

	const handleViewPhoto = useCallback((item, siblings) => {
		setPhotoViewerItem(item);
		setPhotoViewerItems(siblings || []);
	}, []);

	const handleClosePhotoViewer = useCallback(() => {
		setPhotoViewerItem(null);
		setPhotoViewerItems([]);
	}, []);

	const handleCloseComicViewer = useCallback(() => {
		setComicViewerItem(null);
	}, []);

	const handleSelectLibrary = useCallback((library) => {
		if (library.CollectionType === 'livetv') {
			navigateTo(PANELS.LIVETV);
			return;
		}
		setSelectedLibrary(library);
		setGenreFilter(null);
		navigateTo(PANELS.LIBRARY);
	}, [navigateTo]);

	const [playbackOptions, setPlaybackOptions] = useState(null);
	const [isResume, setIsResume] = useState(false);

	const handlePlay = useCallback((item, resume, options) => {
		if (item.MediaType === 'Book' && item.Path?.toLowerCase().endsWith('.cbz')) {
			setComicViewerItem(item);
			return;
		}
		setPlayingItem(item);
		setPlaybackOptions(options || null);
		setIsResume(!!resume);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo]);

	const handlePlayNext = useCallback((item) => {
		setPlayingItem(item);
		setPlaybackOptions(null);
		setIsResume(false);
	}, []);

	const handlePlayerEnd = useCallback(() => {
		setPlayingItem(null);
		handleBack();
	}, [handleBack]);

	const handleOpenSearch = useCallback(() => {
		navigateTo(PANELS.SEARCH);
	}, [navigateTo]);

	const handleOpenSettings = useCallback(() => {
		navigateTo(PANELS.SETTINGS);
	}, [navigateTo]);

	const handleOpenAccountModal = useCallback(() => {
		setShowAccountModal(true);
	}, []);

	const handleCloseAccountModal = useCallback(() => {
		setShowAccountModal(false);
	}, []);

	const handleCancelExitDialog = useCallback(() => {
		setShowExitDialog(false);
	}, []);

	const handleOpenFavorites = useCallback(() => {
		navigateTo(PANELS.FAVORITES);
	}, [navigateTo]);

	const handleOpenGenres = useCallback(() => {
		navigateTo(PANELS.GENRES);
	}, [navigateTo]);

	const handleSelectGenre = useCallback((genre, library) => {
		setGenreFilter(genre.name);
		if (library) {
			setSelectedLibrary(library);
		} else if (genre._serverUrl) {
			setSelectedLibrary({
				Id: null,
				Name: genre.name,
				_serverUrl: genre._serverUrl,
				_serverAccessToken: genre._serverAccessToken,
				_serverUserId: genre._serverUserId,
				_serverName: genre._serverName,
				_serverId: genre._serverId
			});
		} else {
			setSelectedLibrary(null);
		}
		navigateTo(PANELS.LIBRARY);
	}, [navigateTo]);

	const handleSelectPerson = useCallback((person) => {
		setSelectedPerson(person);
		navigateTo(PANELS.PERSON);
	}, [navigateTo]);

	const handlePlayChannel = useCallback((channel) => {
		setPlayingItem(channel);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo]);

	const handleOpenRecordings = useCallback(() => {
		navigateTo(PANELS.RECORDINGS);
	}, [navigateTo]);

	const handlePlayRecording = useCallback((recording) => {
		setPlayingItem(recording);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo]);

	const handleOpenJellyseerr = useCallback(() => {
		navigateTo(PANELS.JELLYSEERR_DISCOVER);
	}, [navigateTo]);

	const handleHome = useCallback(() => {
		setPanelHistory([]);
		setSelectedItem(null);
		setSelectedLibrary(null);
		setSelectedPerson(null);
		setSelectedGenre(null);
		setGenreFilter(null);
		setJellyseerrItem(null);
		setJellyseerrBrowse(null);
		setJellyseerrPerson(null);
		window.dispatchEvent(new CustomEvent('moonfin:browseRefresh'));
		setPanelIndex(PANELS.BROWSE);
	}, []);

	const handleOpenJellyseerrRequests = useCallback(() => {
		navigateTo(PANELS.JELLYSEERR_REQUESTS);
	}, [navigateTo]);

	const handleSwitchUser = useCallback(async () => {
		await logout();
		setPanelHistory([]);
		setPanelIndex(PANELS.LOGIN);
	}, [logout]);

	const handleAddServer = useCallback(() => {
		setPanelHistory([]);
		setPanelIndex(PANELS.ADD_SERVER);
	}, []);

	const handleAddUser = useCallback(() => {
		setPanelHistory([]);
		setPanelIndex(PANELS.ADD_USER);
	}, []);

	const handleServerAdded = useCallback((result) => {
		if (!result) {
			setPanelHistory([]);
			setPanelIndex(PANELS.SETTINGS);
			return;
		}
		setPanelHistory([]);
		setPanelIndex(PANELS.BROWSE);
	}, []);

	const handleSelectJellyseerrItem = useCallback((item) => {
		const normalized = normalizeJellyseerrSelection(item);
		if (!normalized) {
			return;
		}
		if (panelIndex === PANELS.JELLYSEERR_DETAILS && jellyseerrItem) {
			jellyseerrItemStackRef.current.push(jellyseerrItem);
			setJellyseerrItem(normalized);
		} else {
			jellyseerrItemStackRef.current = [];
			setJellyseerrItem(normalized);
			navigateTo(PANELS.JELLYSEERR_DETAILS);
		}
	}, [navigateTo, panelIndex, jellyseerrItem]);

	const handleSelectJellyseerrGenre = useCallback((genreId, genreName, mediaType) => {
		setJellyseerrBrowse({browseType: 'genre', item: {id: genreId, name: genreName}, mediaType});
		navigateTo(PANELS.JELLYSEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectJellyseerrStudio = useCallback((studioId, studioName) => {
		setJellyseerrBrowse({browseType: 'studio', item: {id: studioId, name: studioName}, mediaType: 'movie'});
		navigateTo(PANELS.JELLYSEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectJellyseerrNetwork = useCallback((networkId, networkName) => {
		setJellyseerrBrowse({browseType: 'network', item: {id: networkId, name: networkName}, mediaType: 'tv'});
		navigateTo(PANELS.JELLYSEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectJellyseerrKeyword = useCallback((keyword, mediaType) => {
		setJellyseerrBrowse({browseType: 'keyword', item: keyword, mediaType});
		navigateTo(PANELS.JELLYSEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectJellyseerrPerson = useCallback((personId, personName) => {
		setJellyseerrPerson({id: personId, name: personName});
		navigateTo(PANELS.JELLYSEERR_PERSON);
	}, [navigateTo]);

	if (isLoading || !authChecked) {
		return (
			<div className={css.loading}>
				<LoadingSpinner />
			</div>
		);
	}

	const getActiveView = () => {
		switch (panelIndex) {
			case PANELS.BROWSE: return 'home';
			case PANELS.SEARCH: return 'search';
			case PANELS.SETTINGS: return 'settings';
			case PANELS.FAVORITES: return 'favorites';
			case PANELS.GENRES: return 'genres';
			case PANELS.JELLYSEERR_DISCOVER:
			case PANELS.JELLYSEERR_DETAILS:
			case PANELS.JELLYSEERR_REQUESTS:
			case PANELS.JELLYSEERR_BROWSE:
			case PANELS.JELLYSEERR_PERSON:
				return 'discover';
			case PANELS.LIBRARY: return selectedLibrary?.Id || '';
			default: return '';
		}
	};

	const showNavBar = panelIndex !== PANELS.LOGIN &&
		panelIndex !== PANELS.PLAYER &&
		panelIndex !== PANELS.LIBRARY &&
		panelIndex !== PANELS.ADD_SERVER &&
		panelIndex !== PANELS.ADD_USER &&
		panelIndex !== PANELS.GENRES &&
		panelIndex !== PANELS.FAVORITES &&
		!(panelIndex === PANELS.DETAILS && ['Playlist', 'MusicAlbum', 'MusicArtist'].includes(selectedItem?.Type));

	return (
		<div className={css.app} {...props}>
			{showNavBar && settings.navbarPosition === 'left' ? (
				<Sidebar
					libraries={libraries}
					onHome={handleHome}
					onSearch={handleOpenSearch}
					onShuffle={handleShuffle}
					onGenres={handleOpenGenres}
					onFavorites={handleOpenFavorites}
					onDiscover={handleOpenJellyseerr}
					onSettings={handleOpenSettings}
					onSelectLibrary={handleSelectLibrary}
					onUserMenu={handleOpenAccountModal}
				/>
			) : showNavBar ? (
				<NavBar
					activeView={getActiveView()}
					libraries={libraries}
					onHome={handleHome}
					onSearch={handleOpenSearch}
					onShuffle={handleShuffle}
					onGenres={handleOpenGenres}
					onFavorites={handleOpenFavorites}
					onDiscover={handleOpenJellyseerr}
					onSettings={handleOpenSettings}
					onSelectLibrary={handleSelectLibrary}
					onUserMenu={handleOpenAccountModal}
				/>
			) : null}
			<Suspense fallback={<PanelLoader />}>
				<Panels index={panelIndex} noCloseButton noAnimation>
					<Panel>
						<Login onLoggedIn={handleLoggedIn} />
					</Panel>
					<Panel>
						<Browse
							onSelectItem={handleSelectItem}
							onSelectLibrary={handleSelectLibrary}
							isVisible={panelIndex === PANELS.BROWSE}
							onFocusItemThemeMusic={themeMusic.playThemeMusicDelayed}
							onBlurItemThemeMusic={themeMusic.cancelDelayed}
							onLeaveThemeMusic={themeMusic.stopThemeMusic}
						/>
					</Panel>
					<Panel>
						{panelIndex === PANELS.DETAILS && (
							<Details
								itemId={selectedItem?.Id}
								initialItem={selectedItem}
								onPlay={handlePlay}
								onSelectItem={handleSelectItem}
								onSelectPerson={handleSelectPerson}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.LIBRARY && (
							<Library
							library={selectedLibrary}
							genreFilter={genreFilter}
							onSelectItem={handleSelectItem}
							onViewPhoto={handleViewPhoto}
							onHome={handleHome}
								backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEARCH && (
							<Search onSelectItem={handleSelectItem} onSelectPerson={handleSelectPerson} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SETTINGS && (
							<Settings onBack={handleBack} onLibrariesChanged={fetchLibraries} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.PLAYER && playingItem && (
							<Player
								item={playingItem}
								resume={isResume}
								initialMediaSourceId={playbackOptions?.mediaSourceId}
								initialAudioIndex={playbackOptions?.audioStreamIndex}
								initialSubtitleIndex={playbackOptions?.subtitleStreamIndex}
								audioPlaylist={playbackOptions?.audioPlaylist}
								onEnded={handlePlayerEnd}
								onBack={handlePlayerEnd}
								onPlayNext={handlePlayNext}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.FAVORITES && (
							<Favorites onSelectItem={handleSelectItem} onSelectPerson={handleSelectPerson} onHome={handleHome} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GENRES && (
							<Genres onSelectGenre={handleSelectGenre} onHome={handleHome} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.PERSON && (
							<Person personId={selectedPerson?.Id} onSelectItem={handleSelectItem} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.LIVETV && (
							<LiveTV onPlayChannel={handlePlayChannel} onRecordings={handleOpenRecordings} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.JELLYSEERR_DISCOVER && (
							<JellyseerrDiscover
								onSelectItem={handleSelectJellyseerrItem}
								onSelectGenre={handleSelectJellyseerrGenre}
								onSelectStudio={handleSelectJellyseerrStudio}
								onSelectNetwork={handleSelectJellyseerrNetwork}
								onOpenRequests={handleOpenJellyseerrRequests}

							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.JELLYSEERR_DETAILS && (
							<JellyseerrDetails
								mediaType={jellyseerrItem?.mediaType}
								mediaId={jellyseerrItem?.mediaId}
								onSelectItem={handleSelectJellyseerrItem}
								onPlayInMoonfin={handleSelectItem}
								onSelectPerson={handleSelectJellyseerrPerson}
								onSelectKeyword={handleSelectJellyseerrKeyword}
							onClose={handleBack}
							onBack={handleBack}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.JELLYSEERR_REQUESTS && (
							<JellyseerrRequests
								onSelectItem={handleSelectJellyseerrItem}
								onClose={handleBack}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GENRE_BROWSE && (
							<GenreBrowse
								genre={selectedGenre}
								onSelectItem={handleSelectItem}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.RECORDINGS && (
							<Recordings onPlayRecording={handlePlayRecording} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.JELLYSEERR_BROWSE && (
							<JellyseerrBrowse
								browseType={jellyseerrBrowse?.browseType}
								item={jellyseerrBrowse?.item}
								mediaType={jellyseerrBrowse?.mediaType}
								onSelectItem={handleSelectJellyseerrItem}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.JELLYSEERR_PERSON && (
							<JellyseerrPerson
								personId={jellyseerrPerson?.id}
								personName={jellyseerrPerson?.name}
								onSelectItem={handleSelectJellyseerrItem}
								onBack={handleBack}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.ADD_SERVER && (
							<Login
								onLoggedIn={handleLoggedIn}
								onServerAdded={handleServerAdded}
								isAddingServer
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.ADD_USER && (
							<Login
								onLoggedIn={handleLoggedIn}
								onServerAdded={handleServerAdded}
								isAddingUser
								currentServerUrl={serverUrl}
								currentServerName={serverName}
							/>
						)}
					</Panel>
				</Panels>
			</Suspense>
			<AccountModal
				open={showAccountModal}
				onClose={handleCloseAccountModal}
				onLogout={handleSwitchUser}
				onAddServer={handleAddServer}
				onAddUser={handleAddUser}
			/>
			<ExitDialog
				open={showExitDialog}
				onCancel={handleCancelExitDialog}
				onExit={performAppCleanup}
			/>
			<UpdateNotification
				updateInfo={updateInfo}
				formattedNotes={formattedNotes}
				onDismiss={dismissUpdate}
			/>
			{photoViewerItem && (
				<PhotoViewer
					item={photoViewerItem}
					items={photoViewerItems}
					serverUrl={serverUrl}
					onClose={handleClosePhotoViewer}
				/>
			)}
			{comicViewerItem && (
				<ComicViewer
					item={comicViewerItem}
					serverUrl={serverUrl}
					accessToken={accessToken}
					onClose={handleCloseComicViewer}
				/>
			)}
			<Screensaver
				visible={showScreensaver}
				mode={settings.screensaverMode || 'library'}
				dimmingLevel={settings.screensaverDimmingLevel}
				showClock={settings.screensaverShowClock}
				clockDisplay={settings.clockDisplay}
				maxRating={settings.screensaverAgeFilter ? settings.screensaverMaxRating : null}
				onDismiss={dismissScreensaver}
				serverUrl={serverUrl}
			/>
			<SeasonalTheme theme={settings.seasonalTheme} />
		</div>
	);
};

const AppBase = (props) => (
	<SettingsProvider>
		<AuthProvider>
			<JellyseerrProvider>
				<AppContent {...props} />
			</JellyseerrProvider>
		</AuthProvider>
	</SettingsProvider>
);

const App = ThemeDecorator(AppBase);
export default App;
