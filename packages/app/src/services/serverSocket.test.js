let mockServerType = 'jellyfin';

jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => 'https://server',
	getApiKey: () => 'key',
	getDeviceId: () => 'device',
	getServerType: () => mockServerType
}));

jest.mock('./serverLogger', () => ({
	info: jest.fn(),
	LOG_CATEGORIES: {NETWORK: 'Network'}
}));

describe('the session socket', () => {
	let sockets;
	let serverSocket;

	const latest = () => sockets[sockets.length - 1];
	const receive = (message) => latest().onmessage({data: JSON.stringify(message)});
	const keepAliveCount = () => latest().send.mock.calls.filter(([data]) => JSON.parse(data).MessageType === 'KeepAlive').length;

	beforeEach(() => {
		jest.useFakeTimers();
		mockServerType = 'jellyfin';
		sockets = [];
		global.WebSocket = function FakeSocket (url) {
			sockets.push(this);
			this.url = url;
			this.readyState = 1;
			this.send = jest.fn();
			this.close = jest.fn();
		};
		// The listeners live in module state, so each test starts from a fresh copy.
		jest.isolateModules(() => {
			serverSocket = require('./serverSocket');
		});
	});

	afterEach(() => {
		serverSocket.disconnect();
		jest.useRealTimers();
		delete global.WebSocket;
	});

	test('opens on the path each server type answers on', () => {
		serverSocket.connect();
		expect(latest().url).toBe('wss://server/socket?ApiKey=key&deviceId=device');
		serverSocket.disconnect();

		mockServerType = 'emby';
		serverSocket.connect();
		expect(latest().url).toBe('wss://server/embywebsocket?api_key=key&deviceId=device');
	});

	test('hands each message to every listener', () => {
		const first = jest.fn();
		const second = jest.fn();
		serverSocket.onMessage(first);
		serverSocket.onMessage(second);
		serverSocket.connect();
		latest().onopen();
		receive({MessageType: 'UserDataChanged', Data: {UserId: 'u'}});
		expect(first).toHaveBeenCalledWith({MessageType: 'UserDataChanged', Data: {UserId: 'u'}});
		expect(second).toHaveBeenCalledTimes(1);
	});

	test('a listener that throws doesnt keep the message from the rest', () => {
		const after = jest.fn();
		serverSocket.onMessage(() => {
			throw new Error('broken');
		});
		serverSocket.onMessage(after);
		serverSocket.connect();
		receive({MessageType: 'UserDataChanged'});
		expect(after).toHaveBeenCalledTimes(1);
	});

	test('says when it opens, closes and is taken down', () => {
		const changes = [];
		serverSocket.onConnectionChange((open) => changes.push(open));
		serverSocket.connect();
		latest().onopen();
		expect(serverSocket.isConnected()).toBe(true);
		latest().onclose();
		expect(serverSocket.isConnected()).toBe(false);
		jest.advanceTimersByTime(5000);
		latest().onopen();
		serverSocket.disconnect();
		expect(changes).toEqual([true, false, true, false]);
	});

	test('reconnects a while after the socket drops, and not once taken down', () => {
		serverSocket.connect();
		latest().onopen();
		latest().onclose();
		jest.advanceTimersByTime(4999);
		expect(sockets).toHaveLength(1);
		jest.advanceTimersByTime(1);
		expect(sockets).toHaveLength(2);

		serverSocket.disconnect();
		jest.advanceTimersByTime(60000);
		expect(sockets).toHaveLength(2);
	});

	describe('keep alive', () => {
		const forceKeepAlive = (timeout) => receive({MessageType: 'ForceKeepAlive', Data: timeout});

		beforeEach(() => {
			serverSocket.connect();
			latest().onopen();
		});

		test('sends nothing until the server asks', () => {
			jest.advanceTimersByTime(60000);
			expect(keepAliveCount()).toBe(0);
		});

		// The server disposes a socket 60s after the last KeepAlive it received and ends the
		// session with it, which takes the set out of any SyncPlay group.
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

		test('keeps ForceKeepAlive to itself', () => {
			const listener = jest.fn();
			serverSocket.onMessage(listener);
			forceKeepAlive(60);
			expect(listener).not.toHaveBeenCalled();
		});

		test('stops once the socket closes', () => {
			// The reconnect that follows opens a fresh socket, so count on this one.
			const first = latest();
			forceKeepAlive(60);
			first.onclose();
			jest.advanceTimersByTime(120000);
			expect(first.send).toHaveBeenCalledTimes(1);
		});
	});
});
