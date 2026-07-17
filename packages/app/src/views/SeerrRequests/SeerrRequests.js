import {useCallback, useEffect, useRef, useState, memo} from 'react';
import {Row, Column} from '@enact/ui/Layout';
import {Panel, Header} from '@enact/sandstone/Panels';
import Spinner from '@enact/sandstone/Spinner';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import Image from '@enact/sandstone/Image';
import VirtualList from '@enact/sandstone/VirtualList';
import ri from '@enact/ui/resolution';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import seerrApi from '../../services/seerrApi';
import hydrateRequestMediaItems from '../../utils/seerrHydration';
import {useSeerr} from '../../context/SeerrContext';
import {useSettings} from '../../context/SettingsContext';
import SeerrStatusChip from '../../components/SeerrStatusChip';
import SeerrDownloadProgress from '../../components/SeerrDownloadProgress';
import SeerrIssueThread from '../../components/SeerrIssueThread';
import {
	REQUEST_STATUS,
	ISSUE_STATUS,
	getRequestStatusInfo,
	getIssueStatusInfo,
	getIssueTypeLabel,
	getRequestDownloadSummary,
	isRequestDownloading
} from '../../utils/seerrStatus';
import css from './SeerrRequests.module.less';

const SpottableDiv = Spottable('div');
const PillContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const PAGE_SIZE = 20;
const REQUEST_FILTERS = ['all', 'pending', 'approved', 'processing', 'available', 'failed'];
const ISSUE_FILTERS = ['open', 'resolved', 'all'];

const requestFilterLabel = (filter) => {
	switch (filter) {
		case 'pending': return $L('Pending');
		case 'approved': return $L('Approved');
		case 'processing': return $L('Processing');
		case 'available': return $L('Available');
		case 'failed': return $L('Failed');
		default: return $L('All');
	}
};

const issueFilterLabel = (filter) => {
	switch (filter) {
		case 'open': return $L('Open');
		case 'resolved': return $L('Resolved');
		default: return $L('All');
	}
};

const FilterChip = memo(function FilterChip({label, count, selected, onSelect, value}) {
	const handleClick = useCallback(() => onSelect(value), [onSelect, value]);
	return (
		<SpottableDiv
			className={`${css.chip} ${selected ? css.chipSelected : ''}`}
			onClick={handleClick}
		>
			{label}
			{count > 0 && <span className={css.chipCount}>{count}</span>}
		</SpottableDiv>
	);
});

const TabPill = memo(function TabPill({label, count, selected, onSelect, value}) {
	const handleClick = useCallback(() => onSelect(value), [onSelect, value]);
	return (
		<SpottableDiv
			className={`${css.tabPill} ${selected ? css.tabPillSelected : ''}`}
			onClick={handleClick}
		>
			{label}
			{count > 0 && <span className={css.tabCount}>{count}</span>}
		</SpottableDiv>
	);
});

