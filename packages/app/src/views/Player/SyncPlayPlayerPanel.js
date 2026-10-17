import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import {useSyncPlay} from '../../context/SyncPlayContext';
import {ModalContainer} from '../../utils/spotlightContainers';
import TrackOptionRow, {TrackDivider} from '../../components/TrackOptionRow';

import panelCss from './SyncPlayPlayerPanel.module.less';

// The group from inside the player, where the full dialog can't sit. Closes itself once this
// device is out of the group.
const SyncPlayPlayerPanel = ({css, closeModal, stopPropagation}) => {
	const {group, isInGroup, ignoreWait, toggleIgnoreWait, leaveGroup} = useSyncPlay();
	const [isLeaving, setIsLeaving] = useState(false);

	useEffect(() => {
		if (!isInGroup) closeModal();
	}, [isInGroup, closeModal]);

	const handleLeave = useCallback(async () => {
		if (isLeaving) return;
		setIsLeaving(true);
		await leaveGroup();
		setIsLeaving(false);
	}, [isLeaving, leaveGroup]);

	if (!group) return null;
	const participants = group.Participants || [];

	return (
		<div className={css.trackModal} onClick={closeModal}>
			<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="syncPlay" spotlightId="syncPlay-modal">
				<h2 className={css.modalTitle}>{group.GroupName || $L('Group')}</h2>
				{participants.length > 0 && (
					<p className={panelCss.members}>
						{$L('Members ({count})').replace('{count}', String(participants.length))}: {participants.join(', ')}
					</p>
				)}
				<div className={css.trackList}>
					<TrackOptionRow
						label={$L('Ignore wait')}
						detail={$L("Don't hold the group up while this device buffers")}
						selected={ignoreWait}
						onClick={toggleIgnoreWait}
					/>
					<TrackOptionRow
						label={$L('Leave group')}
						disabled={isLeaving}
						onClick={handleLeave}
					/>
					<TrackDivider />
					<TrackOptionRow label={$L('Cancel')} dimmed onClick={closeModal} />
				</div>
			</ModalContainer>
		</div>
	);
};

export default SyncPlayPlayerPanel;
