import {fetchWithTimeout} from './fetchTimeout';

describe('fetchWithTimeout', () => {
	let pending;

	beforeEach(() => {
		pending = null;
		global.fetch = jest.fn((url, {signal}) => new Promise((resolve, reject) => {
			pending = {resolve};
			signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})));
		}));
	});

	test('is cancelled by the caller\'s signal', async () => {
		const caller = new AbortController();
		const request = fetchWithTimeout('http://silo/x', {signal: caller.signal}, 30000);
		caller.abort();
		await expect(request).rejects.toMatchObject({name: 'AbortError'});
	});

	test('never sends a request whose caller has already given up', async () => {
		const caller = new AbortController();
		caller.abort();
		await expect(fetchWithTimeout('http://silo/x', {signal: caller.signal}, 30000)).rejects.toMatchObject({name: 'AbortError'});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	test('answers when nothing cancels it', async () => {
		const request = fetchWithTimeout('http://silo/x', {}, 30000);
		pending.resolve({ok: true});
		await expect(request).resolves.toEqual({ok: true});
	});
});
