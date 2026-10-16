// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {splitCastAndCrew, hidesMediaDescription} from './detailsMedia';

const person = (Id, Name, Type, Role) => ({Id, Name, Type, Role});

describe('hidesMediaDescription', () => {
	const on = {hideDetailsMediaDescription: true};

	test('a film and an episode give the story away, so they are held back', () => {
		expect(hidesMediaDescription({Type: 'Movie'}, on)).toBe(true);
		expect(hidesMediaDescription({Type: 'Episode'}, on)).toBe(true);
	});

	test('a series or a season keeps its description', () => {
		expect(hidesMediaDescription({Type: 'Series'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'Season'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'BoxSet'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'Person'}, on)).toBe(false);
	});

	test('music and books keep their description', () => {
		expect(hidesMediaDescription({Type: 'MusicAlbum'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'MusicArtist'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'Playlist'}, on)).toBe(false);
		expect(hidesMediaDescription({Type: 'Book'}, on)).toBe(false);
	});

	test('an unknown or missing type keeps its description', () => {
		expect(hidesMediaDescription({Type: ''}, on)).toBe(false);
		expect(hidesMediaDescription({IndexNumber: 1}, on)).toBe(false);
	});

	test('nothing is held back while the setting is off', () => {
		const off = {hideDetailsMediaDescription: false};
		expect(hidesMediaDescription({Type: 'Movie'}, off)).toBe(false);
		expect(hidesMediaDescription({Type: 'Episode'}, off)).toBe(false);
	});

	test('local content items are hidden when their specific setting is on', () => {
		expect(hidesMediaDescription({Type: 'Movie'}, {hideDetailsMediaDescriptionMovie: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Series'}, {hideDetailsMediaDescriptionShow: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Show'}, {hideDetailsMediaDescriptionShow: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Tv'}, {hideDetailsMediaDescriptionShow: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Season'}, {hideDetailsMediaDescriptionSeason: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Episode'}, {hideDetailsMediaDescriptionEpisode: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'BoxSet'}, {hideDetailsMediaDescriptionBoxSet: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Collection'}, {hideDetailsMediaDescriptionBoxSet: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Book'}, {hideDetailsMediaDescriptionBook: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'AudioBook'}, {hideDetailsMediaDescriptionBook: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Person'}, {hideDetailsMediaDescriptionPerson: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'MusicAlbum'}, {hideDetailsMediaDescriptionMusic: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'MusicArtist'}, {hideDetailsMediaDescriptionMusic: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Audio'}, {hideDetailsMediaDescriptionMusic: true})).toBe(true);
		expect(hidesMediaDescription({Type: 'Playlist'}, {hideDetailsMediaDescriptionMusic: true})).toBe(true);
	});

	test('seerr content items respect seerr specific settings', () => {
		const seerrMovie = {Type: 'Movie', _seerrMediaId: 100};
		const seerrShow = {Type: 'Series', _seerrMediaId: 200};
		const seerrTv = {Type: 'Tv', isSeerr: true};
		const seerrCollection = {Type: 'BoxSet', Id: 'seerr-collection-300'};
		const seerrPerson = {Type: 'Person', _seerrMediaId: 400};

		expect(hidesMediaDescription(seerrMovie, {hideDetailsMediaDescriptionSeerrMovie: true})).toBe(true);
		expect(hidesMediaDescription(seerrMovie, {hideDetailsMediaDescription: true})).toBe(true);
		expect(hidesMediaDescription(seerrMovie, {hideDetailsMediaDescriptionMovie: true})).toBe(false);

		expect(hidesMediaDescription(seerrShow, {hideDetailsMediaDescriptionSeerrShow: true})).toBe(true);
		expect(hidesMediaDescription(seerrTv, {hideDetailsMediaDescriptionSeerrShow: true})).toBe(true);
		expect(hidesMediaDescription(seerrShow, {hideDetailsMediaDescriptionShow: true})).toBe(false);

		expect(hidesMediaDescription(seerrCollection, {hideDetailsMediaDescriptionSeerrCollection: true})).toBe(true);
		expect(hidesMediaDescription(seerrCollection, {hideDetailsMediaDescriptionBoxSet: true})).toBe(false);

		expect(hidesMediaDescription(seerrPerson, {hideDetailsMediaDescriptionPerson: true})).toBe(true);
	});

	test('kids mode forces all media descriptions to be hidden', () => {
		const kidsSettings = {kidsModeEnabled: true};
		expect(hidesMediaDescription({Type: 'Movie'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Series'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Season'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Episode'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'BoxSet'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Person'}, kidsSettings)).toBe(true);
		expect(hidesMediaDescription({Type: 'Movie', _seerrMediaId: 1}, kidsSettings)).toBe(true);
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
