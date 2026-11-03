import {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {Panel} from '@enact/sandstone/Panels';
import Spinner from '@enact/sandstone/Spinner';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import {useSettings} from '../../context/SettingsContext';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle} from '../../components/seerr/SeerrStatusBanner';
import CoreDialog from '../../components/CoreDialog';
import SeerrNotificationToast from '../../components/SeerrNotificationToast';
import {SeerrButtonRow, SeerrDialogButton, SeerrDivider, SeerrQuotaRow, SeerrToggleRow} from '../../components/seerr/SeerrDialogControls';
import {SeerrAdvancedRequestOptions, useSeerrAdvancedRequest} from '../../components/seerr/SeerrAdvancedRequestOptions';
import {MEDIA_STATUS, isUnlimitedQuota} from '../../utils/seerrStatus';
import {KEYS} from '../../utils/keys';

import css from './SeerrCollection.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// A part can be requested when seerr has no media record for it, or the
// record's per-flavor status is unknown or deleted and it isn't blocklisted.
// Deleted counts because the files being gone is the reason to ask again.
const isPartRequestable = (part, is4k) => {
	const info = part.mediaInfo;
	if (!info) return true;
	if (info.status === MEDIA_STATUS.BLOCKLISTED) return false;
	const status = (is4k ? info.status4k : info.status) || MEDIA_STATUS.UNKNOWN;
	return status === MEDIA_STATUS.UNKNOWN || status === MEDIA_STATUS.DELETED;
};

const getPartStatusInfo = (part, is4k) => {
	const info = part.mediaInfo;
	if (!info) return null;
	const status = (is4k ? info.status4k : info.status) || MEDIA_STATUS.UNKNOWN;
	if (status === MEDIA_STATUS.AVAILABLE) return {label: $L('Available'), color: 'available'};
	if (status === MEDIA_STATUS.PARTIALLY_AVAILABLE) return {label: $L('Partially Available'), color: 'available'};
	if (status === MEDIA_STATUS.PROCESSING) return {label: $L('Requested'), color: 'requested'};
	if (status === MEDIA_STATUS.PENDING) return {label: $L('Pending'), color: 'pending'};
	return null;
};

const partYear = (part) => {
	const date = part.releaseDate || part.release_date;
	return date && date.length >= 4 ? date.slice(0, 4) : null;
};

const PartCard = memo(function PartCard({part, onSelect}) {
	const {settings} = useSettings();
	const badgeStyle = seerrBadgeStyle(settings);
	const posterUrl = part.posterPath || part.poster_path
		? seerrApi.getImageUrl(part.posterPath || part.poster_path, 'w342')
		: null;
	const statusInfo = getPartStatusInfo(part, false);
	const year = partYear(part);

	const handleClick = useCallback(() => onSelect(part), [part, onSelect]);

	return (
		<SpottableDiv className={css.partCard} onClick={handleClick}>
			<div className={css.partPosterWrap}>
				{posterUrl && (
					<img className={css.partPoster} src={posterUrl} alt="" loading="lazy" />
				)}
				{badgeStyle === 'banner' && hasSeerrDot(part.mediaInfo?.status) && <SeerrStatusBanner status={part.mediaInfo.status} />}
				{badgeStyle === 'badge' && statusInfo && (
					<div className={`${css.partDot} ${css[`partDot_${statusInfo.color}`]}`} />
				)}
			</div>
			<div className={css.partTitle}>{part.title || part.name}</div>
			{year && <div className={css.partYear}>{year}</div>}
		</SpottableDiv>
	);
});

// How many parts one request can take, since a movie quota can cap it below the number on offer.
const selectionCap = (quota, count) => {
	if (isUnlimitedQuota(quota) || quota.remaining == null) return count;
	return Math.min(Math.max(quota.remaining, 0), count);
};

const firstSelectable = (parts, is4k, quota) => {
	const requestable = parts.filter(p => isPartRequestable(p, is4k));
	return new Set(requestable.slice(0, selectionCap(quota, requestable.length)).map(p => p.id));
};

