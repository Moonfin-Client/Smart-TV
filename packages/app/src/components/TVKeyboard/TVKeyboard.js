import {Component, memo} from 'react';
import $L from '@enact/i18n/$L';
import {Pause} from '@enact/spotlight/Pause';

import {useSettings} from '../../context/SettingsContext';
import {isXbox} from '../../platform';
import {toCssColor, toCssColorWithAlpha, toRgbTriplet, inkOn, radiusToCss, shadowToCss} from '../../theme/themeSpec';
import {getPerfTier} from '../../utils/perfTier';
import {getKeyboardStyleOptions} from '../../views/Settings/settingsOptions';
import {
	NUMERIC_LAYOUT,
	NUMBER_PAD_LAYOUT,
	DOCKED_NUMERIC_LAYOUT,
	dockedFor,
	keyBoxes,
	lowerFor,
	upperFor,
	variantForLocale,
	alternatesFor,
	REPEATABLE_KEYS,
	keyUnitSpan,
	KEY_GAP_FACTOR,
	maxRowSpan
} from './keyboardLayouts';
import * as textModel from './keyboardTextModel';
import {registerKeyboardHost, publishTvKeyboardVisibility} from './keyboardBus';
import css from './TVKeyboard.module.less';

const URL_CHIPS = ['https://', 'http://', 'www.', 'jellyfin', '.com', '.org', '.net', ':8096', '/'];
const EMAIL_CHIPS = ['@gmail.com', '@outlook.com', '@icloud.com', '@yahoo.com', '.com', '.'];
const SUGGESTION_DEBOUNCE_MS = 280;
const LONG_PRESS_MS = 500;
const MIN_POPUP_EDGE_GAP = 16;

// The shortcuts the Xbox's own keyboard takes, by the key each one presses. X and Menu
// already come in as Backspace and the context menu key.
const XBOX_SHORTCUTS = {
	// Y
	198: ['SPACE'],
	// Right and left bumper
	199: ['CURSORR'],
	200: ['CURSORL'],
	// Left stick press
	209: ['SHIFT'],
	// Left trigger, which comes in as rewind
	227: ['123', 'ABC']
};

// Right stick right and left
const XBOX_CHIP_STEPS = {
	217: 1,
	218: -1
};

const ICON_PATHS = {
	BACKSPACE: 'M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z',
	PASTE: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
	CURSORL: 'M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z',
	CURSORR: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z',
	DONE: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z',
	IME: 'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z',
	SHIFT: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
	SHIFT_LOCKED: 'M12 8.41L16.59 13 18 11.59l-6-6-6 6L7.41 13 12 8.41zM6 18h12v-2H6v2z'
};

const ICON_SIZES = {
	BACKSPACE: 36,
	PASTE: 32,
	CURSORL: 44,
	CURSORR: 44,
	DONE: 40,
	IME: 36,
	SHIFT: 40,
	SHIFT_LOCKED: 40
};

const KeyIcon = ({name, color}) => (
	<svg
		className={css.keyIcon}
		width={ICON_SIZES[name]}
		height={ICON_SIZES[name]}
		viewBox="0 0 24 24"
		fill={color}
	>
		<path d={ICON_PATHS[name]} />
	</svg>
);

// Outlined icons for the Glass and Docked styles, drawn as strokes in the key's own color.
const LINE_ICON_PATHS = {
	SHIFT: 'M12 4.5l-7.5 7.5h4.25v7.5h6.5V12h4.25z',
	SHIFT_LOCKED: 'M12 3.5l-7.5 7.5h4.25v4.5h6.5V11h4.25zM8.75 19.5h6.5',
	BACKSPACE: 'M9 5.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3 12zM12.5 9.5l5 5M17.5 9.5l-5 5',
	CURSORL: 'M14.5 6l-6 6 6 6',
	CURSORR: 'M9.5 6l6 6-6 6',
	PASTE: 'M8 5h8a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9.5 3.5h5v3h-5z',
	IME: 'M5 6h14a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5V8.5A2.5 2.5 0 0 1 5 6zM6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14.5h8',
	SEARCH: 'M17.5 11a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0zM16 16l4.5 4.5',
	CHECK: 'M5 12.5l4.5 4.5L19 7.5',
	BACK: 'M10 6l-6 6 6 6M4 12h16'
};

const LineIcon = ({name, size, className}) => (
	<svg
		className={className || css.keyIcon}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d={LINE_ICON_PATHS[name]} />
	</svg>
);

const Hint = ({cap, children}) => (
	<div className={css.hint}>
		<span className={css.keycap}>{cap}</span>
		{children}
	</div>
);

const GLASS_FOCUS_FILL = '#F5F7FA';
const GLASS_FOCUS_INK = '#0B0D12';
const GLASS_GLOW = '0 20px 52px rgba(0, 0, 0, 0.55), 0 0 56px rgba(255, 255, 255, 0.16)';
const GLASS_PANEL_SHADOW = '0 48px 120px rgba(0, 0, 0, 0.55)';
const DOCK_SHADOW = '0 -60px 120px rgba(0, 0, 0, 0.5)';

