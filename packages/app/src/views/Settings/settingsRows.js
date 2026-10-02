import {useCallback, useEffect, useRef, useState} from 'react';
import Slider from '@enact/sandstone/Slider';

import {renderSettingsIcon, renderToggle, renderChevron} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';

import css from './Settings.module.less';

// The row shapes every settings screen is built from. None of them reach for the settings
// context, so what a row shows and what a press does are both decided by the caller.

export const SectionTitle = ({children}) => <div className={css.sectionTitle}>{children}</div>;

export const ToggleRow = ({settingKey, title, desc, icon, checked, onToggle}) => (
	<SpottableDiv className={css.listItem} onClick={onToggle} spotlightId={`setting-${settingKey}`}>
		{renderSettingsIcon(icon)}
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{title}</div>
			{desc && <div className={css.listItemCaption}>{desc}</div>}
		</div>
		<div className={css.listItemTrailing}>{renderToggle(checked)}</div>
	</SpottableDiv>
);

// A dot of the color an option stands for, in front of its label or the chevron.
export const Swatch = ({color}) => (color
	? <span className={css.swatch} style={{backgroundColor: color}} />
	: null);

export const OptionRow = ({settingKey, title, caption, icon, swatch, onOpen}) => (
	<SpottableDiv className={css.listItem} onClick={onOpen} spotlightId={`setting-${settingKey}`}>
		{renderSettingsIcon(icon)}
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{title}</div>
			<div className={css.listItemCaption}>{caption}</div>
		</div>
		<div className={css.listItemTrailing}>
			<Swatch color={swatch} />
			{renderChevron()}
		</div>
	</SpottableDiv>
);

export const NavRow = ({id, title, desc, icon, onClick}) => (
	<SpottableDiv className={css.listItem} onClick={onClick} spotlightId={`setting-${id}`}>
		{renderSettingsIcon(icon)}
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{title}</div>
			{desc && <div className={css.listItemCaption}>{desc}</div>}
		</div>
		<div className={css.listItemTrailing}>{renderChevron()}</div>
	</SpottableDiv>
);

export const InfoRow = ({id, label, value, icon}) => (
	<SpottableDiv className={css.listItem} spotlightId={`info-${id}`}>
		{renderSettingsIcon(icon)}
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{label}</div>
		</div>
		<div className={css.listItemValue}>{value}</div>
	</SpottableDiv>
);

// Hands the slider's own knob a class this stylesheet can reach
const sliderCss = {knob: css.sliderKnob};

// Saving a setting re-renders everything that reads settings, the home rows behind the
// panel included, which is far too slow for every step of a held key. So the knob moves
// on its own state and the value is saved once the presses stop, focus leaves or the
// screen closes.
const SLIDER_SAVE_DELAY_MS = 500;

export const SliderRow = ({settingKey, title, min, max, step, value, format, icon, onChange}) => {
	const [shown, setShown] = useState(value);
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

	const handleChange = useCallback((e) => {
		setShown(e.value);
		pendingRef.current = e.value;
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(save, SLIDER_SAVE_DELAY_MS);
	}, [save]);

	// A change made somewhere else, like a server sync, still shows unless a press is waiting to save
	useEffect(() => {
		if (pendingRef.current === null) setShown(value);
	}, [value]);

	useEffect(() => save, [save]);

	return (
		<div className={css.sliderContainer} onBlur={save}>
			<div className={css.sliderLabel}>
				<div className={css.sliderTitleGroup}>
					{renderSettingsIcon(icon)}
					<span className={css.sliderTitle}>{title}</span>
				</div>
				<span className={css.sliderValue}>{format ? format(shown) : shown}</span>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={shown}
				onChange={handleChange}
				className={css.settingsSlider}
				css={sliderCss}
				tooltip={false}
				spotlightId={`setting-${settingKey}`}
			/>
		</div>
	);
};
