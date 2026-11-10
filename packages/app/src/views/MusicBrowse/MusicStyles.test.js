import {act, render, waitFor} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../context/defaultSettings';
import MusicLibrary from './index';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {Fragment: React.Fragment, jsxDEV: (type, props, key, staticChildren) => {
		const config = key === undefined ? props : {...props, key};
		return staticChildren && Array.isArray(props.children)
			? React.createElement(type, config, ...props.children)
			: React.createElement(type, config);
	}};
});
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
// Spotlight's own props would be unknown attributes on the plain elements these mocks render.
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return React.forwardRef(({spotlightId, onSpotlightRight, onSpotlightLeft, ...props}, ref) => ( // eslint-disable-line no-unused-vars
		React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId})
	));
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return React.forwardRef(({spotlightId, ...props}, ref) => React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId}));
});
let mockSettings = {};
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings, updateSetting: jest.fn()})}));
jest.mock('../../components/MediaCard', () => () => null);
// A row without an id of its own takes row-N, the way the real one does.
jest.mock('../../components/MediaRow', () => {
	const React = require('react');
	return ({spotlightId, rowIndex}) => React.createElement('div', {'data-spotlight-id': spotlightId || `row-${rowIndex}`});
});
jest.mock('../../components/DetailsTabBar', () => {
	const React = require('react');
	return ({spotlightId}) => React.createElement('div', {'data-spotlight-id': spotlightId});
});

const album = {Id: 'a1', Name: 'Blue Train', Type: 'MusicAlbum', AlbumArtist: 'John Coltrane'};
const mockApi = {getItems: jest.fn(), getAlbumArtists: jest.fn(), getArtists: jest.fn(), getItem: jest.fn(), getAlbumTracks: jest.fn(), getMusicGenres: jest.fn()};
const music = {Id: 'mu', Name: 'Music', CollectionType: 'music'};

// The ids the screens register for themselves, which the preview mustn't take from a screen under it.
const OWN_IDS = ['music-header', 'music-chips', 'music-rail', 'music-tabs', 'row-0'];
const ownIds = () => OWN_IDS.filter((id) => document.querySelector(`[data-spotlight-id="${id}"]`));

// A screen's first focus waits a few frames after its rows come in, so this waits well past that.
const pastFirstFocus = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

beforeEach(() => {
	jest.clearAllMocks();
	mockApi.getItems.mockResolvedValue({Items: [album], TotalRecordCount: 1});
	mockApi.getAlbumArtists.mockResolvedValue({Items: []});
	mockApi.getArtists.mockResolvedValue({Items: []});
	mockApi.getItem.mockResolvedValue(album);
	mockApi.getAlbumTracks.mockResolvedValue({Items: []});
	mockApi.getMusicGenres.mockResolvedValue({Items: []});
	Spotlight.focus.mockReturnValue(true);
});

describe.each(['classic', 'quickAccess', 'immersive'])('the %s music library', (style) => {
	beforeEach(() => {
		mockSettings = {...defaultSettings, musicLibraryStyle: style};
	});

	test('takes focus and keeps its own ids on its own screen', async () => {
		render(<MusicLibrary library={music} api={mockApi} serverUrl="http://server" onOpenGrid={jest.fn()} />);

		await waitFor(() => expect(Spotlight.focus).toHaveBeenCalled());
		expect(ownIds()).toContain('row-0');
	});

	test('in the settings preview takes no focus and leaves the screen\'s ids alone', async () => {
		render(<MusicLibrary library={music} api={mockApi} serverUrl="http://server" onOpenGrid={jest.fn()} settingsPreview />);
		await waitFor(() => expect(document.querySelector('[data-spotlight-id="music-preview-row-0"]')).not.toBeNull());
		await pastFirstFocus();

		expect(ownIds()).toEqual([]);
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});
});
