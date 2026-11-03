import {act, fireEvent, render, screen} from '@testing-library/react';
import Search from './Search';

const mockApi = {getLibraries: jest.fn(), search: jest.fn(), searchPeople: jest.fn(), smartSearch: jest.fn()};
const mockAuth = {api: mockApi, serverUrl: 'http://server', hasMultipleServers: false};
const mockSettings = {settings: {useMoonfinPlugin: true}};
const mockSeerr = {
	isEnabled: true,
	displayName: 'Seerr',
	pluginInfo: {smartSearchEnabled: true},
	api: {search: jest.fn(), getImageUrl: () => null}
};

jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {jsxDEV: (type, props, key, staticChildren) => {
		const config = key === undefined ? props : {...props, key};
		return staticChildren && Array.isArray(props.children)
			? React.createElement(type, config, ...props.children)
			: React.createElement(type, config);
	}};
});
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
jest.mock('@enact/spotlight/Pause', () => ({isPaused: () => false}));
const plain = (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
};
jest.mock('@enact/spotlight/Spottable', () => (type) => plain(type));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => plain(type));
jest.mock('../../context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => mockSeerr}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/gamesApi', () => ({}));
jest.mock('../../services/parentalControls', () => ({withoutBlockedItems: (items) => items}));
jest.mock('../../hooks/useStorage', () => () => [[], jest.fn()]);
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));
jest.mock('../../components/DetailsTabBar', () => () => null);
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../components/ProxiedImage', () => () => null);
jest.mock('../../components/GameCard', () => () => null);
jest.mock('../../components/SpottableInput/SpottableInput', () => {
	const React = require('react');
	return React.forwardRef(({value, onChange}, ref) => React.createElement('input', {ref, value, onChange}));
});

const smartAnswer = {
	Ready: true,
	Items: [{Id: 'm1', Type: 'Movie', Name: 'The Mask'}],
	Seerr: [{id: 8844, mediaType: 'movie', title: 'Jumanji'}]
};

const typeQuery = async (text) => {
	fireEvent.change(screen.getByRole('textbox'), {target: {value: text}});
	await act(async () => { jest.advanceTimersByTime(700); });
};

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	mockApi.getLibraries.mockResolvedValue([]);
	mockApi.search.mockResolvedValue({Items: []});
	mockApi.searchPeople.mockResolvedValue({Items: []});
	mockApi.smartSearch.mockResolvedValue(smartAnswer);
	mockSeerr.api.search.mockResolvedValue({results: []});
});
afterEach(() => jest.useRealTimers());

test('a query of two words or more adds the smart rows', async () => {
	render(<Search />);
	await typeQuery('mask');
	expect(mockApi.smartSearch).not.toHaveBeenCalled();
	await typeQuery('jim carey mask');
	expect(mockApi.smartSearch).toHaveBeenCalledWith('jim carey mask', 20);
	expect(screen.getByText('Smart Search')).toBeTruthy();
	expect(screen.getByText('The Mask')).toBeTruthy();
	expect(screen.getByText('Smart Search on Seerr')).toBeTruthy();
	expect(screen.getByText('Jumanji')).toBeTruthy();
});

test('an index that is still building adds nothing', async () => {
	mockApi.smartSearch.mockResolvedValue({Ready: false, Items: [], Seerr: []});
	render(<Search />);
	await typeQuery('jim carey mask');
	expect(screen.queryByText('Smart Search')).toBeNull();
	expect(screen.getByText('No results found')).toBeTruthy();
});

test('an answer for an older query is dropped', async () => {
	let settleOld;
	mockApi.smartSearch.mockImplementationOnce(() => new Promise((resolve) => { settleOld = resolve; }));
	render(<Search />);
	await typeQuery('jim carey');
	mockApi.smartSearch.mockResolvedValueOnce({Ready: true, Items: [{Id: 'm2', Type: 'Movie', Name: 'Liar Liar'}], Seerr: []});
	await typeQuery('jim carey lawyer');
	await act(async () => { settleOld(smartAnswer); });
	expect(screen.getByText('Liar Liar')).toBeTruthy();
	expect(screen.queryByText('The Mask')).toBeNull();
});
