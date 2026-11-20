import {memo, useCallback, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey, KEYS} from '../../utils/keys';
import {exitApp} from '../../utils/appLifecycle';
import {isTitan, isVega} from '../../platform';
import useReturnFocus from '../../hooks/useReturnFocus';

import css from './ExitDialog.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const ExitDialog = ({open, onCancel, onExit}) => {
	useReturnFocus(open);

	useEffect(() => {
		if (open) {
			const t = setTimeout(() => Spotlight.focus('exit-cancel-btn'), 100);
			return () => clearTimeout(t);
		}
	}, [open]);

	const handleExit = useCallback(() => {
		onExit?.();
		exitApp();
	}, [onExit]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				// Amazon's review presses Back until the launcher shows and
				// fails an app that keeps closing and reopening this dialog, so
				// on Fire TV a second Back is the exit.
				// Titan's guidelines also say pressing Back over and over should exit.
				if (isVega() || isTitan()) handleExit();
				else onCancel?.();
				return;
			}
			const code = e.keyCode || e.which;
			if (code === KEYS.LEFT || code === KEYS.RIGHT) {
				e.preventDefault();
				e.stopPropagation();
				const current = Spotlight.getCurrent();
				const cancelBtn = document.querySelector('[data-spotlight-id="exit-cancel-btn"]');
				if (current === cancelBtn || (cancelBtn && cancelBtn.contains(current))) {
					Spotlight.focus('exit-confirm-btn');
				} else {
					Spotlight.focus('exit-cancel-btn');
				}
			} else if (code === KEYS.UP || code === KEYS.DOWN) {
				e.preventDefault();
				e.stopPropagation();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onCancel, handleExit]);

	if (!open) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="exit-dialog">
				<h2 className={css.title}>{$L('Exit Moonfin?')}</h2>
				<p className={css.message}>{$L('Are you sure you want to exit?')}</p>
				<div className={css.buttons}>
					<SpottableButton
						className={css.btn}
						onClick={onCancel}
						spotlightId="exit-cancel-btn"
					>
					{$L('Cancel')}
					</SpottableButton>
					<SpottableButton
						className={`${css.btn} ${css.exitBtn} spottable-default`}
						onClick={handleExit}
						spotlightId="exit-confirm-btn"
					>
					{$L('Exit')}
					</SpottableButton>
				</div>
			</DialogContainer>
		</div>
	);
};

export default memo(ExitDialog);
