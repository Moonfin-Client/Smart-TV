jest.mock('./jellyfinApi', () => ({
	api: {},
	createApiForServer: jest.fn(),
	getApiKey: () => null,
	getServerType: () => 'jellyfin',
	getServerUrl: () => null,
	getUserId: () => null
}));
jest.mock('./moonbaseEndpoint', () => ({isSiloLogin: () => false, moonbaseEndpoint: jest.fn()}));

import {
	createWatchParty, formatRoomCode, mergePartyRooms, moonbaseJoinBody, newPartyRooms, roomSummaryFrom, siloRoomFrom,
	syncPlayGroupFrom, titleWithYear
} from './siloWatchParty';

const member = (over = {}) => ({profile_id: 'm1', display_name: 'You', is_host: true, is_self: true, connected: true, status: 'joining', ...over});
const roomJson = (over = {}) => ({
	room_id: 'r1', code: 'K7Q29M', invite_path: '/Moonfin/Party/K7Q29M', phase: 'lobby', playback_state: 'idle',
	selection_mode: 'host_pick', selection_revision: 1, guest_control_policy: 'host_only', generation: 1,
	self_role: 'host', self_can_control_transport: true, self_member_id: 'm1', members: [member()],
	...over
});

describe('Moonbase room mapping', () => {
	test('reads the extensions on top of Silo\'s fields', () => {
		const room = siloRoomFrom(roomJson({guest_control_policy: 'everyone', has_pin: true, content_title: 'Arcane',
			season: 2, episode: 1, chat_enabled: false,
			members: [member({status: 'in_sync', avatar_url: '/Users/u1/Images/Primary', user_id: 'u1'})]}));
		expect(room).toMatchObject({everyoneControls: true, guestsCanPause: false, hasPin: true, selfMemberId: 'm1',
			contentTitle: 'Arcane', season: 2, episode: 1, chatEnabled: false, reactionsEnabled: true, invitePath: '/Moonfin/Party/K7Q29M'});
		expect(room.members[0]).toMatchObject({status: 'in_sync', avatarUrl: '/Users/u1/Images/Primary'});
		expect(siloRoomFrom(roomJson({guest_control_policy: 'guests_can_pause'})).guestsCanPause).toBe(true);
	});

	test('reads a listed room and a SyncPlay group into one list, newest party first', () => {
		const older = roomSummaryFrom({room_id: 'a', host_name: 'Leo', member_count: 1, created_at: '2026-11-09T20:00:00.000Z'});
		const newer = roomSummaryFrom({room_id: 'b', host_name: 'Maya', member_count: 4, has_pin: true, is_member: false,
			members_preview: ['Maya', 'Jordan'], created_at: '2026-11-09T21:00:00.000Z'});
		const group = syncPlayGroupFrom({GroupId: 'g', GroupName: "Jordan's group", State: 'Paused', Participants: ['Jordan', 'Sam']});
		expect(newer).toMatchObject({kind: 'watchparty', hostName: 'Maya', memberCount: 4, hasPin: true, membersPreview: ['Maya', 'Jordan']});
		expect(group).toMatchObject({kind: 'syncplay', hostName: "Jordan's group", memberCount: 2, playbackState: 'paused'});
		expect(mergePartyRooms([older, newer], [group]).map((r) => r.roomId)).toEqual(['b', 'a', 'g']);
		expect(roomSummaryFrom({})).toBeNull();
	});

	test('alerts only on parties it hasn\'t seen that this user isn\'t in', () => {
		const rooms = [
			{kind: 'watchparty', roomId: 'a', isMember: false},
			{kind: 'watchparty', roomId: 'b', isMember: true},
			{kind: 'watchparty', roomId: 'c', isMember: false},
			{kind: 'syncplay', roomId: 'g'}
		];
		expect(newPartyRooms(new Set(['a']), rooms).map((r) => r.roomId)).toEqual(['c']);
	});

	test('joins with a code however it was typed, or with the invite link', () => {
		expect(moonbaseJoinBody(' k7q-29m ')).toEqual({code: 'K7Q29M'});
		expect(moonbaseJoinBody('K7Q 29M')).toEqual({code: 'K7Q29M'});
		expect(moonbaseJoinBody('https://jf.example.com/Moonfin/Party/K7Q29M')).toEqual({code: 'K7Q29M'});
		expect(moonbaseJoinBody('moonfin://party?server=s&code=k7q29m&address=x')).toEqual({code: 'K7Q29M'});
		expect(formatRoomCode('K7Q29M')).toBe('K7Q 29M');
		expect(formatRoomCode('ABCD1234')).toBe('ABCD1234');
	});

	test('adds the year only when the title doesn\'t already end with it', () => {
		expect(titleWithYear('Audio Track Test (2024)', 2024)).toBe('Audio Track Test (2024)');
		expect(titleWithYear('Audio Track Test (2024)', '2024')).toBe('Audio Track Test (2024)');
		expect(titleWithYear('Arcane', 2021)).toBe('Arcane (2021)');
		expect(titleWithYear('Arcane', null)).toBe('Arcane');
		expect(titleWithYear('Dune (2021)', 1984)).toBe('Dune (2021) (1984)');
	});
});

