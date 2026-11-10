import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import LocaleInfo from 'ilib/lib/LocaleInfo';
import {useSettings} from '../../context/SettingsContext';
import {uiLocale} from '../../utils/uiLocale';
import {formatFullDate, formatShortDayName} from '../../utils/dateFormat';
import {BADGE, entriesOn, isoDay, monthGridDays, sameDay, startOfDay} from '../../utils/calendarEntries';
import {CalendarButton, CalendarTag, calendarDayName, focusedSpotlightId, useCalendarActions, useCalendarLook} from './calendarParts';
import {AgendaRow, focusInstead, rowId} from './CalendarAgenda';
import CalendarState from './CalendarState';
import useCalendar from './useCalendar';

import css from './Calendar.module.less';

const SpottableDiv = Spottable('div');
const PageContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const cellId = (day) => `calendar-day-${isoDay(day)}`;
const PANEL_PREFIX = 'calendar-panel-row';

// The UI language can read "system", which formatting resolves to the TV's own locale.
const localeTag = () => {
	try {
		return new Intl.DateTimeFormat(uiLocale()).resolvedOptions().locale;
	} catch (err) {
		return navigator.language || 'en-US';
	}
};

// 0 for Sunday. Newer engines know the region's week, older ones ask ilib's locale data.
const localeWeekStart = () => {
	const tag = localeTag();
	try {
		const locale = new Intl.Locale(tag);
		const info = locale.weekInfo || (locale.getWeekInfo && locale.getWeekInfo());
		if (info && info.firstDay) return info.firstDay % 7;
	} catch (err) {
		void err;
	}
	try {
		return new LocaleInfo(tag).getFirstDayOfWeek() % 7;
	} catch (err) {
		return 0;
	}
};

const weekStartOf = (setting) => {
	if (setting === 'sunday') return 0;
	if (setting === 'monday') return 1;
	return localeWeekStart();
};

const NO_ENTRIES = [];

const hasPremiere = (entries, badges) => badges && entries.some((e) => e.badge === BADGE.seriesPremiere || e.badge === BADGE.seasonPremiere);

const Cell = memo(({day, inMonth, selected, today, entries, look, now, onPick, onOpen}) => {
	const handleFocus = useCallback(() => onPick(day), [day, onPick]);
	const handleClick = useCallback(() => onOpen(day), [day, onOpen]);
	const shown = entries.slice(0, 2);
	const more = entries.length - shown.length;
	const style = {};
	if (selected) style.background = look.accentA(0.2);
	if (today) style.borderColor = look.accent;
	return (
		<SpottableDiv
			className={`${css.cell} ${inMonth ? '' : css.cellOut} ${today ? css.cellToday : ''}`}
			style={style}
			spotlightId={cellId(day)}
			onFocus={handleFocus}
			onClick={handleClick}
		>
			<div className={css.cellHead}>
				{/* The picked cell is tinted with the accent already. */}
				<span className={css.cellNumber} style={today && !selected ? {color: look.accent} : undefined}>{day.getDate()}</span>
				{hasPremiere(entries, look.badges) && <CalendarTag label={$L('NEW')} color={look.accentHex} />}
			</div>
			<div className={css.cellEntries}>
				{shown.map((e) => (
					<div key={e.key} className={css.cellEntry}>
						<span className={css.cellBar} style={{background: look.color(e, now)}} />
						<span className={css.cellTitle}>{e.title}</span>
					</div>
				))}
				{more > 0 && <div className={css.cellMore}>{$L('+{count} more').replace('{count}', String(more))}</div>}
			</div>
		</SpottableDiv>
	);
});

// The day and row the grid was on when it opened a page, so Back lands there again. It only applies
// when the grid comes back from the same opener, so a new See all still starts at its own day.
let returnTo = null;

