import * as playback from './playback';
import * as jellyfinApi from './jellyfinApi';

jest.mock('./jellyfinApi', () => {
	const server = {getPlaybackInfo: jest.fn(), reportPlaybackProgress: jest.fn(), reportPlaybackStopped: jest.fn(), closeLiveStream: jest.fn()};
	return {
		api: server,
		createApiForServer: () => server,
		getServerType: () => 'silo',
		getServerUrl: () => 'http://silo:8090',
		getApiKey: () => 'key',
		getDeviceId: () => 'device',
		getTokenParam: () => 'ApiKey'
	};
});
jest.mock('./deviceProfile', () => ({
	getDeviceProfile: async () => ({}),
	getDeviceCapabilities: async () => ({})
}));
jest.mock('./video', () => ({
	getPlayMethod: () => 'DirectPlay',
	getMimeType: () => 'video/x-matroska',
	isAudioStreamPlayable: () => true,
	canRenderEmbeddedPgsInBand: () => false,
	rendersSubtitleInHost: () => false
}));
jest.mock('./storage', () => ({getFromStorage: async () => ({})}));
jest.mock('./serverLogger', () => ({serverLogger: {playback: jest.fn()}}));
jest.mock('./systemVolume', () => ({getVolumeState: jest.fn(), lastVolumeState: () => null}));
jest.mock('../platform', () => ({isTizen: () => false, isVega: () => false, isXbox: () => false}));

const {api} = jellyfinApi;

const ended = (itemId) => Object.assign(new Error('Playback was ended on the Silo server.'), {siloRefused: true, reason: 'playback_session_ended', itemId});
const plays = (sessionId) => ({
	PlaySessionId: sessionId,
	MediaSources: [{Id: 'file-1', SupportsDirectPlay: true, Container: 'mkv', MediaStreams: [], SiloStreamUrl: 'http://silo:8090/stream'}]
});

let heard;
let unsubscribe;

beforeEach(async () => {
	await playback.reportStop(0);
	playback.releaseEndedOnServer();
	jest.clearAllMocks();
	api.getPlaybackInfo.mockResolvedValue(plays('s1'));
	api.reportPlaybackProgress.mockResolvedValue(null);
	api.reportPlaybackStopped.mockResolvedValue(null);
	heard = [];
	unsubscribe = playback.onEndedOnServer((itemId) => heard.push(itemId));
});

afterEach(() => unsubscribe());

