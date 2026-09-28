// EmulatorJS control glue. Ports the Moonbase plugin player.html script so the enact app
// drives EmulatorJS directly (no iframe / postMessage). Loader + WASM cores come from the path
// the server resolved when this TV can reach it, otherwise the trusted-cert CDN, which works on
// old webOS. The ROM is either a direct server URL EmulatorJS streams itself or a Blob URL the
// app already fetched, and the BIOS is always a Blob URL.
// Threads are off (no cross-origin isolation on app:// / file://), so single-threaded cores only.

import $L from '@enact/i18n/$L';

import serverLogger from '../services/serverLogger';
import {isWebOS, isTizen} from '../platform';

const logGames = (message, context) =>
	serverLogger.debug(serverLogger.LOG_CATEGORIES.APP, `[Games] ${message}`, context);
const logGamesError = (message, context) =>
	serverLogger.error(serverLogger.LOG_CATEGORIES.APP, `[Games] ${message}`, context, false);

const CDN = 'https://cdn.emulatorjs.org/stable/data/';

let loaderScript = null;
// The config loader.js built and the class it constructed. Both outlive a teardown, so a later
// launch can build an emulator straight away instead of downloading the bundle again.
let loadedConfig = null;
let EmulatorCtor = null;
// Stops waiting on the boot in progress, so a teardown doesn't leave its timeout running.
let abandonBoot = null;

// The PSP core only runs with threads, which this app can't turn on.
export const needsThreads = (core) => core === 'psp';

// Gives target[key] a stand-in value and returns what puts the original back.
const shadow = (target, key, value) => {
	const own = Object.getOwnPropertyDescriptor(target, key);
	Object.defineProperty(target, key, {value, configurable: true, writable: true});
	return () => {
		if (own) Object.defineProperty(target, key, own);
		else delete target[key];
	};
};

const addCleanup = (emu, cleanup) => {
	emu.moonfinCleanups = emu.moonfinCleanups || [];
	emu.moonfinCleanups.push(cleanup);
};

// Runs fn and records on emu how to take off every listener it put on window and document.
const recordPageListeners = (emu, fn) => {
	const restore = [window, document].map((target) => {
		const add = target.addEventListener;
		return shadow(target, 'addEventListener', function (type, listener, options) {
			addCleanup(emu, () => target.removeEventListener(type, listener, options));
			return add.call(this, type, listener, options);
		});
	});
	try {
		return fn();
	} finally {
		restore.forEach((undo) => undo());
	}
};

// EmulatorJS and its core leave listeners, the core's script and timers behind, and each of them
// holds the emulator and its WebAssembly memory. This wraps the class so every emulator it builds
// can be cleared up by releaseEmulator.
const makeReleasable = (Ctor) => {
	const proto = Ctor && Ctor.prototype;
	if (!proto || proto.moonfinReleasable) return;
	const wrap = (name, around) => {
		const run = proto[name];
		if (typeof run !== 'function') return;
		proto[name] = function (...args) {
			return around(this, () => run.apply(this, args));
		};
	};
	wrap('bindListeners', recordPageListeners);
	// The core watches the battery and polls memory use for its own stats, and neither ever stops.
	// A TV has no use for either, so the core starts without them.
	wrap('startGame', (emu, run) => {
		const restore = [shadow(performance, 'memory', undefined), shadow(navigator, 'getBattery', undefined)];
		try {
			return recordPageListeners(emu, run);
		} finally {
			restore.forEach((undo) => undo());
		}
	});
	// The core's script stays in the page with a load listener that holds the emulator.
	wrap('createElement', (emu, run) => {
		const element = run();
		if (element && element.tagName === 'SCRIPT') addCleanup(emu, () => element.remove());
		return element;
	});
	proto.moonfinReleasable = true;
};

// The bundle publishes its class on window before loader.js builds the first emulator from it,
// so catching that assignment wraps the class before any emulator exists.
const watchForEmulatorClass = () => {
	if (window.EmulatorJS) {
		makeReleasable(window.EmulatorJS);
		return;
	}
	let published;
	Object.defineProperty(window, 'EmulatorJS', {
		configurable: true,
		enumerable: true,
		get: () => published,
		set: (value) => {
			published = value;
			makeReleasable(value);
		}
	});
};

