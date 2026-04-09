import {memo, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {isBackKey, KEYS} from '../../utils/keys';

import css from './ClearDataDialog.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const ClearDataDialog = ({open, onCancel, onConfirm}) => {
	useEffect(() => {
		if (open) {
			const t = setTimeout(() => Spotlight.focus('cleardata-cancel-btn'), 100);
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
				const cancelBtn = document.querySelector('[data-spotlight-id="cleardata-cancel-btn"]');
				if (current === cancelBtn || (cancelBtn && cancelBtn.contains(current))) {
					Spotlight.focus('cleardata-confirm-btn');
				} else {
					Spotlight.focus('cleardata-cancel-btn');
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
			<DialogContainer className={css.dialog} spotlightId="cleardata-dialog">
				<h2 className={css.title}>Clear All Data?</h2>
				<p className={css.message}>
					This will remove all settings, saved servers, and login sessions. You will need to set up the app again.
				</p>
				<div className={css.buttons}>
					<SpottableButton
						className={css.btn}
						onClick={onCancel}
						spotlightId="cleardata-cancel-btn"
					>
						Cancel
					</SpottableButton>
					<SpottableButton
						className={`${css.btn} ${css.confirmBtn} spottable-default`}
						onClick={onConfirm}
						spotlightId="cleardata-confirm-btn"
					>
						Clear All Data
					</SpottableButton>
				</div>
			</DialogContainer>
		</div>
	);
};

export default memo(ClearDataDialog);
