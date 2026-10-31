import {createSiloPlayerExtras, siloMarkersToMediaSegments, siloThemeSongs, siloTrickplayToManifest} from './siloPlayerExtras';
import {siloChaptersOf} from './siloMapper';

const SERVER = 'http://silo:8090';
const notFound = () => Promise.reject(Object.assign(new Error('Not found'), {status: 404}));

describe('markers', () => {
	test('every occurrence becomes a segment in start order, credits as Outro', () => {
		const segments = siloMarkersToMediaSegments({
			intro: {start_seconds: 90, end_seconds: 120},
			marker_segments: [
				{kind: 'intro', start_seconds: 90, end_seconds: 120},
				{kind: 'recap', start_seconds: 0, end_seconds: 30},
				{kind: 'intro', start_seconds: 35, end_seconds: 60},
				{kind: 'credits', start_seconds: 1342.925, end_seconds: 1358.732}
			]
		}, 'ep1');
		expect(segments.map((s) => [s.Type, s.StartTicks, s.EndTicks])).toEqual([
			['Recap', 0, 300000000],
			['Intro', 350000000, 600000000],
			['Intro', 900000000, 1200000000],
			['Outro', 13429250000, 13587320000]
		]);
		expect(segments.map((s) => s.Id)).toEqual(['silo-recap-ep1-0', 'silo-intro-ep1-0', 'silo-intro-ep1-1', 'silo-outro-ep1-0']);
		expect(segments[0].ItemId).toBe('ep1');
	});

	test('without occurrences, one segment per kind; an open end runs to the length or is dropped', () => {
		const markers = {intro: {start_seconds: 0, end_seconds: 23.4}, credits: {start: 1300}, recap: {}, preview: {}, marker_segments: []};
		expect(siloMarkersToMediaSegments(markers, 'ep1').map((s) => s.Type)).toEqual(['Intro']);
		expect(siloMarkersToMediaSegments(markers, 'ep1', 1360).map((s) => [s.Type, s.EndTicks])).toEqual([
			['Intro', 234000000], ['Outro', 13600000000]
		]);
	});

	test('the playing file is read once it is known, a file Silo doesn\'t know has none', async () => {
		const call = jest.fn((path) => (path.includes('/files/') ? notFound() : Promise.resolve({
			marker_segments: [{kind: 'intro', start_seconds: 1, end_seconds: 2}]
		})));
		const extras = createSiloPlayerExtras({call, getBaseUrl: () => SERVER, getDetail: jest.fn()});
		expect((await extras.getMediaSegments('m1')).Items).toHaveLength(1);
		extras.notePlayingFile('m1', '9', 100);
		expect((await extras.getMediaSegments('m1')).Items).toEqual([]);
		expect(call.mock.calls.map((c) => c[0])).toEqual(['/api/v2/markers/items/m1', '/api/v2/markers/files/9']);
	});
});

describe('trickplay', () => {
	const answer = {
		file_id: '62', interval_ms: 10000, thumbnail_width: 300, thumbnail_height: 226, tile_columns: 10, tile_rows: 8,
		thumbnail_count: 138, expires_at: '2026-11-01T04:00:00.000Z',
		sheets: [{index: 1, url: '/api/v2/artwork/trickplay/62/1.jpg?sig=b'}, {index: 0, url: '/api/v2/artwork/trickplay/62/0.jpg?sig=a'}]
	};

	test('sheets lay out as Jellyfin\'s, with their signed addresses by index', () => {
		expect(siloTrickplayToManifest(answer, SERVER)).toEqual({
			300: {
				Width: 300, Height: 226, TileWidth: 10, TileHeight: 8, ThumbnailCount: 138, Interval: 10000,
				SiloSheets: [`${SERVER}/api/v2/artwork/trickplay/62/0.jpg?sig=a`, `${SERVER}/api/v2/artwork/trickplay/62/1.jpg?sig=b`],
				SiloExpiresAt: '2026-11-01T04:00:00.000Z'
			}
		});
	});

	test('no sheets or no size is no manifest, and so is a file without previews', async () => {
		expect(siloTrickplayToManifest({...answer, sheets: []}, SERVER)).toBe(null);
		expect(siloTrickplayToManifest({...answer, interval_ms: 0}, SERVER)).toBe(null);
		const call = jest.fn(notFound);
		const extras = createSiloPlayerExtras({call, getBaseUrl: () => SERVER, getDetail: jest.fn()});
		await expect(extras.getTrickplayManifest('ep1', '62')).resolves.toBe(null);
		expect(call).toHaveBeenCalledWith('/api/v2/watch/ep1/trickplay', {query: {file_id: '62'}});
	});
});

describe('theme music', () => {
	const detail = {themes: {owner_id: 'series-1', items: [{id: 4, title: 'Main theme', container: 'mp3', duration_seconds: 30}, {title: 'no id'}]}};

	test('a title\'s songs carry the item that owns them', () => {
		expect(siloThemeSongs(detail, 'ep1')).toEqual([{
			Id: '4', Name: 'Main theme', Type: 'Audio', MediaType: 'Audio', Container: 'mp3', RunTimeTicks: 300000000,
			ParentId: 'series-1', SiloThemeOwnerId: 'series-1'
		}]);
	});

	test('none when Silo doesn\'t serve them; a grant\'s address is made absolute', async () => {
		let state = 'disabled';
		const call = jest.fn((path) => {
			if (path.endsWith('/capabilities')) return Promise.resolve({state, allowed: true});
			return Promise.resolve({url: '/api/v2/catalog/themes/grant/abc.mp3'});
		});
		const extras = createSiloPlayerExtras({call, getBaseUrl: () => SERVER, getDetail: () => Promise.resolve(detail)});
		expect((await extras.getThemeSongs('ep1')).Items).toEqual([]);
		state = 'available';
		expect((await extras.getThemeSongs('ep1')).Items).toHaveLength(1);
		await expect(extras.getThemeSongUrl('series-1', '4')).resolves.toBe(`${SERVER}/api/v2/catalog/themes/grant/abc.mp3`);
		expect(call).toHaveBeenLastCalledWith('/api/v2/catalog/items/series-1/themes/4/playback', expect.objectContaining({method: 'POST'}));
	});

	test('a song Silo can\'t serve in a format the TV plays has no address', async () => {
		const call = jest.fn(() => Promise.reject(Object.assign(new Error('Not acceptable'), {status: 406})));
		const extras = createSiloPlayerExtras({call, getBaseUrl: () => SERVER, getDetail: jest.fn()});
		await expect(extras.getThemeSongUrl('series-1', '4')).resolves.toBe(null);
	});
});

describe('chapters', () => {
	test('in start order, each thumbnail recorded as the item\'s chapter picture', () => {
		const register = jest.fn((itemId, type, url) => (url ? `tag-${type}` : null));
		const chapters = siloChaptersOf({chapters: [
			{index: 1, title: 'Two', start_seconds: 373.415, thumbnail_url: '/c/1.jpg'},
			{index: 0, title: 'One', start_seconds: 0},
			{index: 2, title: 'Bad'}
		]}, 'm1', {register});
		expect(chapters).toEqual([
			{StartPositionTicks: 0, Name: 'One', MarkerType: 'Chapter', ChapterIndex: 0},
			{StartPositionTicks: 3734150000, Name: 'Two', ImageTag: 'tag-Chapter/1', MarkerType: 'Chapter', ChapterIndex: 1}
		]);
		expect(register).toHaveBeenCalledWith('m1', 'Chapter/1', '/c/1.jpg');
	});
});