const buildPalette = (theme) => {
	const b = theme.borders;
	const c = theme.colors;
	const accentRgb = toRgbTriplet(c.accent);
	const accentLift = accentRgb.split(', ').map((part) => Math.round(Number(part) + (255 - Number(part)) * 0.55)).join(', ');
	return {
		panel: toCssColor(c.surface),
		panelBorder: `${b.cardBorder.width}px solid ${toCssColor(b.cardBorder.color)}`,
		panelRadius: radiusToCss(b.cardRadius),
		idleKey: toCssColorWithAlpha(c.surfaceVariant, 0.92),
		idleKeyBorder: `${b.chipBorder.width}px solid ${toCssColor(b.chipBorder.color)}`,
		selectedKey: toCssColor(c.buttonFocused),
		selectedKeyBorder: `${b.focusBorder.width}px solid ${toCssColor(b.focusBorder.color)}`,
		textPrimary: toCssColor(c.onSurface),
		textMuted: toCssColorWithAlpha(c.onSurface, 0.64),
		textOnSelected: toCssColor(c.onButtonFocused),
		chipBackground: toCssColor(b.chipBackground),
		chipRadius: radiusToCss(b.chipRadius),
		focusGlow: b.focusGlow.length ? b.focusGlow.map(shadowToCss).join(', ') : 'none',
		accent: toCssColor(c.accent),
		accentInk: inkOn(c.accent) === '0, 0, 0' ? '#04131A' : '#FFFFFF',
		accentText: `rgb(${accentLift})`,
		accentWash: `rgba(${accentRgb}, 0.2)`,
		accentSoft: `rgba(${accentRgb}, 0.14)`,
		accentLine: `2px solid rgba(${accentRgb}, 0.38)`,
		accentRing: `0 0 0 10px rgba(${accentRgb}, 0.18)`,
		accentGlow: `0 24px 60px rgba(${accentRgb}, 0.28)`
	};
};

const keyContent = (label, selected, palette, width, shifted) => {
	if (label === 'SHIFT') {
		const idleColor = shifted ? palette.accent : palette.textPrimary;
		return <KeyIcon name={shifted ? 'SHIFT_LOCKED' : 'SHIFT'} color={selected ? palette.textOnSelected : idleColor} />;
	}
	if (label === 'SPACE') {
		return (
			<div
				className={css.spaceBar}
				style={{width: width * 0.5, background: selected ? palette.textOnSelected : palette.textMuted, opacity: 0.65}}
			/>
		);
	}
	if (label === 'DONE' || label === 'IME') {
		return <KeyIcon name={label} color={selected ? palette.textOnSelected : palette.accent} />;
	}
	if (ICON_PATHS[label]) {
		return <KeyIcon name={label} color={selected ? palette.textOnSelected : palette.textPrimary} />;
	}
	return label;
};

const glassKeyContent = (label, shifted, search) => {
	if (label === 'SHIFT') return <LineIcon name={shifted ? 'SHIFT_LOCKED' : 'SHIFT'} size={40} />;
	if (label === '123' || label === 'ABC') return <span className={css.glassWord}>{label}</span>;
	if (label === 'SPACE') return <span className={css.glassSpace}>{$L('space')}</span>;
	if (label === 'DONE') return <span className={css.glassWord}>{search ? $L('Search') : $L('Done')}</span>;
	if (LINE_ICON_PATHS[label]) return <LineIcon name={label} size={label === 'BACKSPACE' ? 42 : 36} />;
	return label;
};

const glassKeyColors = (label, selected, palette) => {
	if (selected) return {background: GLASS_FOCUS_FILL, color: GLASS_FOCUS_INK};
	if (label === 'DONE') return {background: palette.accentWash, color: palette.accentText};
	if (label === 'SPACE') return {background: 'rgba(255, 255, 255, 0.035)', color: 'rgba(255, 255, 255, 0.45)'};
	// Every action key has a name, and every key that types has one character
	if (label.length > 1) return {background: 'rgba(255, 255, 255, 0.035)', color: 'rgba(255, 255, 255, 0.62)'};
	return {background: 'rgba(255, 255, 255, 0.075)', color: 'rgba(255, 255, 255, 0.92)'};
};

const keyStyle = (glass, selected, width, marginRight, palette, glow, label) => {
	const size = {
		width: width > 0 ? width : undefined,
		flex: width > 0 ? undefined : 1,
		marginRight
	};
	if (glass) {
		return {
			...size,
			...glassKeyColors(label, selected, palette),
			boxShadow: selected ? glow : 'none',
			transform: selected ? 'scale(1.12)' : 'none',
			zIndex: selected ? 2 : undefined
		};
	}
	return {
		...size,
		background: selected ? palette.selectedKey : palette.idleKey,
		border: selected ? palette.selectedKeyBorder : palette.idleKeyBorder,
		borderRadius: palette.chipRadius,
		color: selected ? palette.textOnSelected : palette.textPrimary,
		boxShadow: selected ? glow : 'none'
	};
};

// A press only changes two keys, so each one renders on its own props and the
// rest of the grid is left alone.
const Key = memo(({label, row, col, selected, width, marginRight, palette, glow, shifted, hasAlternates, glass, search, onClick, onHoldStart, onHoldEnd, children}) => (
	<div
		className={glass ? `${css.key} ${css.glassKey}` : css.key}
		data-row={row}
		data-col={col}
		data-key={label}
		style={keyStyle(glass, selected, width, marginRight, palette, glow, label)}
		onClick={onClick}
		onMouseDown={onHoldStart}
		onMouseUp={onHoldEnd}
		onMouseLeave={onHoldEnd}
	>
		{glass ? glassKeyContent(label, shifted, search) : keyContent(label, selected, palette, width, shifted)}
		{hasAlternates && !glass && (
			<div
				className={css.alternatesDot}
				style={{background: selected ? palette.textOnSelected : palette.textMuted, opacity: 0.55}}
			/>
		)}
		{children}
	</div>
));

const Chip = memo(({value, index, selected, palette, glow, glass, search, onClick}) => (
	<div
		className={glass ? `${css.chip} ${css.glassChip}` : css.chip}
		data-index={index}
		style={glass ? {
			background: selected ? GLASS_FOCUS_FILL : 'rgba(255, 255, 255, 0.06)',
			color: selected ? GLASS_FOCUS_INK : 'rgba(255, 255, 255, 0.86)',
			boxShadow: selected ? glow : 'none'
		} : {
			background: selected ? palette.selectedKey : palette.chipBackground,
			border: selected ? palette.selectedKeyBorder : palette.idleKeyBorder,
			borderRadius: palette.chipRadius,
			color: selected ? palette.textOnSelected : palette.textPrimary,
			boxShadow: selected ? glow : 'none'
		}}
		onClick={onClick}
	>
		{glass && search && <LineIcon name="SEARCH" size={26} className={css.chipIcon} />}
		{glass ? <span className={css.chipText}>{value}</span> : value}
	</div>
));

