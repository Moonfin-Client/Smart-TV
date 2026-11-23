import {useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import useWatchParty from '../../hooks/useWatchParty';
import {useServerMessages} from '../../context/ServerMessagesContext';
import {useAchievements} from '../../context/AchievementsContext';
import SeerrIcon from '../icons/SeerrIcon';
import SyncPlayIcon from '../icons/SyncPlayIcon';
import {CalendarIcon, FavoritesIcon, FriendsIcon, GenresIcon, HomeIcon, LibrariesIcon, LiveTvIcon, MessagesIcon, MusicIcon, SearchIcon, SettingsIcon, ShuffleIcon, libraryNavIcon} from '../icons/navIcons';
import {modernCardImageUrl} from '../MediaCard/cardArtwork';
import {toCssColorWithAlpha} from '../../theme/themeSpec';
import {resolveOverlayColor} from '../../theme/overlayColors';
import {pointerHover} from '../../utils/focusScroll';
import {librariesForNav} from '../../utils/liveTvLibrary';
import {isKidsMode} from '../../utils/kidsMode';
import {CONTENT_FOCUS_TARGETS, focusFirstContentTarget, rememberSidebarReturn} from '../../utils/navFocusTargets';

// Which destinations the navigation shows. Every bar and sidebar style reads this one answer,
// so a button toggle or a Kids Mode rule reaches all of them the same way.
export const useNavVisibility = (libraries, hasLiveTv) => {
	const {settings} = useSettings();
	const {isEnabled: seerrEnabled, displayName, pluginInfo} = useSeerr();
	const {isInGroup} = useSyncPlay();
	const {room: watchPartyRoom} = useWatchParty();
	const {messages, unreadCount} = useServerMessages();
	const {socialAvailable, badgeCount: friendsBadge} = useAchievements();

	const showShuffle = settings.showShuffleButton !== false;
	const showGenres = settings.showGenresButton !== false;
	const showFavorites = settings.showFavoritesButton !== false;
	// Checked alongside the show* preferences and never written into them, since those sync and
	// would follow the account to the parent's other devices.
	const kidsMode = isKidsMode(settings);
	const showLiveTv = !kidsMode && settings.showLiveTvButton !== false && hasLiveTv;
	const showSeerr = !kidsMode && seerrEnabled && settings.showSeerrButton !== false;
	const showCalendar = !kidsMode && settings.showCalendarButton !== false && pluginInfo?.calendarAvailable === true;
	// Every server type gets the button, and the screen says so when Moonbase is missing.
	const showSyncPlay = !kidsMode && settings.syncplayEnabled !== false && settings.showSyncPlayButton !== false;
	const navLibraries = librariesForNav(libraries, showLiveTv, {hideLiveTv: kidsMode});
	const showLibraries = !kidsMode && settings.showLibrariesInToolbar !== false && navLibraries.length > 0;
	// Only with something to show, so the menu never has a button that does nothing.
	const showMessages = settings.showServerMessagesButton === true && messages.length > 0;
	// Only where the Achievement Badges plugin has friends switched on, so it never takes a
	// color slot for a button that can't open.
	const showFriends = !kidsMode && socialAvailable && settings.showFriendsButton === true;

	return {
		showShuffle, showGenres, showFavorites, showLiveTv, showSeerr, showCalendar, showSyncPlay,
		navLibraries, showLibraries, showMessages, showFriends,
		librariesIndividually: settings.showLibrariesIndividually === true,
		seerrLabel: displayName,
		watchPartyActive: Boolean(watchPartyRoom) || isInGroup,
		unreadCount,
		friendsBadge
	};
};

const libraryEntryKey = (library) => `library:${library._serverId || ''}:${library._serverUserId || ''}:${library.Id}`;

// Entries come in the classic bar's order, or with `side` the classic sidebar's, which moves Watch
// Parties after Calendar. `splitLibraries` lists each library on its own whatever Show Libraries
// Individually says.
export const navEntries = (vis, handlers, {side = false, splitLibraries = false, nowPlaying = false} = {}) => {
	const entries = [];
	const add = (shown, entry) => {
		if (shown) entries.push(entry);
	};
	const syncPlay = {key: 'syncplay', label: $L('Watch Parties'), Icon: SyncPlayIcon, onClick: handlers.onSyncPlay, spotlightId: 'navbar-syncplay', active: vis.watchPartyActive};

	add(true, {key: 'home', view: 'home', label: $L('Home'), Icon: HomeIcon, onClick: handlers.onHome, spotlightId: 'navbar-home'});
	add(true, {key: 'search', view: 'search', label: $L('Search'), Icon: SearchIcon, onClick: handlers.onSearch, spotlightId: 'navbar-search'});
	add(vis.showShuffle, {key: 'shuffle', label: $L('Shuffle'), Icon: ShuffleIcon, onClick: handlers.onShuffle, spotlightId: 'navbar-shuffle'});
	add(vis.showGenres, {key: 'genres', view: 'genres', label: $L('Genres'), Icon: GenresIcon, onClick: handlers.onGenres, spotlightId: 'navbar-genres'});
	add(vis.showFavorites, {key: 'favorites', view: 'favorites', label: $L('Favorites'), Icon: FavoritesIcon, onClick: handlers.onFavorites, spotlightId: 'navbar-favorites'});
	add(vis.showLiveTv, {key: 'livetv', label: $L('Live TV'), Icon: LiveTvIcon, onClick: handlers.onLiveTv, spotlightId: 'navbar-livetv'});
	add(vis.showSyncPlay && !side, syncPlay);
	add(vis.showSeerr, {key: 'discover', view: 'discover', label: vis.seerrLabel, Icon: SeerrIcon, onClick: handlers.onDiscover, spotlightId: 'navbar-discover'});
	add(vis.showCalendar, {key: 'calendar', view: 'calendar', label: $L('Calendar'), Icon: CalendarIcon, onClick: handlers.onCalendar, spotlightId: 'navbar-calendar'});
	add(vis.showSyncPlay && side, syncPlay);
	if (vis.showLibraries && (splitLibraries || vis.librariesIndividually)) {
		vis.navLibraries.forEach((library) => entries.push({
			key: libraryEntryKey(library),
			view: library.Id,
			label: library.Name,
			Icon: libraryNavIcon(library),
			library,
			onClick: () => handlers.onSelectLibrary?.(library)
		}));
	} else {
		add(vis.showLibraries, {key: 'libraries', label: $L('Libraries'), Icon: LibrariesIcon, libraries: vis.navLibraries, spotlightId: 'navbar-libraries'});
	}
	add(vis.showMessages, {key: 'messages', label: $L('Messages'), Icon: MessagesIcon, onClick: handlers.onMessages, spotlightId: 'navbar-messages', badge: vis.unreadCount});
	add(vis.showFriends, {key: 'friends', label: $L('Friends'), Icon: FriendsIcon, onClick: handlers.onFriends, spotlightId: 'navbar-friends', badge: vis.friendsBadge});
	add(true, {key: 'settings', view: 'settings', label: $L('Settings'), Icon: SettingsIcon, onClick: handlers.onSettings, spotlightId: 'navbar-settings'});
	add(nowPlaying, {key: 'music', label: $L('Now Playing'), Icon: MusicIcon, onClick: handlers.onOpenMusic});
	return entries;
};

// The entry for the page on screen, or Home when the page isn't one the navigation lists.
export const currentEntryIndex = (entries, activeView) => {
	const index = entries.findIndex((entry) => entry.view && entry.view === activeView);
	return index >= 0 ? index : 0;
};

// The same fill the classic pill wears.
export const navbarFill = (settings, activeTheme) => (activeTheme.transparentNavbarSurface
	? 'transparent'
	: toCssColorWithAlpha(resolveOverlayColor(settings.navbarColor), (settings.navbarOpacity ?? 50) / 100));

export const libraryCoverUrl = (library, serverUrl) => modernCardImageUrl(library, false, {itemServerUrl: library._serverUrl || serverUrl, isStaticMyMedia: true});

// A hovered tab already sits under the pointer, so only remote focus scrolls the tabs.
export const scrollTabIntoView = (e) => {
	if (pointerHover()) return;
	e.target?.scrollIntoView?.({behavior: 'smooth', block: 'nearest', inline: 'nearest'});
};

export const focusBelowBar = (hasMusic) => {
	if (hasMusic) Spotlight.focus('navbar-music-title');
	else focusFirstContentTarget(CONTENT_FOCUS_TARGETS, 'down');
};

// Focus arriving from the page marks where Right takes it back to.
export const rememberReturnOnEnter = (e) => {
	if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) rememberSidebarReturn(e.relatedTarget);
};

// Focus leaving the nav some other way, into a dialog say, closes whatever it has open.
export const useCloseOnFocusOut = (open, close) => {
	useEffect(() => {
		if (!open) return undefined;
		const onFocusIn = () => {
			const nav = document.querySelector('[data-spotlight-id="navbar"]');
			if (nav && !nav.contains(document.activeElement)) close();
		};
		document.addEventListener('focusin', onFocusIn);
		return () => document.removeEventListener('focusin', onFocusIn);
	}, [open, close]);
};

// Back closes whatever the nav has open before App treats it as a page back.
export const useBackToClose = (backRef, open, close) => {
	useEffect(() => {
		if (!backRef) return undefined;
		backRef.current = () => {
			if (!open) return false;
			close();
			return true;
		};
		return () => {
			backRef.current = null;
		};
	}, [backRef, open, close]);
};
