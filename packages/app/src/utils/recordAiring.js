import $L from '@enact/i18n/$L';

import {
	RECORD_PROMPT_GRACE_MS, canKeepAsComplete, completeShowingOptions, isExtendedSupported, offersCompleteShowing,
	requestCompleteShowing, scheduleSuggestedShowing
} from '../services/incompleteRecordings';
import {formatClockTime} from './clock';
import {parseServerDate} from './serverDate';
import {uiLocale} from './uiLocale';

const OPTIONS_TIMEOUT_MS = 3000;
const DAY_MS = 86400000;

export const RECORD_CHOICE = {
	now: 'now',
	later: 'later',
	both: 'both'
};

export const RECORD_OUTCOME = {
	cancelled: 'cancelled',
	recorded: 'recorded',
	recordedWithLaterShowing: 'recordedWithLaterShowing',
	recordedLaterShowingFailed: 'recordedLaterShowingFailed',
	laterShowingOnly: 'laterShowingOnly',
	laterShowingOnlyFailed: 'laterShowingOnlyFailed'
};

// "16.1 WPTODT": a channel's number and name, skipping whichever is missing.
export const recordPromptChannel = (number, name) => [number, name]
	.filter((part) => part != null)
	.map((part) => String(part).trim())
	.filter(Boolean)
	.join(' ');

const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// When a later showing airs, as the Record prompt's button names it: a time today, Tomorrow, a
// weekday within the week, otherwise a short date.
export const laterShowingWhen = (start, clockDisplay, now = new Date()) => {
	// Rounded so a daylight saving change doesn't shorten a day to 23 hours.
	const days = Math.round((dayStart(start) - dayStart(now)) / DAY_MS);
	if (days <= 0) return formatClockTime(start, clockDisplay);
	if (days === 1) return $L('Tomorrow');
	if (days < 7) return start.toLocaleDateString(uiLocale(), {weekday: 'long'});
	return start.toLocaleDateString(uiLocale(), {month: 'short', day: 'numeric'});
};

// Two program descriptions say different things, ignoring case and spacing. A missing one proves
// nothing either way.
export const descriptionsDiffer = (a, b) => {
	const normalized = (text) => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
	const left = normalized(a);
	const right = normalized(b);
	return Boolean(left && right && left !== right);
};

// The airing Record was pressed on, as the prompt shows it. Guide programs carry only the
// channel's id, so the caller passes the channel's number and name when it has them.
const recordPromptAiring = (program, start, channel) => ({
	start,
	end: parseServerDate(program.EndDate),
	channel: channel ?? recordPromptChannel(program.ChannelNumber, program.ChannelName),
	description: (program.Overview || '').trim(),
	season: program.ParentIndexNumber ?? null,
	episode: program.IndexNumber ?? null
});

const withTimeout = (promise, ms, fallback) => new Promise((resolve) => {
	const timer = setTimeout(() => resolve(fallback), ms);
	promise.then((value) => {
		clearTimeout(timer);
		resolve(value);
	}, () => {
		clearTimeout(timer);
		resolve(fallback);
	});
});

// The Record workflow for one airing, shared by the guide and the player. It asks the plugin
// for a future showing while setLoading shows the wait, offers the prompt when there is anything
// to offer, runs createTimer (which throws when the server refuses) and then asks for the later
// showing if the viewer chose it. stillValid is checked after each wait, for a screen that may
// have moved on.
export const recordAiring = async ({program, start, createTimer, prompt, setLoading, stillValid = () => true, channel}) => {
	let choice = null;
	let suggestion = null;
	let offerSearch = offersCompleteShowing(program, Date.now());
	if (isExtendedSupported() && canKeepAsComplete() && Date.now() - start.getTime() > RECORD_PROMPT_GRACE_MS) {
		setLoading?.(true);
		const none = {canSearch: false, showing: null, answered: false};
		const options = await withTimeout(completeShowingOptions(program.Id), OPTIONS_TIMEOUT_MS, none);
		setLoading?.(false);
		if (!stillValid()) return RECORD_OUTCOME.cancelled;
		// The server's answer decides how the showing was matched, and the guide's own episode
		// numbers are only a fallback when it didn't answer.
		offerSearch = options.answered ? options.canSearch : offerSearch;
		suggestion = options.showing;
	}
	if (offerSearch || suggestion) {
		choice = await prompt({
			programName: program.Name,
			airing: recordPromptAiring(program, start, channel),
			suggestion,
			searchForCompleteShowing: offerSearch
		});
		if (choice == null || !stillValid()) return RECORD_OUTCOME.cancelled;
	}

	const laterOnly = choice === RECORD_CHOICE.later;
	if (!laterOnly) {
		await createTimer();
		if (choice !== RECORD_CHOICE.both) return RECORD_OUTCOME.recorded;
	}
	const scheduled = suggestion
		? await scheduleSuggestedShowing(program.Id, suggestion)
		: await requestCompleteShowing(program.Id);
	if (laterOnly) return scheduled ? RECORD_OUTCOME.laterShowingOnly : RECORD_OUTCOME.laterShowingOnlyFailed;
	return scheduled ? RECORD_OUTCOME.recordedWithLaterShowing : RECORD_OUTCOME.recordedLaterShowingFailed;
};

// The toast for a finished recordAiring, or null after a cancel.
export const recordAiringMessage = (outcome) => {
	switch (outcome) {
		case RECORD_OUTCOME.recorded: return $L('Program set to record');
		case RECORD_OUTCOME.recordedWithLaterShowing: return $L('Recording started. A future showing will be recorded too.');
		case RECORD_OUTCOME.recordedLaterShowingFailed: return $L("Recording started, but couldn't request a future showing.");
		case RECORD_OUTCOME.laterShowingOnly: return $L('The future showing will be recorded.');
		case RECORD_OUTCOME.laterShowingOnlyFailed: return $L("Couldn't request the future showing, so nothing will be recorded.");
		default: return null;
	}
};

// The guide refreshes before a future showing is added, or not at all when only the future
// showing was asked for, so these outcomes need another refresh to show it.
export const outcomeAddsFutureShowing = (outcome) =>
	outcome === RECORD_OUTCOME.recordedWithLaterShowing || outcome === RECORD_OUTCOME.laterShowingOnly;
