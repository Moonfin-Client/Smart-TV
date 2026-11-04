// Silo's Watch Party (/api/v2/watch-together): rooms joined with a code, kept in step over the room socket
// (`silo.room.v2`). Ported from Moonfin-Core's SiloWatchPartyApi and SiloWatchPartyManager.
//
// The players already follow a group for Jellyfin's SyncPlay, so while a room plays it is fed to them as one
// (syncPlay.js `feedRoomMessage`): the room's transport commands become SyncPlay commands at the same server time, and
// the players' play, pause and seek requests come back here as room requests. TVs don't correct drift by playback rate
// (Core's `_correctsByRate` is off on TV), so the players' own drift seeks are what Core does there too.
//
// Silo's rules for the numbers below: docs/architecture/watch-party-synchronization.md in silo-server.

import {createApiForServer, getApiKey, getServerUrl, getUserId} from './jellyfinApi';
import {getDeviceCapabilities} from './deviceProfile';
import * as syncPlay from './syncPlay';
import {findSiloMoonbase} from './siloMoonbase';
import {isSiloLogin} from './moonbaseEndpoint';
import {siloNewUuid} from './siloPlayback';
import {openSiloSocket} from './siloSocket';

export const SILO_ROOM_PROTOCOL = 'silo.room.v2';
const TICKS_PER_SECOND = 10000000;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000];
const REPORT_MS = 1500;
const WAITING_REPORT_MS = 500;
const BUFFERING_GRACE_MS = 2000;
const ALONE_MS = 10 * 60 * 1000;
const PARTY_POLL_MS = 15000;
const AVATAR_MS = 10 * 60 * 1000;

const text = (value) => (typeof value === 'string' && value ? value : null);

/** A room snapshot (`WatchTogetherRoomSnapshot`), as the room routes and the socket's `snapshot` frame send it. */
export const siloRoomFrom = (json = {}) => {
	const file = json.selected_file_id;
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
		guestsCanPause: json.guest_control_policy === 'guest_play_pause',
		anchorPositionSeconds: Number(json.anchor_position_seconds) || 0,
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
			connected: m.connected === true
		}))
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
		playbackState: json.playback_state || ''
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
		memberState: (roomId, token, contentIds) => call(`${rooms}/${roomId}/member-state`,
			withToken(token, {method: 'POST', body: {content_ids: contentIds}})),
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

const describeError = (err) => {
	if (err?.status === 404) return 'No room has that code.';
	return err?.problem?.detail || err?.message || String(err);
};

/**
 * The app's one Watch Party. `silo()` is a Silo api (createApiForServer's) for the signed-in profile, or null when the
 * current server isn't Silo; `sync` is syncPlay.js. Listeners hear every change of `state()`.
 */
