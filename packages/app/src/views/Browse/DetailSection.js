import {useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import $L from '@enact/i18n/$L';
import RatingsRow from '../../components/RatingsRow';
import {formatDuration, getImageUrl} from '../../utils/helpers';
import css from './Browse.module.less';

const FOCUS_ITEM_DEBOUNCE_MS = 400;
const DETAIL_GENRES_LIMIT = 3;

// The other clients label whatever the video stream measures, not what the file claims.
const videoResolutionLabel = (item) => {
	const stream = (item.MediaStreams || []).find((ms) => ms?.Type === 'Video');
	if (!stream || !stream.Width || !stream.Height) return null;
	const {Width: w, Height: h} = stream;
	const suffix = stream.IsInterlaced ? 'i' : 'p';
	if (w >= 7600 || h >= 4300) return '8K';
	if (w >= 3800 || h >= 2000) return '4K';
	if (w >= 2500 || h >= 1400) return `1440${suffix}`;
	if (w >= 1800 || h >= 1000) return `1080${suffix}`;
	if (w >= 1200 || h >= 700) return `720${suffix}`;
	if (w >= 600 || h >= 400) return `480${suffix}`;
	return 'SD';
};

// Plain text and chips share one bullet separated line, the way the other clients
// compose it: year, S:E, certification chip, runtime, resolution chip, then genres.
const buildInfoParts = (item) => {
	const parts = [];
	if (item.ProductionYear) parts.push({text: String(item.ProductionYear)});
	if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) {
		parts.push({text: `S${item.ParentIndexNumber}:E${item.IndexNumber}`});
	}
	if (item.OfficialRating) parts.push({chip: item.OfficialRating});
	if (item.RunTimeTicks && item.Type !== 'Series') {
		const dur = formatDuration(item.RunTimeTicks);
		if (dur && dur !== '0m') parts.push({text: dur});
	}
	const resolution = videoResolutionLabel(item);
	if (resolution) parts.push({chip: resolution});
	const genres = (item.Genres || []).slice(0, DETAIL_GENRES_LIMIT);
	if (genres.length) parts.push({text: genres.join(', ')});
	return parts;
};

const detailTitleFor = (item) => {
	if (item.Type === 'Episode') {
		return [item.SeriesName, item.Name].filter(Boolean).join(' - ');
	}
	return item.Name;
};

// Episodes borrow their series logo, everything else carries its own.
const detailLogoUrl = (item, serverUrl) => {
	if (!serverUrl) return null;
	if (item.Type === 'Episode') {
		const logoId = item.ParentLogoItemId || item.SeriesId;
		return item.ParentLogoImageTag && logoId
			? getImageUrl(serverUrl, logoId, 'Logo', {maxWidth: 800, quality: 80, tag: item.ParentLogoImageTag})
			: null;
	}
	return item.ImageTags?.Logo
		? getImageUrl(serverUrl, item.Id, 'Logo', {maxWidth: 800, quality: 80, tag: item.ImageTags.Logo})
		: null;
};

const DetailSection = forwardRef(({
	browseMode,
	api,
	getItemServerUrl,
	settings,
	onFocusedItemChange
}, ref) => {
	const [focusedItem, setFocusedItem] = useState(null);
	const [failedLogoId, setFailedLogoId] = useState(null);
	const focusedItemRef = useRef(null);
	const handleLogoError = useCallback(() => {
		setFailedLogoId((current) => focusedItemRef.current?.Id ?? current);
	}, []);
	const focusItemTimeoutRef = useRef(null);
	const focusItemAbortRef = useRef(null);

	const cancelPending = useCallback(() => {
		if (focusItemTimeoutRef.current) {
			clearTimeout(focusItemTimeoutRef.current);
			focusItemTimeoutRef.current = null;
		}
		if (focusItemAbortRef.current && typeof focusItemAbortRef.current.abort === 'function') {
			focusItemAbortRef.current.abort();
			focusItemAbortRef.current = null;
		}
	}, []);

	useEffect(() => cancelPending, [cancelPending]);

	const handleFocusItem = useCallback((item) => {
		cancelPending();
		focusItemTimeoutRef.current = setTimeout(() => {
			setFocusedItem(item);
			onFocusedItemChange?.(item);
			if (item._seerr || item._external || item._resolvedFromExternal) {
				return;
			}
			const needsBackdrop = !item.BackdropImageTags?.length && !item.ParentBackdropImageTags?.length;
			const needsProviderIds = !item.ProviderIds;
			if (needsBackdrop || needsProviderIds) {
				const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
				focusItemAbortRef.current = controller;
				api.getItemForDetail(item.Id).then(fullItem => {
					if (!(controller && controller.signal.aborted)) {
						setFocusedItem(fullItem);
						onFocusedItemChange?.(fullItem);
					}
				}).catch(() => {});
			}
		}, FOCUS_ITEM_DEBOUNCE_MS);
	}, [api, onFocusedItemChange, cancelPending]);

	const clearFocusedItem = useCallback(() => {
		cancelPending();
		setFocusedItem(null);
		onFocusedItemChange?.(null);
	}, [onFocusedItemChange, cancelPending]);

	useImperativeHandle(ref, () => ({
		handleFocusItem,
		clearFocusedItem
	}), [handleFocusItem, clearFocusedItem]);

	focusedItemRef.current = focusedItem;
	const logoUrl = focusedItem ? detailLogoUrl(focusedItem, getItemServerUrl(focusedItem)) : null;
	const showLogo = logoUrl && failedLogoId !== focusedItem.Id;
	const infoParts = focusedItem ? buildInfoParts(focusedItem) : [];

	return (
		<div className={`${css.detailSection} ${browseMode === 'rows' ? css.detailVisible : css.detailHidden}`}>
			{focusedItem ? (
				<>
					{showLogo ? (
						<img
							className={css.detailLogo}
							src={logoUrl}
							alt={detailTitleFor(focusedItem)}
							onError={handleLogoError}
						/>
					) : (
						<h2 className={css.detailTitle}>{detailTitleFor(focusedItem)}</h2>
					)}
					<div className={css.detailInfoRow}>
						{infoParts.map((part, i) => (
							<span key={i} className={css.infoPart}>
								{i > 0 && <span className={css.infoDot}>{'\u2022'}</span>}
								{part.chip
									? <span className={css.infoBadge}>{part.chip}</span>
									: <span className={css.infoText}>{part.text}</span>}
							</span>
						))}
					</div>
					<RatingsRow item={focusedItem} serverUrl={getItemServerUrl(focusedItem)} pluginEnabled={isMdblistEnabled(settings)} />
					{!settings.hideHomeMediaDescription && focusedItem.Overview && (
						<p className={css.detailSummary}>{focusedItem.Overview}</p>
					)}
				</>
			) : (
				<div className={css.detailPlaceholder}>
					<p>{$L('Navigate to an item to see details')}</p>
				</div>
			)}
		</div>
	);
});

export default DetailSection;
