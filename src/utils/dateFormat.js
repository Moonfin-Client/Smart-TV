import {uiLocale} from './uiLocale';

export const DATE_FORMATS = ['system', 'monthDay', 'dayMonth'];

// Building a formatter takes about 12 ms on a webOS 3 TV and a Details page shows a few dozen dates and
// amounts, so each locale and style keeps the one it made.
const formatters = new Map();
const formatterFor = (kind, locale, options) => {
	const key = `${kind} ${locale} ${JSON.stringify(options || {})}`;
	let formatter = formatters.get(key);
	if (!formatter) {
		formatter = new Intl[kind](locale, options);
		formatters.set(key, formatter);
	}
	return formatter;
};

/** What `date.toLocaleDateString(locale, options)` gives, in the interface language unless `locale` says otherwise. */
export const localeDate = (date, options, locale = uiLocale()) => (
	typeof Intl !== 'undefined' && !isNaN(date)
		? formatterFor('DateTimeFormat', locale, options).format(date)
		: date.toLocaleDateString(locale, options)
);

/** What `new Intl.NumberFormat(locale, options).format(value)` gives, in the interface language. */
export const localeNumber = (value, options, locale = uiLocale()) => formatterFor('NumberFormat', locale, options).format(value);

/** Like "Nov 10" or "10 Nov", in the order the Date Format setting picks. */
export const formatShortDate = (date, dateFormat) => {
	if (dateFormat === 'monthDay') return `${localeDate(date, {month: 'short'})} ${date.getDate()}`;
	if (dateFormat === 'dayMonth') return `${date.getDate()} ${localeDate(date, {month: 'short'})}`;
	return localeDate(date, {month: 'short', day: 'numeric'});
};

/** Like "Thu, Nov 19" or "Thu 19 Nov". */
export const formatShortDayName = (date, dateFormat) => {
	if (dateFormat === 'monthDay') return `${localeDate(date, {weekday: 'short'})}, ${formatShortDate(date, dateFormat)}`;
	if (dateFormat === 'dayMonth') return `${localeDate(date, {weekday: 'short'})} ${formatShortDate(date, dateFormat)}`;
	return localeDate(date, {weekday: 'short', month: 'short', day: 'numeric'});
};

/** Like "Thursday, November 19, 2026" or "Thursday, 19 November 2026". */
export const formatFullDate = (date, dateFormat) => {
	const weekday = () => localeDate(date, {weekday: 'long'});
	const month = () => localeDate(date, {month: 'long'});
	if (dateFormat === 'monthDay') return `${weekday()}, ${month()} ${date.getDate()}, ${date.getFullYear()}`;
	if (dateFormat === 'dayMonth') return `${weekday()}, ${date.getDate()} ${month()} ${date.getFullYear()}`;
	return localeDate(date, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
};
