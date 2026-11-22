import {createSiloRemoteSubtitles} from './siloRemoteSubtitles';
import {siloLanguageCode} from './siloMediaSources';

test('language codes go to Silo as two letters where there are two', () => {
	expect(siloLanguageCode('eng')).toBe('en');
	expect(siloLanguageCode('ger')).toBe('de');
	expect(siloLanguageCode('fr')).toBe('fr');
	expect(siloLanguageCode('xyz')).toBe('xyz');
});

test('searches the playing file and downloads a result with what Silo found, carried in its id', async () => {
	const calls = [];
	const forget = jest.fn();
	const call = jest.fn(async (path, options) => {
		calls.push({path, ...options});
		return path.endsWith('/search') ? {results: [
			{id: 'os-1', provider: 'opensubtitles', language: 'en', release_name: 'Get.a.Job.2016 – é', score: 0.9, format: 'srt', downloads: 12},
			{provider: 'no id'}
		]} : {};
	});
	const subs = createSiloRemoteSubtitles({call, fileOf: async () => '5', forget});
	const found = await subs.searchRemoteSubtitles('movie-1', 'eng');
	expect(calls[0].body).toEqual({media_file_id: '5', languages: ['en']});
	expect(found).toHaveLength(1);
	expect(found[0]).toMatchObject({Name: 'Get.a.Job.2016 – é', ProviderName: 'opensubtitles', Format: 'srt', Language: 'en', HearingImpaired: false, DownloadCount: 12});
	expect(found[0].Id).toMatch(/^[A-Za-z0-9_-]+$/);

	await subs.downloadRemoteSubtitle('movie-1', found[0].Id);
	expect(calls[1]).toMatchObject({path: '/api/v2/subtitles/download', method: 'POST', body: {
		media_file_id: '5', subtitle_id: 'os-1', provider: 'opensubtitles', language: 'en', release_name: 'Get.a.Job.2016 – é', score: 0.9, hearing_impaired: false
	}});
	expect(forget).toHaveBeenCalled();
	await expect(subs.downloadRemoteSubtitle('movie-1', '%%%')).rejects.toThrow('Not a Silo subtitle result');
});
