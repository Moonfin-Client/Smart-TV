jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => 'https://server',
	getAuthHeader: () => 'MediaBrowser Token="t"',
	getApiKey: () => 'key',
	getDeviceId: () => 'device'
}));

const pingCount = () => global.fetch.mock.calls.filter(([url]) => url === 'https://server/SyncPlay/Ping').length;

describe('SyncPlay ping', () => {
	let socket;
	let service;

	const groupUpdate = (type) => socket.onmessage({
		data: JSON.stringify({MessageType: 'SyncPlayGroupUpdate', Data: {Type: type, Data: {GroupId: 'g1'}}})
	});

	beforeEach(() => {
		jest.useFakeTimers();
		global.WebSocket = function FakeSocket () {
			socket = this;
			this.close = () => {};
		};
		// The clock sync that runs alongside the ping reads json off its own response.
		global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 204, json: () => Promise.resolve({})}));

		// Group membership lives in module state, so each test gets a fresh copy
		// rather than inheriting whichever group the one before it joined.
		jest.isolateModules(() => {
			service = require('./syncPlay');
		});
		service.connectWebSocket();
		socket.onopen();
	});

	afterEach(() => {
		service.disconnectWebSocket();
		jest.useRealTimers();
		delete global.fetch;
		delete global.WebSocket;
	});

	test('sends nothing while the session is in no group', () => {
		jest.advanceTimersByTime(60000);
		expect(pingCount()).toBe(0);
	});

	test('pings on joining so the server has a round trip before the first unpause', () => {
		expect(pingCount()).toBe(0);
		groupUpdate('GroupJoined');
		expect(pingCount()).toBe(1);
	});

	test('keeps pinging on the timer while in a group', () => {
		groupUpdate('GroupJoined');
		const onJoin = pingCount();
		jest.advanceTimersByTime(30000);
		expect(pingCount()).toBe(onJoin + 3);
	});

	test.each(['GroupLeft', 'NotInGroup', 'GroupDoesNotExist'])('goes quiet again on %s', (type) => {
		groupUpdate('GroupJoined');
		groupUpdate(type);
		const sent = pingCount();
		jest.advanceTimersByTime(60000);
		expect(pingCount()).toBe(sent);
	});
});

describe('SyncPlay socket keep-alive', () => {
	let socket;
	let service;

	const keepAliveCount = () => socket.send.mock.calls.filter(([data]) => JSON.parse(data).MessageType === 'KeepAlive').length;
	const forceKeepAlive = (timeout) => socket.onmessage({data: JSON.stringify({MessageType: 'ForceKeepAlive', Data: timeout})});

	beforeEach(() => {
		jest.useFakeTimers();
		global.WebSocket = function FakeSocket () {
			socket = this;
			this.readyState = 1;
			this.send = jest.fn();
			this.close = () => {};
		};
		global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 204, json: () => Promise.resolve({})}));
		jest.isolateModules(() => {
			service = require('./syncPlay');
		});
		service.connectWebSocket();
		socket.onopen();
	});

	afterEach(() => {
		service.disconnectWebSocket();
		jest.useRealTimers();
		delete global.fetch;
		delete global.WebSocket;
	});

	test('sends nothing until the server asks', () => {
		jest.advanceTimersByTime(60000);
		expect(keepAliveCount()).toBe(0);
	});

	// The server disposes a socket 60s after the last KeepAlive it received and
	// ends the session with it, which takes the set out of its group.
	test('answers ForceKeepAlive at once and then every half timeout', () => {
		forceKeepAlive(60);
		expect(keepAliveCount()).toBe(1);
		jest.advanceTimersByTime(29999);
		expect(keepAliveCount()).toBe(1);
		jest.advanceTimersByTime(1);
		expect(keepAliveCount()).toBe(2);
		jest.advanceTimersByTime(60000);
		expect(keepAliveCount()).toBe(4);
	});

	test('a repeated ForceKeepAlive restarts the timer rather than doubling it', () => {
		forceKeepAlive(60);
		forceKeepAlive(60);
		expect(keepAliveCount()).toBe(2);
		jest.advanceTimersByTime(30000);
		expect(keepAliveCount()).toBe(3);
	});

	test('stops once the socket closes', () => {
		// The reconnect that follows opens a fresh socket, so count on this one.
		const first = socket;
		forceKeepAlive(60);
		first.onclose();
		jest.advanceTimersByTime(120000);
		expect(first.send).toHaveBeenCalledTimes(1);
	});
});

