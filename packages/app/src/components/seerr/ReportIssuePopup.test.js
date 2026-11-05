import {fireEvent, render, screen} from '@testing-library/react';

import {ReportIssuePopup} from './ReportIssuePopup';
import {ISSUE_TYPE} from '../../utils/seerrStatus';

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

jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));
// The app's react-dom would pull in the CLI's React, so the portal draws in place instead.
jest.mock('react-dom', () => ({createPortal: (node) => node}));
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
// The real field reaches for the settings and the TV keyboard, and a plain input is all this needs.
jest.mock('../SpottableInput/SpottableInput', () => ({
	__esModule: true,
	default: ({spotlightId, ...props}) => require('react').createElement('input', props) // eslint-disable-line no-unused-vars
}));

const seasons = [
	{seasonNumber: 0, episodeCount: 4},
	{seasonNumber: 1, episodeCount: 3},
	{seasonNumber: 2, episodeCount: 2}
];

// The button shows a spinner while the report is out, so its label coming back means it's done.
const submit = async () => {
	fireEvent.click(screen.getByText('Submit Report'));
	await screen.findByText('Submit Report');
};

const write = (text) => fireEvent.change(screen.getByPlaceholderText("What's wrong?"), {target: {value: text}});

describe('ReportIssuePopup', () => {
	test('sends nothing until something is written', async () => {
		const onSubmit = jest.fn();
		render(<ReportIssuePopup open isTv={false} seasons={[]} onSubmit={onSubmit} onClose={() => {}} />);
		fireEvent.click(screen.getByText('Submit Report'));
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.click(screen.getByText('Audio'));
		write('  No sound  ');
		await submit();
		expect(onSubmit).toHaveBeenCalledWith({issueType: ISSUE_TYPE.AUDIO, message: 'No sound', problemSeason: 0, problemEpisode: 0});
	});

	test('narrows a series report to the season and episode picked, and a new season clears the episode', async () => {
		const onSubmit = jest.fn();
		render(<ReportIssuePopup open isTv seasons={seasons} onSubmit={onSubmit} onClose={() => {}} />);
		expect(screen.queryByText('Episode')).toBeNull();

		fireEvent.click(screen.getByText('All Seasons'));
		fireEvent.click(screen.getByText('Season 1'));
		fireEvent.click(screen.getByText('All Episodes'));
		fireEvent.click(screen.getByText('Episode 3'));
		expect(screen.getByText('Episode 3')).toBeTruthy();

		fireEvent.click(screen.getByText('Season 1'));
		fireEvent.click(screen.getByText('Season 2'));
		expect(screen.getByText('All Episodes')).toBeTruthy();
		fireEvent.click(screen.getByText('All Episodes'));
		fireEvent.click(screen.getByText('Episode 2'));

		write('Out of sync');
		await submit();
		expect(onSubmit).toHaveBeenCalledWith({issueType: ISSUE_TYPE.VIDEO, message: 'Out of sync', problemSeason: 2, problemEpisode: 2});
	});

	test('starts on the only season a series has', () => {
		render(<ReportIssuePopup open isTv seasons={[{seasonNumber: 1, episodeCount: 2}]} onSubmit={jest.fn()} onClose={() => {}} />);
		expect(screen.getByText('Season 1')).toBeTruthy();
		expect(screen.getByText('All Episodes')).toBeTruthy();
	});

	test('counts the seasons out from the total when the server sends no list', () => {
		render(<ReportIssuePopup open isTv seasons={[]} numberOfSeasons={3} onSubmit={jest.fn()} onClose={() => {}} />);
		fireEvent.click(screen.getByText('All Seasons'));
		expect(screen.getByText('Season 3')).toBeTruthy();
		expect(screen.queryByText('Season 4')).toBeNull();
	});

	test('opened from an episode, starts on its season and episode', async () => {
		const onSubmit = jest.fn();
		render(<ReportIssuePopup open isTv seasons={seasons} initialSeason={2} initialEpisode={1} onSubmit={onSubmit} onClose={() => {}} />);
		expect(screen.getByText('Season 2')).toBeTruthy();
		expect(screen.getByText('Episode 1')).toBeTruthy();

		write('Wrong audio track');
		await submit();
		expect(onSubmit).toHaveBeenCalledWith({issueType: ISSUE_TYPE.VIDEO, message: 'Wrong audio track', problemSeason: 2, problemEpisode: 1});
	});
});
