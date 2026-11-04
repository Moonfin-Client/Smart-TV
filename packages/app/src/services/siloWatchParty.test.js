jest.mock('./jellyfinApi', () => ({
	createApiForServer: jest.fn(),
	getApiKey: () => null,
	getServerUrl: () => null,
	getUserId: () => null
}));
jest.mock('./moonbaseEndpoint', () => ({isSiloLogin: () => false}));

import {
	asSyncPlayCommand, clockSample, createWatchParty, defaultAudioIndex, nextEpisodeId, roomJoinBody, roomResumePoint, serverOffsetOf,
	siloRoomCommandFrom, siloRoomFrom, subtitleIndexFor
} from './siloWatchParty';

const roomJson = (over = {}) => ({
	room_id: 'r1', phase: 'lobby', playback_state: 'idle', selection_mode: 'host_pick', selection_revision: 1,
	code: 'ABCD1234', generation: 1, self_role: 'host', self_can_control_transport: true,
	members: [{profile_id: 'p1', display_name: 'Brady', is_host: true, is_self: true, connected: true}],
	...over
});

describe('Silo Watch Party mapping', () => {
	test('reads a room snapshot', () => {
		const room = siloRoomFrom(roomJson({selected_content_id: 'movie-1', selected_file_id: 7, guest_control_policy: 'guest_play_pause'}));
		expect(room).toMatchObject({roomId: 'r1', isHost: true, selectedContentId: 'movie-1', selectedFileId: '7', guestsCanPause: true});
		expect(room.members[0]).toMatchObject({profileId: 'p1', displayName: 'Brady', isHost: true, connected: true});
	});

	test('joins with a code, an invite link or its token', () => {
		expect(roomJoinBody(' abcd1234 ')).toEqual({code: 'ABCD1234'});
		expect(roomJoinBody('http://silo/rooms/join?token=t%2Bx&y=1')).toEqual({join_token: 't+x'});
		expect(roomJoinBody('a-long-invite-token-value')).toEqual({join_token: 'a-long-invite-token-value'});
	});

	test('turns room commands into the SyncPlay commands the players run', () => {
		const at = '2026-10-31T12:00:00.000Z';
		const command = (action, state) => siloRoomCommandFrom({command_id: 'c', action, position_seconds: 12.5, execute_at: at, playback_state: state});
		expect(asSyncPlayCommand(command('play', 'playing'))).toEqual({Command: 'Unpause', PositionTicks: 125000000, When: at});
		expect(asSyncPlayCommand(command('pause', 'paused')).Command).toBe('Pause');
		expect(asSyncPlayCommand(command('pause', 'waiting')).Command).toBe('Seek');
		expect(asSyncPlayCommand(command('seek', 'waiting')).Command).toBe('Seek');
		expect(asSyncPlayCommand(command('seek', 'playing')).Command).toBe('Unpause');
		expect(asSyncPlayCommand(command('seek', 'paused')).Command).toBe('Pause');
		expect(siloRoomCommandFrom({command_id: 'c'})).toBeNull();
	});

	test('resumes from the earliest point anyone in the room stopped at', () => {
		const answer = {items: [{content_id: 'ep1', members: [
			{profile_id: 'p1', state: 'in_progress', position_seconds: 2530.4},
			{profile_id: 'p2', state: 'in_progress', position_seconds: 1500.9},
			{profile_id: 'p3', state: 'unseen'},
			{profile_id: 'p4', state: 'watched', position_seconds: 0},
			{profile_id: 'p5', state: 'in_progress', position_seconds: 12}
		]}]};
		expect(roomResumePoint(answer, 'ep1')).toEqual({seconds: 1500, profileId: 'p2', notStarted: 1});
		// Nobody part way through, or barely started, is nothing to resume.
		expect(roomResumePoint({items: [{content_id: 'ep1', members: [{state: 'unseen'}, {state: 'in_progress', position_seconds: 5}]}]}, 'ep1')).toBeNull();
		expect(roomResumePoint(answer, 'other')).toBeNull();
	});

	test('takes the clock offset of the fastest round trip', () => {
		expect(clockSample(1000, 1600, 1610, 1210)).toEqual({rttMs: 200, offsetMs: 500});
		expect(serverOffsetOf([{rttMs: 300, offsetMs: 9}, {rttMs: 100, offsetMs: 5}])).toBe(5);
		expect(serverOffsetOf([])).toBe(0);
	});

	test('finds the next episode, specials left out', () => {
		const eps = [
			{Id: 's0', ParentIndexNumber: 0, IndexNumber: 1},
			{Id: 'e2', ParentIndexNumber: 1, IndexNumber: 2},
			{Id: 'e1', ParentIndexNumber: 1, IndexNumber: 1},
			{Id: 'f1', ParentIndexNumber: 2, IndexNumber: 1}
		];
		expect(nextEpisodeId(eps, 'e1')).toBe('e2');
		expect(nextEpisodeId(eps, 'e2')).toBe('f1');
		expect(nextEpisodeId(eps, 'f1')).toBeNull();
	});

	test('maps the host\'s subtitles onto a member\'s file', () => {
		const source = {MediaStreams: [
			{Type: 'Audio', Index: 1}, {Type: 'Audio', Index: 2, IsDefault: true},
			{Type: 'Subtitle', Index: 3, Language: 'eng'}, {Type: 'Subtitle', Index: 4, Language: 'fre'}
		]};
		expect(defaultAudioIndex(source)).toBe(2);
		expect(subtitleIndexFor(null, source)).toBeNull();
		expect(subtitleIndexFor({off: true}, source)).toBe(-1);
		expect(subtitleIndexFor({index: 3, language: 'eng'}, source)).toBe(3);
		expect(subtitleIndexFor({index: 3, language: 'fre'}, source)).toBe(4);
		expect(subtitleIndexFor({index: 9, language: 'ger'}, source)).toBeNull();
	});
});

