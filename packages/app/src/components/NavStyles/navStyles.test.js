// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});
// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own English source string.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
// Storage picks its platform module through a dynamic import that jest can't transform.
jest.mock('../../services/storage', () => ({}));
// Nothing renders here, so the focus engine only has to load.
jest.mock('@enact/spotlight', () => ({}));
jest.mock('@enact/spotlight/Spottable', () => () => () => null);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => () => () => null);

import {currentEntryIndex, navEntries} from './navDestinations';
import {reelDistance} from './ReelNav';
import {atlasLinks, atlasPanelKind} from './AtlasPanel';
import {localToProfile, profileToLocal} from '../../context/SettingsContext';

const movies = {Id: 'm', Name: 'Movies', CollectionType: 'movies'};
const music = {Id: 'a', Name: 'Music', CollectionType: 'music'};
const boxsets = {Id: 'b', Name: 'Collections', CollectionType: 'boxsets'};

const everything = {
	showShuffle: true, showGenres: true, showFavorites: true, showLiveTv: true, showSeerr: true,
	showCalendar: true, showSyncPlay: true, showLibraries: true, showMessages: true, showFriends: true,
	navLibraries: [movies, music], librariesIndividually: false, seerrLabel: 'Discover'
};
const keys = (entries) => entries.map((entry) => entry.key);

describe('navEntries', () => {
	test('follows the classic bar order, with the libraries grouped', () => {
		expect(keys(navEntries(everything, {}))).toEqual([
			'home', 'search', 'shuffle', 'genres', 'favorites', 'livetv', 'syncplay', 'discover', 'calendar',
			'libraries', 'messages', 'friends', 'settings'
		]);
	});

	test('follows the classic sidebar order, which puts Watch Parties after Calendar', () => {
		expect(keys(navEntries(everything, {}, {side: true})).slice(5, 9)).toEqual(['livetv', 'discover', 'calendar', 'syncplay']);
	});

	test('lists each library on its own when asked or when the setting says so', () => {
		const split = navEntries(everything, {}, {splitLibraries: true});
		expect(split.filter((entry) => entry.library).map((entry) => entry.label)).toEqual(['Movies', 'Music']);
		expect(keys(navEntries({...everything, librariesIndividually: true}, {}))).not.toContain('libraries');
	});

	test('leaves out what the settings hide, and still has no libraries when they are off', () => {
		const bare = navEntries({navLibraries: [movies], showLibraries: false}, {}, {splitLibraries: true});
		expect(keys(bare)).toEqual(['home', 'search', 'settings']);
	});

	test('puts Now Playing last while music is up', () => {
		expect(keys(navEntries({navLibraries: []}, {}, {nowPlaying: true}))).toEqual(['home', 'search', 'settings', 'music']);
	});

	test('finds the page on screen, and falls back to Home', () => {
		const entries = navEntries(everything, {}, {splitLibraries: true});
		expect(entries[currentEntryIndex(entries, 'm')].label).toBe('Movies');
		expect(currentEntryIndex(entries, '')).toBe(0);
	});
});

describe('reelDistance', () => {
	test('wraps around the list both ways', () => {
		expect(reelDistance(0, 0, 9)).toBe(0);
		expect(reelDistance(1, 0, 9)).toBe(1);
		expect(reelDistance(8, 0, 9)).toBe(-1);
		expect(reelDistance(4, 0, 9)).toBe(4);
		expect(reelDistance(5, 0, 9)).toBe(-4);
	});

	test('gives every entry of a short list its own place', () => {
		const places = [0, 1, 2, 3, 4].map((index) => reelDistance(index, 2, 5));
		expect(places).toEqual([-2, -1, 0, 1, 2]);
	});
});

describe('atlasLinks', () => {
	const handlers = {onGenres: () => {}, onFavorites: () => {}, onOpenSeerrShortcut: () => {}, onOpenRecordings: () => {}};
	const labels = (links) => links.map((link) => link.label);

	test('gives a movie library its own page first, then the screens that exist', () => {
		const entry = {key: 'library:m', library: movies, onClick: () => {}};
		expect(labels(atlasLinks('library', entry, handlers, [movies]))).toEqual(['Browse all', 'Genres', 'Favorites']);
		expect(labels(atlasLinks('library', entry, handlers, [movies, boxsets]))).toEqual(['Browse all', 'Collections', 'Genres', 'Favorites']);
	});

	test('keeps a music library to its own page', () => {
		expect(labels(atlasLinks('library', {key: 'x', library: music}, handlers))).toEqual(['Browse all']);
	});

	test('links Live TV and Discover to their screens', () => {
		expect(labels(atlasLinks('livetv', {key: 'livetv'}, handlers))).toEqual(['Guide', 'Recordings']);
		expect(labels(atlasLinks('discover', {key: 'discover'}, handlers))).toEqual(['Trending', 'Popular Movies', 'Popular Series', 'Requests']);
	});

	test('opens panels only for libraries, Live TV and Discover', () => {
		expect(atlasPanelKind({key: 'home'})).toBe(null);
		expect(atlasPanelKind({key: 'libraries', libraries: []})).toBe('libraries');
		expect(atlasPanelKind({key: 'x', library: {CollectionType: 'livetv'}})).toBe('livetv');
		expect(atlasPanelKind({key: 'x', library: movies})).toBe('library');
	});
});

describe('nav style sync', () => {
	test('syncs both styles under their own names as plain strings', () => {
		expect(localToProfile({topNavbarStyle: 'atlas', sidebarStyle: 'reel'}, ['topNavbarStyle', 'sidebarStyle']))
			.toEqual({topNavbarStyle: 'atlas', sidebarStyle: 'reel'});
		expect(profileToLocal({topNavbarStyle: 'tabline', sidebarStyle: 'mosaic'}))
			.toEqual({topNavbarStyle: 'tabline', sidebarStyle: 'mosaic'});
	});
});
