import {useCallback, useEffect, useMemo, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';

import CoreDialog from '../CoreDialog';
import PagedText from '../PagedText';
import {downloadOtaUpdate} from '../../services/versionChecker';
import {relaunchApp} from '../../utils/appLifecycle';
import {KEYS} from '../../utils/keys';
import {renderReleaseNotes} from '../../utils/releaseNotes';
import {MaterialIcon} from '../icons/materialIcons';

import css from './UpdateNotification.module.less';

const SpottableDiv = Spottable('div');

const UPDATE_ID = 'update-dialog';
const NOTES_ID = 'update-notes-dialog';

// Offers the release notes for a new version. A TV has no browser to send anyone to, so the
// notes open here instead, and either way the update counts as seen once this closes.
const UpdateNotification = ({updateInfo, formattedNotes, onDismiss}) => {
	const [showNotes, setShowNotes] = useState(false);
	// Offer, downloading, ready or failed, for a sideloaded TV build that updates in place.
	const [stage, setStage] = useState('offer');
	const [progress, setProgress] = useState(0);
	const open = Boolean(updateInfo);
	const ota = updateInfo?.ota;
	const htmlNotes = useMemo(() => renderReleaseNotes(formattedNotes), [formattedNotes]);

	useEffect(() => {
		if (!open) setShowNotes(false);
		setStage(ota?.ready ? 'ready' : 'offer');
	}, [open, ota]);

	// This can open while the screen behind is still loading and taking focus for itself, which
	// Spotlight lets happen since only moves that start inside the dialog are fenced off. Every
	// press after that would drive the screen, so the first arrow brings focus back.
	useEffect(() => {
		if (!open) return undefined;
		const id = showNotes ? NOTES_ID : UPDATE_ID;
		const handleKey = (e) => {
			const code = e.keyCode || e.which;
			if (code !== KEYS.UP && code !== KEYS.DOWN && code !== KEYS.LEFT && code !== KEYS.RIGHT) return;
			const panel = document.querySelector(`[data-spotlight-id="${id}"]`);
			const current = Spotlight.getCurrent();
			if (!panel || (current && panel.contains(current))) return;
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus(id);
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, showNotes]);

	const handleShowNotes = useCallback(() => setShowNotes(true), []);

	const handleDownload = useCallback(() => {
		setProgress(0);
		setStage('downloading');
		downloadOtaUpdate(ota.manifest, setProgress).then(() => setStage('ready'), () => setStage('failed'));
	}, [ota]);

	// The download can't be stopped halfway, so the panel stays until it ends.
	const handleClose = useCallback(() => {
		if (stage !== 'downloading') onDismiss();
	}, [stage, onDismiss]);

	// One row that changes as the update moves along, so focus never has to jump to a new one.
	const action = !ota ? null : {
		offer: {icon: 'downloadRounded', label: $L('Download Update'), onClick: handleDownload},
		downloading: {
			icon: 'downloadRounded',
			label: progress < 1 ? $L('Downloading {percent}%').replace('{percent}', Math.round(progress * 100)) : $L('Installing Update'),
			onClick: null
		},
		ready: {icon: 'restartAltRounded', label: $L('Restart to Update'), onClick: relaunchApp},
		failed: {icon: 'downloadRounded', label: $L('Download Failed, Try Again'), onClick: handleDownload}
	}[stage];

	const title = open ? $L('v{version} Available').replace('{version}', updateInfo.latestVersion) : '';

	return (
		<>
			<CoreDialog open={open && !showNotes} onClose={handleClose} title={title} showCancel={stage !== 'downloading'} spotlightId={UPDATE_ID}>
				{action && (
					<SpottableDiv className={css.option} onClick={action.onClick}>
						<MaterialIcon name={action.icon} className={css.optionIcon} />
						<span className={css.optionLabel}>{action.label}</span>
					</SpottableDiv>
				)}
				<SpottableDiv className={css.option} onClick={handleShowNotes}>
					<MaterialIcon name="articleOutlined" className={css.optionIcon} />
					<span className={css.optionLabel}>{$L('Read Release Notes')}</span>
				</SpottableDiv>
			</CoreDialog>
			<CoreDialog
				open={open && showNotes}
				onClose={handleClose}
				title={title}
				spotlightId={NOTES_ID}
				className={css.notesPanel}
				bodyClassName={css.notesBody}
			>
				<PagedText className={css.notesText}>
					<div className={css.notes} ref={(el) => { if (el) el.innerHTML = htmlNotes; }} />
				</PagedText>
			</CoreDialog>
		</>
	);
};

export default UpdateNotification;
export {UpdateNotification};
