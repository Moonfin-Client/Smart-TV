jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (s) => s}));
jest.mock('../services/serverLogger', () => ({
	__esModule: true,
	default: {debug: jest.fn(), error: jest.fn(), LOG_CATEGORIES: {APP: 'app'}}
}));

let startEmulator;
let destroyEmulator;

// Stands in for the class loader.js builds, so a second launch goes through the cached path.
class FakeEmulator {
	constructor (selector, config) {
		this.config = config;
		this.functions = {};
		this.gamepad = {terminate: jest.fn()};
		this.gameManager = {toggleMainLoop: jest.fn()};
		this.Module = {AL: {currentCtx: {interval: 7, audioCtx: {close: jest.fn(() => Promise.resolve())}}}};
		FakeEmulator.configs.push(config);
		FakeEmulator.instances.push(this);
	}

	on (event, cb) {
		(this.functions[event] = this.functions[event] || []).push(cb);
	}

	callEvent (event) {
		(this.functions[event] || []).forEach((cb) => cb());
	}

	startGameError (message) {
		this.failedToStart = true;
		this.textElem = {innerText: message};
	}
}

// Leaves things in the page the way EmulatorJS does while it builds its UI and loads the core,
// and the way the core does while the game starts.
const pageListeners = {onResize: jest.fn(), onVisibility: jest.fn()};
class ListeningEmulator extends FakeEmulator {
	constructor (selector, config) {
		super(selector, config);
		this.bindListeners();
	}

	createElement (type) {
		return document.createElement(type);
	}

	bindListeners () {
		window.addEventListener('resize', pageListeners.onResize);
	}

	initGameCore () {
		this.coreScript = this.createElement('script');
		document.body.appendChild(this.coreScript);
	}

	startGame () {
		this.polls = {memory: performance.memory, battery: navigator.getBattery};
		document.addEventListener('visibilitychange', pageListeners.onVisibility);
		this.started = true;
		this.callEvent('start');
	}
}

// What the bundle does once it has loaded, before loader.js builds the emulator from it.
const loadBundle = () => {
	window.EmulatorJS = ListeningEmulator;
	window.EJS_emulator = new ListeningEmulator('#game', {});
	return window.EJS_emulator;
};

const firePageEvents = () => {
	window.dispatchEvent(new Event('resize'));
	document.dispatchEvent(new Event('visibilitychange'));
};

const latest = () => FakeEmulator.instances[FakeEmulator.instances.length - 1];

// What EmulatorJS does once the core, the game and the save have loaded.
const startGame = (emu) => {
	emu.started = true;
	emu.callEvent('start');
};

const launch = (opts) => startEmulator({selector: '#game', core: 'nes', gameUrl: 'blob:rom', ...opts});

// jsdom never runs the appended loader.js, so this does what it would: build the emulator from
// the EJS_ globals and fire ready.
const bootThroughLoader = (opts) => {
	const booting = launch(opts);
	window.EJS_emulator = new FakeEmulator('#game', {gameUrl: window.EJS_gameUrl, loadState: window.EJS_loadStateURL});
	window.EJS_ready();
	return booting;
};

const launchThroughLoader = async (opts) => {
	const booting = bootThroughLoader(opts);
	startGame(window.EJS_emulator);
	await booting;
};

const launchCached = async (opts) => {
	const booting = launch(opts);
	latest().callEvent('ready');
	startGame(latest());
	await booting;
};

const loadModule = () => {
	jest.resetModules();
	jest.clearAllMocks();
	delete window.EmulatorJS;
	({startEmulator, destroyEmulator} = require('./emulatorjs'));
	FakeEmulator.configs = [];
	FakeEmulator.instances = [];
};

describe('startEmulator save state', () => {
	beforeEach(loadModule);

	afterEach(() => {
		destroyEmulator();
	});

	test('hands the save to EmulatorJS through the loader', async () => {
		const save = new Uint8Array([1, 2, 3]);

		await launchThroughLoader({stateBytes: save});

		expect(FakeEmulator.configs[0].loadState).toBe(save);
	});

	test('leaves no save behind for the next launch', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([1])});

		destroyEmulator();

		expect(window.EJS_loadStateURL).toBeUndefined();
	});

	test('hands the save to a cached emulator', async () => {
		const save = new Uint8Array([4, 5]);
		await launchThroughLoader();
		destroyEmulator();

		await launchCached({stateBytes: save});

		expect(FakeEmulator.configs[1].loadState).toBe(save);
	});

	test('a cached emulator never loads the previous launch\'s save', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([6])});
		destroyEmulator();

		await launchCached();

		expect(FakeEmulator.configs[1].loadState).toBeUndefined();
	});
});

