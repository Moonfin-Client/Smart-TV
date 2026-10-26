jest.mock('./jellyfinApi', () => ({
	createApiForServer: jest.fn(),
	getApiKey: () => 'token',
	getServerType: () => 'jellyfin',
	getServerUrl: () => 'http://server',
	getTokenParam: (type) => (type === 'emby' ? 'api_key' : 'ApiKey')
}));
jest.mock('../utils/perfTier', () => ({getPerfTier: jest.fn()}));
jest.mock('./seerrApi', () => ({moonfinPing: jest.fn()}));
jest.mock('./externalRowsApi', () => ({fetchTmdbDetails: jest.fn()}));

import {createApiForServer} from './jellyfinApi';
import {getPerfTier} from '../utils/perfTier';
import {moonfinPing} from './seerrApi';
import {fetchTmdbDetails} from './externalRowsApi';
import {
	buildMediaPreviewUrl,
	isOutsideTitle,
	mediaPreviewAllowedOnDevice,
	newPlaySessionId,
	pickPreviewAudioIndex,
	previewApiFor,
	previewDwellMs,
	previewSegmentContainer,
	previewServerOf,
	previewStartSeconds,
	resolvePreviewTarget,
	resolveTrailerSource,
	supportsMediaPreview,
	trailerSubjectId
} from './mediaPreviewSource';
import * as youtube from './youtubeTrailer';

const TICK = 10000000;

const urlArgs = (overrides = {}) => ({
	serverUrl: 'http://server',
	serverType: 'jellyfin',
	token: 'token',
	deviceId: 'device-1',
	playSessionId: 'session-1',
	itemId: 'film',
	mediaSourceId: 'source-1',
	audioStreamIndex: 2,
	segmentContainer: 'ts',
	...overrides
});

const paramsOf = (url) => {
	const query = url.slice(url.indexOf('?') + 1);
	const params = {};
	query.split('&').forEach((pair) => {
		const [key, value] = pair.split('=');
		params[decodeURIComponent(key)] = decodeURIComponent(value);
	});
	return params;
};

const seerrTitle = (extra = {}) => ({
	Id: 'seerr-movie-603', Type: 'Movie', _seerr: true, _seerrType: 'item', _seerrMediaType: 'movie', _seerrRaw: {mediaId: 603, mediaType: 'movie'}, ...extra
});
const listTitle = (extra = {}) => ({
	Id: 'ext-imdb-tt0944947', Type: 'Series', ProviderIds: {Imdb: 'tt0944947'}, _external: true, _seerr: true, _seerrType: 'item', _seerrMediaType: 'tv',
	_seerrRaw: {imdbId: 'tt0944947', title: 'Game of Thrones', mediaType: 'tv'}, ...extra
});

