import {uiLocale} from './uiLocale';

// Some sets report the wrong wall clock even with their timezone set correctly, so
// every time the viewer reads goes through here and can be nudged back into line.
// Only displayed times use this. Anything the server sees keeps the real clock.
export const shiftedNow = (offsetHours) => new Date(Date.now() + ((offsetHours || 0) * 3600000));

// Short day label such as Mon, Jan 5, for headings that sit above a set of times.
export const formatDayLabel = (date) =>
	date.toLocaleDateString(uiLocale(), {weekday: 'short', month: 'short', day: 'numeric'});

export const formatClockTime = (date, clockDisplay) => {
	const hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, '0');
	if (clockDisplay === '12-hour') {
		return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
	}
	return `${String(hours).padStart(2, '0')}:${minutes}`;
};

// Weekday and time, such as Thu 8:00 PM, in the viewer's clock format.
export const formatShowingTime = (date, clockDisplay) =>
	`${date.toLocaleDateString(uiLocale(), {weekday: 'short'})} ${formatClockTime(date, clockDisplay)}`;
