import {incompleteDetailText} from './IncompleteBadge';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/incompleteRecordings', () => ({useIncompleteRecording: jest.fn()}));
jest.mock('../../utils/uiLocale', () => ({uiLocale: () => 'en-US'}));

const thursdayEvening = new Date(2026, 9, 29, 20, 0).toISOString();

describe('incompleteDetailText', () => {
	it('names the weekday and time of a scheduled complete showing', () => {
		const entry = {recordedMinutes: 23, expectedMinutes: 37, state: 'scheduled', scheduledStart: thursdayEvening};
		expect(incompleteDetailText(entry, '12-hour')).toBe('Incomplete · 23 of 37 min · Complete showing scheduled Thu 8:00 PM');
		expect(incompleteDetailText(entry, '24-hour')).toBe('Incomplete · 23 of 37 min · Complete showing scheduled Thu 20:00');
	});

	it('says when a complete copy was recorded, or that none was found', () => {
		expect(incompleteDetailText({recordedMinutes: 5, expectedMinutes: 60, state: 'recorded', recordedAt: thursdayEvening}, '12-hour'))
			.toBe('Incomplete · 5 of 60 min · Complete copy recorded Thu 8:00 PM');
		expect(incompleteDetailText({recordedMinutes: 5, expectedMinutes: 60, state: 'notFound'}, '12-hour'))
			.toBe('Incomplete · 5 of 60 min · No complete showing found');
	});

	it('leaves the status off when its date is missing or empty, and rounds the minutes', () => {
		expect(incompleteDetailText({recordedMinutes: 22.6, expectedMinutes: '37', state: 'scheduled'}, '12-hour'))
			.toBe('Incomplete · 23 of 37 min');
		expect(incompleteDetailText({recordedMinutes: 'x', expectedMinutes: 37, state: 'recorded', recordedAt: '0001-01-01T00:00:00Z'}, '12-hour'))
			.toBe('Incomplete · 0 of 37 min');
	});
});
