import {act, fireEvent, render, screen} from '@testing-library/react';

import MediaCard from './MediaCard';
import MediaPreviewContext from './MediaPreviewContext';
import {setTmdbThumbsAvailable} from '../../utils/tmdbThumb';

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
	return (props) => {
		const rest = {...props, 'data-spotlight-id': props.spotlightId};
		delete rest.spotlightId;
		delete rest.onSpotlightLeft;
		delete rest.onSpotlightRight;
		return React.createElement(type, rest);
	};
});
let mockSettings = {};
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));
jest.mock('../../services/jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	getApiKey: () => 'token',
	getTokenParam: () => 'ApiKey'
}));
jest.mock('../seerr/SeerrStatusBadge', () => ({SeerrSeasonDot: () => null}));
jest.mock('../icons/SeerrIcon', () => () => null);
jest.mock('../AnimeMarkerPills', () => ({AnimeCardPill: () => null}));
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));

const POSTER = 'https://image.tmdb.org/t/p/w342/poster.jpg';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280/backdrop.jpg';
const THUMB = 'http://server/Moonfin/Tmdb/Thumb?type=movie&tmdbId=603&ApiKey=token';

// A Seerr row title the way normalizeMediaItem leaves it.
const seerrMovie = (overrides = {}) => ({
	Id: 'seerr-movie-603',
	Name: 'The Matrix',
	Type: 'Movie',
	_externalPosterUrl: POSTER,
	_externalBackdropUrl: BACKDROP,
	mediaInfo: {},
	_seerr: true,
	_seerrType: 'item',
	_seerrMediaType: 'movie',
	_seerrRaw: {mediaId: 603, mediaType: 'movie'},
	...overrides
});

const draw = (item, rowImageType) => {
	render(<MediaCard item={item} serverUrl="http://server" rowImageType={rowImageType} />);
	return {
		card: () => document.querySelector('[class~="card"]'),
		image: () => screen.getByRole('img')
	};
};

beforeEach(() => {
	mockSettings = {};
	setTmdbThumbsAvailable(true);
});
afterAll(() => setTmdbThumbsAvailable(false));

describe('MediaCard in a Thumb row', () => {
	it('shows the titled thumb for a Seerr title and turns landscape', () => {
		const {card, image} = draw(seerrMovie(), 'thumb');
		expect(image().getAttribute('src')).toBe(THUMB);
		expect(card().className).toContain('landscape');
	});

	it('shows the plain backdrop when the plugin can\'t make thumbs', () => {
		setTmdbThumbsAvailable(false);
		const {card, image} = draw(seerrMovie(), 'thumb');
		expect(image().getAttribute('src')).toBe(BACKDROP);
		expect(card().className).toContain('landscape');
	});

	it('hands over to the backdrop when the thumb fails to load', () => {
		const {card, image} = draw(seerrMovie(), 'thumb');
		fireEvent.error(image());
		expect(image().getAttribute('src')).toBe(BACKDROP);
		expect(card().className).toContain('landscape');
	});

	it('stays a poster when there is no wide art at all', () => {
		setTmdbThumbsAvailable(false);
		const {card, image} = draw(seerrMovie({_externalBackdropUrl: null}), 'thumb');
		expect(image().getAttribute('src')).toBe(POSTER);
		expect(card().className).toContain('portrait');
	});

	it('picks the thumb up once the plugin ping comes back', () => {
		setTmdbThumbsAvailable(false);
		const {image} = draw(seerrMovie(), 'thumb');
		expect(image().getAttribute('src')).toBe(BACKDROP);
		act(() => setTmdbThumbsAvailable(true));
		expect(image().getAttribute('src')).toBe(THUMB);
	});

	it('keeps an owned outside list title on its library art', () => {
		const owned = seerrMovie({Id: 'lib1', _external: true, _resolvedFromExternal: true, ImageTags: {Primary: 'p', Thumb: 't'}});
		const {image} = draw(owned, 'thumb');
		expect(image().getAttribute('src')).not.toContain('/Moonfin/Tmdb/Thumb');
	});
});

