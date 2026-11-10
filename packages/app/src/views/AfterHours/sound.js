// Every file is read and decoded once, on the first press of the Version row. A key press resumes
// the context when the TV starts it suspended.
import {getFromStorage, saveToStorage} from '../../services/storage';
import tick from './sounds/tick.wav';
import select from './sounds/select.wav';
import back from './sounds/back.wav';
import fanfare from './sounds/fanfare.wav';
import crash from './sounds/crash.wav';
import jump from './sounds/jump.wav';
import whoosh from './sounds/whoosh.wav';
import swish from './sounds/swish.wav';
import pickup from './sounds/pickup.wav';
import powerup from './sounds/powerup.wav';
import breakSound from './sounds/break.wav';
import thud from './sounds/thud.wav';
import menuLoop from './sounds/menu-loop.mp3';

const FILES = {tick, select, back, fanfare, crash, jump, whoosh, swish, pickup, powerup, break: breakSound, thud, loop: menuLoop};
const SOUND_KEY = 'afterHoursSound';
// The loop is exactly four bars at 112 bpm, 189000 samples at 22.05 kHz.
const LOOP_SECONDS = 189000 / 22050;
// A decoder that keeps the MP3 encoder's priming samples puts this much silence before the first bar.
const MP3_PRIMING = 1105 / 22050;

let ctx = null;
let ready = null;
let soundOn = true;
let music = null;
let wantMusic = false;
const buffers = {};

// Tizen's build mocks XHR for the app's own files, so fetch goes first and XHR is the fallback.
const readBytes = (url) => fetch(url).then((res) => res.arrayBuffer()).catch(() => new Promise((resolve, reject) => {
	const xhr = new window.XMLHttpRequest();
	xhr.open('GET', url, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = () => (xhr.response && xhr.response.byteLength ? resolve(xhr.response) : reject(new Error('empty')));
	xhr.onerror = reject;
	xhr.send();
}));

// The callback form, since the promise one only arrived in Chrome 49.
const decode = (bytes) => new Promise((resolve, reject) => ctx.decodeAudioData(bytes, resolve, reject));

export const unlockAudio = () => {
	if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
};

export const playSound = (name) => {
	const buf = buffers[name];
	if (!soundOn || !ctx || !buf) return;
	const src = ctx.createBufferSource();
	src.buffer = buf;
	src.connect(ctx.destination);
	src.start(0);
};

const stopLoop = () => {
	if (!music) return;
	try {
		music.stop(0);
	} catch {
		// Already stopped.
	}
	music.disconnect();
	music = null;
};

export const startMusic = () => {
	wantMusic = true;
	const buf = buffers.loop;
	if (music || !soundOn || !ctx || !buf) return;
	const lead = buf.duration - LOOP_SECONDS > 0.03 ? MP3_PRIMING : 0;
	music = ctx.createBufferSource();
	music.buffer = buf;
	music.loop = true;
	music.loopStart = lead;
	music.loopEnd = lead + LOOP_SECONDS;
	music.connect(ctx.destination);
	music.start(0, lead);
};

export const stopMusic = () => {
	wantMusic = false;
	stopLoop();
};

export const loadSounds = () => {
	if (!ctx) {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		try {
			ctx = Ctx ? new Ctx() : null;
		} catch {
			ctx = null;
		}
	}
	unlockAudio();
	if (!ready) {
		const files = ctx ? Object.keys(FILES).map((name) => readBytes(FILES[name]).then(decode).then((buf) => {
			buffers[name] = buf;
		}).catch(() => {})) : [];
		const setting = getFromStorage(SOUND_KEY).then((stored) => {
			soundOn = stored !== false;
		}).catch(() => {});
		ready = Promise.all([setting].concat(files)).then(() => {
			if (wantMusic) startMusic();
		});
	}
	return ready;
};

export const isSoundOn = () => soundOn;

export const setSoundOn = (on) => {
	soundOn = on;
	saveToStorage(SOUND_KEY, on);
	if (!on) stopLoop();
	else if (wantMusic) startMusic();
};

// Lets the TV's audio go while nothing plays. The next press resumes it.
export const sleepAudio = () => {
	stopMusic();
	if (ctx && ctx.suspend) ctx.suspend();
};