// Each column is an offset and a width. Keys are placed by percent of these totals,
// so the whole block scales with its box.
const DOCK_GEOMETRY = {
	columns: [[0, 72], [96, 52], [152, 52], [208, 52], [264, 52], [320, 52], [376, 52], [432, 52], [488, 52], [544, 52], [600, 52], [676, 148]],
	width: 824,
	rowHeight: 48,
	rowStep: 54,
	height: 210
};

const PAD_GEOMETRY = {
	columns: [[0, 84], [90, 84], [180, 84]],
	width: 264,
	rowHeight: 48,
	rowStep: 54,
	height: 264
};

const percent = (value, total) => `${(value / total) * 100}%`;

// Kept per box so a key's props stay the same between presses and only the keys
// that change render again.
const placeCache = new WeakMap();

const placeBox = (geometry, box) => {
	if (!placeCache.has(box)) {
		const left = geometry.columns[box.col][0];
		const last = geometry.columns[box.lastCol];
		const top = box.row * geometry.rowStep;
		placeCache.set(box, {
			left: percent(left, geometry.width),
			width: percent(last[0] + last[1] - left, geometry.width),
			top: percent(top, geometry.height),
			height: percent(box.lastRow * geometry.rowStep + geometry.rowHeight - top, geometry.height)
		});
	}
	return placeCache.get(box);
};

const DOCK_RAIL_LABELS = {MODE_LOWER: 'abc', MODE_UPPER: 'ABC', MODE_NUM: '123'};

const dockKeyContent = (label, kind, search) => {
	if (kind === 'action') {
		const done = label === 'DONE';
		return (
			<>
				<LineIcon name={done ? (search ? 'SEARCH' : 'CHECK') : 'BACKSPACE'} size={48} className={css.dockActionIcon} />
				{done ? (search ? $L('Search') : $L('Done')) : $L('Delete')}
			</>
		);
	}
	if (DOCK_RAIL_LABELS[label]) return DOCK_RAIL_LABELS[label];
	if (label === 'SPACE') return $L('space');
	// Only the number pad has Done as a plain cell, and it never searches
	if (label === 'DONE') return <LineIcon name="CHECK" size={40} />;
	if (LINE_ICON_PATHS[label]) return <LineIcon name={label} size={label === 'IME' ? 44 : 40} />;
	return label;
};

const dockKeyClass = (label, kind, active) => {
	if (kind === 'rail') return active ? `${css.dockKey} ${css.dockRail} ${css.dockRailActive}` : `${css.dockKey} ${css.dockRail}`;
	if (kind === 'space') return `${css.dockKey} ${css.dockSpace}`;
	if (kind === 'action') return `${css.dockKey} ${css.dockAction} ${label === 'DONE' ? css.dockDone : css.dockDelete}`;
	return label.length > 1 ? `${css.dockKey} ${css.dockIconKey}` : css.dockKey;
};

const dockKeyStyle = (label, kind, place, selected, palette, glow) => {
	const done = label === 'DONE';
	const doneAction = done && kind === 'action';
	let border;
	if (selected && (doneAction || kind === 'space')) border = '2px solid transparent';
	else if (doneAction) border = palette.accentLine;
	let color;
	if (selected) color = palette.accentInk;
	else if (done) color = palette.accentText;
	let background;
	if (selected) background = palette.accent;
	else if (doneAction) background = palette.accentSoft;
	return {
		...place,
		background,
		border,
		color,
		fontWeight: selected ? 600 : undefined,
		boxShadow: selected ? glow : undefined,
		zIndex: selected ? 2 : undefined
	};
};

const DockKey = memo(({label, row, col, kind, place, selected, active, palette, glow, hasAlternates, search, onClick, onHoldStart, onHoldEnd, children}) => (
	<div
		className={dockKeyClass(label, kind, active)}
		data-row={row}
		data-col={col}
		data-key={label}
		style={dockKeyStyle(label, kind, place, selected, palette, glow)}
		onClick={onClick}
		onMouseDown={onHoldStart}
		onMouseUp={onHoldEnd}
		onMouseLeave={onHoldEnd}
	>
		{dockKeyContent(label, kind, search)}
		{hasAlternates && !selected && <div className={css.dockDot} />}
		{children}
	</div>
));

// Where a step up or down lands. Cells still holding the same key are passed over,
// so a key two rows tall takes one press to cross.
const rowAfter = (layout, row, col, dRow) => {
	const key = layout[row][Math.min(col, layout[row].length - 1)];
	let next = row + dRow;
	while (next >= 0 && next < layout.length && layout[next][Math.min(col, layout[next].length - 1)] === key) next += dRow;
	return next;
};

// Where a step along a row lands, the next cell holding a different key, wrapping
// around the row.
const colAfter = (line, col, dCol) => {
	let next = col;
	do {
		next = (next + dCol + line.length) % line.length;
	} while (line[next] === line[col] && next !== col);
	return next;
};

class TVKeyboardHost extends Component {
	constructor(props) {
		super(props);
		this.state = {
			session: null,
			textState: textModel.makeState(''),
			shifted: false,
			numericPage: false,
			revealed: false,
			row: 0,
			col: 0,
			popup: null,
			suggestions: [],
			gridWidth: 0
		};
		this.pause = new Pause('TVKeyboard');
		this.enterHeld = false;
		this.pendingAlternate = false;
		this.suggestTimer = null;
		this.holdTimer = null;
		this.enterHoldTimer = null;
		this.suppressClick = false;
		this.panelRef = null;
		this.popupRef = null;
		this.gridRef = null;
		this.paletteSource = null;
		this.palette = null;
	}

	componentDidMount() {
		this.unregister = registerKeyboardHost(this);
	}

