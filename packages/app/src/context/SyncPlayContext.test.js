import {renderHook, act} from '@testing-library/react';

import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';
import {useAuth} from './AuthContext';
import {useSettings} from './SettingsContext';
import {SyncPlayProvider, useSyncPlay} from './SyncPlayContext';

// The provider is JSX, and the CLI ships a second copy of React whose automatic
// runtime disagrees with the one under test. Routing the runtime through the
// copy the test sees keeps the two from meeting.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {jsxDEV: (type, props, key) => React.createElement(type, key === undefined ? props : {...props, key})};
});
jest.mock('./AuthContext', () => ({useAuth: jest.fn()}));
jest.mock('./SettingsContext', () => ({useSettings: jest.fn()}));
jest.mock('../services/jellyfinApi', () => ({api: {getItem: jest.fn()}}));
jest.mock('../services/syncPlay', () => ({
	start: jest.fn(),
	stop: jest.fn(),
	addListener: jest.fn(),
	listGroups: jest.fn(),
	QUEUE_START_REASONS: ['NewPlaylist']
}));

let auth;
let hear;

const signedIn = (userId) => ({isAuthenticated: true, serverType: 'jellyfin', user: {Id: userId}});

describe('SyncPlayProvider', () => {
	beforeEach(() => {
		auth = signedIn('user1');
		useAuth.mockImplementation(() => auth);
		useSettings.mockImplementation(() => ({settings: {syncplayEnabled: true}}));
		syncPlayService.addListener.mockImplementation((listener) => {
			hear = listener;
			return () => {};
		});
		syncPlayService.listGroups.mockImplementation(() => Promise.resolve([]));
	});

	test('another account signing in is outside the last one\'s group', () => {
		const {result, rerender} = renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});
		act(() => hear('groupJoined', {GroupId: 'g1'}));
		expect(result.current.isInGroup).toBe(true);

		auth = signedIn('user2');
		rerender();
		expect(result.current.isInGroup).toBe(false);
	});

	test('a queue item still loading for the last account never lands', async () => {
		let deliver;
		api.getItem.mockImplementation(() => new Promise((resolve) => {
			deliver = resolve;
		}));
		const {result, rerender} = renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});
		act(() => hear('groupJoined', {GroupId: 'g1'}));
		act(() => hear('playQueue', {Playlist: [{ItemId: 'movie1'}], PlayingItemIndex: 0, Reason: 'NewPlaylist'}));

		auth = signedIn('user2');
		rerender();
		await act(async () => deliver({Id: 'movie1'}));
		expect(result.current.playQueueItem).toBeNull();
	});
});
