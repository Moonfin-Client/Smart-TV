import * as systemVolume from './systemVolume';
import {KEYS} from '../utils/keys';
import {createRemoteSearch} from './remoteSearch';

// Answers another client driving this one through the server: play state, volume, a message, the
// d-pad, home, and things sent to play. The server only offers the commands named here.
export const SUPPORTED_COMMANDS = [
	'DisplayMessage',
	'SetVolume',
	'Mute',
	'Unmute',
	'ToggleMute',
	'SetAudioStreamIndex',
	'SetSubtitleStreamIndex',
	'SetRepeatMode',
	'SetShuffleQueue',
	'GoHome',
	'GoToSearch',
	'SendString',
	'VolumeUp',
	'VolumeDown',
	'MoveUp',
	'MoveDown',
	'MoveLeft',
	'MoveRight',
	'Select',
	'Back'
];

const VOLUME_STEP = 10;

const REPEAT_MODES = {repeatall: 'all', repeatone: 'one'};

// What the app and the running player hand over, each as a ref so a command always reaches the
// latest version of them.
let appRef = null;
let playerRef = null;
let unbindSocket = null;
let remoteSearch = null;
let navigationGeneration = 0;

export const setAppControls = (ref) => {
	appRef = ref;
	return () => {
		if (appRef === ref) appRef = null;
	};
};

export const setPlayerControls = (ref) => {
	playerRef = ref;
	return () => {
		if (playerRef === ref) playerRef = null;
	};
};

const app = () => appRef?.current || null;
const player = () => playerRef?.current || null;

// Lets the running player report its stop and let go of the stream before another item takes
// its place.
export const releasePlayer = async () => {
	await player()?.release();
};

const clampVolume = (value) => Math.min(100, Math.max(0, value));

// Some senders give a fraction of one and others a level out of a hundred.
const normalizeVolume = (raw) => {
	const parsed = parseFloat(raw);
	const value = isFinite(parsed) ? parsed : 100;
	return clampVolume(value <= 1 ? value * 100 : value);
};

const toInt = (raw) => {
	const value = parseInt(raw, 10);
	return isFinite(value) ? value : null;
};

// A level the remote asks for has to be heard, so anything above silence lifts a mute.
const applyVolume = async (level) => {
	const target = clampVolume(level);
	await systemVolume.setVolume(target);
	const state = await systemVolume.getVolumeState();
	if (target > 0 && state?.muted) {
		await systemVolume.setMuted(false);
		await systemVolume.getVolumeState();
	}
};

const stepVolume = async (delta) => {
	const state = await systemVolume.getVolumeState();
	if (state) await applyVolume(state.volume + delta);
};

const setMuted = async (muted) => {
	await systemVolume.setMuted(muted);
	await systemVolume.getVolumeState();
};

const KEY_NAMES = {
	[KEYS.UP]: 'ArrowUp',
	[KEYS.DOWN]: 'ArrowDown',
	[KEYS.LEFT]: 'ArrowLeft',
	[KEYS.RIGHT]: 'ArrowRight',
	[KEYS.ENTER]: 'Enter',
	[KEYS.BACK]: 'GoBack'
};

// A move, select or back goes in as the key the TV's own remote sends, so every screen answers it
// the way it answers a press. Each half lands on whatever holds focus by then, as a real release
// does. The mark lets back tell a remote's press from the viewer's own.
const pressKey = (keyCode) => {
	['keydown', 'keyup'].forEach((type) => {
		const event = document.createEvent('Event');
		event.initEvent(type, true, true);
		event.keyCode = keyCode;
		event.which = keyCode;
		event.key = KEY_NAMES[keyCode];
		event.fromRemote = true;
		(document.activeElement || document.body).dispatchEvent(event);
	});
};

const handlePlaystate = async (data) => {
	const target = player();
	if (!target || typeof data?.Command !== 'string') return;
	switch (data.Command.toLowerCase()) {
		case 'pause':
			target.pause();
			break;
		case 'unpause':
		case 'play':
			target.resume();
			break;
		case 'stop':
			await target.stop();
			break;
		case 'seek': {
			const ticks = toInt(data.SeekPositionTicks);
			if (ticks != null && ticks >= 0) target.seek(ticks);
			break;
		}
		case 'nexttrack':
			target.next();
			break;
		case 'previoustrack':
			target.previous();
			break;
		case 'playpause':
			target.playPause();
			break;
		case 'rewind':
			target.rewind();
			break;
		case 'fastforward':
			target.fastForward();
			break;
		default:
			break;
	}
};

const openRemoteSearch = async (search) => {
	navigationGeneration++;
	if (!app()?.goToSearch) return;
	remoteSearch?.close();
	remoteSearch = search;
	try {
		await player()?.stop();
		if (search.active) app()?.goToSearch(search);
	} catch (error) {
		search.close();
		throw error;
	}
};