const RequestItem = memo(function RequestItem({request, index, canManage, myUserId, onSelect, onAction}) {
	const media = request.media;
	const posterUrl = media?.posterPath
		? seerrApi.getImageUrl(media.posterPath, 'w185')
		: null;
	const statusInfo = getRequestStatusInfo(request);
	const isPending = request.status === REQUEST_STATUS.PENDING;
	const isFailed = request.status === REQUEST_STATUS.FAILED;
	const downloadSummary = getRequestDownloadSummary(request);
	const isOwn = request.requestedBy?.id != null && request.requestedBy.id === myUserId;
	const requester = request.requestedBy?.displayName;
	const modifier = request.modifiedBy?.displayName;

	const handleClick = useCallback(() => {
		onSelect(request);
	}, [request, onSelect]);

	const handleApprove = useCallback((e) => {
		e.stopPropagation();
		onAction('approve', request);
	}, [request, onAction]);

	const handleDecline = useCallback((e) => {
		e.stopPropagation();
		onAction('decline', request);
	}, [request, onAction]);

	const handleRetry = useCallback((e) => {
		e.stopPropagation();
		onAction('retry', request);
	}, [request, onAction]);

	const handleCancel = useCallback((e) => {
		e.stopPropagation();
		onAction('cancel', request);
	}, [request, onAction]);

	let byLine = requester ? $L('Requested by {name}').replace('{name}', requester) : '';
	if (canManage && modifier) {
		const modLine = $L('Modified by {name}').replace('{name}', modifier);
		byLine = byLine ? `${byLine} · ${modLine}` : modLine;
	}

	return (
		<SpottableDiv
			className={css.requestItem}
			data-spotlight-id={`request-${index}`}
			onClick={handleClick}
		>
			{posterUrl && (
				<Image src={posterUrl} className={css.poster} sizing="fill" />
			)}
			<Column className={css.requestInfo}>
				<BodyText className={css.title}>
					{media?.title || media?.name || $L('Unknown')}
				</BodyText>
				<Row className={css.meta}>
					<span className={css.type}>
						{request.type === 'movie' || media?.mediaType === 'movie' ? $L('Movie') : $L('TV Show')}
						{request.is4k ? ' · 4K' : ''}
					</span>
					<SeerrStatusChip label={statusInfo.label} color={statusInfo.color} />
				</Row>
				{downloadSummary ? (
					<SeerrDownloadProgress summary={downloadSummary} />
				) : (
					<BodyText className={css.date}>
						{byLine || `${$L('Requested:')} ${new Date(request.createdAt).toLocaleDateString()}`}
					</BodyText>
				)}
			</Column>
			{isPending && canManage && (
				<div className={css.rowActions}>
					<SpottableDiv className={`${css.actionBtn} ${css.approveBtn}`} onClick={handleApprove}>
						{$L('Approve')}
					</SpottableDiv>
					<SpottableDiv className={`${css.actionBtn} ${css.declineBtn}`} onClick={handleDecline}>
						{$L('Decline')}
					</SpottableDiv>
				</div>
			)}
			{isPending && !canManage && isOwn && (
				<div className={css.rowActions}>
					<SpottableDiv className={`${css.actionBtn} ${css.cancelBtnPlain}`} onClick={handleCancel}>
						{$L('Cancel')}
					</SpottableDiv>
				</div>
			)}
			{isFailed && canManage && (
				<div className={css.rowActions}>
					<SpottableDiv className={`${css.actionBtn} ${css.retryBtn}`} onClick={handleRetry}>
						{$L('Retry')}
					</SpottableDiv>
				</div>
			)}
		</SpottableDiv>
	);
});

const IssueItem = memo(function IssueItem({issue, index, canManage, myUserId, onOpen, onToggleStatus}) {
	const media = issue.media;
	const posterUrl = media?.posterPath
		? seerrApi.getImageUrl(media.posterPath, 'w185')
		: null;
	const statusInfo = getIssueStatusInfo(issue);
	const isOpen = issue.status === ISSUE_STATUS.OPEN;
	const isCreator = issue.createdBy?.id != null && issue.createdBy.id === myUserId;
	const canAct = canManage || isCreator;
	const replyCount = Math.max((issue.comments?.length || 1) - 1, 0);

	const scope = issue.problemSeason > 0
		? (issue.problemEpisode > 0
			? ` · S${issue.problemSeason} E${issue.problemEpisode}`
			: ` · ${$L('Season')} ${issue.problemSeason}`)
		: '';

	const handleClick = useCallback(() => {
		onOpen(issue);
	}, [issue, onOpen]);

	const handleToggle = useCallback((e) => {
		e.stopPropagation();
		onToggleStatus(issue);
	}, [issue, onToggleStatus]);

	return (
		<SpottableDiv
			className={css.requestItem}
			data-spotlight-id={`issue-${index}`}
			onClick={handleClick}
		>
			{posterUrl && (
				<Image src={posterUrl} className={css.poster} sizing="fill" />
			)}
			<Column className={css.requestInfo}>
				<BodyText className={css.title}>
					{media?.title || media?.name || $L('Unknown')}
				</BodyText>
				<Row className={css.meta}>
					<span className={css.type}>
						{getIssueTypeLabel(issue.issueType)}{scope}
						{replyCount > 0 ? ` · ${replyCount} ${$L('comments')}` : ''}
					</span>
					<SeerrStatusChip label={statusInfo.label} color={statusInfo.color} />
				</Row>
				<BodyText className={css.date}>
					{issue.createdBy?.displayName
						? $L('Reported by {name}').replace('{name}', issue.createdBy.displayName)
						: new Date(issue.createdAt).toLocaleDateString()}
				</BodyText>
			</Column>
			{canAct && (
				<div className={css.rowActions}>
					<SpottableDiv
						className={`${css.actionBtn} ${isOpen ? css.approveBtn : css.retryBtn}`}
						onClick={handleToggle}
					>
						{isOpen ? $L('Resolve') : $L('Reopen')}
					</SpottableDiv>
				</div>
			)}
		</SpottableDiv>
	);
});

