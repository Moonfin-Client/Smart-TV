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

	test('blocks when the server turns the user away though this clock says the window is open', async () => {
		const serverRefuses = jest.fn(async () => true);
		const {result, onBlocked} = mount({serverRefuses});
		await flush();

		expect(result.current.blocked).toBe(true);
		expect(result.current.nextAccess).toBeNull();
		expect(onBlocked).toHaveBeenCalledTimes(1);
	});

	test('stays open while the server allows it though this clock says the window is closed', async () => {
		clock = at(21);
		const {result, onBlocked} = mount({serverRefuses: async () => false});
		await flush();

		expect(result.current.blocked).toBe(false);
		expect(onBlocked).not.toHaveBeenCalled();
	});

	describe('with the server clock', () => {
		// The device says Monday 21:00, after the window, while the server, eight hours west of UTC
		// with the device a UTC one, says Monday 12:00.
		let deviceUtcMs;
		const serverNoon = {utcTime: '2026-10-19T20:00:00Z', utcOffsetSeconds: -28800};
		const mountWithTime = (fetchServerTime, overrides = {}) =>
			mount({fetchServerTime, getDeviceUtcMs: () => deviceUtcMs, ...overrides});

		beforeEach(() => {
			clock = at(21);
			deviceUtcMs = Date.UTC(2026, 9, 19, 20, 0);
		});

		test('stays open when the server clock says the window is open though this one says closed', async () => {
			const {result, onBlocked} = mountWithTime(jest.fn(async () => serverNoon));
			await flush();

			expect(result.current.blocked).toBe(false);
			expect(onBlocked).not.toHaveBeenCalled();
			expect(result.current.getScheduleNow().getHours()).toBe(12);
		});

		test('blocks when the server clock says closed though this one says open, naming the opening on it', async () => {
			clock = at(12);
			const {result} = mountWithTime(jest.fn(async () => ({utcTime: '2026-10-20T05:00:00Z', utcOffsetSeconds: -28800})), {
				getDeviceUtcMs: () => Date.UTC(2026, 9, 20, 5, 0)
			});
			await flush();

			expect(result.current.blocked).toBe(true);
			expect(result.current.nextAccess).toEqual(new Date(2026, 9, 26, 8));
		});

		test('lets the server answer of the user still decide', async () => {
			const {result} = mountWithTime(jest.fn(async () => serverNoon), {serverRefuses: async () => true});
			await flush();

			expect(result.current.blocked).toBe(true);
		});

		test('goes by this clock and stops asking when the server has no time', async () => {
			const fetchServerTime = jest.fn(async () => null);
			const {result} = mountWithTime(fetchServerTime);
			await flush();

			expect(result.current.blocked).toBe(true);
			expect(result.current.getScheduleNow()).toEqual(clock);

			await flush(3 * 60 * 1000);
			expect(fetchServerTime).toHaveBeenCalledTimes(1);
		});

		test('keeps the last server clock when a later read fails', async () => {
			const fetchServerTime = jest.fn()
				.mockImplementationOnce(async () => serverNoon)
				.mockImplementation(async () => {
					throw new Error('offline');
				});
			const {result} = mountWithTime(fetchServerTime);
			await flush();

			deviceUtcMs += 60 * 1000;
			await flush(61 * 1000);

			expect(fetchServerTime).toHaveBeenCalledTimes(2);
			expect(result.current.blocked).toBe(false);
			expect(result.current.getScheduleNow().getHours()).toBe(12);
		});

		test('does not ask once the time is up, when the server would refuse it', async () => {
			const fetchServerTime = jest.fn(async () => ({utcTime: '2026-10-20T05:00:00Z', utcOffsetSeconds: -28800}));
			deviceUtcMs = Date.UTC(2026, 9, 20, 5, 0);
			const {result} = mountWithTime(fetchServerTime);
			await flush();
			expect(result.current.blocked).toBe(true);
			expect(fetchServerTime).toHaveBeenCalledTimes(1);

			await flush(3 * 60 * 1000);
			expect(fetchServerTime).toHaveBeenCalledTimes(1);
		});

		test('is not asked of an administrator or a user without a schedule', async () => {
			const fetchServerTime = jest.fn(async () => serverNoon);
			user = policyOf([8, 20], {IsAdministrator: true});
			mountWithTime(fetchServerTime);
			user = {Policy: {AccessSchedules: []}};
			mountWithTime(fetchServerTime);
			await flush();

			expect(fetchServerTime).not.toHaveBeenCalled();
		});
	});

	test('goes by this clock when the server cant tell', async () => {
		clock = at(21);
		const {result} = mount({serverRefuses: async () => null});
		await flush();

		expect(result.current.blocked).toBe(true);
		expect(result.current.nextAccess).toEqual(new Date(2026, 9, 26, 8));
	});

	test('reads a user without a schedule every 15 minutes and never asks the server', async () => {
		user = {Policy: {AccessSchedules: []}};
		const serverRefuses = jest.fn(async () => true);
		const {fetchUser} = mount({serverRefuses});
		await flush();
		await flush(14 * 60 * 1000);
		expect(fetchUser).toHaveBeenCalledTimes(1);

		await flush(60 * 1000);
		expect(fetchUser).toHaveBeenCalledTimes(2);
		expect(serverRefuses).not.toHaveBeenCalled();
	});

	test('an older check never replaces the answer of a newer one', async () => {
		clock = at(21);
		let releaseFirst;
		const fetchUser = jest.fn()
			.mockImplementationOnce(() => new Promise((resolve) => {
				releaseFirst = resolve;
			}))
			.mockImplementation(async () => user);
		const {result} = mount({fetchUser});
		await act(async () => {
			result.current.recheck();
		});
		expect(result.current.blocked).toBe(true);

		await act(async () => {
			releaseFirst(policyOf([8, 23]));
		});
		expect(result.current.blocked).toBe(true);
	});

	test('stops checking once unmounted', async () => {
		clock = at(21);
		const {fetchUser, unmount} = mount();
		await flush();
		expect(fetchUser).toHaveBeenCalledTimes(1);

		unmount();
		await flush(5 * 60 * 1000);
		expect(fetchUser).toHaveBeenCalledTimes(1);
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
