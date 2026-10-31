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
const mockQueueRequests = {nextItem: jest.fn(), previousItem: jest.fn(), setPlaylistItem: jest.fn(), setNewQueue: jest.fn()};
jest.mock('../services/syncPlay', () => ({
	itemIdKey: jest.requireActual('../services/syncPlay').itemIdKey,
	start: () => {},
	stop: () => {},
	addListener: (listener) => {
		mockEmit = listener;
		return () => {};
	},
	nextItem: (...args) => mockQueueRequests.nextItem(...args),
	previousItem: (...args) => mockQueueRequests.previousItem(...args),
	setPlaylistItem: (...args) => mockQueueRequests.setPlaylistItem(...args),
	setNewQueue: (...args) => mockQueueRequests.setNewQueue(...args)
}));
jest.mock('./AuthContext', () => ({useAuth: () => ({isAuthenticated: true, serverType: 'jellyfin'})}));
jest.mock('./SettingsContext', () => ({useSettings: () => ({settings: {}})}));
jest.mock('../services/jellyfinApi', () => ({api: {getItem: () => new Promise(() => {})}}));

const renderSyncPlay = () => renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});

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

	test('leaves the group be when it already plays the item', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000002');
		Object.values(mockQueueRequests).forEach((fn) => expect(fn).not.toHaveBeenCalled());
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

	test.each([0, 2, 3])('resumes entry %i at its saved position while keeping the group queue', (targetIndex) => {
		const playlist = queue(1).Playlist;
		inGroupAt(1).current.moveGroupTo(playlist[targetIndex].ItemId, 420000000);
		expect(mockQueueRequests.setNewQueue).toHaveBeenCalledWith(playlist.map(e => e.ItemId), targetIndex, 420000000);
		expect(mockQueueRequests.nextItem).not.toHaveBeenCalled();
		expect(mockQueueRequests.previousItem).not.toHaveBeenCalled();
		expect(mockQueueRequests.setPlaylistItem).not.toHaveBeenCalled();
	});

	test('resumes an episode outside the queue at its saved position', () => {
		inGroupAt(3).current.moveGroupTo('bbbbbbbb000000000000000000000009', 420000000);
		expect(mockQueueRequests.setNewQueue).toHaveBeenCalledWith(['bbbbbbbb000000000000000000000009'], 0, 420000000);
	});

	test('keeps the next-item request when there is no saved position', () => {
		inGroupAt(1).current.moveGroupTo('aaaaaaaa000000000000000000000003', 0);
		expect(mockQueueRequests.nextItem).toHaveBeenCalledTimes(1);
		expect(mockQueueRequests.setNewQueue).not.toHaveBeenCalled();
	});
});
