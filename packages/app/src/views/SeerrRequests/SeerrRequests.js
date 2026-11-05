import {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {Row, Column} from '@enact/ui/Layout';
import {Panel, Header} from '@enact/sandstone/Panels';
import Spinner from '@enact/sandstone/Spinner';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import Image from '@enact/sandstone/Image';
import VirtualList, {VirtualGridList} from '@enact/sandstone/VirtualList';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import seerrApi from '../../services/seerrApi';
import hydrateRequestMediaItems from '../../utils/seerrHydration';
import {libraryIdOf} from '../../utils/seerrTarget';
import {useSeerr} from '../../context/SeerrContext';
import {useSettings} from '../../context/SettingsContext';
import SeerrStatusChip from '../../components/SeerrStatusChip';
import SeerrMediaTypeBadge from '../../components/seerr/SeerrMediaTypeBadge';
import SeerrDownloadProgress from '../../components/SeerrDownloadProgress';
import SeerrIssueThread from '../../components/SeerrIssueThread';
import LoopMarquee from '../../components/LoopMarquee';
import {
	REQUEST_STATUS,
	ISSUE_STATUS,
	getRequestStatusInfo,
	getIssueStatusInfo,
	getIssueTypeLabel,
	getRequestDownloadSummary,
	isRequestDownloading
} from '../../utils/seerrStatus';
import {uiLocale} from '../../utils/uiLocale';
import {KEYS} from '../../utils/keys';
import {getServerType} from '../../services/jellyfinApi';
import {measureTextWidth} from '../../utils/measureText';
import css from './SeerrRequests.module.less';

// The stylesheet sizes a row in rem, so the list has to be told its height in the
// pixels those come out as. Reading the root font size picks up both the screen's
// own scaling and the interface scale setting.
const ROW_HEIGHT_REM = 7;
// These two share out the space between rows, and the first has to match the top
// margin the stylesheet gives a row for its focus ring.
const ROW_FOCUS_INSET_REM = 0.35;
const ROW_GAP_REM = 1 / 3;
const FALLBACK_ROOT_FONT_PX = 24;

const useRootFontSize = (uiScale) => {
	const [size, setSize] = useState(FALLBACK_ROOT_FONT_PX);
	useEffect(() => {
		const measured = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
		if (Number.isFinite(measured) && measured > 0) setSize(measured);
	}, [uiScale]);
	return size;
};

const SpottableDiv = Spottable('div');
const PillContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// The requests grid. A tile is a whole 2:3 poster over a caption of one height,
// so posters stay level across a row.
const TILE_WIDTH = 232;
const TILE_PADDING = 8;
// A whole 2:3 poster of the width left inside the tile's own padding.
const TILE_POSTER_HEIGHT = (TILE_WIDTH - TILE_PADDING * 2) * 1.5;
// Title, status slot, "Requested by name" on one line, and the date.
const TILE_CAPTION_HEIGHT = 142;
// Added when a requester has to go under its label.
const TILE_REQUESTER_LINE = 22;
const TILE_REQUESTER_FONT = 16;
// The narrowest caption the grid can give, inside the tile and caption padding.
const TILE_TEXT_WIDTH = TILE_WIDTH - TILE_PADDING * 2 - 12;
const TILE_GAP = 24;

// Timestamps arrive as ISO strings, so the set's own locale formats them.
const formatRequestDate = (iso) => {
	if (!iso) return '';
	const parsed = new Date(iso);
	if (isNaN(parsed.getTime())) return '';
	return parsed.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'short', day: 'numeric'});
};

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

// Two labeled buttons don't fit across a tile, so its actions are round icons on the poster.
const TILE_ACTION_ICONS = {
	approve: 'M16.59 7.58L10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
	decline: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.59-13L12 10.59 8.41 7 7 8.41 10.59 12 7 15.59 8.41 17 12 13.41 15.59 17 17 15.59 13.41 12 17 8.41z',
	retry: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
	cancel: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
};

// The request either side of a tile in the same row, if there is one.
const tileBeside = (tile, step) => {
	const index = Number(tile.getAttribute('data-spotlight-id').slice('request-'.length));
	const next = document.querySelector(`[data-spotlight-id="request-${index + step}"]`);
	return next && next.getBoundingClientRect().top === tile.getBoundingClientRect().top ? next : null;
};

