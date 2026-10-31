import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

import {defaultSettings} from '../../../context/defaultSettings';
import {describeRow} from './previewRows';
import SettingsLivePreview from './SettingsLivePreview';

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
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
let mockSettings = {};
jest.mock('../../../context/SettingsContext', () => ({
	useSettings: () => ({settings: mockSettings, activeTheme: require('../../../theme/themeRegistry').resolveThemeById('moonfin')}),
	SettingsOverride: ({children}) => children
}));
jest.mock('../../../context/AuthContext', () => ({useAuth: () => ({user: {Id: 'u', Name: 'Ana'}, serverType: 'jellyfin', serverUrl: 'http://server'})}));
jest.mock('../../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: false, displayName: 'Seerr'})}));
jest.mock('../../../context/ServerMessagesContext', () => ({useServerMessages: () => ({messages: []})}));
jest.mock('../../../context/AchievementsContext', () => ({useAchievements: () => ({socialAvailable: false})}));
jest.mock('../../../components/RatingsRow', () => () => null);
const mockItems = Array.from({length: 4}, (_, i) => ({
	title: `Film ${i}`, year: 2000 + i, officialRating: 'PG', runtimeMinutes: 100, genres: ['Drama'], overview: 'A story.',
	communityRating: 7, posterUrl: null, backdropUrl: null, logoUrl: null
}));
jest.mock('../../SetupWizard/setupPreviewData', () => ({getPreviewItems: () => mockItems, subscribePreviewItems: () => () => {}}));

// jsdom lays nothing out, so the seek bar measures as a box at its parent's corner.
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {configurable: true, get () {
	return this.parentNode;
}});

const find = (selector) => document.querySelector(selector);

const draw = (settings, rowId, scene, props) => {
	mockSettings = {...defaultSettings, ...settings};
	return render(<SettingsLivePreview scene={scene} row={describeRow(rowId, mockSettings)} trying={null} onPickScene={() => {}} onLeaveChips={() => {}} {...props} />);
};

