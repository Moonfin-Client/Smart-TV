import {memo, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey, KEYS} from '../../utils/keys';

import css from '../ClearDataDialog/ClearDataDialog.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const DeleteItemDialog = ({open, itemName, onCancel, onConfirm}) => {
	useEffect(() => {
		if (open) {
			const t = setTimeout(() => Spotlight.focus('delete-cancel-btn'), 100);
			return () => clearTimeout(t);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onCancel?.();
				return;
			}
			const code = e.keyCode || e.which;
			if (code === KEYS.LEFT || code === KEYS.RIGHT) {
				e.preventDefault();
				e.stopPropagation();
				const current = Spotlight.getCurrent();
				const cancelBtn = document.querySelector('[data-spotlight-id="delete-cancel-btn"]');
				if (current === cancelBtn || (cancelBtn && cancelBtn.contains(current))) {
					Spotlight.focus('delete-confirm-btn');
				} else {
					Spotlight.focus('delete-cancel-btn');
				}
			} else if (code === KEYS.UP || code === KEYS.DOWN) {
				e.preventDefault();
				e.stopPropagation();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onCancel]);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="delete-item-dialog">
				<h2 className={css.title}>{$L('Delete Item?')}</h2>
				<p className={css.message}>
					{itemName
						? $L('Are you sure you want to permanently delete "{itemName}"?').replace('{itemName}', itemName)
						: $L('Are you sure you want to permanently delete this item?')}
				</p>
				<div className={css.buttons}>
					<SpottableButton
						className={css.btn}
						onClick={onCancel}
						spotlightId="delete-cancel-btn"
					>
						{$L('Cancel')}
					</SpottableButton>
					<SpottableButton
						className={`${css.btn} ${css.confirmBtn} spottable-default`}
						onClick={onConfirm}
						spotlightId="delete-confirm-btn"
					>
						{$L('Delete')}
					</SpottableButton>
				</div>
			</DialogContainer>
		</div>
	);
};

export default memo(DeleteItemDialog);
