import {getServerUrl, getAuthHeader} from './jellyfinApi';
import * as serverSocket from './serverSocket';
import {expectedPositionTicks} from '../utils/syncDrift';
import {syncLog} from '../utils/syncLog';

let syncReference = null;
let currentGroup = null;
let serverTimeOffset = 0;
let lastPing = 500;
let pingInterval = null;
let listeners = [];
let socketListeners = [];
let currentPlaylistItemId = null;
// A Buffering report went out, so the server is holding the group for this
// set and is owed a Ready. Outside that, and outside the Waiting state, it is
// not: the server answers an unsolicited Ready with an Unpause echo of the
// last sync point, and a set that acts on that echo seeks, stalls, comes back
// playing, reports Ready again, and goes round for as long as it plays.
let bufferingReported = false;
let timeSyncMeasurements = [];
let timeSyncInterval = null;
let timeSyncBurstActive = false;

const MAX_TIME_SYNC_MEASUREMENTS = 8;
const TIME_SYNC_INTERVAL_MS = 30000;
const TIME_SYNC_BURST_COUNT = 5;
const TIME_SYNC_BURST_SPACING_MS = 1000;
// A measurement slower than this says more about the network at that moment
// than about the clock, so it is thrown away rather than averaged in.
const MAX_TIME_SYNC_RTT_MS = 5000;
// How far a late command is allowed to skip ahead to catch up.
const MAX_LATE_CATCH_UP_MS = 15000;
const HANDSHAKE_RETRY_DELAY_MS = 1200;
const MAX_HANDSHAKE_ATTEMPTS = 3;

// Buffering fired this soon after executing a SyncPlay command is the seek
// itself, not a stall. Reporting it would bounce the whole group into Waiting
// because the server has no rate limit on buffering reports.
export const BUFFERING_SUPPRESS_MS = 5000;

// Play queue update reasons that mean the group moved on to something, as
// opposed to a reorder or a repeat/shuffle change.
export const QUEUE_START_REASONS = ['NewPlaylist', 'SetCurrentItem', 'NextItem', 'PreviousItem'];

const emit = (event, data) => {
	for (const listener of listeners) {
		try {
			listener(event, data);
		} catch {
			// ignore
		}
	}
};

export const addListener = (fn) => {
	listeners.push(fn);
	return () => {
		listeners = listeners.filter(l => l !== fn);
	};
};

const request = async (method, path, body) => {
	const serverUrl = getServerUrl();
	if (!serverUrl) throw new Error('No server URL');

	const url = `${serverUrl}/SyncPlay/${path}`;
	const opts = {
		method,
		headers: {
			'Authorization': getAuthHeader(),
			'Content-Type': 'application/json'
		}
	};
	if (body !== undefined) {
		opts.body = JSON.stringify(body);
	}

	const response = await fetch(url, opts);
	if (!response.ok) {
		throw new Error(`SyncPlay API Error: ${response.status}`);
	}
	if (response.status === 204) return null;
	const text = await response.text();
	return text ? JSON.parse(text) : null;
};

export const listGroups = async () => {
	try {
		const result = await request('GET', 'List');
		return Array.isArray(result) ? result : [];
	} catch {
		return [];
	}
};

export const getGroup = async (groupId) => {
	try {
		return await request('GET', encodeURIComponent(groupId));
	} catch {
		return null;
	}
};

export const createGroup = async (groupName) => {
	try {
		await request('POST', 'New', {GroupName: groupName});
		return true;
	} catch {
		return false;
	}
};

export const joinGroup = async (groupId) => {
	try {
		await request('POST', 'Join', {GroupId: groupId});
		return true;
	} catch {
		return false;
	}
};

export const leaveGroup = async () => {
	try {
		await request('POST', 'Leave');
		currentGroup = null;
		currentPlaylistItemId = null;
		emit('groupLeft', null);
		return true;
	} catch {
		return false;
	}
};

export const sendPlayRequest = () => request('POST', 'Unpause').catch(() => {});

export const sendPauseRequest = () => request('POST', 'Pause').catch(() => {});

export const sendStopRequest = () => request('POST', 'Stop').catch(() => {});

export const sendSeekRequest = (positionTicks) => request('POST', 'Seek', {PositionTicks: positionTicks}).catch(() => {});

export const serverNow = () => Date.now() + serverTimeOffset;

// Where the group is, from the last queue update or command and the time
// since. Kept here rather than in the player so an item started while the
// group is already playing opens where the group has got to, not where the
// queue was when it was last announced.
let groupPosition = null;

