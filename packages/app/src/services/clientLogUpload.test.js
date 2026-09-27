import {acceptsReports, clientLogRequest} from './clientLogUpload';

const EMBY_HEADER = 'Emby Client="Moonfin for Tizen", Version="2.9.0", Token="t"';

describe('acceptsReports', () => {
	test('Jellyfin always has its own endpoint', () => {
		expect(acceptsReports('jellyfin', false)).toBe(true);
	});

	test('Emby needs the plugin to say it takes client logs', () => {
		expect(acceptsReports('emby', true)).toBe(true);
		expect(acceptsReports('emby', false)).toBe(false);
		expect(acceptsReports('emby', undefined)).toBe(false);
	});
});

describe('clientLogRequest', () => {
	test('sends a Jellyfin report to its client log endpoint', () => {
		const {url, init} = clientLogRequest({serverUrl: 'https://server', accessToken: 't', serverType: 'jellyfin'}, 'moonfin-tizen-log', 'report');

		expect(url).toBe('https://server/ClientLog/Document?documentType=Log&name=moonfin-tizen-log');
		expect(init).toEqual({
			method: 'POST',
			headers: {'Content-Type': 'text/plain', 'Authorization': 'MediaBrowser Token="t"'},
			body: 'report'
		});
	});

	test('sends an Emby report to the Moonfin plugin with the full Emby authorization', () => {
		const {url, init} = clientLogRequest({serverUrl: 'https://server', accessToken: 't', serverType: 'emby', authHeader: EMBY_HEADER}, 'moonfin-tizen-log', 'report');

		expect(url).toBe('https://server/Moonfin/ClientLog/Document');
		expect(init).toEqual({
			method: 'POST',
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Authorization': EMBY_HEADER,
				'X-Emby-Authorization': EMBY_HEADER
			},
			body: 'report'
		});
	});
});
