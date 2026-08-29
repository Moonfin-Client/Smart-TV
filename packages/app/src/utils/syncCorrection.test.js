import {createSkipGovernor, ATTEMPT_DEADLINE_MS, SETTLE_WINDOW_MS, MAX_FAILED_ATTEMPTS, MAX_SKIPS_PER_ITEM} from './syncCorrection';

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
