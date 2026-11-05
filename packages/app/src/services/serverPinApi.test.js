import {
	PIN_LOCKED, PIN_NONE, PIN_UNAVAILABLE, PIN_VALID, PIN_WRONG,
	getServerPinStatus, removeServerPin, removeServerPinFor, setServerPin, verifyServerPin
} from './serverPinApi';
import {platformFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));
const mockSilo = {profileHasPin: jest.fn(), verifyProfilePin: jest.fn(), setProfilePin: jest.fn()};
jest.mock('./jellyfinApi', () => ({
	getAuthHeaderFor: (type, token) => `MediaBrowser Token="${token}"`,
	createApiForServer: () => mockSilo
}));

const account = {serverUrl: 'http://server', accessToken: 'token', serverType: 'jellyfin'};

const reply = (status, body, retryAfter) => ({
	status,
	text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
	headers: {get: (name) => (name === 'retry-after' ? retryAfter || null : null)}
});

beforeEach(() => platformFetch.mockReset());

describe('getServerPinStatus', () => {
	it('reads whether the account has a PIN', async () => {
		platformFetch.mockResolvedValueOnce(reply(200, {enabled: true}));
		await expect(getServerPinStatus(account)).resolves.toBe(true);
		const [url, options] = platformFetch.mock.calls[0];
		expect(url).toBe('http://server/Moonfin/Pin');
		expect(options.headers.Authorization).toBe('MediaBrowser Token="token"');
	});

	it("can't say without the plugin or without an answer", async () => {
		platformFetch.mockResolvedValueOnce(reply(404, {title: 'Not Found'}));
		await expect(getServerPinStatus(account)).resolves.toBeNull();
		platformFetch.mockRejectedValueOnce(new Error('offline'));
		await expect(getServerPinStatus(account)).resolves.toBeNull();
	});
});

describe('verifyServerPin', () => {
	it('tells a right PIN from a wrong one', async () => {
		platformFetch.mockResolvedValueOnce(reply(200, {valid: true}));
		await expect(verifyServerPin(account, '1234')).resolves.toEqual({result: PIN_VALID});
		expect(JSON.parse(platformFetch.mock.calls[0][1].body)).toEqual({pin: '1234'});
		platformFetch.mockResolvedValueOnce(reply(200, {valid: false}));
		await expect(verifyServerPin(account, '0000')).resolves.toEqual({result: PIN_WRONG});
	});

	it("only takes the plugin's own 404 as no PIN", async () => {
		platformFetch.mockResolvedValueOnce(reply(404, {error: 'No PIN is set'}));
		await expect(verifyServerPin(account, '1234')).resolves.toEqual({result: PIN_NONE});
		platformFetch.mockResolvedValueOnce(reply(404, {title: 'Not Found'}));
		await expect(verifyServerPin(account, '1234')).resolves.toEqual({result: PIN_UNAVAILABLE});
	});

	it('waits as long as the server says after too many guesses', async () => {
		platformFetch.mockResolvedValueOnce(reply(429, {error: 'Too many attempts', retryAfterSeconds: 90}));
		await expect(verifyServerPin(account, '0000')).resolves.toEqual({result: PIN_LOCKED, wait: 90000});
		platformFetch.mockResolvedValueOnce(reply(429, undefined, '45'));
		await expect(verifyServerPin(account, '0000')).resolves.toEqual({result: PIN_LOCKED, wait: 45000});
	});
});

describe('setServerPin and removeServerPin', () => {
	it('sends the current PIN when there is one', async () => {
		platformFetch.mockResolvedValueOnce(reply(200, {enabled: true}));
		await expect(setServerPin(account, '9999', '1234')).resolves.toEqual({result: PIN_VALID});
		const [, options] = platformFetch.mock.calls[0];
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body)).toEqual({pin: '9999', currentPin: '1234'});
	});

	it("reads a wrong current PIN only from the plugin's own answer", async () => {
		platformFetch.mockResolvedValueOnce(reply(403, {error: 'The current PIN is wrong'}));
		await expect(removeServerPin(account, '0000')).resolves.toEqual({result: PIN_WRONG});
		platformFetch.mockResolvedValueOnce(reply(403, {error: 'Forbidden'}));
		await expect(removeServerPin(account, '0000')).resolves.toEqual({result: PIN_UNAVAILABLE});
		expect(platformFetch.mock.calls[0][1].method).toBe('DELETE');
	});
});

describe('removeServerPinFor', () => {
	it("clears another account's PIN by its id", async () => {
		platformFetch.mockResolvedValueOnce(reply(200, {enabled: false}));
		await expect(removeServerPinFor(account, 'u1')).resolves.toEqual({result: PIN_VALID});
		const [url, options] = platformFetch.mock.calls[0];
		expect(url).toBe('http://server/Moonfin/Users/u1/Pin');
		expect(options.method).toBe('DELETE');
	});

	it('takes any other answer, or none at all, as unavailable', async () => {
		platformFetch.mockResolvedValueOnce(reply(403, {error: 'Forbidden'}));
		await expect(removeServerPinFor(account, 'u1')).resolves.toEqual({result: PIN_UNAVAILABLE});
		platformFetch.mockResolvedValueOnce(reply(404, {error: 'No PIN is set'}));
		await expect(removeServerPinFor(account, 'u1')).resolves.toEqual({result: PIN_UNAVAILABLE});
		platformFetch.mockRejectedValueOnce(new Error('offline'));
		await expect(removeServerPinFor(account, 'u1')).resolves.toEqual({result: PIN_UNAVAILABLE});
	});
});

describe('on Silo', () => {
	const silo = {serverUrl: 'http://silo', accessToken: 'token', serverType: 'silo', userId: 'p2'};

	it('reads and checks the profile\'s own PIN, without the plugin', async () => {
		mockSilo.profileHasPin.mockResolvedValueOnce(true);
		await expect(getServerPinStatus(silo)).resolves.toBe(true);
		expect(mockSilo.profileHasPin).toHaveBeenCalledWith('p2');
		mockSilo.verifyProfilePin.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		await expect(verifyServerPin(silo, '4321')).resolves.toEqual({result: PIN_VALID});
		await expect(verifyServerPin(silo, '0000')).resolves.toEqual({result: PIN_WRONG});
		expect(mockSilo.verifyProfilePin).toHaveBeenCalledWith('p2', '4321');
		expect(platformFetch).not.toHaveBeenCalled();
	});

	it('waits out Silo\'s rate limit', async () => {
		mockSilo.verifyProfilePin.mockRejectedValueOnce(Object.assign(new Error('slow down'), {status: 429}));
		await expect(verifyServerPin(silo, '1')).resolves.toMatchObject({result: PIN_LOCKED});
	});

	it('sets and removes the profile\'s PIN, checking the one in place first', async () => {
		mockSilo.setProfilePin.mockResolvedValue(null);
		mockSilo.verifyProfilePin.mockResolvedValueOnce(false);
		await expect(setServerPin(silo, '1111', '9999')).resolves.toEqual({result: PIN_WRONG});
		expect(mockSilo.setProfilePin).not.toHaveBeenCalled();
		mockSilo.verifyProfilePin.mockResolvedValueOnce(true);
		await expect(setServerPin(silo, '1111', '2222')).resolves.toEqual({result: PIN_VALID});
		expect(mockSilo.setProfilePin).toHaveBeenLastCalledWith('p2', '1111');
		await expect(removeServerPinFor(silo, 'kid')).resolves.toEqual({result: PIN_VALID});
		expect(mockSilo.setProfilePin).toHaveBeenLastCalledWith('kid', null);
	});
});
