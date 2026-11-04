import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

import SeerrDiscover, {discoverSizes} from './SeerrDiscover';

const mockSettings = {settings: {}};
const mockSeerr = {isAuthenticated: true, isEnabled: true, user: {seerrUserId: 7}};
const mockModernRows = [];

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
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => false}));
jest.mock('../../theme/themeOverrides', () => ({registerThemeSheet: () => {}}));
// Spotlight's own props would be unknown attributes on the plain elements these mocks render.
const plain = (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
};
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	const Plain = plain(type);
	return ({className, ...props}) => React.createElement(Plain, {...props, className: [className, 'spottable'].filter(Boolean).join(' ')});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => plain(type));
jest.mock('../../context/SeerrContext', () => ({useSeerr: () => mockSeerr}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => mockSettings}));
jest.mock('../../context/AuthContext', () => ({useAuth: () => ({serverUrl: 'http://server'})}));
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../components/BackdropLayer', () => () => null);
jest.mock('../../utils/scrimImage', () => ({scrimStyle: () => null}));
jest.mock('../../utils/seerrSliders', () => ({
	isSupportedSlider: () => true,
	loadDiscoverSliders: () => Promise.resolve([]),
	loadSliderPage: () => Promise.resolve(null)
}));
jest.mock('../../utils/seerrHydration', () => ({
	__esModule: true,
	default: (requests) => Promise.resolve(requests),
	hydrateWatchlistItems: (items) => Promise.resolve(items),
	hydrateRecentlyAddedItems: (records) => Promise.resolve(records.map((record) => ({id: record.tmdbId, mediaType: record.mediaType, title: `Added ${record.tmdbId}`, mediaInfo: record})))
}));
// Home's Modern row stands in as a marker, holding on to what Discover handed it.
jest.mock('../../components/MediaRow', () => {
	const React = require('react');
	return {
		ModernMediaRow: (props) => {
			mockModernRows.push(props);
			return React.createElement('div', {'data-modern-row': props.rowId, 'data-spotlight-id': props.spotlightId});
		}
	};
});
jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {
		getUser: jest.fn(),
		PERMISSIONS: {ADMIN: 2, MANAGE_REQUESTS: 16, REQUEST_VIEW: 16384, RECENT_VIEW: 67108864},
		hasPermission: (perms, permission) => Boolean(perms & 2) || Boolean(perms & permission),
		canManageRequests: () => false,
		canManageIssues: () => false,
		getRecentRequests: jest.fn(),
		getWatchlist: jest.fn(),
		getRecentlyAdded: jest.fn(),
		trending: jest.fn(),
		trendingMovies: jest.fn(),
		trendingTv: jest.fn(),
		upcomingMovies: jest.fn(),
		upcomingTv: jest.fn(),
		getGenreSliderMovies: jest.fn(),
		getGenreSliderTv: jest.fn(),
		getImageUrl: (path, size) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)
	}
}));

import seerrApi from '../../services/seerrApi';

const MODERN_ROWS = ['recentRequests', 'yourWatchlist', 'recentlyAdded', 'trending', 'popularMovies', 'upcomingMovies', 'popularTv', 'upcomingTv'];

// The latest props each Modern row was drawn with.
const modernRow = (rowId) => mockModernRows.filter((props) => props.rowId === rowId).pop();

const find = (selector) => document.querySelector(selector);

const drawDiscover = async (props = {}) => {
	render(<SeerrDiscover onOpenRequests={() => {}} {...props} />);
	await waitFor(() => expect(find('[data-spotlight-id="discover-row-0"]')).not.toBeNull());
};

// Twenty titles a page, the way Seerr pages its discover lists.
const page = (prefix, mediaType) => (pageNumber = 1) => Promise.resolve({
	totalPages: 5,
	results: Array.from({length: 20}, (_, i) => ({
		id: pageNumber * 100 + i,
		mediaType,
		title: mediaType === 'movie' ? `${prefix} ${pageNumber}-${i}` : undefined,
		name: mediaType === 'tv' ? `${prefix} ${pageNumber}-${i}` : undefined,
		posterPath: '/poster.jpg',
		backdropPath: '/backdrop.jpg'
	}))
});

