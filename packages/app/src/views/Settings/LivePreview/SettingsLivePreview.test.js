import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../../context/defaultSettings';
import {memoryCache} from '../../Browse/browseCache';
import {FALL_COUNTS} from '../../../components/SeasonalTheme/seasonalParticles';
import {getPerfTier} from '../../../utils/perfTier';
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
	return ({spotlightId, onSpotlightLeft, onSpotlightRight, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId}); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, spotlightDisabled, ...props}) => React.createElement(type, {
		...props, 'data-spotlight-id': spotlightId, 'data-spotlight-container-disabled': spotlightDisabled
	});
});
let mockSettings = {};
// An override lays its settings over the saved ones, the way the real one does.
jest.mock('../../../context/SettingsContext', () => {
	const React = require('react');
	const Overrides = React.createContext(null);
	return {
		useSettings: () => ({
			settings: {...mockSettings, ...React.useContext(Overrides)},
			activeTheme: require('../../../theme/themeRegistry').resolveThemeById('moonfin')
		}),
		SettingsOverride: ({overrides, children}) => React.createElement(Overrides.Provider, {value: overrides}, children)
	};
});
let mockAuth = {};
jest.mock('../../../context/AuthContext', () => ({useAuth: () => mockAuth}));
let mockSeerr = {};
jest.mock('../../../context/SeerrContext', () => ({useSeerr: () => mockSeerr}));
// One episode two days out, the way the server's Sonarr calendar sends it.
const mockEpisode = () => require('../../../utils/calendarEntries').parseSonarrEntry({
	id: 11, seasonNumber: 2, episodeNumber: 3, title: 'The Return', airDateUtc: new Date(Date.now() + 2 * 86400000).toISOString(),
	monitored: true, images: [], series: {title: 'Night Shift', tmdbId: 7, images: []}, moonfinItemId: 'series1', moonfinLibraryIds: ['tv']
});
jest.mock('../../../services/calendarApi', () => ({
	loadCalendar: jest.fn(() => Promise.resolve({entries: [mockEpisode()], problem: null})),
	seriesProgress: () => Promise.resolve({})
}));
jest.mock('../../../context/AchievementsContext', () => ({useAchievements: () => ({socialAvailable: false})}));
jest.mock('../../../components/RatingsRow', () => () => null);
let mockParentalFilter = require('../../../utils/parentalFilter').parentalFilterFromRatings([]);
jest.mock('../../../hooks/useParentalFilter', () => () => ({parentalFilter: mockParentalFilter}));
// Home's card pulls in the context menu and its Sandstone screens, and the preview only reads its size.
jest.mock('../../../components/MediaCard/MediaCard', () => ({classicCardSize: () => ({width: 0, height: 0})}));
jest.mock('../../../components/LoadingSpinner', () => () => null);
// The real layer fades its picture in once it loads, so here it only says what it was handed.
jest.mock('../../../components/BackdropLayer', () => {
	const React = require('react');
	return ({targetUrl, placement}) => React.createElement('div', {className: 'homeBackdrop', 'data-url': targetUrl, 'data-placement': placement});
});
// The library screen is tested on its own, so here it only says what it was handed.
jest.mock('../../Library', () => {
	const React = require('react');
	const {useSettings} = require('../../../context/SettingsContext');
	const LibraryStub = ({library, settingsPreview}) => {
		const {settings} = useSettings();
		return React.createElement('div', null,
			React.createElement('div', null, `${library ? library.Name : 'none'} in ${settings.libraryStyle}, grouped ${settings.groupItemsIntoCollections}, preview ${settingsPreview}`),
			React.createElement('div', null, `music ${settings.musicLibraryStyle}`),
			React.createElement('div', null, `book ${settings.bookLibraryStyle}`)
		);
	};
	return {__esModule: true, default: LibraryStub};
});
const mockItems = Array.from({length: 4}, (_, i) => ({
	title: `Film ${i}`, year: 2000 + i, officialRating: 'PG', runtimeMinutes: 100, genres: ['Drama'], overview: 'A story.',
	communityRating: 7, posterUrl: null, backdropUrl: null, logoUrl: null
}));
jest.mock('../../SetupWizard/setupPreviewData', () => ({
	getPreviewItems: () => mockItems,
	subscribePreviewItems: () => () => {},
	adaptItem: (item) => ({
		title: item.Name, type: item.Type, year: item.ProductionYear || null, officialRating: null, runtimeMinutes: null, genres: [],
		overview: null, communityRating: null, posterUrl: null, backdropUrl: item.backdropUrl || null, logoUrl: null,
		played: Boolean(item.UserData?.Played), playedPercentage: item.UserData?.PlayedPercentage || 0, unplayedCount: item.UserData?.UnplayedItemCount || 0
	})
}));

// jsdom lays nothing out, so the seek bar measures as a box at its parent's corner.
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {configurable: true, get () {
	return this.parentNode;
}});

const find = (selector) => document.querySelector(selector);

// The focused card's width over its height, so a card that grew is over 1 and a poster under it.
const focusedCardShape = () => {
	const ring = Array.from(document.querySelectorAll('.frame div')).find((node) => node.style.border.indexOf('3px solid') === 0);
	return parseFloat(ring.parentNode.style.width) / parseFloat(ring.parentNode.style.height);
};

const draw = (settings, rowId, scene, props) => {
	mockSettings = {...defaultSettings, ...settings};
	return render(<SettingsLivePreview scene={scene} row={describeRow(rowId, mockSettings)} trying={null} onPickScene={() => {}} onLeaveChips={() => {}} {...props} />);
};

