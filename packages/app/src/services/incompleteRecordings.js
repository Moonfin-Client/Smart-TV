import {useSyncExternalStore} from 'react';
import {getAuthHeader, getServerUrl} from './jellyfinApi';
import {parseServerDate} from '../utils/serverDate';

// The Moonfin plugin's list of Live TV recordings that missed part of their program, keyed by
// item id. It's read again once it's a few minutes old and a screen showing recordings asks.
const CACHE_MS = 5 * 60 * 1000;
// How long after a program's start pressing Record still counts as on time.
export const RECORD_PROMPT_GRACE_MS = 60000;

let supported = false;
let extendedSupported = false;
let canManage = false;
let entries = new Map();
let fetchedAt = 0;
let inFlight = null;
// Bumped by every configure and by Keep as Complete, so a read started before either is dropped.
let generation = 0;
// Bumped only by configure, so a suggested showing from an earlier server session can't be booked.
let sessionGeneration = 0;
const listeners = new Set();

const normalizeId = (id) => String(id || '').replace(/-/g, '').toLowerCase();

const notify = () => listeners.forEach((listener) => listener());

const pluginRequest = async (path, options = {}) => {
	const headers = {Authorization: getAuthHeader()};
	if (options.body) headers['Content-Type'] = 'application/json';
	const response = await fetch(`${getServerUrl()}/Moonfin/LiveTv${path}`, {...options, headers});
	if (!response.ok) {
		const error = new Error('Plugin error: ' + response.status);
		error.status = response.status;
		throw error;
	}
	return response;
};

// A refused read clears the marks. Any other failure keeps the last list.
export const refreshIncompleteRecordings = () => {
	if (!supported || inFlight || Date.now() - fetchedAt < CACHE_MS) return inFlight || Promise.resolve();
	const request = generation;
	const apply = (next) => {
		if (request !== generation) return;
		entries = next;
		notify();
	};
	const done = () => {
		if (request !== generation) return;
		fetchedAt = Date.now();
		inFlight = null;
	};
	inFlight = pluginRequest('/Recordings/Incomplete')
		.then((response) => response.json())
		.then((list) => apply(new Map((Array.isArray(list) ? list : []).map((entry) => [normalizeId(entry.itemId), entry]))), (err) => {
			if (err.status === 401 || err.status === 403) apply(new Map());
		})
		.then(done, done);
	return inFlight;
};

// App keeps this in step with the plugin's ping and the signed in user. A new ping can mean a
// different server, so the list always starts over.
export const configureIncompleteRecordings = ({supported: isSupported, extended = false, canManage: isManager}) => {
	supported = isSupported;
	extendedSupported = isSupported && extended;
	canManage = isManager;
	generation++;
	sessionGeneration++;
	entries = new Map();
	fetchedAt = 0;
	inFlight = null;
	notify();
	refreshIncompleteRecordings();
};

const subscribe = (listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const useIncompleteRecording = (itemId) => useSyncExternalStore(
	subscribe,
	() => (supported && itemId ? entries.get(normalizeId(itemId)) || null : null)
);

// Keep as Complete clears the mark for everyone on the server, so it's for Live TV managers only.
export const canKeepAsComplete = () => supported && canManage;

export const isExtendedSupported = () => supported && extendedSupported;

// A read already under way may still list the item, so it's dropped and the list read again.
export const keepAsComplete = async (itemId) => {
	const id = normalizeId(itemId);
	await pluginRequest(`/Recordings/${id}/Dismiss`, {method: 'POST'});
	generation++;
	inFlight = null;
	fetchedAt = 0;
	entries = new Map(entries);
	entries.delete(id);
	notify();
	refreshIncompleteRecordings();
};

// Pressing Record on a program already airing offers to record a complete showing later when it
// started over a minute ago, has season and episode numbers to find the same episode by, and the
// viewer may manage recordings.
export const offersCompleteShowing = (program, now) => canKeepAsComplete() &&
	program?.ParentIndexNumber != null && program?.IndexNumber != null &&
	now - new Date(program.StartDate).getTime() > RECORD_PROMPT_GRACE_MS;

const succeeds = (request) => request.then(() => true, () => false);

// The plugin joins a repeated request to the open one, so a retry never schedules twice.
export const requestCompleteShowing = (programId) => succeeds(pluginRequest('/CompleteShowing', {
	method: 'POST',
	body: JSON.stringify({programId})
}));

const isText = (value) => typeof value === 'string';
const isOptionalText = (value) => value == null || isText(value);

// What the plugin found for a program already airing: whether it can search for a complete
// showing, and a specific future showing to confirm. answered is false when the server didn't
// reply, so canSearch is only a default then.
export const completeShowingOptions = async (programId) => {
	const none = {canSearch: false, showing: null, answered: false};
	if (!isExtendedSupported()) return none;
	const session = sessionGeneration;
	let data;
	try {
		const response = await pluginRequest(`/CompleteShowing/Options?programId=${encodeURIComponent(programId)}`);
		data = await response.json();
	} catch {
		return none;
	}
	if (session !== sessionGeneration || !data || typeof data !== 'object') return none;
	const canSearch = data.canSearch === true;
	const raw = data.showing;
	let showing = null;
	if (raw && typeof raw === 'object' &&
		isText(raw.programId) && raw.programId &&
		isText(raw.name) && raw.name.trim() &&
		isText(raw.description) && (canSearch || raw.description.trim()) &&
		isOptionalText(raw.channelName) && isOptionalText(raw.channelNumber)) {
		const start = parseServerDate(raw.startDate);
		if (start && start.getTime() > Date.now()) {
			showing = {
				payload: raw,
				generation: session,
				start,
				name: raw.name,
				description: raw.description,
				channelName: raw.channelName ?? null,
				channelNumber: raw.channelNumber ?? null,
				// Someone already set this showing to record, and confirming it adopts that timer.
				alreadyScheduled: raw.alreadyScheduled === true
			};
		}
	}
	return {canSearch, showing, answered: true};
};

export const scheduleSuggestedShowing = (programId, showing) => {
	if (!isExtendedSupported() || showing.generation !== sessionGeneration) return Promise.resolve(false);
	return succeeds(pluginRequest('/CompleteShowing/Suggestion', {
		method: 'POST',
		body: JSON.stringify({programId, showing: showing.payload})
	}));
};
