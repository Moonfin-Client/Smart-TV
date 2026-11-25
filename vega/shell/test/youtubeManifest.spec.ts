/* global globalThis */
import {readManifest} from '../src/youtubeManifest';

describe('readManifest', () => {
	afterEach(() => jest.restoreAllMocks());

	it('reads a manifest from YouTube', async () => {
		const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({status: 200, text: () => Promise.resolve('#EXTM3U')} as never);
		await expect(readManifest({id: 1, url: 'https://manifest.googlevideo.com/api/manifest/hls_variant/id/abc'})).resolves.toEqual({id: 1, status: 200, body: '#EXTM3U'});
		expect(fetchSpy).toHaveBeenCalledWith('https://manifest.googlevideo.com/api/manifest/hls_variant/id/abc');
	});

	it('refuses anything else without fetching it', async () => {
		const fetchSpy = jest.spyOn(globalThis, 'fetch');
		for (const url of ['https://rr3---sn.googlevideo.com/videoplayback', 'http://manifest.googlevideo.com/api', 'https://manifest.googlevideo.com.example.org/', 'https://192.168.1.20:8096/Items']) {
			await expect(readManifest({id: 2, url})).resolves.toEqual({id: 2, status: 0, body: ''});
		}
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('answers a failed read with status 0', async () => {
		jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
		await expect(readManifest({id: 3, url: 'https://manifest.googlevideo.com/x'})).resolves.toEqual({id: 3, status: 0, body: ''});
	});
});
