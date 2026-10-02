import {browsableEpisodes, canBrowseEpisodes, initialSeasonId, seasonIdOf, tagWithServerOf, watchedPercent} from './episodeBrowser';

describe('canBrowseEpisodes', () => {
	const episode = {Type: 'Episode', SeriesId: 'series'};

	it('is offered for an episode of a series', () => {
		expect(canBrowseEpisodes({item: episode})).toBe(true);
	});

	it.each([
		['a movie', {Type: 'Movie'}],
		['a channel', {Type: 'TvChannel'}],
		['a track', {Type: 'Audio'}],
		['an episode with no series', {Type: 'Episode'}],
		['nothing playing', null]
	])('is not offered for %s', (name, item) => {
		expect(canBrowseEpisodes({item})).toBe(false);
	});

	it('is not offered over live TV or audio playback whatever is playing', () => {
		expect(canBrowseEpisodes({item: episode, isLiveTV: true})).toBe(false);
		expect(canBrowseEpisodes({item: episode, isAudioMode: true})).toBe(false);
	});
});

describe('initialSeasonId', () => {
	const seasons = [{Id: 's0'}, {Id: 's1'}, {Id: 42}];

	it('opens on the season that is playing', () => {
		expect(initialSeasonId(seasons, {SeasonId: 's1'})).toBe('s1');
		expect(seasonIdOf({ParentId: 'p'})).toBe('p');
	});

	it('compares ids as text, since Emby uses numbers', () => {
		expect(initialSeasonId(seasons, {SeasonId: '42'})).toBe('42');
	});

	it('falls back to the first season when the playing one is not listed', () => {
		expect(initialSeasonId(seasons, {SeasonId: 'gone'})).toBe('s0');
		expect(initialSeasonId([], {SeasonId: 'gone'})).toBeNull();
	});
});

describe('browsableEpisodes', () => {
	it('drops missing and unaired episodes', () => {
		const list = [{Id: 1}, {Id: 2, LocationType: 'Virtual'}, {Id: 3, LocationType: 'FileSystem'}];
		expect(browsableEpisodes(list).map((ep) => ep.Id)).toEqual([1, 3]);
		expect(browsableEpisodes(undefined)).toEqual([]);
	});
});

describe('tagWithServerOf', () => {
	const source = {_serverUrl: 'http://b', _serverAccessToken: 't', _serverUserId: 'u', _serverType: 'jellyfin', _serverName: 'B', _serverId: 'id'};

	it('stamps the playing item\'s server on every episode', () => {
		const [tagged] = tagWithServerOf(source, [{Id: 'e1'}]);
		expect(tagged).toMatchObject({Id: 'e1', _serverUrl: 'http://b', _serverAccessToken: 't', _serverUserId: 'u'});
	});

	it('leaves episodes from the default server alone', () => {
		const list = [{Id: 'e1'}];
		expect(tagWithServerOf({Id: 'x'}, list)).toBe(list);
	});
});

describe('watchedPercent', () => {
	it('uses the percentage the server reports', () => {
		expect(watchedPercent({UserData: {PlayedPercentage: 42.5}})).toBe(42.5);
	});

	it('works it out from the position when the server gives none', () => {
		expect(watchedPercent({RunTimeTicks: 1000, UserData: {PlaybackPositionTicks: 250}})).toBe(25);
	});

	it('is zero for an unstarted episode and never past a full bar', () => {
		expect(watchedPercent({UserData: {PlayedPercentage: 0}})).toBe(0);
		expect(watchedPercent({})).toBe(0);
		expect(watchedPercent({UserData: {PlayedPercentage: 140}})).toBe(100);
	});
});
