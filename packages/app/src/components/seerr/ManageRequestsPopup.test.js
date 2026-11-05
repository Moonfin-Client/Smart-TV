import {act, fireEvent, render, screen} from '@testing-library/react';

import {ManageRequestsPopup} from './ManageRequestsPopup';

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

const requests = [
	{id: 7, is4k: false, requestedBy: {displayName: 'Ada'}},
	{id: 9, is4k: true, requestedBy: {username: 'bob'}}
];

describe('ManageRequestsPopup', () => {
	test('names who asked, calling out the 4K track', () => {
		render(<ManageRequestsPopup open pendingRequests={requests} onResolve={jest.fn()} onClose={() => {}} />);
		expect(screen.getByText('Requested by Ada')).toBeTruthy();
		expect(screen.getByText('Requested by bob · 4K')).toBeTruthy();
	});

	test('answers the request a button sits under, and only one at a time', async () => {
		let finish;
		const onResolve = jest.fn(() => new Promise((resolve) => {
			finish = resolve;
		}));
		render(<ManageRequestsPopup open pendingRequests={requests} onResolve={onResolve} onClose={() => {}} />);

		fireEvent.click(screen.getAllByText('Approve')[1]);
		expect(onResolve).toHaveBeenCalledWith(9, true);

		fireEvent.click(screen.getAllByText('Decline')[0]);
		expect(onResolve).toHaveBeenCalledTimes(1);

		await act(async () => finish());
		fireEvent.click(screen.getAllByText('Decline')[0]);
		expect(onResolve).toHaveBeenLastCalledWith(7, false);
	});
});