// EmulatorJS expects the page to be thrown away when a game ends, but this app keeps running,
// so anything it leaves behind keeps the emulator, its WebAssembly memory and its audio alive.
const releaseEmulator = (emu) => {
	try { if (emu.gamepad) emu.gamepad.terminate(); } catch (e) { /* ignore */ }
	clearInterval(emu.saveSaveInterval);
	(emu.moonfinCleanups || []).splice(0).forEach((cleanup) => {
		try { cleanup(); } catch (e) { /* ignore */ }
	});
	// Cores with analog sticks get on-screen joysticks, which join a page-wide nipplejs list with
	// handlers that hold the emulator.
	try {
		window.nipplejs.factory
			.filter((joystick) => emu.elements.parent.contains(joystick.options.zone))
			.forEach((joystick) => joystick.destroy());
	} catch (e) { /* ignore */ }
	if (emu.started) {
		try { emu.gameManager.toggleMainLoop(0); } catch (e) { /* ignore */ }
		// EmulatorJS's own exit flushes in-game saves and shuts the core down a second later.
		try { emu.callEvent('exit'); } catch (e) { /* ignore */ }
	} else if (!emu.failedToStart && !emu.moonfinReleasesOnStart) {
		// A boot torn down early keeps loading in the background, so it's released again once it starts.
		emu.moonfinReleasesOnStart = true;
		try { emu.on('start', () => releaseEmulator(emu)); } catch (e) { /* ignore */ }
	}
	// The core's audio feeds itself on an interval only the core could stop, and it never does.
	// A core that failed partway through starting can have one too.
	try {
		const audio = emu.Module.AL.currentCtx;
		clearInterval(audio.interval);
		audio.audioCtx.close().catch(() => {});
	} catch (e) { /* ignore */ }
};

// EmulatorJS cores are WebAssembly, which needs Chromium 57+. Older WebViews (webOS 4 and
// below at Chrome 53, Tizen 4 and below at Chrome 56) lack it entirely, so games can't run
// there. The supported floor is webOS 5 (Chrome 68) and Tizen 5.0 (Chrome 63).
export const isSupported = () =>
	typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';

// Maps a Chrome major version to the webOS marketing version it shipped with.
const CHROME_TO_WEBOS = [[120, 25], [108, 24], [94, 23], [87, 22], [79, 6], [68, 5], [53, 4], [38, 3], [34, 2], [26, 1]];

// Platform and detected OS version for the "not supported" dialog. The version is best-effort
// from the UA. Tizen states it directly and webOS is derived from the Chrome major.
export const supportInfo = () => {
	const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
	let platform = null;
	let version = null;
	if (isTizen()) {
		platform = 'tizen';
		const m = ua.match(/Tizen\s([0-9]+(?:\.[0-9]+)?)/i);
		if (m) version = m[1];
	} else if (isWebOS()) {
		platform = 'webos';
		const m = ua.match(/Chrome\/(\d+)/);
		if (m) {
			const chrome = parseInt(m[1], 10);
			const hit = CHROME_TO_WEBOS.find(([c]) => chrome >= c);
			if (hit) version = String(hit[1]);
		}
	}
	return {supported: isSupported(), platform, version};
};

// Localized "why games can't run here" message, specific to the detected platform.
export const unsupportedMessage = () => {
	const {platform, version} = supportInfo();
	if (platform === 'webos') {
		return version
			? $L('This TV runs webOS {version}. Games require webOS 5 or newer.').replace('{version}', version)
			: $L('Games require webOS 5 or newer.');
	}
	if (platform === 'tizen') {
		return version
			? $L('This TV runs Tizen {version}. Games require Tizen 5 or newer.').replace('{version}', version)
			: $L('Games require Tizen 5 or newer.');
	}
	return $L('Games require webOS 5 or Tizen 5 and newer.');
};

