import {createContext, useCallback, useContext, useEffect, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {keepFocusInView} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {rootScale} from '../../utils/rootScale';
import {hasNeighbor} from '../MusicBrowse/musicLibrary';
import {focusSoon} from '../MusicBrowse/MusicScreenParts';
import {gridMove, rowIndexOf} from '../MusicBrowse/musicScreens';
import BookCard from './BookCard';

import css from '../MusicBrowse/MusicScreens.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
// Coming back to a shelf lands on the card it was left on.
export const ShelfContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');
const HeaderContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// Classic's pill or Reading Room's chip for the open screen, and Bookstore's rail row for it.
// Focusing the one a style doesn't have does nothing.
export const STRIP_CURRENT_ID = 'book-strip-current';
export const RAIL_CURRENT_ID = 'book-rail-current';
export const focusStrip = () => Spotlight.focus(STRIP_CURRENT_ID);
export const focusRail = () => Spotlight.focus(RAIL_CURRENT_ID);

// How much of the width Bookstore's rail takes, which the grids leave out of their columns.
export const RailWidthContext = createContext(0);

// Each screen's header gets an id of its own so a switch never hands one screen's container to
// the next.
export const headerSpotlightId = (screenId) => `book-screen-header-${screenId}`;

// The first item under each screen's header, in the order they're tried.
const FIRST_ITEM_IDS = {
	titles: ['book-title-0'],
	series: ['book-series-0-0'],
	authors: ['book-author-0'],
	genres: ['book-station-0'],
	collections: ['book-collection-0'],
	favorites: ['book-favgrid-0', 'book-fav-0-0'],
	discover: ['book-discover-hero', 'book-discover-0-0', 'book-discover-result-0'],
	overview: ['book-hero-cta', 'book-scope', 'book-row-0', 'rr-search']
};

const firstItemIds = (screenId) => FIRST_ITEM_IDS[screenId] || [];
const firstItem = (screenId) => firstItemIds(screenId).map((id) => document.querySelector(`[data-spotlight-id="${id}"]`)).find(Boolean);

const hasControls = (screenId) => Boolean(document.querySelector(`[data-spotlight-id="${headerSpotlightId(screenId)}"] .spottable`));
export const focusControls = (screenId) => hasControls(screenId) && Spotlight.focus(headerSpotlightId(screenId));
export const focusContent = (screenId) => firstItemIds(screenId).some((id) => Spotlight.focus(id));

// Up from anything level with the content's first item goes back the way Down came in, to the
// header's controls, or to the strip when the screen has none.
export const contentKeyHandler = (screenId) => (e) => {
	if (e.keyCode !== KEYS.UP) return;
	const first = firstItem(screenId);
	if (!first || e.target.getBoundingClientRect().top >= first.getBoundingClientRect().bottom) return;
	e.preventDefault();
	e.stopPropagation();
	if (!focusControls(screenId)) focusStrip();
};

const focusLost = () => {
	const active = document.activeElement;
	return !active || active === document.body || !active.classList?.contains('spottable');
};

// Bookstore's titles open on what's being read, above their header.
const LANDING_IDS = {titles: ['book-continue']};

export const landingTargets = (screenId) => [
	...(LANDING_IDS[screenId] || []),
	...firstItemIds(screenId),
	hasControls(screenId) && headerSpotlightId(screenId),
	STRIP_CURRENT_ID,
	RAIL_CURRENT_ID
];

// Where Right from the rail goes: what's at the top of the screen.
export const focusLanding = (screenId) => landingTargets(screenId).some((id) => id && Spotlight.focus(id));

// Lands focus once the screen has loaded and focus is nowhere. A screen switched to from the nav
// opens with focus still on the nav, so it stays there.
export const useScreenFocus = (screenId, ready) => {
	useEffect(() => {
		if (!ready || !focusLost()) return undefined;
		return focusSoon(landingTargets(screenId), true);
	});
};

// The screen holds the one back slot while it's up. `localBack` closes whatever the screen has
// open and says so. Otherwise Back goes to `onBack`, or leaves the library when there's none.
export const useScreenBack = (backHandlerRef, onBack, localBack) => {
	const latestRef = useRef(null);
	latestRef.current = {onBack, localBack};
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (latestRef.current.localBack?.()) return true;
			if (!latestRef.current.onBack) return false;
			latestRef.current.onBack();
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef]);
};

const DIRECTIONS = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

// Off the header's edges, Up goes to the strip, Down goes to the content's first item rather than
// whatever lies under the control, Left goes to Bookstore's rail and Right holds. `onUp` takes Up
// first, for a screen with something between the header and the nav.
const handleHeaderKey = (e, screenId, onUp) => {
	const direction = DIRECTIONS[e.keyCode];
	if (!direction) return;
	const others = Array.prototype.filter.call(e.currentTarget.querySelectorAll('.spottable'), (el) => el !== e.target);
	if (hasNeighbor(e.target.getBoundingClientRect(), others.map((el) => el.getBoundingClientRect()), direction)) return;
	e.preventDefault();
	e.stopPropagation();
	if (direction === 'up') {
		if (!onUp?.()) focusStrip();
	} else if (direction === 'down') focusContent(screenId);
	else if (direction === 'left') focusRail();
};

