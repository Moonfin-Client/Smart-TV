import {useState, useCallback, useEffect, lazy, Suspense, useRef} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import {Panels, Panel} from '@enact/sandstone/Panels';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import ilib from 'ilib';

import {AuthProvider, useAuth} from '../context/AuthContext';
import {useSettings} from '../context/SettingsContext';
import * as connectionPool from '../services/connectionPool';
import {isBackKey, KEYS} from '../utils/keys';
import {applyPerfTier} from '../utils/perfTier';
import {isTizen, isWebOS} from '../platform';
import {initVideo, cleanupVideoElement, setupVisibilityHandler, setupPlatformLifecycle} from '../services/video';
import {SettingsProvider} from '../context/SettingsContext';
import {JellyseerrProvider} from '../context/JellyseerrContext';
import {SyncPlayProvider, useSyncPlay} from '../context/SyncPlayContext';
import {useVersionCheck} from '../hooks/useVersionCheck';
import UpdateNotification from '../components/UpdateNotification';
import DebugOverlay from '../components/DebugOverlay'; // Red Button on TV remote toggles this
import NavBar from '../components/NavBar';
import Sidebar from '../components/Sidebar';
import AccountModal from '../components/AccountModal';
import ExitDialog from '../components/ExitDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import Screensaver from '../components/Screensaver';
import SeasonalTheme from '../components/SeasonalTheme';
import NoConnection from '../components/NoConnection/NoConnection';
import SyncPlayDialog from '../components/SyncPlayDialog';
import PhotoViewer from '../components/PhotoViewer';
import ComicViewer from '../components/ComicViewer';
import SettingsPanel from '../components/SettingsPanel';
import ShuffleOverlay from '../components/ShuffleOverlay';
import SpottableInput from '../components/SpottableInput/SpottableInput';
import useInactivityTimer from '../hooks/useInactivityTimer';
import {useThemeMusic} from '../hooks/useThemeMusic';
import {buildThemeCssVars} from '../theme/themeSpec';
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

import '../styles/perf-overrides.less';
import css from './App.module.less';

