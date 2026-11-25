import $L from '../services/i18n.js';

import {
	PIN_LOCKED, PIN_NONE, PIN_UNAVAILABLE, PIN_VALID, PIN_WRONG,
	getServerPinStatus, removeServerPin, removeServerPinFor, setServerPin, verifyServerPin
} from '../services/serverPinApi';
import {clearedLockout, hashPin, isPinShaped, lockoutRemaining, registerFailedAttempt, tooManyAttempts} from './pinLockout';

// Each account's sign in PIN, kept in the settings by user id. The server holds the real one when
// the Moonfin plugin is there, and the hash here is a copy of what was last typed, for when the
// server can't be asked. A server that's down then never locks a family out of the app.

export const PIN_ACCEPTED = 'accepted';
const PIN_REJECTED = 'rejected';

const RECORD_KEYS = {failed: 'failed', until: 'lockedUntil'};

const NO_PIN = {enabled: false, hash: '', failed: 0, lockedUntil: 0, server: false};

// An account with no record of its own falls back to the one PIN the TV used to keep for every
// profile, so nobody's protection goes away. Its own record takes over the first time it's written.
export const signInPinFor = (settings, userId) => {
	const own = settings.userPins?.[userId];
	if (own) return own;
	if (settings.pinCodeProtection !== true) return NO_PIN;
	const plain = isPinShaped(settings.pinCode) ? String(settings.pinCode) : '0000';
	return {
		enabled: true,
		hash: settings.pinCodeHash || hashPin(plain),
		failed: Number(settings.pinFailedAttempts) || 0,
		lockedUntil: Number(settings.pinLockedUntil) || 0,
		server: false
	};
};

// A PIN the server holds is asked for even on a device that never had it turned on.
export const isSignInPinEnabled = (record) => Boolean(record.enabled || record.server);

export const signInPinChanges = (settings, userId, record) => ({userPins: {...settings.userPins, [userId]: record}});

const settled = (record, pin, server) => ({...record, enabled: true, hash: hashPin(pin), failed: 0, lockedUntil: 0, server});

const verifyHere = (record, entered) => {
	const waiting = lockoutRemaining(record, RECORD_KEYS);
	if (waiting > 0) return {outcome: PIN_LOCKED, wait: waiting, record};
	if (record.hash && isPinShaped(entered) && hashPin(entered) === record.hash) {
		return {outcome: PIN_ACCEPTED, record: {...record, ...clearedLockout(RECORD_KEYS)}};
	}
	const {wait, changes} = registerFailedAttempt(record, RECORD_KEYS);
	return {outcome: wait > 0 ? PIN_LOCKED : PIN_REJECTED, wait, record: {...record, ...changes}};
};

// Learns whether the server holds a PIN for the account. It's how a TV that never saw the PIN comes
// to ask for it, and how a PIN an administrator removed stops being asked for.
export const refreshSignInPin = async (record, account) => {
	if (!account) return record;
	const enabled = await getServerPinStatus(account);
	if (enabled === true) return record.server ? record : {...record, server: true};
	if (enabled === false && record.server) return NO_PIN;
	return record;
};

// Checks a typed PIN with the server when it answers, and with the copy here when it doesn't.
export const verifySignInPin = async (record, entered, account) => {
	if (!account) return verifyHere(record, entered);
	const verdict = await verifyServerPin(account, entered);
	if (verdict.result === PIN_VALID) return {outcome: PIN_ACCEPTED, record: settled(record, entered, true)};
	if (verdict.result === PIN_WRONG) return {outcome: PIN_REJECTED, record};
	if (verdict.result === PIN_LOCKED) return {outcome: PIN_LOCKED, wait: verdict.wait, record};
	if (verdict.result === PIN_NONE) {
		// An administrator took the PIN away.
		if (record.server) return {outcome: PIN_ACCEPTED, record: NO_PIN};
		// A PIN only this TV knows, on a server that now has the plugin. It decides, then moves there.
		const here = verifyHere(record, entered);
		if (here.outcome === PIN_ACCEPTED && (await setServerPin(account, entered)).result === PIN_VALID) {
			return {...here, record: {...here.record, server: true}};
		}
		return here;
	}
	return verifyHere(record, entered);
};

// Why the server turned a change down, or null when it didn't. A PIN the server holds only changes
// once the server says so, or this TV would disagree with every other device.
const refusal = (verdict, record) => {
	if (verdict.result === PIN_UNAVAILABLE && record.server) return $L('Unable to connect to server');
	if (verdict.result === PIN_WRONG) return $L('Incorrect PIN');
	if (verdict.result === PIN_LOCKED) return tooManyAttempts(verdict.wait);
	return null;
};

// Sets the PIN on the server when there's one to ask, keeping a copy here either way. A PIN the
// server turned down isn't kept, or this TV would hold one nobody else has.
export const storeSignInPin = async (record, pin, account, currentPin) => {
	if (!account) return {record: settled(record, pin, record.server)};
	const verdict = await setServerPin(account, pin, currentPin);
	const refused = refusal(verdict, record);
	if (refused) return {refused};
	return {record: settled(record, pin, verdict.result === PIN_VALID || record.server)};
};

export const dropSignInPin = async (record, account, currentPin) => {
	if (account && record.server) {
		const refused = refusal(await removeServerPin(account, currentPin), record);
		if (refused) return {refused};
	}
	return {record: NO_PIN};
};

// Forgot PIN sends the viewer back to sign in to the account, and only a sign in with its password
// or Quick Connect may then clear the PIN. Picking an account the TV already holds proves nothing.
let forgotten = null;
let proved = null;

const accountKey = (serverUrl, userId) => `${String(serverUrl || '').replace(/\/+$/, '').toLowerCase()}|${userId}`;

export const markPinForgotten = (serverUrl, userId, username) => {
	forgotten = {key: accountKey(serverUrl, userId), username};
};

// The account Login should ask the password of, when Forgot PIN sent the viewer there.
export const forgottenPinUsername = (serverUrl) => (forgotten && forgotten.key.indexOf(accountKey(serverUrl, '')) === 0 ? forgotten.username : null);

export const noteProvedSignIn = (serverUrl, userId) => {
	proved = accountKey(serverUrl, userId);
};

// Read once, by the PIN check that follows the sign in, so a later return to the app needs a
// fresh one.
export const takeProvedSignIn = (serverUrl, userId) => {
	const match = proved === accountKey(serverUrl, userId);
	proved = null;
	return match;
};

export const takeForgottenPin = (serverUrl, userId) => {
	const match = forgotten?.key === accountKey(serverUrl, userId);
	if (match) forgotten = null;
	return match;
};

// Clears a PIN the viewer forgot, after a sign in that proved who they are. A PIN on the server can
// only be cleared there by an administrator, so for anyone else it stays and this says so.
export const resetForgottenPin = async (record, account, userId) => {
	if (record.server) {
		const verdict = account ? await removeServerPinFor(account, userId) : {result: PIN_UNAVAILABLE};
		if (verdict.result !== PIN_VALID) {
			return {refused: $L('The PIN on the server couldn\'t be cleared. If it\'s still set, ask a server administrator to remove it.')};
		}
	}
	return {record: NO_PIN};
};

export const signInPinMessage = ({outcome, wait}) => (outcome === PIN_LOCKED ? tooManyAttempts(wait) : $L('Incorrect PIN'));
