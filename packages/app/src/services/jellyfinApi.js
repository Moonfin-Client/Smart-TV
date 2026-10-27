import packageJson from '../../package.json';
import {buildQueryString} from '../utils/urlCompat';
import {normalizeServerUrl} from '../utils/serverUrl';
import {classifyError} from '../utils/connectionErrors';
import {mediaServerQueue} from '../utils/requestQueue';
import {platformFetch} from './secureFetch';
import {getPlatform} from '../platform';
import {makeUserRoutes, trimQuerySeparator, legacyAuthHeader, buildUserImageUrl} from '../utils/serverRoutes';
import * as userDataSync from './userDataSync';
import {SUPPORTED_COMMANDS} from './remoteControl';
import {createPlexApi, withEveryMethod} from './plexApi';
import {isPlexServer, registerPlexServer} from '../utils/plexUrls';
const APP_VERSION = packageJson.version;

const PLATFORM_IDENTITY = {
	tizen: {appName: 'Moonfin for Tizen', deviceName: 'Samsung Smart TV', tag: 'tizen'},
	vega: {appName: 'Moonfin for Fire TV', deviceName: 'Fire TV', tag: 'vega'},
	webos: {appName: 'Moonfin for webOS', deviceName: 'LG Smart TV', tag: 'webos'},
	xbox: {appName: 'Moonfin for Xbox', deviceName: 'Xbox', tag: 'xbox'}
};
const {appName: APP_NAME, deviceName: DEVICE_NAME, tag: platformTag} = PLATFORM_IDENTITY[getPlatform()] || PLATFORM_IDENTITY.webos;

let deviceId = null;
let currentServer = null;
let currentUser = null;
let accessToken = null;
let serverType = 'jellyfin';

// ParentIds that returned 401/403 (no library access) this session. Requests
// for them are skipped so a restricted user does not repeatedly hit the server
// with 401s, which can trip reverse-proxy Fail2Ban jails (#272).
const accessDeniedParentIds = new Set();
// The library's provider ids on Jellyfin, read when an outside list row needs matching.
let libraryIndex = null;
const parentIdOf = (endpoint) => {
	const match = /[?&]ParentId=([^&]+)/.exec(endpoint);
	return match ? match[1] : null;
};

export const setServer = (serverUrl) => {
	currentServer = normalizeServerUrl(serverUrl);
};

export const setServerType = (type) => {
	serverType = type === 'emby' || type === 'plex' ? type : 'jellyfin';
	// eslint-disable-next-line no-use-before-define
	applyServerType();
};

export const getServerType = () => serverType;

// Jellyfin 12 drops the lowercase api_key param while Emby still requires it
export const getTokenParam = (type) => {
	const kind = type || serverType;
	if (kind === 'plex') return 'X-Plex-Token';
	return kind === 'emby' ? 'api_key' : 'ApiKey';
};

// Exported for the callers that build a raw URL instead of going through request().
export const userRoutes = makeUserRoutes(() => serverType, () => currentUser);

// Emby keeps the libraries hidden from My Media in its views, so they are dropped here by the
// user's own exclude list. Jellyfin already leaves them out.
const withoutHiddenViews = async (views, user) => {
	const [viewsResult, userResult] = await Promise.all([views, user.catch(() => null)]);
	const excludes = userResult?.Configuration?.MyMediaExcludes || [];
	if (excludes.length === 0 || !Array.isArray(viewsResult?.Items)) return viewsResult;
	return {...viewsResult, Items: viewsResult.Items.filter((item) => !excludes.includes(item.Id))};
};

export const getUserImageUrl = (serverUrl, userId, imageTag, type) =>
	buildUserImageUrl(serverUrl, userId, imageTag, type || serverType);

// Who wants to know when the signed-in server refuses a request. A user whose access schedule
// has just ended is refused everything, which nothing else would tell the app.
const forbiddenListeners = new Set();
export const onForbidden = (listener) => {
	forbiddenListeners.add(listener);
	return () => forbiddenListeners.delete(listener);
};

// Parents the server refused are remembered so they aren't asked for again, which has to be
// forgotten when the refusal might have been about the hour and not the parent.
export const clearAccessDenied = () => accessDeniedParentIds.clear();

export const setAuth = (userId, token) => {
	currentUser = userId;
	accessToken = token;
	accessDeniedParentIds.clear();
	libraryIndex = null;
	if (serverType === 'plex') registerPlexServer(currentServer, token);
	if (token) reportCapabilities();
};

