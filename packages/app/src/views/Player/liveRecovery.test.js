import {createLiveRecovery} from './liveRecovery';

let clock;
let directPlay;
let calls;
let reResolveResult;

const setup = ({withReload = false} = {}) => {
	calls = [];
	reResolveResult = () => Promise.resolve();
	const recovery = createLiveRecovery({
		reResolve: (route) => {
			calls.push(['reResolve', route]);
			return reResolveResult(route);
		},
		reload: withReload ? () => {
			calls.push(['reload']);
			return Promise.resolve();
		} : undefined,
		release: () => {
			calls.push(['release']);
			return Promise.resolve();
		},
		onLost: () => calls.push(['lost']),
		onStatus: (status) => calls.push(['status', status && status.attempt]),
		isDirectPlay: () => directPlay,
		now: () => clock
	});
	recovery.tuned();
	return recovery;
};

// Moves the clock and the timers together, then lets the awaits behind them settle.
const advance = async (ms) => {
	clock += ms;
	await jest.advanceTimersByTimeAsync(ms);
};

const reResolves = () => calls.filter(([name]) => name === 'reResolve').map(([, route]) => route);
const playing = (recovery) => recovery.update({playing: true, buffering: false});

beforeEach(() => {
	jest.useFakeTimers();
	clock = 1000000;
	directPlay = false;
});
afterEach(() => jest.useRealTimers());

describe('the recovery budget', () => {
	test('the first failure re-resolves right away and says which attempt it is', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		expect(reResolves()).toEqual([{disableDirectPlay: false, forceTranscode: false}]);
		expect(calls).toContainEqual(['status', 1]);
	});

	test('the next failures wait 10s and then 20s after the attempt before them', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		recovery.recover('completed');
		await advance(9999);
		expect(reResolves()).toHaveLength(1);
		await advance(1);
		expect(reResolves()).toHaveLength(2);
		recovery.recover('completed');
		await advance(19999);
		expect(reResolves()).toHaveLength(2);
		await advance(1);
		expect(reResolves()).toHaveLength(3);
	});

	test('the last attempt asks the server to serve a direct played channel', async () => {
		directPlay = true;
		const recovery = setup();
		await recovery.recover('completed');
		await advance(10000);
		await recovery.recover('completed');
		await advance(20000);
		await recovery.recover('completed');
		expect(reResolves()[2]).toEqual({disableDirectPlay: true, forceTranscode: false});
	});

	test('the last attempt forces a transcode on a channel the server already serves', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		await advance(10000);
		await recovery.recover('completed');
		await advance(20000);
		await recovery.recover('completed');
		expect(reResolves()[2]).toEqual({disableDirectPlay: true, forceTranscode: true});
	});

	test('a failure past the budget waits 4s, releases the tuner and gives the channel up', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		await advance(10000);
		await recovery.recover('completed');
		await advance(20000);
		await recovery.recover('completed');
		recovery.recover('completed');
		await advance(3999);
		expect(calls).not.toContainEqual(['lost']);
		await advance(1);
		expect(reResolves()).toHaveLength(3);
		const tail = calls.slice(-3);
		expect(tail).toEqual([['status', null], ['release'], ['lost']]);
	});

	test('a re-resolve that throws schedules the next attempt, and the last one gives up', async () => {
		const recovery = setup();
		reResolveResult = () => Promise.reject(new Error('no tuner'));
		await recovery.recover('completed');
		await advance(10000);
		expect(reResolves()).toHaveLength(2);
		await advance(20000);
		expect(reResolves()).toHaveLength(3);
		expect(calls.slice(-2)).toEqual([['release'], ['lost']]);
	});

	test('a retry held after a failed re-resolve still runs on a stream that was playing', async () => {
		const recovery = setup();
		playing(recovery);
		reResolveResult = () => Promise.reject(new Error('Unable to find host to play channel'));
		await recovery.recover('source-error');
		reResolveResult = () => Promise.resolve();
		await advance(10000);
		expect(reResolves()).toHaveLength(2);
	});

	test('a clean minute since the last attempt starts the budget over', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		await advance(10000);
		await recovery.recover('completed');
		await advance(60000);
		await recovery.recover('completed');
		expect(calls.filter(([name]) => name === 'status').map(([, attempt]) => attempt)).toEqual([1, 2, 1]);
	});

	test('playing for 20s after a recovery gives the budget back', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		await advance(10000);
		await recovery.recover('completed');
		playing(recovery);
		await advance(20000);
		recovery.update({buffering: true});
		await recovery.recover('completed');
		const attempts = calls.filter(([name, attempt]) => name === 'status' && attempt != null).map(([, attempt]) => attempt);
		expect(attempts).toEqual([1, 2, 1]);
	});

	test('a channel that stops playing before 20s keeps the attempts it spent', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		playing(recovery);
		await advance(10000);
		recovery.update({buffering: true});
		await recovery.recover('completed');
		const attempts = calls.filter(([name, attempt]) => name === 'status' && attempt != null).map(([, attempt]) => attempt);
		expect(attempts).toEqual([1, 2]);
	});

	test('playback resuming drops a held retry and clears the status', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		recovery.recover('completed');
		playing(recovery);
		await advance(10000);
		expect(reResolves()).toHaveLength(1);
		expect(calls[calls.length - 1]).toEqual(['status', null]);
	});

	test('the viewer moving on drops a held retry and starts the next channel fresh', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		recovery.recover('completed');
		recovery.abandon('tuned elsewhere');
		await advance(10000);
		expect(reResolves()).toHaveLength(1);
		recovery.tuned();
		await recovery.recover('completed');
		expect(calls.filter(([name, attempt]) => name === 'status' && attempt != null).map(([, attempt]) => attempt)).toEqual([1, 1]);
	});

	test('the channel is not reported lost when the viewer leaves while it is released', async () => {
		let finishRelease;
		const recovery = createLiveRecovery({
			reResolve: () => Promise.reject(new Error('gone')),
			release: () => new Promise((resolve) => { finishRelease = resolve; }),
			onLost: () => calls.push(['lost']),
			onStatus: () => {},
			isDirectPlay: () => false,
			now: () => clock
		});
		calls = [];
		recovery.tuned();
		await recovery.recover('completed');
		await advance(10000);
		await advance(20000);
		recovery.abandon('stopped');
		finishRelease();
		await advance(0);
		expect(calls).not.toContainEqual(['lost']);
	});
});

