import {useCallback, useRef, useEffect, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import MediaCard from '../MediaCard';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';

import css from './MediaRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const MediaRow = ({
	title,
	items,
	serverUrl,
	cardType = 'portrait',
	onSelectItem,
	onFocus,
	onFocusItem,
	rowIndex,
	rowId,
	onNavigateUp,
	onNavigateDown,
	showServerBadge = false,
	showOverview = false,
	className,
	registerRowRef
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);

	const keyPrefix = rowId || title || rowIndex || '';

	useEffect(() => {
		const el = rowElementRef.current;
		registerRowRef?.(rowIndex, el);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef]);

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
				const scrollerRect = scroller.getBoundingClientRect();
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			});
		}
	}, [onFocus, rowIndex]);

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

	return (
		<RowContainer
			ref={rowElementRef}
			className={`${css.row}${className ? ` ${className}` : ''}`}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			onKeyDown={handleKeyDown}
		>
			<h2 className={css.title}>{title}</h2>
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
						{items.map((item, index) => {
							const spotlightId = `media-${keyPrefix}-${item.Id}`;
							const isFirst = index === 0;
							const isLast = index === items.length - 1;

							return (
								<MediaCard
									key={`${keyPrefix}-${item.Id}`}
									item={item}
									serverUrl={serverUrl}
									cardType={cardType}
									onSelect={handleSelect}
									onFocusItem={onFocusItem}
									showServerBadge={showServerBadge}
									showOverview={showOverview}
									eagerLoad={rowIndex === 0}
									spotlightId={spotlightId}
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

const areRowPropsEqual = (prev, next) => {
	if (prev.rowId !== next.rowId) return false;
	if (prev.title !== next.title) return false;
	if (prev.cardType !== next.cardType) return false;
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

export default memo(MediaRow, areRowPropsEqual);
