import {Fragment, createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaCard from '../../components/MediaCard';
import {KEYS} from '../../utils/keys';
import {rootScale} from '../../utils/rootScale';
import {CORE_ICON_PATHS} from '../Settings/settingsCoreIcons';
import {hasNeighbor} from './musicLibrary';
import {PLAYLIST_FIELDS, filterAudioPlaylists} from './useMusicBrowseRows';
import {PAGE_SIZE, gridMove, rowIndexOf} from './musicScreens';

import css from './MusicScreens.module.less';

const FOCUS_ATTEMPTS = 6;
const PLAY_FIELDS = 'MediaSources,MediaStreams';

// The pill strip over a category screen, and the pill or Classic chip of the screen that's open,
// which is the one highlighted whenever focus is elsewhere.
export const STRIP_ID = 'music-screen-tabs';
export const STRIP_CURRENT_ID = 'music-screen-tab-current';
export const focusStrip = () => Spotlight.focus(STRIP_CURRENT_ID);

// Quick Access's side rail beside a category screen, and its row for the screen that's open.
// Focusing it does nothing in the other styles, which have no rail.
export const RAIL_ID = 'music-screen-rail';
export const RAIL_CURRENT_ID = 'music-screen-rail-current';
export const focusRail = () => Spotlight.focus(RAIL_CURRENT_ID);

// How much of the width the rail takes, which the card grids leave out of their columns.
export const RailWidthContext = createContext(0);

// Each screen's header holds its own controls, under an id of its own so swapping screens
// never hands one screen's container id to the next.
export const headerSpotlightId = (screenId) => `music-screen-header-${screenId}`;
const HeaderContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const FIRST_ITEM_IDS = {
	artists: 'music-artist-0',
	albums: 'music-album-0',
	songs: 'music-mix-0',
	playlists: 'music-playlist-0',
	genres: 'music-station-0',
	favorites: 'music-favorite-0'
};

const hasControls = (screenId) => Boolean(document.querySelector(`[data-spotlight-id="${headerSpotlightId(screenId)}"] .spottable`));
export const focusControls = (screenId) => hasControls(screenId) && Spotlight.focus(headerSpotlightId(screenId));
export const focusContent = (screenId) => Spotlight.focus(FIRST_ITEM_IDS[screenId]);

// Up from anything level with the content's first item goes back the way Down came in, to the
// header's controls, or to the strip when the screen has none.
export const contentKeyHandler = (screenId) => (e) => {
	if (e.keyCode !== KEYS.UP) return;
	const first = document.querySelector(`[data-spotlight-id="${FIRST_ITEM_IDS[screenId]}"]`);
	if (!first || e.target.getBoundingClientRect().top >= first.getBoundingClientRect().bottom) return;
	e.preventDefault();
	e.stopPropagation();
	if (!focusControls(screenId)) focusStrip();
};

export const CoreIcon = ({name, className}) => (
	<svg viewBox="0 0 24 24" className={className}><path d={CORE_ICON_PATHS[name]} /></svg>
);

const focusLost = () => {
	const active = document.activeElement;
	return !active || active === document.body || !active.classList?.contains('spottable');
};

// Tries each target in turn, a frame at a time, since what was just rendered may not be
// registered with Spotlight yet. Returns a cancel.
export const focusSoon = (targets, onlyIfLost = false) => {
	const list = [].concat(targets).filter(Boolean);
	let attempts = 0;
	let frame = null;
	const tryFocus = () => {
		frame = null;
		if (onlyIfLost && !focusLost()) return;
		if (list.some((target) => Spotlight.focus(target))) return;
		attempts += 1;
		if (attempts < FOCUS_ATTEMPTS) frame = window.requestAnimationFrame(tryFocus);
	};
	frame = window.requestAnimationFrame(tryFocus);
	return () => { if (frame) window.cancelAnimationFrame(frame); };
};

// Where a screen lands: its first item, or where Up from the content goes when it's empty, which
// is the header's controls and then the open category's pill, chip or rail row.
export const landingTargets = (screenId) => [
	FIRST_ITEM_IDS[screenId],
	hasControls(screenId) && headerSpotlightId(screenId),
	STRIP_CURRENT_ID,
	RAIL_CURRENT_ID
];

// Lands focus once the screen has loaded and focus is nowhere: as it opens from the library home,
// and after a reload pulls the focused item away. A screen switched to from the pill strip opens
// with focus still on the strip, so it stays.
export const useScreenFocus = (screenId, ready) => {
	useEffect(() => {
		if (!ready || !focusLost()) return undefined;
		return focusSoon(landingTargets(screenId), true);
	});
};

// The screen holds the one back slot while it's up. `localBack` closes whatever the screen has
// open and says so, and otherwise Back leaves the screen.
export const useScreenBack = (backHandlerRef, onBack, localBack) => {
	const latestRef = useRef(null);
	latestRef.current = {onBack, localBack};
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (latestRef.current.localBack?.()) return true;
			latestRef.current.onBack?.();
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef]);
};

