import {uiLocale} from './uiLocale';

export const DATE_FORMATS = ['system', 'monthDay', 'dayMonth'];

const named = (date, options) => date.toLocaleDateString(uiLocale(), options);

/** Like "Nov 10" or "10 Nov", in the order the Date Format setting picks. */
export const formatShortDate = (date, dateFormat) => {
	if (dateFormat === 'monthDay') return `${named(date, {month: 'short'})} ${date.getDate()}`;
	if (dateFormat === 'dayMonth') return `${date.getDate()} ${named(date, {month: 'short'})}`;
	return named(date, {month: 'short', day: 'numeric'});
};

/** Like "Thu, Nov 19" or "Thu 19 Nov". */
export const formatShortDayName = (date, dateFormat) => {
	if (dateFormat === 'monthDay') return `${named(date, {weekday: 'short'})}, ${formatShortDate(date, dateFormat)}`;
	if (dateFormat === 'dayMonth') return `${named(date, {weekday: 'short'})} ${formatShortDate(date, dateFormat)}`;
	return named(date, {weekday: 'short', month: 'short', day: 'numeric'});
};

/** Like "Thursday, November 19, 2026" or "Thursday, 19 November 2026". */
export const formatFullDate = (date, dateFormat) => {
	const weekday = () => named(date, {weekday: 'long'});
	const month = () => named(date, {month: 'long'});
	if (dateFormat === 'monthDay') return `${weekday()}, ${month()} ${date.getDate()}, ${date.getFullYear()}`;
	if (dateFormat === 'dayMonth') return `${weekday()}, ${date.getDate()} ${month()} ${date.getFullYear()}`;
	return named(date, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
};
