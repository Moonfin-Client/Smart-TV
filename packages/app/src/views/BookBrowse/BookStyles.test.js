import {act, render, waitFor} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../context/defaultSettings';
import BookBrowse from './index';

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
	return React.forwardRef(({spotlightId, onSpotlightRight, onSpotlightLeft, onSpotlightUp, onSpotlightDown, ...props}, ref) => ( // eslint-disable-line no-unused-vars
		React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId})
	));
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return React.forwardRef(({spotlightId, ...props}, ref) => React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId}));
});
let mockSettings = {};
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings, updateSetting: jest.fn()})}));
jest.mock('../../services/storage', () => ({getFromStorage: () => Promise.resolve(null), saveToStorage: () => Promise.resolve()}));
jest.mock('../../components/MediaCard', () => () => null);
jest.mock('../../hooks/useItemMenuHold', () => ({__esModule: true, default: () => ({}), cardIndexOf: () => 0, itemWithIdAt: () => () => null}));
jest.mock('../../components/DetailsTabBar', () => {
	const React = require('react');
	return ({spotlightId}) => React.createElement('div', {'data-spotlight-id': spotlightId});
});

const book = {Id: 'b1', Name: 'Dune', Type: 'Book', UserData: {PlaybackPositionTicks: 10, PlayedPercentage: 20}};
const mockApi = {getItems: jest.fn(), getArtists: jest.fn(), getMusicGenres: jest.fn(), getItem: jest.fn()};
const books = {Id: 'bk', Name: 'Books', CollectionType: 'books'};

// The ids the screens register for themselves, which the preview keeps clear of.
const OWN_IDS = ['book-rail', 'book-chips', 'book-strip', 'book-continue', 'book-screen-header-titles', 'book-row-0', 'rr-recent', 'rr-series'];
const ownIds = () => OWN_IDS.filter((id) => document.querySelector(`[data-spotlight-id="${id}"]`));

// A screen's first focus waits a few frames after its content comes in, so this waits well past that.
const pastFirstFocus = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

beforeEach(() => {
	jest.clearAllMocks();
	mockApi.getItems.mockResolvedValue({Items: [book], TotalRecordCount: 1});
	mockApi.getArtists.mockResolvedValue({Items: []});
	mockApi.getMusicGenres.mockResolvedValue({Items: []});
	mockApi.getItem.mockResolvedValue(book);
	Spotlight.focus.mockReturnValue(true);
});

describe.each(['bookstore', 'classic', 'readingRoom'])('the %s book library', (style) => {
	beforeEach(() => {
		mockSettings = {...defaultSettings, bookLibraryStyle: style};
	});

	test('takes focus and keeps its own ids on its own screen', async () => {
		render(<BookBrowse library={books} api={mockApi} serverUrl="http://server" screen={null} onOpenScreen={jest.fn()} />);

		await waitFor(() => expect(Spotlight.focus).toHaveBeenCalled());
		expect(ownIds().length).toBeGreaterThan(0);
	});

	test('in the settings preview takes no focus and leaves the screen\'s ids alone', async () => {
		const {container} = render(<BookBrowse library={books} api={mockApi} serverUrl="http://server" screen={null} onOpenScreen={jest.fn()} settingsPreview />);
		await waitFor(() => expect(container.textContent).toContain('Dune'));
		await pastFirstFocus();

		expect(ownIds()).toEqual([]);
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});
});
