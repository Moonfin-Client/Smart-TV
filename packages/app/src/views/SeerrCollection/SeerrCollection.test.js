import {fireEvent, render, screen} from '@testing-library/react';

import {RequestCollectionSheet} from './SeerrCollection';

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
jest.mock('@enact/sandstone/Panels', () => ({Panel: ({children}) => children}));
jest.mock('@enact/sandstone/Spinner', () => () => null);
jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {getRadarrServerDetails: jest.fn(), getImageUrl: jest.fn()}
}));

const parts = [
	{id: 1, title: 'One', releaseDate: '2001-05-01'},
	{id: 2, title: 'Two', mediaInfo: {status: 5, status4k: 1}},
	{id: 3, title: 'Three', mediaInfo: {status: 7, status4k: 1}},
	{id: 4, title: 'Four', mediaInfo: {status: 1, status4k: 1}}
];

const setup = (props = {}) => {
	const onConfirm = jest.fn();
	render(
		<RequestCollectionSheet
			parts={parts}
			canUse4k={false}
			quota={null}
			servers={null}
			onConfirm={onConfirm}
			onClose={() => {}}
			{...props}
		/>
	);
	return onConfirm;
};

describe('RequestCollectionSheet', () => {
	test('ticks every part it can ask for, deleted ones included', () => {
		const onConfirm = setup();
		expect(screen.getByText('Select All (3)')).toBeTruthy();
		expect(screen.getByText('One (2001)')).toBeTruthy();
		expect(screen.getByText('Available')).toBeTruthy();

		fireEvent.click(screen.getByText('Request 3 movies'));
		expect(onConfirm).toHaveBeenCalledWith([1, 3, 4], false, expect.any(Function), {serverId: null, profileId: null, rootFolder: null});
	});

	test('holds the picks to what the quota has left', () => {
		setup({quota: {limit: 5, remaining: 2}});
		expect(screen.getByText('2 of 5 movie requests remaining')).toBeTruthy();
		expect(screen.getByText('Request 2 movies')).toBeTruthy();

		fireEvent.click(screen.getByText('Four'));
		expect(screen.getByText('Request 2 movies')).toBeTruthy();

		fireEvent.click(screen.getByText('One (2001)'));
		expect(screen.getByText('Request 1 movies')).toBeTruthy();
		fireEvent.click(screen.getByText('Four'));
		expect(screen.getByText('Request 2 movies')).toBeTruthy();
	});

	test('switching to 4K picks again from what that track can take', () => {
		const onConfirm = setup({canUse4k: true});
		fireEvent.click(screen.getByText('4K'));
		expect(screen.getByText('Select All (4)')).toBeTruthy();

		fireEvent.click(screen.getByText('Select All (4)'));
		expect(screen.getByText('Request 0 movies')).toBeTruthy();
		fireEvent.click(screen.getByText('Request 0 movies'));
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