const sanitizeHeaderValue = (value) => {
	const str = String(value == null ? '' : value);
	const cleaned = str.replace(/[^\x20-\x7E]/g, ' ').replace(/["\\,]/g, ' ').replace(/\s+/g, ' ').trim();
	return cleaned || 'Unknown';
};

const buildAuthHeader = (type, token) => {
	const scheme = type === 'emby' ? 'Emby' : 'MediaBrowser';
	let header = `${scheme} Client="${APP_NAME}", Device="${DEVICE_NAME}", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
	if (token) {
		header += `, Token="${sanitizeHeaderValue(token)}"`;
	}
	return header;
};

export const getAuthHeader = () => buildAuthHeader(serverType, accessToken);
export const getAuthHeaderFor = buildAuthHeader;

export const initDeviceId = async () => {
	try {
		const {getFromStorage} = await import('./storage');
		const stored = await getFromStorage('_deviceId');
		if (stored) {
			deviceId = stored;
			return deviceId;
		}
	} catch (e) {
		// Storage not available
	}

	deviceId = `moonfin_${platformTag}_` + Date.now().toString(36) + Math.random().toString(36).substring(2);

	try {
		const {saveToStorage} = await import('./storage');
		await saveToStorage('_deviceId', deviceId);
	} catch (e) {
		// Storage not available
	}

	return deviceId;
};

export const getServerUrl = () => currentServer;
export const getUserId = () => currentUser;
export const getApiKey = () => accessToken;
export const getDeviceInfo = () => ({appName: APP_NAME, appVersion: APP_VERSION, deviceName: DEVICE_NAME, deviceId});
export const buildEmbyAuthHeader = (token) => buildAuthHeader('emby', token);

// Past roughly this much of a query string, servers and the proxies in front of them start
// refusing the URL outright, so a long list of ids travels in a body instead.
const CHANNEL_IDS_URL_LIMIT = 1800;
const LIVE_TV_CATEGORY_FLAGS = {movies: 'IsMovie', series: 'IsSeries', sports: 'IsSports', news: 'IsNews', kids: 'IsKids'};

const DEFAULT_TIMEOUT_MS = 15000;
const PLAYBACK_TIMEOUT_MS = 120000;
// Some servers answer a people search far slower than everything else, so it
// gets a limit of its own rather than holding the other results back.
const PEOPLE_SEARCH_TIMEOUT_MS = 10000;
// The playback information dialog waits on this, so it gives up quickly and goes without.
const OWN_SESSION_TIMEOUT_MS = 1500;
export const HOME_ROW_ITEM_FIELDS = 'DateCreated,PremiereDate,PrimaryImageAspectRatio,OfficialRating,Overview,Genres,GenreItems,ProductionYear,RunTimeTicks,CommunityRating,CriticRating,ProviderIds,ImageTags,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,ParentPrimaryImageTag,SeriesName,SeriesId,ParentIndexNumber,IndexNumber,UserData,AlbumArtist,AlbumId,AlbumPrimaryImageTag';

// The home Next Up row asks the server for a window instead of the whole watch
// history, which is what keeps the query fast on a large library. A series page
// skips it, since a window there would hide the episode the user opened it for.
// Emby has no window parameter, and 4.10 answers a Next Up that isn't scoped to
// one series with an empty list unless it's asked for the legacy one, which is
// the same list its own home screen shows. Older Emby servers ignore the flag.
const homeNextUpQuery = (seriesId, maxDays, type) => {
	if (seriesId) return '';
	if (type === 'emby') return '&LegacyNextUp=true';
	if (typeof maxDays !== 'number' || maxDays <= 0) return '';
	const cutoff = new Date(Date.now() - maxDays * 86400000);
	return `&NextUpDateCutoff=${encodeURIComponent(cutoff.toISOString())}`;
};

// Folds the two filter responses into one shape. Genres arrive as plain names
// from the older endpoint and as objects from the newer one, and languages
// carry a display name beside the code the query takes.
const names = (list) => (Array.isArray(list) ? list : [])
	.map(entry => (entry && typeof entry === 'object' ? entry.Name : entry))
	.filter(Boolean);

const languages = (list) => (Array.isArray(list) ? list : [])
	.filter(entry => entry && entry.Value)
	.map(entry => ({name: entry.Name || entry.Value, value: entry.Value}));

const firstNonEmpty = (a, b) => (a.length ? a : b);

const mergeQueryFilters = (legacy = {}, current = {}) => ({
	genres: firstNonEmpty(names(legacy.Genres), names(current.Genres)),
	officialRatings: names(legacy.OfficialRatings),
	tags: firstNonEmpty(names(legacy.Tags), names(current.Tags)),
	years: (Array.isArray(legacy.Years) ? legacy.Years : []).filter(y => typeof y === 'number'),
	audioLanguages: languages(current.AudioLanguages),
	subtitleLanguages: languages(current.SubtitleLanguages)
});

// Both api objects read the same two endpoints, differing only in how they
// reach the server.
const readQueryFilters = (send, userId, parentId, includeItemTypes) => {
	const scope =
		(parentId ? `&ParentId=${encodeURIComponent(parentId)}` : '') +
		(includeItemTypes ? `&IncludeItemTypes=${encodeURIComponent(includeItemTypes)}` : '');
	const safe = (path) => send(path).catch(() => ({}));
	return Promise.all([
		safe(`/Items/Filters?UserId=${userId}${scope}`),
		safe(`/Items/Filters2?UserId=${userId}${scope}`)
	]).then(([legacy, current]) => mergeQueryFilters(legacy, current));
};

// Routes through the webOS TLS proxy fallback (secureFetch) so Let's-Encrypt
// servers work on old TVs whose CA store rejects them; native fetch elsewhere.
const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) =>
	mediaServerQueue.run(() => platformFetch(url, options, timeoutMs));
export const getDeviceId = () => deviceId;

const request = async (endpoint, options = {}) => {
	const url = `${currentServer}${trimQuerySeparator(endpoint)}`;
	const parentId = parentIdOf(endpoint);
	if (parentId && accessDeniedParentIds.has(parentId)) {
		const error = new Error('Access denied (cached): ' + parentId);
		error.status = 403;
		throw error;
	}

	let response;
	try {
		const authHeader = getAuthHeader();
		response = await fetchWithTimeout(url, {
			method: options.method || 'GET',
			headers: {
				'Authorization': authHeader,
				...legacyAuthHeader(serverType, authHeader),
				'Content-Type': 'application/json',
				...options.headers
			},
			body: options.body ? JSON.stringify(options.body) : undefined
		}, options.timeoutMs || DEFAULT_TIMEOUT_MS);
	} catch (err) {
		const typed = new Error(err.message);
		typed.connectionType = classifyError(err);
		throw typed;
	}

	if (!response.ok) {
		if ((response.status === 401 || response.status === 403) && parentId) {
			accessDeniedParentIds.add(parentId);
		}
		if (response.status === 403) forbiddenListeners.forEach((listener) => listener());
		const error = new Error('API Error: ' + response.status);
		error.status = response.status;
		error.connectionType = classifyError(error);
		throw error;
	}

	if (response.status === 204) {
		return null;
	}

	const text = await response.text();
	if (!text) return null;
	return JSON.parse(text);
};

let userRead = null;

// Several callers read the user as the app starts, so a read still on its way, or one answered
// in the last few seconds, is shared.
const readCurrentUser = () => {
	const session = `${currentServer}|${currentUser}|${accessToken}`;
	if (userRead && userRead.session === session && (!userRead.at || Date.now() - userRead.at < 5000)) {
		return userRead.promise;
	}
	const entry = {session, at: 0, promise: request(`/Users/${currentUser}`)};
	userRead = entry;
	entry.promise.then(() => {
		entry.at = Date.now();
	}, () => {
		if (userRead === entry) userRead = null;
	});
	return entry.promise;
};

let capabilitiesSent = null;

// Signing in reports what this session can do and the socket opening a moment later would send it
// again, so the socket skips a report made for the same session in the last few seconds.
export function reportCapabilities({unlessRecent = false} = {}) {
	if (!currentServer || !accessToken || serverType === 'plex') return;
	const session = `${currentServer}|${accessToken}`;
	if (unlessRecent && capabilitiesSent?.session === session && Date.now() - capabilitiesSent.at < 10000) return;
	capabilitiesSent = {session, at: Date.now()};
	request('/Sessions/Capabilities/Full', {
		method: 'POST',
		body: {
			PlayableMediaTypes: ['Video', 'Audio'],
			SupportedCommands: SUPPORTED_COMMANDS,
			SupportsMediaControl: true,
			SupportsPersistentIdentifier: false
		}
	}).catch(() => {});
}

// TMDB numbers movies and shows separately, so its id only names a title together with the
// type. IMDb ids are unique on their own.
const providerKeys = (ids, type) => {
	const keys = [];
	if (ids?.Tmdb && (type === 'Movie' || type === 'Series')) keys.push(`tmdb.${type}.${ids.Tmdb}`);
	if (ids?.Imdb) keys.push(`imdb.${ids.Imdb}`);
	return keys;
};

const addToIndex = (index, item, value) => {
	for (const key of providerKeys(item.ProviderIds, item.Type)) {
		if (!index[key]) index[key] = value;
	}
};

const MATCH_CHUNK = 40;
const OWNED_TYPES = 'IncludeItemTypes=Movie,Series';

// Emby can filter by provider id itself, so it's asked for every id the items carry.
const matchOnEmby = async (wanted) => {
	const tokens = [];
	for (const {ProviderIds: ids} of wanted) {
		for (const token of [ids.Tmdb && `tmdb.${ids.Tmdb}`, ids.Imdb && `imdb.${ids.Imdb}`]) {
			if (token && !tokens.includes(token)) tokens.push(token);
		}
	}
	const found = {};
	for (let i = 0; i < tokens.length; i += MATCH_CHUNK) {
		const chunk = tokens.slice(i, i + MATCH_CHUNK);
		const query = chunk.map((token) => encodeURIComponent(token)).join(',');
		const res = await request(`${userRoutes.items()}Recursive=true&${OWNED_TYPES}&AnyProviderIdEquals=${query}&Fields=${HOME_ROW_ITEM_FIELDS}&Limit=${chunk.length * 2}`);
		for (const item of (res?.Items || [])) addToIndex(found, item, item);
	}
	return found;
};

// Jellyfin ignores a provider id filter and answers with the whole library, so the library's
// ids are read once a page at a time and reused for a while.
const INDEX_PAGE = 1000;
const INDEX_TTL_MS = 30 * 60 * 1000;

// On Plex the api object asks for the same page in Plex's own terms.
const indexPage = (start) => (serverType === 'plex'
	// eslint-disable-next-line no-use-before-define
	? api.getItems({IncludeItemTypes: 'Movie,Series', Fields: 'ProviderIds', StartIndex: start, Limit: INDEX_PAGE})
	: request(`${userRoutes.items()}Recursive=true&${OWNED_TYPES}&Fields=ProviderIds&EnableImages=false&EnableUserData=false&EnableTotalRecordCount=false&StartIndex=${start}&Limit=${INDEX_PAGE}`));

const loadLibraryIndex = async () => {
	const index = {};
	let start = 0;
	let pageFull = true;
	while (pageFull) {
		const res = await indexPage(start);
		const page = res?.Items || [];
		for (const item of page) addToIndex(index, item, item.Id);
		pageFull = page.length === INDEX_PAGE;
		start += INDEX_PAGE;
	}
	return index;
};

const readLibraryIndex = () => {
	if (!libraryIndex || Date.now() - libraryIndex.at > INDEX_TTL_MS) {
		const index = loadLibraryIndex();
		libraryIndex = {at: Date.now(), index};
		// A failed read isn't kept, so the next home load tries again.
		index.catch(() => {
			if (libraryIndex?.index === index) libraryIndex = null;
		});
	}
	return libraryIndex.index;
};

// The module holds its state between tests otherwise.
export const resetLibraryIndexForTests = () => {
	libraryIndex = null;
};

const matchOnJellyfin = async (wanted) => {
	const index = await readLibraryIndex();
	const ids = [];
	for (const it of wanted) {
		for (const key of providerKeys(it.ProviderIds, it.Type)) {
			if (index[key] && !ids.includes(index[key])) ids.push(index[key]);
		}
	}
	const found = {};
	for (let i = 0; i < ids.length; i += MATCH_CHUNK) {
		const chunk = ids.slice(i, i + MATCH_CHUNK);
		const res = serverType === 'plex'
			// eslint-disable-next-line no-use-before-define
			? await api.getItems({Ids: chunk.join(',')})
			: await request(`${userRoutes.items()}Ids=${chunk.join(',')}&Fields=${HOME_ROW_ITEM_FIELDS}`);
		for (const item of (res?.Items || [])) addToIndex(found, item, item);
	}
	return found;
};

// Resolves external list items (carrying TMDB/IMDb provider ids) against the
// local library. Owned titles are swapped for the real library item so they
// are playable, unowned ones are returned unchanged for the Seerr fallback.
export const resolveItemsByProviderIds = async (items) => {
	if (!Array.isArray(items) || items.length === 0 || !currentUser) return items || [];
	const wanted = items.filter((it) => providerKeys(it.ProviderIds, it.Type).length > 0);
	if (wanted.length === 0) return items;

	let found;
	try {
		found = await (serverType === 'emby' ? matchOnEmby(wanted) : matchOnJellyfin(wanted));
	} catch {
		return items;
	}

	return items.map((it) => {
		const key = providerKeys(it.ProviderIds, it.Type).find((candidate) => found[candidate]);
		const jf = key ? found[key] : null;
		return jf ? {
			...it,
			...jf,
			_resolvedFromExternal: true,
			_external: it._external,
			_externalBackdropUrl: it._externalBackdropUrl,
			_externalPosterUrl: it._externalPosterUrl,
			UserRating: it.UserRating || jf.UserRating || null
		} : it;
	});
};

// Servers disagree about how the collection endpoints want their arguments, and
// the ones that reject a shape answer with one of these rather than a 5xx. Both
// writers below walk the accepted shapes and only give up once all have failed.
const COLLECTION_RETRY_STATUSES = [400, 404, 405, 415, 422];
const canRetryCollection = (err) => COLLECTION_RETRY_STATUSES.includes(err?.status);

const createCollectionVia = (send) => async (name, itemIds = []) => {
	const encoded = encodeURIComponent(name);
	const ids = itemIds.join(',');
	// Some builds match the query keys case sensitively, so send both spellings.
	const query = `Name=${encoded}&name=${encoded}${ids ? `&Ids=${ids}&ids=${ids}` : ''}`;
	try {
		return await send(`/Collections?${query}`, {method: 'POST'});
	} catch (err) {
		if (!canRetryCollection(err)) throw err;
		return send(`/Collections?${query}`, {
			method: 'POST',
			body: {Name: name, ...(ids ? {Ids: itemIds} : {})}
		});
	}
};

const collectionItemsVia = (send, method) => async (collectionId, itemIds) => {
	const ids = itemIds.join(',');
	const path = `/Collections/${collectionId}/Items`;
	for (const key of ['Ids', 'ids']) {
		try {
			return await send(`${path}?${key}=${ids}`, {method});
		} catch (err) {
			if (!canRetryCollection(err)) throw err;
		}
	}
	return send(path, {method, body: {Ids: itemIds}});
};

// Jellyfin makes a new playlist public unless told otherwise, and Emby fails on
// Ids sent as an array, so it gets them as a comma list.
const createPlaylistVia = (send, type, userId) => (name, itemIds = []) => send('/Playlists', {
	method: 'POST',
	body: type() === 'emby'
		? {Name: name, Ids: itemIds.join(','), UserId: userId()}
		: {Name: name, Ids: itemIds, UserId: userId(), IsPublic: false}
});

// The casing the remote search endpoint wants in its path.
const REMOTE_SEARCH_TYPES = {
	movie: 'Movie',
	series: 'Series',
	boxset: 'BoxSet',
	person: 'Person',
	musicalbum: 'MusicAlbum',
	musicartist: 'MusicArtist',
	book: 'Book',
	trailer: 'Trailer',
	musicvideo: 'MusicVideo'
};

// Looks an item up with the metadata providers so an admin can correct a bad match. Older
// servers only answer the un-normalized path, so that is kept as a fallback.
const searchRemoteVia = (send) => async (itemType, searchInfo) => {
	const body = {SearchInfo: searchInfo, IncludeDisabledProviders: false};
	const normalized = REMOTE_SEARCH_TYPES[(itemType || '').toLowerCase()] || itemType;
	try {
		return await send(`/Items/RemoteSearch/${normalized}`, {method: 'POST', body});
	} catch (err) {
		if (normalized === itemType) throw err;
		return send(`/Items/RemoteSearch/${itemType}`, {method: 'POST', body});
	}
};

const applyRemoteSearchResultVia = (send) => async (itemId, result, replaceAllImages = true) => {
	const query = `?replaceAllImages=${replaceAllImages}`;
	try {
		return await send(`/Items/RemoteSearch/Apply/${itemId}${query}`, {method: 'POST', body: result});
	} catch {
		return send(`/Items/${itemId}/RemoteSearch/Apply${query}`, {method: 'POST', body: result});
	}
};

const refreshItemVia = (send) => (itemId, {recursive, replaceAllMetadata, replaceAllImages} = {}) => {
	const params = [];
	if (recursive != null) params.push(`Recursive=${recursive}`);
	if (replaceAllMetadata != null) params.push(`ReplaceAllMetadata=${replaceAllMetadata}`);
	if (replaceAllImages != null) params.push(`ReplaceAllImages=${replaceAllImages}`);
	return send(`/Items/${itemId}/Refresh${params.length ? `?${params.join('&')}` : ''}`, {method: 'POST'});
};

// What a change the server has taken does to the item's user data, published so every screen
// still holding the item can repaint it.
const publishUserData = (itemId, patch) => (response) => {
	userDataSync.publish(itemId, patch);
	return response;
};

// Either way the server drops the resume point, so this says so too rather than leave a
// progress bar under a watched mark.
const playedUserData = (played) => ({Played: played, PlayedPercentage: null, PlaybackPositionTicks: 0});

export const api = {
	getPublicInfo: () => request('/System/Info/Public'),

	getPublicUsers: () => request('/Users/Public'),

	authenticateByName: (username, password) => request('/Users/AuthenticateByName', {
		method: 'POST',
		body: {Username: username, Pw: password}
	}),

	initiateQuickConnect: () => {
		if (serverType === 'emby') return Promise.reject(new Error('Quick Connect is not supported on Emby'));
		return request('/QuickConnect/Initiate', {method: 'POST'});
	},

	getQuickConnectState: (secret) => request(`/QuickConnect/Connect?Secret=${secret}`),

	authenticateQuickConnect: (secret) => request('/Users/AuthenticateWithQuickConnect', {
		method: 'POST',
		body: {Secret: secret}
	}),

	getLibraries: () => (serverType === 'emby'
		? withoutHiddenViews(request(userRoutes.views()), request(`/Users/${currentUser}`))
		: request(userRoutes.views())),

	getAllLibraries: () => request(`${userRoutes.views()}IncludeHidden=true`),

	getItems: (params = {}) => {
		// Manually build query string to avoid URLSearchParams issues
		const queryParts = [];
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null && value !== '') {
				queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
			}
		}
		const query = queryParts.join('&');
		return request(`${userRoutes.items()}${query}`);
	},

	getItem: (itemId) => request(userRoutes.item(itemId)),

	getLocalTrailers: (itemId) => request(`/Items/${itemId}/LocalTrailers?userId=${currentUser}`),

	getItemForDetail: (itemId) =>
		request(`${userRoutes.item(itemId)}Fields=Overview,Genres,OfficialRating,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentLogoItemId,ParentLogoImageTag,ProviderIds,RunTimeTicks,ProductionYear,Chapters,People,Studios,Taglines,RemoteTrailers,MediaSources,MediaSourceCount,CommunityRating,CriticRating`),

	getItemWithChapters: (itemId) => request(`${userRoutes.item(itemId)}Fields=Chapters`),

	// Just the track list, for the repeated checks after a subtitle download. The
	// full item drags people, chapters and trickplay along with it.
	getItemMediaInfo: (itemId) => request(`${userRoutes.item(itemId)}Fields=MediaSources,MediaStreams`),

	getMediaSegments: (itemId) => request(`/MediaSegments/${itemId}`),

	getUserConfiguration: () => readCurrentUser(),

	getCurrentUser: () => request('/Users/Me'),

	updateUserConfiguration: (config) => {
		userRead = null;
		return request(userRoutes.configuration(), {
			method: 'POST',
			body: config
		});
	},

	getLatest: (libraryId, limit = 20) =>
		request(`${userRoutes.latest()}ParentId=${libraryId}&Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}&ImageTypeLimit=1&GroupItems=true`),

	getRecentlyReleased: (libraryId, limit = 20, includeItemTypes = 'Movie,Series') =>
		request(`${userRoutes.items()}IncludeItemTypes=${includeItemTypes}&Recursive=true&ParentId=${libraryId}&Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}&ImageTypeLimit=1&SortBy=PremiereDate&SortOrder=Descending&MaxPremiereDate=${encodeURIComponent(new Date().toISOString())}`),

	getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') =>
		request(`${userRoutes.items()}IncludeItemTypes=BoxSet&Recursive=true&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

	getStudios: (limit = 20, sortBy = 'SortName', sortOrder = 'Ascending') =>
		request(`/Studios?UserId=${currentUser}&Recursive=true&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Limit=${limit}&Fields=ItemCounts,PrimaryImageAspectRatio`),

	getResumeItems: (limit = 12) =>
		request(`${userRoutes.resume()}Limit=${limit}&MediaTypes=Video&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`),

	getResumeAudioItems: (limit = 20) =>
		request(`${userRoutes.resume()}Limit=${limit}&MediaTypes=Audio&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`),

	getNextUp: (limit = 24, seriesId = null, maxDays = 0) => {
		const fields = encodeURIComponent(HOME_ROW_ITEM_FIELDS);
		let url = `/Shows/NextUp?UserId=${currentUser}&Limit=${limit}&Fields=${fields}`;
		if (seriesId) url += `&SeriesId=${seriesId}`;
		url += homeNextUpQuery(seriesId, maxDays, serverType);
		return request(url);
	},

	getPlaybackInfo: (itemId, body = {}) => {
		let endpoint = `/Items/${itemId}/PlaybackInfo`;
		if (serverType === 'emby') {
			// Emby also reads these from the query string (see emby_playback_api.dart)
			const qp = [`UserId=${encodeURIComponent(currentUser)}`];
			const map = {AudioStreamIndex: 'audioStreamIndex', SubtitleStreamIndex: 'subtitleStreamIndex', MediaSourceId: 'mediaSourceId', MaxStreamingBitrate: 'maxStreamingBitrate', StartTimeTicks: 'startTimeTicks'};
			for (const [bodyKey, queryKey] of Object.entries(map)) {
				if (body[bodyKey] !== undefined && body[bodyKey] !== null) {
					qp.push(`${queryKey}=${encodeURIComponent(body[bodyKey])}`);
				}
			}
			endpoint += `?${qp.join('&')}`;
		}
		return request(endpoint, {
			method: 'POST',
			body: {UserId: currentUser, ...body},
			timeoutMs: PLAYBACK_TIMEOUT_MS
		});
	},

	reportPlaybackStart: (data) => request('/Sessions/Playing', {
		method: 'POST',
		body: data
	}),

	reportPlaybackProgress: (data) => request('/Sessions/Playing/Progress', {
		method: 'POST',
		body: data
	}),

	reportPlaybackStopped: (data) => request('/Sessions/Playing/Stopped', {
		method: 'POST',
		body: data
	}),

	getOwnSessions: () => request(`/Sessions?DeviceId=${encodeURIComponent(deviceId)}`, {timeoutMs: OWN_SESSION_TIMEOUT_MS}),

	closeLiveStream: (liveStreamId) => request(`/LiveStreams/Close?LiveStreamId=${encodeURIComponent(liveStreamId)}`, {
		method: 'POST'
	}),

	// Tears down a transcode that was started by URL alone, with no playback session
	// behind it, so the server stops encoding the moment the card lets go of it.
	stopActiveEncodings: (playSessionId) =>
		request(`/Videos/ActiveEncodings?deviceId=${encodeURIComponent(deviceId)}&playSessionId=${encodeURIComponent(playSessionId)}`, {
			method: 'DELETE'
		}),

	search: (query, limit = 240) =>
		request(`${userRoutes.items()}searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Recursive=true&IncludeItemTypes=Book,Movie,Series,Season,Episode,Video,MusicVideo,Trailer,Program,Playlist,MusicArtist,MusicAlbum,Audio,PhotoAlbum,Photo,BoxSet,Folder&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist,SeriesName,ParentIndexNumber,IndexNumber,ProviderIds,UserData,OfficialRating`),

	searchPeople: (query, limit = 24) =>
		request(`/Persons?searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Fields=PrimaryImageAspectRatio`, {timeoutMs: PEOPLE_SEARCH_TIMEOUT_MS}),

	getSeasons: (seriesId) =>
		request(`/Shows/${seriesId}/Seasons?UserId=${currentUser}&Fields=PrimaryImageAspectRatio`),

	getEpisodes: (seriesId, seasonId = null) =>
		request(`/Shows/${seriesId}/Episodes?UserId=${currentUser}${seasonId ? `&SeasonId=${seasonId}` : ''}&Fields=PrimaryImageAspectRatio,Overview,LocationType`),

	getSimilar: (itemId, limit = 15, bypass = null) => {
		const bypassQuery = bypass ? `&bypass=${encodeURIComponent(bypass)}` : '';
		return request(`/Items/${itemId}/Similar?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating${bypassQuery}`);
	},

	getMoonfinSimilar: (itemId, limit = 20) => {
		const userQuery = currentUser ? `&userId=${encodeURIComponent(currentUser)}` : '';
		return request(`/Moonfin/Items/${itemId}/Similar?limit=${limit}${userQuery}`);
	},

	getGenres: (libraryId, includeItemTypes = 'Movie,Series', sortBy = 'SortName', sortOrder = 'Ascending') => {
		const params = libraryId ? `&ParentId=${libraryId}` : '';
		return request(`/Genres?UserId=${currentUser}&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Recursive=true&IncludeItemTypes=${encodeURIComponent(includeItemTypes)}${params}`);
	},

	getStudioCompanies: (tmdbId, mediaType) =>
		request(`/Moonfin/Tmdb/ProductionCompanies?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}`),

	getTmdbReviews: (tmdbId, mediaType, language) =>
		request(`/Moonfin/Tmdb/Reviews?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}&language=${encodeURIComponent(language || 'en-US')}`),

	// The plugin keeps a collection's hand-arranged order as a plain list of item ids. Without the
	// plugin or a saved order, the caller falls back to the server's order.
	getCollectionOrder: (collectionId) =>
		request(`/Moonfin/Collections/${collectionId}/Order`),

	saveCollectionOrder: (collectionId, itemIds) =>
		request(`/Moonfin/Collections/${collectionId}/Order`, {method: 'POST', body: itemIds}),

	getMusicGenres: (params = {}) => {
		const merged = {UserId: currentUser, SortBy: 'SortName', SortOrder: 'Ascending', Recursive: 'true'};
		Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
		return request(`/Genres?${buildQueryString(merged)}`);
	},

	getItemsByGenre: (genreId, libraryId, limit = 50) =>
		request(`${userRoutes.items()}GenreIds=${genreId}&ParentId=${libraryId}&Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

	getPerson: (personId) =>
		request(userRoutes.item(personId)),

	// Episodes and music videos get their own rows on a person, and the newest
	// work is the part worth opening on.
	getItemsByPerson: (personId, limit = 100) =>
		request(`${userRoutes.items()}PersonIds=${personId}&Recursive=true&IncludeItemTypes=Movie,Series,MusicVideo,Episode&SortBy=PremiereDate&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating,BasicSyncInfo,People`),

	getFavorites: (limit = 50) =>
		request(`${userRoutes.items()}IsFavorite=true&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

	getRandomItem: (includeTypes = 'Movie,Series') =>
		request(`${userRoutes.items()}IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=1&Fields=PrimaryImageAspectRatio,Overview&ExcludeItemTypes=BoxSet`),

	getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null, fields = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers,OfficialRating') => {
		let includeTypes;
		switch (contentType) {
			case 'movies':
				includeTypes = 'Movie';
				break;
			case 'tv':
				includeTypes = 'Series';
				break;
			default:
				includeTypes = 'Movie,Series';
		}
		const parentParam = parentId ? `&ParentId=${parentId}` : '';
		const genreParam = genreName ? `&Genres=${encodeURIComponent(genreName)}` : '';
		return request(`${userRoutes.items()}IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=${encodeURIComponent(fields)}&HasBackdrop=true&ExcludeItemTypes=BoxSet${parentParam}${genreParam}`);
	},

	// Items for the setup wizard previews, which ask for no backdrop. The
	// random pull above requires one, and a library whose titles carry only
	// posters answers it with nothing however often it is asked, leaving the
	// previews on their drawn stand ins. The previews draw posters and logos
	// happily, so anything real beats nothing.
	getPreviewItems: (limit = 10, fields = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers') =>
		request(`${userRoutes.items()}IncludeItemTypes=Movie,Series&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Fields=${encodeURIComponent(fields)}&ExcludeItemTypes=BoxSet`),

	// With no sort the server hands back the arrangement the collection keeps
	getCollectionItems: (collectionId, limit = 50, sortBy = null, sortOrder = 'Ascending') =>
		request(`${userRoutes.items()}ParentId=${collectionId}&Limit=${limit}&Recursive=true&Fields=PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers,OfficialRating&HasBackdrop=true${sortBy ? `&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}` : ''}`),

	// Get all movies and series for genres page
	getAllItems: (limit = 10000) =>
		request(`${userRoutes.items()}IncludeItemTypes=Movie,Series&Recursive=true&Fields=Genres,PrimaryImageAspectRatio,ProductionYear&SortBy=SortName&SortOrder=Ascending&Limit=${limit}&ExcludeItemTypes=BoxSet`),

	setFavorite: (itemId, isFavorite) => request(userRoutes.favorite(itemId), {
		method: isFavorite ? 'POST' : 'DELETE'
	}).then(publishUserData(itemId, {IsFavorite: isFavorite})),

	setWatched: (itemId, watched) => request(userRoutes.played(itemId), {
		method: watched ? 'POST' : 'DELETE'
	}).then(publishUserData(itemId, playedUserData(watched))),

	hideFromResume: (itemId) => request(`${userRoutes.hideFromResume(itemId)}Hide=true`, {method: 'POST'}),

	setPlaybackPosition: (itemId, ticks) => request(userRoutes.userData(itemId), {
		method: 'POST',
		body: {PlaybackPositionTicks: ticks, LastPlayedDate: new Date().toISOString()}
	}).then(publishUserData(itemId, {PlaybackPositionTicks: ticks})),

	// A thumb rating goes through the dedicated endpoint, which stores the liked
	// flag and a score of its own choosing.
	setRating: (itemId, likes) => request(`/UserItems/${itemId}/Rating?Likes=${likes}`, {
		method: 'POST'
	}).then(publishUserData(itemId, {Likes: likes})),

	// A score is written straight into the user data, on its scale of ten.
	setNumericRating: (itemId, rating) => request(`/UserItems/${itemId}/UserData`, {
		method: 'POST',
		body: {Rating: rating}
	}).then(publishUserData(itemId, {Rating: rating})),

	clearRating: (itemId) => request(`/UserItems/${itemId}/Rating`, {
		method: 'DELETE'
	}).then(publishUserData(itemId, {Rating: null, Likes: null})),

	getIntros: (itemId) =>
		request(userRoutes.extras(itemId, 'Intros')),

	// The values one library holds, so the filter panel only offers years,
	// ratings, tags and languages that match something.
	getQueryFilters: (parentId, includeItemTypes) =>
		readQueryFilters(request, currentUser, parentId, includeItemTypes),

	getAdditionalParts: (itemId) =>
		request(`/Videos/${itemId}/AdditionalParts?UserId=${currentUser}`),

	getSpecialFeatures: (itemId) =>
		request(userRoutes.extras(itemId, 'SpecialFeatures')),

	getAncestors: (itemId) =>
		request(`/Items/${itemId}/Ancestors?UserId=${currentUser}`),

	// Jellyfin 12 and up, so a caller has to cope with a 404 from anything older.
	getItemCollections: (itemId) =>
		request(`/Items/${itemId}/Collections?UserId=${currentUser}&Fields=ProviderIds`),

	getThemeSongs: (itemId, inheritFromParent = true) =>
		request(`/Items/${itemId}/ThemeSongs?UserId=${currentUser}&InheritFromParent=${inheritFromParent}`),

	// Without a limit this returns the full lineup, which the guide sorts and
	// filters client side the way moonfin-core does.
	getLiveTvChannels: (startIndex = 0, limit) =>
		request(`/LiveTv/Channels?UserId=${currentUser}&EnableFavoriteSorting=true&Fields=ImageTags,UserData&EnableTotalRecordCount=false&StartIndex=${startIndex}${limit ? `&Limit=${limit}` : ''}`),

	getLiveTvPrograms: (channelIds, startDate, endDate, {category} = {}) => {
		const ids = Array.isArray(channelIds) ? channelIds : [channelIds];
		const joined = ids.join(',');
		// A program already under way when the guide opens starts before the window, so ask
		// for everything overlapping it rather than only what fits inside it. User data
		// stays out of the response because nothing in the guide reads it per program.
		const params = {
			UserId: currentUser,
			MinEndDate: startDate instanceof Date ? startDate.toISOString() : startDate,
			MaxStartDate: endDate instanceof Date ? endDate.toISOString() : endDate,
			Fields: 'Overview',
			EnableImages: false,
			EnableUserData: false,
			EnableTotalRecordCount: false
		};
		// A category the server can match itself, so the guide can walk a sparse genre across the
		// whole lineup without pulling every channel's schedule.
		const categoryFlag = LIVE_TV_CATEGORY_FLAGS[category];
		if (categoryFlag) params[categoryFlag] = true;

		// A batch of channel ids runs past what some servers accept in a URL, and they
		// answer with an error rather than a shorter guide, so those travel in a body.
		if (joined.length > CHANNEL_IDS_URL_LIMIT) {
			return request('/LiveTv/Programs', {
				method: 'POST',
				body: {...params, ChannelIds: ids}
			});
		}
		return request(`/LiveTv/Programs?${buildQueryString(params)}&ChannelIds=${joined}`);
	},

	getLiveTvProgram: (programId) =>
		request(`/LiveTv/Programs/${programId}?UserId=${currentUser}`),

	getLiveTvAiringPrograms: (limit) =>
		request(`/LiveTv/Programs/Recommended?UserId=${currentUser}&IsAiring=true&Limit=${limit}`),

	// The recordings screen asks for one category per call, mirroring moonfin-core's
	// categorized rails. Without options this stays the plain full listing.
	getLiveTvRecordings: (options = {}) => {
		const params = [`UserId=${currentUser}`];
		if (options.limit) params.push(`Limit=${options.limit}`);
		if (options.isSeries) params.push('IsSeries=true');
		if (options.isMovie) params.push('IsMovie=true');
		if (options.isSports) params.push('IsSports=true');
		if (options.isKids) params.push('IsKids=true');
		params.push('Fields=ImageTags,Overview', 'EnableImages=true');
		return request(`/LiveTv/Recordings?${params.join('&')}`);
	},

	getLiveTvTimers: () =>
		request(`/LiveTv/Timers`),

	// Both timer kinds are created from the server's own defaults for a program
	// rather than a hand built body. The series endpoint needs a fully populated
	// SeriesTimerInfoDto, and a single timer inherits whatever recording padding
	// the user set server side.
	getLiveTvTimerDefaults: (programId) =>
		request(`/LiveTv/Timers/Defaults?ProgramId=${programId}`),

	createLiveTvTimer: async (programId) => {
		let payload;
		try {
			payload = {...(await api.getLiveTvTimerDefaults(programId))};
			if (payload.ProgramId == null) payload.ProgramId = programId;
		} catch {
			// Older servers have no defaults endpoint but still accept a bare id.
			payload = {ProgramId: programId};
		}
		return request(`/LiveTv/Timers`, {method: 'POST', body: payload});
	},

	cancelLiveTvTimer: (timerId) =>
		request(`/LiveTv/Timers/${timerId}`, {
			method: 'DELETE'
		}),

	getLiveTvSeriesTimers: () =>
		request(`/LiveTv/SeriesTimers`),

	// No bare id fallback here, a series timer is only valid as a fully
	// populated dto and the defaults call is the only thing that produces one.
	// The flags pick which episodes it records on top of those defaults.
	createLiveTvSeriesTimer: async (programId, flags) => {
		const payload = {...(await api.getLiveTvTimerDefaults(programId)), ...flags};
		if (payload.ProgramId == null) payload.ProgramId = programId;
		return request(`/LiveTv/SeriesTimers`, {method: 'POST', body: payload});
	},

	getLiveTvSeriesTimer: (seriesTimerId) =>
		request(`/LiveTv/SeriesTimers/${seriesTimerId}`),

	updateLiveTvSeriesTimer: (seriesTimerId, rule) =>
		request(`/LiveTv/SeriesTimers/${seriesTimerId}`, {method: 'POST', body: rule}),

	cancelLiveTvSeriesTimer: (seriesTimerId) =>
		request(`/LiveTv/SeriesTimers/${seriesTimerId}`, {
			method: 'DELETE'
		}),

	searchRemote: searchRemoteVia(request),

	applyRemoteSearchResult: applyRemoteSearchResultVia(request),

	refreshItem: refreshItemVia(request),

	deleteItem: (itemId) =>
		request(`/Items/${itemId}`, {
			method: 'DELETE'
		}),

	getMediaStreams: (itemId) =>
		request(`/Items/${itemId}?Fields=MediaStreams`),

	searchRemoteSubtitles: (itemId, language = 'eng', isPerfectMatch = null) => {
		const query = isPerfectMatch === null ? '' : `?IsPerfectMatch=${isPerfectMatch}`;
		return request(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(language)}${query}`);
	},

	downloadRemoteSubtitle: (itemId, subtitleId) =>
		request(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(subtitleId)}`, {
			method: 'POST'
		}),

	getAdjacentEpisodes: (itemId) =>
		request(`${userRoutes.item(itemId)}Fields=Overview,MediaStreams,Chapters`),

	// Music API methods
	getAlbumArtists: (params = {}) => {
		const merged = {userId: currentUser, Recursive: 'true'};
		Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
		return request(`/Artists/AlbumArtists?${buildQueryString(merged)}`);
	},

	// Every artist, including ones who only appear on someone else's album.
	// AlbumArtists is the narrower list of artists credited with an album.
	getArtists: (params = {}) => {
		const merged = {userId: currentUser, Recursive: 'true'};
		Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
		return request(`/Artists?${buildQueryString(merged)}`);
	},

	getAlbumsByArtist: (artistId, limit = 100) =>
		request(`${userRoutes.items()}AlbumArtistIds=${artistId}&IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,SortName&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

	getAlbumTracks: (albumId) =>
		request(`${userRoutes.items()}ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Fields=MediaSources,MediaStreams`),

	getLyrics: (itemId) =>
		serverType === 'emby' ? Promise.resolve(null) : request(`/Audio/${itemId}/Lyrics?UserId=${currentUser}`),

	getArtistItems: (artistId, limit = 50) =>
		request(`${userRoutes.items()}ArtistIds=${artistId}&IncludeItemTypes=Audio&Recursive=true&SortBy=Album,ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

	getInstantMix: (itemId, limit = 50) =>
		request(`/Items/${itemId}/InstantMix?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

	getPlaylistItems: (playlistId, limit = 300, startIndex = 0) =>
		request(`/Playlists/${playlistId}/Items?UserId=${currentUser}&StartIndex=${startIndex}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist,DateCreated,SortName`),

	movePlaylistItem: (playlistId, itemId, newIndex) =>
		request(`/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`, {
			method: 'POST'
		}),

	getPlaylists: (sortBy = 'SortName', sortOrder = 'Ascending') =>
		request(`${userRoutes.items()}IncludeItemTypes=Playlist&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}`),

	createPlaylist: createPlaylistVia(request, () => serverType, () => currentUser),

	addToPlaylist: (playlistId, itemIds) =>
		request(`/Playlists/${playlistId}/Items?Ids=${itemIds.join(',')}`, {
			method: 'POST'
		}),

	removeFromPlaylist: (playlistId, entryIds) =>
		request(`/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`, {
			method: 'DELETE'
		}),

	createCollection: createCollectionVia(request),
	addToCollection: collectionItemsVia(request, 'POST'),
	removeFromCollection: collectionItemsVia(request, 'DELETE'),

	getRemoteImages: (itemId, imageType) =>
		request(`/Items/${itemId}/RemoteImages?Type=${imageType}&IncludeAllLanguages=true`),

	downloadRemoteImage: (itemId, imageType, imageUrl) =>
		request(`/Items/${itemId}/RemoteImages/Download?Type=${imageType}&ImageUrl=${encodeURIComponent(imageUrl)}`, {
			method: 'POST'
		}),

	deleteItemImage: (itemId, imageType, imageIndex) => {
		const indexSuffix = imageIndex !== undefined && imageIndex !== null ? `/${imageIndex}` : '';
		return request(`/Items/${itemId}/Images/${imageType}${indexSuffix}`, {
			method: 'DELETE'
		});
	},

	getVirtualFolders: () =>
		request('/Library/VirtualFolders'),

	checkWriteAccess: () =>
		request('/Moonfin/Libraries/CheckWriteAccess'),

	// The same shape createApiForServer answers with, so anything holding a per server cache can
	// tell the two apart without knowing which kind it was handed.
	getServerInfo: () => ({
		serverUrl: currentServer,
		accessToken,
		userId: currentUser
	})
};

// The name a Plex account was saved under, since a Plex server has no route that says who's signed in.
const savedUserName = async (serverUrl, userId) => {
	const {getAllServersArray} = await import('./multiServerManager');
	const wanted = normalizeServerUrl(serverUrl);
	const entry = (await getAllServersArray()).find((s) => s.userId === userId && normalizeServerUrl(s.url) === wanted);
	return entry?.username || null;
};

const jellyfinMethods = {...api};
const methodNames = Object.keys(jellyfinMethods);

const plexApiFor = (readUrl, readToken, readUserId) => withEveryMethod(createPlexApi({
	getBaseUrl: readUrl,
	getToken: readToken,
	getUserId: readUserId,
	getDeviceInfo,
	getUserName: () => savedUserName(readUrl(), readUserId())
}), methodNames);

const plexMethods = plexApiFor(() => currentServer, () => accessToken, () => currentUser);

let plexActive = false;

// The api object everything imports stays the same object, with its methods swapped for the kind of server signed in.
const applyServerType = () => {
	const wantPlex = serverType === 'plex';
	if (wantPlex) registerPlexServer(currentServer, accessToken);
	if (wantPlex === plexActive) return;
	plexActive = wantPlex;
	// Plex adds methods Jellyfin doesn't have, and those have to go again.
	if (!wantPlex) {
		Object.keys(api).forEach((name) => {
			if (!Object.prototype.hasOwnProperty.call(jellyfinMethods, name)) delete api[name];
		});
	}
	Object.assign(api, wantPlex ? plexMethods : jellyfinMethods);
};

/**
 * Create an API instance for a specific server
 * Used for cross-server content aggregation
 * @param {string} serverUrl - Server URL
 * @param {string} token - Access token
 * @param {string} userId - User ID
 * @returns {Object} API object with all methods bound to the specified server
 */
export const createApiForServer = (serverUrl, token, userId, serverTypeOverride = 'jellyfin') => {
	// Normalize server URL
	let url = serverUrl?.trim();
	if (url) {
		url = url.replace(/\/+$/, '');
		if (!/^https?:\/\//i.test(url)) {
			url = 'http://' + url;
		}
	}

	if (serverTypeOverride === 'plex' || isPlexServer(url)) {
		registerPlexServer(url, token);
		return plexApiFor(() => url, () => token, () => userId);
	}

	const getServerAuthHeader = () => buildAuthHeader(serverTypeOverride, token);
	const serverUserRoutes = makeUserRoutes(() => serverTypeOverride, () => userId);

	const serverRequest = async (endpoint, options = {}) => {
		const requestUrl = `${url}${trimQuerySeparator(endpoint)}`;
		const deniedParentId = parentIdOf(endpoint);
		const deniedKey = deniedParentId ? `${url}|${deniedParentId}` : null;
		if (deniedKey && accessDeniedParentIds.has(deniedKey)) {
			const error = new Error('Access denied (cached): ' + deniedParentId);
			error.status = 403;
			throw error;
		}

		let response;
		try {
			const authHeader = getServerAuthHeader();
			response = await fetchWithTimeout(requestUrl, {
				method: options.method || 'GET',
				headers: {
					'Authorization': authHeader,
					...legacyAuthHeader(serverTypeOverride, authHeader),
					'Content-Type': 'application/json',
					...options.headers
				},
				body: options.body ? JSON.stringify(options.body) : undefined
			}, options.timeoutMs || DEFAULT_TIMEOUT_MS);
		} catch (err) {
			const typed = new Error(err.message);
			typed.connectionType = classifyError(err);
			throw typed;
		}

		if (!response.ok) {
			if ((response.status === 401 || response.status === 403) && deniedKey) {
				accessDeniedParentIds.add(deniedKey);
			}
			const error = new Error('API Error: ' + response.status);
			error.status = response.status;
			error.connectionType = classifyError(error);
			throw error;
		}

		if (response.status === 204) {
			return null;
		}

		const text = await response.text();
		if (!text) return null;
		return JSON.parse(text);
	};

	return {
		getLibraries: () => (serverTypeOverride === 'emby'
			? withoutHiddenViews(serverRequest(serverUserRoutes.views()), serverRequest(`/Users/${userId}`))
			: serverRequest(serverUserRoutes.views())),

		getAllLibraries: () => serverRequest(`${serverUserRoutes.views()}IncludeHidden=true`),

		getUserConfiguration: () => serverRequest(`/Users/${userId}`),

		updateUserConfiguration: (config) => serverRequest(serverUserRoutes.configuration(), {
			method: 'POST',
			body: config
		}),

		// UserData is named so a saved rating comes back when the title is reopened.
		getItem: (itemId) =>
			serverRequest(`${serverUserRoutes.item(itemId)}Fields=Overview,Genres,People,Studios,MediaSources,MediaStreams,ExternalUrls,ProviderIds,RemoteTrailers,Taglines,UserData`),

		getItemMediaInfo: (itemId) =>
			serverRequest(`${serverUserRoutes.item(itemId)}Fields=MediaSources,MediaStreams`),

		getPerson: (itemId) => serverRequest(serverUserRoutes.item(itemId)),

		getItemsByPerson: (personId, limit = 100) =>
			serverRequest(`${serverUserRoutes.items()}PersonIds=${personId}&Recursive=true&IncludeItemTypes=Movie,Series,MusicVideo,Episode&SortBy=PremiereDate&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating,BasicSyncInfo,People`),

		getItems: (params = {}) => {
			// Manually build query string to match main api.getItems behavior
			const queryParts = [];
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null && value !== '') {
					queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
				}
			}
			const query = queryParts.join('&');
			return serverRequest(`${serverUserRoutes.items()}${query}`);
		},

		getGenres: (libraryId, includeItemTypes = 'Movie,Series', sortBy = 'SortName', sortOrder = 'Ascending') => {
			const params = libraryId ? `&ParentId=${libraryId}` : '';
			return serverRequest(`/Genres?UserId=${userId}&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Recursive=true&IncludeItemTypes=${encodeURIComponent(includeItemTypes)}${params}`);
		},

		getQueryFilters: (parentId, includeItemTypes) =>
			readQueryFilters(serverRequest, userId, parentId, includeItemTypes),

		getMusicGenres: (params = {}) => {
			const merged = {UserId: userId, SortBy: 'SortName', SortOrder: 'Ascending', Recursive: 'true'};
			Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
			return serverRequest(`/Genres?${buildQueryString(merged)}`);
		},

		getResumeItems: () =>
			serverRequest(`${serverUserRoutes.resume()}Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio,Overview,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds&MediaTypes=Video&EnableTotalRecordCount=false&ExcludeItemTypes=Book`),

		getNextUp: (limit = 12, seriesId = null, maxDays = 0) => {
			const fields = 'PrimaryImageAspectRatio,Overview,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentLogoItemId,ParentLogoImageTag,ProviderIds';
			let endpoint = `/Shows/NextUp?UserId=${userId}&Limit=${limit}&Fields=${fields}`;
			if (seriesId) endpoint += `&SeriesId=${seriesId}`;
			endpoint += homeNextUpQuery(seriesId, maxDays, serverTypeOverride);
			return serverRequest(endpoint);
		},

		getLatestMedia: (libraryId = null, limit = 16) => {
			let endpoint = `${serverUserRoutes.latest()}Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`;
			if (libraryId) endpoint += `&ParentId=${libraryId}`;
			return serverRequest(endpoint);
		},

		getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') =>
			serverRequest(`${serverUserRoutes.items()}IncludeItemTypes=BoxSet&Recursive=true&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

		getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null, fields = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,OfficialRating') => {
			let includeTypes;
			switch (contentType) {
				case 'movies':
					includeTypes = 'Movie';
					break;
				case 'tv':
					includeTypes = 'Series';
					break;
				default:
					includeTypes = 'Movie,Series';
			}
			const parentParam = parentId ? `&ParentId=${parentId}` : '';
			const genreParam = genreName ? `&Genres=${encodeURIComponent(genreName)}` : '';
			return serverRequest(`${serverUserRoutes.items()}IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=${encodeURIComponent(fields)}&HasBackdrop=true&ExcludeItemTypes=BoxSet${parentParam}${genreParam}`);
		},

		getRandomItem: (includeTypes = 'Movie,Series') =>
			serverRequest(`${serverUserRoutes.items()}IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=1&Fields=PrimaryImageAspectRatio,Overview&ExcludeItemTypes=BoxSet`),

		search: (query, limit = 240) =>
			serverRequest(`${serverUserRoutes.items()}SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Book,Movie,Series,Season,Episode,Video,MusicVideo,Trailer,Program,Playlist,MusicArtist,MusicAlbum,Audio,PhotoAlbum,Photo,BoxSet,Folder&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,AlbumArtist,SeriesName,ParentIndexNumber,IndexNumber,ProviderIds,UserData,OfficialRating`),

		searchPeople: (query, limit = 24) =>
			serverRequest(`/Persons?searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Fields=PrimaryImageAspectRatio`, {timeoutMs: PEOPLE_SEARCH_TIMEOUT_MS}),

		getSimilar: (itemId, limit = 12, bypass = null) => {
			const bypassQuery = bypass ? `&bypass=${encodeURIComponent(bypass)}` : '';
			return serverRequest(`/Items/${itemId}/Similar?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview${bypassQuery}`);
		},

		getMoonfinSimilar: (itemId, limit = 20) => {
			const userQuery = userId ? `&userId=${encodeURIComponent(userId)}` : '';
			return serverRequest(`/Moonfin/Items/${itemId}/Similar?limit=${limit}${userQuery}`);
		},

		getSeasons: (seriesId) =>
			serverRequest(`/Shows/${seriesId}/Seasons?UserId=${userId}&Fields=Overview,PrimaryImageAspectRatio`),

		getEpisodes: (seriesId, seasonId = null) =>
			serverRequest(`/Shows/${seriesId}/Episodes?UserId=${userId}${seasonId ? `&SeasonId=${seasonId}` : ''}&Fields=Overview,PrimaryImageAspectRatio,MediaSources,MediaStreams,LocationType`),

		getPlaybackInfo: (itemId) =>
			serverRequest(`/Items/${itemId}/PlaybackInfo?UserId=${userId}`, {timeoutMs: PLAYBACK_TIMEOUT_MS}),

		getLocalTrailers: (itemId) =>
			serverRequest(`/Items/${itemId}/LocalTrailers?userId=${userId}`),

		getStudioCompanies: (tmdbId, mediaType) =>
			serverRequest(`/Moonfin/Tmdb/ProductionCompanies?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}`),

		getTmdbReviews: (tmdbId, mediaType, language) =>
			serverRequest(`/Moonfin/Tmdb/Reviews?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}&language=${encodeURIComponent(language || 'en-US')}`),

		getCollectionOrder: (collectionId) =>
			serverRequest(`/Moonfin/Collections/${collectionId}/Order`),

		saveCollectionOrder: (collectionId, itemIds) =>
			serverRequest(`/Moonfin/Collections/${collectionId}/Order`, {method: 'POST', body: itemIds}),

		searchRemoteSubtitles: (itemId, language = 'eng', isPerfectMatch = null) => {
			const query = isPerfectMatch === null ? '' : `?IsPerfectMatch=${isPerfectMatch}`;
			return serverRequest(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(language)}${query}`);
		},

		downloadRemoteSubtitle: (itemId, subtitleId) =>
			serverRequest(`/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(subtitleId)}`, {
				method: 'POST'
			}),

		reportPlaybackStart: (data) => serverRequest('/Sessions/Playing', {
			method: 'POST',
			body: data
		}),

		reportPlaybackProgress: (data) => serverRequest('/Sessions/Playing/Progress', {
			method: 'POST',
			body: data
		}),

		reportPlaybackStopped: (data) => serverRequest('/Sessions/Playing/Stopped', {
			method: 'POST',
			body: data
		}),

		// The preview URL carries this app's device id whichever server it goes to.
		stopActiveEncodings: (playSessionId) =>
			serverRequest(`/Videos/ActiveEncodings?deviceId=${encodeURIComponent(deviceId)}&playSessionId=${encodeURIComponent(playSessionId)}`, {
				method: 'DELETE'
			}),

		getOwnSessions: () => serverRequest(`/Sessions?DeviceId=${encodeURIComponent(deviceId)}`, {timeoutMs: OWN_SESSION_TIMEOUT_MS}),

		closeLiveStream: (liveStreamId) => serverRequest(`/LiveStreams/Close?LiveStreamId=${encodeURIComponent(liveStreamId)}`, {
			method: 'POST'
		}),

		setFavorite: (itemId, isFavorite) => serverRequest(serverUserRoutes.favorite(itemId), {
			method: isFavorite ? 'POST' : 'DELETE'
		}).then(publishUserData(itemId, {IsFavorite: isFavorite})),

		setWatched: (itemId, watched) => serverRequest(serverUserRoutes.played(itemId), {
			method: watched ? 'POST' : 'DELETE'
		}).then(publishUserData(itemId, playedUserData(watched))),

		hideFromResume: (itemId) => serverRequest(`${serverUserRoutes.hideFromResume(itemId)}Hide=true`, {method: 'POST'}),

		setPlaybackPosition: (itemId, ticks) => serverRequest(serverUserRoutes.userData(itemId), {
			method: 'POST',
			body: {PlaybackPositionTicks: ticks, LastPlayedDate: new Date().toISOString()}
		}).then(publishUserData(itemId, {PlaybackPositionTicks: ticks})),

		setRating: (itemId, likes) => serverRequest(`/UserItems/${itemId}/Rating?Likes=${likes}`, {
			method: 'POST'
		}).then(publishUserData(itemId, {Likes: likes})),

		setNumericRating: (itemId, rating) => serverRequest(`/UserItems/${itemId}/UserData`, {
			method: 'POST',
			body: {Rating: rating}
		}).then(publishUserData(itemId, {Rating: rating})),

		clearRating: (itemId) => serverRequest(`/UserItems/${itemId}/Rating`, {
			method: 'DELETE'
		}).then(publishUserData(itemId, {Rating: null, Likes: null})),

		// Music API methods
		getAlbumArtists: (params = {}) => {
			const merged = {userId: userId, Recursive: 'true'};
			Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
			return serverRequest(`/Artists/AlbumArtists?${buildQueryString(merged)}`);
		},

		// Every artist, including ones who only appear on someone else's album.
		// AlbumArtists is the narrower list of artists credited with an album.
		getArtists: (params = {}) => {
			const merged = {userId: userId, Recursive: 'true'};
			Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
			return serverRequest(`/Artists?${buildQueryString(merged)}`);
		},

		getAlbumsByArtist: (artistId, limit = 100) =>
			serverRequest(`${serverUserRoutes.items()}AlbumArtistIds=${artistId}&IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,SortName&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,OfficialRating`),

		getAlbumTracks: (albumId) =>
			serverRequest(`${serverUserRoutes.items()}ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Fields=MediaSources,MediaStreams`),

		getLyrics: (itemId) =>
			serverTypeOverride === 'emby' ? Promise.resolve(null) : serverRequest(`/Audio/${itemId}/Lyrics?UserId=${userId}`),

		getArtistItems: (artistId, limit = 50) =>
			serverRequest(`${serverUserRoutes.items()}ArtistIds=${artistId}&IncludeItemTypes=Audio&Recursive=true&SortBy=Album,ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

		getInstantMix: (itemId, limit = 50) =>
			serverRequest(`/Items/${itemId}/InstantMix?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

		getPlaylistItems: (playlistId, limit = 300, startIndex = 0) =>
			serverRequest(`/Playlists/${playlistId}/Items?UserId=${userId}&StartIndex=${startIndex}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist,DateCreated,SortName`),

		movePlaylistItem: (playlistId, itemId, newIndex) =>
			serverRequest(`/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`, {
				method: 'POST'
			}),

		getPlaylists: (sortBy = 'SortName', sortOrder = 'Ascending') =>
			serverRequest(`${serverUserRoutes.items()}IncludeItemTypes=Playlist&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}`),

		createPlaylist: createPlaylistVia(serverRequest, () => serverTypeOverride, () => userId),

		addToPlaylist: (playlistId, itemIds) =>
			serverRequest(`/Playlists/${playlistId}/Items?Ids=${itemIds.join(',')}`, {
				method: 'POST'
			}),

		createCollection: createCollectionVia(serverRequest),
		addToCollection: collectionItemsVia(serverRequest, 'POST'),
		removeFromCollection: collectionItemsVia(serverRequest, 'DELETE'),

		removeFromPlaylist: (playlistId, entryIds) =>
			serverRequest(`/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`, {
				method: 'DELETE'
			}),

		getSpecialFeatures: (itemId) =>
			serverRequest(serverUserRoutes.extras(itemId, 'SpecialFeatures')),

		getAdditionalParts: (itemId) =>
			serverRequest(`/Videos/${itemId}/AdditionalParts?UserId=${userId}`),

		getAncestors: (itemId) =>
			serverRequest(`/Items/${itemId}/Ancestors?UserId=${userId}`),

		getItemCollections: (itemId) =>
			serverRequest(`/Items/${itemId}/Collections?UserId=${userId}&Fields=ProviderIds`),

		getThemeSongs: (itemId, inheritFromParent = true) =>
			serverRequest(`/Items/${itemId}/ThemeSongs?UserId=${userId}&InheritFromParent=${inheritFromParent}`),

		getIntros: (itemId) =>
			serverRequest(serverUserRoutes.extras(itemId, 'Intros')),

		searchRemote: searchRemoteVia(serverRequest),

		applyRemoteSearchResult: applyRemoteSearchResultVia(serverRequest),

		refreshItem: refreshItemVia(serverRequest),

		getRemoteImages: (itemId, imageType) =>
			serverRequest(`/Items/${itemId}/RemoteImages?Type=${imageType}&IncludeAllLanguages=true`),

		downloadRemoteImage: (itemId, imageType, imageUrl) =>
			serverRequest(`/Items/${itemId}/RemoteImages/Download?Type=${imageType}&ImageUrl=${encodeURIComponent(imageUrl)}`, {
				method: 'POST'
			}),

		deleteItemImage: (itemId, imageType, imageIndex) => {
			const indexSuffix = imageIndex !== undefined && imageIndex !== null ? `/${imageIndex}` : '';
			return serverRequest(`/Items/${itemId}/Images/${imageType}${indexSuffix}`, {
				method: 'DELETE'
			});
		},

		getVirtualFolders: () =>
			serverRequest('/Library/VirtualFolders'),

		checkWriteAccess: () =>
			serverRequest('/Moonfin/Libraries/CheckWriteAccess'),

		getPublicInfo: () => serverRequest('/System/Info/Public'),

		// Return server info for playback routing
		getServerInfo: () => ({
			serverUrl: url,
			accessToken: token,
			userId: userId
		})
	};
};
