import {act, fireEvent, render} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import TileGrid from './TileGrid';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), setPointerMode: jest.fn()}));

const KEY = {left: 37, up: 38, right: 39, down: 40};
const ITEM_SIZE = {minWidth: 200, minHeight: 300};
const renderTile = (index, focused, style) => (
	<div key={index} data-index={index} data-focused={focused} style={style}>{index}</div>
);

// Five columns and two rows of tiles fit the viewport.
beforeAll(() => {
	Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {configurable: true, get: () => 1000});
	Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 600});
});

beforeEach(() => {
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		callback();
		return 0;
	});
	Spotlight.focus.mockClear();
});

afterEach(() => jest.restoreAllMocks());

const setup = (props = {}) => {
	const onFocusIndex = jest.fn();
	const onKeyDown = jest.fn();
	const view = render(
		<TileGrid dataSize={500} itemSize={ITEM_SIZE} renderTile={renderTile} spotlightId="grid" onFocusIndex={onFocusIndex} onKeyDown={onKeyDown} {...props} />
	);
	const grid = document.querySelector('[data-spotlight-id="grid"]');
	const press = (key) => {
		fireEvent.keyDown(grid, {keyCode: KEY[key]});
		fireEvent.keyUp(grid, {keyCode: KEY[key]});
	};
	const focusedTile = () => document.querySelector('[data-focused="true"]');
	const track = () => grid.firstChild.firstChild;
	return {...view, grid, press, focusedTile, track, onFocusIndex, onKeyDown};
};

describe('TileGrid', () => {
	test('draws only the rows around the view, however long the list', () => {
		setup();
		expect(document.querySelectorAll('[data-index]:not([data-spotlight-id])')).toHaveLength(15);
	});

	test('moves its own focus with the arrows and reports each tile', () => {
		const {grid, press, focusedTile, onFocusIndex} = setup();
		fireEvent.focus(grid);
		expect(focusedTile().textContent).toBe('0');
		press('right');
		press('down');
		expect(grid.getAttribute('data-index')).toBe('6');
		expect(focusedTile().textContent).toBe('6');
		expect(onFocusIndex).toHaveBeenLastCalledWith(6);
	});

	test('shows no focused tile while focus is somewhere else', () => {
		const {grid, focusedTile} = setup();
		fireEvent.focus(grid);
		fireEvent.blur(grid);
		expect(focusedTile()).toBeNull();
	});

	test('hands presses that leave the grid on to the caller', () => {
		const {grid, press, onKeyDown} = setup();
		fireEvent.focus(grid);
		press('up');
		press('left');
		expect(onKeyDown).toHaveBeenCalledTimes(2);
		expect(grid.getAttribute('data-index')).toBe('0');
	});

	test('slides the rows up once the focused row would leave the view, and recycles them', () => {
		const {grid, press, track} = setup();
		fireEvent.focus(grid);
		press('down');
		press('down');
		press('down');
		expect(track().style.transform).toBe('translateY(-600px)');
		expect(grid.getAttribute('data-scrolled')).toBe('true');
		expect(document.querySelectorAll('[style*="translateY"]').length).toBeLessThanOrEqual(1 + 4);
	});

	test('lets the page scroll it back to the start and focus it', () => {
		let scrollTo;
		const {grid, press} = setup({
			cbScrollTo: (fn) => {
				scrollTo = fn;
			}
		});
		fireEvent.focus(grid);
		press('down');
		press('down');
		press('down');
		act(() => scrollTo({index: 0, focus: true}));
		expect(grid.getAttribute('data-index')).toBe('0');
		expect(grid.getAttribute('data-scrolled')).toBe('false');
		expect(Spotlight.focus).toHaveBeenCalledWith('grid');
	});

	test('focuses the tile under a pointer without scrolling', () => {
		const {grid, track} = setup();
		fireEvent.focus(grid);
		fireEvent.mouseOver(document.querySelector('[data-index="12"]:not([data-spotlight-id])'));
		expect(grid.getAttribute('data-index')).toBe('12');
		expect(track().style.transform).toBe('translateY(0px)');
	});

	test('scrolls a row per wheel step without moving focus, and stops at either end', () => {
		const {grid, track} = setup();
		fireEvent.focus(grid);
		fireEvent.wheel(grid, {deltaY: 100});
		fireEvent.wheel(grid, {deltaY: 100});
		expect(track().style.transform).toBe('translateY(-600px)');
		expect(grid.getAttribute('data-index')).toBe('0');
		fireEvent.wheel(grid, {deltaY: -100});
		fireEvent.wheel(grid, {deltaY: -100});
		fireEvent.wheel(grid, {deltaY: -100});
		expect(track().style.transform).toBe('translateY(0px)');
	});

	test('starts a new list from its first tile', () => {
		const {grid, press, rerender} = setup({resetKey: 'a'});
		fireEvent.focus(grid);
		press('down');
		rerender(<TileGrid dataSize={500} itemSize={ITEM_SIZE} renderTile={renderTile} spotlightId="grid" resetKey="b" />);
		expect(grid.getAttribute('data-index')).toBe('0');
	});

	test('starts a new shorter list from its first tile too', () => {
		const {grid, press, rerender} = setup({resetKey: 'a'});
		fireEvent.focus(grid);
		press('down');
		press('down');
		press('down');
		rerender(<TileGrid dataSize={7} itemSize={ITEM_SIZE} renderTile={renderTile} spotlightId="grid" resetKey="b" />);
		expect(grid.getAttribute('data-index')).toBe('0');
	});
});
