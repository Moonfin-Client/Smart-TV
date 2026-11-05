import $L from '@enact/i18n/$L';

import {CoreAlertDialog} from '../CoreDialog';

import css from './SeerrRequestDialog.module.less';

// Confirms taking back the open requests on one quality track. Every request handed in is on the
// same track, so the first one says which.
export const CancelRequestPopup = ({open, requests, title, onConfirm, onClose}) => {
	const count = requests?.length || 0;
	const label = requests?.[0]?.is4k ? $L('Cancel 4K Request') : $L('Cancel Request');
	const message = count === 1
		? $L('Cancel request for "{title}"?').replace('{title}', title)
		: $L('Cancel {count} requests for "{title}"?').replace('{count}', count).replace('{title}', title);

	return (
		<CoreAlertDialog
			open={open && count > 0}
			onClose={onClose}
			title={label}
			spotlightId="seerr-cancel-request"
			className={css.cancelAlert}
			actions={[
				{label: $L('Keep'), onClick: onClose, spotlightId: 'seerr-cancel-request-keep'},
				{label, onClick: onConfirm, spotlightId: 'seerr-cancel-request-confirm', destructive: true}
			]}
		>
			<span className={css.cancelMessage}>{message}</span>
		</CoreAlertDialog>
	);
};
