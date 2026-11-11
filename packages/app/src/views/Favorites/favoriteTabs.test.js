import {
	FAVORITE_TABS, FAVORITE_TAB_TYPES, WATCHLIST_TAB, bucketByTab, cardMetrics, clampTabIndex, favoriteCardImage, swapRequestCard, tabKeyForType,
	visibleTabs, watchlistCards, withRequestDetail, withWatchlistBackdrops
} from './favoriteTabs';

describe('FAVORITE_TABS', () => {
	it('lists every type once, in order', () => {
		expect(FAVORITE_TABS.map((tab) => tab.key)).toEqual([
			'movie', 'series', 'episode', 'collection', 'person', 'musicVideo', 'artist', 'album', 'song'
		]);
	});

	it('maps each item type back to its tab', () => {
		expect(tabKeyForType('BoxSet')).toBe('collection');
		expect(tabKeyForType('Audio')).toBe('song');
		expect(tabKeyForType('Playlist')).toBe(null);
		expect(tabKeyForType(undefined)).toBe(null);
	});
});

describe('bucketByTab', () => {
	it('splits a mixed list up by type', () => {
		const buckets = bucketByTab([
			{Id: '1', Type: 'Movie'},
			{Id: '2', Type: 'Person'},
			{Id: '3', Type: 'Movie'}
		]);
		expect(buckets.movie.map((item) => item.Id)).toEqual(['1', '3']);
		expect(buckets.person.map((item) => item.Id)).toEqual(['2']);
		expect(buckets.album).toEqual([]);
	});

	it('drops a type no tab covers', () => {
		const buckets = bucketByTab([{Id: '1', Type: 'TvChannel'}, {Id: '2', Type: 'Playlist'}]);
		expect(Object.values(buckets).every((bucket) => bucket.length === 0)).toBe(true);
	});

	it('has every bucket ready when given nothing', () => {
		expect(Object.keys(bucketByTab(null))).toHaveLength(FAVORITE_TABS.length);
	});
});

describe('visibleTabs', () => {
	it('keeps only the types that have something in them', () => {
		const tabs = visibleTabs({movie: [{}], series: [], person: [{}, {}]});
		expect(tabs.map((tab) => tab.key)).toEqual(['movie', 'person']);
	});

	it('keeps them in the order they were declared', () => {
		const tabs = visibleTabs({song: [{}], movie: [{}], person: [{}]});
		expect(tabs.map((tab) => tab.key)).toEqual(['movie', 'person', 'song']);
	});

	it('has nothing to show for an empty library', () => {
		expect(visibleTabs({})).toEqual([]);
		expect(visibleTabs(null)).toEqual([]);
	});
});

describe('clampTabIndex', () => {
	it('leaves an index that still exists alone', () => {
		expect(clampTabIndex(1, [{}, {}, {}])).toBe(1);
	});

	it('settles on the last tab when the list shrank past it', () => {
		expect(clampTabIndex(5, [{}, {}])).toBe(1);
	});

	it('starts at the first tab for anything below the list', () => {
		expect(clampTabIndex(-1, [{}, {}])).toBe(0);
		expect(clampTabIndex(undefined, [{}, {}])).toBe(0);
	});

	it('has nowhere to go when there are no tabs', () => {
		expect(clampTabIndex(3, [])).toBe(0);
	});
});

describe('FAVORITE_TAB_TYPES', () => {
	it('names every type the tabs cover', () => {
		expect(FAVORITE_TAB_TYPES).toBe('Movie,Series,Episode,BoxSet,Person,MusicVideo,MusicArtist,MusicAlbum,Audio');
	});
});

describe('cardMetrics', () => {
	it('measures a poster the way the flat grid always has', () => {
		expect(cardMetrics('portrait', 'medium')).toEqual({
			posterHeight: 270,
			itemSize: {minWidth: 170, minHeight: 340}
		});
		expect(cardMetrics('portrait', 'extraLarge')).toEqual({
			posterHeight: 440,
			itemSize: {minWidth: 270, minHeight: 530}
		});
	});

	it('measures a thumbnail the way the flat grid always has', () => {
		expect(cardMetrics('landscape', 'small')).toEqual({
			posterHeight: 120,
			itemSize: {minWidth: 220, minHeight: 170}
		});
		expect(cardMetrics('landscape', 'large')).toEqual({
			posterHeight: 210,
			itemSize: {minWidth: 360, minHeight: 280}
		});
	});

	// The 20 is the 10px margin the card carries on each side.
	it('leaves a square as wide as it is tall', () => {
		['small', 'medium', 'large', 'extraLarge'].forEach((size) => {
			const {posterHeight, itemSize} = cardMetrics('square', size);
			expect(itemSize.minWidth - 20).toBe(posterHeight);
		});
	});

	it('measures a circle the same as a square', () => {
		expect(cardMetrics('circle', 'medium')).toEqual(cardMetrics('square', 'medium'));
	});

	it('falls back to a poster at the middle size', () => {
		expect(cardMetrics('hexagon', 'gigantic')).toEqual(cardMetrics('portrait', 'medium'));
	});
});

