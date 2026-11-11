import $L from '@enact/i18n/$L';

import {CoreAlertDialog} from '../CoreDialog';
import {arrServiceName} from '../../utils/seerrArrQueue';

import css from './SeerrRequestDialog.module.less';

export const SwapReleasePopup = ({open, release, onConfirm, onClose}) => {
	const label = $L('Get a different release');
	const message = $L("{service} will remove {release} from the download client, block it so it isn't grabbed again, and search for another release.")
		.replace('{service}', () => arrServiceName(release?.service))
		.replace('{release}', () => release?.release || '');

	return (
		<CoreAlertDialog
			open={open && Boolean(release)}
			onClose={onClose}
			title={label}
			spotlightId="seerr-swap-release"
			className={css.cancelAlert}
			actions={[
				{label: $L('Cancel'), onClick: onClose, spotlightId: 'seerr-swap-release-cancel'},
				{label, onClick: onConfirm, spotlightId: 'seerr-swap-release-confirm', destructive: true}
			]}
		>
			<span className={`${css.cancelMessage} ${css.releaseMessage}`}>{message}</span>
		</CoreAlertDialog>
	);
};