describe('startEmulator data path', () => {
	beforeEach(loadModule);

	afterEach(() => {
		destroyEmulator();
	});

	test('loads EmulatorJS from the path the server gave', async () => {
		const booting = launch({dataPath: 'https://server/Moonfin/EmulatorJS/data/'});

		expect(document.querySelector('script').src).toBe('https://server/Moonfin/EmulatorJS/data/loader.js');
		expect(window.EJS_pathtodata).toBe('https://server/Moonfin/EmulatorJS/data/');
		window.EJS_emulator = new FakeEmulator('#game', {});
		window.EJS_ready();
		startGame(window.EJS_emulator);
		await booting;
	});

	test('falls back to the CDN without one', async () => {
		await launchThroughLoader();

		expect(document.querySelector('script').src).toBe('https://cdn.emulatorjs.org/stable/data/loader.js');
	});

	test('hands the path to a cached emulator too', async () => {
		await launchThroughLoader();
		destroyEmulator();

		await launchCached({dataPath: 'https://server/data/'});

		expect(FakeEmulator.configs[1].dataPath).toBe('https://server/data/');
	});
});

describe('startEmulator boot', () => {
	beforeEach(loadModule);

	afterEach(() => {
		destroyEmulator();
	});

	test('waits past ready for the game to start', async () => {
		let done = false;
		const booting = bootThroughLoader().then(() => { done = true; });
		await Promise.resolve();

		expect(done).toBe(false);

		startGame(window.EJS_emulator);
		await booting;
		expect(done).toBe(true);
	});

	test('a game that started before ready still counts', async () => {
		const booting = launch();
		window.EJS_emulator = new FakeEmulator('#game', {});
		startGame(window.EJS_emulator);

		window.EJS_ready();

		await booting;
	});

	test('fails when EmulatorJS can\'t start the game', async () => {
		const booting = bootThroughLoader();
		const emu = window.EJS_emulator;

		emu.startGameError('Error downloading core');

		await expect(booting).rejects.toThrow('emulator-start-failed');
		expect(emu.failedToStart).toBe(true);
	});

	test('fails on an error EmulatorJS showed before ready', async () => {
		const booting = launch({core: 'psp'});
		window.EJS_emulator = new FakeEmulator('#game', {});
		window.EJS_emulator.startGameError('Error for site owner');

		window.EJS_ready();

		await expect(booting).rejects.toThrow('emulator-start-failed');
	});

	test('a cached emulator fails the same way', async () => {
		await launchThroughLoader();
		destroyEmulator();
		const booting = launch();
		latest().callEvent('ready');

		latest().startGameError('Failed to start game');

		await expect(booting).rejects.toThrow('emulator-start-failed');
	});

	test('tearing down mid-boot stops waiting on it', async () => {
		jest.useFakeTimers();
		const serverLogger = require('../services/serverLogger').default;
		const booting = launch();

		destroyEmulator();
		jest.advanceTimersByTime(60000);
		jest.useRealTimers();

		await expect(booting).rejects.toThrow('emulator-destroyed');
		expect(serverLogger.error).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('never became ready'), expect.anything(), false);
	});
});

