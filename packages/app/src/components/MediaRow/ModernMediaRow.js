import {useCallback, useRef, useEffect, useState, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import ModernMediaCard, {expandEase, expandMs} from '../MediaCard/ModernMediaCard';
import {glideScroll} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {sameCardUserData} from '../../utils/playedState';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';
import {MODERN_CAPTION_ROOM, modernCardMetrics} from '../MediaCard/modernCardLayout';
import PlaceholderRow from './PlaceholderRow';
import CalendarSeeAllCard from './CalendarSeeAllCard';
import {nearRowEnd} from '../../views/Browse/rowPaging';

import css from './ModernMediaRow.module.less';

// How many cards either side of focus load their wide art ahead.
const WARM_REACH = 2;

// The See all card keeps a poster's size, since it doesn't grow on focus like the title cards.
const seeAllSize = (posterSize) => {
	const {cardWidth, imageHeight} = modernCardMetrics({posterSize});
	return {width: cardWidth, height: imageHeight};
};

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
	cardType,
	spotlightId: rowSpotlightId,
	onLoadMore,
	menuOptions,
	deferImages = false,
	ratingsSurface,
	hideOverview = false,
	coreLook = false,
	posterLabels = false,
	leadingInset = 0,
	onCalendarSeeAll
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollerLayoutRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);
	const [focusedItemId, setFocusedItemId] = useState(null);
	const lastFocusedIdRef = useRef(null);
	const [details, setDetails] = useState(null);
	const platform = useRef(getPlatform()).current;

	const keyPrefix = rowId || title || rowIndex || '';
	const itemCount = items?.length || 0;

	useEffect(() => {
		const el = document.querySelector(`[data-row-index="${rowIndex}"]`) || rowElementRef.current;
		registerRowRef?.(rowIndex, el);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef, loading]);

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

		const card = e.target.closest('.spottable');
		// A row that pages asks for more once focus is among its last few cards.
		if (onLoadMore && card && card.parentNode) {
			// The lane has an element beside each card, so only the cards are counted.
			const cards = Array.prototype.filter.call(card.parentNode.children, (el) => el.classList.contains('spottable'));
			const index = cards.indexOf(card);
			if (nearRowEnd(index, itemCount)) onLoadMore(rowId);
		}

		// A hovered card already sits under the cursor, so nudging the lane
		// would only slide it away from the pointer.
		if (Spotlight.getPointerMode()) {
			setDetails(null);
			return;
		}

		const scroller = scrollerRef.current;
		if (card && scroller) {
			if (scrollTimeoutRef.current) {
				window.cancelAnimationFrame(scrollTimeoutRef.current);
			}
			// The focused card parks at the leading edge, so the ratings and overview
			// under it get the rest of the row. The last cards can't scroll that far
			// and keep what's left.
			// Read before the browser's own focus scroll moves the lane, so the slide starts from what was on screen.
			const start = scroller.scrollLeft;
			const shownAt = card.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
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
				// With the cards animating, the lane slides on the same timing and curve, so the card opening, the
				// one closing and the rest of the row all move as one. Cards that open instantly would jump the new one
				// ahead, so the slide starts from where it sat on screen instead.
				const openMs = expandMs(settings.modernCardTransitionSpeed);
				const rest = openMs ?
					glideScroll(scroller, 'x', cardStart, start, {duration: openMs, ease: expandEase}) :
					glideScroll(scroller, 'x', cardStart, layout.paddingLeft + cardStart - shownAt);
				const cardLeft = layout.paddingLeft + cardStart - rest;
				setDetails({
					spotlightId: card.getAttribute('data-spotlight-id'),
					width: layout.width - layout.paddingRight - cardLeft
				});
			});
		}
	}, [onFocus, rowIndex, onLoadMore, itemCount, rowId, settings.modernCardTransitionSpeed]);

	const handleBlur = useCallback((e) => {
		const nextTarget = e.relatedTarget;
		const rowNode = document.querySelector(`[data-row-index="${rowIndex}"]`) || rowElementRef.current;
		if (rowNode && nextTarget && typeof rowNode.contains === 'function' && rowNode.contains(nextTarget)) return;
		setFocusedItemId(null);
	}, [rowIndex]);

	const handleFocusedChange = useCallback((itemId) => {
		setFocusedItemId(itemId || null);
	}, []);
	// The See all card isn't a title, so the card before it folds back up.
	const handleSeeAllFocus = useCallback(() => setFocusedItemId(null), []);

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
			Spotlight.focus(onCalendarSeeAll ? `media-${keyPrefix}-calendar-see-all` : `media-${keyPrefix}-${items[items.length - 1].Id}`);
		}
	}, [items, keyPrefix, settings.navbarPosition, onCalendarSeeAll]);

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
		coreLook ? css.coreLook : '',
		typeof document !== 'undefined' && document.documentElement.classList.contains('legacy') ? css.platformLegacy : ''
	].filter(Boolean).join(' ');
	const rowStyle = typeof rowSpacing === 'number' ? {marginBottom: rowSpacing + 'px'} : undefined;

	if (loading) {
		const {cardWidth, imageHeight} = modernCardMetrics({
			posterSize: settings.homeRowsPosterSize,
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

	const focusedIndex = focusedItemId ? items.findIndex((item) => item.Id === focusedItemId) : -1;
	if (focusedIndex >= 0) lastFocusedIdRef.current = focusedItemId;
	// The row is entered on its last focused card, or its first.
	const landingIndex = Math.max(0, items.findIndex((item) => item.Id === lastFocusedIdRef.current));
	// Every row keeps room for three caption lines, so the next row never sits on a card's text.
	const captionFloor = modernCardMetrics({posterSize: settings.homeRowsPosterSize}).imageHeight + MODERN_CAPTION_ROOM;

	return (
		<RowContainer
			ref={rowElementRef}
			className={rowClassName}
			spotlightId={rowSpotlightId || `row-${rowIndex}`}
			data-row-index={rowIndex}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
			style={rowStyle}
		>
			<h2 className={css.title} style={coreLook ? {paddingLeft: `${leadingInset}px`} : undefined}>{title}</h2>
			{subtitle && <div className={css.subtitle}>{subtitle}</div>}
			{/* Core starts the cards a little in from the title, 20 points against its 16. */}
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus} style={coreLook ? {paddingLeft: `${leadingInset + 6}px`} : undefined}>
				<div className={css.items} style={coreLook ? undefined : {minHeight: `${captionFloor}px`}}>
					{items.map((item, index) => {
						const spotlightId = `media-${keyPrefix}-${item.Id}`;
						// Wide art loads ahead for the cards a step or two along from focus, and in a row
						// focus isn't in, for the card it would land on, unless the row's images are held back.
						const besideFocus = focusedIndex >= 0
							? index !== focusedIndex && Math.abs(index - focusedIndex) <= WARM_REACH
							: !deferImages && index === landingIndex;
						const isFirst = index === 0;
						const isLast = index === items.length - 1 && !onCalendarSeeAll;
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
								deferImage={deferImages}
								spotlightId={spotlightId}
								onSpotlightLeft={isFirst ? handleWrapLeft : null}
								onSpotlightRight={isLast ? handleWrapRight : null}
								isFocused={focusedItemId === item.Id}
								detailsWidth={details?.spotlightId === spotlightId ? details.width : undefined}
								isLibraryRow={rowId === 'library-tiles'}
								warmFocusArt={besideFocus}
								menuOptions={menuOptions}
								ratingsSurface={ratingsSurface}
								hideOverview={hideOverview}
								coreLook={coreLook}
								posterLabels={posterLabels}
							/>
						);
					})}
					{onCalendarSeeAll && (
						<CalendarSeeAllCard
							{...seeAllSize(settings.homeRowsPosterSize)}
							spotlightId={`media-${keyPrefix}-calendar-see-all`}
							onClick={onCalendarSeeAll}
							onFocus={handleSeeAllFocus}
							onSpotlightRight={handleWrapRight}
						/>
					)}
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
	if (prev.spotlightId !== next.spotlightId) return false;
	if (prev.menuOptions !== next.menuOptions) return false;
	// Presence only, since a caller's inline arrow would defeat the comparator.
	if (!prev.onLoadMore !== !next.onLoadMore) return false;
	if (prev.loading !== next.loading || prev.titleWidth !== next.titleWidth || prev.cardType !== next.cardType) return false;
	if (prev.deferImages !== next.deferImages || prev.ratingsSurface !== next.ratingsSurface || prev.hideOverview !== next.hideOverview) return false;
	if (prev.coreLook !== next.coreLook || prev.leadingInset !== next.leadingInset || prev.posterLabels !== next.posterLabels) return false;
	if (!prev.onCalendarSeeAll !== !next.onCalendarSeeAll) return false;
	if (prev.items === next.items) return true;
	if (prev.items?.length !== next.items?.length) return false;
	for (let i = 0; i < prev.items.length; i++) {
		if (prev.items[i].Id !== next.items[i].Id) return false;
		if (!sameCardUserData(prev.items[i], next.items[i])) return false;
	}
	return true;
};

export default memo(ModernMediaRow, areRowPropsEqual);
