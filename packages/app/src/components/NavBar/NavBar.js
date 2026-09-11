import {memo, useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import {useServerMessages} from '../../context/ServerMessagesContext';
import SeerrIcon from '../icons/SeerrIcon';
import SyncPlayIcon from '../icons/SyncPlayIcon';
import {FavoritesIcon, GenresIcon, HomeIcon, LiveTvIcon, MessagesIcon, SearchIcon, SettingsIcon, ShuffleIcon} from '../icons/navIcons';
import useClock from '../../hooks/useClock';
import {librariesForNav} from '../../utils/liveTvLibrary';
import {shadowToCss, toCssColor, toCssColorWithAlpha} from '../../theme/themeSpec';
import {resolveOverlayColor} from '../../theme/overlayColors';
import {CONTENT_FOCUS_TARGETS, focusFirstContentTarget} from '../../utils/navFocusTargets';
import {pointerHover} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import NavLibraries from './NavLibraries';
import NavPillButton from './NavPillButton';
import NavUserButton from './NavUserButton';

import css from './NavBar.module.less';

const NavContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '.spottable-default',
	preserveId: true
}, 'nav');

const NavBar = ({
	activeView = 'home',
	libraries = [],
	hasLiveTv = false,
	onHome,
	onSearch,
	onShuffle,
	onGenres,
	onFavorites,
	onLiveTv,
	onDiscover,
	onSettings,
	onSelectLibrary,
	onUserMenu,
	onSyncPlay,
	onMessages
}) => {
	const {settings, activeTheme} = useSettings();
	const {isEnabled: seerrEnabled, displayName} = useSeerr();
	const {isInGroup} = useSyncPlay();
	const {messages, unreadCount} = useServerMessages();
	const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
	const showClock = settings.showClock !== false;
	const clock = useClock(showClock);

	const showShuffle = settings.showShuffleButton !== false;
	const showGenres = settings.showGenresButton !== false;
	const showFavorites = settings.showFavoritesButton !== false;
	const showLiveTv = settings.showLiveTvButton !== false && hasLiveTv;
	const showSeerr = seerrEnabled && settings.showSeerrButton !== false;
	const showSyncPlay = settings.syncplayEnabled !== false && settings.showSyncPlayButton !== false;
	const navLibraries = librariesForNav(libraries, showLiveTv);
	const showLibraries = settings.showLibrariesInToolbar !== false && navLibraries.length > 0;
	// Only with something to show, so the menu never has a button that does nothing.
	const showMessages = settings.showServerMessagesButton === true && messages.length > 0;

	const navPillStyle = useMemo(() => {
		// The pill wears the overlay color at the chosen opacity, and only a theme
		// asking for a transparent nav surface clears it entirely.
		const navbarColor = activeTheme.transparentNavbarSurface
			? 'transparent'
			: toCssColorWithAlpha(resolveOverlayColor(settings.navbarColor), (settings.navbarOpacity ?? 50) / 100);
		return {
			background: navbarColor,
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			borderBottom: activeTheme.borders.navBorder
				? `${activeTheme.borders.navBorder.width}px solid ${toCssColor(activeTheme.borders.navBorder.color)}`
				: 'none',
			color: toCssColor(activeTheme.colors.onSurface),
			textShadow: activeTheme.textGlow.length ? activeTheme.textGlow.map(shadowToCss).join(', ') : 'none'
		};
	}, [activeTheme, settings.navbarColor, settings.navbarOpacity]);

	// Whatever sits immediately left of the libraries group, which depends on how
	// many of the optional buttons are turned on.
	const librariesLeftTargetId = useMemo(() => {
		if (showSeerr) return 'navbar-discover';
		if (showSyncPlay) return 'navbar-syncplay';
		if (showLiveTv) return 'navbar-livetv';
		if (showFavorites) return 'navbar-favorites';
		if (showGenres) return 'navbar-genres';
		if (showShuffle) return 'navbar-shuffle';
		return 'navbar-search';
	}, [showSeerr, showSyncPlay, showLiveTv, showFavorites, showGenres, showShuffle]);

	const handlePillFocus = useCallback((e) => {
		if (pointerHover()) return;
		e.target?.scrollIntoView?.({behavior: 'smooth', block: 'nearest', inline: 'nearest'});
	}, []);

	const handleNavKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		focusFirstContentTarget(CONTENT_FOCUS_TARGETS, 'down');
	}, []);

	// Slots hand out the theme's nav color cycle in the order pills actually
	// render, so hiding a button never doubles a color on its neighbours.
	let slot = 0;
	const nextSlot = () => {
		slot += 1;
		return slot;
	};

	return (
		<NavContainer
			className={settings.navbarAlwaysExpanded ? `${css.topNav} ${css.alwaysExpanded}` : css.topNav}
			onKeyDown={handleNavKeyDown}
			spotlightId="navbar"
		>
			<div className={css.navLeft}>
				<NavUserButton onClick={onUserMenu} />
			</div>

			<div className={libraryMenuOpen ? `${css.navCenter} ${css.menuOpen}` : css.navCenter}>
				<div className={css.navPill} style={navPillStyle} onFocus={handlePillFocus}>
					<NavPillButton Icon={HomeIcon} slot={nextSlot()} label={$L('Home')} onClick={onHome} spotlightId="navbar-home" isDefault />
					<NavPillButton Icon={SearchIcon} slot={nextSlot()} label={$L('Search')} onClick={onSearch} spotlightId="navbar-search" />

					{showShuffle && (
						<NavPillButton Icon={ShuffleIcon} slot={nextSlot()} label={$L('Shuffle')} onClick={onShuffle} spotlightId="navbar-shuffle" />
					)}

					{showGenres && (
						<NavPillButton Icon={GenresIcon} slot={nextSlot()} label={$L('Genres')} onClick={onGenres} spotlightId="navbar-genres" />
					)}

					{showFavorites && (
						<NavPillButton Icon={FavoritesIcon} slot={nextSlot()} label={$L('Favorites')} onClick={onFavorites} spotlightId="navbar-favorites" />
					)}

					{showLiveTv && (
						<NavPillButton Icon={LiveTvIcon} slot={nextSlot()} label={$L('Live TV')} onClick={onLiveTv} spotlightId="navbar-livetv" />
					)}

					{showSyncPlay && (
						<NavPillButton Icon={SyncPlayIcon} slot={nextSlot()} label={$L('SyncPlay')} onClick={onSyncPlay} spotlightId="navbar-syncplay" active={isInGroup} />
					)}

					{showSeerr && (
						<NavPillButton Icon={SeerrIcon} slot={nextSlot()} label={displayName} onClick={onDiscover} spotlightId="navbar-discover" />
					)}

					{showLibraries && (
						<NavLibraries
							libraries={navLibraries}
							slot={nextSlot()}
							activeView={activeView}
							onSelectLibrary={onSelectLibrary}
							leftTargetId={librariesLeftTargetId}
							onMenuOpen={setLibraryMenuOpen}
						/>
					)}

					{showMessages && (
						<NavPillButton Icon={MessagesIcon} slot={nextSlot()} label={$L('Messages')} onClick={onMessages} spotlightId="navbar-messages" badge={unreadCount} />
					)}

					<NavPillButton Icon={SettingsIcon} slot={nextSlot()} label={$L('Settings')} onClick={onSettings} spotlightId="navbar-settings" />
				</div>
			</div>

			<div className={css.navRight}>
				{showClock && <div className={css.clock}>{clock}</div>}
			</div>
		</NavContainer>
	);
};

export default memo(NavBar);