describe('supportsMediaPreview', () => {
	test.each(['Series', 'Movie', 'Episode', 'Video', 'MusicVideo'])('takes a library %s for a clip', (Type) => {
		expect(supportsMediaPreview({Id: 'a', Type}, 'media')).toBe(true);
	});

	test.each(['Movie', 'Series', 'Episode', 'Season'])('takes a library %s for a trailer', (Type) => {
		expect(supportsMediaPreview({Id: 'a', Type}, 'trailer')).toBe(true);
	});

	test('a season only has a trailer and a video or music video only has a clip', () => {
		expect(supportsMediaPreview({Id: 'a', Type: 'Season'}, 'media')).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Video'}, 'trailer')).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'MusicVideo'}, 'trailer')).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Season'})).toBe(true);
		expect(supportsMediaPreview({Id: 'a', Type: 'Video'})).toBe(true);
	});

	test.each(['BoxSet', 'Audio', 'MusicAlbum', 'Genre', 'CollectionFolder', 'Person'])('leaves a %s alone', (Type) => {
		expect(supportsMediaPreview({Id: 'a', Type})).toBe(false);
	});

	test.each([undefined, 'media', 'trailer'])('skips Seerr, outside list and shortcut cards (%s)', (mode) => {
		expect(supportsMediaPreview({Id: 'a', Type: 'Movie', _seerr: true}, mode)).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Movie', _external: true}, mode)).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Episode', _external: true, _calendarDate: '2026-11-01'}, mode)).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Movie', isLibraryTile: true}, mode)).toBe(false);
		expect(supportsMediaPreview({Id: 'a', Type: 'Movie', isRecordingsShortcut: true}, mode)).toBe(false);
	});

	test('a Seerr, outside list or seasonal suggestion title only ever plays a trailer', () => {
		[seerrTitle(), listTitle()].forEach((item) => {
			expect(isOutsideTitle(item)).toBe(true);
			expect(supportsMediaPreview(item)).toBe(true);
			expect(supportsMediaPreview(item, 'trailer')).toBe(true);
			expect(supportsMediaPreview(item, 'media')).toBe(false);
		});
	});

	test('tiles, shortcuts and calendar cards with the same marks play nothing', () => {
		const calendar = listTitle({Id: 'cal-radarr-5', _calendarDate: '2026-11-01T00:00:00Z'});
		const genre = {Id: 'seerr-genre-movie-28', Type: 'Genre', _seerr: true, _seerrType: 'genre', _seerrMediaType: 'movie'};
		const studio = {Id: 'seerr-studio-2', _seerr: true, _seerrType: 'studio'};
		const shortcut = {Id: 'seerr-shortcut-discover', _seerr: true, _seerrType: 'shortcut'};
		[calendar, genre, studio, shortcut].forEach((item) => {
			expect(isOutsideTitle(item)).toBe(false);
			[undefined, 'media', 'trailer'].forEach((mode) => expect(supportsMediaPreview(item, mode)).toBe(false));
		});
	});

	test('needs an item with an id', () => {
		expect(supportsMediaPreview(null)).toBe(false);
		expect(supportsMediaPreview({Type: 'Movie'})).toBe(false);
	});
});

describe('mediaPreviewAllowedOnDevice', () => {
	test('the low performance mode turns previews off everywhere', () => {
		for (const platform of ['webos', 'tizen', 'vega', 'xbox']) {
			expect(mediaPreviewAllowedOnDevice({platform, webosVersion: 24, performanceMode: 'low'})).toBe(false);
		}
	});

	test('Tizen 3 and older stay off, newer Samsung sets are on whatever the perf heuristic thinks', () => {
		expect(mediaPreviewAllowedOnDevice({platform: 'tizen', legacyTizen: true})).toBe(false);
		expect(mediaPreviewAllowedOnDevice({platform: 'tizen', legacyTizen: false})).toBe(true);
		expect(mediaPreviewAllowedOnDevice({platform: 'tizen', legacyTizen: false, performanceMode: 'auto'})).toBe(true);
	});

	test('webOS needs a known version of 5 or newer', () => {
		expect(mediaPreviewAllowedOnDevice({platform: 'webos', webosVersion: 4})).toBe(false);
		expect(mediaPreviewAllowedOnDevice({platform: 'webos', webosVersion: 5})).toBe(true);
		expect(mediaPreviewAllowedOnDevice({platform: 'webos', webosVersion: 24})).toBe(true);
		expect(mediaPreviewAllowedOnDevice({platform: 'webos', webosVersion: null})).toBe(false);
		expect(mediaPreviewAllowedOnDevice({platform: 'webos'})).toBe(false);
	});

	test('Fire TV and Xbox are on unless the viewer picked the low mode', () => {
		expect(mediaPreviewAllowedOnDevice({platform: 'vega'})).toBe(true);
		expect(mediaPreviewAllowedOnDevice({platform: 'xbox', performanceMode: 'high'})).toBe(true);
		expect(mediaPreviewAllowedOnDevice({platform: 'xbox', performanceMode: 'mid'})).toBe(true);
	});
});

describe('previewStartSeconds', () => {
	test('resumes where the viewer left off', () => {
		expect(previewStartSeconds({UserData: {PlaybackPositionTicks: 1234 * TICK + 5}, RunTimeTicks: 5400 * TICK})).toBe(1234);
	});

	test('starts a short title at the top and anything else three minutes in', () => {
		expect(previewStartSeconds({RunTimeTicks: 600 * TICK})).toBe(0);
		expect(previewStartSeconds({RunTimeTicks: 899 * TICK})).toBe(0);
		expect(previewStartSeconds({RunTimeTicks: 900 * TICK})).toBe(180);
		expect(previewStartSeconds({RunTimeTicks: 5400 * TICK})).toBe(180);
	});

	test('an unknown runtime still starts three minutes in', () => {
		expect(previewStartSeconds({})).toBe(180);
		expect(previewStartSeconds({UserData: {PlaybackPositionTicks: 0}})).toBe(180);
	});
});

