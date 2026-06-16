import {useCallback, useRef, useEffect, useState, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import ModernMediaCard from '../MediaCard/ModernMediaCard';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';
import {getPlatform} from '../../platform';

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
	className,
	registerRowRef
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollerRectRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);
	const [focusedItemId, setFocusedItemId] = useState(null);
	const platform = useRef(getPlatform()).current;

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
				const leftPadding = 80;
				const rightPadding = 120;
				if (cardRect.left < scrollerRect.left + leftPadding) {
					scroller.scrollLeft -= (scrollerRect.left + leftPadding - cardRect.left);
				} else if (cardRect.right > scrollerRect.right - rightPadding) {
					scroller.scrollLeft += (cardRect.right - (scrollerRect.right - rightPadding));
				}
			});
		}
	}, [onFocus, rowIndex]);

	const handleBlur = useCallback((e) => {
		const nextTarget = e.relatedTarget;
		const rowNode = rowElementRef.current;
		if (rowNode && nextTarget && rowNode.contains(nextTarget)) return;
		setFocusedItemId(null);
	}, []);

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

	if (!items || items.length === 0) return null;

	const rowClassName = [
		css.row,
		className || '',
		platform === 'webos' ? css.platformWebos : '',
		platform === 'tizen' ? css.platformTizen : '',
		settings.fullScreenRows === true ? css.fullScreenRows : '',
		typeof document !== 'undefined' && document.documentElement.classList.contains('legacy') ? css.platformLegacy : ''
	].filter(Boolean).join(' ');

	return (
		<RowContainer
			ref={rowElementRef}
			className={rowClassName}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
		>
			<h2 className={css.title}>{title}</h2>
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
					{items.map((item, index) => {
						const spotlightId = `media-${keyPrefix}-${item.Id}`;
						const isFirst = index === 0;
						const isLast = index === items.length - 1;
						return (
							<ModernMediaCard
								key={`${keyPrefix}-${item.Id}`}
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
	if (prev.className !== next.className) return false;
	if (prev.items === next.items) return true;
	if (prev.items?.length !== next.items?.length) return false;
	for (let i = 0; i < prev.items.length; i++) {
		if (prev.items[i].Id !== next.items[i].Id) return false;
		if (prev.items[i].UserData?.PlayedPercentage !== next.items[i].UserData?.PlayedPercentage) return false;
		if (prev.items[i].UserData?.Played !== next.items[i].UserData?.Played) return false;
	}
	return true;
};

export default memo(ModernMediaRow, areRowPropsEqual);
