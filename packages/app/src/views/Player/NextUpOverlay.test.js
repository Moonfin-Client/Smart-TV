import {render, screen} from '@testing-library/react';

import {defaultSettings} from '../../context/defaultSettings';
import NextUpOverlay from './NextUpOverlay';

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
jest.mock('../../components/AnimeMarkerPills', () => ({__esModule: true, default: () => null, hasAnimeMarkerPills: () => false, useEpisodeMarker: () => null}));

let mockSettings;
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));

const episode = {Name: 'The Long Way Round', ParentIndexNumber: 1, IndexNumber: 2};
const overlay = (props = {}) => render(
	<NextUpOverlay episode={episode} imageUrl="still.png" countdown={5} timeout={7} countdownStyle="both" {...props} />
);
const root = () => document.body.firstChild.firstChild;

beforeEach(() => {
	mockSettings = {...defaultSettings};
});

describe('NextUpOverlay layouts', () => {
	it('is the card unless another layout is picked', () => {
		overlay();
		expect(root().className).not.toMatch(/layout/);
		expect(screen.getByText('The Long Way Round')).toBeTruthy();
	});

	it.each([['banner', 'layoutBanner'], ['button', 'layoutButton']])('draws %s with its own layout class', (layout, className) => {
		mockSettings = {...mockSettings, nextUpLayout: layout};
		overlay();
		expect(root().className).toContain(className);
	});

	it('falls back to the card for a layout it does not know', () => {
		mockSettings = {...mockSettings, nextUpLayout: 'nonsense'};
		overlay();
		expect(root().className).not.toMatch(/layout/);
	});

	it('keeps the play and hide buttons in every layout, since the remote drives them', () => {
		['card', 'banner', 'button'].forEach((layout) => {
			mockSettings = {...mockSettings, nextUpLayout: layout};
			const {unmount} = overlay();
			expect(screen.getByText('Play Next')).toBeTruthy();
			expect(screen.getByLabelText('Hide')).toBeTruthy();
			unmount();
		});
	});

	it('keeps the minimal size together with a layout', () => {
		mockSettings = {...mockSettings, nextUpLayout: 'banner'};
		overlay({minimal: true});
		expect(root().className).toContain('minimal');
		expect(root().className).toContain('layoutBanner');
	});

	it('draws the preview inert, with no buttons to catch the remote', () => {
		mockSettings = {...mockSettings, nextUpLayout: 'button'};
		overlay({preview: true});
		expect(document.querySelectorAll('button').length).toBe(0);
		expect(root().className).toContain('overlayPreview');
	});
});
