import {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {Panel} from '@enact/sandstone/Panels';
import Popup from '@enact/sandstone/Popup';
import Spinner from '@enact/sandstone/Spinner';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';

import seerrApi from '../../services/seerrApi';
import SeerrStatusChip from '../../components/SeerrStatusChip';
import SeerrNotificationToast from '../../components/SeerrNotificationToast';
import {MEDIA_STATUS, isUnlimitedQuota} from '../../utils/seerrStatus';
import {KEYS} from '../../utils/keys';

import css from './SeerrCollection.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');
const PopupContainer = SpotlightContainerDecorator({enterTo: 'default-element'}, 'div');

// A part can be requested when seerr has no media record for it, or the
// record's per-flavor status is unknown and not blocklisted.
const isPartRequestable = (part, is4k) => {
	const info = part.mediaInfo;
	if (!info) return true;
	if (info.status === MEDIA_STATUS.BLOCKLISTED) return false;
	const status = (is4k ? info.status4k : info.status) || MEDIA_STATUS.UNKNOWN;
	return status <= MEDIA_STATUS.UNKNOWN;
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
				{statusInfo && (
					<div className={`${css.partDot} ${css[`partDot_${statusInfo.color}`]}`} />
				)}
			</div>
			<div className={css.partTitle}>{part.title || part.name}</div>
			{year && <div className={css.partYear}>{year}</div>}
		</SpottableDiv>
	);
});

