// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {MEDIA_STATUS, REQUEST_STATUS} from './seerrStatus';
import {
	formatCurrency, formatDate, formatRuntime, getSeasonStatusColor,
	getSeasonStatusLabel, getStatusPills, isSeasonRerequestable
} from './seerrBadges';

const pills = (hd, fourK, hdDeclined = false, fourKDeclined = false) =>
	getStatusPills(hd, fourK, hdDeclined, fourKDeclined);

describe('getStatusPills', () => {
	test('a title with no state shows nothing', () => {
		expect(pills(MEDIA_STATUS.UNKNOWN, MEDIA_STATUS.UNKNOWN)).toEqual([]);
	});

	test('plain HD availability stays silent, since the library screen already shows the title', () => {
		expect(pills(MEDIA_STATUS.AVAILABLE, MEDIA_STATUS.UNKNOWN)).toEqual([]);
	});

	test('an HD track on its own goes without a prefix', () => {
		expect(pills(MEDIA_STATUS.PARTIALLY_AVAILABLE, MEDIA_STATUS.UNKNOWN))
			.toEqual([{text: 'Partially Available', color: 'green'}]);
		expect(pills(MEDIA_STATUS.PENDING, MEDIA_STATUS.UNKNOWN))
			.toEqual([{text: 'Pending', color: 'yellow'}]);
		expect(pills(MEDIA_STATUS.PROCESSING, MEDIA_STATUS.UNKNOWN))
			.toEqual([{text: 'Requested', color: 'purple'}]);
	});

	test('once 4K has state both tracks carry their name', () => {
		expect(pills(MEDIA_STATUS.PENDING, MEDIA_STATUS.PROCESSING)).toEqual([
			{text: 'HD · Pending', color: 'yellow'},
			{text: '4K · Requested', color: 'purple'}
		]);
	});

	test('HD availability drops out of a pair while 4K still speaks', () => {
		expect(pills(MEDIA_STATUS.AVAILABLE, MEDIA_STATUS.PROCESSING))
			.toEqual([{text: '4K · Requested', color: 'purple'}]);
	});

	test('a declined 4K request labels both tracks', () => {
		expect(pills(MEDIA_STATUS.PENDING, MEDIA_STATUS.UNKNOWN, false, true)).toEqual([
			{text: 'HD · Pending', color: 'yellow'},
			{text: '4K · Declined', color: 'red'}
		]);
	});

	test('declined reads per track', () => {
		expect(pills(MEDIA_STATUS.UNKNOWN, MEDIA_STATUS.UNKNOWN, true, false))
			.toEqual([{text: 'Declined', color: 'red'}]);
	});

	test('blacklisted and deleted read as errors', () => {
		expect(pills(MEDIA_STATUS.BLOCKLISTED, MEDIA_STATUS.UNKNOWN))
			.toEqual([{text: 'Blocklisted', color: 'red'}]);
		expect(pills(MEDIA_STATUS.DELETED, MEDIA_STATUS.UNKNOWN))
			.toEqual([{text: 'Deleted', color: 'red'}]);
	});

	// Whatever the pairing, nothing renders without a color class to draw it with.
	test('every pairing of the media states yields well formed pills', () => {
		const all = Object.values(MEDIA_STATUS);
		all.forEach((hd) => {
			all.forEach((fourK) => {
				pills(hd, fourK).forEach((pill) => {
					expect(typeof pill.text).toBe('string');
					expect(pill.text.length).toBeGreaterThan(0);
					expect(pill.color).toBeTruthy();
				});
			});
		});
	});
});

describe('season status', () => {
	test('each request state has a label and a colour', () => {
		Object.values(REQUEST_STATUS).forEach((status) => {
			expect(getSeasonStatusLabel(status)).toBeTruthy();
			expect(getSeasonStatusColor(status)).toBeTruthy();
		});
	});

	test('an unrecognised state falls back rather than showing a label', () => {
		expect(getSeasonStatusLabel(99)).toBeNull();
		expect(getSeasonStatusColor(99)).toBe('gray');
	});

	test('only declined and failed can be asked for again', () => {
		expect(isSeasonRerequestable(REQUEST_STATUS.DECLINED)).toBe(true);
		expect(isSeasonRerequestable(REQUEST_STATUS.FAILED)).toBe(true);
		expect(isSeasonRerequestable(REQUEST_STATUS.PENDING)).toBe(false);
		expect(isSeasonRerequestable(REQUEST_STATUS.COMPLETED)).toBe(false);
	});
});

describe('formatters', () => {
	test('runtime reads in hours and minutes, and takes minutes', () => {
		expect(formatRuntime(90)).toBe('1h 30m');
		expect(formatRuntime(45)).toBe('45m');
		expect(formatRuntime(120)).toBe('2h');
		expect(formatRuntime(0)).toBeNull();
	});

	// The exact wording follows the viewer's locale, so only the empty cases are pinned.
	test('a date renders, and nothing renders when there is no date', () => {
		expect(formatDate('2026-03-01')).toBeTruthy();
		expect(formatDate(null)).toBeNull();
		expect(formatDate('')).toBeNull();
	});

	test('currency drops anything that is not a real amount', () => {
		expect(formatCurrency(0)).toBeNull();
		expect(formatCurrency(-5)).toBeNull();
		expect(formatCurrency(null)).toBeNull();
		expect(formatCurrency(1000)).toContain('1,000');
	});
});