describe('SettingsLivePreview', () => {
	beforeEach(() => {
		mockSeerr = {isEnabled: false, displayName: 'Seerr', pluginInfo: null};
		mockAuth = {user: {Id: 'u', Name: 'Ana'}, serverType: 'jellyfin', serverUrl: 'http://server', hasMultipleServers: false};
		memoryCache.libraries = null;
	});

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

	test('rows sit as far apart as Home spaces them, and expanded rows keep the next row off the screen', () => {
		const spacerAbove = (title) => screen.getByText(title).parentElement.previousSibling.style.height;
		// Half of Home's space below each row, since the design screen is half of 1920.
		for (const [settings, gap] of [
			[{}, '0px'], [{modernHomeRowsPadding: 560}, '80px'], [{homeRowsStyle: 'v1'}, '10px'],
			[{homeRowsStyle: 'v1', classicHomeRowsPadding: 130}, '60px'], [{fullScreenRows: true}, '540px']
		]) {
			draw(settings, 'setting-fullScreenRows', 'home');
			expect(spacerAbove('Recently Added')).toBe(gap);
			cleanup();
		}
	});

	test('modern rows hold their first card in focus on every home tile, and classic rows hold none', () => {
		const rings = () => Array.from(document.querySelectorAll('.frame div')).filter((node) => node.style.border.indexOf('3px solid') === 0).length;
		for (const [rowId, navbarPosition] of [['setting-homeRowsStyle', 'top'], ['setting-clockDisplay', 'left'], ['setting-homeRowsPosterSize', 'top']]) {
			const {unmount} = draw({homeRowsStyle: 'v2', navbarPosition}, rowId, 'home');
			expect(rings()).toBe(1);
			unmount();
		}
		draw({homeRowsStyle: 'v1'}, 'setting-homeRowsStyle', 'home');
		expect(rings()).toBe(0);
	});

	test('Focus Border Color rings the first card in its color, in either row style', () => {
		const rings = () => Array.from(document.querySelectorAll('.frame div')).filter((node) => node.style.border.indexOf('3px solid') === 0);
		for (const homeRowsStyle of ['v2', 'v1']) {
			const {unmount} = draw({homeRowsStyle, focusBorderColor: '#FF0000'}, 'setting-focusBorderColor', 'home');
			expect(rings().map((ring) => ring.style.borderColor)).toEqual(['rgb(255, 0, 0)']);
			unmount();
		}
	});

	test('a focused modern film grows with no year, rating or description, as on Home', () => {
		const saved = {...mockItems[0]};
		Object.assign(mockItems[0], {type: 'Movie', year: null, runtimeMinutes: null, genres: [], overview: null, communityRating: null});
		try {
			draw({homeRowsStyle: 'v2'}, 'setting-homeRowsStyle', 'home');
			expect(focusedCardShape()).toBeGreaterThan(1);
		} finally {
			Object.assign(mockItems[0], saved);
		}
	});

	test('Hide Media Description takes the description off the classic info area and the focused modern card', () => {
		const descriptions = () => screen.queryAllByText('A story.').length;
		for (const homeRowsStyle of ['v1', 'v2']) {
			draw({homeRowsStyle}, 'setting-hideHomeMediaDescription', 'home');
			expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
			expect(descriptions()).toBe(1);
			cleanup();
			draw({homeRowsStyle, hideHomeMediaDescription: true}, 'setting-hideHomeMediaDescription', 'home');
			expect(descriptions()).toBe(0);
			cleanup();
		}
	});

	test('the media bars that show a description drop it while Hide Media Description is on', () => {
		const descriptions = () => screen.queryAllByText('A story.').length;
		for (const featuredBarStyle of ['moonfin', 'makd', 'gallery', 'off']) {
			draw({featuredBarStyle}, 'setting-featuredBarStyle', 'home');
			expect(descriptions()).toBeGreaterThan(0);
			cleanup();
			draw({featuredBarStyle, hideHomeMediaDescription: true}, 'setting-featuredBarStyle', 'home');
			expect(descriptions()).toBe(0);
			cleanup();
		}
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

	test('Home Screen Backdrop draws the first card\'s backdrop behind home where the choice being tried puts it, and none while it\'s off', () => {
		const backdrop = () => find('.frame .homeBackdrop');
		mockItems[0].backdropUrl = 'backdrop0.jpg';
		try {
			const {unmount} = draw({homeRowsStyle: 'v1', showHomeBackdrop: true, homeBackdropStyle: 'corner'}, 'setting-homeBackdropStyle', 'home');
			expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
			expect(backdrop().getAttribute('data-placement')).toBe('corner');
			expect(backdrop().getAttribute('data-url')).toBe('backdrop0.jpg');
			unmount();
			for (const [value, index] of [['fullScreen', 1], ['top', 3], ['off', 0]]) {
				// Saved off, so trying a style has to turn the switch back on with it.
				draw({homeRowsStyle: 'v1', showHomeBackdrop: false, homeBackdropStyle: 'off'}, 'setting-homeBackdropStyle', 'home', {trying: {key: 'homeBackdropStyle', value, index}});
				expect(backdrop().getAttribute('data-placement')).toBe(value);
				expect(backdrop().getAttribute('data-url')).toBe(value === 'off' ? '' : 'backdrop0.jpg');
				cleanup();
			}
			draw({homeRowsStyle: 'v1', showHomeBackdrop: true, homeBackdropStyle: 'top'}, 'setting-homeBackdropStyle', 'home', {trying: {key: 'homeBackdropStyle', value: 'off', index: 0}});
			expect(backdrop().getAttribute('data-url')).toBe('');
			cleanup();
		} finally {
			mockItems[0].backdropUrl = null;
		}
	});

	test('Modern rows draw no home backdrop unless the Aya bar feeds one, as on Home', () => {
		const url = () => find('.frame .homeBackdrop').getAttribute('data-url');
		mockItems[0].backdropUrl = 'backdrop0.jpg';
		try {
			draw({homeRowsStyle: 'v2', featuredBarStyle: 'moonfin', showHomeBackdrop: true, homeBackdropStyle: 'fullScreen'}, 'setting-homeBackdropStyle', 'home');
			expect(url()).toBe('');
			cleanup();
			draw({homeRowsStyle: 'v2', featuredBarStyle: 'aya', showHomeBackdrop: true, homeBackdropStyle: 'fullScreen'}, 'setting-homeBackdropStyle', 'home');
			expect(url()).toBe('backdrop0.jpg');
		} finally {
			mockItems[0].backdropUrl = null;
		}
	});

	test('Details Screen Backdrop takes the backdrop off every detail style and keeps the page', () => {
		const art = () => document.querySelectorAll('.frame img[src="backdrop0.jpg"]').length;
		Object.assign(mockItems[0], {backdropUrl: 'backdrop0.jpg', posterUrl: 'poster0.jpg'});
		try {
			for (const detailScreenStyle of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9']) {
				draw({detailScreenStyle, detailsBackdropEnabled: true}, 'setting-detailsBackdropEnabled', 'details');
				expect(art()).toBeGreaterThan(0);
				cleanup();
				draw({detailScreenStyle, detailsBackdropEnabled: false}, 'setting-detailsBackdropEnabled', 'details');
				expect(art()).toBe(0);
				expect(screen.getAllByText('Film 0').length).toBeGreaterThan(0);
				cleanup();
			}
		} finally {
			Object.assign(mockItems[0], {backdropUrl: null, posterUrl: null});
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
			'Add to Favorites', 'Chapters', 'Episodes', 'Subtitles', 'Audio', 'Cast & Crew', 'Playback Quality', 'Zoom (Fit)', 'Sleep timer', 'Playback Information'
		]);
		unmount();
		draw({osdButtonOrderTv: ['audio', 'subtitles', 'zoom'], hiddenOsdButtonsTv: ['episodes', 'sleep'], playerZoomMode: 'autoCrop'}, 'setting-osdButtons', 'player');
		// A button never placed follows the one declared before it, the way the player orders them.
		expect(labels('controlButtonsBottom')).toEqual([
			'Add to Favorites', 'Chapters', 'Audio', 'Cast & Crew', 'Playback Quality', 'Subtitles', 'Zoom (Zoom to Fill)', 'Playback Information'
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

	test('with the controls up the subtitle sits over the bar and its time row, and with them away it keeps its place', () => {
		const bottom = () => parseFloat(find('.subtitleOverlay').style.bottom);
		// The controls fill a 1080 high layer drawn at half size, so 75px up the frame is 150 of the player's pixels.
		let tops = {};
		const rect = jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			if (this.classList.contains('playerControls')) return {top: 0, bottom: 540, left: 0, right: 960, width: 960, height: 540};
			const top = tops[Object.keys(tops).find((name) => this.classList.contains(name))];
			return top === undefined ? {top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0} : {top, bottom: top, left: 0, right: 0, width: 0, height: 0};
		});
		const tall = jest.spyOn(window.HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
			return this.classList.contains('playerControls') ? 1080 : 0;
		});
		try {
			// The time row tops the controls, then with no row the thumb does, and the line clears either by 12px.
			for (const next of [{progressContainer: 465, seekIndicator: 480}, {progressContainer: 490, seekIndicator: 465}]) {
				tops = next;
				draw({subtitlePosition: 'bottom'}, 'setting-subtitleMode', 'player');
				expect(bottom()).toBeCloseTo(100 * (150 + 12) / 1080, 5);
				cleanup();
			}
			// A line already set higher stays where it is.
			draw({subtitlePosition: 'higher'}, 'setting-subtitleMode', 'player');
			expect(bottom()).toBe(40);
			cleanup();
			// The subtitle look is judged with the controls away, so the line keeps its own place.
			draw({subtitlePosition: 'bottom'}, 'setting-subtitleColor', 'player');
			expect(find('.playerControls')).toBeNull();
			expect(bottom()).toBe(10);
		} finally {
			rect.mockRestore();
			tall.mockRestore();
		}
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

	describe('the skip prompt and the next episode card', () => {
		// The card asks for the remote a frame after it draws, so that frame runs here and not in a later test.
		beforeEach(() => jest.spyOn(window, 'requestAnimationFrame').mockImplementation((step) => {
			step();
			return 0;
		}));
		afterEach(() => window.requestAnimationFrame.mockRestore());
		const skipPrompt = () => find('[data-spotlight-id="preview-skip-segment-btn"]');
		const nextCard = () => {
			const close = find('[data-spotlight-id="next-up-dismiss-btn"]');
			return close && close.closest('.card');
		};
		const tryOn = (rerender, key, value) => rerender(
			<SettingsLivePreview scene='player' row={describeRow(`setting-${key}`, mockSettings)} trying={{key, value, index: 0}} onPickScene={() => {}} onLeaveChips={() => {}} />
		);
		// What a countdown draws: the ring, the number in it, and the timer line.
		const countdownOf = (node) => ({
			ring: Boolean(node.querySelector('.ring')),
			number: node.querySelector('.ringNumber') ? node.querySelector('.ringNumber').textContent : null,
			timer: node.querySelector('.timer') ? node.querySelector('.timer').textContent : null
		});

		test('Media Segment Countdown draws the intro\'s skip prompt in the style being tried, whatever the intro action', () => {
			const {rerender} = draw({introAction: 'auto'}, 'setting-nextUpCountdownStyle', 'player');
			expect(within(skipPrompt()).getByText('Skip Intro')).toBeTruthy();
			// The prompt is the player's own, kept off the remote.
			expect(skipPrompt().closest('[data-spotlight-container-disabled="true"]')).not.toBeNull();
			const expected = {
				both: {ring: true, number: '45', timer: null},
				progressBar: {ring: true, number: null, timer: null},
				timer: {ring: false, number: null, timer: 'Ends in :45'},
				none: {ring: false, number: null, timer: null}
			};
			Object.keys(expected).forEach((value) => {
				tryOn(rerender, 'nextUpCountdownStyle', value);
				expect(within(skipPrompt()).getByText('Skip Intro')).toBeTruthy();
				expect(countdownOf(skipPrompt())).toEqual(expected[value]);
			});
			// The intro action's own tile only draws the prompt while it asks.
			cleanup();
			draw({introAction: 'auto'}, 'setting-introAction', 'player');
			expect(skipPrompt()).toBeNull();
			cleanup();
			draw({introAction: 'ask'}, 'setting-introAction', 'player');
			expect(within(skipPrompt()).getByText('Skip Intro')).toBeTruthy();
		});

		test('Next Up Timeout holds the card\'s countdown at the timeout being tried, in the countdown style', () => {
			const {rerender} = draw({autoPlay: true, nextUpCountdownStyle: 'both'}, 'setting-nextUpTimeout', 'player');
			expect(within(nextCard()).getByText('Up Next')).toBeTruthy();
			expect(within(nextCard()).getByText('S1:E2')).toBeTruthy();
			expect(within(nextCard()).getByText('Film 1')).toBeTruthy();
			expect(countdownOf(nextCard())).toEqual({ring: true, number: null, timer: 'Ends in :07'});
			// The card only comes up with the controls away.
			expect(find('.playerControls')).toBeNull();
			tryOn(rerender, 'nextUpTimeout', 25);
			expect(countdownOf(nextCard()).timer).toBe('Ends in :25');
			expect(nextCard().querySelector('.ringValue').getAttribute('stroke-dashoffset')).toBe('0');
			// At Instant the next episode starts with no card.
			tryOn(rerender, 'nextUpTimeout', 0);
			expect(nextCard()).toBeNull();
			expect(find('.playerControls')).not.toBeNull();
			cleanup();
			// The countdown follows the style, and without autoplay the card doesn't count at all.
			draw({autoPlay: true, nextUpCountdownStyle: 'progressBar', nextUpTimeout: 12}, 'setting-nextUpTimeout', 'player');
			expect(countdownOf(nextCard())).toEqual({ring: true, number: null, timer: null});
			cleanup();
			draw({autoPlay: false, nextUpTimeout: 12}, 'setting-nextUpTimeout', 'player');
			expect(countdownOf(nextCard())).toEqual({ring: false, number: null, timer: null});
			expect(find('[data-spotlight-id="next-up-play-btn"]')).not.toBeNull();
		});

		test('Next air date at the end draws the air date card while it\'s on, and nothing once Next Up is disabled', () => {
			const {rerender} = draw({showNextAirDate: true}, 'setting-showNextAirDate', 'player');
			expect(within(nextCard()).getByText('S1:E2')).toBeTruthy();
			expect(within(nextCard()).getByText(/^In 3 days \(/)).toBeTruthy();
			// It only says when the episode airs, with no picture, countdown or Play Next.
			expect(nextCard().querySelector('img')).toBeNull();
			expect(countdownOf(nextCard())).toEqual({ring: false, number: null, timer: null});
			expect(find('[data-spotlight-id="next-up-play-btn"]')).toBeNull();
			expect(find('.playerControls')).toBeNull();
			tryOn(rerender, 'showNextAirDate', false);
			expect(nextCard()).toBeNull();
			tryOn(rerender, 'showNextAirDate', true);
			expect(nextCard()).not.toBeNull();
			cleanup();
			draw({showNextAirDate: true, nextUpBehavior: 'minimal'}, 'setting-showNextAirDate', 'player');
			expect(nextCard().closest('.minimal')).not.toBeNull();
			cleanup();
			draw({showNextAirDate: true, nextUpBehavior: 'disabled'}, 'setting-nextUpBehavior', 'player');
			expect(nextCard()).toBeNull();
		});

		test('Replace Skip Outro swaps the credits\' skip prompt for the next episode card', () => {
			const {rerender} = draw({outroAction: 'ask', replaceSkipOutroWithNextUp: false, nextUpCountdownStyle: 'both'}, 'setting-replaceSkipOutroWithNextUp', 'player');
			expect(within(skipPrompt()).getByText('Skip Outro')).toBeTruthy();
			// Past a minute the number leaves the ring for the timer line.
			expect(countdownOf(skipPrompt())).toEqual({ring: true, number: null, timer: 'Ends in 1:20'});
			expect(nextCard()).toBeNull();
			tryOn(rerender, 'replaceSkipOutroWithNextUp', true);
			expect(skipPrompt()).toBeNull();
			expect(within(nextCard()).getByText('Up Next')).toBeTruthy();
			expect(find('[data-spotlight-id="next-up-play-btn"]')).not.toBeNull();
			// The credits come before the countdown starts.
			expect(countdownOf(nextCard())).toEqual({ring: false, number: null, timer: null});
			cleanup();
			// With Next Up disabled the credits keep their prompt, and an outro skipped by itself has none.
			draw({outroAction: 'ask', replaceSkipOutroWithNextUp: true, nextUpBehavior: 'disabled'}, 'setting-replaceSkipOutroWithNextUp', 'player');
			expect(within(skipPrompt()).getByText('Skip Outro')).toBeTruthy();
			expect(nextCard()).toBeNull();
			cleanup();
			draw({outroAction: 'auto', replaceSkipOutroWithNextUp: false}, 'setting-replaceSkipOutroWithNextUp', 'player');
			expect(skipPrompt()).toBeNull();
			expect(nextCard()).toBeNull();
		});
	});

	test('Pause While Scrubbing pauses the scrub while trick play is on', () => {
		const playPause = () => Array.from(document.querySelectorAll('.transportButtons .focusTooltip')).map((tip) => tip.textContent)
			.find((label) => label === 'Play' || label === 'Pause');
		const {rerender} = draw({trickPlayMode: 'single', trickPlayPauseWhileScrubbing: true}, 'setting-trickPlayPauseWhileScrubbing', 'player');
		const tryScrub = (value) => rerender(
			<SettingsLivePreview scene='player' row={describeRow('setting-trickPlayPauseWhileScrubbing', mockSettings)} trying={{key: 'trickPlayPauseWhileScrubbing', value, index: 0}} onPickScene={() => {}} onLeaveChips={() => {}} />
		);
		expect(find('.seekIndicator').style.backgroundColor).toBe('rgb(255, 255, 255)');
		expect(playPause()).toBe('Play');
		tryScrub(false);
		expect(playPause()).toBe('Pause');
		tryScrub(true);
		expect(playPause()).toBe('Play');
		cleanup();
		// Without thumbnails the player doesn't hold the scrub.
		draw({trickPlayMode: 'disabled', trickPlayPauseWhileScrubbing: true}, 'setting-trickPlayMode', 'player');
		expect(playPause()).toBe('Pause');
	});

	test('the Calendar chip only shows while the server offers the calendar', () => {
		const chips = () => Array.from(find('.chips').children).map((chip) => chip.textContent);
		const {unmount} = draw({}, 'setting-clockDisplay', 'home');
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search']);
		unmount();
		mockSeerr = {...mockSeerr, pluginInfo: {calendarAvailable: true}};
		draw({}, 'setting-clockDisplay', 'home');
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search', 'Calendar']);
	});

	test('the calendar scene draws the user\'s calendar in the style being tried, and nothing in it takes focus', async () => {
		mockSeerr = {...mockSeerr, pluginInfo: {calendarAvailable: true}};
		const focus = jest.spyOn(Spotlight, 'focus');
		try {
			const {unmount} = draw({}, 'setting-calendarShowBadges', 'calendar');
			expect(await screen.findByText('Upcoming')).toBeTruthy();
			expect((await screen.findAllByText('Night Shift')).length).toBeGreaterThan(0);
			expect(screen.getByText('Shows on the Calendar preview')).toBeTruthy();
			expect(find('.page').getAttribute('data-spotlight-container-disabled')).toBe('true');
			unmount();
			draw({}, 'setting-calendarStyle', 'calendar', {trying: {key: 'calendarStyle', value: 'countdown', index: 1}});
			expect(await screen.findByText('Starts in')).toBeTruthy();
			expect(screen.queryByText('Upcoming')).toBeNull();
			cleanup();
			// Its other settings wait until they're saved, or My shows would empty the list here.
			draw({}, 'setting-calendarScope', 'calendar', {trying: {key: 'calendarScope', value: 'myShows', index: 1}});
			await waitFor(() => expect(screen.getAllByText('Night Shift').length).toBeGreaterThan(0));
			expect(focus).not.toHaveBeenCalled();
		} finally {
			focus.mockRestore();
		}
	});

	test('the Library chip only shows with a video, music or book library, and comes after Calendar', () => {
		const chips = () => Array.from(find('.chips').children).map((chip) => chip.textContent);
		memoryCache.libraries = [{Id: 'p', Name: 'Photos', CollectionType: 'homevideos'}];
		const {unmount} = draw({}, 'setting-clockDisplay', 'home');
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search']);
		unmount();
		memoryCache.libraries = [{Id: 'mu', Name: 'Music', CollectionType: 'music'}, {Id: 'f', Name: 'Films', CollectionType: 'movies'}];
		mockSeerr = {...mockSeerr, pluginInfo: {calendarAvailable: true}};
		draw({}, 'setting-clockDisplay', 'home');
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search', 'Calendar', 'Library']);
	});

	test('Music Library Style draws the first music library in the music style being tried, and the rest draw the video library', async () => {
		const chips = () => Array.from(find('.chips').children).map((chip) => chip.textContent);
		memoryCache.libraries = [
			{Id: 'f', Name: 'Films', CollectionType: 'movies'}, {Id: 'mu', Name: 'Music', CollectionType: 'music'}, {Id: 'c', Name: 'Concerts', CollectionType: 'music'}
		];
		const saved = {libraryStyle: 'classic', musicLibraryStyle: 'immersive', groupItemsIntoCollections: false};
		const {unmount} = draw(saved, 'setting-musicLibraryStyle', 'library');
		expect(await screen.findByText('Music in classic, grouped false, preview true')).toBeTruthy();
		expect(screen.getByText('music immersive')).toBeTruthy();
		expect(screen.getByText('Shows on the Library preview')).toBeTruthy();
		unmount();
		draw(saved, 'setting-musicLibraryStyle', 'library', {trying: {key: 'musicLibraryStyle', value: 'quickAccess', index: 1}});
		expect(await screen.findByText('music quickAccess')).toBeTruthy();
		cleanup();
		draw(saved, 'setting-libraryCardTitles', 'library');
		expect(await screen.findByText('Films in classic, grouped false, preview true')).toBeTruthy();
		cleanup();
		// With no video library the chip still shows, and every library setting draws the music library.
		memoryCache.libraries = [{Id: 'mu', Name: 'Music', CollectionType: 'music'}];
		draw(saved, 'setting-libraryCardTitles', 'library');
		expect(await screen.findByText('Music in classic, grouped false, preview true')).toBeTruthy();
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search', 'Library']);
	});

	test('Book Library Style draws the first book or audiobook library in the book style being tried', async () => {
		const chips = () => Array.from(find('.chips').children).map((chip) => chip.textContent);
		memoryCache.libraries = [
			{Id: 'f', Name: 'Films', CollectionType: 'movies'}, {Id: 'mu', Name: 'Music', CollectionType: 'music'},
			{Id: 'ab', Name: 'Audiobooks', CollectionType: 'audiobooks'}, {Id: 'b', Name: 'Books', CollectionType: 'books'}
		];
		const saved = {libraryStyle: 'classic', bookLibraryStyle: 'bookstore', groupItemsIntoCollections: false};
		const {unmount} = draw(saved, 'setting-bookLibraryStyle', 'library');
		expect(await screen.findByText('Audiobooks in classic, grouped false, preview true')).toBeTruthy();
		expect(screen.getByText('book bookstore')).toBeTruthy();
		expect(screen.getByText('Shows on the Library preview')).toBeTruthy();
		unmount();
		draw(saved, 'setting-bookLibraryStyle', 'library', {trying: {key: 'bookLibraryStyle', value: 'readingRoom', index: 2}});
		expect(await screen.findByText('book readingRoom')).toBeTruthy();
		cleanup();
		draw(saved, 'setting-libraryCardTitles', 'library');
		expect(await screen.findByText('Films in classic, grouped false, preview true')).toBeTruthy();
		cleanup();
		// Without a video library the other rows fall back to music, and without either to the books.
		memoryCache.libraries = [{Id: 'b', Name: 'Books', CollectionType: 'books'}, {Id: 'mu', Name: 'Music', CollectionType: 'music'}];
		draw(saved, 'setting-libraryCardTitles', 'library');
		expect(await screen.findByText('Music in classic, grouped false, preview true')).toBeTruthy();
		cleanup();
		memoryCache.libraries = [{Id: 'b', Name: 'Books', CollectionType: 'books'}];
		draw(saved, 'setting-libraryCardTitles', 'library');
		expect(await screen.findByText('Books in classic, grouped false, preview true')).toBeTruthy();
		expect(chips()).toEqual(['Home', 'Details Page', 'Player', 'Search', 'Library']);
	});

	test('the library scene draws the first Movies or Shows library in the user\'s order, in the style being tried', async () => {
		memoryCache.libraries = [
			{Id: 'mu', Name: 'Music', CollectionType: 'music'}, {Id: 's', Name: 'Shows', CollectionType: 'TvShows'}, {Id: 'f', Name: 'Films', CollectionType: 'movies'}
		];
		const saved = {libraryStyle: 'classic', groupItemsIntoCollections: false};
		const {unmount} = draw(saved, 'setting-libraryStyle', 'library');
		expect(await screen.findByText('Shows in classic, grouped false, preview true')).toBeTruthy();
		expect(screen.getByText('Shows on the Library preview')).toBeTruthy();
		// The library screen has no navbar, so the preview draws none over it.
		expect(find('.frame svg')).toBeNull();
		unmount();
		draw(saved, 'setting-libraryStyle', 'library', {trying: {key: 'libraryStyle', value: 'docked', index: 2}});
		expect(await screen.findByText('Shows in docked, grouped false, preview true')).toBeTruthy();
		cleanup();
		// Its other settings wait until they're saved.
		draw(saved, 'setting-groupItemsIntoCollections', 'library', {trying: {key: 'groupItemsIntoCollections', value: true, index: 0}});
		expect(await screen.findByText('Shows in classic, grouped false, preview true')).toBeTruthy();
	});

	test('the seasonal settings draw the real effect over home in what\'s being tried, and every other setting takes it away', () => {
		const particles = () => document.querySelectorAll('.frame .overlay .particle').length;
		const falls = FALL_COUNTS[getPerfTier()];
		const {unmount} = draw({seasonalTheme: 'none', seasonalDensity: 'normal'}, 'setting-seasonalTheme', 'home', {trying: {key: 'seasonalTheme', value: 'snow', index: 1}});
		expect(particles()).toBe(falls.normal);
		unmount();
		draw({seasonalTheme: 'snow', seasonalDensity: 'normal'}, 'setting-seasonalDensity', 'home', {trying: {key: 'seasonalDensity', value: 'heavy', index: 2}});
		expect(particles()).toBe(falls.heavy);
		// The preview has no focus for the follower to follow.
		expect(find('.frame .follower')).toBeNull();
		cleanup();
		for (const rowId of ['setting-seasonalFollower', 'setting-clockDisplay']) {
			draw({seasonalTheme: 'snow', seasonalDensity: 'normal'}, rowId, 'home');
			expect(find('.overlay')).toBeNull();
			cleanup();
		}
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

describe('the audio and Collections Row Options', () => {
	// Each test talks to a server of its own, so nothing one loads is drawn in the next.
	let server = 0;
	const alien = {Id: 'c1', Name: 'Alien Collection', Type: 'BoxSet', ProductionYear: 1979, backdropUrl: 'alien-backdrop'};
	const batman = {Id: 'c2', Name: 'Batman Collection', Type: 'BoxSet', ProductionYear: 1989};
	const collectionsOn = (extra = {}) => ({
		displayCollectionsRows: true,
		homeRowsStyle: 'v1',
		mergeContinueWatchingNextUp: false,
		homeRows: [{id: 'collections', name: 'Collections', enabled: true, order: 0}, {id: 'resume', name: 'Continue Watching', enabled: true, order: 1}],
		...extra
	});
	const sortedByName = async () => ({Items: [alien, batman]});
	const notice = () => find('.notice');
	const firstCardTitles = () => screen.getAllByText(/Collection$/).map((node) => node.textContent);

	beforeEach(() => {
		server += 1;
		mockAuth = {...mockAuth, serverUrl: `http://server${server}`, api: {getItems: jest.fn(sortedByName)}};
		memoryCache.rowData = [{id: 'resume', title: 'Continue Watching', items: [{Id: 'r1', Name: 'Resumed Film', Type: 'Movie'}], type: 'landscape'}];
	});

	afterEach(() => {
		// Unmount first, since the preview redraws when Home's rows change.
		cleanup();
		memoryCache.rowData = null;
		mockParentalFilter = require('../../../utils/parentalFilter').parentalFilterFromRatings([]);
	});

	test('with the Collections row off in Rows, Home stays as it is and a notice says where to turn it on', () => {
		draw(collectionsOn({homeRows: [{id: 'collections', name: 'Collections', enabled: false, order: 0}]}), 'setting-collectionsRowSortBy', 'home');
		expect(notice().textContent).toBe('The Collections row is turned off. To show it, go to Rows, open Collections under Disabled, and turn it on.');
		expect(screen.getByText('Turn on a row in Rows, under Disabled')).toBeTruthy();
		expect(screen.getAllByText('Continue Watching').length).toBeGreaterThan(0);
		expect(mockAuth.api.getItems).not.toHaveBeenCalled();
	});

	test('with the Display switch off too, the notice and the inspector ask for the switch first', () => {
		draw(collectionsOn({displayCollectionsRows: false, homeRows: []}), 'setting-displayCollectionsRows', 'home');
		expect(notice().textContent).toBe('To see the Collections row on Home, first turn on Display Collections Rows. Then go to Rows, open Collections under Disabled, and turn it on.');
		expect(screen.getByText('Turn on Display Collections Rows, then turn on a row in Rows')).toBeTruthy();
	});

	test('the audio notice names the rows and the General group they sit in', () => {
		draw({displayAudioRows: true, homeRows: []}, 'setting-audioRowsSortBy', 'home');
		expect(notice().textContent).toBe('Music Artists, Music Albums and Music Playlists are all turned off. To show one, go to Rows, open General under Disabled, and turn it on.');
	});

	test('Kids Mode and Multi-Server Libraries each say they keep the rows off Home', () => {
		const {unmount} = draw(collectionsOn({kidsModeEnabled: true}), 'setting-collectionsRowSortBy', 'home');
		expect(notice().textContent).toBe("Kids Mode keeps these rows off Home, so these settings don't change it.");
		expect(screen.getByText('Kids Mode keeps this off Home')).toBeTruthy();
		unmount();
		mockAuth = {...mockAuth, hasMultipleServers: true};
		draw(collectionsOn({unifiedLibraryMode: true}), 'setting-collectionsRowSortBy', 'home');
		expect(notice().textContent).toBe("Home leaves these rows out while Multi-Server Libraries is on, so these settings don't change it.");
		expect(mockAuth.api.getItems).not.toHaveBeenCalled();
	});

	test('with the Display switch off and the row on in Rows, Home simply goes without it', () => {
		draw(collectionsOn({displayCollectionsRows: false}), 'setting-displayCollectionsRows', 'home');
		expect(notice()).toBeNull();
		expect(screen.queryByText('Collections')).toBeNull();
		expect(mockAuth.api.getItems).not.toHaveBeenCalled();
	});

	test('the row draws on top with its first card focused, and Home\'s rows follow in Home\'s order', async () => {
		draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await screen.findByText('Collections');
		const titles = Array.from(document.querySelectorAll('.frame div')).map((node) => node.textContent);
		expect(titles.indexOf('Collections')).toBeLessThan(titles.indexOf('Continue Watching'));
		expect(screen.getByText('Resumed Film')).toBeTruthy();
		// Classic's info area reads the focused card, and the backdrop comes from it.
		expect(screen.getAllByText('Alien Collection').length).toBe(2);
		expect(find('.homeBackdrop').dataset.url).toBe('alien-backdrop');
		const rings = Array.from(document.querySelectorAll('.frame div')).filter((node) => node.style.border.indexOf('3px solid') === 0);
		expect(rings.length).toBe(1);
		expect(notice()).toBeNull();
		expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
	});

	test('a sort being tried loads the row in that order, and the old one stays up until it does', async () => {
		let release;
		mockAuth.api.getItems.mockImplementation((params) => (params.SortBy.indexOf('PremiereDate') === 0
			? new Promise((resolve) => {
				release = () => resolve({Items: [batman, alien]});
			})
			: sortedByName()));
		const {rerender} = draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await waitFor(() => expect(firstCardTitles()[0]).toBe('Alien Collection'));
		const row = describeRow('setting-collectionsRowSortBy', mockSettings);
		rerender(<SettingsLivePreview scene='home' row={row} trying={{key: 'collectionsRowSortBy', value: 'PremiereDate', index: 3}} onPickScene={() => {}} onLeaveChips={() => {}} />);
		await waitFor(() => expect(mockAuth.api.getItems).toHaveBeenCalledWith(expect.objectContaining({IncludeItemTypes: 'BoxSet', SortBy: expect.stringMatching(/^PremiereDate/)})));
		expect(firstCardTitles()[0]).toBe('Alien Collection');
		await act(async () => release());
		await waitFor(() => expect(firstCardTitles()[0]).toBe('Batman Collection'));
	});

	test('a focused modern collection with nothing to show under it stays a poster, as on Home', async () => {
		mockAuth.api.getItems.mockImplementation(async () => ({Items: [{Id: 'c3', Name: 'Bare Collection', Type: 'BoxSet'}]}));
		draw(collectionsOn({homeRowsStyle: 'v2'}), 'setting-collectionsRowSortBy', 'home');
		await screen.findByText('Bare Collection');
		expect(focusedCardShape()).toBeLessThan(1);
	});

	test('with no collections on the server, a notice says Home leaves the row out', async () => {
		mockAuth.api.getItems.mockImplementation(async () => ({Items: []}));
		draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await waitFor(() => expect(notice().textContent).toBe('There are no collections to show, so Home leaves this row out.'));
	});

	test('Show Individual Episodes says it only changes single collection rows', async () => {
		draw(collectionsOn(), 'setting-collectionsRowShowEpisodes', 'home');
		await waitFor(() => expect(find('.caption').textContent).toBe('This only changes rows for a single collection added in Rows. The Collections row looks the same.'));
	});

	test('on a Modern row an album stays square even focused, and an artist draws as a poster, as on Home', async () => {
		mockAuth.api.getItems.mockImplementation(async () => ({Items: [{Id: 'a1', Name: 'Hybrid Theory', Type: 'MusicAlbum', ProductionYear: 2000}]}));
		mockAuth.api.getAlbumArtists = jest.fn(async () => ({Items: [{Id: 'p1', Name: 'Linkin Park', Type: 'MusicArtist'}]}));
		draw({displayAudioRows: true, homeRowsStyle: 'v2', homeRows: [
			{id: 'audioalbums', name: 'Music Albums', enabled: true, order: 0},
			{id: 'audioartists', name: 'Music Artists', enabled: true, order: 1}
		]}, 'setting-audioRowsSortBy', 'home');
		await screen.findByText('Music Artists');
		const shape = (title) => {
			const card = screen.getByText(title).parentElement;
			return parseFloat(card.style.width) / parseFloat(card.firstChild.style.height);
		};
		expect(shape('Hybrid Theory')).toBe(1);
		expect(shape('Linkin Park')).toBeCloseTo(2 / 3);
		expect(mockAuth.api.getItems).toHaveBeenCalledWith(expect.objectContaining({IncludeItemTypes: 'MusicAlbum', SortBy: expect.stringMatching(/^SortName/)}));
		expect(mockAuth.api.getAlbumArtists).toHaveBeenCalledWith(expect.objectContaining({IncludeItemTypes: 'MusicArtist'}));
	});

	test("a row that fails to load isn't taken for an empty one, and is asked for again next time", async () => {
		mockAuth.api.getItems.mockImplementation(async () => {
			throw new Error('server error');
		});
		const {unmount} = draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await waitFor(() => expect(mockAuth.api.getItems).toHaveBeenCalledTimes(1));
		// Lets the failed load settle before looking for a notice.
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(notice()).toBeNull();
		unmount();
		mockAuth.api.getItems.mockImplementation(sortedByName);
		draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await screen.findByText('Collections');
		expect(mockAuth.api.getItems).toHaveBeenCalledTimes(2);
	});

	test("another user on the same server sees their own rows, not the last user's", async () => {
		const {unmount} = draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await screen.findByText('Resumed Film');
		unmount();
		mockAuth = {...mockAuth, user: {Id: 'kid', Name: 'Kid'}, api: {getItems: jest.fn(async () => ({Items: [batman]}))}};
		memoryCache.rowData = [];
		draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await waitFor(() => expect(firstCardTitles()[0]).toBe('Batman Collection'));
		expect(screen.queryByText('Resumed Film')).toBeNull();
		expect(screen.queryByText('Alien Collection')).toBeNull();
	});

	test('blocked ratings are left out the way Home leaves them out', async () => {
		mockParentalFilter = require('../../../utils/parentalFilter').parentalFilterFromRatings(['R']);
		mockAuth.api.getItems.mockImplementation(async () => ({Items: [{...alien, OfficialRating: 'R'}, batman]}));
		draw(collectionsOn(), 'setting-collectionsRowSortBy', 'home');
		await waitFor(() => expect(firstCardTitles()[0]).toBe('Batman Collection'));
		expect(screen.queryByText('Alien Collection')).toBeNull();
	});

	test("single collections added in Rows count as on Home, so there's no notice to turn the row on", () => {
		const picked = {id: `pluginDynamic:collections:${mockAuth.serverUrl}:collection:c1`, name: 'Alien Collection', source: 'collections', itemId: 'c1', serverUrl: mockAuth.serverUrl, enabled: true, order: 0};
		draw(collectionsOn({homeRows: [{id: 'collections', name: 'Collections', enabled: false, order: 1}, picked]}), 'setting-collectionsRowSortBy', 'home');
		expect(notice()).toBeNull();
		expect(find('.caption').textContent).toBe('The Collections row is off, so this only changes the single collections added in Rows.');
		expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
	});

	test('the audio rows draw on a server with no films for the sample rows', async () => {
		const pool = mockItems.splice(0);
		try {
			mockAuth.api.getItems.mockImplementation(async () => ({Items: [{Id: 'a1', Name: 'Hybrid Theory', Type: 'MusicAlbum'}]}));
			draw({displayAudioRows: true, homeRows: [{id: 'audioalbums', name: 'Music Albums', enabled: true, order: 0}]}, 'setting-audioRowsSortBy', 'home');
			await screen.findByText('Music Albums');
		} finally {
			mockItems.push(...pool);
		}
	});
});

describe('Home\'s own rows', () => {
	let server = 100;
	const heat = {Id: 'm1', Name: 'Heat', Type: 'Movie', ImageTags: {Primary: 'p', Thumb: 't', Banner: 'b'}, BackdropImageTags: ['bd'], UserData: {PlayedPercentage: 40}};
	const fargo = {Id: 's2', Name: 'Fargo', Type: 'Series', ImageTags: {Primary: 'p'}, UserData: {UnplayedItemCount: 3}};
	const pilot = {
		Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesId: 's1', SeriesName: 'Lost', SeriesPrimaryImageTag: 'sp', ParentThumbItemId: 's1',
		ParentThumbImageTag: 'st', ImageTags: {Primary: 'ep'}, UserData: {Played: true}
	};
	const alien = {Id: 'm2', Name: 'Alien', Type: 'Movie', ImageTags: {Primary: 'p', Thumb: 't'}};
	const home = (extra = {}) => ({
		homeRowsStyle: 'v1',
		homeRowOverlay: false,
		mergeContinueWatchingNextUp: false,
		homeRows: [
			{id: 'latest-media', name: 'Recently Added', enabled: true, order: 0},
			{id: 'resume', name: 'Continue Watching', enabled: true, order: 1},
			{id: 'nextup', name: 'Next Up', enabled: true, order: 2}
		],
		...extra
	});
	const rowTitles = () => ['Recently Added Films', 'Continue Watching', 'Next Up', 'Favorite Movies'].filter((title) => screen.queryAllByText(title).length > 0);
	const cardOf = (title) => screen.getAllByText(title).map((node) => node.parentElement).find((node) => node.style.width);
	const artOf = (title) => cardOf(title).querySelector('img').getAttribute('src');
	const shapeOf = (title) => {
		const card = cardOf(title);
		return parseFloat(card.style.width) / parseFloat(card.firstChild.style.height);
	};
	const focusedCard = () => Array.from(document.querySelectorAll('.frame div')).find((node) => node.style.border.indexOf('3px solid') === 0).parentNode.parentNode;

	beforeEach(() => {
		server += 1;
		mockAuth = {...mockAuth, serverUrl: `http://server${server}`, api: {getItems: jest.fn(async () => ({Items: [alien]}))}};
		memoryCache.rowData = [
			{id: 'latest-lib', title: 'Recently Added Films', isLatestRow: true, items: [alien], type: 'portrait'},
			{id: 'resume', title: 'Continue Watching', items: [heat, fargo], type: 'landscape'},
			{id: 'nextup', title: 'Next Up', items: [pilot], type: 'landscape'}
		];
	});

	afterEach(() => {
		cleanup();
		memoryCache.rowData = null;
	});

	test('Watched Indicators starts at the first row wearing them, and draws them the way the one being tried allows', () => {
		const shown = () => ({
			progress: Boolean(cardOf('Heat').querySelector('div[style*="width: 40%"]')),
			count: within(cardOf('Fargo')).queryByText('3') !== null,
			check: Boolean(cardOf('Pilot').querySelector('svg'))
		});
		const {rerender} = draw(home(), 'setting-watchedIndicatorBehavior', 'home');
		expect(rowTitles()).toEqual(['Continue Watching', 'Next Up']);
		expect(within(focusedCard()).getByText('Heat')).toBeTruthy();
		expect(shown()).toEqual({progress: true, count: true, check: true});
		const row = describeRow('setting-watchedIndicatorBehavior', mockSettings);
		const expected = {hideCount: {progress: true, count: false, check: true}, episodesOnly: {progress: false, count: false, check: true}, never: {progress: false, count: false, check: false}};
		Object.keys(expected).forEach((value, index) => {
			rerender(<SettingsLivePreview scene='home' row={row} trying={{key: 'watchedIndicatorBehavior', value, index}} onPickScene={() => {}} onLeaveChips={() => {}} />);
			expect(shown()).toEqual(expected[value]);
		});
	});

	test('Display Series Thumbnails starts at the first row with an episode and swaps its still for the series art, in either style', () => {
		draw(home(), 'setting-useSeriesThumbnails', 'home');
		expect(rowTitles()).toEqual(['Next Up']);
		expect(artOf('Pilot')).toContain('/Items/e1/Images/Primary');
		cleanup();
		// A Classic poster row takes the series poster and a wider one the series thumb, as Home's cards do.
		draw(home({useSeriesThumbnails: true}), 'setting-useSeriesThumbnails', 'home');
		expect(artOf('Pilot')).toContain('/Items/s1/Images/Primary');
		cleanup();
		draw(home({useSeriesThumbnails: true, homeRowsImageType: 'thumb'}), 'setting-useSeriesThumbnails', 'home');
		expect(artOf('Pilot')).toContain('/Items/s1/Images/Thumb');
		cleanup();
		// A Modern card shows the series art once it's focused.
		draw(home({homeRowsStyle: 'v2', useSeriesThumbnails: true}), 'setting-useSeriesThumbnails', 'home');
		expect(focusedCard().querySelector('img').getAttribute('src')).toContain('/Items/s1/Images/Thumb');
	});

	test('a row on the image type screen is drawn first in its artwork and shape, and the global type reshapes the rest', () => {
		draw(home({homeRowImageTypes: {resume: 'banner'}}), 'row-image-type-resume', 'home');
		expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
		expect(rowTitles()).toEqual(['Continue Watching', 'Next Up']);
		expect(shapeOf('Heat')).toBeCloseTo(1168 / 216);
		expect(artOf('Heat')).toContain('/Items/m1/Images/Banner');
		cleanup();
		// Merged with Next Up, the row is set under Continue Watching.
		draw(home({mergeContinueWatchingNextUp: true}), 'row-image-type-nextup', 'home');
		expect(screen.getByText('Continue Watching & Next Up')).toBeTruthy();
		expect(screen.queryByText('Alien')).toBeNull();
		cleanup();
		draw(home({homeRowsImageType: 'thumb'}), 'setting-homeRowsImageType', 'home');
		expect(shapeOf('Alien')).toBeCloseTo(16 / 9);
		expect(artOf('Alien')).toContain('/Items/m2/Images/Thumb');
		cleanup();
		draw(home(), 'setting-homeRowsImageType', 'home');
		expect(shapeOf('Alien')).toBeCloseTo(2 / 3);
	});

	test('Focus Expansion Animation grows the focused Classic card, and Info Overlay brings back the info band', () => {
		draw(home(), 'setting-cardFocusZoom', 'home');
		expect(rowTitles()).toEqual(['Recently Added Films', 'Continue Watching', 'Next Up']);
		expect(focusedCard().style.transform).toBe('scale(1.05)');
		expect(screen.getAllByText('Alien')).toHaveLength(1);
		cleanup();
		draw(home({cardFocusZoom: false, homeRowOverlay: true}), 'setting-homeRowOverlay', 'home');
		expect(focusedCard().style.transform).toBe('');
		expect(screen.getAllByText('Alien')).toHaveLength(2);
	});

	test('the preview follows Home as it loads its rows again behind Settings', async () => {
		memoryCache.rowData = [];
		draw(home(), 'setting-cardFocusZoom', 'home');
		expect(screen.queryByText('Heat')).toBeNull();
		act(() => {
			memoryCache.rowData = [{id: 'resume', title: 'Continue Watching', items: [heat], type: 'landscape'}];
		});
		expect(screen.getByText('Heat')).toBeTruthy();
	});

	test('the Rows screen draws its arrangement before it\'s saved', () => {
		const settings = home();
		const draft = [settings.homeRows[2], settings.homeRows[0], settings.homeRows[1]].map((entry, order) => ({...entry, order}));
		draw(settings, 'homerow-nextup', 'home', {trying: {key: 'homeRows', value: draft, index: -1}});
		expect(screen.getByText('Shows on the Home preview')).toBeTruthy();
		expect(rowTitles()).toEqual(['Recently Added Films', 'Continue Watching', 'Next Up']);
		const titles = Array.from(document.querySelectorAll('.frame div')).map((node) => node.textContent);
		expect(titles.indexOf('Next Up')).toBeLessThan(titles.indexOf('Recently Added Films'));
	});

	test('a Favorites sort being tried loads Home\'s favorites rows through Home\'s own loader, in that sort', async () => {
		const settings = home({displayFavoritesRows: true, homeRows: [
			{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
			{id: 'favoriteMovies', name: 'Favorite Movies', enabled: true, order: 1}
		]});
		const {rerender} = draw(settings, 'setting-favoritesRowSortBy', 'home');
		await waitFor(() => expect(rowTitles()).toEqual(['Favorite Movies']));
		expect(mockAuth.api.getItems).toHaveBeenCalledWith(expect.objectContaining({Filters: 'IsFavorite', IncludeItemTypes: 'Movie', SortBy: expect.stringMatching(/^SortName/)}));
		expect(within(focusedCard()).getByText('Alien')).toBeTruthy();
		const row = describeRow('setting-favoritesRowSortBy', mockSettings);
		rerender(<SettingsLivePreview scene='home' row={row} trying={{key: 'favoritesRowSortBy', value: 'DateCreated', index: 1}} onPickScene={() => {}} onLeaveChips={() => {}} />);
		await waitFor(() => expect(mockAuth.api.getItems).toHaveBeenCalledWith(expect.objectContaining({Filters: 'IsFavorite', SortBy: expect.stringMatching(/^DateCreated/)})));
	});

	test('with the Favorites rows off in Rows, a notice names them and the group they sit in', () => {
		draw(home({displayFavoritesRows: true}), 'setting-favoritesRowSortBy', 'home');
		expect(find('.notice').textContent).toBe('The Favorites rows are all turned off. To show one, go to Rows, open Favorites under Disabled, and turn it on.');
		cleanup();
		draw(home({displayStudiosRows: false}), 'setting-studiosRowSortBy', 'home');
		expect(find('.notice').textContent).toBe('To see the Studios row on Home, first turn on Display Studio Row. Then go to Rows, open Genres and Studios under Disabled, and turn it on.');
		expect(screen.getByText('Turn on Display Studio Row, then turn on a row in Rows')).toBeTruthy();
	});

	test('Peek Home Rows draws Home\'s first row along the bottom of the bars that have a peek', () => {
		const peekTop = () => {
			const title = screen.queryByText('Recently Added Films');
			return title ? title.parentElement.parentElement.style.top : null;
		};
		draw(home({mediaBarRowPeek: true, featuredBarStyle: 'moonfin'}), 'setting-mediaBarRowPeek', 'home');
		// The title band and half of a Classic poster, up from the bottom of the 540 tall screen.
		expect(peekTop()).toBe(`${540 - (24 + 19 + 5 + 60)}px`);
		cleanup();
		draw(home({mediaBarRowPeek: true, featuredBarStyle: 'banner'}), 'setting-mediaBarRowPeek', 'home');
		expect(peekTop()).toBeNull();
		cleanup();
		draw(home({mediaBarRowPeek: false}), 'setting-featuredBarStyle', 'home');
		expect(peekTop()).toBeNull();
	});
});