beforeEach(() => {
	mockModernRows.length = 0;
	mockSettings.settings = {};
	// RECENT_VIEW, so Recently Added shows.
	seerrApi.getUser.mockResolvedValue({id: 7, permissions: 67108864});
	seerrApi.getWatchlist.mockResolvedValue({results: [{id: 550, mediaType: 'movie', title: 'Fight Club', posterPath: '/f.jpg'}], totalPages: 1});
	seerrApi.getRecentlyAdded.mockResolvedValue({results: [{id: 3, tmdbId: 27205, mediaType: 'movie', status: 5}]});
	seerrApi.getRecentRequests.mockResolvedValue({results: [
		{id: 41, status: 3, type: 'movie', media: {tmdbId: 603, title: 'The Matrix', status: 1, posterPath: '/m.jpg'}},
		{id: 42, status: 2, type: 'movie', media: {tmdbId: 603, title: 'The Matrix', status: 3, jellyfinMediaId: 'lib603'}},
		{id: 43, status: 1, type: 'tv', media: {}}
	]});
	seerrApi.trending.mockImplementation(page('Trending', 'movie'));
	seerrApi.trendingMovies.mockImplementation(page('Movie', 'movie'));
	seerrApi.trendingTv.mockImplementation(page('Show', 'tv'));
	seerrApi.upcomingMovies.mockImplementation(page('Upcoming', 'movie'));
	seerrApi.upcomingTv.mockImplementation(page('Soon', 'tv'));
	seerrApi.getGenreSliderMovies.mockResolvedValue([{id: 28, name: 'Action', backdrops: []}]);
	seerrApi.getGenreSliderTv.mockResolvedValue([]);
});

