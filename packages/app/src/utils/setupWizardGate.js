// Decides whether the first run setup wizard runs, and for which steps.
//
// The app asks this after sign in, so shouldRun stays a storage read and
// never touches the network. Anything slow happens inside the wizard itself.

import {getFromStorage, saveToStorage} from '../services/storage';

// Bumped only when a release adds a step that earns its place. Everything
// already answered stays answered.
export const SETUP_WIZARD_VERSION = 1;

const STORE_KEY = 'setupWizard';

// Which questions the wizard can ask, in the order shown. The navbar leads
// because it is the frame everything after it sits in. The tour is never
// suppressed, since it asks nothing that could already have been answered.
export const SETUP_QUESTION_STEPS = [
	{step: 'navbar', settingKey: 'navbarPosition'},
	{step: 'mediaBar', settingKey: 'featuredBarStyle'},
	{step: 'homeRows', settingKey: 'homeRowsStyle'},
	{step: 'detailStyle', settingKey: 'detailScreenStyle'}
];

export const SETUP_QUESTION_KEYS = SETUP_QUESTION_STEPS.map((entry) => entry.settingKey);

// The settings store rewrites its whole blob on every save, so key presence
// alone cant say whether a person ever chose a value. The settings provider
// reports here instead, at the moments a value is genuinely known: present in
// the stored blob at load, carried by a server profile, or written by hand.
const answeredKeys = {};

// Set when a run is abandoned before it can finish, because the server was out
// of reach or its settings never arrived. Without it the app would send the
// user straight back in and strand them. In memory only, so the next launch
// tries again.
let deferredThisLaunch = false;

// Set while an explicit re run from settings is in flight, so the gate keeps
// answering yes even though the server is already marked as set up.
let rerunning = false;

export const noteAnsweredSettings = (keys) => {
	for (const key of keys) {
		if (SETUP_QUESTION_KEYS.indexOf(key) !== -1) answeredKeys[key] = true;
	}
};

// The server and user pairs whose settings this launch has finished reading at
// sign in, whichever way it went. Kept per user, since a second profile on the
// same server signs in without a reload while its own settings are still on the
// way.
const signInRead = {};

// Keyed the same way the multi server records are, so moving a server to a new
// URL doesnt read as one nobody has set up yet.
const normalizeUrl = (serverUrl) => (serverUrl || '')
	.replace(/^https?:\/\//i, '')
	.replace(/\/+$/, '')
	.toLowerCase();

const signInKeyFor = (serverUrl, userId) => normalizeUrl(serverUrl) + '/' + (userId || '');

export const beginSignInRead = (serverUrl, userId) => {
	delete signInRead[signInKeyFor(serverUrl, userId)];
};

export const finishSignInRead = (serverUrl, userId) => {
	signInRead[signInKeyFor(serverUrl, userId)] = true;
};

export const hasReadSignInSettings = (serverUrl, userId) => Boolean(signInRead[signInKeyFor(serverUrl, userId)]);

export const serverKeyFor = (serverId, serverUrl, userId) => {
	if (!userId) return null;
	const base = serverId || normalizeUrl(serverUrl);
	if (!base) return null;
	return base + '_' + userId;
};

// The steps still worth asking, in order. Anything already chosen drops out,
// which on a second device usually empties the list entirely and finishes the
// wizard without drawing a frame. A deliberate re run asks everything, because
// going looking for it says more than the stored values do.
export const remainingSteps = () => {
	if (rerunning) return SETUP_QUESTION_STEPS.map((entry) => entry.step).concat(['tour']);
	const steps = SETUP_QUESTION_STEPS
		.filter((entry) => !answeredKeys[entry.settingKey])
		.map((entry) => entry.step);
	// The tour only pays for itself alongside something else. On its own it is
	// a splash screen between the user and the app they came to open.
	if (steps.length === 0) return [];
	return steps.concat(['tour']);
};

export const shouldRun = async (serverId, serverUrl, userId) => {
	if (rerunning) return true;
	if (deferredThisLaunch) return false;
	const serverKey = serverKeyFor(serverId, serverUrl, userId);
	if (!serverKey) return false;
	const map = await getFromStorage(STORE_KEY).catch(() => null);
	if (map && map[serverKey] >= SETUP_WIZARD_VERSION) return false;
	return remainingSteps().length > 0;
};

// Stand down for the rest of this launch without marking anything done.
export const deferThisLaunch = () => {
	// The re run flag goes with it. shouldRun answers true for a re run before
	// it looks at anything else, so leaving it set would send the app straight
	// back here and the wizard would never stop loading.
	rerunning = false;
	deferredThisLaunch = true;
};

// Marks this server and user as set up, whether they answered every question
// or skipped the lot. Skipping is an answer, it means stop asking.
export const markComplete = async (serverId, serverUrl, userId) => {
	rerunning = false;
	const serverKey = serverKeyFor(serverId, serverUrl, userId);
	if (!serverKey) return;
	const map = (await getFromStorage(STORE_KEY).catch(() => null)) || {};
	map[serverKey] = SETUP_WIZARD_VERSION;
	await saveToStorage(STORE_KEY, map);
};

// Asks every question again, whatever the stored values say. Cleared by
// markComplete, which every way out of the wizard goes through.
export const beginRerun = () => {
	rerunning = true;
	deferredThisLaunch = false;
};

// The module holds its state between tests otherwise.
export const resetGateForTests = () => {
	for (const key of Object.keys(answeredKeys)) delete answeredKeys[key];
	for (const key of Object.keys(signInRead)) delete signInRead[key];
	deferredThisLaunch = false;
	rerunning = false;
};
