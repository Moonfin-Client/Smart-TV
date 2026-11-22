import {act, fireEvent, render, screen} from '@testing-library/react';

import {downloadOtaUpdate} from '../../services/versionChecker';
import {relaunchApp} from '../../utils/appLifecycle';
import UpdateNotification from './UpdateNotification';

jest.mock('../../services/versionChecker', () => ({downloadOtaUpdate: jest.fn()}));
jest.mock('../../utils/appLifecycle', () => ({relaunchApp: jest.fn()}));

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

	test('downloads an in-place update with progress, then offers the restart', async () => {
		let finish;
		let report;
		downloadOtaUpdate.mockImplementation((sent, onProgress) => {
			report = onProgress;
			return new Promise((resolve) => { finish = resolve; });
		});
		const onDismiss = jest.fn();
		const manifest = {version: '2.2.0'};
		render(<UpdateNotification updateInfo={{...updateInfo, ota: {manifest}}} formattedNotes="" onDismiss={onDismiss} />);

		fireEvent.click(screen.getByText('Download Update'));
		expect(downloadOtaUpdate.mock.calls[0][0]).toBe(manifest);
		act(() => report(0.42));
		expect(screen.getByText('Downloading 42%')).toBeTruthy();
		expect(screen.queryByText('Cancel')).toBeNull();

		await act(async () => finish());
		fireEvent.click(screen.getByText('Restart to Update'));
		expect(relaunchApp).toHaveBeenCalled();
		expect(onDismiss).not.toHaveBeenCalled();
	});

	test('a failed download can be tried again', async () => {
		downloadOtaUpdate.mockReturnValue(Promise.reject(new Error('offline')));
		render(<UpdateNotification updateInfo={{...updateInfo, ota: {manifest: {}}}} formattedNotes="" onDismiss={() => {}} />);
		fireEvent.click(screen.getByText('Download Update'));
		expect(await screen.findByText('Download Failed, Try Again')).toBeTruthy();
	});

	test('an update already downloaded goes straight to the restart', () => {
		render(<UpdateNotification updateInfo={{...updateInfo, ota: {ready: true}}} formattedNotes="" onDismiss={() => {}} />);
		expect(screen.getByText('Restart to Update')).toBeTruthy();
	});

	test('a release without an in-place update only offers the notes', () => {
		render(<UpdateNotification updateInfo={{...updateInfo, ota: null}} formattedNotes="" onDismiss={() => {}} />);
		expect(screen.queryByText('Download Update')).toBeNull();
		expect(screen.getByText('Read Release Notes')).toBeTruthy();
	});
});
