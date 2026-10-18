import {normalizeServerBaseUrl, quickConnectApprovalUrl} from './serverUrl';

describe('normalizeServerBaseUrl', () => {
	test('keeps an explicit scheme and drops the trailing slash', () => {
		expect(normalizeServerBaseUrl('http://192.168.1.10:8096/')).toBe('http://192.168.1.10:8096');
		expect(normalizeServerBaseUrl('HTTPS://Jelly.Example.COM')).toBe('https://jelly.example.com');
	});

	test('drops the default port for the scheme', () => {
		expect(normalizeServerBaseUrl('http://example.com:80')).toBe('http://example.com');
		expect(normalizeServerBaseUrl('https://example.com:443')).toBe('https://example.com');
		expect(normalizeServerBaseUrl('http://example.com:8096')).toBe('http://example.com:8096');
	});

	test('keeps a proxy path prefix', () => {
		expect(normalizeServerBaseUrl('https://example.com/jellyfin')).toBe('https://example.com/jellyfin');
	});

	test('drops the web client suffix people copy out of a browser', () => {
		expect(normalizeServerBaseUrl('https://example.com/web/index.html')).toBe('https://example.com');
		expect(normalizeServerBaseUrl('https://example.com/web')).toBe('https://example.com');
		expect(normalizeServerBaseUrl('https://example.com/jellyfin/web/index.html')).toBe('https://example.com/jellyfin');
	});

	test('an address typed without a scheme comes back without one', () => {
		expect(normalizeServerBaseUrl('192.168.1.10:8096')).toBe('192.168.1.10:8096');
		expect(normalizeServerBaseUrl('example.com/jellyfin/')).toBe('example.com/jellyfin');
	});

	test('brackets around an ipv6 host survive', () => {
		expect(normalizeServerBaseUrl('http://[fe80::1]:8096')).toBe('http://[fe80::1]:8096');
	});

	test('empty input gives an empty string', () => {
		expect(normalizeServerBaseUrl('')).toBe('');
		expect(normalizeServerBaseUrl('   ')).toBe('');
		expect(normalizeServerBaseUrl(null)).toBe('');
	});
});

describe('quickConnectApprovalUrl', () => {
	test('points at the web client with the code filled in', () => {
		expect(quickConnectApprovalUrl('https://media.example.com', '123456'))
			.toBe('https://media.example.com/web/#/quickconnect?code=123456');
	});

	test('drops the spaces the screen puts in the code', () => {
		expect(quickConnectApprovalUrl('https://media.example.com', '123 456'))
			.toBe('https://media.example.com/web/#/quickconnect?code=123456');
	});

	test('keeps a reverse proxy path prefix', () => {
		expect(quickConnectApprovalUrl('https://example.com/jellyfin/', '123456'))
			.toBe('https://example.com/jellyfin/web/#/quickconnect?code=123456');
	});

	test('does not double a web client path already on the address', () => {
		expect(quickConnectApprovalUrl('https://media.example.com/web/index.html', '123456'))
			.toBe('https://media.example.com/web/#/quickconnect?code=123456');
	});

	test('keeps a non default port', () => {
		expect(quickConnectApprovalUrl('http://192.168.1.10:8096', '123456'))
			.toBe('http://192.168.1.10:8096/web/#/quickconnect?code=123456');
	});

	test('is null without an address or a code', () => {
		expect(quickConnectApprovalUrl('', '123456')).toBeNull();
		expect(quickConnectApprovalUrl('  ', '123456')).toBeNull();
		expect(quickConnectApprovalUrl(null, '123456')).toBeNull();
		expect(quickConnectApprovalUrl('https://media.example.com', '')).toBeNull();
		expect(quickConnectApprovalUrl('https://media.example.com', null)).toBeNull();
	});
});