// The core needs a modern WebView. Older ones fail to parse it and EJS_ready never fires,
// so reject after this timeout and let the caller show an error instead of hanging.
const READY_TIMEOUT = 40000;

// EmulatorJS writes what it is doing into its own status element, which is the only clue to
// where a boot stalled once it stops making progress.
const emulatorStatusText = () => {
	const emu = window.EJS_emulator;
	return (emu && emu.textElem && emu.textElem.innerText) || null;
};

// Starts EmulatorJS in the element matching `selector` and resolves once the game is running.
// stateBytes is a save state EmulatorJS loads itself once the game has started.
export const startEmulator = ({selector, core, gameUrl, biosUrl, gameName, settingsJson, stateBytes, dataPath}) =>
	new Promise((resolve, reject) => {
		if (settingsJson) {
			try { window.localStorage.setItem('ejs-settings', settingsJson); } catch (e) { /* ignore */ }
		}

		const startedAt = Date.now();
		const dataRoot = dataPath || CDN;
		// A boot that dies before EmulatorJS can say so, like a bundle this WebView can't parse,
		// only shows up as an uncaught error. Watch the window for as long as the boot runs to keep it.
		const onWindowError = (ev) => logGamesError('window error during emulator boot', {
			core,
			message: ev.message || String(ev.error || ''),
			source: ev.filename ? `${ev.filename}:${ev.lineno}` : null
		});
		const onRejection = (ev) => logGamesError('unhandled rejection during emulator boot', {
			core,
			reason: String((ev.reason && (ev.reason.message || ev.reason)) || '')
		});
		window.addEventListener('error', onWindowError);
		window.addEventListener('unhandledrejection', onRejection);
		const stopWatching = () => {
			window.removeEventListener('error', onWindowError);
			window.removeEventListener('unhandledrejection', onRejection);
		};

		// A TV that runs out of memory mid-boot takes the app with it and never reaches the
		// timeout below, so this line is the last thing a report will show.
		logGames('starting emulator', {
			core,
			gameName,
			bios: Boolean(biosUrl),
			blobRom: String(gameUrl || '').startsWith('blob:'),
			serverCores: dataRoot !== CDN
		});
		window.EJS_player = selector;
		window.EJS_core = core;
		window.EJS_gameUrl = gameUrl;
		if (biosUrl) window.EJS_biosUrl = biosUrl;
		if (gameName) window.EJS_gameName = gameName;
		if (stateBytes) window.EJS_loadStateURL = stateBytes;
		window.EJS_pathtodata = dataRoot;
		window.EJS_language = 'en-US';
		window.EJS_startOnLoaded = true;
		window.EJS_threads = false;
		// No touch screen on TV; keep the on-screen pad off.
		window.EJS_defaultOptions = Object.assign({}, window.EJS_defaultOptions, {'virtual-gamepad': 'disabled'});

		let reused = false;
		let settled = false;
		let timer = null;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			stopWatching();
			abandonBoot = null;
			if (error) reject(error);
			else resolve();
		};
		abandonBoot = () => finish(new Error('emulator-destroyed'));
		timer = setTimeout(() => {
			// Whatever was cached built an emulator that never started, so drop it and let the
			// next launch go back through the loader rather than repeat the same dead boot.
			loadedConfig = null;
			EmulatorCtor = null;
			logGamesError('emulator never became ready', {reused, emulatorStatus: emulatorStatusText()});
			finish(new Error('emulator-load-timeout'));
		}, READY_TIMEOUT);

		// Ready only means the start button is built, and the core, the game and the save still
		// have to load after it. The start event is the game running, and every way that can fail
		// goes through startGameError, which a core that needs threads has already hit by now.
		const onReady = (emulator) => {
			if (!emulator) return;
			if (settled) {
				releaseEmulator(emulator);
				return;
			}
			clearTimeout(timer);
			loadedConfig = emulator.config || loadedConfig;
			EmulatorCtor = emulator.constructor || EmulatorCtor;
			logGames('emulator ready', {core, ms: Date.now() - startedAt, reused});
			const started = () => {
				if (settled) return;
				logGames('emulator started', {core, ms: Date.now() - startedAt, reused});
				finish();
			};
			const failed = (reason) => {
				if (settled) return;
				logGamesError('emulator failed to start', {core, reason});
				finish(new Error('emulator-start-failed'));
			};
			const showError = emulator.startGameError;
			emulator.startGameError = function (message) {
				showError.call(this, message);
				failed(message);
			};
			emulator.on('start', started);
			if (emulator.failedToStart) failed(emulatorStatusText());
			else if (emulator.started) started();
		};
		window.EJS_ready = () => onReady(window.EJS_emulator);

		// Once the bundle is parsed a later launch can build the emulator from the cached class
		// instead of downloading the loader again. loader.js hooks the ready callback up itself
		// with emulator.on('ready', ...) rather than passing it in the config, so this path has
		// to do the same or the promise above could only ever settle by timing out.
		if (loadedConfig && EmulatorCtor && typeof EmulatorCtor.prototype?.on === 'function') {
			try {
				const config = Object.assign({}, loadedConfig, {
					gameUrl,
					system: core,
					biosUrl: biosUrl || '',
					gameName: gameName || '',
					// Set even when there's no save, or the cached config loads the last game's.
					loadState: stateBytes,
					dataPath: dataRoot,
					startOnLoad: true,
					threads: false,
					defaultOptions: window.EJS_defaultOptions
				});
				const emulator = new EmulatorCtor(selector, config);
				window.EJS_emulator = emulator;
				window.EJS_adBlocked = (url, del) => emulator.adBlocked(url, del);
				emulator.on('ready', () => onReady(emulator));
				reused = true;
				return;
			} catch (e) {
				// Once the cached pair has thrown it is not worth trusting again this session.
				loadedConfig = null;
				EmulatorCtor = null;
				logGamesError('could not build the emulator from the cached class', {message: e.message || String(e)});
			}
		}

		loaderScript = document.createElement('script');
		loaderScript.src = dataRoot + 'loader.js';
		// Without this the promise sits on the full timeout when the loader is simply unreachable.
		loaderScript.onerror = () => finish(new Error('emulator-loader-unreachable'));
		watchForEmulatorClass();
		document.body.appendChild(loaderScript);
	});