describe('SeerrDiscover in the Modern style', () => {
	it('draws Core\'s rows in Core\'s order, the media rows with Home\'s Modern row in its Core look', async () => {
		await drawDiscover();
		const drawn = Array.from(document.querySelectorAll('[data-modern-row]')).map((el) => el.getAttribute('data-modern-row'));
		expect(drawn).toEqual(MODERN_ROWS);
		// The shortcuts row leads and stays a tile row, so its id still belongs to Discover's own row.
		expect(find('[data-spotlight-id="discover-row-0"]').getAttribute('data-modern-row')).toBeNull();
		expect(modernRow('recentRequests').spotlightId).toBe('discover-row-1');
		expect(modernRow('trending').spotlightId).toBe('discover-row-4');
		expect(modernRow('trending')).toMatchObject({coreLook: true, leadingInset: 134, title: 'Trending'});
		expect(screen.getByText('Action')).toBeTruthy();
		expect(screen.getByText('Movie Genres')).toBeTruthy();
	});

	it('moves the rows in for the left rail', async () => {
		mockSettings.settings = {navbarPosition: 'left'};
		await drawDiscover();
		expect(modernRow('trending').leadingInset).toBe(147);
		expect(find('[class~="modernRows"]').style.top).toBe('120px');
		expect(find('[class~="pills"]').style.top).toBe('47px');
	});

	it('reads only the user\'s own requests unless they can see everyone\'s', async () => {
		await drawDiscover();
		expect(seerrApi.getRecentRequests).toHaveBeenCalledWith(7, 15);
	});

	it('reads every request for a request manager, and hides Recently Added without its permission', async () => {
		seerrApi.getUser.mockResolvedValue({id: 7, permissions: 16});
		await drawDiscover();
		expect(seerrApi.getRecentRequests).toHaveBeenCalledWith(null, 15);
		expect(seerrApi.getRecentlyAdded).not.toHaveBeenCalled();
		expect(find('[data-modern-row="recentlyAdded"]')).toBeNull();
	});

	it('hands the rows normalized items, a card per request', async () => {
		await drawDiscover();
		const trending = modernRow('trending').items;
		expect(trending).toHaveLength(20);
		expect(trending[0]).toMatchObject({Id: 'seerr-movie-100', Type: 'Movie', _seerrMediaType: 'movie', _seerrRaw: {mediaId: 100, mediaType: 'movie'}});
		const requests = modernRow('recentRequests').items;
		expect(requests.map((item) => item.Id)).toEqual(['seerr-request-41', 'seerr-request-42']);
		expect(modernRow('recentlyAdded').items[0]).toMatchObject({Id: 'seerr-movie-27205', mediaInfo: {status: 5}});
	});

	it('leaves owned, blocked and adult titles off the media rows', async () => {
		seerrApi.trending.mockResolvedValue({totalPages: 1, results: [
			{id: 1, mediaType: 'movie', title: 'Owned', mediaInfo: {status: 5}},
			{id: 2, mediaType: 'movie', title: 'Partly', mediaInfo: {status: 4}},
			{id: 3, mediaType: 'movie', title: 'Blocked', mediaInfo: {status: 6}},
			{id: 4, mediaType: 'movie', title: 'Night Moves', adult: true},
			{id: 5, mediaType: 'movie', title: 'Quiet', overview: 'An erotic thriller.'},
			{id: 6, mediaType: 'movie', title: 'Requested', mediaInfo: {status: 3}}
		]});
		await drawDiscover();
		expect(modernRow('trending').items.map((item) => item.Name)).toEqual(['Requested']);
	});

	it('opens the same Seerr detail the classic card opens', async () => {
		const onSelectItem = jest.fn();
		await drawDiscover({onSelectItem});
		const requests = modernRow('recentRequests');
		act(() => requests.onSelectItem(requests.items[1]));
		expect(onSelectItem).toHaveBeenCalledWith({mediaId: 603, mediaType: 'movie', libraryId: 'lib603'});
		const show = modernRow('popularTv');
		act(() => show.onSelectItem(show.items[0]));
		expect(onSelectItem).toHaveBeenLastCalledWith({mediaId: 100, mediaType: 'tv', libraryId: null});
	});

	it('keeps paging a row through the load more callback', async () => {
		await drawDiscover();
		const first = modernRow('trending');
		await act(async () => {
			first.onLoadMore('trending');
		});
		expect(seerrApi.trending).toHaveBeenLastCalledWith(2);
		await waitFor(() => expect(modernRow('trending').items).toHaveLength(40));
		// The callback the row kept from its first draw still reaches the current page.
		await act(async () => {
			first.onLoadMore('trending');
		});
		expect(seerrApi.trending).toHaveBeenLastCalledWith(3);
	});

	it('moves Up from the second row to the first on the first press', async () => {
		const Spotlight = require('@enact/spotlight');
		await drawDiscover();
		Spotlight.focus.mockClear();
		act(() => modernRow('recentRequests').onNavigateUp(1));
		expect(Spotlight.focus).toHaveBeenCalledWith('discover-row-0');
	});

	it('keeps its rows when the Seerr context hands over the same account again', async () => {
		const {rerender} = render(<SeerrDiscover onOpenRequests={() => {}} />);
		await waitFor(() => expect(find('[data-spotlight-id="discover-row-0"]')).not.toBeNull());
		mockSeerr.user = {seerrUserId: 7};
		rerender(<SeerrDiscover onOpenRequests={() => {}} />);
		// Long enough for a reload to have asked for the requests again.
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(seerrApi.getRecentRequests).toHaveBeenCalledTimes(1);
		expect(find('[data-spotlight-id="discover-row-0"]')).not.toBeNull();
	});

	it('comes back to the row it was left on, found by its id', async () => {
		const Spotlight = require('@enact/spotlight');
		const {unmount} = render(<SeerrDiscover onOpenRequests={() => {}} />);
		await waitFor(() => expect(find('[data-spotlight-id="discover-row-4"]')).not.toBeNull());
		act(() => modernRow('trending').onFocus(4));
		unmount();
		Spotlight.focus.mockClear();
		await drawDiscover();
		expect(Spotlight.focus).toHaveBeenLastCalledWith('discover-row-4');
	});

	it('comes back to the pill it was left on', async () => {
		const Spotlight = require('@enact/spotlight');
		const {unmount} = render(<SeerrDiscover onOpenRequests={() => {}} onOpenSearch={() => {}} />);
		await waitFor(() => expect(find('[data-spotlight-id="discover-search-pill"]')).not.toBeNull());
		fireEvent.focus(find('[data-spotlight-id="discover-search-pill"]'));
		unmount();
		Spotlight.focus.mockClear();
		await drawDiscover({onOpenSearch: () => {}});
		expect(Spotlight.focus).toHaveBeenCalledWith('discover-search-pill');
	});

	it('puts Search and Requests over the rows', async () => {
		await drawDiscover({onOpenSearch: () => {}});
		expect(find('[data-spotlight-id="discover-search-pill"]').textContent).toBe('Search');
		expect(find('[data-spotlight-id="discover-requests-pill"]').textContent).toBe('Requests');
	});
});

