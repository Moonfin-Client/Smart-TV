import {useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle} from 'react';
import $L from '@enact/i18n/$L';
import RatingsRow from '../../components/RatingsRow';
import {formatDuration} from '../../utils/helpers';
import css from './Browse.module.less';

const FOCUS_ITEM_DEBOUNCE_MS = 400;
const DETAIL_GENRES_LIMIT = 2;

const DetailSection = forwardRef(({
	browseMode,
	api,
	getItemServerUrl,
	settings,
	onFocusedItemChange
}, ref) => {
	const [focusedItem, setFocusedItem] = useState(null);
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

	return (
		<div className={`${css.detailSection} ${browseMode === 'rows' ? css.detailVisible : css.detailHidden}`}>
			{focusedItem ? (
				<>
					<h2 className={css.detailTitle}>
						{focusedItem.Type === 'Episode' ? focusedItem.SeriesName : focusedItem.Name}
					</h2>
					<div className={css.detailInfoRow}>
						{focusedItem.ProductionYear && (
							<span className={css.infoBadge}>{focusedItem.ProductionYear}</span>
						)}
						{focusedItem.OfficialRating && (
							<span className={css.infoBadge}>{focusedItem.OfficialRating}</span>
						)}
						{(() => {
							if (!focusedItem.RunTimeTicks || focusedItem.Type === 'Series') return null;
							const dur = formatDuration(focusedItem.RunTimeTicks);
							return dur && dur !== '0m' ? <span className={css.infoBadge}>{dur}</span> : null;
						})()}
						{focusedItem.Type === 'Episode' && focusedItem.ParentIndexNumber !== undefined && (
							<span className={css.infoBadge}>
								S{focusedItem.ParentIndexNumber} E{focusedItem.IndexNumber}
							</span>
						)}
						{focusedItem.Genres?.slice(0, DETAIL_GENRES_LIMIT).map((g, i) => (
							<span key={i} className={css.infoBadge}>{g}</span>
						))}
					</div>
					<RatingsRow item={focusedItem} serverUrl={getItemServerUrl(focusedItem)} compact pluginEnabled={settings.useMoonfinPlugin && settings.mdblistEnabled !== false} />
					<p className={css.detailSummary}>
						{focusedItem.Overview || $L('No description available.')}
					</p>
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
