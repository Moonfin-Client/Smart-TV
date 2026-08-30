import {createSkipGovernor, chooseCorrection, ATTEMPT_DEADLINE_MS, SETTLE_WINDOW_MS, MAX_FAILED_ATTEMPTS, MAX_SKIPS_PER_ITEM, DEFAULT_SEEK_ALLOWANCE_MS, MAX_SEEK_ALLOWANCE_MS, ALLOWANCE_DECAY_MS, MAX_WAIT_MS} from './syncCorrection';
import {correctionOptions, SLOW_RATE, FAST_RATE} from './syncDrift';

const playing = (nowMs, positionMs, driftMs) => ({nowMs, positionMs, driftMs, isPlaying: true, isBuffering: false});
const stalled = (nowMs, positionMs, driftMs) => ({nowMs, positionMs, driftMs, isPlaying: true, isBuffering: true});

// Issues a skip and walks it through landing and rendering.
const landAndSettle = (g, {at, from, to}) => {
	g.onSkip({nowMs: at, fromMs: from, targetMs: to, driftMs: from - to});
	expect(g.evaluate(playing(at + 2000, to + 50, 0))).toBe('defer');
	return g.evaluate(playing(at + 2000 + SETTLE_WINDOW_MS, to + 50 + SETTLE_WINDOW_MS, 0));
};

