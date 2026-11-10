import {formatFullDate, formatShortDate, formatShortDayName} from './dateFormat';

jest.mock('./uiLocale', () => ({uiLocale: () => 'en-US'}));

const day = new Date(2026, 10, 19, 14, 30);

describe('dateFormat', () => {
	test('a short date follows the picked order', () => {
		expect(formatShortDate(day, 'monthDay')).toBe('Nov 19');
		expect(formatShortDate(day, 'dayMonth')).toBe('19 Nov');
		expect(formatShortDate(day, 'system')).toBe(day.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
	});

	test('a short day name follows the picked order', () => {
		expect(formatShortDayName(day, 'monthDay')).toBe('Thu, Nov 19');
		expect(formatShortDayName(day, 'dayMonth')).toBe('Thu 19 Nov');
		expect(formatShortDayName(day, 'system')).toBe(day.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}));
	});

	test('a full date follows the picked order', () => {
		expect(formatFullDate(day, 'monthDay')).toBe('Thursday, November 19, 2026');
		expect(formatFullDate(day, 'dayMonth')).toBe('Thursday, 19 November 2026');
	});

	test('anything unknown reads as Locale Default', () => {
		expect(formatShortDate(day, undefined)).toBe(formatShortDate(day, 'system'));
	});
});
