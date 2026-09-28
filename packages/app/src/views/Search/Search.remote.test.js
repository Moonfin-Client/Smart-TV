import {act, fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import Search from './Search';
import {createRemoteSearch} from '../../services/remoteSearch';

const mockApi = {getLibraries: jest.fn(), search: jest.fn()};
const mockAuth = {api: mockApi, serverUrl: 'http://server', hasMultipleServers: false};
const mockSettings = {settings: {}};
const mockSave = jest.fn();

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
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);
jest.mock('../../context/AuthContext', () => ({useAuth: () => mockAuth}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: false})}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/gamesApi', () => ({}));
jest.mock('../../services/parentalControls', () => ({withoutBlockedItems: (items) => items}));
jest.mock('../../hooks/useStorage', () => () => [[], mockSave]);
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));
jest.mock('../../components/DetailsTabBar', () => () => null);
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../components/ProxiedImage', () => () => null);
jest.mock('../../components/GameCard', () => () => null);
jest.mock('../../components/SpottableInput/SpottableInput', () => {
	const React = require('react');
	return ({value, onChange, onKeyDown}) => React.createElement('input', {value, onChange, onKeyDown});
});

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	mockApi.getLibraries.mockResolvedValue([]);
	mockApi.search.mockResolvedValue({Items: []});
});
afterEach(() => jest.useRealTimers());

test('mounts with pending text and updates the real search path without stealing focus', async () => {
	const search = createRemoteSearch('phone');
	search.receive({String: 'alien'});
	const view = render(<Search remoteSearch={search} />);
	expect(screen.getByRole('textbox').value).toBe('alien');
	await act(async () => { jest.advanceTimersByTime(450); });
	expect(mockApi.search).toHaveBeenCalledWith('alien', expect.any(Number));
	await act(async () => { jest.advanceTimersByTime(60); });
	expect(Spotlight.focus.mock.calls.every(([target]) => target === 'search-input')).toBe(true);
	view.unmount();
	expect(search.active).toBe(false);
});

test('preserves remote Unicode without the local keyboard encoding workaround', async () => {
	const search = createRemoteSearch('phone');
	search.receive({String: 'Ã© 日本語 🦞'});
	render(<Search remoteSearch={search} />);
	await act(async () => { jest.advanceTimersByTime(450); });
	expect(mockApi.search).toHaveBeenCalledWith('Ã© 日本語 🦞', expect.any(Number));
});

test('opening the receiver keyboard does not end phone typing', async () => {
	const search = createRemoteSearch('phone');
	render(<Search remoteSearch={search} />);
	const input = screen.getByRole('textbox');
	fireEvent.keyDown(input, {keyCode: 13});
	fireEvent.click(input);
	expect(search.active).toBe(true);
	act(() => search.receive({String: 'alien', MoonfinInputId: 'phone', MoonfinRevision: '1'}));
	expect(input.value).toBe('alien');
	await act(async () => { jest.advanceTimersByTime(450); });
	expect(mockApi.search).toHaveBeenCalledWith('alien', expect.any(Number));
});

test('clear discards results from a request that completes after the clear', async () => {
	let finish;
	mockApi.search.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
	const search = createRemoteSearch('phone');
	search.receive({String: 'alien'});
	render(<Search remoteSearch={search} />);
	await act(async () => { jest.advanceTimersByTime(450); });
	act(() => search.receive({String: ''}));
	await act(async () => { jest.advanceTimersByTime(450); });
	await act(async () => { finish({Items: [{Id: 'old', Type: 'Movie', Name: 'Old movie'}]}); });
	expect(screen.getByRole('textbox').value).toBe('');
	expect(screen.getByText('Search for content')).toBeTruthy();
	expect(screen.queryByText('Old movie')).toBeNull();
});

test('local input takes over and a new remote search can start on the same screen', async () => {
	const first = createRemoteSearch('first');
	const view = render(<Search remoteSearch={first} />);
	fireEvent.change(screen.getByRole('textbox'), {target: {value: 'local'}});
	act(() => first.receive({String: 'late remote'}));
	expect(screen.getByRole('textbox').value).toBe('local');
	const second = createRemoteSearch('second');
	second.receive({String: 'next'});
	view.rerender(<Search remoteSearch={second} />);
	expect(screen.getByRole('textbox').value).toBe('next');
	await act(async () => { jest.advanceTimersByTime(450); });
	expect(mockApi.search).toHaveBeenLastCalledWith('next', expect.any(Number));
});
