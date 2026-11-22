import {act, render} from '@testing-library/react';

import CarouselPanel, {panelMediaPills} from './CarouselPanel';

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
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: {}})}));
const mockApi = {getItemMediaInfo: jest.fn()};
jest.mock('../../context/AuthContext', () => ({useAuth: () => ({api: mockApi})}));
jest.mock('../../services/jellyfinApi', () => ({createApiForServer: () => mockApi}));
jest.mock('../../services/mdblistApi', () => ({isMdblistEnabled: () => false}));
let mockFadeMs = 0;
jest.mock('../MediaCard/ModernMediaCard', () => ({expandMs: () => mockFadeMs}));
jest.mock('../RatingsRow', () => () => null);
jest.mock('../../utils/scrimImage', () => ({scrimStyle: () => null}));

const SERVER = 'http://server';
const movie = {
	Id: 'martian', Name: 'The Martian', Type: 'Movie', MediaType: 'Video', ProductionYear: 2015, OfficialRating: 'PG-13',
	RunTimeTicks: 141 * 60 * 10000000, Genres: ['Science Fiction', 'Drama', 'Adventure', 'Thriller'],
	BackdropImageTags: ['b'], Overview: 'Stranded on Mars.'
};
const episode = {
	Id: 'ep', Name: 'Run Boy Run', Type: 'Episode', MediaType: 'Video', SeriesName: 'The Umbrella Academy',
	ParentIndexNumber: 1, IndexNumber: 2, ProductionYear: 2019, RunTimeTicks: 57 * 60 * 10000000,
	BackdropImageTags: [], ParentBackdropItemId: 'series', ParentBackdropImageTags: ['s']
};
const streams = [
	{Type: 'Video', Width: 1920, Height: 1080, Codec: 'h264'},
	{Type: 'Audio', Codec: 'eac3', Channels: 6, IsDefault: true}
];

const textOf = (selector) => document.querySelector(`[class~="${selector}"]`)?.textContent ?? null;
const draw = (item, props = {}) => render(<CarouselPanel item={item} serverUrl={SERVER} {...props} />);

beforeEach(() => {
	jest.useFakeTimers();
	mockApi.getItemMediaInfo.mockReset();
	mockApi.getItemMediaInfo.mockResolvedValue({MediaSources: [{MediaStreams: []}]});
});
afterEach(() => {
	jest.useRealTimers();
	mockFadeMs = 0;
});

describe('CarouselPanel', () => {
	it('shows a film over its own backdrop with its facts and overview', () => {
		draw({...movie, MediaStreams: streams});
		expect(textOf('title')).toBe('The Martian');
		expect(textOf('episode')).toBeNull();
		expect(textOf('info')).toBe('2015•PG-13•2h 21m•Science Fiction, Drama, Adventure');
		expect(Array.from(document.querySelectorAll('[class~="pill"]')).map((pill) => pill.textContent)).toEqual(['1080p', 'H.264', 'EAC3', '5.1']);
		expect(textOf('overview')).toBe('Stranded on Mars.');
		expect(document.querySelector('img').getAttribute('src')).toContain(`${SERVER}/Items/martian/Images/Backdrop`);
		expect(document.querySelector('[class~="empty"]')).toBeNull();
	});

	it('titles an episode by its series, with its number and name under it and the series backdrop', () => {
		draw(episode);
		expect(textOf('title')).toBe('The Umbrella Academy');
		expect(textOf('episode')).toBe('S1:E2 - Run Boy Run');
		expect(document.querySelector('img').getAttribute('src')).toContain('/Items/series/Images/Backdrop');
	});

	it('stays an empty translucent panel when there is no backdrop', () => {
		draw({...episode, ParentBackdropItemId: null, ParentBackdropImageTags: null});
		expect(document.querySelector('img')).toBeNull();
		expect(document.querySelector('[class~="empty"]')).not.toBeNull();
		expect(textOf('title')).toBe('The Umbrella Academy');
	});

	it('leaves the overview out when Hide Media Description is on', () => {
		draw(movie, {hideOverview: true});
		expect(textOf('overview')).toBeNull();
	});

	it('holds the backdrop back while the row\'s images are', () => {
		draw(movie, {deferImage: true});
		expect(document.querySelector('img')).toBeNull();
		expect(textOf('title')).toBe('The Martian');
	});

	it('crossfades to a new title at the Modern card speed, and swaps at once when that is off', () => {
		const titles = () => Array.from(document.querySelectorAll('h3')).map((h) => h.textContent);
		const {rerender} = draw(movie);
		rerender(<CarouselPanel item={episode} serverUrl={SERVER} />);
		expect(titles()).toEqual(['The Umbrella Academy']);

		mockFadeMs = 180;
		rerender(<CarouselPanel item={movie} serverUrl={SERVER} />);
		expect(titles()).toEqual(['The Umbrella Academy', 'The Martian']);
		expect(document.querySelector('[class~="fadeOut"] h3').textContent).toBe('The Umbrella Academy');
		// A refreshed copy of the same title mid fade still lets the old one go.
		rerender(<CarouselPanel item={{...movie}} serverUrl={SERVER} />);
		act(() => {
			jest.advanceTimersByTime(180);
		});
		expect(titles()).toEqual(['The Martian']);
	});

	it('stands in empty with no item', () => {
		draw(null);
		expect(document.querySelector('[class~="empty"]')).not.toBeNull();
		expect(textOf('title')).toBeNull();
	});

	it('fetches the streams only once focus rests on a title in a focused row, and keeps them for the next visit', async () => {
		mockApi.getItemMediaInfo.mockResolvedValue({MediaSources: [{MediaStreams: streams}]});
		const item = {...movie, Id: 'fetched'};
		const {rerender, unmount} = draw(item);
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(mockApi.getItemMediaInfo).not.toHaveBeenCalled();
		rerender(<CarouselPanel item={item} serverUrl={SERVER} rowFocused />);
		expect(mockApi.getItemMediaInfo).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(mockApi.getItemMediaInfo).toHaveBeenCalledWith('fetched');
		expect(document.querySelectorAll('[class~="pill"]')).toHaveLength(4);

		rerender(<CarouselPanel item={movie} serverUrl={SERVER} rowFocused />);
		unmount();
		draw(item, {rowFocused: true});
		expect(document.querySelectorAll('[class~="pill"]')).toHaveLength(4);
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(mockApi.getItemMediaInfo).toHaveBeenCalledTimes(1);
	});

	it('asks nothing for a title with no streams of its own, like a series or an outside list title', async () => {
		draw({...movie, Id: 'show', Type: 'Series', MediaType: 'Unknown'}, {rowFocused: true});
		draw({...movie, Id: 'seerr', _seerr: true}, {rowFocused: true});
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(mockApi.getItemMediaInfo).not.toHaveBeenCalled();
	});
});

describe('panelMediaPills', () => {
	it('names the HDR type only when there is one', () => {
		const hdr = [{Type: 'Video', Width: 3840, Height: 2160, Codec: 'hevc', VideoRangeType: 'HDR10'}, {Type: 'Audio', Codec: 'truehd', Channels: 8}];
		expect(panelMediaPills({MediaStreams: hdr})).toEqual(['4K', 'HDR10', 'HEVC', 'TRUEHD', '7.1']);
		expect(panelMediaPills({MediaStreams: streams})).not.toContain('SDR');
		expect(panelMediaPills({})).toEqual([]);
	});
});
