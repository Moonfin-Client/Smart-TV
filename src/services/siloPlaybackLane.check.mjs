// Self-check that a Silo session tells the playback control lane when it starts, replans and stops:
//   node --conditions=browser src/services/siloPlaybackLane.check.mjs
// The cases come from the Enact app's siloPlayback Jest suite, run through scripts/jestLike.mjs.
import { stubUnloadable } from '../../scripts/stubUnloadable.mjs'
import { describe, expect, jest, run, test } from '../../scripts/jestLike.mjs'

stubUnloadable()
const { createSiloPlayback } = await import('./siloPlayback.js')
const { siloItemMediaSources } = await import('./siloMediaSources.js')
// One version of a title as its media source, as the item read would give it.
const siloVersionToMediaSource = (version, itemId) => siloItemMediaSources({ versions: [version] }, itemId)[0]

const BASE = 'http://silo:8090';

const version = {
	file_id: 5,
	container: 'mkv',
	duration: 4964,
	video_tracks: [{codec: 'h264', width: 1920, height: 1080}],
	audio_tracks: [{codec: 'ac3', channels: 6, language: 'eng'}, {codec: 'aac', channels: 2, language: 'fra'}],
	subtitle_tracks: [{codec: 'subrip', language: 'en', index: 2}]
};

describe('sessions', () => {
	const setup = (answers, extra = {}) => {
		const calls = [];
		const call = jest.fn(async (path, options = {}) => {
			calls.push({path, method: options.method || 'GET', body: options.body});
			const answer = answers[`${options.method || 'GET'} ${path}`];
			return typeof answer === 'function' ? answer(options) : answer;
		});
		const playback = createSiloPlayback({
			call,
			getBaseUrl: () => BASE,
			getUserId: () => 'p1',
			getAccessToken: () => 'tok',
			getDeviceInfo: () => ({appVersion: '3.0.0'}),
			platform: 'webos',
			getItem: async () => ({MediaSources: [siloVersionToMediaSource(version, 'movie-1')]}),
			wait: async () => {},
			...extra
		});
		return {playback, calls};
	};
	const capabilities = {state: 'available', allowed: true, protocol_versions: [3], installation_id: 'inst', features: []};
	const plan = (delivery, key) => ({
		outcome: 'playable',
		session_id: 's1',
		playback_plan: {delivery, plan_id: `plan-${key}`, plan_attempt_key: key, effective_media_file_id: 5, stream: {url: '/api/v2/stream/s1'}, timeline: {}}
	});

	test('the control lane follows a session from its start through a replan to its stop, and a preview gets none', async () => {
		const onSessionPlaying = jest.fn();
		const onSessionEnded = jest.fn();
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': plan('original_http', 'k1'),
			'POST /api/v2/playback/s1/replan': plan('server_remux_hls', 'k2'),
			'DELETE /api/v2/playback/s1': {outcome: 'stopped'}
		}, {onSessionPlaying, onSessionEnded});
		await playback.previewPlaybackInfo('movie-1', {});
		await playback.reportPlaybackStart({PlaySessionId: 's1'});
		expect(onSessionPlaying).not.toHaveBeenCalled();
		await playback.getPlaybackInfo('movie-1', {});
		expect(onSessionPlaying).not.toHaveBeenCalled();
		await playback.reportPlaybackStart({PlaySessionId: 's1'});
		const lane = onSessionPlaying.mock.calls[0][0];
		expect(lane).toMatchObject({sessionId: 's1', installationId: 'inst'});
		expect(lane.live()).toBe(true);
		await playback.getPlaybackInfo('movie-1', {EnableDirectPlay: false});
		expect(onSessionPlaying).toHaveBeenCalledTimes(2);
		onSessionEnded.mockClear();
		// The preview stopped its own session already.
		const deletes = () => calls.filter((c) => c.method === 'DELETE').length;
		const before = deletes();
		await playback.reportPlaybackStopped({PlaySessionId: 's1', PositionTicks: 1});
		expect(deletes()).toBe(before + 1);
		expect(onSessionEnded).toHaveBeenCalledWith('s1');
		expect(lane.live()).toBe(false);

		// An admin's terminate retires the next session: the player's stop sends Silo nothing more.
		await playback.getPlaybackInfo('movie-1', {});
		await playback.reportPlaybackStart({PlaySessionId: 's1'});
		const next = onSessionPlaying.mock.calls[onSessionPlaying.mock.calls.length - 1][0];
		next.retire();
		expect(next.live()).toBe(false);
		await playback.reportPlaybackStopped({PlaySessionId: 's1', PositionTicks: 1});
		expect(deletes()).toBe(before + 1);
	});

	test('a session Silo retired is let go of when the next plan for the title starts a new one', async () => {
		const onSessionEnded = jest.fn();
		const onSessionPlaying = jest.fn();
		let n = 0;
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': () => ({...plan('original_http', 'k1'), session_id: `s${++n}`}),
			'POST /api/v2/playback/s1/progress': () => { throw Object.assign(new Error('Not found'), {status: 404}); }
		}, {onSessionEnded, onSessionPlaying});
		await playback.getPlaybackInfo('movie-1', {});
		await playback.reportPlaybackProgress({PlaySessionId: 's1', PositionTicks: 1});
		expect(onSessionEnded).not.toHaveBeenCalled();
		await playback.getPlaybackInfo('movie-1', {});
		expect(onSessionEnded).toHaveBeenCalledWith('s1');
		// s1 is gone: stopping it sends Silo nothing. s2 is the one playing, so its start reaches the lane.
		await playback.reportPlaybackStopped({PlaySessionId: 's1', PositionTicks: 1});
		expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
		await playback.reportPlaybackStart({PlaySessionId: 's2'});
		expect(onSessionPlaying.mock.calls.map(([lane]) => lane.sessionId)).toEqual(['s2']);
	});
});

await run('siloPlaybackLane')
