import {memo, useCallback, useEffect, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import {inLibrary, nextOf, pad, readyToWatchOf, thisWeekOf} from '../../utils/calendarEntries';
import {CalendarArt, CalendarButton, artIcon, calendarSubtitle, calendarWhen, centerIn, focusedSpotlightId, thumbOf, titleButton, READY_COLOR} from './calendarParts';
import {toCssColor} from '../../theme/themeSpec';
import CalendarState from './CalendarState';

import css from './Calendar.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const HERO_FIRST = 'calendar-hero-0';

// What had focus when the view opened a page, so Back from it lands there again.
let returnFocus = null;

const Countdown = ({target, now}) => {
	const left = Math.max(0, target - now);
	const days = Math.floor(left / 86400000);
	const hours = Math.floor(left / 3600000) % 24;
	// Rounded up so the last minute reads 1, not 0.
	const minutes = Math.ceil((left % 3600000) / 60000) % 60;
	const cell = (value, unit) => (
		<div className={css.countCell}>
			<div className={css.countValue}>{pad(value)}</div>
			<div className={css.countUnit}>{unit}</div>
		</div>
	);
	return (
		<div className={css.countdown}>
			<div className={css.countLabel}>{$L('Starts in')}</div>
			<div className={css.countCells}>
				{days > 0 && cell(days, $L('days'))}
				{cell(hours, $L('hr'))}
				{cell(minutes, $L('min'))}
			</div>
		</div>
	);
};

const Hero = ({entry: e, counting, c, look, actions, clockDisplay, dateFormat, onOpenMonth}) => {
	const spoilers = c.hidesSpoilers(e);
	const kicker = counting
		? [look.badgeOf(e), calendarWhen(e, c.today, clockDisplay, dateFormat)].filter(Boolean).join(' · ')
		: $L('Ready to watch');
	const subtitle = calendarSubtitle(e, spoilers);
	const art = e.backdropUrl || (!spoilers ? e.stillUrl : null);
	const buttons = [];
	if (!counting && inLibrary(e)) buttons.push({key: 'play', label: $L('Play'), icon: 'play_arrow_rounded', primary: true, onClick: () => actions.play(e)});
	if (actions.showsRequest(e)) buttons.push({key: 'request', label: $L('Request'), icon: 'add_rounded', onClick: () => actions.request(e)});
	if (actions.canOpen(e)) buttons.push(titleButton(e, actions));
	buttons.push({key: 'full', label: $L('Full calendar'), icon: 'calendar_month_rounded', onClick: onOpenMonth});
	// Up from the rows only scrolls far enough to show the buttons, so the whole hero is brought back.
	const handleFocus = useCallback((ev) => {
		const scroller = ev.currentTarget.closest(`.${css.countdownScroller}`);
		if (scroller) scroller.scrollTop = 0;
	}, []);
	return (
		<div className={css.hero} style={{background: look.bg(1)}} onFocus={handleFocus}>
			<CalendarArt key={art || 'none'} url={art} icon={artIcon(e)} className={css.heroArt} />
			<div className={css.heroScrim} style={{background: `linear-gradient(to right, ${look.bg(1)} 0%, ${look.bg(0.92)} 38%, ${look.bg(0.15)} 75%)`}} />
			<div className={css.heroInfo}>
				<div className={css.kicker} style={{color: counting ? look.color(e, c.now) : toCssColor(READY_COLOR)}}>{kicker}</div>
				<div className={css.heroTitle}>{e.title}</div>
				{subtitle && <div className={css.heroSubtitle}>{subtitle}</div>}
				{counting && <Countdown target={e.hasTime ? e.date : e.day} now={c.now} />}
				{!spoilers && e.overview && <div className={css.overview}>{e.overview}</div>}
				<div className={css.buttons}>
					{buttons.map((b, i) => (
						<CalendarButton key={b.key} label={b.label} icon={b.icon} primary={b.primary} accent={look.accent} onClick={b.onClick} spotlightId={`calendar-hero-${i}`} />
					))}
				</div>
			</div>
		</div>
	);
};

const Card = memo(({entry: e, poster, look, now, today, spoilers, clockDisplay, dateFormat, onSelect}) => {
	const handleClick = useCallback(() => onSelect(e), [e, onSelect]);
	// Centered in its row, and the row in the page.
	const handleFocus = useCallback((ev) => {
		const card = ev.currentTarget;
		const scroller = card.parentElement;
		centerIn(scroller, card, true, scroller.parentElement);
		centerIn(card.closest(`.${css.countdownScroller}`), card);
	}, []);
	const line = inLibrary(e) ? calendarSubtitle(e, spoilers) : calendarWhen(e, today, clockDisplay, dateFormat);
	return (
		<SpottableDiv className={`${css.card} ${poster ? css.cardPoster : css.cardThumb}`} onClick={handleClick} onFocus={handleFocus} spotlightId={`calendar-card-${e.key}`}>
			<CalendarArt url={poster ? e.posterUrl : thumbOf(e, spoilers)} icon={artIcon(e)} className={css.cardArt} thumb />
			<div className={css.cardTitle}>{e.title}</div>
			<div className={css.cardLine} style={{color: look.color(e, now)}}>{line}</div>
		</SpottableDiv>
	);
});

const Row = ({title, entries, poster, c, look, clockDisplay, dateFormat, onSelect, spotlightId}) => (
	<div className={css.cardRow}>
		<div className={css.cardRowTitle}>{title}</div>
		<RowContainer className={css.cardScroller} spotlightId={spotlightId}>
			{entries.map((e) => (
				<Card key={e.key} entry={e} poster={poster} look={look} now={c.now} today={c.today} spoilers={c.hidesSpoilers(e)} clockDisplay={clockDisplay} dateFormat={dateFormat} onSelect={onSelect} />
			))}
		</RowContainer>
	</div>
);

/**
 * A hero for the next thing to air, with a countdown, over rows of what's coming this week and
 * what's ready now. With nothing coming up, the newest ready item takes the hero and the timer goes.
 */
const CalendarCountdown = ({c, look, actions: baseActions, onOpenMonth: baseOpenMonth, settingsPreview}) => {
	const {settings} = useSettings();
	const restoreFocusRef = useRef(returnFocus);
	const leaveFocusRef = useRef(null);
	useEffect(() => {
		if (settingsPreview) return undefined;
		returnFocus = null;
		return () => {
			returnFocus = leaveFocusRef.current;
		};
	}, [settingsPreview]);
	const remember = useCallback((fn) => (...args) => {
		leaveFocusRef.current = focusedSpotlightId();
		fn?.(...args);
	}, []);
	const actions = useMemo(() => ({
		...baseActions,
		select: remember(baseActions.select),
		play: remember(baseActions.play),
		request: remember(baseActions.request),
		openTitle: remember(baseActions.openTitle)
	}), [baseActions, remember]);
	const onOpenMonth = useMemo(() => remember(baseOpenMonth), [baseOpenMonth, remember]);
	const clockDisplay = settings.clockDisplay;
	const dateFormat = settings.dateFormat;
	const next = nextOf(c.entries, c.now);
	const ready = readyToWatchOf(c.entries, c.today);
	const hero = next || ready[0] || null;
	const handleSelect = useCallback((e) => actions.select(e), [actions]);

	const heroKey = hero?.key;
	const focusedRef = useRef(null);
	useEffect(() => {
		if (settingsPreview || !heroKey || focusedRef.current === heroKey) return;
		focusedRef.current = heroKey;
		const restore = restoreFocusRef.current;
		restoreFocusRef.current = null;
		if (!(restore && Spotlight.focus(restore))) Spotlight.focus(HERO_FIRST);
	}, [heroKey, settingsPreview]);

	if (c.loading || c.problem || !hero) {
		return (
			<div className={css.countdownPage}>
				<div className={css.headerRow}>
					<div className={`${css.title} ${css.titleSmall}`}>{$L('Calendar')}</div>
					<CalendarButton label={$L('Full calendar')} icon="calendar_month_rounded" compact onClick={onOpenMonth} spotlightId="calendar-full" />
				</div>
				<CalendarState c={c} empty emptyText={$L('Nothing coming up')} settingsPreview={settingsPreview} />
			</div>
		);
	}

	const week = thisWeekOf(c.entries, c.today, c.now).filter((e) => e !== hero);
	const readyRow = ready.filter((e) => e !== hero);
	const poster = settings.calendarImageType !== 'thumb';
	return (
		<div className={`${css.countdownPage} ${css.countdownScroller}`}>
			<Hero entry={hero} counting={Boolean(next)} c={c} look={look} actions={actions} clockDisplay={clockDisplay} dateFormat={dateFormat} onOpenMonth={onOpenMonth} />
			{week.length > 0 && (
				<Row title={$L('Coming up this week')} entries={week} poster={poster} c={c} look={look} clockDisplay={clockDisplay} dateFormat={dateFormat} onSelect={handleSelect} spotlightId={settingsPreview ? undefined : 'calendar-week-row'} />
			)}
			{readyRow.length > 0 && (
				<Row title={$L('Ready to watch')} entries={readyRow} poster={false} c={c} look={look} clockDisplay={clockDisplay} dateFormat={dateFormat} onSelect={handleSelect} spotlightId={settingsPreview ? undefined : 'calendar-ready-row'} />
			)}
		</div>
	);
};

export default CalendarCountdown;
