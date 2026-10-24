import {render, screen, fireEvent} from '@testing-library/react';

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

jest.mock('../../utils/spotlightContainers', () => {
	const React = require('react');
	return {
		ModalContainer: ({spotlightId, children, ...props}) => {
			const rest = {...props, 'data-spotlight-id': spotlightId};
			return React.createElement('div', rest, children);
		}
	};
});

jest.mock('../../components/TrackOptionRow', () => {
	const React = require('react');
	return {
		__esModule: true,
		default: ({label, selected, onClick, ...props}) => {
			const config = {
				onClick,
				'data-selected': selected,
				...props
			};
			return React.createElement('button', config, label);
		}
	};
});

import CollectionSortDialog from './CollectionSortDialog';

describe('CollectionSortDialog', () => {
	const options = [
		{id: 'server', label: 'Server Order'},
		{id: 'releaseAscending', label: 'Release Order (Ascending)'},
		{id: 'custom', label: 'Custom Order'}
	];

	test('renders options and indicates the active selection', () => {
		render(
			<CollectionSortDialog
				options={options}
				active="releaseAscending"
				onSelect={jest.fn()}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText('Playlist Sort Options')).toBeTruthy();
		expect(screen.getByText('Server Order')).toBeTruthy();
		expect(screen.getByText('Release Order (Ascending)')).toBeTruthy();
		expect(screen.getByText('Custom Order')).toBeTruthy();
	});

	test('calls onSelect when an option is clicked', () => {
		const onSelect = jest.fn();
		render(
			<CollectionSortDialog
				options={options}
				active="releaseAscending"
				onSelect={onSelect}
				onClose={jest.fn()}
			/>
		);

		const customRow = screen.getByText('Custom Order');
		fireEvent.click(customRow);
		expect(onSelect).toHaveBeenCalledWith('custom');
	});

	test('calls onClose when clicking the overlay backdrop', () => {
		const onClose = jest.fn();
		const {container} = render(
			<CollectionSortDialog
				options={options}
				active="releaseAscending"
				onSelect={jest.fn()}
				onClose={onClose}
			/>
		);

		fireEvent.click(container.firstChild);
		expect(onClose).toHaveBeenCalled();
	});
});
