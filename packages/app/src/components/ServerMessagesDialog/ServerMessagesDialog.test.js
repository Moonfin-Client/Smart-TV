import {act, fireEvent, render, screen} from '@testing-library/react';

import ServerMessagesDialog from './ServerMessagesDialog';
import {useServerMessages} from '../../context/ServerMessagesContext';

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
jest.mock('../../context/ServerMessagesContext', () => ({useServerMessages: jest.fn()}));
jest.mock('../../utils/qrCanvas', () => ({drawQrCode: jest.fn()}));

const message = {
	id: 'm1',
	title: 'Maintenance',
	body: 'Down **tonight**',
	color: 'blue',
	actionUrl: 'https://example.com/status',
	actionLabel: 'Status page'
};

const useMessages = (messages, read = []) => {
	const markRead = jest.fn();
	useServerMessages.mockReturnValue({
		messages,
		unreadCount: messages.filter((m) => !read.includes(m.id)).length,
		isRead: (id) => read.includes(id),
		markRead,
		markAllRead: jest.fn()
	});
	return markRead;
};

describe('ServerMessagesDialog', () => {
	test('opening a card reads it and offers its link, which shows as a QR code', () => {
		const markRead = useMessages([message]);
		render(<ServerMessagesDialog open onClose={() => {}} />);
		expect(screen.queryByText('Status page')).toBeNull();

		fireEvent.click(screen.getByText('Maintenance'));
		expect(markRead).toHaveBeenCalledWith('m1');
		fireEvent.click(screen.getByText('Status page'));
		expect(screen.getByText('https://example.com/status')).toBeTruthy();
		expect(screen.getByText('Scan with your phone')).toBeTruthy();
	});

	test('Back closes the QR code before the window', () => {
		useMessages([message], ['m1']);
		const backHandlerRef = {current: null};
		render(<ServerMessagesDialog open onClose={() => {}} backHandlerRef={backHandlerRef} />);
		expect(backHandlerRef.current()).toBe(false);

		fireEvent.click(screen.getByText('Maintenance'));
		fireEvent.click(screen.getByText('Status page'));
		let handled;
		act(() => {
			handled = backHandlerRef.current();
		});
		expect(handled).toBe(true);
		expect(screen.queryByText('https://example.com/status')).toBeNull();
	});

	test('an empty list says so and has no mark all button', () => {
		useMessages([]);
		render(<ServerMessagesDialog open onClose={() => {}} />);
		expect(screen.getByText('No messages from your server yet')).toBeTruthy();
		expect(screen.queryByText('Mark all as read')).toBeNull();
	});
});