	componentDidUpdate(prevProps, prevState) {
		// Only when a row opens. Stepping along it leaves the box where it was, and
		// measuring on every press costs a layout the sets here can feel.
		if (this.state.popup && this.state.popup.options !== prevState.popup?.options) this.clampPopup();
		if (this.state.session && prevProps.keyboardStyle !== this.props.keyboardStyle) {
			this.measure();
			this.revealAnchor();
		}
	}

	componentWillUnmount() {
		this.unregister?.();
		this.teardownSession();
	}

	open = (options) => {
		if (this.state.session) this.teardownSession();
		this.setState({
			session: options,
			textState: textModel.makeState(options.value || ''),
			shifted: false,
			numericPage: false,
			revealed: false,
			row: 0,
			// The docked rail sits in the first column, so typing starts one over from it
			col: this.look() === 'docked' && options.purpose !== 'numeric' ? 1 : 0,
			popup: null,
			suggestions: [],
			gridWidth: 0
		}, () => {
			this.measure();
			this.revealAnchor();
			this.scheduleSuggestions(options.value || '');
		});
		this.pause.pause();
		window.addEventListener('keydown', this.handleKeyDown, true);
		window.addEventListener('keyup', this.handleKeyUp, true);
		window.addEventListener('resize', this.measure);
		publishTvKeyboardVisibility(true, options.anchor || null);
	};

	close = (submitted, reason) => {
		const {session} = this.state;
		if (!session) return;
		this.teardownSession();
		this.setState({session: null});
		publishTvKeyboardVisibility(false, null);
		session.onClose?.({submitted: !!submitted, reason});
	};

	teardownSession() {
		window.removeEventListener('keydown', this.handleKeyDown, true);
		window.removeEventListener('keyup', this.handleKeyUp, true);
		window.removeEventListener('resize', this.measure);
		this.pause.resume();
		clearTimeout(this.suggestTimer);
		clearTimeout(this.holdTimer);
		clearTimeout(this.enterHoldTimer);
		this.suggestTimer = null;
		this.holdTimer = null;
		this.enterHoldTimer = null;
		this.enterHeld = false;
		this.pendingAlternate = false;
		this.suppressClick = false;
	}

	measure = () => {
		if (!this.gridRef) return;
		const width = this.gridRef.clientWidth;
		if (width && width !== this.state.gridWidth) this.setState({gridWidth: width});
	};

	// The panel covers the bottom of the screen, so a field sitting under it gets
	// scrolled up above the keys where possible.
	revealAnchor() {
		window.requestAnimationFrame(() => {
			const {session} = this.state;
			const anchor = session?.anchor;
			if (!anchor || !this.panelRef) return;
			try {
				const panelTop = this.panelRef.getBoundingClientRect().top;
				const anchorRect = anchor.getBoundingClientRect();
				const overlap = anchorRect.bottom - (panelTop - 24);
				if (overlap <= 0) return;
				let node = anchor.parentElement;
				while (node) {
					const style = window.getComputedStyle(node);
					const scrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
						node.scrollHeight > node.clientHeight;
					if (scrollable) {
						node.scrollTop += overlap;
						return;
					}
					node = node.parentElement;
				}
			} catch {
				// Leave the page where it is when the layout cant be measured
			}
		});
	}

	// Every key carries its colors inline, so this would otherwise re-read the whole
	// theme on each keystroke.
	getPalette() {
		if (this.paletteSource !== this.props.theme) {
			this.paletteSource = this.props.theme;
			this.palette = buildPalette(this.props.theme);
		}
		return this.palette;
	}

	usesNumberPad() {
		return this.state.session?.purpose === 'numeric';
	}

	look() {
		const {keyboardStyle} = this.props;
		return keyboardStyle === 'glass' || keyboardStyle === 'docked' ? keyboardStyle : 'classic';
	}

	// The docked rail takes the first column, which the suggestions above it don't have.
	railOffset() {
		return this.look() === 'docked' && !this.usesNumberPad() ? 1 : 0;
	}

	layout() {
		if (this.usesNumberPad()) return NUMBER_PAD_LAYOUT;
		const docked = this.look() === 'docked';
		if (this.state.numericPage) return docked ? DOCKED_NUMERIC_LAYOUT : NUMERIC_LAYOUT;
		const variant = variantForLocale(this.props.uiLanguage);
		if (docked) return dockedFor(variant, this.state.shifted);
		return this.state.shifted ? upperFor(variant) : lowerFor(variant);
	}

	chips() {
		const {session, textState, suggestions} = this.state;
		if (!session) return [];
		const text = textState.text;
		const purpose = session.purpose || 'text';
		if (purpose === 'url') {
			const query = text.toLowerCase();
			const recents = (session.recents || [])
				.filter((entry) => !query || (entry.toLowerCase().indexOf(query) >= 0 && entry !== text))
				.slice(0, 5)
				.map((value) => ({value, replaceOnTap: true}));
			return recents.concat(URL_CHIPS.map((value) => ({value})));
		}
		if (purpose === 'email') {
			return EMAIL_CHIPS.map((value) => ({value}));
		}
		if (purpose === 'username') {
			return (session.recents || []).slice(0, 5).map((value) => ({value, submitOnTap: true}));
		}
		if (purpose === 'search') {
			if (!text) return (session.recents || []).slice(0, 5).map((value) => ({value, submitOnTap: true}));
			return suggestions.map((value) => ({value, submitOnTap: true}));
		}
		if (session.password && purpose !== 'numeric') {
			return [{value: this.state.revealed ? $L('Hide password') : $L('Show password'), reveal: true}];
		}
		return [];
	}

	scheduleSuggestions(text) {
		const {session} = this.state;
		clearTimeout(this.suggestTimer);
		if (!session || session.purpose !== 'search' || !session.suggestionsBuilder || !text) return;
		this.suggestTimer = setTimeout(() => {
			Promise.resolve(session.suggestionsBuilder(text)).then((results) => {
				const current = this.state;
				if (current.session !== session || current.textState.text !== text) return;
				const unique = [];
				(results || []).forEach((value) => {
					if (value && value !== text && unique.indexOf(value) < 0) unique.push(value);
				});
				this.setState({suggestions: unique.slice(0, 5)});
			}).catch(() => {});
		}, SUGGESTION_DEBOUNCE_MS);
	}

