import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import VerticalMarquee from '../../components/VerticalMarquee';
import {GUIDE_ICONS, GuideIcon} from '../LiveTV/GuideIcons';
import {createLiveTvGuideStore} from '../../services/liveTvGuideStore';
import {formatClockTime} from '../../utils/clock';
import {KEYS, isBackKey} from '../../utils/keys';
import {fittingItems} from '../../utils/measureText';
import {rem, rootScale} from '../../utils/rootScale';
import useSurfaceAccent from '../../hooks/useSurfaceAccent';
import {
	CAROUSEL_CARD_HEIGHT, DESCRIPTION_MS_PER_PIXEL, TV_CANVAS_SCALE, carouselLayoutFor, carouselNeighborhood, categoryTags,
	channelComparator, channelIndexFor, episodeTitleOf, filterLabel, genreFor, guideLeftEdge, hasSeriesTimer,
	hasTimer, programAiringAt, progressAt
} from '../../utils/liveTvGuide';

import css from './ChannelCarousel.module.less';

// First hold repeat fires this long after the press, so a single press moves exactly one channel.
const HOLD_START_DELAY_MS = 350;
// Then one channel every interval, about nine a second, which reads as continuous motion.
const HOLD_REPEAT_MS = 110;
// Refreshed by each incoming key event only, so a hold whose key up never arrives can't scroll
// forever.
const HOLD_SAFETY_MS = 900;
// Longer than the repeat interval, so a held press settles before the header or data follow it.
const SETTLE_DEBOUNCE_MS = 150;
// Landing on a channel with nothing cached fetches straight away, at most this often.
const BLIND_LOAD_THROTTLE_MS = 500;
const INACTIVITY_MS = 2 * 60 * 1000;
const EXIT_MS = 140;

// How far the raw index can drift from zero before it's brought back by a whole lineup, which
// lands on the same channel so the jump can't be seen.
const DRIFT_LINEUPS = 100;

// Geometry in design pixels, from the other clients' canvas points.
const OVERLAY_PADDING = 48;
const STRIP_WIDTH = 1920 - 2 * OVERLAY_PADDING;
const LAYOUT = carouselLayoutFor(STRIP_WIDTH / TV_CANVAS_SCALE);
const PITCH = LAYOUT.pitch * TV_CANVAS_SCALE;
const CARD_WIDTH = LAYOUT.width * TV_CANVAS_SCALE;
const VISIBLE_CARDS = LAYOUT.count;
const CARD_HEIGHT = CAROUSEL_CARD_HEIGHT * TV_CANVAS_SCALE;
const LEADING = (STRIP_WIDTH - CARD_WIDTH) / 2;
// The cards drawn either side of the centered one, a couple past what's visible so a move never
// reveals an empty slot.
const RENDER_RADIUS = Math.ceil(VISIBLE_CARDS / 2) + 2;

const CARD_CONTENT_INSET = (16 + 11) * TV_CANVAS_SCALE;
const META_FONT_SIZE = 20;
const META_SEPARATOR = ' · ';
const OVERVIEW_LINE_HEIGHT = 26 * 1.25;

const SURFACE = [26, 26, 26];
const SURFACE_VARIANT = [37, 37, 37];
const DEFAULT_ACCENT = '#00a4dc';

const parseRgb = (rgb) => rgb.split(',').map((part) => parseInt(part, 10));

// A hint of the program's genre over the dark base, so the card carries a little color without
// competing with its own text.
const cardBackground = (genre, centered) => {
	const tint = genre ? parseRgb(genre.rgb) : SURFACE_VARIANT;
	const alpha = centered ? 0.22 : 0.14;
	const mixed = tint.map((value, i) => Math.round(value * alpha + SURFACE[i] * (1 - alpha)));
	return `rgba(${mixed.join(', ')}, ${centered ? 0.88 : 0.74})`;
};

const currentProgram = (store, channelId, now) => (store ? programAiringAt(store.unfilteredProgramsForChannel(channelId), now) : null);

const timeRange = (program, clockDisplay) =>
	`${formatClockTime(new Date(program.StartDate), clockDisplay)} - ${formatClockTime(new Date(program.EndDate), clockDisplay)}`;

