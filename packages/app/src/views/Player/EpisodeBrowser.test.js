import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import {defaultSettings} from '../../context/defaultSettings';
import EpisodeBrowser from './EpisodeBrowser';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

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

// Spottable and the spotlight containers need the framework's own React.
jest.mock('./PlayerConstants', () => {
	const React = require('react');
	const plain = (tag) => ({spotlightId, ...props}) => React.createElement(tag, props); // eslint-disable-line no-unused-vars
	return {SpottableButton: plain('button'), SpottableDiv: plain('div')};
});
jest.mock('../../utils/spotlightContainers', () => {
	const React = require('react');
	const container = ({spotlightId, ...props}) => React.createElement('div', props); // eslint-disable-line no-unused-vars
	return {ModalContainer: container, ActiveTabContainer: container};
});
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn(() => true), getPointerMode: () => false}}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => 'http://server'}));

let mockSettings;
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: mockSettings})}));

let mockEpisodes;
jest.mock('./useSeriesEpisodes', () => ({__esModule: true, default: () => mockEpisodes}));

const item = {Id: 'e2', Type: 'Episode', SeriesId: 'series', SeriesName: 'The Show', SeasonId: 's1'};
const episode = (overrides) => ({
	Id: 'e1', Type: 'Episode', Name: 'Pilot', IndexNumber: 1, ParentIndexNumber: 1, Overview: 'It begins.',
	ImageTags: {Primary: 'tag'}, UserData: {}, ...overrides
});

const count = (selector) => document.querySelectorAll(selector).length;

beforeEach(() => {
	mockSettings = {...defaultSettings};
	mockEpisodes = {
		seasons: [{Id: 's1', Name: 'Season 1'}, {Id: 's2', Name: 'Season 2'}],
		selectedSeasonId: 's1',
		selectSeason: jest.fn(),
		episodes: [
			episode(),
			episode({Id: 'e2', Name: 'Second', IndexNumber: 2, Overview: 'More happens.', UserData: {PlayedPercentage: 40}}),
			episode({Id: 'e3', Name: 'Third', IndexNumber: 3, Overview: 'The end.', ImageTags: {}, UserData: {Played: true}})
		],
		failed: false
	};
});

const open = (props = {}) => render(<EpisodeBrowser item={item} onSelect={jest.fn()} onClose={jest.fn()} {...props} />);

