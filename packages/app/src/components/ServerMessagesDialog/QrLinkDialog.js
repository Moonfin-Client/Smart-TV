import {useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';

import CoreDialog from '../CoreDialog';
import {drawQrCode} from '../../utils/qrCanvas';

import css from './ServerMessagesDialog.module.less';

// A TV has nowhere to open a link, so it goes to the viewer's phone as a QR code.
const QrLinkDialog = ({open, title, url, onClose}) => {
	const canvasRef = useRef(null);

	useEffect(() => {
		if (open) drawQrCode(canvasRef.current, url);
	}, [open, url]);

	return (
		<CoreDialog open={open} onClose={onClose} title={title} showCancel spotlightId="qr-link-dialog">
			<div className={css.qr}>
				<div className={css.qrBox}>
					<canvas ref={canvasRef} className={css.qrCanvas} />
				</div>
				<div className={css.qrHint}>{$L('Scan with your phone')}</div>
				<div className={css.qrUrl}>{url}</div>
			</div>
		</CoreDialog>
	);
};

export default QrLinkDialog;
