import packageJson from '../../package.json';
import {buildQueryString} from '../utils/urlCompat';
import {normalizeServerUrl} from '../utils/serverUrl';
import {classifyError} from '../utils/connectionErrors';
import {platformFetch} from './secureFetch';
import {isTizen} from '../platform';
const APP_VERSION = packageJson.version;

const APP_NAME = isTizen() ? 'Moonfin for Tizen' : 'Moonfin for webOS';
const DEVICE_NAME = isTizen() ? 'Samsung Smart TV' : 'LG Smart TV';
const platformTag = isTizen() ? 'tizen' : 'webos';

let deviceId = null;
let currentServer = null;
let currentUser = null;
let accessToken = null;
let serverType = 'jellyfin';

// ParentIds that returned 401/403 (no library access) this session. Requests
// for them are skipped so a restricted user does not repeatedly hit the server
// with 401s, which can trip reverse-proxy Fail2Ban jails (#272).
const accessDeniedParentIds = new Set();
const parentIdOf = (endpoint) => {
	const match = /[?&]ParentId=([^&]+)/.exec(endpoint);
	return match ? match[1] : null;
};

export const setServer = (serverUrl) => {
	currentServer = normalizeServerUrl(serverUrl);
};

export const setServerType = (type) => {
	serverType = type === 'emby' ? 'emby' : 'jellyfin';
};

export const getServerType = () => serverType;

// Jellyfin 12 drops the lowercase api_key param while Emby still requires it
export const getTokenParam = (type) => ((type || serverType) === 'emby' ? 'api_key' : 'ApiKey');

export const setAuth = (userId, token) => {
	currentUser = userId;
	accessToken = token;
	accessDeniedParentIds.clear();
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

const DEFAULT_TIMEOUT_MS = 15000;
const PLAYBACK_TIMEOUT_MS = 30000;
export const HOME_ROW_ITEM_FIELDS = 'PrimaryImageAspectRatio,Overview,Genres,GenreItems,ProductionYear,RunTimeTicks,CommunityRating,CriticRating,ProviderIds,ImageTags,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,SeriesPrimaryImageTag,SeriesName,ParentIndexNumber,IndexNumber,UserData,AlbumArtist,AlbumId,AlbumPrimaryImageTag';

// Routes through the webOS TLS proxy fallback (secureFetch) so Let's-Encrypt
// servers work on old TVs whose CA store rejects them; native fetch elsewhere.
const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) =>
	platformFetch(url, options, timeoutMs);
export const getDeviceId = () => deviceId;

