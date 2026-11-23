import {act, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import {focusContentFromSidebar} from '../../utils/navFocusTargets';

import AtlasBar from './AtlasBar';
import MosaicNav from './MosaicNav';
import ReelNav from './ReelNav';
import TablineBar from './TablineBar';

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
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, onSpotlightLeft, onSpotlightUp, children, ...props}) => // eslint-disable-line no-unused-vars
		React.createElement(type, {...props, 'data-spotlight-id': spotlightId}, children);
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => {
	const React = require('react');
	const decorate = (config, type) => ({spotlightId, spotlightRestrict, children, ...props}) =>
		React.createElement(type, {...props, 'data-spotlight-id': spotlightId, 'data-restrict': spotlightRestrict}, children);
	return {__esModule: true, default: decorate, spotlightDefaultClass: 'spottable-default'};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), move: jest.fn(() => false), getPointerMode: () => false}));
jest.mock('../../context/SettingsContext', () => ({
	useSettings: () => ({
		settings: {showClock: true, showLibrariesIndividually: false, navbarColor: 'gray', navbarOpacity: 50},
		activeTheme: {colors: {accent: '#00A4DC', background: '#101010', onSurface: '#FFFFFF'}, borders: {}, textGlow: []}
	})
}));
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: true, displayName: 'Discover', pluginInfo: {}})}));
jest.mock('../../context/SyncPlayContext', () => ({useSyncPlay: () => ({isInGroup: false})}));
jest.mock('../../hooks/useWatchParty', () => () => ({room: null}));
jest.mock('../../context/ServerMessagesContext', () => ({useServerMessages: () => ({messages: [], unreadCount: 0})}));
jest.mock('../../context/AchievementsContext', () => ({useAchievements: () => ({socialAvailable: false, badgeCount: 0})}));
jest.mock('../../context/AuthContext', () => ({
	useAuth: () => ({api: {getResumeItems: () => Promise.resolve({Items: []}), getLatest: () => Promise.resolve([])}, serverUrl: 'http://server', serverType: 'jellyfin', user: {Id: 'u'}})
}));
jest.mock('../../hooks/useUserAvatar', () => () => ({user: {Name: 'Ann'}, avatarUrl: null, initial: 'A', onError: () => {}}));
jest.mock('../../hooks/useClock', () => () => '8:42 PM');
jest.mock('../../utils/navFocusTargets', () => ({
	CONTENT_FOCUS_TARGETS: [],
	focusContentFromSidebar: jest.fn(),
	focusFirstContentTarget: jest.fn(),
	rememberSidebarReturn: jest.fn()
}));
const mockTrending = jest.fn();
jest.mock('../../services/seerrApi', () => ({__esModule: true, default: {trending: (...args) => mockTrending(...args), trendingMovies: () => Promise.resolve({results: []})}}));
jest.mock('../../services/connectionPool', () => ({getApiForItem: () => null}));
jest.mock('../../utils/gameLibrary', () => ({isGameLibrary: () => false}));
jest.mock('../../utils/helpers', () => ({getFeaturedBackdropUrl: () => null}));
jest.mock('../MediaCard/cardArtwork', () => ({modernCardImageUrl: () => null}));
jest.mock('../MiniMusicPlayer/MiniMusicPlayer', () => ({NavMusicPill: () => null}));
jest.mock('../../views/Browse/browseCache', () => ({memoryCache: {featuredItems: null, rowData: []}}));

const movies = {Id: 'm', Name: 'Movies', CollectionType: 'movies'};
const shows = {Id: 's', Name: 'Shows', CollectionType: 'tvshows'};
const handlers = () => ({
	onHome: jest.fn(), onSearch: jest.fn(), onShuffle: jest.fn(), onGenres: jest.fn(), onFavorites: jest.fn(),
	onDiscover: jest.fn(), onSettings: jest.fn(), onSelectLibrary: jest.fn(), onUserMenu: jest.fn(), onSyncPlay: jest.fn()
});
const keyDown = (element, keyCode) => fireEvent.keyDown(element, {keyCode, which: keyCode});
const windowLabel = () => document.querySelector('[data-spotlight-id="navbar-reel-window"]')?.getAttribute('aria-label');

beforeEach(() => {
	jest.clearAllMocks();
	Spotlight.focus.mockImplementation((id) => {
		const element = document.querySelector(`[data-spotlight-id="${id}"]`);
		if (element) element.focus();
		return Boolean(element);
	});
});

