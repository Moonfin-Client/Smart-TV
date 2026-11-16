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

	describe('with the plugin access window', () => {
		const windowOf = (allowed, untilCloseMs = null, untilOpenMs = null) => ({allowed, untilCloseMs, untilOpenMs});

		test('blocks on its answer alone and names the opening from now', async () => {
			clock = at(21);
			const serverRefuses = jest.fn(async () => false);
			const fetchAccessWindow = jest.fn(async () => windowOf(false, null, 11 * 3600 * 1000));
			const {result, onBlocked, fetchUser} = mount({fetchAccessWindow, serverRefuses});
			await flush();

			expect(result.current.blocked).toBe(true);
			expect(result.current.nextAccess).toEqual(new Date(2026, 9, 20, 8));
			expect(onBlocked).toHaveBeenCalledTimes(1);
			expect(fetchUser).not.toHaveBeenCalled();
			expect(serverRefuses).not.toHaveBeenCalled();
		});

		test('names the opening to the nearest minute', async () => {
			clock = new Date(2026, 9, 19, 21, 0, 0, 750);
			// A clock a moment behind the server's lands just short of 08:00
			const fetchAccessWindow = jest.fn(async () => windowOf(false, null, 11 * 3600 * 1000 - 1000));
			const {result} = mount({fetchAccessWindow});
			await flush();

			expect(result.current.nextAccess).toEqual(new Date(2026, 9, 20, 8));
		});

		test('checks again when it closes, not a minute later', async () => {
			let answer = windowOf(true, 30 * 1000);
			const fetchAccessWindow = jest.fn(async () => answer);
			const {result, onBlocked} = mount({fetchAccessWindow});
			await flush();
			expect(result.current.blocked).toBe(false);

			answer = windowOf(false);
			await flush(29 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(1);
			await flush(1000);

			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
			expect(result.current.blocked).toBe(true);
			expect(result.current.nextAccess).toBeNull();
			expect(onBlocked).toHaveBeenCalledTimes(1);
		});

		test('lets the user back in when it opens', async () => {
			let answer = windowOf(false, null, 30 * 1000);
			const fetchAccessWindow = jest.fn(async () => answer);
			const {result} = mount({fetchAccessWindow});
			await flush();
			expect(result.current.blocked).toBe(true);

			answer = windowOf(true, 12 * 3600 * 1000);
			await flush(30 * 1000);

			expect(result.current.blocked).toBe(false);
			expect(result.current.nextAccess).toBeNull();
		});

		test('checks every 15 minutes when nothing will close', async () => {
			const fetchAccessWindow = jest.fn(async () => windowOf(true));
			mount({fetchAccessWindow});
			await flush();
			await flush(14 * 60 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(1);
			await flush(60 * 1000);

			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
		});

		test('judges a check by the schedule and the server when it can\'t be read, and asks again', async () => {
			clock = at(21);
			const serverRefuses = jest.fn(async () => true);
			const fetchAccessWindow = jest.fn(async () => {
				throw new Error('500');
			});
			const {result, onBlocked, fetchUser} = mount({fetchAccessWindow, serverRefuses});
			await flush();

			expect(result.current.blocked).toBe(true);
			expect(fetchUser).toHaveBeenCalledTimes(1);
			expect(serverRefuses).toHaveBeenCalledTimes(1);

			await flush(60 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
			expect(onBlocked).toHaveBeenCalledTimes(1);
		});

		test('blocks after a reported close when the window can\'t be read then', async () => {
			clock = at(19, 59, 30);
			let fail = false;
			const serverRefuses = jest.fn(async () => true);
			const fetchAccessWindow = jest.fn(async () => {
				if (fail) throw new Error('500');
				return windowOf(true, 31 * 1000);
			});
			const {result} = mount({fetchAccessWindow, serverRefuses});
			await flush();
			expect(result.current.blocked).toBe(false);

			fail = true;
			clock = at(20, 0, 1);
			await flush(31 * 1000);

			expect(result.current.blocked).toBe(true);
		});

		test('keeps a block from the window when the user can\'t be read either', async () => {
			let fail = false;
			const fetchAccessWindow = jest.fn(async () => {
				if (fail) throw new Error('offline');
				return windowOf(false, null, 3600 * 1000);
			});
			const fetchUser = jest.fn(async () => {
				if (fail) throw new Error('offline');
				return user;
			});
			clock = at(21);
			const {result, onBlocked} = mount({fetchAccessWindow, fetchUser});
			await flush();
			fail = true;
			await flush(60 * 1000);

			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
			expect(result.current.blocked).toBe(true);
			await flush(15 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(3);
			expect(result.current.blocked).toBe(true);
			expect(onBlocked).toHaveBeenCalledTimes(1);
		});

		test('counts the durations from when it asked, not from the answer', async () => {
			clock = at(7, 59, 30);
			let calls = 0;
			const fetchAccessWindow = jest.fn(() => {
				calls++;
				if (calls > 1) return Promise.resolve(windowOf(true, 12 * 3600 * 1000));
				return new Promise((resolve) => setTimeout(() => {
					clock = at(7, 59, 50);
					resolve(windowOf(false, null, 30 * 1000));
				}, 20 * 1000));
			});
			const {result} = mount({fetchAccessWindow});
			await flush(20 * 1000);
			expect(result.current.blocked).toBe(true);
			expect(result.current.nextAccess).toEqual(at(8));

			await flush(9 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(1);
			await flush(1000);

			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
			expect(result.current.blocked).toBe(false);
		});

		test('names the opening from the answer, not from a queued request', async () => {
			clock = at(7, 58);
			const fetchAccessWindow = jest.fn(() => new Promise((resolve) => setTimeout(() => {
				// Forty seconds in the queue; the server works it out at 07:58:40
				clock = at(7, 58, 40);
				resolve(windowOf(false, null, 80 * 1000));
			}, 40 * 1000)));
			const {result} = mount({fetchAccessWindow});
			await flush(40 * 1000);

			expect(result.current.nextAccess).toEqual(at(8));
		});

		test('keeps the last answer when the window can\'t be read and the server gives none', async () => {
			// Noon: open by the schedule on this TV's clock
			let fail = false;
			const serverRefuses = jest.fn(async () => null);
			const fetchAccessWindow = jest.fn(async () => {
				if (fail) throw new Error('500');
				return windowOf(false, null, 3600 * 1000);
			});
			const {result} = mount({fetchAccessWindow, serverRefuses});
			await flush();
			expect(result.current.blocked).toBe(true);

			fail = true;
			await flush(60 * 1000);

			expect(fetchAccessWindow).toHaveBeenCalledTimes(2);
			expect(serverRefuses).toHaveBeenCalledTimes(1);
			expect(result.current.blocked).toBe(true);
			await flush(15 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(3);
		});

		test('falls back to the schedule and the server when it can\'t say, and stops asking', async () => {
			clock = at(21);
			const serverRefuses = jest.fn(async () => true);
			const fetchAccessWindow = jest.fn(async () => null);
			const {result, fetchUser} = mount({fetchAccessWindow, serverRefuses});
			await flush();

			expect(result.current.blocked).toBe(true);
			expect(fetchUser).toHaveBeenCalledTimes(1);
			expect(serverRefuses).toHaveBeenCalledTimes(1);

			await flush(60 * 1000);
			expect(fetchAccessWindow).toHaveBeenCalledTimes(1);
			expect(fetchUser).toHaveBeenCalledTimes(2);
		});
	});
});
