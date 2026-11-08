import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';

import {KEYS} from '../../utils/keys';
import {relativeLuminance} from '../../theme/themeSpec';
import {SettingsGlyph, renderSettingsIcon, renderToggle, renderChevron} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';

import css from './Settings.module.less';

// The row shapes every settings screen is built from. None of them reach for the settings
// context, so what a row shows and what a press does are both decided by the caller.

export const SectionTitle = ({children}) => (
	<div className={children ? css.sectionTitle : css.sectionTitleEmpty}>{children}</div>
);

// Whether the line under a title wrapped. A row whose line wraps is laid out tighter than one
// whose line fits.
const useWraps = (text) => {
	const ref = useRef(null);
	const [wraps, setWraps] = useState(false);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) {
			setWraps(false);
			return;
		}
		const line = parseFloat(window.getComputedStyle(node).lineHeight);
		setWraps(line > 0 && node.offsetHeight > line * 1.5);
	}, [text]);
	return [ref, wraps];
};

const bodyClass = (hasLine, wraps, threeLine) => {
	if (!hasLine) return css.listItemBody;
	if (threeLine) return `${css.listItemBody} ${css.bodyThreeLine}`;
	return `${css.listItemBody} ${wraps ? css.bodyCompact : css.bodyTwoLine}`;
};

const rowClass = (tight) => (tight ? `${css.listItem} ${css.listItemTight}` : css.listItem);

// Core rings a navbar swatch in dark ink when it's nearly white and in faint onSurface otherwise
export const swatchEdgeClass = (color) => (relativeLuminance(color) > 0.8 ? css.swatchEdgeLight : css.swatchEdge);

export const ToggleRow = ({settingKey, title, desc, icon, checked, onToggle}) => {
	const [lineRef, wraps] = useWraps(desc);
	return (
		<SpottableDiv className={rowClass(true)} onClick={onToggle} spotlightId={`setting-${settingKey}`}>
			{renderSettingsIcon(icon, true)}
			<div className={bodyClass(!!desc, wraps)}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div ref={lineRef} className={`${css.listItemCaption} ${css.listItemDescription}`}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>{renderToggle(checked)}</div>
		</SpottableDiv>
	);
};

// A picker shows what it's set to in a bubble on the end, and its description under the title.
// One that picks a colour shows the name under the title and the colour on the end instead, and
// a few write the name under the title and end in a chevron.
export const OptionRow = ({settingKey, title, desc, caption, swatch, colorTile, padded, valueAsSubtitle, plainIcon, icon, onOpen}) => {
	const [lineRef, wraps] = useWraps(swatch || valueAsSubtitle ? caption : desc);
	// A colour on the subtitle screen is its title and the colour itself, nothing more
	if (colorTile) {
		return (
			<SpottableDiv className={rowClass(false)} onClick={onOpen} spotlightId={`setting-${settingKey}`}>
				{renderSettingsIcon(icon, false, true)}
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{title}</div>
				</div>
				<div className={css.listItemTrailing}>
					<div className={css.colorCircle} style={{background: colorTile}} />
				</div>
			</SpottableDiv>
		);
	}
	if (swatch || valueAsSubtitle) {
		return (
			<SpottableDiv className={rowClass(false)} onClick={onOpen} spotlightId={`setting-${settingKey}`}>
				{renderSettingsIcon(icon)}
				<div className={bodyClass(true, wraps)}>
					<div className={css.listItemHeading}>{title}</div>
					<div ref={lineRef} className={css.listItemCaption}>{caption}</div>
				</div>
				<div className={css.listItemTrailing}>
					{swatch ? <div className={`${css.colorSwatch} ${swatchEdgeClass(swatch)}`} style={{background: swatch}} /> : renderChevron()}
				</div>
			</SpottableDiv>
		);
	}
	return (
		<SpottableDiv className={rowClass(!padded)} onClick={onOpen} spotlightId={`setting-${settingKey}`}>
			{renderSettingsIcon(icon, false, plainIcon)}
			<div className={bodyClass(!!desc, wraps, true)}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && (
					<div ref={lineRef} className={`${css.listItemCaption} ${css.listItemDescription} ${css.listItemDescriptionSmall}`}>
						{desc}
					</div>
				)}
			</div>
			<div className={css.listItemTrailing}>
				<div className={css.valueBubble}>{caption}</div>
			</div>
		</SpottableDiv>
	);
};

