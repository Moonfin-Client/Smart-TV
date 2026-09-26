import {useState, useEffect, useCallback, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import {formatClockTime, formatDayLabel} from '../../utils/clock';
import {KEYS} from '../../utils/keys';
import {pointerHover} from '../../utils/focusScroll';
import {rem, rootScale} from '../../utils/rootScale';
import {createLiveTvGuideStore} from '../../services/liveTvGuideStore';
import {getLiveTvLastChannelId, loadLiveTvLastChannel} from '../../services/liveTvLastChannel';
import {
	CELL_KINDS, CHANNEL_SORTS, GUIDE_FILTERS, TV_CANVAS_SCALE, artworkSource, buildRowCells, categoryTags,
	clampAnchorInto, episodeLine, episodeTitleOf, filterLabel, floorToHalfHour, genreFor, guideWindowFor,
	guideLeftEdge, hasSeriesTimer, hasTimer, isLiveAt, programAiringAt, programEnd, programStart, progressAt,
	reanchorSelection, resolveCellIndexAt, seasonEpisodeLabel
} from '../../utils/liveTvGuide';
import {ChannelCell, ProgramCell} from './GuideCells';
import {GUIDE_ICONS, GuideIcon} from './GuideIcons';
import GuideHero from './GuideHero';

import css from './LiveTV.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const FilterRailContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const WindowBarContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
// Rows aren't spotlight containers. Every arrow key inside the grid is resolved by the guide
// itself against the selection's time, so nothing is left for geometry to decide.
// overflow makes Spotlight focus cells without the browser scrolling them into view. The guide
// scrolls the grid itself, and a second scroll from focus would redraw rows twice per press.
const ProgramGridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first', overflow: true}, 'div');
// self-only on its own still lets a press at the edge reach the guide behind the scrim, so every
// direction is closed off as well.
const PopupContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div');

const MINUTE = 60000;
const HALF_HOUR = 30 * MINUTE;

// Match the stylesheet.
const ROW_HEIGHT = 87;
const CHANNEL_COLUMN_WIDTH = 296;
// The page's side padding and the divider beside the channel column.
const GRID_CHROME_WIDTH = 70 + 1;

// The standalone guide on the television canvas, less the page's padding, measured against the
// screen as the UI scale leaves it.
const measureGuideLayout = () => {
	const width = window.innerWidth / rootScale();
	const windowMs = guideWindowFor(width / TV_CANVAS_SCALE - 48);
	const gridWidth = width - GRID_CHROME_WIDTH - CHANNEL_COLUMN_WIDTH;
	return {windowMs, gridWidth, pxPerMs: gridWidth / windowMs};
};

const OVERSCAN_ROWS = 4;
const VISIBLE_ROWS = 9;
// Start fetching the next batch this many rows before the loaded edge, so rows are usually
// filled by the time they're on screen.
const PROGRAM_PREFETCH_ROWS = 12;
const ARTWORK_PREFETCH_ROW_MARGIN = 5;
// How far back the earlier button pages. Most guide sources keep little history.
const MAX_GUIDE_HISTORY_MS = 24 * 60 * MINUTE;
// A re-anchor waits this long after the last press, so the window never moves under the viewer.
const REANCHOR_INPUT_QUIET_MS = 1000;

const WINDOW_BAR_PREVIOUS = 0;
const WINDOW_BAR_LAST = 5;

// Fast forward and rewind, and the track and page keys a remote may carry, page the rows.
const PAGE_FORWARD_KEYS = [KEYS.FAST_FORWARD || 417, 425, 10233, 34];
const PAGE_BACK_KEYS = [KEYS.REWIND || 412, 424, 10232, 33];
const pageDirection = (keyCode) => {
	if (PAGE_FORWARD_KEYS.indexOf(keyCode) >= 0) return 1;
	if (PAGE_BACK_KEYS.indexOf(keyCode) >= 0) return -1;
	return 0;
};

const SORT_LABELS = {number: 'Channel Number', name: 'Name', favoritesFirst: 'Favorites First'};
const normalizeSort = (value) => (CHANNEL_SORTS.indexOf(value) >= 0 ? value : 'number');

const channelSpotlightId = (channelId) => `guide-ch-${channelId}`;
const cellSpotlightId = (channelId, index) => `guide-cell-${channelId}-${index}`;
const barSpotlightId = (index) => `guide-bar-${index}`;
const chipSpotlightId = (index) => `guide-chip-${index}`;

const isLoadingCells = (cells) => cells.length === 1 && cells[0].kind === CELL_KINDS.loading;

// The element may not be on screen for a frame or two after the rows it lives in are scrolled
// to, so this keeps asking until it's there. A deferred request waits a frame first, for focus
// asked for right after the guide changed, before the rows have redrawn.
const focusWhenMounted = (spotlightId, {attempts = 12, defer = false} = {}) => {
	const tryFocus = (left) => {
		const node = document.querySelector(`[data-spotlight-id="${spotlightId}"]`);
		if (node) {
			Spotlight.focus(node);
		} else if (left > 0) {
			window.requestAnimationFrame(() => tryFocus(left - 1));
		}
	};
	if (defer) window.requestAnimationFrame(() => tryFocus(attempts));
	else tryFocus(attempts);
};

// One animation per scroller. A held key would otherwise stack loops that all write the offset
// each frame, and a leftover one would undo a jump set straight after it.
const scrollFrames = new WeakMap();

const stopScrollAnimation = (node) => {
	window.cancelAnimationFrame(scrollFrames.get(node));
	scrollFrames.delete(node);
};

const animateScrollTop = (node, target, duration) => {
	stopScrollAnimation(node);
	const from = node.scrollTop;
	const distance = target - from;
	if (!distance) return;
	const started = Date.now();
	const step = () => {
		const t = Math.min(1, (Date.now() - started) / duration);
		node.scrollTop = from + distance * (1 - Math.pow(1 - t, 3));
		if (t < 1) scrollFrames.set(node, window.requestAnimationFrame(step));
		else scrollFrames.delete(node);
	};
	scrollFrames.set(node, window.requestAnimationFrame(step));
};

// The same span the other clients' date picker offers, a week back through two weeks out.
const buildDateOptions = () => {
	const options = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	for (let i = -7; i <= 14; i++) options.push(new Date(today.getTime() + i * 86400000));
	return options;
};

const createEmitter = () => {
	const listeners = new Set();
	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: () => listeners.forEach((listener) => listener())
	};
};

