import {fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import {runPlayerCommand} from '../../services/remoteControl';
import {focusContentFromSidebar, focusFirstContentTarget} from '../../utils/navFocusTargets';

import {NavMusicPill, SidebarMusicCard} from './MiniMusicPlayer';

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
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), move: jest.fn()}));
jest.mock('../../services/remoteControl', () => ({runPlayerCommand: jest.fn()}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => 'http://server'}));
jest.mock('../../views/Player/audio/audioArt', () => ({artUrlFor: () => null, IconMusicNote: () => null}));
jest.mock('../../utils/navFocusTargets', () => ({
	CONTENT_FOCUS_TARGETS: ['top'],
	focusContentFromSidebar: jest.fn(),
	focusFirstContentTarget: jest.fn()
}));
jest.mock('../LoopMarquee', () => ({text}) => <span>{text}</span>);

const item = {Id: 'a', Name: 'Get Lucky', AlbumArtist: 'Daft Punk'};
const keyDown = (element, keyCode) => fireEvent.keyDown(element, {keyCode, which: keyCode});

beforeEach(() => jest.clearAllMocks());

describe('NavMusicPill', () => {
	test('shows the track and artist and runs each button on the player', () => {
		render(<NavMusicPill item={item} paused onOpen={() => {}} />);
		expect(screen.getByText('Get Lucky - Daft Punk')).toBeTruthy();
		fireEvent.click(screen.getByLabelText('Play'));
		fireEvent.click(screen.getByLabelText('Stop'));
		expect(runPlayerCommand.mock.calls).toEqual([['playPause'], ['stop']]);
	});

	test('going away with focus inside hands it to Home', () => {
		const {unmount} = render(<div data-spotlight-id="navbar-music"><NavMusicPill item={item} paused onOpen={() => {}} /></div>);
		screen.getByLabelText('Stop').focus();
		unmount();
		expect(Spotlight.focus).toHaveBeenCalledWith('navbar-home');
	});

	test('up goes to Home and down carries on to the content', () => {
		render(<NavMusicPill item={item} paused={false} onOpen={() => {}} />);
		keyDown(screen.getByLabelText('Pause'), 38);
		expect(Spotlight.focus).toHaveBeenCalledWith('navbar-home');
		keyDown(screen.getByLabelText('Pause'), 40);
		expect(focusFirstContentTarget).toHaveBeenCalledWith(['top'], 'down');
	});
});

describe('SidebarMusicCard', () => {
	test('the collapsed rail shows only the art', () => {
		render(<SidebarMusicCard item={item} paused={false} expanded={false} onOpen={() => {}} />);
		expect(screen.queryByLabelText('Pause')).toBeNull();
	});

	test('right walks the buttons and only leaves for the content past the last one', () => {
		render(<SidebarMusicCard item={item} paused={false} expanded onOpen={() => {}} />);
		Spotlight.move.mockReturnValueOnce(true);
		keyDown(screen.getByLabelText('Next'), 39);
		expect(focusContentFromSidebar).not.toHaveBeenCalled();

		Spotlight.move.mockReturnValueOnce(false);
		keyDown(screen.getByLabelText('Stop'), 39);
		expect(focusContentFromSidebar).toHaveBeenCalled();
	});

	test('left stops at the first button', () => {
		render(<SidebarMusicCard item={item} paused={false} expanded onOpen={() => {}} />);
		Spotlight.move.mockReturnValueOnce(false);
		keyDown(screen.getByLabelText('Previous'), 37);
		expect(focusContentFromSidebar).not.toHaveBeenCalled();
	});
});