// Spotlight sees a tile's own buttons as the nearest stop either side of it. The grid moves between
// requests itself, so this walks the buttons: along them, back out to the tile, and past the last
// one to the next request. At the start of a row left stays put instead of dropping into a button.
const handleTileKeyDown = (e) => {
	if (e.keyCode !== KEYS.LEFT && e.keyCode !== KEYS.RIGHT) return;
	const tile = e.currentTarget;
	const stops = [tile, ...Array.from(tile.querySelectorAll('.spottable'))];
	const at = stops.indexOf(e.target);
	if (stops.length < 2 || at < 0) return;
	e.preventDefault();
	e.stopPropagation();
	const target = e.keyCode === KEYS.RIGHT
		? stops[at + 1] || tileBeside(tile, 1)
		: (at > 0 ? stops[at - 1] : tileBeside(tile, -1));
	if (target) Spotlight.focus(target);
};

const requestedByLine = (requester) => $L('Requested by {name}').replace('{name}', requester);
const requesterName = (request) => request.requestedBy?.displayName || $L('Unknown');

const TileActionIcon = ({className, path, label, onClick}) => (
	<SpottableDiv className={`${css.iconBtn} ${className}`} onClick={onClick} aria-label={label}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
	</SpottableDiv>
);

const RequestItem = memo(function RequestItem({request, index, canManage, myUserId, splitRequester, onSelect, onAction, ...rest}) {
	const media = request.media;
	// w342 like the other Seerr screens. w185 is too soft once the grid enlarges it.
	const posterUrl = media?.posterPath
		? seerrApi.getImageUrl(media.posterPath, 'w342')
		: null;
	const statusInfo = getRequestStatusInfo(request);
	const isPending = request.status === REQUEST_STATUS.PENDING;
	const isFailed = request.status === REQUEST_STATUS.FAILED;
	const downloadSummary = getRequestDownloadSummary(request);
	const isOwn = request.requestedBy?.id != null && request.requestedBy.id === myUserId;
	const requester = requesterName(request);
	const isMovie = request.type === 'movie' || media?.mediaType === 'movie';

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

	// The title scrolls while the tile or one of its buttons has focus, so only the tile being
	// looked at moves rather than the whole grid.
	const [focused, setFocused] = useState(false);
	const handleFocus = useCallback(() => setFocused(true), []);
	const handleBlur = useCallback((e) => {
		if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
	}, []);

	const date = formatRequestDate(request.createdAt);

	// The poster is what you scan and the band under it carries the status colour.
	// Progress is the bar in the caption, so the band is colour only.
	return (
		<SpottableDiv
			{...rest}
			className={css.tile}
			data-spotlight-id={`request-${index}`}
			onClick={handleClick}
			onKeyDown={handleTileKeyDown}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			<div className={css.tilePoster}>
				{posterUrl ? (
					<img className={css.tileImage} src={posterUrl} alt="" />
				) : (
					<div className={css.tilePlaceholder} />
				)}
				<SeerrMediaTypeBadge mediaType={isMovie ? 'movie' : 'tv'} suffix={request.is4k ? '4K' : null} className={css.tileBadge} />
				<div className={`${css.tileStripe} ${css[`stripe_${statusInfo.color}`] || css.stripe_approved}`} />
				{isPending && canManage && (
					<div className={css.tileActions}>
						<TileActionIcon className={css.approveBtn} path={TILE_ACTION_ICONS.approve} label={$L('Approve')} onClick={handleApprove} />
						<TileActionIcon className={css.declineBtn} path={TILE_ACTION_ICONS.decline} label={$L('Decline')} onClick={handleDecline} />
					</div>
				)}
				{isPending && !canManage && isOwn && (
					<div className={css.tileActions}>
						<TileActionIcon className={css.cancelBtn} path={TILE_ACTION_ICONS.cancel} label={$L('Cancel')} onClick={handleCancel} />
					</div>
				)}
				{isFailed && canManage && (
					<div className={css.tileActions}>
						<TileActionIcon className={css.retryBtn} path={TILE_ACTION_ICONS.retry} label={$L('Retry')} onClick={handleRetry} />
					</div>
				)}
			</div>
			<div className={css.tileCaption}>
				<LoopMarquee className={css.tileTitle} text={media?.title || media?.name || $L('Unknown')} active={focused} />
				<div className={css.tileStatus}>
					{downloadSummary
						? <SeerrDownloadProgress summary={downloadSummary} compact />
						: <SeerrStatusChip label={statusInfo.label} color={statusInfo.color} />}
				</div>
				{splitRequester ? (
					<>
						<div className={css.tileBy}>{$L('Requested by')}</div>
						<div className={css.tileRequester}>{requester}</div>
					</>
				) : (
					<div className={css.tileBy}>{requestedByLine(requester)}</div>
				)}
				{date && <div className={css.tileDate}>{date}</div>}
			</div>
		</SpottableDiv>
	);
});

