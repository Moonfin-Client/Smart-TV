import {useCallback, useRef, useEffect, useState, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {glideToCard} from '../../utils/focusScroll';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';
import {classicCardSize} from '../MediaCard/MediaCard';
import {modernCardMetrics} from '../MediaCard/modernCardLayout';
import GameCard from '../GameCard';
import {gameThumbUrl} from '../../services/gamesApi';
import {PORTRAIT_HEIGHT} from '../../utils/gameArt';

import css from './SeerrTileRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SpottableDiv = Spottable('div');

const FOCUS_SETTLE_MS = 50;

const TileCard = memo(function TileCard({item, cardType, gameWidth, spotlightId, onSelect, onFocusItem, onFocusGame, onSpotlightLeft, onSpotlightRight}) {
	const focusTimeoutRef = useRef(null);
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
		};
	}, []);

	// The cards in the other rows let a step settle before announcing it, so passing
	// over a tile on the way somewhere else doesn't put it up on the info band.
	const handleFocus = useCallback(() => {
		if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
		focusTimeoutRef.current = setTimeout(() => onFocusItem?.(item), FOCUS_SETTLE_MS);
	}, [item, onFocusItem]);
	const handleGameFocus = useCallback(() => {
		handleFocus();
		onFocusGame?.(item);
	}, [handleFocus, onFocusGame, item]);

	// A game library's recent games, each card shaped like its box art.
	if (cardType === 'game') {
		return (
			<GameCard
				game={item}
				artUrl={gameThumbUrl(item._library?.Id, item.id)}
				aspect={item._aspect}
				width={gameWidth}
				spotlightId={spotlightId}
				onSelect={onSelect}
				onFocus={handleGameFocus}
				onSpotlightLeft={onSpotlightLeft}
				onSpotlightRight={onSpotlightRight}
			/>
		);
	}

	const isLogo = cardType === 'logo';
	const image = isLogo ? item._externalLogoUrl : item._externalTileUrl;

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
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);

	const keyPrefix = rowId || title || rowIndex || '';
	// Game art fills the height a poster card has in the picked row style.
	const posterHeight = settings.homeRowsStyle !== 'v1'
		? modernCardMetrics({posterSize: settings.homeRowsPosterSize}).imageHeight
		: classicCardSize('portrait', settings.homeRowsPosterSize).height;
	const gameWidth = posterHeight / PORTRAIT_HEIGHT;
	// Modern has no info area, so a game row shows the focused game's description under its cards.
	const showGameDescription = cardType === 'game' && settings.homeRowsStyle !== 'v1';
	const [focusedGame, setFocusedGame] = useState(null);
	const handleRowBlur = useCallback((e) => {
		if (!e.currentTarget.contains(e.relatedTarget)) setFocusedGame(null);
	}, []);

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
			onBlur={showGameDescription ? handleRowBlur : undefined}
		>
			<h2 className={css.title}>{title}</h2>
			<div className={css.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={css.items}>
					{items.map((item, index) => (
						<TileCard
							key={`${keyPrefix}-${item.Id}`}
							item={item}
							cardType={cardType}
							gameWidth={gameWidth}
							onFocusGame={showGameDescription ? setFocusedGame : undefined}
							spotlightId={`media-${keyPrefix}-${item.Id}`}
							onSelect={handleSelect}
							onFocusItem={onFocusItem}
							onSpotlightLeft={index === 0 ? handleWrapLeft : null}
							onSpotlightRight={index === items.length - 1 ? handleWrapRight : null}
						/>
					))}
				</div>
			</div>
			{showGameDescription && <p className={css.gameDescription}>{focusedGame?.Overview || ''}</p>}
		</RowContainer>
	);
};

export default memo(SeerrTileRow);
