import {memo, useCallback, useEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import useClock from '../../hooks/useClock';
import {toCssColor} from '../../theme/themeSpec';
import {pointerHover} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {ChevronDownIcon, ChevronUpIcon, SettingsIcon} from '../icons/navIcons';
import UnreadBadge from '../UnreadBadge';
import {NavMusicPill} from '../MiniMusicPlayer/MiniMusicPlayer';
import NavUserButton from '../NavBar/NavUserButton';
import AtlasPanel, {atlasPanelKind} from './AtlasPanel';
import {focusBelowBar, navbarFill, navEntries, scrollTabIntoView, useBackToClose, useCloseOnFocusOut, useNavVisibility} from './navDestinations';

import css from './AtlasBar.module.less';

const SpottableButton = Spottable('button');

const NavContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '.spottable-default',
	preserveId: true
}, 'nav');

const HOVER_OPEN_MS = 300;

const tabIdOf = (entry) => entry.spotlightId || `navbar-${entry.key}`;

const AtlasTab = ({entry, open, current, accent, onFocusTab, onSelectTab, onTogglePanel, onHoverTab}) => {
	const hasPanel = Boolean(atlasPanelKind(entry));
	const handleFocus = useCallback(() => onFocusTab(entry), [entry, onFocusTab]);
	const handleClick = useCallback(() => onSelectTab(entry), [entry, onSelectTab]);
	const handleEnter = useCallback(() => onHoverTab(entry), [entry, onHoverTab]);
	const handleLeave = useCallback(() => onHoverTab(null), [onHoverTab]);
	// The chevron opens or closes the panel without leaving the page.
	const handleChevron = useCallback((e) => {
		e.stopPropagation();
		onTogglePanel(entry);
	}, [entry, onTogglePanel]);
	const Icon = entry.Icon;

	return (
		<SpottableButton
			className={[css.tab, open && css.tabOpen, current && css.tabCurrent, entry.key === 'home' && 'spottable-default'].filter(Boolean).join(' ')}
			spotlightId={tabIdOf(entry)}
			data-atlas-key={entry.key}
			onFocus={handleFocus}
			onClick={handleClick}
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
		>
			<UnreadBadge count={entry.badge}>
				<Icon className={css.tabIcon} />
			</UnreadBadge>
			<span className={css.tabLabel}>{entry.label}</span>
			{hasPanel && (
				<span className={css.chevron} onClick={handleChevron}>
					{open ? <ChevronUpIcon className={css.chevronIcon} style={{fill: accent}} /> : <ChevronDownIcon className={css.chevronIcon} />}
				</span>
			)}
		</SpottableButton>
	);
};