describe('favoriteCardImage', () => {
	it('takes the thumbnail for a wide card that has one', () => {
		const item = {Id: 'e1', Type: 'Episode', ImageTags: {Thumb: 't', Primary: 'p'}};
		expect(favoriteCardImage(item, 'landscape')).toEqual({imageId: 'e1', imageType: 'Thumb'});
	});

	it('falls back to the poster when a wide card has no thumbnail', () => {
		const item = {Id: 'e2', Type: 'Episode', ImageTags: {Primary: 'p'}};
		expect(favoriteCardImage(item, 'landscape')).toEqual({imageId: 'e2', imageType: 'Primary'});
	});

	it('leaves a thumbnail alone on any other shape', () => {
		const item = {Id: 'm1', Type: 'Movie', ImageTags: {Thumb: 't', Primary: 'p'}};
		expect(favoriteCardImage(item, 'portrait')).toEqual({imageId: 'm1', imageType: 'Primary'});
	});

	it('borrows the album cover for a song with no art of its own', () => {
		const item = {Id: 's1', Type: 'Audio', ImageTags: {}, AlbumId: 'a1', AlbumPrimaryImageTag: 'tag'};
		expect(favoriteCardImage(item, 'square')).toEqual({imageId: 'a1', imageType: 'Primary'});
	});

	it('keeps the art a song has of its own over the album cover', () => {
		const item = {Id: 's2', Type: 'Audio', ImageTags: {Primary: 'p'}, AlbumId: 'a1', AlbumPrimaryImageTag: 'tag'};
		expect(favoriteCardImage(item, 'square')).toEqual({imageId: 's2', imageType: 'Primary'});
	});

	it('has nothing to draw for an item with no art anywhere', () => {
		expect(favoriteCardImage({Id: 'x', Type: 'MusicArtist', ImageTags: {}}, 'circle')).toEqual({imageId: null, imageType: 'Primary'});
		expect(favoriteCardImage(null, 'portrait')).toEqual({imageId: null, imageType: 'Primary'});
	});
});

describe('the watchlist tab', () => {
	const libraryFilm = {Id: 'lib1', Type: 'Movie', Name: 'Held', ProviderIds: {Tmdb: '11'}};
	const card = (id, type = 'Movie') => ({Id: `seerr-${type === 'Movie' ? 'movie' : 'tv'}-${id}`, Type: type, _seerr: true, _seerrRaw: {mediaId: id}, _externalPosterUrl: `https://image.tmdb.org/p/${id}.jpg`});

	it('leads with the library titles and leaves out request cards the library already shows', () => {
		const cards = watchlistCards([libraryFilm], [card(11), card(22), card(11, 'Series'), card(22)]);
		expect(cards.map((item) => item.Id)).toEqual(['lib1', 'seerr-movie-22', 'seerr-tv-11']);
	});

	it('shows after the favorites once it has anything in it', () => {
		const tabs = visibleTabs({movie: [libraryFilm], watchlist: [card(22)]});
		expect(tabs.map((tab) => tab.key)).toEqual(['movie', WATCHLIST_TAB.key]);
		expect(visibleTabs({movie: [libraryFilm], watchlist: []}).map((tab) => tab.key)).toEqual(['movie']);
	});

	it('draws a request card from its own poster', () => {
		expect(favoriteCardImage(card(22), 'portrait').url).toBe('https://image.tmdb.org/p/22.jpg');
	});
});

describe('withWatchlistBackdrops', () => {
	test('gives a request card the backdrop found for it and leaves the other cards alone', () => {
		const library = {Id: 'lib-1', Type: 'Movie'};
		const request = {Id: 'seerr-tv-2', _seerr: true, _externalBackdropUrl: null};
		const hasOne = {Id: 'seerr-movie-3', _seerr: true, _externalBackdropUrl: 'own.jpg'};
		const backdrops = new Map([['seerr-tv-2', 'fallen-bg.jpg'], ['seerr-movie-3', 'other.jpg']]);
		const cards = withWatchlistBackdrops([library, request, hasOne], backdrops);

		expect(cards[0]).toBe(library);
		expect(cards[1]).toEqual({...request, _externalBackdropUrl: 'fallen-bg.jpg'});
		expect(cards[2]).toBe(hasOne);
	});
});

describe('watchlist request cards', () => {
	const card = {Id: 'seerr-movie-11', Name: 'Film', Overview: '', ProductionYear: 2026, _externalBackdropUrl: null, _seerr: true, _seerrMediaType: 'movie'};

	it('take the detail\'s backdrop, runtime, age rating and score, keeping what the watchlist gave', () => {
		const filled = withRequestDetail(card, {runtime: 118, contentRating: 'R'}, {
			_externalBackdropUrl: 'http://img/b.jpg', Overview: 'A story.', ProductionYear: 1999, CommunityRating: 7.4
		});
		expect(filled).toMatchObject({
			_externalBackdropUrl: 'http://img/b.jpg', Overview: 'A story.', ProductionYear: 2026, CommunityRating: 7.4,
			OfficialRating: 'R', RunTimeTicks: 118 * 600000000
		});
		expect(withRequestDetail({...card, OfficialRating: 'PG-13'}, {contentRating: 'R'}, {}).OfficialRating).toBe('PG-13');
	});

	it('leave a series without a runtime', () => {
		expect(withRequestDetail({...card, _seerrMediaType: 'tv'}, {runtime: 45}, {}).RunTimeTicks).toBeUndefined();
	});

	it('swap into the row as it is now, or come out when the rating is blocked', () => {
		const row = [{Id: 'lib1'}, card, {Id: 'seerr-tv-5'}];
		const filled = {...card, OfficialRating: 'R'};
		expect(swapRequestCard(row, filled, false)).toEqual([{Id: 'lib1'}, filled, {Id: 'seerr-tv-5'}]);
		expect(swapRequestCard(row, filled, true)).toEqual([{Id: 'lib1'}, {Id: 'seerr-tv-5'}]);
		expect(swapRequestCard(undefined, filled, false)).toEqual([]);
	});
});