describe('pickPreviewAudioIndex', () => {
	const stream = (Index, Language, extra = {}) => ({Type: 'Audio', Index, Language, Codec: 'aac', Channels: 2, ...extra});

	test('is null when the source carries no audio', () => {
		expect(pickPreviewAudioIndex({MediaStreams: [{Type: 'Video', Index: 0}]})).toBeNull();
		expect(pickPreviewAudioIndex(null)).toBeNull();
	});

	test('follows the preferred language', () => {
		const source = {MediaStreams: [stream(1, 'eng'), stream(2, 'jpn')]};

		expect(pickPreviewAudioIndex(source, {audioLanguage: 'jpn'})).toBe(2);
		expect(pickPreviewAudioIndex(source, {audioLanguage: 'eng'})).toBe(1);
	});

	test('skips a commentary track and takes the default when asked', () => {
		const source = {MediaStreams: [
			stream(1, 'eng', {Title: 'Director commentary'}),
			stream(2, 'eng', {IsDefault: true}),
			stream(3, 'eng', {Channels: 6})
		]};

		expect(pickPreviewAudioIndex(source, {audioLanguage: 'eng'})).toBe(3);
		expect(pickPreviewAudioIndex(source, {audioLanguage: 'eng', preferDefaultAudioTrack: true})).toBe(2);
	});
});

describe('previewSegmentContainer', () => {
	test('webOS takes fMP4 only when its player does', () => {
		expect(previewSegmentContainer('webos', {nativeHlsFmp4: true})).toBe('mp4');
		expect(previewSegmentContainer('webos', {nativeHlsFmp4: false})).toBe('ts');
		expect(previewSegmentContainer('webos', null)).toBe('ts');
	});

	test('Fire TV takes fMP4, the hls.js platforms take TS', () => {
		expect(previewSegmentContainer('vega', null)).toBe('mp4');
		expect(previewSegmentContainer('tizen', {nativeHlsFmp4: true})).toBe('ts');
		expect(previewSegmentContainer('xbox', null)).toBe('ts');
	});
});

describe('buildMediaPreviewUrl', () => {
	test('asks Jellyfin for the fixed transcode with every parameter', () => {
		const url = buildMediaPreviewUrl(urlArgs());

		expect(url.startsWith('http://server/Videos/film/master.m3u8?')).toBe(true);
		expect(paramsOf(url)).toEqual({
			Static: 'false',
			PlaySessionId: 'session-1',
			DeviceId: 'device-1',
			videoCodec: 'h264',
			audioCodec: 'aac',
			maxVideoBitDepth: '8',
			videoBitRate: '4000000',
			maxWidth: '1280',
			maxHeight: '720',
			audioBitRate: '96000',
			audioChannels: '2',
			subtitleMethod: 'Drop',
			SegmentContainer: 'ts',
			MediaSourceId: 'source-1',
			AudioStreamIndex: '2',
			ApiKey: 'token'
		});
	});

	test('never carries a start time, the element seeks instead', () => {
		expect(buildMediaPreviewUrl(urlArgs())).not.toContain('StartTimeTicks');
	});

	test('names the token the way Emby reads it and leaves the subtitle method out', () => {
		const params = paramsOf(buildMediaPreviewUrl(urlArgs({serverType: 'emby', segmentContainer: 'mp4'})));

		expect(params.api_key).toBe('token');
		expect(params).not.toHaveProperty('ApiKey');
		expect(params).not.toHaveProperty('subtitleMethod');
		expect(params.SegmentContainer).toBe('mp4');
	});

	test('leaves the audio index out when there is none to send', () => {
		expect(buildMediaPreviewUrl(urlArgs({audioStreamIndex: null}))).not.toContain('AudioStreamIndex');
		expect(buildMediaPreviewUrl(urlArgs({audioStreamIndex: undefined}))).not.toContain('AudioStreamIndex');
		expect(buildMediaPreviewUrl(urlArgs({audioStreamIndex: 0}))).toContain('AudioStreamIndex=0');
	});

	test('escapes the item id', () => {
		expect(buildMediaPreviewUrl(urlArgs({itemId: 'a b'}))).toContain('/Videos/a%20b/master.m3u8');
	});
});

