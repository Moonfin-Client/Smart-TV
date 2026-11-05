import {renderHook} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import {KEYS} from '../../utils/keys';
import {RAIL_CURRENT_ID, STRIP_CURRENT_ID, contentKeyHandler, headerSpotlightId, useScreenFocus} from './MusicScreenParts';

// The parts come with components, so these stand in as they do in musicLibrary.test.js, where the
// CLI's second copy of React is explained.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);
jest.mock('../../components/MediaCard', () => () => null);

const box = (spotlightId, top, bottom, parent = document.body) => {
	const el = document.createElement('div');
	if (spotlightId) el.setAttribute('data-spotlight-id', spotlightId);
	el.getBoundingClientRect = () => ({top, bottom, left: 0, right: 100});
	parent.appendChild(el);
	return el;
};

const pressUp = (target) => {
	const e = {keyCode: KEYS.UP, target, preventDefault: jest.fn(), stopPropagation: jest.fn()};
	contentKeyHandler('albums')(e);
	return e;
};

describe('Up from a category screen\'s content', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		Spotlight.focus.mockReset();
	});

	test('a lower row is left alone', () => {
		box('music-album-0', 200, 400);
		const e = pressUp(box('music-album-6', 420, 620));
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('the first row goes back to the header controls', () => {
		const header = box(headerSpotlightId('albums'), 100, 160);
		box(null, 100, 160, header).className = 'spottable';
		box('music-album-0', 200, 400);
		Spotlight.focus.mockReturnValue(true);
		const e = pressUp(box('music-album-3', 200, 400));
		expect(e.preventDefault).toHaveBeenCalled();
		expect(Spotlight.focus).toHaveBeenCalledWith(headerSpotlightId('albums'));
		expect(Spotlight.focus).not.toHaveBeenCalledWith(STRIP_CURRENT_ID);
	});

	test('the first row goes to the strip when the header has no controls', () => {
		box(headerSpotlightId('albums'), 100, 160);
		pressUp(box('music-album-0', 200, 400));
		expect(Spotlight.focus).toHaveBeenCalledWith(STRIP_CURRENT_ID);
	});
});

describe('Landing on a category screen', () => {
	beforeEach(() => {
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
			cb();
			return 0;
		});
	});

	afterEach(() => {
		document.body.innerHTML = '';
		Spotlight.focus.mockReset();
		window.requestAnimationFrame.mockRestore();
	});

	const landsOn = (target) => Spotlight.focus.mockImplementation((id) => id === target);
	const tried = () => Spotlight.focus.mock.calls.map(([id]) => id);

	test('an empty screen with controls lands on them, as Up from its content would', () => {
		const header = box(headerSpotlightId('albums'), 100, 160);
		box(null, 100, 160, header).className = 'spottable';
		landsOn(headerSpotlightId('albums'));
		renderHook(() => useScreenFocus('albums', true));
		expect(tried()).toEqual(['music-album-0', headerSpotlightId('albums')]);
	});

	test('an empty screen with no controls lands on the open category in the strip, chips or rail', () => {
		box(headerSpotlightId('playlists'), 100, 160);
		landsOn(RAIL_CURRENT_ID);
		renderHook(() => useScreenFocus('playlists', true));
		expect(tried()).toEqual(['music-playlist-0', STRIP_CURRENT_ID, RAIL_CURRENT_ID]);
	});

	test('nothing moves before the screen has loaded', () => {
		renderHook(() => useScreenFocus('genres', false));
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});
});
