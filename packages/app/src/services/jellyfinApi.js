import packageJson from '../../package.json';
import {buildQueryString} from '../utils/urlCompat';
import {normalizeServerUrl} from '../utils/serverUrl';
import {classifyError} from '../utils/connectionErrors';
import {isTizen} from '../platform';
const APP_VERSION = packageJson.version;

const APP_NAME = isTizen() ? 'Moonfin for Tizen' : 'Moonfin for webOS';
const DEVICE_NAME = isTizen() ? 'Samsung Smart TV' : 'LG Smart TV';

let deviceId = null;
let currentServer = null;
let currentUser = null;
let accessToken = null;

export const setServer = (serverUrl) => {
	currentServer = normalizeServerUrl(serverUrl);
};

export const setAuth = (userId, token) => {
	currentUser = userId;
	accessToken = token;
};

export const getAuthHeader = () => {
	let header = `MediaBrowser Client="${APP_NAME}", Device="${DEVICE_NAME}", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
	if (accessToken) {
		header += `, Token="${accessToken}"`;
	}
	return header;
};

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

	deviceId = 'moonfin_webos_' + Date.now().toString(36) + Math.random().toString(36).substring(2);

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

const DEFAULT_TIMEOUT_MS = 15000;

const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
	return Promise.race([
		fetch(url, options),
		new Promise(function (_, reject) {
			setTimeout(function () {
				let err = new Error('The operation was aborted.');
				err.name = 'AbortError';
				reject(err);
			}, timeoutMs);
		})
	]);
};
export const getDeviceId = () => deviceId;

const request = async (endpoint, options = {}) => {
	const url = `${currentServer}${endpoint}`;

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
		});
	} catch (err) {
		const typed = new Error(err.message);
		typed.connectionType = classifyError(err);
		throw typed;
	}

	if (!response.ok) {
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

export const api = {
	getPublicInfo: () => request('/System/Info/Public'),

	getPublicUsers: () => request('/Users/Public'),

	authenticateByName: (username, password) => request('/Users/AuthenticateByName', {
		method: 'POST',
		body: {Username: username, Pw: password}
	}),

	initiateQuickConnect: () => request('/QuickConnect/Initiate', {
		method: 'POST'
	}),

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

	getItemForDetail: (itemId) =>
		request(`/Users/${currentUser}/Items/${itemId}?Fields=Overview,Genres,OfficialRating,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds,RunTimeTicks,ProductionYear,Chapters`),

	getItemWithChapters: (itemId) => request(`/Users/${currentUser}/Items/${itemId}?Fields=Chapters`),

	getMediaSegments: (itemId) => request(`/MediaSegments/${itemId}`),

	getUserConfiguration: () => request(`/Users/${currentUser}`),

	updateUserConfiguration: (config) => request(`/Users/${currentUser}/Configuration`, {
		method: 'POST',
		body: config
	}),

	getLatest: (libraryId, limit = 20) =>
		request(`/Users/${currentUser}/Items/Latest?ParentId=${libraryId}&Limit=${limit}&Fields=ImageTags,ParentThumbItemId,ParentBackdropItemId&ImageTypeLimit=1&GroupItems=true`),

	getCollections: (limit = 50) =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=BoxSet&Recursive=true&SortBy=SortName&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getResumeItems: (limit = 12) =>
		request(`/Users/${currentUser}/Items/Resume?Limit=${limit}&MediaTypes=Video&Fields=ImageTags,ParentThumbItemId,ParentBackdropItemId`),

	getNextUp: (limit = 24, seriesId = null) => {
		let url = `/Shows/NextUp?UserId=${currentUser}&Limit=${limit}&Fields=Overview,ImageTags,ParentThumbItemId,ParentBackdropItemId`;
		if (seriesId) url += `&SeriesId=${seriesId}`;
		return request(url);
	},

	getPlaybackInfo: (itemId, body = {}) => request(`/Items/${itemId}/PlaybackInfo`, {
		method: 'POST',
		body: {UserId: currentUser, ...body}
	}),

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

	getSimilar: (itemId, limit = 12) =>
		request(`/Items/${itemId}/Similar?UserId=${currentUser}&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getGenres: (libraryId) => {
		const params = libraryId ? `&ParentId=${libraryId}` : '';
		return request(`/Genres?UserId=${currentUser}&SortBy=SortName&Recursive=true&IncludeItemTypes=Movie,Series${params}`);
	},

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

	getRandomItems: (contentType = 'both', limit = 10, parentId = null) => {
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
		return request(`/Users/${currentUser}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers&HasBackdrop=true&ExcludeItemTypes=BoxSet${parentParam}`);
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

	getNextEpisode: (seriesId, currentEpisodeId) =>
		request(`/Shows/NextUp?UserId=${currentUser}&SeriesId=${seriesId}&StartItemId=${currentEpisodeId}&Limit=1`),

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
		request(`/Audio/${itemId}/Lyrics?UserId=${currentUser}`),

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

	getPlaylists: () =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&SortOrder=Ascending`),

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
		})
};

/**
 * Create an API instance for a specific server
 * Used for cross-server content aggregation
 * @param {string} serverUrl - Server URL
 * @param {string} token - Access token
 * @param {string} userId - User ID
 * @returns {Object} API object with all methods bound to the specified server
 */
export const createApiForServer = (serverUrl, token, userId) => {
	// Normalize server URL
	let url = serverUrl?.trim();
	if (url) {
		url = url.replace(/\/+$/, '');
		if (!/^https?:\/\//i.test(url)) {
			url = 'http://' + url;
		}
	}

	const getServerAuthHeader = () => {
		let header = `MediaBrowser Client="${APP_NAME}", Device="${DEVICE_NAME}", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
		if (token) {
			header += `, Token="${token}"`;
		}
		return header;
	};

	const serverRequest = async (endpoint, options = {}) => {
		const requestUrl = `${url}${endpoint}`;

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
			});
		} catch (err) {
			const typed = new Error(err.message);
			typed.connectionType = classifyError(err);
			throw typed;
		}

		if (!response.ok) {
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

		getGenres: (libraryId) => {
			const params = libraryId ? `&ParentId=${libraryId}` : '';
			return serverRequest(`/Genres?UserId=${userId}&SortBy=SortName&Recursive=true&IncludeItemTypes=Movie,Series${params}`);
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
			let endpoint = `/Users/${userId}/Items/Latest?Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ProviderIds`;
			if (libraryId) endpoint += `&ParentId=${libraryId}`;
			return serverRequest(endpoint);
		},

		getRandomItems: (contentType = 'both', limit = 10) => {
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
			return serverRequest(`/Users/${userId}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,Genres,ProviderIds&HasBackdrop=true&ExcludeItemTypes=BoxSet`);
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
			serverRequest(`/Items/${itemId}/PlaybackInfo?UserId=${userId}`),

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
			serverRequest(`/Audio/${itemId}/Lyrics?UserId=${userId}`),

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

		getPlaylists: () =>
			serverRequest(`/Users/${userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&SortOrder=Ascending`),

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

		// Return server info for playback routing
		getServerInfo: () => ({
			serverUrl: url,
			accessToken: token,
			userId: userId
		})
	};
};