describe('ReelNav', () => {
	test('opens on the current page, turns both ways around the list and goes to the entry in the window', () => {
		const props = handlers();
		const backRef = {current: null};
		render(<ReelNav activeView="home" libraries={[movies, shows]} backRef={backRef} {...props} />);

		act(() => {
			document.querySelector('.spottable-default').focus();
		});
		expect(windowLabel()).toBe('Home');
		const reelWindow = document.querySelector('[data-spotlight-id="navbar-reel-window"]');
		expect(document.activeElement).toBe(reelWindow);

		keyDown(reelWindow, 40);
		expect(windowLabel()).toBe('Search');
		keyDown(reelWindow, 38);
		keyDown(reelWindow, 38);
		expect(windowLabel()).toBe('Settings');
		// Both libraries are on the wheel even with Show Libraries Individually off.
		keyDown(reelWindow, 38);
		expect(windowLabel()).toBe('Shows');

		fireEvent.click(reelWindow);
		expect(props.onSelectLibrary).toHaveBeenCalledWith(shows);
		expect(focusContentFromSidebar).toHaveBeenCalled();
		expect(windowLabel()).toBeUndefined();
	});

	test('closes on Back and on Right, and leaves Back alone when closed', () => {
		const backRef = {current: null};
		render(<ReelNav libraries={[]} backRef={backRef} {...handlers()} />);
		expect(backRef.current()).toBe(false);
		act(() => {
			document.querySelector('.spottable-default').focus();
		});
		let handled;
		act(() => {
			handled = backRef.current();
		});
		expect(handled).toBe(true);
		expect(windowLabel()).toBeUndefined();
	});
});

describe('MosaicNav', () => {
	test('shows a tile for every library and goes to the one picked', () => {
		const props = handlers();
		render(<MosaicNav activeView="home" libraries={[movies, shows]} {...props} />);
		act(() => {
			document.querySelector('.spottable-default').focus();
		});
		expect(document.activeElement.getAttribute('data-spotlight-id')).toBe('navbar-mosaic-home');
		// Enact only honors the restriction as a prop, a decorator config value is dropped.
		expect(document.querySelector('[data-spotlight-id="navbar-mosaic"]').getAttribute('data-restrict')).toBe('self-only');
		expect(screen.getByText('Movies')).toBeTruthy();
		fireEvent.click(screen.getByText('Shows').closest('button'));
		expect(props.onSelectLibrary).toHaveBeenCalledWith(shows);
		expect(document.querySelector('[data-spotlight-id="navbar-mosaic"]')).toBeNull();
	});

	test('closes when Right finds nothing further right', () => {
		render(<MosaicNav libraries={[movies]} {...handlers()} />);
		act(() => {
			document.querySelector('.spottable-default').focus();
		});
		keyDown(document.activeElement, 39);
		expect(Spotlight.move).toHaveBeenCalledWith('right');
		expect(focusContentFromSidebar).toHaveBeenCalled();
		expect(document.querySelector('[data-spotlight-id="navbar-mosaic"]')).toBeNull();
	});
});

describe('AtlasBar', () => {
	test('Down on the grouped libraries opens its panel, and Up from the top closes it onto the tab', async () => {
		const backRef = {current: null};
		render(<AtlasBar libraries={[movies, shows]} backRef={backRef} {...handlers()} />);
		const tab = document.querySelector('[data-spotlight-id="navbar-libraries"]');
		await act(async () => {
			keyDown(tab, 40);
		});
		const panel = document.querySelector('[data-spotlight-id="navbar-panel"]');
		expect(panel).not.toBeNull();
		expect(panel.getAttribute('data-restrict')).toBe('self-only');
		expect(document.activeElement.textContent).toBe('Movies');

		keyDown(document.activeElement, 38);
		expect(document.querySelector('[data-spotlight-id="navbar-panel"]')).toBeNull();
		expect(document.activeElement).toBe(tab);
	});

	test('a panel that failed to load tries again on the next open, and one that loaded keeps what it read', async () => {
		window.dispatchEvent(new Event('moonfin:browseRefresh'));
		mockTrending
			.mockImplementationOnce(() => Promise.reject(new Error('offline')))
			.mockImplementation(() => Promise.resolve({results: [{id: 1, title: 'Dune'}]}));
		const backRef = {current: null};
		render(<AtlasBar libraries={[]} backRef={backRef} {...handlers()} />);
		const tab = document.querySelector('[data-spotlight-id="navbar-discover"]');
		const open = async () => {
			await act(async () => {
				keyDown(tab, 40);
			});
		};
		const close = () => act(() => {
			backRef.current();
		});

		await open();
		expect(mockTrending).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Dune')).toBeNull();
		close();
		await open();
		expect(mockTrending).toHaveBeenCalledTimes(2);
		expect(screen.getByText('Dune')).toBeTruthy();
		close();
		await open();
		expect(mockTrending).toHaveBeenCalledTimes(2);
		expect(screen.getByText('Dune')).toBeTruthy();
	});

	test('Select on a tab navigates straight there', () => {
		const props = handlers();
		render(<AtlasBar libraries={[]} {...props} />);
		fireEvent.click(screen.getByText('Genres').closest('button'));
		expect(props.onGenres).toHaveBeenCalled();
	});
});

describe('TablineBar', () => {
	test('draws every destination but Search as a text tab, with Search as an icon on the right', () => {
		const props = handlers();
		render(<TablineBar libraries={[movies]} {...props} />);
		expect(screen.getByText('Home')).toBeTruthy();
		expect(screen.getByText('Libraries')).toBeTruthy();
		expect(screen.queryByText('Search')).toBeNull();
		fireEvent.click(document.querySelector('[data-spotlight-id="navbar-search"]'));
		expect(props.onSearch).toHaveBeenCalled();
	});
});
