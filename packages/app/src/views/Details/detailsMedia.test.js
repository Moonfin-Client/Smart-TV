// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {splitCastAndCrew, hidesMediaDescription} from './detailsMedia';

const person = (Id, Name, Type, Role) => ({Id, Name, Type, Role});

describe('hidesMediaDescription', () => {
	test('returns true for Movie or Episode when hideDetailsMediaDescription is enabled', () => {
		const settings = {hideDetailsMediaDescription: true};
		expect(hidesMediaDescription({Type: 'Movie'}, settings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Episode'}, settings)).toBe(true);
		expect(hidesMediaDescription({IndexNumber: 1}, settings)).toBe(true);
	});

	test('returns false for Series, Season, BoxSet, and Person', () => {
		const settings = {hideDetailsMediaDescription: true};
		expect(hidesMediaDescription({Type: 'Series'}, settings)).toBe(false);
		expect(hidesMediaDescription({Type: 'Season'}, settings)).toBe(false);
		expect(hidesMediaDescription({Type: 'BoxSet'}, settings)).toBe(false);
		expect(hidesMediaDescription({Type: 'Person'}, settings)).toBe(false);
	});

	test('returns false when hideDetailsMediaDescription is disabled', () => {
		const settings = {hideDetailsMediaDescription: false};
		expect(hidesMediaDescription({Type: 'Movie'}, settings)).toBe(false);
		expect(hidesMediaDescription({Type: 'Episode'}, settings)).toBe(false);
	});
});

describe('splitCastAndCrew', () => {
	test('actors and guest stars land in the cast', () => {
		const {cast} = splitCastAndCrew([
			person('1', 'Ada', 'Actor', 'Herself'),
			person('2', 'Bo', 'GuestStar', 'Neighbour')
		]);
		expect(cast.map((p) => p.Name)).toEqual(['Ada', 'Bo']);
	});

	test('directors and writers land in the crew, never the cast', () => {
		const {cast, crew} = splitCastAndCrew([
			person('1', 'Ada', 'Director'),
			person('2', 'Bo', 'Writer')
		]);
		expect(cast).toEqual([]);
		expect(crew.map((p) => p.Name)).toEqual(['Ada', 'Bo']);
	});

	test('a job with no role of its own falls back to what the type says', () => {
		const {crew} = splitCastAndCrew([person('1', 'Ada', 'Director', '  ')]);
		expect(crew[0].Role).toBe('Director');
	});

	test('somebody who both directed and wrote appears once, carrying both jobs', () => {
		const {crew} = splitCastAndCrew([
			person('1', 'Ada', 'Director'),
			person('1', 'Ada', 'Writer')
		]);
		expect(crew).toHaveLength(1);
		expect(crew[0].Role).toBe('Director\nWriter');
	});

	test('somebody who acted as well as directed is kept out of the cast', () => {
		const {cast, crew} = splitCastAndCrew([
			person('1', 'Ada', 'Actor', 'Herself'),
			person('2', 'Ada', 'Director')
		]);
		expect(cast).toEqual([]);
		expect(crew.map((p) => p.Name)).toEqual(['Ada']);
	});

	test('several jobs run together in one field are split apart', () => {
		const {crew} = splitCastAndCrew([person('1', 'Ada', 'Writer', 'Screenplay, Story')]);
		expect(crew[0].Role).toBe('Screenplay\nStory');
	});

	test('a role shouted in capitals is set back in sentence case', () => {
		const {crew} = splitCastAndCrew([person('1', 'Ada', 'Writer', 'SCREENPLAY')]);
		expect(crew[0].Role).toBe('Screenplay');
	});

	test('a repeated job is only listed once', () => {
		const {crew} = splitCastAndCrew([
			person('1', 'Ada', 'Director', 'Director'),
			person('1', 'Ada', 'Writer', 'DIRECTOR')
		]);
		expect(crew[0].Role).toBe('Director');
	});

	test('somebody with neither an id nor a name is dropped rather than merged', () => {
		const {crew} = splitCastAndCrew([{Type: 'Director'}]);
		expect(crew).toEqual([]);
	});

	test('each list is capped on its own, so a long cast cannot crowd out the crew', () => {
		const many = Array.from({length: 30}, (_, i) => person(String(i), `Actor ${i}`, 'Actor'));
		const {cast, crew} = splitCastAndCrew([...many, person('d', 'Ada', 'Director')], 20);
		expect(cast).toHaveLength(20);
		expect(crew.map((p) => p.Name)).toEqual(['Ada']);
	});

	test('nothing at all is handled without throwing', () => {
		expect(splitCastAndCrew()).toEqual({cast: [], crew: []});
	});
});
