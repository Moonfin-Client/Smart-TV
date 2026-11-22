import {act, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import Search from './Search';

const mockApi = {getLibraries: jest.fn(), search: jest.fn(), searchPeople: jest.fn()};
const mockAuth = {api: mockApi, serverUrl: 'http://server', hasMultipleServers: false};
const mockSettings = {settings: {}};
const mockSeerrSearch = jest.fn();

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
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getCurrent: jest.fn()}));
jest.mock('@enact/spotlight/Pause', () => ({isPaused: () => false}));
const plain = (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
};
jest.mock('@enact/spotlight/Spottable', () => (type) => plain(type));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => plain(type));
jest.mock('../../context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: true, api: {search: mockSeerrSearch}, displayName: 'Seerr'})}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/gamesApi', () => ({}));
jest.mock('../../services/parentalControls', () => ({withoutBlockedItems: (items) => items}));
jest.mock('../../hooks/useStorage', () => () => [[], jest.fn()]);
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));
// The tab bar says which tab is active, and a pill press picks it.
jest.mock('../../components/DetailsTabBar', () => ({tabs, activeId, onSelect}) => {
	const React = require('react');
	return React.createElement('div', {'data-active': activeId}, tabs.map((tab) => (
		React.createElement('button', {key: tab.id, 'data-id': tab.id, onClick: () => onSelect(tab.id)}, tab.label)
	)));
});
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../components/ProxiedImage', () => () => null);
jest.mock('../../components/GameCard', () => () => null);
jest.mock('../../components/SpottableInput/SpottableInput', () => {
	const React = require('react');
	return React.forwardRef(({value, onChange}, ref) => React.createElement('input', {ref, value, onChange}));
});

const activeTab = () => document.querySelector('[data-active]').getAttribute('data-active');

// Holds Seerr's answer until the test lets it go, the way it lands after the library's.
const pendingSeerr = () => {
	let settle;
	mockSeerrSearch.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
	return (results) => act(async () => settle({results}));
};

const typeQuery = async (text) => {
	fireEvent.change(screen.getByRole('textbox'), {target: {value: text}});
	await act(async () => { jest.advanceTimersByTime(450); });
};

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	Spotlight.focus.mockImplementation(() => true);
	mockApi.getLibraries.mockResolvedValue([]);
	mockApi.search.mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'Alien'}]});
	mockApi.searchPeople.mockResolvedValue({Items: []});
});
afterEach(() => jest.useRealTimers());

test('opened from Discover, a search moves to Requests once they arrive, focus and all', async () => {
	const answer = pendingSeerr();
	render(<Search preferRequests />);
	await typeQuery('alien');
	expect(activeTab()).toBe('all');
	Spotlight.getCurrent.mockReturnValue(document.querySelector('[data-id="all"]'));
	await answer([{id: 1, mediaType: 'movie', title: 'Alien'}]);
	expect(activeTab()).toBe('seerr');
	await act(async () => { jest.advanceTimersByTime(10); });
	expect(Spotlight.focus).toHaveBeenLastCalledWith('[data-spotlight-id="search-tabs"] [data-id="seerr"]');
});

test('opened from Discover, a search with no requests stays on All', async () => {
	const answer = pendingSeerr();
	render(<Search preferRequests />);
	await typeQuery('alien');
	await answer([]);
	expect(activeTab()).toBe('all');
});

test('opened from Discover, a tab picked before the requests arrive is kept', async () => {
	const answer = pendingSeerr();
	render(<Search preferRequests />);
	await typeQuery('alien');
	fireEvent.click(document.querySelector('[data-id]:not([data-id="all"])'));
	const picked = activeTab();
	await answer([{id: 1, mediaType: 'movie', title: 'Alien'}]);
	expect(activeTab()).toBe(picked);
});

test('opened anywhere else, a search with requests stays on All', async () => {
	const answer = pendingSeerr();
	render(<Search />);
	await typeQuery('alien');
	await answer([{id: 1, mediaType: 'movie', title: 'Alien'}]);
	expect(activeTab()).toBe('all');
});