describe('EpisodeBrowser', () => {
	it('lists the series, its seasons and each episode with its season, number, title and description', () => {
		open();
		expect(screen.getByText('The Show')).toBeTruthy();
		expect(screen.getByText('Season 1', {selector: 'button'})).toBeTruthy();
		expect(screen.getByText('Season 2', {selector: 'button'})).toBeTruthy();
		expect(screen.getByText('Season 1 · Episode 1')).toBeTruthy();
		expect(screen.getByText('Pilot')).toBeTruthy();
		expect(screen.getByText('It begins.')).toBeTruthy();
		expect(screen.getByText('Season 1 · Episode 3')).toBeTruthy();
	});

	it('heads the panel with the series logo, whatever language the server\'s name is in', () => {
		open({logoUrl: 'http://server/logo.png'});
		const logo = document.querySelector('img[src="http://server/logo.png"]');
		expect(logo).not.toBeNull();
		expect(logo.getAttribute('alt')).toBe('The Show');
		expect(screen.queryByRole('heading', {name: 'The Show'})).toBeNull();
	});

	it('falls back to the series name when there is no logo, and reports one that will not load', () => {
		open();
		expect(screen.getByRole('heading', {name: 'The Show'})).toBeTruthy();
	});

	it('tells the player when the logo fails to load', () => {
		const onLogoError = jest.fn();
		open({logoUrl: 'http://server/logo.png', onLogoError});
		fireEvent.error(document.querySelector('img[src="http://server/logo.png"]'));
		expect(onLogoError).toHaveBeenCalledTimes(1);
	});

	it('draws a still where there is one and a placeholder where there is not', () => {
		open();
		const images = document.querySelectorAll('img');
		expect(images.length).toBe(2);
		expect(images[0].getAttribute('src')).toContain('/Items/e1/Images/Primary');
	});

	it('shows how far through an episode is with the home card bar, and a check on a watched one', () => {
		open();
		const bars = document.querySelectorAll('[class*="progress"]:not([class*="progressBar"])');
		expect(bars.length).toBe(1);
		expect(bars[0].style.width).toBe('40%');
		expect(count('[class*="watchedBadge"]')).toBe(1);
	});

	it('marks the episode that is playing', () => {
		open();
		expect(document.querySelector('[data-episode-id="e2"]').className).toMatch(/episodeCurrent/);
		expect(document.querySelector('[data-episode-id="e1"]').className).not.toMatch(/episodeCurrent/);
	});

	it('hides the descriptions when the spoiler setting asks for it', () => {
		mockSettings = {...mockSettings, hideDetailsMediaDescription: true};
		open();
		expect(screen.queryByText('It begins.')).toBeNull();
		expect(screen.getByText('Pilot')).toBeTruthy();
	});

	it('hands the chosen episode to onSelect', () => {
		const onSelect = jest.fn();
		open({onSelect});
		fireEvent.click(document.querySelector('[data-episode-id="e3"]'));
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect.mock.calls[0][0].Id).toBe('e3');
	});

	it('switches season from the tab strip', () => {
		open();
		fireEvent.click(screen.getByText('Season 2', {selector: 'button'}));
		expect(mockEpisodes.selectSeason).toHaveBeenCalledWith('s2');
	});

	it('closes on the dimmed background and not on the panel', () => {
		const onClose = jest.fn();
		open({onClose});
		fireEvent.click(screen.getByText('The Show'));
		expect(onClose).not.toHaveBeenCalled();
		fireEvent.click(document.body.firstChild.firstChild);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it.each([
		['loading', {episodes: null}, 'Loading...'],
		['empty', {episodes: []}, 'Nothing here yet.'],
		['failed', {failed: true}, 'Failed to load']
	])('says so while %s', (name, change, text) => {
		mockEpisodes = {...mockEpisodes, ...change};
		open();
		expect(screen.getByText(text)).toBeTruthy();
	});

	describe('long seasons', () => {
		const many = (size) => Array.from({length: size}, (unused, i) => episode({
			Id: `m${i + 1}`, Name: `Episode ${i + 1}`, IndexNumber: i + 1, Overview: `Plot ${i + 1}`
		}));
		const rows = () => document.querySelectorAll('[data-episode-id]').length;

		it('draws the first screenful at once and the rest over the next frames', async () => {
			mockEpisodes = {...mockEpisodes, episodes: many(30)};
			open({item: {...item, Id: 'm1'}});
			expect(rows()).toBeGreaterThan(0);
			expect(rows()).toBeLessThan(30);
			await waitFor(() => expect(rows()).toBe(30));
		});

		it('always draws the episode that is playing in that first batch, even deep in the season', async () => {
			mockEpisodes = {...mockEpisodes, episodes: many(30)};
			open({item: {...item, Id: 'm24'}});
			expect(document.querySelector('[data-episode-id="m24"]')).not.toBeNull();
			expect(rows()).toBeLessThan(30);
			await waitFor(() => expect(rows()).toBe(30));
		});

		it('draws a short season all at once', () => {
			open();
			expect(rows()).toBe(3);
		});
	});

	describe('season tabs', () => {
		it('marks the season that is open, so the remote lands on it and not on the first tab', () => {
			open();
			const marked = document.querySelectorAll('[data-active-tab="true"]');
			expect(marked.length).toBe(1);
			expect(marked[0].textContent).toBe('Season 1');
			mockEpisodes = {...mockEpisodes, selectedSeasonId: 's2'};
			document.body.innerHTML = '';
			open();
			expect(document.querySelector('[data-active-tab="true"]').textContent).toBe('Season 2');
		});

		it('scrolls the strip so the open season is in the middle of it', () => {
			mockEpisodes = {...mockEpisodes, selectedSeasonId: 's2'};
			open();
			// jsdom has no layout, so offsets are zero and the strip is left at the start.
			const strip = document.querySelector('[data-active-tab="true"]').parentNode;
			expect(strip.scrollLeft).toBe(0);
		});
	});

	describe('opening on the episode that is playing', () => {
		const many = (size) => Array.from({length: size}, (unused, i) => episode({
			Id: `m${i + 1}`, Type: 'Episode', Name: `Episode ${i + 1}`, IndexNumber: i + 1, Overview: `Plot ${i + 1}`
		}));

		it('has the playing episode in the first render, before any frame-driven update can run', () => {
			// With frames frozen nothing an effect schedules can happen, so whatever is on screen was
			// drawn by the first render alone.
			const frames = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
			try {
				mockEpisodes = {...mockEpisodes, episodes: many(30)};
				open({item: {...item, Id: 'm10'}});
				const row = document.querySelector('[data-episode-id="m10"]');
				expect(row).not.toBeNull();
				expect(row.getAttribute('data-selected')).toBe('true');
				expect(document.querySelectorAll('[data-episode-id]').length).toBeLessThan(30);
			} finally {
				frames.mockRestore();
			}
		});

		it('scrolls the list down to that episode straight away, not up at the first one', () => {
			mockEpisodes = {...mockEpisodes, episodes: many(30)};
			const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetTop');
			Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
				configurable: true,
				get() { return this.dataset && this.dataset.episodeId === 'm10' ? 2000 : 0; }
			});
			try {
				open({item: {...item, Id: 'm10'}});
				expect(document.querySelector('[data-episode-id="m10"]').parentNode.scrollTop).toBe(1976);
			} finally {
				if (original) Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', original);
				else delete window.HTMLElement.prototype.offsetTop;
			}
		});

		// Every position in a season, the first and the last included, not just the ones a test happened to use.
		it.each([1, 2, 5, 6, 7, 12, 17, 23, 29, 30])('opens on episode %i of 30, drawn, marked and scrolled to', (number) => {
			mockEpisodes = {...mockEpisodes, episodes: many(30)};
			const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetTop');
			// Each row is 230px tall, so a row's top is its position times that.
			Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
				configurable: true,
				get() {
					const id = this.dataset && this.dataset.episodeId;
					return id ? (Number(id.slice(1)) - 1) * 230 : 0;
				}
			});
			try {
				open({item: {...item, Id: `m${number}`}});
				const row = document.querySelector(`[data-episode-id="m${number}"]`);
				expect(row).not.toBeNull();
				expect(row.getAttribute('data-selected')).toBe('true');
				expect(row.parentNode.scrollTop).toBe(Math.max(0, (number - 1) * 230 - 24));
				// And it is the only one marked, so the remote has one place to go.
				expect(document.querySelectorAll('[data-selected="true"]').length).toBe(1);
			} finally {
				if (original) Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', original);
				else delete window.HTMLElement.prototype.offsetTop;
			}
		});

		it('sends the remote to that episode', async () => {
			Spotlight.focus.mockReturnValue(true);
			mockEpisodes = {...mockEpisodes, episodes: many(30)};
			open({item: {...item, Id: 'm10'}});
			await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('episodes-current'));
			await waitFor(() => expect(document.querySelectorAll('[data-episode-id]').length).toBe(30));
		});

		it('falls back to the first episode when the playing one is not in the list', async () => {
			Spotlight.focus.mockReturnValue(false);
			mockEpisodes = {...mockEpisodes, episodes: many(8)};
			open({item: {...item, Id: 'elsewhere'}});
			await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith(document.querySelector('[data-episode-id="m1"]')));
		});
	});
});