describe('Moonbase watch party', () => {
	let calls;
	let posted;
	let events;
	let fed;
	let sync;
	let player;
	let party;
	let mb;
	let answers;

	const flush = async () => {
		for (let i = 0; i < 12; i++) await Promise.resolve(); // eslint-disable-line no-await-in-loop
	};
	const sent = (type) => posted.filter((m) => m.type === type);
	const deliver = async (...messages) => {
		const next = events.shift();
		next.resolve({cursor: 10 + messages.length, messages});
		await flush();
	};

	beforeEach(() => {
		jest.useFakeTimers();
		calls = [];
		posted = [];
		events = [];
		fed = [];
		player = {sample: () => ({isPlaying: true, positionTicks: 600000000}), sessionId: () => 'session-1', isBuffering: () => false};
		sync = {
			feedRoomMessage: (msg) => fed.push(msg),
			setRoomDriver: jest.fn(),
			setServerTimeOffset: jest.fn(),
			getPlayer: () => player
		};
		answers = {
			'POST /Rooms': () => ({room: roomJson(), token: 'mt'}),
			'POST /Join': (o) => {
				if (o.body.pin !== '1234') throw Object.assign(new Error('This room has a PIN'), {status: 403, code: 'pin_required'});
				return {room: roomJson({self_role: 'guest', self_member_id: 'm2'}), token: 'gt'};
			},
			'POST /Rooms/r1/Leave': () => null,
			'POST /Rooms/r1/Messages': (o) => ({messages: o.body.messages.filter((m) => m.type === 'ping').map((m) => ({
				type: 'pong', client_sent_at: m.client_sent_at,
				server_received_at: new Date(Date.parse(m.client_sent_at) + 500).toISOString(),
				server_sent_at: new Date(Date.parse(m.client_sent_at) + 500).toISOString()
			}))})
		};
		mb = {
			key: 'jf|u1', baseUrl: 'http://jf:8096', moonbaseBase: () => 'http://jf:8096',
			call: jest.fn((path, options = {}) => {
				calls.push({path, ...options});
				if (path.indexOf('/Events?') >= 0) {
					return new Promise((resolve, reject) => events.push({resolve, reject, path}));
				}
				if (path.endsWith('/Messages')) posted.push(...options.body.messages);
				const answer = answers[`${options.method || 'GET'} ${path}`];
				return answer ? Promise.resolve().then(() => answer(options)) : Promise.reject(Object.assign(new Error('nope'), {status: 404}));
			}),
			getItem: jest.fn(async (id) => ({Id: id, Type: 'Movie', MediaSources: [{Id: 's', MediaStreams: []}]})),
			getEpisodes: jest.fn(async () => ({Items: []})),
			getItems: jest.fn()
		};
		party = createWatchParty({silo: () => null, moonbase: () => mb, sync});
	});

	afterEach(() => {
		party.leave();
		jest.useRealTimers();
	});

	const openRoom = async () => {
		expect(await party.create()).toBe(true);
		await flush();
		await deliver(
			{type: 'snapshot', room: roomJson({generation: 1})},
			{type: 'chat_history', messages: [{id: '1', member_id: 'm3', display_name: 'Maya', text: 'hi', sent_at: '2026-11-09T21:00:00.000Z'}]}
		);
	};

	test('opens a room and follows it over long-poll with the member\'s token', async () => {
		await openRoom();
		expect(calls[0]).toMatchObject({path: '/Rooms', method: 'POST'});
		const first = calls.find((c) => c.path.indexOf('/Events?') >= 0);
		expect(first).toMatchObject({path: '/Rooms/r1/Events?cursor=0&wait=25', timeoutMs: 35000, headers: {'X-Moonfin-Room-Token': 'mt'}});
		expect(party.state()).toMatchObject({backend: 'moonbase', connected: true});
		// History is there to read, but it's old, so nothing pops up over the video for it.
		expect(party.state().chat).toEqual([expect.objectContaining({displayName: 'Maya', text: 'hi', receivedAt: 0})]);
		// The next call goes on from the cursor it was given.
		expect(events[0].path).toBe('/Rooms/r1/Events?cursor=12&wait=25');
		// The clock comes from ping and pong over POST.
		expect(sent('ping')).toHaveLength(1);
		await flush();
		expect(sync.setServerTimeOffset).toHaveBeenCalled();
		// A lobby member says it's ready, once per status the server shows.
		expect(sent('state_report')).toEqual([expect.objectContaining({status: 'ready', session_id: null})]);
		await deliver({type: 'snapshot', room: roomJson({generation: 1})});
		await deliver({type: 'chat', message: {id: '9', member_id: 'm3', display_name: 'Maya', text: 'x', sent_at: '2026-11-09T21:00:00.000Z'}});
		expect(sent('state_report')).toHaveLength(1);
		await deliver({type: 'snapshot', room: roomJson({generation: 1, members: [member({status: 'ready'})]})});
		expect(sent('state_report')).toHaveLength(1);
	});

	test('toasts name who paused or skipped, and leave out your own', async () => {
		await openRoom();
		const at = new Date(Date.now() + 300).toISOString();
		await deliver({type: 'transport_command', command: {command_id: 'c1', action: 'pause', position_seconds: 10, execute_at: at,
			playback_state: 'paused', by_member_id: 'm3', by_display_name: 'Maya'}});
		expect(party.state().toast).toMatchObject({kind: 'pause', name: 'Maya'});
		const before = party.state().toast.id;
		await deliver({type: 'transport_command', command: {command_id: 'c2', action: 'seek', position_seconds: 20, execute_at: at,
			playback_state: 'paused', by_member_id: 'm1', by_display_name: 'You'}});
		expect(party.state().toast.id).toBe(before);
		await deliver({type: 'notice', kind: 'host_changed', member_id: 'm1', display_name: 'You'});
		expect(party.state().toast).toMatchObject({kind: 'host', self: true});
		await deliver({type: 'notice', kind: 'joined', member_id: 'm4', display_name: 'Jordan'});
		expect(party.state().toast).toMatchObject({kind: 'joined', name: 'Jordan'});
		await deliver({type: 'snapshot', room: roomJson({generation: 2, guest_control_policy: 'everyone'})});
		expect(party.state().toast).toMatchObject({kind: 'policy', everyone: true});
	});

	test('the start waits for everyone, then counts down to the play', async () => {
		await openRoom();
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'waiting', selected_content_id: 'movie-1',
			generation: 3, selection_revision: 2, attached_session_id: 'session-1'})});
		expect(party.state().waitingSince).toBe(Date.now());
		await deliver({type: 'transport_command', command: {command_id: 'c3', action: 'play', position_seconds: 0,
			execute_at: new Date(Date.now() + 3000).toISOString(), playback_state: 'playing', countdown: true, by_member_id: 'm1'}});
		const countdownAt = party.state().countdownAt;
		expect(countdownAt).toBeGreaterThan(Date.now() + 2000);
		expect(countdownAt).toBeLessThanOrEqual(Date.now() + 3000);
		jest.advanceTimersByTime(3700);
		expect(party.state().countdownAt).toBeNull();
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'movie-1',
			generation: 4, selection_revision: 2, attached_session_id: 'session-1'})});
		expect(party.state().waitingSince).toBeNull();
		// The protocol's 2 s pace while playing, not Silo's 1.5 s.
		const before = sent('state_report').length;
		jest.advanceTimersByTime(8000);
		expect(sent('state_report').length - before).toBe(4);
		// In sync or not is the server's call from the position.
		expect(sent('state_report').pop()).toMatchObject({session_id: 'session-1', position_seconds: 60});
		expect(sent('state_report').pop()).not.toHaveProperty('status');
	});

	// The broadcast after a vote says nobody voted, and only the read says who did.
	test('your own vote stays marked through the broadcast that follows it', async () => {
		let mine = false;
		const row = () => ({id: 's1', content_id: 'movie-1', title: 'Long Test', vote_count: mine ? 1 : 0, voted_by_me: mine,
			created_at: '2026-11-09T21:00:00.000Z'});
		answers['GET /Rooms/r1/Suggestions'] = () => ({suggestions: [row()]});
		answers['POST /Rooms/r1/Suggestions/s1/Vote'] = () => {
			mine = true;
			return null;
		};
		await openRoom();
		await deliver({type: 'snapshot', room: roomJson({generation: 1, selection_mode: 'vote'})});
		expect(party.state().suggestions[0].votedByMe).toBe(false);
		expect(await party.vote(party.state().suggestions[0], true)).toBe(true);
		expect(party.state().suggestions[0].votedByMe).toBe(true);
		await deliver({type: 'suggestions_update', suggestions: [{...row(), voted_by_me: false}]});
		expect(party.state().suggestions[0]).toMatchObject({votedByMe: true, voteCount: 1});
	});

	test('a guest who can\'t control playback is told so, and nothing goes out', async () => {
		await openRoom();
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'movie-1',
			generation: 3, self_role: 'guest', self_can_control_transport: false, attached_session_id: 'session-1'})});
		const driver = sync.setRoomDriver.mock.calls[0][0];
		driver.request('pause');
		expect(sent('transport_request')).toEqual([]);
		expect(party.state().toast).toMatchObject({kind: 'host_only'});
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'movie-1',
			generation: 3, attached_session_id: 'session-1'})});
		driver.request('pause');
		await flush();
		expect(sent('transport_request')).toEqual([expect.objectContaining({action: 'pause'})]);
	});

	test('a player held after the room started gets the room\'s play once, from where the room is', async () => {
		player = {sample: () => ({isPlaying: false, positionTicks: 0}), sessionId: () => 'session-1', isBuffering: () => false};
		await openRoom();
		const anchorAt = Date.now() - 20000;
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'movie-1',
			generation: 3, selection_revision: 2, attached_session_id: 'session-1', is_paused: false,
			anchor_position_seconds: 100, anchor_at: new Date(anchorAt).toISOString()})});
		const driver = sync.setRoomDriver.mock.calls[0][0];
		expect(driver.correctsDrift).toBe(false);
		const plays = () => fed.filter((m) => m.MessageType === 'SyncPlayCommand' && m.Data.Command === 'Unpause');
		driver.ready();
		jest.advanceTimersByTime(3000);
		expect(plays()).toHaveLength(1);
		// About 121 s: the anchor plus the 20 s since, plus the second the play is scheduled ahead.
		expect(plays()[0].Data.PositionTicks / 1e7).toBeGreaterThan(120.5);
		expect(plays()[0].Data.PositionTicks / 1e7).toBeLessThan(121.6);
		// Still idle on later ticks: no second play for the same command.
		jest.advanceTimersByTime(6000);
		expect(plays()).toHaveLength(1);
	});

	test('a playing player, or a paused room, gets nothing', async () => {
		await openRoom();
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'playing', selected_content_id: 'movie-1',
			generation: 3, attached_session_id: 'session-1', is_paused: false, anchor_position_seconds: 100,
			anchor_at: new Date().toISOString()})});
		jest.advanceTimersByTime(4500);
		player = {sample: () => ({isPlaying: false, positionTicks: 0}), sessionId: () => 'session-1', isBuffering: () => false};
		await deliver({type: 'snapshot', room: roomJson({phase: 'playing', playback_state: 'paused', selected_content_id: 'movie-1',
			generation: 4, attached_session_id: 'session-1', is_paused: true, anchor_position_seconds: 100,
			anchor_at: new Date().toISOString()})});
		jest.advanceTimersByTime(4500);
		expect(fed.filter((m) => m.MessageType === 'SyncPlayCommand')).toEqual([]);
	});

	test('chat and reactions come and go', async () => {
		await openRoom();
		await deliver({type: 'chat', message: {id: '2', member_id: 'm3', display_name: 'Maya', text: 'reef part', sent_at: '2026-11-09T21:01:00.000Z'}});
		expect(party.state().chat.pop()).toMatchObject({text: 'reef part', receivedAt: Date.now()});
		await deliver({type: 'reaction', member_id: 'm3', display_name: 'Maya', reaction: 'fire'}, {type: 'reaction', reaction: 'nope'});
		expect(party.state().reactions).toEqual([expect.objectContaining({reaction: 'fire', name: 'Maya'})]);
		expect(party.sendChat('  Brb  ')).toBe(true);
		expect(party.sendReaction('love')).toBe(true);
		expect(party.sendReaction('thumbs')).toBe(false);
		expect(sent('chat')).toEqual([{type: 'chat', text: 'Brb'}]);
		expect(sent('reaction')).toEqual([{type: 'reaction', reaction: 'love'}]);
	});

	test('a dropped poll says it\'s reconnecting, and that it\'s back', async () => {
		await openRoom();
		events.shift().reject(new Error('offline'));
		await flush();
		expect(party.state()).toMatchObject({connected: false, toast: expect.objectContaining({kind: 'reconnecting'})});
		jest.advanceTimersByTime(500);
		await flush();
		await deliver();
		expect(party.state()).toMatchObject({connected: true, toast: expect.objectContaining({kind: 'reconnected'})});
	});

	test('being removed, or the room going away, leaves it', async () => {
		await openRoom();
		await deliver({type: 'removed', reason: 'host'});
		expect(party.state()).toMatchObject({room: null, endedReason: 'removed'});

		await openRoom();
		events.shift().reject(Object.assign(new Error('gone'), {status: 404}));
		await flush();
		expect(party.state()).toMatchObject({room: null, endedReason: 'closed'});
	});

	test('a room with a PIN asks for it, and the same join goes again with it', async () => {
		expect(await party.join('k7q-29m')).toBe(false);
		expect(party.state()).toMatchObject({errorCode: 'pin_required', pinRequest: {input: 'k7q-29m'}});
		expect(await party.joinWithPin('1234')).toBe(true);
		expect(calls.filter((c) => c.path === '/Join').pop().body).toEqual({code: 'K7Q29M', pin: '1234'});
		expect(party.state()).toMatchObject({pinRequest: null, errorCode: null});
		expect(party.state().room.isHost).toBe(false);

		party.leave();
		await party.joinRoom({roomId: 'r9', hostName: 'Maya'});
		expect(calls.filter((c) => c.path === '/Join').pop().body).toEqual({room_id: 'r9'});
		expect(party.state().pinRequest).toEqual({roomId: 'r9', hostName: 'Maya'});
	});

	test('leaving tells Moonbase', async () => {
		await openRoom();
		party.leave();
		await flush();
		expect(calls.find((c) => c.path === '/Rooms/r1/Leave')).toMatchObject({method: 'POST', headers: {'X-Moonfin-Room-Token': 'mt'}});
	});

	test('picking the room it is already in keeps it there', async () => {
		await openRoom();
		const before = calls.length;
		expect(await party.joinRoom({roomId: 'r1', hostName: 'You'})).toBe(true);
		await flush();
		expect(calls.slice(before).filter((c) => c.path === '/Join' || c.path.endsWith('/Leave'))).toEqual([]);
		expect(party.state().room.roomId).toBe('r1');
	});

	test('the host\'s controls go to the room\'s routes', async () => {
		answers['POST /Rooms/r1/Policy'] = (o) => ({room: roomJson({generation: 2, guest_control_policy: o.body.guest_control_policy})});
		answers['POST /Rooms/r1/Pin'] = (o) => ({room: roomJson({generation: 3, has_pin: Boolean(o.body.pin)})});
		answers['POST /Rooms/r1/Promote'] = () => ({room: roomJson({generation: 4, self_role: 'guest'})});
		answers['POST /Rooms/r1/Remove'] = () => null;
		answers['POST /Rooms/r1/Start'] = () => ({room: roomJson({generation: 5, phase: 'playing', playback_state: 'waiting'})});
		await openRoom();
		expect(await party.setEveryoneControls(true)).toBe(true);
		expect(party.state().room.everyoneControls).toBe(true);
		expect(await party.setPin('4321')).toBe(true);
		expect(party.state().room.hasPin).toBe(true);
		expect(await party.setPin(null)).toBe(true);
		expect(calls.filter((c) => c.path.endsWith('/Pin')).map((c) => c.body)).toEqual([{pin: '4321'}, {pin: null}]);
		expect(await party.removeMember('m3')).toBe(true);
		expect(await party.promote('m3')).toBe(true);
		expect(party.state().room.isHost).toBe(false);
		expect(await party.startPlayback(90)).toBe(true);
		expect(calls.find((c) => c.path.endsWith('/Start')).body).toEqual({position_seconds: 90});
		expect(party.inviteUrl()).toBe('http://jf:8096/Moonfin/Party/K7Q29M');
		// The server's own absolute address wins when it sends one.
		await deliver({type: 'snapshot', room: roomJson({generation: 6, invite_url: 'https://watch.example.com/Moonfin/Party/K7Q29M'})});
		expect(party.inviteUrl()).toBe('https://watch.example.com/Moonfin/Party/K7Q29M');
	});
});
