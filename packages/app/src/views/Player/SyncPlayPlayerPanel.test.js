import {act, fireEvent, render, screen} from '@testing-library/react';

import SyncPlayPlayerPanel from './SyncPlayPlayerPanel';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../utils/spotlightContainers', () => {
	const React = require('react');
	const container = ({spotlightId, ...props}) => React.createElement('div', props); // eslint-disable-line no-unused-vars
	return {ModalContainer: container};
});
jest.mock('../../components/TrackOptionRow', () => {
	const React = require('react');
	const Row = ({label, detail, selected, dimmed, ...props}) => // eslint-disable-line no-unused-vars
		React.createElement('button', {...props, 'data-selected': selected ? 'true' : undefined}, label);
	return {__esModule: true, default: Row, TrackDivider: () => null};
});

let mockSyncPlay;
jest.mock('../../context/SyncPlayContext', () => ({
	useSyncPlay: () => mockSyncPlay
}));

const css = {trackModal: 'trackModal', modalContent: 'modalContent', modalTitle: 'modalTitle', trackList: 'trackList'};

const buildSyncPlay = (overrides = {}) => ({
	group: {GroupName: 'Movie night', Participants: ['Ana', 'Pau']},
	isInGroup: true,
	ignoreWait: false,
	toggleIgnoreWait: jest.fn(),
	leaveGroup: jest.fn(() => Promise.resolve(true)),
	...overrides
});

const renderPanel = (closeModal = jest.fn()) => {
	const view = render(<SyncPlayPlayerPanel css={css} closeModal={closeModal} stopPropagation={jest.fn()} />);
	return {...view, closeModal};
};

beforeEach(() => {
	mockSyncPlay = buildSyncPlay();
});

describe('SyncPlayPlayerPanel', () => {
	test('names the group and who is in it', () => {
		renderPanel();
		expect(screen.getByText('Movie night')).toBeTruthy();
		expect(screen.getByText('Members (2): Ana, Pau')).toBeTruthy();
	});

	test('Ignore wait shows as chosen while on and flips with OK', () => {
		const {unmount} = renderPanel();
		const row = screen.getByText('Ignore wait');
		expect(row.getAttribute('data-selected')).toBeNull();
		fireEvent.click(row);
		expect(mockSyncPlay.toggleIgnoreWait).toHaveBeenCalledTimes(1);
		unmount();

		mockSyncPlay = buildSyncPlay({ignoreWait: true});
		renderPanel();
		expect(screen.getByText('Ignore wait').getAttribute('data-selected')).toBe('true');
	});

	test('Leave group leaves once, however many times it is pressed', async () => {
		let finish;
		mockSyncPlay = buildSyncPlay({leaveGroup: jest.fn(() => new Promise((resolve) => { finish = resolve; }))});
		renderPanel();
		fireEvent.click(screen.getByText('Leave group'));
		fireEvent.click(screen.getByText('Leave group'));
		expect(mockSyncPlay.leaveGroup).toHaveBeenCalledTimes(1);
		await act(async () => finish(true));
	});

	test('closes itself once this device is out of the group', () => {
		const closeModal = jest.fn();
		const {rerender} = renderPanel(closeModal);
		expect(closeModal).not.toHaveBeenCalled();
		mockSyncPlay = buildSyncPlay({group: null, isInGroup: false});
		rerender(<SyncPlayPlayerPanel css={css} closeModal={closeModal} stopPropagation={jest.fn()} />);
		expect(closeModal).toHaveBeenCalled();
	});

	test('Cancel closes it', () => {
		const {closeModal} = renderPanel();
		fireEvent.click(screen.getByText('Cancel'));
		expect(closeModal).toHaveBeenCalled();
	});
});
