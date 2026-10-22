// A user's access schedule as Jellyfin keeps it: the days an entry covers and the hours of
// those days the user may use the server. Jellyfin applies it by the rules below, so the
// app does too, to say so when the time is up instead of letting everything start failing.

const LOOK_AHEAD_DAYS = 8;
const WEEKDAYS = {Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6};

/**
 * The entries of a policy, as the plain objects the rest of this file reads. Anything that
 * isn't an entry is left out.
 *
 * @param {object} [policy] the Policy of a user as the server sent it
 * @returns {Array<{dayOfWeek: string, startHour: number, endHour: number}>}
 */
export const readSchedules = (policy) => {
	const entries = policy?.AccessSchedules;
	if (!Array.isArray(entries)) return [];
	return entries
		.filter((entry) => entry && typeof entry === 'object')
		.map((entry) => ({
			dayOfWeek: String(entry.DayOfWeek || ''),
			startHour: Number(entry.StartHour) || 0,
			endHour: Number(entry.EndHour) || 0
		}));
};

// A day name the server doesn't use covers no day. Weekday is Monday to Friday.
const coversDay = (dayOfWeek, day) => {
	if (dayOfWeek === 'Everyday') return true;
	if (dayOfWeek === 'Weekday') return day >= 1 && day <= 5;
	if (dayOfWeek === 'Weekend') return day === 0 || day === 6;
	return WEEKDAYS[dayOfWeek] === day;
};

// The hour of the day on the date given, to the minute. An hour of 24 is the midnight that
// ends that day.
const hourOn = (date, hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(hour * 60));

/**
 * Whether the user may use the server at `now`: an entry allows it when it covers the day and
 * the hour of the day is between its start and its end, both included. A user with no entries
 * is always allowed. Administrators are exempt, which is for the caller to check.
 *
 * @param {Array} schedules from {@link readSchedules}
 * @param {Date} now
 * @returns {boolean}
 */
export const isAllowed = (schedules, now) => {
	if (!schedules || schedules.length === 0) return true;
	const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
	return schedules.some((entry) =>
		coversDay(entry.dayOfWeek, now.getDay()) && hour >= entry.startHour && hour <= entry.endHour
	);
};

/**
 * The next time the user is allowed in, or null when they are allowed now or no entry opens
 * within the next week.
 */
export const nextAccessStart = (schedules, now) => {
	if (isAllowed(schedules, now)) return null;
	let earliest = null;
	for (let offset = 0; offset < LOOK_AHEAD_DAYS; offset++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
		for (const entry of schedules) {
			if (!coversDay(entry.dayOfWeek, day.getDay())) continue;
			const start = hourOn(day, entry.startHour);
			if (start.getTime() <= now.getTime()) continue;
			if (earliest === null || start.getTime() < earliest.getTime()) earliest = start;
		}
	}
	return earliest;
};

/**
 * The next moment the answer of {@link isAllowed} could change, or null when no entry has one
 * in the next week: every start, and the second after every end, since the end itself is
 * still allowed.
 */
export const nextBoundary = (schedules, now) => {
	let earliest = null;
	const consider = (moment) => {
		if (moment.getTime() <= now.getTime()) return;
		if (earliest === null || moment.getTime() < earliest.getTime()) earliest = moment;
	};
	for (let offset = 0; offset < LOOK_AHEAD_DAYS; offset++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
		for (const entry of schedules || []) {
			if (!coversDay(entry.dayOfWeek, day.getDay())) continue;
			consider(hourOn(day, entry.startHour));
			consider(new Date(hourOn(day, entry.endHour).getTime() + 1000));
		}
	}
	return earliest;
};

/**
 * How the server's clock differs from this device's, from the answer of the plugin's
 * Moonfin/Time. Kept instead of a moment so it stays right as time passes.
 *
 * @param {{utcTime?: string, utcOffsetSeconds?: number}} [time] the answer
 * @param {number} deviceUtcMs this device's UTC clock when the answer arrived
 * @returns {{skewMs: number, offsetMs: number}|null} null when the answer is unusable
 */
export const readServerClock = (time, deviceUtcMs) => {
	const utc = Date.parse(time?.utcTime);
	const offset = time?.utcOffsetSeconds;
	if (Number.isNaN(utc) || typeof offset !== 'number' || !Number.isFinite(offset)) return null;
	return {skewMs: utc - deviceUtcMs, offsetMs: offset * 1000};
};

/**
 * A date whose local fields are the server's wall clock when this device's UTC clock reads
 * `deviceUtcMs`, whatever zone this device is in, so the functions above can read it as they read
 * any other date. It's meant to be read for its fields and not as an instant. A wall time this
 * device skips for daylight saving lands an hour later.
 *
 * @param {{skewMs: number, offsetMs: number}} clock from {@link readServerClock}
 * @param {number} deviceUtcMs
 * @returns {Date}
 */
export const serverWallClock = (clock, deviceUtcMs) => {
	const wall = new Date(deviceUtcMs + clock.skewMs + clock.offsetMs);
	return new Date(
		wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(),
		wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds()
	);
};
