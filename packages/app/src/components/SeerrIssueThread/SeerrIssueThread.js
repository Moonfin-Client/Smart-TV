import {memo, useCallback, useEffect, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import SpottableInput from '../SpottableInput/SpottableInput';
import SeerrStatusChip from '../SeerrStatusChip';
import {ISSUE_STATUS, getIssueStatusInfo, getIssueTypeLabel} from '../../utils/seerrStatus';
import {isBackKey} from '../../utils/keys';

import css from './SeerrIssueThread.module.less';

const ThreadContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const formatDate = (dateStr) => {
	if (!dateStr) return '';
	try {
		return new Date(dateStr).toLocaleDateString();
	} catch (e) {
		return '';
	}
};

const SeerrIssueThread = ({issue: initialIssue, canManage, myUserId, onClose, onChanged}) => {
	const [issue, setIssue] = useState(initialIssue);
	const [comment, setComment] = useState('');
	const [busy, setBusy] = useState(false);
	const [deleteArmed, setDeleteArmed] = useState(false);

	const issueId = initialIssue?.id;
	const isCreator = issue?.createdBy?.id != null && issue.createdBy.id === myUserId;
	const canAct = canManage || isCreator;
	const canDelete = canManage || (isCreator && (issue?.comments?.length || 0) <= 1);
	const isOpen = issue?.status === ISSUE_STATUS.OPEN;

	// The list payload leaves comment authors empty, so refetch the full issue.
	useEffect(() => {
		if (!issueId) return;
		let stale = false;
		seerrApi.getIssue(issueId).then((fresh) => {
			if (!stale && fresh) setIssue(fresh);
		}).catch(() => {});
		return () => {
			stale = true;
		};
	}, [issueId]);

	useEffect(() => {
		const t = setTimeout(() => Spotlight.focus('issue-thread-close'), 100);
		return () => clearTimeout(t);
	}, []);

	useEffect(() => {
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [onClose]);

	const applyUpdate = useCallback((fresh) => {
		setIssue(fresh);
		onChanged?.(fresh);
	}, [onChanged]);

	const handleToggleStatus = useCallback(async () => {
		if (busy || !issue) return;
		setBusy(true);
		try {
			const fresh = await seerrApi.setIssueStatus(issue.id, isOpen ? 'resolved' : 'open');
			applyUpdate(fresh || {...issue, status: isOpen ? ISSUE_STATUS.RESOLVED : ISSUE_STATUS.OPEN});
		} catch (err) {
			console.warn('[SeerrIssueThread] Status change failed:', err.message);
		} finally {
			setBusy(false);
		}
	}, [busy, issue, isOpen, applyUpdate]);

	const handleDelete = useCallback(async () => {
		if (busy || !issue) return;
		if (!deleteArmed) {
			setDeleteArmed(true);
			return;
		}
		setBusy(true);
		try {
			await seerrApi.deleteIssue(issue.id);
			onChanged?.({id: issue.id, deleted: true});
			onClose?.();
		} catch (err) {
			console.warn('[SeerrIssueThread] Delete failed:', err.message);
			setBusy(false);
			setDeleteArmed(false);
		}
	}, [busy, issue, deleteArmed, onChanged, onClose]);

	const disarmDelete = useCallback(() => setDeleteArmed(false), []);

	const handleCommentChange = useCallback((e) => setComment(e.target.value), []);

	const handleSend = useCallback(async () => {
		const message = comment.trim();
		if (!message || busy || !issue) return;
		setBusy(true);
		try {
			await seerrApi.commentOnIssue(issue.id, message);
			const fresh = await seerrApi.getIssue(issue.id);
			setComment('');
			if (fresh) applyUpdate(fresh);
		} catch (err) {
			console.warn('[SeerrIssueThread] Comment failed:', err.message);
		} finally {
			setBusy(false);
		}
	}, [comment, busy, issue, applyUpdate]);

	if (!issue) return null;

	const statusInfo = getIssueStatusInfo(issue);
	const title = issue.media?.title || issue.media?.name || $L('Issue');
	const scope = issue.problemSeason > 0
		? (issue.problemEpisode > 0
			? `S${issue.problemSeason} E${issue.problemEpisode}`
			: `${$L('Season')} ${issue.problemSeason}`)
		: null;
	const comments = issue.comments || [];

	return (
		<div className={css.overlay}>
			<ThreadContainer className={css.dialog} spotlightId="issue-thread">
				<div className={css.header}>
					<div className={css.headerText}>
						<h2 className={css.title}>{title}</h2>
						<div className={css.meta}>
							<SeerrStatusChip label={statusInfo.label} color={statusInfo.color} />
							<span className={css.metaText}>{getIssueTypeLabel(issue.issueType)}</span>
							{scope && <span className={css.metaText}>{scope}</span>}
							{issue.createdBy?.displayName && (
								<span className={css.metaText}>
									{$L('Reported by {name}').replace('{name}', issue.createdBy.displayName)}
								</span>
							)}
						</div>
					</div>
					<SpottableButton
						className={css.closeBtn}
						spotlightId="issue-thread-close"
						onClick={onClose}
					>
						{$L('Close')}
					</SpottableButton>
				</div>

				<div className={css.comments}>
					{comments.map((c, i) => (
						<div key={c.id || i} className={i === 0 ? css.description : css.comment}>
							<div className={css.commentAuthor}>
								{(c.user?.displayName || issue.createdBy?.displayName || $L('Unknown'))}
								<span className={css.commentDate}>{formatDate(c.createdAt)}</span>
							</div>
							<div className={css.commentBody}>{c.message}</div>
						</div>
					))}
				</div>

				{canAct && (
					<div className={css.composeRow}>
						<SpottableInput
							className={css.composeInput}
							spotlightId="issue-thread-input"
							placeholder={$L('Add a comment...')}
							value={comment}
							onChange={handleCommentChange}
							disabled={busy}
						/>
						<SpottableButton
							className={css.sendBtn}
							onClick={handleSend}
							disabled={busy || !comment.trim()}
						>
							{$L('Send')}
						</SpottableButton>
					</div>
				)}

				<div className={css.actions}>
					{canAct && (
						<SpottableButton
							className={`${css.actionBtn} ${isOpen ? css.resolveBtn : css.reopenBtn}`}
							onClick={handleToggleStatus}
							disabled={busy}
						>
							{isOpen ? $L('Resolve') : $L('Reopen')}
						</SpottableButton>
					)}
					{canDelete && (
						<SpottableButton
							className={`${css.actionBtn} ${css.deleteBtn}`}
							onClick={handleDelete}
							onBlur={disarmDelete}
							disabled={busy}
						>
							{deleteArmed ? $L('Press again to confirm') : $L('Delete Issue')}
						</SpottableButton>
					)}
				</div>
			</ThreadContainer>
		</div>
	);
};

export default memo(SeerrIssueThread);