describe('MediaCard in other rows', () => {
	it('shows an owned outside list title on its library poster', () => {
		const owned = seerrMovie({Id: 'lib1', _external: true, _resolvedFromExternal: true, ImageTags: {Primary: 'p'}});
		const {image} = draw(owned, 'poster');
		expect(image().getAttribute('src')).toContain('/Items/lib1/Images/Primary');
	});

	it('keeps the poster in a Poster row', () => {
		const {card, image} = draw(seerrMovie(), 'poster');
		expect(image().getAttribute('src')).toBe(POSTER);
		expect(card().className).toContain('portrait');
	});

	it('leaves a Banner row as it was', () => {
		const {card, image} = draw(seerrMovie(), 'banner');
		expect(image().getAttribute('src')).toBe(POSTER);
		expect(card().className).toContain('banner');
	});
});

it('holds the artwork back while its row is far from focus', () => {
	const {rerender} = render(<MediaCard item={seerrMovie()} serverUrl="http://server" rowImageType="poster" deferImage />);
	expect(document.querySelector('img').hasAttribute('src')).toBe(false);
	rerender(<MediaCard item={seerrMovie()} serverUrl="http://server" rowImageType="poster" />);
	expect(document.querySelector('img').getAttribute('src')).toBe(POSTER);
});

// A controller that records what the card asks of it and lets a test move the phase.
const fakeController = () => {
	const listeners = {};
	const calls = [];
	return {
		listeners,
		calls,
		subscribe: jest.fn((key, listener) => {
			listeners[key] = listener;
			return () => delete listeners[key];
		}),
		schedule: jest.fn((key, item) => calls.push(['schedule', key, item.Id])),
		cancel: jest.fn((key) => calls.push(['cancel', key])),
		stop: jest.fn((reason) => calls.push(['stop', reason])),
		attachFrame: jest.fn((key, el) => calls.push(['attachFrame', key, el ? el.tagName : null]))
	};
};

const libraryMovie = () => ({Id: 'film', Name: 'Film', Type: 'Movie', ImageTags: {Primary: 'p'}});

const drawWithPreview = (item, controller, props = {}) => render(
	<MediaPreviewContext.Provider value={controller}>
		<MediaCard item={item} serverUrl="http://server" spotlightId="media-row-film" {...props} />
	</MediaPreviewContext.Provider>
);

const previewCard = () => document.querySelector('[data-spotlight-id="media-row-film"]');
const frame = () => document.querySelector('[class~="previewFrame"]');
const ring = () => document.querySelector('[class~="previewRing"]');

describe('MediaCard with the media preview', () => {
	it('schedules on focus and hover, cancels on blur and pointer leave', () => {
		const controller = fakeController();
		drawWithPreview(libraryMovie(), controller);

		fireEvent.focus(previewCard());
		fireEvent.blur(previewCard());
		fireEvent.mouseEnter(previewCard());
		fireEvent.mouseLeave(previewCard());

		expect(controller.calls).toEqual([
			['schedule', 'media-row-film', 'film'],
			['cancel', 'media-row-film'],
			['schedule', 'media-row-film', 'film'],
			['cancel', 'media-row-film']
		]);
	});

	it('draws the frame and ring once attached, and holds the zoom off while playing', () => {
		const controller = fakeController();
		drawWithPreview(libraryMovie(), controller);
		expect(frame()).toBeNull();

		act(() => controller.listeners['media-row-film']('attached'));
		expect(frame()).not.toBeNull();
		expect(ring()).not.toBeNull();
		expect(frame().className).not.toContain('previewVisible');
		expect(previewCard().className).not.toContain('previewing');
		expect(controller.attachFrame).toHaveBeenCalledWith('media-row-film', frame());

		act(() => controller.listeners['media-row-film']('playing'));
		expect(frame().className).toContain('previewVisible');
		expect(previewCard().className).toContain('previewing');

		act(() => controller.listeners['media-row-film']('idle'));
		expect(frame()).toBeNull();
		expect(previewCard().className).not.toContain('previewing');
	});

	it('stops the preview before the card is selected', () => {
		const controller = fakeController();
		const onSelect = jest.fn(() => controller.calls.push(['select']));
		drawWithPreview(libraryMovie(), controller, {onSelect});

		fireEvent.click(previewCard());

		expect(controller.calls).toEqual([['stop', 'select'], ['select']]);
	});

	it('asks nothing for a card that can\'t be previewed', () => {
		const controller = fakeController();
		drawWithPreview(seerrMovie({Id: 'cal-radarr-603', _external: true, _calendarDate: '2026-11-01T00:00:00Z'}), controller);

		fireEvent.focus(previewCard());

		expect(controller.subscribe).not.toHaveBeenCalled();
		expect(controller.calls).toEqual([]);
	});

	it('lets a Seerr title take part, since it plays its trailer', () => {
		const controller = fakeController();
		drawWithPreview(seerrMovie(), controller);

		expect(controller.subscribe).toHaveBeenCalledWith('media-row-film', expect.any(Function));
	});

	it('is inert without a provider', () => {
		render(<MediaCard item={libraryMovie()} serverUrl="http://server" spotlightId="media-row-film" />);

		fireEvent.focus(previewCard());
		fireEvent.click(previewCard());

		expect(frame()).toBeNull();
	});
});