const trackGroupPosition = (positionTicks, isPlaying, serverTimeMs = serverNow()) => {
	if (positionTicks == null) return;
	groupPosition = {positionTicks, isPlaying: !!isPlaying, serverTimeMs};
};

export const getGroupPositionTicks = () => {
	if (!groupPosition) return null;
	const elapsedMs = groupPosition.isPlaying ? Math.max(0, serverNow() - groupPosition.serverTimeMs) : 0;
	return groupPosition.positionTicks + elapsedMs * 10000;
};

export const getGroupState = () => currentGroup?.State ?? null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The group waits on these two reports, so one lost to a dropped request leaves
// everybody sat there. Each attempt takes a fresh reading rather than resending
// the first one, because the server throws out a report stamped more than a
// couple of seconds off its own clock.
const sendHandshake = async (path, sample) => {
	for (let attempt = 1; attempt <= MAX_HANDSHAKE_ATTEMPTS; attempt++) {
		const {isPlaying, positionTicks} = sample();
		try {
			syncLog('[SyncPlay] send', path, 'at', positionTicks / 10000000, 's', isPlaying ? 'playing' : 'paused', 'item', currentPlaylistItemId);
			await request('POST', path, {
				When: new Date(serverNow()).toISOString(),
				PositionTicks: positionTicks,
				IsPlaying: isPlaying,
				PlaylistItemId: currentPlaylistItemId || '00000000-0000-0000-0000-000000000000'
			});
			return;
		} catch {
			if (attempt === MAX_HANDSHAKE_ATTEMPTS) return;
			await wait(HANDSHAKE_RETRY_DELAY_MS);
			// Leaving the group part way through means nobody is waiting on this now.
			if (!currentGroup) return;
		}
	}
};

export const sendBufferingRequest = async (sample) => {
	await sendHandshake('Buffering', sample);
	bufferingReported = true;
};

// Whether the server is waiting on a Ready from this set: the group is in
// Waiting, a Buffering report is outstanding, or the state is not known yet.
export const isReadyOwed = () => !!currentGroup && (currentGroup.State === 'Waiting' || bufferingReported || !currentGroup.State);

export const sendReadyRequest = async (sample) => {
	if (!isReadyOwed()) {
		syncLog('[SyncPlay] Ready not owed, group', currentGroup?.State, '- not sent');
		return;
	}
	await sendHandshake('Ready', sample);
	bufferingReported = false;
};

// The server treats Ping as a group request, so one sent outside a group tells it
// nothing and leaves a warning in its log every ten seconds the app stays open.
export const sendPingRequest = () => {
	if (!currentGroup) return;
	return request('POST', 'Ping', {Ping: lastPing}).catch(() => {});
};

// NTP-style clock sync against /GetUtcTime. The server rejects Ready/Buffering
// timing when When is more than 2s off its clock, and every scheduled command
// depends on knowing the server's clock, so the wall clocks can't be assumed
// to match.
const measureTimeSync = async () => {
	const serverUrl = getServerUrl();
	if (!serverUrl) return;
	try {
		const t0 = Date.now();
		const response = await fetch(`${serverUrl}/GetUtcTime`, {
			headers: {
				'Authorization': getAuthHeader()
			}
		});
		const t3 = Date.now();
		if (!response.ok) return;
		const json = await response.json();
		const t1 = new Date(json.RequestReceptionTime).getTime();
		const t2 = new Date(json.ResponseTransmissionTime).getTime();
		if (isNaN(t1) || isNaN(t2)) return;

		const rtt = (t3 - t0) - (t2 - t1);
		const offset = ((t1 - t0) + (t2 - t3)) / 2;
		if (rtt < 0 || rtt > MAX_TIME_SYNC_RTT_MS) return;

		timeSyncMeasurements.push({offset, rtt});
		if (timeSyncMeasurements.length > MAX_TIME_SYNC_MEASUREMENTS) {
			timeSyncMeasurements.shift();
		}

		let best = timeSyncMeasurements[0];
		for (const m of timeSyncMeasurements) {
			if (m.rtt < best.rtt) best = m;
		}
		serverTimeOffset = Math.round(best.offset);
		// The server wants the round trip, not one leg of it. It schedules an
		// unpause at max(highest ping x 2, 500ms), so halving this here made the
		// group start before the slowest member had the command.
		lastPing = Math.max(0, Math.round(best.rtt));
	} catch {
		// ignore
	}
};

