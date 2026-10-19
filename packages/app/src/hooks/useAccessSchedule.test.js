import {act, renderHook} from '@testing-library/react';
import {useAccessSchedule} from './useAccessSchedule';

// 2026-10-19 is a Monday.
const at = (hour, minute = 0, second = 0) => new Date(2026, 9, 19, hour, minute, second);
const policyOf = (hours, extra = {}) => ({
	Policy: {AccessSchedules: [{DayOfWeek: 'Monday', StartHour: hours[0], EndHour: hours[1]}], ...extra}
});

const flush = async (ms = 0) => {
	await act(async () => {
		jest.advanceTimersByTime(ms);
	});
};

describe('useAccessSchedule', () => {
	let clock;
	let user;

	const mount = (overrides = {}) => {
		const onBlocked = jest.fn();
		const fetchUser = jest.fn(async () => user);
		const view = renderHook((props) => useAccessSchedule({
			userId: 'u1', enabled: true, fetchUser, getNow: () => new Date(clock), onBlocked, ...props
		}), {initialProps: overrides});
		return {...view, onBlocked, fetchUser};
	};

	beforeEach(() => {
		jest.useFakeTimers();
		clock = at(12);
		user = policyOf([8, 20]);
	});

	afterEach(() => jest.useRealTimers());

	test('is not blocked inside the window', async () => {
		const {result, onBlocked} = mount();
		await flush();

		expect(result.current.blocked).toBe(false);
		expect(onBlocked).not.toHaveBeenCalled();
	});

	test('blocks when the window ends', async () => {
		clock = at(19, 59, 0);
		const {result, onBlocked} = mount();
		await flush();
		expect(result.current.blocked).toBe(false);

		clock = at(20, 0, 2);
		await flush(62 * 1000);

		expect(result.current.blocked).toBe(true);
		expect(result.current.nextAccess).toEqual(new Date(2026, 9, 26, 8));
		expect(onBlocked).toHaveBeenCalledTimes(1);
	});

	test('is blocked on arrival outside the window', async () => {
		clock = at(21);
		const {result, onBlocked} = mount();
		await flush();

		expect(result.current.blocked).toBe(true);
		expect(onBlocked).toHaveBeenCalledTimes(1);
	});

	test('clears within a minute once the schedule is extended', async () => {
		clock = at(21);
		const {result} = mount();
		await flush();
		expect(result.current.blocked).toBe(true);

		user = policyOf([8, 23]);
		await flush(60 * 1000);

		expect(result.current.blocked).toBe(false);
		expect(result.current.nextAccess).toBeNull();
	});

	test('does not block when the server now allows it', async () => {
		clock = at(19, 59, 59);
		const {result, fetchUser} = mount();
		await flush();

		user = policyOf([8, 23]);
		clock = at(20, 0, 2);
		await flush(3000);

		expect(fetchUser).toHaveBeenCalledTimes(2);
		expect(result.current.blocked).toBe(false);
	});

	test('keeps the last schedule when a read fails and retries', async () => {
		clock = at(19, 59, 59);
		const {result, fetchUser} = mount();
		await flush();
		fetchUser.mockRejectedValueOnce(new Error('offline'));

		clock = at(20, 0, 2);
		await flush(2000);
		expect(result.current.blocked).toBe(false);

		await flush(15 * 1000);
		expect(fetchUser).toHaveBeenCalledTimes(3);
		expect(result.current.blocked).toBe(true);
	});

	test('notices a schedule shortened behind its back within a minute', async () => {
		const {result} = mount();
		await flush();
		expect(result.current.blocked).toBe(false);

		user = policyOf([8, 11]);
		await flush(60 * 1000);

		expect(result.current.blocked).toBe(true);
	});

	test('refreshes the next access time while staying blocked', async () => {
		clock = at(21);
		const {result, onBlocked} = mount();
		await flush();
		expect(result.current.nextAccess).toEqual(new Date(2026, 9, 26, 8));

		user = {Policy: {AccessSchedules: [
			{DayOfWeek: 'Monday', StartHour: 8, EndHour: 20},
			{DayOfWeek: 'Tuesday', StartHour: 6, EndHour: 20}
		]}};
		await flush(60 * 1000);

		expect(result.current.blocked).toBe(true);
		expect(result.current.nextAccess).toEqual(new Date(2026, 9, 20, 6));
		expect(onBlocked).toHaveBeenCalledTimes(1);
	});

	test('recheck reads the policy again', async () => {
		const {result, fetchUser} = mount();
		await flush();

		clock = at(21);
		await act(async () => {
			result.current.recheck();
		});

		expect(fetchUser).toHaveBeenCalledTimes(2);
		expect(result.current.blocked).toBe(true);
	});

	test('administrators are never blocked', async () => {
		clock = at(21);
		user = policyOf([8, 20], {IsAdministrator: true});
		const {result, onBlocked} = mount();
		await flush();

		expect(result.current.blocked).toBe(false);
		expect(onBlocked).not.toHaveBeenCalled();
	});

	test('does nothing when disabled or signed out', async () => {
		clock = at(21);
		const first = mount({enabled: false});
		const second = mount({userId: null});
		await flush();

		expect(first.fetchUser).not.toHaveBeenCalled();
		expect(second.fetchUser).not.toHaveBeenCalled();
		expect(first.result.current.blocked).toBe(false);
	});

	test('starts over for another user', async () => {
		clock = at(21);
		const {result, rerender} = mount();
		await flush();
		expect(result.current.blocked).toBe(true);

		user = {Policy: {AccessSchedules: []}};
		rerender({userId: 'u2'});
		await flush();

		expect(result.current.blocked).toBe(false);
	});
});