describe('newPlaySessionId', () => {
	test('is 32 hex characters and not the same twice', () => {
		const first = newPlaySessionId();
		expect(first).toMatch(/^[0-9a-f]{32}$/);
		expect(newPlaySessionId()).not.toBe(first);
	});
});

describe('previewApiFor and previewServerOf', () => {
	test('a row from another server gets an api for that server', () => {
		const api = {};
		const other = {};
		createApiForServer.mockReturnValue(other);
		const item = {Id: 'a', _serverUrl: 'http://other', _serverAccessToken: 'tok', _serverUserId: 'u2', _serverType: 'emby'};

		expect(previewApiFor(item, api)).toBe(other);
		expect(createApiForServer).toHaveBeenCalledWith('http://other', 'tok', 'u2', 'emby');
		expect(previewServerOf(item)).toEqual({serverUrl: 'http://other', token: 'tok', serverType: 'emby'});
	});

	test('a row from the signed in server uses the app api and its credentials', () => {
		const api = {};

		expect(previewApiFor({Id: 'a'}, api)).toBe(api);
		expect(createApiForServer).not.toHaveBeenCalled();
		expect(previewServerOf({Id: 'a'})).toEqual({serverUrl: 'http://server', token: 'token', serverType: 'jellyfin'});
	});
});

describe('resolvePreviewTarget', () => {
	const withSource = (Id, extra = {}) => ({Id, MediaSources: [{Id: `${Id}-src`, MediaStreams: []}], ...extra});
	let api;

	beforeEach(() => {
		api = {getNextUp: jest.fn(), getItemMediaInfo: jest.fn()};
	});

	test('a movie is fetched again for its sources and resume position', async () => {
		api.getItemMediaInfo.mockResolvedValue(withSource('film', {UserData: {PlaybackPositionTicks: 5}}));

		const target = await resolvePreviewTarget(api, {Id: 'film', Type: 'Movie'});

		expect(api.getNextUp).not.toHaveBeenCalled();
		expect(api.getItemMediaInfo).toHaveBeenCalledWith('film');
		expect(target.UserData.PlaybackPositionTicks).toBe(5);
	});

	test('the row item stands in when the fetch fails, as long as it carries a source', async () => {
		api.getItemMediaInfo.mockRejectedValue(new Error('offline'));

		expect(await resolvePreviewTarget(api, withSource('film', {Type: 'Movie'}))).toMatchObject({Id: 'film'});
		expect(await resolvePreviewTarget(api, {Id: 'film', Type: 'Movie'})).toBeNull();
	});

	test('a target without a media source has no preview', async () => {
		api.getItemMediaInfo.mockResolvedValue({Id: 'film', MediaSources: []});

		expect(await resolvePreviewTarget(api, {Id: 'film', Type: 'Movie'})).toBeNull();
	});

	test('a series plays its next up episode', async () => {
		api.getNextUp.mockResolvedValue({Items: [{Id: 'ep3', ParentIndexNumber: 2}]});
		api.getItemMediaInfo.mockResolvedValue(withSource('ep3'));

		const target = await resolvePreviewTarget(api, {Id: 'show', Type: 'Series'});

		expect(api.getNextUp).toHaveBeenCalledWith(1, 'show');
		expect(api.getItemMediaInfo).toHaveBeenCalledWith('ep3');
		expect(target.Id).toBe('ep3');
	});

	test('a special or nothing up next means no preview', async () => {
		api.getNextUp.mockResolvedValueOnce({Items: [{Id: 'sp1', ParentIndexNumber: 0}]});
		expect(await resolvePreviewTarget(api, {Id: 'show', Type: 'Series'})).toBeNull();

		api.getNextUp.mockResolvedValueOnce({Items: []});
		expect(await resolvePreviewTarget(api, {Id: 'show', Type: 'Series'})).toBeNull();

		api.getNextUp.mockRejectedValueOnce(new Error('offline'));
		expect(await resolvePreviewTarget(api, {Id: 'show', Type: 'Series'})).toBeNull();

		expect(api.getItemMediaInfo).not.toHaveBeenCalled();
	});

	test('nothing without an item', async () => {
		expect(await resolvePreviewTarget(api, null)).toBeNull();
		expect(api.getItemMediaInfo).not.toHaveBeenCalled();
	});
});

