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
jest.mock('@enact/spotlight/Spottable', () => (Component) => Component);
jest.mock('@enact/spotlight', () => ({focus: () => {}}));

import {activeDotIndex} from './MakdBanner';

describe('activeDotIndex', () => {
	test('lights the slide itself while there are five titles or fewer', () => {
		expect([0, 1, 2, 3, 4].map((i) => activeDotIndex(i, 5))).toEqual([0, 1, 2, 3, 4]);
		expect(activeDotIndex(2, 3)).toBe(2);
	});

	test('lights the share of the run past five titles, as the original does', () => {
		expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => activeDotIndex(i, 10))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
		expect(activeDotIndex(11, 12)).toBe(4);
	});
});
