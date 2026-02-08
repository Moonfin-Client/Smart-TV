/**
 * UpdateNotification component
 * Shows a popup when a new version is available
 */

import {useCallback, useEffect, useRef, useMemo} from 'react';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import Heading from '@enact/sandstone/Heading';
import Scroller from '@enact/sandstone/Scroller';
import Spotlight from '@enact/spotlight';

import css from './UpdateNotification.module.less';

// Simple markdown to HTML converter
const markdownToHtml = (text) => {
	if (!text) return '';
	return text
		// Headers
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^# (.+)$/gm, '<h1>$1</h1>')
		// Bold
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		// Italic
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		// Bullet points
		.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
		// Line breaks
		.replace(/\n/g, '<br/>');
};

const UpdateNotification = ({updateInfo, formattedNotes, onDismiss}) => {
	const buttonRef = useRef(null);

	const handleDismiss = useCallback(() => {
		if (onDismiss) {
			onDismiss();
		}
	}, [onDismiss]);

	const htmlNotes = useMemo(() => markdownToHtml(formattedNotes), [formattedNotes]);

	// Auto-focus the OK button when the popup opens
	useEffect(() => {
		if (updateInfo) {
			// Small delay to ensure the popup is rendered
			const timer = setTimeout(() => {
				if (buttonRef.current) {
					Spotlight.focus(buttonRef.current);
				}
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [updateInfo]);

	if (!updateInfo) {
		return null;
	}

	return (
		<Popup
			open
			onClose={handleDismiss}
			position="center"
			noAutoDismiss
			scrimType="translucent"
			spotlightRestrict="self-only"
		>
			<div className={css.overlay}>
				<div 
					className={css.modal}
					style={{
						width: '1400px',
						minWidth: '1200px',
						background: '#000000'
					}}
				>
					<Heading size="small" className={css.title}>
						Update Available
					</Heading>

					<div className={css.versionInfo}>
						<span className={css.newVersion}>Version {updateInfo.latestVersion}</span>
						<span className={css.currentVersion}>
							(Current: {updateInfo.currentVersion})
						</span>
					</div>

					<Scroller
						className={css.notesScroller}
						direction="vertical"
						focusableScrollbar
					>
						<div 
							className={css.notes}
							dangerouslySetInnerHTML={{__html: htmlNotes}}
						/>
					</Scroller>

					<div className={css.buttons}>
						<Button
							ref={buttonRef}
							size="small"
							onClick={handleDismiss}
						>
							OK
						</Button>
					</div>
				</div>
			</div>
		</Popup>
	);
};

export default UpdateNotification;
export {UpdateNotification};