/** The full calendar behind both styles: a month grid with the picked day's entries beside it. */
const CalendarMonth = ({initialDay, onSelectItem, onSelectSeerrItem}) => {
	const {settings} = useSettings();
	const c = useCalendar();
	const look = useCalendarLook();
	const actions = useCalendarActions({onSelectItem, onSelectSeerrItem});
	const [place] = useState(() => (returnTo && returnTo.from === initialDay ? returnTo : null));
	returnTo = null;
	const [selected, setSelected] = useState(() => place?.selected || startOfDay(initialDay || c.today));
	const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
	const weekStart = useMemo(() => weekStartOf(settings.calendarWeekStart), [settings.calendarWeekStart]);
	const days = useMemo(() => monthGridDays(month, weekStart), [month, weekStart]);
	const dayEntries = useMemo(() => entriesOn(c.entries, selected), [c.entries, selected]);
	// Grouped once, so a cell only redraws when its own day changes.
	const byDay = useMemo(() => {
		const out = {};
		c.entries.forEach((e) => {
			const key = isoDay(e.day);
			(out[key] = out[key] || []).push(e);
		});
		return out;
	}, [c.entries]);
	const locale = uiLocale();
	const dayName = calendarDayName(selected, c.today, settings.dateFormat);
	const fullDate = formatFullDate(selected, settings.dateFormat);
	// Today, tomorrow and yesterday keep their word above the date. Any other
	// day's name would only repeat the date.
	const relativeDay = dayName !== formatShortDayName(selected, settings.dateFormat);

	const canGoBack = month > c.windowStart;
	const canGoForward = new Date(month.getFullYear(), month.getMonth() + 1, 1) < c.windowEnd;

	// Focus follows the picked day, onto its cell once the grid shows its month.
	const wantFocusRef = useRef(true);
	const focusSelected = useCallback(() => {
		wantFocusRef.current = true;
	}, []);
	const ready = !c.loading && !c.problem;
	const restoreFocusRef = useRef(place?.focusId || null);
	useEffect(() => {
		if (!ready || !wantFocusRef.current) return;
		wantFocusRef.current = false;
		const restore = restoreFocusRef.current;
		restoreFocusRef.current = null;
		if (restore && Spotlight.focus(restore)) return;
		Spotlight.focus(cellId(selected));
	}, [ready, month, selected]);

	const shiftMonth = useCallback((by) => {
		const next = new Date(month.getFullYear(), month.getMonth() + by, 1);
		setMonth(next);
		setSelected(next.getFullYear() === c.today.getFullYear() && next.getMonth() === c.today.getMonth() ? c.today : next);
	}, [month, c.today]);
	const goBack = useCallback(() => shiftMonth(-1), [shiftMonth]);
	const goForward = useCallback(() => shiftMonth(1), [shiftMonth]);
	const goToday = useCallback(() => {
		setSelected(c.today);
		setMonth(new Date(c.today.getFullYear(), c.today.getMonth(), 1));
		focusSelected();
	}, [c.today, focusSelected]);

	const pick = useCallback((day) => {
		setSelected((prev) => (sameDay(prev, day) ? prev : day));
		if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) {
			setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
			focusSelected();
		}
	}, [month, focusSelected]);
	const open = useCallback((day) => {
		pick(day);
		if (byDay[isoDay(day)]) Spotlight.focus(rowId(PANEL_PREFIX, 0));
	}, [pick, byDay]);
	// Leaving through an entry keeps the grid's place, any other way out lets it go.
	const leaveRef = useRef(null);
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	useEffect(() => () => {
		returnTo = leaveRef.current ? {...leaveRef.current, selected: selectedRef.current, from: initialDay} : null;
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
	const handleSelect = useCallback((e) => {
		leaveRef.current = {focusId: focusedSpotlightId()};
		actions.select(e);
	}, [actions]);
	const backToGrid = useMemo(() => focusInstead(cellId(selected)), [selected]);

	const rows = [];
	for (let r = 0; r < days.length / 7; r++) rows.push(days.slice(r * 7, r * 7 + 7));
	const sidebar = settings.navbarPosition === 'left';

	return (
		<PageContainer className={`${css.page} ${sidebar ? css.pageSidebar : ''}`} spotlightId="calendar-month-view" style={{background: look.bg(1)}}>
			<div className={css.month}>
				<div className={css.monthMain}>
					<div className={css.headerRow}>
						<div className={css.title}>{month.toLocaleDateString(locale, {month: 'long', year: 'numeric'})}</div>
						<CalendarButton icon="chevron_left_rounded" compact disabled={!canGoBack} onClick={goBack} spotlightId="calendar-month-prev" aria-label={$L('Previous')} />
						<CalendarButton icon="chevron_right_rounded" compact disabled={!canGoForward} onClick={goForward} spotlightId="calendar-month-next" aria-label={$L('Next')} />
						<CalendarButton label={$L('Today')} icon="today_rounded" compact onClick={goToday} spotlightId="calendar-month-today" />
					</div>
					<div className={css.weekdays}>
						{days.slice(0, 7).map((d) => <div key={d.getDay()} className={css.weekday}>{d.toLocaleDateString(locale, {weekday: 'short'})}</div>)}
					</div>
					<CalendarState c={c} empty={false}>
						<div className={css.grid}>
							{rows.map((week) => (
								<div key={isoDay(week[0])} className={css.gridRow}>
									{week.map((d) => (
										<Cell
											key={isoDay(d)}
											day={d}
											inMonth={d.getMonth() === month.getMonth()}
											selected={sameDay(d, selected)}
											today={sameDay(d, c.today)}
											entries={byDay[isoDay(d)] || NO_ENTRIES}
											look={look}
											now={c.now}
											onPick={pick}
											onOpen={open}
										/>
									))}
								</div>
							))}
						</div>
					</CalendarState>
				</div>
				<div className={css.dayPanel}>
					<div className={css.dayPanelName}>{relativeDay ? dayName : fullDate}</div>
					{relativeDay && <div className={css.dayPanelDate}>{fullDate}</div>}
					{dayEntries.length === 0 ? (
						<div className={css.dayPanelEmpty}>{$L('Nothing on this day')}</div>
					) : (
						<div className={css.dayPanelList}>
							{dayEntries.map((e, i) => (
								<AgendaRow
									key={e.key}
									entry={e}
									index={i}
									idPrefix={PANEL_PREFIX}
									compact
									look={look}
									now={c.now}
									spoilers={c.hidesSpoilers(e)}
									clockDisplay={settings.clockDisplay}
									onSelect={handleSelect}
									onSpotlightLeft={backToGrid}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</PageContainer>
	);
};

export default CalendarMonth;
