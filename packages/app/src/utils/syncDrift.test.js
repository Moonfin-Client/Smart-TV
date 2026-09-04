import {
	driftAction,
	driftMs,
	expectedPositionTicks,
	needsSeek,
	seekLanded,
	FAST_RATE,
	SLOW_RATE,
	TICKS_PER_MS
} from './syncDrift';

const ticks = (ms) => ms * TICKS_PER_MS;

describe('expectedPositionTicks', () => {
	test('advances the reference by the elapsed server time', () => {
		const reference = {positionTicks: ticks(10000), serverTimeMs: 1000};
		expect(expectedPositionTicks(reference, 3000)).toBe(ticks(12000));
	});

	test('never runs backwards when the clock jumps', () => {
		const reference = {positionTicks: ticks(10000), serverTimeMs: 5000};
		expect(expectedPositionTicks(reference, 1000)).toBe(ticks(10000));
	});

	test('has no answer without a reference', () => {
		expect(expectedPositionTicks(null, 1000)).toBeNull();
	});
});

describe('driftMs', () => {
	test('reads positive when this player is ahead', () => {
		expect(driftMs(ticks(12000), ticks(11500))).toBe(500);
	});

	test('reads negative when this player is behind', () => {
		expect(driftMs(ticks(11000), ticks(11500))).toBe(-500);
	});

	test('has no answer without an expected position', () => {
		expect(driftMs(ticks(11000), null)).toBeNull();
	});
});

describe('driftAction', () => {
	test('leaves a gap under a tenth of a second alone', () => {
		expect(driftAction(80).type).toBe('none');
	});

	test('slows down when ahead', () => {
		expect(driftAction(600)).toEqual({type: 'rate', rate: SLOW_RATE});
	});

	test('speeds up when behind', () => {
		expect(driftAction(-600)).toEqual({type: 'rate', rate: FAST_RATE});
	});

	test('seeks once the gap is past two seconds', () => {
		expect(driftAction(-4000).type).toBe('seek');
	});

	test('seeks rather than nudging for a gap a nudge could not close', () => {
		expect(driftAction(9000).type).toBe('seek');
	});

	test('does nothing when both corrections are turned off', () => {
		expect(driftAction(9000, {useSkip: false, useSpeed: false}).type).toBe('none');
	});

	test('falls back to a nudge when seeking is off', () => {
		expect(driftAction(3000, {useSkip: false}).type).toBe('rate');
	});

	test('has no action without a measurement', () => {
		expect(driftAction(null).type).toBe('none');
	});
});

describe('needsSeek', () => {
	test('skips a seek inside the server tolerance', () => {
		expect(needsSeek(ticks(10000), ticks(10200))).toBe(false);
	});

	test('seeks once past the tolerance', () => {
		expect(needsSeek(ticks(10000), ticks(10400))).toBe(true);
	});

	test('seeks when there is no target to compare', () => {
		expect(needsSeek(ticks(10000), null)).toBe(true);
	});
});

describe('seekLanded', () => {
	test('lands once the position reaches the target', () => {
		expect(seekLanded(ticks(10000), ticks(40000), ticks(40300))).toBe(true);
	});

	test('is still in flight while the set reports the old position', () => {
		expect(seekLanded(ticks(10000), ticks(40000), ticks(10800))).toBe(false);
	});

	test('does not take a short skip on the stale reading', () => {
		expect(seekLanded(ticks(10000), ticks(10900), ticks(10300))).toBe(false);
		expect(seekLanded(ticks(10000), ticks(10900), ticks(11000))).toBe(true);
	});

	test('is not landed a long way past the target', () => {
		expect(seekLanded(ticks(10000), ticks(40000), ticks(45000))).toBe(false);
	});

	test('needs a target and a reading', () => {
		expect(seekLanded(ticks(10000), null, ticks(10000))).toBe(false);
		expect(seekLanded(null, ticks(10000), ticks(10200))).toBe(true);
	});
});
