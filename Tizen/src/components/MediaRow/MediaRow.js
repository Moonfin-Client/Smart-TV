import {useCallback, useRef, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaCard from '../MediaCard';

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
	showServerBadge = false
}) => {
	const scrollerRef = useRef(null);
	const scrollTimeoutRef = useRef(null);

	// Unique key prefix to avoid duplicate keys when same item appears in multiple rows
	const keyPrefix = rowId || title || rowIndex || '';

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
		if (e.keyCode === 38 && onNavigateUp) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp(rowIndex);
		} else if (e.keyCode === 40 && onNavigateDown) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown(rowIndex);
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	if (!items || items.length === 0) return null;

	return (
		<RowContainer
			className={css.row}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			onKeyDown={handleKeyDown}
		>
			<h2 className={css.title}>{title}</h2>
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
					{items.map((item) => (
						<MediaCard
							key={`${keyPrefix}-${item.Id}`}
							item={item}
							serverUrl={serverUrl}
							cardType={cardType}
							onSelect={handleSelect}
							onFocusItem={onFocusItem}
							showServerBadge={showServerBadge}
						/>
					))}
				</div>
			</div>
		</RowContainer>
	);
};

export default memo(MediaRow);