	applyText(next) {
		const {session, textState} = this.state;
		if (!session || next === textState) return;
		this.setState({textState: next}, () => {
			// The chip row follows the text, so a shrinking list cant strand the selection
			if (this.state.row === -1) {
				const count = this.chips().length;
				if (count === 0) this.setState({row: 0});
				else if (this.state.col > count - 1) this.setState({col: count - 1});
			}
		});
		if (next.text !== textState.text) this.scheduleSuggestions(next.text);
		session.onChange?.(next.text, next.cursor);
	}

	insert(value) {
		const {session, textState} = this.state;
		const maxLength = Number(session?.maxLength);
		if (Number.isFinite(maxLength) && maxLength > 0 &&
			textState.text.length + value.length > maxLength) return;
		this.applyText(textModel.insertText(textState, value));
	}

	paste() {
		if (!navigator.clipboard?.readText) return;
		navigator.clipboard.readText().then((raw) => {
			const cleaned = String(raw || '').replace(/[\r\n]+$/, '').replace(/[\r\n]+/g, ' ');
			if (cleaned) this.insert(cleaned);
		}).catch(() => {});
	}

	requestSystemKeyboard() {
		const {session} = this.state;
		this.close(false);
		session?.onSystemKeyboard?.();
	}

	switchPage() {
		this.setState((prev) => ({numericPage: !prev.numericPage, shifted: false}), () => {
			const layout = this.layout();
			this.setState((prev) => {
				if (prev.row < 0) return null;
				const row = Math.min(prev.row, layout.length - 1);
				return {row, col: Math.min(prev.col, layout[row].length - 1)};
			});
		});
	}

	act(key) {
		switch (key) {
			case 'BACKSPACE':
				this.applyText(textModel.backspace(this.state.textState));
				break;
			case 'SPACE':
				this.insert(' ');
				break;
			case 'SHIFT':
				this.setState((prev) => ({shifted: !prev.shifted}));
				break;
			case 'CURSORL':
				this.applyText(textModel.moveCursor(this.state.textState, -1));
				break;
			case 'CURSORR':
				this.applyText(textModel.moveCursor(this.state.textState, 1));
				break;
			case 'PASTE':
				this.paste();
				break;
			case 'DONE':
				this.close(true);
				break;
			case '123':
			case 'ABC':
				this.switchPage();
				break;
			case 'IME':
				this.openStylePicker();
				break;
			case 'MODE_LOWER':
			case 'MODE_UPPER':
			case 'MODE_NUM':
				this.setState({shifted: key === 'MODE_UPPER', numericPage: key === 'MODE_NUM'});
				break;
			default:
				this.insert(key);
		}
	}

	activateChip(chip) {
		if (!chip) return;
		if (chip.reveal) {
			this.setState((prev) => ({revealed: !prev.revealed}), () => this.state.session?.onReveal?.(this.state.revealed));
			return;
		}
		if (chip.submitOnTap || chip.replaceOnTap) {
			this.applyText(textModel.makeState(chip.value));
		} else {
			this.insert(chip.value);
		}
		if (chip.submitOnTap) this.close(true);
	}

	openAlternates(key, viaHold) {
		const options = alternatesFor(key);
		if (!options) return;
		this.setState({popup: {options, index: 0, awaitRelease: !!viaHold, shift: 0}});
	}

	setPopupRef = (node) => {
		this.popupRef = node;
	};

	// The row is centred on its key, so one near either end of the keyboard hangs off
	// the screen. How far it hangs off is only known once it has been laid out.
	clampPopup() {
		const {popup} = this.state;
		if (!popup || !this.popupRef) return;
		const box = this.popupRef.getBoundingClientRect();
		const overLeft = MIN_POPUP_EDGE_GAP - box.left;
		const overRight = box.right - (window.innerWidth - MIN_POPUP_EDGE_GAP);
		const shift = overLeft > 0 ? overLeft : (overRight > 0 ? -overRight : 0);
		if (!shift) return;
		this.setState({popup: {...popup, shift}});
	}

	openStylePicker() {
		const options = getKeyboardStyleOptions().map((option) => option.value);
		this.setState({popup: {options, index: Math.max(options.indexOf(this.look()), 0), awaitRelease: false, shift: 0, picker: true}});
	}

	// Saving the style switches this keyboard too, since its look comes from the setting
	pickStyle(style) {
		this.props.updateSetting('keyboardStyle', style);
		if (style === 'native') {
			this.requestSystemKeyboard();
			return;
		}
		this.setState({shifted: false, numericPage: false, row: 0, col: style === 'docked' ? 1 : 0});
	}

	commitPopup(value) {
		const {popup} = this.state;
		this.setState({popup: null});
		if (popup?.picker) this.pickStyle(value);
		else this.insert(value);
	}

	selectedKey() {
		const {row, col} = this.state;
		if (row < 0) return null;
		const layout = this.layout();
		const line = layout[Math.min(row, layout.length - 1)];
		return line[Math.min(col, line.length - 1)];
	}

	// Whether up has anywhere left to go inside the keyboard.
	atTopRow() {
		const {row, col} = this.state;
		if (row === -1) return true;
		return this.chips().length === 0 && rowAfter(this.layout(), row, col, -1) < 0;
	}

	// Up from the top row is a way out for screens that name somewhere to go, so
	// the keyboard can be left without finding the done key. A screen with nowhere
	// to send focus says so and the keyboard stays where it is.
	exitTop() {
		const {session} = this.state;
		if (!session?.onExitTop) return false;
		if (session.onExitTop() === false) return false;
		this.close(true, 'exitTop');
		return true;
	}

