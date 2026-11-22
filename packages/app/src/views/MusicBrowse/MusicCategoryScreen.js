import {useCallback, useLayoutEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {SearchIcon} from '../../components/icons/navIcons';
import {useSettings} from '../../context/SettingsContext';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import MusicAlbumsScreen from './MusicAlbumsScreen';
import MusicArtistsScreen from './MusicArtistsScreen';
import MusicFavoritesScreen from './MusicFavoritesScreen';
import MusicGenresScreen from './MusicGenresScreen';
import MusicPlaylistsScreen from './MusicPlaylistsScreen';
import MusicSongsScreen from './MusicSongsScreen';
import MusicTabs from './MusicTabs';
import {IconCategory} from './QuickAccessMusic';
import {MUSIC_CATEGORIES, handleSectionKey} from './musicLibrary';
import {OVERVIEW_TAB, musicNavFor, stripTarget, tabForScreen} from './musicScreens';
import {CoreIcon, RAIL_CURRENT_ID, RAIL_ID, RailWidthContext, STRIP_CURRENT_ID, STRIP_ID, focusContent, focusControls} from './MusicScreenParts';

import css from './MusicScreens.module.less';
import chipsCss from './MusicChips.module.less';
import musicCss from './MusicLibrary.module.less';

const SpottableDiv = Spottable('div');
// Coming in from the screen lands on the open category's row, and the rail holds focus at its ends.
const RailContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-current="true"]',
	leaveFor: {up: '', down: '', left: ''}
}, 'div');

// Coming in from below lands on the open category's chip.
const CHIPS_ID = 'music-screen-chips';
const ChipsContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-current="true"]'
}, 'div');

// Quick Access's rail width from the stylesheet.
const RAIL_WIDTH = 248;

// Overview, then every category, Songs included, which the Classic overview's own chips leave out.
const CHIPS = [{id: OVERVIEW_TAB, label: $L('Overview')}, ...MUSIC_CATEGORIES];

const SCREENS = {
	artists: MusicArtistsScreen,
	albums: MusicAlbumsScreen,
	songs: MusicSongsScreen,
	playlists: MusicPlaylistsScreen,
	genres: MusicGenresScreen,
	favorites: MusicFavoritesScreen
};

// Genres gets a glyph of its own here, since its note on the overview is the one Songs uses.
const categoryIcon = (category) => (
	category.id === 'genres' ? <CoreIcon name="category" /> : <IconCategory d={category.icon} />
);

const enterScreen = (screenId) => {
	if (!focusContent(screenId)) focusControls(screenId);
};

// The screen a music category opens, from `musicScreenFor`, with the categories shown the way
// the library style's overview shows them, to switch between in place: Immersive's pill strip
// or Classic's chips over it, or Quick Access's rail to its left. They stay mounted across a
// switch, so focus stays on them.
const MusicCategoryScreen = ({screen, library, onBack, onOpenScreen, onSearch, ...rest}) => {
	const {settings} = useSettings();
	const Screen = SCREENS[screen?.id];
	const current = tabForScreen(screen);
	const screenId = screen?.id;
	const nav = musicNavFor(settings.musicLibraryStyle);
	const libraryName = library?.Name || $L('Music');

	// The chips open with the open category's chip in the middle of the row. A ref on the
	// container gets its component rather than the row, so the row is found by its id.
	useLayoutEffect(() => {
		const row = document.querySelector(`[data-spotlight-id="${CHIPS_ID}"]`);
		const chip = row?.querySelector('[data-current="true"]');
		if (chip) row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
	}, []);

	const handleTab = useCallback((tab) => {
		const target = stripTarget(tab, current);
		if (target === 'home') onBack();
		else if (target) onOpenScreen(target);
	}, [current, onBack, onOpenScreen]);

	// Down from the strip or the chips goes to the screen's own controls, or into its content when
	// it has none.
	const handleStripKey = useCallback((e) => handleSectionKey(e, {
		chain: [],
		onDown: () => focusControls(screenId) || focusContent(screenId)
	}), [screenId]);

	// The open category on the rail or the chips goes into the content, as does Right from any
	// rail row.
	const handleNavItem = useCallback((e) => {
		const tab = e.currentTarget.dataset.tab;
		if (tab === current) enterScreen(screenId);
		else handleTab(tab);
	}, [current, screenId, handleTab]);

	const handleRailKey = useCallback((e) => {
		if (e.keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		enterScreen(screenId);
	}, [screenId]);

	const content = Screen ? <Screen key={screenId} screen={screen} library={library} onBack={onBack} {...rest} /> : null;

	if (nav === 'chips') {
		return (
			<div className={css.page}>
				<ChipsContainer className={css.screenChips} spotlightId={CHIPS_ID} onKeyDown={handleStripKey} onFocus={keepFocusInView}>
					{CHIPS.map((chip) => {
						const isCurrent = chip.id === current;
						return (
							<SpottableDiv
								key={chip.id}
								className={isCurrent ? `${chipsCss.chip} ${css.chipCurrent}` : chipsCss.chip}
								data-tab={chip.id}
								data-current={isCurrent}
								spotlightId={isCurrent ? STRIP_CURRENT_ID : undefined}
								onClick={handleNavItem}
							>
								{chip.icon ? categoryIcon(chip) : <CoreIcon name="space_dashboard_outlined" />}
								<span className={chipsCss.chipLabel}>{chip.label}</span>
							</SpottableDiv>
						);
					})}
				</ChipsContainer>
				{content}
			</div>
		);
	}

	if (nav === 'strip') {
		return (
			<div className={css.page}>
				<div className={css.strip} onKeyDown={handleStripKey}>
					<div className={css.stripName}>{libraryName}</div>
					<MusicTabs current={current} onOpenGrid={handleTab} spotlightId={STRIP_ID} activeSpotlightId={STRIP_CURRENT_ID} />
				</div>
				{content}
			</div>
		);
	}

	const railRow = (tab, label, icon) => (
		<SpottableDiv
			key={tab}
			className={tab === current ? `${musicCss.railItem} ${musicCss.railSelected}` : musicCss.railItem}
			data-tab={tab}
			data-current={tab === current}
			spotlightId={tab === current ? RAIL_CURRENT_ID : undefined}
			onClick={tab === 'search' ? onSearch : handleNavItem}
		>
			{icon}<span>{label}</span>
		</SpottableDiv>
	);

	return (
		<RailWidthContext.Provider value={RAIL_WIDTH}>
			<div className={css.page}>
				<div className={musicCss.quickBody}>
					<RailContainer className={musicCss.rail} spotlightId={RAIL_ID} onKeyDown={handleRailKey} onFocus={keepFocusInView}>
						<div className={musicCss.railHeader}>
							<div className={css.stripName}>{libraryName}</div>
						</div>
						{railRow('search', $L('Search Music'), <SearchIcon />)}
						{railRow(OVERVIEW_TAB, $L('Overview'), <CoreIcon name="space_dashboard_outlined" />)}
						{MUSIC_CATEGORIES.map((category) => railRow(category.id, category.label, categoryIcon(category)))}
					</RailContainer>
					{content}
				</div>
			</div>
		</RailWidthContext.Provider>
	);
};

export default MusicCategoryScreen;
