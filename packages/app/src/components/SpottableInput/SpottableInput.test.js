import {act, fireEvent, render} from '@testing-library/react';

import SpottableInput from './SpottableInput';

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
	return ({spotlightId, spotlightDisabled, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId}); // eslint-disable-line no-unused-vars
});
let mockKeyboardStyle = 'native';
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: {keyboardStyle: mockKeyboardStyle}})}));
let mockOpened = null;
let mockPublished = [];
jest.mock('../TVKeyboard/keyboardBus', () => ({
	openTvKeyboard: (options) => {
		mockOpened = options;
		return true;
	},
	closeTvKeyboard: () => {},
	publishTvKeyboardVisibility: (visible) => mockPublished.push(visible)
}));

const input = () => document.querySelector('input');

describe('SpottableInput', () => {
	beforeEach(() => {
		mockKeyboardStyle = 'native';
		mockOpened = null;
		mockPublished = [];
	});

	test('the native keyboard hides the placeholder while the field has focus', () => {
		mockKeyboardStyle = 'native';
		render(<SpottableInput spotlightId="name" placeholder="Group name" value="" onChange={() => {}} />);
		expect(input().placeholder).toBe('Group name');
		fireEvent.click(input().parentNode.parentNode);
		expect(document.activeElement).toBe(input());
		expect(input().placeholder).toBe('');
		act(() => input().blur());
		expect(input().placeholder).toBe('Group name');
	});

	test("the TV keyboard hides the placeholder while it's open", () => {
		mockKeyboardStyle = 'tv';
		render(<SpottableInput spotlightId="name" placeholder="Group name" value="" onChange={() => {}} />);
		fireEvent.click(input().parentNode.parentNode);
		expect(mockOpened).not.toBeNull();
		expect(input().placeholder).toBe('');
		act(() => mockOpened.onClose({submitted: false, reason: 'back'}));
		expect(input().placeholder).toBe('Group name');
	});

	test("closing the TV's own keyboard lets the field go", () => {
		mockKeyboardStyle = 'native';
		render(<SpottableInput spotlightId="name" value="" onChange={() => {}} />);
		fireEvent.click(input().parentNode.parentNode);
		expect(document.activeElement).toBe(input());
		act(() => {
			document.dispatchEvent(new CustomEvent('keyboardStateChange', {detail: {visibility: false}}));
		});
		expect(document.activeElement).not.toBe(input());
		expect(mockPublished).toEqual([true, false]);
	});

	test("a field the TV's own keyboard had says the keyboard is gone when it goes away", () => {
		mockKeyboardStyle = 'native';
		const {unmount} = render(<SpottableInput spotlightId="name" value="" onChange={() => {}} />);
		fireEvent.click(input().parentNode.parentNode);
		unmount();
		expect(mockPublished).toEqual([true, false]);
	});
});
