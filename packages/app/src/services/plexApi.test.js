import {createPlexApi, plexClientProfile} from './plexApi';
import {corsFreeFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));

const device = {appName: 'Moonfin for webOS', appVersion: '2.10.0', deviceName: 'LG Smart TV', deviceId: 'dev-1'};
const plex = createPlexApi({
	getBaseUrl: () => 'http://plex:32400',
	getToken: () => 'tok',
	getUserId: () => 'user-1',
	getDeviceInfo: () => device
});

const reply = (body) => Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body))});
const answer = (byPath) => corsFreeFetch.mockImplementation((url) => {
	const path = url.replace('http://plex:32400', '').split('?')[0];
	return reply(byPath[path] ?? {MediaContainer: {}});
});
const urls = () => corsFreeFetch.mock.calls.map((call) => call[0]);
const query = (url) => {
	const params = {};
	url.split('?')[1].split('&').forEach((pair) => {
		const [key, value] = pair.split('=').map(decodeURIComponent);
		params[key] = key in params ? [].concat(params[key], value) : value;
	});
	return params;
};

beforeEach(() => answer({}));

describe('items', () => {
	test('a library page reads its section with Plex sort, filters and paging', async () => {
		await plex.getItems({
			ParentId: 'section-1',
			IncludeItemTypes: 'Movie',
			Recursive: true,
			SortBy: 'SortName,ProductionYear',
			SortOrder: 'Descending',
			Filters: 'IsUnplayed,IsFavorite',
			Genres: 'Action|Drama',
			StartIndex: 50,
			Limit: 25
		});
		const [url] = urls();
		expect(url).toContain('/library/sections/1/all?');
		expect(query(url)).toMatchObject({
			type: '1',
			sort: 'titleSort:desc,year:desc',
			unwatched: '1',
			userRating: '10',
			genre: 'Action,Drama',
			'X-Plex-Container-Start': '50',
			'X-Plex-Container-Size': '25',
			'X-Plex-Token': 'tok',
			'X-Plex-Client-Identifier': 'dev-1'
		});
	});

	test('a first letter is the range of titles up to the next letter, and # is everything before A', async () => {
		await plex.getItems({ParentId: 'section-1', IncludeItemTypes: 'Movie', NameStartsWith: 'B'});
		await plex.getItems({ParentId: 'section-1', IncludeItemTypes: 'Movie', NameLessThan: 'A'});
		const [letter, hash] = urls();
		expect(letter).toContain('titleSort%3E=B&titleSort%3C%3C=C');
		expect(hash).toContain('titleSort%3C%3C=A');
	});

	test('a filter Plex has no way to apply answers with nothing instead of everything', async () => {
		const result = await plex.getItems({ParentId: 'section-1', SeriesStatus: 'Continuing'});
		expect(result.Items).toEqual([]);
		expect(corsFreeFetch).not.toHaveBeenCalled();
	});

	test('a global search keeps only titles that matched by name', async () => {
		answer({'/hubs/search': {MediaContainer: {Hub: [{Metadata: [
			{ratingKey: '1', type: 'movie', title: 'Alien'},
			{ratingKey: '2', type: 'movie', title: 'Prometheus', reason: 'actor'}
		]}]}}});
		const result = await plex.search('alien', 40);
		expect(result.Items.map((item) => item.Name)).toEqual(['Alien']);
		expect(query(urls()[0])).toMatchObject({query: 'alien', includeCollections: '1', limit: '40'});
	});

	test('continue watching splits into resume and next up', async () => {
		answer({'/hubs/continueWatching/items': {MediaContainer: {Metadata: [
			{ratingKey: '10', type: 'movie', viewOffset: 5000},
			{ratingKey: '11', type: 'episode'}
		]}}});
		expect((await plex.getResumeItems()).Items.map((i) => i.Id)).toEqual(['10']);
		expect((await plex.getNextUp()).Items.map((i) => i.Id)).toEqual(['11']);
	});

	test('favorites are a 10 rating and clearing one drops the rating', async () => {
		await plex.setFavorite('part-55-0-1', true);
		await plex.setFavorite('55', false);
		const [on, off] = urls();
		expect(on).toContain('/:/rate?');
		expect(query(on)).toMatchObject({key: '55', rating: '10'});
		expect(query(off)).toMatchObject({key: '55', rating: '-1'});
	});
});

