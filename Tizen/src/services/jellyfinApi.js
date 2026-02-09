const APP_NAME = 'Moonfin for Tizen';
const APP_VERSION = '2.0.0';

let deviceId = null;
let currentServer = null;
let currentUser = null;
let accessToken = null;

export const setServer = (serverUrl) => {
	let url = serverUrl?.trim();
	if (!url) {
		currentServer = null;
		return;
	}

	url = url.replace(/\/+$/, '');

	if (!/^https?:\/\//i.test(url)) {
		url = 'http://' + url;
	}

	const urlObj = new URL(url);
	if (!urlObj.port && urlObj.protocol === 'http:') {
		urlObj.port = '8096';
	}

	currentServer = urlObj.toString().replace(/\/+$/, '');
};

export const setAuth = (userId, token) => {
	currentUser = userId;
	accessToken = token;
};

export const getAuthHeader = () => {
	let header = `MediaBrowser Client="${APP_NAME}", Device="Samsung Tizen TV", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
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

	deviceId = 'moonfin_tizen_' + Date.now().toString(36) + Math.random().toString(36).substring(2);

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

const request = async (endpoint, options = {}) => {
	const url = `${currentServer}${endpoint}`;

	const response = await fetch(url, {
		method: options.method || 'GET',
		headers: {
			'X-Emby-Authorization': getAuthHeader(),
			'Content-Type': 'application/json',
			...options.headers
		},
		body: options.body ? JSON.stringify(options.body) : undefined
	});

	if (!response.ok) {
		const error = new Error(`API Error: ${response.status}`);
		error.status = response.status;
		throw error;
	}

	if (response.status === 204) {
		return null;
	}

	return response.json();
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

	getUserConfiguration: () => request(`/Users/${currentUser}`),

	getLatest: (libraryId, limit = 20) =>
		request(`/Users/${currentUser}/Items/Latest?ParentId=${libraryId}&Limit=${limit}&Fields=Overview,Genres,OfficialRating,ImageTags,ParentLogoImageTag&ImageTypeLimit=1&GroupItems=true`),

	getCollections: (limit = 50) =>
		request(`/Users/${currentUser}/Items?IncludeItemTypes=BoxSet&Recursive=true&SortBy=SortName&SortOrder=Ascending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear`),

	getResumeItems: (limit = 12) =>
		request(`/Users/${currentUser}/Items/Resume?Limit=${limit}&MediaTypes=Video&Fields=Overview`),

	getNextUp: (limit = 24, seriesId = null) => {
		let url = `/Shows/NextUp?UserId=${currentUser}&Limit=${limit}&Fields=Overview`;
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
			request(`/Users/${currentUser}/Items?searchTerm=${encodeURIComponent(query)}&Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=PrimaryImageAspectRatio,ProductionYear`),
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
		return request(`/Users/${currentUser}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,Genres&HasBackdrop=true&ExcludeItemTypes=BoxSet`);
	},

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

	getNextEpisode: (seriesId, currentEpisodeId) =>
		request(`/Shows/NextUp?UserId=${currentUser}&SeriesId=${seriesId}&StartItemId=${currentEpisodeId}&Limit=1`),

	getAdjacentEpisodes: (itemId) =>
		request(`/Users/${currentUser}/Items/${itemId}?Fields=Overview,MediaStreams,Chapters`)
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
		let header = `MediaBrowser Client="${APP_NAME}", Device="Samsung Tizen TV", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
		if (token) {
			header += `, Token="${token}"`;
		}
		return header;
	};

	const serverRequest = async (endpoint, options = {}) => {
		const requestUrl = `${url}${endpoint}`;

		const response = await fetch(requestUrl, {
			method: options.method || 'GET',
			headers: {
				'X-Emby-Authorization': getServerAuthHeader(),
				'Content-Type': 'application/json',
				...options.headers
			},
			body: options.body ? JSON.stringify(options.body) : undefined
		});

		if (!response.ok) {
			const error = new Error(`API Error: ${response.status}`);
			error.status = response.status;
			throw error;
		}

		if (response.status === 204) {
			return null;
		}

		return response.json();
	};

	return {
		getLibraries: () =>
			serverRequest(`/Users/${userId}/Views`),

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

		getResumeItems: () =>
			serverRequest(`/Users/${userId}/Items/Resume?Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio,Overview&MediaTypes=Video&EnableTotalRecordCount=false&ExcludeItemTypes=Book`),

		getNextUp: (limit = 12, seriesId = null) => {
			let endpoint = `/Shows/NextUp?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview`;
			if (seriesId) endpoint += `&SeriesId=${seriesId}`;
			return serverRequest(endpoint);
		},

		getLatestMedia: (libraryId = null, limit = 16) => {
			let endpoint = `/Users/${userId}/Items/Latest?Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview`;
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
			return serverRequest(`/Users/${userId}/Items?IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview,Genres&HasBackdrop=true&ExcludeItemTypes=BoxSet`);
		},

		getRandomItem: (includeTypes = 'Movie,Series') =>
			serverRequest(`/Items?UserId=${userId}&IncludeItemTypes=${includeTypes}&Recursive=true&SortBy=Random&Limit=1&Fields=PrimaryImageAspectRatio,Overview&ExcludeItemTypes=BoxSet`),

		search: (query, limit = 24) =>
			serverRequest(`/Users/${userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Movie,Series,Episode,Person&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview`),

		getSimilar: (itemId, limit = 12) =>
			serverRequest(`/Items/${itemId}/Similar?UserId=${userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio,Overview`),

		getSeasons: (seriesId) =>
			serverRequest(`/Shows/${seriesId}/Seasons?UserId=${userId}&Fields=Overview,PrimaryImageAspectRatio`),

		getEpisodes: (seriesId, seasonId) =>
			serverRequest(`/Shows/${seriesId}/Episodes?UserId=${userId}&SeasonId=${seasonId}&Fields=Overview,PrimaryImageAspectRatio,MediaSources,MediaStreams`),

		getPlaybackInfo: (itemId) =>
			serverRequest(`/Items/${itemId}/PlaybackInfo?UserId=${userId}`),

		setFavorite: (itemId, isFavorite) => serverRequest(`/Users/${userId}/FavoriteItems/${itemId}`, {
			method: isFavorite ? 'POST' : 'DELETE'
		}),

		setWatched: (itemId, watched) => serverRequest(`/Users/${userId}/PlayedItems/${itemId}`, {
			method: watched ? 'POST' : 'DELETE'
		}),

		// Return server info for playback routing
		getServerInfo: () => ({
			serverUrl: url,
			accessToken: token,
			userId: userId
		}),

		reportPlaybackProgress: (data) => serverRequest('/Sessions/Playing/Progress', {
			method: 'POST',
			body: data
		}),

		reportPlaybackStopped: (data) => serverRequest('/Sessions/Playing/Stopped', {
			method: 'POST',
			body: data
		})
	};
};