// One channel's timeline. It hands every focus, key and press back to the screen along with
// where it happened, since the selection that decides vertical movement lives there.
const GuideRow = memo(({channel, rowIndex, cells, windowStart, now, layout, logoUrl, onFocusChannel, onKeyDownChannel, onSelectChannel, onFocusCell, onKeyDownCell, onSelectCell}) => {
	const handleFocusCell = useCallback((cell) => onFocusCell(rowIndex, channel.Id, cell), [rowIndex, channel.Id, onFocusCell]);
	const handleKeyDownCell = useCallback((e, cell) => onKeyDownCell(e, rowIndex, channel.Id, cell, cells), [rowIndex, channel.Id, cells, onKeyDownCell]);
	const handleSelectCell = useCallback((cell) => onSelectCell(rowIndex, channel.Id, cell), [rowIndex, channel.Id, onSelectCell]);
	const cellTags = useMemo(
		() => cells.map((cell) => (cell.program ? categoryTags(cell.program).map((key) => $L(filterLabel(key))) : [])),
		[cells]
	);

	return (
		<div className={css.guideRow} data-channel-id={channel.Id}>
			<ChannelCell
				channel={channel}
				index={rowIndex}
				logoUrl={logoUrl}
				spotlightId={channelSpotlightId(channel.Id)}
				onFocusChannel={onFocusChannel}
				onKeyDownChannel={onKeyDownChannel}
				onSelectChannel={onSelectChannel}
			/>
			<div className={css.columnDivider} />
			<div className={css.programsArea} style={{width: rem(layout.gridWidth)}}>
				{cells.map((cell, index) => {
					const program = cell.program;
					const live = program ? isLiveAt(program, now) : false;
					return (
						<ProgramCell
							key={`${cell.kind}-${cell.start}`}
							cell={cell}
							left={(cell.start - windowStart) * layout.pxPerMs}
							width={(cell.end - cell.start) * layout.pxPerMs}
							spotlightId={cellSpotlightId(channel.Id, index)}
							genre={program ? genreFor(program) : null}
							rating={program?.OfficialRating || null}
							tags={cellTags[index]}
							isLive={live}
							isPast={program ? programEnd(program) < now : false}
							progress={live ? progressAt(program, now) : 0}
							hasTimer={program ? hasTimer(program) : false}
							startsBeforeWindow={program ? programStart(program) < windowStart : false}
							noProgramLabel={$L('No program data')}
							onFocusCell={handleFocusCell}
							onKeyDownCell={handleKeyDownCell}
							onSelectCell={handleSelectCell}
						/>
					);
				})}
			</div>
		</div>
	);
});

