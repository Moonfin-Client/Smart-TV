// What Radarr or Sonarr's own queue says about one title, read through Moonbase. Seerr only
// passes the queue along for servers with Enable Scan on and drops the arr's messages, so
// this is where a stuck download's reason, a title the arr can't find and the release an
// admin can swap out come from. Every value here assumes a 200 from the plugin. Any other
// answer is null upstream and leaves Seerr's own picture as it was.

import {
	DOWNLOAD_STATE,
	MEDIA_STATUS,
	REQUEST_STATUS,
	getDownloadSummary,
	getMediaDownloadSummary,
	getRequestDownloadSummary
} from './seerrStatus';

// Which arr to ask, and by what id, or null when the plugin can't answer for it. Only the
// default non-4K servers are read, so a 4K track keeps Seerr's picture alone. Sonarr is
// asked by TVDB id, which Seerr keeps on the media info.
export const arrQueueTarget = (mediaType, media, is4k = false) => {
	if (is4k || !media) return null;
	if (mediaType === 'movie') {
		return media.tmdbId ? {service: 'radarr', id: media.tmdbId} : null;
	}
	if (mediaType === 'tv') {
		return media.tvdbId ? {service: 'sonarr', id: media.tvdbId} : null;
	}
	return null;
};

const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const trimmed = (text) => (typeof text === 'string' ? text.trim() : '');

// The arr's own words for an item: its error, else the first message in any group it
// attached, else the first group title. Null when it gave none. Shown verbatim, since
// it's the arr talking, and the screens cut it to fit.
export const itemReason = (item) => {
	if (!item) return null;
	const error = trimmed(item.errorMessage);
	if (error) return error;
	const groups = Array.isArray(item.statusMessages) ? item.statusMessages : [];
	for (const group of groups) {
		const message = (group?.messages || []).map(trimmed).find(Boolean);
		if (message) return message;
	}
	for (const group of groups) {
		const title = trimmed(group?.title);
		if (title) return title;
	}
	return null;
};

// A download moving along with nothing flagged has no reason to show.
const reasonFor = (item, state) => {
	const tracked = lower(item?.trackedDownloadStatus);
	if (state === DOWNLOAD_STATE.DOWNLOADING && (!tracked || tracked === 'ok')) return null;
	return itemReason(item);
};

// The states where the release itself is the trouble, so swapping it can help.
const SWAPPABLE = [DOWNLOAD_STATE.STALLED, DOWNLOAD_STATE.IMPORT_BLOCKED, DOWNLOAD_STATE.FAILED];

// A season request only cares about its own seasons. Radarr items and Sonarr items
// with no season number pass.
const forSeasons = (items, seasons) => {
	if (!seasons || seasons.length === 0) return items;
	const wanted = new Set(seasons);
	return items.filter((item) => item?.seasonNumber == null || wanted.has(item.seasonNumber));
};

// The plugin passes the arr's field names through, which spell sizeleft and timeleft in
// lower case. Part 1's summary reads Seerr's spelling.
const asSeerrEntry = (item) => ({...item, sizeLeft: item.sizeleft, timeLeft: item.timeleft});

// The arr has the title, is watching for it, has no file and nothing queued, so it is
// searching and coming up empty. Radarr alone says whether the film is out yet and
// whether it has a file, and an unreleased film is waiting, not missing, so only a
// definite answer for both counts.
export const isNotFoundYet = (response, items = response?.items) => {
	if (!response || response.service !== 'radarr') return false;
	return response.inArr === true &&
		response.monitored === true &&
		response.hasFile === false &&
		response.isAvailable === true &&
		Array.isArray(items) && items.length === 0;
};

// Everything the screens need from one 200. `seasons` narrows a Sonarr answer to a season
// request's seasons. The summary replaces the one built from Seerr's copy of the queue.
// The reason and the release an admin can swap both come from the item that decides the
// bar's state, the worst one.
export const readArrQueue = (response, {seasons} = {}) => {
	if (!response || !Array.isArray(response.items)) return null;
	const items = forSeasons(response.items, seasons);
	const summary = getDownloadSummary(items.map(asSeerrEntry), reasonFor);
	const deciding = summary?.decidingItem || null;
	const swappable = Boolean(deciding) && SWAPPABLE.includes(summary.state);
	return {
		service: response.service,
		summary,
		reason: summary?.reason || null,
		removable: response.canRemove === true && swappable && deciding.id != null
			? {service: response.service, id: deciding.id, release: deciding.title || ''}
			: null,
		notFoundYet: isNotFoundYet(response, items)
	};
};

const inDownloadStage = (status) => status === MEDIA_STATUS.PROCESSING || status === MEDIA_STATUS.PARTIALLY_AVAILABLE;

// Whether the HD track is far enough along for the arr's queue to matter, so a
// title already in the library or never asked for costs no call.
export const wantsArrQueue = (media) => Boolean(media) && inDownloadStage(media.status);

// The HD bar's summary. A 200 from the plugin replaces Seerr's copy of the queue,
// which Seerr only keeps for servers with Enable Scan on, and adds the arr's
// reason. Part 1's gate still holds: a bar only while Seerr says the title is on
// its way. Without a 200 it is Part 1's summary.
export const hdDownloadFor = (media, view) => {
	if (!view) return getMediaDownloadSummary(media, false);
	if (!wantsArrQueue(media) || !view.summary) return null;
	return {...view.summary, reason: view.reason};
};

// "Not found yet" for a title's HD track: the arr is searching and coming up
// empty, Seerr still has it as processing, and an HD request has been approved.
export const hdNotFoundYet = (media, view) => Boolean(view?.notFoundYet) &&
	media?.status === MEDIA_STATUS.PROCESSING &&
	(media.requests || []).some((req) => !req.is4k && req.status === REQUEST_STATUS.APPROVED);

// Whether a request card asks the plugin about its title: an approved HD request
// for a title on its way.
export const requestWantsArrQueue = (req) => Boolean(req) && !req.is4k &&
	req.status === REQUEST_STATUS.APPROVED && wantsArrQueue(req.media);

// The same two answers for one request card, which reads its own seasons.
export const requestQueueView = (req, response) => {
	if (!requestWantsArrQueue(req) || !response) return null;
	const seasons = (req.seasons || []).map((season) => season.seasonNumber).filter((n) => n != null);
	return readArrQueue(response, {seasons});
};

export const requestDownloadFor = (req, view) => {
	if (!view) return getRequestDownloadSummary(req);
	return view.summary ? {...view.summary, reason: view.reason} : null;
};

export const requestNotFoundYet = (req, view) => Boolean(view?.notFoundYet) && req?.media?.status === MEDIA_STATUS.PROCESSING;

const SERVICE_NAMES = {radarr: 'Radarr', sonarr: 'Sonarr'};

// The arr's name as the messages say it, from the response's `service`.
export const arrServiceName = (service) => SERVICE_NAMES[service] || service || '';