const MAX_HISTORY_LENGTH = 10;
const SpottableButton = Spottable('button');

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
	const {isAuthenticated, isLoading, logout, serverUrl, serverName, api, user, hasMultipleServers, accessToken, connectionState, revalidateSession} = useAuth();
	const {settings, activeTheme} = useSettings();
	const themeMusic = useThemeMusic();
	const {openDialog: openSyncPlay, closeDialog: closeSyncPlay, isDialogOpen: syncPlayDialogOpen, playQueueItem, clearPlayQueueItem, isInGroup: isSyncPlayInGroup, setNewQueue: syncPlaySetNewQueue} = useSyncPlay();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [panelIndex, setPanelIndex] = useState(PANELS.LOGIN);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedLibrary, setSelectedLibrary] = useState(null);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const [selectedGenre, setSelectedGenre] = useState(null);
	const [genreFilter, setGenreFilter] = useState(null);
	const [playingItem, setPlayingItem] = useState(null);
	const [playbackOptions, setPlaybackOptions] = useState(null);
	const [isResume, setIsResume] = useState(false);
	const [isPlayerPaused, setIsPlayerPaused] = useState(false);
	const [panelHistory, setPanelHistory] = useState([]);
	const [jellyseerrItem, setJellyseerrItem] = useState(null);
	const [jellyseerrBrowse, setJellyseerrBrowse] = useState(null);
	const [jellyseerrPerson, setJellyseerrPerson] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	const [libraries, setLibraries] = useState([]);
	const [showAccountModal, setShowAccountModal] = useState(false);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const [showSettingsPanel, setShowSettingsPanel] = useState(false);
	const [showShuffleOverlay, setShowShuffleOverlay] = useState(false);
	const [shuffleOriginSpotlightId, setShuffleOriginSpotlightId] = useState('navbar-shuffle');
	const [pinCodeInput, setPinCodeInput] = useState('');
	const [pinCodeError, setPinCodeError] = useState('');
	const [isPinUnlocked, setIsPinUnlocked] = useState(false);
	const cleanupHandlersRef = useRef(null);
	const backHandlerRef = useRef(null);
	const detailsItemStackRef = useRef([]);
	const jellyseerrItemStackRef = useRef([]);
	const prevUserIdRef = useRef(null);
	const [photoViewerItem, setPhotoViewerItem] = useState(null);
	const [photoViewerItems, setPhotoViewerItems] = useState([]);
	const [comicViewerItem, setComicViewerItem] = useState(null);
	const {updateInfo, formattedNotes, dismiss: dismissUpdate} = useVersionCheck(
		isAuthenticated && settings.updateNotificationsEnabled !== false ? 3000 : null
	);
	const configuredPin = typeof settings.pinCode === 'string' && /^\d{4}$/.test(settings.pinCode)
		? settings.pinCode
		: '0000';
	const isPinGateActive = isAuthenticated && settings.pinCodeProtection === true && !isPinUnlocked;
	const screensaverTimeout = Number(settings.screensaverTimeout || 90);
	const screensaverEnabled = Boolean(
		settings.screensaverEnabled &&
		isAuthenticated &&
		panelIndex !== PANELS.LOGIN &&
		(panelIndex !== PANELS.PLAYER || isPlayerPaused) &&
		!showExitDialog &&
		!showShuffleOverlay &&
		!showSettingsPanel &&
		!showAccountModal &&
		!photoViewerItem &&
		!comicViewerItem
	);
	const {isInactive: showScreensaver, dismiss: dismissScreensaver} = useInactivityTimer(screensaverTimeout, screensaverEnabled);

	useEffect(() => {
		window.dispatchEvent(new CustomEvent('moonfin:screensaver', {detail: {active: showScreensaver}}));
	}, [showScreensaver]);

	useEffect(() => {
		if (!isAuthenticated) {
			setIsPinUnlocked(false);
			setPinCodeInput('');
			setPinCodeError('');
			return;
		}
		if (settings.pinCodeProtection === true) {
			setIsPinUnlocked(false);
			setPinCodeInput('');
			setPinCodeError('');
			return;
		}
		setIsPinUnlocked(true);
		setPinCodeInput('');
		setPinCodeError('');
	}, [isAuthenticated, settings.pinCodeProtection, user?.Id]);

	useEffect(() => {
		if (!isPinGateActive) return;
		const timer = setTimeout(() => {
			Spotlight.focus('[data-spotlight-id="app-pin-input"]');
		}, 100);
		return () => clearTimeout(timer);
	}, [isPinGateActive]);

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
		const root = document.documentElement;
		const vars = buildThemeCssVars(activeTheme);
		for (let index = 0; index < 16; index += 1) {
			const navVarName = `--theme-nav-color-${index + 1}`;
			if (!Object.prototype.hasOwnProperty.call(vars, navVarName)) {
				root.style.removeProperty(navVarName);
			}
		}
		for (const [key, value] of Object.entries(vars)) {
			root.style.setProperty(key, value);
		}
		if (activeTheme?.id) {
			root.setAttribute('data-theme-id', activeTheme.id);
		}
	}, [activeTheme]);

	useEffect(() => {
		applyPerfTier(settings.performanceMode === 'auto' ? null : settings.performanceMode);
	}, [settings.performanceMode]);

	useEffect(() => {
		const root = document.documentElement;
		if (settings.focusBorderColor) {
			root.style.setProperty('--theme-focus-border-color', settings.focusBorderColor);
		}
		root.style.setProperty('--theme-navbar-opacity', ((settings.navbarOpacity ?? 100) / 100).toString());
		if (settings.navbarColor) {
			const hex = settings.navbarColor.replace('#', '');
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			root.style.setProperty('--theme-navbar-color-rgb', `${r}, ${g}, ${b}`);
		} else {
			root.style.removeProperty('--theme-navbar-color-rgb');
		}
	}, [activeTheme, settings.focusBorderColor, settings.navbarOpacity, settings.navbarColor]);

	useEffect(() => {
		const scale = settings.uiScale || 1.0;
		if (typeof document === 'undefined' || typeof window === 'undefined') return;
		const html = document.documentElement;
		const previousInlineFontSize = html.style.fontSize || '';

		if (scale === 1.0) {
			if (previousInlineFontSize) {
				html.style.fontSize = previousInlineFontSize;
			} else {
				html.style.removeProperty('font-size');
			}
			return;
		}

		const computed = window.getComputedStyle(html).fontSize;
		const basePx = Number.parseFloat(computed);
		const safeBasePx = Number.isFinite(basePx) && basePx > 0 ? basePx : 24;
		const targetPx = Math.round(safeBasePx * scale * 10) / 10;

		const applyScale = () => {
			const current = Number.parseFloat(html.style.fontSize);
			if (Number.isFinite(current) && Math.abs(current - targetPx) < 0.1) return;
			html.style.fontSize = `${targetPx}px`;
		};

		applyScale();

		const observer = new window.MutationObserver(() => applyScale());
		observer.observe(html, {attributes: true, attributeFilter: ['style', 'class']});

		window.addEventListener('resize', applyScale);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', applyScale);
			if (previousInlineFontSize) {
				html.style.fontSize = previousInlineFontSize;
			} else {
				html.style.removeProperty('font-size');
			}
		};
	}, [settings.uiScale]);

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
		cleanupHandlersRef.current?.();
		cleanupHandlersRef.current = null;

		// Clean up any video elements to release hardware decoder
		const videoElements = document.querySelectorAll('video');
		videoElements.forEach(video => {
			cleanupVideoElement(video);
		});
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		// Handle app being closed/hidden (beforeunload, pagehide)
		const handleBeforeUnload = () => {
			performAppCleanup();
		};

		const handlePageHide = (event) => {
			if (!event.persisted) {
				performAppCleanup();
			}
		};

		const handleVisibilityHidden = () => {
			const videoElements = document.querySelectorAll('video');
			videoElements.forEach(video => {
				if (!video.paused) {
					video.pause();
				}
			});
		};

		const handleVisibilityVisible = () => {
			revalidateSession();
		};

		const handleRelaunch = () => {
			performAppCleanup();
			setPlayingItem(null);
			setPanelHistory([]);
			if (isAuthenticated && settings.pinCodeProtection === true) {
				setIsPinUnlocked(false);
				setPinCodeInput('');
				setPinCodeError('');
			}
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

		cleanupHandlersRef.current = () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
			removeVisibilityHandler?.();
			removeLifecycleHandler?.();
		};

		return () => {
			cancelled = true;
			if (cleanupHandlersRef.current) {
				cleanupHandlersRef.current();
			}
		};
	}, [isAuthenticated, performAppCleanup, revalidateSession, settings.pinCodeProtection]);

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
			if (showShuffleOverlay) {
				return;
			}
			if (e.keyCode === KEYS.BACKSPACE && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
				return;
			}
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();

				if (isPinGateActive) {
					return;
				}

				if (showExitDialog) {
					return;
				}

				if (showAccountModal) {
					setShowAccountModal(false);
					return;
				}

				if (showSettingsPanel) {
					return;
				}

				if (panelIndex === PANELS.BROWSE || panelIndex === PANELS.LOGIN) {
					if (settings.exitConfirmation === false) {
						performAppCleanup();
					} else {
						setShowExitDialog(true);
					}
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
	}, [panelIndex, handleBack, performAppCleanup, settings.exitConfirmation, showAccountModal, showExitDialog, showSettingsPanel, showShuffleOverlay, isPinGateActive]);

	const handleLoggedIn = useCallback(() => {
		setPanelHistory([]);
		navigateTo(PANELS.BROWSE, false);
	}, [navigateTo]);

	const handleShuffle = useCallback(() => {
		const current = Spotlight.getCurrent();
		const spotlightId = current?.getAttribute?.('data-spotlight-id') || current?.id || 'navbar-shuffle';
		setShuffleOriginSpotlightId(spotlightId);
		setShowShuffleOverlay(true);
	}, []);

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
		if (item.Type === 'Audio') {
			setPlayingItem(item);
			setPlaybackOptions(null);
			setIsResume(false);
			navigateTo(PANELS.PLAYER);
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

	const handleSelectLibrary = useCallback(async (library) => {
		if (library.CollectionType === 'livetv') {
			if (settings.liveTvDirect) {
				let channels = null;
				try {
					channels = await api.getLiveTvChannels(0, 1);
				} catch {
					channels = null;
				}
				const firstChannel = channels?.Items?.[0];
				if (firstChannel) {
					setPlayingItem(firstChannel);
					setPlaybackOptions(null);
					setIsResume(false);
					navigateTo(PANELS.PLAYER);
					return;
				}
			}
			navigateTo(PANELS.LIVETV);
			return;
		}
		setSelectedLibrary(library);
		setGenreFilter(null);
		navigateTo(PANELS.LIBRARY);
	}, [api, navigateTo, settings.liveTvDirect]);

	const handlePlay = useCallback((item, resume, options) => {
		if (item.MediaType === 'Book' && item.Path?.toLowerCase().endsWith('.cbz')) {
			setComicViewerItem(item);
			return;
		}
		if (isSyncPlayInGroup) {
			syncPlaySetNewQueue([item.Id]);
		} else if (settings.syncplayEnabled !== false && settings.syncplayAutoOpen) {
			openSyncPlay();
		}
		setPlayingItem(item);
		setPlaybackOptions(options || null);
		setIsResume(!!resume);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo, isSyncPlayInGroup, openSyncPlay, settings.syncplayAutoOpen, settings.syncplayEnabled, syncPlaySetNewQueue]);

	useEffect(() => {
		if (playQueueItem) {
			if (!playingItem || playingItem.Id !== playQueueItem.Id) {
				setPlayingItem(playQueueItem);
				setPlaybackOptions(null);
				setIsResume(false);
				navigateTo(PANELS.PLAYER);
			}
			clearPlayQueueItem();
		}
	}, [playQueueItem, playingItem, navigateTo, clearPlayQueueItem]);

	const handlePlayNext = useCallback((item, trackOptions) => {
		setPlayingItem(item);
		setPlaybackOptions(prev => {
			if (!trackOptions && prev?.audioPlaylist?.some(t => t.Id === item.Id)) {
				return {audioPlaylist: prev.audioPlaylist};
			}
			return trackOptions || null;
		});
		setIsResume(false);
	}, []);

	const handlePlayerEnd = useCallback(() => {
		setIsPlayerPaused(false);
		setPlayingItem(null);
		setPlaybackOptions(null);
		setIsResume(false);
		handleBack();
		window.dispatchEvent(new CustomEvent('moonfin:browseRefresh'));
	}, [handleBack]);

	const handleOpenSearch = useCallback(() => {
		navigateTo(PANELS.SEARCH);
	}, [navigateTo]);

	const handleOpenSettings = useCallback(() => {
		setShowSettingsPanel(true);
	}, []);

	const handleCloseSettingsPanel = useCallback(() => {
		setShowSettingsPanel(false);
	}, []);

	const handleOpenAccountModal = useCallback(() => {
		setShowAccountModal(true);
	}, []);

	const handleCloseAccountModal = useCallback(() => {
		setShowAccountModal(false);
	}, []);

	const handleCancelExitDialog = useCallback(() => {
		setShowExitDialog(false);
	}, []);

	const handleCloseShuffleOverlay = useCallback(() => {
		setShowShuffleOverlay(false);
	}, []);

	const handleRetryConnection = useCallback(() => {
		revalidateSession(true);
	}, [revalidateSession]);

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

	const handleSelectGenreFromBrowse = useCallback((genre) => {
		if (!genre?.name) return;
		setSelectedGenre(genre);
		navigateTo(PANELS.GENRE_BROWSE);
	}, [navigateTo]);

	const handleSelectPerson = useCallback((person) => {
		setSelectedPerson(person);
		navigateTo(PANELS.PERSON);
	}, [navigateTo]);

	const handleSelectPersonFromPlayer = useCallback((person) => {
		if (!person?.Id) return;
		setIsPlayerPaused(false);
		setPlayingItem(null);
		setPlaybackOptions(null);
		setIsResume(false);
		setSelectedPerson(person);
		navigateTo(PANELS.PERSON, false);
	}, [navigateTo]);

	const handlePlayChannel = useCallback((channel) => {
		setPlayingItem(channel);
		setPlaybackOptions(null);
		setIsResume(false);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo]);

	const handleOpenRecordings = useCallback(() => {
		navigateTo(PANELS.RECORDINGS);
	}, [navigateTo]);

	const handlePlayRecording = useCallback((recording) => {
		setPlayingItem(recording);
		setPlaybackOptions(null);
		setIsResume(false);
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

	const handlePinInputChange = useCallback((e) => {
		const nextValue = String(e.target.value || '').replace(/\D/g, '').slice(0, 4);
		setPinCodeInput(nextValue);
		if (pinCodeError) {
			setPinCodeError('');
		}
	}, [pinCodeError]);

	const handlePinSubmit = useCallback(() => {
		if (pinCodeInput === configuredPin) {
			setIsPinUnlocked(true);
			setPinCodeInput('');
			setPinCodeError('');
			return;
		}
		setPinCodeInput('');
		setPinCodeError($L('Incorrect PIN code'));
		Spotlight.focus('[data-spotlight-id="app-pin-input"]');
	}, [pinCodeInput, configuredPin]);

	const handlePinInputKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		if (code === 13 || e.key === 'Enter') {
			e.preventDefault();
			handlePinSubmit();
		}
	}, [handlePinSubmit]);

	if (isLoading || !authChecked) {
		return (
			<div className={css.loading}>
				<LoadingSpinner />
			</div>
		);
	}

	if (isPinGateActive) {
		return (
			<div className={css.app} {...props}>
				<div className={css.pinGate}>
					<div className={css.pinCard}>
						<h2 className={css.pinTitle}>{$L('Enter PIN')}</h2>
						<p className={css.pinSubtitle}>{$L('This profile is protected by a 4-digit PIN.')}</p>
						<SpottableInput
							className={css.pinInput}
							type='password'
							value={pinCodeInput}
							onChange={handlePinInputChange}
							onKeyDown={handlePinInputKeyDown}
							maxLength={4}
							placeholder={$L('4 digits')}
							spotlightId='app-pin-input'
						/>
						{pinCodeError && <div className={css.pinError}>{pinCodeError}</div>}
						<div className={css.pinActions}>
							<SpottableButton
								className={css.pinButton}
								onClick={handlePinSubmit}
								spotlightId='app-pin-submit'
							>
								{$L('Unlock')}
							</SpottableButton>
						</div>
					</div>
				</div>
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
					onSyncPlay={settings.syncplayEnabled !== false ? openSyncPlay : undefined}
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
					onSyncPlay={settings.syncplayEnabled !== false ? openSyncPlay : undefined}
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
							onSelectGenre={handleSelectGenreFromBrowse}
							onSelectSeerrItem={handleSelectJellyseerrItem}
							onSelectSeerrGenre={handleSelectJellyseerrGenre}
							onSelectSeerrStudio={handleSelectJellyseerrStudio}
							onSelectSeerrNetwork={handleSelectJellyseerrNetwork}
							isVisible={panelIndex === PANELS.BROWSE && !showSettingsPanel}
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
								onItemDeleted={handleBack}
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
								initialStartPositionTicks={playbackOptions?.startPositionTicks}
								audioPlaylist={playbackOptions?.audioPlaylist}
								onEnded={handlePlayerEnd}
								onBack={handlePlayerEnd}
								onPlayNext={handlePlayNext}
								onSelectPerson={handleSelectPersonFromPlayer}
								onPausedChange={setIsPlayerPaused}
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
			<SyncPlayDialog
				open={syncPlayDialogOpen}
				onClose={closeSyncPlay}
			/>
			<ShuffleOverlay
				open={showShuffleOverlay}
				onClose={handleCloseShuffleOverlay}
				onSelectItem={handleSelectItem}
				api={api}
				unifiedMode={unifiedMode}
				contentType={settings.shuffleContentType || 'both'}
				serverUrl={serverUrl}
				accessToken={accessToken}
				originSpotlightId={shuffleOriginSpotlightId}
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
			<NoConnection />
			<DebugOverlay />
			{connectionState !== 'connected' && isAuthenticated && (
				<div className={css.connectionBanner}>
					<span>{connectionState === 'reconnecting' ? $L('Reconnecting to server...') : $L('Lost connection to server')}</span>
					{connectionState === 'disconnected' && (
						<button className={css.retryButton} onClick={handleRetryConnection}>{$L('Retry')}</button>
					)}
				</div>
			)}
			{showSettingsPanel && (
				<SettingsPanel
					onClose={handleCloseSettingsPanel}
					onLibrariesChanged={fetchLibraries}
				/>
			)}
		</div>
	);
};

let storedLocale = 'en-US';
try {
	const stored = JSON.parse(localStorage.getItem('moonfin_settings') || '{}');
	storedLocale = stored.uiLanguage || 'en-US';
} catch (e) { /* use default */ }

// Pre-populate ilib.data with all locale strings so loadData() finds them
// cached and skips synchronous XHR (which fails silently on Tizen).
// ilib keys use underscores and path segments: pt-BR -> strings_pt_BR
const localeContext = require.context('../../resources', true, /^\.[\/][a-z]{2}(-[A-Z]{2})?\/strings\.json$/);
localeContext.keys().forEach((key) => {
	const lang = key.split('/')[1].replace('-', '_').replace('/', '_');
	ilib.data['strings_' + lang] = localeContext(key);
});

const AppBase = (props) => (
	<SettingsProvider>
		<AuthProvider>
			<JellyseerrProvider>
				<SyncPlayProvider>
					<AppContent {...props} />
				</SyncPlayProvider>
			</JellyseerrProvider>
		</AuthProvider>
	</SettingsProvider>
);

const AppThemed = ThemeDecorator(AppBase);
const App = (props) => <AppThemed {...props} locale={storedLocale} />;
export default App;
