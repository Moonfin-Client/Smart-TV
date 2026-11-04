import {createSiloEvents, noteSiloPlaybackEnded, openSiloEvents, siloEventsUrl} from './siloEvents';

const flushPromises = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve(); // eslint-disable-line no-await-in-loop
};

describe('Silo events', () => {
	test('the socket URL declares the channels and carries no credential', () => {
		expect(siloEventsUrl('https://silo.example/base/')).toBe('wss://silo.example/base/api/v2/events/ws?channels=user_state,catalog');
		expect(siloEventsUrl('http://localhost:8090')).toBe('ws://localhost:8090/api/v2/events/ws?channels=user_state,catalog');
	});

	test('a batch becomes one UserDataChanged with what Silo now has, for this profile only', async () => {
		const forget = jest.fn();
		const getItems = jest.fn(async () => ({Items: [{Id: 'm1', UserData: {Played: true, PlaybackPositionTicks: 0}}]}));
		const events = createSiloEvents({call: jest.fn(), getBaseUrl: () => 'http://s', getUserId: () => '7', getItems, forget});
		const messages = await events.translate([
			{type: 'event', channel: 'user_state', event: 'user_state.changed', data: {profile_id: '7', content_id: 'm1', change: 'watched', played: true}},
			{type: 'event', channel: 'user_state', event: 'user_state.changed', data: {profile_id: '8', content_id: 'm2', change: 'watched'}},
			{type: 'event', channel: 'user_state', event: 'user_state.changed', data: {profile_id: '7', content_id: 'm3', change: 'favorite', is_favorite: true}}
		]);
		expect(forget).toHaveBeenCalled();
		expect(getItems).toHaveBeenCalledWith({Ids: 'm1,m3', Fields: 'UserData'});
		expect(messages).toEqual([{MessageType: 'UserDataChanged', Data: {UserId: '7', UserDataList: [
			{Played: true, PlaybackPositionTicks: 0, ItemId: 'm1'},
			{IsFavorite: true, ItemId: 'm3'}
		]}}]);
	});

	describe('the connection', () => {
		let sockets;
		let events;
		let messages;
		let handle;
		const latest = () => sockets[sockets.length - 1];

		beforeEach(() => {
			jest.useFakeTimers();
			sockets = [];
			global.WebSocket = function FakeSocket (url, protocols) {
				sockets.push(this);
				Object.assign(this, {url, protocols, send: jest.fn(), close: jest.fn()});
			};
			let n = 0;
			events = {
				baseUrl: () => 'http://s',
				profileId: () => '7',
				forget: jest.fn(),
				capabilities: jest.fn(async () => ({state: 'available', allowed: true})),
				ticket: jest.fn(async () => ({ticket: `t${++n}`, protocol: 'silo.events.v2', max_connection_seconds: 300})),
				translate: jest.fn(async (frames) => [{frames}])
			};
			messages = [];
			handle = openSiloEvents(events, {onOpen: jest.fn(), onMessage: (m) => messages.push(m), onClose: jest.fn()});
		});

		afterEach(() => {
			handle.close();
			jest.useRealTimers();
		});

		test('offers the protocol, then the ticket', async () => {
			await flushPromises();
			expect(latest().protocols).toEqual(['silo.events.v2', 'silo.ticket.t1']);
		});

		test('renews before the limit with a fresh ticket and drops the renewal\'s snapshot', async () => {
			await flushPromises();
			const first = latest();
			first.onopen();
			jest.advanceTimersByTime(285000);
			await flushPromises();
			expect(first.close).toHaveBeenCalled();
			expect(latest().protocols).toEqual(['silo.events.v2', 'silo.ticket.t2']);
			latest().onopen();
			latest().onmessage({data: JSON.stringify({type: 'snapshot', channel: 'user_state'})});
			jest.advanceTimersByTime(300);
			await flushPromises();
			expect(events.translate).not.toHaveBeenCalled();
		});

		test('backs off while the handshake keeps failing', async () => {
			await flushPromises();
			latest().onclose({code: 1006});
			jest.advanceTimersByTime(5000);
			await flushPromises();
			expect(sockets).toHaveLength(2);
			latest().onclose({code: 1006});
			jest.advanceTimersByTime(5000);
			await flushPromises();
			expect(sockets).toHaveLength(2);
			jest.advanceTimersByTime(5000);
			await flushPromises();
			expect(sockets).toHaveLength(3);
		});

		test('reconnects at once when access changed, after forgetting what it read', async () => {
			await flushPromises();
			latest().onopen();
			latest().onclose({code: 4001});
			await flushPromises();
			expect(events.forget).toHaveBeenCalled();
			expect(sockets).toHaveLength(2);
		});

		test('a server that keeps closing for changed access is waited on, not asked again at once', async () => {
			await flushPromises();
			latest().onopen();
			latest().onclose({code: 4001});
			await flushPromises();
			expect(sockets).toHaveLength(2);
			latest().onopen();
			latest().onclose({code: 4001});
			await flushPromises();
			expect(sockets).toHaveLength(2);
			jest.advanceTimersByTime(5000);
			await flushPromises();
			expect(sockets).toHaveLength(3);
		});

		test('this client\'s own stop is read back like an event', async () => {
			await flushPromises();
			noteSiloPlaybackEnded('http://s', 'm1');
			noteSiloPlaybackEnded('http://other', 'm2');
			jest.advanceTimersByTime(300);
			await flushPromises();
			expect(messages).toEqual([{frames: [expect.objectContaining({data: expect.objectContaining({content_id: 'm1'})})]}]);
		});
	});
});
