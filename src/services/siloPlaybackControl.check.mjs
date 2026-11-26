// Self-check for Silo's playback control lane: node --conditions=browser src/services/siloPlaybackControl.check.mjs
// The cases are the Jest suite this feature had in the Enact app, run through scripts/jestLike.mjs.
import { registerHooks } from 'node:module'
import { stubUnloadable } from '../../scripts/stubUnloadable.mjs'
import { afterEach, beforeEach, describe, expect, jest, run, test } from '../../scripts/jestLike.mjs'

stubUnloadable()
// The socket opener reaches the platform code; here it opens the test's fake WebSocket.
registerHooks({
  resolve(spec, ctx, next) {
    if (/\/siloSocket(\.js)?$/.test(spec)) {
      return { url: 'data:text/javascript,' + encodeURIComponent('export const openSiloSocket = async (url, protocols) => new WebSocket(url, protocols)'), shortCircuit: true }
    }
    return next(spec, ctx)
  },
})

const {
  currentSiloPlaybackControlLane, endSiloPlaybackControl, followSiloPlaybackControl, forgetSiloPlaybackControlServer,
  resetSiloPlaybackControl, setSiloPlaybackControlHandlers, siloPlaybackControlMessage, siloPlaybackControlRenewDelay,
  siloPlaybackControlUrl,
} = await import('./siloPlaybackControl.js')

const flush = async () => {
	for (let i = 0; i < 40; i++) await Promise.resolve(); // eslint-disable-line no-await-in-loop
};

let sockets;
let handlers;
let unset;

const refusal = (status) => Object.assign(new Error(`HTTP ${status}`), {status});

const laneFor = (overrides = {}) => {
	let n = 0;
	return {
		baseUrl: 'http://silo:8090',
		sessionId: 's1',
		appVersion: '3.2.0',
		live: () => true,
		capabilities: jest.fn(async () => ({available: true, allowed: true, protocol: 'silo.playback-control.v2'})),
		ticket: jest.fn(async () => ({ticket: `t${++n}`, protocol: 'silo.playback-control.v2', max_connection_seconds: 14400})),
		accessExpiresAt: () => null,
		...overrides
	};
};

const opened = async (index = null) => {
	await flush();
	const socket = sockets[index ?? sockets.length - 1];
	socket.readyState = 1;
	socket.onopen();
	await flush();
	return socket;
};

const sent = (socket) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));

const command = (socket, frame) => socket.onmessage({data: JSON.stringify({type: 'command', session_id: 's1', payload: {}, ...frame})});

beforeEach(() => {
	jest.useFakeTimers();
	sockets = [];
	globalThis.WebSocket = function FakeSocket (url, protocols) {
		sockets.push(this);
		Object.assign(this, {url, protocols, readyState: 0, send: jest.fn(), close: jest.fn()});
	};
	handlers = {
		run: jest.fn(async () => {}),
		plays: jest.fn(() => true),
		terminate: jest.fn(async () => true),
		stopped: jest.fn(),
		transportHeld: jest.fn(() => false)
	};
	unset = setSiloPlaybackControlHandlers(handlers);
});

afterEach(() => {
	resetSiloPlaybackControl();
	unset();
	jest.useRealTimers();
});

