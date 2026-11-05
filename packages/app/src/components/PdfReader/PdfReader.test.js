import {fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import PdfReader from './PdfReader';
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
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('../TrackOptionRow', () => () => null);
jest.mock('../../hooks/useBookProgress', () => () => {});
jest.mock('../../services/storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));
jest.mock('../../utils/books', () => ({
	fetchBook: () => Promise.resolve(new ArrayBuffer(1)),
	loadScript: () => Promise.resolve(),
	startPage: () => 0
}));

const ENTER = 13;
const BACK = 27;

const press = (keyCode) => fireEvent.keyDown(document.body, {keyCode});

const open = async (stored = {}, onClose = () => {}) => {
	getFromStorage.mockImplementation((key) => Promise.resolve(key in stored ? stored[key] : null));
	render(<PdfReader item={{Id: 'p', Name: 'Manual'}} onClose={onClose} />);
	await screen.findByText('1 / 2');
};

beforeAll(() => {
	window.HTMLCanvasElement.prototype.getContext = () => ({});
	const page = {
		getViewport: () => ({width: 100, height: 100}),
		render: () => ({promise: Promise.resolve(), cancel: () => {}})
	};
	const doc = {numPages: 2, getPage: () => Promise.resolve(page), destroy: () => {}};
	window.pdfjsLib = {GlobalWorkerOptions: {}, getDocument: () => ({promise: Promise.resolve(doc)})};
});

beforeEach(() => {
	jest.clearAllMocks();
	saveToStorage.mockResolvedValue(true);
});

describe('PdfReader', () => {
	test('only the page is inverted, not the menu or the info bars', async () => {
		await open({book_reader_fixed_layout_invert: true});
		const canvas = document.querySelector('canvas');
		expect(Array.from(document.querySelectorAll('.inverted'))).toEqual([canvas]);

		press(ENTER);
		expect(screen.getByText('Invert Colors (fixed layout)')).toBeTruthy();
		expect(Array.from(document.querySelectorAll('.inverted'))).toEqual([canvas]);
	});

	test('OK opens the menu on the invert button, which flips the page and is remembered', async () => {
		await open();
		const canvas = document.querySelector('canvas');
		expect(canvas.classList.contains('inverted')).toBe(false);

		press(ENTER);
		expect(Spotlight.focus).toHaveBeenCalledWith('pdf-invert');
		fireEvent.click(screen.getByText('Invert Colors (fixed layout)'));
		expect(saveToStorage).toHaveBeenCalledWith('book_reader_fixed_layout_invert', true);
		expect(canvas.classList.contains('inverted')).toBe(true);
	});

	test('Back closes the menu before it closes the reader', async () => {
		const onClose = jest.fn();
		await open({}, onClose);
		press(ENTER);
		press(BACK);
		expect(screen.queryByText('Invert Colors (fixed layout)')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
		press(BACK);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
