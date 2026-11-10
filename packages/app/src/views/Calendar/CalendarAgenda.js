import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import {useSettings} from '../../context/SettingsContext';
import {uiLocale} from '../../utils/uiLocale';
import {formatShortDayName} from '../../utils/dateFormat';
import {inLibrary, recentOf, sameDay, upcomingOf} from '../../utils/calendarEntries';
import {
	CalendarArt, CalendarButton, CalendarTag, artIcon, calendarDayName, calendarSubtitle, calendarTime, calendarWhen, centerIn, focusedSpotlightId, thumbOf, titleButton
} from './calendarParts';
import CalendarState from './CalendarState';

import css from './Calendar.module.less';

const SpottableDiv = Spottable('div');

export const rowId = (prefix, index) => `${prefix}-${index}`;

/** One entry as a row of time, colored bar, thumbnail, title, subtitle and tags. */
export const AgendaRow = memo(({entry, index, idPrefix, compact, look, now, spoilers, clockDisplay, onFocusEntry, onSelect, onSpotlightRight, onSpotlightLeft}) => {
	const handleFocus = useCallback((ev) => {
		centerIn(ev.currentTarget.parentElement, ev.currentTarget);
		onFocusEntry?.(entry);
	}, [entry, onFocusEntry]);
	const handleClick = useCallback(() => onSelect(entry), [entry, onSelect]);
	const subtitle = calendarSubtitle(entry, spoilers);
	const tags = look.tags(entry, now);
	return (
		<SpottableDiv
			className={`${css.row} ${compact ? css.rowCompact : ''}`}
			spotlightId={rowId(idPrefix, index)}
			onFocus={handleFocus}
			onClick={handleClick}
			onSpotlightRight={onSpotlightRight}
			onSpotlightLeft={onSpotlightLeft}
		>
			<div className={css.rowTime}>{calendarTime(entry, clockDisplay)}</div>
			<div className={css.rowBar} style={{background: look.color(entry, now)}} />
			<CalendarArt url={thumbOf(entry, spoilers)} icon={artIcon(entry)} className={css.rowThumb} thumb />
			<div className={css.rowText}>
				<div className={css.rowTitle}>{entry.title}</div>
				{subtitle && <div className={css.rowSubtitle}>{subtitle}</div>}
				{tags.length > 0 && (
					<div className={css.tags}>
						{tags.map((t) => <CalendarTag key={t.label} label={t.label} color={t.color} />)}
					</div>
				)}
			</div>
		</SpottableDiv>
	);
});

// A Spotlight override that moves focus by hand and keeps Spotlight's own move from following.
export const focusInstead = (target) => (ev) => {
	if (!Spotlight.focus(target)) return;
	ev.preventDefault();
	ev.stopPropagation();
};

// The end of the tabs row. Without this, Right jumps over to the preview.
const stayPut = (ev) => {
	ev.preventDefault();
	ev.stopPropagation();
};

const longDate = (day) => day.toLocaleDateString(uiLocale(), {month: 'long', day: 'numeric'});

const DayHeader = ({day, today, dateFormat, accent, first}) => {
	const name = calendarDayName(day, today, dateFormat);
	const isToday = sameDay(day, today);
	return (
		<div className={`${css.dayHeader} ${first ? css.dayHeaderFirst : ''}`}>
			<span className={css.dayName} style={isToday ? {color: accent} : undefined}>{name}</span>
			{name !== formatShortDayName(day, dateFormat) && <span className={css.dayDate}>{longDate(day)}</span>}
		</div>
	);
};

const TabChip = ({label, selected, accent, onSelect, spotlightId}) => (
	<SpottableDiv
		className={`${css.tab} ${selected ? css.tabSelected : ''}`}
		style={selected ? {backgroundColor: accent} : undefined}
		onClick={onSelect}
		spotlightId={spotlightId}
	>
		{label}
	</SpottableDiv>
);

const PREVIEW_FIRST = 'calendar-preview-0';

// Whether focus is on the calendar rather than a drawer or dialog over it.
const calendarHasFocus = () => {
	const active = document.activeElement;
	const view = document.querySelector('[data-spotlight-id="calendar-view"]');
	return !active || active === document.body || Boolean(view && view.contains(active));
};

