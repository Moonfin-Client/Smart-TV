import {memo, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import Accelerator from '@enact/spotlight/Accelerator';
import {KEYS} from '../../utils/keys';
import {gridLayout, moveIndex, scrollRowFor} from './tileGridMath';

import css from './TileGrid.module.less';

// A grid for long lists where every focus move has to stay cheap. The grid itself is the one thing
// Spotlight focuses. It moves its own focus between tiles, reuses a fixed set of rows that each sit on
// their own layer, and slides them with a transform, so a move redraws two tiles and scrolling
// redraws one row. Spotlight only hears the presses that leave the grid.

const SpottableDiv = Spottable('div');
const DIRECTIONS = {[KEYS.LEFT]: 'left', [KEYS.RIGHT]: 'right', [KEYS.UP]: 'up', [KEYS.DOWN]: 'down'};

const translateY = (y) => {
	const value = `translateY(${y}px)`;
	return {WebkitTransform: value, transform: value};
};

const Tile = memo(({index, focused, left, width, height, renderTile}) => (
	renderTile(index, focused, {position: 'absolute', top: 0, left, width, height})
));

const Row = memo(({row, columns, dataSize, focusedColumn, tileWidth, rowHeight, renderTile}) => {
	const tiles = [];
	for (let column = 0; column < columns; column++) {
		const index = row * columns + column;
		if (index >= dataSize) break;
		tiles.push(
			<Tile
				key={column}
				index={index}
				focused={column === focusedColumn}
				left={column * tileWidth}
				width={tileWidth}
				height={rowHeight}
				renderTile={renderTile}
			/>
		);
	}
	return <div className={css.row} style={{...translateY(row * rowHeight), height: rowHeight}}>{tiles}</div>;
});

// Memoized, since the page around it redraws on every focus move to show the focused item.
const TileGrid = memo(({className, dataSize, itemSize, renderTile, spotlightId, resetKey, cbScrollTo, onFocusIndex, onKeyDown, onClick}) => {
	const viewportRef = useRef(null);
	const [size, setSize] = useState({width: 0, height: 0});
	const [focusIndex, setFocusIndex] = useState(0);
	const [firstRow, setFirstRow] = useState(0);
	const [hasFocus, setHasFocus] = useState(false);
	const [accelerator] = useState(() => new Accelerator());

	const layout = gridLayout(size.width, size.height, itemSize.minWidth, itemSize.minHeight);
	const totalRows = Math.ceil(dataSize / layout.columns);
	const stateRef = useRef();
	stateRef.current = {focusIndex, firstRow, layout, dataSize, totalRows};

	useLayoutEffect(() => {
		const measure = () => {
			const node = viewportRef.current;
			if (node) setSize({width: node.clientWidth, height: node.clientHeight});
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);

	// A new list starts from its top, while more pages landing on the same one keep the place.
	useEffect(() => {
		setFocusIndex(0);
		setFirstRow(0);
	}, [resetKey]);

	// Reads the latest index, so a new list that also arrives shorter keeps the reset above.
	useEffect(() => {
		if (dataSize > 0 && focusIndex >= dataSize) setFocusIndex((index) => Math.min(index, dataSize - 1));
	}, [dataSize, focusIndex]);

	const moveTo = useCallback((index, scroll) => {
		const state = stateRef.current;
		setFocusIndex(index);
		if (scroll) setFirstRow(scrollRowFor(Math.floor(index / state.layout.columns), state.firstRow, state.layout.fullRows));
		if (onFocusIndex) onFocusIndex(index);
	}, [onFocusIndex]);

	useEffect(() => {
		if (!cbScrollTo) return;
		cbScrollTo(({index = 0, focus}) => {
			const state = stateRef.current;
			const target = Math.max(0, Math.min(index, state.dataSize - 1));
			// Set ahead of the render, since taking focus reports the index right away.
			state.focusIndex = target;
			setFocusIndex(target);
			setFirstRow(scrollRowFor(Math.floor(target / state.layout.columns), state.firstRow, state.layout.fullRows));
			if (focus) Spotlight.focus(spotlightId);
		});
	}, [cbScrollTo, spotlightId]);

	// A held key can't queue moves up behind a slow frame, since any presses that land inside one
	// frame become a single move.
	const pendingRef = useRef(null);
	const applyPending = useCallback(() => {
		const direction = pendingRef.current;
		pendingRef.current = null;
		const state = stateRef.current;
		const next = moveIndex(state.focusIndex, direction, state.layout.columns, state.dataSize);
		if (next !== null) moveTo(next, true);
	}, [moveTo]);

	const handleKeyDown = useCallback((ev) => {
		const direction = DIRECTIONS[ev.keyCode];
		const state = stateRef.current;
		if (!direction || state.dataSize === 0 || moveIndex(state.focusIndex, direction, state.layout.columns, state.dataSize) === null) {
			if (onKeyDown) onKeyDown(ev);
			return;
		}
		ev.preventDefault();
		ev.stopPropagation();
		Spotlight.setPointerMode(false);
		accelerator.processKey(ev, () => {
			const idle = pendingRef.current === null;
			pendingRef.current = direction;
			if (idle) window.requestAnimationFrame(applyPending);
		});
	}, [accelerator, applyPending, onKeyDown]);

	const handleKeyUp = useCallback((ev) => {
		accelerator.processKey(ev, () => {});
	}, [accelerator]);

	const handleFocus = useCallback(() => {
		setHasFocus(true);
		if (onFocusIndex && stateRef.current.dataSize > 0) onFocusIndex(stateRef.current.focusIndex);
	}, [onFocusIndex]);

	const handleBlur = useCallback(() => setHasFocus(false), []);

	// A pointer focuses whatever tile it's over without scrolling, so the tile stays under it. Over the
	// gaps the grid's own index is found instead, which leaves focus where it was.
	const handleMouseOver = useCallback((ev) => {
		const tile = ev.target.closest('[data-index]');
		if (!tile) return;
		const index = Number(tile.getAttribute('data-index'));
		if (index !== stateRef.current.focusIndex) moveTo(index, false);
	}, [moveTo]);

	const handleWheel = useCallback((ev) => {
		const state = stateRef.current;
		const lastFirst = Math.max(0, state.totalRows - state.layout.fullRows);
		setFirstRow(Math.max(0, Math.min(lastFirst, state.firstRow + (ev.deltaY > 0 ? 1 : -1))));
	}, []);

	const pool = layout.visibleRows + 2;
	const focusRow = Math.floor(focusIndex / layout.columns);
	const rows = [];
	if (size.width > 0) {
		const last = Math.min(totalRows - 1, firstRow + layout.visibleRows);
		for (let row = Math.max(0, firstRow - 1); row <= last; row++) rows.push(row);
	}

	return (
		<SpottableDiv
			spotlightId={spotlightId}
			className={`${css.grid} ${className || ''}`}
			data-index={focusIndex}
			data-scrolled={firstRow > 0}
			data-pointer-steps
			onKeyDown={handleKeyDown}
			onKeyUp={handleKeyUp}
			onFocus={handleFocus}
			onBlur={handleBlur}
			onClick={onClick}
			onMouseOver={handleMouseOver}
			onWheel={handleWheel}
		>
			<div className={css.viewport} ref={viewportRef}>
				<div className={css.track} style={translateY(-firstRow * layout.rowHeight)}>
					{rows.map((row) => (
						<Row
							key={row % pool}
							row={row}
							columns={layout.columns}
							dataSize={dataSize}
							focusedColumn={hasFocus && row === focusRow ? focusIndex % layout.columns : -1}
							tileWidth={layout.tileWidth}
							rowHeight={layout.rowHeight}
							renderTile={renderTile}
						/>
					))}
				</div>
			</div>
		</SpottableDiv>
	);
});

export default TileGrid;
