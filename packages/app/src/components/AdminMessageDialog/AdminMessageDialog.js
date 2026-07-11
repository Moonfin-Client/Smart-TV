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

const AdminMessageDialog = ({open, title, message, onDismiss}) => {
	useEffect(() => {
		if (!open) return;
		const t = setTimeout(() => Spotlight.focus('server-message-ok-btn'), 100);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onDismiss?.();
				return;
			}

			const code = e.keyCode || e.which;
			if (code === KEYS.LEFT || code === KEYS.RIGHT || code === KEYS.UP || code === KEYS.DOWN) {
				e.preventDefault();
				e.stopPropagation();
				Spotlight.focus('server-message-ok-btn');
			}
		};

		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onDismiss]);

	if (!open || !message) return null;

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="server-message-dialog">
				<h2 className={css.title}>{title || $L('Server Message')}</h2>
				<p className={`${css.message} ${css.preWrap}`}>{message}</p>
				<div className={css.buttons}>
					<SpottableButton
						className={`${css.btn} spottable-default`}
						onClick={onDismiss}
						spotlightId="server-message-ok-btn"
					>
						{$L('OK')}
					</SpottableButton>
				</div>
			</DialogContainer>
		</div>
	);
};

export default memo(AdminMessageDialog);
