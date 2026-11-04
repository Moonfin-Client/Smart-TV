import {useCallback, useRef, useEffect, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';

import css from './WatchingNowRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SpottableDiv = Spottable('div');

const FOCUS_SETTLE_MS = 50;

const WatchingNowCard = memo(function WatchingNowCard({
	item,
	spotlightId,
	onSelect,
	onFocusItem,
	onSpotlightLeft,
	onSpotlightRight
}) {
	const focusTimeoutRef = useRef(null);
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
		};
	}, []);

	const handleFocus = useCallback(() => {
		if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
		focusTimeoutRef.current = setTimeout(() => onFocusItem?.(item), FOCUS_SETTLE_MS);
	}, [item, onFocusItem]);

	const backdrop = item._externalBackdropUrl || item._externalPosterUrl;
	const isSeries = item.Type === 'Series';
	const typeLabel = isSeries ? $L('Show') : $L('Movie');
	const watchers = Number(item.Watchers || 0).toLocaleString();
	const watchersLabel = $L('{count} watching').replace('{count}', watchers);
	const ariaLabel = `${item.Name}, ${$L('Rank')} ${item.Rank}, ${watchersLabel}, ${typeLabel}`;

	return (
		<SpottableDiv
			className={css.card}
			spotlightId={spotlightId}
			onClick={handleClick}
			onFocus={handleFocus}
			onSpotlightLeft={onSpotlightLeft}
			onSpotlightRight={onSpotlightRight}
			role="button"
			tabIndex={0}
			aria-label={ariaLabel}
		>
			{backdrop && <img className={css.backdrop} src={backdrop} alt="" loading="lazy" />}
			<div className={css.overlay}>
				<div className={css.topBar}>
					<span className={css.rankBadge}>#{item.Rank}</span>
					<span className={css.liveBadge}>
						<span className={css.watcherDot} />
						{watchersLabel}
					</span>
				</div>
				<div className={css.centerContent}>
					{item._externalLogoUrl ? (
						<img className={css.logo} src={item._externalLogoUrl} alt={item.Name} loading="lazy" />
					) : (
						<div className={css.titleFallback}>{item.Name}</div>
					)}
				</div>
				<div className={css.bottomBar}>
					<span className={css.typePill}>{typeLabel}</span>
				</div>
			</div>
		</SpottableDiv>
	);
});

const WatchingNowRow = ({
	title,
	subtitle,
	items,
	onSelectItem,
	onFocus,
	onFocusItem,
	rowIndex,
	rowId,
	onNavigateUp,
	onNavigateDown,
	className,
	registerRowRef
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollerRectRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);

	const keyPrefix = rowId || title || rowIndex || '';

	useEffect(() => {
		const el = rowElementRef.current;
		registerRowRef?.(rowIndex, el);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef]);

	useEffect(() => {
		scrollerRectRef.current = null;
		const invalidate = () => {
			scrollerRectRef.current = null;
		};
		window.addEventListener('resize', invalidate);
		return () => window.removeEventListener('resize', invalidate);
	}, [settings.navbarPosition]);

	const handleSelect = useCallback((item) => {
		onSelectItem?.(item);
	}, [onSelectItem]);

	const handleFocus = useCallback((e) => {
		onFocus?.(rowIndex);

		if (Spotlight.getPointerMode()) return;

		const card = e.target.closest('.spottable');
		const scroller = scrollerRef.current;
		if (card && scroller) {
			if (scrollTimeoutRef.current) {
				window.cancelAnimationFrame(scrollTimeoutRef.current);
			}
			scrollTimeoutRef.current = window.requestAnimationFrame(() => {
				const cardRect = card.getBoundingClientRect();
				if (!scrollerRectRef.current) {
					scrollerRectRef.current = scroller.getBoundingClientRect();
				}
				const scrollerRect = scrollerRectRef.current;
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			});
		}
	}, [rowIndex, onFocus]);

	const handleKeyDown = useCallback((e) => {
		const targetIsCard = e.target.closest('.spottable');
		if (!targetIsCard) return;

		if (e.keyCode === KEYS.UP) {
			if (onNavigateUp?.(rowIndex)) {
				e.preventDefault();
				e.stopPropagation();
			}
		} else if (e.keyCode === KEYS.DOWN) {
			if (onNavigateDown?.(rowIndex)) {
				e.preventDefault();
				e.stopPropagation();
			}
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	const handleWrapLeft = useCallback((e) => {
		e.preventDefault();
		const scroller = scrollerRef.current;
		if (scroller && items?.length > 1) {
			scroller.scrollLeft = scroller.scrollWidth;
			Spotlight.focus(`media-${keyPrefix}-${items[items.length - 1].Id}`);
		}
	}, [items, keyPrefix]);

	const handleWrapRight = useCallback((e) => {
		e.preventDefault();
		const scroller = scrollerRef.current;
		if (scroller && items?.length > 1) {
			scroller.scrollLeft = 0;
			Spotlight.focus(`media-${keyPrefix}-${items[0].Id}`);
		}
	}, [items, keyPrefix]);

	if (!items || items.length === 0) return null;

	const rowTitle = title || $L('Watching on MDBList');

	return (
		<RowContainer
			ref={rowElementRef}
			className={`${css.row} ${className || ''}`}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			data-row-id={rowId}
			onKeyDown={handleKeyDown}
		>
			<div className={css.header}>
				<svg className={css.globeIcon} viewBox="0 -960 960 960">
					<path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-82q26-36 45-78t31-88H404q12 46 31 88t45 78Zm-104-16q-18-33-31.5-68.5T322-328H208q32 57 78.5 98.5T376-178Zm208 0q43-40 79.5-81.5T742-328H638q-9 43-22.5 78.5T584-178ZM170-408h136q-3-20-4.5-39.5T300-488q0-20 1.5-39.5T306-568H170q-5 20-7.5 39.5T160-488q0 20 2.5 39.5T170-408Zm216 0h188q3-20 4.5-39.5T580-488q0-20-1.5-39.5T574-568H386q-3 20-4.5-39.5T380-488q0 20 1.5 39.5T386-408Zm268 0h136q5-20 7.5-39.5T800-488q0-20-2.5-39.5T790-568H654q3 20 4.5 39.5T660-488q0 20-1.5 39.5T654-408Zm-70-240h104q-32-57-78.5-98.5T584-782q18 33 31.5 68.5T638-648Zm-234 0h152q-12-46-31-88t-45-78q-26 36-45 78t-31 88Zm-196 0h114q9-43 22.5-78.5T376-782q-43 40-79.5 81.5T208-648Z" />
				</svg>
				<h2 className={css.title}>
					{rowTitle}
					<span className={css.pulsingDot} />
				</h2>
			</div>
			{subtitle && <div className={css.subtitle}>{subtitle}</div>}
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
					{items.map((item, index) => {
						const spotlightId = `media-${keyPrefix}-${item.Id}`;
						const isFirst = index === 0;
						const isLast = index === items.length - 1;

						return (
							<WatchingNowCard
								key={`${keyPrefix}-${item.Id}-${index}`}
								item={item}
								spotlightId={spotlightId}
								onSelect={handleSelect}
								onFocusItem={onFocusItem}
								onSpotlightLeft={isFirst ? handleWrapLeft : null}
								onSpotlightRight={isLast ? handleWrapRight : null}
							/>
						);
					})}
				</div>
			</div>
		</RowContainer>
	);
};

export default memo(WatchingNowRow);

