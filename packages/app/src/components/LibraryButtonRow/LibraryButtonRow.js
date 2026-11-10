import {useCallback, useRef, useEffect, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {glideToCard} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {isGameLibrary} from '../../utils/gameLibrary';
import {useSettings} from '../../context/SettingsContext';
import {MATERIAL_ICON_PATHS} from '../../views/Settings/materialIconMap';
import useItemMenuHold from '../../hooks/useItemMenuHold';

import css from './LibraryButtonRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SpottableDiv = Spottable('div');

// Square icon tiles keyed off the collection type. There is no artwork on
// purpose, so this row stays easy to tell apart from the My Media row.
const ICON_BY_COLLECTION_TYPE = {
	movies: 'movie',
	tvshows: 'tv',
	music: 'music_note',
	musicvideos: 'music_note',
	books: 'bookmark',
	audiobooks: 'volume_up',
	homevideos: 'image',
	photos: 'image',
	boxsets: 'folder',
	livetv: 'live_tv',
	playlists: 'list',
	folders: 'folder_open'
};

const iconPathFor = (library) => {
	const collectionType = (library.CollectionType || '').toLowerCase();
	if (isGameLibrary(library.Id, library.CollectionType, library.Name)) {
		return MATERIAL_ICON_PATHS.extension;
	}
	const name = ICON_BY_COLLECTION_TYPE[collectionType];
	return MATERIAL_ICON_PATHS[name] || MATERIAL_ICON_PATHS.folder;
};

const LibraryButton = memo(function LibraryButton({item, spotlightId, onSelect, onFocusItem, onSpotlightLeft, onSpotlightRight}) {
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);
	const handleFocus = useCallback(() => onFocusItem?.(item), [item, onFocusItem]);
	const itemAt = useCallback(() => item, [item]);
	const menuHold = useItemMenuHold(itemAt);

	return (
		<SpottableDiv
			{...menuHold}
			className={css.button}
			spotlightId={spotlightId}
			onClick={handleClick}
			onFocus={handleFocus}
			onSpotlightLeft={onSpotlightLeft}
			onSpotlightRight={onSpotlightRight}
		>
			<svg className={css.icon} viewBox="0 -960 960 960" fill="currentColor">
				<path d={iconPathFor(item)} />
			</svg>
			<span className={css.label}>{item.Name}</span>
		</SpottableDiv>
	);
});

const LibraryButtonRow = ({
	title,
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
			// Read before the browser's own focus scroll moves the lane, so the glide starts from what was on screen.
			const start = scroller.scrollLeft;
			scrollTimeoutRef.current = window.requestAnimationFrame(() => {
				glideToCard(scroller, card, start);
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
						<LibraryButton
							key={`${keyPrefix}-${item.Id}`}
							item={item}
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

export default memo(LibraryButtonRow);