export const ScreenHeader = ({screenId, title, count, onUp, children, below}) => {
	const handleKeyDown = useCallback((e) => handleHeaderKey(e, screenId, onUp), [screenId, onUp]);
	return (
		<HeaderContainer className={bookCss.header} spotlightId={headerSpotlightId(screenId)} onKeyDown={handleKeyDown}>
			<div className={bookCss.headerTop}>
				<div className={css.heading}>
					<div className={css.titleLine}>
						<h1 className={css.title}>{title}</h1>
						{count ? <span className={css.count}>{count}</span> : null}
					</div>
				</div>
				{children ? <div className={css.controls}>{children}</div> : null}
			</div>
			{below}
		</HeaderContainer>
	);
};

export const EmptyNote = () => <div className={css.empty}>{$L('No items found')}</div>;

// The arrows over a grid laid out as `rows`, worked out from the index rather than by Spotlight
// measuring every card. `onKey(direction, row, index)` goes first and returns true when it moved
// focus. Up off the top row is left to `contentKeyHandler`, Left off the first column goes to the
// rail when there is one, and every other edge holds.
export const handleGridKey = (e, {rows, index, focusIndex, onKey}) => {
	const direction = DIRECTIONS[e.keyCode];
	if (!direction || index < 0) return;
	const row = rowIndexOf(rows, index);
	if (row < 0) return;
	const handled = Boolean(onKey?.(direction, row, index));
	const next = handled ? null : gridMove(rows, row, index, direction);
	if (!handled && next == null && direction === 'up') return;
	e.preventDefault();
	e.stopPropagation();
	if (next != null) focusIndex(next);
	else if (!handled && direction === 'left') focusRail();
};

// The width a screen's content has on the 1920 canvas, inside its side insets and beside the rail.
const SIDE_INSETS = 120;
const roomFor = (railWidth) => window.innerWidth / rootScale() - railWidth - SIDE_INSETS;
export const useRoom = () => roomFor(useContext(RailWidthContext));

// How many cards of about `target` px fit across what's left of the 1920 canvas after `insets`
// and the rail, and how wide each one is, in the design px the stylesheets use and as the screen
// px a card takes.
export const useColumns = (target, insets, gap) => {
	const railWidth = useContext(RailWidthContext);
	return useMemo(() => {
		const scale = rootScale();
		const room = roomFor(railWidth) + SIDE_INSETS - insets;
		const columns = Math.max(2, Math.floor((room + gap) / (target + gap)));
		const width = Math.floor((room - gap * (columns - 1)) / columns);
		return {columns, width, px: Math.floor(width * scale)};
	}, [target, insets, gap, railWidth]);
};

export const screenPx = (px) => Math.round(px * rootScale());

// A shelf of book cards that scrolls sideways, each card's spotlight id `${idPrefix}-${index}`.
// `cardProps(item, index)` adds what a card needs beyond the item.
export const BookShelf = ({items, idPrefix, width, serverUrl, onSelect, onKeyDown, onFocus, cardProps, className}) => {
	const handleFocus = useCallback((e) => {
		keepFocusInView(e);
		onFocus?.(e);
	}, [onFocus]);
	return (
		<ShelfContainer className={className || bookCss.shelf} onKeyDown={onKeyDown} onFocus={handleFocus}>
			{items.map((item, index) => (
				<BookCard
					key={item.Id}
					item={item}
					width={width}
					serverUrl={serverUrl}
					spotlightId={`${idPrefix}-${index}`}
					onSelect={onSelect}
					{...cardProps?.(item, index)}
				/>
			))}
		</ShelfContainer>
	);
};

// Spottable leaves a hidden marker after each card, so only the cards themselves count.
export const spottableChildren = (row) => Array.prototype.filter.call(row.children, (child) => child.classList.contains('spottable'));

// Left off a row's first card goes to the rail, or holds where there's none, and Right off its last
// holds, so neither wanders into the sidebar or the next section. True when it took the key.
export const rowEdgeKey = (e, onLeft = focusRail) => {
	const left = e.keyCode === KEYS.LEFT;
	if (!left && e.keyCode !== KEYS.RIGHT) return false;
	const cards = spottableChildren(e.currentTarget);
	const index = cards.indexOf(e.target);
	if (index < 0 || (left ? index > 0 : index < cards.length - 1)) return false;
	e.preventDefault();
	e.stopPropagation();
	if (left) onLeft();
	return true;
};

export const SeeAllButton = ({onClick, spotlightId, ...rest}) => (
	<SpottableDiv {...rest} className={`${css.pill} ${bookCss.smallPill}`} spotlightId={spotlightId} onClick={onClick}>
		{$L('See All')}
	</SpottableDiv>
);

export const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2)
	.map((part) => Array.from(part)[0].toUpperCase()).join('');