export const NavRow = ({id, spotlightId, title, desc, icon, chevron = true, onClick}) => {
	const [lineRef, wraps] = useWraps(desc);
	return (
		<SpottableDiv className={rowClass(false)} onClick={onClick} spotlightId={spotlightId || `setting-${id}`}>
			{renderSettingsIcon(icon)}
			<div className={bodyClass(!!desc, wraps)}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div ref={lineRef} className={css.listItemCaption}>{desc}</div>}
			</div>
			{chevron && <div className={css.listItemTrailing}>{renderChevron()}</div>}
		</SpottableDiv>
	);
};

// A fact rather than a setting. It still takes the focus, so the screen can be read row by row.
export const InfoRow = ({id, label, value, icon, onClick}) => {
	const [lineRef, wraps] = useWraps(value);
	return (
		<SpottableDiv className={rowClass(false)} spotlightId={`info-${id}`} onClick={onClick}>
			{renderSettingsIcon(icon)}
			<div className={bodyClass(!!value, wraps)}>
				<div className={css.listItemHeading}>{label}</div>
				{value && <div ref={lineRef} className={css.listItemCaption}>{value}</div>}
			</div>
			<div className={css.listItemTrailing} />
		</SpottableDiv>
	);
};

const Hint = ({name, off}) => (
	<span className={off ? `${css.reorderHint} ${css.reorderHintOff}` : css.reorderHint}>
		<SettingsGlyph name={name} />
	</span>
);

// One entry of a list the remote rearranges. The whole row is the only place the focus stops:
// left and right move it and OK switches it. A list of buttons marks the moves with up and down
// arrows and ends in a switch, the home rows mark them with a checkbox and side arrows, and a
// plain list draws no card at all. A fixed one is the same card with nothing to move.
export const ReorderRow = ({spotlightId, title, subtitle, icon, checkbox, plain, buttons, fixed, enabled, locked, isFirst, isLast, onToggle, onMove}) => {
	const [lineRef, wraps] = useWraps(subtitle);
	// The row is put back at its new place in the list, which drops the focus it had
	const move = useCallback((ev, delta) => {
		ev.preventDefault();
		ev.stopPropagation();
		onMove(delta);
		window.requestAnimationFrame(() => Spotlight.focus(spotlightId));
	}, [onMove, spotlightId]);
	const handleLeft = useCallback((ev) => {
		if (!fixed && !isFirst) move(ev, -1);
	}, [fixed, isFirst, move]);
	const handleRight = useCallback((ev) => {
		if (!fixed && !isLast) move(ev, 1);
	}, [fixed, isLast, move]);

	let leading = icon;
	if (checkbox) leading = enabled ? 'check_box' : 'check_box_outline_blank';
	const className = `${rowClass(buttons)} ${plain ? css.listItemPlain : css.listItemClean}`;
	return (
		<SpottableDiv
			className={className}
			onClick={locked ? undefined : onToggle}
			onSpotlightLeft={handleLeft}
			onSpotlightRight={handleRight}
			spotlightId={spotlightId}
		>
			{plain && checkbox
				? <div className={enabled ? `${css.plainCheckbox} ${css.plainCheckboxOn}` : css.plainCheckbox}><SettingsGlyph name={leading} /></div>
				: renderSettingsIcon(leading, buttons, plain)}
			<div className={bodyClass(!!subtitle, wraps)}>
				<div className={css.listItemHeading}>{title}</div>
				{subtitle && (
					<div ref={lineRef} className={plain ? css.listItemCaption : `${css.listItemCaption} ${css.listItemDescription}`}>
						{subtitle}
					</div>
				)}
			</div>
			<div className={css.listItemTrailing}>
				{buttons ? (
					<>
						{!fixed && <span className={css.reorderButton}><Hint name='keyboard_arrow_up' off={isFirst} /></span>}
						{!fixed && <span className={css.reorderButton}><Hint name='keyboard_arrow_down' off={isLast} /></span>}
						{locked
							? <span className={css.reorderLock}><SettingsGlyph name='lock_outline' /></span>
							: <span className={css.reorderSwitch}>{renderToggle(enabled)}</span>}
					</>
				) : (
					<>
						{!isFirst && <span className={css.reorderCaret}><Hint name='arrow_left' /></span>}
						{!isLast && <span className={css.reorderCaret}><Hint name='arrow_right' /></span>}
					</>
				)}
			</div>
		</SpottableDiv>
	);
};