describe('trailerSubjectId', () => {
	test('a film or show has its own trailer, an episode or season borrows its show\'s', () => {
		expect(trailerSubjectId({Id: 'film', Type: 'Movie'})).toBe('film');
		expect(trailerSubjectId({Id: 'show', Type: 'Series'})).toBe('show');
		expect(trailerSubjectId({Id: 'ep', Type: 'Episode', SeriesId: 'show'})).toBe('show');
		expect(trailerSubjectId({Id: 'season', Type: 'Season', SeriesId: 'show'})).toBe('show');
	});

	test('anything else has none', () => {
		expect(trailerSubjectId({Id: 'ep', Type: 'Episode'})).toBeNull();
		expect(trailerSubjectId({Id: 'v', Type: 'Video'})).toBeNull();
		expect(trailerSubjectId(null)).toBeNull();
	});
});

describe('resolveTrailerSource', () => {
	const youTube = (id) => ({Name: 'Trailer', Url: `https://www.youtube.com/watch?v=${id}`});
	const trailerItem = (Id) => ({Id, Type: 'Trailer', MediaSources: [{Id: `${Id}-src`, MediaStreams: []}]});
	let api;

	beforeEach(() => {
		api = {
			getLocalTrailers: jest.fn().mockResolvedValue([]),
			getItemMediaInfo: jest.fn((Id) => Promise.resolve(trailerItem(Id))),
			getItem: jest.fn(),
			getNextUp: jest.fn()
		};
	});

	test('a trailer on the server comes before YouTube', async () => {
		api.getLocalTrailers.mockResolvedValue([{Id: 'local-1'}]);

		const source = await resolveTrailerSource(api, {Id: 'film', Type: 'Movie', RemoteTrailers: [youTube('aaaaaaaaaaa')]}, youtube);

		expect(api.getLocalTrailers).toHaveBeenCalledWith('film');
		expect(api.getItemMediaInfo).toHaveBeenCalledWith('local-1');
		expect(source).toEqual({target: trailerItem('local-1')});
	});

	test('Emby\'s wrapped list is read too', async () => {
		api.getLocalTrailers.mockResolvedValue({Items: [{Id: 'local-2'}]});

		expect(await resolveTrailerSource(api, {Id: 'film', Type: 'Movie'}, youtube)).toEqual({target: trailerItem('local-2')});
	});

	test('YouTube comes next, from the card when it carries the trailers', async () => {
		const source = await resolveTrailerSource(api, {Id: 'film', Type: 'Movie', RemoteTrailers: [{Url: 'https://example.com/t.mp4'}, youTube('bbbbbbbbbbb')]}, youtube);

		expect(source).toEqual({youTubeId: 'bbbbbbbbbbb'});
		expect(api.getItem).not.toHaveBeenCalled();
	});

	test('a Plex title has YouTube searched for its trailer without being read again', async () => {
		const searchedTrailers = jest.fn().mockResolvedValue([youTube('ggggggggggg')]);
		const film = {Id: 'film', Type: 'Movie', Name: 'Film', _serverType: 'plex'};

		expect(await resolveTrailerSource(api, film, {...youtube, searchedTrailers})).toEqual({youTubeId: 'ggggggggggg'});
		expect(searchedTrailers).toHaveBeenCalledWith(film);
		expect(api.getItem).not.toHaveBeenCalled();
	});

	test('a Plex episode searches with its show', async () => {
		const searchedTrailers = jest.fn().mockResolvedValue([youTube('hhhhhhhhhhh')]);
		const show = {Id: 'show', Type: 'Series', Name: 'Show'};
		api.getItem.mockResolvedValue(show);

		const source = await resolveTrailerSource(api, {Id: 'ep', Type: 'Episode', SeriesId: 'show', _serverType: 'plex'}, {...youtube, searchedTrailers});

		expect(source).toEqual({youTubeId: 'hhhhhhhhhhh'});
		expect(searchedTrailers).toHaveBeenCalledWith(show);
	});

	test('a card without its trailers fetches the title, and a failed local lookup still reaches YouTube', async () => {
		api.getLocalTrailers.mockRejectedValue(new Error('offline'));
		api.getItem.mockResolvedValue({Id: 'show', RemoteTrailers: [youTube('ccccccccccc')]});

		expect(await resolveTrailerSource(api, {Id: 'show', Type: 'Series'}, youtube)).toEqual({youTubeId: 'ccccccccccc'});
		expect(api.getItem).toHaveBeenCalledWith('show');
	});

	test('an episode plays its show\'s trailer, not its own', async () => {
		api.getItem.mockResolvedValue({Id: 'show', RemoteTrailers: [youTube('ddddddddddd')]});

		const source = await resolveTrailerSource(api, {Id: 'ep', Type: 'Episode', SeriesId: 'show', RemoteTrailers: [youTube('eeeeeeeeeee')]}, youtube);

		expect(api.getLocalTrailers).toHaveBeenCalledWith('show');
		expect(api.getItem).toHaveBeenCalledWith('show');
		expect(source).toEqual({youTubeId: 'ddddddddddd'});
	});

	test('no trailer anywhere means nothing, and the clip is never asked for', async () => {
		api.getItem.mockResolvedValue({Id: 'film', RemoteTrailers: []});

		expect(await resolveTrailerSource(api, {Id: 'film', Type: 'Movie'}, youtube)).toBeNull();
		expect(await resolveTrailerSource(api, {Id: 'film', Type: 'Movie', RemoteTrailers: []}, youtube)).toBeNull();
		expect(api.getNextUp).not.toHaveBeenCalled();
		expect(api.getItemMediaInfo).not.toHaveBeenCalled();
	});

	test('an outside title plays the TMDB trailer from Moonbase and asks the server about no item', async () => {
		moonfinPing.mockResolvedValue({tmdbDetailsSupported: true});
		fetchTmdbDetails.mockResolvedValue({trailerUrl: 'https://www.youtube.com/watch?v=fffffffffff'});

		expect(await resolveTrailerSource(api, seerrTitle(), youtube)).toEqual({youTubeId: 'fffffffffff'});
		expect(fetchTmdbDetails).toHaveBeenLastCalledWith({type: 'movie', tmdbId: 603, imdbId: undefined});

		expect(await resolveTrailerSource(api, listTitle(), youtube)).toEqual({youTubeId: 'fffffffffff'});
		expect(fetchTmdbDetails).toHaveBeenLastCalledWith({type: 'tv', tmdbId: undefined, imdbId: 'tt0944947'});

		expect(api.getLocalTrailers).not.toHaveBeenCalled();
		expect(api.getItem).not.toHaveBeenCalled();
		expect(api.getItemMediaInfo).not.toHaveBeenCalled();
	});

	test('an outside title plays nothing without the plugin\'s TMDB details or a trailer in them', async () => {
		fetchTmdbDetails.mockClear();
		moonfinPing.mockResolvedValue({tmdbDetailsSupported: false});
		expect(await resolveTrailerSource(api, seerrTitle(), youtube)).toBeNull();
		moonfinPing.mockRejectedValue(new Error('no plugin'));
		expect(await resolveTrailerSource(api, seerrTitle(), youtube)).toBeNull();
		expect(fetchTmdbDetails).not.toHaveBeenCalled();

		moonfinPing.mockResolvedValue({tmdbDetailsSupported: true});
		fetchTmdbDetails.mockResolvedValue({overview: 'no trailer'});
		expect(await resolveTrailerSource(api, seerrTitle(), youtube)).toBeNull();
		fetchTmdbDetails.mockResolvedValue(null);
		expect(await resolveTrailerSource(api, seerrTitle(), youtube)).toBeNull();
		expect(api.getLocalTrailers).not.toHaveBeenCalled();
	});

	test('a card with no show to borrow from asks nothing', async () => {
		expect(await resolveTrailerSource(api, {Id: 'ep', Type: 'Episode'}, youtube)).toBeNull();
		expect(await resolveTrailerSource(api, {Id: 'v', Type: 'Video'}, youtube)).toBeNull();
		expect(api.getLocalTrailers).not.toHaveBeenCalled();
	});
});

test('a low tier set waits longer before a preview starts', () => {
	getPerfTier.mockReturnValue('low');
	expect(previewDwellMs()).toBe(2500);
	getPerfTier.mockReturnValue('mid');
	expect(previewDwellMs()).toBe(1200);
});
