import {fireEvent, render} from '@testing-library/react';

import ModernMediaRow from './ModernMediaRow';

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
// Pointer mode keeps the row from reaching for layout that jsdom doesn't have.
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => true}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return React.forwardRef(({spotlightId, ...props}, ref) => React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId}));
});
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: {}})}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('../Skeleton', () => ({SkeletonHomeRow: () => null, SkeletonRowTitle: () => null}));
// Like the real card, each one leaves an element beside it in the lane and reports its focus.
jest.mock('../MediaCard/ModernMediaCard', () => {
	const React = require('react');
	return ({item, spotlightId, hideOverview, warmFocusArt, onFocused, carousel}) => React.createElement(React.Fragment, null,
		React.createElement('div', {className: 'spottable', tabIndex: -1, 'data-spotlight-id': spotlightId, 'data-hide-overview': String(hideOverview), 'data-warm': String(warmFocusArt), 'data-carousel': String(carousel), onFocus: () => onFocused(item.Id)}, item.Name),
		React.createElement('div'));
});
jest.mock('./CarouselPanel', () => {
	const React = require('react');
	return ({item, rowFocused}) => React.createElement('div', {'data-panel': item ? item.Id : 'empty', 'data-focused': String(rowFocused)});
});

jest.mock('./CalendarSeeAllCard', () => {
	const React = require('react');
	return ({spotlightId}) => React.createElement('div', {className: 'spottable', tabIndex: -1, 'data-spotlight-id': spotlightId});
});

const items = Array.from({length: 6}, (_, i) => ({Id: `item${i}`, Name: `Title ${i}`}));

const draw = (props) => render(<ModernMediaRow rowId="trending" title="Trending" items={items} rowIndex={2} {...props} />);
const find = (selector) => document.querySelector(selector);
const focusCard = (index) => fireEvent.focus(document.querySelectorAll('.spottable')[index]);

describe('ModernMediaRow', () => {
	it('keeps the row spotlight id Home uses unless it is handed one', () => {
		const {unmount} = draw();
		expect(find('[data-row-index="2"]').getAttribute('data-spotlight-id')).toBe('row-2');
		unmount();
		draw({spotlightId: 'discover-row-2'});
		expect(find('[data-row-index="2"]').getAttribute('data-spotlight-id')).toBe('discover-row-2');
	});

	it('asks for more once focus reaches the last few cards', () => {
		const onLoadMore = jest.fn();
		draw({onLoadMore});
		// Six cards, so the last five ask.
		focusCard(0);
		expect(onLoadMore).not.toHaveBeenCalled();
		focusCard(1);
		expect(onLoadMore).toHaveBeenCalledWith('trending');
	});

	it('counts only the cards when it finds how near the end focus is', () => {
		const onLoadMore = jest.fn();
		const longRow = Array.from({length: 16}, (_, i) => ({Id: `item${i}`, Name: `Title ${i}`}));
		draw({onLoadMore, items: longRow});
		focusCard(10);
		expect(onLoadMore).not.toHaveBeenCalled();
		focusCard(11);
		expect(onLoadMore).toHaveBeenCalledWith('trending');
	});

	it('loads wide art ahead for the card a row is entered on, unless its images are held back', () => {
		const warm = () => Array.from(document.querySelectorAll('.spottable')).map((card) => card.getAttribute('data-warm'));
		const {rerender} = draw();
		expect(warm()).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
		rerender(<ModernMediaRow rowId="trending" title="Trending" items={items} rowIndex={2} deferImages />);
		expect(warm()).not.toContain('true');
	});

	it('ends the row with the calendar See all card only when asked to', () => {
		const ids = () => Array.from(document.querySelectorAll('.spottable')).map((card) => card.getAttribute('data-spotlight-id'));
		const {rerender} = draw();
		expect(ids()).not.toContain('media-trending-calendar-see-all');
		rerender(<ModernMediaRow rowId="trending" title="Trending" items={items} rowIndex={2} onCalendarSeeAll={() => {}} />);
		expect(ids()[ids().length - 1]).toBe('media-trending-calendar-see-all');
	});

	it('still tells the screen which row took focus', () => {
		const onFocus = jest.fn();
		draw({onFocus});
		focusCard(0);
		expect(onFocus).toHaveBeenCalledWith(2);
	});

	it('draws the Carousel panel only when asked to, with its cards told to leave their captions to it', () => {
		const {rerender} = draw();
		expect(find('[data-panel]')).toBeNull();
		expect(find('[data-carousel="true"]')).toBeNull();
		rerender(<ModernMediaRow rowId="trending" title="Trending" items={items} rowIndex={2} carousel />);
		expect(find('[data-panel]')).not.toBeNull();
		expect(document.querySelectorAll('[data-carousel="true"]')).toHaveLength(6);
	});

	it('shows the first title until focus comes in, then the focused one, and keeps it when focus leaves', () => {
		draw({carousel: true});
		const panel = () => find('[data-panel]').getAttribute('data-panel');
		const focused = () => find('[data-panel]').getAttribute('data-focused');
		expect(panel()).toBe('item0');
		expect(focused()).toBe('false');
		focusCard(3);
		expect(panel()).toBe('item3');
		expect(focused()).toBe('true');
		fireEvent.blur(find('[data-row-index="2"]'), {relatedTarget: null});
		expect(panel()).toBe('item3');
		expect(focused()).toBe('false');
	});

	it('stands an empty panel in while a Carousel row loads', () => {
		draw({loading: true, carousel: true});
		expect(find('[data-panel]').getAttribute('data-panel')).toBe('empty');
	});

	it('hands its cards the choice to hide the description, which shows unless asked', () => {
		const hidden = () => Array.from(document.querySelectorAll('.spottable')).map((card) => card.getAttribute('data-hide-overview'));
		const {rerender} = draw();
		expect(hidden()).toEqual(Array(6).fill('false'));
		rerender(<ModernMediaRow rowId="trending" title="Trending" items={items} rowIndex={2} hideOverview />);
		expect(hidden()).toEqual(Array(6).fill('true'));
	});
});