const request = async (endpoint, options = {}) => {
	const url = `${currentServer}${endpoint}`;
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
				'X-Emby-Authorization': authHeader,
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

export function reportCapabilities() {
	if (!currentServer || !accessToken) return;
	request('/Sessions/Capabilities/Full', {
		method: 'POST',
		body: {
			PlayableMediaTypes: ['Video', 'Audio'],
			SupportedCommands: [],
			SupportsMediaControl: false,
			SupportsPersistentIdentifier: false
		}
	}).catch(() => {});
}

// Resolves external list items (carrying TMDB/IMDb provider ids) against the
// local library. Owned titles are swapped for the real Jellyfin item so they
// are playable, unowned ones are returned unchanged for the Seerr fallback.
// Queries are batched with anyProviderIdEquals to avoid one request per item.
export const resolveItemsByProviderIds = async (items) => {
	if (!Array.isArray(items) || items.length === 0 || !currentUser) return items || [];

	const keyFor = (ids) => {
		if (!ids) return null;
		if (ids.Tmdb) return `tmdb.${ids.Tmdb}`;
		if (ids.Imdb) return `imdb.${ids.Imdb}`;
		return null;
	};

	const pairs = [];
	for (const it of items) {
		const key = keyFor(it.ProviderIds);
		if (key && !pairs.includes(key)) pairs.push(key);
	}
	if (pairs.length === 0) return items;

	const found = {};
	const CHUNK = 40;
	for (let i = 0; i < pairs.length; i += CHUNK) {
		const chunk = pairs.slice(i, i + CHUNK);
		try {
			const query = chunk.map((p) => encodeURIComponent(p)).join(',');
			const res = await request(`/Users/${currentUser}/Items?Recursive=true&anyProviderIdEquals=${query}&Fields=${HOME_ROW_ITEM_FIELDS}&Limit=${chunk.length * 2}`);
			for (const jf of (res?.Items || [])) {
				const p = jf.ProviderIds || {};
				if (p.Tmdb) found[`tmdb.${p.Tmdb}`] = jf;
				if (p.Imdb) found[`imdb.${p.Imdb}`] = jf;
			}
		} catch (e) {
			void e;
		}
	}

	return items.map((it) => {
		const key = keyFor(it.ProviderIds);
		const jf = key ? found[key] : null;
		return jf ? {...jf, _resolvedFromExternal: true} : it;
	});
};

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

	getLibraries: () => request(`/Users/${currentUser}/Views`),

	getAllLibraries: () => request(`/Users/${currentUser}/Views?IncludeHidden=true`),

	getItems: (params = {}) => {
		// Manually build query string to avoid URLSearchParams issues
		const queryParts = [];
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null && value !== '') {
				queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
			}
		}
		const query = queryParts.join('&');
		return request(`/Users/${currentUser}/Items?${query}`);
	},

	getItem: (itemId) => request(`/Users/${currentUser}/Items/${itemId}`),

	getLocalTrailers: (itemId) => request(`/Users/${currentUser}/Items/${itemId}/LocalTrailers`),

	getItemForDetail: (itemId) =>
		request(`/Users/${currentUser}/Items/${itemId}?Fields=Overview,Genres,OfficialRating,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds,RunTimeTicks,ProductionYear,Chapters,People,Studios,Taglines,RemoteTrailers,MediaSources,MediaSourceCount,CommunityRating,CriticRating`),

	getItemWithChapters: (itemId) => request(`/Users/${currentUser}/Items/${itemId}?Fields=Chapters`),

	getMediaSegments: (itemId) => request(`/MediaSegments/${itemId}`),

	getUserConfiguration: () => request(`/Users/${currentUser}`),

	updateUserConfiguration: (config) => request(`/Users/${currentUser}/Configuration`, {
		method: 'POST',
		body: config
	}),

	getLatest: (libraryId, limit = 20) =>
		request(`/Users/${currentUser}/Items/Latest?ParentId=${libraryId}&Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}&ImageTypeLimit=1&GroupItems=true`),

	getRecentlyReleased: (libraryId, limit = 20) =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=Movie,Series&Recursive=true&ParentId=${libraryId}&Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}&ImageTypeLimit=1&SortBy=PremiereDate&SortOrder=Descending&MaxPremiereDate=${encodeURIComponent(new Date().toISOString())}`),

	getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=BoxSet&Recursive=true&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getResumeItems: (limit = 12) =>
		request(`/Users/${currentUser}/Items/Resume?Limit=${limit}&MediaTypes=Video&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`),

	getResumeAudioItems: (limit = 20) =>
		request(`/Users/${currentUser}/Items/Resume?Limit=${limit}&MediaTypes=Audio&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`),

	getNextUp: (limit = 24, seriesId = null) => {
		let url = `/Shows/NextUp?UserId=${currentUser}&Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`;
		if (seriesId) url += `&SeriesId=${seriesId}`;
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

	closeLiveStream: (liveStreamId) => request(`/LiveStreams/Close?LiveStreamId=${encodeURIComponent(liveStreamId)}`, {
		method: 'POST'
	}),

	search: async (query, limit = 150) => {
		const [itemsResult, peopleResult] = await Promise.all([
			request(`/Users/${currentUser}/Items?searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Series,Episode,MusicAlbum,MusicArtist,Audio&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),
			request(`/Persons?searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Fields=PrimaryImageAspectRatio`)
		]);

		return {
			Items: [...(itemsResult.Items || []), ...(peopleResult.Items || [])]
		};
	},

	getSeasons: (seriesId) =>
		request(`/Shows/${seriesId}/Seasons?UserId=${currentUser}&Fields=PrimaryImageAspectRatio`),

	getEpisodes: (seriesId, seasonId) =>
		request(`/Shows/${seriesId}/Episodes?UserId=${currentUser}&SeasonId=${seasonId}&Fields=PrimaryImageAspectRatio,Overview`),

	getSimilar: (itemId, limit = 15) =>
		request(`/Items/${itemId}/Similar?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getGenres: (libraryId, includeItemTypes = 'Movie,Series', sortBy = 'SortName', sortOrder = 'Ascending') => {
		const params = libraryId ? `&ParentId=${libraryId}` : '';
		return request(`/Genres?UserId=${currentUser}&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Recursive=true&IncludeItemTypes=${encodeURIComponent(includeItemTypes)}${params}`);
	},

	getCustomRow: (source, type) => {
		// The backend returns 400 without a non-empty params JSON, so send a minimal one.
		const params = encodeURIComponent(JSON.stringify({source: String(source), type: String(type)}));
		return request(`/Moonfin/CustomRows/Items?source=${encodeURIComponent(String(source))}&type=${encodeURIComponent(String(type))}&params=${params}`);
	},

	getStudioCompanies: (tmdbId, mediaType) =>
		request(`/Moonfin/Tmdb/ProductionCompanies?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}`),

	getMusicGenres: (params = {}) => {
		const merged = {UserId: currentUser, SortBy: 'SortName', SortOrder: 'Ascending', Recursive: 'true'};
		Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
		return request(`/Genres?${buildQueryString(merged)}`);
	},

	getItemsByGenre: (genreId, libraryId, limit = 50) =>
		request(`/Users/${currentUser}/Items?GenreIds=${genreId}&ParentId=${libraryId}&Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getPerson: (personId) =>
		request(`/Users/${currentUser}/Items/${personId}`),

	getItemsByPerson: (personId, limit = 50) =>
		request(`/Users/${currentUser}/Items?PersonIds=${personId}&Recursive=true&IncludeItemTypes=Movie,Series&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getFavorites: (limit = 50) =>
		request(`/Users/${currentUser}/Items?IsFavorite=true&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getRandomItem: (includeTypes = 'Movie,Series') =>
		request(`/Items?UserId=${currentUser}&IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=1&Fields=PrimaryImageAspectRatio,Overview&ExcludeItemTypes=BoxSet`),

	getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null, fields = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers') => {
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
		return request(`/Users/${currentUser}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=${encodeURIComponent(fields)}&HasBackdrop=true&ExcludeItemTypes=BoxSet${parentParam}${genreParam}`);
	},

	getCollectionItems: (collectionId, limit = 50) =>
		request(`/Users/${currentUser}/Items?ParentId=${collectionId}&Limit=${limit}&Recursive=true&Fields=PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers&HasBackdrop=true`),

	// Get all movies and series for genres page
	getAllItems: (limit = 10000) =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=Genres,PrimaryImageAspectRatio,ProductionYear&SortBy=SortName&SortOrder=Ascending&Limit=${limit}&ExcludeItemTypes=BoxSet`),

	setFavorite: (itemId, isFavorite) => request(`/Users/${currentUser}/FavoriteItems/${itemId}`, {
		method: isFavorite ? 'POST' : 'DELETE'
	}),

	setWatched: (itemId, watched) => request(`/Users/${currentUser}/PlayedItems/${itemId}`, {
		method: watched ? 'POST' : 'DELETE'
	}),

	getIntros: (itemId) =>
		request(`/Users/${currentUser}/Items/${itemId}/Intros`),

	getAdditionalParts: (itemId) =>
		request(`/Videos/${itemId}/AdditionalParts?UserId=${currentUser}`),

	getSpecialFeatures: (itemId) =>
		request(`/Users/${currentUser}/Items/${itemId}/SpecialFeatures`),

	getAncestors: (itemId) =>
		request(`/Items/${itemId}/Ancestors?UserId=${currentUser}`),

	getThemeSongs: (itemId, inheritFromParent = true) =>
		request(`/Items/${itemId}/ThemeSongs?UserId=${currentUser}&InheritFromParent=${inheritFromParent}`),

	getLiveTvChannels: (startIndex = 0, limit = 50) =>
		request(`/LiveTv/Channels?UserId=${currentUser}&EnableFavoriteSorting=true&StartIndex=${startIndex}&Limit=${limit}`),

	getLiveTvPrograms: (channelIds, startDate, endDate) => {
		const channelParam = Array.isArray(channelIds) ? channelIds.join(',') : channelIds;
		const start = startDate instanceof Date ? startDate.toISOString() : startDate;
		const end = endDate instanceof Date ? endDate.toISOString() : endDate;
		return request(`/LiveTv/Programs?UserId=${currentUser}&ChannelIds=${channelParam}&MinStartDate=${start}&MaxEndDate=${end}&EnableTotalRecordCount=false`);
	},

	getLiveTvProgram: (programId) =>
		request(`/LiveTv/Programs/${programId}?UserId=${currentUser}`),

	getLiveTvRecordings: () =>
		request(`/LiveTv/Recordings?UserId=${currentUser}`),

	getLiveTvTimers: () =>
		request(`/LiveTv/Timers`),

	createLiveTvTimer: (programId) =>
		request(`/LiveTv/Timers`, {
			method: 'POST',
			body: {ProgramId: programId}
		}),

	cancelLiveTvTimer: (timerId) =>
		request(`/LiveTv/Timers/${timerId}`, {
			method: 'DELETE'
		}),

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
		request(`/Users/${currentUser}/Items/${itemId}?Fields=Overview,MediaStreams,Chapters`),

	// Music API methods
	getAlbumArtists: (params = {}) => {
		const merged = {userId: currentUser, Recursive: 'true'};
		Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
		return request(`/Artists/AlbumArtists?${buildQueryString(merged)}`);
	},

	getAlbumsByArtist: (artistId, limit = 100) =>
		request(`/Users/${currentUser}/Items?AlbumArtistIds=${artistId}&IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,SortName&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getAlbumTracks: (albumId) =>
		request(`/Users/${currentUser}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Fields=MediaSources,MediaStreams`),

	getLyrics: (itemId) =>
		serverType === 'emby' ? Promise.resolve(null) : request(`/Audio/${itemId}/Lyrics?UserId=${currentUser}`),

	getArtistItems: (artistId, limit = 50) =>
		request(`/Users/${currentUser}/Items?ArtistIds=${artistId}&IncludeItemTypes=Audio&Recursive=true&SortBy=Album,ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

	getInstantMix: (itemId, limit = 50) =>
		request(`/Items/${itemId}/InstantMix?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

	getPlaylistItems: (playlistId, limit = 300) =>
		request(`/Playlists/${playlistId}/Items?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

	movePlaylistItem: (playlistId, itemId, newIndex) =>
		request(`/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`, {
			method: 'POST'
		}),

	getPlaylists: (sortBy = 'SortName', sortOrder = 'Ascending') =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}`),

	createPlaylist: (name, itemIds = []) =>
		request('/Playlists', {
			method: 'POST',
			body: {
				Name: name,
				Ids: itemIds,
				UserId: currentUser
			}
		}),

	addToPlaylist: (playlistId, itemIds) =>
		request(`/Playlists/${playlistId}/Items?Ids=${itemIds.join(',')}`, {
			method: 'POST'
		}),

	removeFromPlaylist: (playlistId, entryIds) =>
		request(`/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`, {
			method: 'DELETE'
		}),

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
		request('/Moonfin/Libraries/CheckWriteAccess')
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

	const getServerAuthHeader = () => buildAuthHeader(serverTypeOverride, token);

	const serverRequest = async (endpoint, options = {}) => {
		const requestUrl = `${url}${endpoint}`;
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
					'X-Emby-Authorization': authHeader,
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
		getLibraries: () => serverRequest(`/Users/${userId}/Views`),

		getAllLibraries: () => serverRequest(`/Users/${userId}/Views?IncludeHidden=true`),

		getUserConfiguration: () => serverRequest(`/Users/${userId}`),

		updateUserConfiguration: (config) => serverRequest(`/Users/${userId}/Configuration`, {
			method: 'POST',
			body: config
		}),

		getItem: (itemId) =>
			serverRequest(`/Users/${userId}/Items/${itemId}?Fields=Overview,Genres,People,Studios,MediaSources,MediaStreams,ExternalUrls,ProviderIds,RemoteTrailers,Taglines`),

		getItems: (params = {}) => {
			// Manually build query string to match main api.getItems behavior
			const queryParts = [];
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null && value !== '') {
					queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
				}
			}
			const query = queryParts.join('&');
			return serverRequest(`/Users/${userId}/Items?${query}`);
		},

		getGenres: (libraryId, includeItemTypes = 'Movie,Series', sortBy = 'SortName', sortOrder = 'Ascending') => {
			const params = libraryId ? `&ParentId=${libraryId}` : '';
			return serverRequest(`/Genres?UserId=${userId}&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Recursive=true&IncludeItemTypes=${encodeURIComponent(includeItemTypes)}${params}`);
		},

		getMusicGenres: (params = {}) => {
			const merged = {UserId: userId, SortBy: 'SortName', SortOrder: 'Ascending', Recursive: 'true'};
			Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
			return serverRequest(`/Genres?${buildQueryString(merged)}`);
		},

		getResumeItems: () =>
			serverRequest(`/Users/${userId}/Items/Resume?Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio,Overview,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds&MediaTypes=Video&EnableTotalRecordCount=false&ExcludeItemTypes=Book`),

		getNextUp: (limit = 12, seriesId = null) => {
			let endpoint = `/Shows/NextUp?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds`;
			if (seriesId) endpoint += `&SeriesId=${seriesId}`;
			return serverRequest(endpoint);
		},

		getLatestMedia: (libraryId = null, limit = 16) => {
			let endpoint = `/Users/${userId}/Items/Latest?Limit=${limit}&Fields=${encodeURIComponent(HOME_ROW_ITEM_FIELDS)}`;
			if (libraryId) endpoint += `&ParentId=${libraryId}`;
			return serverRequest(endpoint);
		},

		getCollections: (limit = 50, sortBy = 'SortName', sortOrder = 'Ascending') =>
			serverRequest(`/Users/${userId}/Items?IncludeItemTypes=BoxSet&Recursive=true&SortBy=${encodeURIComponent(sortBy)}&SortOrder=${encodeURIComponent(sortOrder)}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

		getRandomItems: (contentType = 'both', limit = 10, parentId = null, genreName = null, fields = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds') => {
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
			return serverRequest(`/Users/${userId}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=${encodeURIComponent(fields)}&HasBackdrop=true&ExcludeItemTypes=BoxSet${parentParam}${genreParam}`);
		},

		getRandomItem: (includeTypes = 'Movie,Series') =>
			serverRequest(`/Items?UserId=${userId}&IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=1&Fields=PrimaryImageAspectRatio,Overview&ExcludeItemTypes=BoxSet`),

		search: (query, limit = 24) =>
			serverRequest(`/Users/${userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Movie,Series,Episode,Person,MusicAlbum,MusicArtist,Audio&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,AlbumArtist`),

		getSimilar: (itemId, limit = 12) =>
			serverRequest(`/Items/${itemId}/Similar?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview`),

		getSeasons: (seriesId) =>
			serverRequest(`/Shows/${seriesId}/Seasons?UserId=${userId}&Fields=Overview,PrimaryImageAspectRatio`),

		getEpisodes: (seriesId, seasonId) =>
			serverRequest(`/Shows/${seriesId}/Episodes?UserId=${userId}&SeasonId=${seasonId}&Fields=Overview,PrimaryImageAspectRatio,MediaSources,MediaStreams`),

		getPlaybackInfo: (itemId) =>
			serverRequest(`/Items/${itemId}/PlaybackInfo?UserId=${userId}`, {timeoutMs: PLAYBACK_TIMEOUT_MS}),

		getLocalTrailers: (itemId) =>
			serverRequest(`/Users/${userId}/Items/${itemId}/LocalTrailers`),

		getCustomRow: (source, type) => {
			// The backend returns 400 without a non-empty params JSON, so send a minimal one.
			const params = encodeURIComponent(JSON.stringify({source: String(source), type: String(type)}));
			return serverRequest(`/Moonfin/CustomRows/Items?source=${encodeURIComponent(String(source))}&type=${encodeURIComponent(String(type))}&params=${params}`);
		},

		getStudioCompanies: (tmdbId, mediaType) =>
			serverRequest(`/Moonfin/Tmdb/ProductionCompanies?tmdbId=${encodeURIComponent(tmdbId)}&type=${mediaType === 'tv' ? 'tv' : 'movie'}`),

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

		closeLiveStream: (liveStreamId) => serverRequest(`/LiveStreams/Close?LiveStreamId=${encodeURIComponent(liveStreamId)}`, {
			method: 'POST'
		}),

		setFavorite: (itemId, isFavorite) => serverRequest(`/Users/${userId}/FavoriteItems/${itemId}`, {
			method: isFavorite ? 'POST' : 'DELETE'
		}),

		setWatched: (itemId, watched) => serverRequest(`/Users/${userId}/PlayedItems/${itemId}`, {
			method: watched ? 'POST' : 'DELETE'
		}),

		// Music API methods
		getAlbumArtists: (params = {}) => {
			const merged = {userId: userId, Recursive: 'true'};
			Object.keys(params).forEach(function (k) { merged[k] = String(params[k]); });
			return serverRequest(`/Artists/AlbumArtists?${buildQueryString(merged)}`);
		},

		getAlbumsByArtist: (artistId, limit = 100) =>
			serverRequest(`/Users/${userId}/Items?AlbumArtistIds=${artistId}&IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,SortName&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

		getAlbumTracks: (albumId) =>
			serverRequest(`/Users/${userId}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Fields=MediaSources,MediaStreams`),

		getLyrics: (itemId) =>
			serverTypeOverride === 'emby' ? Promise.resolve(null) : serverRequest(`/Audio/${itemId}/Lyrics?UserId=${userId}`),

		getArtistItems: (artistId, limit = 50) =>
			serverRequest(`/Users/${userId}/Items?ArtistIds=${artistId}&IncludeItemTypes=Audio&Recursive=true&SortBy=Album,ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

		getInstantMix: (itemId, limit = 50) =>
			serverRequest(`/Items/${itemId}/InstantMix?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

		getPlaylistItems: (playlistId, limit = 300) =>
			serverRequest(`/Playlists/${playlistId}/Items?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),

		movePlaylistItem: (playlistId, itemId, newIndex) =>
			serverRequest(`/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`, {
				method: 'POST'
			}),

		getPlaylists: (sortBy = 'SortName', sortOrder = 'Ascending') =>
			serverRequest(`/Users/${userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}`),

		createPlaylist: (name, itemIds = []) =>
			serverRequest('/Playlists', {
				method: 'POST',
				body: {
					Name: name,
					Ids: itemIds,
					UserId: userId
				}
			}),

		addToPlaylist: (playlistId, itemIds) =>
			serverRequest(`/Playlists/${playlistId}/Items?Ids=${itemIds.join(',')}`, {
				method: 'POST'
			}),

		removeFromPlaylist: (playlistId, entryIds) =>
			serverRequest(`/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`, {
				method: 'DELETE'
			}),

		getSpecialFeatures: (itemId) =>
			serverRequest(`/Users/${userId}/Items/${itemId}/SpecialFeatures`),

		getAncestors: (itemId) =>
			serverRequest(`/Items/${itemId}/Ancestors?UserId=${userId}`),

		getThemeSongs: (itemId, inheritFromParent = true) =>
			serverRequest(`/Items/${itemId}/ThemeSongs?UserId=${userId}&InheritFromParent=${inheritFromParent}`),

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

		// Return server info for playback routing
		getServerInfo: () => ({
			serverUrl: url,
			accessToken: token,
			userId: userId
		})
	};
};
