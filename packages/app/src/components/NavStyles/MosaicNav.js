import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import useClock from '../../hooks/useClock';
import useUserAvatar from '../../hooks/useUserAvatar';
import {toCssColor} from '../../theme/themeSpec';
import {getFeaturedBackdropUrl} from '../../utils/helpers';
import {focusContentFromSidebar} from '../../utils/navFocusTargets';
import {pointerHover} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {memoryCache} from '../../views/Browse/browseCache';
import {AppsIcon} from '../icons/navIcons';
import UnreadBadge from '../UnreadBadge';
import {currentEntryIndex, libraryCoverUrl, navEntries, rememberReturnOnEnter, useBackToClose, useCloseOnFocusOut, useNavVisibility} from './navDestinations';

import css from './MosaicNav.module.less';

const SpottableButton = Spottable('button');

const MosaicContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	preserveId: true
}, 'nav');

const PanelContainer = SpotlightContainerDecorator({}, 'div');

const tileId = (entry) => `navbar-mosaic-${entry.key}`;

// The art for the Home tile: the media bar's first title with a backdrop, or failing that the
// first one on Home's rows.
const featuredItem = () => {
	const rowItems = (memoryCache.rowData || []).reduce((all, row) => all.concat(row.items || []), []);
	const candidates = (memoryCache.featuredItems || []).concat(rowItems);
	return candidates.find((item) => item && (item._externalBackdropUrl || item.BackdropImageTags?.length || item.ParentBackdropImageTags?.length)) || null;
};

// The page on screen gets an accent outline, which focus draws over.
const Tile = ({entry, className, current, accent, onChoose, children}) => {
	const handleClick = useCallback(() => onChoose(entry), [entry, onChoose]);
	return (
		<SpottableButton
			className={[css.tile, className].filter(Boolean).join(' ')}
			spotlightId={tileId(entry)}
			style={current && accent ? {boxShadow: `0 0 0 3px ${accent}`} : null}
			onClick={handleClick}
		>
			{children}
		</SpottableButton>
	);
};

