import {useCallback, useLayoutEffect, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {titlesLabel} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {handleSectionKey} from '../MusicBrowse/musicLibrary';
import MusicTabs from '../MusicBrowse/MusicTabs';
import {CoreIcon} from '../MusicBrowse/MusicScreenParts';
import {BookIcon} from './BookCard';
import BookAuthorsScreen from './BookAuthorsScreen';
import BookCollectionsScreen from './BookCollectionsScreen';
import BookDiscoverScreen from './BookDiscoverScreen';
import BookFavoritesScreen from './BookFavoritesScreen';
import BookGenresScreen from './BookGenresScreen';
import BookSeriesScreen from './BookSeriesScreen';
import BookTitlesScreen from './BookTitlesScreen';
import {OVERVIEW, ROOT_SCREEN, backTarget, bookNavFor, navEntries, navKeyFor} from './bookScreens';
import {RAIL_CURRENT_ID, RailWidthContext, STRIP_CURRENT_ID, focusContent, focusControls, focusLanding} from './BookScreenParts';

import css from '../MusicBrowse/MusicScreens.module.less';
import chipsCss from '../MusicBrowse/MusicChips.module.less';
import bookCss from './BookScreens.module.less';
import railCss from './BookstoreRail.module.less';

const SpottableDiv = Spottable('div');
// Coming in from the screen lands on the open entry, and the rail holds focus at its ends.
const RailContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-current="true"]',
	leaveFor: {up: '', down: '', left: ''}
}, 'div');
const ChipsContainer = SpotlightContainerDecorator({enterTo: 'default-element', defaultElement: '[data-current="true"]'}, 'div');

const STRIP_ID = 'book-strip';
const CHIPS_ID = 'book-chips';
// Bookstore's rail width from its stylesheet.
const RAIL_WIDTH = 414;

const SCREENS = {
	titles: BookTitlesScreen,
	series: BookSeriesScreen,
	authors: BookAuthorsScreen,
	genres: BookGenresScreen,
	collections: BookCollectionsScreen,
	favorites: BookFavoritesScreen,
	discover: BookDiscoverScreen
};

const entryIcon = (entry) => (entry.key === OVERVIEW ? <CoreIcon name={entry.icon} /> : <BookIcon name={entry.icon} />);

