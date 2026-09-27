import * as remoteControl from './remoteControl';
import * as systemVolume from './systemVolume';

jest.mock('../platform', () => ({getPlatform: () => 'tizen'}));
jest.mock('./systemVolume', () => ({
	getVolumeState: jest.fn(),
	setVolume: jest.fn(() => Promise.resolve(true)),
	setMuted: jest.fn(() => Promise.resolve(true)),
	lastVolumeState: jest.fn()
}));

const playstate = (Command, extra = {}) => remoteControl.handleMessage({MessageType: 'Playstate', Data: {Command, ...extra}});
const command = (Name, Arguments = {}) => remoteControl.handleMessage({MessageType: 'GeneralCommand', Data: {Name, Arguments}});
const play = (Data) => remoteControl.handleMessage({MessageType: 'Play', Data});

const controls = (names) => names.reduce((all, name) => ({...all, [name]: jest.fn()}), {});

const PLAYER_ACTIONS = ['pause', 'resume', 'playPause', 'stop', 'release', 'seek', 'next', 'previous', 'rewind', 'fastForward',
	'setAudioStream', 'setSubtitleStream', 'setRepeatMode', 'setShuffle'];

let player;
let app;
let unregisterPlayer;
let unregisterApp;
let volume;

beforeEach(() => {
	player = {current: controls(PLAYER_ACTIONS)};
	app = {current: controls(['goHome', 'goToSearch', 'showMessage', 'playItems', 'queueItems'])};
	unregisterPlayer = remoteControl.setPlayerControls(player);
	unregisterApp = remoteControl.setAppControls(app);
	volume = {volume: 40, muted: false};
	systemVolume.getVolumeState.mockImplementation(() => Promise.resolve({...volume}));
	systemVolume.setVolume.mockImplementation((level) => {
		volume.volume = level;
		return Promise.resolve(true);
	});
	systemVolume.setMuted.mockImplementation((muted) => {
		volume.muted = muted;
		return Promise.resolve(true);
	});
});

afterEach(() => {
	remoteControl.reset();
	unregisterPlayer();
	unregisterApp();
	jest.clearAllMocks();
});