const EMPTY_PAGES = {items: [], total: 0, next: 0, loaded: false, source: null};

// Pages a list in from `fetchPage(startIndex, limit)`, which resolves to {items, total}, and starts
// over whenever `fetchPage` changes. A null `fetchPage` loads nothing. Pages are tagged with the
// query they came from, so a new query never shows the last one's items while it loads.
export const usePagedItems = (fetchPage) => {
	const [stored, setPages] = useState(EMPTY_PAGES);
	const pages = fetchPage && stored.source === fetchPage ? stored : EMPTY_PAGES;
	const pagesRef = useRef(pages);
	pagesRef.current = pages;
	const busyRef = useRef(false);
	const generationRef = useRef(0);

	const loadPage = useCallback((start, generation) => {
		busyRef.current = true;
		fetchPage(start, PAGE_SIZE)
			.then(({items, total}) => {
				if (generation !== generationRef.current) return;
				setPages((prev) => ({
					items: start > 0 && prev.source === fetchPage ? prev.items.concat(items) : items,
					total,
					next: start + PAGE_SIZE,
					loaded: true,
					source: fetchPage
				}));
			})
			.catch(() => {
				// A page that fails ends the list where it got to.
				if (generation !== generationRef.current) return;
				setPages((prev) => (prev.source === fetchPage
					? {...prev, next: prev.total, loaded: true}
					: {...EMPTY_PAGES, loaded: true, source: fetchPage}));
			})
			.then(() => {
				if (generation === generationRef.current) busyRef.current = false;
			});
	}, [fetchPage]);

	useEffect(() => {
		const generation = ++generationRef.current;
		busyRef.current = false;
		if (fetchPage) loadPage(0, generation);
	}, [fetchPage, loadPage]);

	const loadMore = useCallback(() => {
		const current = pagesRef.current;
		if (busyRef.current || !current.loaded || current.next >= current.total) return;
		loadPage(current.next, generationRef.current);
	}, [loadPage]);

	return {
		items: pages.items,
		total: pages.total,
		loaded: pages.loaded,
		complete: pages.loaded && pages.next >= pages.total,
		loadMore
	};
};

export const toPage = (res, map) => {
	const items = res?.Items || [];
	return {items: map ? items.map(map) : items, total: res?.TotalRecordCount ?? items.length};
};

// The library's audio playlists a page at a time, the way the Playlists row finds them.
export const fetchAudioPlaylists = (api, extra) => (start, limit) => api.getItems({
	Recursive: true,
	IncludeItemTypes: 'Playlist',
	Fields: `${PLAYLIST_FIELDS},CumulativeRunTimeTicks`,
	SortBy: 'SortName',
	SortOrder: 'Ascending',
	...extra,
	StartIndex: start,
	Limit: limit
}).then(async (res) => ({items: await filterAudioPlaylists(api, res?.Items || []), total: res?.TotalRecordCount || 0}));

export const playTracks = (onPlay, tracks, start = 0) => {
	if (tracks[start]) onPlay?.(tracks[start], false, {audioPlaylist: tracks});
};

// Runs a song query and plays what comes back, put in `order`. Nothing plays when it comes back empty.
export const playQuery = async (api, onPlay, params, order) => {
	const res = await api.getItems({...params, Fields: PLAY_FIELDS}).catch(() => null);
	const tracks = res?.Items || [];
	playTracks(onPlay, order ? order(tracks) : tracks);
};