// The tab and row the list was on, kept while a page it opened sits on top so Back lands there again.
let returnTo = null;

/** The pane beside the list for the focused entry. */
const Preview = ({entry: e, c, look, actions, clockDisplay, dateFormat, onBackToList}) => {
	const spoilers = c.hidesSpoilers(e);
	const kicker = [look.badgeOf(e), calendarWhen(e, c.today, clockDisplay, dateFormat)].filter(Boolean).join(' · ');
	const subtitle = calendarSubtitle(e, spoilers);
	const art = (!spoilers && e.stillUrl) || e.backdropUrl;
	const buttons = [];
	if (inLibrary(e)) buttons.push({key: 'play', label: $L('Play'), icon: 'play_arrow_rounded', primary: true, onClick: () => actions.play(e)});
	if (actions.showsRequest(e)) buttons.push({key: 'request', label: $L('Request'), icon: 'add_rounded', primary: !inLibrary(e), onClick: () => actions.request(e)});
	if (actions.canOpen(e)) buttons.push(titleButton(e, actions));
	return (
		<div className={css.preview}>
			<CalendarArt key={art || 'none'} url={art} icon={artIcon(e)} className={css.previewArt} />
			<div className={css.previewScrim} style={{background: `linear-gradient(to bottom, ${look.bg(0.1)} 0%, ${look.bg(0.75)} 50%, ${look.bg(0.97)} 100%)`}} />
			<div className={css.previewInfo}>
				<div className={css.kicker} style={{color: look.color(e, c.now)}}>{kicker}</div>
				<div className={css.previewTitle}>{e.title}</div>
				{subtitle && <div className={css.previewSubtitle}>{subtitle}</div>}
				<div className={css.tags}>
					{[...look.chips(e), ...look.tags(e, c.now)].map((t) => <CalendarTag key={t.label} label={t.label} color={t.color} />)}
				</div>
				{!spoilers && e.overview && <div className={css.overview}>{e.overview}</div>}
				{buttons.length > 0 && (
					<div className={css.buttons}>
						{buttons.map((b, i) => (
							<CalendarButton
								key={b.key}
								label={b.label}
								icon={b.icon}
								primary={b.primary}
								accent={look.accent}
								onClick={b.onClick}
								spotlightId={`calendar-preview-${i}`}
								onSpotlightLeft={i === 0 ? onBackToList : undefined}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

/** The day by day list with a preview of the focused entry beside it. */
const CalendarAgenda = ({c, look, actions: baseActions, onOpenMonth: baseOpenMonth, settingsPreview}) => {
	const {settings} = useSettings();
	const clockDisplay = settings.clockDisplay;
	const dateFormat = settings.dateFormat;
	// The settings preview leaves the place Back returns to for the screen itself.
	const kept = settingsPreview ? null : returnTo;
	const [recent, setRecent] = useState(() => Boolean(kept?.recent));
	const [focusedKey, setFocusedKey] = useState(() => kept?.focusedKey || null);
	const restoreKeyRef = useRef(kept?.focusedKey || null);
	const restoreFocusRef = useRef(kept?.focusId || null);
	if (!settingsPreview) returnTo = null;

	// Leaving through one of the list's own pages keeps its place, any other way out lets it go.
	const keepRef = useRef(false);
	const placeRef = useRef(null);
	placeRef.current = {recent, focusedKey};
	const leaveFocusRef = useRef(null);
	useEffect(() => () => {
		if (!settingsPreview) returnTo = keepRef.current ? {...placeRef.current, focusId: leaveFocusRef.current} : null;
	}, [settingsPreview]);
	const keepPlace = useCallback(() => {
		keepRef.current = true;
		leaveFocusRef.current = focusedSpotlightId();
	}, []);
	const actions = useMemo(() => {
		const keep = (fn) => (...args) => {
			keepPlace();
			fn(...args);
		};
		return {...baseActions, select: keep(baseActions.select), play: keep(baseActions.play), request: keep(baseActions.request), openTitle: keep(baseActions.openTitle)};
	}, [baseActions, keepPlace]);
	const onOpenMonth = useCallback((...args) => {
		keepPlace();
		baseOpenMonth?.(...args);
	}, [baseOpenMonth, keepPlace]);
	const list = useMemo(() => (recent ? recentOf(c.entries, c.today) : upcomingOf(c.entries, c.today)), [recent, c.entries, c.today]);
	const previewIndex = Math.max(0, list.findIndex((e) => e.key === focusedKey));
	const preview = list[previewIndex] || null;

	const handleFocusEntry = useCallback((e) => setFocusedKey(e.key), []);
	const handleSelect = useCallback((e) => actions.select(e), [actions]);
	const focusPreview = useMemo(() => focusInstead(PREVIEW_FIRST), []);
	const backToList = useMemo(() => focusInstead(rowId('calendar-row', previewIndex)), [previewIndex]);
	// The first row takes focus once there is one, or the row Back came back to. A new tab, or a list that
	// changes length while the calendar has focus, lands on the first row again.
	const shownRef = useRef(-1);
	const switchTab = useCallback((toRecent) => {
		if (toRecent === recent) return;
		shownRef.current = -1;
		restoreFocusRef.current = null;
		restoreKeyRef.current = null;
		setRecent(toRecent);
		setFocusedKey(null);
	}, [recent]);
	const showUpcoming = useCallback(() => switchTab(false), [switchTab]);
	const showRecent = useCallback(() => switchTab(true), [switchTab]);

	const hasRows = !c.loading && !c.problem && list.length > 0;
	useEffect(() => {
		if (settingsPreview || !hasRows || shownRef.current === list.length) return;
		const first = shownRef.current < 0;
		shownRef.current = list.length;
		if (!first && !calendarHasFocus()) return;
		if (first && restoreFocusRef.current && Spotlight.focus(restoreFocusRef.current)) return;
		const restored = first ? list.findIndex((e) => e.key === restoreKeyRef.current) : -1;
		const id = rowId('calendar-row', Math.max(0, restored));
		// The row may already hold focus under its new id, so it's scrolled to by hand.
		if (Spotlight.focus(id)) {
			const node = document.querySelector(`[data-spotlight-id="${id}"]`);
			if (node) centerIn(node.parentElement, node);
		}
	}, [hasRows, list, settingsPreview]);

	let lastDay = null;
	const rows = [];
	list.forEach((e, i) => {
		if (!lastDay || !sameDay(lastDay, e.day)) {
			rows.push(<DayHeader key={`day-${e.day.getTime()}`} day={e.day} today={c.today} dateFormat={dateFormat} accent={look.accent} first={!lastDay} />);
			lastDay = e.day;
		}
		rows.push(
			<AgendaRow
				key={e.key}
				entry={e}
				index={i}
				idPrefix="calendar-row"
				clockDisplay={clockDisplay}
				onFocusEntry={handleFocusEntry}
				onSelect={handleSelect}
				onSpotlightRight={focusPreview}
				look={look}
				now={c.now}
				spoilers={c.hidesSpoilers(e)}
			/>
		);
	});

	return (
		<div className={css.agenda}>
			<div className={css.agendaList}>
				<div className={css.title}>{$L('Calendar')}</div>
				<div className={css.tabs}>
					<TabChip label={$L('Upcoming')} selected={!recent} accent={look.accent} onSelect={showUpcoming} spotlightId="calendar-tab-upcoming" />
					<TabChip label={$L('Recently aired')} selected={recent} accent={look.accent} onSelect={showRecent} spotlightId="calendar-tab-recent" />
					<CalendarButton label={$L('Full calendar')} icon="calendar_month_rounded" compact onClick={onOpenMonth} spotlightId="calendar-full" onSpotlightRight={stayPut} />
				</div>
				<CalendarState c={c} empty={list.length === 0} emptyText={recent ? $L('Nothing aired recently') : $L('Nothing coming up')} settingsPreview={settingsPreview}>
					<div className={css.listScroller}>{rows}</div>
				</CalendarState>
			</div>
			<div className={css.previewPane}>
				{preview && <Preview entry={preview} c={c} look={look} actions={actions} clockDisplay={clockDisplay} dateFormat={dateFormat} onBackToList={backToList} />}
			</div>
		</div>
	);
};

export default CalendarAgenda;
