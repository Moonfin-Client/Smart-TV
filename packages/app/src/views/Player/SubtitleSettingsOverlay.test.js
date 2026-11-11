import {fireEvent, render, screen} from '@testing-library/react';

import {defaultSettings} from '../../context/defaultSettings';
import {retrySubtitleFont, subtitleFontFailed} from '../../services/subtitleFonts';
import SubtitleSettingsOverlay from './SubtitleSettingsOverlay';

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

// Spottable, the spotlight containers and the Sandstone controls need the framework's own React.
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, props); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, props); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/sandstone/Scroller', () => {
	const React = require('react');
	return {__esModule: true, default: ({children}) => React.createElement('div', null, children)};
});
jest.mock('@enact/sandstone/Slider', () => {
	const React = require('react');
	return {__esModule: true, default: ({spotlightId}) => React.createElement('div', {'data-slider': spotlightId})};
});
jest.mock('../../services/subtitleFonts', () => ({
	...jest.requireActual('../../services/subtitleFonts'),
	retrySubtitleFont: jest.fn(),
	subtitleFontFailed: jest.fn(() => false)
}));

let mockSettings;
const mockUpdateSetting = jest.fn();
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings, updateSetting: mockUpdateSetting})}));

const row = (label) => screen.getByText(label).closest('button');

beforeEach(() => {
	mockSettings = {...defaultSettings};
	mockUpdateSetting.mockClear();
	retrySubtitleFont.mockClear();
	subtitleFontFailed.mockImplementation(() => false);
});

test('bold writes its HDR twin while HDR subtitles are separate, and stroke width stays shared', () => {
	mockSettings = {...mockSettings, subtitleHdrSeparate: true};
	render(<SubtitleSettingsOverlay visible isHdr onClose={jest.fn()} />);

	fireEvent.click(row('Bold Text'));
	fireEvent.click(row('Text Stroke Width'));

	expect(mockUpdateSetting).toHaveBeenCalledWith('subtitleBoldHdr', true);
	expect(mockUpdateSetting).toHaveBeenCalledWith('subtitleStrokeWidth', 150);
	expect(screen.getByText('Text Stroke Color')).toBeTruthy();
});

test('the shadow sliders only show while Text Shadow is on', () => {
	const {rerender} = render(<SubtitleSettingsOverlay visible onClose={jest.fn()} />);
	expect(screen.queryByText('Shadow Intensity')).toBeNull();

	fireEvent.click(row('Text Shadow'));
	expect(mockUpdateSetting).toHaveBeenCalledWith('subtitleDropShadow', true);

	mockSettings = {...mockSettings, subtitleDropShadow: true};
	rerender(<SubtitleSettingsOverlay visible onClose={jest.fn()} />);
	expect(document.querySelectorAll('[data-slider^="sub-setting-dropShadow"]').length).toBe(3);
});

test("a font that couldn't download says so, and picking one retries it", () => {
	mockSettings = {...mockSettings, subtitleFont: 'Roboto'};
	subtitleFontFailed.mockImplementation((family) => family === 'Roboto');
	render(<SubtitleSettingsOverlay visible onClose={jest.fn()} />);

	expect(screen.getByText("Couldn't download Roboto")).toBeTruthy();

	fireEvent.click(row('Font'));
	expect(retrySubtitleFont).toHaveBeenCalledWith('Source Sans 3');
	expect(mockUpdateSetting).toHaveBeenCalledWith('subtitleFont', 'Source Sans 3');
});
