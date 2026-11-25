import $L from '../services/i18n.js';

import {sha256} from './sha256';

// Wrong guesses allowed before each further one costs a wait.
const PIN_FREE_ATTEMPTS = 5;

// How far the wait grows per wrong guess past the free ones, capped. Four digits is only 10,000
// combinations, which is an evening's work for a determined child if guessing is free.
const PIN_LOCKOUT_STEP_MS = 30 * 1000;
const PIN_MAX_LOCKOUT_MS = 15 * 60 * 1000;

// Where the Kids Mode PIN keeps its hash and its counters in the settings.
export const KIDS_PIN = {
	hash: 'kidsPinHash',
	failed: 'kidsPinFailedAttempts',
	until: 'kidsPinLockedUntil'
};

export const hashPin = (pin) => sha256(String(pin));

export const isPinShaped = (pin) => /^\d{4}$/.test(String(pin || ''));

// How long until another guess is taken, or zero when one is taken now.
export const lockoutRemaining = (settings, keys, now = Date.now()) => {
	const until = Number(settings?.[keys.until]) || 0;
	if (until === 0) return 0;
	return Math.max(0, until - now);
};

// Records a wrong guess and says how long the next one has to wait, alongside the settings to
// store. The count keeps climbing past the cap so the wait stays at the ceiling rather than
// starting over.
export const registerFailedAttempt = (settings, keys, now = Date.now()) => {
	const failed = (Number(settings?.[keys.failed]) || 0) + 1;
	if (failed <= PIN_FREE_ATTEMPTS) {
		return {wait: 0, changes: {[keys.failed]: failed}};
	}

	const wait = Math.min(PIN_LOCKOUT_STEP_MS * (failed - PIN_FREE_ATTEMPTS), PIN_MAX_LOCKOUT_MS);
	return {wait, changes: {[keys.failed]: failed, [keys.until]: now + wait}};
};

export const clearedLockout = (keys) => ({[keys.failed]: 0, [keys.until]: 0});

// Mirrors the wording the plugin's own dialog uses: seconds under a minute, whole minutes above.
export const formatWait = (ms) => {
	if (ms < 60000) return $L('{count}s').replace('{count}', String(Math.floor(ms / 1000)));
	return $L('{count}m').replace('{count}', String(Math.floor(ms / 60000)));
};

export const tooManyAttempts = (ms) =>
	$L('Too many attempts. Try again in {wait}.').replace('{wait}', formatWait(ms));

// Whether a guess is the stored PIN. A PIN that was saved before this client started hashing is
// still stored as itself, so it's compared both ways and rehashed by the caller on the way past.
export const pinMatches = (guess, {hash, plain}) => {
	const entered = String(guess || '');
	if (!isPinShaped(entered)) return false;
	if (hash) return hashPin(entered) === hash;
	// Never let an unset PIN verify. An empty one is no boundary at all.
	return Boolean(plain) && entered === String(plain);
};
