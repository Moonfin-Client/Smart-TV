import {
	isAllowed, nextAccessStart, nextBoundary, readSchedules, readServerClock, serverWallClock
} from './accessSchedule';

const entry = (dayOfWeek, startHour, endHour) => ({dayOfWeek, startHour, endHour});

// 2026-10-19 is a Monday.
const at = (day, hour, minute = 0, second = 0) => new Date(2026, 9, day, hour, minute, second);
const MONDAY = 19;
const TUESDAY = 20;
const FRIDAY = 23;
const SATURDAY = 24;
const SUNDAY = 25;

describe('isAllowed', () => {
	test('a user with no entries is always allowed', () => {
		expect(isAllowed([], at(MONDAY, 3))).toBe(true);
		expect(isAllowed(undefined, at(MONDAY, 3))).toBe(true);
	});

	test('allows the hours of the day an entry covers', () => {
		const schedules = [entry('Monday', 8, 20)];

		expect(isAllowed(schedules, at(MONDAY, 12))).toBe(true);
		expect(isAllowed(schedules, at(MONDAY, 7, 59, 59))).toBe(false);
		expect(isAllowed(schedules, at(MONDAY, 20, 0, 1))).toBe(false);
	});

	test('the start and the end themselves are still allowed', () => {
		const schedules = [entry('Monday', 8, 20)];

		expect(isAllowed(schedules, at(MONDAY, 8))).toBe(true);
		expect(isAllowed(schedules, at(MONDAY, 20))).toBe(true);
	});

	test('another day is not allowed', () => {
		expect(isAllowed([entry('Monday', 8, 20)], at(TUESDAY, 12))).toBe(false);
	});

	test('reads half hours', () => {
		const schedules = [entry('Monday', 8.5, 17.5)];

		expect(isAllowed(schedules, at(MONDAY, 8, 29))).toBe(false);
		expect(isAllowed(schedules, at(MONDAY, 8, 30))).toBe(true);
		expect(isAllowed(schedules, at(MONDAY, 17, 30))).toBe(true);
		expect(isAllowed(schedules, at(MONDAY, 17, 31))).toBe(false);
	});

	test('Everyday, Weekday and Weekend cover the days they say', () => {
		for (const day of [MONDAY, FRIDAY, SATURDAY, SUNDAY]) {
			expect(isAllowed([entry('Everyday', 8, 20)], at(day, 12))).toBe(true);
		}
		expect(isAllowed([entry('Weekday', 8, 20)], at(FRIDAY, 12))).toBe(true);
		expect(isAllowed([entry('Weekday', 8, 20)], at(SATURDAY, 12))).toBe(false);
		expect(isAllowed([entry('Weekend', 8, 20)], at(SATURDAY, 12))).toBe(true);
		expect(isAllowed([entry('Weekend', 8, 20)], at(SUNDAY, 12))).toBe(true);
		expect(isAllowed([entry('Weekend', 8, 20)], at(MONDAY, 12))).toBe(false);
	});

	test('any one entry is enough', () => {
		const schedules = [entry('Monday', 8, 10), entry('Monday', 18, 20)];

		expect(isAllowed(schedules, at(MONDAY, 9))).toBe(true);
		expect(isAllowed(schedules, at(MONDAY, 12))).toBe(false);
		expect(isAllowed(schedules, at(MONDAY, 19))).toBe(true);
	});

	test('an end of 24 runs to the end of the day', () => {
		const schedules = [entry('Monday', 18, 24)];

		expect(isAllowed(schedules, at(MONDAY, 23, 59, 59))).toBe(true);
		expect(isAllowed(schedules, at(TUESDAY, 0, 0, 1))).toBe(false);
	});

	test('a day name the server does not use covers nothing', () => {
		expect(isAllowed([entry('Someday', 0, 24)], at(MONDAY, 12))).toBe(false);
	});
});

describe('nextAccessStart', () => {
	test('is null when the user is allowed now', () => {
		expect(nextAccessStart([entry('Monday', 8, 20)], at(MONDAY, 12))).toBeNull();
	});

	test('is a later start the same day', () => {
		expect(nextAccessStart([entry('Monday', 8, 20)], at(MONDAY, 7))).toEqual(at(MONDAY, 8));
	});

	test('is the next day an entry covers', () => {
		const schedules = [entry('Monday', 8, 20), entry('Tuesday', 9, 20)];

		expect(nextAccessStart(schedules, at(MONDAY, 21))).toEqual(at(TUESDAY, 9));
	});

	test('skips the weekend for a weekday entry', () => {
		expect(nextAccessStart([entry('Weekday', 8, 20)], at(FRIDAY, 21))).toEqual(at(26, 8));
	});

	test('takes the earliest of several entries', () => {
		const schedules = [entry('Monday', 15, 20), entry('Monday', 9, 10)];

		expect(nextAccessStart(schedules, at(MONDAY, 6))).toEqual(at(MONDAY, 9));
	});

	test('is a week away for an entry that only covers today', () => {
		expect(nextAccessStart([entry('Monday', 8, 20)], at(MONDAY, 21))).toEqual(at(26, 8));
	});

	test('is null when no entry opens in the next week', () => {
		expect(nextAccessStart([entry('Someday', 8, 20)], at(MONDAY, 6))).toBeNull();
	});
});