const startTimeSync = async () => {
	if (timeSyncBurstActive) return;
	timeSyncBurstActive = true;
	try {
		for (let i = 0; i < TIME_SYNC_BURST_COUNT; i++) {
			await measureTimeSync();
			if (!socketListeners.length || !serverSocket.isConnected()) return;
			await new Promise(resolve => setTimeout(resolve, TIME_SYNC_BURST_SPACING_MS));
		}
	} finally {
		timeSyncBurstActive = false;
	}
	if (timeSyncInterval) clearInterval(timeSyncInterval);
	timeSyncInterval = setInterval(measureTimeSync, TIME_SYNC_INTERVAL_MS);
};

const stopTimeSync = () => {
	if (timeSyncInterval) {
		clearInterval(timeSyncInterval);
		timeSyncInterval = null;
	}
	timeSyncMeasurements = [];
};

export const setNewQueue = (itemIds, startIndex = 0, startPositionTicks = 0) =>
	request('POST', 'SetNewQueue', {
		PlayingQueue: itemIds,
		PlayingItemPosition: startIndex,
		StartPositionTicks: startPositionTicks
	}).catch(() => {});

export const setPlaylistItem = (playlistItemId) =>
	request('POST', 'SetPlaylistItem', {PlaylistItemId: playlistItemId}).catch(() => {});

export const removeFromPlaylist = (playlistItemIds, clearPlaylist = false, clearPlayingItem = false) =>
	request('POST', 'RemoveFromPlaylist', {
		PlaylistItemIds: playlistItemIds,
		ClearPlaylist: clearPlaylist,
		ClearPlayingItem: clearPlayingItem
	}).catch(() => {});

export const movePlaylistItem = (playlistItemId, newIndex) =>
	request('POST', 'MovePlaylistItem', {PlaylistItemId: playlistItemId, NewIndex: newIndex}).catch(() => {});

export const queueItems = (itemIds, mode = 'Queue') =>
	request('POST', 'Queue', {ItemIds: itemIds, Mode: mode}).catch(() => {});

export const nextItem = () =>
	request('POST', 'NextItem', {
		PlaylistItemId: currentPlaylistItemId || '00000000-0000-0000-0000-000000000000'
	}).catch(() => {});

export const previousItem = () =>
	request('POST', 'PreviousItem', {
		PlaylistItemId: currentPlaylistItemId || '00000000-0000-0000-0000-000000000000'
	}).catch(() => {});

export const setRepeatMode = (mode) =>
	request('POST', 'SetRepeatMode', {Mode: mode}).catch(() => {});

export const setShuffleMode = (mode) =>
	request('POST', 'SetShuffleMode', {Mode: mode}).catch(() => {});

export const setIgnoreWait = (ignoreWait) =>
	request('POST', 'SetIgnoreWait', {IgnoreWait: ignoreWait}).catch(() => {});

const onSocketOpen = () => {
	if (pingInterval) clearInterval(pingInterval);
	pingInterval = setInterval(sendPingRequest, 10000);
	sendPingRequest();
	startTimeSync();
};

const onSocketClosed = () => {
	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}
	stopTimeSync();
};

// SyncPlay rides the session socket, and keeps its ping and the server's clock going only while
// it's switched on.
export const start = () => {
	if (socketListeners.length) return;
	socketListeners = [
		serverSocket.onMessage(handleWebSocketMessage), // eslint-disable-line no-use-before-define
		serverSocket.onConnectionChange((open) => (open ? onSocketOpen() : onSocketClosed()))
	];
	if (serverSocket.isConnected()) onSocketOpen();
};

export const stop = () => {
	socketListeners.forEach((unsubscribe) => unsubscribe());
	socketListeners = [];
	onSocketClosed();
};

const handleWebSocketMessage = (msg) => {
	const {MessageType, Data} = msg;

	switch (MessageType) {
		case 'SyncPlayGroupUpdate':
			handleGroupUpdate(Data); // eslint-disable-line no-use-before-define
			break;
		case 'SyncPlayCommand':
			handlePlaybackCommand(Data); // eslint-disable-line no-use-before-define
			break;
		default:
			break;
	}
};

