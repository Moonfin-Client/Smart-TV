import {redact, redactContext} from './logRedaction';

describe('redact', () => {
	// The endpoint is what says which call misbehaved, so only the host goes.
	it('takes the host out of a url and leaves the path', () => {
		expect(redact('-> GET https://media.example.com:8096/Items/487a/Images/Primary'))
			.toBe('-> GET https://[REDACTED]/Items/487a/Images/Primary');
	});

	it('covers websocket urls too', () => {
		expect(redact('socket opened wss://media.example.com/socket'))
			.toBe('socket opened wss://[REDACTED]/socket');
	});

	it('keeps the name of a credential and drops the value', () => {
		expect(redact('GET /Items?api_key=abc123def&Limit=20'))
			.toBe('GET /Items?api_key=[REDACTED]&Limit=20');
		expect(redact('Authorization: MediaBrowser Token="abc123"'))
			.toBe('Authorization: [REDACTED]');
	});

	// networkLogSink masks the query before the entry is built, and that masked value is
	// still a value, so it reads the same as everything else by the time it is written out.
	it('normalises a value the network sink already masked', () => {
		expect(redact('GET /Items?ApiKey=***&Limit=20'))
			.toBe('GET /Items?ApiKey=[REDACTED]&Limit=20');
	});

	// A camel cased name has no word boundary before the label, so the address itself is
	// what the bare address pass catches. The port it was reached on says nothing.
	it('drops addresses that a label points at', () => {
		expect(redact('host: media.example.com')).toBe('host: [REDACTED]');
		expect(redact('serverUrl=192.168.1.50:8096')).toBe('serverUrl=[REDACTED]:8096');
	});

	it('drops a host named in a lookup failure', () => {
		expect(redact("Failed host lookup: 'media.example.com'"))
			.toBe("Failed host lookup: '[REDACTED]'");
	});

	it('drops bare addresses', () => {
		expect(redact('connect failed to 10.0.0.42 after 3 tries'))
			.toBe('connect failed to [REDACTED] after 3 tries');
		expect(redact('bound to fe80::1c2d:3e4f:5a6b:7c8d ok'))
			.toBe('bound to [REDACTED] ok');
	});

	it('leaves an entry with nothing private in it alone', () => {
		const line = 'Subtitle: ass renderer started';
		expect(redact(line)).toBe(line);
	});

	// A timestamp is full of colons and dots without holding an address.
	it('leaves timestamps and versions alone', () => {
		expect(redact('2026-09-07T12:29:24.123Z Information')).toBe('2026-09-07T12:29:24.123Z Information');
		expect(redact('App Version 2.9.0')).toBe('App Version 2.9.0');
	});

	it('survives what is not a string', () => {
		expect(redact(null)).toBeNull();
		expect(redact(undefined)).toBeUndefined();
		expect(redact(42)).toBe(42);
		expect(redact('')).toBe('');
	});
});

describe('redactContext', () => {
	it('walks nested values and leaves the shape alone', () => {
		expect(redactContext({
			playMethod: 'DirectPlay',
			error: 'fetch failed for https://media.example.com/Videos/1/stream',
			streams: [{url: 'https://media.example.com/a', index: 3}],
			count: 7,
			enabled: true
		})).toEqual({
			playMethod: 'DirectPlay',
			error: 'fetch failed for https://[REDACTED]/Videos/1/stream',
			streams: [{url: 'https://[REDACTED]/a', index: 3}],
			count: 7,
			enabled: true
		});
	});

	it('leaves values that are not text or containers untouched', () => {
		expect(redactContext(null)).toBeNull();
		expect(redactContext(12)).toBe(12);
		expect(redactContext(false)).toBe(false);
	});

	it('stops rather than following a value that points at itself', () => {
		const loop = {name: 'top'};
		loop.self = loop;
		expect(() => redactContext(loop)).not.toThrow();
	});
});