describe('playback', () => {
	const movie = {MediaContainer: {Metadata: [{
		ratingKey: '797',
		type: 'movie',
		duration: 100000,
		Media: [{duration: 100000, container: 'mkv', Part: [{
			id: 5,
			key: '/library/parts/5/1/file.mkv',
			duration: 100000,
			Stream: [
				{id: 50, index: 0, streamType: 1, codec: 'hevc'},
				{id: 51, index: 1, streamType: 2, codec: 'truehd', selected: true},
				{id: 52, index: 2, streamType: 3, codec: 'pgs'}
			]
		}]}]
	}]}};
	const decision = (decided) => ({MediaContainer: {directPlayDecisionText: 'no', Metadata: [{Media: [{Part: [{decision: decided}]}]}]}});

	test('direct play hands back the file part with the chosen tracks', async () => {
		answer({'/library/metadata/797': movie, '/video/:/transcode/universal/decision': decision('directplay')});
		const info = await plex.getPlaybackInfo('797', {MaxStreamingBitrate: 40000000});
		const source = info.MediaSources[0];
		expect(source).toMatchObject({Path: '/library/parts/5/1/file.mkv', SupportsDirectPlay: true, DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: -1});
		expect(source.TranscodingUrl).toBeUndefined();
		expect(query(urls()[1])).toMatchObject({maxVideoBitrate: '40000', directPlay: '1', subtitles: 'none'});
	});

	test('a transcode burns the picked bitmap subtitle and decides again under its session', async () => {
		answer({'/library/metadata/797': movie, '/video/:/transcode/universal/decision': decision('transcode')});
		const info = await plex.getPlaybackInfo('797', {SubtitleStreamIndex: 2});
		const source = info.MediaSources[0];
		const choose = urls().find((url) => url.includes('/library/parts/5?'));
		expect(query(choose)).toMatchObject({subtitleStreamID: '52', allParts: '1'});
		expect(source.TranscodingUrl).toContain('/video/:/transcode/universal/start.m3u8?');
		const start = query(source.TranscodingUrl);
		expect(start).toMatchObject({subtitles: 'burn', directPlay: '0', session: info.PlaySessionId});
		expect(source.MediaStreams.find((s) => s.Index === 2).DeliveryMethod).toBe('Encode');
		expect(urls().filter((url) => url.includes('/decision?'))).toHaveLength(2);
	});

	test('turning direct stream off still lets Plex copy the video, and only the audio is converted', async () => {
		answer({'/library/metadata/797': movie, '/video/:/transcode/universal/decision': decision('transcode')});
		const info = await plex.getPlaybackInfo('797', {EnableDirectPlay: false, EnableDirectStream: false});
		expect(query(info.MediaSources[0].TranscodingUrl)).toMatchObject({directPlay: '0', directStream: '1', directStreamAudio: '0'});
	});

	test('the timeline names the runtime and never reports past the end', async () => {
		answer({'/library/metadata/797': movie, '/video/:/transcode/universal/decision': decision('directplay')});
		const info = await plex.getPlaybackInfo('797');
		corsFreeFetch.mockClear();
		await plex.reportPlaybackProgress({ItemId: '797', PlaySessionId: info.PlaySessionId, PositionTicks: 1000500000, IsPaused: true});
		expect(query(urls()[0])).toMatchObject({ratingKey: '797', key: '/library/metadata/797', state: 'paused', time: '100000', duration: '100000'});
	});

	test('the client profile keeps Plex directives apart', () => {
		const profile = plexClientProfile({
			DirectPlayProfiles: [{Type: 'Video', Container: 'mkv,ts', VideoCodec: 'h264', AudioCodec: ''}],
			CodecProfiles: [{Type: 'Video', Codec: 'h264', Conditions: [{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|constrained baseline'}]}]
		});
		expect(profile.split('+')[0]).toBe('add-settings(DirectPlayStreamSelection=true)');
		expect(profile).toContain('container=mkv,mpegts&videoCodec=h264&audioCodec=aac,ac3');
		expect(profile).toContain('add-limitation(scope=videoCodec&scopeName=h264&type=match&name=video.profile&list=high|constrained baseline)');
	});
});

describe('live tv', () => {
	test('reads the DVR grid once for the hours the guide asks about, a few channels at a time', async () => {
		const at = Date.UTC(2026, 9, 26, 15, 0, 0) / 1000;
		const show = (channel, beginsAt) => ({type: 'episode', title: 'Ep', grandparentTitle: 'Show', Media: [{channelIdentifier: channel, beginsAt, endsAt: beginsAt + 1800}]});
		answer({
			'/livetv/dvrs': {MediaContainer: {Dvr: [{key: 2, epgIdentifier: 'tv.plex.providers.epg.xmltv:2'}]}},
			'/tv.plex.providers.epg.xmltv:2/grid': {MediaContainer: {Metadata: [show('1', at), show('2', at), show('1', at + 7200)]}}
		});
		const start = new Date((at + 300) * 1000);
		const end = new Date((at + 3600) * 1000);
		const first = await plex.getLiveTvPrograms(['channel-2-1'], start, end);
		const second = await plex.getLiveTvPrograms(['channel-2-2'], start, end);
		expect(first.Items.map((p) => p.ChannelId)).toEqual(['channel-2-1']);
		expect(second.Items.map((p) => p.ChannelId)).toEqual(['channel-2-2']);
		expect(urls().filter((url) => url.includes('/grid?'))).toHaveLength(1);
	});
});
