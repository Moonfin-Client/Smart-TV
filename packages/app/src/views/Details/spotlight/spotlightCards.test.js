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

	it('leads a series with the seasons card, named for the show once opened', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Series', Name: 'Deadwood'},
			seasons: [child('season-1', 'Season')],
			cast: [child('p1')]
		}));
		expect(ids(cards)).toEqual(['seasons', 'people']);
		expect(cards[0].title).toBe('Seasons');
		expect(cards[0].modalTitle).toBe('Deadwood');
		expect(cards[0].subtitle).toBe('1 season');
	});

	it('hands the seasons grid whatever seerr knows about each season', () => {
		const markers = new Map([[1, 5]]);
		const card = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Series'},
			seasons: [child('season-1', 'Season')],
			seerr: {seasonMarkers: markers}
		}))[0];
		expect(card.sections[0].seasonStatus).toBe(markers);
	});

	it('names a season card for the show it belongs to', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Season', Name: 'Season 1', SeriesName: 'Deadwood'},
			episodes: [child('e1', 'Episode'), child('e2', 'Episode')]
		}));
		expect(ids(cards)).toEqual(['episodes']);
		expect(cards[0].title).toBe('Episodes');
		expect(cards[0].modalTitle).toBe('Deadwood - Season 1');
		expect(cards[0].subtitle).toBe('2 episodes');
	});

	it('offers an episode the rest of its season, left open when it is the only one', () => {
		const cards = spotlightCardsFor(state({
			item: {Id: 'item-1', Type: 'Episode'},
			episodes: [child('e1', 'Episode'), child('e2', 'Episode')]
		}));
		expect(ids(cards)).toEqual(['episodes']);
		expect(cards[0].title).toBe('More Episodes');
		expect(cards[0].subtitle).toBe('2 episodes');
		expect(cards[0].sections[0]).toMatchObject({title: 'Season 1', collapsible: true, expanded: true});
	});

	it("groups an episode's whole run by season with only its own open", () => {
		const episode = (Id, season, index) => child(Id, 'Episode', {ParentIndexNumber: season, IndexNumber: index});
		const card = spotlightCardsFor(state({
			item: {Id: 'e-s2-1', Type: 'Episode', ParentIndexNumber: 2},
			episodes: [episode('e-s2-1', 2, 1)],
			seriesEpisodes: [episode('e-s2-1', 2, 1), episode('e-s1-2', 1, 2), episode('e-s1-1', 1, 1)]
		}))[0];
		expect(card.subtitle).toBe('2 seasons · 3 episodes');
		expect(titles(card)).toEqual(['Season 1', 'Season 2']);
		expect(card.sections.map((section) => section.expanded)).toEqual([false, true]);
		expect(card.sections[0].items.map((i) => i.Id)).toEqual(['e-s1-1', 'e-s1-2']);
	});

	it('names season zero the specials', () => {
		const card = spotlightCardsFor(state({
			item: {Id: 'e1', Type: 'Episode', ParentIndexNumber: 1},
			seriesEpisodes: [
				child('e1', 'Episode', {ParentIndexNumber: 1, IndexNumber: 1}),
				child('sp1', 'Episode', {ParentIndexNumber: 0, IndexNumber: 1})
			]
		}))[0];
		expect(titles(card)).toEqual(['Specials', 'Season 1']);
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
			seerr: {chipCount: 2, factCount: 1}
		})).find((c) => c.id === 'similar');
		expect(card.sections.map((s) => s.kind)).toEqual(['seerrChips', 'seerrFacts', 'media']);
	});

	it('gives a seerr only title a details card ahead of the rest', () => {
		const cards = spotlightCardsFor(state({
			seerrOnly: true,
			cast: [child('p1')],
			seerr: {chipCount: 4, factCount: 2, collection: {id: 9, name: 'Franchise'}}
		}));
		expect(ids(cards)).toEqual(['seerr_details', 'people']);
		expect(cards[0].subtitle).toBe('2 facts · 4 tags');
		expect(cards[0].sections.map((s) => s.kind)).toEqual(['seerrChips', 'seerrFacts', 'seerrCollection']);
	});

	it('leaves the details card out when seerr has nothing to say', () => {
		const cards = spotlightCardsFor(state({seerrOnly: true, cast: [child('p1')], seerr: {}}));
		expect(ids(cards)).toEqual(['people']);
	});

	it('stops a seerr only title repeating its tags and facts on the recommendations card', () => {
		const card = spotlightCardsFor(state({
			seerrOnly: true,
			seerr: {chipCount: 2, factCount: 1, similar: [child('x1')]}
		})).find((c) => c.id === 'similar');
		expect(card.sections.map((s) => s.kind)).toEqual(['seerr']);
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

	it('a movie with media sources produces a file details card', () => {
		const source = {
			Id: 'src-1',
			Container: 'mkv',
			Size: 5583457484,
			MediaStreams: [{Type: 'Video', Codec: 'hevc'}]
		};
		const cards = spotlightCardsFor(state({
			item: {Id: 'm1', Type: 'Movie', MediaSources: [source]}
		}));
		const card = cards.find((c) => c.id === 'file_details');
		expect(card).toBeDefined();
		expect(card.title).toBe('File Details');
		expect(card.modalTitle).toBe('File Information');
		expect(card.subtitle).toContain('MKV');
		expect(card.sections[0]).toMatchObject({kind: 'fileInfo', mediaSource: source});
	});

	it('an episode with media sources produces a file details card', () => {
		const source = {
			Id: 'src-ep',
			Container: 'mp4',
			Size: 1048576000,
			MediaStreams: [{Type: 'Video', Codec: 'h264'}]
		};
		const cards = spotlightCardsFor(state({
			item: {Id: 'ep-1', Type: 'Episode', MediaSources: [source]}
		}));
		const card = cards.find((c) => c.id === 'file_details');
		expect(card).toBeDefined();
		expect(card.title).toBe('File Details');
	});

	it('file details card respects selected mediaSource from state', () => {
		const source1 = {Id: 'src-1', Container: 'mkv', Size: 5000000000, MediaStreams: [{Type: 'Video'}]};
		const source2 = {Id: 'src-2', Container: 'mp4', Size: 2000000000, MediaStreams: [{Type: 'Video'}]};
		const cards = spotlightCardsFor(state({
			item: {Id: 'm1', Type: 'Movie', MediaSources: [source1, source2]},
			mediaSource: source2
		}));
		const card = cards.find((c) => c.id === 'file_details');
		expect(card.subtitle).toContain('MP4');
		expect(card.sections[0].mediaSource).toBe(source2);
	});

	it('file details card picks distinct backdrop tag when available', () => {
		const source = {Id: 'src-1', Container: 'mkv', Size: 1000, MediaStreams: [{Type: 'Video'}]};
		const withThree = spotlightCardsFor(state({
			item: {Id: 'm1', Type: 'Movie', BackdropImageTags: ['b0', 'b1', 'b2'], MediaSources: [source]}
		})).find((c) => c.id === 'file_details');
		expect(withThree.imageUrl).toContain('/Items/m1/Images/Backdrop/2');
		expect(withThree.imageUrl).toContain('tag=b2');

		const withSeerr = spotlightCardsFor(state({
			item: {Id: 'm1', Type: 'Movie', BackdropImageTags: ['b0'], MediaSources: [source]},
			seerr: {details: {backdrop_path: '/tmdb_backdrop.jpg'}},
			fallbackImageUrl: 'fallback.jpg'
		})).find((c) => c.id === 'file_details');
		expect(withSeerr.imageUrl).toContain('https://image.tmdb.org/t/p/w780/tmdb_backdrop.jpg');
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
