import {memo, useCallback, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {useSyncPlay} from '../../context/SyncPlayContext';
import {useServerMessages} from '../../context/ServerMessagesContext';
import SeerrIcon from '../icons/SeerrIcon';
import SyncPlayIcon from '../icons/SyncPlayIcon';
import {FavoritesIcon, GenresIcon, HomeIcon, LiveTvIcon, MessagesIcon, SearchIcon, SettingsIcon, ShuffleIcon} from '../icons/navIcons';
import useClock from '../../hooks/useClock';
import {shadowToCss, toCssColor, toCssColorWithAlpha} from '../../theme/themeSpec';
import {resolveOverlayColor} from '../../theme/overlayColors';
import {SIDEBAR_CONTENT_FOCUS_TARGETS, focusFirstContentTarget} from '../../utils/navFocusTargets';
import {KEYS} from '../../utils/keys';
import SidebarItem from './SidebarItem';
import SidebarLibraries from './SidebarLibraries';
import SidebarUserButton from './SidebarUserButton';
import useSidebarExpansion from './useSidebarExpansion';

import css from './Sidebar.module.less';

const SidebarContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	preserveId: true
}, 'nav');

// The rail holds its color flat for all but its outer 16 pixels of 280, where it
// blends out to nothing.
const RAIL_SOLID_PERCENT = Math.round(((280 - 16) / 280) * 10000) / 100;

// Up and down at the ends of the rail would otherwise leak out to whatever sits
// behind it, so those two presses get swallowed.
const trapVerticalEdges = (e) => {
	const items = Array.from(e.currentTarget.querySelectorAll('[data-spotlight-id], .spottable'))
		.filter(el => el.offsetParent !== null);
	if (items.length === 0) return;
	const focused = document.activeElement;
	const edge = e.keyCode === KEYS.UP ? items[0] : items[items.length - 1];
	if (focused === edge || edge.contains(focused)) {
		e.preventDefault();
		e.stopPropagation();
	}
};

const Sidebar = ({
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
	const clock = useClock();
	const {expanded, librariesExpanded, toggleLibraries, handlers} = useSidebarExpansion();

	const showShuffle = settings.showShuffleButton !== false;
	const showGenres = settings.showGenresButton !== false;
	const showFavorites = settings.showFavoritesButton !== false;
	// Only on a server that actually has a Live TV library, the same check the home
	// screen's Live TV row makes.
	const showLiveTv = settings.showLiveTvButton !== false && hasLiveTv;
	const showSeerr = seerrEnabled && settings.showSeerrButton !== false;
	const showSyncPlay = settings.syncplayEnabled !== false && settings.showSyncPlayButton !== false;
	const showLibraries = settings.showLibrariesInToolbar !== false && libraries.length > 0;
	// Only with something to show, so the rail never has a row that does nothing.
	const showMessages = settings.showServerMessagesButton === true && messages.length > 0;

	const navStyle = useMemo(() => {
		// The rail paints the overlay color on every theme. Only the top bar clears
		// itself for themes that ask for a transparent nav surface.
		const overlay = toCssColorWithAlpha(resolveOverlayColor(settings.navbarColor), (settings.navbarOpacity ?? 50) / 100);
		// The stop is a percentage rather than a pixel width so it holds its place
		// when the interface scale stretches the rail.
		const rail = `linear-gradient(to right, ${overlay} 0%, ${overlay} ${RAIL_SOLID_PERCENT}%, transparent 100%)`;
		return {
			background: expanded ? rail : 'transparent',
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			borderBottom: activeTheme.borders.navBorder
				? `${activeTheme.borders.navBorder.width}px solid ${toCssColor(activeTheme.borders.navBorder.color)}`
				: 'none',
			color: toCssColor(activeTheme.colors.onSurface),
			textShadow: activeTheme.textGlow.length ? activeTheme.textGlow.map(shadowToCss).join(', ') : 'none'
		};
	}, [activeTheme, settings.navbarColor, settings.navbarOpacity, expanded]);

	const handleNavKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			focusFirstContentTarget(SIDEBAR_CONTENT_FOCUS_TARGETS, 'right');
		} else if (e.keyCode === KEYS.UP || e.keyCode === KEYS.DOWN) {
			trapVerticalEdges(e);
		}
	}, []);

	// Slots hand out the theme's nav color cycle in the order items actually
	// render, so hiding a button never doubles a color on its neighbours.
	let slot = 0;
	const nextSlot = () => {
		slot += 1;
		return slot;
	};

	return (
		<SidebarContainer
			className={`${css.sidebar} ${expanded ? css.expanded : ''}`}
			style={navStyle}
			onKeyDown={handleNavKeyDown}
			onMouseEnter={handlers.onMouseEnter}
			onMouseLeave={handlers.onMouseLeave}
			onFocus={handlers.onFocus}
			onBlur={handlers.onBlur}
			spotlightId="navbar"
		>
			<div className={css.userSection}>
				<SidebarUserButton onClick={onUserMenu} />
			</div>

			<div className={css.navSection}>
				<div className={css.navItems}>
					<SidebarItem Icon={HomeIcon} slot={nextSlot()} label={$L('Home')} onClick={onHome} spotlightId="navbar-home" className={spotlightDefaultClass} />
					<SidebarItem Icon={SearchIcon} slot={nextSlot()} label={$L('Search')} onClick={onSearch} />

					{showShuffle && (
						<SidebarItem Icon={ShuffleIcon} slot={nextSlot()} label={$L('Shuffle')} onClick={onShuffle} />
					)}

					{showGenres && (
						<SidebarItem Icon={GenresIcon} slot={nextSlot()} label={$L('Genres')} onClick={onGenres} />
					)}

					{showFavorites && (
						<SidebarItem Icon={FavoritesIcon} slot={nextSlot()} label={$L('Favorites')} onClick={onFavorites} />
					)}

					{showLiveTv && (
						<SidebarItem Icon={LiveTvIcon} slot={nextSlot()} label={$L('Live TV')} onClick={onLiveTv} />
					)}

					{showSeerr && (
						<SidebarItem Icon={SeerrIcon} slot={nextSlot()} label={displayName} onClick={onDiscover} />
					)}

					{showSyncPlay && (
						<SidebarItem Icon={SyncPlayIcon} slot={nextSlot()} label={$L('SyncPlay')} onClick={onSyncPlay} active={isInGroup} />
					)}

					{showLibraries && (
						<SidebarLibraries
							libraries={libraries}
							slot={nextSlot()}
							expanded={librariesExpanded}
							onToggle={toggleLibraries}
							onSelectLibrary={onSelectLibrary}
						/>
					)}

					{showMessages && (
						<SidebarItem Icon={MessagesIcon} slot={nextSlot()} label={$L('Messages')} onClick={onMessages} spotlightId="navbar-messages" badge={unreadCount} />
					)}

					<SidebarItem Icon={SettingsIcon} slot={nextSlot()} label={$L('Settings')} onClick={onSettings} spotlightId="navbar-settings" />
				</div>
			</div>

			<div className={css.footerSection}>
				<div className={css.clock}>{clock}</div>
			</div>
		</SidebarContainer>
	);
};

export default memo(Sidebar);
