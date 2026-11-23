import {memo, useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import useClock from '../../hooks/useClock';
import {toCssColor} from '../../theme/themeSpec';
import {KEYS} from '../../utils/keys';
import {SearchIcon} from '../icons/navIcons';
import UnreadBadge from '../UnreadBadge';
import {NavMusicPill} from '../MiniMusicPlayer/MiniMusicPlayer';
import NavLibraries from '../NavBar/NavLibraries';
import NavUserButton from '../NavBar/NavUserButton';
import {focusBelowBar, navbarFill, navEntries, scrollTabIntoView, useNavVisibility} from './navDestinations';

import css from './TablineBar.module.less';

const SpottableButton = Spottable('button');

const NavContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '.spottable-default',
	preserveId: true
}, 'nav');

// The current page wears the accent underline, and focus swaps it for a white one.
const TablineTab = ({label, current, item, badge = 0, className = '', ...rest}) => {
	const {activeTheme} = useSettings();
	const lineStyle = current ? {background: toCssColor(activeTheme.colors.accent)} : null;
	return (
		<SpottableButton className={[css.tab, current && css.current, item && css.item, className].filter(Boolean).join(' ')} {...rest}>
			<UnreadBadge count={badge}>
				<span>{label}</span>
			</UnreadBadge>
			<span className={css.line} style={lineStyle} />
		</SpottableButton>
	);
};

const TablineBar = ({activeView = 'home', libraries = [], hasLiveTv = false, onSelectLibrary, onUserMenu, music, onOpenMusic, hideForTrailer, ...handlers}) => {
	const {settings, activeTheme} = useSettings();
	const vis = useNavVisibility(libraries, hasLiveTv);
	const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
	const showClock = settings.showClock !== false;
	const clock = useClock(showClock);

	const entries = navEntries(vis, {...handlers, onSelectLibrary});
	const search = entries.find((entry) => entry.key === 'search');
	const tabs = entries.filter((entry) => entry !== search);

	const hasMusic = Boolean(music);
	const handleNavKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		focusBelowBar(hasMusic);
	}, [hasMusic]);

	return (
		<NavContainer
			className={`${css.bar} ${hideForTrailer ? css.trailerHidden : ''}`}
			onKeyDown={handleNavKeyDown}
			spotlightId="navbar"
		>
			<div className={css.scrim} />
			<div className={css.row}>
				<div className={css.tabs} onFocus={scrollTabIntoView}>
					{tabs.map((entry, index) => (entry.libraries ? (
						<NavLibraries
							key={entry.key}
							libraries={entry.libraries}
							activeView={activeView}
							onSelectLibrary={onSelectLibrary}
							leftTargetId={tabs[index - 1]?.spotlightId}
							onMenuOpen={setLibraryMenuOpen}
							Tab={TablineTab}
							className={libraryMenuOpen ? css.menuAnchor : ''}
						/>
					) : (
						<TablineTab
							key={entry.key}
							label={entry.label}
							badge={entry.badge}
							current={entry.view === activeView || entry.active}
							onClick={entry.onClick}
							spotlightId={entry.spotlightId}
							className={entry.key === 'home' ? 'spottable-default' : ''}
						/>
					)))}
				</div>
				<div className={css.right}>
					<SpottableButton className={css.iconButton} onClick={search.onClick} spotlightId={search.spotlightId}>
						<SearchIcon className={css.icon} />
					</SpottableButton>
					{showClock && <div className={css.clock}>{clock}</div>}
					<NavUserButton onClick={onUserMenu} />
				</div>
			</div>

			{music && (
				<NavMusicPill item={music.item} paused={music.paused} onOpen={onOpenMusic} style={{background: navbarFill(settings, activeTheme), color: toCssColor(activeTheme.colors.onSurface)}} />
			)}
		</NavContainer>
	);
};

export default memo(TablineBar);