const AtlasBar = ({activeView = 'home', libraries = [], hasLiveTv = false, onSelectLibrary, onUserMenu, music, onOpenMusic, hideForTrailer, backRef, ...handlers}) => {
	const {settings, activeTheme} = useSettings();
	const vis = useNavVisibility(libraries, hasLiveTv);
	const showClock = settings.showClock !== false;
	const clock = useClock(showClock);
	const accent = toCssColor(activeTheme.colors.accent);
	const [openKey, setOpenKey] = useState(null);
	const [focusPanel, setFocusPanel] = useState(false);
	const hoverTimerRef = useRef(null);

	const allHandlers = {...handlers, onSelectLibrary};
	const entries = navEntries(vis, allHandlers);
	const settingsEntry = entries.find((entry) => entry.key === 'settings');
	const tabs = entries.filter((entry) => entry !== settingsEntry);
	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;
	const openEntry = tabs.find((entry) => entry.key === openKey) || null;
	const openKind = openEntry && atlasPanelKind(openEntry);

	const close = useCallback(() => setOpenKey(null), []);
	const openPanel = useCallback((entry, focusFirst) => {
		setOpenKey(entry.key);
		if (focusFirst) setFocusPanel(true);
	}, []);

	useEffect(() => {
		if (!focusPanel || !openKey) return;
		setFocusPanel(false);
		Spotlight.focus('navbar-panel-first');
	}, [focusPanel, openKey]);

	useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

	// A panel tab that left the bar, after a settings change, takes its panel with it.
	useEffect(() => {
		if (openKey && !openEntry) setOpenKey(null);
	}, [openKey, openEntry]);

	useCloseOnFocusOut(openKey, close);

	// Back hands focus back to the panel's tab.
	const closeToTab = useCallback(() => {
		setOpenKey(null);
		Spotlight.focus(tabIdOf(openEntry));
	}, [openEntry]);
	useBackToClose(backRef, openEntry, closeToTab);

	// With the remote, an open panel follows focus along the bar and closes on a tab without one.
	// A pointer waits for the hover instead.
	const handleFocusTab = useCallback((entry) => {
		if (pointerHover()) return;
		setOpenKey((prev) => (prev === null ? null : (atlasPanelKind(entry) ? entry.key : null)));
	}, []);

	const handleSelectTab = useCallback((entry) => {
		clearTimeout(hoverTimerRef.current);
		// The grouped libraries have no page of their own, so the tab opens its list.
		if (entry.key === 'libraries') {
			openPanel(entry, true);
			return;
		}
		setOpenKey(null);
		entry.onClick?.();
	}, [openPanel]);

	const handleTogglePanel = useCallback((entry) => {
		clearTimeout(hoverTimerRef.current);
		setOpenKey((prev) => (prev === entry.key ? null : entry.key));
	}, []);

	const handleHoverTab = useCallback((entry) => {
		clearTimeout(hoverTimerRef.current);
		if (!entry || !pointerHover()) return;
		hoverTimerRef.current = setTimeout(() => {
			setOpenKey(atlasPanelKind(entry) ? entry.key : null);
		}, HOVER_OPEN_MS);
	}, []);

	const handleMouseLeave = useCallback(() => {
		clearTimeout(hoverTimerRef.current);
		if (pointerHover()) setOpenKey(null);
	}, []);

	const closeOnFocus = useCallback(() => {
		if (!pointerHover()) setOpenKey(null);
	}, []);

	const hasMusic = Boolean(music);
	const handleNavKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		const key = e.target.getAttribute && e.target.getAttribute('data-atlas-key');
		const entry = key && tabsRef.current.find((tab) => tab.key === key);
		if (entry && atlasPanelKind(entry)) {
			openPanel(entry, true);
			return;
		}
		setOpenKey(null);
		focusBelowBar(hasMusic);
	}, [hasMusic, openPanel]);

	const navBorder = activeTheme.borders.navBorder;
	const barStyle = {
		background: navbarFill(settings, activeTheme),
		borderBottom: navBorder ? `${navBorder.width}px solid ${toCssColor(navBorder.color)}` : '1px solid rgba(255, 255, 255, 0.06)'
	};

	return (
		<>
			{openEntry && <div className={css.dim} onClick={close} />}
			<NavContainer
				className={`${css.bar} ${hideForTrailer && !openEntry ? css.trailerHidden : ''}`}
				style={barStyle}
				onKeyDown={handleNavKeyDown}
				onMouseLeave={handleMouseLeave}
				spotlightId="navbar"
			>
				<div className={css.avatar} onFocus={closeOnFocus}>
					<NavUserButton onClick={onUserMenu} />
				</div>
				<div className={css.tabs} onFocus={scrollTabIntoView}>
					{tabs.map((entry) => (
						<AtlasTab
							key={entry.key}
							entry={entry}
							open={entry.key === openKey}
							current={entry.view === activeView || entry.active}
							accent={accent}
							onFocusTab={handleFocusTab}
							onSelectTab={handleSelectTab}
							onTogglePanel={handleTogglePanel}
							onHoverTab={handleHoverTab}
						/>
					))}
				</div>
				{showClock && <div className={css.clock}>{clock}</div>}
				<SpottableButton className={css.iconButton} onClick={settingsEntry.onClick} onFocus={closeOnFocus} spotlightId={settingsEntry.spotlightId}>
					<SettingsIcon className={css.icon} />
				</SpottableButton>

				{music && !openEntry && (
					<NavMusicPill item={music.item} paused={music.paused} onOpen={onOpenMusic} style={{background: barStyle.background, color: '#ffffff'}} />
				)}

				{openEntry && (
					<AtlasPanel
						key={openEntry.key}
						entry={openEntry}
						kind={openKind}
						tabId={tabIdOf(openEntry)}
						accent={accent}
						libraries={libraries}
						handlers={allHandlers}
						onClose={close}
					/>
				)}
			</NavContainer>
		</>
	);
};

export default memo(AtlasBar);