const categoryLabels = (program) => categoryTags(program).map((key) => $L(filterLabel(key)));

const buildEntry = (channel, store, now, serverUrl, clockDisplay) => {
	const program = currentProgram(store, channel.Id, now);
	return {
		channelId: channel.Id,
		channelNumber: channel.ChannelNumber || null,
		channelName: channel.Name || '',
		logoUrl: channel.ImageTags?.Primary
			? `${serverUrl}/Items/${channel.Id}/Images/Primary?maxHeight=80&tag=${channel.ImageTags.Primary}`
			: null,
		isFavorite: channel.UserData?.IsFavorite === true,
		programTitle: program?.Name || null,
		timeLabel: program ? timeRange(program, clockDisplay) : null,
		rating: program?.OfficialRating || null,
		tags: program ? categoryLabels(program) : [],
		genre: program ? genreFor(program) : null,
		isLive: Boolean(program),
		progress: program ? progressAt(program, now) : 0,
		hasTimer: program ? hasTimer(program) || hasSeriesTimer(program) : false,
		programLoading: !program && Boolean(store) && !store.hasProgramsFor(channel.Id)
	};
};

// One channel in the strip. The program block mirrors the guide cell, a title over a muted
// metadata line, with room for a second title line since the card is much taller than a row.
const CarouselCard = memo(({entry, centered, left}) => {
	const accent = useSurfaceAccent('liveTv', DEFAULT_ACCENT);
	const [logoFailed, setLogoFailed] = useState(false);
	const handleLogoError = useCallback(() => setLogoFailed(true), []);

	const metaItems = fittingItems(
		[entry.timeLabel, entry.rating, ...entry.tags].filter((item) => item && item.trim()).map((item) => item.trim()),
		CARD_WIDTH - CARD_CONTENT_INSET,
		META_FONT_SIZE,
		META_SEPARATOR
	);

	return (
		<div
			className={`${css.card} ${centered ? css.cardCentered : ''}`}
			style={{
				left: rem(left),
				width: rem(CARD_WIDTH),
				backgroundColor: cardBackground(entry.genre, centered)
			}}
		>
			<div className={css.genreBar} style={{backgroundColor: entry.genre ? entry.genre.color : accent}} />
			<div className={css.cardContent}>
				<div className={css.cardHeader}>
					{entry.isFavorite && <GuideIcon className={css.headerIcon} path={GUIDE_ICONS.favorite} />}
					{entry.channelNumber && <span className={css.channelNumber}>{entry.channelNumber}</span>}
					<span className={css.channelName}>{entry.channelName}</span>
					{entry.hasTimer && <GuideIcon className={`${css.headerIcon} ${css.timerIcon}`} path={GUIDE_ICONS.record} />}
					{entry.logoUrl && !logoFailed && (
						<div className={css.logo} style={{backgroundImage: `url("${entry.logoUrl}")`}}>
							{/* Only here to learn when the logo fails, since a background can't say. */}
							<img className={css.logoProbe} src={entry.logoUrl} alt="" onError={handleLogoError} />
						</div>
					)}
				</div>
				{entry.programTitle ? (
					<div className={css.programTitle}>{entry.programTitle}</div>
				) : entry.programLoading ? (
					<div>
						<div className={css.placeholderBar} />
						<div className={`${css.placeholderBar} ${css.placeholderBarShort}`} />
					</div>
				) : null}
				{metaItems.length > 0 && <div className={css.programMeta}>{metaItems.join(META_SEPARATOR)}</div>}
			</div>
			{entry.isLive && (
				<div className={css.progressTrack}>
					<div className={css.progressFill} style={{width: `${Math.min(100, Math.max(0, entry.progress * 100))}%`}} />
				</div>
			)}
		</div>
	);
});