describe('nextBoundary', () => {
	test('is the second after the end while the user is allowed', () => {
		expect(nextBoundary([entry('Monday', 8, 20)], at(MONDAY, 12))).toEqual(at(MONDAY, 20, 0, 1));
	});

	test('is the next start while the user is not allowed', () => {
		const schedules = [entry('Monday', 8, 20), entry('Tuesday', 8, 20)];

		expect(nextBoundary(schedules, at(MONDAY, 21))).toEqual(at(TUESDAY, 8));
	});

	test('is null with no entries', () => {
		expect(nextBoundary([], at(MONDAY, 12))).toBeNull();
		expect(nextBoundary(undefined, at(MONDAY, 12))).toBeNull();
	});
});

describe('server clock', () => {
	// 2026-10-19T23:30:00Z, a Monday evening in UTC
	const deviceNow = Date.UTC(2026, 9, 19, 23, 30);
	const answer = (utcTime, utcOffsetSeconds) => ({utcTime, utcOffsetSeconds});
	const fields = (date) => [date.getDay(), date.getHours(), date.getMinutes(), date.getSeconds()];

	test('reads the server wall clock east of UTC, where it is already the next day', () => {
		const clock = readServerClock(answer('2026-10-19T23:30:00Z', 19800), deviceNow);

		expect(clock).toEqual({skewMs: 0, offsetMs: 19800000});
		expect(fields(serverWallClock(clock, deviceNow))).toEqual([2, 5, 0, 0]);
	});

	test('reads the server wall clock west of UTC, where it is still the day before', () => {
		const clock = readServerClock(answer('2026-10-19T23:30:00Z', -28800), deviceNow);

		expect(fields(serverWallClock(clock, deviceNow))).toEqual([1, 15, 30, 0]);
	});

	test('keeps the skew of a server clock that disagrees, and keeps running after the answer', () => {
		const clock = readServerClock(answer('2026-10-19T23:30:30Z', 0), deviceNow);

		expect(clock.skewMs).toBe(30000);
		expect(fields(serverWallClock(clock, deviceNow + 90000))).toEqual([1, 23, 32, 0]);
		expect(fields(serverWallClock(clock, deviceNow + 30 * 60000))[0]).toBe(2);
	});

	test('feeds the schedule functions like any date', () => {
		const clock = readServerClock(answer('2026-10-19T20:00:00Z', -28800), deviceNow);
		const schedules = [entry('Monday', 8, 20)];
		const now = serverWallClock(clock, Date.UTC(2026, 9, 19, 20, 0));

		expect(isAllowed(schedules, now)).toBe(true);
		expect(nextBoundary(schedules, now)).toEqual(new Date(2026, 9, 19, 20, 0, 1));
	});

	test('has no clock for an answer that cant be used', () => {
		expect(readServerClock(undefined, deviceNow)).toBeNull();
		expect(readServerClock({}, deviceNow)).toBeNull();
		expect(readServerClock(answer('not a time', 0), deviceNow)).toBeNull();
		expect(readServerClock(answer('2026-10-19T23:30:00Z', 'x'), deviceNow)).toBeNull();
		expect(readServerClock(answer('2026-10-19T23:30:00Z', undefined), deviceNow)).toBeNull();
	});
});

describe('readSchedules', () => {
	test('reads the entries the server sent', () => {
		const policy = {
			AccessSchedules: [{Id: 1, UserId: 'abc', DayOfWeek: 'Weekday', StartHour: 8, EndHour: 20.5}]
		};

		expect(readSchedules(policy)).toEqual([{dayOfWeek: 'Weekday', startHour: 8, endHour: 20.5}]);
	});

	test('is empty when there are none, or no policy at all', () => {
		expect(readSchedules({AccessSchedules: []})).toEqual([]);
		expect(readSchedules({})).toEqual([]);
		expect(readSchedules(null)).toEqual([]);
		expect(readSchedules({AccessSchedules: 'nonsense'})).toEqual([]);
	});

	test('leaves out what is not an entry', () => {
		expect(readSchedules({AccessSchedules: [null, 5, 'x', {DayOfWeek: 'Monday', StartHour: 1, EndHour: 2}]}))
			.toEqual([{dayOfWeek: 'Monday', startHour: 1, endHour: 2}]);
	});
});
