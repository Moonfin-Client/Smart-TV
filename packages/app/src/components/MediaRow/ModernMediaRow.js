import {useCallback, useRef, useEffect, useState, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import ModernMediaCard from '../MediaCard/ModernMediaCard';
import {KEYS} from '../../utils/keys';
import {sameCardUserData} from '../../utils/playedState';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';
import {modernCardMetrics} from '../MediaCard/modernCardLayout';
import PlaceholderRow from './PlaceholderRow';

import css from './ModernMediaRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const ModernMediaRow = ({
	title,
	items,
	serverUrl,
	onSelectItem,
	onFocus,
	onFocusItem,
	rowIndex,
	rowId,
	onNavigateUp,
	onNavigateDown,
	showServerBadge = false,
	subtitle,
	rowSpacing,
	className,
	registerRowRef,
	loading,
	titleWidth,
	cardType
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollerLayoutRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);
	const [focusedItemId, setFocusedItemId] = useState(null);
	const [details, setDetails] = useState(null);
	const platform = useRef(getPlatform()).current;

	const keyPrefix = rowId || title || rowIndex || '';

	useEffect(() => {
		const el = document.querySelector(`[data-row-index="${rowIndex}"]`) || rowElementRef.current;
		registerRowRef?.(rowIndex, el);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef]);

	useEffect(() => {
		scrollerLayoutRef.current = null;
		const invalidate = () => {
			scrollerLayoutRef.current = null;
		};
		window.addEventListener('resize', invalidate);
		return () => window.removeEventListener('resize', invalidate);
	}, [settings.navbarPosition]);

	useEffect(() => {
		if (!focusedItemId) return;
		const hasFocusedItem = items?.some((item) => item.Id === focusedItemId);
		if (!hasFocusedItem) {
			setFocusedItemId(null);
		}
	}, [items, focusedItemId]);

	useEffect(() => {
		return () => {
			if (scrollTimeoutRef.current) {
				window.cancelAnimationFrame(scrollTimeoutRef.current);
			}
		};
	}, []);

	const handleSelect = useCallback((item) => {
		onSelectItem?.(item);
	}, [onSelectItem]);

	const handleFocus = useCallback((e) => {
		onFocus?.(rowIndex);

		// A hovered card already sits under the cursor, so nudging the lane
		// would only slide it away from the pointer.
		if (Spotlight.getPointerMode()) {
			setDetails(null);
			return;
		}

		const card = e.target.closest('.spottable');
		const scroller = scrollerRef.current;
		if (card && scroller) {
			if (scrollTimeoutRef.current) {
				window.cancelAnimationFrame(scrollTimeoutRef.current);
			}
			// The focused card parks at the leading edge, so the ratings and overview
			// under it get the rest of the row. The last cards can't scroll that far
			// and keep what's left.
			scrollTimeoutRef.current = window.requestAnimationFrame(() => {
				const cards = Array.prototype.filter.call(card.parentNode.children, (el) => el.classList.contains('spottable'));
				if (!scrollerLayoutRef.current) {
					const style = window.getComputedStyle(scroller);
					scrollerLayoutRef.current = {
						width: scroller.clientWidth,
						paddingLeft: parseFloat(style.paddingLeft) || 0,
						paddingRight: parseFloat(style.paddingRight) || 0
					};
				}
				const layout = scrollerLayoutRef.current;
				if (layout.gap === undefined && cards.length > 1) {
					layout.gap = parseFloat(window.getComputedStyle(cards[1]).marginLeft) || 0;
				}
				// Widths come from the cards' styles rather than their boxes, since the
				// card that just lost focus is still shrinking back.
				let cardStart = 0;
				for (let i = 0; i < cards.length && cards[i] !== card; i++) {
					cardStart += parseFloat(cards[i].style.width) + layout.gap;
				}
				scroller.scrollLeft = cardStart;
				const cardLeft = layout.paddingLeft + cardStart - scroller.scrollLeft;
				setDetails({
					spotlightId: card.getAttribute('data-spotlight-id'),
					width: layout.width - layout.paddingRight - cardLeft
				});
			});
		}
	}, [onFocus, rowIndex]);

	const handleBlur = useCallback((e) => {
		const nextTarget = e.relatedTarget;
		const rowNode = document.querySelector(`[data-row-index="${rowIndex}"]`) || rowElementRef.current;
		if (rowNode && nextTarget && typeof rowNode.contains === 'function' && rowNode.contains(nextTarget)) return;
		setFocusedItemId(null);
	}, [rowIndex]);

	const handleFocusedChange = useCallback((itemId) => {
		setFocusedItemId(itemId || null);
	}, []);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP && onNavigateUp) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp(rowIndex);
		} else if (e.keyCode === KEYS.DOWN && onNavigateDown) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown(rowIndex);
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	const handleWrapLeft = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		if (settings.navbarPosition === 'left') {
			if (!Spotlight.focus('navbar')) {
				Spotlight.move('left');
			}
		} else {
			Spotlight.focus(`media-${keyPrefix}-${items[items.length - 1].Id}`);
		}
	}, [items, keyPrefix, settings.navbarPosition]);

	const handleWrapRight = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(`media-${keyPrefix}-${items[0].Id}`);
	}, [items, keyPrefix]);

	const rowClassName = [
		css.row,
		className || '',
		platform === 'webos' ? css.platformWebos : '',
		platform === 'tizen' ? css.platformTizen : '',
		settings.fullScreenRows === true ? css.fullScreenRows : '',
		typeof document !== 'undefined' && document.documentElement.classList.contains('legacy') ? css.platformLegacy : ''
	].filter(Boolean).join(' ');
	const rowStyle = typeof rowSpacing === 'number' ? {marginBottom: rowSpacing + 'px'} : undefined;

	if (loading) {
		const {cardWidth, imageHeight} = modernCardMetrics({
			posterSize: settings.homeRowsPosterSize,
			platform,
			isSquareItem: cardType === 'square'
		});
		return (
			<PlaceholderRow
				classes={css}
				className={rowClassName}
				style={rowStyle}
				title={title}
				titleWidth={titleWidth}
				subtitle={subtitle}
				cardWidth={cardWidth}
				imageHeight={imageHeight}
				isModern
			/>
		);
	}

	if (!items || items.length === 0) return null;

	return (
		<RowContainer
			ref={rowElementRef}
			className={rowClassName}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
			style={rowStyle}
		>
			<h2 className={css.title}>{title}</h2>
			{subtitle && <div className={css.subtitle}>{subtitle}</div>}
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
					{items.map((item, index) => {
						const spotlightId = `media-${keyPrefix}-${item.Id}`;
						const isFirst = index === 0;
						const isLast = index === items.length - 1;
						return (
							<ModernMediaCard
								key={`${keyPrefix}-${item.Id}-${index}`}
								item={item}
								serverUrl={serverUrl}
								onSelect={handleSelect}
								onFocusItem={onFocusItem}
								onFocused={handleFocusedChange}
								showServerBadge={showServerBadge}
								eagerLoad={rowIndex === 0}
								spotlightId={spotlightId}
								onSpotlightLeft={isFirst ? handleWrapLeft : null}
								onSpotlightRight={isLast ? handleWrapRight : null}
								isFocused={focusedItemId === item.Id}
								detailsWidth={details?.spotlightId === spotlightId ? details.width : undefined}
								isLibraryRow={rowId === 'library-tiles'}
							/>
						);
					})}
				</div>
			</div>
		</RowContainer>
	);
};

const areRowPropsEqual = (prev, next) => {
	if (prev.rowId !== next.rowId) return false;
	if (prev.title !== next.title) return false;
	if (prev.serverUrl !== next.serverUrl) return false;
	if (prev.rowIndex !== next.rowIndex) return false;
	if (prev.showServerBadge !== next.showServerBadge) return false;
	if (prev.subtitle !== next.subtitle) return false;
	if (prev.rowSpacing !== next.rowSpacing) return false;
	if (prev.className !== next.className) return false;
	if (prev.loading !== next.loading || prev.titleWidth !== next.titleWidth || prev.cardType !== next.cardType) return false;
	if (prev.items === next.items) return true;
	if (prev.items?.length !== next.items?.length) return false;
	for (let i = 0; i < prev.items.length; i++) {
		if (prev.items[i].Id !== next.items[i].Id) return false;
		if (!sameCardUserData(prev.items[i], next.items[i])) return false;
	}
	return true;
};

export default memo(ModernMediaRow, areRowPropsEqual);