describe('a stream the player turns away', () => {
	const reloads = () => calls.filter(([name]) => name === 'reload').length;

	test('is reopened as the server makes it, and only the last attempt asks for the channel again', async () => {
		const recovery = setup({withReload: true});
		await recovery.recover('source-error');
		await advance(10000);
		await recovery.recover('source-error');
		await advance(20000);
		await recovery.recover('source-error');
		expect(reloads()).toBe(2);
		expect(reResolves()).toEqual([{disableDirectPlay: true, forceTranscode: true}]);
	});

	test('is asked for again when it was direct played, since there is no server stream to reopen', async () => {
		directPlay = true;
		const recovery = setup({withReload: true});
		await recovery.recover('source-error');
		expect(reloads()).toBe(0);
		expect(reResolves()).toEqual([{disableDirectPlay: false, forceTranscode: false}]);
	});

	test('a channel that ended is still asked for again', async () => {
		const recovery = setup({withReload: true});
		await recovery.recover('completed');
		expect(reloads()).toBe(0);
		expect(reResolves()).toHaveLength(1);
	});
});

describe('the stall watchdog', () => {
	test('a re-resolved stream gets a fresh 30s for its first frame', async () => {
		const recovery = setup();
		await recovery.recover('completed');
		await advance(29999);
		expect(reResolves()).toHaveLength(1);
		await advance(1);
		expect(reResolves()).toHaveLength(2);
	});

	test('a stream that shows no frame in 30s is recovered', async () => {
		setup();
		await advance(29999);
		expect(reResolves()).toHaveLength(0);
		await advance(1);
		expect(reResolves()).toHaveLength(1);
	});

	test('a first frame stops the first frame watch', async () => {
		const recovery = setup();
		await advance(10000);
		playing(recovery);
		await advance(30000);
		expect(reResolves()).toHaveLength(0);
	});

	test('a stall after playing is recovered after 8s', async () => {
		const recovery = setup();
		playing(recovery);
		recovery.update({buffering: true});
		await advance(7999);
		expect(reResolves()).toHaveLength(0);
		await advance(1);
		expect(reResolves()).toHaveLength(1);
	});

	test('a buffering flicker does not restart the stall window', async () => {
		const recovery = setup();
		playing(recovery);
		recovery.update({buffering: true});
		await advance(5000);
		recovery.update({buffering: true});
		await advance(3000);
		expect(reResolves()).toHaveLength(1);
	});

	test('a pause the viewer asked for is not a stall', async () => {
		const recovery = setup();
		playing(recovery);
		recovery.setPaused(true);
		recovery.update({playing: false});
		await advance(60000);
		expect(reResolves()).toHaveLength(0);
	});

	test('a stream that fails to open counts as stalled even though the player reads as paused', async () => {
		const recovery = setup();
		recovery.update({playing: false});
		await advance(30000);
		expect(reResolves()).toHaveLength(1);
	});

	test('not playing after frames, with no buffering and no viewer pause, is left alone', async () => {
		const recovery = setup();
		playing(recovery);
		recovery.update({playing: false});
		await advance(60000);
		expect(reResolves()).toHaveLength(0);
	});

	test('resuming starts the watch again', async () => {
		const recovery = setup();
		playing(recovery);
		recovery.setPaused(true);
		recovery.update({playing: false});
		await advance(60000);
		recovery.setPaused(false);
		recovery.update({buffering: true});
		await advance(8000);
		expect(reResolves()).toHaveLength(1);
	});

	test('the watch ends when the viewer moves on', async () => {
		const recovery = setup();
		recovery.abandon('stopped');
		await advance(60000);
		expect(reResolves()).toHaveLength(0);
	});
});

describe('engaged', () => {
	test('a channel is engaged once it shows a frame or a recovery has started', async () => {
		const recovery = setup();
		expect(recovery.engaged()).toBe(false);
		playing(recovery);
		expect(recovery.engaged()).toBe(true);
		recovery.tuned();
		expect(recovery.engaged()).toBe(false);
		await recovery.recover('stalled');
		expect(recovery.engaged()).toBe(true);
	});
});
