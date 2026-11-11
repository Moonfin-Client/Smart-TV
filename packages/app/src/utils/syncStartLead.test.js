import {loadStartLeadMs, nextStartLeadMs, saveStartLeadMs, startDelayMs, startGapMs, MAX_START_LEAD_MS} from './syncStartLead';

describe('startDelayMs', () => {
	test('a start moving is timed from play(), less the media played since', () => {
		// play() at 1000 from 60 s; at 2000 it has played 400 ms, so it started moving at 1600.
		expect(startDelayMs({calledAtMs: 1000, fromMs: 60000, positionMs: 60400, atMs: 2000})).toBe(600);
	});

	test('not moved yet, moved backwards, or first moving after five seconds is not a start to learn from', () => {
		expect(startDelayMs({calledAtMs: 1000, fromMs: 60000, positionMs: 60050, atMs: 1500})).toBeNull();
		expect(startDelayMs({calledAtMs: 1000, fromMs: 60000, positionMs: 50000, atMs: 1500})).toBeNull();
		expect(startDelayMs({calledAtMs: 1000, fromMs: 60000, positionMs: 60300, atMs: 9000})).toBeNull();
	});
});

describe('nextStartLeadMs', () => {
	test('the first start sets the lead, later ones average into it, and it is capped', () => {
		expect(nextStartLeadMs(0, 430)).toBe(430);
		expect(nextStartLeadMs(430, 370)).toBe(400);
		expect(nextStartLeadMs(0, 9000)).toBe(MAX_START_LEAD_MS);
	});
});

describe('the stored lead', () => {
	beforeEach(() => localStorage.clear());

	test('survives a launch, and starts at none without one', () => {
		expect(loadStartLeadMs()).toBe(0);
		saveStartLeadMs(430);
		expect(loadStartLeadMs()).toBe(430);
	});
});

describe('startGapMs', () => {
	test('a set paused near the start is that far behind or ahead, and one further off is not', () => {
		// Landed on the keyframe 0.6 s before an 81 s start.
		expect(startGapMs(804000000, 810000000)).toBe(600);
		expect(startGapMs(813000000, 810000000)).toBe(-300);
		expect(startGapMs(780000000, 810000000)).toBeNull();
		expect(startGapMs(null, 810000000)).toBeNull();
	});
});