export const createWatchParty = ({silo, sync = syncPlay, now = () => Date.now()}) => {
	const listeners = new Set();
	let client = null;
	let api = null;
	let room = null;
	let roomToken = null;
	let error = null;
	let endedReason = null;
	let busy = false;
	let connected = false;
	let suggestions = [];
	let groupSubtitle = null;
	let groupSubtitlesSupported = false;
	let avatars = {};
	let item = null;

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

	const state = () => ({room, connected, busy, error, endedReason, suggestions, groupSubtitle, groupSubtitlesSupported});
	const emit = () => listeners.forEach((listener) => listener(state()));

	const send = (message) => {
		if (!socket || !connected) return false;
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

	const tick = () => {
		const session = sessionId();
		if (!connected || !isRoomPlaying(room) || !session) return;
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
					position_seconds: positionSeconds(), is_paused: isPaused(), is_ready: true});
				return;
			}
		}
		// A stalled player reports where it stopped, not a decision.
		if (buffering) return;
		send({type: 'state_report', session_id: session, ...(appliedCommandId ? {command_id: appliedCommandId} : null),
			position_seconds: positionSeconds(), is_paused: isPaused()});
	};

	const scheduleReports = () => {
		const every = isRoomPlaying(room) ? (readyPending() ? WAITING_REPORT_MS : REPORT_MS) : null;
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
		sync.feedRoomMessage({MessageType: 'SyncPlayGroupUpdate', Data: {Type: 'PlayQueue', Data: {
			Playlist: [{ItemId: target.selectedContentId, PlaylistItemId: `${target.roomId}:${target.selectionRevision}`}],
			PlayingItemIndex: 0,
			StartPositionTicks: Math.round(target.anchorPositionSeconds * TICKS_PER_SECOND),
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

	const onFrame = (raw) => {
		let frame;
		try {
			frame = JSON.parse(raw);
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

	connect = async () => {
		if (!room || !roomToken) return;
		const generation = ++socketGeneration;
		let ticket;
		try {
			ticket = await api.socketTicket(room.roomId, roomToken);
		} catch (err) {
			if (generation !== socketGeneration) return;
			// Refused for good: the room is gone or this proof no longer admits us.
			if ([403, 404, 409].includes(err?.status)) leaveRoom('closed');
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
			if (!text(mine?.avatar_url)) return;
			await api.moonbase(`${id}/Avatar`, {method: 'PUT', body: {url: mine.avatar_url}});
		} catch {
			// No Moonbase, or an older one: members see initials.
		}
	};

	leaveRoom = (reason) => {
		if (!room && !socket) return;
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
		endedReason = reason;
		emit();
	};

	const enter = async (request) => {
		const next = silo();
		if (!next) return false;
		const nextApi = createWatchPartyApi({call: next.siloCall, baseUrl: next.baseUrl});
		busy = true;
		error = null;
		endedReason = null;
		emit();
		try {
			const opened = await request(nextApi);
			if (room) leaveRoom(null);
			client = next;
			api = nextApi;
			room = opened.room;
			roomToken = opened.token;
			checkAlone();
			connect();
			loadSuggestions();
			loadParty();
			publishAvatar();
			// Avatars of members who join, and a host's subtitle change, arrive within this.
			partyPoll = setInterval(loadParty, PARTY_POLL_MS);
			avatarTimer = setInterval(publishAvatar, AVATAR_MS);
			return true;
		} catch (err) {
			error = describeError(err);
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
		emit();
		try {
			onRoom(await request(api, room.roomId));
			return true;
		} catch (err) {
			error = describeError(err);
			return false;
		} finally {
			busy = false;
			emit();
		}
	};

	const roomCall = async (request) => {
		if (!room || !roomToken || !api) return false;
		error = null;
		try {
			await request(api, room.roomId, roomToken);
			await loadSuggestions();
			return true;
		} catch (err) {
			error = describeError(err);
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

	const end = async () => {
		if (!room || !api) return;
		try {
			await api.close(room.roomId);
		} catch (err) {
			console.warn('[WatchParty] Closing the room failed', err);
		}
		leaveRoom(null);
	};

	// What syncPlay.js hands the room while it follows it.
	const driver = {
		// Requests carry where this player was; guests without control are ignored, as in Core.
		request: (action, positionTicks) => {
			if (!attached() || !room?.canControlTransport) return;
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
		available: async () => {
			const s = silo();
			if (!s) return false;
			try {
				return await createWatchPartyApi({call: s.siloCall, baseUrl: s.baseUrl}).available();
			} catch {
				return false;
			}
		},
		create: () => enter((a) => a.create(siloNewUuid())),
		join: (input) => enter((a) => a.join(input)),
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
			pendingResume = atSeconds > 0 && room?.selectedContentId ? {seconds: atSeconds, contentId: room.selectedContentId} : null;
			const started = await hostAction((a, id) => a.start(id));
			if (!started) pendingResume = null;
			return started;
		},
		// Where the room could resume the title the host has staged (see roomResumePoint), or null.
		resumePoint: async () => {
			const contentId = room?.selectedContentId;
			if (!api || !room || !contentId) return null;
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
			if (!room?.isHost || !api) return false;
			const choice = off ? {off: true} : track ? {index: track.Index, ...(track.Language ? {language: track.Language} : null)} : null;
			try {
				await api.moonbase(room.roomId, {method: 'PUT', body: {subtitle: choice}});
			} catch (err) {
				error = describeError(err);
				emit();
				return false;
			}
			groupSubtitle = choice;
			emit();
			return true;
		},
		selectedItem,
		avatarUrlFor: (profileId) => {
			const link = avatars[profileId];
			if (!link || !client) return null;
			return /^https?:/.test(link) ? link : `${String(client.baseUrl).replace(/\/+$/, '')}/${String(link).replace(/^\/+/, '')}`;
		},
		// Opens the playing item again for a viewer who left the player; the room syncs the new session once it attaches.
		openPlayer: () => {
			if (isRoomPlaying(room) && following) openSelection(room);
		},
		end,
		// Leaves without ending the room. A host's room closes on its own two minutes later unless they come back.
		leave: () => leaveRoom(null),
		clearEndedReason: () => {
			endedReason = null;
			emit();
		},
		// After a user or server switch, or a sign-out: a room that belongs to another login is left.
		onSessionChanged: () => {
			const next = silo();
			if (room && (!next || next.key !== client?.key)) leaveRoom(null);
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

export const watchParty = createWatchParty({silo: siloNow});
