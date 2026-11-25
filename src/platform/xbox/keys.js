// The controller as the keys the app already knows.
//
// WebView2 on Xbox hands the page the gamepad's own virtual key codes instead of
// arrows and Enter. The app compares key codes in a great many places, so rather
// than teach each one, a gamepad key is stopped on its way in and raised again on
// the same element as the standard key it stands for. Arrows, Enter and Escape
// aren't in the table and pass through untouched.
//
// An Xbox One S already sends the left stick and B as arrows and Escape. Their
// codes stay in the table for a console that sends them as they are.

const UP = {keyCode: 38, key: 'ArrowUp', code: 'ArrowUp'};
const DOWN = {keyCode: 40, key: 'ArrowDown', code: 'ArrowDown'};
const LEFT = {keyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft'};
const RIGHT = {keyCode: 39, key: 'ArrowRight', code: 'ArrowRight'};
const ENTER = {keyCode: 13, key: 'Enter', code: 'Enter'};
const BACK = {keyCode: 27, key: 'Escape', code: 'Escape'};
const MENU = {keyCode: 93, key: 'ContextMenu', code: 'ContextMenu'};
const BACKSPACE = {keyCode: 8, key: 'Backspace', code: 'Backspace'};
const REWIND = {keyCode: 227, key: 'MediaRewind', code: 'MediaRewind'};
const FAST_FORWARD = {keyCode: 228, key: 'MediaFastForward', code: 'MediaFastForward'};

const GAMEPAD_KEYS = {
	// Navigation keys, sent by a media remote
	138: UP,
	139: DOWN,
	140: LEFT,
	141: RIGHT,
	142: ENTER,
	143: BACK,
	// A, B and X
	195: ENTER,
	196: BACK,
	197: BACKSPACE,
	// Left and right trigger
	201: REWIND,
	202: FAST_FORWARD,
	// D-pad
	203: UP,
	204: DOWN,
	205: LEFT,
	206: RIGHT,
	// Menu button
	207: MENU,
	// Left stick
	211: UP,
	212: DOWN,
	213: RIGHT,
	214: LEFT
};

// The host reports a Back it was handed by the system, which may or may not have
// reached the page as a key as well. Whichever of the two comes second within
// this window is the same press and is dropped.
const SAME_PRESS_MS = 300;
let lastPageBack = 0;
let lastHostBack = 0;

const raise = (target, type, standard, repeat = false) => target.dispatchEvent(new window.KeyboardEvent(type, {
	key: standard.key,
	code: standard.code,
	keyCode: standard.keyCode,
	which: standard.keyCode,
	repeat,
	bubbles: true,
	cancelable: true
}));

// A press and release of a key on whatever has focus, for a button the host
// reports rather than the page.
export const pressOnFocused = (standard) => {
	const target = document.activeElement || document.body;
	raise(target, 'keydown', standard);
	raise(target, 'keyup', standard);
};

// A game reads the controller through the Gamepad API, so its buttons arriving as
// keys too would press Enter in the game and open its menu on every B. They stop
// here while a game has the controller and the page can see a gamepad.
let gameHasController = false;

export const giveControllerToGame = (given) => {
	gameHasController = !!given;
};

// The controller's own codes run from A to the right stick. What the console has
// already turned into an arrow or Escape comes without the name a keyboard gives.
const CONSOLE_MADE = [BACK.keyCode, LEFT.keyCode, UP.keyCode, RIGHT.keyCode, DOWN.keyCode];
const fromController = (event, keyCode) => (keyCode >= 195 && keyCode <= 218) ||
	(event.key === 'Unidentified' && CONSOLE_MADE.includes(keyCode));

const gamepadInReach = () => Array.from(navigator.getGamepads?.() || []).some(Boolean);

const translate = (event) => {
	const keyCode = event.keyCode || event.which;
	if (gameHasController && fromController(event, keyCode) && gamepadInReach()) {
		if (event.type === 'keydown' && keyCode === BACK.keyCode) lastPageBack = Date.now();
		event.stopImmediatePropagation();
		event.preventDefault();
		return;
	}
	const standard = GAMEPAD_KEYS[keyCode];
	if (!standard) {
		if (event.type === 'keydown' && event.isTrusted && keyCode === BACK.keyCode) lastPageBack = Date.now();
		return;
	}
	event.stopImmediatePropagation();
	event.preventDefault();
	if (standard === BACK) {
		if (Date.now() - lastHostBack < SAME_PRESS_MS) return;
		if (event.type === 'keydown') lastPageBack = Date.now();
	}
	raise(event.target || document.body, event.type, standard, event.repeat);
};

// Raises a Back the host reported, unless the page already had it as a key.
export const raiseHostBack = () => {
	if (Date.now() - lastPageBack < SAME_PRESS_MS) return false;
	lastHostBack = Date.now();
	pressOnFocused(BACK);
	return true;
};

// Goes on in the capture phase at the window, ahead of every handler in the app.
// Returns the remover.
export const installGamepadKeys = () => {
	if (typeof window === 'undefined') return () => {};
	window.addEventListener('keydown', translate, true);
	window.addEventListener('keyup', translate, true);
	return () => {
		window.removeEventListener('keydown', translate, true);
		window.removeEventListener('keyup', translate, true);
	};
};