describe('destroyEmulator', () => {
	beforeEach(loadModule);

	test('stops everything a running game leaves behind', async () => {
		await launchThroughLoader();
		const emu = window.EJS_emulator;
		const exit = jest.fn();
		emu.on('exit', exit);
		emu.saveSaveInterval = 8;
		const clear = jest.spyOn(window, 'clearInterval');

		destroyEmulator();

		expect(emu.gamepad.terminate).toHaveBeenCalled();
		expect(emu.gameManager.toggleMainLoop).toHaveBeenCalledWith(0);
		expect(exit).toHaveBeenCalled();
		expect(emu.Module.AL.currentCtx.audioCtx.close).toHaveBeenCalled();
		expect(clear).toHaveBeenCalledWith(8);
		expect(clear).toHaveBeenCalledWith(7);
		clear.mockRestore();
	});

	test('stops the audio of a core that failed partway through starting', async () => {
		const booting = bootThroughLoader();
		const emu = window.EJS_emulator;
		emu.startGameError('Failed to start game');
		await expect(booting).rejects.toThrow('emulator-start-failed');
		const clear = jest.spyOn(window, 'clearInterval');

		destroyEmulator();

		expect(clear).toHaveBeenCalledWith(7);
		expect(emu.Module.AL.currentCtx.audioCtx.close).toHaveBeenCalled();
		clear.mockRestore();
	});

	test('destroys its own on-screen joysticks and leaves any others', async () => {
		await launchThroughLoader();
		const emu = window.EJS_emulator;
		emu.elements = {parent: document.createElement('div')};
		const zone = document.createElement('div');
		emu.elements.parent.appendChild(zone);
		const own = {options: {zone}, destroy: jest.fn()};
		const other = {options: {zone: document.createElement('div')}, destroy: jest.fn()};
		window.nipplejs = {factory: [own, other]};

		destroyEmulator();

		expect(own.destroy).toHaveBeenCalled();
		expect(other.destroy).not.toHaveBeenCalled();
		delete window.nipplejs;
	});

	test('takes the core\'s script out of the page', async () => {
		const booting = launch();
		const emu = loadBundle();
		window.EJS_ready();
		emu.initGameCore();
		emu.startGame();
		await booting;

		destroyEmulator();

		expect(emu.coreScript.isConnected).toBe(false);
	});

	test('starts the core without the battery and memory it would poll forever', async () => {
		const getBattery = jest.fn();
		navigator.getBattery = getBattery;
		Object.defineProperty(Object.getPrototypeOf(performance), 'memory', {get: () => ({}), configurable: true});
		const booting = launch();
		const emu = loadBundle();
		window.EJS_ready();

		emu.startGame();
		await booting;

		expect(emu.polls).toEqual({memory: undefined, battery: undefined});
		expect(navigator.getBattery).toBe(getBattery);
		expect(performance.memory).toEqual({});
		delete navigator.getBattery;
		delete Object.getPrototypeOf(performance).memory;
	});

	test('takes off the page listeners the emulator and its core added, and leaves the app\'s', async () => {
		const booting = launch();
		const emu = loadBundle();
		const appListener = jest.fn();
		window.addEventListener('resize', appListener);
		window.EJS_ready();
		emu.startGame();
		await booting;

		destroyEmulator();
		firePageEvents();

		expect(pageListeners.onResize).not.toHaveBeenCalled();
		expect(pageListeners.onVisibility).not.toHaveBeenCalled();
		expect(appListener).toHaveBeenCalled();
		window.removeEventListener('resize', appListener);
	});

	test('a game torn down mid-boot is shut down once it starts', async () => {
		const booting = launch();
		const emu = loadBundle();
		window.EJS_ready();
		const exit = jest.fn();
		emu.on('exit', exit);

		destroyEmulator();
		await expect(booting).rejects.toThrow('emulator-destroyed');
		expect(exit).not.toHaveBeenCalled();

		emu.startGame();
		firePageEvents();

		expect(exit).toHaveBeenCalledTimes(1);
		expect(emu.Module.AL.currentCtx.audioCtx.close).toHaveBeenCalled();
		expect(pageListeners.onVisibility).not.toHaveBeenCalled();
	});
});

// A stand-in for the control screen EmulatorJS builds: player tabs, a gamepad picker, one row per
// button with a gamepad and a keyboard box, the Reset, Clear and Close footer, and the popup it
// shows while waiting for a button.
const buildControlScreen = () => {
	const el = (tag, className) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	};
	const emu = {
		controls: {0: {0: {value: 88, value2: 'BUTTON_2'}, 1: {value: 90, value2: 'BUTTON_1'}}, 1: {}},
		checkGamepadInputs: jest.fn(),
		saveSettings: jest.fn()
	};
	const menu = el('div');
	const tabs = el('ul', 'ejs_control_player_bar');
	['Player 1', 'Player 2'].forEach((name, i) => {
		const tab = el('li', i === 0 ? 'ejs_control_selected' : '');
		const link = el('a');
		link.textContent = name;
		link.addEventListener('click', () => {
			tabs.querySelectorAll('li').forEach((t) => t.classList.remove('ejs_control_selected'));
			tab.classList.add('ejs_control_selected');
		});
		tab.appendChild(link);
		tabs.appendChild(tab);
	});
	menu.appendChild(tabs);
	const picker = el('select', 'ejs_gamepad_dropdown');
	['notconnected', 'pad'].forEach((value) => {
		const option = el('option');
		option.value = value;
		picker.appendChild(option);
	});
	menu.appendChild(picker);
	const popup = el('div');
	popup.setAttribute('hidden', '');
	const box = el('div');
	emu.controlPopup = el('div');
	box.appendChild(emu.controlPopup);
	popup.appendChild(box);
	['B', 'A'].forEach((label, button) => {
		const row = el('div', 'ejs_control_bar');
		row.setAttribute('data-label', label);
		row.appendChild(el('input'));
		row.appendChild(el('input'));
		row.getClientRects = () => [{}];
		row.addEventListener('mousedown', () => {
			popup.removeAttribute('hidden');
			emu.controlPopup.setAttribute('button-num', String(button));
			emu.controlPopup.setAttribute('player-num', '0');
		});
		menu.appendChild(row);
	});
	['Reset', 'Clear', 'Close'].forEach((name) => {
		const button = el('div', 'ejs_button');
		button.textContent = name;
		if (name === 'Close') button.addEventListener('click', () => { menu.style.display = 'none'; });
		menu.appendChild(button);
	});
	menu.appendChild(popup);
	menu.style.display = 'none';
	document.body.appendChild(menu);
	emu.controlMenu = menu;
	return {emu, popup, picker, tabs};
};

