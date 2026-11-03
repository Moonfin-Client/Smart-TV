import {ACTIONS} from '../stage/stageRules';
import {quickLookFacts, quickLookFade, quickLookNeighbour, quickLookSurface, seasonCardShare} from './quickLookRules';

jest.mock('@enact/i18n/$L', () => (text) => text);

describe('where a press leaves a row of the Quick Look drawer for', () => {
	const stops = ['stage-tracks', 'quick-look-seasons', 'quick-look-open'];

	test('runs down from the buttons through the tracks and the seasons to Open full page', () => {
		expect(quickLookNeighbour(stops, ACTIONS, 'down')).toBe('stage-tracks');
		expect(quickLookNeighbour(stops, 'stage-tracks', 'down')).toBe('quick-look-seasons');
		expect(quickLookNeighbour(stops, 'quick-look-seasons', 'down')).toBe('quick-look-open');
		expect(quickLookNeighbour(stops, 'quick-look-open', 'down')).toBe(null);
	});

	test('walks back up to the buttons, and Up from the buttons stays put', () => {
		expect(quickLookNeighbour(stops, 'quick-look-open', 'up')).toBe('quick-look-seasons');
		expect(quickLookNeighbour(stops, 'stage-tracks', 'up')).toBe(ACTIONS);
		expect(quickLookNeighbour(stops, ACTIONS, 'up')).toBe(null);
	});

	test('goes straight to Open full page when nothing else takes focus', () => {
		expect(quickLookNeighbour(['quick-look-open'], ACTIONS, 'down')).toBe('quick-look-open');
	});
});

describe('the drawer surface', () => {
	test('lays 3% of the text color over the background', () => {
		expect(quickLookSurface('16, 16, 16', '255, 255, 255')).toBe('23, 23, 23');
		expect(quickLookSurface('255, 255, 255', '0, 0, 0')).toBe('247, 247, 247');
	});

	test('hands back the same fade for the same surface, so its baked scrim is reused', () => {
		expect(quickLookFade('23, 23, 23')).toBe(quickLookFade('23, 23, 23'));
		expect(quickLookFade('23, 23, 23')).not.toBe(quickLookFade('247, 247, 247'));
	});
});

describe('the facts row', () => {
	const film = {
		People: [{Name: 'Writer One', Type: 'Writer'}, {Name: 'Director One', Type: 'Director'}, {Name: 'Director Two', Type: 'Director'}],
		Studios: [{Name: 'Universal'}, {Name: 'Syncopy'}],
		PremiereDate: '2026-07-17T00:00:00.0000000Z'
	};
	const everything = () => true;

	test('names the first director, writer and studio, then the release date', () => {
		const facts = quickLookFacts(film, everything);
		expect(facts.map((fact) => fact.label)).toEqual(['Director', 'Writer', 'Studio', 'Release Date']);
		expect(facts.slice(0, 3).map((fact) => fact.value)).toEqual(['Director One', 'Writer One', 'Universal']);
		expect(facts[3].value).toMatch(/17/);
	});

	test('leaves out the people and studios the viewer hid', () => {
		const facts = quickLookFacts(film, (id) => id !== 'crew' && id !== 'studios');
		expect(facts.map((fact) => fact.label)).toEqual(['Release Date']);
	});
});

describe('a season card', () => {
	test('shares the row with up to two others, and past three the fourth peeks in', () => {
		expect(seasonCardShare(1)).toEqual({parts: 1, gaps: 0});
		expect(seasonCardShare(3)).toEqual({parts: 3, gaps: 2});
		expect(seasonCardShare(8)).toEqual({parts: 3.3, gaps: 2});
	});
});
