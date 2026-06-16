import {fetchWithTimeout} from './fetchTimeout';

describe('fetchWithTimeout', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		delete global.fetch;
	});

	test('resolves with the response when fetch wins', async () => {
		const response = {ok: true};
		global.fetch = jest.fn(() => Promise.resolve(response));
		const result = await fetchWithTimeout('http://x', {}, 5000);
		expect(result).toBe(response);
	});

	test('clears the timer when fetch settles', async () => {
		global.fetch = jest.fn(() => Promise.resolve({ok: true}));
		await fetchWithTimeout('http://x', {}, 5000);
		expect(jest.getTimerCount()).toBe(0);
	});

	test('rejects with AbortError at timeout even if fetch never settles', async () => {
		global.fetch = jest.fn(() => new Promise(() => {}));
		const promise = fetchWithTimeout('http://x', {}, 5000);
		jest.advanceTimersByTime(5001);
		await expect(promise).rejects.toMatchObject({name: 'AbortError'});
	});

	test('passes an abort signal to fetch', async () => {
		global.fetch = jest.fn(() => Promise.resolve({ok: true}));
		await fetchWithTimeout('http://x', {method: 'POST'}, 5000);
		const options = global.fetch.mock.calls[0][1];
		expect(options.method).toBe('POST');
		expect(options.signal).toBeDefined();
	});

	test('aborts the controller at timeout', async () => {
		let receivedSignal = null;
		global.fetch = jest.fn((url, options) => {
			receivedSignal = options.signal;
			return new Promise(() => {});
		});
		const promise = fetchWithTimeout('http://x', {}, 5000);
		jest.advanceTimersByTime(5001);
		await expect(promise).rejects.toMatchObject({name: 'AbortError'});
		expect(receivedSignal.aborted).toBe(true);
	});

	test('propagates fetch rejection', async () => {
		const netErr = new Error('network down');
		global.fetch = jest.fn(() => Promise.reject(netErr));
		await expect(fetchWithTimeout('http://x', {}, 5000)).rejects.toBe(netErr);
		expect(jest.getTimerCount()).toBe(0);
	});
});
