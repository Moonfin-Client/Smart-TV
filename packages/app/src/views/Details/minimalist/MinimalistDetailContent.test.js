import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../../context/defaultSettings';
import MinimalistDetailContent from './MinimalistDetailContent';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
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
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn(() => true)}}));

// Spottable and the spotlight containers need the framework's own React, so they become plain
// elements that carry their id where a test can find it.
jest.mock('@enact/spotlight/Spottable', () => {
	const React = require('react');
	return (tag) => ({spotlightId, ...props}) => React.createElement(tag, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => {
	const React = require('react');
	return (config, tag) => ({spotlightId, spotlightDisabled, ...props}) => React.createElement(tag, {
		...props, 'data-spotlight-id': spotlightId, 'data-spotlight-container-disabled': spotlightDisabled
	});
});
jest.mock('@enact/sandstone/Scroller', () => {
	const React = require('react');
	return {Scroller: ({children}) => React.createElement('div', null, children)};
});
jest.mock('../../../components/LoopMarquee', () => {
	const React = require('react');
	return ({text}) => React.createElement('span', null, text);
});
jest.mock('../../../components/IncompleteBadge', () => ({IncompleteDetailLine: () => null}));
jest.mock('../spotlight/SpotlightDetailContent', () => () => null);
jest.mock('./MinimalistEpisodes', () => ({__esModule: true, default: () => null, EPISODES_ID: 'minimalist-episodes'}));

// Each extra becomes a button that picks it, since picking is all the screen needs from the grid.
jest.mock('../spotlight/SpotlightGrids', () => {
	const React = require('react');
	return ({section, actions}) => section.items.map((extra) => React.createElement(
		'button', {key: extra.Id, onClick: () => actions.openItem(extra)}, extra.Name
	));
});

const movie = {Id: 'm1', Type: 'Movie', Name: 'Arrival', UserData: {}};
const makingOf = {Id: 'bts-1', Type: 'Video', ExtraType: 'BehindTheScenes', Name: 'Making of'};

const extrasButton = () => document.querySelector('[data-spotlight-id="details-extras-btn"]');

const open = (overrides = {}) => {
	const props = {
		item: movie,
		settings: {...defaultSettings},
		seerr: {},
		effectiveServerUrl: 'http://server',
		extras: [makingOf],
		handlePlay: jest.fn(),
		handleEpisodePlay: jest.fn(),
		spotlightBackRef: {current: null},
		...overrides
	};
	render(<MinimalistDetailContent {...props} />);
	return props;
};

beforeEach(() => {
	jest.useFakeTimers();
	Spotlight.focus.mockClear();
});

afterEach(() => {
	jest.useRealTimers();
});

describe('the Extras button', () => {
	it('sits straight after Play on a movie with extras and opens them', () => {
		open();
		const row = document.querySelector('[data-spotlight-id="details-action-buttons"]');
		expect(row.children[0].getAttribute('data-spotlight-id')).toBe('details-primary-btn');
		expect(row.children[1]).toBe(extrasButton());
		expect(screen.queryByText('Making of')).toBeNull();

		fireEvent.click(extrasButton());

		expect(screen.getByText('Behind the Scenes')).toBeTruthy();
		expect(screen.getByText('Making of')).toBeTruthy();
		act(() => jest.advanceTimersByTime(100));
		expect(Spotlight.focus).toHaveBeenCalledWith('spotlight-modal-first');
	});

	it('is left out in Kids Mode', () => {
		open({settings: {...defaultSettings, kidsModeEnabled: true}});
		expect(extrasButton()).toBeNull();
	});

	it('is left out when there are no extras', () => {
		open({extras: []});
		expect(extrasButton()).toBeNull();
	});

	it('closes on Back and hands focus back to the button, and the next Back leaves the screen', () => {
		const {spotlightBackRef} = open();
		fireEvent.click(extrasButton());

		let handled;
		act(() => {
			handled = spotlightBackRef.current();
		});
		expect(handled).toBe(true);
		expect(screen.queryByText('Making of')).toBeNull();
		act(() => jest.advanceTimersByTime(50));
		expect(Spotlight.focus).toHaveBeenLastCalledWith('details-extras-btn');

		expect(spotlightBackRef.current()).toBe(false);
	});

	it('plays the extra picked and closes', () => {
		const {handleEpisodePlay} = open();
		fireEvent.click(extrasButton());

		fireEvent.click(screen.getByText('Making of'));

		expect(handleEpisodePlay).toHaveBeenCalledWith(makingOf);
		expect(screen.queryByText('Making of')).toBeNull();
	});
});

describe('a collection', () => {
	const boxSet = {Id: 'b1', Type: 'BoxSet', Name: 'Alien Collection', UserData: {}};
	const alien = {Id: 'm1', Type: 'Movie', Name: 'Alien'};
	const aliens = {Id: 'm2', Type: 'Movie', Name: 'Aliens'};
	const show = {Id: 's1', Type: 'Series', Name: 'Alien: Earth'};
	const collectionButton = () => document.querySelector('[data-spotlight-id="details-collection-items-btn"]');

	// Kids Mode drops the other sheet buttons, but these are the reason to open a collection at all.
	[false, true].forEach((kidsModeEnabled) => {
		it(`keeps its movies behind a button named for them (Kids Mode ${kidsModeEnabled})`, () => {
			open({item: boxSet, extras: [], collectionItems: [alien, aliens], settings: {...defaultSettings, kidsModeEnabled}});
			expect(collectionButton().textContent).toContain('Movies');
			expect(screen.queryByText('Aliens')).toBeNull();

			fireEvent.click(collectionButton());

			expect(screen.getByText('Alien')).toBeTruthy();
			expect(screen.getByText('Aliens')).toBeTruthy();
		});
	});

	it('names the button Items for more than one kind, gives each kind a section and opens the title picked', () => {
		const {onSelectItem, spotlightBackRef} = open({item: boxSet, extras: [], collectionItems: [alien, show], onSelectItem: jest.fn()});
		expect(collectionButton().textContent).toContain('Items');

		fireEvent.click(collectionButton());
		expect(screen.getByText('Movies')).toBeTruthy();
		expect(screen.getByText('Series')).toBeTruthy();

		act(() => {
			spotlightBackRef.current();
		});
		expect(screen.queryByText('Alien: Earth')).toBeNull();
		act(() => jest.advanceTimersByTime(50));
		expect(Spotlight.focus).toHaveBeenLastCalledWith('details-collection-items-btn');

		fireEvent.click(collectionButton());
		fireEvent.click(screen.getByText('Alien: Earth'));
		expect(onSelectItem).toHaveBeenCalledWith(show);
		expect(screen.queryByText('Alien: Earth')).toBeNull();
	});

	it('is not offered on a movie', () => {
		open({collectionItems: [alien]});
		expect(collectionButton()).toBeNull();
	});
});

describe('the backdrop', () => {
	it('draws the backdrop until Details Screen Backdrop turns it off, and keeps the scrim', () => {
		open({backdropUrl: 'backdrop.jpg'});
		expect(document.querySelector('img[src="backdrop.jpg"]')).not.toBeNull();
		cleanup();
		open({backdropUrl: 'backdrop.jpg', settings: {...defaultSettings, detailsBackdropEnabled: false}});
		expect(document.querySelector('img[src="backdrop.jpg"]')).toBeNull();
		expect(document.querySelector('.scrim')).not.toBeNull();
	});
});

describe('the action row', () => {
	it("stays laid out but hidden and out of focus while it's held back, then shows", () => {
		open({actionsHeld: true});
		let row = document.querySelector('[data-spotlight-id="details-action-buttons"]');
		expect(row.classList.contains('actionsHeld')).toBe(true);
		expect(row.getAttribute('data-spotlight-container-disabled')).toBe('true');
		cleanup();

		open({actionsHeld: false});
		row = document.querySelector('[data-spotlight-id="details-action-buttons"]');
		expect(row.classList.contains('actionsHeld')).toBe(false);
		expect(row.getAttribute('data-spotlight-container-disabled')).toBe('false');
	});
});