const gm = () => window.EJS_emulator && window.EJS_emulator.gameManager;

export const restart = () => { const g = gm(); if (g && g.restart) g.restart(); };
export const toggleFastForward = (on) => { const g = gm(); if (g && g.toggleFastForward) g.toggleFastForward(on ? 1 : 0); };
export const setPaused = (paused) => { const g = gm(); if (g && g.toggleMainLoop) g.toggleMainLoop(paused ? 0 : 1); };

export const getState = () => { const g = gm(); return g && g.getState ? g.getState() : null; };
export const loadState = (bytes) => { const g = gm(); if (g && g.loadState && bytes) g.loadState(bytes); };

export const getSettingsJson = () => {
	try { return window.localStorage.getItem('ejs-settings'); } catch (e) { return null; }
};

export const setOption = (id, value) => {
	const emu = window.EJS_emulator;
	if (emu && emu.changeSettingOption) emu.changeSettingOption(id, value);
};

// Curated general settings shown only when the core/build registered them.
const GENERAL = [
	{id: 'shader', label: 'Shader', choices: ['disabled', '2xScaleHQ', '4xScaleHQ', 'crt-aperture', 'crt-easymode', 'crt-geom', 'crt-mattias', 'sabr', 'bicubic']},
	{id: 'fps', label: 'FPS counter', choices: ['show', 'hide']},
	{id: 'vsync', label: 'VSync', choices: ['enabled', 'disabled']},
	{id: 'ff-ratio', label: 'Fast-forward ratio', choices: ['1.5', '2.0', '2.5', '3.0', '4.0', '5.0', '6.0', '8.0', 'unlimited']},
	{id: 'sm-ratio', label: 'Slow-motion ratio', choices: ['1.5', '2.0', '2.5', '3.0', '4.0', '5.0']},
	{id: 'save-state-slot', label: 'Save state slot', choices: ['1', '2', '3', '4', '5', '6', '7', '8', '9']}
];

