import {handleMessage, reset} from './remoteControl';

jest.mock('../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('./systemVolume', () => ({
	getVolumeState: jest.fn(() => Promise.resolve({volume: 40, muted: false})),
	setVolume: jest.fn(() => Promise.resolve(true)),
	setMuted: jest.fn(() => Promise.resolve(true))
}));

const command = Name => handleMessage({MessageType: 'GeneralCommand', Data: {Name}});

afterEach(() => {
	reset();
	jest.clearAllMocks();
});

test('LG receives its own Back code and all navigation without a player', async () => {
	const button = document.createElement('button');
	document.body.appendChild(button);
	button.focus();
	const events = [];
	const capture = event => events.push([event.type, event.keyCode, event.fromRemote]);
	button.addEventListener('keydown', capture);
	button.addEventListener('keyup', capture);
	for (const name of ['MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'Select', 'Back']) {
		await command(name);
	}
	expect(events).toEqual([38, 40, 37, 39, 13, 461].flatMap(code => [
		['keydown', code, true], ['keyup', code, true]
	]));
	button.remove();
});
