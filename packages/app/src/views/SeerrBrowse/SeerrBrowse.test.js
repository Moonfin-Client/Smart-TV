import {fireEvent, render, waitFor} from '@testing-library/react';

import SeerrBrowse from './SeerrBrowse';

const mockSettings = {settings: {}, updateSetting: () => {}};
const mockRenders = {grid: 0, letters: 0};

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
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
jest.mock('../../theme/themeOverrides', () => ({registerThemeSheet: () => {}}));
jest.mock('../../components/CoreDialog', () => ({portal: (node) => node, useDialogLayer: () => () => {}}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);
// A plain element that counts how often the A to Z bar's letters are drawn.
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => {
		if ('data-letter' in props) mockRenders.letters++;
		return React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
	};
});
// The grid draws every item it holds and counts its own renders.
jest.mock('@enact/sandstone/VirtualList', () => {
	const React = require('react');
	return {
		VirtualGridList: ({dataSize, itemRenderer, spotlightId}) => {
			mockRenders.grid++;
			const drawn = Array.from({length: dataSize}, (_, index) => React.createElement(React.Fragment, {key: index}, itemRenderer({index})));
			return React.createElement('div', {'data-spotlight-id': spotlightId}, drawn);
		}
	};
});
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: true})}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../services/seerrApi', () => {
	const api = {
		discoverFiltered: jest.fn(),
		getImageUrl: (path, size) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)
	};
	return {__esModule: true, ...api, default: api};
});

import {discoverFiltered} from '../../services/seerrApi';

const TITLES = Array.from({length: 12}, (_, i) => ({
	id: 100 + i,
	mediaType: 'movie',
	title: `Movie ${i + 1}`,
	releaseDate: `20${10 + i}-05-01`,
	voteAverage: 7.4,
	posterPath: `/p${i}.jpg`,
	mediaInfo: i === 2 ? {status: 5} : undefined
}));

const find = (selector) => document.querySelector(selector);

const cells = () => document.querySelectorAll('[data-index]');

let browses = 0;
const drawBrowse = async (count = TITLES.length) => {
	// Each browse gets its own key, so none starts from the filters an earlier one saved.
	render(<SeerrBrowse browseType="genre" item={{id: 28 + browses++, name: 'Action'}} />);
	await waitFor(() => expect(cells()).toHaveLength(count));
};

beforeEach(() => {
	discoverFiltered.mockReset();
	discoverFiltered.mockResolvedValue({results: TITLES, totalPages: 1});
});

describe('SeerrBrowse focus line', () => {
	it('stays empty until a poster is focused, then shows that title and keeps it through a filter change', async () => {
		await drawBrowse();
		expect(find('[class~="focusLine"]').textContent).toBe('');

		fireEvent.focus(find('[data-index="2"]'));
		expect(find('[class~="focusTitle"]').textContent).toBe('Movie 3');
		expect(find('[class~="focusMeta"]').textContent).toBe('20127.4AvailableMovie');

		fireEvent.click(find('[data-letter="B"]'));
		await waitFor(() => expect(find('[data-index]')).toBeNull());
		expect(find('[class~="focusTitle"]').textContent).toBe('Movie 3');
	});

	it('redraws neither the grid nor the A to Z bar when focus moves across the grid', async () => {
		await drawBrowse();
		const before = {...mockRenders};

		fireEvent.focus(find('[data-index="0"]'));
		fireEvent.focus(find('[data-index="1"]'));
		fireEvent.focus(find('[data-index="5"]'));

		expect(find('[class~="focusTitle"]').textContent).toBe('Movie 6');
		expect(mockRenders).toEqual(before);
	});

	it('reads the next page on a focus move when the grid asked for it while the last one was landing', async () => {
		discoverFiltered.mockImplementation((type, {page}) => Promise.resolve({
			results: TITLES.map((title) => ({...title, id: page * 100 + title.id})),
			totalPages: 5
		}));
		// The first page draws, which reads the second, and drawing that one asks again too soon.
		await drawBrowse(2 * TITLES.length);
		await new Promise((resolve) => setTimeout(resolve, 600));
		const lastPageRead = () => Math.max(...discoverFiltered.mock.calls.map(([, params]) => params.page));
		expect(lastPageRead()).toBe(2);
		expect(cells()).toHaveLength(2 * TITLES.length);

		fireEvent.focus(find('[data-index="3"]'));
		await waitFor(() => expect(cells()).toHaveLength(3 * TITLES.length));
		expect(lastPageRead()).toBe(3);
		expect(find('[class~="footerCount"]').textContent).toBe('36 Items');
	});
});