describe('MediaCard text in classic home rows', () => {
	const lines = (item, homeText) => {
		const {unmount} = render(<MediaCard item={item} serverUrl="http://server" homeText={homeText} />);
		const card = document.querySelector('[class~="card"]');
		const text = Array.from(card.querySelector('[class~="info"]').children).map((line) => line.textContent);
		const home = card.classList.contains('homeText');
		unmount();
		return {text, home};
	};
	const movie = {Id: 'm1', Type: 'Movie', Name: 'Avatar', ProductionYear: 2009};
	const series = {Id: 's1', Type: 'Series', Name: 'Devs', ProductionYear: 2020};
	const episode = {Id: 'e1', Type: 'Episode', Name: 'The Strike', SeriesName: 'The Nanny', ParentIndexNumber: 2, IndexNumber: 13};

	test('a movie and a series get their year under the name', () => {
		expect(lines(movie, true)).toEqual({text: ['Avatar', '2009'], home: true});
		expect(lines(series, true)).toEqual({text: ['Devs', '2020'], home: true});
	});

	test('a calendar card says when it releases instead of its year', () => {
		const calendar = {...movie, _calendarDate: '2026-11-08T00:00:00.000Z', Subtitle: 'Digital · In 3 days (Nov 8)'};
		expect(lines(calendar, true)).toEqual({text: ['Avatar', 'Digital · In 3 days (Nov 8)'], home: true});
	});

	test('an episode keeps its series over its number and name', () => {
		expect(lines(episode, true)).toEqual({text: ['The Nanny', 'S2:E13 - The Strike'], home: true});
	});

	test('cards outside the home rows keep their single line', () => {
		expect(lines(movie, false)).toEqual({text: ['Avatar'], home: false});
	});

	// A scrolling line carries a second copy of its text, so the copies show which lines move.
	const focusCard = (homeText, textWidth) => {
		const width = jest.spyOn(window.HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(textWidth);
		render(<MediaCard item={episode} serverUrl="http://server" homeText={homeText} />);
		const card = document.querySelector('[class~="card"]');
		const copies = () => card.querySelector('[class~="info"]').querySelectorAll('[aria-hidden="true"]').length;
		return {card, copies, restore: () => width.mockRestore()};
	};

	test('both lines scroll while the card has focus when they are too long for it', () => {
		const {card, copies, restore} = focusCard(true, 400);
		expect(copies()).toBe(0);
		fireEvent.focus(card);
		expect(copies()).toBe(2);
		fireEvent.blur(card);
		expect(copies()).toBe(0);
		restore();
	});

	test('lines that fit stay still on focus', () => {
		const {card, copies, restore} = focusCard(true, 0);
		fireEvent.focus(card);
		expect(copies()).toBe(0);
		restore();
	});

	test('cards outside the home rows never scroll', () => {
		const {card, copies, restore} = focusCard(false, 400);
		fireEvent.focus(card);
		expect(copies()).toBe(0);
		restore();
	});
});

describe('MediaCard Seerr status', () => {
	const dot = () => document.querySelector('[class~="seerrBadge"]');
	const banner = () => document.querySelector('[class~="banner"]');
	const art = () => document.querySelector('[data-card-art]');
	const drawPoster = (item, props) => render(<MediaCard item={item} serverUrl="http://server" rowImageType="poster" {...props} />);

	it('keeps the corner dot in badge mode', () => {
		drawPoster(seerrMovie({mediaInfo: {status: 4}}));
		expect(dot().className).toContain('seerr4');
		expect(banner()).toBeNull();
	});

	it('shows no dot for a title Seerr has no status for', () => {
		drawPoster(seerrMovie());
		expect(dot()).toBeNull();
		expect(banner()).toBeNull();
	});

	it('draws nothing when the badges are off', () => {
		mockSettings = {showSeerrAvailabilityBadges: false, seerrBadgeStyle: 'banner'};
		drawPoster(seerrMovie({mediaInfo: {status: 4}}));
		expect(dot()).toBeNull();
		expect(banner()).toBeNull();
	});

	it('runs a banner across a Seerr title and drops the badges below it', () => {
		mockSettings = {seerrBadgeStyle: 'banner'};
		drawPoster(seerrMovie({mediaInfo: {status: 4}, UserData: {IsFavorite: true}}));
		expect(banner().textContent).toBe('PARTIALLY AVAILABLE');
		expect(dot()).toBeNull();
		expect(art().className).toContain('underSeerrBanner');
		expect(document.querySelector('[class~="favoriteBadge"]')).not.toBeNull();
	});

	it('leaves a title nobody requested without a banner', () => {
		mockSettings = {seerrBadgeStyle: 'banner'};
		drawPoster(seerrMovie());
		expect(banner()).toBeNull();
		expect(art().className).not.toContain('underSeerrBanner');
	});

	it('gives a season a banner only for a status it would have had a dot for', () => {
		mockSettings = {seerrBadgeStyle: 'banner'};
		const season = {Id: 'season1', Name: 'Season 1', Type: 'Season', ImageTags: {Primary: 'p'}};
		const {rerender} = drawPoster(season, {seerrSeasonStatus: 5});
		expect(banner().textContent).toBe('AVAILABLE');

		rerender(<MediaCard item={season} serverUrl="http://server" rowImageType="poster" seerrSeasonStatus={1} />);
		expect(banner()).toBeNull();
		expect(art().className).not.toContain('underSeerrBanner');
	});

	it('leaves library items and outside list titles without a banner', () => {
		mockSettings = {seerrBadgeStyle: 'banner'};
		drawPoster(libraryMovie());
		expect(banner()).toBeNull();
		drawPoster(seerrMovie({Id: 'ext-imdb-1', _external: true}));
		expect(banner()).toBeNull();
	});
});

describe('MediaCard with its own overlay', () => {
	it('draws the overlay in place of the library badges and drops the name below', () => {
		const owned = {Id: 'm1', Name: 'Owned', Type: 'Movie', ImageTags: {Primary: 'p'}, UserData: {IsFavorite: true, Played: true}};
		render(<MediaCard item={owned} serverUrl="http://server" cardType="landscape" overlay={<span data-overlay />} showInfo={false} />);
		expect(document.querySelector('[data-overlay]')).not.toBeNull();
		expect(document.querySelector('[class~="favoriteBadge"]')).toBeNull();
		expect(document.querySelector('[class~="watchedBadge"]')).toBeNull();
		expect(document.querySelector('[class~="info"]')).toBeNull();
	});

	it("keeps an owned title's list backdrop when the library has no wide art for it", () => {
		const owned = {Id: 'm1', Name: 'Owned', Type: 'Movie', ImageTags: {Primary: 'p'}, _external: true, _resolvedFromExternal: true, _externalBackdropUrl: BACKDROP};
		render(<MediaCard item={owned} serverUrl="http://server" cardType="landscape" rowImageType="backdrop" />);
		expect(document.querySelector('img').getAttribute('src')).toBe(BACKDROP);
	});
});