// A book library screen with the style's own way of moving between them: Bookstore's rail down the
// left, Classic's pill strip or Reading Room's chips over it. The nav stays mounted across a
// switch, so focus stays on it. With no `screen`, Classic and Reading Room show `overview` and
// Bookstore shows All Titles.
const BookCategoryScreen = ({style, screen, library, data, showDiscover, overview, onOpenScreen, ...rest}) => {
	const nav = bookNavFor(style);
	const shown = nav === 'rail' ? screen || ROOT_SCREEN : screen;
	const current = navKeyFor(style, shown);
	const screenId = shown ? shown.id : OVERVIEW;
	const libraryName = library?.Name || $L('Books');
	const entries = useMemo(() => navEntries({style, library, data, showDiscover}), [style, library, data, showDiscover]);
	const back = backTarget(style, shown);

	const handleBack = useMemo(() => {
		if (back === OVERVIEW) return () => onOpenScreen(null);
		return back ? () => onOpenScreen(back) : null;
	}, [back, onOpenScreen]);

	// The chips open with the open entry's chip in view.
	useLayoutEffect(() => {
		const row = document.querySelector(`[data-spotlight-id="${CHIPS_ID}"]`);
		const chip = row?.querySelector('[data-current="true"]');
		if (chip) row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
	}, []);

	const openEntry = useCallback((key) => {
		if (key === current) {
			focusLanding(screenId);
			return;
		}
		const entry = entries.find((option) => option.key === key);
		if (entry) onOpenScreen(entry.screen);
	}, [current, screenId, entries, onOpenScreen]);

	const handleNavItem = useCallback((e) => openEntry(e.currentTarget.dataset.key), [openEntry]);

	// Down from the strip or the chips goes to the screen's own controls, or into it when it has none.
	const handleStripKey = useCallback((e) => handleSectionKey(e, {
		chain: [],
		onDown: () => focusControls(screenId) || focusContent(screenId)
	}), [screenId]);

	const handleRailKey = useCallback((e) => {
		if (e.keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		focusLanding(screenId);
	}, [screenId]);

	const Screen = shown ? SCREENS[shown.id] : null;
	const content = Screen ? (
		<Screen
			key={`${shown.id}-${shown.scope || ''}`}
			screen={shown}
			style={style}
			library={library}
			data={data}
			onBack={handleBack}
			onOpenScreen={onOpenScreen}
			{...rest}
		/>
	) : <div className={bookCss.overview}>{overview}</div>;

	if (nav === 'strip') {
		const tabs = entries.map((entry) => ({id: entry.key, label: entry.label}));
		return (
			<div className={css.page}>
				<div className={css.strip} onKeyDown={handleStripKey}>
					<div className={css.stripName}>{libraryName}</div>
					<MusicTabs pills={tabs} current={current} onOpenGrid={openEntry} spotlightId={STRIP_ID} activeSpotlightId={STRIP_CURRENT_ID} />
				</div>
				{content}
			</div>
		);
	}

	if (nav === 'chips') {
		return (
			<div className={css.page}>
				<ChipsContainer className={css.screenChips} spotlightId={CHIPS_ID} onKeyDown={handleStripKey} onFocus={keepFocusInView}>
					{entries.map((entry) => {
						const isCurrent = entry.key === current;
						return (
							<SpottableDiv
								key={entry.key}
								className={isCurrent ? `${chipsCss.chip} ${css.chipCurrent}` : chipsCss.chip}
								data-key={entry.key}
								data-current={isCurrent}
								spotlightId={isCurrent ? STRIP_CURRENT_ID : undefined}
								onClick={handleNavItem}
							>
								{entryIcon(entry)}
								<span className={chipsCss.chipLabel}>{entry.label}</span>
							</SpottableDiv>
						);
					})}
				</ChipsContainer>
				{content}
			</div>
		);
	}

	let section = null;
	return (
		<RailWidthContext.Provider value={RAIL_WIDTH}>
			<div className={railCss.page}>
				<RailContainer className={railCss.rail} spotlightId="book-rail" onKeyDown={handleRailKey} onFocus={keepFocusInView}>
					<div className={railCss.railTitle}>{libraryName}</div>
					<div className={railCss.railSubtitle}>{titlesLabel(data.counts.all)}</div>
					{entries.map((entry) => {
						const isCurrent = entry.key === current;
						let heading = null;
						if (entry.section !== section) {
							section = entry.section;
							heading = (
								<div key={`heading-${section}`} className={railCss.railHeader}>
									{section === 'titles' && $L('Titles')}
									{section === 'browse' && $L('Browse')}
								</div>
							);
						}
						return [
							heading,
							<SpottableDiv
								key={entry.key}
								className={isCurrent ? `${railCss.railRow} ${railCss.railSelected}` : railCss.railRow}
								data-key={entry.key}
								data-current={isCurrent}
								spotlightId={isCurrent ? RAIL_CURRENT_ID : `book-rail-${entry.key}`}
								onClick={handleNavItem}
							>
								<BookIcon name={entry.icon} />
								<span className={railCss.railLabel}>{entry.label}</span>
								{entry.count != null && (
									<span className={railCss.railCount}>
										{entry.count}{entry.key === 'collections' && data.collectionsIsFloor ? '+' : ''}
									</span>
								)}
							</SpottableDiv>
						];
					})}
				</RailContainer>
				<div className={css.screen}>{content}</div>
			</div>
		</RailWidthContext.Provider>
	);
};

export default BookCategoryScreen;