const SeerrRequests = ({onSelectItem, onClose, backHandlerRef, ...rest}) => {
	const {isAuthenticated, user: contextUser} = useSeerr();
	const {settings} = useSettings();
	const [tab, setTab] = useState('requests');
	const [requestFilter, setRequestFilter] = useState('all');
	const [issueFilter, setIssueFilter] = useState('open');
	const [requests, setRequests] = useState([]);
	const [issues, setIssues] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [hasMore, setHasMore] = useState(false);
	const [counts, setCounts] = useState({pending: 0, open: 0});
	const [permissions, setPermissions] = useState(null);
	const [myUserId, setMyUserId] = useState(contextUser?.seerrUserId ?? null);
	const [activeIssue, setActiveIssue] = useState(null);
	const loadingMoreRef = useRef(false);

	const canManage = seerrApi.canManageRequests(permissions);
	const canManageIssuesPerm = seerrApi.canManageIssues(permissions);

	// The context defaults permissions to all-access when the status omits
	// them, so admin actions gate on the real /auth/me payload instead.
	useEffect(() => {
		if (!isAuthenticated) return;
		let stale = false;
		seerrApi.getUser().then((u) => {
			if (stale || !u) return;
			setPermissions(u.permissions ?? 0);
			if (u.id != null) setMyUserId(u.id);
		}).catch(() => {});
		return () => {
			stale = true;
		};
	}, [isAuthenticated]);

	const loadCounts = useCallback(async (perms) => {
		const next = {pending: 0, open: 0};
		if (seerrApi.canManageRequests(perms)) {
			next.pending = await seerrApi.getRequestCount().then(c => c?.pending || 0).catch(() => 0);
		}
		if (seerrApi.canManageIssues(perms)) {
			next.open = await seerrApi.getIssueCount().then(c => c?.open || 0).catch(() => 0);
		}
		setCounts(next);
	}, []);

	useEffect(() => {
		if (permissions != null) loadCounts(permissions);
	}, [permissions, loadCounts]);

	const loadPage = useCallback(async (activeTab, filter, skip) => {
		const data = activeTab === 'requests'
			? await seerrApi.getRequests(filter, PAGE_SIZE, skip)
			: await seerrApi.getIssues(filter, PAGE_SIZE, skip);
		const raw = data?.results || [];
		return {results: await hydrateRequestMediaItems(raw), raw};
	}, []);

	const reload = useCallback(async (activeTab, filter) => {
		if (!isAuthenticated) return;
		setLoading(true);
		setError(null);
		try {
			const {results, raw} = await loadPage(activeTab, filter, 0);
			if (activeTab === 'requests') {
				setRequests(results);
			} else {
				setIssues(results);
			}
			setHasMore(raw.length >= PAGE_SIZE);
		} catch (err) {
			console.error('[SeerrRequests] Load failed:', err);
			setError(err.message || $L('Failed to load requests'));
		} finally {
			setLoading(false);
		}
	}, [isAuthenticated, loadPage]);

	useEffect(() => {
		reload(tab, tab === 'requests' ? requestFilter : issueFilter);
	}, [tab, requestFilter, issueFilter, reload]);

	const loadMore = useCallback(async () => {
		if (loadingMoreRef.current || !hasMore) return;
		loadingMoreRef.current = true;
		const filter = tab === 'requests' ? requestFilter : issueFilter;
		const current = tab === 'requests' ? requests : issues;
		try {
			const {results, raw} = await loadPage(tab, filter, current.length);
			const seen = {};
			current.forEach((item) => {
				seen[item.id] = true;
			});
			const fresh = results.filter((item) => !seen[item.id]);
			if (tab === 'requests') {
				setRequests((prev) => [...prev, ...fresh]);
			} else {
				setIssues((prev) => [...prev, ...fresh]);
			}
			setHasMore(raw.length >= PAGE_SIZE);
		} catch (err) {
			console.warn('[SeerrRequests] Load more failed:', err.message);
			setHasMore(false);
		} finally {
			loadingMoreRef.current = false;
		}
	}, [tab, requestFilter, issueFilter, requests, issues, hasMore, loadPage]);

	useEffect(() => {
		if (!loading && tab === 'requests' && requests.length > 0) {
			Spotlight.focus('[data-spotlight-id="request-0"]');
		}
	}, [loading, tab, requests]);

	// Quiet first-page refetch that only overwrites the status and download
	// fields. Unchanged rows keep reference equality so the memoized
	// RequestItems skip re-rendering, and failures never surface the error UI.
	const refreshDownloads = useCallback(() => {
		const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
		seerrApi.getRequests(requestFilter, PAGE_SIZE, 0).then((data) => {
			const byId = {};
			(data?.results || []).forEach((r) => {
				byId[r.id] = r;
			});
			setRequests((prev) => {
				let changed = false;
				const next = prev.map((r) => {
					const fresh = byId[r.id];
					if (!fresh) return r;
					const same = r.status === fresh.status &&
						r.media?.status === fresh.media?.status &&
						r.media?.status4k === fresh.media?.status4k &&
						sameJson(r.media?.downloadStatus, fresh.media?.downloadStatus) &&
						sameJson(r.media?.downloadStatus4k, fresh.media?.downloadStatus4k);
					if (same) return r;
					changed = true;
					return {
						...r,
						status: fresh.status,
						media: {
							...r.media,
							status: fresh.media?.status,
							status4k: fresh.media?.status4k,
							downloadStatus: fresh.media?.downloadStatus,
							downloadStatus4k: fresh.media?.downloadStatus4k
						}
					};
				});
				return changed ? next : prev;
			});
		}).catch(() => {});
	}, [requestFilter]);

	// Poll while something on the requests tab is downloading so the progress
	// bars advance without a manual refresh.
	useEffect(() => {
		if (tab !== 'requests' || loading || !requests.some(isRequestDownloading)) return;
		const id = setInterval(refreshDownloads, 30000);
		return () => clearInterval(id);
	}, [tab, loading, requests, refreshDownloads]);

	// Back closes the thread overlay before the panel pops.
	useEffect(() => {
		if (!backHandlerRef) return;
		if (activeIssue) {
			backHandlerRef.current = () => {
				setActiveIssue(null);
				return true;
			};
		} else {
			backHandlerRef.current = null;
		}
		return () => {
			if (backHandlerRef) backHandlerRef.current = null;
		};
	}, [activeIssue, backHandlerRef]);

	const handleSelect = useCallback((request) => {
		if (onSelectItem && request.media) {
			const mediaType = request.media.mediaType || request.media.media_type || request.type;
			onSelectItem({
				mediaType,
				mediaId: request.media.tmdbId || request.media.id
			});
		}
	}, [onSelectItem]);

	const patchRequest = useCallback((updated) => {
		setRequests((prev) => prev.map((r) => (r.id === updated.id ? {...r, ...updated} : r)));
	}, []);

	const handleRequestAction = useCallback(async (action, request) => {
		try {
			if (action === 'approve') {
				await seerrApi.approveRequest(request.id);
				patchRequest({id: request.id, status: REQUEST_STATUS.APPROVED});
				setCounts((prev) => ({...prev, pending: Math.max(prev.pending - 1, 0)}));
			} else if (action === 'decline') {
				await seerrApi.declineRequest(request.id);
				patchRequest({id: request.id, status: REQUEST_STATUS.DECLINED});
				setCounts((prev) => ({...prev, pending: Math.max(prev.pending - 1, 0)}));
			} else if (action === 'retry') {
				await seerrApi.retryRequest(request.id);
				const fresh = await seerrApi.getRequest(request.id).catch(() => null);
				patchRequest(fresh || {id: request.id, status: REQUEST_STATUS.APPROVED});
			} else if (action === 'cancel') {
				await seerrApi.cancelRequest(request.id);
				setRequests((prev) => prev.filter((r) => r.id !== request.id));
			}
		} catch (err) {
			console.error('[SeerrRequests] Action failed:', action, err.message);
		}
	}, [patchRequest]);

	const handleOpenIssue = useCallback((issue) => {
		setActiveIssue(issue);
	}, []);

	const handleIssueChanged = useCallback((updated) => {
		if (updated.deleted) {
			setIssues((prev) => prev.filter((i) => i.id !== updated.id));
			setCounts((prev) => ({...prev, open: Math.max(prev.open - 1, 0)}));
			return;
		}
		setIssues((prev) => prev.map((i) => (i.id === updated.id ? {...i, ...updated} : i)));
		if (permissions != null) loadCounts(permissions);
	}, [permissions, loadCounts]);

	const handleToggleIssueStatus = useCallback(async (issue) => {
		const isOpen = issue.status === ISSUE_STATUS.OPEN;
		try {
			const fresh = await seerrApi.setIssueStatus(issue.id, isOpen ? 'resolved' : 'open');
			handleIssueChanged(fresh || {id: issue.id, status: isOpen ? ISSUE_STATUS.RESOLVED : ISSUE_STATUS.OPEN});
		} catch (err) {
			console.error('[SeerrRequests] Issue status change failed:', err.message);
		}
	}, [handleIssueChanged]);

	const handleCloseIssue = useCallback(() => setActiveIssue(null), []);

	const handleRetry = useCallback(() => {
		reload(tab, tab === 'requests' ? requestFilter : issueFilter);
	}, [tab, requestFilter, issueFilter, reload]);

	const handleTabSelect = useCallback((value) => {
		setTab(value);
	}, []);

	const handleRequestFilterSelect = useCallback((value) => {
		setRequestFilter(value);
	}, []);

	const handleIssueFilterSelect = useCallback((value) => {
		setIssueFilter(value);
	}, []);

	const items = tab === 'requests' ? requests : issues;

	const renderItem = useCallback(({index}) => {
		if (index >= items.length - 5 && hasMore && !loadingMoreRef.current) {
			loadMore();
		}
		const item = items[index];
		if (!item) return null;

		if (tab === 'requests') {
			return (
				<RequestItem
					key={item.id}
					request={item}
					index={index}
					canManage={canManage}
					myUserId={myUserId}
					onSelect={handleSelect}
					onAction={handleRequestAction}
				/>
			);
		}
		return (
			<IssueItem
				key={item.id}
				issue={item}
				index={index}
				canManage={canManageIssuesPerm}
				myUserId={myUserId}
				onOpen={handleOpenIssue}
				onToggleStatus={handleToggleIssueStatus}
			/>
		);
	}, [items, tab, hasMore, loadMore, canManage, canManageIssuesPerm, myUserId,
		handleSelect, handleRequestAction, handleOpenIssue, handleToggleIssueStatus]);

	const renderContent = () => {
		if (!isAuthenticated) {
			return (
				<Column align="center center" className={css.message}>
					<BodyText>{$L('Please configure Seerr in Settings')}</BodyText>
				</Column>
			);
		}

		if (loading) {
			return <Spinner centered>{$L('Loading requests...')}</Spinner>;
		}

		if (error) {
			return (
				<Column align="center center" className={css.error}>
					<BodyText>{error}</BodyText>
					<Button onClick={handleRetry}>
						{$L('Retry')}
					</Button>
				</Column>
			);
		}

		if (items.length === 0) {
			return (
				<Column align="center center" className={css.message}>
					<BodyText>{tab === 'requests' ? $L('No requests found') : $L('No issues found')}</BodyText>
				</Column>
			);
		}

		return (
			<VirtualList
				dataSize={items.length}
				itemRenderer={renderItem}
				itemSize={ri.scale(168 * (settings.uiScale || 1.0))}
				spacing={ri.scale(16 * (settings.uiScale || 1.0))}
				direction="vertical"
				spotlightId="hub-list"
			/>
		);
	};

	return (
		<Panel {...rest}>
			<Header
				title={$L('Requests')}
				onClose={onClose}
				type="compact"
			/>
			<Column className={css.hub}>
				<PillContainer className={css.tabRow} spotlightId="hub-tabs">
					<TabPill
						label={$L('Requests')}
						count={counts.pending}
						selected={tab === 'requests'}
						onSelect={handleTabSelect}
						value="requests"
					/>
					<TabPill
						label={$L('Issues')}
						count={counts.open}
						selected={tab === 'issues'}
						onSelect={handleTabSelect}
						value="issues"
					/>
				</PillContainer>
				<PillContainer className={css.filterRow} spotlightId="hub-filters">
					{tab === 'requests'
						? REQUEST_FILTERS.map((f) => (
							<FilterChip
								key={f}
								label={requestFilterLabel(f)}
								count={f === 'pending' ? counts.pending : 0}
								selected={requestFilter === f}
								onSelect={handleRequestFilterSelect}
								value={f}
							/>
						))
						: ISSUE_FILTERS.map((f) => (
							<FilterChip
								key={f}
								label={issueFilterLabel(f)}
								count={f === 'open' ? counts.open : 0}
								selected={issueFilter === f}
								onSelect={handleIssueFilterSelect}
								value={f}
							/>
						))}
				</PillContainer>
				<div className={css.listArea}>
					{renderContent()}
				</div>
			</Column>
			{activeIssue && (
				<SeerrIssueThread
					issue={activeIssue}
					canManage={canManageIssuesPerm}
					myUserId={myUserId}
					onClose={handleCloseIssue}
					onChanged={handleIssueChanged}
				/>
			)}
		</Panel>
	);
};

export default SeerrRequests;
