// Silo's Watch Party (/api/v2/watch-together): rooms joined with a code, kept in step over the room socket
// (`silo.room.v2`). Ported from Moonfin-Core's SiloWatchPartyApi and SiloWatchPartyManager.
//
// The players already follow a group for Jellyfin's SyncPlay, so while a room plays it is fed to them as one
// (syncPlay.js `feedRoomMessage`): the room's transport commands become SyncPlay commands at the same server time, and
// the players' play, pause and seek requests come back here as room requests. TVs don't correct drift by playback rate
// (Core's `_correctsByRate` is off on TV), so the players' own drift seeks are what Core does there too.
//
// Silo's rules for the numbers below: docs/architecture/watch-party-synchronization.md in silo-server.
//
// Moonbase hosts the same rooms on Jellyfin, Emby and Plex with Silo's room JSON and message types, so one client runs
// both, but over HTTP long-poll because old TV browsers can't hold a socket.

import {api as serverApi, createApiForServer, getApiKey, getServerType, getServerUrl, getUserId} from './jellyfinApi';
import {getDeviceCapabilities} from './deviceProfile';
import * as syncPlay from './syncPlay';
import {findSiloMoonbase} from './siloMoonbase';
import {isSiloLogin, moonbaseEndpoint} from './moonbaseEndpoint';
import {siloNewUuid} from './siloPlayback';
import {openSiloSocket} from './siloSocket';
import {platformFetch} from './secureFetch';
import {trimSlash} from '../utils/plexUrls';
import {plexMoonbaseBase} from './plexMoonbase';

export const SILO_ROOM_PROTOCOL = 'silo.room.v2';
const TICKS_PER_SECOND = 10000000;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000];
const REPORT_MS = 1500;
// Moonbase judges a member's status against the room every 2 s, so its reports come at that pace.
const MOONBASE_REPORT_MS = 2000;
const WAITING_REPORT_MS = 500;
const BUFFERING_GRACE_MS = 2000;
const ALONE_MS = 10 * 60 * 1000;
const PARTY_POLL_MS = 15000;
const AVATAR_MS = 10 * 60 * 1000;
// Moonbase holds an Events call up to 25 s, so anything past this is a dead connection.
const EVENTS_TIMEOUT_MS = 35000;
const CALL_TIMEOUT_MS = 15000;
const CONFIG_MS = 60 * 1000;
const CHAT_KEEP = 50;
const REACTION_MS = 4000;

export const REACTIONS = ['love', 'haha', 'wow', 'sad', 'fire', 'popcorn'];

const text = (value) => (typeof value === 'string' && value ? value : null);
const count = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A room snapshot (`WatchTogetherRoomSnapshot`), as the room routes and the socket's `snapshot` frame send it. Moonbase
 * sends the same fields plus the extensions read at the end, which a Silo room leaves at their defaults.
 */
export const siloRoomFrom = (json = {}) => {
	const file = json.selected_file_id;
	const policy = json.guest_control_policy || 'host_only';
	return {
		roomId: json.room_id || '',
		// lobby, playing or ended
		phase: json.phase || 'lobby',
		// idle, waiting, paused or playing
		playbackState: json.playback_state || 'idle',
		isVoting: json.selection_mode === 'vote',
		// The playback epoch: advances when playback starts, restarts or stops.
		selectionRevision: Number(json.selection_revision) || 0,
		selectedContentId: text(json.selected_content_id),
		selectedFileId: typeof file === 'number' || text(file) ? String(file) : null,
		code: json.code || '',
		// Silo says guest_play_pause, Moonbase keeps guests_can_pause for parity and adds everyone.
		guestsCanPause: policy === 'guest_play_pause' || policy === 'guests_can_pause',
		everyoneControls: policy === 'everyone',
		guestControlPolicy: policy,
		anchorPositionSeconds: Number(json.anchor_position_seconds) || 0,
		// Moonbase: the server time the anchor applies to, and whether the room is paused there.
		anchorAt: Date.parse(json.anchor_at || '') || null,
		isPaused: json.is_paused === true,
		// Orders snapshots: an older one never replaces a newer one.
		generation: Number(json.generation) || 0,
		isHost: json.self_role === 'host',
		canControlTransport: json.self_can_control_transport === true,
		attachedSessionId: text(json.attached_session_id),
		// Host first.
		members: (Array.isArray(json.members) ? json.members : []).filter((m) => m && typeof m === 'object').map((m) => ({
			profileId: m.profile_id || '',
			displayName: m.display_name || '',
			isHost: m.is_host === true,
			isSelf: m.is_self === true,
			connected: m.connected === true,
			// joining, ready, in_sync, catching_up, buffering or not_watching, from the member's own reports
			status: text(m.status),
			avatarUrl: text(m.avatar_url)
		})),
		selfMemberId: text(json.self_member_id),
		hasPin: json.has_pin === true,
		invitePath: text(json.invite_path),
		// The invite page's full address, as the server sees it from outside (newer Moonbase builds).
		inviteUrl: text(json.invite_url),
		contentTitle: json.content_title || '',
		contentType: json.content_type || '',
		seriesName: json.series_name || '',
		season: count(json.season),
		episode: count(json.episode),
		chatEnabled: json.chat_enabled !== false,
		reactionsEnabled: json.reactions_enabled !== false
	};
};

/** A room in Moonbase's `GET /Rooms` list. It has no code, so joining it goes by its id. */
export const roomSummaryFrom = (json) => {
	if (!json || !text(json.room_id)) return null;
	return {
		kind: 'watchparty',
		roomId: json.room_id,
		hostName: json.host_name || '',
		memberCount: Number(json.member_count) || 0,
		membersPreview: (Array.isArray(json.members_preview) ? json.members_preview : []).filter(text),
		phase: json.phase || 'lobby',
		playbackState: json.playback_state || 'idle',
		positionSeconds: Number(json.position_seconds) || 0,
		selectedContentId: text(json.selected_content_id),
		contentTitle: json.content_title || '',
		contentType: json.content_type || '',
		seriesName: json.series_name || '',
		season: count(json.season),
		episode: count(json.episode),
		hasPin: json.has_pin === true,
		everyoneControls: json.guest_control_policy === 'everyone',
		isMember: json.is_member === true,
		createdAt: Date.parse(json.created_at || '') || 0
	};
};

/** A Jellyfin SyncPlay group from `/SyncPlay/List`, in the room list's shape. */
export const syncPlayGroupFrom = (group) => {
	if (!group || !text(group.GroupId)) return null;
	const participants = (Array.isArray(group.Participants) ? group.Participants : []).filter(text);
	return {
		kind: 'syncplay',
		roomId: group.GroupId,
		hostName: group.GroupName || '',
		memberCount: participants.length,
		membersPreview: participants.slice(0, 3),
		playbackState: String(group.State || 'Idle').toLowerCase(),
		createdAt: Date.parse(group.LastUpdatedAt || '') || 0
	};
};

/** The rooms the list and the home row show: newest Moonbase rooms first, then SyncPlay groups. */
export const mergePartyRooms = (rooms = [], groups = []) => [
	...rooms.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt),
	...groups.filter(Boolean)
];

/** Moonbase rooms in `rooms` that weren't in `seenIds` and that this user isn't already in, for the alert banner. */
export const newPartyRooms = (seenIds, rooms) => rooms.filter((r) => r.kind === 'watchparty' && !r.isMember && !seenIds.has(r.roomId));

/** A title with its year in brackets, unless its name already ends with it, as some libraries name them. */
export const titleWithYear = (title, year) => {
	const name = String(title || '');
	const suffix = year ? `(${year})` : '';
	return !suffix || name.trim().slice(-suffix.length) === suffix ? name : `${name} ${suffix}`;
};

/** A Moonbase code as people read it: K7Q29M shows as K7Q 29M. */
export const formatRoomCode = (code) => {
	const raw = String(code || '');
	return raw.length === 6 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
};