describe('createSkipGovernor', () => {
	test('allows a skip when nothing is in flight', () => {
		const g = createSkipGovernor();
		expect(g.evaluate(playing(0, 10000, -3000))).toBe('skip');
	});

	test('does nothing at all while the pipeline is stalled or paused', () => {
		const g = createSkipGovernor();
		expect(g.evaluate(stalled(0, 10000, -3000))).toBe('defer');
		expect(g.evaluate({nowMs: 0, positionMs: 10000, driftMs: -3000, isPlaying: false, isBuffering: false})).toBe('defer');
	});

	test('holds off while a skip is still landing', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		// The set keeps reporting the old position for a while.
		expect(g.evaluate(playing(2000, 10100, -12000))).toBe('defer');
		expect(g.evaluate(playing(4000, 10200, -14000))).toBe('defer');
	});

	test('holds off while a landed skip is still not rendering', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		expect(g.evaluate(playing(2000, 20000, -2000))).toBe('defer');
		// Position parked on the target, no frames yet.
		expect(g.evaluate(playing(4000, 20000, -4000))).toBe('defer');
		expect(g.evaluate(stalled(6000, 20000, -6000))).toBe('defer');
	});

	test('lets the next skip through once the last one landed and rendered', () => {
		const g = createSkipGovernor();
		expect(landAndSettle(g, {at: 0, from: 10000, to: 20000})).toBe('skip');
	});

	test('a skip that did not close the gap counts against the set', () => {
		const g = createSkipGovernor();
		for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
			const at = i * 10000;
			g.onSkip({nowMs: at, fromMs: 10000, targetMs: 20000, driftMs: -10000});
			g.evaluate(playing(at + 2000, 20000, -9000));
			// Rendering again, but no nearer the group than before.
			const verdict = g.evaluate(playing(at + 2000 + SETTLE_WINDOW_MS, 20000 + SETTLE_WINDOW_MS, -9000));
			expect(verdict).toBe(i === MAX_FAILED_ATTEMPTS - 1 ? 'nudge' : 'skip');
		}
		expect(g.hasGivenUp()).toBe(true);
	});

	test('a skip that never settles is abandoned at the deadline and counts as failed', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		expect(g.evaluate(playing(ATTEMPT_DEADLINE_MS - 1, 10000, -20000))).toBe('defer');
		expect(g.evaluate(playing(ATTEMPT_DEADLINE_MS, 10000, -20000))).toBe('defer');
		expect(g.evaluate(playing(ATTEMPT_DEADLINE_MS + 2000, 12000, -20000))).toBe('skip');
	});

	test('a good skip clears the failure streak', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.evaluate(playing(2000, 20000, -9000));
		g.evaluate(playing(2000 + SETTLE_WINDOW_MS, 20000 + SETTLE_WINDOW_MS, -9000));
		expect(landAndSettle(g, {at: 20000, from: 20000, to: 30000})).toBe('skip');
		g.onSkip({nowMs: 40000, fromMs: 30000, targetMs: 40000, driftMs: -10000});
		g.evaluate(playing(42000, 40000, -9000));
		expect(g.evaluate(playing(42000 + SETTLE_WINDOW_MS, 40000 + SETTLE_WINDOW_MS, -9000))).toBe('skip');
		expect(g.hasGivenUp()).toBe(false);
	});

	test('stops skipping after the per-item budget', () => {
		const g = createSkipGovernor();
		let verdict = 'skip';
		for (let i = 0; i < MAX_SKIPS_PER_ITEM; i++) {
			expect(verdict).toBe('skip');
			verdict = landAndSettle(g, {at: i * 10000, from: 10000, to: 20000});
		}
		expect(verdict).toBe('nudge');
		expect(g.skipsUsed()).toBe(MAX_SKIPS_PER_ITEM);
	});

	test('a start holds off skips until the set is seen moving', () => {
		const g = createSkipGovernor();
		g.onStart({nowMs: 0, fromMs: 10000});
		// Reported playing, position not moving yet: start latency.
		expect(g.evaluate(playing(2000, 10000, -2000))).toBe('defer');
		expect(g.evaluate(playing(2000 + SETTLE_WINDOW_MS, 10020, -2500))).toBe('defer');
		// Moving now, and the lag that is left is real.
		expect(g.evaluate(playing(3500, 10500, -3000))).toBe('defer');
		expect(g.evaluate(playing(3500 + SETTLE_WINDOW_MS, 10500 + SETTLE_WINDOW_MS, -3000))).toBe('skip');
	});

	test('a start counts as neither a skip nor a failure and teaches nothing', () => {
		const g = createSkipGovernor();
		g.onStart({nowMs: 0, fromMs: 10000});
		g.evaluate(playing(4000, 10100, -4000));
		g.evaluate(playing(4000 + SETTLE_WINDOW_MS, 10100 + SETTLE_WINDOW_MS, -4000));
		expect(g.skipsUsed()).toBe(0);
		expect(g.hasGivenUp()).toBe(false);
		expect(g.seekAllowanceMs()).toBe(DEFAULT_SEEK_ALLOWANCE_MS);
	});

	test('a start that never moves is dropped at the deadline without counting', () => {
		const g = createSkipGovernor();
		for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
			const at = i * 20000;
			g.onStart({nowMs: at, fromMs: 10000});
			expect(g.evaluate(playing(at + ATTEMPT_DEADLINE_MS, 10000, -13000))).toBe('defer');
		}
		expect(g.hasGivenUp()).toBe(false);
		expect(g.evaluate(playing(100000, 10000, -13000))).toBe('skip');
	});

	test('a start does not replace a skip still in flight', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.onStart({nowMs: 100, fromMs: 10000});
		// Still the skip: landing at its target is what settles it.
		expect(g.evaluate(playing(2000, 20050, -1000))).toBe('defer');
		expect(g.evaluate(playing(2000 + SETTLE_WINDOW_MS, 20050 + SETTLE_WINDOW_MS, -1000))).toBe('skip');
		expect(g.skipsUsed()).toBe(1);
	});

	test('a group command drops the open attempt without counting it', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.cancel();
		expect(g.evaluate(playing(2000, 10000, -3000))).toBe('skip');
		expect(g.hasGivenUp()).toBe(false);
	});

	test('a new item hands the budget back', () => {
		const g = createSkipGovernor();
		for (let i = 0; i < MAX_SKIPS_PER_ITEM; i++) landAndSettle(g, {at: i * 10000, from: 10000, to: 20000});
		g.reset();
		expect(g.evaluate(playing(0, 10000, -3000))).toBe('skip');
	});
});

