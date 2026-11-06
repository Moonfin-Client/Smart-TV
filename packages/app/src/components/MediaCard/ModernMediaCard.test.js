import {act, fireEvent, render, screen} from '@testing-library/react';

import ModernMediaCard from './ModernMediaCard';
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
jest.mock('@enact/i18n/$L', () => (text) => text);
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
jest.mock('../../services/mdblistApi', () => ({isMdblistEnabled: () => false}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos', isWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('../../utils/perfTier', () => ({getPerfTier: () => 'high'}));
jest.mock('../RatingsRow', () => () => null);
jest.mock('../icons/SeerrIcon', () => () => null);
jest.mock('../AnimeMarkerPills', () => ({AnimeCardPill: () => null}));
jest.mock('../../hooks/useItemMenuHold', () => () => ({}));

const POSTER = 'https://image.tmdb.org/t/p/w342/poster.jpg';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280/backdrop.jpg';
const THUMB = 'http://server/Moonfin/Tmdb/Thumb?type=tv&tmdbId=1396&ApiKey=token';

// A Seerr row show the way normalizeMediaItem leaves it.
const seerrShow = (overrides = {}) => ({
	Id: 'seerr-tv-1396',
	Name: 'Breaking Bad',
	Type: 'Series',
	_externalPosterUrl: POSTER,
	_externalBackdropUrl: BACKDROP,
	mediaInfo: {},
	_seerr: true,
	_seerrType: 'item',
	_seerrMediaType: 'tv',
	_seerrRaw: {mediaId: 1396, mediaType: 'tv'},
	...overrides
});

// Nothing loads in the test DOM, so a focused card waits out its art before it opens.
const ART_WAIT_MS = 300;
const passArtWait = () => act(() => {
	jest.advanceTimersByTime(ART_WAIT_MS);
});

const draw = (item, isFocused) => {
	const {unmount} = render(<ModernMediaCard item={item} serverUrl="http://server" isFocused={isFocused} />);
	passArtWait();
	const src = screen.getByRole('img').getAttribute('src');
	unmount();
	return src;
};

beforeEach(() => {
	mockSettings = {};
	jest.useFakeTimers();
	setTmdbThumbsAvailable(true);
});
afterEach(() => jest.useRealTimers());
afterAll(() => setTmdbThumbsAvailable(false));

describe('ModernMediaCard with a Seerr title', () => {
	it('wears the poster at rest and grows into the titled thumb', () => {
		expect(draw(seerrShow(), false)).toBe(POSTER);
		expect(draw(seerrShow(), true)).toBe(THUMB);
	});

	it('grows into the plain backdrop when the plugin can\'t make thumbs', () => {
		setTmdbThumbsAvailable(false);
		expect(draw(seerrShow(), true)).toBe(BACKDROP);
	});

	it('hands over to the backdrop when the thumb fails to load', () => {
		render(<ModernMediaCard item={seerrShow()} serverUrl="http://server" isFocused />);
		passArtWait();
		fireEvent.error(screen.getByRole('img'));
		expect(screen.getByRole('img').getAttribute('src')).toBe(BACKDROP);
	});

	it('finds the thumb for a title with no poster', () => {
		expect(draw(seerrShow({_externalPosterUrl: null}), true)).toBe(THUMB);
	});

	it('keeps an owned outside list title on the art it already had', () => {
		const owned = seerrShow({Id: 'lib1', _external: true, _resolvedFromExternal: true, ImageTags: {Primary: 'p'}});
		expect(draw(owned, true)).toBe(BACKDROP);
	});

	it('grows an owned outside list title into its library thumb', () => {
		const owned = seerrShow({Id: 'lib1', _external: true, _resolvedFromExternal: true, ImageTags: {Primary: 'p', Thumb: 't'}});
		expect(draw(owned, true)).toContain('/Items/lib1/Images/Thumb');
	});
});

describe('ModernMediaCard growing on focus', () => {
	// Each test gets its own title, since art that has loaded stays remembered.
	const thumbed = (id) => ({Id: id, Name: 'Film', Type: 'Movie', ProductionYear: 2020, ImageTags: {Primary: 'p', Thumb: 't'}});
	const RealImage = window.Image;
	let loads;

	beforeEach(() => {
		loads = [];
		window.Image = function FakeImage () {
			const art = {};
			loads.push(art);
			return art;
		};
	});
	afterEach(() => {
		window.Image = RealImage;
	});

	const shown = () => screen.getByRole('img').getAttribute('src');

	it('keeps the poster until the wide art has loaded, then grows into it', () => {
		render(<ModernMediaCard item={thumbed('loads')} serverUrl="http://server" isFocused />);
		expect(shown()).toContain('/Images/Primary');
		expect(loads[0].src).toContain('/Images/Thumb');

		act(() => loads[0].onload());
		expect(shown()).toContain('/Images/Thumb');
	});

	it('grows anyway once the art takes too long', () => {
		render(<ModernMediaCard item={thumbed('slow')} serverUrl="http://server" isFocused />);
		passArtWait();
		expect(shown()).toContain('/Images/Thumb');
	});

	it('fetches the wide art ahead for a card beside the focused one, which then opens at once', () => {
		const {rerender} = render(<ModernMediaCard item={thumbed('beside')} serverUrl="http://server" warmFocusArt />);
		expect(shown()).toContain('/Images/Primary');
		expect(loads.map((art) => art.src)).toEqual([expect.stringContaining('/Images/Thumb')]);

		act(() => loads[0].onload());
		rerender(<ModernMediaCard item={thumbed('beside')} serverUrl="http://server" isFocused />);
		expect(shown()).toContain('/Images/Thumb');
		expect(loads).toHaveLength(1);
	});
});

describe('ModernMediaCard sliding open', () => {
	// Medium, as the card times it.
	const OPEN_MS = 180;
	const thumbed = (id) => ({Id: id, Name: 'Film', Type: 'Movie', ProductionYear: 2020, ImageTags: {Primary: 'p', Thumb: 't'}});
	const art = (container) => container.querySelector('[data-card-art] img:not([alt=""])');
	const veil = (container) => container.querySelector('[data-card-art] img[alt=""]');

	beforeEach(() => {
		mockSettings = {modernCardTransitionSpeed: 'medium'};
	});
	afterEach(() => {
		mockSettings = {};
	});

	it('fades the poster off the wide art as the card opens', () => {
		const {container} = render(<ModernMediaCard item={thumbed('opens')} serverUrl="http://server" isFocused />);
		expect(veil(container).style.opacity).toBe('1');
		passArtWait();
		expect(art(container).getAttribute('src')).toContain('/Images/Thumb');
		expect(veil(container).getAttribute('src')).toContain('/Images/Primary');
		// The poster stays over the wide art until that art is shown.
		expect(veil(container).style.opacity).toBe('1');
		fireEvent.load(art(container));
		expect(veil(container).style.opacity).toBe('0');
	});

	it('holds the wide art while the card slides shut, then goes back to the poster', () => {
		const {container, rerender} = render(<ModernMediaCard item={thumbed('closes')} serverUrl="http://server" isFocused />);
		passArtWait();
		rerender(<ModernMediaCard item={thumbed('closes')} serverUrl="http://server" />);
		expect(art(container).getAttribute('src')).toContain('/Images/Thumb');
		expect(veil(container).style.opacity).toBe('1');

		act(() => {
			jest.advanceTimersByTime(OPEN_MS);
		});
		expect(art(container).getAttribute('src')).toContain('/Images/Primary');
		expect(veil(container)).toBeNull();
	});

	it('opens at once with no poster over it when the transition is off', () => {
		mockSettings = {modernCardTransitionSpeed: 'off'};
		const {container, rerender} = render(<ModernMediaCard item={thumbed('instant')} serverUrl="http://server" isFocused />);
		passArtWait();
		expect(veil(container)).toBeNull();
		rerender(<ModernMediaCard item={thumbed('instant')} serverUrl="http://server" />);
		expect(art(container).getAttribute('src')).toContain('/Images/Primary');
	});
});

describe('ModernMediaCard description', () => {
	const film = {Id: 'described', Name: 'Film', Type: 'Movie', ProductionYear: 2020, Overview: 'A story.', ImageTags: {Primary: 'p'}};

	it('shows under the focused card unless the row hides it', () => {
		const {rerender} = render(<ModernMediaCard item={film} serverUrl="http://server" isFocused />);
		passArtWait();
		expect(screen.getByText('A story.')).toBeTruthy();
		rerender(<ModernMediaCard item={film} serverUrl="http://server" isFocused hideOverview />);
		expect(screen.queryByText('A story.')).toBeNull();
		expect(screen.getByText('Film')).toBeTruthy();
	});
});

it('keeps a calendar card\'s release line ahead of its year on focus', () => {
	const item = {Id: 'calendar', Name: 'Film', Type: 'Movie', ProductionYear: 2026, _calendarDate: '2026-11-08T00:00:00.000Z', Subtitle: 'Digital · In 3 days (Nov 8)'};
	render(<ModernMediaCard item={item} serverUrl="http://server" isFocused />);
	expect(screen.getByText('Digital · In 3 days (Nov 8) • 2026')).toBeTruthy();
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
		<ModernMediaCard item={item} serverUrl="http://server" spotlightId="media-row-film" {...props} />
	</MediaPreviewContext.Provider>
);

const card = () => document.querySelector('[data-spotlight-id="media-row-film"]');
const frame = () => document.querySelector('[class~="previewFrame"]');
const ring = () => document.querySelector('[class~="previewRing"]');

describe('ModernMediaCard with the media preview', () => {
	it('schedules on focus and hover, cancels on blur and pointer leave', () => {
		const controller = fakeController();
		drawWithPreview(libraryMovie(), controller);

		fireEvent.focus(card());
		fireEvent.blur(card());
		fireEvent.mouseEnter(card());
		fireEvent.mouseLeave(card());

		expect(controller.calls).toEqual([
			['schedule', 'media-row-film', 'film'],
			['cancel', 'media-row-film'],
			['schedule', 'media-row-film', 'film'],
			['cancel', 'media-row-film']
		]);
	});

	it('draws the frame and ring once attached and reveals the frame when playing', () => {
		const controller = fakeController();
		drawWithPreview(libraryMovie(), controller);
		expect(frame()).toBeNull();
		expect(ring()).toBeNull();

		act(() => controller.listeners['media-row-film']('attached'));
		expect(frame()).not.toBeNull();
		expect(ring()).not.toBeNull();
		expect(frame().className).not.toContain('previewVisible');
		expect(controller.attachFrame).toHaveBeenCalledWith('media-row-film', frame());
		// The poster stays up under the frame until there is a picture.
		expect(screen.getByRole('img')).not.toBeNull();

		act(() => controller.listeners['media-row-film']('playing'));
		expect(frame().className).toContain('previewVisible');

		act(() => controller.listeners['media-row-film']('idle'));
		expect(frame()).toBeNull();
		expect(ring()).toBeNull();
	});

	it('stops the preview before the card is selected', () => {
		const controller = fakeController();
		const onSelect = jest.fn(() => controller.calls.push(['select']));
		drawWithPreview(libraryMovie(), controller, {onSelect});

		fireEvent.click(card());

		expect(controller.calls).toEqual([['stop', 'select'], ['select']]);
	});

	it('asks nothing for a card that can\'t be previewed', () => {
		const controller = fakeController();
		drawWithPreview(seerrShow({Id: 'cal-radarr-603', _external: true, _calendarDate: '2026-11-01T00:00:00Z'}), controller);

		fireEvent.focus(card());
		fireEvent.click(card());

		expect(controller.subscribe).not.toHaveBeenCalled();
		expect(controller.calls).toEqual([]);
	});

	it('lets a Seerr title take part, since it plays its trailer', () => {
		const controller = fakeController();
		drawWithPreview(seerrShow(), controller);

		expect(controller.subscribe).toHaveBeenCalledWith('media-row-film', expect.any(Function));
	});

	it('is inert without a provider', () => {
		render(<ModernMediaCard item={libraryMovie()} serverUrl="http://server" spotlightId="media-row-film" />);

		fireEvent.focus(card());
		fireEvent.mouseLeave(card());
		fireEvent.click(card());

		expect(frame()).toBeNull();
	});
});

it('holds the artwork back while its row is far from focus', () => {
	const {rerender} = render(<ModernMediaCard item={seerrShow()} serverUrl="http://server" deferImage />);
	expect(document.querySelector('img').hasAttribute('src')).toBe(false);
	rerender(<ModernMediaCard item={seerrShow()} serverUrl="http://server" />);
	expect(document.querySelector('img').getAttribute('src')).toBe(POSTER);
});

describe('ModernMediaCard Seerr status', () => {
	const dot = () => document.querySelector('[class~="dot"]');
	const banner = () => document.querySelector('[class~="banner"]');
	const drawCard = (item) => render(<ModernMediaCard item={item} serverUrl="http://server" />);

	it('keeps the corner dot in badge mode', () => {
		drawCard(seerrShow({mediaInfo: {status: 3}}));
		expect(dot().className).toContain('processing');
		expect(banner()).toBeNull();
	});

	it('draws Core\'s mark for each status and none for an unknown one', () => {
		const {rerender} = drawCard(seerrShow({mediaInfo: {status: 5}}));
		expect(dot().className).toContain('available');
		rerender(<ModernMediaCard item={seerrShow({mediaInfo: {status: 4}})} serverUrl="http://server" />);
		expect(dot().className).toContain('partial');
		rerender(<ModernMediaCard item={seerrShow({mediaInfo: {status: 2}})} serverUrl="http://server" />);
		expect(dot().className).toContain('pending');
		rerender(<ModernMediaCard item={seerrShow({mediaInfo: {status: 1}})} serverUrl="http://server" />);
		expect(dot()).toBeNull();
	});

	it('adds the type badge and the focus ring only in the Core look', () => {
		const {rerender} = drawCard(seerrShow());
		expect(document.querySelector('[class~="typeBadge"]')).toBeNull();
		expect(document.querySelector('[class~="focusRing"]')).toBeNull();
		rerender(<ModernMediaCard item={seerrShow()} serverUrl="http://server" coreLook />);
		expect(document.querySelector('[class~="typeBadge"]').textContent).toBe('SERIES');
		expect(document.querySelector('[class~="focusRing"]')).not.toBeNull();
	});

	it('draws nothing when the badges are off', () => {
		mockSettings = {showSeerrAvailabilityBadges: false};
		drawCard(seerrShow({mediaInfo: {status: 3}}));
		expect(dot()).toBeNull();
		expect(banner()).toBeNull();
	});

	it('runs a banner across the top in banner mode', () => {
		mockSettings = {seerrBadgeStyle: 'banner'};
		const {rerender} = drawCard(seerrShow({mediaInfo: {status: 3}}));
		expect(banner().textContent).toBe('REQUESTED');
		expect(dot()).toBeNull();
		expect(document.querySelector('[data-card-art]').className).toContain('underSeerrBanner');

		rerender(<ModernMediaCard item={seerrShow()} serverUrl="http://server" />);
		expect(banner()).toBeNull();
	});
});
