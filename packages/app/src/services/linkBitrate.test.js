import {linkBitrate} from './linkBitrate';

describe('the link bitrate', () => {
	let clock;
	let server;
	let servers = 0;

	// A download that hands over its bytes in pieces, each a set time after the last
	const download = (pieces) => {
		const left = [...pieces];
		return {
			ok: true,
			body: {
				getReader: () => ({
					read: async () => {
						const piece = left.shift();
						if (!piece) return {done: true};
						clock += piece.afterMs;
						return {done: false, value: {byteLength: piece.bytes}};
					}
				})
			}
		};
	};

	// A megabyte at 7.2 Mbit/s once the first piece is in
	const slow = () => download([{bytes: 100000, afterMs: 300}, {bytes: 450000, afterMs: 500}, {bytes: 450000, afterMs: 500}]);

	// What was measured is kept by server, so each test has one of its own
	beforeEach(() => {
		server = {serverUrl: `http://nas-${++servers}:8096/`, serverType: 'jellyfin', authHeader: 'MediaBrowser Token="abc"'};
		clock = 10000;
		jest.spyOn(window.performance, 'now').mockImplementation(() => clock);
		global.fetch = jest.fn();
	});

	afterEach(() => {
		delete global.fetch;
	});

	test('is what the server test measured, less some headroom', async () => {
		global.fetch.mockResolvedValueOnce(slow());

		await expect(linkBitrate(server)).resolves.toBe(5040000);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch.mock.calls[0][0]).toBe(`http://nas-${servers}:8096/Playback/BitrateTest?Size=1000000`);
		expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe(server.authHeader);
	});

	test('on Plex is timed off the start of a library file, read no further than the test needs', async () => {
		const file = 'http://plex:32400/library/parts/5/1/file.mkv?X-Plex-Token=t';
		const plex = {serverUrl: `http://plex-${servers}:32400`, serverType: 'plex', testFileUrl: () => Promise.resolve(file)};
		const response = download([{bytes: 100000, afterMs: 300}, {bytes: 500000, afterMs: 500}, {bytes: 500000, afterMs: 500}, {bytes: 500000, afterMs: 500}]);
		const reader = response.body.getReader();
		const read = jest.fn(reader.read);
		response.body.getReader = () => ({read});
		global.fetch.mockResolvedValueOnce(response);

		await expect(linkBitrate(plex)).resolves.toBe(5600000);

		expect(global.fetch.mock.calls[0][0]).toBe(file);
		expect(global.fetch.mock.calls[0][1].headers).toEqual({});
		expect(read).toHaveBeenCalledTimes(3);
	});

	test('is read off the download once it has got up to speed', async () => {
		global.fetch.mockResolvedValueOnce(download([
			{bytes: 100000, afterMs: 300},
			{bytes: 250000, afterMs: 1000},
			{bytes: 100000, afterMs: 200},
			{bytes: 650000, afterMs: 650}
		]));

		await expect(linkBitrate(server)).resolves.toBe(5600000);
	});

	test('is measured again with more data when the first test was over too soon', async () => {
		global.fetch
			.mockResolvedValueOnce(download([{bytes: 100000, afterMs: 20}, {bytes: 900000, afterMs: 90}]))
			.mockResolvedValueOnce(download([{bytes: 100000, afterMs: 20}, {bytes: 3900000, afterMs: 390}]));

		await expect(linkBitrate(server)).resolves.toBe(56000000);

		expect(global.fetch.mock.calls[1][0]).toMatch(/Size=4000000$/);
	});

	test('is kept for a while, and shared by callers that ask at once', async () => {
		global.fetch.mockResolvedValueOnce(slow());

		const [first, second] = await Promise.all([linkBitrate(server), linkBitrate(server)]);
		await expect(linkBitrate(server)).resolves.toBe(first);

		expect(second).toBe(first);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	test('isnt measured while something plays, when only the last answer is given', async () => {
		await expect(linkBitrate(server, false)).resolves.toBeNull();
		expect(global.fetch).not.toHaveBeenCalled();

		global.fetch.mockResolvedValueOnce(slow());
		await linkBitrate(server);
		jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60 * 1000);

		await expect(linkBitrate(server, false)).resolves.toBe(5040000);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	test('never goes under a bitrate a picture can still be made at', async () => {
		global.fetch.mockResolvedValueOnce(download([{bytes: 100000, afterMs: 300}, {bytes: 900000, afterMs: 20000}]));

		await expect(linkBitrate(server)).resolves.toBe(1500000);
	});

	test('is unknown when the server has no test or the request fails, and is asked for again next time', async () => {
		global.fetch.mockResolvedValueOnce({ok: false, status: 404}).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(slow());

		await expect(linkBitrate(server)).resolves.toBeNull();
		await expect(linkBitrate(server)).resolves.toBeNull();
		await expect(linkBitrate(server)).resolves.toBe(5040000);
	});
});