	// A shortcut presses a key of the layout on screen, so one whose key isnt there,
	// like space on the number pad, does nothing.
	shortcutKey(code) {
		const keys = XBOX_SHORTCUTS[code];
		if (!keys) return null;
		// The docked rail stands in for shift and the page key, so their shortcuts still work there
		if (this.railOffset()) {
			if (keys[0] === 'SHIFT') return this.state.numericPage ? null : 'SHIFT';
			if (keys[0] === '123') return '123';
		}
		const layout = this.layout();
		return keys.find((key) => layout.some((line) => line.indexOf(key) >= 0)) || null;
	}

	// The first step lands on the suggestion at that end, the next ones walk along.
	stepChips(step) {
		const count = this.chips().length;
		if (!count) return;
		this.setState((prev) => (prev.row === -1
			? {col: (Math.min(prev.col, count - 1) + step + count) % count}
			: {row: -1, col: step > 0 ? 0 : count - 1}));
	}

	move(dRow, dCol) {
		const layout = this.layout();
		const chips = this.chips();
		const offset = this.railOffset();
		this.setState((prev) => {
			let {row, col} = prev;
			if (row === -1) {
				if (dRow > 0) {
					row = 0;
					col = Math.min(col + offset, layout[0].length - 1);
				} else if (dCol !== 0 && chips.length) {
					col = (col + dCol + chips.length) % chips.length;
				}
			} else if (dRow !== 0) {
				const next = rowAfter(layout, row, col, dRow);
				if (next < 0) {
					if (chips.length) {
						row = -1;
						col = Math.min(Math.max(col - offset, 0), chips.length - 1);
					}
				} else if (next <= layout.length - 1) {
					row = next;
					col = Math.min(col, layout[next].length - 1);
				}
			} else {
				col = colAfter(layout[row], col, dCol);
			}
			return {row, col, popup: null};
		});
	}

	handleKeyDown = (e) => {
		if (!this.state.session) return;
		e.preventDefault();
		e.stopPropagation();
		const code = e.keyCode || e.which;
		const {popup} = this.state;
		const isBack = code === 461 || code === 10009 || code === 27;

		if (code === 13) {
			if (this.enterHeld) {
				if (popup) return;
				if (this.pendingAlternate) {
					this.pendingAlternate = false;
					this.openAlternates(this.selectedKey(), true);
					return;
				}
				const heldKey = this.selectedKey();
				if (heldKey && REPEATABLE_KEYS.indexOf(heldKey) >= 0) this.act(heldKey);
				return;
			}
			this.enterHeld = true;
			if (popup) {
				if (!popup.awaitRelease) this.commitPopup(popup.options[popup.index]);
				return;
			}
			if (this.state.row === -1) {
				const chips = this.chips();
				this.activateChip(chips[Math.min(this.state.col, chips.length - 1)]);
				return;
			}
			const key = this.selectedKey();
			if (alternatesFor(key)) {
				// Timed rather than counting repeats, since the sets here dont all send
				// a fresh keydown while the button stays down.
				this.pendingAlternate = true;
				clearTimeout(this.enterHoldTimer);
				this.enterHoldTimer = setTimeout(() => {
					this.enterHoldTimer = null;
					if (!this.pendingAlternate) return;
					this.pendingAlternate = false;
					this.openAlternates(this.selectedKey(), true);
				}, LONG_PRESS_MS);
				return;
			}
			this.act(key);
			return;
		}

		if (popup) {
			if (code === 37 || code === 38) {
				this.setState({popup: {...popup, index: (popup.index - 1 + popup.options.length) % popup.options.length}});
			} else if (code === 39 || code === 40) {
				this.setState({popup: {...popup, index: (popup.index + 1) % popup.options.length}});
			} else if (isBack) {
				this.setState({popup: null});
			}
			return;
		}

		if (code === 8) {
			this.act('BACKSPACE');
			return;
		}
		// The Xbox controller's Menu button, as a quicker way to the done key
		if (code === 93) {
			this.act('DONE');
			return;
		}
		if (isXbox()) {
			const shortcut = this.shortcutKey(code);
			if (shortcut) {
				this.act(shortcut);
				return;
			}
			if (XBOX_CHIP_STEPS[code]) {
				this.stepChips(XBOX_CHIP_STEPS[code]);
				return;
			}
		}
		if (code === 37) return this.move(0, -1);
		if (code === 39) return this.move(0, 1);
		if (code === 38) {
			if (this.atTopRow() && this.exitTop()) return;
			return this.move(-1, 0);
		}
		if (code === 40) return this.move(1, 0);
		if (isBack) {
			this.pendingAlternate = false;
			this.close(false);
			return;
		}
		// A real keyboard plugged into the TV types straight into the field
		if (e.key && e.key.length === 1 && e.key.charCodeAt(0) >= 32) {
			this.insert(e.key);
		}
	};

	handleKeyUp = (e) => {
		if (!this.state.session) return;
		e.preventDefault();
		e.stopPropagation();
		const code = e.keyCode || e.which;
		if (code !== 13) return;
		const {popup} = this.state;
		clearTimeout(this.enterHoldTimer);
		this.enterHoldTimer = null;
		if (popup?.awaitRelease) {
			this.setState({popup: {...popup, awaitRelease: false}});
			this.enterHeld = false;
			return;
		}
		if (this.pendingAlternate) {
			this.pendingAlternate = false;
			this.act(this.selectedKey());
		}
		this.enterHeld = false;
	};

	handleOverlayClick = () => this.close(true);

	handlePanelClick = (e) => e.stopPropagation();

	setPanelRef = (node) => {
		this.panelRef = node;
	};

	setGridRef = (node) => {
		this.gridRef = node;
	};

	handleKeyClick = (e) => {
		if (this.suppressClick) {
			this.suppressClick = false;
			return;
		}
		const {row, col, key} = e.currentTarget.dataset;
		this.setState({row: Number(row), col: Number(col), popup: null});
		this.act(key);
	};

