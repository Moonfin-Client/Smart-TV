import {getServerUrl, getAuthHeader, getApiKey, getDeviceId} from './jellyfinApi';

let ws = null;
let currentGroup = null;
let serverTimeOffset = 0;
let lastPing = 500;
let pingInterval = null;
let reconnectTimeout = null;
let listeners = [];
let isConnecting = false;
let currentPlaylistItemId = null;

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

export const sendBufferingRequest = (isPlaying, positionTicks) =>
	request('POST', 'Buffering', {
		When: new Date(Date.now() + serverTimeOffset).toISOString(),
		PositionTicks: positionTicks,
		IsPlaying: isPlaying,
		PlaylistItemId: currentPlaylistItemId || '00000000-0000-0000-0000-000000000000'
	}).catch(() => {});

export const sendReadyRequest = (isPlaying, positionTicks) =>
	request('POST', 'Ready', {
		When: new Date(Date.now() + serverTimeOffset).toISOString(),
		PositionTicks: positionTicks,
		IsPlaying: isPlaying,
		PlaylistItemId: currentPlaylistItemId || '00000000-0000-0000-0000-000000000000'
	}).catch(() => {});

export const sendPingRequest = async () => {
	try {
		const sentAt = Date.now();
		await request('POST', 'Ping', {Ping: lastPing});
		const rtt = Date.now() - sentAt;
		lastPing = rtt;
		serverTimeOffset = Math.round(rtt / 2);
	} catch {
		// ignore
	}
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

export const connectWebSocket = () => {
	if (ws || isConnecting) return;

	const serverUrl = getServerUrl();
	if (!serverUrl) return;

	isConnecting = true;

	const wsProto = serverUrl.startsWith('https') ? 'wss' : 'ws';
	const host = serverUrl.replace(/^https?:\/\//, '');
	const wsUrl = `${wsProto}://${host}/socket?api_key=${encodeURIComponent(getApiKey())}&deviceId=${encodeURIComponent(getDeviceId())}`;

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
		case 'ForceKeepAlive':
			break;
		default:
			break;
	}
};

const handleGroupUpdate = (data) => {
	if (!data) return;

	switch (data.Type) {
		case 'GroupJoined':
			currentGroup = data.Data || data;
			emit('groupJoined', currentGroup);
			break;

		case 'GroupLeft':
			currentGroup = null;
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
			emit('playQueue', queueData);
			break;
		}

		case 'NotInGroup':
		case 'GroupDoesNotExist':
			currentGroup = null;
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
	emit('playbackCommand', data);
};

export const getDelayToWhen = (when) => {
	if (!when) return 0;
	const serverNow = Date.now() + serverTimeOffset;
	const whenMs = new Date(when).getTime();
	return Math.max(0, whenMs - serverNow);
};

export const getAdjustedPosition = (positionTicks, when) => {
	if (positionTicks == null) return null;
	if (!when) return positionTicks;
	const elapsedMs = Math.max(0, Date.now() + serverTimeOffset - new Date(when).getTime());
	return positionTicks + Math.floor(elapsedMs * 10000);
};
