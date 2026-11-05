// The titled TMDB thumb the Moonfin plugin picks for a movie or show from Seerr or an
// outside list, the wide picture a card grows into when the server has no art of its own.

import {useSyncExternalStore} from 'react';
import {getApiKey, getServerUrl, getTokenParam} from '../services/jellyfinApi';
import {isLegacyTizen, isWebOS} from '../platform';
import {knownSiloMoonbase, moonbaseAssetUrl} from '../services/moonbaseEndpoint';

// Whether the plugin can hand thumbs out. App keeps it in step with the plugin ping, so a
// card can ask without reading the Seerr context.
let thumbsAvailable = false;
const listeners = new Set();

export const setTmdbThumbsAvailable = (available) => {
	const next = available === true;
	if (next === thumbsAvailable) return;
	thumbsAvailable = next;
	listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const ignore = () => () => {};
const readAvailable = () => thumbsAvailable;

// Rows bail out of redrawing while their items stay the same, so a card drawn before the
// ping came back listens for it here. Only the cards that could show a thumb listen.
export const useTmdbThumbsAvailable = (watch) => useSyncExternalStore(watch ? subscribe : ignore, readAvailable);

// A movie or show from Seerr or an outside list that the server doesn't hold. Tiles carry
// the same Seerr marks but stand for a genre, studio or network, and an owned title has
// the library's own art.
export const isUnownedSeerrTitle = (item) => Boolean(item?._seerr) &&
	!item._resolvedFromExternal &&
	(!item._seerrType || item._seerrType === 'item') &&
	(item._seerrMediaType === 'movie' || item._seerrMediaType === 'tv');

// Image tags can't send auth headers, so the token rides in the query. An IMDb id only
// counts when there is no TMDB id.
export const seerrThumbUrl = (item) => {
	if (!thumbsAvailable || !isUnownedSeerrTitle(item)) return null;
	const tmdbId = item._seerrRaw?.mediaId ?? item.ProviderIds?.Tmdb;
	const imdbId = item._seerrRaw?.imdbId ?? item.ProviderIds?.Imdb;
	let id;
	if (tmdbId) id = `tmdbId=${encodeURIComponent(tmdbId)}`;
	else if (imdbId) id = `imdbId=${encodeURIComponent(imdbId)}`;
	else return null;

	const server = (getServerUrl() || '').replace(/\/+$/, '');
	const token = getApiKey();
	if (!server || !token) return null;
	// The sets that load TMDB images over http, since https to TMDB can fail there, ask the
	// plugin to send them to TMDB over http too.
	const scheme = isWebOS() || isLegacyTizen() ? '&scheme=http' : '';
	const path = `/Moonfin/Tmdb/Thumb?type=${item._seerrMediaType}&${id}${scheme}`;
	if (knownSiloMoonbase(server)) return moonbaseAssetUrl(server, path, token);
	return `${server}${path}&${getTokenParam()}=${encodeURIComponent(token)}`;
};

// The wide picture such a title shows, the plugin thumb first and the plain backdrop when
// the plugin can't make one. failedUrl is a thumb that already failed to load, so a title
// the plugin has nothing for falls back instead of staying broken.
export const seerrWideArtUrl = (item, failedUrl = null) => {
	if (!isUnownedSeerrTitle(item)) return null;
	const thumb = seerrThumbUrl(item);
	if (thumb && thumb !== failedUrl) return thumb;
	return item._externalBackdropUrl || null;
};