// Returns [{id, label, choices:[{value,label}], current}] for the native settings screen.
export const getOptions = () => {
	const out = [];
	const emu = window.EJS_emulator;
	const g = gm();
	try {
		const raw = g && g.getCoreOptions ? g.getCoreOptions() : null;
		if (raw) {
			raw.split('\n').forEach((line) => {
				if (!line) return;
				const parts = line.split('; ');
				if (parts.length < 2) return;
				const id = parts[0].split('|')[0];
				const choices = parts[1].split('|');
				if (choices.length <= 1) return;
				out.push({
					id,
					label: id.replace(/_/g, ' ').replace(/.+-(.+)/, '$1'),
					choices: choices.map((c) => ({value: c, label: c.replace('(Default) ', '')})),
					current: emu && emu.getSettingValue ? emu.getSettingValue(id) : null
				});
			});
		}
		GENERAL.forEach((opt) => {
			const cur = emu && emu.getSettingValue ? emu.getSettingValue(opt.id) : null;
			if (cur == null) return;
			out.push({
				id: opt.id,
				// Only our own labels get translated. The choices are raw values the
				// emulator matches on.
				label: $L(opt.label),
				choices: opt.choices.map((c) => ({value: c, label: c})),
				current: cur
			});
		});
	} catch (e) {
		// return whatever we have
	}
	return out;
};

// EmulatorJS's own button-mapping screen, driven by the remote. It reaches into EmulatorJS
// internals, so every entry point checks the pieces it needs and does nothing when they're missing.
const CONTROL_HIGHLIGHT = '3px solid #00a4dc';
const INPUT_HIGHLIGHT = '2px solid #00a4dc';
const AREA_ROW = 'row';
const AREA_TAB = 'tab';
const AREA_GAMEPAD = 'gamepad';
const AREA_FOOTER = 'footer';

let controlFocus = {area: AREA_ROW, index: 0, column: 0};
// The row a gamepad binding is being captured for, and what it held before.
let pendingCapture = null;

const controlRows = (emu) => Array.prototype.slice.call(emu.controlMenu.querySelectorAll('.ejs_control_bar'))
	.filter((row) => row.getClientRects().length > 0);
const controlFooter = (emu) => Array.prototype.slice.call(emu.controlMenu.querySelectorAll(':scope > .ejs_button'));
const controlTabs = (emu) => Array.prototype.slice.call(emu.controlMenu.querySelectorAll('.ejs_control_player_bar > li'));
const capturePopup = (emu) => emu.controlPopup.parentElement.parentElement;

const selectPlayer = (emu, index) => {
	const tabs = controlTabs(emu);
	if (!tabs.length) return;
	const next = (index + tabs.length) % tabs.length;
	const link = tabs[next].querySelector('a');
	// EmulatorJS switches players on click, while its control rows listen for mousedown.
	if (link) link.click();
	controlFocus.area = AREA_TAB;
	controlFocus.index = next;
};

const highlightControls = (emu) => {
	const rows = controlRows(emu);
	const tabs = controlTabs(emu);
	const footer = controlFooter(emu);
	const current = controlFocus;
	const count = {[AREA_ROW]: rows.length, [AREA_TAB]: tabs.length, [AREA_FOOTER]: footer.length}[current.area];
	if (count !== undefined) current.index = Math.max(0, Math.min(count - 1, current.index));
	rows.forEach((row, index) => {
		const onRow = current.area === AREA_ROW && index === current.index;
		row.style.outline = onRow ? CONTROL_HIGHLIGHT : '';
		row.style.outlineOffset = '3px';
		Array.prototype.slice.call(row.querySelectorAll('input')).forEach((input, column) => {
			input.style.outline = onRow && column === current.column ? INPUT_HIGHLIGHT : '';
		});
	});
	tabs.forEach((tab, index) => {
		tab.style.outline = current.area === AREA_TAB && index === current.index ? CONTROL_HIGHLIGHT : '';
	});
	const selector = emu.controlMenu.querySelector('.ejs_gamepad_dropdown');
	if (selector) selector.style.outline = current.area === AREA_GAMEPAD ? CONTROL_HIGHLIGHT : '';
	footer.forEach((button, index) => {
		button.style.outline = current.area === AREA_FOOTER && index === current.index ? CONTROL_HIGHLIGHT : '';
	});
	const target = {
		[AREA_ROW]: rows[current.index],
		[AREA_TAB]: tabs[current.index],
		[AREA_GAMEPAD]: selector,
		[AREA_FOOTER]: footer[current.index]
	}[current.area];
	if (target) target.scrollIntoView({block: 'nearest', inline: 'nearest'});
};

