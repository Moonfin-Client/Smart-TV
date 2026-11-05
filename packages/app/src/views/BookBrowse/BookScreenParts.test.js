import {renderHook} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import {KEYS} from '../../utils/keys';
import {RAIL_CURRENT_ID, STRIP_CURRENT_ID, contentKeyHandler, headerSpotlightId, landingTargets, rowEdgeKey, useScreenBack} from './BookScreenParts';

// The parts come with components, so these stand in as they do in MusicScreenParts.test.js.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getPointerMode: () => false}));
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);
jest.mock('../../components/MediaCard', () => () => null);
jest.mock('./BookCard', () => ({__esModule: true, default: () => null, BookIcon: () => null}));

const box = (spotlightId, top, bottom, parent = document.body) => {
	const el = document.createElement('div');
	if (spotlightId) el.setAttribute('data-spotlight-id', spotlightId);
	el.getBoundingClientRect = () => ({top, bottom, left: 0, right: 100});
	parent.appendChild(el);
	return el;
};

const press = (keyCode, target, currentTarget) => ({keyCode, target, currentTarget, preventDefault: jest.fn(), stopPropagation: jest.fn()});

afterEach(() => {
	document.body.innerHTML = '';
	Spotlight.focus.mockReset();
});

describe('Up from a book screen\'s content', () => {
	test('a lower row is left alone', () => {
		box('book-title-0', 200, 400);
		const e = press(KEYS.UP, box('book-title-6', 420, 620));
		contentKeyHandler('titles')(e);
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	test('the top row goes to the header controls, or the strip without any', () => {
		const first = box('book-series-0-0', 200, 400);
		contentKeyHandler('series')(press(KEYS.UP, first));
		expect(Spotlight.focus).toHaveBeenCalledWith(STRIP_CURRENT_ID);

		Spotlight.focus.mockReset();
		const header = box(headerSpotlightId('series'), 100, 160);
		box(null, 100, 160, header).className = 'spottable';
		contentKeyHandler('series')(press(KEYS.UP, first));
		expect(Spotlight.focus).toHaveBeenCalledWith(headerSpotlightId('series'));
	});
});

describe('landing', () => {
	test('Bookstore titles open on what is being read, then the grid, then the nav', () => {
		expect(landingTargets('titles')).toEqual(['book-continue', 'book-title-0', false, STRIP_CURRENT_ID, RAIL_CURRENT_ID]);
	});
});

describe('row edges', () => {
	test('Left off the first card goes to the rail and Right off the last holds', () => {
		const row = box(null, 0, 0);
		const first = box(null, 0, 0, row);
		box(null, 0, 0, row);
		const last = box(null, 0, 0, row);
		box(null, 0, 0, row);
		first.className = 'spottable';
		last.className = 'spottable';
		const left = press(KEYS.LEFT, first, row);
		expect(rowEdgeKey(left)).toBe(true);
		expect(Spotlight.focus).toHaveBeenCalledWith(RAIL_CURRENT_ID);
		expect(rowEdgeKey(press(KEYS.RIGHT, last, row))).toBe(true);
		expect(rowEdgeKey(press(KEYS.RIGHT, first, row))).toBe(false);
	});
});

describe('Back', () => {
	test('closes what the screen has open, then goes where the screen says, or leaves from the root', () => {
		const ref = {current: null};
		const onBack = jest.fn();
		let open = true;
		const {rerender} = renderHook(({back}) => useScreenBack(ref, back, () => {
			if (!open) return false;
			open = false;
			return true;
		}), {initialProps: {back: onBack}});
		expect(ref.current()).toBe(true);
		expect(onBack).not.toHaveBeenCalled();
		expect(ref.current()).toBe(true);
		expect(onBack).toHaveBeenCalledTimes(1);
		rerender({back: null});
		expect(ref.current()).toBe(false);
	});
});
