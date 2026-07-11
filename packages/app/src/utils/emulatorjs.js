// Same-origin EmulatorJS control glue. Ports the Moonbase plugin player.html script so the
// enact app drives EmulatorJS directly (no iframe / postMessage). Loader + WASM cores come
// from the trusted-cert CDN (works on old webOS); the ROM/BIOS are Blob URLs the app already
// fetched. Threads are off (no cross-origin isolation on app:// / file://), so single-threaded
// cores only.

import $L from '@enact/i18n/$L';

import {isWebOS, isTizen} from '../platform';

const CDN = 'https://cdn.emulatorjs.org/stable/data/';

let loaderScript = null;

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

// Starts EmulatorJS in the element matching `selector` and resolves once the core is ready.
export const startEmulator = ({selector, core, gameUrl, biosUrl, gameName, settingsJson}) =>
	new Promise((resolve, reject) => {
		if (settingsJson) {
			try { window.localStorage.setItem('ejs-settings', settingsJson); } catch (e) { /* ignore */ }
		}
		window.EJS_player = selector;
		window.EJS_core = core;
		window.EJS_gameUrl = gameUrl;
		if (biosUrl) window.EJS_biosUrl = biosUrl;
		if (gameName) window.EJS_gameName = gameName;
		window.EJS_pathtodata = CDN;
		window.EJS_language = 'en-US';
		window.EJS_startOnLoaded = true;
		window.EJS_threads = false;
		// No touch screen on TV; keep the on-screen pad off.
		window.EJS_defaultOptions = Object.assign({}, window.EJS_defaultOptions, {'virtual-gamepad': 'disabled'});

		const timer = setTimeout(() => reject(new Error('emulator-load-timeout')), READY_TIMEOUT);
		window.EJS_ready = () => { clearTimeout(timer); resolve(); };

		loaderScript = document.createElement('script');
		loaderScript.src = CDN + 'loader.js';
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
				label: opt.label,
				choices: opt.choices.map((c) => ({value: c, label: c})),
				current: cur
			});
		});
	} catch (e) {
		// return whatever we have
	}
	return out;
};

// Tears the emulator down: stops the loop, clears the container, drops EJS globals + loader.
export const destroyEmulator = () => {
	try { setPaused(true); } catch (e) { /* ignore */ }
	try {
		const el = document.querySelector(window.EJS_player || '#game');
		if (el) el.innerHTML = '';
	} catch (e) { /* ignore */ }
	if (loaderScript && loaderScript.parentNode) {
		loaderScript.parentNode.removeChild(loaderScript);
	}
	loaderScript = null;
	['EJS_emulator', 'EJS_player', 'EJS_core', 'EJS_gameUrl', 'EJS_biosUrl', 'EJS_gameName',
		'EJS_pathtodata', 'EJS_startOnLoaded', 'EJS_threads', 'EJS_ready', 'EJS_defaultOptions']
		.forEach((k) => { try { delete window[k]; } catch (e) { /* ignore */ } });
};
