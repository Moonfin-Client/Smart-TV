import {render, screen} from '@testing-library/react';

import {defaultSettings} from '../../context/defaultSettings';
import SkipSegmentOverlay from './SkipSegmentOverlay';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

// Spottable needs the framework's own React, so a plain button stands in for it.
jest.mock('./PlayerConstants', () => ({
	SpottableButton: ({spotlightId, ...props}) => require('react').createElement('button', props) // eslint-disable-line no-unused-vars
}));
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn()}}));

let mockSettings;
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));

const overlay = (props = {}) => render(
	<SkipSegmentOverlay type="intro" remainingSeconds={24} progress={0.5} countdownStyle="both" spotlightId="skip" {...props} />
);

// The test container is the body's only child, and the wrapper is what it holds.
const wrapper = () => document.body.firstChild.firstChild;
const button = () => wrapper().firstChild;
const count = (selector) => document.querySelectorAll(selector).length;

beforeEach(() => {
	mockSettings = {...defaultSettings};
});

describe('SkipSegmentOverlay', () => {
	it('names the segment being skipped', () => {
		overlay({type: 'recap'});
		expect(screen.getByText('Skip Recap')).toBeTruthy();
	});

	it('writes no inline styles at all while every setting is at its default', () => {
		overlay();
		expect(wrapper().getAttribute('style')).toBeNull();
		expect(button().getAttribute('style')).toBeNull();
	});

	it('moves and scales the prompt from the position and size settings', () => {
		mockSettings = {...mockSettings, skipOverlayPosition: 'topLeft', skipOverlaySize: 'large'};
		overlay();
		const style = wrapper().style;
		expect(style.left).toBe('35px');
		expect(style.top).toBe('60px');
		expect(style.transform).toBe('scale(1.3)');
	});

	it('paints the fill and text from the settings', () => {
		mockSettings = {...mockSettings, skipOverlayBackground: '#102030', skipOverlayText: '#ffff00', skipOverlayOpacity: 100};
		overlay();
		const style = button().style;
		expect(style.background).toContain('rgb(16, 32, 48)');
		expect(style.color).toBe('rgb(255, 255, 0)');
	});

	it('shows the ring and timer the countdown style asks for', () => {
		const {unmount} = overlay({countdownStyle: 'both', remainingSeconds: 90});
		expect(count('svg circle')).toBe(2);
		expect(screen.getByText('Ends in 1:30')).toBeTruthy();
		unmount();

		const {unmount: unmountTimer} = overlay({countdownStyle: 'timer'});
		expect(count('circle')).toBe(0);
		unmountTimer();

		overlay({countdownStyle: 'progressBar'});
		expect(count('circle')).toBe(2);
		expect(screen.queryByText(/Ends in/)).toBeNull();
	});

	it('draws the preview as an inert div wearing the focused border, so it takes nothing from the remote', () => {
		mockSettings = {...mockSettings, skipOverlayAccent: '#00ff00'};
		overlay({preview: true, spotlightId: undefined});
		expect(count('button')).toBe(0);
		// jsdom keeps a shorthand color as it was written, a browser turns it into rgb().
		expect(['#00ff00', 'rgb(0, 255, 0)']).toContain(button().style.borderColor);
	});

	describe('layouts', () => {
		const pick = (layout, extra = {}) => {
			mockSettings = {...mockSettings, skipOverlayLayout: layout, ...extra};
			return overlay();
		};
		const has = (name) => document.querySelector(`[class~="${name}"]`) !== null;

		it('draws the capsule with its ring', () => {
			pick('capsule');
			expect(count('circle')).toBe(2);
			expect(has('bar')).toBe(false);
			expect(has('sweep')).toBe(false);
		});

		it.each(['rectangle'])('draws %s with a bar in place of the ring', (layout) => {
			pick(layout);
			expect(has(`layout${layout[0].toUpperCase()}${layout.slice(1)}`)).toBe(true);
			expect(count('circle')).toBe(0);
			expect(document.querySelector('[class~="barFill"]').style.width).toBe('50%');
		});

		it('draws sweep as a fill that follows the countdown, with no icon or bar', () => {
			pick('sweep');
			expect(document.querySelector('[class~="sweep"]').style.width).toBe('50%');
			expect(has('bar')).toBe(false);
			expect(count('svg')).toBe(0);
		});

		it('keeps the timer as text outside the capsule, even inside the last minute', () => {
			const {unmount} = pick('capsule');
			expect(screen.queryByText(/Ends in/)).toBeNull();
			unmount();
			pick('rectangle');
			expect(screen.getByText('Ends in :24')).toBeTruthy();
		});

		it('leaves out the countdown graphic when the style asks for the timer only', () => {
			mockSettings = {...mockSettings, skipOverlayLayout: 'rectangle'};
			overlay({countdownStyle: 'timer'});
			expect(has('bar')).toBe(false);
			expect(screen.getByText('Ends in :24')).toBeTruthy();
		});
	});
});