describe('remote control', () => {
	test('offers the commands another client can send', () => {
		expect(remoteControl.SUPPORTED_COMMANDS).toEqual([
			'DisplayMessage', 'SetVolume', 'Mute', 'Unmute', 'ToggleMute', 'SetAudioStreamIndex',
			'SetSubtitleStreamIndex', 'SetRepeatMode', 'SetShuffleQueue', 'GoHome', 'GoToSearch', 'SendString', 'VolumeUp', 'VolumeDown',
			'MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'Select', 'Back'
		]);
	});

	test('hands each play state command to the player, whatever its case', async () => {
		await playstate('Pause');
		await playstate('Unpause');
		await playstate('play');
		await playstate('PlayPause');
		await playstate('Stop');
		await playstate('NextTrack');
		await playstate('PreviousTrack');
		await playstate('Rewind');
		await playstate('FastForward');

		expect(player.current.pause).toHaveBeenCalledTimes(1);
		expect(player.current.resume).toHaveBeenCalledTimes(2);
		expect(player.current.playPause).toHaveBeenCalledTimes(1);
		expect(player.current.stop).toHaveBeenCalledTimes(1);
		expect(player.current.next).toHaveBeenCalledTimes(1);
		expect(player.current.previous).toHaveBeenCalledTimes(1);
		expect(player.current.rewind).toHaveBeenCalledTimes(1);
		expect(player.current.fastForward).toHaveBeenCalledTimes(1);
	});

	test('seeks to the position asked for, the start included', async () => {
		await playstate('Seek', {SeekPositionTicks: 600000000});
		await playstate('Seek', {SeekPositionTicks: 0});
		await playstate('Seek', {});

		expect(player.current.seek.mock.calls).toEqual([[600000000], [0]]);
	});

	test('does nothing with play state while no player is up', async () => {
		unregisterPlayer();

		await expect(playstate('Pause')).resolves.toBeUndefined();
	});

	test('shows a message under its header, or leaves the header to the app', async () => {
		await command('DisplayMessage', {Header: 'From the server', Text: ' Hello '});
		await command('DisplayMessage', {Text: 'No header'});
		await command('DisplayMessage', {Text: '   '});

		expect(app.current.showMessage.mock.calls).toEqual([['Hello', 'From the server'], ['No header', null]]);
	});

	test('sets the volume from a level or a fraction and keeps it in range', async () => {
		await command('SetVolume', {Volume: '70'});
		expect(volume.volume).toBe(70);
		await command('SetVolume', {Volume: '0.25'});
		expect(volume.volume).toBe(25);
		await command('SetVolume', {Volume: '150'});
		expect(volume.volume).toBe(100);
	});

	test('lifts a mute for any level above silence', async () => {
		volume.muted = true;

		await command('SetVolume', {Volume: 30});
		expect(volume.muted).toBe(false);

		volume.muted = true;
		await command('SetVolume', {Volume: 0});
		expect(volume.muted).toBe(true);
	});

	test('steps the volume by ten from where the set is, within its range', async () => {
		await command('VolumeUp');
		expect(volume.volume).toBe(50);

		volume.volume = 5;
		await command('VolumeDown');
		expect(volume.volume).toBe(0);

		volume.volume = 95;
		await command('VolumeUp');
		expect(volume.volume).toBe(100);
	});

	test('mutes, unmutes and toggles the set', async () => {
		await command('Mute');
		expect(volume.muted).toBe(true);
		await command('ToggleMute');
		expect(volume.muted).toBe(false);
		await command('ToggleMute');
		expect(volume.muted).toBe(true);
		await command('Unmute');
		expect(volume.muted).toBe(false);
	});

	test('presses the key the TV remote would for a move, a select and a back', async () => {
		unregisterPlayer();
		const pressed = [];
		const record = (e) => pressed.push([e.type, e.keyCode, e.key, e.fromRemote]);
		document.addEventListener('keydown', record);
		document.addEventListener('keyup', record);

		await command('MoveUp');
		await command('MoveDown');
		await command('MoveLeft');
		await command('MoveRight');
		await command('Select');
		await command('Back');

		document.removeEventListener('keydown', record);
		document.removeEventListener('keyup', record);
		expect(pressed).toEqual([
			['keydown', 38, 'ArrowUp', true], ['keyup', 38, 'ArrowUp', true],
			['keydown', 40, 'ArrowDown', true], ['keyup', 40, 'ArrowDown', true],
			['keydown', 37, 'ArrowLeft', true], ['keyup', 37, 'ArrowLeft', true],
			['keydown', 39, 'ArrowRight', true], ['keyup', 39, 'ArrowRight', true],
			['keydown', 13, 'Enter', true], ['keyup', 13, 'Enter', true],
			['keydown', 10009, 'GoBack', true], ['keyup', 10009, 'GoBack', true]
		]);
	});

	test('picks tracks by their index, with any negative subtitle turning them off', async () => {
		await command('SetAudioStreamIndex', {Index: '2'});
		await command('SetSubtitleStreamIndex', {Index: '4'});
		await command('SetSubtitleStreamIndex', {Index: '-5'});
		await command('SetAudioStreamIndex', {Index: 'x'});

		expect(player.current.setAudioStream.mock.calls).toEqual([[2]]);
		expect(player.current.setSubtitleStream.mock.calls).toEqual([[4], [-1]]);
	});

	test('reads repeat and shuffle the way the server names them', async () => {
		await command('SetRepeatMode', {RepeatMode: 'RepeatAll'});
		await command('SetRepeatMode', {RepeatMode: 'RepeatOne'});
		await command('SetRepeatMode', {RepeatMode: 'RepeatNone'});
		await command('SetShuffleQueue', {ShuffleMode: 'Shuffle'});
		await command('SetShuffleQueue', {ShuffleMode: 'Sorted'});

		expect(player.current.setRepeatMode.mock.calls).toEqual([['all'], ['one'], ['off']]);
		expect(player.current.setShuffle.mock.calls).toEqual([[true], [false]]);
	});

	test('going home stops what plays before it leaves', async () => {
		const order = [];
		player.current.stop.mockImplementation(() => {
			order.push('stop');
			return Promise.resolve();
		});
		app.current.goHome.mockImplementation(() => order.push('home'));

		await command('GoHome');

		expect(order).toEqual(['stop', 'home']);
	});

	test('idle volume and Home do not require a player', async () => {
		unregisterPlayer();
		await command('VolumeUp');
		expect(volume.volume).toBe(50);
		await command('VolumeDown');
		expect(volume.volume).toBe(40);
		await command('ToggleMute');
		expect(volume.muted).toBe(true);
		await command('GoHome');
		expect(app.current.goHome).toHaveBeenCalledTimes(1);
		expect(player.current.stop).not.toHaveBeenCalled();
	});

	test('Select reaches the focused control while a player is active', async () => {
		const control = document.createElement('button');
		document.body.appendChild(control);
		control.focus();
		const select = jest.fn();
		control.addEventListener('keydown', select);
		await command('Select');
		expect(select).toHaveBeenCalledTimes(1);
		expect(select.mock.calls[0][0].key).toBe('Enter');
		expect(player.current.playPause).not.toHaveBeenCalled();
		control.remove();
	});

	test('Back and Home cancel search still waiting for player exit', async () => {
		for (const navigation of ['Back', 'GoHome']) {
			let stopped;
			player.current.stop.mockImplementationOnce(() => new Promise((resolve) => { stopped = resolve; }));
			const opening = command('GoToSearch', {MoonfinInputId: navigation});
			await command(navigation);
			stopped();
			await opening;
			expect(app.current.goToSearch).not.toHaveBeenCalled();
		}
	});

	test('a delayed Home cannot replace a newer Search', async () => {
		let stopped;
		const stopping = new Promise(resolve => { stopped = resolve; });
		player.current.stop.mockReturnValue(stopping);
		const home = command('GoHome');
		const search = command('GoToSearch', {MoonfinInputId: 'new-search'});
		stopped();
		await Promise.all([home, search]);
		expect(app.current.goHome).not.toHaveBeenCalled();
		expect(app.current.goToSearch).toHaveBeenCalledTimes(1);
	});

	test('plays what another client sends, from where it asked', async () => {
		await play({ItemIds: ['a', 'b'], StartIndex: 1, StartPositionTicks: 50, AudioStreamIndex: 3, MediaSourceId: 'src'});

		expect(app.current.playItems).toHaveBeenCalledWith(['a', 'b'], {
			startIndex: 1,
			startPositionTicks: 50,
			audioStreamIndex: 3,
			subtitleStreamIndex: null,
			mediaSourceId: 'src'
		});
	});

	test('buffers typing during player exit and delivers it when Search mounts', async () => {
		let stopped;
		player.current.stop.mockImplementation(() => new Promise((resolve) => { stopped = resolve; }));
		const opening = command('GoToSearch', {MoonfinInputId: 'phone'});
		await command('SendString', {String: 'alien', MoonfinInputId: 'phone', MoonfinRevision: '1'});
		expect(app.current.goToSearch).not.toHaveBeenCalled();
		stopped();
		await opening;
		const search = app.current.goToSearch.mock.calls[0][0];
		const changed = jest.fn();
		search.attach(changed);
		expect(changed).toHaveBeenCalledWith('alien');
		await command('SendString', {String: ''});
		expect(changed).toHaveBeenLastCalledWith('');
	});

	test('an older opening cannot replace a newer remote search', async () => {
		let stopped;
		player.current.stop.mockImplementationOnce(() => new Promise((resolve) => { stopped = resolve; }));
		const old = command('GoToSearch', {MoonfinInputId: 'old'});
		await command('GoToSearch', {MoonfinInputId: 'new'});
		stopped();
		await old;
		expect(app.current.goToSearch).toHaveBeenCalledTimes(1);
	});

	test('logout cancels pending Search navigation and text', async () => {
		let stopped;
		player.current.stop.mockImplementation(() => new Promise((resolve) => { stopped = resolve; }));
		const opening = command('GoToSearch', {MoonfinInputId: 'phone'});
		remoteControl.reset();
		stopped();
		await opening;
		await command('SendString', {String: 'ignored', MoonfinInputId: 'phone', MoonfinRevision: '1'});
		expect(app.current.goToSearch).not.toHaveBeenCalled();
	});

	test('plain text from another controller opens Search with it', async () => {
		await command('SendString', {String: 'alien'});
		expect(player.current.stop).toHaveBeenCalledTimes(1);
		const search = app.current.goToSearch.mock.calls[0][0];
		const changed = jest.fn();
		search.attach(changed);
		expect(changed).toHaveBeenCalledWith('alien');
	});

	test('a phone edit after its search ended does not reopen Search', async () => {
		await command('GoToSearch', {MoonfinInputId: 'phone'});
		app.current.goToSearch.mock.calls[0][0].close();
		await command('SendString', {String: 'late', MoonfinInputId: 'phone', MoonfinRevision: '1'});
		expect(app.current.goToSearch).toHaveBeenCalledTimes(1);
	});

	test('queues after what plays for PlayNext and at the end for PlayLast or Enqueue', async () => {
		await play({ItemIds: ['a'], PlayCommand: 'PlayNext'});
		await play({ItemIds: ['b'], PlayCommand: 'PlayLast'});
		await play({ItemIds: ['c'], PlayCommand: 'Enqueue'});
		await play({ItemIds: []});

		expect(app.current.queueItems.mock.calls).toEqual([[['a'], true], [['b'], false], [['c'], false]]);
		expect(app.current.playItems).not.toHaveBeenCalled();
	});

	test('an older player closing leaves the newer one in charge', () => {
		const newer = {current: controls(PLAYER_ACTIONS)};
		const unregisterNewer = remoteControl.setPlayerControls(newer);

		unregisterPlayer();
		playstate('Pause');
		expect(newer.current.pause).toHaveBeenCalledTimes(1);

		unregisterNewer();
		playstate('Pause');
		expect(newer.current.pause).toHaveBeenCalledTimes(1);
	});

	test('lets the running player go before something else takes its place', async () => {
		await remoteControl.releasePlayer();

		expect(player.current.release).toHaveBeenCalledTimes(1);
	});
});
