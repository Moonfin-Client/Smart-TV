import {createSiloPlayback, siloCapabilitiesFromDeviceProfile, siloPlanToMediaSource, siloPlaybackContext, siloSubtitleOrder, siloTraitsFor} from './siloPlayback';
import {siloVersionToMediaSource} from './siloMediaSources';

const BASE = 'http://silo:8090';

const version = {
	file_id: 5,
	container: 'mkv',
	duration: 4964,
	video_tracks: [{codec: 'h264', width: 1920, height: 1080}],
	audio_tracks: [{codec: 'ac3', channels: 6, language: 'eng'}, {codec: 'aac', channels: 2, language: 'fra'}],
	subtitle_tracks: [{codec: 'subrip', language: 'en', index: 2}]
};

describe('device profile', () => {
	test('what the TV direct plays and transcodes to becomes Silo capabilities', () => {
		const caps = siloCapabilitiesFromDeviceProfile({
			DirectPlayProfiles: [{Type: 'Video', Container: 'mp4,mkv', VideoCodec: 'h264,hevc,vp9', AudioCodec: 'aac,ac3'}],
			TranscodingProfiles: [{Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac'}],
			CodecProfiles: [
				{Type: 'Video', Codec: 'vp9', Conditions: [{Condition: 'Equals', Property: 'VideoProfile', Value: 'none'}]},
				{Type: 'Video', Codec: 'hevc', Conditions: [{Condition: 'NotEquals', Property: 'VideoRangeType', Value: 'DOVI|DOVIWithEL'}]},
				{Type: 'Video', Conditions: [{Condition: 'LessThanEqual', Property: 'Width', Value: '3840'}]}
			]
		});
		expect(caps.clientCapabilities).toMatchObject({
			codecs_video: ['h264', 'hevc'],
			codecs_audio: ['aac', 'ac3'],
			containers: ['mp4', 'mkv', 'matroska'],
			max_resolution: '2160p',
			hdr: true,
			hdr_details: {hdr10: true, hlg: true, dolby_vision_profiles: []}
		});
		expect(caps.deliveries.hls).toMatchObject({supported_on_device: true, video_codecs: ['h264', 'hevc'], audio_decode_codecs: ['aac']});
		expect(caps.clientFeatures).toEqual(['playback_plan_v3']);
	});

	// The ranges webOS lists for HEVC, with and without Dolby Vision (deviceProfile.js buildVideoRangeTypes).
	const hevcOnly = (ranges) => siloCapabilitiesFromDeviceProfile({
		DirectPlayProfiles: [{Type: 'Video', Container: 'mkv', VideoCodec: 'hevc', AudioCodec: 'aac'}],
		CodecProfiles: [{Type: 'Video', Codec: 'hevc', Conditions: [{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: ranges}]}]
	});

	test('a list of the only ranges a codec plays is read as that list', () => {
		const dv = hevcOnly('SDR|HDR10|HDR10Plus|HLG|DOVI|DOVIWithHDR10|DOVIWithHLG|DOVIWithSDR|DOVIWithHDR10Plus|DOVIWithEL|DOVIWithELHDR10Plus|DOVIInvalid');
		expect(dv.clientCapabilities.hdr_details).toEqual({hdr10: true, hdr10_plus: true, hlg: true, dolby_vision_profiles: [5, 7, 8]});
		const noDv = hevcOnly('SDR|DOVIWithSDR|HDR10|HDR10Plus|DOVIWithHDR10|DOVIWithHDR10Plus|DOVIWithEL|DOVIWithELHDR10Plus|DOVIInvalid');
		expect(noDv.clientCapabilities.hdr_details).toEqual({hdr10: true, hdr10_plus: true, hlg: false, dolby_vision_profiles: []});
		const sdr = hevcOnly('SDR');
		expect(sdr.clientCapabilities).toMatchObject({hdr: false, hdr_details: {hdr10: false, hlg: false, dolby_vision_profiles: []}});
	});

	test("webOS takes HLS instead of the progressive remux its player can't play", () => {
		const profile = {
			DirectPlayProfiles: [{Type: 'Video', Container: 'mkv', VideoCodec: 'hevc', AudioCodec: 'aac'}],
			TranscodingProfiles: [{Type: 'Video', Protocol: 'hls', VideoCodec: 'hevc', AudioCodec: 'aac'}]
		};
		const webos = siloCapabilitiesFromDeviceProfile(profile, siloTraitsFor('webos')).deliveries;
		expect(webos.progressive).toMatchObject({supported_on_device: false, failure_reason: 'player_has_no_progressive_remux'});
		expect(webos.hls).toMatchObject({supported_on_device: true, features: ['native_hls_playback_v1']});
		const tizen = siloCapabilitiesFromDeviceProfile(profile, siloTraitsFor('tizen')).deliveries;
		expect(tizen.progressive.supported_on_device).toBe(true);
		expect(tizen.hls.features).toEqual([]);
	});

	test('a TV reports its own HDR as what it shows, a stick or console leaves it unknown', () => {
		const capabilities = hevcOnly('SDR|HDR10|HLG|DOVI|DOVIWithHDR10');
		const hdr = capabilities.clientCapabilities.hdr_details;
		expect(siloPlaybackContext({platform: 'webos', capabilities}).output).toEqual({hdr_details: hdr, display: {hdr_evidence: 'exact', hdr_types: hdr}});
		expect(siloPlaybackContext({platform: 'tizen', capabilities}).output.display.hdr_evidence).toBe('exact');
		for (const platform of ['vega', 'xbox']) {
			expect(siloPlaybackContext({platform, capabilities}).output).toEqual({
				hdr_details: {hdr10: false, hdr10_plus: false, hlg: false, dolby_vision_profiles: []}, display: {hdr_evidence: 'unknown'}
			});
		}
	});
});

describe('plans', () => {
	const source = siloVersionToMediaSource(version, 'movie-1');

	test('subtitles are numbered in Silo order, external first', () => {
		expect(siloSubtitleOrder(source)).toEqual([2]);
	});

	test('an original file plays from the plan address, with the token and the sidecar subtitles', () => {
		const media = siloPlanToMediaSource({
			plan: {
				delivery: 'original_http',
				effective_media_file_id: 5,
				stream: {url: '/api/v2/stream/s1?st=abc', container: 'mkv'},
				timeline: {timeline_offset_seconds: 0, can_seek_anywhere: true},
				selected_tracks: {audio: {id: 'file:5:audio:1', index: 1}},
				subtitle: {mode: 'off', inventory: [{combined_index: 0, source: 'embedded', delivery: 'sidecar', url: '/api/v2/stream/s1/subtitles/0.vtt'}]}
			},
			source,
			baseUrl: BASE,
			accessToken: 'tok'
		});
		expect(media).toMatchObject({
			Id: '5', SupportsDirectPlay: true, SupportsTranscoding: false, SiloDelivery: 'original_http',
			SiloStreamUrl: `${BASE}/api/v2/stream/s1?st=abc&token=tok`, DefaultSubtitleStreamIndex: -1, SiloTimelineOffsetTicks: 0
		});
		expect(media.DefaultAudioStreamIndex).toBe(source.MediaStreams.find((s) => s.Type === 'Audio' && s.Language === 'fra').Index);
		const subtitle = media.MediaStreams.find((s) => s.Type === 'Subtitle');
		expect(subtitle).toMatchObject({DeliveryMethod: 'External', IsExternalUrl: true, Codec: 'webvtt', DeliveryUrl: `${BASE}/api/v2/stream/s1/subtitles/0.vtt?token=tok`});
	});

	test('a remux from the middle says where its stream starts', () => {
		const media = siloPlanToMediaSource({
			plan: {
				delivery: 'server_remux_hls',
				stream: {url: '/api/v2/playback/transcode/s1/master.m3u8', protocol: 'hls'},
				timeline: {timeline_offset_seconds: 298.386, can_seek_anywhere: false},
				decision_reason: 'audio_adaptation'
			},
			source,
			baseUrl: BASE,
			accessToken: 'tok'
		});
		expect(media).toMatchObject({
			SupportsDirectPlay: false, SupportsDirectStream: true, TranscodingSubProtocol: 'hls', TranscodeReasons: ['AudioCodecNotSupported'],
			SiloTimelineOffsetTicks: 2983860000, SiloSeeksThroughServer: true
		});
	});
});

describe('sessions', () => {
	const setup = (answers) => {
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
			wait: async () => {}
		});
		return {playback, calls};
	};
	const capabilities = {state: 'available', allowed: true, protocol_versions: [3], installation_id: 'inst', features: []};
	const plan = (delivery, key) => ({
		outcome: 'playable',
		session_id: 's1',
		playback_plan: {delivery, plan_id: `plan-${key}`, plan_attempt_key: key, effective_media_file_id: 5, stream: {url: '/api/v2/stream/s1'}, timeline: {}}
	});

	test('a start sends the file, the profile, the start position and the chosen track', async () => {
		const {playback, calls} = setup({'GET /api/v2/playback/capabilities': capabilities, 'POST /api/v2/playback/start': plan('original_http', 'k1')});
		const source = siloVersionToMediaSource(version, 'movie-1');
		const french = source.MediaStreams.find((s) => s.Language === 'fra').Index;
		const info = await playback.getPlaybackInfo('movie-1', {StartTimeTicks: 3000000000, AudioStreamIndex: french, SubtitleStreamIndex: 2}, {MediaSources: [source]});
		expect(info.PlaySessionId).toBe('s1');
		expect(calls[1].body).toMatchObject({
			file_id: '5', profile_id: 'p1', installation_id: 'inst', start_position: 300, audio_track_index: 1, subtitle_track_index: 0, protocol_version: 3
		});
	});

	test('asked again while it plays, the session is replanned, and a failed original asks for something else', async () => {
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': plan('original_http', 'k1'),
			'POST /api/v2/playback/s1/replan': plan('server_remux_hls', 'k2')
		});
		await playback.getPlaybackInfo('movie-1', {});
		await playback.getPlaybackInfo('movie-1', {EnableDirectPlay: false, StartTimeTicks: 10000000});
		const replan = calls.find((c) => c.path.endsWith('/replan')).body;
		expect(replan).toMatchObject({operation: 'failure_recovery', attempted_plan_keys: ['k1'], failure: {classification: 'playback_error'}, position_seconds: 1});
	});

	test('asked again at another place with the tracks it plays, the session is replanned for the seek', async () => {
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': plan('server_remux_progressive', 'k1'),
			'POST /api/v2/playback/s1/replan': plan('server_remux_progressive', 'k2')
		});
		const info = await playback.getPlaybackInfo('movie-1', {});
		const {DefaultAudioStreamIndex, DefaultSubtitleStreamIndex} = info.MediaSources[0];
		await playback.getPlaybackInfo('movie-1', {StartTimeTicks: 6000000000, AudioStreamIndex: DefaultAudioStreamIndex, SubtitleStreamIndex: DefaultSubtitleStreamIndex});
		expect(calls.find((c) => c.path.endsWith('/replan')).body).toMatchObject({operation: 'seek_reanchor', position_seconds: 600});
	});

	test('a preview ends its session at once, and Play afterwards starts a new one', async () => {
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': plan('original_http', 'k1'),
			'DELETE /api/v2/playback/s1': {outcome: 'stopped'}
		});
		const info = await playback.previewPlaybackInfo('movie-1', {});
		expect(info.MediaSources[0].SupportsDirectPlay).toBe(true);
		expect(calls.find((c) => c.method === 'DELETE').body).not.toHaveProperty('position');
		expect(playback.sessionOf('s1')).toBe(null);
		await playback.getPlaybackInfo('movie-1', {});
		expect(calls.filter((c) => c.path === '/api/v2/playback/start')).toHaveLength(2);
		expect(calls.some((c) => c.path.endsWith('/replan'))).toBe(false);
	});

	test('progress is numbered, a conflict goes again under the next number, and the stop keeps its id', async () => {
		let conflicts = 1;
		const {playback, calls} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': plan('original_http', 'k1'),
			'POST /api/v2/playback/s1/progress': () => {
				if (conflicts-- > 0) throw Object.assign(new Error('conflict'), {status: 409, code: 'progress_conflict'});
				return {outcome: 'applied'};
			},
			'DELETE /api/v2/playback/s1': {outcome: 'stopped'}
		});
		await playback.getPlaybackInfo('movie-1', {});
		await playback.reportPlaybackProgress({PlaySessionId: 's1', PositionTicks: 600000000, IsPaused: true});
		await playback.reportPlaybackStopped({PlaySessionId: 's1', PositionTicks: 700000000});
		const progress = calls.filter((c) => c.path.endsWith('/progress')).map((c) => c.body.sequence);
		expect(progress).toEqual([1, 2]);
		const stop = calls.find((c) => c.method === 'DELETE').body;
		expect(stop).toMatchObject({installation_id: 'inst', sequence: 3, position: 70});
		expect(typeof stop.stop_id).toBe('string');
		expect(playback.sessionOf('s1')).toBe(null);
	});

	test('a refusal says why', async () => {
		const {playback} = setup({
			'GET /api/v2/playback/capabilities': capabilities,
			'POST /api/v2/playback/start': {outcome: 'refused', terminal: {reason: 'no_compatible_route', message: 'Nothing this TV can play.'}}
		});
		await expect(playback.getPlaybackInfo('movie-1', {})).rejects.toMatchObject({message: 'Nothing this TV can play.', siloRefused: true});
	});
});
