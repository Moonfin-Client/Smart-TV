import {memo, useCallback, useState, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {useJellyseerr} from '../../context/JellyseerrContext';
import JellyseerrIcon from '../icons/JellyseerrIcon';
import SeerrIcon from '../icons/SeerrIcon';

import css from './Sidebar.module.less';

const SidebarContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	preserveId: true
}, 'nav');

const LibrariesContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SpottableButton = Spottable('button');

const Sidebar = ({
	libraries = [],
	onHome,
	onSearch,
	onShuffle,
	onGenres,
	onFavorites,
	onDiscover,
	onSettings,
	onSelectLibrary,
	onUserMenu
}) => {
	const {user, serverUrl} = useAuth();
	const {settings} = useSettings();
	const {isEnabled: jellyseerrEnabled, isMoonfin, variant, displayName} = useJellyseerr();
	const [clock, setClock] = useState('');
	const [isHovered, setIsHovered] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [librariesFocused, setLibrariesFocused] = useState(false);

	const expanded = isHovered || isFocused;
	const librariesExpanded = expanded && librariesFocused;

	useEffect(() => {
		const updateClock = () => {
			const now = new Date();
			if (settings.clockDisplay === '12-hour') {
				let hours = now.getHours();
				const ampm = hours >= 12 ? 'PM' : 'AM';
				hours = hours % 12;
				hours = hours ? hours : 12;
				const minutes = now.getMinutes().toString().padStart(2, '0');
				setClock(`${hours}:${minutes} ${ampm}`);
			} else {
				const hours = now.getHours().toString().padStart(2, '0');
				const minutes = now.getMinutes().toString().padStart(2, '0');
				setClock(`${hours}:${minutes}`);
			}
		};
		updateClock();
		const interval = setInterval(updateClock, 60000);
		return () => clearInterval(interval);
	}, [settings.clockDisplay]);

	const userAvatarUrl = user?.PrimaryImageTag
		? `${serverUrl}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&quality=90&maxHeight=100`
		: null;

	const [avatarError, setAvatarError] = useState(false);

	const handleAvatarError = useCallback(() => {
		setAvatarError(true);
	}, []);

	const handleLibraryClick = useCallback((e) => {
		const libId = e.currentTarget.dataset.libraryId;
		const lib = libraries.find(l => l.Id === libId);
		if (lib) onSelectLibrary?.(lib);
	}, [libraries, onSelectLibrary]);

	const filteredLibraries = libraries;

	const handleSidebarMouseEnter = useCallback(() => {
		setIsHovered(true);
	}, []);

	const handleSidebarMouseLeave = useCallback(() => {
		setIsHovered(false);
	}, []);

	const handleSidebarFocus = useCallback(() => {
		setIsFocused(true);
	}, []);

	const handleSidebarBlur = useCallback((e) => {
		const container = e.currentTarget;
		const relatedTarget = e.relatedTarget;
		if (relatedTarget && container.contains(relatedTarget)) {
			return;
		}
		setIsFocused(false);
		setLibrariesFocused(false);
	}, []);

	const handleLibrariesFocus = useCallback(() => {
		setLibrariesFocused(true);
	}, []);

	const handleLibrariesBlur = useCallback((e) => {
		const container = e.currentTarget;
		const relatedTarget = e.relatedTarget;
		if (relatedTarget && container.contains(relatedTarget)) {
			return;
		}
		setLibrariesFocused(false);
	}, []);

	const handleNavKeyDown = useCallback((e) => {
		if (e.keyCode === 39) {
			// Right arrow - move focus to content
			e.preventDefault();
			e.stopPropagation();
			const focusTargets = [
				'featured-banner',
				'row-0',
				'settings-sidebar',
				'favorites-row-0',
				'genres-grid',
				'genre-browse-grid',
				'library-letter-hash',
				'library-grid',
				'person-grid',
				'discover-row-0',
				'jellyseerr-browse-grid',
				'action-buttons',
				'details-primary-btn',
				'search-input',
				'livetv-guide'
			];
			for (const target of focusTargets) {
				if (Spotlight.focus(target)) return;
			}
			Spotlight.setPointerMode(false);
			Spotlight.move('right');
		} else if (e.keyCode === 38 || e.keyCode === 40) {
			// Up/Down - prevent escaping the sidebar
			const nav = e.currentTarget;
			const spottables = nav.querySelectorAll('[data-spotlight-id], .spottable');
			if (spottables.length === 0) return;
			const focused = document.activeElement;
			const items = Array.from(spottables).filter(el => el.offsetParent !== null);
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (e.keyCode === 38 && (focused === first || first.contains(focused))) {
				e.preventDefault();
				e.stopPropagation();
			} else if (e.keyCode === 40 && (focused === last || last.contains(focused))) {
				e.preventDefault();
				e.stopPropagation();
			}
		}
	}, []);

	return (
		<SidebarContainer
			className={`${css.sidebar} ${expanded ? css.expanded : ''}`}
			onKeyDown={handleNavKeyDown}
			onMouseEnter={handleSidebarMouseEnter}
			onMouseLeave={handleSidebarMouseLeave}
			onFocus={handleSidebarFocus}
			onBlur={handleSidebarBlur}
			spotlightId="navbar"
		>
			<div className={css.userSection}>
				<SpottableButton
					className={`${css.sidebarItem} ${css.userBtn}`}
					onClick={onUserMenu}
				>
					{userAvatarUrl && !avatarError ? (
						<img
							className={css.userAvatarImg}
							src={userAvatarUrl}
							alt={user?.Name}
							onError={handleAvatarError}
						/>
					) : (
						<div className={css.userAvatar}>
							{user?.Name?.[0] || 'U'}
						</div>
					)}
					<span className={css.sidebarLabel}>{user?.Name || 'User'}</span>
				</SpottableButton>
			</div>

			<div className={css.navSection}>
				<SpottableButton
					className={css.sidebarItem}
					onClick={onHome}
					spotlightId="navbar-home"
				>
					<svg className={css.sidebarIcon} viewBox="0 0 24 24">
						<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
					</svg>
					<span className={css.sidebarLabel}>Home</span>
				</SpottableButton>

				<SpottableButton
					className={css.sidebarItem}
					onClick={onSearch}
				>
					<svg className={css.sidebarIcon} viewBox="0 0 24 24">
						<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
					</svg>
					<span className={css.sidebarLabel}>Search</span>
				</SpottableButton>

				{settings.showShuffleButton !== false && (
					<SpottableButton
						className={css.sidebarItem}
						onClick={onShuffle}
					>
						<svg className={css.sidebarIcon} viewBox="0 0 24 24">
							<path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
						</svg>
						<span className={css.sidebarLabel}>Shuffle</span>
					</SpottableButton>
				)}

				{settings.showGenresButton !== false && (
					<SpottableButton
						className={css.sidebarItem}
						onClick={onGenres}
					>
						<svg className={css.sidebarIcon} viewBox="0 0 24 24">
							<path d="M8.11,19.45C5.94,18.65 4.22,16.78 3.71,14.35L2.05,6.54C1.81,5.46 2.5,4.4 3.58,4.17L13.35,2.1L13.38,2.09C14.45,1.88 15.5,2.57 15.72,3.63L16.07,5.3L20.42,6.23H20.45C21.5,6.47 22.18,7.53 21.96,8.59L20.3,16.41C19.5,20.18 15.78,22.6 12,21.79C10.42,21.46 9.08,20.61 8.11,19.45V19.45M20,8.18L10.23,6.1L8.57,13.92V13.95C8,16.63 9.73,19.27 12.42,19.84C15.11,20.41 17.77,18.69 18.34,16L20,8.18M16,16.5C15.37,17.57 14.11,18.16 12.83,17.89C11.56,17.62 10.65,16.57 10.5,15.34L16,16.5M8.47,5.17L4,6.13L5.66,13.94L5.67,13.97C5.82,14.68 6.12,15.32 6.53,15.87C6.43,15.1 6.45,14.3 6.62,13.5L7.05,11.5C6.6,11.42 6.21,11.17 6,10.81C6.06,10.2 6.56,9.66 7.25,9.5C7.33,9.5 7.4,9.5 7.5,9.5L8.28,5.69C8.32,5.5 8.38,5.33 8.47,5.17M15.03,12.23C15.35,11.7 16.03,11.42 16.72,11.57C17.41,11.71 17.91,12.24 18,12.86C17.67,13.38 17,13.66 16.3,13.5C15.61,13.37 15.11,12.84 15.03,12.23M10.15,11.19C10.47,10.66 11.14,10.38 11.83,10.53C12.5,10.67 13.03,11.21 13.11,11.82C12.78,12.34 12.11,12.63 11.42,12.5C10.73,12.33 10.23,11.8 10.15,11.19M11.97,4.43L13.93,4.85L13.77,4.05L11.97,4.43Z" />
						</svg>
						<span className={css.sidebarLabel}>Genres</span>
					</SpottableButton>
				)}

				{settings.showFavoritesButton !== false && (
					<SpottableButton
						className={css.sidebarItem}
						onClick={onFavorites}
					>
						<svg className={css.sidebarIcon} viewBox="0 0 24 24">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
						</svg>
						<span className={css.sidebarLabel}>Favorites</span>
					</SpottableButton>
				)}

				{jellyseerrEnabled && (
					<SpottableButton
						className={css.sidebarItem}
						onClick={onDiscover}
					>
						{isMoonfin && variant === 'seerr'
							? <SeerrIcon className={css.sidebarIcon} />
							: <JellyseerrIcon className={css.sidebarIcon} />
						}
						<span className={css.sidebarLabel}>{displayName}</span>
					</SpottableButton>
				)}

				{settings.showLibrariesInToolbar !== false && filteredLibraries.length > 0 && (
					<div
						onFocus={handleLibrariesFocus}
						onBlur={handleLibrariesBlur}
					>
						<div
							className={`${css.sidebarItem} ${css.librariesToggle} ${librariesExpanded ? css.librariesExpandedState : ''}`}
						>
							<svg className={css.sidebarIcon} viewBox="0 0 24 24">
								<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
							</svg>
							<span className={css.sidebarLabel}>Libraries</span>
							<svg className={css.chevron} viewBox="0 0 24 24">
								<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
							</svg>
						</div>

						<LibrariesContainer
							className={`${css.librariesList} ${librariesExpanded ? css.librariesListExpanded : ''}`}
						>
							{filteredLibraries.map((lib) => (
								<SpottableButton
									key={lib.Id}
									className={css.libraryItem}
									onClick={handleLibraryClick}
									data-library-id={lib.Id}
								>
									<span className={css.libraryName}>{lib.Name}</span>
								</SpottableButton>
							))}
						</LibrariesContainer>
					</div>
				)}
			</div>

			<div className={css.footerSection}>
				<SpottableButton
					className={css.sidebarItem}
					onClick={onSettings}
					spotlightId="navbar-settings"
				>
					<svg className={css.sidebarIcon} viewBox="0 0 24 24">
						<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
					</svg>
					<span className={css.sidebarLabel}>Settings</span>
				</SpottableButton>

				<div className={css.clock}>{clock}</div>
			</div>
		</SidebarContainer>
	);
};

export default memo(Sidebar);