// The program header above the strip. It keeps the height of all its lines whether the centered
// program fills them or not, so the strip never shifts as the selection moves.
const CarouselHeader = ({channel, program, clockDisplay}) => {
	if (!channel) return null;
	const season = program?.ParentIndexNumber;
	const episode = program?.IndexNumber;
	const suffix = season != null && episode != null ? ` (S${season}:E${episode})` : '';
	// Some sources repeat the program name as the episode title, and twice reads as a glitch.
	const episodeTitle = program ? episodeTitleOf(program) : '';
	const episodeName = episodeTitle && episodeTitle !== program.Name ? ` - ${episodeTitle}` : '';
	// The channel number and call sign are on the centered card already.
	const meta = program
		? [timeRange(program, clockDisplay), program.OfficialRating?.trim() || null, ...categoryLabels(program)].filter(Boolean).join(' · ')
		: '';
	return (
		<>
			<div className={css.headerTitle}>{`${program?.Name || channel.Name || ''}${episodeName}${suffix}`}</div>
			<div className={css.headerMeta}>{meta}</div>
			{program?.Overview && (
				<VerticalMarquee
					className={css.headerOverview}
					text={program.Overview}
					lines={2}
					lineHeight={OVERVIEW_LINE_HEIGHT}
					msPerPixel={DESCRIPTION_MS_PER_PIXEL}
					pauseMs={1600}
				/>
			)}
		</>
	);
};

