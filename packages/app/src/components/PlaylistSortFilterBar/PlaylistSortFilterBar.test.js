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

// Spotlight's own props would be unknown attributes on the plain element this mock renders.
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, onSpotlightLeft, onSpotlightRight, children, ...props}) => { // eslint-disable-line no-unused-vars
		const rest = {...props, 'data-spotlight-id': spotlightId};
		return React.createElement(type, rest, children);
	};
});

jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, maybeComp) => {
	const React = require('react');
	const wrap = (Comp) => ({spotlightId, children, ...props}) => {
		const rest = {...props, 'data-spotlight-id': spotlightId};
		return React.createElement(Comp, rest, children);
	};
	return maybeComp ? wrap(maybeComp) : wrap;
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

jest.mock('../TrackOptionRow', () => {
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
		},
		TrackDivider: () => React.createElement('div')
	};
});

import PlaylistSortFilterBar, {
	PlaylistSortDialog,
	PlaylistFilterDialog,
	EmptyPlaylistFilterState
} from './PlaylistSortFilterBar';
import {
	PLAYLIST_SORT_ORDER,
	PLAYLIST_SORT_NAME,
	SORT_DIR_ASC,
	SORT_DIR_DESC,
	PLAYED_ALL,
	PLAYED_WATCHED
} from '../../utils/playlistSortFilter';

describe('PlaylistSortFilterBar', () => {
	test('renders sort and filter pills with default state', () => {
		render(
			<PlaylistSortFilterBar
				sortBy={PLAYLIST_SORT_ORDER}
				sortDirection={SORT_DIR_ASC}
				playedFilter={PLAYED_ALL}
				favoriteOnly={false}
			/>
		);

		expect(screen.getByText('Playlist Order')).toBeTruthy();
		expect(screen.getByText('Filter')).toBeTruthy();
		expect(screen.queryByText('Reset')).toBeNull();
	});

	test('renders reset pill and filter count when modified', () => {
		render(
			<PlaylistSortFilterBar
				sortBy={PLAYLIST_SORT_NAME}
				sortDirection={SORT_DIR_DESC}
				playedFilter={PLAYED_WATCHED}
				favoriteOnly
			/>
		);

		expect(screen.getByText('Name')).toBeTruthy();
		expect(screen.getByText('Reset')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy(); // 2 active filters
	});

	test('clicking reset calls onReset', () => {
		const onReset = jest.fn();
		render(
			<PlaylistSortFilterBar
				sortBy={PLAYLIST_SORT_NAME}
				sortDirection={SORT_DIR_ASC}
				playedFilter={PLAYED_ALL}
				favoriteOnly={false}
				onReset={onReset}
			/>
		);

		fireEvent.click(screen.getByText('Reset'));
		expect(onReset).toHaveBeenCalled();
	});

	test('EmptyPlaylistFilterState renders message and clear button', () => {
		const onReset = jest.fn();
		render(<EmptyPlaylistFilterState onReset={onReset} />);

		expect(screen.getByText('No tracks match the active filters')).toBeTruthy();
		const clearBtn = screen.getByText('Clear Filters');
		expect(clearBtn).toBeTruthy();
		fireEvent.click(clearBtn);
		expect(onReset).toHaveBeenCalled();
	});

	test('PlaylistSortDialog triggers sort selection and direction toggle', () => {
		const onSelectSort = jest.fn();
		const onToggleDirection = jest.fn();
		const onClose = jest.fn();

		render(
			<PlaylistSortDialog
				sortBy={PLAYLIST_SORT_ORDER}
				sortDirection={SORT_DIR_ASC}
				onSelectSort={onSelectSort}
				onToggleDirection={onToggleDirection}
				onClose={onClose}
			/>
		);

		expect(screen.getByText('Sort By')).toBeTruthy();
		fireEvent.click(screen.getByText('Descending'));
		expect(onToggleDirection).toHaveBeenCalledWith(SORT_DIR_DESC);

		fireEvent.click(screen.getByText('Name'));
		expect(onSelectSort).toHaveBeenCalledWith(PLAYLIST_SORT_NAME);
	});

	test('PlaylistFilterDialog triggers filter updates', () => {
		const onUpdateFilter = jest.fn();
		const onClose = jest.fn();

		render(
			<PlaylistFilterDialog
				playedFilter={PLAYED_ALL}
				favoriteOnly={false}
				mediaTypeFilter="all"
				availableMediaTypes={['Audio', 'Video']}
				onUpdateFilter={onUpdateFilter}
				onClose={onClose}
			/>
		);

		expect(screen.getByText('Filter Tracks')).toBeTruthy();
		fireEvent.click(screen.getByText('Favorites Only'));
		expect(onUpdateFilter).toHaveBeenCalledWith({favoriteOnly: true});

		fireEvent.click(screen.getByText('Watched'));
		expect(onUpdateFilter).toHaveBeenCalledWith({playedFilter: PLAYED_WATCHED});

		fireEvent.click(screen.getByText('Audio'));
		expect(onUpdateFilter).toHaveBeenCalledWith({mediaTypeFilter: 'Audio'});
	});
});