const openControlRow = (emu) => {
	const row = controlRows(emu)[controlFocus.index];
	if (!row) return;
	// EmulatorJS opens its capture popup on mousedown.
	row.dispatchEvent(new window.MouseEvent('mousedown', {bubbles: true}));
	const player = Number(emu.controlPopup.getAttribute('player-num'));
	const button = Number(emu.controlPopup.getAttribute('button-num'));
	const binding = emu.controls[player] && emu.controls[player][button];
	pendingCapture = {player, button, value2: binding ? binding.value2 : undefined};
	emu.controlPopup.innerText = `[ ${row.getAttribute('data-label')} ]\n` +
		(controlFocus.column === 0 ? $L('Press Gamepad') : $L('Press a physical keyboard key'));
};

// EmulatorJS keeps a player's controls as an object keyed by button, so this walks its keys.
const clearDuplicateGamepadBinding = (emu, player, button, label) => {
	const controls = emu.controls && emu.controls[player];
	if (!controls) return;
	Object.keys(controls).forEach((key) => {
		if (Number(key) !== button && controls[key] && controls[key].value2 === label) {
			controls[key].value2 = '';
		}
	});
};

// EmulatorJS binds a gamepad button to the waiting row without taking it off the others, so one
// button could drive two actions. Every binding it makes is saved through saveSettings, so that
// is where a new gamepad binding is made the only one for its button.
const watchGamepadCaptures = (emu) => {
	if (emu.moonfinWatchesCaptures) return;
	emu.moonfinWatchesCaptures = true;
	const save = emu.saveSettings.bind(emu);
	emu.saveSettings = () => {
		const capture = pendingCapture;
		pendingCapture = null;
		const binding = capture && emu.controls[capture.player] && emu.controls[capture.player][capture.button];
		if (binding && binding.value2 && binding.value2 !== capture.value2) {
			clearDuplicateGamepadBinding(emu, capture.player, capture.button, binding.value2);
			emu.checkGamepadInputs();
		}
		save();
	};
};

const clearCurrentControl = (emu) => {
	const button = Number(emu.controlPopup.getAttribute('button-num'));
	const player = Number(emu.controlPopup.getAttribute('player-num'));
	if (!Number.isFinite(button) || !Number.isFinite(player)) return;
	if (!emu.controls[player]) emu.controls[player] = {};
	if (!emu.controls[player][button]) emu.controls[player][button] = {};
	emu.controls[player][button].value2 = '';
	capturePopup(emu).setAttribute('hidden', '');
	emu.checkGamepadInputs();
	emu.saveSettings();
};

const changeGamepad = (emu, delta) => {
	const selector = emu.controlMenu.querySelector('.ejs_gamepad_dropdown');
	if (!selector || !selector.options.length) return;
	selector.selectedIndex = (selector.selectedIndex + delta + selector.options.length) % selector.options.length;
	selector.dispatchEvent(new Event('change', {bubbles: true}));
};

// Opens the mapping screen on its first row. False when EmulatorJS doesn't have it.
export const openControls = () => {
	try {
		const emu = window.EJS_emulator;
		if (!emu || !emu.controlMenu || !emu.controlPopup || !emu.controls) return false;
		watchGamepadCaptures(emu);
		emu.controlMenu.style.display = '';
		controlFocus = {area: AREA_ROW, index: 0, column: 0};
		pendingCapture = null;
		highlightControls(emu);
		return emu.controlMenu.style.display !== 'none';
	} catch (e) {
		return false;
	}
};