describe('an admin ending a Silo session', () => {
	test('a progress refusal for the playing session tells the player, and the item is held until it closes', async () => {
		await playback.getPlaybackInfo('movie-1');
		api.reportPlaybackProgress.mockRejectedValueOnce(ended('movie-1'));
		await playback.reportProgress(600000000);
		expect(heard).toEqual(['movie-1']);

		// A reopen, fallback or Next onto it starts nothing, and tells the player again (it acts on the first).
		api.getPlaybackInfo.mockClear();
		await expect(playback.getPlaybackInfo('movie-1')).rejects.toMatchObject({reason: 'playback_session_ended'});
		expect(api.getPlaybackInfo).not.toHaveBeenCalled();
		expect(heard).toEqual(['movie-1', 'movie-1']);

		// Another title plays.
		await playback.getPlaybackInfo('movie-2');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(1);

		playback.releaseEndedOnServer();
		await playback.getPlaybackInfo('movie-1');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(2);
	});

	test('a refusal heard by a report the viewer already stopped closes and holds nothing', async () => {
		await playback.getPlaybackInfo('movie-1');
		let refuse;
		api.reportPlaybackProgress.mockReturnValueOnce(new Promise((resolve, reject) => {
			refuse = () => reject(ended('movie-1'));
		}));
		const report = playback.reportProgress(600000000);
		await playback.reportStop(600000000);
		refuse();
		await report;
		expect(heard).toEqual([]);
		await playback.getPlaybackInfo('movie-1');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(2);
	});

	test('a refusal heard by a report sent before a replan still counts', async () => {
		await playback.getPlaybackInfo('movie-1');
		let refuse;
		api.reportPlaybackProgress.mockReturnValueOnce(new Promise((resolve, reject) => {
			refuse = () => reject(ended('movie-1'));
		}));
		const report = playback.reportProgress(600000000);
		// Silo replans the same session, under the same id.
		await playback.reanchorAt(900000000);
		refuse();
		await report;
		expect(heard).toEqual(['movie-1']);
	});

	test('a replan refusal tells the player and holds the item', async () => {
		await playback.getPlaybackInfo('movie-1');
		api.getPlaybackInfo.mockRejectedValueOnce(ended('movie-1'));
		await expect(playback.reanchorAt(900000000)).rejects.toMatchObject({reason: 'playback_session_ended'});
		expect(heard).toEqual(['movie-1']);
		api.getPlaybackInfo.mockClear();
		await expect(playback.getPlaybackInfo('movie-1')).rejects.toMatchObject({reason: 'playback_session_ended'});
		expect(api.getPlaybackInfo).not.toHaveBeenCalled();
	});

	test('a start right after a stop waits for it, and is turned away when the stop found the admin\'s end', async () => {
		await playback.getPlaybackInfo('movie-1');
		let answerStop;
		api.reportPlaybackStopped.mockReturnValueOnce(new Promise((resolve) => {
			answerStop = () => resolve({endedOnServer: true});
		}));
		// A quality change or a step down: the stop isn't waited for before the start.
		playback.reportStop(600000000);
		api.getPlaybackInfo.mockClear();
		const start = playback.getPlaybackInfo('movie-1').catch((err) => err);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(api.getPlaybackInfo).not.toHaveBeenCalled();
		answerStop();
		expect(await start).toMatchObject({reason: 'playback_session_ended'});
		expect(api.getPlaybackInfo).not.toHaveBeenCalled();
		expect(heard).toEqual(['movie-1']);
	});

	test('a start already on its way when the stop finds the admin\'s end is stopped again and turned away', async () => {
		await playback.getPlaybackInfo('movie-1');
		let answerStart;
		api.getPlaybackInfo.mockReturnValueOnce(new Promise((resolve) => {
			answerStart = () => resolve(plays('s2'));
		}));
		// Like a start that gave up waiting for a slow stop.
		const start = playback.getPlaybackInfo('movie-1').catch((err) => err);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(2);
		api.reportPlaybackStopped.mockResolvedValueOnce({endedOnServer: true});
		await playback.reportStop(600000000);
		expect(heard).toEqual([]);
		answerStart();
		expect(await start).toMatchObject({reason: 'playback_session_ended'});
		expect(heard).toEqual(['movie-1']);
		expect(api.reportPlaybackStopped).toHaveBeenLastCalledWith(expect.objectContaining({PlaySessionId: 's2'}));
		expect(playback.getCurrentSession()).toBeNull();
	});

	test('a refusal heard outside the service after its player closed holds nothing', async () => {
		await playback.getPlaybackInfo('movie-1');
		const generation = playback.endedOnServerGeneration();
		playback.releaseEndedOnServer();
		playback.heardEndedOnServer(ended('movie-1'), generation);
		expect(heard).toEqual([]);
		api.getPlaybackInfo.mockClear();
		await playback.getPlaybackInfo('movie-1');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(1);
	});

	test('a stop that failed doesn\'t fail the start after it', async () => {
		await playback.getPlaybackInfo('movie-1');
		api.reportPlaybackStopped.mockRejectedValueOnce(Object.assign(new Error('Conflict'), {status: 409, code: 'installation_changed'}));
		playback.reportStop(600000000);
		api.getPlaybackInfo.mockClear();
		await playback.getPlaybackInfo('movie-1');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(1);
	});

	test('an end heard after the player closed holds nothing', async () => {
		await playback.getPlaybackInfo('movie-1');
		let answerStop;
		api.reportPlaybackStopped.mockReturnValueOnce(new Promise((resolve) => {
			answerStop = () => resolve({endedOnServer: true});
		}));
		const stop = playback.reportStop(600000000);
		playback.releaseEndedOnServer();
		answerStop();
		await stop;
		api.getPlaybackInfo.mockClear();
		await playback.getPlaybackInfo('movie-1');
		expect(api.getPlaybackInfo).toHaveBeenCalledTimes(1);
	});

	test('a hold lasts a minute at most, so a close that never finishes holds nothing for good', async () => {
		const now = jest.spyOn(Date, 'now');
		try {
			now.mockReturnValue(1000000);
			await playback.getPlaybackInfo('movie-1');
			api.reportPlaybackProgress.mockRejectedValueOnce(ended('movie-1'));
			await playback.reportProgress(600000000);
			now.mockReturnValue(1000000 + 61000);
			api.getPlaybackInfo.mockClear();
			await playback.getPlaybackInfo('movie-1');
			expect(api.getPlaybackInfo).toHaveBeenCalledTimes(1);
		} finally {
			now.mockRestore();
		}
	});

	test('other progress failures are left alone', async () => {
		await playback.getPlaybackInfo('movie-1');
		api.reportPlaybackProgress.mockRejectedValueOnce(Object.assign(new Error('Gone'), {status: 410, code: 'client_upgrade_required'}));
		await playback.reportProgress(600000000);
		expect(heard).toEqual([]);
	});
});
