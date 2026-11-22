jest.mock('../platform', () => ({isXbox: jest.fn()}));

import {isXbox} from '../platform';
import {openSiloSocket} from './siloSocket';

// The host's half: what the page posted, and a way to answer as the host does.
const posted = [];
const fromHost = (type, payload) => window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type, payload}}));

beforeEach(() => {
	isXbox.mockReturnValue(true);
	posted.length = 0;
	window.chrome = {webview: {postMessage: (raw) => posted.push(JSON.parse(raw))}};
});

afterEach(() => {
	delete window.chrome;
});

test('on Xbox the shell opens Silo\'s socket and relays it', async () => {
	const socket = await openSiloSocket('ws://silo:8090/api/v2/events/ws', ['silo.events.v2', 'silo.ticket.t']);
	const seen = [];
	socket.onopen = () => seen.push('open');
	socket.onmessage = (e) => seen.push(`message ${e.data}`);
	socket.onclose = (e) => seen.push(`close ${e.code}`);
	const {id} = posted[0].payload;
	expect(posted[0]).toMatchObject({type: 'SOCKET_OPEN', payload: {url: 'ws://silo:8090/api/v2/events/ws', protocols: ['silo.events.v2', 'silo.ticket.t']}});

	fromHost('SOCKET_OPENED', {id, protocol: 'silo.events.v2'});
	expect(socket.protocol).toBe('silo.events.v2');
	socket.send('{"type":"ping"}');
	expect(posted[1]).toEqual({v: 1, type: 'SOCKET_SEND', payload: {id, data: '{"type":"ping"}'}});
	fromHost('SOCKET_MESSAGE', {id, data: 'hello'});
	fromHost('SOCKET_MESSAGE', {id: id + 1000, data: 'not mine'});
	// Silo's access-changed close reaches the app with its code.
	fromHost('SOCKET_CLOSED', {id, code: 4001, reason: 'access changed'});
	expect(seen).toEqual(['open', 'message hello', 'close 4001']);
	expect(socket.readyState).toBe(3);
});

test('a socket the shell couldn\'t open errors and closes with 1006', async () => {
	const socket = await openSiloSocket('ws://silo/ws', []);
	const seen = [];
	socket.onerror = () => seen.push('error');
	socket.onclose = (e) => seen.push(`close ${e.code}`);
	fromHost('SOCKET_CLOSED', {id: posted[0].payload.id, code: 1006, reason: 'refused'});
	expect(seen).toEqual(['error', 'close 1006']);
});

test('everywhere else it is the browser\'s WebSocket', async () => {
	isXbox.mockReturnValue(false);
	global.WebSocket = function FakeSocket (url, protocols) {
		this.url = url;
		this.protocols = protocols;
	};
	const socket = await openSiloSocket('ws://silo/ws', ['a']);
	expect(socket).toBeInstanceOf(global.WebSocket);
	expect(posted).toEqual([]);
	delete global.WebSocket;
});