// Takes a remote press as DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, BUTTON_2 (OK) or BACK.
// Returns 'back' or 'close' once the screen has closed, otherwise null.
export const controlInput = (label) => {
	try {
		const emu = window.EJS_emulator;
		if (!emu || !emu.controlMenu || emu.controlMenu.style.display === 'none') return null;
		const popup = capturePopup(emu);
		const popupOpen = popup.getAttribute('hidden') === null;
		if (label === 'BACK') {
			if (popupOpen) {
				popup.setAttribute('hidden', '');
				pendingCapture = null;
			} else {
				emu.controlMenu.style.display = 'none';
			}
			return emu.controlMenu.style.display === 'none' ? 'back' : null;
		}
		// A remote isn't a gamepad, so while the popup waits for a button OK clears the binding.
		if (popupOpen) {
			if (label === 'BUTTON_2') clearCurrentControl(emu);
			return null;
		}
		const current = controlFocus;
		const rows = controlRows(emu);
		const tabs = controlTabs(emu);
		const footer = controlFooter(emu);
		if (label === 'DPAD_UP') {
			if (current.area === AREA_ROW) {
				if (current.index > 0) current.index--;
				else current.area = AREA_GAMEPAD;
			} else if (current.area === AREA_GAMEPAD) {
				current.area = AREA_TAB;
				current.index = Math.max(0, tabs.findIndex((tab) => tab.classList.contains('ejs_control_selected')));
			} else if (current.area === AREA_FOOTER) {
				current.area = AREA_ROW;
				current.index = Math.max(0, rows.length - 1);
			}
		} else if (label === 'DPAD_DOWN') {
			if (current.area === AREA_TAB) {
				current.area = AREA_GAMEPAD;
			} else if (current.area === AREA_GAMEPAD) {
				current.area = AREA_ROW;
				current.index = 0;
			} else if (current.area === AREA_ROW) {
				if (current.index < rows.length - 1) {
					current.index++;
				} else {
					current.area = AREA_FOOTER;
					current.index = 0;
				}
			}
		} else if (label === 'DPAD_LEFT' || label === 'DPAD_RIGHT') {
			const dir = label === 'DPAD_LEFT' ? -1 : 1;
			if (current.area === AREA_TAB) selectPlayer(emu, current.index + dir);
			else if (current.area === AREA_GAMEPAD) changeGamepad(emu, dir);
			else if (current.area === AREA_ROW) current.column = dir < 0 ? 0 : 1;
			else if (current.area === AREA_FOOTER && footer.length) current.index = (current.index + dir + footer.length) % footer.length;
		} else if (label === 'BUTTON_2') {
			if (current.area === AREA_TAB) selectPlayer(emu, current.index);
			else if (current.area === AREA_ROW) openControlRow(emu);
			else if (current.area === AREA_FOOTER && footer[current.index]) footer[current.index].click();
		}
		highlightControls(emu);
		// A footer button, Close among them, can hide the screen straight away.
		return emu.controlMenu.style.display === 'none' ? 'close' : null;
	} catch (e) {
		return null;
	}
};

// Tears the emulator down: releases it, clears the container, drops EJS globals + loader.
export const destroyEmulator = () => {
	if (abandonBoot) abandonBoot();
	if (window.EJS_emulator) releaseEmulator(window.EJS_emulator);
	try {
		const el = document.querySelector(window.EJS_player || '#game');
		if (el) el.innerHTML = '';
	} catch (e) { /* ignore */ }
	if (loaderScript && loaderScript.parentNode) {
		loaderScript.parentNode.removeChild(loaderScript);
	}
	loaderScript = null;
	['EJS_emulator', 'EJS_player', 'EJS_core', 'EJS_gameUrl', 'EJS_biosUrl', 'EJS_gameName',
		'EJS_loadStateURL', 'EJS_pathtodata', 'EJS_startOnLoaded', 'EJS_threads', 'EJS_ready',
		'EJS_defaultOptions', 'EJS_adBlocked']
		.forEach((k) => { try { delete window[k]; } catch (e) { /* ignore */ } });
};
