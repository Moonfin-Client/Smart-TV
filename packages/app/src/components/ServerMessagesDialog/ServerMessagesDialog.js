import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import CoreDialog from '../CoreDialog';
import {useServerMessages} from '../../context/ServerMessagesContext';
import {MESSAGE_COLORS, hasAction, stripMarkdown} from '../../services/serverMessages';
import {parseMarkdown} from '../../utils/markdown';
import {uiLocale} from '../../utils/uiLocale';
import MessageMarkdown from './MessageMarkdown';
import QrLinkDialog from './QrLinkDialog';
import {MaterialIcon} from '../icons/materialIcons';

import css from './ServerMessagesDialog.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');

const cardId = (index) => `server-message-${index}`;

const withAlpha = (hex, alpha) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const formatWhen = (iso) => {
	const date = new Date(iso);
	return `${date.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'short', day: 'numeric'})} ${date.toLocaleTimeString(uiLocale(), {hour: 'numeric', minute: '2-digit'})}`;
};

// Each card opens on its own, and opening one counts as reading it. The button sits under the
// text rather than inside the focused card, so Down from the card reaches it.
const MessageCard = ({message, index, read, onRead, onOpenLink}) => {
	const [expanded, setExpanded] = useState(false);
	const [focused, setFocused] = useState(false);
	const color = MESSAGE_COLORS[message.color];
	const blocks = useMemo(() => (expanded ? parseMarkdown(message.body) : []), [expanded, message.body]);

	const handleToggle = useCallback(() => {
		setExpanded(!expanded);
		if (!expanded && !read) onRead(message.id);
	}, [expanded, read, onRead, message.id]);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleAction = useCallback(() => onOpenLink(message), [onOpenLink, message]);

	return (
		<div
			className={`${css.card} ${focused ? css.cardFocused : ''}`}
			style={{borderColor: focused ? color : withAlpha(color, 0.35)}}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<SpottableDiv className={css.cardBody} spotlightId={cardId(index)} onClick={handleToggle}>
				<MaterialIcon name="infoOutlineRounded" className={css.cardIcon} style={{color}} />
				<div className={css.cardText}>
					<div className={css.cardTitleRow}>
						<span className={css.cardTitle}>{message.title || $L('Messages')}</span>
						{!read && <span className={css.unreadDot} style={{background: color}} />}
					</div>
					{message.createdUtc && <div className={css.cardDate}>{formatWhen(message.createdUtc)}</div>}
					{message.body && (expanded
						? <MessageMarkdown blocks={blocks} />
						: <div className={css.preview}>{stripMarkdown(message.body)}</div>
					)}
				</div>
			</SpottableDiv>
			{expanded && hasAction(message) && (
				<SpottableButton className={`${css.textButton} ${css.cardAction}`} onClick={handleAction}>
					{message.actionLabel}
				</SpottableButton>
			)}
		</div>
	);
};

// The window listing the messages the server admin sent.
const ServerMessagesDialog = ({open, onClose, backHandlerRef}) => {
	const {messages, unreadCount, isRead, markRead, markAllRead} = useServerMessages();
	const [qr, setQr] = useState(null);

	useEffect(() => {
		if (!open) setQr(null);
	}, [open]);

	// Back closes the QR code before it closes the window.
	useEffect(() => {
		if (!backHandlerRef) return;
		backHandlerRef.current = () => {
			if (!qr) return false;
			setQr(null);
			return true;
		};
		return () => {
			backHandlerRef.current = null;
		};
	}, [backHandlerRef, qr]);

	const handleOpenLink = useCallback((message) => {
		setQr({label: message.actionLabel, url: message.actionUrl});
	}, []);

	const handleCloseQr = useCallback(() => setQr(null), []);

	const handleMarkAllRead = useCallback(() => {
		// The button goes away with the last unread message.
		Spotlight.focus(cardId(0));
		markAllRead();
	}, [markAllRead]);

	return (
		<>
			<CoreDialog
				open={open}
				onClose={onClose}
				title={$L('Messages')}
				spotlightId="server-messages"
				className={css.panel}
				bodyClassName={css.panelBody}
			>
				{messages.length === 0 ? (
					// Focusable so the remote stays in the window when there's nothing else to land on.
					<SpottableDiv className={css.empty}>{$L('No messages from your server yet')}</SpottableDiv>
				) : (
					<>
						<div className={css.list}>
							{messages.map((message, index) => (
								<MessageCard
									key={message.id}
									message={message}
									index={index}
									read={isRead(message.id)}
									onRead={markRead}
									onOpenLink={handleOpenLink}
								/>
							))}
						</div>
						{unreadCount > 0 && (
							<div className={css.footer}>
								<SpottableButton className={css.textButton} onClick={handleMarkAllRead}>
									{$L('Mark all as read')}
								</SpottableButton>
							</div>
						)}
					</>
				)}
			</CoreDialog>
			<QrLinkDialog open={Boolean(open && qr)} title={qr?.label} url={qr?.url} onClose={handleCloseQr} />
		</>
	);
};

export default memo(ServerMessagesDialog);
