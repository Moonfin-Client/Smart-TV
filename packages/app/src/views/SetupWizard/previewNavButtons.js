import $L from '@enact/i18n/$L';

import SeerrIcon from '../../components/icons/SeerrIcon';
import SyncPlayIcon from '../../components/icons/SyncPlayIcon';
import {FavoritesIcon, FriendsIcon, GenresIcon, HomeIcon, LibrariesIcon, LiveTvIcon, MessagesIcon, SearchIcon, SettingsIcon, ShuffleIcon, libraryNavIcon} from '../../components/icons/navIcons';
import {librariesForNav} from '../../utils/liveTvLibrary';
import {isKidsMode} from '../../utils/kidsMode';

// The buttons the real navbar draws, in its order and behind the same gates. [rail] gives the
// sidebar's order, which puts Seerr ahead of SyncPlay. [libraries] is null while they aren't
// known, and then one Libraries button stands in for them.
export const previewNavButtons = ({settings, rail = false, hasLiveTv = false, seerrEnabled = false, seerrLabel = '', serverType = null, hasMessages = false, socialAvailable = false, libraries = null}) => {
	const kidsMode = isKidsMode(settings);
	const showLiveTv = !kidsMode && settings.showLiveTvButton !== false && hasLiveTv;
	const syncPlay = !kidsMode && serverType !== 'plex' && settings.syncplayEnabled !== false && settings.showSyncPlayButton !== false &&
		{id: 'syncplay', label: $L('SyncPlay'), Icon: SyncPlayIcon};
	const seerr = !kidsMode && seerrEnabled && settings.showSeerrButton !== false && {id: 'seerr', label: seerrLabel, Icon: SeerrIcon};
	const navLibraries = libraries ? librariesForNav(libraries, showLiveTv, {hideLiveTv: kidsMode}) : null;
	let libraryButtons = [];
	if (!kidsMode && settings.showLibrariesInToolbar !== false && (!navLibraries || navLibraries.length > 0)) {
		libraryButtons = navLibraries && settings.showLibrariesIndividually === true
			? navLibraries.map((library) => ({id: `library-${library._serverId || ''}:${library.Id}`, label: library.Name, Icon: libraryNavIcon(library)}))
			: [{id: 'libraries', label: $L('Libraries'), Icon: LibrariesIcon}];
	}
	return [
		{id: 'home', label: $L('Home'), Icon: HomeIcon},
		{id: 'search', label: $L('Search'), Icon: SearchIcon},
		settings.showShuffleButton !== false && {id: 'shuffle', label: $L('Shuffle'), Icon: ShuffleIcon},
		settings.showGenresButton !== false && {id: 'genres', label: $L('Genres'), Icon: GenresIcon},
		settings.showFavoritesButton !== false && {id: 'favorites', label: $L('Favorites'), Icon: FavoritesIcon},
		showLiveTv && {id: 'livetv', label: $L('Live TV'), Icon: LiveTvIcon},
		...(rail ? [seerr, syncPlay] : [syncPlay, seerr]),
		...libraryButtons,
		settings.showServerMessagesButton === true && hasMessages && {id: 'messages', label: $L('Messages'), Icon: MessagesIcon},
		!kidsMode && socialAvailable && settings.showFriendsButton === true && {id: 'friends', label: $L('Friends'), Icon: FriendsIcon},
		{id: 'settings', label: $L('Settings'), Icon: SettingsIcon}
	].filter(Boolean);
};
