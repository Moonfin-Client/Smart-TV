// A user's access schedule as Jellyfin keeps it: the days an entry covers and the hours of
// those days the user may use the server. Jellyfin applies it by the rules below, so the
// app does too, to say so when the time is up instead of letting everything start failing.

const LOOK_AHEAD_DAYS = 8;
const WEEKDAYS = {Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6};

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

// Start and end hours are both included. Administrators are exempt, which is for the caller
// to check.
export const isAllowed = (schedules, now) => {
	if (!schedules || schedules.length === 0) return true;
	const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
	return schedules.some((entry) =>
		coversDay(entry.dayOfWeek, now.getDay()) && hour >= entry.startHour && hour <= entry.endHour
	);
};

// Null when the user is allowed now or no entry opens within the next week.
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

// The next moment isAllowed could change: every start, and the second after every end, since
// the end itself is still allowed. Null when nothing changes in the next week.
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
