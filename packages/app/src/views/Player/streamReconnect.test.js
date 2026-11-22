import {createStreamReconnect, reconnectDelayBefore} from './streamReconnect';

const setup = (reopenResults = []) => {
	let clock = 0;
	const timers = [];
	const reopen = jest.fn(async () => {
		const result = reopenResults.shift();
		if (result instanceof Error) throw result;
	});
	const states = [];
	const onLost = jest.fn();
	const reconnect = createStreamReconnect({
		reopen, onLost, onReconnecting: (v) => states.push(v),
		now: () => clock,
		setTimer: (fn, ms) => {
			const t = {at: clock + ms, fn};
			timers.push(t);
			return t;
		},
		clearTimer: (t) => {
			const i = timers.indexOf(t);
			if (i >= 0) timers.splice(i, 1);
		}
	});
	// Runs every timer due by `ms` from now, in order, letting each attempt settle.
	const advance = async (ms) => {
		const until = clock + ms;
		for (;;) {
			timers.sort((a, b) => a.at - b.at);
			const next = timers[0];
			if (!next || next.at > until) break;
			timers.shift();
			clock = next.at;
			next.fn();
			for (let i = 0; i < 5; i++) await Promise.resolve(); // eslint-disable-line no-await-in-loop
		}
		clock = until;
	};
	return {reconnect, reopen, states, onLost, advance};
};

test('delays double from a second up to fifteen', () => {
	expect([1, 2, 3, 4, 5, 6].map(reconnectDelayBefore)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
});

test('reopens a second after the loss, and again after each failed attempt until the stream plays', async () => {
	const {reconnect, reopen, states, advance} = setup([new Error('down'), undefined]);
	reconnect.lost('error 2');
	expect(reconnect.reconnecting).toBe(true);
	await advance(999);
	expect(reopen).not.toHaveBeenCalled();
	await advance(1);
	expect(reopen).toHaveBeenCalledTimes(1);
	await advance(2000);
	expect(reopen).toHaveBeenCalledTimes(2);
	// The reopened stream errors again: the next attempt waits 4 s.
	reconnect.lost('error 2');
	await advance(3999);
	expect(reopen).toHaveBeenCalledTimes(2);
	await advance(1);
	expect(reopen).toHaveBeenCalledTimes(3);
	reconnect.playing();
	expect(reconnect.reconnecting).toBe(false);
	expect(states).toEqual([true, false]);
});

test('gives up once two minutes of attempts are spent, and says the stream is lost', async () => {
	const {reconnect, reopen, onLost, advance} = setup(Array(20).fill(new Error('down')));
	reconnect.lost('error 2');
	await advance(130000);
	expect(onLost).toHaveBeenCalledTimes(1);
	expect(reconnect.reconnecting).toBe(false);
	// 1+2+4+8+15×7 = 120 s: the next would pass the budget.
	expect(reopen).toHaveBeenCalledTimes(11);
});

test('thirty seconds of playing on gives the budget back; a pause starts that count again', async () => {
	const {reconnect, reopen, advance} = setup();
	reconnect.lost('error 2');
	await advance(1000);
	reconnect.playing();
	await advance(20000);
	reconnect.interrupted();
	reconnect.playing();
	await advance(29000);
	// Not proven yet, so a new loss carries on the old count: its next attempt waits 2 s.
	reconnect.lost('error 2');
	await advance(1999);
	expect(reopen).toHaveBeenCalledTimes(1);
	await advance(1);
	expect(reopen).toHaveBeenCalledTimes(2);
	reconnect.playing();
	await advance(30000);
	// Proven: a fresh loss starts over at a second.
	reconnect.lost('error 2');
	await advance(1000);
	expect(reopen).toHaveBeenCalledTimes(3);
});

test('another item ends the reconnect, and its pending attempt doesn\'t run', async () => {
	const {reconnect, reopen, states, advance} = setup();
	reconnect.lost('error 2');
	reconnect.end();
	await advance(5000);
	expect(reopen).not.toHaveBeenCalled();
	expect(states).toEqual([true, false]);
});