// Mounted only while open, so each visit starts with every part it can take ticked and 4K off.
// servers is the Radarr list for a viewer allowed to pick where requests go, otherwise null.
export const RequestCollectionSheet = ({parts, canUse4k, quota, servers, onConfirm, onClose}) => {
	const [is4k, setIs4k] = useState(false);
	const advanced = useSeerrAdvancedRequest({enabled: servers != null, isTv: false, isAnime: false, is4k, servers});
	const [selected, setSelected] = useState(() => firstSelectable(parts, false, quota));
	const [submitting, setSubmitting] = useState(false);
	const [progress, setProgress] = useState(null);

	const requestableIds = useMemo(() =>
		new Set(parts.filter(p => isPartRequestable(p, is4k)).map(p => p.id)),
	[parts, is4k]);
	const cap = selectionCap(quota, requestableIds.size);
	const allSelected = selected.size >= cap && cap > 0;
	const limited = !isUnlimitedQuota(quota);
	const overCap = limited && selected.size > cap;

	const handleToggleAll = useCallback((value) => {
		setSelected(value ? firstSelectable(parts, is4k, quota) : new Set());
	}, [parts, is4k, quota]);

	const handleTogglePart = useCallback((value, e) => {
		const id = Number(e.currentTarget.dataset.part);
		setSelected((prev) => {
			const next = new Set(prev);
			if (!value) next.delete(id);
			else if (next.size < cap) next.add(id);
			return next;
		});
	}, [cap]);

	const {reset: resetAdvanced, resolved} = advanced;
	const handleToggle4k = useCallback((value) => {
		setIs4k(value);
		setSelected(firstSelectable(parts, value, quota));
		resetAdvanced();
	}, [parts, quota, resetAdvanced]);

	const handleConfirm = useCallback(() => {
		setSubmitting(true);
		onConfirm(Array.from(selected), is4k, setProgress, {
			serverId: resolved.serverId,
			profileId: resolved.profileId,
			rootFolder: resolved.rootFolder
		});
	}, [selected, is4k, onConfirm, resolved]);

	return (
		<CoreDialog
			open
			onClose={onClose}
			title={$L('Request Collection')}
			spotlightId="collection-request"
			bodyClassName={css.sheetBody}
		>
			<div className={css.sheet}>
				<SeerrToggleRow
					title={`${$L('Select All')} (${requestableIds.size})`}
					value={allSelected}
					checkbox
					onChange={submitting ? null : handleToggleAll}
				/>
				<SeerrDivider tight />
				<div className={css.partList}>
					{parts.map((part) => {
						const requestable = requestableIds.has(part.id);
						const year = partYear(part);
						const name = part.title || part.name;
						const status = (is4k ? part.mediaInfo?.status4k : part.mediaInfo?.status) || MEDIA_STATUS.UNKNOWN;
						const available = status === MEDIA_STATUS.AVAILABLE || status === MEDIA_STATUS.PARTIALLY_AVAILABLE;
						const requested = status === MEDIA_STATUS.PENDING || status === MEDIA_STATUS.PROCESSING;
						let trailing = null;
						if (!requestable && (available || requested)) {
							trailing = (
								<span className={available ? css.partAvailable : css.partRequested}>
									{available ? $L('Available') : $L('Requested')}
								</span>
							);
						}
						return (
							<SeerrToggleRow
								key={part.id}
								title={year ? `${name} (${year})` : name}
								value={requestable && selected.has(part.id)}
								checkbox
								trailing={trailing}
								data-part={part.id}
								onChange={requestable && !submitting ? handleTogglePart : null}
							/>
						);
					})}
				</div>
				{canUse4k && (
					<SeerrToggleRow
						title={$L('4K')}
						value={is4k}
						onChange={submitting ? null : handleToggle4k}
					/>
				)}
				{servers != null && (
					<>
						<SeerrDivider />
						<SeerrAdvancedRequestOptions controller={advanced} />
					</>
				)}
				{limited && (
					<SeerrQuotaRow
						className={css.quotaRow}
						label={$L('{remaining} of {limit} movie requests remaining')
							.replace('{remaining}', quota.remaining ?? 0)
							.replace('{limit}', quota.limit ?? 0)}
						blocked={overCap}
					/>
				)}
				<SeerrButtonRow className={css.sheetActions}>
					<SeerrDialogButton label={$L('Cancel')} onClick={submitting ? null : onClose} />
					<SeerrDialogButton
						label={$L('Request {count} movies').replace('{count}', selected.size)}
						primary
						primaryColor="#6366f1"
						busy={submitting && progress !== null}
						busyLabel={progress && $L('Requesting {current} of {total}...')
							.replace('{current}', progress.current)
							.replace('{total}', progress.total)}
						onClick={submitting || selected.size === 0 || overCap ? null : handleConfirm}
					/>
				</SeerrButtonRow>
			</div>
		</CoreDialog>
	);
};

