import {createLoadBudget, FIRST_LOAD_WAIT_MS, MAX_LOAD_WAIT_MS, MAX_LOAD_LEAD_MS, LOAD_GIVE_UP_MS} from './syncLoadBudget';

describe('createLoadBudget', () => {
	test('the first load runs at once, with no lead', () => {
		const budget = createLoadBudget();
		expect(budget.allows(0)).toBe(true);
		expect(budget.leadMs()).toBe(0);
	});

	test('the next load aims ahead by the time the last one took', () => {
		const budget = createLoadBudget();
		budget.onStart(1000);
		budget.onPlaying(5500);
		expect(budget.leadMs()).toBe(4500);
	});

	test('a catch-up\'s miss moves the aim by half as much', () => {
		const budget = createLoadBudget();
		budget.onStart(0, false);
		budget.onPlaying(2000);
		// Aimed 2 s ahead, landed 4 s behind (a keyframe short of the target): aim 4 s ahead next time.
		budget.onStart(20000);
		budget.onPlaying(23000, -4000);
		expect(budget.leadMs()).toBe(4000);
		// Then 1.5 s ahead: back off by half that.
		budget.onStart(50000);
		budget.onPlaying(53000, 1500);
		expect(budget.leadMs()).toBe(3250);
	});

	test('a catch-up that landed behind aims at least as far ahead as it took to load', () => {
		const budget = createLoadBudget();
		// No lead yet, a 2 s load, landed 2 s behind: half the miss would aim only 1 s ahead.
		budget.onStart(0);
		budget.onPlaying(2000, -2000);
		expect(budget.leadMs()).toBe(2000);
		// Ahead is still backed off by half: the load time is no floor then.
		budget.onStart(20000);
		budget.onPlaying(21000, 1000);
		expect(budget.leadMs()).toBe(1500);
	});

	test('the lead is capped', () => {
		const budget = createLoadBudget();
		budget.onStart(0);
		budget.onPlaying(25000);
		expect(budget.leadMs()).toBe(MAX_LOAD_LEAD_MS);
	});

	test('one load at a time, then a wait that doubles until the set converges', () => {
		const budget = createLoadBudget();
		budget.onStart(0);
		expect(budget.allows(1000)).toBe(false);
		budget.onPlaying(4000);
		expect(budget.allows(4000 + FIRST_LOAD_WAIT_MS - 1)).toBe(false);
		expect(budget.allows(4000 + FIRST_LOAD_WAIT_MS)).toBe(true);

		budget.onStart(20000);
		budget.onPlaying(24000);
		expect(budget.allows(24000 + FIRST_LOAD_WAIT_MS)).toBe(false);
		expect(budget.allows(24000 + 2 * FIRST_LOAD_WAIT_MS)).toBe(true);

		for (let i = 0; i < 6; i++) {
			budget.onStart(100000 * (i + 1));
			budget.onPlaying(100000 * (i + 1));
		}
		expect(budget.allows(600000 + MAX_LOAD_WAIT_MS - 1)).toBe(false);
		expect(budget.allows(600000 + MAX_LOAD_WAIT_MS)).toBe(true);
	});

	test('converging lets the next load run at once and keeps the lead', () => {
		const budget = createLoadBudget();
		budget.onStart(0);
		budget.onPlaying(3000);
		budget.onConverged();
		expect(budget.allows(3001)).toBe(true);
		expect(budget.leadMs()).toBe(3000);
	});

	test('a load the room asked for teaches the lead without holding the next one back', () => {
		const budget = createLoadBudget();
		budget.onStart(0, false);
		budget.onPlaying(6000);
		expect(budget.leadMs()).toBe(6000);
		expect(budget.allows(6001)).toBe(true);
	});

	test('a load that never plays stops holding the next one back', () => {
		const budget = createLoadBudget();
		budget.onStart(0);
		expect(budget.allows(LOAD_GIVE_UP_MS - 1)).toBe(false);
		expect(budget.allows(LOAD_GIVE_UP_MS)).toBe(true);
	});
});