const handleGroupUpdate = (data) => {
	if (!data) return;
	syncLog('[SyncPlay] group update', data.Type, data.Type === 'StateUpdate' ? data.Data?.State : '');

	switch (data.Type) {
		case 'GroupJoined':
			currentGroup = data.Data || data;
			// The server marks a joiner as buffering and waits on its Ready.
			bufferingReported = true;
			// The group unpauses on its slowest member, so give the server this
			// session's round trip now rather than leaving it on a default for
			// up to ten seconds.
			sendPingRequest();
			emit('groupJoined', currentGroup);
			break;

		case 'GroupLeft':
			currentGroup = null;
			bufferingReported = false;
			groupPosition = null;
			currentPlaylistItemId = null;
			emit('groupLeft', null);
			break;

		case 'UserJoined':
			emit('userJoined', data.Data);
			emit('groupUpdated', data);
			break;

		case 'UserLeft':
			emit('userLeft', data.Data);
			emit('groupUpdated', data);
			break;

		case 'StateUpdate':
			if (currentGroup && data.Data) {
				currentGroup.State = data.Data.State;
			}
			// Paused or waiting, the group stands where it has got to.
			if (data.Data?.State !== 'Playing' && groupPosition?.isPlaying) {
				trackGroupPosition(getGroupPositionTicks(), false);
			}
			emit('stateUpdate', data.Data);
			break;

		case 'PlayQueue': {
			const queueData = data.Data;
			if (queueData?.Playlist) {
				const queue = queueData.Playlist;
				const index = queueData.PlayingItemIndex ?? 0;
				currentPlaylistItemId = queue[index]?.PlaylistItemId || null;
			}
			if (queueData) trackGroupPosition(queueData.StartPositionTicks || 0, queueData.IsPlaying);
			emit('playQueue', queueData);
			break;
		}

		case 'NotInGroup':
		case 'GroupDoesNotExist':
			currentGroup = null;
			groupPosition = null;
			currentPlaylistItemId = null;
			emit('groupLeft', null);
			break;

		case 'LibraryAccessDenied':
			emit('error', {message: 'Library access denied'});
			break;

		default:
			emit('groupUpdate', data);
			break;
	}
};

// Ids come with and without dashes.
export const itemIdKey = (id) => String(id || '').replace(/-/g, '').toLowerCase();

const handlePlaybackCommand = (data) => {
	if (!data) return;
	// A command for another queue entry would land on the wrong item. An all-zero id names none.
	const commandItem = itemIdKey(data.PlaylistItemId);
	if (/[1-9a-f]/.test(commandItem) && currentPlaylistItemId && commandItem !== itemIdKey(currentPlaylistItemId)) {
		syncLog('[SyncPlay] dropped', data.Command, 'for item', data.PlaylistItemId);
		return;
	}
	syncLog('[SyncPlay] command', data.Command, 'at', data.PositionTicks != null ? data.PositionTicks / 10000000 : null, 's, when', data.When, 'delay', getDelayToWhen(data.When), 'ms'); // eslint-disable-line no-use-before-define
	// A command says where the group was at its own time, which for a late
	// one or an echo is not now.
	if (data.Command === 'Unpause' || data.Command === 'Pause' || data.Command === 'Seek') {
		trackGroupPosition(data.PositionTicks, data.Command === 'Unpause', whenToServerMs(data.When)); // eslint-disable-line no-use-before-define
	}
	emit('playbackCommand', data);
};

export const getDelayToWhen = (when) => {
	if (!when) return 0;
	const whenMs = new Date(when).getTime();
	return Math.max(0, whenMs - serverNow());
};

export const getAdjustedPosition = (positionTicks, when) => {
	if (positionTicks == null) return null;
	if (!when) return positionTicks;
	// Clamped so a bad clock offset early in a session cant throw the position
	// minutes down the file.
	const elapsedMs = Math.min(MAX_LATE_CATCH_UP_MS, Math.max(0, serverNow() - new Date(when).getTime()));
	return positionTicks + Math.floor(elapsedMs * 10000);
};

// Where the group was last known to be, so playback can be measured against it
// between commands rather than only when one arrives. A command carries the
// time its position was true for, which for a late one or an echo is not now.
export const setSyncReference = (positionTicks, serverTimeMs = serverNow()) => {
	syncReference = positionTicks == null ? null : {positionTicks, serverTimeMs};
};

export const whenToServerMs = (when) => {
	const ms = when ? new Date(when).getTime() : NaN;
	return isNaN(ms) ? serverNow() : ms;
};

export const clearSyncReference = () => {
	syncReference = null;
};

export const getExpectedPositionTicks = (extraOffsetMs = 0) => expectedPositionTicks(syncReference, serverNow(), extraOffsetMs);