const SeerrCollection = ({collectionId, onSelectItem, backHandlerRef, ...rest}) => {
	const [collection, setCollection] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [permissions, setPermissions] = useState(null);
	const [quota, setQuota] = useState(null);
	const [servers, setServers] = useState(null);
	const [showRequestPopup, setShowRequestPopup] = useState(false);
	const [toast, setToast] = useState(null);
	const toastKeyRef = useRef(0);

	const load = useCallback(async () => {
		if (!collectionId) return;
		setLoading(true);
		setError(null);
		try {
			const data = await seerrApi.getCollection(collectionId);
			setCollection(data);
		} catch (err) {
			console.error('[SeerrCollection] Load failed:', err);
			setError(err.message || $L('Failed to load'));
		} finally {
			setLoading(false);
		}
	}, [collectionId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		let stale = false;
		seerrApi.getUser().then((u) => {
			if (stale || !u) return;
			setPermissions(u.permissions ?? 0);
			if (seerrApi.hasAdvancedRequestPermission(u.permissions)) {
				seerrApi.getRadarrServers().then((list) => {
					if (!stale) setServers(Array.isArray(list) ? list : []);
				}).catch(() => {});
			}
			if (u.id != null) {
				seerrApi.getUserQuota(u.id).then((q) => {
					if (!stale && q) setQuota(q.movie || null);
				}).catch(() => {});
			}
		}).catch(() => {});
		return () => {
			stale = true;
		};
	}, []);

	useEffect(() => {
		if (!backHandlerRef || !showRequestPopup) return undefined;
		// The sheet and the pickers it opens close themselves on Back, the top one only, so this
		// just keeps the press from leaving the screen.
		const handler = () => true;
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [showRequestPopup, backHandlerRef]);

	const visibleParts = useMemo(() =>
		(collection?.parts || []).filter(p => p.mediaInfo?.status !== MEDIA_STATUS.BLOCKLISTED),
	[collection]);

	const availableCount = useMemo(() =>
		visibleParts.filter((p) => {
			const status = p.mediaInfo?.status;
			return status === MEDIA_STATUS.AVAILABLE || status === MEDIA_STATUS.PARTIALLY_AVAILABLE;
		}).length,
	[visibleParts]);

	const canUse4k = seerrApi.canRequest4kMovies(permissions);
	const hasRequestable = useMemo(() =>
		visibleParts.some((p) => isPartRequestable(p, false)) ||
		(canUse4k && visibleParts.some((p) => isPartRequestable(p, true))),
	[visibleParts, canUse4k]);
	const showRequestButton = seerrApi.canRequestMovies(permissions) && hasRequestable;

	const handleSelectPart = useCallback((part) => {
		onSelectItem?.({mediaType: 'movie', mediaId: part.id});
	}, [onSelectItem]);

	const handleOpenRequest = useCallback(() => setShowRequestPopup(true), []);
	const handleCloseRequest = useCallback(() => setShowRequestPopup(false), []);

	const showToast = useCallback((title, body) => {
		toastKeyRef.current += 1;
		setToast({title, body, key: toastKeyRef.current});
	}, []);

	const dismissToast = useCallback(() => setToast(null), []);

	// Requests are sent one movie at a time. Duplicates count as success and
	// a quota rejection stops the run since the rest would fail the same way.
	const handleConfirmRequest = useCallback(async (tmdbIds, is4k, setProgress, target) => {
		let ok = 0;
		let failed = 0;
		let quotaStopped = false;

		for (let i = 0; i < tmdbIds.length; i++) {
			setProgress({current: i + 1, total: tmdbIds.length});
			try {
				await seerrApi.requestMovie(tmdbIds[i], {is4k, ...target});
				ok++;
			} catch (err) {
				if (err?.status === 409) {
					ok++;
				} else if (err?.status === 403 && /quota/i.test(err?.message || '')) {
					quotaStopped = true;
					break;
				} else {
					failed++;
				}
			}
		}

		setShowRequestPopup(false);
		load();

		const summary = [`${ok} ${$L('requested')}`];
		if (failed > 0) summary.push(`${failed} ${$L('failed')}`);
		showToast(
			quotaStopped ? $L('Request limit reached') : $L('Request Collection'),
			summary.join(' · ')
		);
	}, [load, showToast]);

	const handleRowKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.stopPropagation();
			Spotlight.focus('collection-request-btn');
		}
	}, []);

	const backdropUrl = collection?.backdropPath
		? seerrApi.getImageUrl(collection.backdropPath, 'w1280')
		: null;

	return (
		<Panel {...rest}>
			<div className={css.view}>
				{backdropUrl && (
					<div
						className={css.backdrop}
						style={{backgroundImage: `url(${backdropUrl})`}}
					/>
				)}
				<div className={css.scrim} />
				<div className={css.content}>
					{loading && <Spinner centered />}
					{!loading && error && (
						<div className={css.message}>{error}</div>
					)}
					{!loading && !error && collection && (
						<>
							<h1 className={css.name}>{collection.name}</h1>
							<p className={css.summary}>
								{$L('{count} of {total} available')
									.replace('{count}', availableCount)
									.replace('{total}', visibleParts.length)}
							</p>
							{collection.overview && (
								<p className={css.overview}>{collection.overview}</p>
							)}
							{showRequestButton && (
								<SpottableDiv
									className={css.requestBtn}
									spotlightId="collection-request-btn"
									onClick={handleOpenRequest}
								>
									{$L('Request Collection')}
								</SpottableDiv>
							)}
							<RowContainer
								className={css.partsRow}
								spotlightId="collection-parts"
								onKeyDown={showRequestButton ? handleRowKeyDown : undefined}
							>
								{visibleParts.map((part) => (
									<PartCard key={part.id} part={part} onSelect={handleSelectPart} />
								))}
							</RowContainer>
						</>
					)}
				</div>
				{showRequestPopup && (
					<RequestCollectionSheet
						parts={visibleParts}
						canUse4k={canUse4k}
						quota={quota}
						servers={servers}
						onConfirm={handleConfirmRequest}
						onClose={handleCloseRequest}
					/>
				)}
				<SeerrNotificationToast notification={toast} onDismiss={dismissToast} />
			</div>
		</Panel>
	);
};

export default SeerrCollection;