const MosaicNav = ({activeView = 'home', libraries = [], hasLiveTv = false, onSelectLibrary, onUserMenu, music, hideForTrailer, backRef, ...handlers}) => {
	const {settings, activeTheme} = useSettings();
	const {serverUrl} = useAuth();
	const {user, avatarUrl, initial, onError} = useUserAvatar();
	const vis = useNavVisibility(libraries, hasLiveTv);
	const showClock = settings.showClock !== false;
	const [open, setOpen] = useState(false);
	const clock = useClock(showClock && open);
	const accent = toCssColor(activeTheme.colors.accent);

	const entries = navEntries(vis, {...handlers, onSelectLibrary}, {side: true, splitLibraries: true, nowPlaying: Boolean(music)});
	const current = entries[currentEntryIndex(entries, activeView)];
	const home = entries[0];
	const live = entries.find((entry) => entry.key === 'livetv');
	const discover = entries.find((entry) => entry.key === 'discover');
	const libraryTiles = entries.filter((entry) => entry.library);
	const smallTiles = entries.filter((entry) => entry !== home && entry !== live && entry !== discover && !entry.library);

	const openPanel = useCallback(() => setOpen(true), []);
	// A pointer focuses whatever it passes over, and the panel opens only on a click.
	const openOnFocus = useCallback(() => {
		if (!pointerHover()) setOpen(true);
	}, []);

	useEffect(() => {
		if (open) Spotlight.focus(tileId(current));
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	const close = useCallback(() => setOpen(false), []);
	const closeToContent = useCallback(() => {
		setOpen(false);
		focusContentFromSidebar();
	}, []);

	// Focus goes back to the page first, so whatever the tile opens returns there afterwards.
	const choose = useCallback((entry) => {
		closeToContent();
		entry.onClick?.();
	}, [closeToContent]);

	const handleAvatarClick = useCallback(() => {
		setOpen(false);
		onUserMenu?.();
	}, [onUserMenu]);

	// Right off the right hand column leaves the panel. Spotlight keeps every other press inside.
	const handlePanelKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		if (!Spotlight.move('right')) closeToContent();
	}, [closeToContent]);

	useCloseOnFocusOut(open, close);
	useBackToClose(backRef, open, closeToContent);

	const featured = useMemo(() => (open ? featuredItem() : null), [open]);
	const featuredUrl = featured && getFeaturedBackdropUrl(featured._serverUrl || serverUrl, featured, {maxWidth: 800, quality: 80});
	const HomeIcon = home.Icon;
	const LiveIcon = live?.Icon;
	const DiscoverIcon = discover?.Icon;

	return (
		<MosaicContainer
			className={`${css.mosaic} ${hideForTrailer && !open ? css.trailerHidden : ''}`}
			onFocus={rememberReturnOnEnter}
			spotlightId="navbar"
		>
			{!open && (
				<SpottableButton className={`${css.menuButton} ${spotlightDefaultClass}`} onFocus={openOnFocus} onClick={openPanel}>
					<AppsIcon className={css.menuIcon} />
				</SpottableButton>
			)}

			{open && <div className={css.dim} onClick={closeToContent} />}
			{open && (
				<PanelContainer className={css.panel} style={{background: toCssColor(activeTheme.colors.background)}} spotlightId="navbar-mosaic" spotlightRestrict="self-only" onKeyDown={handlePanelKeyDown}>
					<div className={css.header}>
						<SpottableButton className={css.avatarButton} onClick={handleAvatarClick}>
							{avatarUrl ? (
								<img className={css.avatarImage} src={avatarUrl} alt={user?.Name} onError={onError} />
							) : (
								<span className={css.avatarInitial}>{initial}</span>
							)}
						</SpottableButton>
						<span className={css.name}>{user?.Name || $L('User')}</span>
						{showClock && <span className={css.clock}>{clock}</span>}
					</div>

					<Tile entry={home} className={css.homeTile} onChoose={choose}>
						<span className={css.art} style={featuredUrl ? {backgroundImage: `url(${featuredUrl})`} : null} />
						<span className={css.homeShade} />
						<span className={css.homeText}>
							<HomeIcon className={css.homeIcon} />
							<span className={css.homeLabels}>
								<span className={css.homeTitle}>{home.label}</span>
								{featured && <span className={css.homeSub}>{$L('Featured: {title}').replace('{title}', featured.Name)}</span>}
							</span>
							{current === home && <span className={css.dot} style={{background: accent}} />}
						</span>
					</Tile>

					{(libraryTiles.length > 0 || live || discover) && <div className={css.grid}>
						{libraryTiles.map((entry) => {
							const cover = libraryCoverUrl(entry.library, serverUrl);
							const Icon = entry.Icon;
							return (
								<Tile key={entry.key} entry={entry} className={css.bigTile} current={entry === current} accent={accent} onChoose={choose}>
									{cover ? <span className={css.art} style={{backgroundImage: `url(${cover})`}} /> : (
										<span className={css.plainTile}>
											<Icon className={css.bigIcon} />
											<span className={css.bigLabel}>{entry.label}</span>
										</span>
									)}
								</Tile>
							);
						})}
						{live && (
							<Tile entry={live} className={`${css.bigTile} ${css.liveTile}`} current={live === current} accent={accent} onChoose={choose}>
								<span className={css.liveChip}><span className={css.liveDot} />{$L('LIVE')}</span>
								<span className={css.tileFoot}>
									<LiveIcon className={css.bigIcon} />
									<span className={css.bigLabel}>{live.label}</span>
								</span>
							</Tile>
						)}
						{discover && (
							<Tile entry={discover} className={`${css.bigTile} ${css.discoverTile}`} current={discover === current} accent={accent} onChoose={choose}>
								<DiscoverIcon className={css.discoverMark} />
								<span className={css.tileFoot}>
									<DiscoverIcon className={css.bigIcon} />
									<span className={css.bigLabel}>{discover.label}</span>
								</span>
							</Tile>
						)}
					</div>}

					<div className={css.smallGrid}>
						{smallTiles.map((entry) => {
							const Icon = entry.Icon;
							return (
								<Tile key={entry.key} entry={entry} className={css.smallTile} current={entry === current} accent={accent} onChoose={choose}>
									<UnreadBadge count={entry.badge}>
										<Icon className={css.smallIcon} />
									</UnreadBadge>
									<span className={css.smallLabel}>{entry.label}</span>
								</Tile>
							);
						})}
					</div>
				</PanelContainer>
			)}
		</MosaicContainer>
	);
};

export default memo(MosaicNav);
