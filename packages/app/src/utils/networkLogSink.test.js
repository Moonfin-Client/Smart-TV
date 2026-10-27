import {setNetworkLogSink, redactUrl, traceRequest} from './networkLogSink';

const BASE = 'https://tv.example/Users/1/Views';

let lines;
const attach = () => {
	lines = [];
	setNetworkLogSink((message, level) => lines.push({message, level}));
};

afterEach(() => setNetworkLogSink(null));

describe('redactUrl', () => {
	it('hides the value of a credential parameter and keeps the rest', () => {
		expect(redactUrl(`${BASE}?ApiKey=secret123&Limit=20`))
			.toBe(`${BASE}?ApiKey=***&Limit=20`);
	});

	it('matches the parameter name whatever its casing', () => {
		expect(redactUrl(`${BASE}?apikey=secret`)).toBe(`${BASE}?apikey=***`);
		expect(redactUrl(`${BASE}?API_KEY=secret`)).toBe(`${BASE}?API_KEY=***`);
		expect(redactUrl(`${BASE}?api_key=secret`)).toBe(`${BASE}?api_key=***`);
	});

	it('hides a Plex token', () => {
		expect(redactUrl(`${BASE}?X-Plex-Product=Moonfin&X-Plex-Token=secret`)).toBe(`${BASE}?X-Plex-Product=Moonfin&X-Plex-Token=***`);
	});

	it('hides every credential when more than one is present', () => {
		expect(redactUrl(`${BASE}?ApiKey=a&x=1&token=b`))
			.toBe(`${BASE}?ApiKey=***&x=1&token=***`);
	});

	it('leaves a url without credentials alone', () => {
		expect(redactUrl(BASE)).toBe(BASE);
		expect(redactUrl(`${BASE}?Limit=20&Recursive=true`)).toBe(`${BASE}?Limit=20&Recursive=true`);
	});

	it('survives odd input', () => {
		expect(redactUrl('')).toBe('');
		expect(redactUrl(null)).toBe('');
		expect(redactUrl(`${BASE}?flag`)).toBe(`${BASE}?flag`);
	});
});

describe('the detached sink', () => {
	beforeEach(() => setNetworkLogSink(null));

	it('still runs the request and passes its value back', async () => {
		await expect(traceRequest('GET', BASE, () => Promise.resolve('body'))).resolves.toBe('body');
	});

	it('still rethrows a failure', async () => {
		const boom = new Error('down');
		await expect(traceRequest('GET', BASE, () => Promise.reject(boom))).rejects.toBe(boom);
	});

	it('ignores anything that is not a function', () => {
		setNetworkLogSink('not a function');
		expect(() => traceRequest('GET', BASE, () => Promise.resolve({status: 200}))).not.toThrow();
	});
});

describe('traceRequest', () => {
	beforeEach(attach);

	it('logs the request and the response', async () => {
		await traceRequest('GET', BASE, () => Promise.resolve({status: 200}));
		expect(lines).toHaveLength(2);
		expect(lines[0].message).toBe(`-> GET ${BASE}`);
		expect(lines[1].message).toMatch(new RegExp(`^<- 200 GET ${BASE} \\(\\d+ms\\)$`));
		expect(lines[1].level).toBe('debug');
	});

	it('logs a failure at error level and rethrows', async () => {
		const boom = new Error('Network down');
		await expect(traceRequest('POST', BASE, () => Promise.reject(boom))).rejects.toBe(boom);
		expect(lines[1].message).toMatch(/^xx POST .* \(\d+ms\) Network down$/);
		expect(lines[1].level).toBe('error');
	});

	it('redacts the credential in both lines', async () => {
		await traceRequest('GET', `${BASE}?ApiKey=secret123`, () => Promise.resolve({status: 200}));
		expect(lines.map((l) => l.message).join('\n')).not.toContain('secret123');
		expect(lines).toHaveLength(2);
	});

	it('passes the resolved response straight back', async () => {
		const response = {status: 204};
		await expect(traceRequest('GET', BASE, () => Promise.resolve(response))).resolves.toBe(response);
	});

	it('says ok when the call resolves with no status', async () => {
		await traceRequest('GET', BASE, () => Promise.resolve(undefined));
		expect(lines[1].message).toContain('<- ok GET');
	});

	it('ignores its own report upload, so sending one does not grow the log', async () => {
		await traceRequest('POST', 'https://tv.example/ClientLog/Document?name=moonfin', () => Promise.resolve({status: 200}));
		expect(lines).toHaveLength(0);
	});
});
