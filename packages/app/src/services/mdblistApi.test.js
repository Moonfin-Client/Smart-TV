jest.mock('./jellyfinApi', () => ({
	getApiKey: () => 'token',
	getServerUrl: () => 'http://server',
	api: {getItem: jest.fn()}
}));
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: async (base) => ({base, headers: {Authorization: 'token'}}),
	moonbaseAssetUrl: (base, path) => `${base}${path}`
}));
jest.mock('../utils/requestQueue', () => ({
	mediaServerQueue: {run: (task) => task()}
}));

import {fetchRatings, isMdblistEnabled, ratingSettingsFor} from './mdblistApi';
import {api} from './jellyfinApi';

const respondWith = (ratings) => {
	global.fetch = jest.fn(() => Promise.resolve({
		ok: true,
		json: () => Promise.resolve({success: true, ratings})
	}));
};

describe('fetchRatings', () => {
	afterEach(() => {
		delete global.fetch;
	});

	test('keeps one rating per source when the plugin repeats it under another spelling', async () => {
		// Plugins before the dedupe fix answer a profile holding myAnimeList and myanimelist
		// with the same rating twice.
		respondWith([
			{source: 'myAnimeList', value: 8.6, score: 86},
			{source: 'imdb', value: 8.1, score: 81},
			{source: 'myanimelist', value: 8.6, score: 86}
		]);

		const ratings = await fetchRatings('http://server', {Type: 'Series', Id: 's1', ProviderIds: {Tmdb: '101'}}, {sourcesKey: 'dupes'});

		expect(ratings.map((r) => r.source)).toEqual(['myAnimeList', 'imdb']);
	});

	test('still maps popcorn to tomatoes_audience', async () => {
		respondWith([{source: 'popcorn', score: 92}]);

		const ratings = await fetchRatings('http://server', {Type: 'Movie', Id: 'm1', ProviderIds: {Tmdb: '202'}}, {sourcesKey: 'rt'});

		expect(ratings).toEqual([{source: 'tomatoes_audience', value: undefined, score: 92, votes: undefined, url: undefined}]);
	});

	test("asks with a Seerr card's own TMDB id and never looks it up on the server", async () => {
		respondWith([{source: 'imdb', value: 7.4, score: 74}]);
		const seerrCard = (type, mediaType, mediaId) => ({Id: `seerr-${mediaType}-${mediaId}`, Type: type, _seerr: true, _seerrRaw: {mediaId, mediaType}});

		await fetchRatings('http://server', seerrCard('Movie', 'movie', 603), {sourcesKey: 'seerr'});
		await fetchRatings('http://server', seerrCard('Series', 'tv', 1399), {sourcesKey: 'seerr'});
		expect(global.fetch.mock.calls.map(([url]) => url.match(/tmdbId=(\d+)/)[1])).toEqual(['603', '1399']);

		expect(await fetchRatings('http://server', seerrCard('Series', 'tv', 'tt0944947'), {sourcesKey: 'seerr'})).toEqual([]);
		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(api.getItem).not.toHaveBeenCalled();
	});
});

describe('ratingSettingsFor', () => {
	const settings = {
		useMoonfinPlugin: true,
		mdblistEnabled: true,
		mdblistRatingSources: ['imdb'],
		showRatingLabels: true,
		homeRowsMdblistEnabled: false,
		homeRowsMdblistRatingSources: ['tmdb', 'stars'],
		homeRowsTmdbEpisodeRatingsEnabled: true,
		homeRowsShowRatingLabels: false,
		homeRowsShowRatingBadges: true,
		mediaBarMdblistEnabled: true,
		mediaBarShowRatingLabels: false
	};

	test('hands back the plain settings without a surface', () => {
		expect(ratingSettingsFor(settings)).toBe(settings);
	});

	test("reads a surface's own copy under the plain names", () => {
		expect(ratingSettingsFor(settings, 'homeRows')).toMatchObject({
			mdblistEnabled: false,
			mdblistRatingSources: ['tmdb', 'stars'],
			tmdbEpisodeRatingsEnabled: true,
			showRatingLabels: false,
			showRatingBadges: true
		});
	});

	test('the media bar has no episode ratings of its own', () => {
		expect(ratingSettingsFor(settings, 'mediaBar').tmdbEpisodeRatingsEnabled).toBeUndefined();
	});

	test("gates the plugin fetch on the surface's own switch", () => {
		expect(isMdblistEnabled(settings)).toBe(true);
		expect(isMdblistEnabled(settings, 'homeRows')).toBe(false);
		expect(isMdblistEnabled(settings, 'mediaBar')).toBe(true);
		expect(isMdblistEnabled({...settings, useMoonfinPlugin: false}, 'mediaBar')).toBe(false);
	});
});
