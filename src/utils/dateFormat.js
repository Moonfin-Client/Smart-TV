import $L from '../services/i18n.js';
import {parseServerDate} from './serverDate.js';
import {uiLocale} from './uiLocale.js';

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

const shortMonthLabel = (monthIndex) => [
	$L('Jan'), $L('Feb'), $L('Mar'), $L('Apr'), $L('May'), $L('Jun'),
	$L('Jul'), $L('Aug'), $L('Sep'), $L('Oct'), $L('Nov'), $L('Dec')
][monthIndex];

const isYearFirstLocale = (locale) => /^(ja|zh|ko|hu|lt|eu|mn|yue)(?:[-_]|$)/i.test(String(locale || ''));

const isMonthFirstLocale = (locale) => {
	const tag = String(locale || '').toLowerCase();
	return tag === 'en' || tag === 'en-us' || tag === 'en-ca' || tag === 'en-ph';
};

const hasIntlDateTimeFormat = () => typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function';

const formatMediumFallback = (date, dateFormat, utc) => {
	const month = shortMonthLabel(utc ? date.getUTCMonth() : date.getMonth());
	const day = utc ? date.getUTCDate() : date.getDate();
	const year = utc ? date.getUTCFullYear() : date.getFullYear();
	if (dateFormat === 'monthDay') return `${month} ${day}, ${year}`;
	if (dateFormat === 'dayMonth') return `${day} ${month} ${year}`;
	const locale = uiLocale();
	if (isYearFirstLocale(locale)) return `${year} ${month} ${day}`;
	return isMonthFirstLocale(locale) ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
};

/** Like "Nov 19, 2026" or "19 Nov 2026", in the order the Date Format setting picks. */
export const formatMediumDate = (date, dateFormat, {utc = false} = {}) => {
	if (!hasIntlDateTimeFormat()) {
		return formatMediumFallback(date, dateFormat, utc);
	}
	const tz = utc ? {timeZone: 'UTC'} : {};
	const options = {month: 'short', day: 'numeric', year: 'numeric', ...tz};
	if (dateFormat === 'monthDay' || dateFormat === 'dayMonth') {
		const parts = {};
		const dtf = formatterFor('DateTimeFormat', uiLocale(), options);
		if (typeof dtf.formatToParts === 'function') {
			for (const part of dtf.formatToParts(date)) {
				if (part.type === 'month' || part.type === 'day' || part.type === 'year') {
					parts[part.type] = part.value;
				}
			}
		}
		const monthLabel = localeDate(date, {month: 'short', ...tz}) || parts.month;
		const dayLabel = parts.day || localeDate(date, {day: 'numeric', ...tz});
		const yearLabel = parts.year || localeDate(date, {year: 'numeric', ...tz});
		if (monthLabel && dayLabel && yearLabel) {
			return dateFormat === 'monthDay'
				? `${monthLabel} ${dayLabel}, ${yearLabel}`
				: `${dayLabel} ${monthLabel} ${yearLabel}`;
		}
	}
	return localeDate(date, options);
};

/**
 * Formats an item's release or air date for the details metadata row.
 * When showFullDate is true and PremiereDate parses cleanly, returns the full
 * localized date in UTC (premiere dates are midnight UTC); otherwise falls back
 * to ProductionYear.
 */
export const formatDetailReleaseDate = (item, {showFullDate = false, dateFormat} = {}) => {
	if (showFullDate && item?.PremiereDate) {
		const parsed = parseServerDate(item.PremiereDate);
		if (parsed) return formatMediumDate(parsed, dateFormat, {utc: true});
	}
	return item?.ProductionYear ? String(item.ProductionYear) : '';
};

/** Like "Thursday, November 19, 2026" or "Thursday, 19 November 2026". */
export const formatFullDate = (date, dateFormat) => {
	const weekday = () => localeDate(date, {weekday: 'long'});
	const month = () => localeDate(date, {month: 'long'});
	if (dateFormat === 'monthDay') return `${weekday()}, ${month()} ${date.getDate()}, ${date.getFullYear()}`;
	if (dateFormat === 'dayMonth') return `${weekday()}, ${date.getDate()} ${month()} ${date.getFullYear()}`;
	return localeDate(date, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
};
