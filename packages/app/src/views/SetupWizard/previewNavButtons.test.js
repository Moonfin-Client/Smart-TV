import {defaultSettings} from '../../context/defaultSettings';
import {previewNavButtons} from './previewNavButtons';

// The CLI ships a second copy of React, so the icons' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});

const ids = (options) => previewNavButtons({settings: defaultSettings, ...options}).map((button) => button.id);
const withSettings = (settings, options) => ids({...options, settings: {...defaultSettings, ...settings}});

const LIBRARIES = [
	{Id: 'm', Name: 'Movies', CollectionType: 'movies'},
	{Id: 't', Name: 'Shows', CollectionType: 'tvshows'},
	{Id: 'l', Name: 'Live TV', CollectionType: 'livetv'}
];

describe('preview navbar buttons', () => {
	test('the defaults match the real navbar', () => {
		expect(ids({serverType: 'jellyfin'})).toEqual(['home', 'search', 'shuffle', 'genres', 'favorites', 'syncplay', 'libraries', 'settings']);
	});

	test('each switch takes its button away', () => {
		expect(withSettings({showShuffleButton: false})).not.toContain('shuffle');
		expect(withSettings({showGenresButton: false})).not.toContain('genres');
		expect(withSettings({showFavoritesButton: false})).not.toContain('favorites');
		expect(withSettings({showLibrariesInToolbar: false})).not.toContain('libraries');
		expect(withSettings({showLiveTvButton: false}, {hasLiveTv: true})).not.toContain('livetv');
		expect(withSettings({showSeerrButton: false}, {seerrEnabled: true})).not.toContain('seerr');
		expect(withSettings({showSyncPlayButton: false}, {serverType: 'jellyfin'})).not.toContain('syncplay');
		expect(withSettings({syncplayEnabled: false}, {serverType: 'jellyfin'})).not.toContain('syncplay');
	});

	test('buttons that need the server or a plugin only show when it has them', () => {
		expect(ids({hasLiveTv: true, serverType: 'jellyfin', seerrEnabled: true, seerrLabel: 'Seerr'}))
			.toEqual(['home', 'search', 'shuffle', 'genres', 'favorites', 'livetv', 'syncplay', 'seerr', 'libraries', 'settings']);
		expect(ids({serverType: 'emby'})).toContain('syncplay');
		expect(ids({serverType: 'plex'})).not.toContain('syncplay');
		expect(withSettings({showServerMessagesButton: true})).not.toContain('messages');
		expect(withSettings({showServerMessagesButton: true}, {hasMessages: true})).toContain('messages');
		expect(withSettings({showFriendsButton: true})).not.toContain('friends');
		expect(withSettings({showFriendsButton: true}, {socialAvailable: true})).toContain('friends');
	});

	test('the sidebar puts Seerr ahead of SyncPlay', () => {
		const order = ids({rail: true, serverType: 'jellyfin', seerrEnabled: true});
		expect(order.indexOf('seerr')).toBeLessThan(order.indexOf('syncplay'));
	});

	test('the Seerr button wears the plugin\'s name', () => {
		const seerr = previewNavButtons({settings: defaultSettings, seerrEnabled: true, seerrLabel: 'Jellyseerr'}).find((b) => b.id === 'seerr');
		expect(seerr.label).toBe('Jellyseerr');
	});

	test('libraries shown one by one take their names, leaving Live TV to its own button', () => {
		const buttons = previewNavButtons({
			settings: {...defaultSettings, showLibrariesIndividually: true},
			hasLiveTv: true,
			libraries: LIBRARIES
		});
		expect(buttons.map((b) => b.label)).toEqual(expect.arrayContaining(['Movies', 'Shows']));
		expect(buttons.filter((b) => b.label === 'Live TV').map((b) => b.id)).toEqual(['livetv']);
		expect(buttons.map((b) => b.id)).not.toContain('libraries');
	});

	test('no libraries means no libraries button, and unknown ones keep one standing in', () => {
		expect(ids({libraries: []})).not.toContain('libraries');
		expect(withSettings({showLibrariesIndividually: true})).toContain('libraries');
	});

	test('Kids Mode keeps only what it allows', () => {
		expect(withSettings({kidsModeEnabled: true, showFriendsButton: true}, {hasLiveTv: true, serverType: 'jellyfin', seerrEnabled: true, socialAvailable: true}))
			.toEqual(['home', 'search', 'shuffle', 'genres', 'favorites', 'settings']);
	});
});