const IssueItem = memo(function IssueItem({issue, index, canManage, myUserId, onOpen, onToggleStatus, ...rest}) {
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
			{...rest}
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
						: formatRequestDate(issue.createdAt)}
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

const SeerrRequests = ({onSelectItem, onClose, initialTab = 'requests', backHandlerRef, ...rest}) => {
	const {isAuthenticated, user: contextUser} = useSeerr();
	const {settings} = useSettings();
	const rootFontSize = useRootFontSize(settings.uiScale);
	const [tab, setTab] = useState(initialTab);

	// The screen stays mounted across visits, so an issues shortcut has to
	// switch an already open view too.
	useEffect(() => {
		setTab(initialTab);
	}, [initialTab]);
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
	const focusFirstRequestRef = useRef(false);

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
		focusFirstRequestRef.current = activeTab === 'requests';
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

	// Only once per load. The download poll, load more and approve all hand back a new list too,
	// and none of those should move focus.
	useEffect(() => {
		if (loading || tab !== 'requests' || requests.length === 0 || !focusFirstRequestRef.current) return;
		focusFirstRequestRef.current = false;
		Spotlight.focus('[data-spotlight-id="request-0"]');
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
		if (!backHandlerRef || !activeIssue) return undefined;
		const handler = () => {
			setActiveIssue(null);
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [activeIssue, backHandlerRef]);

	const handleSelect = useCallback((request) => {
		if (onSelectItem && request.media) {
			const mediaType = request.media.mediaType || request.media.media_type || request.type;
			onSelectItem({
				mediaType,
				mediaId: request.media.tmdbId || request.media.id,
				libraryId: libraryIdOf(request.media)
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

	// Decided once for the whole grid, so every caption matches the one height the grid reserves.
	const splitRequester = useMemo(() => requests.some((request) =>
		measureTextWidth(requestedByLine(requesterName(request)), TILE_REQUESTER_FONT) > TILE_TEXT_WIDTH
	), [requests]);

	// The list tags each item with a data-index and reads it back off whatever
	// gains focus to work out how far to scroll, so it has to reach the element.
	const renderItem = useCallback(({index, ...itemProps}) => {
		if (index >= items.length - 5 && hasMore && !loadingMoreRef.current) {
			loadMore();
		}
		const item = items[index];
		if (!item) return null;

		if (tab === 'requests') {
			return (
				<RequestItem
					{...itemProps}
					key={item.id}
					request={item}
					index={index}
					canManage={canManage}
					myUserId={myUserId}
					splitRequester={splitRequester}
					onSelect={handleSelect}
					onAction={handleRequestAction}
				/>
			);
		}
		return (
			<IssueItem
				{...itemProps}
				key={item.id}
				issue={item}
				index={index}
				canManage={canManageIssuesPerm}
				myUserId={myUserId}
				onOpen={handleOpenIssue}
				onToggleStatus={handleToggleIssueStatus}
			/>
		);
	}, [items, tab, hasMore, loadMore, canManage, canManageIssuesPerm, myUserId, splitRequester,
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

		if (tab === 'requests') {
			return (
				<VirtualGridList
					dataSize={items.length}
					itemRenderer={renderItem}
					itemSize={{
						minWidth: TILE_WIDTH,
						minHeight: TILE_POSTER_HEIGHT + TILE_CAPTION_HEIGHT + (splitRequester ? TILE_REQUESTER_LINE : 0) + TILE_PADDING * 2
					}}
					spacing={TILE_GAP}
					spotlightId="hub-list"
				/>
			);
		}

		return (
			<VirtualList
				dataSize={items.length}
				itemRenderer={renderItem}
				itemSize={Math.round((ROW_HEIGHT_REM + ROW_FOCUS_INSET_REM) * rootFontSize)}
				spacing={Math.round(ROW_GAP_REM * rootFontSize)}
				direction="vertical"
				spotlightId="hub-list"
			/>
		);
	};

	return (
		<Panel {...rest}>
			<Header
				className={settings.navbarPosition === 'left' ? undefined : css.headerBesideNav}
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
					{/* Silo's requests have no issues. */}
					{getServerType() !== 'silo' && <TabPill
						label={$L('Issues')}
						count={counts.open}
						selected={tab === 'issues'}
						onSelect={handleTabSelect}
						value="issues"
					/>}
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