/** What a member typed to join a Moonbase room: the code, or the invite link that carries it. */
export const moonbaseJoinBody = (input) => {
	const typed = String(input || '').trim();
	const fromLink = /\/Party\/([^/?#\s]+)/i.exec(typed) || /[?&]code=([^&#\s]+)/i.exec(typed);
	return {code: (fromLink ? decodeURIComponent(fromLink[1]) : typed).replace(/[\s-]/g, '').toUpperCase()};
};

/** A chat line from Moonbase. */
export const chatMessageFrom = (json) => {
	if (!json || !text(json.text)) return null;
	return {
		id: String(json.id || ''),
		memberId: text(json.member_id),
		displayName: json.display_name || '',
		text: json.text,
		sentAt: Date.parse(json.sent_at || '') || 0
	};
};

export const isRoomPlaying = (room) => room?.phase === 'playing';

/** A `transport_command`: what every attached player does, and when (server time). */
export const siloRoomCommandFrom = (json = {}) => {
	const executeAt = Date.parse(json.execute_at || '');
	if (!text(json.command_id) || isNaN(executeAt)) return null;
	return {
		commandId: json.command_id,
		// Set when the command is meant for one viewer's session only.
		sessionId: text(json.session_id),
		// play, pause or seek
		action: json.action || '',
		positionSeconds: Number(json.position_seconds) || 0,
		executeAt: json.execute_at,
		// The room's state once the command has run.
		playbackState: json.playback_state || '',
		// Moonbase names who asked for it, and marks the start that follows the wait for everyone's player.
		byMemberId: text(json.by_member_id),
		byName: json.by_display_name || '',
		countdown: json.countdown === true
	};
};

/**
 * The SyncPlay command a player runs for a room command. Anything the room then waits on (a seek, or the pause that
 * lines up a newly attached player) is SyncPlay's Seek: held paused there until ready. Otherwise a room seek that keeps
 * the room playing or paused is a play or pause from that position.
 */
export const asSyncPlayCommand = (command) => {
	const PositionTicks = Math.round(command.positionSeconds * TICKS_PER_SECOND);
	const When = command.executeAt;
	if (command.playbackState === 'waiting') return {Command: 'Seek', PositionTicks, When};
	const playing = command.action === 'seek' ? command.playbackState === 'playing' : command.action === 'play';
	return {Command: playing ? 'Unpause' : 'Pause', PositionTicks, When};
};

const SYNC_PLAY_STATES = {waiting: 'Waiting', paused: 'Paused', playing: 'Playing'};
export const syncPlayStateOf = (room) => SYNC_PLAY_STATES[room?.playbackState] || 'Waiting';

/** A title up for the vote. `votedByMe` only comes from an HTTP read; socket broadcasts always say false. */
export const siloSuggestionFrom = (json = {}) => {
	if (typeof json.id !== 'string' || typeof json.content_id !== 'string') return null;
	return {
		id: json.id,
		contentId: json.content_id,
		title: json.title || '',
		subtitle: json.subtitle || '',
		voteCount: Number(json.vote_count) || 0,
		votedByMe: json.voted_by_me === true,
		createdAt: Date.parse(json.created_at || '') || 0
	};
};

// Under this a member has barely started, which isn't worth offering to resume from.
const RESUME_MIN_SECONDS = 30;

/**
 * Where a room can pick a title up from, out of what each connected member has watched of it (member-state): the
 * earliest point any member stopped at, so nobody misses anything they haven't seen. Null when nobody is part way
 * through. `notStarted` counts the members who haven't begun it, whom resuming takes past the start.
 */
export const roomResumePoint = (answer, contentId) => {
	const entry = (answer?.items || []).find((it) => it?.content_id === contentId);
	const members = Array.isArray(entry?.members) ? entry.members : [];
	const started = members.filter((m) => m?.state === 'in_progress' && Number(m.position_seconds) >= RESUME_MIN_SECONDS);
	if (started.length === 0) return null;
	const earliest = started.reduce((best, m) => (Number(m.position_seconds) < Number(best.position_seconds) ? m : best));
	return {
		seconds: Math.floor(Number(earliest.position_seconds)),
		profileId: earliest.profile_id || null,
		notStarted: members.filter((m) => m?.state === 'unseen').length
	};
};

// The room's order: most votes first, then oldest.
export const compareSuggestions = (a, b) => (b.voteCount - a.voteCount) || (a.createdAt - b.createdAt) ||
	(a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** What a member typed: a room code, or an invite link or its token (codes are eight characters, tokens longer). */
export const roomJoinBody = (input) => {
	const typed = String(input || '').trim();
	const fromLink = /[?&]token=([^&#]+)/.exec(typed);
	if (fromLink) return {join_token: decodeURIComponent(fromLink[1])};
	return typed.length > 12 ? {join_token: typed} : {code: typed.toUpperCase()};
};

/** One NTP-style sample: the round trip, and server time minus local time. */
export const clockSample = (clientSentMs, serverReceivedMs, serverSentMs, clientReceivedMs) => ({
	rttMs: (clientReceivedMs - clientSentMs) - (serverSentMs - serverReceivedMs),
	offsetMs: Math.trunc(((serverReceivedMs - clientSentMs) + (serverSentMs - clientReceivedMs)) / 2)
});

// The offset of the fastest round trip.
export const serverOffsetOf = (samples) => (samples.length
	? samples.reduce((best, s) => (s.rttMs < best.rttMs ? s : best)).offsetMs : 0);

/** The episode after `currentId` in season and episode order, specials left out. */
export const nextEpisodeId = (episodes, currentId) => {
	const ordered = (episodes || []).filter((e) => (e.ParentIndexNumber || 0) > 0)
		.sort((a, b) => ((a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0)) || ((a.IndexNumber || 0) - (b.IndexNumber || 0)));
	const at = ordered.findIndex((e) => e.Id === currentId);
	return at >= 0 && at + 1 < ordered.length ? ordered[at + 1].Id : null;
};

/** The media source the room plays: its pinned file, else the first. */
export const partySource = (item, fileId) => {
	const sources = item?.MediaSources || [];
	return sources.find((s) => fileId != null && String(s.Id) === fileId) || sources[0] || null;
};

const streamsOf = (source, type) => (source?.MediaStreams || []).filter((s) => s.Type === type && Number.isInteger(s.Index));

/** The file's default audio track, so every member hears the same one whatever their own language preferences. */
export const defaultAudioIndex = (source) => {
	const audio = streamsOf(source, 'Audio');
	return audio.length ? (audio.find((s) => s.IsDefault) || audio[0]).Index : null;
};

/**
 * The stream index the host's subtitle choice means in `source`: the same index when that stream has the same
 * language, else the first in the language; -1 for off; null to leave it to the member.
 */
export const subtitleIndexFor = (choice, source) => {
	if (!choice) return null;
	if (choice.off === true) return -1;
	const tracks = streamsOf(source, 'Subtitle');
	const same = tracks.find((t) => t.Index === choice.index);
	if (same && (choice.language == null || same.Language === choice.language)) return choice.index;
	const byLanguage = choice.language != null ? tracks.find((t) => t.Language === choice.language) : null;
	return byLanguage ? byLanguage.Index : null;
};

/** Silo's room routes. `call(path, options)` is a Silo request as the signed-in profile (siloApi's `siloCall`). */
export const createWatchPartyApi = ({call, baseUrl}) => {
	const rooms = '/api/v2/watch-together/rooms';
	const access = (answer) => {
		if (!answer?.room || !text(answer.room_access_token)) throw new Error('Expected a Watch Party room from Silo');
		return {room: siloRoomFrom(answer.room), token: answer.room_access_token};
	};
	const room = (answer) => {
		if (!answer?.room) throw new Error('Expected a Watch Party room from Silo');
		return siloRoomFrom(answer.room);
	};
	const withToken = (token, options = {}) => ({...options, headers: {...options.headers, 'X-Room-Token': token}});
	return {
		available: async () => {
			const caps = await call('/api/v2/watch-together/capabilities');
			return caps?.state === 'available' && caps.allowed === true && caps.socket_protocol === SILO_ROOM_PROTOCOL;
		},
		// The caller picks the room id, so a retry after an uncertain answer gets the same room back.
		create: async (roomId) => access(await call(rooms, {method: 'POST', body: {room_id: roomId, selection_mode: 'host_pick'}})),
		join: async (input) => access(await call('/api/v2/watch-together/join', {method: 'POST', body: roomJoinBody(input)})),
		// With a file, the room plays that version of the title for everyone.
		stage: async (roomId, contentId, fileId = null) => room(await call(`${rooms}/${roomId}/staged-selection`,
			{method: 'PUT', body: {content_id: contentId, ...(fileId ? {file_id: fileId} : null)}})),
		start: async (roomId) => room(await call(`${rooms}/${roomId}/playback/start`, {method: 'POST'})),
		stop: async (roomId) => room(await call(`${rooms}/${roomId}/playback/stop`, {method: 'POST'})),
		setGuestsCanPause: async (roomId, allowed) => room(await call(`${rooms}/${roomId}/policy`,
			{method: 'PATCH', body: {guest_control_policy: allowed ? 'guest_play_pause' : 'host_only'}})),
		// Drops anything staged.
		setVoting: async (roomId, voting) => room(await call(`${rooms}/${roomId}/selection-mode`,
			{method: 'PATCH', body: {selection_mode: voting ? 'vote' : 'host_pick'}})),
		// At most 200 suggestions in a room.
		suggestions: async (roomId, token) => {
			const out = [];
			let cursor = null;
			for (let page = 0; page < 5; page++) {
				const answer = await call(`${rooms}/${roomId}/suggestions`, withToken(token, {query: {limit: 100, cursor}}));
				(answer?.items || []).forEach((row) => {
					const s = siloSuggestionFrom(row || {});
					if (s) out.push(s);
				});
				cursor = answer?.page?.has_more === true ? answer.page.next_cursor : null;
				if (!cursor) break;
			}
			return out.sort(compareSuggestions);
		},
		suggest: (roomId, token, {suggestionId, contentId, title, subtitle}) => call(`${rooms}/${roomId}/suggestions`, withToken(token, {
			method: 'POST',
			body: {suggestion_id: suggestionId, content_id: contentId, content_type: 'movie', title, ...(subtitle ? {subtitle} : null)}
		})),
		vote: (roomId, token, suggestionId, voted) => call(`${rooms}/${roomId}/suggestions/${suggestionId}/vote`,
			withToken(token, {method: voted ? 'POST' : 'DELETE'})),
		removeSuggestion: (roomId, token, suggestionId) => call(`${rooms}/${roomId}/suggestions/${suggestionId}`,
			withToken(token, {method: 'DELETE'})),
		close: (roomId) => call(`${rooms}/${roomId}`, {method: 'DELETE'}),
		// What each connected member has watched of these titles: unseen, in progress (with a position) or watched.
		// The host's start buttons wait on it, so it gives up after five seconds.
		memberState: (roomId, token, contentIds) => call(`${rooms}/${roomId}/member-state`,
			withToken(token, {method: 'POST', body: {content_ids: contentIds}, timeoutMs: 5000})),
		// Single use, at most 30 seconds. It rides in the offered protocols, never the URL.
		socketTicket: async (roomId, token) => {
			const answer = await call(`${rooms}/${roomId}/ws-ticket`, withToken(token, {method: 'POST'}));
			if (!text(answer?.ticket) || answer.protocol !== SILO_ROOM_PROTOCOL) throw new Error('Silo sent no room socket ticket');
			return answer.ticket;
		},
		socketUrl: (roomId) => `${String(baseUrl).replace(/\/+$/, '').replace(/^http/, 'ws')}${rooms}/${roomId}/ws`,
		// Moonbase keeps the host's subtitles and members' avatars for a room; without it each member picks their own.
		moonbase: async (path, options = {}) => {
			const plugin = await findSiloMoonbase(baseUrl, () => call('/api/v2/settings/plugins'));
			if (!plugin) throw Object.assign(new Error('No Moonbase on this Silo'), {status: 404});
			return call(`${plugin}/Moonfin/WatchParty/${path}`, options);
		}
	};
};

/**
 * Moonbase's room routes, shaped like Silo's so the party below runs on either. `call(path, options)` is a request
 * under `<moonbase>/Moonfin/WatchParty` that throws with the answer's `status` and `code`. Every room call carries the
 * member's token from the create or join answer, so this api belongs to one room.
 */
export const createMoonbaseWatchPartyApi = ({call}) => {
	let token = null;
	const opened = (answer) => {
		if (!answer?.room || !text(answer.token)) throw new Error('Expected a watch party room from Moonbase');
		token = answer.token;
		return {room: siloRoomFrom(answer.room), token};
	};
	const room = (answer) => {
		if (!answer?.room) throw new Error('Expected a watch party room from Moonbase');
		return siloRoomFrom(answer.room);
	};
	const inRoom = (roomId, path, options = {}) => call(`/Rooms/${encodeURIComponent(roomId)}${path}`,
		{...options, headers: {...options.headers, 'X-Moonfin-Room-Token': token}});
	const post = (body) => ({method: 'POST', ...(body ? {body} : null)});
	return {
		config: () => call('/Config'),
		rooms: async () => ((await call('/Rooms'))?.rooms || []).map(roomSummaryFrom).filter(Boolean),
		create: async (roomId) => opened(await call('/Rooms', post({room_id: roomId}))),
		join: async (input, pin) => opened(await call('/Join', post({...moonbaseJoinBody(input), ...(pin ? {pin} : null)}))),
		joinRoom: async (roomId, pin) => opened(await call('/Join', post({room_id: roomId, ...(pin ? {pin} : null)}))),
		stage: async (roomId, contentId) => room(await inRoom(roomId, '/Stage', post({content_id: contentId}))),
		start: async (roomId, positionSeconds) => room(await inRoom(roomId, '/Start', post({position_seconds: positionSeconds || 0}))),
		stop: async (roomId) => room(await inRoom(roomId, '/Stop', post())),
		setPolicy: async (roomId, policy) => room(await inRoom(roomId, '/Policy', post({guest_control_policy: policy}))),
		setPin: async (roomId, pin) => room(await inRoom(roomId, '/Pin', post({pin: pin || null}))),
		setVoting: async (roomId, voting) => room(await inRoom(roomId, '/Voting', post({voting}))),
		suggestions: async (roomId) => ((await inRoom(roomId, '/Suggestions'))?.suggestions || [])
			.map((row) => siloSuggestionFrom(row || {})).filter(Boolean).sort(compareSuggestions),
		suggest: (roomId, _token, {contentId}) => inRoom(roomId, '/Suggestions', post({content_id: contentId})),
		vote: (roomId, _token, suggestionId, voted) => inRoom(roomId, `/Suggestions/${encodeURIComponent(suggestionId)}/Vote`, post({voted})),
		removeSuggestion: (roomId, _token, suggestionId) => inRoom(roomId, `/Suggestions/${encodeURIComponent(suggestionId)}`, {method: 'DELETE'}),
		promote: async (roomId, memberId) => room(await inRoom(roomId, '/Promote', post({member_id: memberId}))),
		remove: (roomId, memberId) => inRoom(roomId, '/Remove', post({member_id: memberId})),
		close: (roomId) => inRoom(roomId, '/Close', post()),
		leave: (roomId) => inRoom(roomId, '/Leave', post()),
		events: (roomId, cursor) => inRoom(roomId, `/Events?cursor=${Number(cursor) || 0}&wait=25`, {timeoutMs: EVENTS_TIMEOUT_MS}),
		messages: (roomId, messages) => inRoom(roomId, '/Messages', post({messages}))
	};
};

const describeError = (err) => {
	if (err?.status === 404) return 'No room has that code.';
	return err?.problem?.detail || err?.message || String(err);
};

/**
 * The app's one Watch Party. `silo()` is a Silo api (createApiForServer's) for the signed-in profile, or null when the
 * current server isn't Silo, and `moonbase()` is the same for a Jellyfin, Emby or Plex login with a `call` to its
 * Moonbase. `sync` is syncPlay.js. Listeners hear every change of `state()`.
 */
export const createWatchParty = ({silo, moonbase = () => null, sync = syncPlay, now = () => Date.now()}) => {
	const listeners = new Set();
	let client = null;
	// silo or moonbase, for the room we're in
	let kind = null;
	let api = null;
	let room = null;
	let roomToken = null;
	let error = null;
	let errorCode = null;
	let endedReason = null;
	let busy = false;
	let connected = false;
	let suggestions = [];
	let groupSubtitle = null;
	let groupSubtitlesSupported = false;
	let avatars = {};
	let item = null;

	// Moonbase only: the chat, reactions in flight, the latest toast, and the start's wait and countdown (local ms).
	let chat = [];
	let reactions = [];
	let toast = null;
	let countdownAt = null;
	let countdownTimer = null;
	let waitingSince = null;
	let feedSeq = 0;
	// A join that needs the room's PIN, kept so the PIN can be sent with it.
	let lastJoin = null;
	let pinRequest = null;
	let cursor = 0;
	let everConnected = false;
	// The lobby status this member last answered, so a status-only report goes once per change.
	let lobbyReportedFor = '';
	let noSessionStatus = null;
	let lineUpFor = null;
	let configCache = null;

	let socket = null;
	let socketGeneration = 0;
	let reconnectAttempt = 0;
	let reconnectTimer = null;
	let pingTimer = null;
	let samplesThisSocket = 0;
	const clockSamples = [];

	// Following: the room is fed to the players as a SyncPlay group.
	let following = false;
	let openedRevision = null;
	let lastCommand = null;
	let appliedCommandId = null;
	let appliedTimer = null;
	let attachSentFor = null;
	let attachSentAt = 0;
	let reportTimer = null;
	let reportEvery = null;
	let bufferingTimer = null;
	let bufferingReported = false;
	let hostStopping = false;
	// A start the host asked to pick up part way: Silo starts every room at the beginning, so the host seeks the room
	// there once its player is in, while the room still holds everyone paused waiting for them to load.
	let pendingResume = null;
	let aloneTimer = null;
	let partyPoll = null;
	let avatarTimer = null;

	const state = () => ({room, connected, busy, error, errorCode, endedReason, suggestions, groupSubtitle, groupSubtitlesSupported,
		backend: kind, chat, reactions, toast, countdownAt, waitingSince, pinRequest});
	const emit = () => listeners.forEach((listener) => listener(state()));

	const current = () => {
		const s = silo();
		if (s) return {client: s, kind: 'silo'};
		const m = moonbase();
		return m ? {client: m, kind: 'moonbase'} : null;
	};
	const apiFor = (backend) => (backend.kind === 'moonbase'
		? createMoonbaseWatchPartyApi({call: backend.client.call})
		: createWatchPartyApi({call: backend.client.siloCall, baseUrl: backend.client.baseUrl}));

	const showToast = (next) => {
		toast = {id: ++feedSeq, ...next};
	};

	// Moonbase takes messages by POST and answers a ping's pong in the reply.
	const postMessages = (messages) => {
		const id = room?.roomId;
		api.messages(id, messages).then((answer) => {
			if (room?.roomId !== id) return;
			(Array.isArray(answer?.messages) ? answer.messages : []).forEach(onFrame); // eslint-disable-line no-use-before-define
		}).catch((err) => {
			if (room?.roomId !== id) return;
			if (err?.status === 404) leaveRoom('closed'); // eslint-disable-line no-use-before-define
			else console.info('[WatchParty]', err?.code || err?.status, err?.message || '');
		});
	};

	const send = (message) => {
		if (!connected) return false;
		if (kind === 'moonbase') {
			postMessages([message]);
			return true;
		}
		if (!socket) return false;
		socket.send(JSON.stringify(message));
		return true;
	};

	const player = () => sync.getPlayer();
	const sessionId = () => player()?.sessionId?.() || null;
	const positionSeconds = () => (player()?.sample().positionTicks || 0) / TICKS_PER_SECOND;
	const isPaused = () => !player()?.sample().isPlaying;
	const isBuffering = () => Boolean(player()?.isBuffering?.());
	const attached = () => Boolean(sessionId() && room?.attachedSessionId === sessionId());
	const readyPending = () => room?.playbackState === 'waiting' && lastCommand?.playbackState === 'waiting';

	// Clock

	const sendPing = () => {
		clearTimeout(pingTimer);
		send({type: 'ping', client_sent_at: new Date(now()).toISOString()});
		// Every 2 s until four samples, then every 15 s.
		pingTimer = setTimeout(sendPing, samplesThisSocket < 4 ? 2000 : 15000);
	};

	const onPong = (frame) => {
		const t0 = Date.parse(frame.client_sent_at || '');
		const t1 = Date.parse(frame.server_received_at || '');
		const t2 = Date.parse(frame.server_sent_at || '');
		if (isNaN(t0) || isNaN(t1) || isNaN(t2)) return;
		samplesThisSocket++;
		clockSamples.push(clockSample(t0, t1, t2, now()));
		if (clockSamples.length > 8) clockSamples.shift();
		sync.setServerTimeOffset(serverOffsetOf(clockSamples));
	};

	// Reports

	// Moonbase shows everyone the status each member reports, and Silo takes none.
	const withStatus = (status) => (kind === 'moonbase' ? {status} : null);

	// A Moonbase lobby shows who's ready, so a member says so once its long-poll runs, and once more only if the
	// server shows another status after that.
	const reportLobby = () => {
		if (kind !== 'moonbase' || !connected || !room || isRoomPlaying(room)) return;
		const status = String(room.members.find((m) => m.isSelf)?.status);
		if (status === 'ready' || status === lobbyReportedFor) return;
		lobbyReportedFor = status;
		send({type: 'state_report', session_id: null, position_seconds: 0, is_paused: true, status: 'ready'});
	};

	// Unlike Silo, Moonbase sends no command to a player that attaches after the room's play, or missed it while it
	// prepared, so it gets the play from here, once per command, from where the room has got to.
	const lineUp = () => {
		const session = sessionId();
		if (kind !== 'moonbase' || !attached() || room.playbackState !== 'playing' || room.isPaused || isBuffering()) return;
		if (player()?.sample().isPlaying !== false) return;
		const serverNow = now() + serverOffsetOf(clockSamples);
		if (lastCommand && serverNow < Date.parse(lastCommand.executeAt) + 1500) return;
		const key = `${session}:${lastCommand?.commandId || 'join'}`;
		if (lineUpFor === key) return;
		lineUpFor = key;
		const executeAtMs = serverNow + 1000;
		const from = room.anchorAt != null
			? {seconds: room.anchorPositionSeconds, at: room.anchorAt}
			: {seconds: lastCommand?.positionSeconds || 0, at: Date.parse(lastCommand?.executeAt || '') || executeAtMs};
		sync.feedRoomMessage({MessageType: 'SyncPlayCommand', Data: asSyncPlayCommand({
			action: 'play', positionSeconds: from.seconds + Math.max(0, executeAtMs - from.at) / 1000,
			executeAt: new Date(executeAtMs).toISOString(), playbackState: 'playing'
		})});
	};

	const tick = () => {
		const session = sessionId();
		if (!connected || !isRoomPlaying(room)) return;
		if (!session) {
			// With the player closed or still opening, Moonbase hears that once per change.
			const away = room.playbackState === 'waiting' ? 'joining' : 'not_watching';
			if (kind === 'moonbase' && noSessionStatus !== away &&
				send({type: 'state_report', session_id: null, position_seconds: 0, is_paused: true, status: away})) noSessionStatus = away;
			return;
		}
		noSessionStatus = null;
		if (room.attachedSessionId !== session) {
			// Again after five seconds: an attach the server refused (sent just before the room started) isn't retried
			// by anything else.
			if (attachSentFor !== session || now() - attachSentAt > 5000) {
				attachSentFor = session;
				attachSentAt = now();
				send({type: 'attach_session', session_id: session});
			}
			return;
		}
		lineUp();
		if (pendingResume && room.isHost) {
			const resume = pendingResume;
			if (room.selectedContentId !== resume.contentId) {
				pendingResume = null;
			} else {
				// Ahead of the ready report, so the room can't set off from the beginning before the seek lands.
				if (send({type: 'transport_request', action: 'seek', position_seconds: resume.seconds, is_paused: false})) pendingResume = null;
				return;
			}
		}
		const buffering = isBuffering();
		if (readyPending()) {
			const near = lastCommand.action !== 'seek' ||
				Math.abs(positionSeconds() - lastCommand.positionSeconds) <= (room.isHost ? 15 : 1);
			if (appliedCommandId === lastCommand.commandId && near && !buffering && !player()?.seekPending?.()) {
				// A waiting room takes readiness on a state report, so a lost ready heals on the next tick.
				send({type: 'state_report', session_id: session, command_id: lastCommand.commandId,
					position_seconds: positionSeconds(), is_paused: isPaused(), is_ready: true, ...withStatus('ready')});
				return;
			}
		}
		// A stalled player reports where it stopped, not a decision.
		if (buffering) return;
		// In sync or catching up is the server's to judge from the position, which a member can't see from its side.
		const status = readyPending() ? 'joining' : (player()?.seekPending?.() ? 'catching_up' : null);
		send({type: 'state_report', session_id: session, ...(appliedCommandId ? {command_id: appliedCommandId} : null),
			position_seconds: positionSeconds(), is_paused: isPaused(), ...(status ? withStatus(status) : null)});
	};

	const scheduleReports = () => {
		const every = isRoomPlaying(room) ? (readyPending() ? WAITING_REPORT_MS : (kind === 'moonbase' ? MOONBASE_REPORT_MS : REPORT_MS)) : null;
		if (every === reportEvery) return;
		clearInterval(reportTimer);
		reportEvery = every;
		reportTimer = every ? setInterval(tick, every) : null;
	};

	// Following the room in the player

	const feedGroup = (Type, Data) => sync.feedRoomMessage({MessageType: 'SyncPlayGroupUpdate', Data: {Type, Data}});

	const startFollowing = () => {
		if (following) return;
		following = true;
		sync.setRoomDriver(driver); // eslint-disable-line no-use-before-define
		feedGroup('GroupJoined', {GroupId: room.roomId, GroupName: room.code, State: syncPlayStateOf(room),
			Participants: room.members.filter((m) => m.connected).map((m) => m.displayName)});
	};

	const stopFollowing = () => {
		clearTimeout(appliedTimer);
		clearInterval(reportTimer);
		clearTimeout(bufferingTimer);
		reportTimer = null;
		reportEvery = null;
		bufferingTimer = null;
		bufferingReported = false;
		lastCommand = null;
		appliedCommandId = null;
		attachSentFor = null;
		if (!following) return;
		following = false;
		// The player closes on the Stop, then the group is gone.
		sync.feedRoomMessage({MessageType: 'SyncPlayCommand', Data: {Command: 'Stop'}});
		feedGroup('GroupLeft', null);
		sync.setRoomDriver(null);
	};

	// The room's item, read once per selection. A failed read isn't kept, so Play now can try it again.
	const selectedItem = () => {
		const id = room?.selectedContentId;
		if (!id || !client) return Promise.resolve(null);
		if (item?.id !== id) {
			const entry = {id};
			entry.promise = client.getItem(id).catch(() => {
				if (item === entry) item = null;
				return null;
			});
			item = entry;
		}
		return item.promise;
	};

	// Opens the room's item in the player, held paused: only the room's commands start it.
	const openSelection = async (target) => {
		const raw = await selectedItem();
		if (!raw || room?.selectionRevision !== target.selectionRevision || !following) return;
		const source = partySource(raw, target.selectedFileId);
		const audio = defaultAudioIndex(source);
		const subtitles = subtitleIndexFor(groupSubtitle, source);
		// Snapshots only come on changes, so a player reopened mid-run starts where the room is now instead of seeking
		// there after it opens.
		const running = target.playbackState === 'playing' && !target.isPaused && target.anchorAt != null;
		const startSeconds = target.anchorPositionSeconds +
			(running ? Math.max(0, now() + serverOffsetOf(clockSamples) - target.anchorAt) / 1000 : 0);
		sync.feedRoomMessage({MessageType: 'SyncPlayGroupUpdate', Data: {Type: 'PlayQueue', Data: {
			Playlist: [{ItemId: target.selectedContentId, PlaylistItemId: `${target.roomId}:${target.selectionRevision}`}],
			PlayingItemIndex: 0,
			StartPositionTicks: Math.round(startSeconds * TICKS_PER_SECOND),
			IsPlaying: false,
			Reason: 'NewPlaylist',
			PlaybackOptions: {
				...(target.selectedFileId ? {mediaSourceId: target.selectedFileId} : null),
				...(audio != null ? {audioStreamIndex: audio} : null),
				...(subtitles != null ? {subtitleStreamIndex: subtitles} : null)
			}
		}}});
	};

	const onCommand = (command) => {
		const session = sessionId();
		if (command.sessionId && command.sessionId !== session) return;
		lastCommand = command;
		clearTimeout(appliedTimer);
		const syncCommand = asSyncPlayCommand(command);
		sync.feedRoomMessage({MessageType: 'SyncPlayCommand', Data: syncCommand});
		// The player runs it at its server time; from then it counts as applied.
		const delay = Math.max(0, Date.parse(command.executeAt) - (now() + serverOffsetOf(clockSamples)));
		appliedTimer = setTimeout(() => {
			appliedCommandId = command.commandId;
			bufferingReported = false;
			scheduleReports();
			tick();
		}, delay);
		scheduleReports();
		if (kind !== 'moonbase') return;
		if (command.countdown) {
			// The 3, 2, 1 runs out when the play does.
			countdownAt = now() + delay;
			clearTimeout(countdownTimer);
			countdownTimer = setTimeout(() => {
				countdownAt = null;
				emit();
			}, delay + 600);
		} else if (command.byMemberId && command.byMemberId !== room?.selfMemberId && command.playbackState !== 'waiting') {
			showToast({kind: command.action, name: command.byName, seconds: command.positionSeconds});
		}
		emit();
	};

	const onNotice = (frame) => {
		const self = Boolean(room?.selfMemberId) && frame.member_id === room.selfMemberId;
		const name = frame.display_name || '';
		switch (frame.kind) {
			case 'joined':
			case 'left':
				if (self) return;
				showToast({kind: frame.kind, name});
				break;
			case 'host_changed':
				showToast({kind: 'host', name, self});
				break;
			case 'switched':
				showToast({kind: 'switched', name, title: frame.content_title || ''});
				break;
			case 'no_access':
				showToast({kind: 'no_access'});
				break;
			default:
				// policy_changed shows from the snapshot that carries the new policy.
				return;
		}
		emit();
	};

	// Next episode, staged for the host when one finishes.
	const stageNextEpisode = async (contentId) => {
		try {
			const raw = await selectedItem();
			if (raw?.Type !== 'Episode' || !raw.SeriesId) return;
			const episodes = (await client.getEpisodes(raw.SeriesId))?.Items || [];
			const next = nextEpisodeId(episodes, contentId);
			// Only while the lobby still holds the finished episode.
			if (next && room && !isRoomPlaying(room) && room.selectedContentId === contentId) await stage(next); // eslint-disable-line no-use-before-define
		} catch (err) {
			console.warn('[WatchParty] Staging the next episode failed', err);
		}
	};

	// A host alone in the lobby for ten minutes ends the room. Not while something plays: a member whose TV slept
	// shows as disconnected and comes back.
	const checkAlone = () => {
		const alone = () => room?.isHost && !isRoomPlaying(room) && room.members.filter((m) => m.connected).length <= 1;
		if (!alone()) {
			clearTimeout(aloneTimer);
			aloneTimer = null;
			return;
		}
		if (!aloneTimer) {
			aloneTimer = setTimeout(() => {
				aloneTimer = null;
				if (alone()) end(); // eslint-disable-line no-use-before-define
			}, ALONE_MS);
		}
	};

	const loadSuggestions = async () => {
		if (!room || !roomToken) return;
		if (!room.isVoting) {
			suggestions = [];
			emit();
			return;
		}
		try {
			suggestions = await api.suggestions(room.roomId, roomToken);
			emit();
		} catch (err) {
			console.warn('[WatchParty] Loading suggestions failed', err);
		}
	};

	// A socket broadcast says nobody voted, so this viewer's own votes carry over.
	const onSuggestions = (rows) => {
		const mine = new Set(suggestions.filter((s) => s.votedByMe).map((s) => s.id));
		suggestions = rows.map((row) => siloSuggestionFrom(row || {})).filter(Boolean)
			.map((s) => ({...s, votedByMe: mine.has(s.id)})).sort(compareSuggestions);
		emit();
	};

	const onRoom = (next) => {
		const previous = room;
		if (!previous || next.roomId !== previous.roomId || next.generation < previous.generation) return;
		room = next;
		if (next.isVoting !== previous.isVoting) loadSuggestions();
		// A start waits only on members whose playback session is attached, and the session comes after this set's
		// capabilities, whose sound path query alone takes most of a second. Asked once something is picked, they're
		// ready when the player opens.
		if (next.selectedContentId) getDeviceCapabilities().catch(() => {});
		if (isRoomPlaying(next) && next.selectedContentId) {
			startFollowing();
			feedGroup('StateUpdate', {State: syncPlayStateOf(next)});
			if (openedRevision !== next.selectionRevision) {
				openedRevision = next.selectionRevision;
				appliedCommandId = null;
				openSelection(next);
			}
		} else if (isRoomPlaying(previous)) {
			// Back in the lobby: the host stopped, or the item finished.
			const finished = !hostStopping;
			hostStopping = false;
			if (finished && next.isHost && !next.isVoting && next.selectedContentId === previous.selectedContentId) {
				stageNextEpisode(previous.selectedContentId);
			}
			openedRevision = null;
			stopFollowing();
		}
		if (kind === 'moonbase') {
			if (next.guestControlPolicy !== previous.guestControlPolicy) showToast({kind: 'policy', everyone: next.everyoneControls});
			waitingSince = isRoomPlaying(next) && next.playbackState === 'waiting' ? (waitingSince || now()) : null;
			reportLobby();
		}
		checkAlone();
		scheduleReports();
		emit();
	};

	// Socket

	const closeSocket = () => {
		connected = false;
		clearTimeout(pingTimer);
		pingTimer = null;
		if (socket) {
			socket.onclose = null;
			socket.onmessage = null;
			socket.onerror = null;
			socket.close();
			socket = null;
		}
	};

	let leaveRoom = null;

	// A socket frame's text, or a message from Moonbase's long-poll as it was parsed.
	const onFrame = (raw) => {
		let frame = raw;
		try {
			if (typeof raw === 'string') frame = JSON.parse(raw);
		} catch {
			return;
		}
		if (!frame || typeof frame !== 'object') return;
		switch (frame.type) {
			case 'snapshot':
				if (frame.room) onRoom(siloRoomFrom(frame.room));
				break;
			case 'transport_command': {
				const command = frame.command && siloRoomCommandFrom(frame.command);
				if (command) onCommand(command);
				break;
			}
			case 'pong':
				onPong(frame);
				break;
			case 'suggestions_update':
				if (Array.isArray(frame.suggestions)) onSuggestions(frame.suggestions);
				break;
			case 'room_closed':
				leaveRoom('closed');
				break;
			case 'connection_replaced':
				leaveRoom(frame.reason || 'This profile joined the Watch Party on another device.');
				break;
			case 'error':
				if (frame.code === 'not_found' || frame.code === 'gone') leaveRoom('closed');
				else console.info('[WatchParty]', frame.code, frame.message || '');
				break;
			case 'removed':
				leaveRoom('removed');
				break;
			case 'chat': {
				const message = chatMessageFrom(frame.message);
				if (!message) break;
				chat = [...chat, {...message, receivedAt: now()}].slice(-CHAT_KEEP);
				emit();
				break;
			}
			case 'chat_history':
				// Old lines never pop up over the video, so they carry no arrival time.
				chat = (Array.isArray(frame.messages) ? frame.messages : []).map(chatMessageFrom).filter(Boolean)
					.map((m) => ({...m, receivedAt: 0})).slice(-CHAT_KEEP);
				emit();
				break;
			case 'reaction': {
				if (REACTIONS.indexOf(frame.reaction) < 0) break;
				const at = now();
				reactions = [...reactions.filter((r) => at - r.at < REACTION_MS),
					{id: ++feedSeq, reaction: frame.reaction, name: frame.display_name || '', memberId: text(frame.member_id), at}];
				emit();
				break;
			}
			case 'notice':
				onNotice(frame);
				break;
			default:
				break;
		}
	};

	let connect = null;
	const scheduleReconnect = (generation) => {
		if (!room || generation !== socketGeneration) return;
		const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
		reconnectAttempt++;
		clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(() => {
			if (generation === socketGeneration) connect();
		}, delay);
	};

	// Moonbase keeps one Events call open at a time, and the first (cursor 0) answers at once with a snapshot and the
	// chat so far.
	const onPollConnected = () => {
		connected = true;
		reconnectAttempt = 0;
		attachSentFor = null;
		samplesThisSocket = 0;
		noSessionStatus = null;
		lobbyReportedFor = '';
		if (everConnected) showToast({kind: 'reconnected'});
		everConnected = true;
		sendPing();
		loadSuggestions();
		emit();
	};

	const pollEvents = async () => {
		if (!room || !roomToken) return;
		const generation = ++socketGeneration;
		while (room && generation === socketGeneration) {
			const started = now();
			let answer;
			try {
				answer = await api.events(room.roomId, cursor); // eslint-disable-line no-await-in-loop
			} catch (err) {
				if (generation !== socketGeneration) return;
				// The room is gone, or this member's token no longer gets in.
				if (err?.status === 403 || err?.status === 404) {
					leaveRoom('closed');
					return;
				}
				if (connected) {
					connected = false;
					showToast({kind: 'reconnecting'});
					emit();
				}
				await wait(RECONNECT_DELAYS_MS[Math.min(reconnectAttempt++, RECONNECT_DELAYS_MS.length - 1)]); // eslint-disable-line no-await-in-loop
				continue;
			}
			if (generation !== socketGeneration || !room) return;
			if (!connected) onPollConnected();
			if (Number.isFinite(Number(answer?.cursor))) cursor = Number(answer.cursor);
			const messages = Array.isArray(answer?.messages) ? answer.messages : [];
			messages.forEach(onFrame);
			// An empty answer that came straight back would otherwise spin.
			if (!messages.length && now() - started < 1000) await wait(1000); // eslint-disable-line no-await-in-loop
		}
	};

	const connectSocket = async () => {
		if (!room || !roomToken) return;
		const generation = ++socketGeneration;
		let ticket;
		try {
			ticket = await api.socketTicket(room.roomId, roomToken);
		} catch (err) {
			if (generation !== socketGeneration) return;
			// Refused for good: the room is gone or this proof no longer admits us.
			// 404 and 409 mean the room is gone. A 403 refuses this proof while the room may still run for the others.
			if ([403, 404, 409].includes(err?.status)) leaveRoom('closed', {keepStored: err.status === 403});
			else scheduleReconnect(generation);
			return;
		}
		if (generation !== socketGeneration) return;
		let next;
		try {
			next = await openSiloSocket(api.socketUrl(room.roomId), [SILO_ROOM_PROTOCOL, `silo.ticket.${ticket}`]);
		} catch {
			scheduleReconnect(generation);
			return;
		}
		if (generation !== socketGeneration) {
			next.close();
			return;
		}
		socket = next;
		next.onopen = () => {
			if (generation !== socketGeneration) return;
			connected = true;
			reconnectAttempt = 0;
			attachSentFor = null;
			samplesThisSocket = 0;
			sendPing();
			// Broadcasts sent while the socket was down are gone.
			loadSuggestions();
			emit();
		};
		next.onmessage = (event) => onFrame(event.data);
		// Silo closes every room socket after five minutes; a fresh ticket reconnects it.
		next.onclose = () => {
			if (generation !== socketGeneration) return;
			closeSocket();
			emit();
			scheduleReconnect(generation);
		};
		next.onerror = () => {};
	};

	connect = () => (kind === 'moonbase' ? pollEvents() : connectSocket());

	// Moonbase: the host's subtitles and members' avatars

	const loadParty = async () => {
		const id = room?.roomId;
		if (!id) return;
		try {
			const data = await api.moonbase(id);
			if (room?.roomId !== id) return;
			groupSubtitlesSupported = true;
			avatars = data?.avatars && typeof data.avatars === 'object' ? data.avatars : {};
			groupSubtitle = data?.subtitle && typeof data.subtitle === 'object' ? data.subtitle : null;
			emit();
		} catch {
			// An older Moonbase, or none: members pick their own.
		}
	};

	// An uploaded avatar's link is signed for 15 minutes, so it goes again every ten.
	const publishAvatar = async () => {
		const id = room?.roomId;
		if (!id) return;
		try {
			const profiles = (await client.siloCall('/api/v2/profiles', {profile: false}))?.items || [];
			const mine = profiles.find((p) => String(p.id) === String(client.userId()));
			// A room that ended meanwhile would be stored again.
			if (!text(mine?.avatar_url) || room?.roomId !== id) return;
			await api.moonbase(`${id}/Avatar`, {method: 'PUT', body: {url: mine.avatar_url}});
		} catch {
			// No Moonbase, or an older one: members see initials.
		}
	};

	// Silo: drops what Moonbase keeps for the room once it ends, so it stops counting toward the account's rooms for the
	// day. Moonbase lets only the host, or the account that stored it when nobody set subtitles, do that.
	const dropStoredRoom = () => {
		if (kind === 'moonbase' || !api?.moonbase || !room) return;
		api.moonbase(room.roomId, {method: 'DELETE'}).catch((err) => {
			// Not ours to end, or an older Moonbase: it expires in a day.
			console.info('[WatchParty] Ending the stored room failed', err?.status || err?.message || '');
		});
	};

	leaveRoom = (reason, {keepStored = false} = {}) => {
		if (!room && !socket) return;
		if (reason === 'closed' && !keepStored) dropStoredRoom();
		socketGeneration++;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
		closeSocket();
		stopFollowing();
		[aloneTimer, partyPoll, avatarTimer].forEach((t) => {
			clearTimeout(t);
			clearInterval(t);
		});
		aloneTimer = partyPoll = avatarTimer = null;
		room = null;
		roomToken = null;
		client = null;
		api = null;
		suggestions = [];
		groupSubtitle = null;
		groupSubtitlesSupported = false;
		avatars = {};
		item = null;
		openedRevision = null;
		pendingResume = null;
		clockSamples.length = 0;
		clearTimeout(countdownTimer);
		chat = [];
		reactions = [];
		toast = null;
		countdownAt = null;
		waitingSince = null;
		cursor = 0;
		everConnected = false;
		lineUpFor = null;
		kind = null;
		endedReason = reason;
		emit();
	};

	// Leaving on purpose tells Moonbase straight away, where Silo only notices the socket go.
	const depart = () => {
		if (kind === 'moonbase' && api && room) api.leave(room.roomId).catch(() => {});
		leaveRoom(null);
	};

	const enter = async (request) => {
		const next = current();
		if (!next) return false;
		const nextApi = apiFor(next);
		busy = true;
		error = null;
		errorCode = null;
		endedReason = null;
		emit();
		try {
			const opened = await request(nextApi);
			if (room) depart();
			client = next.client;
			kind = next.kind;
			api = nextApi;
			room = opened.room;
			roomToken = opened.token;
			pinRequest = null;
			checkAlone();
			connect();
			loadSuggestions();
			if (kind === 'silo') {
				loadParty();
				publishAvatar();
				// Avatars of members who join, and a host's subtitle change, arrive within this.
				partyPoll = setInterval(loadParty, PARTY_POLL_MS);
				avatarTimer = setInterval(publishAvatar, AVATAR_MS);
			}
			return true;
		} catch (err) {
			error = describeError(err);
			errorCode = text(err?.code);
			// The room wants its PIN: the same join goes again with it.
			pinRequest = errorCode === 'pin_required' || errorCode === 'wrong_pin' ? lastJoin : null;
			return false;
		} finally {
			busy = false;
			emit();
		}
	};

	const hostAction = async (request) => {
		if (!room || !api) return false;
		busy = true;
		error = null;
		errorCode = null;
		emit();
		try {
			onRoom(await request(api, room.roomId));
			return true;
		} catch (err) {
			error = describeError(err);
			errorCode = text(err?.code);
			return false;
		} finally {
			busy = false;
			emit();
		}
	};

	const roomCall = async (request) => {
		if (!room || !roomToken || !api) return false;
		error = null;
		errorCode = null;
		try {
			await request(api, room.roomId, roomToken);
			await loadSuggestions();
			return true;
		} catch (err) {
			error = describeError(err);
			errorCode = text(err?.code);
			emit();
			return false;
		}
	};

	const stage = async (contentId, fileId = null) => {
		if (!room && !(await enter((a) => a.create(siloNewUuid())))) return false;
		return hostAction((a, id) => a.stage(id, contentId, fileId));
	};

	const setVoting = async (voting) => {
		const done = await hostAction((a, id) => a.setVoting(id, voting));
		if (done) await loadSuggestions();
		return done;
	};

	// Stages after voting was switched off for it. If that fails the vote comes back, so the room has one or the other.
	const stageOrVoteAgain = async (contentId, fileId = null) => {
		if (await stage(contentId, fileId)) return true;
		const failed = error;
		await setVoting(true);
		error = failed;
		emit();
		return false;
	};

	const suggestMovie = (movie) => roomCall((a, id, token) => a.suggest(id, token, {
		suggestionId: siloNewUuid(), contentId: movie.Id, title: movie.Name || '',
		subtitle: movie.ProductionYear ? String(movie.ProductionYear) : null
	}));

	const join = (input, pin) => {
		lastJoin = {input};
		return enter((a) => a.join(input, pin));
	};

	const joinRoom = (summary, pin) => {
		// Joining the room this is already in would leave it first, so picking it again from Home keeps it.
		if (room && room.roomId === summary.roomId) return Promise.resolve(true);
		lastJoin = {roomId: summary.roomId, hostName: summary.hostName || ''};
		return enter((a) => a.joinRoom(summary.roomId, pin));
	};

	// Moonbase's settings for parties, kept a minute. Null without Moonbase, or when it can't host them (404).
	const readConfig = async (force = false) => {
		const backend = current();
		if (backend?.kind !== 'moonbase') return null;
		if (!force && configCache?.key === backend.client.key && now() - configCache.at < CONFIG_MS) return configCache.value;
		let value = null;
		try {
			value = await apiFor(backend).config();
		} catch {
			value = null;
		}
		configCache = {key: backend.client.key, at: now(), value};
		return value;
	};

	const end = async () => {
		if (!room || !api) return;
		try {
			await api.close(room.roomId);
			dropStoredRoom();
		} catch (err) {
			console.warn('[WatchParty] Closing the room failed', err);
			// Silo says the room is unknown (404) or already ended (409).
			if (err?.status === 404 || err?.status === 409) dropStoredRoom();
		}
		leaveRoom(null);
	};

	// What syncPlay.js hands the room while it follows it.
	const driver = {
		// Silo's server corrects a drifting member itself, and Moonbase's leaves that to the players.
		get correctsDrift() {
			return kind !== 'moonbase';
		},
		// Requests carry where this player was, and a guest without control is told so instead.
		request: (action, positionTicks) => {
			if (!attached()) return;
			if (!room?.canControlTransport) {
				showToast({kind: 'host_only'});
				emit();
				return;
			}
			const seconds = action === 'seek' ? positionTicks / TICKS_PER_SECOND : positionSeconds();
			send({type: 'transport_request', action, position_seconds: Math.max(0, seconds), is_paused: isPaused()});
		},
		readyOwed: () => !attached() || readyPending(),
		ready: () => tick(),
		// Stalls under two seconds stay local.
		buffering: () => {
			if (bufferingTimer || bufferingReported) return;
			bufferingTimer = setTimeout(() => {
				bufferingTimer = null;
				if (room?.playbackState !== 'playing' || !attached() || !isBuffering()) return;
				bufferingReported = send({type: 'buffering', session_id: sessionId(), position_seconds: positionSeconds(),
					is_paused: isPaused()});
			}, BUFFERING_GRACE_MS);
		}
	};

	return {
		state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		isSilo: () => Boolean(silo()),
		// silo or moonbase for the signed-in server, or null when neither can host a party.
		backend: () => current()?.kind || null,
		available: async () => {
			const backend = current();
			if (!backend) return false;
			if (backend.kind === 'moonbase') return (await readConfig())?.enabled === true;
			try {
				return await apiFor(backend).available();
			} catch {
				return false;
			}
		},
		config: readConfig,
		// Moonbase's rooms this user can watch. Throws when the server can't be asked.
		listRooms: async () => {
			const backend = current();
			return backend?.kind === 'moonbase' ? apiFor(backend).rooms() : [];
		},
		create: () => enter((a) => a.create(siloNewUuid())),
		join,
		// A room from the list, which has no code.
		joinRoom,
		joinWithPin: (pin) => {
			const request = pinRequest;
			if (!request) return Promise.resolve(false);
			return request.roomId ? joinRoom(request, pin) : join(request.input, pin);
		},
		cancelPin: () => {
			pinRequest = null;
			error = null;
			errorCode = null;
			emit();
		},
		stage,
		// From a title's page: a movie goes up for the vote in a voting room; anything else is the host's pick, so
		// voting is switched off for it. Opens a room first when there is none. `fileId` is the version the host chose
		// there, which the room then plays; a vote is for the title.
		pick: async (picked, fileId = null) => {
			if (room?.isVoting) {
				if (picked.Type === 'Movie') return suggestMovie(picked);
				if (!(await setVoting(false))) return false;
				return stageOrVoteAgain(picked.Id, fileId);
			}
			return stage(picked.Id, fileId);
		},
		// `atSeconds` picks the title up part way for everyone, where resumePoint says the room got to.
		startPlayback: async (atSeconds = 0) => {
			// Moonbase starts where it's asked, but Silo starts at the top, so the host seeks the room there after.
			pendingResume = kind === 'silo' && atSeconds > 0 && room?.selectedContentId ? {seconds: atSeconds, contentId: room.selectedContentId} : null;
			const started = await hostAction((a, id) => a.start(id, atSeconds));
			if (!started) pendingResume = null;
			return started;
		},
		// Where the room could resume the title the host has staged (see roomResumePoint), or null.
		resumePoint: async () => {
			const contentId = room?.selectedContentId;
			if (!api?.memberState || !room || !contentId) return null;
			try {
				return roomResumePoint(await api.memberState(room.roomId, roomToken, [contentId]), contentId);
			} catch (err) {
				console.warn('[WatchParty] Reading where members are in the title failed', err);
				return null;
			}
		},
		stopPlayback: async () => {
			pendingResume = null;
			// A stop of the host's own doesn't move on to the next episode.
			hostStopping = true;
			const done = await hostAction((a, id) => a.stop(id));
			if (!done) hostStopping = false;
			return done;
		},
		setGuestsCanPause: (allowed) => hostAction((a, id) => a.setGuestsCanPause(id, allowed)),
		// Moonbase host controls.
		setEveryoneControls: (on) => hostAction((a, id) => a.setPolicy(id, on ? 'everyone' : 'host_only')),
		setPin: (pin) => hostAction((a, id) => a.setPin(id, pin || null)),
		promote: (memberId) => hostAction((a, id) => a.promote(id, memberId)),
		removeMember: async (memberId) => {
			if (!room || !api?.remove) return false;
			try {
				await api.remove(room.roomId, memberId);
				return true;
			} catch (err) {
				error = describeError(err);
				errorCode = text(err?.code);
				emit();
				return false;
			}
		},
		sendChat: (message) => {
			const line = String(message || '').trim();
			if (kind !== 'moonbase' || !line || room?.chatEnabled === false) return false;
			return send({type: 'chat', text: line.slice(0, 500)});
		},
		sendReaction: (reaction) => (kind === 'moonbase' && REACTIONS.indexOf(reaction) >= 0 && room?.reactionsEnabled !== false
			? send({type: 'reaction', reaction}) : false),
		// The invite page's address, which the TV shows as a QR code.
		inviteUrl: () => {
			if (kind !== 'moonbase' || !room) return null;
			if (room.inviteUrl) return room.inviteUrl;
			return room.invitePath ? `${trimSlash(client?.moonbaseBase?.() || '')}${room.invitePath}` : null;
		},
		setVoting,
		searchMovies: async (query) => {
			if (!client || !String(query || '').trim()) return [];
			const answer = await client.getItems({SearchTerm: query.trim(), IncludeItemTypes: 'Movie', Recursive: true,
				Limit: 20, Fields: 'ProductionYear'});
			return (answer?.Items || []).filter((i) => i?.Id);
		},
		suggestMovie,
		vote: (suggestion, voted) => roomCall((a, id, token) => a.vote(id, token, suggestion.id, voted)),
		removeSuggestion: (suggestion) => roomCall((a, id, token) => a.removeSuggestion(id, token, suggestion.id)),
		// Silo stages only in host-pick rooms, so this ends the vote; the titles stay if voting comes back.
		pickSuggestion: async (suggestion) => {
			if (!(await setVoting(false))) return false;
			return stageOrVoteAgain(suggestion.contentId);
		},
		// Host: subtitles for everyone at the next start. `track` is a subtitle MediaStream, or null with `off` false to
		// leave them to each member.
		setGroupSubtitle: async (track, off = false) => {
			if (!room?.isHost || !api?.moonbase) return false;
			const choice = off ? {off: true} : track ? {index: track.Index, ...(track.Language ? {language: track.Language} : null)} : null;
			try {
				await api.moonbase(room.roomId, {method: 'PUT', body: {subtitle: choice}});
			} catch (err) {
				error = describeError(err);
				errorCode = text(err?.code);
				emit();
				return false;
			}
			groupSubtitle = choice;
			emit();
			return true;
		},
		selectedItem,
		avatarUrlFor: (profileId) => {
			const link = avatars[profileId] || room?.members.find((m) => m.profileId === profileId)?.avatarUrl;
			if (!link || !client) return null;
			return /^https?:/.test(link) ? link : `${String(client.baseUrl).replace(/\/+$/, '')}/${String(link).replace(/^\/+/, '')}`;
		},
		// Opens the playing item again for a viewer who left the player; the room syncs the new session once it attaches.
		openPlayer: () => {
			if (isRoomPlaying(room) && following) openSelection(room);
		},
		end,
		// Leaves without ending the room. A host's room closes on its own two minutes later unless they come back.
		leave: depart,
		clearEndedReason: () => {
			endedReason = null;
			emit();
		},
		// After a user or server switch, or a sign-out: a room that belongs to another login is left.
		onSessionChanged: () => {
			configCache = null;
			const next = current();
			if (room && (!next || next.client.key !== client?.key)) leaveRoom(null);
		}
	};
};

// The signed-in Silo profile's api, or null on any other server.
const siloNow = () => {
	const serverUrl = getServerUrl();
	const token = getApiKey();
	const userId = getUserId();
	if (!serverUrl || !token || !userId) return null;
	if (!isSiloLogin(serverUrl, token)) return null;
	const silo = createApiForServer(serverUrl, token, userId, 'silo');
	return {
		// Not the token: Silo rotates it on every refresh, and the room stays this profile's through that.
		key: `${serverUrl}|${userId}`,
		baseUrl: serverUrl,
		userId: () => userId,
		siloCall: silo.siloCall,
		getItem: (id) => silo.getItem(id),
		getEpisodes: (seriesId) => silo.getEpisodes(seriesId),
		getItems: (params) => silo.getItems(params)
	};
};

const moonbaseBase = () => (getServerType() === 'plex' ? plexMoonbaseBase(getServerUrl()) : getServerUrl());

// A request under Moonbase's watch party routes, through the app's own fetch so old webOS sets reach https servers.
const moonbaseCall = async (path, {method = 'GET', body, headers, timeoutMs = CALL_TIMEOUT_MS} = {}) => {
	const endpoint = await moonbaseEndpoint(getServerUrl(), getApiKey());
	if (!endpoint) throw Object.assign(new Error('No Moonbase on this server'), {status: 404});
	const response = await (endpoint.fetch || platformFetch)(`${endpoint.base}/Moonfin/WatchParty${path}`, {
		method,
		headers: {...endpoint.headers, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : null), ...headers},
		body: body ? JSON.stringify(body) : undefined
	}, timeoutMs);
	const raw = await response.text();
	let json = null;
	try {
		json = raw ? JSON.parse(raw) : null;
	} catch {
		json = null;
	}
	if (!response.ok) {
		throw Object.assign(new Error(text(json?.message) || `Watch party request failed (${response.status})`),
			{status: response.status, code: text(json?.code)});
	}
	return json;
};

// The signed-in Jellyfin, Emby or Plex login, whose Moonbase may host parties. Silo keeps its own.
const moonbaseNow = () => {
	const serverUrl = getServerUrl();
	const token = getApiKey();
	const userId = getUserId();
	if (!serverUrl || !token || !userId || getServerType() === 'silo' || isSiloLogin(serverUrl, token)) return null;
	return {
		key: `${serverUrl}|${userId}`,
		baseUrl: serverUrl,
		moonbaseBase,
		call: moonbaseCall,
		getItem: (id) => serverApi.getItem(id),
		getEpisodes: (seriesId) => serverApi.getEpisodes(seriesId),
		getItems: (params) => serverApi.getItems(params)
	};
};

export const watchParty = createWatchParty({silo: siloNow, moonbase: moonbaseNow});
