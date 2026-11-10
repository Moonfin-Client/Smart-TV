import {registerPlexServer} from '../utils/plexUrls';
import {getServerUrl} from './jellyfinApi';
import {fetchBoard, parseBoard, placeRun, postScore, recordDeviceRun} from './miniGamesApi';
import {platformFetch} from './secureFetch';
import {getFromStorage, saveToStorage} from './storage';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));
jest.mock('./storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));
jest.mock('./jellyfinApi', () => ({getServerUrl: jest.fn(), getApiKey: () => 'key'}));
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: (base) => Promise.resolve({base, headers: {Authorization: 'MediaBrowser Token="key"'}})
}));

const answer = (status, body) => ({ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))});
const run = (userName, score) => ({userName, score});

describe('After Hours scores', () => {
	beforeEach(() => {
		platformFetch.mockReset();
		getFromStorage.mockReset();
		saveToStorage.mockReset();
		getServerUrl.mockReturnValue('http://server');
	});

	test('reads a board from the plugin with the Moonbase headers', async () => {
		platformFetch.mockResolvedValueOnce(answer(200, [run('moviebuff', 18420), run('jamie', 15960)]));
		await expect(fetchBoard('buffer-run')).resolves.toEqual([run('moviebuff', 18420), run('jamie', 15960)]);
		const [url, init] = platformFetch.mock.calls[0];
		expect(url).toBe('http://server/Moonfin/MiniGames/buffer-run/Scores');
		expect(init.method).toBe('GET');
		expect(init.headers.Authorization).toBe('MediaBrowser Token="key"');
	});

	test('a Plex server keeps its scores on the Moonbase companion beside it', async () => {
		registerPlexServer('http://plex:32400', 'key');
		getServerUrl.mockReturnValueOnce('http://plex:32400');
		platformFetch.mockResolvedValueOnce(answer(200, []));
		await fetchBoard('buffer-run');
		expect(platformFetch.mock.calls[0][0]).toBe('http://plex:32500/Moonfin/MiniGames/buffer-run/Scores');
	});

	test('a server without the plugin is an error, so the arcade falls back to the device', async () => {
		platformFetch.mockResolvedValueOnce(answer(404, null));
		await expect(fetchBoard('buffer-run')).rejects.toThrow();
	});

	test('posts only the score and hands back the rank, or null when it missed the board', async () => {
		platformFetch.mockResolvedValueOnce(answer(200, {rank: 2})).mockResolvedValueOnce(answer(200, {rank: null}));
		await expect(postScore('case-stack', 412)).resolves.toBe(2);
		expect(JSON.parse(platformFetch.mock.calls[0][1].body)).toEqual({score: 412});
		await expect(postScore('case-stack', 3)).resolves.toBe(null);
	});

	test('drops rows that are not a name and a whole score', () => {
		expect(parseBoard([run('a', 1.5), run(null, 3), null, run('b', 7), run('c', 9)])).toEqual([run('b', 7), run('c', 9)]);
		expect(parseBoard({})).toEqual([]);
	});

	test('a device board keeps the best three people and a tie goes to the earlier run', () => {
		const board = [run('a', 300), run('b', 200), run('c', 100)];
		expect(placeRun(board, run('d', 200))).toEqual({list: [board[0], board[1], run('d', 200)], rank: 3});
		expect(placeRun(board, run('e', 400)).rank).toBe(1);
		expect(placeRun(board, run('f', 100))).toEqual({list: board, rank: null});
		expect(placeRun(undefined, run('g', 0))).toEqual({list: [run('g', 0)], rank: 1});
	});

	test('a device board keeps only each person\'s best run', () => {
		const board = [run('a', 300), run('b', 200), run('c', 100)];
		expect(placeRun(board, run('b', 250))).toEqual({list: [board[0], run('b', 250), board[2]], rank: 2});
		expect(placeRun(board, run('c', 500))).toEqual({list: [run('c', 500), board[0], board[1]], rank: 1});
		expect(placeRun(board, run('a', 150))).toEqual({list: board, rank: null});
		expect(placeRun(board, run('b', 200))).toEqual({list: board, rank: null});
	});

	test('a run that places is saved beside the other games', async () => {
		getFromStorage.mockResolvedValueOnce({'pixel-purge': [run('a', 10)]});
		const placed = await recordDeviceRun('cable-crawl', run('b', 50));
		expect(placed.rank).toBe(1);
		expect(saveToStorage).toHaveBeenCalledWith('afterHoursScores', {'pixel-purge': [run('a', 10)], 'cable-crawl': [run('b', 50)]});
	});
});