// The quick channel changer over live playback. The centered card is the selection, the strip
// wraps at both ends, and holding left or right runs through the lineup. It takes its guide data
// from the prewarm the player keeps, or loads its own when there's none.
const ChannelCarousel = ({prewarm, api, channels: lineup, currentChannelId, selectionRevision, notice, sortBy, serverUrl, clockDisplay, onSelect, onDismiss, onShowControls}) => {
	const ownStore = useMemo(
		() => (!prewarm && api ? createLiveTvGuideStore(api, {sortBy}) : null),
		[] // eslint-disable-line react-hooks/exhaustive-deps
	);
	const store = prewarm ? prewarm.store : ownStore;

	const initialChannels = useMemo(() => {
		if (prewarm?.isWarm) {
			const ids = new Set(lineup.map((channel) => channel.Id));
			const warmed = prewarm.store.filteredChannels.filter((channel) => ids.has(channel.Id));
			if (warmed.length) return warmed;
		}
		return lineup.slice().sort(channelComparator(sortBy));
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const [channels, setChannels] = useState(initialChannels);
	const [ready, setReady] = useState(() => !store || Boolean(prewarm?.isWarm));
	const [version, setVersion] = useState(0);
	const [exiting, setExiting] = useState(false);
	const [entered, setEntered] = useState(false);
	const [rawIndex, setRawIndex] = useState(() => Math.max(0, initialChannels.findIndex((channel) => channel.Id === currentChannelId)));
	const [jumping, setJumping] = useState(false);
	const [header, setHeader] = useState(() => {
		const id = initialChannels[rawIndex]?.Id;
		return ready && id ? {channelId: id, program: currentProgram(store, id, Date.now())} : null;
	});

	const channelsRef = useRef(channels);
	channelsRef.current = channels;
	const rawIndexRef = useRef(rawIndex);
	const readyRef = useRef(ready);
	readyRef.current = ready;
	const dismissedRef = useRef(false);
	const holdRef = useRef({direction: 0, start: null, repeat: null, watchdog: null});
	const timersRef = useRef({header: null, load: null, hide: null, quarter: null, exit: null});
	const loadRef = useRef({busy: false, again: false, lastBlind: 0});
	const scheduleVisibleLoadRef = useRef(null);
	const callbacksRef = useRef({onSelect, onDismiss, onShowControls});
	callbacksRef.current = {onSelect, onDismiss, onShowControls};

	const count = channels.length;
	const centeredIndex = count ? channelIndexFor(rawIndex, count) : 0;
	const centeredId = channels[centeredIndex]?.Id || null;
	const centeredIdRef = useRef(centeredId);
	centeredIdRef.current = centeredId;

	// ------------------------------------------------------------------------------------------
	// Data
	// ------------------------------------------------------------------------------------------

	const updateHeader = useCallback(() => {
		const id = centeredIdRef.current;
		if (!id) return;
		setHeader({channelId: id, program: currentProgram(store, id, Date.now())});
	}, [store]);

	const scheduleHeader = useCallback(() => {
		clearTimeout(timersRef.current.header);
		timersRef.current.header = setTimeout(() => {
			if (holdRef.current.direction) {
				scheduleHeader();
				return;
			}
			updateHeader();
		}, SETTLE_DEBOUNCE_MS);
	}, [updateHeader]);

	const loadVisible = useCallback(async () => {
		if (!readyRef.current || !store) return;
		const load = loadRef.current;
		if (load.busy) {
			load.again = true;
			return;
		}
		load.busy = true;
		const ids = carouselNeighborhood(channelsRef.current, centeredIdRef.current, VISIBLE_CARDS);
		try {
			if (prewarm) {
				await prewarm.ensureVisibleChannels(ids);
			} else {
				await store.ensureProgramsForChannels(ids);
				store.scheduleBoundaryRefresh();
			}
		} catch {
			// Cached cards stay when a newly visible channel can't be loaded.
		} finally {
			load.busy = false;
			if (load.again) {
				load.again = false;
				scheduleVisibleLoadRef.current();
			}
		}
	}, [prewarm, store]);

	const scheduleVisibleLoad = useCallback(() => {
		clearTimeout(timersRef.current.load);
		if (readyRef.current && store && !store.unfilteredProgramsForChannel(centeredIdRef.current).length) {
			const now = Date.now();
			if (now - loadRef.current.lastBlind >= BLIND_LOAD_THROTTLE_MS) {
				loadRef.current.lastBlind = now;
				loadVisible();
				return;
			}
		}
		timersRef.current.load = setTimeout(loadVisible, SETTLE_DEBOUNCE_MS);
	}, [loadVisible, store]);
	scheduleVisibleLoadRef.current = scheduleVisibleLoad;

	useEffect(() => {
		if (!store) return undefined;
		const unsubscribe = store.subscribe(() => {
			setVersion((v) => v + 1);
			if (readyRef.current && !holdRef.current.direction) updateHeader();
			else if (readyRef.current) scheduleHeader();
		});
		const finishLoad = () => {
			const ids = new Set(lineup.map((channel) => channel.Id));
			const next = store.filteredChannels.filter((channel) => ids.has(channel.Id));
			if (!next.length) {
				dismiss(); // eslint-disable-line no-use-before-define
				return;
			}
			const keepId = centeredIdRef.current;
			const index = Math.max(0, next.findIndex((channel) => channel.Id === keepId));
			channelsRef.current = next;
			setChannels(next);
			rawIndexRef.current = index;
			setRawIndex(index);
			centeredIdRef.current = next[index].Id;
			readyRef.current = true;
			setReady(true);
			if (!prewarm) store.scheduleBoundaryRefresh();
			scheduleHeader();
			scheduleVisibleLoad();
		};
		if (prewarm?.isWarm) {
			prewarm.ensureReady();
			scheduleHeader();
			scheduleVisibleLoad();
		} else if (prewarm) {
			prewarm.ensureReady().then(finishLoad);
		} else {
			store.load({
				initialChannelIds: carouselNeighborhood(channelsRef.current, centeredIdRef.current, VISIBLE_CARDS),
				windowStart: guideLeftEdge(Date.now()),
				livePosition: true
			}).then(finishLoad);
		}
		return unsubscribe;
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// A store of its own refreshes on the quarter hour, the way a prewarm's does on its own.
	useEffect(() => {
		if (!ownStore) return undefined;
		const timers = timersRef.current;
		const schedule = () => {
			const now = new Date();
			const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), (Math.floor(now.getMinutes() / 15) + 1) * 15);
			timers.quarter = setTimeout(() => {
				ownStore.refreshAtQuarterHour();
				schedule();
			}, next.getTime() - now.getTime());
		};
		schedule();
		return () => {
			clearTimeout(timers.quarter);
			ownStore.cancelBoundaryRefresh();
			ownStore.dispose();
		};
	}, [ownStore]);

	const entries = useMemo(() => {
		const now = Date.now();
		return channels.map((channel) => buildEntry(channel, store, now, serverUrl, clockDisplay));
	}, [channels, version, store, serverUrl, clockDisplay]); // eslint-disable-line react-hooks/exhaustive-deps

	// ------------------------------------------------------------------------------------------
	// Entering and leaving
	// ------------------------------------------------------------------------------------------

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setEntered(true)));
		return () => window.cancelAnimationFrame(frame);
	}, []);

	const endHold = useCallback(() => {
		const hold = holdRef.current;
		clearTimeout(hold.start);
		clearInterval(hold.repeat);
		clearTimeout(hold.watchdog);
		holdRef.current = {direction: 0, start: null, repeat: null, watchdog: null};
	}, []);

	// Slides the strip away before telling the player, which then gives focus back.
	const dismiss = useCallback(() => {
		if (dismissedRef.current) return;
		dismissedRef.current = true;
		endHold();
		clearTimeout(timersRef.current.hide);
		setExiting(true);
		timersRef.current.exit = setTimeout(() => callbacksRef.current.onDismiss(), EXIT_MS);
	}, [endHold]);

	const resetInactivity = useCallback(() => {
		clearTimeout(timersRef.current.hide);
		if (!dismissedRef.current) timersRef.current.hide = setTimeout(dismiss, INACTIVITY_MS);
	}, [dismiss]);

	useEffect(() => {
		resetInactivity();
		const timers = timersRef.current;
		return () => {
			endHold();
			Object.keys(timers).forEach((key) => clearTimeout(timers[key]));
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ------------------------------------------------------------------------------------------
	// Motion
	// ------------------------------------------------------------------------------------------

	// Moves the strip without animating it there.
	const jumpTo = useCallback((target) => {
		setJumping(true);
		window.requestAnimationFrame(() => window.requestAnimationFrame(() => setJumping(false)));
		rawIndexRef.current = target;
		setRawIndex(target);
	}, []);

	const moveBy = useCallback((delta) => {
		const total = channelsRef.current.length;
		if (total <= 1 || !delta) return;
		const before = channelIndexFor(rawIndexRef.current, total);
		let target = rawIndexRef.current + delta;
		if (Math.abs(target) >= total * DRIFT_LINEUPS) {
			// A whole number of lineups away, so the same channel sits at the center after the jump.
			target -= Math.round(target / total) * total;
			jumpTo(target);
		} else {
			rawIndexRef.current = target;
			setRawIndex(target);
		}
		const after = channelIndexFor(target, total);
		if (after !== before) {
			centeredIdRef.current = channelsRef.current[after].Id;
			setHeader(null);
			scheduleHeader();
			scheduleVisibleLoad();
		}
	}, [jumpTo, scheduleHeader, scheduleVisibleLoad]);

	// The player went back to the channel that was working after a switch failed, so the strip
	// goes back to it too.
	const syncedRef = useRef({currentChannelId, selectionRevision});
	useEffect(() => {
		const synced = syncedRef.current;
		if (synced.currentChannelId === currentChannelId && synced.selectionRevision === selectionRevision) return;
		syncedRef.current = {currentChannelId, selectionRevision};
		const list = channelsRef.current;
		const index = list.findIndex((channel) => channel.Id === currentChannelId);
		const centered = channelIndexFor(rawIndexRef.current, list.length);
		if (index < 0 || index === centered) return;
		endHold();
		jumpTo(rawIndexRef.current - centered + index);
		centeredIdRef.current = currentChannelId;
		scheduleHeader();
		scheduleVisibleLoad();
	}, [currentChannelId, selectionRevision, endHold, jumpTo, scheduleHeader, scheduleVisibleLoad]);

	const stepFromTimer = useCallback(() => {
		const direction = holdRef.current.direction;
		if (direction) moveBy(direction);
	}, [moveBy]);

	const beginHold = useCallback((direction) => {
		const hold = holdRef.current;
		clearTimeout(hold.start);
		clearInterval(hold.repeat);
		hold.direction = direction;
		moveBy(direction);
		hold.start = setTimeout(() => {
			stepFromTimer();
			holdRef.current.repeat = setInterval(stepFromTimer, HOLD_REPEAT_MS);
		}, HOLD_START_DELAY_MS);
	}, [moveBy, stepFromTimer]);

	const refreshWatchdog = useCallback(() => {
		clearTimeout(holdRef.current.watchdog);
		holdRef.current.watchdog = setTimeout(endHold, HOLD_SAFETY_MS);
	}, [endHold]);

	// ------------------------------------------------------------------------------------------
	// Keys
	// ------------------------------------------------------------------------------------------

	useEffect(() => {
		const consume = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};
		const handleKeyDown = (e) => {
			if (dismissedRef.current) {
				consume(e);
				return;
			}
			resetInactivity();
			const code = e.keyCode;
			if (isBackKey(e)) {
				consume(e);
				dismiss();
				return;
			}
			if (code === KEYS.DOWN) {
				consume(e);
				dismissedRef.current = true;
				endHold();
				clearTimeout(timersRef.current.hide);
				callbacksRef.current.onShowControls();
				return;
			}
			if (code === KEYS.ENTER) {
				consume(e);
				endHold();
				const channel = channelsRef.current[channelIndexFor(rawIndexRef.current, channelsRef.current.length)];
				if (channel) callbacksRef.current.onSelect(channel);
				return;
			}
			// Up does nothing here, and taking it keeps focus from wandering behind the strip.
			if (code === KEYS.UP) {
				consume(e);
				return;
			}
			if (code !== KEYS.LEFT && code !== KEYS.RIGHT) return;
			consume(e);
			const direction = code === KEYS.RIGHT ? 1 : -1;
			refreshWatchdog();
			// Older engines don't flag a repeat, so a press in the direction already held counts
			// as one. A new direction, or a hold the watchdog ended, starts over.
			if (holdRef.current.direction !== direction) beginHold(direction);
		};
		const handleKeyUp = (e) => {
			const code = e.keyCode;
			if (code === KEYS.LEFT || code === KEYS.RIGHT) {
				consume(e);
				endHold();
			} else if (code === KEYS.ENTER || code === KEYS.UP || code === KEYS.DOWN || isBackKey(e)) {
				consume(e);
			}
		};
		window.addEventListener('keydown', handleKeyDown, true);
		window.addEventListener('keyup', handleKeyUp, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
			window.removeEventListener('keyup', handleKeyUp, true);
		};
	}, [beginHold, dismiss, endHold, refreshWatchdog, resetInactivity]);

	// ------------------------------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------------------------------

	const headerChannel = header ? channels.find((channel) => channel.Id === header.channelId) || null : null;

	let strip = null;
	if (ready && count) {
		if (count <= VISIBLE_CARDS) {
			// A lineup that fits is drawn at its real count, centered, and still wraps.
			const middle = Math.floor(count / 2);
			const cards = [];
			for (let i = 0; i < count; i++) {
				const index = channelIndexFor(centeredIndex + i - middle, count);
				cards.push(
					<CarouselCard
						key={entries[index].channelId}
						entry={entries[index]}
						centered={i === middle}
						left={LEADING + (i - middle) * PITCH}
					/>
				);
			}
			strip = <div className={css.track}>{cards}</div>;
		} else {
			const cards = [];
			for (let raw = rawIndex - RENDER_RADIUS; raw <= rawIndex + RENDER_RADIUS; raw++) {
				const index = channelIndexFor(raw, count);
				cards.push(
					<CarouselCard
						key={raw}
						entry={entries[index]}
						centered={raw === rawIndex}
						left={LEADING + raw * PITCH}
					/>
				);
			}
			const offset = rawIndex * PITCH * rootScale();
			strip = (
				<div
					className={`${css.track} ${jumping ? '' : css.trackMoving}`}
					style={{transform: `translate3d(${-offset}px, 0, 0)`, WebkitTransform: `translate3d(${-offset}px, 0, 0)`}}
				>
					{cards}
				</div>
			);
		}
	}

	return (
		<div className={`${css.overlay} ${entered && !exiting ? css.overlayIn : ''} ${exiting ? css.overlayOut : ''}`}>
			<div className={css.header}>
				<CarouselHeader channel={headerChannel} program={header?.program || null} clockDisplay={clockDisplay} />
			</div>
			<div className={css.strip} style={{height: rem(CARD_HEIGHT)}}>{strip}</div>
			{notice && <div key={notice.key} className={css.notice}>{notice.message}</div>}
		</div>
	);
};

export default ChannelCarousel;