	handleKeyHoldStart = (e) => {
		const {row, col, key} = e.currentTarget.dataset;
		if (key !== 'BACKSPACE' && !alternatesFor(key)) return;
		clearTimeout(this.holdTimer);
		this.holdTimer = setTimeout(() => {
			this.suppressClick = true;
			this.setState({row: Number(row), col: Number(col)});
			if (key === 'BACKSPACE') {
				this.applyText(textModel.clearText());
			} else {
				this.openAlternates(key, false);
			}
		}, LONG_PRESS_MS);
	};

	handleKeyHoldEnd = () => {
		clearTimeout(this.holdTimer);
		this.holdTimer = null;
	};

	handleChipClick = (e) => {
		const chips = this.chips();
		this.activateChip(chips[Number(e.currentTarget.dataset.index)]);
	};

	// The popup sits inside its key, so a click on it would press that key again
	handlePopupClick = (e) => {
		e.stopPropagation();
		this.commitPopup(e.currentTarget.dataset.value);
	};

	renderPopup(palette, look) {
		const {popup} = this.state;
		const classic = look === 'classic';
		const styles = popup.picker ? getKeyboardStyleOptions() : null;
		let className = classic ? css.alternatesPopup : `${css.alternatesPopup} ${css.popupPanel}`;
		if (styles) className += ` ${css.stylePicker}`;
		return (
			<div
				ref={this.setPopupRef}
				className={className}
				style={classic ? {
					background: palette.panel,
					border: palette.panelBorder,
					borderRadius: palette.panelRadius,
					marginLeft: popup.shift
				} : {marginLeft: popup.shift}}
			>
				{popup.options.map((option, index) => {
					const isSelected = index === popup.index;
					let style = null;
					if (classic) {
						style = {
							background: isSelected ? palette.selectedKey : 'transparent',
							border: isSelected ? palette.selectedKeyBorder : '1px solid transparent',
							borderRadius: palette.chipRadius,
							color: isSelected ? palette.textOnSelected : palette.textMuted,
							boxShadow: isSelected ? palette.focusGlow : 'none'
						};
					} else if (isSelected) {
						style = look === 'glass'
							? {background: GLASS_FOCUS_FILL, color: GLASS_FOCUS_INK}
							: {background: palette.accent, color: palette.accentInk};
					}
					return (
						<div
							key={option}
							className={classic ? css.alternateOption : `${css.alternateOption} ${css.popupOption}`}
							data-value={option}
							style={style}
							onClick={this.handlePopupClick}
						>
							{styles ? styles[index].label : option}
							{styles && option === look && <LineIcon name="CHECK" size={32} className={css.pickerCheck} />}
						</div>
					);
				})}
			</div>
		);
	}

	renderGrid(palette, glow, look) {
		const layout = this.layout();
		const uniform = this.usesNumberPad();
		const {row, col, popup, gridWidth, shifted, session} = this.state;
		const base = gridWidth > 0 ? gridWidth / maxRowSpan(layout, uniform) : 0;
		const spacing = base * KEY_GAP_FACTOR;
		const glass = look === 'glass';
		const search = session.purpose === 'search';
		return (
			<div className={css.grid} ref={this.setGridRef}>
				{layout.map((line, rowIndex) => (
					<div key={rowIndex} className={css.gridRow}>
						{line.map((key, colIndex) => {
							const isSelected = row === rowIndex && col === colIndex;
							return (
								<Key
									key={`${rowIndex}-${colIndex}`}
									label={key}
									row={rowIndex}
									col={colIndex}
									selected={isSelected}
									width={base * keyUnitSpan(key, uniform)}
									marginRight={colIndex === line.length - 1 ? 0 : spacing}
									palette={palette}
									glow={glow}
									shifted={key === 'SHIFT' && shifted}
									hasAlternates={!!alternatesFor(key)}
									glass={glass}
									search={glass && key === 'DONE' && search}
									onClick={this.handleKeyClick}
									onHoldStart={this.handleKeyHoldStart}
									onHoldEnd={this.handleKeyHoldEnd}
								>
									{popup && isSelected ? this.renderPopup(palette, look) : null}
								</Key>
							);
						})}
					</div>
				))}
			</div>
		);
	}

	renderChips(palette, glow, look) {
		const chips = this.chips();
		const glass = look === 'glass';
		// The accents hint keeps the Glass header up even with nothing to suggest
		if (!chips.length && (!glass || this.usesNumberPad())) return null;
		const {row, col, session} = this.state;
		const activeIndex = row === -1 ? Math.min(col, chips.length - 1) : -1;
		const search = glass && session.purpose === 'search';
		const chipNodes = chips.map((chip, index) => (
			<Chip
				key={`${chip.value}-${index}`}
				value={chip.value}
				index={index}
				selected={index === activeIndex}
				palette={palette}
				glow={glow}
				glass={glass}
				search={search}
				onClick={this.handleChipClick}
			/>
		));
		if (!glass) return <div className={css.chipBar}>{chipNodes}</div>;
		return (
			<div className={css.glassHeader}>
				<div className={css.glassChips}>{chipNodes}</div>
				<Hint cap="OK">{$L('hold for accents')}</Hint>
			</div>
		);
	}

	// The dock can cover the field, so it shows the text itself. The ghost finishes
	// the first suggestion that starts with what has been typed and would replace it.
	renderEcho(palette, numberPad, chips) {
		const {session, textState, revealed} = this.state;
		const shown = session.password && !revealed ? textState.text.replace(/[\s\S]/g, '•') : textState.text;
		const after = shown.slice(textState.cursor);
		let ghost = '';
		if (!session.password && !after && shown) {
			const typed = shown.toLowerCase();
			const match = chips.find((chip) => (chip.submitOnTap || chip.replaceOnTap) &&
				chip.value.length > shown.length && chip.value.toLowerCase().indexOf(typed) === 0);
			if (match) ghost = match.value.slice(shown.length);
		}
		return (
			<div className={css.echoRow}>
				<div className={css.echo}>
					<span className={css.echoLine}>
						{shown.slice(0, textState.cursor)}
						<span className={css.caret} style={{background: palette.accent}} />
						{after}
						{ghost && <span className={css.ghost}>{ghost}</span>}
					</span>
				</div>
				{!numberPad && (
					<div className={css.dockHints}>
						<Hint cap="OK">{$L('hold for accents')}</Hint>
						<Hint cap={<LineIcon name="BACK" size={22} />}>{$L('close')}</Hint>
					</div>
				)}
			</div>
		);
	}

