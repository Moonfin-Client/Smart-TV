import {useCallback, useEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';

import CoreDialog from '../../components/CoreDialog';
import {MaterialIcon} from '../../components/icons/materialIcons';
import {drawQrCode} from '../../utils/qrCanvas';
import {installMoonbase, moonbaseFeatures, moonbaseGuideUrl} from './moonbaseInstall';

import css from './MoonbaseDialog.module.less';

const SpottableDiv = Spottable('div');

const DIALOG_ID = 'setup-moonbase-dialog';

// There is no toast on this screen, so the restarting line stays up this long before the dialog closes.
const RESTART_NOTICE_MS = 3000;

const Action = ({icon, label, onSelect}) => (
	<SpottableDiv className={css.action} onClick={onSelect}>
		<MaterialIcon name={icon} className={css.actionIcon} />
		<span className={css.actionLabel}>{label}</span>
	</SpottableDiv>
);

// onClose hears whether Moonbase got installed.
const MoonbaseDialog = ({open, api, serverType, isAdmin, onClose}) => {
	const [stage, setStage] = useState('info');
	const [error, setError] = useState('');
	const installedRef = useRef(false);
	const canvasRef = useRef(null);
	const closeTimerRef = useRef(null);

	const canInstall = isAdmin && serverType === 'jellyfin';
	const showLink = !canInstall;
	const busy = stage === 'installing' || stage === 'restarting';
	const url = moonbaseGuideUrl(serverType);

	useEffect(() => {
		if (!open) return undefined;
		setStage('info');
		setError('');
		installedRef.current = false;
		return () => clearTimeout(closeTimerRef.current);
	}, [open]);

	useEffect(() => {
		if (open && showLink) drawQrCode(canvasRef.current, url);
	}, [open, showLink, url]);

	// The actions change with each stage, so the remote goes back to the first one.
	useEffect(() => {
		if (!open || busy) return undefined;
		const timer = setTimeout(() => Spotlight.focus(DIALOG_ID), 50);
		return () => clearTimeout(timer);
	}, [open, stage, busy]);

	const close = useCallback(() => {
		clearTimeout(closeTimerRef.current);
		onClose(installedRef.current);
	}, [onClose]);

	const install = useCallback(async () => {
		setStage('installing');
		try {
			await installMoonbase(api);
			installedRef.current = true;
			setStage('installed');
		} catch (e) {
			setError(e.message);
			setStage('failed');
		}
	}, [api]);

	const restart = useCallback(async () => {
		setStage('restarting');
		try {
			await api.restartServer();
		} catch (e) {
			setError(e.message);
			setStage('failed');
			return;
		}
		closeTimerRef.current = setTimeout(() => onClose(true), RESTART_NOTICE_MS);
	}, [api, onClose]);

	let status = null;
	if (stage === 'installing') status = $L('Installing Moonbase...');
	else if (stage === 'restarting') status = $L("The server is restarting. Moonbase turns on once it's back.");
	else if (stage === 'installed') status = $L('Moonbase is installed. It turns on when the server restarts, which stops anything playing right now.');
	else if (stage === 'failed') status = installedRef.current ? error : $L("Moonbase couldn't be installed. {error}").replace('{error}', error);

	const features = (
		<div className={css.features}>
			<div className={css.text}>{$L('Moonbase is free and runs on your server. With it, Moonfin gets:')}</div>
			{moonbaseFeatures(serverType).map((feature) => (
				<div key={feature} className={css.feature}>
					<MaterialIcon name="checkCircleRounded" className={css.featureIcon} />
					<div className={css.text}>{feature}</div>
				</div>
			))}
			{showLink && (
				<div className={`${css.text} ${css.linkLine}`}>
					{isAdmin
						? $L("It takes a few steps on your server to install. They're all at this link.")
						: $L('Only a server admin can install it. Send them this link.')}
				</div>
			)}
		</div>
	);

	return (
		<CoreDialog
			open={open}
			onClose={close}
			title="Moonbase"
			spotlightId={DIALOG_ID}
			className={css.panel}
		>
			<div className={css.content}>
				{features}
				{showLink && (
					<div className={css.qr}>
						<div className={css.qrBox}>
							<canvas ref={canvasRef} className={css.qrCanvas} />
						</div>
						<div className={css.qrHint}>{$L('Scan with your phone')}</div>
					</div>
				)}
			</div>
			{status && (
				<div className={css.status}>
					{busy && <div className={css.spinner} />}
					<div className={`${css.text} ${stage === 'failed' ? css.statusFailed : css.statusText}`}>{status}</div>
				</div>
			)}
			{!busy && (
				<div className={css.actions}>
					<div className={css.divider} />
					{stage === 'info' && canInstall && <Action icon="downloadRounded" label={$L('Install')} onSelect={install} />}
					{stage === 'failed' && <Action icon="refreshRounded" label={$L('Try Again')} onSelect={installedRef.current ? restart : install} />}
					{stage === 'installed' && <Action icon="restartAltRounded" label={$L('Restart Server')} onSelect={restart} />}
					<Action icon="closeRounded" label={$L('Close')} onSelect={close} />
				</div>
			)}
		</CoreDialog>
	);
};

export default MoonbaseDialog;
