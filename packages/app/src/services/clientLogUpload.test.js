import {acceptsReports, clientLogRequest} from './clientLogUpload';

const EMBY_HEADER = 'Emby Client="Moonfin for Tizen", Version="2.10.0", Token="t"';

describe('acceptsReports', () => {
	test('Jellyfin always has its own endpoint', () => {
		expect(acceptsReports('jellyfin', false)).toBe(true);
	});

	test('Emby needs the plugin to say it takes client logs', () => {
		expect(acceptsReports('emby', true)).toBe(true);
		expect(acceptsReports('emby', false)).toBe(false);
		expect(acceptsReports('emby', undefined)).toBe(false);
	});

	test('Plex and Silo need Moonbase to say it takes them', () => {
		expect(acceptsReports('plex', true)).toBe(true);
		expect(acceptsReports('plex', false)).toBe(false);
		expect(acceptsReports('silo', true)).toBe(true);
		expect(acceptsReports('silo', undefined)).toBe(false);
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

	test('sends a Plex report to Moonbase for Plex, the way the companion is reached', () => {
		const send = jest.fn();
		const moonbase = {base: 'http://plex:32500', headers: {'X-Plex-Token': 't'}, fetch: send};
		const request = clientLogRequest({serverUrl: 'http://plex:32400', accessToken: 't', serverType: 'plex', authHeader: 'MediaBrowser Client="Moonfin", Token="t"'}, 'moonfin-tizen-log', 'report', moonbase);

		expect(request).toEqual({
			url: 'http://plex:32500/Moonfin/ClientLog/Document',
			init: {
				method: 'POST',
				headers: {'Content-Type': 'text/plain; charset=utf-8', 'Authorization': 'MediaBrowser Client="Moonfin", Token="t"', 'X-Plex-Token': 't'},
				body: 'report'
			},
			send
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
