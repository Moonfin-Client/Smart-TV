import {useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import {Panels, Panel} from '@enact/sandstone/Panels';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import ilib from 'ilib';

import {AuthProvider, useAuth} from '../context/AuthContext';
import {useSettings} from '../context/SettingsContext';
import * as connectionPool from '../services/connectionPool';
import * as jellyfinApi from '../services/jellyfinApi';
import {libraryIdOf, seerrDetailStub} from '../utils/seerrTarget';
import serverLogger from '../services/serverLogger';
import {isBackKey, KEYS} from '../utils/keys';
import {applyPerfTier} from '../utils/perfTier';
import {OLED_TUNING} from '../utils/oledMode';
import {isTizen, isWebOS} from '../platform';
import {initVideo, cleanupVideoElement, setupVisibilityHandler, setupPlatformLifecycle} from '../services/video';
import {SettingsProvider} from '../context/SettingsContext';
import {seedLanguagePreferences} from '../utils/languagePrefSeed';
import {shouldRun as shouldRunSetupWizard, beginRerun as beginSetupWizardRerun} from '../utils/setupWizardGate';
import {getActiveServer} from '../services/multiServerManager';
import {SeerrProvider, useSeerr} from '../context/SeerrContext';
import {ServerMessagesProvider, useServerMessages} from '../context/ServerMessagesContext';
import {SyncPlayProvider, useSyncPlay} from '../context/SyncPlayContext';
import {useVersionCheck} from '../hooks/useVersionCheck';
import UpdateNotification from '../components/UpdateNotification';
import SeerrNotificationToast from '../components/SeerrNotificationToast';
import ServerMessagesDialog from '../components/ServerMessagesDialog';
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
import TVKeyboard from '../components/TVKeyboard/TVKeyboard';
import {isTvKeyboardVisible} from '../components/TVKeyboard/keyboardBus';
import useInactivityTimer from '../hooks/useInactivityTimer';
import {useThemeMusic} from '../hooks/useThemeMusic';
import {buildThemeCssVars, toRgbTriplet} from '../theme/themeSpec';
import {applyThemeOverrides} from '../theme/themeOverrides';
import {resolveOverlayColor} from '../theme/overlayColors';
import Login from '../views/Login';
import Browse from '../views/Browse';
import {isGameLibrary, refreshGameLibraries, resolveGameLibraryId} from '../utils/gameLibrary';

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
const SeerrDiscover = lazy(() => import('../views/SeerrDiscover'));
const SeerrRequests = lazy(() => import('../views/SeerrRequests'));
const SeerrBrowse = lazy(() => import('../views/SeerrBrowse'));
const SeerrPerson = lazy(() => import('../views/SeerrPerson'));
const SeerrCollection = lazy(() => import('../views/SeerrCollection'));
const Games = lazy(() => import('../views/Games'));
const GameSystem = lazy(() => import('../views/GameSystem'));
const GameDetails = lazy(() => import('../views/GameDetails'));
const GamePlayer = lazy(() => import('../views/GamePlayer'));
const SetupWizard = lazy(() => import('../views/SetupWizard'));

import '../styles/perf-overrides.less';
import css from './App.module.less';

const MAX_HISTORY_LENGTH = 10;
const SpottableButton = Spottable('button');

const normalizeSeerrSelection = (item) => {
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
	// External rows key some titles by IMDb id alone, which the detail screen
	// resolves through a Seerr search.
	const imdbId = item.imdbId || null;
	if (mediaId == null && !imdbId) return null;

	const libraryId = item.libraryId || item._seerrLibraryId ||
		libraryIdOf(item.mediaInfo) || libraryIdOf(item.media);

	return {mediaId, mediaType, libraryId, imdbId, title: item.title || null};
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
	SEERR_DISCOVER: 11,
	SEERR_REQUESTS: 12,
	GENRE_BROWSE: 13,
	RECORDINGS: 14,
	SEERR_BROWSE: 15,
	SEERR_PERSON: 16,
	ADD_SERVER: 17,
	ADD_USER: 18,
	GAMES: 19,
	GAME_DETAILS: 20,
	GAME_PLAYER: 21,
	SEERR_COLLECTION: 22,
	GAME_SYSTEM: 23
};

const AppContent = (props) => {
	const {isAuthenticated, isLoading, logout, serverUrl, serverName, api, user, hasMultipleServers, accessToken, connectionState, revalidateSession} = useAuth();
	const {settings, activeTheme, syncOnLogin, updateSettings, loaded: settingsLoaded} = useSettings();
	const {streamNotification, dismissStreamNotification} = useSeerr();
	const {pendingPopups, markPopupsRead} = useServerMessages();
	const themeMusic = useThemeMusic();
	const {openDialog: openSyncPlay, closeDialog: closeSyncPlay, isDialogOpen: syncPlayDialogOpen, playQueueUpdate: syncPlayQueueUpdate, isInGroup: isSyncPlayInGroup, setNewQueue: syncPlaySetNewQueue, displayMessage: syncPlayMessage, clearDisplayMessage: clearSyncPlayMessage, getGroupPositionTicks: getSyncPlayPositionTicks} = useSyncPlay();
	const handledSyncPlayQueueRef = useRef(null);

	const syncPlayToast = useMemo(() => (
		syncPlayMessage ? {
			key: `syncplay-${Date.now()}`,
			title: syncPlayMessage.header || $L('SyncPlay'),
			body: syncPlayMessage.text
		} : null
	), [syncPlayMessage]);
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [panelIndex, setPanelIndex] = useState(PANELS.LOGIN);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedLibrary, setSelectedLibrary] = useState(null);
	const [selectedGameLibrary, setSelectedGameLibrary] = useState(null);
	const [selectedGameSystem, setSelectedGameSystem] = useState(null);
	const [selectedGame, setSelectedGame] = useState(null);
	const [gameStartFresh, setGameStartFresh] = useState(false);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const [selectedGenre, setSelectedGenre] = useState(null);
	const [genreFilter, setGenreFilter] = useState(null);
	const [studioFilter, setStudioFilter] = useState(null);
	const [playingItem, setPlayingItem] = useState(null);
	const [playbackOptions, setPlaybackOptions] = useState(null);
	const [isResume, setIsResume] = useState(false);
	const [isPlayerPaused, setIsPlayerPaused] = useState(false);
	const [trailerPreviewActive, setTrailerPreviewActive] = useState(false);
	const [panelHistory, setPanelHistory] = useState([]);
	const [seerrBrowse, setSeerrBrowse] = useState(null);
	const [seerrPerson, setSeerrPerson] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	const [libraries, setLibraries] = useState([]);
	const [showAccountModal, setShowAccountModal] = useState(false);
	const [showServerMessages, setShowServerMessages] = useState(false);
	const serverMessagesBackRef = useRef(null);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const [showSettingsPanel, setShowSettingsPanel] = useState(false);
	const [showShuffleOverlay, setShowShuffleOverlay] = useState(false);
	const [shuffleOriginSpotlightId, setShuffleOriginSpotlightId] = useState('navbar-shuffle');
	const [pinCodeInput, setPinCodeInput] = useState('');
	const [pinCodeError, setPinCodeError] = useState('');
	const [isPinUnlocked, setIsPinUnlocked] = useState(false);
	const [setupWizardActive, setSetupWizardActive] = useState(false);
	const setupWizardBackRef = useRef(null);
	const cleanupHandlersRef = useRef(null);
	const backHandlerRef = useRef(null);
	const detailsItemStackRef = useRef([]);
	const [seerrCollection, setSeerrCollection] = useState(null);
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
		// Emulator input bypasses Spotlight (paused during gameplay), so inactivity never resets.
		panelIndex !== PANELS.GAME_PLAYER &&
		// A media bar trailer plays without any key presses to reset the timer.
		!trailerPreviewActive &&
		!showExitDialog &&
		!showShuffleOverlay &&
		!showSettingsPanel &&
		!showAccountModal &&
		!showServerMessages &&
		!photoViewerItem &&
		!comicViewerItem
	);
	const {isInactive: showScreensaver, dismiss: dismissScreensaver} = useInactivityTimer(screensaverTimeout, screensaverEnabled);

	useEffect(() => {
		window.dispatchEvent(new CustomEvent('moonfin:screensaver', {detail: {active: showScreensaver}}));
	}, [showScreensaver]);

	useEffect(() => {
		const handleTrailerPreview = (e) => setTrailerPreviewActive(!!e.detail?.active);
		window.addEventListener('moonfin:trailerPreview', handleTrailerPreview);
		return () => window.removeEventListener('moonfin:trailerPreview', handleTrailerPreview);
	}, []);

	// The logging switches used to reach the logger only from the settings toggle, so
	// turning one on and restarting the TV left it doing nothing until Settings was opened
	// again. Following the settings here is what makes them survive a restart.
	useEffect(() => {
		serverLogger.init({
			getAuth: () => ({serverUrl: jellyfinApi.getServerUrl(), accessToken: jellyfinApi.getApiKey()})
		});
	}, []);

	useEffect(() => {
		serverLogger.setEnabled(settings.serverLogging === true);
	}, [settings.serverLogging]);

	useEffect(() => {
		serverLogger.setRecording(settings.diagnosticLoggingEnabled === true);
	}, [settings.diagnosticLoggingEnabled]);

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
		if (isAuthenticated && serverUrl && accessToken) {
			syncOnLogin(serverUrl, accessToken).catch((err) => {
				console.warn('[App] Initial settings sync failed:', err.message);
			});
		}
	}, [isAuthenticated, serverUrl, accessToken, syncOnLogin]);

	// The setup wizard asks its questions once per server and user, so this
	// only flips the flag for a pair that has never finished it. A server that
	// cant be reached cant serve the previews or resolve the settings the
	// wizard would otherwise overwrite, so that launch leaves the flag alone
	// and a later one, on a better network, still gets the chance.
	useEffect(() => {
		if (!isAuthenticated) {
			setSetupWizardActive(false);
			return undefined;
		}
		if (!settingsLoaded || !user?.Id || connectionState === 'disconnected') return undefined;
		let cancelled = false;
		(async () => {
			const activeServer = await getActiveServer().catch(() => null);
			const run = await shouldRunSetupWizard(activeServer?.id, serverUrl, user.Id);
			if (!cancelled && run) setSetupWizardActive(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [isAuthenticated, settingsLoaded, user?.Id, serverUrl, connectionState]);

	useEffect(() => {
		if (!isAuthenticated || !user?.Configuration) return;
		const seeded = seedLanguagePreferences(settings, user.Configuration, settings.uiLanguage, window.navigator?.language);
		if (Object.keys(seeded).length > 0) updateSettings(seeded);
	}, [isAuthenticated, user, settings, updateSettings]);

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
				setLibraries(libs);
				// Warm the plugin's game library list so selecting a tile can tell a game
				// library from a normal one without waiting on a request.
				refreshGameLibraries();
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

	// The custom properties above only reach the newer engines. The injected
	// stylesheet carries the same theme as literal colors for everything older.
	useEffect(() => {
		applyThemeOverrides(activeTheme, {
			focusBorderColor: settings.focusBorderColor,
			mediaBarOverlayColor: settings.mediaBarOverlayColor,
			mediaBarOverlayOpacity: settings.mediaBarOverlayOpacity
		});
	}, [activeTheme, settings.focusBorderColor, settings.mediaBarOverlayColor, settings.mediaBarOverlayOpacity]);

	useEffect(() => {
		applyPerfTier(settings.performanceMode === 'auto' ? null : settings.performanceMode);
	}, [settings.performanceMode]);

	// The surfaces are crushed on the theme itself, so all this has to do is tell
	// the stylesheet which artwork boost to draw with.
	useEffect(() => {
		const root = document.documentElement;
		if (OLED_TUNING[settings.oledMode]) root.setAttribute('data-oled', settings.oledMode);
		else root.removeAttribute('data-oled');
	}, [settings.oledMode]);

	useEffect(() => {
		const root = document.documentElement;
		if (settings.focusBorderColor) {
			root.style.setProperty('--theme-focus-border-color', settings.focusBorderColor);
		}
		root.style.setProperty('--theme-navbar-color-rgb', toRgbTriplet(resolveOverlayColor(settings.navbarColor)));
	}, [activeTheme, settings.focusBorderColor, settings.navbarColor]);

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
			// An arrow press means the user is done pointing. Spotlight flips
			// this itself, but its window listener sits behind components that
			// stop propagation, and a set pointer flag makes every programmatic
			// focus move a no op. This runs in capture, so the flag is down
			// before any component handles the key.
			if ((e.keyCode === KEYS.UP || e.keyCode === KEYS.DOWN || e.keyCode === KEYS.LEFT || e.keyCode === KEYS.RIGHT) && Spotlight.getPointerMode()) {
				Spotlight.setPointerMode(false);
			}
			if (showShuffleOverlay) {
				return;
			}
			if (isTvKeyboardVisible()) {
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

				if (setupWizardActive) {
					setupWizardBackRef.current?.();
					return;
				}

				if (showExitDialog) {
					return;
				}

				// The dialog closes itself on back, but its listener shares the
				// window with this one and stopPropagation does not reach a
				// sibling, so the same press otherwise falls through to the
				// panel underneath and asks to exit the app.
				if (syncPlayDialogOpen) {
					closeSyncPlay();
					return;
				}

				if (updateInfo) {
					dismissUpdate();
					return;
				}

				if (showAccountModal) {
					setShowAccountModal(false);
					return;
				}

				if (showServerMessages) {
					if (!serverMessagesBackRef.current?.()) setShowServerMessages(false);
					return;
				}

				if (showSettingsPanel) {
					return;
				}

				if (panelIndex === PANELS.BROWSE || panelIndex === PANELS.LOGIN) {
					// Sign-in walks its own screens, and home returns a scrolled row
					// list to the top, before back means exit
					if (backHandlerRef.current?.()) return;
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
				handleBack();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [panelIndex, handleBack, performAppCleanup, settings.exitConfirmation, showAccountModal, showServerMessages, showExitDialog, showSettingsPanel, showShuffleOverlay, isPinGateActive, setupWizardActive, updateInfo, dismissUpdate, syncPlayDialogOpen, closeSyncPlay]);

	const handleLoggedIn = useCallback(() => {
		setPanelHistory([]);
		navigateTo(PANELS.BROWSE, false);
	}, [navigateTo]);

	// Every way out of the wizard lands on home, whether it was the first run
	// or a re run started from Settings.
	const handleSetupWizardDone = useCallback(() => {
		setSetupWizardActive(false);
		setShowSettingsPanel(false);
		setPanelHistory([]);
		navigateTo(PANELS.BROWSE, false);
	}, [navigateTo]);

	const handleRunSetupWizard = useCallback(() => {
		beginSetupWizardRerun();
		setSetupWizardActive(true);
	}, []);

	const handleShuffle = useCallback(() => {
		const current = Spotlight.getCurrent();
		const spotlightId = current?.getAttribute?.('data-spotlight-id') || current?.id || 'navbar-shuffle';
		setShuffleOriginSpotlightId(spotlightId);
		setShowShuffleOverlay(true);
	}, []);

	const handleSelectItem = useCallback((item) => {
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
	}, [navigateTo, panelIndex, selectedItem]);

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
			if (settings.liveTvSkipGuide) {
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
		if (isGameLibrary(library.Id, library.CollectionType, library.Name)) {
			// Every /Moonfin/Games call matches on the plugin's id, which is not always the
			// user-view id this library arrived with.
			setSelectedGameLibrary({...library, Id: resolveGameLibraryId(library)});
			navigateTo(PANELS.GAMES);
			return;
		}
		setSelectedLibrary(library);
		setGenreFilter(null);
		setStudioFilter(null);
		navigateTo(PANELS.LIBRARY);
	}, [api, navigateTo, settings.liveTvSkipGuide]);

	const handleSelectStudio = useCallback((studioName) => {
		if (!studioName) return;
		setStudioFilter(studioName);
		setGenreFilter(null);
		setSelectedLibrary(null);
		navigateTo(PANELS.LIBRARY);
	}, [navigateTo]);

	const handleSelectGameSystem = useCallback((gameLibrary, system) => {
		setSelectedGameLibrary(gameLibrary);
		setSelectedGameSystem(system);
		navigateTo(PANELS.GAME_SYSTEM);
	}, [navigateTo]);

	const handleSelectGame = useCallback((gameLibrary, game) => {
		setSelectedGameLibrary(gameLibrary);
		setSelectedGame(game);
		navigateTo(PANELS.GAME_DETAILS);
	}, [navigateTo]);

	const handlePlayGame = useCallback((gameLibrary, game, opts) => {
		setSelectedGameLibrary(gameLibrary);
		setSelectedGame(game);
		setGameStartFresh(!!(opts && opts.fresh));
		navigateTo(PANELS.GAME_PLAYER);
	}, [navigateTo]);

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

	const playSyncPlayItem = useCallback((item) => {
		if (panelIndex === PANELS.PLAYER && playingItem?.Id === item.Id) return;
		// Opened where the group is: a set started at the beginning is only
		// seeked there by the server afterwards, which on a transcode means
		// starting the stream twice while everyone waits.
		const startPositionTicks = getSyncPlayPositionTicks();
		setPlayingItem(item);
		setPlaybackOptions(startPositionTicks > 0 ? {startPositionTicks} : null);
		setIsResume(false);
		navigateTo(PANELS.PLAYER);
	}, [panelIndex, playingItem, navigateTo, getSyncPlayPositionTicks]);

	// The group queued something, so the player has to take over. Reorders and
	// repeat/shuffle toggles arrive the same way and only count when they
	// change what is playing.
	useEffect(() => {
		const update = syncPlayQueueUpdate;
		if (!update || update === handledSyncPlayQueueRef.current) return;
		handledSyncPlayQueueRef.current = update;
		if (!update.startsPlayback && playingItem?.Id === update.item.Id) return;
		playSyncPlayItem(update.item);
	}, [syncPlayQueueUpdate, playingItem, playSyncPlayItem]);

	// The SyncPlay dialog sits above every panel and holds the remote focus, so
	// it can't stay up over a player the group is driving: a member waiting in
	// it when the group starts, or a group created from over the player through
	// the auto-open flow, would otherwise only see the state badge change.
	useEffect(() => {
		if (syncPlayDialogOpen && isSyncPlayInGroup && panelIndex === PANELS.PLAYER) closeSyncPlay();
	}, [syncPlayDialogOpen, isSyncPlayInGroup, panelIndex, closeSyncPlay]);

	const handlePlayNext = useCallback((item) => {
		setPlayingItem(item);
		setPlaybackOptions(prev => {
			if (prev?.audioPlaylist?.some(t => t.Id === item.Id)) {
				return {audioPlaylist: prev.audioPlaylist};
			}
			if (prev?.videoQueue?.some(e => e.Id === item.Id)) {
				return {videoQueue: prev.videoQueue};
			}
			return null;
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

	// The guide button on the live TV OSD always lands on the guide, not wherever
	// playback was launched from. When the player was opened from the guide its
	// history entry is dropped so back doesn't bounce through the guide twice.
	const handlePlayerGuide = useCallback(() => {
		setIsPlayerPaused(false);
		setPlayingItem(null);
		setPlaybackOptions(null);
		setIsResume(false);
		setPanelHistory(prev => (prev[prev.length - 1] === PANELS.LIVETV ? prev.slice(0, -1) : prev));
		setPanelIndex(PANELS.LIVETV);
	}, []);

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

	const handleOpenServerMessages = useCallback(() => {
		setShowServerMessages(true);
	}, []);

	const handleCloseServerMessages = useCallback(() => {
		setShowServerMessages(false);
	}, []);

	// Opens the messages window for messages the admin marked as open the window.
	// Nothing else opens on its own, and playback is left alone until it ends.
	useEffect(() => {
		if (!isAuthenticated || panelIndex === PANELS.PLAYER || pendingPopups.length === 0) return;
		markPopupsRead();
		setShowServerMessages(true);
	}, [isAuthenticated, panelIndex, pendingPopups, markPopupsRead]);

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
		setStudioFilter(null);
		if (library) {
			setSelectedLibrary(library);
		} else if (genre._serverUrl) {
			setSelectedLibrary({
				Id: null,
				Name: genre.name,
				_serverUrl: genre._serverUrl,
				_serverType: genre._serverType,
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

	const handleOpenSeerr = useCallback(() => {
		navigateTo(PANELS.SEERR_DISCOVER);
	}, [navigateTo]);

	const handleHome = useCallback(() => {
		setPanelHistory([]);
		setSelectedItem(null);
		setSelectedLibrary(null);
		setSelectedPerson(null);
		setSelectedGenre(null);
		setGenreFilter(null);
		setStudioFilter(null);
		setSeerrBrowse(null);
		setSeerrPerson(null);
		window.dispatchEvent(new CustomEvent('moonfin:browseRefresh'));
		setPanelIndex(PANELS.BROWSE);
	}, []);

	const [seerrRequestsTab, setSeerrRequestsTab] = useState('requests');

	const handleOpenSeerrRequests = useCallback(() => {
		setSeerrRequestsTab('requests');
		navigateTo(PANELS.SEERR_REQUESTS);
	}, [navigateTo]);

	// One dispatcher for the Seerr shortcuts row, shared by home and discover.
	const handleOpenSeerrShortcut = useCallback((shortcut) => {
		switch (shortcut) {
			case 'discover':
				navigateTo(PANELS.SEERR_DISCOVER);
				break;
			case 'movies':
				setSeerrBrowse({browseType: 'all', item: {name: $L('Movies')}, mediaType: 'movie'});
				navigateTo(PANELS.SEERR_BROWSE);
				break;
			case 'series':
				setSeerrBrowse({browseType: 'all', item: {name: $L('TV Shows')}, mediaType: 'tv'});
				navigateTo(PANELS.SEERR_BROWSE);
				break;
			case 'requests':
				setSeerrRequestsTab('requests');
				navigateTo(PANELS.SEERR_REQUESTS);
				break;
			case 'issues':
				setSeerrRequestsTab('issues');
				navigateTo(PANELS.SEERR_REQUESTS);
				break;
		}
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

	// A Seerr title opens on the same detail screen as everything else. One the library
	// already holds opens as itself, since a stand-in has nothing to play, and only a
	// title the library has never heard of keeps its Seerr identity.
	const handleSelectSeerrItem = useCallback((item) => {
		const normalized = normalizeSeerrSelection(item);
		if (!normalized) {
			return;
		}
		if (normalized.libraryId) {
			handleSelectItem({
				Id: normalized.libraryId,
				Type: normalized.mediaType === 'tv' ? 'Series' : 'Movie'
			});
			return;
		}
		handleSelectItem(seerrDetailStub(normalized));
	}, [handleSelectItem]);

	const handleSelectSeerrGenre = useCallback((genreId, genreName, mediaType) => {
		setSeerrBrowse({browseType: 'genre', item: {id: genreId, name: genreName}, mediaType});
		navigateTo(PANELS.SEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectSeerrStudio = useCallback((studioId, studioName) => {
		setSeerrBrowse({browseType: 'studio', item: {id: studioId, name: studioName}, mediaType: 'movie'});
		navigateTo(PANELS.SEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectSeerrNetwork = useCallback((networkId, networkName) => {
		setSeerrBrowse({browseType: 'network', item: {id: networkId, name: networkName}, mediaType: 'tv'});
		navigateTo(PANELS.SEERR_BROWSE);
	}, [navigateTo]);

	const handleSelectSeerrKeyword = useCallback((keyword, mediaType) => {
		setSeerrBrowse({browseType: 'keyword', item: keyword, mediaType});
		navigateTo(PANELS.SEERR_BROWSE);
	}, [navigateTo]);

	const handleOpenSeerrCollection = useCallback((collectionId) => {
		setSeerrCollection({collectionId});
		navigateTo(PANELS.SEERR_COLLECTION);
	}, [navigateTo]);

	const handleSelectSeerrPerson = useCallback((personId, personName) => {
		setSeerrPerson({id: personId, name: personName});
		navigateTo(PANELS.SEERR_PERSON);
	}, [navigateTo]);

	// Everywhere the detail screen can send a viewer into the Seerr side of the app, bundled
	// into one prop rather than six.
	const seerrNav = useMemo(() => ({
		onSelectItem: handleSelectSeerrItem,
		onSelectPerson: handleSelectSeerrPerson,
		onSelectKeyword: handleSelectSeerrKeyword,
		onSelectGenre: handleSelectSeerrGenre,
		onSelectNetwork: handleSelectSeerrNetwork,
		onOpenCollection: handleOpenSeerrCollection
	}), [handleSelectSeerrItem, handleSelectSeerrPerson, handleSelectSeerrKeyword, handleSelectSeerrGenre, handleSelectSeerrNetwork, handleOpenSeerrCollection]);

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
		setPinCodeError($L('Incorrect PIN'));
		Spotlight.focus('[data-spotlight-id="app-pin-input"]');
	}, [pinCodeInput, configuredPin]);

	const handlePinInputKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		if (code === 13 || e.key === 'Enter') {
			e.preventDefault();
			handlePinSubmit();
		}
	}, [handlePinSubmit]);

	// Stored settings have to be in before anything renders, because
	// pinCodeProtection reads as off until then and a protected profile would
	// come up unlocked.
	if (isLoading || !authChecked || !settingsLoaded) {
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
							purpose='numeric'
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
				<TVKeyboard />
			</div>
		);
	}

	// The wizard owns the whole screen the way the PIN gate does, so nothing
	// behind it can take focus until it finishes.
	if (setupWizardActive) {
		return (
			<div className={css.app} {...props}>
				<Suspense fallback={<div className={css.loading}><LoadingSpinner /></div>}>
					<SetupWizard onDone={handleSetupWizardDone} backHandlerRef={setupWizardBackRef} />
				</Suspense>
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
			case PANELS.SEERR_DISCOVER:
			case PANELS.SEERR_REQUESTS:
			case PANELS.SEERR_BROWSE:
			case PANELS.SEERR_PERSON:
				return 'discover';
			case PANELS.LIBRARY: return selectedLibrary?.Id || '';
			default: return '';
		}
	};

	const showNavBar = panelIndex !== PANELS.LOGIN &&
		panelIndex !== PANELS.PLAYER &&
		panelIndex !== PANELS.GAME_PLAYER &&
		panelIndex !== PANELS.GAMES &&
		panelIndex !== PANELS.GAME_SYSTEM &&
		panelIndex !== PANELS.LIBRARY &&
		panelIndex !== PANELS.LIVETV &&
		panelIndex !== PANELS.RECORDINGS &&
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
					onDiscover={handleOpenSeerr}
					onSyncPlay={settings.syncplayEnabled !== false ? openSyncPlay : undefined}
					onSettings={handleOpenSettings}
					onSelectLibrary={handleSelectLibrary}
					onUserMenu={handleOpenAccountModal}
					onMessages={handleOpenServerMessages}
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
					onDiscover={handleOpenSeerr}
					onSyncPlay={settings.syncplayEnabled !== false ? openSyncPlay : undefined}
					onSettings={handleOpenSettings}
					onSelectLibrary={handleSelectLibrary}
					onUserMenu={handleOpenAccountModal}
					onMessages={handleOpenServerMessages}
				/>
			) : null}
			<Suspense fallback={<PanelLoader />}>
				<Panels index={panelIndex} noCloseButton noAnimation>
					<Panel>
						<Login onLoggedIn={handleLoggedIn} backHandlerRef={backHandlerRef} />
					</Panel>
					<Panel>
						<Browse
							onSelectItem={handleSelectItem}
							onSelectLibrary={handleSelectLibrary}
							onOpenRecordings={handleOpenRecordings}
							onPlayRecording={handlePlayRecording}
							onSelectGenre={handleSelectGenreFromBrowse}
							onSelectSeerrItem={handleSelectSeerrItem}
							onSelectSeerrGenre={handleSelectSeerrGenre}
							onSelectSeerrStudio={handleSelectSeerrStudio}
							onSelectSeerrNetwork={handleSelectSeerrNetwork}
							onOpenSeerrShortcut={handleOpenSeerrShortcut}
							isVisible={panelIndex === PANELS.BROWSE && !showSettingsPanel}
							backHandlerRef={backHandlerRef}
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
								onSelectStudio={handleSelectStudio}
								onItemDeleted={handleBack}
								seerrNav={seerrNav}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.LIBRARY && (
							<Library
							library={selectedLibrary}
							genreFilter={genreFilter}
							studioFilter={studioFilter}
							onSelectItem={handleSelectItem}
							onViewPhoto={handleViewPhoto}
							onHome={handleHome}
								backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEARCH && (
							<Search onSelectItem={handleSelectItem} onSelectSeerrItem={handleSelectSeerrItem} onSelectPerson={handleSelectPerson} onSelectGame={handleSelectGame} onPlayChannel={handlePlayChannel} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SETTINGS && (
							<Settings onBack={handleBack} onLibrariesChanged={fetchLibraries} onRunSetupWizard={handleRunSetupWizard} />
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
								initialQuality={playbackOptions?.forceBitrate}
								forceTranscode={playbackOptions?.forceTranscode}
								audioPlaylist={playbackOptions?.audioPlaylist}
								videoQueue={playbackOptions?.videoQueue}
								onEnded={handlePlayerEnd}
								onBack={handlePlayerEnd}
								onGuide={handlePlayerGuide}
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
							<Person personId={selectedPerson?.Id} onSelectItem={handleSelectItem} onSelectSeerrItem={handleSelectSeerrItem} onSelectSeerrPerson={handleSelectSeerrPerson} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.LIVETV && (
							<LiveTV onPlayChannel={handlePlayChannel} onRecordings={handleOpenRecordings} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEERR_DISCOVER && (
							<SeerrDiscover
								backHandlerRef={backHandlerRef}
								onSelectItem={handleSelectSeerrItem}
								onSelectGenre={handleSelectSeerrGenre}
								onSelectStudio={handleSelectSeerrStudio}
								onSelectNetwork={handleSelectSeerrNetwork}
								onOpenRequests={handleOpenSeerrRequests}
								onOpenShortcut={handleOpenSeerrShortcut}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEERR_REQUESTS && (
							<SeerrRequests
								onSelectItem={handleSelectSeerrItem}
								onClose={handleBack}
								initialTab={seerrRequestsTab}
								backHandlerRef={backHandlerRef}
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
							<Recordings onPlayRecording={handlePlayRecording} onBack={handleBack} backHandlerRef={backHandlerRef} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEERR_BROWSE && (
							<SeerrBrowse
								browseType={seerrBrowse?.browseType}
								item={seerrBrowse?.item}
								mediaType={seerrBrowse?.mediaType}
								onSelectItem={handleSelectSeerrItem}
							backHandlerRef={backHandlerRef}
						/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.SEERR_PERSON && (
							<SeerrPerson
								personId={seerrPerson?.id}
								personName={seerrPerson?.name}
								onSelectItem={handleSelectSeerrItem}
								onBack={handleBack}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.ADD_SERVER && (
							<Login
								onLoggedIn={handleLoggedIn}
								onServerAdded={handleServerAdded}
								backHandlerRef={backHandlerRef}
								isAddingServer
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.ADD_USER && (
							<Login
								onLoggedIn={handleLoggedIn}
								onServerAdded={handleServerAdded}
								backHandlerRef={backHandlerRef}
								isAddingUser
								currentServerUrl={serverUrl}
								currentServerName={serverName}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GAMES && (
							<Games
								library={selectedGameLibrary}
								onSelectSystem={handleSelectGameSystem}
								onHome={handleHome}
								backHandlerRef={backHandlerRef}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GAME_DETAILS && (
							<GameDetails
								library={selectedGameLibrary}
								gameId={selectedGame?.id}
								initialGame={selectedGame}
								onPlay={handlePlayGame}
								onSelectGame={handleSelectGame}
								backHandlerRef={backHandlerRef}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GAME_PLAYER && selectedGame && (
							<GamePlayer
								library={selectedGameLibrary}
								game={selectedGame}
								startFresh={gameStartFresh}
								onBack={handleBack}
								backHandlerRef={backHandlerRef}
							/>
						)}
					</Panel>
					{/* Panels renders only children[panelIndex], so every Panel's position
					    here has to match its PANELS value and a new one goes on the end. */}
					<Panel>
						{panelIndex === PANELS.SEERR_COLLECTION && (
							<SeerrCollection
								collectionId={seerrCollection?.collectionId}
								onSelectItem={handleSelectSeerrItem}
								backHandlerRef={backHandlerRef}
							/>
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GAME_SYSTEM && (
							<GameSystem
								library={selectedGameLibrary}
								system={selectedGameSystem}
								onSelectGame={handleSelectGame}
								onBack={handleBack}
								backHandlerRef={backHandlerRef}
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
				playingItemId={panelIndex === PANELS.PLAYER ? playingItem?.Id : null}
				onWatch={playSyncPlayItem}
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
			<SeerrNotificationToast
				notification={streamNotification}
				onDismiss={dismissStreamNotification}
			/>
			<SeerrNotificationToast
				notification={syncPlayToast}
				onDismiss={clearSyncPlayMessage}
			/>
			<ServerMessagesDialog
				open={showServerMessages}
				onClose={handleCloseServerMessages}
				backHandlerRef={serverMessagesBackRef}
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
				clockMode={settings.screensaverClockMode}
				clockDisplay={settings.clockDisplay}
				timeOffsetHours={settings.timeOffsetHours}
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
					onRunSetupWizard={handleRunSetupWizard}
				/>
			)}
			<TVKeyboard />
		</div>
	);
};

let storedLocale = 'en-US';
try {
	const bootLocale = localStorage.getItem('moonfin_uiLanguage');
	if (bootLocale) {
		storedLocale = bootLocale;
	} else {
		const stored = JSON.parse(localStorage.getItem('moonfin_settings') || '{}');
		storedLocale = stored.uiLanguage || 'en-US';
	}
} catch (e) { /* use default */ }

// Pre-populate ilib.data with the locale strings so loadData() finds them cached
// and skips synchronous XHR, which fails silently on Tizen. Only the locale the
// app boots into is fetched, since a language change reloads the app and bundling
// every locale eagerly would add megabytes to main.js. ilib keys use underscores
// and path segments, so pt-BR becomes strings_pt_BR.
const localeContext = require.context('../../resources', true, /^\.[\/][^/]+\/strings\.json$/, 'lazy');

// ilib merges root, then language, then language-region, so a regional locale
// needs its base language loaded alongside it for anything the region file
// leaves out.
const localeChain = (locale) => {
	const [language, region] = String(locale || '').split('-');
	if (!language) return [];
	return region ? [language, language + '-' + region] : [language];
};

export const localeStringsReady = Promise.all(
	localeChain(storedLocale).map((dir) => {
		const key = './' + dir + '/strings.json';
		if (localeContext.keys().indexOf(key) === -1) return null;
		return localeContext(key).then((strings) => {
			ilib.data['strings_' + dir.replace('-', '_')] = strings.default || strings;
		}, () => {
			// A missing chunk just means that locale falls back to English.
		});
	})
);

const AppBase = (props) => (
	<SettingsProvider>
		<AuthProvider>
			<SeerrProvider>
				<ServerMessagesProvider>
					<SyncPlayProvider>
						<AppContent {...props} />
					</SyncPlayProvider>
				</ServerMessagesProvider>
			</SeerrProvider>
		</AuthProvider>
	</SettingsProvider>
);

const AppThemed = ThemeDecorator(AppBase);
const App = (props) => <AppThemed {...props} locale={storedLocale} />;
export default App;