describe('Silo Watch Party room', () => {
	let socket;
	let sent;
	let fed;
	let sync;
	let player;
	let calls;
	let party;
	let episodes;
	let silo;

	const frame = (data) => socket.onmessage({data: JSON.stringify(data)});
	const frames = (type) => sent.filter((f) => f.type === type);
	const flush = async () => {
		for (let i = 0; i < 10; i++) await Promise.resolve(); // eslint-disable-line no-await-in-loop
	};

	beforeEach(() => {
		jest.useFakeTimers();
		sent = [];
		fed = [];
		calls = [];
		episodes = [];
		global.WebSocket = function FakeSocket (url, protocols) {
			socket = this;
			this.url = url;
			this.protocols = protocols;
			this.send = (data) => sent.push(JSON.parse(data));
			this.close = () => {};
		};
		player = {sample: () => ({isPlaying: false, positionTicks: 300000000}), sessionId: () => 'session-1', isBuffering: () => false};
		sync = {
			feedRoomMessage: (msg) => fed.push(msg),
			setRoomDriver: jest.fn(),
			setServerTimeOffset: jest.fn(),
			getPlayer: () => player
		};
		const answers = {
			'POST /api/v2/watch-together/rooms': () => ({room: roomJson(), room_access_token: 'rt'}),
			'POST /api/v2/watch-together/rooms/r1/ws-ticket': () => ({ticket: 'tk', protocol: 'silo.room.v2'}),
			'PUT /api/v2/watch-together/rooms/r1/staged-selection': (o) => ({room: roomJson({selected_content_id: o.body.content_id, generation: 2})}),
			'POST /api/v2/watch-together/rooms/r1/member-state': () => ({items: [{content_id: 'ep1', members: [
				{profile_id: 'p1', state: 'in_progress', position_seconds: 2530},
				{profile_id: 'p2', state: 'in_progress', position_seconds: 1500}
			]}]}),
			'POST /api/v2/watch-together/rooms/r1/playback/start': () => ({room: roomJson({phase: 'playing', playback_state: 'waiting',
				selected_content_id: 'ep1', generation: 3, selection_revision: 2})})
		};
		silo = {
			key: 'k', baseUrl: 'http://silo:8090', userId: () => 'p1',
			siloCall: jest.fn(async (path, options = {}) => {
				calls.push({path, ...options});
				const answer = answers[`${options.method || 'GET'} ${path}`];
				if (answer) return answer(options);
				throw Object.assign(new Error('nope'), {status: 404});
			}),
			getItem: jest.fn(async (id) => ({Id: id, Type: 'Episode', SeriesId: 'show', MediaSources: [
				{Id: '7', MediaStreams: [{Type: 'Audio', Index: 1, IsDefault: true}]}
			]})),
			getEpisodes: jest.fn(async () => ({Items: episodes})),
			getItems: jest.fn()
		};
		party = createWatchParty({silo: () => silo, sync});
	});

	afterEach(() => {
		party.leave();
		jest.useRealTimers();
		delete global.WebSocket;
	});

	const openRoom = async () => {
		expect(await party.create()).toBe(true);
		await flush();
		socket.onopen();
	};

	test('opens the room socket with its ticket as a subprotocol', async () => {
		await openRoom();
		expect(socket.url).toBe('ws://silo:8090/api/v2/watch-together/rooms/r1/ws');
		expect(socket.protocols).toEqual(['silo.room.v2', 'silo.ticket.tk']);
		expect(calls.find((c) => c.path.endsWith('/ws-ticket')).headers).toEqual({'X-Room-Token': 'rt'});
		expect(frames('ping')).toHaveLength(1);
	});

	test('a failed read of the room\'s title is tried again by Play now', async () => {
		silo.getItem.mockRejectedValueOnce(new Error('offline'));
		await openRoom();
		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'waiting', selected_content_id: 'ep1',
			selected_file_id: 7, generation: 2, selection_revision: 2})});
		await flush();
		expect(fed.some((m) => m.Data.Type === 'PlayQueue')).toBe(false);
		party.openPlayer();
		await flush();
		expect(silo.getItem).toHaveBeenCalledTimes(2);
		expect(fed.some((m) => m.Data.Type === 'PlayQueue')).toBe(true);
	});

	test('follows a playing room as a SyncPlay group and reports to it', async () => {
		await openRoom();
		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'waiting', selected_content_id: 'ep1',
			selected_file_id: 7, anchor_position_seconds: 30, generation: 2, selection_revision: 2})});
		await flush();
		expect(sync.setRoomDriver).toHaveBeenCalledWith(expect.objectContaining({request: expect.any(Function)}));
		const types = fed.map((m) => m.Data.Type || m.Data.Command);
		expect(types).toEqual(['GroupJoined', 'StateUpdate', 'PlayQueue']);
		expect(fed[2].Data.Data).toMatchObject({
			Playlist: [{ItemId: 'ep1'}], StartPositionTicks: 300000000,
			PlaybackOptions: {mediaSourceId: '7', audioStreamIndex: 1}
		});

		// Not attached yet: the player is owed nothing but held, and the session is attached.
		const driver = sync.setRoomDriver.mock.calls[0][0];
		expect(driver.readyOwed()).toBe(true);
		jest.advanceTimersByTime(1500);
		expect(frames('attach_session')).toEqual([{type: 'attach_session', session_id: 'session-1'}]);

		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'waiting', selected_content_id: 'ep1',
			attached_session_id: 'session-1', generation: 3, selection_revision: 2})});
		frame({type: 'transport_command', command: {command_id: 'c1', session_id: 'session-1', action: 'seek',
			position_seconds: 30, execute_at: new Date(Date.now() + 1000).toISOString(), playback_state: 'waiting'}});
		expect(fed[fed.length - 1].Data).toMatchObject({Command: 'Seek', PositionTicks: 300000000});
		expect(driver.readyOwed()).toBe(true);
		jest.advanceTimersByTime(1000);
		expect(frames('state_report').pop()).toMatchObject({command_id: 'c1', is_ready: true, position_seconds: 30, is_paused: true});

		driver.request('pause');
		expect(frames('transport_request')).toEqual([{type: 'transport_request', action: 'pause', position_seconds: 30, is_paused: true}]);
		driver.request('seek', 600000000);
		expect(frames('transport_request')[1]).toMatchObject({action: 'seek', position_seconds: 60});
	});

	test('a resumed start seeks the room there before the host reports ready at the beginning', async () => {
		await openRoom();
		await party.stage('ep1');
		const resume = await party.resumePoint();
		expect(resume).toMatchObject({seconds: 1500, profileId: 'p2'});
		expect(calls.find((c) => c.path.endsWith('/member-state'))).toMatchObject({
			method: 'POST', body: {content_ids: ['ep1']}, headers: {'X-Room-Token': 'rt'}
		});

		expect(await party.startPlayback(resume.seconds)).toBe(true);
		await flush();
		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'waiting', selected_content_id: 'ep1',
			attached_session_id: 'session-1', generation: 4, selection_revision: 2})});
		frame({type: 'transport_command', command: {command_id: 'c1', session_id: 'session-1', action: 'seek',
			position_seconds: 0, execute_at: new Date(Date.now() + 500).toISOString(), playback_state: 'waiting'}});
		jest.advanceTimersByTime(1500);

		expect(frames('transport_request')).toEqual([{type: 'transport_request', action: 'seek', position_seconds: 1500, is_paused: false}]);
		const seekAt = sent.findIndex((f) => f.type === 'transport_request');
		expect(sent.slice(0, seekAt).some((f) => f.type === 'state_report' && f.is_ready)).toBe(false);
	});

	test('a finished episode closes the player and stages the next for the host', async () => {
		episodes = [{Id: 'ep1', ParentIndexNumber: 1, IndexNumber: 1}, {Id: 'ep2', ParentIndexNumber: 1, IndexNumber: 2}];
		await openRoom();
		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'ep1', generation: 2, selection_revision: 2})});
		await flush();
		fed = [];
		frame({type: 'snapshot', room: roomJson({phase: 'lobby', selected_content_id: 'ep1', generation: 3, selection_revision: 3})});
		await flush();
		expect(fed.map((m) => m.Data.Type || m.Data.Command)).toEqual(['Stop', 'GroupLeft']);
		expect(sync.setRoomDriver).toHaveBeenLastCalledWith(null);
		expect(calls.find((c) => c.path.endsWith('/staged-selection')).body).toEqual({content_id: 'ep2'});
	});

	test("a pick from a title's page stages the version the host chose there", async () => {
		await openRoom();
		expect(await party.pick({Id: 'movie-1', Type: 'Movie'}, '42')).toBe(true);
		expect(calls.find((c) => c.path.endsWith('/staged-selection')).body).toEqual({content_id: 'movie-1', file_id: '42'});
	});

	test('a closed room is left with a reason', async () => {
		await openRoom();
		frame({type: 'room_closed'});
		expect(party.state()).toMatchObject({room: null, endedReason: 'closed'});
	});

	test('a guest without transport control sends no requests', async () => {
		await openRoom();
		frame({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'ep1',
			attached_session_id: 'session-1', self_role: 'guest', self_can_control_transport: false, generation: 2})});
		sync.setRoomDriver.mock.calls[0][0].request('pause');
		expect(frames('transport_request')).toEqual([]);
	});
});
