import {useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';

import {MaterialIcon} from '../icons/materialIcons';

import css from './SeerrDialogControls.module.less';

// The remote-friendly controls the Seerr request and issue dialogs are built from.

const SpottableDiv = Spottable('div');

// A row that fills solid when focused and turns its content dark to read on the fill. Without
// onClick it isn't focusable, so the remote skips it.
export const SeerrFocusRow = ({onClick, className, children, ...rest}) => (onClick ? (
	<SpottableDiv {...rest} className={`${css.row} ${css.rowFocusable} ${className || ''}`} onClick={onClick}>
		{children}
	</SpottableDiv>
) : (
	<div className={`${css.row} ${className || ''}`}>{children}</div>
));

// A switch or checkbox row. onChange gets the new value and the click event.
export const SeerrToggleRow = ({title, value, onChange, checkbox, trailing, ...rest}) => {
	const handleClick = useCallback((e) => onChange(!value, e), [onChange, value]);
	const iconClass = value ? css.toggleOn : '';

	return (
		<SeerrFocusRow {...rest} onClick={onChange ? handleClick : null}>
			{checkbox && <MaterialIcon name={value ? 'checkBox' : 'checkBoxBlank'} className={`${css.checkbox} ${iconClass}`} />}
			<span className={`${css.rowTitle} ${onChange ? '' : css.rowTitleDisabled}`}>{title}</span>
			{trailing && <span className={css.rowTrailing}>{trailing}</span>}
			{!checkbox && <MaterialIcon name={value ? 'toggleOn' : 'toggleOff'} className={`${css.switch} ${iconClass}`} />}
		</SeerrFocusRow>
	);
};

// Shows a label and the current value, and opens a picker when pressed.
export const SeerrSelectorRow = ({label, value, className, ...rest}) => (
	<SpottableDiv {...rest} className={`${css.selector} ${className || ''}`}>
		<span className={css.selectorLabel}>{label}</span>
		<span className={css.selectorSpacer} />
		<span className={css.selectorEnd}>
			<span className={css.selectorValue}>{value}</span>
			<MaterialIcon name="arrowDropDown" className={css.selectorArrow} />
		</span>
	</SpottableDiv>
);

// A dialog action. It stays focusable while disabled, which is when onClick is null.
export const SeerrDialogButton = ({label, icon, primary, primaryColor, foreground, busy, busyLabel, onClick, className, ...rest}) => {
	const enabled = Boolean(onClick);
	const style = {};
	if (enabled && primary && primaryColor) style.backgroundColor = primaryColor;
	if (enabled && foreground) style.color = foreground;

	let primaryClass = '';
	if (primary) primaryClass = enabled ? css.buttonPrimary : css.buttonPrimaryDisabled;

	return (
		<SpottableDiv
			{...rest}
			className={`${css.button} ${primaryClass} ${enabled ? '' : css.buttonDisabled} ${className || ''}`}
			style={style}
			onClick={onClick || undefined}
		>
			{busy ? (
				<>
					<span className={css.spinner} />
					{busyLabel && <span className={`${css.buttonLabel} ${css.busyLabel}`}>{busyLabel}</span>}
				</>
			) : (
				<>
					{icon && <MaterialIcon name={icon} className={css.buttonIcon} />}
					<span className={css.buttonLabel}>{label}</span>
				</>
			)}
		</SpottableDiv>
	);
};

// Two actions side by side, splitting the width.
export const SeerrButtonRow = ({className, children}) => (
	<div className={`${css.buttonRow} ${className || ''}`}>{children}</div>
);

export const SeerrQuotaRow = ({label, blocked, className}) => (
	<div className={`${css.quota} ${blocked ? css.quotaBlocked : ''} ${className || ''}`}>
		<MaterialIcon name={blocked ? 'block' : 'dataUsage'} className={css.quotaIcon} />
		<span className={css.quotaLabel}>{label}</span>
	</div>
);

// A thin rule. The default one takes up 16 units of height, and the tight one is just the line.
export const SeerrDivider = ({tight}) => <div className={tight ? css.dividerTight : css.divider} />;