describe('the lane', () => {
	test('a playing session opens its lane with a ticket and says hello', async () => {
		const lane = laneFor();
		followSiloPlaybackControl(lane);
		const socket = await opened();
		expect(socket.url).toBe('ws://silo:8090/api/v2/playback/sessions/s1/control/ws');
		expect(socket.protocols).toEqual(['silo.playback-control.v2', 'silo.ticket.t1']);
		expect(sent(socket)[0]).toEqual({
			type: 'hello', session_id: 's1', client: {name: 'Moonfin', version: '3.2.0'},
			capabilities: {commands: ['pause', 'unpause', 'play_pause', 'stop', 'display_message', 'server_restarting', 'server_shutting_down', 'terminate']}
		});
	});

	test('a message is acknowledged, shown and completed', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'display_message', payload: {message: ' Restart at 9 ', title: 'Admin'}});
		await flush();
		expect(handlers.run).toHaveBeenCalledWith({MessageType: 'GeneralCommand', Data: {Name: 'DisplayMessage', Arguments: {Text: 'Restart at 9', Header: 'Admin'}}});
		expect(sent(socket).slice(1)).toEqual([
			{type: 'ack', command_id: 'c1', session_id: 's1', status: 'accepted'},
			{type: 'result', command_id: 'c1', session_id: 's1', status: 'completed'}
		]);
	});

	test('pause and resume reach the player as Playstate commands', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'pause'});
		command(socket, {command_id: 'c2', name: 'unpause'});
		await flush();
		expect(handlers.run.mock.calls.map(([m]) => m.Data.Command)).toEqual(['Pause', 'Unpause']);
	});

	test('a command it does not run is rejected without being run, and another session\'s is ignored', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'seek'});
		command(socket, {command_id: 'c2', name: 'pause', session_id: 'other'});
		await flush();
		expect(handlers.run).not.toHaveBeenCalled();
		expect(sent(socket).slice(1)).toEqual([{type: 'result', command_id: 'c1', session_id: 's1', status: 'rejected', error: 'unsupported'}]);
	});

	test('a command that fails is rejected after its ack', async () => {
		handlers.run.mockRejectedValueOnce(new Error('nope'));
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'stop'});
		await flush();
		expect(sent(socket).slice(1).map((f) => f.status)).toEqual(['accepted', 'rejected']);
	});

	test('a session the player has moved on from is rejected', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		handlers.plays.mockReturnValue(false);
		command(socket, {command_id: 'c1', name: 'stop'});
		await flush();
		expect(handlers.run).not.toHaveBeenCalled();
		expect(sent(socket)[1]).toEqual({type: 'result', command_id: 'c1', session_id: 's1', status: 'rejected', error: 'not_playing'});
	});

	test('a pause a host-only watch party room would swallow is rejected, a stop still runs', async () => {
		handlers.transportHeld.mockReturnValue(true);
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'pause'});
		command(socket, {command_id: 'c2', name: 'stop'});
		await flush();
		expect(handlers.run.mock.calls.map(([m]) => m.Data.Command)).toEqual(['Stop']);
		const results = sent(socket).filter((f) => f.type === 'result');
		expect(results.map((f) => [f.command_id, f.status])).toEqual([['c1', 'rejected'], ['c2', 'completed']]);
	});

	test('a terminate ends the session with the admin\'s reason', async () => {
		const retire = jest.fn();
		followSiloPlaybackControl(laneFor({retire}));
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'terminate', reason: ' Maintenance ', payload: null});
		await flush();
		expect(handlers.terminate).toHaveBeenCalledWith('s1', 'Maintenance', retire);
		expect(sent(socket).slice(1).map((f) => f.status)).toEqual(['accepted', 'completed']);
	});

	test('a stop with an admin\'s reason stops, then shows the reason', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'stop', reason: ' Maintenance '});
		command(socket, {command_id: 'c2', name: 'stop'});
		await flush();
		expect(handlers.run.mock.calls.map(([m]) => m.Data.Command)).toEqual(['Stop', 'Stop']);
		expect(handlers.stopped.mock.calls).toEqual([['Maintenance']]);
		expect(handlers.run.mock.invocationCallOrder[0]).toBeLessThan(handlers.stopped.mock.invocationCallOrder[0]);
		expect(sent(socket).filter((f) => f.type === 'result').map((f) => f.status)).toEqual(['completed', 'completed']);
	});

	test('a stop that fails shows no reason', async () => {
		handlers.run.mockRejectedValueOnce(new Error('no player'));
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'stop', reason: 'Maintenance'});
		await flush();
		expect(handlers.stopped).not.toHaveBeenCalled();
		expect(sent(socket).pop()).toMatchObject({status: 'rejected', error: 'failed'});
	});

	test('a stop that ends the session still sends its result before the lane closes', async () => {
		let finishStop;
		handlers.run.mockImplementationOnce(() => new Promise((resolve) => {
			finishStop = resolve;
		}));
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		command(socket, {command_id: 'c1', name: 'stop'});
		await flush();
		endSiloPlaybackControl('http://silo:8090', 's1');
		expect(socket.close).not.toHaveBeenCalled();
		finishStop();
		await flush();
		expect(sent(socket).pop()).toMatchObject({type: 'result', command_id: 'c1', status: 'completed'});
		expect(socket.close).toHaveBeenCalled();
	});

	test('an ended session closes the lane; a replan keeps it', async () => {
		const lane = laneFor();
		followSiloPlaybackControl(lane);
		const socket = await opened();
		followSiloPlaybackControl(laneFor());
		await flush();
		expect(sockets).toHaveLength(1);
		endSiloPlaybackControl('http://silo:8090/', 's1');
		expect(socket.close).toHaveBeenCalled();
		expect(currentSiloPlaybackControlLane()).toBeNull();
	});

	test('a session on another server opens its lane there and lets the first one go', async () => {
		followSiloPlaybackControl(laneFor());
		const first = await opened();
		followSiloPlaybackControl(laneFor({baseUrl: 'https://other.example', sessionId: 's2'}));
		const second = await opened();
		expect(first.close).toHaveBeenCalled();
		expect(second.url).toBe('wss://other.example/api/v2/playback/sessions/s2/control/ws');
	});

	test('signing out of a server lets only its lane go', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		forgetSiloPlaybackControlServer('https://other.example');
		expect(socket.close).not.toHaveBeenCalled();
		forgetSiloPlaybackControlServer('http://silo:8090');
		expect(socket.close).toHaveBeenCalled();
	});

	test('a server without the lane gets no ticket', async () => {
		const lane = laneFor({capabilities: jest.fn(async () => {
			throw refusal(404);
		})});
		followSiloPlaybackControl(lane);
		await flush();
		expect(lane.ticket).not.toHaveBeenCalled();
		expect(sockets).toHaveLength(0);
	});

	test('a session Silo has ended is not asked about again, even on a replan', async () => {
		const lane = laneFor({ticket: jest.fn(async () => {
			throw refusal(410);
		})});
		followSiloPlaybackControl(lane);
		await flush();
		jest.advanceTimersByTime(60000);
		followSiloPlaybackControl(lane);
		await flush();
		expect(lane.ticket).toHaveBeenCalledTimes(1);
	});

	test('a lane refused for its token is asked for again on a replan', async () => {
		const lane = laneFor();
		lane.ticket.mockRejectedValueOnce(refusal(401));
		followSiloPlaybackControl(lane);
		await flush();
		expect(sockets).toHaveLength(0);
		followSiloPlaybackControl(lane);
		await opened();
		expect(lane.ticket).toHaveBeenCalledTimes(2);
	});

	test('a session the server is still rebuilding is tried again, and a dropped connection comes back with a fresh ticket', async () => {
		const lane = laneFor();
		lane.ticket.mockRejectedValueOnce(refusal(503));
		followSiloPlaybackControl(lane);
		await flush();
		jest.advanceTimersByTime(1600);
		const socket = await opened();
		expect(socket.protocols[1]).toBe('silo.ticket.t1');
		socket.onclose();
		jest.advanceTimersByTime(2600);
		const again = await opened();
		expect(again.protocols[1]).toBe('silo.ticket.t2');
	});

	test('a lane that keeps failing is given up on', async () => {
		const lane = laneFor({ticket: jest.fn(async () => {
			throw refusal(503);
		})});
		followSiloPlaybackControl(lane);
		for (let i = 0; i < 15; i++) {
			await flush(); // eslint-disable-line no-await-in-loop
			jest.advanceTimersByTime(31000);
		}
		await flush();
		expect(lane.ticket).toHaveBeenCalledTimes(11);
		expect(currentSiloPlaybackControlLane().gaveUp).toBe(true);
	});

	test('a session that stopped playing is not reconnected', async () => {
		let live = true;
		const lane = laneFor({live: () => live});
		followSiloPlaybackControl(lane);
		const socket = await opened();
		live = false;
		socket.onclose();
		jest.advanceTimersByTime(60000);
		await flush();
		expect(lane.ticket).toHaveBeenCalledTimes(1);
	});

	test('a renewal opens the new connection before letting the old one go, and answers go on the new one', async () => {
		const lane = laneFor({ticket: jest.fn()
			.mockResolvedValueOnce({ticket: 't1', protocol: 'silo.playback-control.v2', max_connection_seconds: 120})
			.mockResolvedValueOnce({ticket: 't2', protocol: 'silo.playback-control.v2', max_connection_seconds: 120})});
		let finish;
		handlers.run.mockImplementationOnce(() => new Promise((resolve) => {
			finish = resolve;
		}));
		followSiloPlaybackControl(lane);
		const old = await opened();
		command(old, {command_id: 'c1', name: 'pause'});
		await flush();
		jest.advanceTimersByTime(60000);
		await flush();
		expect(sockets).toHaveLength(2);
		expect(old.close).not.toHaveBeenCalled();
		const next = await opened(1);
		expect(old.close).toHaveBeenCalled();
		finish();
		await flush();
		expect(sent(next).pop()).toMatchObject({type: 'result', command_id: 'c1', status: 'completed'});
	});

	test('Silo closing the old connection before the renewal is up opens no third connection', async () => {
		const lane = laneFor({ticket: jest.fn(async () => ({ticket: `t${lane.ticket.mock.calls.length}`, protocol: 'silo.playback-control.v2', max_connection_seconds: 120}))});
		followSiloPlaybackControl(lane);
		const old = await opened();
		jest.advanceTimersByTime(60000);
		await flush();
		expect(sockets).toHaveLength(2);
		old.onclose();
		await opened(1);
		// Past any reconnect backoff, short of the new connection's own renewal.
		jest.advanceTimersByTime(40000);
		await flush();
		expect(lane.ticket).toHaveBeenCalledTimes(2);
		expect(sockets).toHaveLength(2);
	});

	test('a reconnect timer that fires before the renewal is up opens no third connection', async () => {
		const lane = laneFor({ticket: jest.fn(async () => ({ticket: `t${lane.ticket.mock.calls.length}`, protocol: 'silo.playback-control.v2', max_connection_seconds: 120}))});
		followSiloPlaybackControl(lane);
		const old = await opened();
		jest.advanceTimersByTime(60000);
		await flush();
		old.onclose();
		// The reconnect starts and waits on its ticket while the renewal's connection comes up.
		let answerTicket;
		lane.ticket.mockImplementationOnce(() => new Promise((resolve) => {
			answerTicket = resolve;
		}));
		jest.advanceTimersByTime(2000);
		await flush();
		expect(lane.ticket).toHaveBeenCalledTimes(3);
		await opened(1);
		answerTicket({ticket: 't9', protocol: 'silo.playback-control.v2', max_connection_seconds: 120});
		await flush();
		expect(sockets).toHaveLength(2);
	});

	test('a lane that was up asks again when a restarting server says it is unavailable', async () => {
		const lane = laneFor();
		followSiloPlaybackControl(lane);
		const socket = await opened();
		lane.capabilities.mockResolvedValueOnce({available: false});
		// The cached answer has expired by the time the server restarts.
		jest.advanceTimersByTime(11 * 60 * 1000);
		socket.onclose();
		jest.advanceTimersByTime(2600);
		await flush();
		expect(sockets).toHaveLength(1);
		jest.advanceTimersByTime(5000);
		await opened();
		expect(sockets).toHaveLength(2);
	});

	test('a session the player does not play takes no lane', async () => {
		handlers.plays.mockReturnValue(false);
		const lane = laneFor();
		followSiloPlaybackControl(lane);
		await flush();
		expect(lane.capabilities).not.toHaveBeenCalled();
		expect(currentSiloPlaybackControlLane()).toBeNull();
	});

	test('a session that already stopped does not take the lane from the one playing', async () => {
		followSiloPlaybackControl(laneFor());
		const socket = await opened();
		followSiloPlaybackControl(laneFor({sessionId: 's0', live: () => false}));
		await flush();
		expect(socket.close).not.toHaveBeenCalled();
		expect(currentSiloPlaybackControlLane().matches('http://silo:8090', 's1')).toBe(true);
	});

	test('a lane not allowed is asked about again for the next session', async () => {
		const capabilities = jest.fn()
			.mockResolvedValueOnce({available: true, allowed: false, protocol: 'silo.playback-control.v2'})
			.mockResolvedValue({available: true, allowed: true, protocol: 'silo.playback-control.v2'});
		followSiloPlaybackControl(laneFor({capabilities}));
		await flush();
		expect(sockets).toHaveLength(0);
		followSiloPlaybackControl(laneFor({sessionId: 's2', capabilities}));
		await flush();
		expect(sockets).toHaveLength(1);
	});

	test('a renewal refused for its token reconnects when the old connection closes', async () => {
		const lane = laneFor({ticket: jest.fn()
			.mockResolvedValueOnce({ticket: 't1', protocol: 'silo.playback-control.v2', max_connection_seconds: 120})
			.mockRejectedValueOnce(refusal(401))
			.mockResolvedValue({ticket: 't3', protocol: 'silo.playback-control.v2', max_connection_seconds: 120})});
		followSiloPlaybackControl(lane);
		const old = await opened();
		jest.advanceTimersByTime(60000);
		await flush();
		expect(sockets).toHaveLength(1);
		old.onclose();
		await flush();
		expect(sockets).toHaveLength(2);
		expect(sockets[1].protocols[1]).toBe('silo.ticket.t3');
	});
});