describe('discoverSizes', () => {
	test('posters follow the poster size like Home\'s, and tiles keep 180 by 90 points at Medium', () => {
		expect(discoverSizes('default', true)).toEqual({
			posterWidth: 134, posterHeight: 200, posterGap: 28, rowTop: 34, rowHeight: 349,
			tileWidth: 300, tileHeight: 150, logoInset: 27
		});
		expect(discoverSizes('small', true)).toMatchObject({posterWidth: 107, posterHeight: 160, tileWidth: 240, tileHeight: 120});
		expect(discoverSizes('large', true)).toMatchObject({posterWidth: 160, posterHeight: 240, tileWidth: 360, tileHeight: 180});
		expect(discoverSizes('xlarge', true)).toMatchObject({posterWidth: 187, posterHeight: 280, tileWidth: 420, tileHeight: 210});
		expect(discoverSizes('grandparents', true)).toEqual(discoverSizes('xlarge', true));
	});

	test('focus expansion off drops the growth room and its share of the gap', () => {
		expect(discoverSizes('xlarge', false)).toMatchObject({posterGap: 20, rowTop: 10, rowHeight: 405});
		expect(discoverSizes('xlarge', true)).toMatchObject({posterGap: 31, rowTop: 44, rowHeight: 439});
	});
});

describe('SeerrDiscover in the Classic style', () => {
	it('keeps its own rows under Core\'s info panel, which holds its space until a poster is focused', async () => {
		mockSettings.settings = {homeRowsStyle: 'v1'};
		await drawDiscover();
		expect(find('[data-modern-row]')).toBeNull();
		expect(mockModernRows).toHaveLength(0);
		expect(find('[class~="infoSpacer"]')).not.toBeNull();
		expect(find('[class~="modernRows"]')).toBeNull();
		const posters = document.querySelectorAll('[data-spotlight-id="discover-row-4"] [class~="mediaCard"]');
		expect(posters).toHaveLength(20);
		expect(posters[0].querySelector('[class~="title"]').textContent).toBe('Trending 1-0');
		expect(posters[0].classList.contains('zoom')).toBe(true);
	});

	it('wraps focus around the ends of a row the way Home does', async () => {
		const Spotlight = require('@enact/spotlight');
		mockSettings.settings = {homeRowsStyle: 'v1', navbarPosition: 'top'};
		await drawDiscover();
		const posters = document.querySelectorAll('[data-spotlight-id="discover-row-4"] [class~="mediaCard"]');
		Spotlight.focus.mockClear();
		expect(fireEvent.keyDown(posters[19], {keyCode: 39})).toBe(false);
		expect(Spotlight.focus).toHaveBeenLastCalledWith(posters[0]);
		expect(fireEvent.keyDown(posters[0], {keyCode: 37})).toBe(false);
		expect(Spotlight.focus).toHaveBeenLastCalledWith(posters[19]);
		expect(fireEvent.keyDown(posters[0], {keyCode: 39})).toBe(true);
		expect(fireEvent.keyDown(posters[19], {keyCode: 37})).toBe(true);
	});

	it('sends Left from a row\'s first card to the sidebar', async () => {
		const Spotlight = require('@enact/spotlight');
		mockSettings.settings = {homeRowsStyle: 'v1', navbarPosition: 'left'};
		await drawDiscover();
		const posters = document.querySelectorAll('[data-spotlight-id="discover-row-4"] [class~="mediaCard"]');
		Spotlight.focus.mockClear();
		expect(fireEvent.keyDown(posters[0], {keyCode: 37})).toBe(false);
		expect(Spotlight.focus).toHaveBeenLastCalledWith('navbar');
	});

	it('drops the focus growth when focus expansion is off', async () => {
		mockSettings.settings = {homeRowsStyle: 'v1', cardFocusZoom: false};
		await drawDiscover();
		const posters = document.querySelectorAll('[data-spotlight-id="discover-row-4"] [class~="mediaCard"]');
		expect(posters).toHaveLength(20);
		expect(posters[0].classList.contains('zoom')).toBe(false);
	});
});