// The index a grid item's spotlight id carries, or -1 for anything else.
export const indexFromId = (element, prefix) => {
	const id = element?.dataset?.spotlightId;
	if (!id || id.indexOf(`${prefix}-`) !== 0) return -1;
	const index = parseInt(id.slice(prefix.length + 1), 10);
	return index >= 0 ? index : -1;
};

const DIRECTIONS = {[KEYS.UP]: 'up', [KEYS.DOWN]: 'down', [KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right'};

// The arrows over a grid laid out as `rows`, worked out from the item's index rather than by
// Spotlight measuring every card on the page. `onKey(direction, row, index)` goes first and
// returns true when it moved focus itself. Up off the top row is left to `contentKeyHandler`,
// Left off the first column goes to the side rail when there is one, and every other edge holds.
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

// The side of a square card when `columns` of them fill the width left over by `insets` and the
// rail, in the design px the stylesheets use and as the screen px size a MediaCard takes.
export const useCardSize = (columns, insets, gap) => {
	const railWidth = useContext(RailWidthContext);
	return useMemo(() => {
		const scale = rootScale();
		const side = Math.floor((window.innerWidth / scale - railWidth - insets - gap * (columns - 1)) / columns);
		const px = Math.floor(side * scale);
		return {side, size: {width: px, height: px}};
	}, [columns, insets, gap, railWidth]);
};

// Off the header's edges, Up goes back to the strip, onto the screen's own pill, and Down goes into
// the content at its first item rather than whatever lies under the control. Left goes to the side
// rail when there is one, and Right holds, so neither slips into the strip or the content.
const handleHeaderKey = (e, screenId) => {
	const direction = DIRECTIONS[e.keyCode];
	if (!direction) return;
	const others = Array.prototype.filter.call(e.currentTarget.querySelectorAll('.spottable'), (el) => el !== e.target);
	if (hasNeighbor(e.target.getBoundingClientRect(), others.map((el) => el.getBoundingClientRect()), direction)) return;
	e.preventDefault();
	e.stopPropagation();
	if (direction === 'up') focusStrip();
	else if (direction === 'down') focusContent(screenId);
	else if (direction === 'left') focusRail();
};

// The screen's title and count, with the screen's controls at the right.
export const ScreenHeader = ({screenId, title, count, titleExtra, flush, children}) => {
	const handleKeyDown = useCallback((e) => handleHeaderKey(e, screenId), [screenId]);
	return (
		<HeaderContainer
			className={flush ? `${css.header} ${css.headerFlush}` : css.header}
			spotlightId={headerSpotlightId(screenId)}
			onKeyDown={handleKeyDown}
		>
			<div className={css.heading}>
				<div className={titleExtra ? `${css.titleLine} ${css.titleLineCentered}` : css.titleLine}>
					<h1 className={css.title}>{title}</h1>
					{count ? <span className={css.count}>{count}</span> : null}
					{titleExtra ? <div className={css.titleExtra}>{titleExtra}</div> : null}
				</div>
			</div>
			{children ? <div className={css.controls}>{children}</div> : null}
		</HeaderContainer>
	);
};

// Cards in `rows`, with a letter heading over each row that starts a section and `afterRow(row)`
// under any row that has something there. Each card's spotlight id is `${idPrefix}-${index}`.
export const MusicCardGrid = memo(({items, rows, idPrefix, cardType, size, serverUrl, onSelect, afterRow}) => (
	<>
		{rows.map((row, r) => (
			<Fragment key={row.start}>
				{row.heading && <div className={css.letter} data-heading-row={r}>{row.section}</div>}
				<div className={css.cardRow}>
					{items.slice(row.start, row.end).map((item, i) => (
						<MediaCard
							key={item.Id}
							item={item}
							serverUrl={serverUrl}
							cardType={cardType}
							size={size}
							onSelect={onSelect}
							spotlightId={`${idPrefix}-${row.start + i}`}
						/>
					))}
				</div>
				{afterRow ? afterRow(r) : null}
			</Fragment>
		))}
	</>
));