describe('seek allowance', () => {
	test('starts at the default before any skip has been measured', () => {
		expect(createSkipGovernor().seekAllowanceMs()).toBe(DEFAULT_SEEK_ALLOWANCE_MS);
	});

	test('takes the cost of a skip from issue to rendering', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.evaluate(playing(4000, 20000, 0));
		g.evaluate(playing(4000 + SETTLE_WINDOW_MS, 20000 + SETTLE_WINDOW_MS, 0));
		expect(g.seekAllowanceMs()).toBe(4000 + SETTLE_WINDOW_MS);
	});

	test('decays from a slow seek rather than dropping to the next fast one', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.evaluate(playing(6000, 20000, 0));
		g.evaluate(playing(6000 + SETTLE_WINDOW_MS, 20000 + SETTLE_WINDOW_MS, 0));
		const slow = g.seekAllowanceMs();
		g.onSkip({nowMs: 20000, fromMs: 20000, targetMs: 30000, driftMs: -10000});
		g.evaluate(playing(20500, 30000, 0));
		g.evaluate(playing(20500 + SETTLE_WINDOW_MS, 30000 + SETTLE_WINDOW_MS, 0));
		expect(g.seekAllowanceMs()).toBe(slow - ALLOWANCE_DECAY_MS);
	});

	test('is capped', () => {
		const g = createSkipGovernor();
		g.onSkip({nowMs: 0, fromMs: 10000, targetMs: 20000, driftMs: -10000});
		g.evaluate(playing(12000, 20000, 0));
		g.evaluate(playing(12000 + SETTLE_WINDOW_MS, 20000 + SETTLE_WINDOW_MS, 0));
		expect(g.seekAllowanceMs()).toBe(MAX_SEEK_ALLOWANCE_MS);
	});
});

describe('chooseCorrection', () => {
	const options = correctionOptions({});

	test('does nothing on a deferred verdict whatever the drift', () => {
		expect(chooseCorrection(-30000, 'defer', options, 1500)).toEqual({type: 'none'});
	});

	test('behind by a lot, skips ahead by the allowance', () => {
		expect(chooseCorrection(-6000, 'skip', options, 1500)).toEqual({type: 'skip', aheadMs: 1500});
	});

	test('behind by more than the skip threshold, skips however much a seek costs', () => {
		expect(chooseCorrection(-3000, 'skip', options, 4000)).toEqual({type: 'skip', aheadMs: 4000});
		expect(chooseCorrection(-6000, 'skip', options, 4000)).toEqual({type: 'skip', aheadMs: 4000});
	});

	test('with rate nudges off, a lateness under the skip threshold is tolerated', () => {
		const noSpeed = {...options, useSpeed: false};
		expect(chooseCorrection(-1700, 'skip', noSpeed, 1500)).toEqual({type: 'none'});
		expect(chooseCorrection(-2500, 'skip', noSpeed, 1500)).toEqual({type: 'skip', aheadMs: 1500});
		expect(chooseCorrection(-2500, 'nudge', noSpeed, 1500)).toEqual({type: 'none'});
	});

	test('behind by a lot with skips used up, speeds up if the gap allows', () => {
		expect(chooseCorrection(-3000, 'nudge', options, 1500)).toEqual({type: 'rate', rate: FAST_RATE});
		expect(chooseCorrection(-30000, 'nudge', options, 1500)).toEqual({type: 'none'});
	});

	test('behind by a little, speeds up', () => {
		expect(chooseCorrection(-500, 'skip', options, 1500)).toEqual({type: 'rate', rate: FAST_RATE});
	});

	test('ahead by a little, slows down', () => {
		expect(chooseCorrection(3000, 'skip', options, 1500)).toEqual({type: 'rate', rate: SLOW_RATE});
	});

	test('ahead by more than a nudge can take out, waits for the group', () => {
		expect(chooseCorrection(7000, 'skip', options, 1500)).toEqual({type: 'wait', ms: 7000});
		expect(chooseCorrection(7000, 'nudge', options, 1500)).toEqual({type: 'wait', ms: 7000});
	});

	test('ahead by too much to sit through, skips back', () => {
		expect(chooseCorrection(MAX_WAIT_MS + 1, 'skip', options, 1500)).toEqual({type: 'skip', aheadMs: 0});
		expect(chooseCorrection(MAX_WAIT_MS + 1, 'nudge', options, 1500)).toEqual({type: 'none'});
	});

	test('with rate nudges off, a lead is answered with a wait', () => {
		expect(chooseCorrection(3000, 'skip', {...options, useSpeed: false}, 1500)).toEqual({type: 'wait', ms: 3000});
	});
});
