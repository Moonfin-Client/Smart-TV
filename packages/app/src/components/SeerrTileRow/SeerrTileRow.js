import {useCallback, useRef, useEffect, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';

import css from './SeerrTileRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SpottableDiv = Spottable('div');

const TileCard = memo(function TileCard({item, cardType, spotlightId, onSelect, onFocusItem, onSpotlightLeft, onSpotlightRight}) {
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);
	const handleFocus = useCallback(() => onFocusItem?.(item), [item, onFocusItem]);

	const isLogo = cardType === 'logo';
	const image = isLogo ? item._externalLogoUrl : item._externalBackdropUrl;

	return (
		<SpottableDiv
			className={`${css.tile} ${isLogo ? css.logoTile : css.genreTile}`}
			spotlightId={spotlightId}
			onClick={handleClick}
			onFocus={handleFocus}
			onSpotlightLeft={onSpotlightLeft}
			onSpotlightRight={onSpotlightRight}
		>
			{image && <img className={isLogo ? css.logo : css.backdrop} src={image} alt={item.Name} loading="lazy" />}
			{!isLogo && (
				<div className={css.overlay}>
					<span className={css.label}>{item.Name}</span>
				</div>
			)}
		</SpottableDiv>
	);
});

const SeerrTileRow = ({
	title,
	items,
	cardType = 'landscape',
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
					{items.map((item, index) => (
						<TileCard
							key={`${keyPrefix}-${item.Id}`}
							item={item}
							cardType={cardType}
							spotlightId={`media-${keyPrefix}-${item.Id}`}
							onSelect={handleSelect}
							onFocusItem={onFocusItem}
							onSpotlightLeft={index === 0 ? handleWrapLeft : null}
							onSpotlightRight={index === items.length - 1 ? handleWrapRight : null}
						/>
					))}
				</div>
			</div>
		</RowContainer>
	);
};

export default memo(SeerrTileRow);
