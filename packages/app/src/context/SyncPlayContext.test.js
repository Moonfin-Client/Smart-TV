import {renderHook, act} from '@testing-library/react';

import * as syncPlayService from '../services/syncPlay';
import {api} from '../services/jellyfinApi';
import {useAuth} from './AuthContext';
import {useSettings} from './SettingsContext';
import {SyncPlayProvider, followsQueueUpdate, useSyncPlay} from './SyncPlayContext';

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
	itemIdKey: jest.requireActual('../services/syncPlay').itemIdKey,
	start: jest.fn(),
	stop: jest.fn(),
	addListener: jest.fn(),
	listGroups: jest.fn(),
	nextItem: jest.fn(),
	previousItem: jest.fn(),
	setPlaylistItem: jest.fn(),
	setNewQueue: jest.fn(),
	QUEUE_START_REASONS: ['NewPlaylist']
}));

let auth;
let hear;

const signedIn = (userId) => ({isAuthenticated: true, serverType: 'jellyfin', user: {Id: userId}});

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

describe('SyncPlayProvider', () => {
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

describe('followsQueueUpdate', () => {
	const update = (startsPlayback) => ({item: {Id: 'aaaaaaaa-0000-0000-0000-000000000001'}, startsPlayback});

	test('plays a new item whatever this device is doing', () => {
		expect(followsQueueUpdate(update(true), null)).toBe(true);
		expect(followsQueueUpdate(update(true), 'aaaaaaaa000000000000000000000001')).toBe(true);
	});

	test('a reorder or a removal leaves this device alone when nothing is playing', () => {
		expect(followsQueueUpdate(update(false), null)).toBe(false);
		expect(followsQueueUpdate(update(false), undefined)).toBe(false);
	});

	test('nor when the player already shows that item, however its id is spelled', () => {
		expect(followsQueueUpdate(update(false), 'AAAAAAAA000000000000000000000001')).toBe(false);
	});

	test('but moves a player that shows something else', () => {
		expect(followsQueueUpdate(update(false), 'bbbbbbbb000000000000000000000002')).toBe(true);
	});
});

describe('moveGroupTo', () => {
	const {nextItem, previousItem, setPlaylistItem, setNewQueue} = syncPlayService;
	const queueRequests = [nextItem, previousItem, setPlaylistItem, setNewQueue];
	const entry = (n) => ({PlaylistItemId: `p${n}`, ItemId: `aaaaaaaa00000000000000000000000${n}`});
	const queue = (playing) => ({PlayingItemIndex: playing, Playlist: [entry(1), entry(2), entry(3), entry(4)]});
	const inGroupAt = (playing) => {
		const {result} = renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});
		act(() => hear('playQueue', queue(playing)));
		return result;
	};

	beforeEach(() => {
		queueRequests.forEach((fn) => fn.mockClear());
		api.getItem.mockImplementation(() => new Promise(() => {}));
	});

	test('asks the group for its next or previous entry, however the id is spelled', () => {
		const result = inGroupAt(1);
		result.current.moveGroupTo('aaaaaaaa-0000-0000-0000-000000000003');
		expect(nextItem).toHaveBeenCalledTimes(1);
		result.current.moveGroupTo('aaaaaaaa000000000000000000000001');
		expect(previousItem).toHaveBeenCalledTimes(1);
	});

	test('leaves the group be when it already plays the item', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000002');
		queueRequests.forEach((fn) => expect(fn).not.toHaveBeenCalled());
	});

	test('jumps to an entry further along', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000004');
		expect(setPlaylistItem).toHaveBeenCalledWith('p4');
	});

	test('starts a new queue for anything not in it, even from the last entry', () => {
		inGroupAt(3).current.moveGroupTo('bbbbbbbb000000000000000000000009');
		expect(setNewQueue).toHaveBeenCalledWith(['bbbbbbbb000000000000000000000009']);
		expect(nextItem).not.toHaveBeenCalled();
	});

	test.each([0, 2, 3])('resumes entry %i at its saved position while keeping the group queue', (targetIndex) => {
		const playlist = queue(1).Playlist;
		inGroupAt(1).current.moveGroupTo(playlist[targetIndex].ItemId, 420000000);
		expect(setNewQueue).toHaveBeenCalledWith(playlist.map(e => e.ItemId), targetIndex, 420000000);
		expect(nextItem).not.toHaveBeenCalled();
		expect(previousItem).not.toHaveBeenCalled();
		expect(setPlaylistItem).not.toHaveBeenCalled();
	});

	test('resumes an episode outside the queue at its saved position', () => {
		inGroupAt(3).current.moveGroupTo('bbbbbbbb000000000000000000000009', 420000000);
		expect(setNewQueue).toHaveBeenCalledWith(['bbbbbbbb000000000000000000000009'], 0, 420000000);
	});

	test('keeps the next-item request when there is no saved position', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000003', 0);
		expect(nextItem).toHaveBeenCalledTimes(1);
		expect(setNewQueue).not.toHaveBeenCalled();
	});
});