// An editor works on a copy and writes it back once, when its screen closes, so a held key
// doesn't rebuild the home screen behind the panel at every step
export const useCommitOnLeave = (commit) => {
	const commitRef = useRef(commit);
	commitRef.current = commit;
	useEffect(() => () => commitRef.current(), []);
};

// What an edited list looks like, to tell whether it ended up any different from how it opened
export const editedListKey = (items) => items.map((item) => `${item.id}:${item.enabled ? 1 : 0}`).join(',');

// Saving a setting re-renders everything that reads settings, the home rows behind the
// panel included, which is far too slow for every step of a held key. So the knob moves
// on its own state and the value is saved once the presses stop, focus leaves or the
// screen closes.
const SLIDER_SAVE_DELAY_MS = 500;
// Past this many steps the marks along the track would run together
const MAX_TICKS = 30;

// The description, when there's one, sits over the value, then the track
export const SliderRow = ({settingKey, title, desc, min, max, step, value, format, icon, plainIcon, onChange}) => {
	const [shown, setShown] = useState(value);
	const shownRef = useRef(value);
	const pendingRef = useRef(null);
	const timerRef = useRef(null);
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	const save = useCallback(() => {
		clearTimeout(timerRef.current);
		if (pendingRef.current === null) return;
		const next = pendingRef.current;
		pendingRef.current = null;
		onChangeRef.current({value: next});
	}, []);

	// Left and right move the knob a step and stay on the row, so the panel's focus handling
	// never sees them. Up and down still move between rows.
	const handleKeyDown = useCallback((ev) => {
		if (ev.keyCode !== KEYS.LEFT && ev.keyCode !== KEYS.RIGHT) return;
		ev.preventDefault();
		ev.stopPropagation();
		const raw = shownRef.current + (ev.keyCode === KEYS.RIGHT ? step : -step);
		// Rounded to the step, since adding tenths drifts
		const next = Math.min(max, Math.max(min, Math.round(raw / step) * step));
		const tidy = Number(next.toFixed(4));
		if (tidy === shownRef.current) return;
		shownRef.current = tidy;
		setShown(tidy);
		pendingRef.current = tidy;
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(save, SLIDER_SAVE_DELAY_MS);
	}, [min, max, step, save]);

	// A change made somewhere else, like a server sync, still shows unless a press is waiting to save
	useEffect(() => {
		if (pendingRef.current === null) {
			shownRef.current = value;
			setShown(value);
		}
	}, [value]);

	useEffect(() => save, [save]);

	const span = max - min;
	const fraction = span > 0 ? Math.min(1, Math.max(0, ((shown ?? min) - min) / span)) : 0;
	const divisions = Math.round(span / step);
	const ticks = [];
	if (divisions > 0 && divisions <= MAX_TICKS) {
		for (let i = 0; i <= divisions; i++) {
			ticks.push(<div key={i} className={css.sliderTick} style={{left: `${(i / divisions) * 100}%`}} />);
		}
	}

	return (
		<SpottableDiv
			className={css.listItem}
			spotlightId={`setting-${settingKey}`}
			onKeyDown={handleKeyDown}
			onBlur={save}
		>
			{renderSettingsIcon(icon, false, plainIcon)}
			<div className={css.sliderBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
				<div className={css.listItemCaption}>{format ? format(shown) : shown}</div>
				<div className={css.sliderTrackArea}>
					<div className={css.sliderInactive} />
					<div className={css.sliderActive} style={{width: `${fraction * 100}%`}} />
					{ticks}
					<div className={css.sliderThumb} style={{left: `${fraction * 100}%`}} />
				</div>
			</div>
		</SpottableDiv>
	);
};
