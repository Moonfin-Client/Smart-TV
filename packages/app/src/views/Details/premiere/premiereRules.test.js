import {ACTIONS, NAVBAR} from '../stage/stageRules';
import {factsWeight, premiereDim, premiereNeighbour, premiereScrim} from './premiereRules';

describe('where a press leaves a Premiere section for', () => {
	const stops = ['episodes', 'tracks', 'facts', 'cast'];

	test('runs down the sections in order and keeps Down at the last', () => {
		expect(premiereNeighbour(stops, ACTIONS, 'down', true)).toBe('episodes');
		expect(premiereNeighbour(stops, 'tracks', 'down', true)).toBe('facts');
		expect(premiereNeighbour(stops, 'cast', 'down', true)).toBe(null);
	});

	test('walks back up to the buttons from the first section', () => {
		expect(premiereNeighbour(stops, 'facts', 'up', false)).toBe('tracks');
		expect(premiereNeighbour(stops, 'episodes', 'up', false)).toBe(ACTIONS);
	});

	test('goes up from the buttons to a toolbar along the top and stays put beside a sidebar', () => {
		expect(premiereNeighbour(stops, ACTIONS, 'up', true)).toBe(NAVBAR);
		expect(premiereNeighbour(stops, ACTIONS, 'up', false)).toBe(null);
	});

	test('has nowhere to go down from the buttons on a page with no sections', () => {
		expect(premiereNeighbour([], ACTIONS, 'down', true)).toBe(null);
	});
});

describe('the people and studios panel', () => {
	test('gives a cell its share by the letters in its names, within bounds', () => {
		expect(factsWeight(['James Cameron'])).toBe(20);
		expect(factsWeight(['Christopher Nolan', 'Jonathan Nolan'])).toBe(31);
		expect(factsWeight(['Dune Entertainment', 'Lightstorm Entertainment', '20th Century Fox', 'Ingenious Film Partners'])).toBe(60);
	});
});

describe('the Premiere backdrop', () => {
	test('darkens further as the opacity slider rises', () => {
		expect(premiereDim(0)).toBeCloseTo(0.6);
		expect(premiereDim(25)).toBeCloseTo(1);
		expect(premiereDim(40)).toBeCloseTo(1);
		expect(premiereDim(undefined)).toBeCloseTo(0.92);
	});

	test('fades into the page at its foot and around its edges', () => {
		const [foot, vignette] = premiereScrim('16, 16, 16', 1);
		expect(foot).toEqual({to: 'top', rgb: '16, 16, 16', stops: [[0.06, 1], [0.42, 1], [0.7, 0]]});
		expect(vignette.at).toEqual([0.5, 0.35]);
		expect(vignette.radius).toBe(1.1);
		expect(vignette.stops[2][1]).toBeCloseTo(0.85);
	});

	test('hands back the same layers for the same background and dim, so the baked scrim is reused', () => {
		expect(premiereScrim('16, 16, 16', 0.8)).toBe(premiereScrim('16, 16, 16', 0.8));
		expect(premiereScrim('16, 16, 16', 0.8)).not.toBe(premiereScrim('16, 16, 16', 0.9));
	});
});