	renderSuggestions(palette, chips) {
		if (!chips.length) return null;
		const {row, col, textState, session} = this.state;
		const activeIndex = row === -1 ? Math.min(col, chips.length - 1) : -1;
		// A password marked inside the show password chip would give it away.
		const typed = session.password ? '' : textState.text.toLowerCase();
		return (
			<div className={css.suggestions}>
				{chips.map((chip, index) => {
					const selected = index === activeIndex;
					const at = typed ? chip.value.toLowerCase().indexOf(typed) : -1;
					return (
						<div
							key={`${chip.value}-${index}`}
							className={selected ? `${css.suggestion} ${css.suggestionFocused}` : css.suggestion}
							data-index={index}
							style={selected ? {background: palette.accent, color: palette.accentInk} : null}
							onClick={this.handleChipClick}
						>
							{at < 0 ? chip.value : (
								<>
									{chip.value.slice(0, at)}
									<span className={css.match}>{chip.value.slice(at, at + typed.length)}</span>
									{chip.value.slice(at + typed.length)}
								</>
							)}
						</div>
					);
				})}
			</div>
		);
	}

	renderDockKeys(palette, glow, numberPad) {
		const layout = this.layout();
		const geometry = numberPad ? PAD_GEOMETRY : DOCK_GEOMETRY;
		const {row, col, popup, shifted, numericPage, session} = this.state;
		const mode = numericPage ? 'MODE_NUM' : (shifted ? 'MODE_UPPER' : 'MODE_LOWER');
		const search = session.purpose === 'search';
		const lastCol = layout[0].length - 1;
		return (
			<div className={numberPad ? css.dockPad : css.dockGrid}>
				{keyBoxes(layout).map((box) => {
					const selected = row >= box.row && row <= box.lastRow && col >= box.col && col <= box.lastCol;
					let kind = 'cell';
					if (!numberPad) {
						if (box.col === 0) kind = 'rail';
						else if (box.col === lastCol) kind = 'action';
						else if (box.key === 'SPACE') kind = 'space';
					}
					return (
						<DockKey
							key={`${box.row}-${box.col}`}
							label={box.key}
							row={box.row}
							col={box.col}
							kind={kind}
							place={placeBox(geometry, box)}
							selected={selected}
							active={box.key === mode}
							palette={palette}
							glow={glow}
							hasAlternates={!!alternatesFor(box.key)}
							search={search && box.key === 'DONE'}
							onClick={this.handleKeyClick}
							onHoldStart={this.handleKeyHoldStart}
							onHoldEnd={this.handleKeyHoldEnd}
						>
							{popup && selected ? this.renderPopup(palette, 'docked') : null}
						</DockKey>
					);
				})}
			</div>
		);
	}

	renderDocked(palette, high) {
		const numberPad = this.usesNumberPad();
		const chips = this.chips();
		const glow = high ? `${palette.accentRing}, ${palette.accentGlow}` : palette.accentRing;
		return (
			<div className={`${css.overlay} ${css.dockOverlay}`} onClick={this.handleOverlayClick}>
				<div
					className={css.dock}
					ref={this.setPanelRef}
					style={{boxShadow: high ? DOCK_SHADOW : 'none'}}
					onClick={this.handlePanelClick}
				>
					<div className={numberPad ? css.dockPadContent : css.dockContent}>
						{this.renderEcho(palette, numberPad, chips)}
						{this.renderSuggestions(palette, chips)}
						{this.renderDockKeys(palette, glow, numberPad)}
					</div>
				</div>
			</div>
		);
	}

	render() {
		const {session} = this.state;
		if (!session) return null;
		const palette = this.getPalette();
		const look = this.look();
		// Glows and shadows are blurred, which the lower tiers skip as the cards do
		const high = getPerfTier() === 'high';
		if (look === 'docked') return this.renderDocked(palette, high);
		const narrow = this.usesNumberPad();
		if (look === 'glass') {
			const glassGlow = high ? GLASS_GLOW : 'none';
			return (
				<div className={`${css.overlay} ${css.glassOverlay}`} onClick={this.handleOverlayClick}>
					<div
						className={`${css.panel} ${css.glassPanel} ${narrow ? css.glassPanelNarrow : ''}`}
						ref={this.setPanelRef}
						style={{boxShadow: high ? GLASS_PANEL_SHADOW : 'none'}}
						onClick={this.handlePanelClick}
					>
						{this.renderChips(palette, glassGlow, look)}
						{this.renderGrid(palette, glassGlow, look)}
					</div>
				</div>
			);
		}
		const glow = high ? palette.focusGlow : 'none';
		return (
			<div className={css.overlay} onClick={this.handleOverlayClick}>
				<div
					className={`${css.panel} ${narrow ? css.panelNarrow : ''}`}
					ref={this.setPanelRef}
					style={{background: palette.panel, border: palette.panelBorder, borderRadius: palette.panelRadius}}
					onClick={this.handlePanelClick}
				>
					{this.renderChips(palette, glow, look)}
					{this.renderGrid(palette, glow, look)}
				</div>
			</div>
		);
	}
}

const TVKeyboard = () => {
	const {settings, activeTheme, updateSetting} = useSettings();
	return <TVKeyboardHost uiLanguage={settings.uiLanguage} theme={activeTheme} keyboardStyle={settings.keyboardStyle} updateSetting={updateSetting} />;
};

export default TVKeyboard;
