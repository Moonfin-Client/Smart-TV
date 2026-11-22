import {useCallback, useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';
import {ModalContainer} from '../../utils/spotlightContainers';
import {isBackKey} from '../../utils/keys';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';
import useReturnFocus from '../../hooks/useReturnFocus';
import {MaterialIcon} from '../icons/materialIcons';

import css from './CoreDialog.module.less';

const SpottableDiv = Spottable('div');

// Only the dialog on top answers Back, so one opened over another closes on its own.
const openDialogs = [];

// Back, focus and scrim clicks, shared by every dialog layer.
export const useDialogLayer = ({open, onClose, spotlightId}) => {
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	useReturnFocus(open);

	useEffect(() => {
		if (!open) return undefined;
		const layer = {};
		openDialogs.push(layer);
		const handleKey = (e) => {
			if (openDialogs[openDialogs.length - 1] !== layer || isTvKeyboardVisible() || !isBackKey(e)) return;
			e.preventDefault();
			e.stopPropagation();
			onCloseRef.current?.();
		};
		window.addEventListener('keydown', handleKey, true);
		const focusTimer = setTimeout(() => Spotlight.focus(spotlightId), 100);
		return () => {
			clearTimeout(focusTimer);
			window.removeEventListener('keydown', handleKey, true);
			openDialogs.splice(openDialogs.indexOf(layer), 1);
		};
	}, [open, spotlightId]);

	return useCallback((e) => {
		if (e.target === e.currentTarget) onCloseRef.current?.();
	}, []);
};

export const portal = (node) => (typeof document !== 'undefined' && document.body ? createPortal(node, document.body) : node);

// One choice in a dialog list, marked as picked or not.
export const CoreDialogRow = ({label, selected, dimmed, ...rest}) => (
	<SpottableDiv
		{...rest}
		data-selected={selected ? 'true' : undefined}
		className={`${css.row} ${dimmed ? css.rowDimmed : ''}`}
	>
		<MaterialIcon
			name={selected ? 'checkCircle' : 'radioUnchecked'}
			className={`${css.rowIcon} ${selected ? css.rowIconSelected : ''}`}
		/>
		<div className={css.rowText}>
			<div className={css.rowLabel}>{label}</div>
		</div>
	</SpottableDiv>
);

const CoreDialog = ({
	open,
	onClose,
	title,
	subtitle,
	showCancel = false,
	spotlightId = 'core-dialog',
	className,
	bodyClassName,
	children
}) => {
	const handleScrimClick = useDialogLayer({open, onClose, spotlightId});

	if (!open) return null;

	return portal(
		<div className={css.scrim} onClick={handleScrimClick}>
			<ModalContainer spotlightId={spotlightId} className={`${css.panel} ${className || ''}`}>
				<h2 className={`${css.title} ${subtitle ? css.titleWithSubtitle : ''}`}>{title}</h2>
				{subtitle && <p className={css.subtitle}>{subtitle}</p>}
				<div className={css.divider} />
				<div className={`${css.body} ${bodyClassName || ''}`}>{children}</div>
				{showCancel && (
					<div className={css.cancel}>
						<div className={css.divider} />
						<CoreDialogRow label={$L('Cancel')} dimmed onClick={onClose} />
					</div>
				)}
			</ModalContainer>
		</div>
	);
};

export default CoreDialog;
