import {useCallback, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';

import TrackOptionRow from '../TrackOptionRow';
import {ModalContainer} from '../../utils/spotlightContainers';
import {PAGE_THEMES, FONT_SCALE_RANGE, BRIGHTNESS_RANGE, WARMTH_RANGE} from '../../utils/readerSettings';

import css from './EpubReader.module.less';

const SpottableDiv = Spottable('div');

const Choice = ({label, selected, className, ...rest}) => (
	<SpottableDiv
		className={[css.choice, selected && css.choiceOn, className].filter(Boolean).join(' ')}
		data-selected={selected ? 'true' : undefined}
		{...rest}
	>
		{label}
	</SpottableDiv>
);

export const ChromeButton = ({icon, mark, label, ...rest}) => (
	<SpottableDiv className={css.chromeButton} {...rest}>
		{icon && <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>}
		{mark && <span className={css.chromeMark}>{mark}</span>}
		<span>{label}</span>
	</SpottableDiv>
);

const percent = (value) => Math.round(value * 100) + '%';

// Chapters to jump to, and the places this TV has bookmarked in the book.
export const ContentsPanel = ({toc, currentChapter, bookmarks, onOpen}) => {
	const [tab, setTab] = useState('chapters');
	const showChapters = useCallback(() => setTab('chapters'), []);
	const showBookmarks = useCallback(() => setTab('bookmarks'), []);
	const handleOpen = useCallback((ev) => onOpen(ev.currentTarget.dataset.target), [onOpen]);

	const rows = tab === 'chapters'
		? toc.map((entry, index) => (
			<TrackOptionRow
				key={index}
				label={entry.label}
				selected={index === currentChapter}
				data-target={entry.href}
				style={entry.depth ? {paddingLeft: 36 + entry.depth * 32} : undefined}
				onClick={handleOpen}
			/>
		))
		: bookmarks.map((mark) => (
			<TrackOptionRow
				key={mark.cfi}
				label={mark.label}
				detail={mark.percentage != null ? percent(mark.percentage) : null}
				data-target={mark.cfi}
				onClick={handleOpen}
			/>
		));

	return (
		<ModalContainer className={css.panel} spotlightId="epub-panel">
			<h2 className={css.panelTitle}>{$L('Contents')}</h2>
			{/* The tabs only look chosen, so the panel opens on the chapter being read rather than on a tab. */}
			<div className={css.tabs}>
				<Choice label={$L('Chapters')} className={tab === 'chapters' ? css.choiceOn : null} onClick={showChapters} />
				<Choice label={$L('Bookmarks')} className={tab === 'bookmarks' ? css.choiceOn : null} onClick={showBookmarks} />
			</div>
			<div className={css.list}>
				{rows.length > 0 ? rows : (
					<div className={css.empty}>
						{tab === 'chapters' ? $L('No table of contents available') : $L('No bookmarks yet')}
					</div>
				)}
			</div>
		</ModalContainer>
	);
};

const SettingRow = ({label, children}) => (
	<div className={css.settingRow}>
		{label && <div className={css.settingLabel}>{label}</div>}
		<div className={css.settingChoices}>{children}</div>
	</div>
);

const Stepper = ({value, range, step, onChange, smaller = '-', larger = '+'}) => {
	const round = (n) => Math.round(n * 100) / 100;
	const down = useCallback(() => onChange(round(Math.max(range[0], value - step))), [onChange, range, step, value]);
	const up = useCallback(() => onChange(round(Math.min(range[1], value + step))), [onChange, range, step, value]);
	return (
		<>
			<Choice label={smaller} onClick={down} />
			<span className={css.stepValue}>{percent(value)}</span>
			<Choice label={larger} onClick={up} />
		</>
	);
};

const THEME_LABELS = () => ({original: $L('Original'), paper: $L('Paper'), quiet: $L('Quiet'), calm: $L('Calm'), night: $L('Night')});
const FONT_LABELS = () => ({system: $L('System'), serif: $L('Serif'), sans: $L('Sans'), mono: $L('Mono')});
const SPACING_LABELS = () => ({tight: $L('Tight'), normal: $L('Normal'), relaxed: $L('Relaxed')});
const MARGIN_LABELS = () => ({narrow: $L('Narrow'), normal: $L('Normal'), wide: $L('Wide')});

// The page look: theme, type, spacing, and the dim and warmth laid over the page.
export const DisplayPanel = ({settings, onChange}) => {
	const pick = useCallback((ev) => {
		const {key, value} = ev.currentTarget.dataset;
		onChange({[key]: value});
	}, [onChange]);
	const toggle = useCallback((ev) => {
		const {key} = ev.currentTarget.dataset;
		onChange({[key]: !settings[key]});
	}, [onChange, settings]);
	const setFontScale = useCallback((fontScale) => onChange({fontScale}), [onChange]);
	const setBrightness = useCallback((brightness) => onChange({brightness}), [onChange]);
	const setWarmth = useCallback((warmth) => onChange({warmth}), [onChange]);

	const choices = (key, labels) => Object.keys(labels).map((value) => (
		<Choice key={value} label={labels[value]} selected={settings[key] === value} data-key={key} data-value={value} onClick={pick} />
	));
	const themeLabels = THEME_LABELS();

	return (
		<ModalContainer className={css.panel} spotlightId="epub-panel">
			<h2 className={css.panelTitle}>{$L('Display')}</h2>
			<div className={css.list}>
				<SettingRow label={$L('Theme')}>
					{Object.keys(PAGE_THEMES).map((value) => (
						<Choice
							key={value}
							label="Aa"
							aria-label={themeLabels[value]}
							selected={settings.pageTheme === value}
							className={css.swatch}
							style={{background: PAGE_THEMES[value].bg, color: PAGE_THEMES[value].fg}}
							data-key="pageTheme"
							data-value={value}
							onClick={pick}
						/>
					))}
					<span className={css.stepValue}>{themeLabels[settings.pageTheme]}</span>
				</SettingRow>
				<SettingRow label={$L('Font')}>{choices('fontFamily', FONT_LABELS())}</SettingRow>
				<SettingRow label={$L('Text size')}>
					<Stepper value={settings.fontScale} range={FONT_SCALE_RANGE} step={0.1} onChange={setFontScale} smaller="A-" larger="A+" />
				</SettingRow>
				<SettingRow label={$L('Line spacing')}>{choices('lineSpacing', SPACING_LABELS())}</SettingRow>
				<SettingRow label={$L('Margins')}>{choices('margin', MARGIN_LABELS())}</SettingRow>
				<SettingRow>
					<Choice label={$L('Justify')} selected={settings.justify} data-key="justify" onClick={toggle} />
					<Choice label={$L('Bold')} selected={settings.bold} data-key="bold" onClick={toggle} />
				</SettingRow>
				<SettingRow label={$L('Brightness')}>
					<Stepper value={settings.brightness} range={BRIGHTNESS_RANGE} step={0.1} onChange={setBrightness} />
				</SettingRow>
				<SettingRow label={$L('Warmth')}>
					<Stepper value={settings.warmth} range={WARMTH_RANGE} step={0.1} onChange={setWarmth} />
				</SettingRow>
			</div>
		</ModalContainer>
	);
};
