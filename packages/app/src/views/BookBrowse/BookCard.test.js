import {render} from '@testing-library/react';

import BookCard from './BookCard';

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
	return ({spotlightId, ...rest}) => React.createElement(type, {...rest, 'data-spotlight-id': spotlightId});
});
let mockSettings = {};
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));

const BOOK = {Id: 'book-1', Name: 'Dune', Type: 'Book'};

const drawCard = (props) => {
	render(<BookCard item={BOOK} serverUrl="http://server" width={198} {...props} />);
	return document.querySelector('[data-book-id="book-1"]');
};

describe('BookCard with Focus Expansion', () => {
	it('grows on focus while the setting is on', () => {
		mockSettings = {cardFocusZoom: true};
		expect(drawCard().className.split(' ')).not.toContain('noZoom');
	});

	it('keeps its size on focus while the setting is off', () => {
		mockSettings = {cardFocusZoom: false};
		expect(drawCard().className.split(' ')).toContain('noZoom');
	});

	it('keeps a finished book dimmed either way', () => {
		mockSettings = {cardFocusZoom: false};
		expect(drawCard({finished: true}).className.split(' ')).toEqual(['card', 'finished', 'noZoom']);
	});
});
