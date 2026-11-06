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
jest.mock('../../../context/AuthContext', () => ({useAuth: () => ({user: {Id: 'u', Name: 'Ana'}, serverType: 'jellyfin', serverUrl: 'http://server'})}));
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
jest.mock('../../../components/LoadingSpinner', () => () => null);
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
	beforeEach(() => {
		mockSeerr = {isEnabled: false, displayName: 'Seerr', pluginInfo: null};
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

	test('expanded rows keep the next row off the screen', () => {
		const spacerAbove = (title) => screen.getByText(title).parentElement.previousSibling.style.height;
		const {unmount} = draw({fullScreenRows: false}, 'setting-fullScreenRows', 'home');
		expect(spacerAbove('Recently Added')).toBe('24px');
		unmount();
		draw({fullScreenRows: true}, 'setting-fullScreenRows', 'home');
		expect(spacerAbove('Recently Added')).toBe('540px');
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
			expect(screen.getAllByText('Night Shift').length).toBeGreaterThan(0);
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