const handleGeneralCommand = async (data) => {
	if (typeof data?.Name !== 'string') return;
	const args = data.Arguments || {};
	const arg = (key) => (args[key] == null ? null : String(args[key]));
	switch (data.Name.toLowerCase()) {
		case 'displaymessage': {
			const text = arg('Text');
			if (text && text.trim()) app()?.showMessage(text.trim(), arg('Header'));
			break;
		}
		case 'setvolume':
			if (arg('Volume') != null) await applyVolume(normalizeVolume(arg('Volume')));
			break;
		case 'mute':
			await setMuted(true);
			break;
		case 'unmute':
			await setMuted(false);
			break;
		case 'togglemute': {
			const state = await systemVolume.getVolumeState();
			await setMuted(!state?.muted);
			break;
		}
		case 'volumeup':
			await stepVolume(VOLUME_STEP);
			break;
		case 'volumedown':
			await stepVolume(-VOLUME_STEP);
			break;
		case 'moveup':
			pressKey(KEYS.UP);
			break;
		case 'movedown':
			pressKey(KEYS.DOWN);
			break;
		case 'moveleft':
			pressKey(KEYS.LEFT);
			break;
		case 'moveright':
			pressKey(KEYS.RIGHT);
			break;
		case 'select':
			pressKey(KEYS.ENTER);
			break;
		case 'back':
			navigationGeneration++;
			remoteSearch?.close();
			pressKey(KEYS.BACK);
			break;
		case 'setaudiostreamindex': {
			const index = toInt(arg('Index'));
			if (index != null) player()?.setAudioStream(index);
			break;
		}
		case 'setsubtitlestreamindex': {
			const index = toInt(arg('Index'));
			if (index != null) player()?.setSubtitleStream(index < 0 ? -1 : index);
			break;
		}
		case 'setrepeatmode': {
			const mode = arg('RepeatMode');
			if (mode != null) player()?.setRepeatMode(REPEAT_MODES[mode.toLowerCase()] || 'off');
			break;
		}
		case 'setshufflequeue':
			if (arg('ShuffleMode') != null) player()?.setShuffle(arg('ShuffleMode').toLowerCase() === 'shuffle');
			break;
		case 'gohome': {
			const generation = ++navigationGeneration;
			remoteSearch?.close();
			await player()?.stop();
			if (generation === navigationGeneration) app()?.goHome();
			break;
		}
		case 'gotosearch':
			await openRemoteSearch(createRemoteSearch(arg('MoonfinInputId')));
			break;
		case 'sendstring':
			if (remoteSearch?.active) {
				app()?.notifyInteraction?.();
				remoteSearch.receive(args);
			} else if (arg('MoonfinInputId') == null) {
				// Another controller's text has no Search to land in yet, so it opens one.
				// Edits from a phone whose input session ended stay dropped.
				const search = createRemoteSearch(null);
				search.receive(args);
				await openRemoteSearch(search);
			}
			break;
		default:
			break;
	}
};

// PlayNow, and anything a sender leaves unnamed, starts the items here. PlayNext puts them after
// what's playing and PlayLast or Enqueue after everything already queued.
const handlePlay = (data) => {
	const itemIds = Array.isArray(data?.ItemIds) ? data.ItemIds.filter(Boolean).map(String) : [];
	if (!itemIds.length || !app()) return;
	const command = (data.PlayCommand || 'PlayNow').toLowerCase();
	if (command === 'playnext' || command === 'playlast' || command === 'enqueue') {
		app().queueItems(itemIds, command === 'playnext');
		return;
	}
	navigationGeneration++;
	remoteSearch?.close();
	app().playItems(itemIds, {
		startIndex: toInt(data.StartIndex) || 0,
		startPositionTicks: toInt(data.StartPositionTicks),
		audioStreamIndex: toInt(data.AudioStreamIndex),
		subtitleStreamIndex: toInt(data.SubtitleStreamIndex),
		mediaSourceId: data.MediaSourceId ? String(data.MediaSourceId) : null
	});
};

export const handleMessage = (message) => {
	switch (message?.MessageType) {
		case 'Playstate':
			return handlePlaystate(message.Data);
		case 'GeneralCommand':
			return handleGeneralCommand(message.Data);
		case 'Play':
			return handlePlay(message.Data);
		default:
			return undefined;
	}
};

export const bindTo = (listen) => {
	if (unbindSocket) unbindSocket();
	unbindSocket = listen((message) => {
		handleMessage(message)?.catch?.(() => {});
	});
};

export const reset = () => {
	navigationGeneration++;
	remoteSearch?.close();
	remoteSearch = null;
	if (unbindSocket) unbindSocket();
	unbindSocket = null;
};
