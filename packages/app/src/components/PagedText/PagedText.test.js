import {fireEvent, render} from '@testing-library/react';

import PagedText from './PagedText';

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
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('../../utils/focusScroll', () => ({animateScrollTop: jest.fn()}));

const {animateScrollTop} = require('../../utils/focusScroll');

describe('PagedText', () => {
	const page = (scrollTop, keyCode) => {
		const {container, unmount} = render(<PagedText>text</PagedText>);
		const box = container.firstChild;
		Object.defineProperty(box, 'clientHeight', {value: 100});
		Object.defineProperty(box, 'scrollHeight', {value: 250});
		Object.defineProperty(box, 'scrollTop', {value: scrollTop});
		fireEvent.keyDown(box, {keyCode});
		unmount();
	};

	beforeEach(() => animateScrollTop.mockClear());

	test('Down moves most of a screen and stops at the end', () => {
		page(0, 40);
		expect(animateScrollTop).toHaveBeenLastCalledWith(expect.anything(), 80, 180);
		page(120, 40);
		expect(animateScrollTop).toHaveBeenLastCalledWith(expect.anything(), 150, 180);
	});

	test('a press at the end is left for Spotlight', () => {
		page(0, 38);
		expect(animateScrollTop).not.toHaveBeenCalled();
	});
});
