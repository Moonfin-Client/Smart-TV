jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('../platform', () => ({isHosted: () => true, isWebOS: () => false, isVega: () => false}));
jest.mock('../utils/fetchTimeout', () => ({...jest.requireActual('../utils/fetchTimeout'), fetchWithTimeout: jest.fn()}));
jest.mock('../utils/networkLogSink', () => ({traceRequest: (url, options, send) => send()}));
jest.mock('./storage', () => ({getFromStorage: jest.fn()}));
jest.mock('./shellBridge', () => ({loadShellBridge: jest.fn().mockResolvedValue(null)}));

import {fetchWithTimeout} from '../utils/fetchTimeout';
import {classifyError, AUTH_FAILED, DNS_OR_NETWORK, MIXED_CONTENT} from '../utils/connectionErrors';
import {platformFetch} from './secureFetch';

// jsdom serves the test page from http://localhost, the hosted page is https.
const servePageOver = (protocol) => {
	delete window.location;
	window.location = {protocol, hostname: 'moonfin.io', href: `${protocol}//moonfin.io/tv/`};
};

describe('the hosted page', () => {
	const location = window.location;

	beforeEach(() => fetchWithTimeout.mockReset());

	afterAll(() => {
		window.location = location;
	});

	test("names the http address as the reason when the https page can't reach it", async () => {
		servePageOver('https:');
		fetchWithTimeout.mockRejectedValue(new TypeError('Failed to fetch'));

		const error = await platformFetch('http://192.168.1.20:8096/System/Info/Public').catch((e) => e);

		expect(classifyError(error)).toBe(MIXED_CONTENT);
	});

	test("calls an https server that's down unreachable, not blocked", async () => {
		servePageOver('https:');
		fetchWithTimeout.mockRejectedValue(new TypeError('Failed to fetch'));

		const error = await platformFetch('https://jellyfin.example.com/System/Info/Public').catch((e) => e);

		expect(classifyError(error)).toBe(DNS_OR_NETWORK);
	});

	test('leaves an http server alone when the page itself is http, as on a LAN copy', async () => {
		servePageOver('http:');
		fetchWithTimeout.mockRejectedValue(new TypeError('Failed to fetch'));

		const error = await platformFetch('http://192.168.1.20:8096/System/Info/Public').catch((e) => e);

		expect(classifyError(error)).toBe(DNS_OR_NETWORK);
	});

	test('passes a refused sign in through untouched', async () => {
		servePageOver('https:');
		const refused = Object.assign(new Error('Unauthorized'), {status: 401});
		fetchWithTimeout.mockRejectedValue(refused);

		const error = await platformFetch('http://192.168.1.20:8096/Users/AuthenticateByName').catch((e) => e);

		expect(error).toBe(refused);
		expect(classifyError(error)).toBe(AUTH_FAILED);
	});
});
