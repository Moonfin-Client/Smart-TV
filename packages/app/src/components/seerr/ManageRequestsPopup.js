import {memo, useCallback, useState} from 'react';
import $L from '@enact/i18n/$L';

import CoreDialog from '../CoreDialog';
import {SeerrButtonRow, SeerrDialogButton} from './SeerrDialogControls';

import css from './ManageRequestsPopup.module.less';

// Approving or declining the requests waiting on this title, for a viewer allowed to moderate.

const requestedByLabel = (request) => {
	const user = request?.requestedBy;
	const name = user?.displayName ?? user?.username ?? user?.email ?? $L('Unknown');
	const label = $L('Requested by {name}').replace('{name}', name);
	return request?.is4k ? `${label} · ${$L('4K')}` : label;
};

export const ManageRequestsPopup = memo(({open, pendingRequests, onResolve, onClose}) => {
	// Only one answer goes out at a time.
	const [busy, setBusy] = useState(false);

	const handleResolve = useCallback(async (e) => {
		const {requestId, action} = e.currentTarget.dataset;
		setBusy(true);
		try {
			await onResolve(Number(requestId), action === 'approve');
		} finally {
			setBusy(false);
		}
	}, [onResolve]);

	const onPress = busy ? null : handleResolve;

	return (
		<CoreDialog
			open={open}
			onClose={onClose}
			title={$L('Manage Requests')}
			spotlightId="manage-requests"
			bodyClassName={css.body}
		>
			{(pendingRequests || []).map((request) => (
				<div key={request.id}>
					<div className={css.requester}>{requestedByLabel(request)}</div>
					<SeerrButtonRow>
						<SeerrDialogButton
							label={$L('Approve')}
							icon="checkCircleOutline"
							primary
							primaryColor="#388e3c"
							data-request-id={request.id}
							data-action="approve"
							onClick={onPress}
						/>
						<SeerrDialogButton
							label={$L('Decline')}
							icon="cancelOutlined"
							foreground="#e57373"
							data-request-id={request.id}
							data-action="decline"
							onClick={onPress}
						/>
					</SeerrButtonRow>
				</div>
			))}
		</CoreDialog>
	);
});