const RequestCollectionPopup = memo(function RequestCollectionPopup({
	open, collection, canUse4k, quota, onConfirm, onClose
}) {
	const [is4k, setIs4k] = useState(false);
	const [selected, setSelected] = useState(() => new Set());
	const [progress, setProgress] = useState(null);

	const visibleParts = useMemo(() =>
		(collection?.parts || []).filter(p => p.mediaInfo?.status !== MEDIA_STATUS.BLOCKLISTED),
	[collection]);

	const requestableIds = useMemo(() => {
		const ids = new Set();
		visibleParts.forEach((p) => {
			if (isPartRequestable(p, is4k)) ids.add(p.id);
		});
		return ids;
	}, [visibleParts, is4k]);

	const cap = useMemo(() => {
		if (isUnlimitedQuota(quota)) return requestableIds.size;
		const remaining = Math.max(quota.remaining || 0, 0);
		return Math.min(remaining, requestableIds.size);
	}, [quota, requestableIds]);

	const restricted = !isUnlimitedQuota(quota) && (quota.restricted || cap === 0);

	// Reset the selection whenever the popup opens or the flavor flips.
	useEffect(() => {
		if (!open) return;
		const initial = new Set();
		for (const p of visibleParts) {
			if (initial.size >= cap) break;
			if (requestableIds.has(p.id)) initial.add(p.id);
		}
		setSelected(initial);
		setProgress(null);
	}, [open, is4k, visibleParts, requestableIds, cap]);

	useEffect(() => {
		if (open) {
			const t = setTimeout(() => Spotlight.focus('collection-request-confirm'), 100);
			return () => clearTimeout(t);
		}
	}, [open]);

	const allSelected = selected.size >= cap && cap > 0;

	const handleToggleAll = useCallback(() => {
		if (allSelected) {
			setSelected(new Set());
			return;
		}
		const next = new Set();
		for (const p of visibleParts) {
			if (next.size >= cap) break;
			if (requestableIds.has(p.id)) next.add(p.id);
		}
		setSelected(next);
	}, [allSelected, visibleParts, requestableIds, cap]);

	const handleTogglePart = useCallback((e) => {
		const id = parseInt(e.currentTarget.dataset.part, 10);
		if (isNaN(id) || !requestableIds.has(id)) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else if (next.size < cap) {
				next.add(id);
			}
			return next;
		});
	}, [requestableIds, cap]);

	const handleToggle4k = useCallback(() => setIs4k(v => !v), []);

	const handleConfirm = useCallback(() => {
		if (progress || selected.size === 0 || restricted) return;
		onConfirm(Array.from(selected), is4k, setProgress);
	}, [progress, selected, restricted, is4k, onConfirm]);

	if (!collection) return null;

	return (
		<Popup open={open} onClose={onClose} position="center" className={css.requestPopup}>
			<div className={css.popupContent}>
				<h2 className={css.popupTitle}>{$L('Request Collection')}</h2>
				<p className={css.popupSubtitle}>{collection.name}</p>

				<PopupContainer className={css.partList} spotlightId="collection-part-list">
					{requestableIds.size > 1 && (
						<SpottableDiv
							className={`${css.checkItem} ${allSelected ? css.checkItemSelected : ''}`}
							onClick={handleToggleAll}
						>
							<div className={`${css.checkbox} ${allSelected ? css.checkboxChecked : ''}`}>
								{allSelected && '✓'}
							</div>
							<span className={css.checkLabel}>{$L('Select All')}</span>
						</SpottableDiv>
					)}
					{visibleParts.map((part) => {
						const requestable = requestableIds.has(part.id);
						const isSelected = selected.has(part.id);
						const statusInfo = getPartStatusInfo(part, is4k);
						const year = partYear(part);
						return (
							<SpottableDiv
								key={part.id}
								className={`${css.checkItem} ${!requestable ? css.checkItemDisabled : ''} ${isSelected ? css.checkItemSelected : ''}`}
								data-part={part.id}
								onClick={handleTogglePart}
							>
								<div className={`${css.checkbox} ${isSelected ? css.checkboxChecked : ''}`}>
									{isSelected && '✓'}
								</div>
								<span className={css.checkLabel}>
									{part.title || part.name}{year ? ` (${year})` : ''}
								</span>
								{!requestable && statusInfo && (
									<SeerrStatusChip label={statusInfo.label} color={statusInfo.color} />
								)}
							</SpottableDiv>
						);
					})}
					{canUse4k && (
						<SpottableDiv
							className={`${css.checkItem} ${is4k ? css.checkItemSelected : ''}`}
							onClick={handleToggle4k}
						>
							<div className={`${css.checkbox} ${is4k ? css.checkboxChecked : ''}`}>
								{is4k && '✓'}
							</div>
							<span className={css.checkLabel}>{$L('Request in 4K')}</span>
						</SpottableDiv>
					)}
				</PopupContainer>

				{!isUnlimitedQuota(quota) && (
					<p className={`${css.quotaLine} ${restricted ? css.quotaBlocked : ''}`}>
						{restricted
							? $L('Request limit reached')
							: $L('{count} requests remaining').replace('{count}', Math.max(quota.remaining || 0, 0))}
					</p>
				)}

				{progress ? (
					<div className={css.progressLine}>
						{$L('Requesting {current} of {total}...')
							.replace('{current}', progress.current)
							.replace('{total}', progress.total)}
					</div>
				) : (
					<div className={css.popupButtons}>
						<SpottableDiv
							className={`${css.popupBtn} ${css.popupBtnPrimary} ${(selected.size === 0 || restricted) ? css.popupBtnDisabled : ''}`}
							spotlightId="collection-request-confirm"
							onClick={handleConfirm}
						>
							{$L('Request {count} Movies').replace('{count}', selected.size)}
						</SpottableDiv>
						<SpottableDiv className={css.popupBtn} onClick={onClose}>
							{$L('Cancel')}
						</SpottableDiv>
					</div>
				)}
			</div>
		</Popup>
	);
});

const SeerrCollection = ({collectionId, onSelectItem, backHandlerRef, ...rest}) => {
	const [collection, setCollection] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [permissions, setPermissions] = useState(null);
	const [quota, setQuota] = useState(null);
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
		if (!backHandlerRef) return;
		if (showRequestPopup) {
			backHandlerRef.current = () => {
				setShowRequestPopup(false);
				return true;
			};
		} else {
			backHandlerRef.current = null;
		}
		return () => {
			if (backHandlerRef) backHandlerRef.current = null;
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
	const handleConfirmRequest = useCallback(async (tmdbIds, is4k, setProgress) => {
		let ok = 0;
		let failed = 0;
		let quotaStopped = false;

		for (let i = 0; i < tmdbIds.length; i++) {
			setProgress({current: i + 1, total: tmdbIds.length});
			try {
				await seerrApi.requestMovie(tmdbIds[i], {is4k});
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
				<RequestCollectionPopup
					open={showRequestPopup}
					collection={collection ? {...collection, parts: visibleParts} : null}
					canUse4k={canUse4k}
					quota={quota}
					onConfirm={handleConfirmRequest}
					onClose={handleCloseRequest}
				/>
				<SeerrNotificationToast notification={toast} onDismiss={dismissToast} />
			</div>
		</Panel>
	);
};

export default SeerrCollection;
