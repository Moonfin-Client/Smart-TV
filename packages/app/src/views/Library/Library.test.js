import {act, fireEvent, render, screen} from '@testing-library/react';

import {getFromStorage, saveToStorage} from '../../services/storage';
import Library from './Library';

const mockApi = {getItems: jest.fn(), getQueryFilters: jest.fn(), getLibraries: jest.fn()};
const mockAuth = {api: mockApi, serverUrl: 'http://server', serverType: 'jellyfin'};
const mockSettings = {settings: {libraryStyle: 'classic'}, updateSetting: jest.fn()};

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
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => false}));
// Spotlight's own prop would be an unknown attribute on the plain elements these mocks render.
const plain = (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
};
jest.mock('@enact/spotlight/Spottable', () => (type) => plain(type));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => plain(type));
jest.mock('@enact/sandstone/VirtualList', () => ({VirtualGridList: () => null}));
jest.mock('../../context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../services/jellyfinApi', () => ({createApiForServer: () => null}));
jest.mock('../../services/mdblistApi', () => ({isMdblistEnabled: () => false}));
jest.mock('../../services/parentalControls', () => ({withoutBlockedItems: (items) => items}));
jest.mock('../../services/storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));
jest.mock('../../hooks/useUserDataSync', () => ({useUserDataList: (items) => items}));
jest.mock('../../hooks/useItemMenuHold', () => ({__esModule: true, default: () => ({}), cardIndexOf: () => 0}));
jest.mock('../../utils/helpers', () => ({getImageUrl: () => null, getPrimaryImageId: () => null, formatDuration: () => '0m'}));
jest.mock('../MusicBrowse', () => () => null);
jest.mock('../BookBrowse', () => () => null);
jest.mock('../../components/BackdropLayer', () => () => null);
jest.mock('../../components/TileGrid', () => () => null);
jest.mock('../../components/MediaRow', () => () => null);
jest.mock('../../components/DetailsTabBar', () => () => null);
jest.mock('../../components/RatingsRow', () => () => null);
jest.mock('./LibrarySkeleton', () => () => null);
jest.mock('../../components/SpottableInput/SpottableInput', () => {
	const React = require('react');
	return React.forwardRef(({value, onChange, placeholder}, ref) => React.createElement('input', {ref, value, onChange, placeholder}));
});

const movies = {Id: 'lib1', Name: 'Movies', CollectionType: 'movies'};
const stored = {};

// Storage answers a beat later, the way the TV's storage does, so the first render runs on defaults.
// A few turns let the reads, the first page and the facet read all land.
const settle = async () => {
	for (let i = 0; i < 4; i++) {
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
	}
};

beforeEach(() => {
	jest.clearAllMocks();
	Object.keys(stored).forEach((key) => delete stored[key]);
	getFromStorage.mockImplementation((key) => new Promise((resolve) => setTimeout(() => resolve(key in stored ? stored[key] : null), 0)));
	mockApi.getItems.mockResolvedValue({Items: [{Id: 'm1', Name: 'Alien', Type: 'Movie'}], TotalRecordCount: 1});
	mockApi.getQueryFilters.mockResolvedValue(null);
});

const renderLibrary = () => render(<Library library={movies} backHandlerRef={{current: null}} onHome={jest.fn()} />);

test('waits for what this device saved before the first fetch, and fetches with it', async () => {
	stored.library_filters_lib1 = {favoritesOnly: true, tagFilters: ['4K']};
	renderLibrary();
	expect(mockApi.getItems).not.toHaveBeenCalled();

	await settle();

	expect(mockApi.getItems).toHaveBeenCalledTimes(1);
	expect(mockApi.getItems.mock.calls[0][0]).toMatchObject({Filters: 'IsFavorite', Tags: '4K', SortBy: 'SortName', SortOrder: 'Ascending'});
});

test('a filter picked in Sort & Filter is saved for the library and the panel stays open', async () => {
	renderLibrary();
	await settle();

	fireEvent.click(document.querySelector('[data-spotlight-id="library-sort-btn"]'));
	fireEvent.click(document.querySelector('[data-spotlight-id="filter-section-favorites"]'));
	fireEvent.click(document.querySelector('[data-spotlight-id="filter-favorites"]'));
	await settle();

	expect(saveToStorage).toHaveBeenCalledWith('library_filters_lib1', expect.objectContaining({favoritesOnly: true}));
	expect(screen.getByText('Sort & Filter')).toBeTruthy();
});

test('another sort keeps the direction already picked', async () => {
	stored.library_sortOrder_lib1 = 'Descending';
	renderLibrary();
	await settle();

	fireEvent.click(document.querySelector('[data-spotlight-id="library-sort-btn"]'));
	// Every section starts closed, so the sorts are hidden until Sort By is opened.
	expect(screen.queryByText('Date Added')).toBeNull();
	fireEvent.click(document.querySelector('[data-spotlight-id="filter-section-sort"]'));
	expect(screen.queryByText('Parental Rating')).toBeNull();
	fireEvent.click(screen.getByText('Date Added'));
	await settle();

	expect(saveToStorage).toHaveBeenCalledWith('library_sortKey_lib1', 'DateCreated');
	expect(saveToStorage).toHaveBeenCalledWith('library_sortOrder_lib1', 'Descending');
	expect(saveToStorage).not.toHaveBeenCalledWith('library_sortOrder_lib1', 'Ascending');
});

test('the count reads in lowercase and the Classic toolbar carries Group By for movies', async () => {
	renderLibrary();
	await settle();

	expect(screen.getByText('1 items')).toBeTruthy();
	expect(document.querySelector('[data-spotlight-id="library-group-btn"]')).toBeTruthy();
	expect(document.querySelector('[data-spotlight-id="library-shuffle-btn"]')).toBeNull();
});

test('a library with no type opens in folder view with its folders first, until it is switched off', async () => {
	const mixed = {Id: 'mix1', Name: 'Everything'};
	const {unmount} = render(<Library library={mixed} backHandlerRef={{current: null}} onHome={jest.fn()} />);
	await settle();

	const folderQueries = mockApi.getItems.mock.calls.filter(([params]) => params.IncludeItemTypes === 'Folder,CollectionFolder,UserView,PhotoAlbum');
	expect(folderQueries).toHaveLength(1);
	unmount();

	mockApi.getItems.mockClear();
	stored.library_folderView_mix1 = 'off';
	render(<Library library={mixed} backHandlerRef={{current: null}} onHome={jest.fn()} />);
	await settle();

	expect(mockApi.getItems).toHaveBeenCalledTimes(1);
	expect(mockApi.getItems.mock.calls[0][0]).toMatchObject({Recursive: true, ExcludeItemTypes: 'Folder,CollectionFolder,UserView,PhotoAlbum'});
});