describe('SyncPlay Ready reports', () => {
	let socket;
	let service;

	const readyCount = () => global.fetch.mock.calls.filter(([url]) => url === 'https://server/SyncPlay/Ready').length;
	const sample = () => ({isPlaying: true, positionTicks: 0});
	const groupUpdate = (type, data = {GroupId: 'g1'}) => socket.onmessage({
		data: JSON.stringify({MessageType: 'SyncPlayGroupUpdate', Data: {Type: type, Data: data}})
	});

	beforeEach(() => {
		global.WebSocket = function FakeSocket () {
			socket = this;
			this.readyState = 1;
			this.send = jest.fn();
			this.close = () => {};
		};
		global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 204, json: () => Promise.resolve({})}));
		jest.isolateModules(() => {
			service = require('./syncPlay');
		});
		service.connectWebSocket();
		socket.onopen();
	});

	afterEach(() => {
		service.disconnectWebSocket();
		delete global.fetch;
		delete global.WebSocket;
	});

	test('is owed straight after joining, when the server has marked the set as buffering', async () => {
		groupUpdate('GroupJoined', {GroupId: 'g1', State: 'Playing'});
		await service.sendReadyRequest(sample);
		expect(readyCount()).toBe(1);
	});

	// The server answers a Ready it was not waiting on with an Unpause echo of
	// the last sync point, and acting on that echo is a seek for nothing.
	test('is not sent while the group plays and nothing is owed', async () => {
		groupUpdate('GroupJoined', {GroupId: 'g1', State: 'Playing'});
		await service.sendReadyRequest(sample);
		groupUpdate('StateUpdate', {State: 'Playing'});
		await service.sendReadyRequest(sample);
		expect(readyCount()).toBe(1);
	});

	test('is owed while the group waits', async () => {
		groupUpdate('GroupJoined', {GroupId: 'g1', State: 'Playing'});
		await service.sendReadyRequest(sample);
		groupUpdate('StateUpdate', {State: 'Waiting'});
		await service.sendReadyRequest(sample);
		expect(readyCount()).toBe(2);
	});

	test('is owed after a Buffering report until it goes out', async () => {
		groupUpdate('GroupJoined', {GroupId: 'g1', State: 'Playing'});
		await service.sendReadyRequest(sample);
		groupUpdate('StateUpdate', {State: 'Playing'});
		await service.sendBufferingRequest(sample);
		await service.sendReadyRequest(sample);
		await service.sendReadyRequest(sample);
		expect(readyCount()).toBe(2);
	});
});

describe('SyncPlay group position', () => {
	let socket;
	let service;

	const groupUpdate = (type, data) => socket.onmessage({
		data: JSON.stringify({MessageType: 'SyncPlayGroupUpdate', Data: {Type: type, Data: data}})
	});
	const command = (Command, PositionTicks, whenMs) => socket.onmessage({
		data: JSON.stringify({MessageType: 'SyncPlayCommand', Data: {Command, PositionTicks, When: new Date(whenMs).toISOString()}})
	});
	const SECOND = 10000000;

	beforeEach(() => {
		global.WebSocket = function FakeSocket () {
			socket = this;
			this.readyState = 1;
			this.send = jest.fn();
			this.close = () => {};
		};
		global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 204, json: () => Promise.resolve({})}));
		jest.isolateModules(() => {
			service = require('./syncPlay');
		});
		service.connectWebSocket();
		socket.onopen();
		groupUpdate('GroupJoined', {GroupId: 'g1', State: 'Playing'});
	});

	afterEach(() => {
		service.disconnectWebSocket();
		delete global.fetch;
		delete global.WebSocket;
	});

	test('is unknown until the group has said where it is', () => {
		expect(service.getGroupPositionTicks()).toBeNull();
		expect(service.getGroupState()).toBe('Playing');
	});

	test('a queue update places the group, playing or not', () => {
		groupUpdate('PlayQueue', {Playlist: [{PlaylistItemId: 'p1'}], PlayingItemIndex: 0, StartPositionTicks: 30 * SECOND, IsPlaying: false});
		expect(service.getGroupPositionTicks()).toBe(30 * SECOND);
	});

	test('an Unpause runs on from its own time, so an echo of an old one still lands where the group is', () => {
		command('Unpause', 100 * SECOND, Date.now() - 5000);
		const ticks = service.getGroupPositionTicks();
		expect(ticks).toBeGreaterThanOrEqual(105 * SECOND - SECOND / 10);
		expect(ticks).toBeLessThan(106 * SECOND);
	});

	test('a Pause or Seek stands still', () => {
		command('Pause', 200 * SECOND, Date.now() - 5000);
		expect(service.getGroupPositionTicks()).toBe(200 * SECOND);
		command('Seek', 300 * SECOND, Date.now() - 5000);
		expect(service.getGroupPositionTicks()).toBe(300 * SECOND);
	});

	test('a state update out of Playing freezes the group where it had got to', () => {
		command('Unpause', 100 * SECOND, Date.now() - 5000);
		groupUpdate('StateUpdate', {State: 'Waiting'});
		const frozen = service.getGroupPositionTicks();
		expect(frozen).toBeGreaterThanOrEqual(105 * SECOND - SECOND / 10);
		expect(service.getGroupPositionTicks()).toBe(frozen);
	});

	test('is forgotten on leaving', () => {
		command('Unpause', 100 * SECOND, Date.now());
		groupUpdate('GroupLeft', {GroupId: 'g1'});
		expect(service.getGroupPositionTicks()).toBeNull();
		expect(service.getGroupState()).toBeNull();
	});
});