describe('controller screen', () => {
	let emulatorjs;

	beforeEach(() => {
		jest.resetModules();
		emulatorjs = require('./emulatorjs');
		window.HTMLElement.prototype.scrollIntoView = jest.fn();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		delete window.EJS_emulator;
	});

	test('does not open without an emulator', () => {
		expect(emulatorjs.openControls()).toBe(false);
	});

	test('opens on the first row', () => {
		const {emu} = buildControlScreen();
		window.EJS_emulator = emu;

		expect(emulatorjs.openControls()).toBe(true);

		expect(emu.controlMenu.style.display).toBe('');
		expect(emu.controlMenu.querySelector('.ejs_control_bar').style.outline).not.toBe('');
	});

	test('the d-pad walks the tabs, the gamepad picker, the rows, and the footer', () => {
		const {emu, picker, tabs} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		const change = jest.fn();
		picker.addEventListener('change', change);

		emulatorjs.controlInput('DPAD_UP');
		emulatorjs.controlInput('DPAD_RIGHT');
		expect(picker.selectedIndex).toBe(1);
		expect(change).toHaveBeenCalled();

		emulatorjs.controlInput('DPAD_UP');
		emulatorjs.controlInput('DPAD_RIGHT');
		expect(tabs.querySelectorAll('li')[1].classList.contains('ejs_control_selected')).toBe(true);

		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		const footer = emu.controlMenu.querySelectorAll('.ejs_button');
		expect(footer[0].style.outline).not.toBe('');
	});

	test('OK on a row asks for a gamepad button, or a keyboard key in the second column', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();

		emulatorjs.controlInput('BUTTON_2');
		expect(popup.getAttribute('hidden')).toBeNull();
		expect(emu.controlPopup.innerText).toBe('[ B ]\nPress Gamepad');

		emulatorjs.controlInput('BACK');
		emulatorjs.controlInput('DPAD_RIGHT');
		emulatorjs.controlInput('BUTTON_2');
		expect(emu.controlPopup.innerText).toBe('[ B ]\nPress a physical keyboard key');
	});

	test('OK while the popup waits clears the gamepad binding', () => {
		const {emu, popup} = buildControlScreen();
		const save = emu.saveSettings;
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		emulatorjs.controlInput('BUTTON_2');

		expect(emu.controls[0][0].value2).toBe('');
		expect(popup.getAttribute('hidden')).toBe('');
		expect(save).toHaveBeenCalled();
	});

	test('back closes the popup first, then the screen', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		expect(emulatorjs.controlInput('BACK')).toBeNull();
		expect(popup.getAttribute('hidden')).toBe('');

		expect(emulatorjs.controlInput('BACK')).toBe('back');
		expect(emu.controlMenu.style.display).toBe('none');
	});

	test('Close in the footer reports the screen closed', () => {
		const {emu} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_LEFT');

		expect(emulatorjs.controlInput('BUTTON_2')).toBe('close');
	});

	test('a new gamepad binding comes off every other row', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		// What EmulatorJS does when a gamepad button arrives for the waiting row.
		emu.controls[0][0].value2 = 'BUTTON_1';
		popup.setAttribute('hidden', '');
		emu.saveSettings();

		expect(emu.controls[0][1].value2).toBe('');
		expect(emu.controls[0][0].value2).toBe('BUTTON_1');
	});
});