describe('SettingsLivePreview', () => {
	// Runs first, since the player tests below draw the controls once they've loaded.
	test('the player\'s controls load the first time the player scene shows', async () => {
		draw({}, 'setting-osdButtons', 'player');
		expect(find('.playerControls')).toBeNull();
		await waitFor(() => expect(find('.playerControls')).not.toBeNull());
	});

	test('a setting shows the path to it rather than its description', () => {
		draw({}, 'setting-clockDisplay', 'home');
		expect(screen.getByText('General › Clock')).toBeTruthy();
		expect(screen.queryByText('Use 24-hour time formatting wherever the clock is shown')).toBeNull();
	});

	test('the pill\'s category keeps its description', () => {
		draw({}, 'cat-general', 'home');
		expect(screen.getByText('Language, clock, input, and performance')).toBeTruthy();
	});

	test('expanded rows keep the next row off the screen', () => {
		const spacerAbove = (title) => screen.getByText(title).parentElement.previousSibling.style.height;
		const {unmount} = draw({fullScreenRows: false}, 'setting-fullScreenRows', 'home');
		expect(spacerAbove('Recently Added')).toBe('24px');
		unmount();
		draw({fullScreenRows: true}, 'setting-fullScreenRows', 'home');
		expect(spacerAbove('Recently Added')).toBe('540px');
	});

	test('the open rail draws the buttons the switches leave', () => {
		const rail = () => within(find('.frame'));
		const {unmount} = draw({navbarPosition: 'left', showGenresButton: true}, 'setting-navbarColor', 'home', {hasLiveTv: true});
		['Home', 'Search', 'Shuffle', 'Genres', 'Favorites', 'Live TV', 'Libraries', 'Settings'].forEach((label) => expect(rail().getByText(label)).toBeTruthy());
		unmount();
		draw({navbarPosition: 'left', showShuffleButton: false, showGenresButton: false, showLiveTvButton: false}, 'setting-navbarColor', 'home', {hasLiveTv: true});
		['Shuffle', 'Genres', 'Live TV'].forEach((label) => expect(rail().queryByText(label)).toBeNull());
	});

	test('the clock settings open the rail on its clock, in the chosen format', () => {
		const rail = () => within(find('.frame'));
		const {unmount} = draw({navbarPosition: 'left', clockDisplay: '12-hour'}, 'setting-showClock', 'home');
		expect(rail().getByText('Settings')).toBeTruthy();
		expect(rail().getByText(/^\d{1,2}:\d{2} (AM|PM)$/).style.opacity).toBe('1');
		unmount();
		draw({navbarPosition: 'left', showClock: false}, 'setting-showClock', 'home');
		expect(rail().queryByText(/^\d{1,2}:\d{2}/)).toBeNull();
	});

	test('the stage gives up width so the inspector fits, and settles on one size', () => {
		jest.useFakeTimers();
		const rect = jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			if (this.classList.contains('frame')) {
				// Rounded like a laid out height, which can flip the fit back and forth by a pixel.
				const width = parseFloat(this.style.width) || 902;
				return {top: 220, bottom: 0, left: 0, right: 0, width, height: Math.round(width * 0.5625)};
			}
			if (this.classList.contains('preview')) return {top: 0, bottom: 1028.6, left: 0, right: 0, width: 902, height: 1028.6};
			return {top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0};
		});
		const tall = jest.spyOn(window.HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
			return this.classList.contains('inspector') ? 415 : 0;
		});
		const wide = jest.spyOn(window.Element.prototype, 'clientWidth', 'get').mockImplementation(() => 902);
		try {
			draw({}, 'setting-screensaverBackdrop', 'home');
			act(() => {
				jest.runOnlyPendingTimers();
			});
			expect(find('.frame').style.width).toBe('700px');
		} finally {
			rect.mockRestore();
			tall.mockRestore();
			wide.mockRestore();
			jest.useRealTimers();
		}
	});

	test('a screensaver tile draws the screensaver over home while it\'s on', () => {
		const {unmount} = draw({screensaverEnabled: true, screensaverComponent: 'clock'}, 'setting-screensaverTimeout', 'home');
		expect(find('.fill')).not.toBeNull();
		unmount();
		draw({screensaverEnabled: false}, 'setting-screensaverEnabled', 'home');
		expect(find('.fill')).toBeNull();
	});

	test('a loading animation tile shows the player before the stream starts', () => {
		draw({loadingAnimationImage: 'moonfinLogo'}, 'setting-loadingAnimationSize', 'player');
		expect(screen.getByText('LOADING STREAM...')).toBeTruthy();
	});

	test('a trick play tile holds a scrub, with no thumbnail while it\'s off', () => {
		const thumbs = () => document.querySelectorAll('img[src="resources/banner-dark.png"]').length;
		const {unmount} = draw({trickPlayMode: 'single'}, 'setting-trickPlayMode', 'player');
		expect(screen.getByText('13:12')).toBeTruthy();
		expect(thumbs()).toBe(1);
		unmount();
		draw({trickPlayMode: 'disabled'}, 'setting-trickPlayMode', 'player');
		expect(thumbs()).toBe(0);
	});

	test('the player draws its own buttons in the saved order, without the hidden ones', () => {
		const labels = (row) => Array.from(document.querySelectorAll(`.${row} .focusTooltip`)).map((tip) => tip.textContent);
		const {unmount} = draw({}, 'setting-osdButtons', 'player');
		expect(labels('transportButtons')).toEqual(['Previous', 'Seek back', 'Pause', 'Seek forward', 'Next Episode']);
		expect(labels('controlButtonsBottom')).toEqual([
			'Chapters', 'Episodes', 'Subtitles', 'Audio', 'Cast & Crew', 'Playback Quality', 'Zoom (Fit)', 'Sleep timer', 'Playback Information'
		]);
		unmount();
		draw({osdButtonOrderTv: ['audio', 'subtitles', 'zoom'], hiddenOsdButtonsTv: ['episodes', 'sleep'], playerZoomMode: 'autoCrop'}, 'setting-osdButtons', 'player');
		// A button never placed follows the one declared before it, the way the player orders them.
		expect(labels('controlButtonsBottom')).toEqual([
			'Chapters', 'Audio', 'Cast & Crew', 'Playback Quality', 'Subtitles', 'Zoom (Zoom to Fill)', 'Playback Information'
		]);
		// A zoom other than Fit lights the button up, the way the player does.
		expect(screen.getByText('Zoom (Zoom to Fill)').previousSibling.className).toContain('controlBtnActive');
	});

	test('the time labels and chapter marks follow their settings', () => {
		const {unmount} = draw({playbackTimeAboveRight: 'none', playbackTimeBelowLeft: 'elapsed', playbackTimeBelowRight: 'timeRemaining', showChapterMarkers: true}, 'setting-showChapterMarkers', 'player');
		expect(screen.getByText('18:28')).toBeTruthy();
		expect(screen.getByText('-25:31')).toBeTruthy();
		expect(find('.timeInfoTop')).toBeNull();
		expect(document.querySelectorAll('.chapterMark').length).toBe(3);
		unmount();
		draw({showChapterMarkers: false}, 'setting-showChapterMarkers', 'player');
		expect(document.querySelectorAll('.chapterMark').length).toBe(0);
	});

	test('a subtitle appearance tile draws the line the player would, with the controls away', () => {
		const line = () => find('.subtitleText');
		const {unmount} = draw({subtitleColor: '#ffff00', subtitleSize: 'large', subtitleBackground: 50, subtitlePosition: 'higher'}, 'setting-subtitleColor', 'player');
		expect(line().style.color).toBe('rgb(255, 255, 0)');
		expect(line().style.fontSize).toBe('52px');
		expect(line().style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
		expect(find('.subtitleOverlay').style.bottom).toBe('40%');
		expect(find('.playerControls')).toBeNull();
		unmount();
		// The track settings keep the controls up over the line.
		draw({}, 'setting-subtitleMode', 'player');
		expect(line()).not.toBeNull();
		expect(find('.playerControls')).not.toBeNull();
	});

	test('an HDR subtitle tile draws the HDR style', () => {
		const color = () => find('.subtitleText').style.color;
		const hdr = {subtitleHdrSeparate: true, subtitleColor: '#ffffff', subtitleColorHdr: '#808080'};
		const {unmount} = draw(hdr, 'setting-subtitleColorHdr', 'player');
		expect(color()).toBe('rgb(128, 128, 128)');
		unmount();
		draw(hdr, 'setting-subtitleColor', 'player');
		expect(color()).toBe('rgb(255, 255, 255)');
	});

	test('Left off the first chip leaves the row, and focusing a chip shows its scene', () => {
		const onLeaveChips = jest.fn();
		const onPickScene = jest.fn();
		draw({}, 'setting-clockDisplay', 'home', {onLeaveChips, onPickScene});
		fireEvent.keyDown(screen.getByText('Details Page'), {keyCode: 37});
		expect(onLeaveChips).not.toHaveBeenCalled();
		fireEvent.keyDown(screen.getByText('Home'), {keyCode: 37});
		expect(onLeaveChips).toHaveBeenCalled();
		fireEvent.focus(screen.getByText('Player'));
		expect(onPickScene).toHaveBeenCalledWith('player');
	});
});
