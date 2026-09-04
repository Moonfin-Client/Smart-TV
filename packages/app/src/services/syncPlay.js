import {getServerUrl, getAuthHeader, getApiKey, getDeviceId} from './jellyfinApi';
import {expectedPositionTicks} from '../utils/syncDrift';
import {syncLog} from '../utils/syncLog';

let ws = null;
let syncReference = null;
let currentGroup = null;
let serverTimeOffset = 0;
let lastPing = 500;
let pingInterval = null;
let keepAliveInterval = null;
let reconnectTimeout = null;
let listeners = [];
let isConnecting = false;
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
// The server drops a socket that has not sent it a KeepAlive message within
// this long. It says so in the ForceKeepAlive it sends on connect and again
// once a reply is overdue; the fallback only covers a message with no timeout.
const DEFAULT_KEEP_ALIVE_TIMEOUT_S = 60;
// Reply every half timeout, as jellyfin-web does, so one lost message does not
// cost the socket.
const KEEP_ALIVE_FACTOR = 0.5;
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
			'X-Emby-Authorization': getAuthHeader(),
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
				'Authorization': getAuthHeader(),
				'X-Emby-Authorization': getAuthHeader()
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
			if (!ws) return;
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

// A socket the server counts as lost is disposed, which ends the session and
// with it its place in the group. Only a KeepAlive message from this side
// refreshes its timer; nothing else sent on the socket or over HTTP counts.
const sendKeepAlive = () => {
	if (!ws || ws.readyState !== 1) return;
	try {
		ws.send(JSON.stringify({MessageType: 'KeepAlive'}));
	} catch {
		// ignore
	}
};

const stopKeepAlive = () => {
	if (keepAliveInterval) {
		clearInterval(keepAliveInterval);
		keepAliveInterval = null;
	}
};

const scheduleKeepAlive = (timeoutSeconds) => {
	stopKeepAlive();
	const seconds = Number(timeoutSeconds) > 0 ? Number(timeoutSeconds) : DEFAULT_KEEP_ALIVE_TIMEOUT_S;
	keepAliveInterval = setInterval(sendKeepAlive, seconds * 1000 * KEEP_ALIVE_FACTOR);
};

export const connectWebSocket = () => {
	if (ws || isConnecting) return;

	const serverUrl = getServerUrl();
	if (!serverUrl) return;

	isConnecting = true;

	const wsProto = serverUrl.startsWith('https') ? 'wss' : 'ws';
	const host = serverUrl.replace(/^https?:\/\//, '');
	const wsUrl = `${wsProto}://${host}/socket?ApiKey=${encodeURIComponent(getApiKey())}&deviceId=${encodeURIComponent(getDeviceId())}`;

	try {
		ws = new WebSocket(wsUrl);
	} catch {
		isConnecting = false;
		scheduleReconnect(); // eslint-disable-line no-use-before-define
		return;
	}

	ws.onopen = () => {
		isConnecting = false;
		if (pingInterval) clearInterval(pingInterval);
		pingInterval = setInterval(sendPingRequest, 10000);
		sendPingRequest();
		startTimeSync();
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data);
			handleWebSocketMessage(msg); // eslint-disable-line no-use-before-define
		} catch {
			// ignore
		}
	};

	ws.onerror = () => {};

	ws.onclose = () => {
		ws = null;
		isConnecting = false;
		if (pingInterval) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
		stopKeepAlive();
		stopTimeSync();
		scheduleReconnect(); // eslint-disable-line no-use-before-define
	};
};

const scheduleReconnect = () => {
	if (reconnectTimeout) return;
	reconnectTimeout = setTimeout(() => {
		reconnectTimeout = null;
		connectWebSocket();
	}, 5000);
};

export const disconnectWebSocket = () => {
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}
	stopKeepAlive();
	stopTimeSync();
	if (ws) {
		ws.onclose = null;
		ws.close();
		ws = null;
	}
	isConnecting = false;
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
		case 'GeneralCommand':
			handleGeneralCommand(Data); // eslint-disable-line no-use-before-define
			break;
		case 'ForceKeepAlive':
			sendKeepAlive();
			scheduleKeepAlive(Data);
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
				if (queue[index]) {
					currentPlaylistItemId = queue[index].PlaylistItemId || null;
				}
			}
			if (queueData) trackGroupPosition(queueData.StartPositionTicks || 0, queueData.IsPlaying);
			emit('playQueue', queueData);
			break;
		}

		case 'NotInGroup':
		case 'GroupDoesNotExist':
			currentGroup = null;
			groupPosition = null;
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

const handlePlaybackCommand = (data) => {
	if (!data) return;
	syncLog('[SyncPlay] command', data.Command, 'at', data.PositionTicks != null ? data.PositionTicks / 10000000 : null, 's, when', data.When, 'delay', getDelayToWhen(data.When), 'ms'); // eslint-disable-line no-use-before-define
	// A command says where the group was at its own time, which for a late
	// one or an echo is not now.
	if (data.Command === 'Unpause' || data.Command === 'Pause' || data.Command === 'Seek') {
		trackGroupPosition(data.PositionTicks, data.Command === 'Unpause', whenToServerMs(data.When)); // eslint-disable-line no-use-before-define
	}
	emit('playbackCommand', data);
};

const getCommandArgument = (args, key) => {
	if (!args || typeof args !== 'object') return null;
	const direct = args[key];
	if (typeof direct === 'string') return direct;

	const matchKey = Object.keys(args).find((k) => k.toLowerCase() === key.toLowerCase());
	if (!matchKey) return null;

	const value = args[matchKey];
	return typeof value === 'string' ? value : null;
};

const handleGeneralCommand = (data) => {
	if (!data || typeof data !== 'object') return;

	const name = data.Name || data.name;
	if (typeof name !== 'string' || name.toLowerCase() !== 'displaymessage') return;

	const args = data.Arguments || data.arguments;
	const text = getCommandArgument(args, 'Text')?.trim();
	if (!text) return;

	const headerRaw = getCommandArgument(args, 'Header');
	const header = typeof headerRaw === 'string' ? headerRaw.trim() : '';
	emit('displayMessage', header ? {text, header} : {text});
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