describe('siloPlaybackControlMessage', () => {
	test('a restart notice is shown like a message', () => {
		expect(siloPlaybackControlMessage('server_restarting', {title: 'Server restarting', message: 'Back in a minute'}).Data.Arguments)
			.toEqual({Text: 'Back in a minute', Header: 'Server restarting'});
	});
	test('an untitled message has no header; a notice with only a title shows the title; an empty one is not run', () => {
		expect(siloPlaybackControlMessage('display_message', {message: 'Hi'}).Data.Arguments).toEqual({Text: 'Hi'});
		expect(siloPlaybackControlMessage('server_shutting_down', {title: 'Going down'}).Data.Arguments).toEqual({Text: 'Going down'});
		expect(siloPlaybackControlMessage('display_message', {message: '  '})).toBeNull();
	});
});

describe('siloPlaybackControlRenewDelay', () => {
	test('the ticket\'s limit when the token lasts longer, before the token expires otherwise, never under five seconds', () => {
		expect(siloPlaybackControlRenewDelay(14400, null, 0)).toBe(14400000 - 60000);
		expect(siloPlaybackControlRenewDelay(14400, 3600000, 0)).toBe(3600000 - 60000);
		expect(siloPlaybackControlRenewDelay(14400, 30000, 0)).toBe(5000);
	});
	test('the URL carries no credential', () => {
		expect(siloPlaybackControlUrl('https://h/base/', 'a b')).toBe('wss://h/base/api/v2/playback/sessions/a%20b/control/ws');
	});
});

await run('siloPlaybackControl')
