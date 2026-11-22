import {act, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import ComicViewer, {comicPageStep} from './ComicViewer';
import {getFromStorage, saveToStorage} from '../../services/storage';

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
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, {tabIndex: -1, ...props}, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('../../hooks/useBookProgress', () => () => {});
jest.mock('../../services/storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));
jest.mock('../../utils/books', () => ({
	fetchBook: () => Promise.resolve(new ArrayBuffer(1)),
	startPage: () => 0
}));
jest.mock('../../utils/comicPages', () => ({
	openComicPages: () => Promise.resolve({
		names: ['1.png', '2.png', '3.png'],
		load: () => Promise.resolve(new Blob(['page'])),
		close: () => {}
	})
}));

const LEFT = 37;
const UP = 38;
const RIGHT = 39;
const DOWN = 40;
const ENTER = 13;
const BACK = 27;

const press = (keyCode) => fireEvent.keyDown(document.body, {keyCode});
const bars = () => document.querySelector('.infoOverlay');
const barsShown = () => bars().classList.contains('infoVisible');

const open = async (stored = {}, onClose = () => {}) => {
	getFromStorage.mockImplementation((key) => Promise.resolve(key in stored ? stored[key] : null));
	render(<ComicViewer item={{Id: 'c', Name: 'Comic'}} archive="zip" onClose={onClose} />);
	await screen.findByText('1 / 3');
};

beforeAll(() => {
	URL.createObjectURL = () => 'blob:page';
	URL.revokeObjectURL = () => {};
});

beforeEach(() => {
	jest.clearAllMocks();
	saveToStorage.mockResolvedValue(true);
});

afterEach(() => {
	jest.useRealTimers();
});

describe('comicPageStep', () => {
	test('Right is the next page left to right and Left is the next page right to left', () => {
		expect(comicPageStep(RIGHT, false)).toBe(1);
		expect(comicPageStep(LEFT, false)).toBe(-1);
		expect(comicPageStep(LEFT, true)).toBe(1);
		expect(comicPageStep(RIGHT, true)).toBe(-1);
	});

	test('Up and Down turn no page', () => {
		expect(comicPageStep(UP, false)).toBe(0);
		expect(comicPageStep(DOWN, true)).toBe(0);
	});
});

describe('ComicViewer', () => {
	test('in a right to left comic Left turns to the next page once the bars are hidden', async () => {
		await open({book_reader_comic_direction: 'rtl'});
		press(BACK);
		expect(barsShown()).toBe(false);

		press(LEFT);
		expect(screen.getByText('2 / 3')).toBeTruthy();
		press(RIGHT);
		expect(screen.getByText('1 / 3')).toBeTruthy();
		expect(screen.getByLabelText('Right to left (manga)')).toBeTruthy();
	});

	test('the direction button flips the arrows and is remembered', async () => {
		await open();
		fireEvent.click(screen.getByLabelText('Left to right'));
		expect(saveToStorage).toHaveBeenCalledWith('book_reader_comic_direction', 'rtl');
		press(BACK);
		press(LEFT);
		expect(screen.getByText('2 / 3')).toBeTruthy();
	});

	test('while the bars are up a press only brings focus into them, and Up or Down brings them back', async () => {
		await open();
		press(RIGHT);
		expect(Spotlight.focus).toHaveBeenCalledWith('comic-controls');
		expect(screen.getByText('1 / 3')).toBeTruthy();

		press(BACK);
		press(DOWN);
		expect(barsShown()).toBe(true);
		expect(screen.getByText('1 / 3')).toBeTruthy();
	});

	test('arrows are left to Spotlight once focus is in the bars', async () => {
		await open();
		screen.getByLabelText('Invert colors').focus();
		const event = new window.KeyboardEvent('keydown', {keyCode: RIGHT, bubbles: true, cancelable: true});
		document.activeElement.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(screen.getByText('1 / 3')).toBeTruthy();
	});

	test('Back hides the bars before it closes the reader', async () => {
		const onClose = jest.fn();
		await open({}, onClose);
		press(BACK);
		expect(barsShown()).toBe(false);
		expect(onClose).not.toHaveBeenCalled();
		press(ENTER);
		expect(barsShown()).toBe(true);
		press(BACK);
		press(BACK);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test('only the page is inverted, not the bars or the background', async () => {
		await open({book_reader_fixed_layout_invert: true});
		const page = await screen.findByAltText('Page 1');
		expect(page.classList.contains('inverted')).toBe(true);
		expect(document.querySelectorAll('.inverted')).toHaveLength(1);
		expect(bars().closest('.inverted')).toBeNull();
	});

	test('the invert button is remembered for comics and PDFs alike', async () => {
		await open();
		const page = await screen.findByAltText('Page 1');
		expect(page.classList.contains('inverted')).toBe(false);
		fireEvent.click(screen.getByLabelText('Invert colors'));
		expect(saveToStorage).toHaveBeenCalledWith('book_reader_fixed_layout_invert', true);
		expect(page.classList.contains('inverted')).toBe(true);
	});

	test('the bars hide on their own by default', async () => {
		jest.useFakeTimers();
		await open();
		expect(screen.getByLabelText('Controls hide automatically')).toBeTruthy();
		act(() => jest.advanceTimersByTime(4000));
		expect(barsShown()).toBe(false);
	});

	test('the bars stay up when that was remembered', async () => {
		jest.useFakeTimers();
		await open({book_reader_comic_auto_hide: false});
		expect(screen.getByLabelText('Controls stay visible')).toBeTruthy();
		act(() => jest.advanceTimersByTime(10000));
		expect(barsShown()).toBe(true);
	});

	test('the eye button keeps the bars up and remembers it', async () => {
		jest.useFakeTimers();
		await open();
		fireEvent.click(screen.getByLabelText('Controls hide automatically'));
		expect(saveToStorage).toHaveBeenCalledWith('book_reader_comic_auto_hide', false);
		expect(screen.getByLabelText('Controls stay visible')).toBeTruthy();
		act(() => jest.advanceTimersByTime(10000));
		expect(barsShown()).toBe(true);
	});
});
