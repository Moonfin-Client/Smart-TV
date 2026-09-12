import {spotlightCardsFor, spotlightCardFor, spotlightRuntimeLabel, dedupePeople} from './spotlightCards';

const SERVER = 'https://tv.example';

const state = (over) => ({item: {Id: 'item-1', Type: 'Movie', Name: 'Thing'}, serverUrl: SERVER, settings: {}, ...over});
const child = (Id, Type = 'Movie', over = {}) => ({Id, Name: Id, Type, ...over});
const ids = (cards) => cards.map((card) => card.id);
const titles = (card) => card.sections.map((section) => section.title);

describe('spotlightRuntimeLabel', () => {
	it('drops the minutes from a round number of hours', () => {
		expect(spotlightRuntimeLabel(7200 * 10000000)).toBe('2h');
	});

	it('names both parts otherwise, and minutes alone under an hour', () => {
		expect(spotlightRuntimeLabel(5520 * 10000000)).toBe('1h 32m');
		expect(spotlightRuntimeLabel(2880 * 10000000)).toBe('48m');
		expect(spotlightRuntimeLabel(0)).toBe('0m');
	});
});

describe('dedupePeople', () => {
	it('counts a person listed twice once, keeping both roles', () => {
		const people = dedupePeople([{Id: 'p1', Name: 'A', Role: 'Self'}, {Id: 'p1', Name: 'A', Role: 'Narrator'}]);
		expect(people).toHaveLength(1);
		expect(people[0].Role).toBe('Self · Narrator');
	});

	it('drops an entry with nothing to key on', () => {
		expect(dedupePeople([{Role: 'Nobody'}])).toEqual([]);
	});
});

