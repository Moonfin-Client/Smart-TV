import {act, renderHook} from '@testing-library/react';

import {SyncPlayProvider, followsQueueUpdate, useSyncPlay} from './SyncPlayContext';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key) => {
			const config = key === undefined ? props : {...props, key};
			return children === undefined ? React.createElement(type, config) : React.createElement(type, config, children);
		}
	};
});

let mockEmit;
const mockSetIgnoreWait = jest.fn();
const mockQueueRequests = {nextItem: jest.fn(), previousItem: jest.fn(), setPlaylistItem: jest.fn(), setNewQueue: jest.fn()};
jest.mock('../services/syncPlay', () => ({
	start: () => {},
	stop: () => {},
	addListener: (listener) => {
		mockEmit = listener;
		return () => {};
	},
	setIgnoreWait: (...args) => mockSetIgnoreWait(...args),
	nextItem: (...args) => mockQueueRequests.nextItem(...args),
	previousItem: (...args) => mockQueueRequests.previousItem(...args),
	setPlaylistItem: (...args) => mockQueueRequests.setPlaylistItem(...args),
	setNewQueue: (...args) => mockQueueRequests.setNewQueue(...args)
}));
jest.mock('./AuthContext', () => ({useAuth: () => ({isAuthenticated: true, serverType: 'jellyfin'})}));
jest.mock('./SettingsContext', () => ({useSettings: () => ({settings: {}})}));
jest.mock('../services/jellyfinApi', () => ({api: {getItem: () => new Promise(() => {})}}));

const renderSyncPlay = () => renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});

beforeEach(() => {
	mockSetIgnoreWait.mockReset();
});

describe('Ignore wait', () => {
	test('turns on and off, and goes back when the server refuses it', async () => {
		const {result} = renderSyncPlay();
		mockSetIgnoreWait.mockResolvedValue(true);
		await act(() => result.current.toggleIgnoreWait());
		expect(mockSetIgnoreWait).toHaveBeenLastCalledWith(true);
		expect(result.current.ignoreWait).toBe(true);

		mockSetIgnoreWait.mockResolvedValue(false);
		await act(() => result.current.toggleIgnoreWait());
		expect(mockSetIgnoreWait).toHaveBeenLastCalledWith(false);
		expect(result.current.ignoreWait).toBe(true);
	});

	test('starts off again in the next group', async () => {
		const {result} = renderSyncPlay();
		mockSetIgnoreWait.mockResolvedValue(true);
		await act(() => result.current.toggleIgnoreWait());
		expect(result.current.ignoreWait).toBe(true);

		act(() => mockEmit('groupLeft'));
		expect(result.current.ignoreWait).toBe(false);

		await act(() => result.current.toggleIgnoreWait());
		act(() => mockEmit('groupJoined', {GroupId: 'g2'}));
		expect(result.current.ignoreWait).toBe(false);
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
	const entry = (n) => ({PlaylistItemId: `p${n}`, ItemId: `aaaaaaaa00000000000000000000000${n}`});
	const queue = (playing) => ({PlayingItemIndex: playing, Playlist: [entry(1), entry(2), entry(3), entry(4)]});
	const inGroupAt = (playing) => {
		const {result} = renderSyncPlay();
		act(() => mockEmit('playQueue', queue(playing)));
		return result;
	};

	beforeEach(() => Object.values(mockQueueRequests).forEach((fn) => fn.mockReset()));

	test('asks the group for its next or previous entry, however the id is spelled', () => {
		const result = inGroupAt(1);
		result.current.moveGroupTo('aaaaaaaa-0000-0000-0000-000000000003');
		expect(mockQueueRequests.nextItem).toHaveBeenCalledTimes(1);
		result.current.moveGroupTo('aaaaaaaa000000000000000000000001');
		expect(mockQueueRequests.previousItem).toHaveBeenCalledTimes(1);
	});

	test('jumps to an entry further along', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000004');
		expect(mockQueueRequests.setPlaylistItem).toHaveBeenCalledWith('p4');
	});

	test('starts a new queue for anything not in it, even from the last entry', () => {
		inGroupAt(3).current.moveGroupTo('bbbbbbbb000000000000000000000009');
		expect(mockQueueRequests.setNewQueue).toHaveBeenCalledWith(['bbbbbbbb000000000000000000000009']);
		expect(mockQueueRequests.nextItem).not.toHaveBeenCalled();
	});
});
