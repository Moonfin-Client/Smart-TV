import {useState, useCallback, useEffect, lazy, Suspense, useRef} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import {Panels, Panel} from '@enact/sandstone/Panels';

import {AuthProvider, useAuth} from '../context/AuthContext';
import {useSettings} from '../context/SettingsContext';
import * as playback from '../services/playback';
import * as connectionPool from '../services/connectionPool';
import {
	isWebOS,
	setupVisibilityHandler,
	setupWebOSLifecycle,
	cleanupVideoElement
} from '../services/webosVideo';
import {platformBack} from '@enact/webos/application';
import {SettingsProvider} from '../context/SettingsContext';
import {JellyseerrProvider} from '../context/JellyseerrContext';
import {useVersionCheck} from '../hooks/useVersionCheck';
import UpdateNotification from '../components/UpdateNotification';
import NavBar from '../components/NavBar';
import AccountModal from '../components/AccountModal';
import LoadingSpinner from '../components/LoadingSpinner';
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
const EXCLUDED_COLLECTION_TYPES = ['books', 'musicvideos', 'homevideos', 'photos'];

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
	const {isAuthenticated, isLoading, logout, serverUrl, serverName, api, user, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [panelIndex, setPanelIndex] = useState(PANELS.LOGIN);
	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedLibrary, setSelectedLibrary] = useState(null);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const [selectedGenre, setSelectedGenre] = useState(null);
	const [selectedGenreLibraryId, setSelectedGenreLibraryId] = useState(null);
	const [playingItem, setPlayingItem] = useState(null);
	const [panelHistory, setPanelHistory] = useState([]);
	const [jellyseerrItem, setJellyseerrItem] = useState(null);
	const [jellyseerrBrowse, setJellyseerrBrowse] = useState(null);
	const [jellyseerrPerson, setJellyseerrPerson] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	const [libraries, setLibraries] = useState([]);
	const [showAccountModal, setShowAccountModal] = useState(false);
	const cleanupHandlersRef = useRef(null);
	const backHandlerRef = useRef(null);
	const detailsItemStackRef = useRef([]);
	const jellyseerrItemStackRef = useRef([]);

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
				const filtered = libs.filter(lib => !EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase()));
				setLibraries(filtered);
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

	const {updateInfo, formattedNotes, dismiss: dismissUpdate} = useVersionCheck(isAuthenticated ? 3000 : null);

	// App-wide cleanup function for webOS lifecycle events
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

	// Set up webOS lifecycle event handlers
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

		// Handle webOS app visibility changes
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

		// Handle webOS relaunch (app launched while already running)
		const handleWebOSRelaunch = (params) => {
			console.log('[App] webOSRelaunch event received:', params);
			performAppCleanup();
			setPlayingItem(null);
			setPanelHistory([]);
			if (isAuthenticated) {
				setPanelIndex(PANELS.BROWSE);
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('pagehide', handlePageHide);

		const removeVisibilityHandler = setupVisibilityHandler(handleVisibilityHidden, handleVisibilityVisible);
		const removeWebOSHandler = isWebOS() ? setupWebOSLifecycle(handleWebOSRelaunch) : () => {};

		const handleWebOSLaunch = () => {
			console.log('[App] webOSLaunch event received');
		};
		document.addEventListener('webOSLaunch', handleWebOSLaunch);

		cleanupHandlersRef.current = () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
			document.removeEventListener('webOSLaunch', handleWebOSLaunch);
			removeVisibilityHandler();
			removeWebOSHandler();
		};

		return () => {
			if (cleanupHandlersRef.current) {
				cleanupHandlersRef.current();
			}
		};
	}, [isAuthenticated, performAppCleanup]);

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
			if (e.keyCode === 8 && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
				return;
			}
			if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) {
				e.preventDefault();
				e.stopPropagation();

				if (showAccountModal) {
					setShowAccountModal(false);
					return;
				}

				if (panelIndex === PANELS.BROWSE || panelIndex === PANELS.LOGIN) {
					// At root level — let the platform handle back (closes/minimizes app)
					performAppCleanup();
					platformBack();
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
	}, [panelIndex, handleBack, performAppCleanup, showAccountModal]);

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
		if (panelIndex === PANELS.DETAILS && selectedItem) {
			detailsItemStackRef.current.push(selectedItem);
			setSelectedItem(item);
		} else {
			detailsItemStackRef.current = [];
			setSelectedItem(item);
			navigateTo(PANELS.DETAILS);
		}
	}, [navigateTo, panelIndex, selectedItem]);

	const handleSelectLibrary = useCallback((library) => {
		// Check if this is a Live TV library - redirect to Live TV view
		if (library.CollectionType === 'livetv') {
			navigateTo(PANELS.LIVETV);
			return;
		}
		setSelectedLibrary(library);
		navigateTo(PANELS.LIBRARY);
	}, [navigateTo]);

	const [playbackOptions, setPlaybackOptions] = useState(null);
	const [isResume, setIsResume] = useState(false);

	const handlePlay = useCallback((item, resume, options) => {
		setPlayingItem(item);
		setPlaybackOptions(options || null);
		setIsResume(!!resume);
		navigateTo(PANELS.PLAYER);
	}, [navigateTo]);

	const handlePlayNext = useCallback((item) => {
		setPlayingItem(item);
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

	const handleOpenFavorites = useCallback(() => {
		navigateTo(PANELS.FAVORITES);
	}, [navigateTo]);

	const handleOpenGenres = useCallback(() => {
		navigateTo(PANELS.GENRES);
	}, [navigateTo]);

	const handleSelectGenre = useCallback((genre, libraryId) => {
		setSelectedGenre(genre);
		setSelectedGenreLibraryId(libraryId);
		navigateTo(PANELS.GENRE_BROWSE);
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
		if (panelIndex === PANELS.JELLYSEERR_DETAILS && jellyseerrItem) {
			jellyseerrItemStackRef.current.push(jellyseerrItem);
			setJellyseerrItem(item);
		} else {
			jellyseerrItemStackRef.current = [];
			setJellyseerrItem(item);
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
		return <div className={css.loading} />;
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
		panelIndex !== PANELS.ADD_SERVER &&
		panelIndex !== PANELS.ADD_USER;

	return (
		<div className={css.app} {...props}>
			{showNavBar && (
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
			)}
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
								onSelectItem={handleSelectItem}
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
							<Favorites onSelectItem={handleSelectItem} />
						)}
					</Panel>
					<Panel>
						{panelIndex === PANELS.GENRES && (
							<Genres onSelectGenre={handleSelectGenre} backHandlerRef={backHandlerRef} />
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
								libraryId={selectedGenreLibraryId}
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
			<UpdateNotification
				updateInfo={updateInfo}
				formattedNotes={formattedNotes}
				onDismiss={dismissUpdate}
			/>
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