describe('spotlightCardsFor', () => {
	it('gives an item with nothing loaded no cards at all', () => {
		expect(spotlightCardsFor(state())).toEqual([]);
	});

	it('maps a movie to people, chapters and extras, and recommendations', () => {
		const cards = spotlightCardsFor(state({
			cast: [child('p1')],
			item: {Id: 'item-1', Type: 'Movie', Chapters: [{Name: 'One'}]},
			extras: [child('e1', 'Video')],
			similar: [child('s1')]
		}));
		expect(ids(cards)).toEqual(['people', 'chapters_extras', 'similar']);
	});

	it('counts a person in both cast and crew once', () => {
		const person = {Id: 'p1', Name: 'A'};
		const card = spotlightCardsFor(state({cast: [person], crew: [person]}))[0];
		expect(card.subtitle).toBe('1 person');
	});

	it('leads a series with the seasons card', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Series'},
			seasons: [child('season-1', 'Season')],
			cast: [child('p1')]
		}));
		expect(ids(cards)).toEqual(['seasons', 'people']);
		expect(cards[0].subtitle).toBe('1 season');
	});

	it('offers an episode the rest of its season', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Episode'},
			episodes: [child('e1', 'Episode'), child('e2', 'Episode')]
		}));
		expect(ids(cards)).toEqual(['episodes']);
		expect(cards[0].title).toBe('More Episodes');
		expect(cards[0].subtitle).toBe('2 episodes');
	});

	it('gives a music album a track list with its total runtime', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'MusicAlbum'},
			albumTracks: [child('t1', 'Audio', {RunTimeTicks: 1800 * 10000000})]
		}));
		expect(ids(cards)).toEqual(['tracks']);
		expect(cards[0].subtitle).toBe('1 track · 30m');
		expect(cards[0].sections[0]).toMatchObject({kind: 'tracks', groupByDisc: true});
	});

	it('maps a person to the filmography card', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Person'},
			personMovies: [child('m1')],
			personSeries: [child('s1', 'Series'), child('s2', 'Series')]
		}));
		expect(ids(cards)).toEqual(['filmography']);
		expect(cards[0].subtitle).toBe('1 movie · 2 shows');
		expect(titles(cards[0])).toEqual(['Movies', 'TV Shows']);
	});

	it('keeps a person their seerr credits sections', () => {
		const card = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Person'},
			personMovies: [child('m1')],
			seerrAppearances: [child('a1')],
			seerrCrewCredits: [child('c1')]
		}))[0];
		expect(titles(card)).toEqual(['Movies', 'Appearances (Seerr)', 'Crew Contributions (Seerr)']);
	});

	it('joins seerr recommendations onto the similar card', () => {
		const card = spotlightCardsFor(state({
			similar: [child('s1')],
			seerr: {recommendations: [child('r1')], similar: [child('x1')]}
		})).find((c) => c.id === 'similar');
		expect(card.subtitle).toBe('3 titles');
		expect(titles(card)).toEqual(['Similar', 'Recommendations (Seerr)', 'Similar (Seerr)']);
	});

	it('leads the recommendations card with what seerr knows about the title', () => {
		const card = spotlightCardsFor(state({
			similar: [child('s1')],
			seerr: {hasChips: true, hasFacts: true}
		})).find((c) => c.id === 'similar');
		expect(card.sections.map((s) => s.kind)).toEqual(['seerrChips', 'seerrFacts', 'media']);
	});

	it('names the library list for the source that actually produced it', () => {
		const labelFor = (similarSource) => spotlightCardsFor(state({similar: [child('s1')], similarSource}))
			.find((c) => c.id === 'similar').sections[0].title;
		expect(labelFor('jellyfin')).toBe('Similar');
		expect(labelFor('moonfin')).toBe('Moonfin Recommends');
		expect(labelFor('tmdb')).toBe('TMDb');
	});

	it('leads a collection section with the collection itself', () => {
		const card = spotlightCardsFor(state({
			parentCollections: [{id: 'box-1', name: 'A Collection', boxSetItem: child('box-1', 'BoxSet'), items: [child('m1')]}]
		})).find((c) => c.id === 'collections');
		expect(card.subtitle).toBe('1 collection');
		expect(card.sections[0].items.map((i) => i.Id)).toEqual(['box-1', 'm1']);
	});

	it('slots the titles a collection is missing in by release date', () => {
		const card = spotlightCardsFor(state({
			parentCollections: [{
				id: 'box-1',
				name: 'A Collection',
				boxSetItem: child('box-1', 'BoxSet'),
				items: [child('m1', 'Movie', {PremiereDate: '1980-01-01'}), child('m3', 'Movie', {PremiereDate: '2000-01-01'})],
				missingItems: [child('m2', 'Movie', {PremiereDate: '1990-01-01', _seerr: true})]
			}]
		})).find((c) => c.id === 'collections');
		expect(card.sections[0].items.map((i) => i.Id)).toEqual(['box-1', 'm1', 'm2', 'm3']);
	});

	it('leaves the missing titles out when the setting is off', () => {
		const card = spotlightCardsFor(state({
			settings: {seerrShowMissingCollectionItems: false},
			parentCollections: [{
				id: 'box-1', name: 'A', boxSetItem: child('box-1', 'BoxSet'),
				items: [child('m1')], missingItems: [child('m2', 'Movie', {_seerr: true})]
			}]
		})).find((c) => c.id === 'collections');
		expect(card.sections[0].items.map((i) => i.Id)).toEqual(['box-1', 'm1']);
	});

	it('combines a box set library items with the ones seerr says are missing', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'BoxSet'},
			collectionItems: [child('m1', 'Movie', {PremiereDate: '1980-01-01'}), child('s1', 'Series')],
			missingCollectionItems: [child('m2', 'Movie', {PremiereDate: '1990-01-01', _seerr: true})]
		}));
		const card = cards.find((c) => c.id === 'boxset_items');
		expect(card.title).toBe('Movies & Shows');
		expect(card.subtitle).toBe('2 movies · 1 show');
		expect(titles(card)).toEqual(['Movies', 'TV Shows']);
	});

	it('gathers the people of everything a box set holds', () => {
		const card = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'BoxSet'},
			collectionItems: [
				child('m1', 'Movie', {People: [{Id: 'p1', Name: 'A', Type: 'Actor'}, {Id: 'd1', Name: 'D', Type: 'Director'}]}),
				child('m2', 'Movie', {People: [{Id: 'p1', Name: 'A', Type: 'Actor'}]})
			]
		})).find((c) => c.id === 'people');
		expect(card.subtitle).toBe('2 people');
		expect(titles(card)).toEqual(['Cast', 'Crew']);
	});

	it('gives a box set a playlist order card once its items are paged in', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'BoxSet'},
			collectionItems: [child('m1')],
			playlistItems: [child('m1'), child('e1', 'Episode')]
		}));
		expect(ids(cards)).toEqual(['boxset_items', 'playlist_order']);
		expect(cards[1].subtitle).toBe('2 items');
	});

	it('offers a seerr only title just what seerr can fill', () => {
		const cards = spotlightCardsFor(state({
			seerrOnly: true,
			cast: [child('p1')],
			seasons: [child('season-1', 'Season')],
			seerr: {recommendations: [child('r1')]}
		}));
		expect(ids(cards)).toEqual(['people', 'similar']);
	});

	it('drops the sections of a card that would show nothing', () => {
		const card = spotlightCardsFor(state({cast: [child('p1')]}))[0];
		expect(titles(card)).toEqual(['Cast']);
	});

	it('marks a playlist manageable only when the caller says so', () => {
		const base = {item: {Id: 'item-1', Type: 'Playlist'}, playlistItems: [child('t1', 'Audio')]};
		expect(spotlightCardsFor(state({...base}))[0].sections[0].manage).toBe(false);
		expect(spotlightCardsFor(state({...base, canManagePlaylist: true}))[0].sections[0].manage).toBe(true);
	});
});

describe('spotlightCardFor', () => {
	it('builds the one card asked for', () => {
		const built = state({cast: [child('p1')], similar: [child('s1')]});
		expect(spotlightCardFor('similar', built).id).toBe('similar');
		expect(spotlightCardFor('people', built).id).toBe('people');
	});

	it('has nothing for a card this item never gets, or one with no content', () => {
		expect(spotlightCardFor('seasons', state({cast: [child('p1')]}))).toBeNull();
		expect(spotlightCardFor('similar', state({cast: [child('p1')]}))).toBeNull();
	});
});