// Previews the focused program, or what the focused channel is airing now. It redraws on its
// own as focus moves, so the grid doesn't.
const GuideHeroHost = ({store, emitter, focusRef, serverUrl, clockDisplay, version}) => {
	const [tick, setTick] = useState(0);
	useEffect(() => emitter.subscribe(() => setTick((t) => t + 1)), [emitter]);
	useEffect(() => store.subscribeArtwork(() => setTick((t) => t + 1)), [store]);

	const {program, railFocused, channelId} = focusRef.current;
	const channel = !railFocused && program ? store.channelForId(program.ChannelId) : (channelId ? store.channelForId(channelId) : null);
	const now = Date.now();
	const preview = program || (channel ? programAiringAt(store.programsForChannel(channel.Id), now) : null);
	const previewId = preview?.Id || null;

	// The bulk fetch carries no artwork, so the focused program's is looked up on its own once
	// focus settles on it.
	useEffect(() => {
		if (!preview || artworkSource(preview) || store.hasArtworkResult(preview.Id)) return undefined;
		const timer = setTimeout(() => {
			store.artworkSourceFor(preview).then((result) => {
				if (result) setTick((t) => t + 1);
			});
		}, 500);
		return () => clearTimeout(timer);
	}, [previewId]); // eslint-disable-line react-hooks/exhaustive-deps

	const heroProps = useMemo(() => {
		const logoUrl = channel?.ImageTags?.Primary
			? `${serverUrl}/Items/${channel.Id}/Images/Primary?maxHeight=209&tag=${channel.ImageTags.Primary}`
			: null;
		const artwork = preview ? (artworkSource(preview) || store.cachedArtworkFor(preview.Id)) : null;
		let programImageUrl = null;
		if (artwork) {
			programImageUrl = artwork.isThumb
				? `${serverUrl}/Items/${artwork.itemId}/Images/Thumb?maxWidth=157&tag=${artwork.tag}`
				: `${serverUrl}/Items/${artwork.itemId}/Images/Primary?maxHeight=209&maxWidth=157&tag=${artwork.tag}`;
		}
		const episodeTitle = preview ? episodeTitleOf(preview) : '';
		const episodeSuffix = episodeTitle && episodeTitle !== preview?.Name ? ` - ${episodeTitle}` : '';
		const label = preview ? seasonEpisodeLabel(preview) : null;
		const badgeLabel = preview ? (preview.IsPremiere ? $L('Premiere') : preview.IsRepeat ? $L('Repeat') : null) : null;
		return {
			title: channel?.Name || preview?.Name || $L('Guide Timeline'),
			programTitle: channel ? preview?.Name || null : null,
			programSubtitle: `${episodeSuffix}${label ? ` (${label})` : ''}`,
			channelLogoUrl: logoUrl,
			programImageUrl,
			timeLabel: preview
				? `${formatClockTime(new Date(programStart(preview)), clockDisplay)} - ${formatClockTime(new Date(programEnd(preview)), clockDisplay)}`
				: null,
			genreLabel: preview ? genreFor(preview)?.label || null : null,
			officialRating: preview?.OfficialRating || null,
			communityRating: preview?.CommunityRating ?? null,
			badgeLabel,
			synopsis: preview?.Overview || null,
			isLive: preview ? isLiveAt(preview, now) : false
		};
	}, [tick, version, clockDisplay, serverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

	return <GuideHero {...heroProps} />;
};

const LiveTV = ({onPlayChannel, onRecordings, backHandlerRef}) => {
	const {api, serverUrl} = useAuth();
	const {settings, updateSetting} = useSettings();
	const clockDisplay = settings.clockDisplay;

	const storeRef = useRef(null);
	if (!storeRef.current) {
		storeRef.current = createLiveTvGuideStore(api, {sortBy: normalizeSort(settings.liveTvChannelSortBy)});
	}
	const store = storeRef.current;
	const emitter = useMemo(() => createEmitter(), []);
	const layout = useMemo(measureGuideLayout, []);

	const [version, setVersion] = useState(0);
	const [scrollRow, setScrollRow] = useState(0);
	const [dialog, setDialog] = useState(null);
	const [toast, setToast] = useState(null);
	const [channelNumberBuffer, setChannelNumberBuffer] = useState('');
	const [clockNow, setClockNow] = useState(() => Date.now());
	const [measuredRowHeight, setMeasuredRowHeight] = useState(0);

	const pageRef = useRef(null);
	const gridRef = useRef(null);
	const rowHeightRef = useRef(ROW_HEIGHT);
	const cellsCacheRef = useRef({version: -1, byChannel: new Map()});
	const filterRailRef = useRef(null);
	const selectionRef = useRef(null);
	const pendingMoveRef = useRef(null);
	const lastDpadRef = useRef(0);
	const lastWindowBarIndexRef = useRef(WINDOW_BAR_PREVIOUS);
	const lastFocusedRowRef = useRef(null);
	const focusRef = useRef({railFocused: false, channelId: null, program: null, area: null});
	const didRestoreFocusRef = useRef(false);
	const resettingRef = useRef(false);
	const actionBusyRef = useRef(false);
	const dialogRef = useRef(dialog);
	dialogRef.current = dialog;
	const prevStateRef = useRef(store.state);
	const prevLineupRef = useRef('');
	const channelNumberTimeoutRef = useRef(null);
	const artworkScrollTimerRef = useRef(null);

	const channels = store.filteredChannels;
	const channelsRef = useRef(channels);
	channelsRef.current = channels;
	const windowStart = store.windowStart;
	const windowEnd = store.windowEnd;

	const cellsFor = useCallback((channelId) => buildRowCells({
		visible: store.programsForChannel(channelId),
		unfiltered: store.unfilteredProgramsForChannel(channelId),
		windowStart: store.windowStart,
		windowEnd: store.windowEnd,
		loaded: store.hasProgramsFor(channelId)
	}), [store]);

	// The rows drawn this render reuse their cells until the guide changes, so a scroll only
	// redraws the rows that came into view.
	const renderedCellsFor = (channelId) => {
		const cache = cellsCacheRef.current;
		if (cache.version !== version) {
			cache.version = version;
			cache.byChannel = new Map();
		}
		let cells = cache.byChannel.get(channelId);
		if (!cells) {
			cells = cellsFor(channelId);
			cache.byChannel.set(channelId, cells);
		}
		return cells;
	};

	// ------------------------------------------------------------------------------------------
	// Loading
	// ------------------------------------------------------------------------------------------

	useEffect(() => {
		const unsubscribe = store.subscribe(() => setVersion((v) => v + 1));
		loadLiveTvLastChannel();
		store.load({window: layout.windowMs, windowStart: guideLeftEdge(Date.now()), livePosition: true});
		return () => {
			unsubscribe();
			store.dispose();
		};
	}, [layout, store]);

	// A sort synced in from another device takes effect here too.
	useEffect(() => {
		store.setSortBy(normalizeSort(settings.liveTvChannelSortBy));
	}, [settings.liveTvChannelSortBy, store]);

	// A clock the cells read their live and ended state from.
	useEffect(() => {
		const timer = setInterval(() => setClockNow(Date.now()), 15000);
		return () => clearInterval(timer);
	}, []);

	// The stylesheet's row height comes back from the build in rem, so the pixels the scroll math
	// needs are read off a rendered row rather than assumed.
	useEffect(() => {
		const row = gridRef.current?.querySelector('[data-channel-id]');
		if (row && row.offsetHeight && row.offsetHeight !== measuredRowHeight) {
			setMeasuredRowHeight(row.offsetHeight);
		}
	}, [measuredRowHeight, version, scrollRow]);
	rowHeightRef.current = measuredRowHeight || ROW_HEIGHT * rootScale();

	// ------------------------------------------------------------------------------------------
	// Scrolling
	// ------------------------------------------------------------------------------------------

	// Picks the rows to draw from the scroll offset. Setting the offset from script fires no scroll
	// event when it hasnt changed, as when a reloaded grid is sent back to row 0, so scrollToRow
	// calls this too.
	const syncScrollRow = useCallback(() => {
		const scroller = gridRef.current;
		if (!scroller) return;
		const first = Math.floor(scroller.scrollTop / rowHeightRef.current);
		const next = Math.max(0, first - OVERSCAN_ROWS);
		setScrollRow((prev) => (prev === next ? prev : next));
	}, []);

	// The focused row scrolls to the top of the grid, so the rows below it are the ones in view.
	const scrollToRow = useCallback((index, {animate = true} = {}) => {
		if (lastFocusedRowRef.current === index) return;
		lastFocusedRowRef.current = index;
		const scroller = gridRef.current;
		if (!scroller) return;
		const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		const target = Math.max(0, Math.min(max, index * rowHeightRef.current));
		if (animate) {
			animateScrollTop(scroller, target, 200);
		} else {
			stopScrollAnimation(scroller);
			scroller.scrollTop = target;
		}
		syncScrollRow();
	}, [syncScrollRow]);

	const rowsPerViewport = useCallback(() => {
		const scroller = gridRef.current;
		if (!scroller) return 1;
		return Math.max(1, Math.floor(scroller.clientHeight / rowHeightRef.current));
	}, []);

	const queueArtworkPrefetch = useCallback(() => {
		const lineup = channelsRef.current;
		if (!lineup.length) {
			store.queueArtworkPrefetch([], {replace: true});
			return;
		}
		const scroller = gridRef.current;
		const firstRow = scroller ? Math.floor(scroller.scrollTop / rowHeightRef.current) : 0;
		const visibleCount = scroller ? Math.ceil(scroller.clientHeight / rowHeightRef.current) : VISIBLE_ROWS;
		const start = Math.max(0, firstRow - ARTWORK_PREFETCH_ROW_MARGIN);
		const end = Math.min(lineup.length, firstRow + visibleCount + ARTWORK_PREFETCH_ROW_MARGIN);
		if (start >= end) return;
		const programs = [];
		lineup.slice(start, end).forEach((channel) => programs.push(...store.programsForChannel(channel.Id)));
		store.queueArtworkPrefetch(programs, {replace: true});
	}, [store]);

	const handleScroll = useCallback(() => {
		syncScrollRow();
		clearTimeout(artworkScrollTimerRef.current);
		artworkScrollTimerRef.current = setTimeout(queueArtworkPrefetch, 250);
	}, [queueArtworkPrefetch, syncScrollRow]);

	useEffect(() => () => clearTimeout(artworkScrollTimerRef.current), []);

	// ------------------------------------------------------------------------------------------
	// Focus
	// ------------------------------------------------------------------------------------------

	const onNavigationKey = () => {
		lastDpadRef.current = Date.now();
		pendingMoveRef.current = null;
	};

	const focusChannelRow = useCallback((index, {animate = true} = {}) => {
		const lineup = channelsRef.current;
		if (index < 0 || index >= lineup.length) return;
		pendingMoveRef.current = null;
		scrollToRow(index, {animate});
		focusWhenMounted(channelSpotlightId(lineup[index].Id));
	}, [scrollToRow]);

	const focusWindowBar = useCallback((index) => {
		if (index < WINDOW_BAR_PREVIOUS || index > WINDOW_BAR_LAST) return;
		pendingMoveRef.current = null;
		lastWindowBarIndexRef.current = index;
		focusWhenMounted(barSpotlightId(index));
	}, []);

	const focusCell = useCallback((rowIndex, channelId, cellIndex) => {
		scrollToRow(rowIndex);
		focusWhenMounted(cellSpotlightId(channelId, cellIndex));
	}, [scrollToRow]);

	// Only a row already drawn takes focus. The clock reaches here on its own, and it keeps the
	// selection right without scrolling the grid or taking the remote from a dialog.
	const focusSelectedCell = useCallback((selection, cells) => {
		if (dialogRef.current || isLoadingCells(cells)) return;
		const rowIndex = channelsRef.current.findIndex((channel) => channel.Id === selection.channelId);
		if (rowIndex < 0) return;
		focusWhenMounted(cellSpotlightId(selection.channelId, resolveCellIndexAt(cells, selection.anchorTime)), {attempts: 1, defer: true});
	}, []);

	// Anchor for the first focused cell: now while the window covers it, the window start otherwise.
	const seedAnchorInto = (cell) => {
		const now = Date.now();
		const base = now >= store.windowStart && now < store.windowEnd ? now : store.windowStart;
		return clampAnchorInto(cell, base);
	};

	const handleFocusChannel = useCallback((channel, index) => {
		if (!pointerHover()) scrollToRow(index);
		focusRef.current = {railFocused: true, channelId: channel.Id, program: null, area: 'grid'};
		emitter.emit();
	}, [emitter, scrollToRow]);

	const handleFocusCell = useCallback((rowIndex, channelId, cell) => {
		focusRef.current = {railFocused: false, channelId, program: cell.program || null, area: 'grid'};
		if (!pointerHover()) scrollToRow(rowIndex);
		const current = selectionRef.current;
		// A key move lands on the cell holding the anchor already. A pointer can land anywhere,
		// so the anchor is pulled into whatever it landed on.
		selectionRef.current = current
			? {channelId, anchorTime: clampAnchorInto(cell, current.anchorTime), programId: cell.program?.Id || null}
			: {channelId, anchorTime: seedAnchorInto(cell), programId: cell.program?.Id || null};
		emitter.emit();
	}, [emitter, scrollToRow]); // eslint-disable-line react-hooks/exhaustive-deps

	// A horizontal move is the only navigation that rewrites the anchor.
	const handleHorizontalMove = (cell) => {
		const selection = selectionRef.current;
		if (selection) selectionRef.current = {...selection, anchorTime: clampAnchorInto(cell, cell.start)};
	};

	// Moves one row holding the anchor time, so the selection keeps its place in time instead of
	// following whichever cell happens to be nearest. A row still loading defers the move.
	const moveSelectionVertically = useCallback((fromRowIndex, delta) => {
		const selection = selectionRef.current;
		if (!selection) return;
		const target = fromRowIndex + delta;
		const lineup = channelsRef.current;
		if (target < 0 || target >= lineup.length) return;
		const cells = cellsFor(lineup[target].Id);
		if (!cells.length) return;
		if (isLoadingCells(cells)) {
			pendingMoveRef.current = {targetRowIndex: target, anchorTime: selection.anchorTime};
			return;
		}
		focusCell(target, lineup[target].Id, resolveCellIndexAt(cells, selection.anchorTime));
	}, [cellsFor, focusCell]);

	const applyPendingVerticalMove = useCallback(() => {
		const pending = pendingMoveRef.current;
		if (!pending || dialogRef.current) return;
		const lineup = channelsRef.current;
		const channel = lineup[pending.targetRowIndex];
		if (!channel) return;
		const cells = cellsFor(channel.Id);
		if (!cells.length || isLoadingCells(cells)) return;
		pendingMoveRef.current = null;
		focusCell(pending.targetRowIndex, channel.Id, resolveCellIndexAt(cells, pending.anchorTime));
	}, [cellsFor, focusCell]);

	const pageChannelRows = useCallback((fromRowIndex, direction) => {
		const lineup = channelsRef.current;
		if (!lineup.length) return;
		const target = Math.max(0, Math.min(lineup.length - 1, fromRowIndex + direction * rowsPerViewport()));
		if (target === fromRowIndex) return;
		moveSelectionVertically(fromRowIndex, target - fromRowIndex);
		// A row a viewport away is usually not built yet. Scrolling builds it so the deferred move
		// can finish.
		if (pendingMoveRef.current) scrollToRow(target);
	}, [moveSelectionVertically, rowsPerViewport, scrollToRow]);

	// Enters the program row at the anchor the viewer last used, or now when focus arrived
	// through the channel column.
	const focusProgramFromChannel = useCallback((rowIndex) => {
		const lineup = channelsRef.current;
		const channel = lineup[rowIndex];
		if (!channel) return;
		const cells = cellsFor(channel.Id);
		if (!cells.length || isLoadingCells(cells)) return;
		const raw = selectionRef.current?.anchorTime ?? Date.now();
		const anchor = raw < store.windowStart ? store.windowStart : raw > store.windowEnd ? store.windowEnd - 1 : raw;
		const index = resolveCellIndexAt(cells, anchor);
		const cell = cells[index];
		selectionRef.current = {channelId: channel.Id, anchorTime: clampAnchorInto(cell, anchor), programId: cell.program?.Id || null};
		focusCell(rowIndex, channel.Id, index);
	}, [cellsFor, focusCell, store]);

	// ------------------------------------------------------------------------------------------
	// The window
	// ------------------------------------------------------------------------------------------

	// focusGrid is false when a control drove the shift, so a press on a window button doesn't
	// pull focus down into the grid. allowPast is only for the earlier button, the one way to
	// look before the live window.
	const shiftGuideWindow = useCallback(async (amount, {focusGrid = true, allowPast = false} = {}) => {
		pendingMoveRef.current = null;
		const oldStart = store.windowStart;
		const oldEnd = store.windowEnd;
		const target = oldStart + amount;
		const liveStart = guideLeftEdge(Date.now());
		const floor = allowPast ? liveStart - MAX_GUIDE_HISTORY_MS : liveStart;
		const clamped = amount < 0 && target < floor ? floor : target;
		if (clamped === oldStart) return;
		try {
			await store.setWindowStart(clamped, {livePosition: clamped === liveStart});
		} catch {
			return;
		}
		const selection = selectionRef.current;
		if (!selection) return;
		const cells = cellsFor(selection.channelId);
		if (!cells.length) return;
		const edgeAnchor = amount < 0 ? oldStart - 1 : oldEnd;
		const cell = cells[resolveCellIndexAt(cells, edgeAnchor)];
		const updated = {...selection, anchorTime: clampAnchorInto(cell, edgeAnchor), programId: cell.program?.Id || null};
		selectionRef.current = updated;
		if (focusGrid) focusSelectedCell(updated, cells);
	}, [cellsFor, focusSelectedCell, store]);

	// Puts the anchor on the new window start after a jump, so it addresses the first cell of
	// every row instead of a time the window no longer covers.
	const anchorToWindowStart = useCallback(() => {
		const selection = selectionRef.current;
		if (!selection) return;
		const cells = cellsFor(selection.channelId);
		if (!cells.length) {
			selectionRef.current = {...selection, anchorTime: store.windowStart, programId: null};
			return;
		}
		const cell = cells[resolveCellIndexAt(cells, store.windowStart)];
		const updated = {...selection, anchorTime: clampAnchorInto(cell, store.windowStart), programId: cell.program?.Id || null};
		selectionRef.current = updated;
		focusSelectedCell(updated, cells);
	}, [cellsFor, focusSelectedCell, store]);

	const goToNow = useCallback(async () => {
		pendingMoveRef.current = null;
		await store.goToNow({windowStart: guideLeftEdge(Date.now())});
		anchorToWindowStart();
	}, [anchorToWindowStart, store]);

	const handleProgramLeftEdge = (rowIndex) => {
		if (store.windowStart > guideLeftEdge(Date.now())) {
			shiftGuideWindow(-HALF_HOUR);
			return;
		}
		focusChannelRow(rowIndex);
	};

	// The window moves on the half hour the left edge floors to, so one timer is armed for the
	// next one rather than polling.
	useEffect(() => {
		let timer = null;
		let tick = null;
		const reanchor = async (at) => {
			if (!store.atLivePosition) return;
			try {
				await store.setWindowStart(guideLeftEdge(at), {livePosition: true});
			} catch {
				store.scheduleBoundaryRefresh();
				return;
			}
			await store.refreshAtQuarterHour();
			const selection = selectionRef.current;
			if (!selection) return;
			const cells = cellsFor(selection.channelId);
			if (!cells.length) return;
			const updated = reanchorSelection({current: selection, cells, now: at});
			if (updated.anchorTime === selection.anchorTime && updated.programId === selection.programId) return;
			pendingMoveRef.current = null;
			selectionRef.current = updated;
			focusSelectedCell(updated, cells);
		};
		const schedule = () => {
			const at = Date.now();
			timer = setTimeout(tick, floorToHalfHour(at) + HALF_HOUR - at);
		};
		tick = () => {
			const at = Date.now();
			const quiet = REANCHOR_INPUT_QUIET_MS - (at - lastDpadRef.current);
			if (lastDpadRef.current && quiet > 0) {
				// Mid input, so it waits out the quiet period rather than moving under the viewer.
				timer = setTimeout(tick, quiet);
				return;
			}
			schedule();
			reanchor(at);
		};
		schedule();
		return () => clearTimeout(timer);
	}, [cellsFor, focusSelectedCell, store]);

	// ------------------------------------------------------------------------------------------
	// Keys
	// ------------------------------------------------------------------------------------------

	const handleKeyDownCell = useCallback((e, rowIndex, channelId, cell, cells) => {
		const code = e.keyCode;
		const index = cells.indexOf(cell);
		const consume = () => {
			e.preventDefault();
			e.stopPropagation();
		};
		const page = pageDirection(code);
		if (page) {
			consume();
			onNavigationKey();
			pageChannelRows(rowIndex, page);
			return;
		}
		if (code === KEYS.LEFT) {
			consume();
			onNavigationKey();
			if (index > 0) {
				handleHorizontalMove(cells[index - 1]);
				focusCell(rowIndex, channelId, index - 1);
			} else {
				handleProgramLeftEdge(rowIndex);
			}
		} else if (code === KEYS.RIGHT) {
			consume();
			onNavigationKey();
			if (index < cells.length - 1) {
				handleHorizontalMove(cells[index + 1]);
				focusCell(rowIndex, channelId, index + 1);
			} else {
				shiftGuideWindow(HALF_HOUR);
			}
		} else if (code === KEYS.UP) {
			consume();
			onNavigationKey();
			if (rowIndex === 0) focusWindowBar(lastWindowBarIndexRef.current);
			else moveSelectionVertically(rowIndex, -1);
		} else if (code === KEYS.DOWN) {
			// Taken even when refused, so geometry can't pick a cell and drift the selection in time.
			consume();
			onNavigationKey();
			moveSelectionVertically(rowIndex, 1);
		}
	}, [focusCell, focusWindowBar, moveSelectionVertically, pageChannelRows, shiftGuideWindow]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleKeyDownChannel = useCallback((e, index) => {
		const code = e.keyCode;
		const consume = () => {
			e.preventDefault();
			e.stopPropagation();
		};
		const lineup = channelsRef.current;
		const page = pageDirection(code);
		if (page) {
			consume();
			onNavigationKey();
			focusChannelRow(Math.max(0, Math.min(lineup.length - 1, index + page * rowsPerViewport())));
			return;
		}
		if (code === KEYS.UP) {
			consume();
			onNavigationKey();
			if (index === 0) focusWindowBar(lastWindowBarIndexRef.current);
			else focusChannelRow(index - 1);
		} else if (code === KEYS.DOWN) {
			consume();
			onNavigationKey();
			if (index < lineup.length - 1) focusChannelRow(index + 1);
		} else if (code === KEYS.RIGHT) {
			consume();
			onNavigationKey();
			focusProgramFromChannel(index);
		} else if (code === KEYS.LEFT) {
			consume();
			onNavigationKey();
		}
	}, [focusChannelRow, focusProgramFromChannel, focusWindowBar, rowsPerViewport]);

	// ------------------------------------------------------------------------------------------
	// Watching and program actions
	// ------------------------------------------------------------------------------------------

	const watchChannel = useCallback((channelId) => {
		const lineup = channelsRef.current;
		const channel = lineup.find((c) => c.Id === channelId);
		if (!channel) return;
		onPlayChannel?.(channel, lineup);
	}, [onPlayChannel]);

	const handleSelectChannel = useCallback((channel) => watchChannel(channel.Id), [watchChannel]);

	// A gap or a filtered hole tunes the channel. The placeholder does nothing.
	const handleSelectCell = useCallback((rowIndex, channelId, cell) => {
		if (cell.kind === CELL_KINDS.program && cell.program) {
			pendingMoveRef.current = null;
			actionBusyRef.current = false;
			setDialog({type: 'program', program: cell.program});
			setTimeout(() => Spotlight.focus('livetv-popup'), 100);
		} else if (cell.kind === CELL_KINDS.gap || cell.kind === CELL_KINDS.filtered) {
			watchChannel(channelId);
		}
	}, [watchChannel]);

	const restoreGridFocus = useCallback(() => {
		const selection = selectionRef.current;
		if (selection) {
			const cells = cellsFor(selection.channelId);
			const rowIndex = channelsRef.current.findIndex((c) => c.Id === selection.channelId);
			if (cells.length && rowIndex >= 0 && !isLoadingCells(cells)) {
				lastFocusedRowRef.current = null;
				focusCell(rowIndex, selection.channelId, resolveCellIndexAt(cells, selection.anchorTime));
				return;
			}
		}
		const index = Math.min(Math.max(0, lastFocusedRowRef.current || 0), Math.max(0, channelsRef.current.length - 1));
		lastFocusedRowRef.current = null;
		focusChannelRow(index, {animate: false});
	}, [cellsFor, focusCell, focusChannelRow]);

	const closeDialog = useCallback(() => {
		setDialog(null);
		setTimeout(restoreGridFocus, 0);
	}, [restoreGridFocus]);

	const showToast = useCallback((message) => setToast({message, key: Date.now()}), []);

	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timer);
	}, [toast]);

	const runDialogAction = useCallback(async (action, success, failure) => {
		if (actionBusyRef.current) return;
		actionBusyRef.current = true;
		try {
			await action();
			setDialog(null);
			showToast(success);
			setTimeout(restoreGridFocus, 0);
		} catch {
			actionBusyRef.current = false;
			showToast(failure);
		}
	}, [restoreGridFocus, showToast]);

	const openSort = useCallback(() => {
		pendingMoveRef.current = null;
		setDialog({type: 'sort'});
		setTimeout(() => Spotlight.focus('livetv-sort'), 100);
	}, []);

	const openDate = useCallback(() => {
		pendingMoveRef.current = null;
		setDialog({type: 'date'});
		setTimeout(() => Spotlight.focus('livetv-date'), 100);
	}, []);

	const handleSortSelect = useCallback((key) => {
		updateSetting('liveTvChannelSortBy', key);
		pendingMoveRef.current = null;
		store.setSortBy(key);
		setDialog(null);
		setTimeout(() => focusWindowBar(lastWindowBarIndexRef.current), 0);
	}, [focusWindowBar, store, updateSetting]);

	const handleDateSelect = useCallback(async (date) => {
		setDialog(null);
		setTimeout(() => focusWindowBar(lastWindowBarIndexRef.current), 0);
		await store.setDate(date.getTime());
		anchorToWindowStart();
	}, [anchorToWindowStart, focusWindowBar, store]);

	// ------------------------------------------------------------------------------------------
	// Back
	// ------------------------------------------------------------------------------------------

	// True once the viewer has paged off live or moved focus to a channel other than the one last
	// tuned. With nothing ever tuned, row 0 stands in for it.
	const isExploringAwayFromEntry = () => {
		const homeId = getLiveTvLastChannelId();
		if (homeId) return !store.atLivePosition || focusRef.current.channelId !== homeId;
		const lineup = channelsRef.current;
		if (!lineup.length) return false;
		const rowZero = document.querySelector(`[data-spotlight-id="${channelSpotlightId(lineup[0].Id)}"]`);
		return !store.atLivePosition || !rowZero || document.activeElement !== rowZero;
	};

	// The row the guide calls home, the last tuned channel or row 0 before anything was, or -1 when
	// that channel isn't in the lineup.
	const homeRowIndex = () => {
		const homeId = getLiveTvLastChannelId();
		const lineup = channelsRef.current;
		if (!lineup.length) return -1;
		return homeId ? lineup.findIndex((channel) => channel.Id === homeId) : 0;
	};

	const resetToEntryState = useCallback(async () => {
		resettingRef.current = true;
		// Cleared before the reload so neither the re-anchor after it nor the focus restore once the
		// grid is back puts focus on the program that was left.
		selectionRef.current = null;
		try {
			await goToNow();
		} finally {
			resettingRef.current = false;
		}
		const index = homeRowIndex();
		if (index < 0) return;
		const lineup = channelsRef.current;
		focusRef.current = {railFocused: true, channelId: lineup[index].Id, program: null, area: 'grid'};
		emitter.emit();
		lastFocusedRowRef.current = null;
		focusChannelRow(index, {animate: false});
	}, [emitter, focusChannelRow, goToNow]); // eslint-disable-line react-hooks/exhaustive-deps

	// A back press first re-homes a guide that has drifted from where it opened, and only leaves
	// once it's already there.
	const consumeBackIfExploring = useCallback(() => {
		if (resettingRef.current) return true;
		if (!isExploringAwayFromEntry() || homeRowIndex() < 0) return false;
		resetToEntryState();
		return true;
	}, [resetToEntryState]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (dialogRef.current) {
				if (dialogRef.current.type === 'program') closeDialog();
				else {
					setDialog(null);
					setTimeout(() => focusWindowBar(lastWindowBarIndexRef.current), 0);
				}
				return true;
			}
			return consumeBackIfExploring();
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, closeDialog, consumeBackIfExploring, focusWindowBar]);

	// ------------------------------------------------------------------------------------------
	// Channel numbers typed on the remote
	// ------------------------------------------------------------------------------------------

	const handleChannelNumber = useCallback((digit) => {
		clearTimeout(channelNumberTimeoutRef.current);
		setChannelNumberBuffer((prev) => {
			const typed = prev + digit;
			channelNumberTimeoutRef.current = setTimeout(() => {
				const index = channelsRef.current.findIndex((ch) => ch.ChannelNumber === typed);
				if (index >= 0) focusChannelRow(index, {animate: false});
				setChannelNumberBuffer('');
			}, 1500);
			return typed;
		});
	}, [focusChannelRow]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (dialogRef.current) return;
			const keyCode = e.keyCode;
			if (keyCode >= KEYS.NUM_0 && keyCode <= KEYS.NUM_9) {
				e.preventDefault();
				handleChannelNumber(String.fromCharCode(keyCode));
			}
		};
		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
			clearTimeout(channelNumberTimeoutRef.current);
		};
	}, [handleChannelNumber]);

	// ------------------------------------------------------------------------------------------
	// Reacting to the store
	// ------------------------------------------------------------------------------------------

	useEffect(() => {
		const currentState = store.state;
		const prevState = prevStateRef.current;
		prevStateRef.current = currentState;
		if (currentState !== 'ready') return;
		store.scheduleBoundaryRefresh();
		queueArtworkPrefetch();

		const lineup = channelsRef.current;
		const lineupKey = lineup.map((c) => c.Id).join(',');
		const lineupChanged = lineupKey !== prevLineupRef.current;
		prevLineupRef.current = lineupKey;

		// Where the guide opens: the channel last tuned, or the first row.
		if (!didRestoreFocusRef.current) {
			if (!lineup.length) return;
			didRestoreFocusRef.current = true;
			loadLiveTvLastChannel().then(() => {
				const preferred = channelsRef.current.findIndex((c) => c.Id === getLiveTvLastChannelId());
				focusChannelRow(preferred >= 0 ? preferred : 0, {animate: false});
			});
			return;
		}

		// A reload replaced the grid under the viewer, so focus goes back where it was.
		if (prevState === 'loading' && !dialogRef.current && focusRef.current.area === 'grid' &&
			pageRef.current && !pageRef.current.contains(document.activeElement)) {
			restoreGridFocus();
			return;
		}

		// A filter or sort moved the selected channel to another row, or out of the lineup.
		if (lineupChanged && selectionRef.current && lineup.length) {
			const selection = selectionRef.current;
			let rowIndex = lineup.findIndex((c) => c.Id === selection.channelId);
			if (rowIndex < 0) {
				rowIndex = Math.min(Math.max(0, lastFocusedRowRef.current || 0), lineup.length - 1);
				const fallbackCells = cellsFor(lineup[rowIndex].Id);
				if (!fallbackCells.length) return;
				const cell = fallbackCells[resolveCellIndexAt(fallbackCells, selection.anchorTime)];
				selectionRef.current = {
					channelId: lineup[rowIndex].Id,
					anchorTime: clampAnchorInto(cell, selection.anchorTime),
					programId: cell.program?.Id || null
				};
			}
			const rebound = selectionRef.current;
			const cells = cellsFor(rebound.channelId);
			if (!cells.length) return;
			lastFocusedRowRef.current = null;
			scrollToRow(rowIndex);
			if (focusRef.current.area === 'grid') focusSelectedCell(rebound, cells);
		}

		applyPendingVerticalMove();
	}, [version]); // eslint-disable-line react-hooks/exhaustive-deps

	// As the guide nears the loaded edge, the next batch is asked for.
	useEffect(() => {
		if (store.state !== 'ready') return;
		const lastBuiltRow = scrollRow + VISIBLE_ROWS + OVERSCAN_ROWS * 2;
		if (store.hasMorePrograms && lastBuiltRow + PROGRAM_PREFETCH_ROWS >= store.programsHighWater) {
			store.loadMorePrograms();
		}
	}, [scrollRow, version, store]);

	// ------------------------------------------------------------------------------------------
	// Controls
	// ------------------------------------------------------------------------------------------

	const handleFilterSelect = useCallback((key) => {
		pendingMoveRef.current = null;
		store.setFilter(key);
	}, [store]);

	const handleChipFocus = useCallback((e) => {
		focusRef.current = {...focusRef.current, area: 'chips'};
		const rail = filterRailRef.current;
		const chip = e.currentTarget;
		if (rail && chip) rail.scrollLeft = Math.max(0, chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2);
	}, []);

	const handleChipKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		focusWindowBar(lastWindowBarIndexRef.current);
	}, [focusWindowBar]);

	const handleBarFocus = useCallback((e) => {
		focusRef.current = {...focusRef.current, area: 'bar'};
		const index = parseInt(e.currentTarget.dataset.barIndex, 10);
		if (!isNaN(index)) lastWindowBarIndexRef.current = index;
	}, []);

	const handleBarKeyDown = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.barIndex, 10);
		const code = e.keyCode;
		if (code !== KEYS.LEFT && code !== KEYS.RIGHT && code !== KEYS.UP && code !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		if (code === KEYS.LEFT) focusWindowBar(index - 1);
		else if (code === KEYS.RIGHT) focusWindowBar(index + 1);
		else if (code === KEYS.UP) focusWhenMounted(chipSpotlightId(0));
		else focusChannelRow(0);
	}, [focusChannelRow, focusWindowBar]);

	const handleEarlier = useCallback(() => shiftGuideWindow(-store.guideWindow, {focusGrid: false, allowPast: true}), [shiftGuideWindow, store]);
	const handleLater = useCallback(() => shiftGuideWindow(store.guideWindow, {focusGrid: false}), [shiftGuideWindow, store]);

	// ------------------------------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------------------------------

	const timeSlots = useMemo(() => {
		const slots = [];
		for (let time = windowStart; time < windowEnd; time += HALF_HOUR) slots.push(time);
		return slots;
	}, [windowStart, windowEnd]);

	const state = store.state;
	const safeScrollRow = Math.min(scrollRow, Math.max(0, channels.length - VISIBLE_ROWS));
	const rowsEnd = Math.min(channels.length, safeScrollRow + VISIBLE_ROWS + OVERSCAN_ROWS * 2);
	const visibleChannels = channels.slice(safeScrollRow, rowsEnd);
	const topSpacer = safeScrollRow * rowHeightRef.current;
	const bottomSpacer = Math.max(0, (channels.length - rowsEnd) * rowHeightRef.current);

	let body;
	if (state === 'loading') {
		body = <div className={css.loadingContainer}><LoadingSpinner /></div>;
	} else if (state === 'error') {
		body = (
			<div className={css.stateMessage}>
				{$L('Failed to load guide: {error}').replace('{error}', store.error?.message || String(store.error || ''))}
			</div>
		);
	} else if (!channels.length) {
		body = <div className={css.stateMessage}>{$L('No channels found')}</div>;
	} else {
		body = (
			<>
				<div className={css.timeRuler}>
					<div className={css.rulerSpacer} />
					{timeSlots.map((time) => (
						<div key={time} className={css.timeSlot} style={{width: rem(HALF_HOUR * layout.pxPerMs)}}>
							{formatClockTime(new Date(time), clockDisplay)}
						</div>
					))}
				</div>
				<div className={css.rulerDivider} />
				<ProgramGridContainer className={css.gridWrap} spotlightId="program-grid">
					{/* The spotlight decorator's ref is the component instance, so the scroller
					    is a plain div to make gridRef a real DOM node. */}
					<div className={css.gridBody} ref={gridRef} onScroll={handleScroll}>
						{topSpacer > 0 && <div style={{height: `${topSpacer}px`}} />}
						{visibleChannels.map((channel, i) => {
							const rowIndex = safeScrollRow + i;
							return (
								<GuideRow
									key={channel.Id}
									channel={channel}
									rowIndex={rowIndex}
									cells={renderedCellsFor(channel.Id)}
									windowStart={windowStart}
									now={clockNow}
									layout={layout}
									logoUrl={channel.ImageTags?.Primary
										? `${serverUrl}/Items/${channel.Id}/Images/Primary?maxHeight=${ROW_HEIGHT}&tag=${channel.ImageTags.Primary}`
										: null}
									onFocusChannel={handleFocusChannel}
									onKeyDownChannel={handleKeyDownChannel}
									onSelectChannel={handleSelectChannel}
									onFocusCell={handleFocusCell}
									onKeyDownCell={handleKeyDownCell}
									onSelectCell={handleSelectCell}
								/>
							);
						})}
						{bottomSpacer > 0 && <div style={{height: `${bottomSpacer}px`}} />}
					</div>
				</ProgramGridContainer>
			</>
		);
	}

	const program = dialog?.type === 'program' ? dialog.program : null;
	const programChannel = program ? store.channelForId(program.ChannelId) : null;
	const programEnded = program ? clockNow > programEnd(program) : false;
	const programFuture = program ? clockNow < programStart(program) : false;
	const programHasTimer = program ? hasTimer(program) : false;
	const programHasSeriesTimer = program ? hasSeriesTimer(program) : false;
	// On air with a timer set, the recording is running, so cancelling it is almost certainly why
	// the dialog was opened.
	const recordingNow = programHasTimer && !programEnded && !programFuture;
	const favoriteChannel = programChannel?.UserData?.IsFavorite === true;
	const programEpisodeLine = episodeLine(program);
	const guideDay = new Date(store.guideDate).toDateString();

	return (
		<div className={css.page} ref={pageRef}>
			<FilterRailContainer className={css.filterRail} spotlightId="livetv-filters">
				<div ref={filterRailRef} className={css.filterRailScroller}>
					{GUIDE_FILTERS.map((filter, index) => (
						<SpottableButton
							key={filter.key}
							className={`${css.chip} ${store.filter === filter.key ? css.chipSelected : ''}`}
							spotlightId={chipSpotlightId(index)}
							onFocus={handleChipFocus}
							onKeyDown={handleChipKeyDown}
							onClick={() => handleFilterSelect(filter.key)} // eslint-disable-line react/jsx-no-bind
						>
							{$L(filter.label)}
						</SpottableButton>
					))}
				</div>
			</FilterRailContainer>

			<GuideHeroHost
				store={store}
				emitter={emitter}
				focusRef={focusRef}
				serverUrl={serverUrl}
				clockDisplay={clockDisplay}
				version={version}
			/>

			<WindowBarContainer className={css.windowBar} spotlightId="livetv-windowbar">
				<SpottableButton className={css.barButton} spotlightId={barSpotlightId(0)} data-bar-index={0} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={handleEarlier} aria-label={$L('Earlier')}>
					<GuideIcon path={GUIDE_ICONS.chevronLeft} />
				</SpottableButton>
				<SpottableButton className={`${css.barButton} ${css.barGapXs}`} spotlightId={barSpotlightId(1)} data-bar-index={1} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={goToNow}>
					{$L('Now')}
				</SpottableButton>
				<SpottableButton className={`${css.barButton} ${css.barGapXs}`} spotlightId={barSpotlightId(2)} data-bar-index={2} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={handleLater} aria-label={$L('Later')}>
					<GuideIcon path={GUIDE_ICONS.chevronRight} />
				</SpottableButton>
				<div className={css.windowLabel}>
					{`${formatDayLabel(new Date(store.guideDate))}  ${formatClockTime(new Date(windowStart), clockDisplay)} – ${formatClockTime(new Date(windowEnd), clockDisplay)}`}
				</div>
				<SpottableButton className={css.barButton} spotlightId={barSpotlightId(3)} data-bar-index={3} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={openSort} aria-label={$L('Sort By')}>
					<GuideIcon path={GUIDE_ICONS.sort} />
				</SpottableButton>
				<SpottableButton className={`${css.barButton} ${css.barGapSm}`} spotlightId={barSpotlightId(4)} data-bar-index={4} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={openDate} aria-label={$L('Select date')}>
					<GuideIcon path={GUIDE_ICONS.calendar} />
				</SpottableButton>
				<SpottableButton className={`${css.barButton} ${css.barButtonLabelled} ${css.barGapSm}`} spotlightId={barSpotlightId(5)} data-bar-index={5} onFocus={handleBarFocus} onKeyDown={handleBarKeyDown} onClick={onRecordings}>
					<GuideIcon path={GUIDE_ICONS.dvr} />
					<span>{$L('Recordings')}</span>
				</SpottableButton>
			</WindowBarContainer>

			<div className={css.guideSection}>{body}</div>

			{channelNumberBuffer && <div className={css.channelNumberOverlay}>{channelNumberBuffer}</div>}

			{dialog?.type === 'sort' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={css.dialog} spotlightId="livetv-sort">
						<div className={css.dialogTitle}>{$L('Sort By')}</div>
						<div className={css.dialogBody}>
							{CHANNEL_SORTS.map((key) => (
								<SpottableDiv
									key={key}
									className={`${css.optionRow} ${store.sortBy === key ? 'spottable-default' : ''}`}
									onClick={() => handleSortSelect(key)} // eslint-disable-line react/jsx-no-bind
								>
									<span className={`${css.radio} ${store.sortBy === key ? css.radioSelected : ''}`} />
									<span className={css.optionLabel}>{$L(SORT_LABELS[key])}</span>
								</SpottableDiv>
							))}
						</div>
					</PopupContainer>
				</div>
			)}

			{dialog?.type === 'date' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={css.dialog} spotlightId="livetv-date">
						<div className={css.dialogTitle}>{$L('Select date')}</div>
						<div className={css.dialogBody}>
							{buildDateOptions().map((date, idx) => {
								const isSelected = date.toDateString() === guideDay;
								return (
									<SpottableDiv
										key={idx}
										className={`${css.optionRow} ${isSelected ? css.selectedOption : ''} ${isSelected ? 'spottable-default' : ''}`}
										onClick={() => handleDateSelect(date)} // eslint-disable-line react/jsx-no-bind
									>
										<span>{idx === 7 ? `${formatDayLabel(date)} (${$L('Today')})` : formatDayLabel(date)}</span>
										{isSelected && <GuideIcon path={GUIDE_ICONS.check} />}
									</SpottableDiv>
								);
							})}
						</div>
					</PopupContainer>
				</div>
			)}

			{program && (
				<div className={css.dialogScrim}>
					<PopupContainer className={css.dialog} spotlightId="livetv-popup">
						<div className={css.dialogTitle}>{program.Name}</div>
						<div className={css.dialogBody}>
							<div className={css.dialogTime}>
								{`${formatClockTime(new Date(programStart(program)), clockDisplay)} – ${formatClockTime(new Date(programEnd(program)), clockDisplay)}`}
							</div>
							{programEpisodeLine && <div className={css.dialogEpisode}>{programEpisodeLine}</div>}
							{program.Overview && <div className={css.dialogOverview}>{program.Overview}</div>}
							<div className={css.dialogChips}>
								{program.IsMovie && <span className={css.genreChip}>{$L('Movie')}</span>}
								{program.IsSeries && <span className={css.genreChip}>{$L('Series')}</span>}
								{program.IsSports && <span className={css.genreChip}>{$L('Sports')}</span>}
								{program.IsNews && <span className={css.genreChip}>{$L('News')}</span>}
								{program.IsKids && <span className={css.genreChip}>{$L('Kids')}</span>}
								{program.IsPremiere && <span className={css.genreChip}>{$L('Premiere')}</span>}
							</div>
						</div>
						<div className={css.dialogActions}>
							{!programEnded && (
								<SpottableButton
									className={`${css.dialogBtn} ${programHasTimer ? css.danger : ''} ${recordingNow ? 'spottable-default' : ''}`}
									onClick={() => runDialogAction( // eslint-disable-line react/jsx-no-bind
										() => store.toggleProgramRecording(program),
										programHasTimer ? $L('Recording cancelled') : $L('Program set to record'),
										programHasTimer ? $L('Failed to cancel recording') : $L('Unable to create recording')
									)}
								>
									{programHasTimer ? $L('Cancel Recording') : $L('Record')}
								</SpottableButton>
							)}
							{program.IsSeries && (
								<SpottableButton
									className={`${css.dialogBtn} ${programHasSeriesTimer ? css.danger : ''}`}
									onClick={() => runDialogAction( // eslint-disable-line react/jsx-no-bind
										() => store.toggleSeriesRecording(program),
										programHasSeriesTimer ? $L('Series recording cancelled') : $L('Series set to record'),
										programHasSeriesTimer ? $L('Failed to cancel series recording') : $L('Unable to create series recording')
									)}
								>
									{programHasSeriesTimer ? $L('Cancel Series Recording') : $L('Record Series')}
								</SpottableButton>
							)}
							<SpottableButton
								className={css.dialogBtn}
								disabled={!programChannel}
								onClick={() => runDialogAction( // eslint-disable-line react/jsx-no-bind
									() => store.toggleChannelFavorite(program.ChannelId),
									favoriteChannel ? $L('Removed from favorite channels') : $L('Added to favorite channels'),
									$L('Failed to update favorite channel')
								)}
							>
								{favoriteChannel ? $L('Unfavorite Channel') : $L('Favorite Channel')}
							</SpottableButton>
							<SpottableButton
								className={`${css.dialogBtn} ${recordingNow ? '' : 'spottable-default'}`}
								onClick={() => { // eslint-disable-line react/jsx-no-bind
									if (actionBusyRef.current) return;
									actionBusyRef.current = true;
									setDialog(null);
									watchChannel(program.ChannelId);
								}}
							>
								{programEnded || programFuture ? $L('Watch channel live') : $L('Watch')}
							</SpottableButton>
							<SpottableButton className={css.dialogBtn} onClick={closeDialog}>
								{$L('Close')}
							</SpottableButton>
						</div>
					</PopupContainer>
				</div>
			)}

			{toast && <div key={toast.key} className={css.toast}>{toast.message}</div>}
		</div>
	);
};

export default LiveTV;
