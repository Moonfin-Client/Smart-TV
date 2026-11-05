import {fireEvent, render, screen} from '@testing-library/react';

import UpdateNotification from './UpdateNotification';

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

// The app's react-dom would pull in the CLI's React, so the portal draws in place instead.
jest.mock('react-dom', () => ({createPortal: (node) => node}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));

const updateInfo = {currentVersion: '2.1.0', latestVersion: '2.2.0'};

describe('UpdateNotification', () => {
	test('offers the notes, then shows them in place of the offer', () => {
		render(<UpdateNotification updateInfo={updateInfo} formattedNotes="Faster **home**" onDismiss={() => {}} />);
		expect(screen.getByText('v2.2.0 Available')).toBeTruthy();
		expect(screen.getByText('Cancel')).toBeTruthy();

		fireEvent.click(screen.getByText('Read Release Notes'));
		expect(screen.queryByText('Read Release Notes')).toBeNull();
		expect(screen.getByText('home').tagName).toBe('STRONG');
	});

	test('Cancel counts the update as seen', () => {
		const onDismiss = jest.fn();
		render(<UpdateNotification updateInfo={updateInfo} formattedNotes="" onDismiss={onDismiss} />);
		fireEvent.click(screen.getByText('Cancel'));
		expect(onDismiss).toHaveBeenCalled();
	});

	test('draws nothing without an update', () => {
		const {container} = render(<UpdateNotification updateInfo={null} onDismiss={() => {}} />);
		expect(container.innerHTML).toBe('');
	});
});
