/* global XMLHttpRequest */
/**
 * Jellyseerr API Service for Tizen
 *
 * On Tizen, packaged apps bypass CORS restrictions but cookies don't work
 * cross-origin in webviews. We manually manage the session cookie by:
 * 1. Extracting Set-Cookie from login response headers (when possible)
 * 2. Storing the session ID in localStorage
 * 3. Sending it manually via Cookie header on subsequent requests
 */

let jellyseerrUrl = null;
let userId = null;
let apiKey = null;
let sessionCookie = null; // Manually managed session cookie

// Moonfin plugin proxy mode
let moonfinMode = false;
let jellyfinServerUrl = null;
let jellyfinAccessToken = null;

export const setConfig = (url, user, key = null, session = null) => {
	jellyseerrUrl = url?.replace(/\/+$/, '');
	userId = user;
	apiKey = key;
	sessionCookie = session;
	console.log('[Jellyseerr] Config set:', {
		url: jellyseerrUrl,
		userId,
		hasApiKey: !!apiKey,
		hasSession: !!sessionCookie,
		moonfinMode
	});
};

export const setMoonfinConfig = (serverUrl, token) => {
	jellyfinServerUrl = serverUrl?.replace(/\/+$/, '');
	jellyfinAccessToken = token;
	console.log('[Jellyseerr] Moonfin config set:', {
		serverUrl: jellyfinServerUrl,
		hasToken: !!jellyfinAccessToken
	});
};

export const setMoonfinMode = (enabled) => {
	moonfinMode = !!enabled;
	console.log('[Jellyseerr] Moonfin mode:', moonfinMode ? 'enabled' : 'disabled');
};

export const isMoonfinMode = () => moonfinMode;

export const getConfig = () => ({jellyseerrUrl, userId, apiKey, sessionCookie, moonfinMode, jellyfinServerUrl});

export const setSessionCookie = (cookie) => {
	sessionCookie = cookie;
	console.log('[Jellyseerr] Session cookie set:', cookie ? 'present' : 'cleared');
};

export const getSessionCookie = () => sessionCookie;

/**
 * Extract connect.sid cookie from Set-Cookie header
 * Note: This may not work in all browsers due to security restrictions
 */
const extractSessionFromHeaders = (xhr) => {
	// Try to get Set-Cookie header (may be blocked by browser)
	const setCookie = xhr.getResponseHeader('Set-Cookie');
	if (setCookie) {
		console.log('[Jellyseerr] Set-Cookie header:', setCookie);
		const match = setCookie.match(/connect\.sid=([^;]+)/);
		if (match) {
			return `connect.sid=${match[1]}`;
		}
	}
	return null;
};

/**
 * Make a request via the Moonfin server plugin proxy
 * Routes through /Moonfin/Jellyseerr/Api/{path} on the Jellyfin server
 * @param {string} endpoint - API endpoint (starting with /)
 * @param {Object} options - Request options
 * @returns {Promise<any>} - Response data
 */
const moonfinRequest = (endpoint, options = {}) => {
	return new Promise((resolve, reject) => {
		if (!jellyfinServerUrl || !jellyfinAccessToken) {
			reject(new Error('Moonfin not configured'));
			return;
		}

		// Strip leading slash for the proxy path
		const path = endpoint.replace(/^\//, '');
		const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Api/${path}`;
		const xhr = new XMLHttpRequest();

		console.log('[Jellyseerr/Moonfin] Request:', options.method || 'GET', endpoint);

		xhr.open(options.method || 'GET', url, true);

		// Set headers
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Accept', 'application/json');
		// Use standard Jellyfin auth header
		xhr.setRequestHeader('Authorization', `MediaBrowser Token="${jellyfinAccessToken}"`);

		xhr.onload = () => {
			console.log('[Jellyseerr/Moonfin] Response:', xhr.status, endpoint);

			if (xhr.status >= 400) {
				let errorMessage = `Moonfin proxy error: ${xhr.status}`;
				try {
					const errorBody = JSON.parse(xhr.responseText);
					// Unwrap FileContents envelope for error responses too
					if (errorBody.FileContents) {
						try {
							const decoded = JSON.parse(atob(errorBody.FileContents));
							errorMessage = decoded.message || decoded.error || errorMessage;
						} catch (e2) { void e2; }
					} else {
						errorMessage = errorBody.message || errorBody.error || errorMessage;
					}
				} catch (e) { void e; }
				const error = new Error(errorMessage);
				error.status = xhr.status;
				reject(error);
				return;
			}

			if (!xhr.responseText) {
				resolve(null);
				return;
			}

			try {
				const parsed = JSON.parse(xhr.responseText);

				// Moonfin wraps responses in a FileContents envelope with base64 data
				if (parsed.FileContents !== undefined) {
					try {
						const decoded = atob(parsed.FileContents);
						if (!decoded) {
							resolve(null);
							return;
						}
						const result = JSON.parse(decoded);
						console.log('[Jellyseerr/Moonfin] Unwrapped FileContents for:', endpoint,
							'keys:', Object.keys(result || {}));
						resolve(result);
					} catch (decodeErr) {
						console.log('[Jellyseerr/Moonfin] FileContents decode failed for:', endpoint, decodeErr.message);
						resolve(null);
					}
					return;
				}

				resolve(parsed);
			} catch (e) {
				resolve(xhr.responseText);
			}
		};

		xhr.onerror = () => {
			console.log('[Jellyseerr/Moonfin] Network error for:', endpoint);
			reject(new Error('Network error'));
		};

		xhr.ontimeout = () => {
			reject(new Error('Request timeout'));
		};

		if (options.body) {
			xhr.send(JSON.stringify(options.body));
		} else {
			xhr.send();
		}
	});
};

/**
 * Check Moonfin plugin status - whether user has a Jellyseerr session
 * @returns {Promise<Object>} - Status object with authenticated, displayName, url, etc.
 */
export const getMoonfinStatus = async () => {
	return new Promise((resolve, reject) => {
		if (!jellyfinServerUrl || !jellyfinAccessToken) {
			reject(new Error('Moonfin not configured'));
			return;
		}

		const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Status`;
		const xhr = new XMLHttpRequest();

		xhr.open('GET', url, true);
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.setRequestHeader('Authorization', `MediaBrowser Token="${jellyfinAccessToken}"`);

		xhr.onload = () => {
			if (xhr.status >= 400) {
				const error = new Error(`Moonfin status check failed: ${xhr.status}`);
				error.status = xhr.status;
				reject(error);
				return;
			}
			try {
				resolve(JSON.parse(xhr.responseText));
			} catch (e) {
				reject(new Error('Invalid response from Moonfin'));
			}
		};

		xhr.onerror = () => reject(new Error('Network error'));
		xhr.ontimeout = () => reject(new Error('Request timeout'));
		xhr.send();
	});
};

/**
 * Login to Jellyseerr via Moonfin plugin
 * @param {string} username
 * @param {string} password
 * @returns {Promise<Object>}
 */
export const moonfinLogin = async (username, password) => {
	return new Promise((resolve, reject) => {
		if (!jellyfinServerUrl || !jellyfinAccessToken) {
			reject(new Error('Moonfin not configured'));
			return;
		}

		const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Login`;
		const xhr = new XMLHttpRequest();

		xhr.open('POST', url, true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.setRequestHeader('Authorization', `MediaBrowser Token="${jellyfinAccessToken}"`);

		xhr.onload = () => {
			if (xhr.status >= 400) {
				let errorMessage = `Moonfin login failed: ${xhr.status}`;
				try {
					const errorBody = JSON.parse(xhr.responseText);
					errorMessage = errorBody.message || errorBody.error || errorMessage;
				} catch (e) { void e; }
				const error = new Error(errorMessage);
				error.status = xhr.status;
				reject(error);
				return;
			}
			try {
				resolve(JSON.parse(xhr.responseText));
			} catch (e) {
				resolve(null);
			}
		};

		xhr.onerror = () => reject(new Error('Network error'));
		xhr.ontimeout = () => reject(new Error('Request timeout'));
		xhr.send(JSON.stringify({username, password}));
	});
};

/**
 * Logout from Jellyseerr via Moonfin plugin
 */
export const moonfinLogout = async () => {
	return new Promise((resolve, reject) => {
		if (!jellyfinServerUrl || !jellyfinAccessToken) {
			reject(new Error('Moonfin not configured'));
			return;
		}

		const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Logout`;
		const xhr = new XMLHttpRequest();

		xhr.open('DELETE', url, true);
		xhr.setRequestHeader('Authorization', `MediaBrowser Token="${jellyfinAccessToken}"`);

		xhr.onload = () => {
			if (xhr.status >= 400) {
				const error = new Error(`Moonfin logout failed: ${xhr.status}`);
				error.status = xhr.status;
				reject(error);
				return;
			}
			resolve(null);
		};

		xhr.onerror = () => reject(new Error('Network error'));
		xhr.ontimeout = () => reject(new Error('Request timeout'));
		xhr.send();
	});
};

/**
 * Validate Moonfin session
 */
export const moonfinValidate = async () => {
	return new Promise((resolve, reject) => {
		if (!jellyfinServerUrl || !jellyfinAccessToken) {
			reject(new Error('Moonfin not configured'));
			return;
		}

		const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Validate`;
		const xhr = new XMLHttpRequest();

		xhr.open('GET', url, true);
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.setRequestHeader('Authorization', `MediaBrowser Token="${jellyfinAccessToken}"`);

		xhr.onload = () => {
			if (xhr.status >= 400) {
				const error = new Error(`Moonfin validation failed: ${xhr.status}`);
				error.status = xhr.status;
				reject(error);
				return;
			}
			try {
				resolve(JSON.parse(xhr.responseText));
			} catch (e) {
				resolve(null);
			}
		};

		xhr.onerror = () => reject(new Error('Network error'));
		xhr.ontimeout = () => reject(new Error('Request timeout'));
		xhr.send();
	});
};

/**
 * Make a request to the Jellyseerr API using XMLHttpRequest
 * Manually manages session cookies since cross-origin cookies don't work in Tizen webviews
 * In Moonfin mode, routes through the Jellyfin server plugin proxy.
 * @param {string} endpoint - API endpoint (starting with /)
 * @param {Object} options - Request options
 * @returns {Promise<any>} - Response data
 */
const request = (endpoint, options = {}) => {
	// If Moonfin mode is enabled, route through the proxy
	if (moonfinMode) {
		return moonfinRequest(endpoint, options);
	}

	return new Promise((resolve, reject) => {
		if (!jellyseerrUrl || !userId) {
			reject(new Error('Jellyseerr not configured'));
			return;
		}

		const url = `${jellyseerrUrl}/api/v1${endpoint}`;
		const xhr = new XMLHttpRequest();

		console.log('[Jellyseerr] Request:', options.method || 'GET', endpoint);

		xhr.open(options.method || 'GET', url, true);
		xhr.withCredentials = true;

		// Set headers
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Accept', 'application/json');

		// Use API key if available (most reliable)
		if (apiKey) {
			xhr.setRequestHeader('X-Api-Key', apiKey);
			console.log('[Jellyseerr] Using API key auth');
		}
		// Otherwise try to send our manually managed session cookie
		else if (sessionCookie) {
			// Note: Setting Cookie header may be blocked by browser security
			// but Tizen apps sometimes allow it
			try {
				xhr.setRequestHeader('Cookie', sessionCookie);
				console.log('[Jellyseerr] Sending manual session cookie');
			} catch (e) {
				console.log('[Jellyseerr] Could not set Cookie header:', e.message);
			}
		}

		// Set any additional headers
		if (options.headers) {
			Object.keys(options.headers).forEach(key => {
				xhr.setRequestHeader(key, options.headers[key]);
			});
		}

		xhr.onload = () => {
			console.log('[Jellyseerr] Response:', xhr.status, endpoint);

			// Try to capture session cookie from successful auth responses
			if (xhr.status === 200 && (endpoint.includes('/auth/') && !endpoint.includes('/auth/me'))) {
				const newSession = extractSessionFromHeaders(xhr);
				if (newSession) {
					sessionCookie = newSession;
					console.log('[Jellyseerr] Captured session cookie from response');
				}
			}

			if (xhr.status >= 400) {
				let errorMessage = `Jellyseerr API error: ${xhr.status}`;
				try {
					const errorBody = JSON.parse(xhr.responseText);
					errorMessage = errorBody.message || errorBody.error || errorMessage;
					console.log('[Jellyseerr] Error body:', errorBody);
				} catch (e) { void e; }
				const error = new Error(errorMessage);
				error.status = xhr.status;
				reject(error);
				return;
			}

			// Handle empty responses
			if (!xhr.responseText) {
				resolve(null);
				return;
			}

			try {
				resolve(JSON.parse(xhr.responseText));
			} catch (e) {
				resolve(xhr.responseText);
			}
		};

		xhr.onerror = () => {
			console.log('[Jellyseerr] Network error for:', endpoint);
			reject(new Error('Network error'));
		};

		xhr.ontimeout = () => {
			reject(new Error('Request timeout'));
		};

		// Send request
		if (options.body) {
			xhr.send(JSON.stringify(options.body));
		} else {
			xhr.send();
		}
	});
};

export const clearCookies = async () => {
	// On Tizen, we can't programmatically clear cookies for other domains
	// This is a no-op, but kept for API compatibility
	console.log('clearCookies called - cookies will persist in Tizen');
};

export const testConnection = async () => {
	const status = await request('/status');
	return status;
};

export const login = async (email, password) => {
	const result = await request('/auth/local', {
		method: 'POST',
		body: {email, password}
	});
	return result;
};

export const loginWithJellyfin = async (username, password, jellyfinHost) => {
	try {
		const result = await request('/auth/jellyfin', {
			method: 'POST',
			body: {username, password}
		});
		return result;
	} catch (err) {
		if (err.status === 401) {
			const result = await request('/auth/jellyfin', {
				method: 'POST',
				body: {username, password, hostname: jellyfinHost}
			});
			return result;
		}
		throw err;
	}
};

export const getUser = async () => {
	return request('/auth/me');
};

export const PERMISSIONS = {
	NONE: 0,
	ADMIN: 2,
	MANAGE_SETTINGS: 4,
	MANAGE_USERS: 8,
	MANAGE_REQUESTS: 16,
	REQUEST: 32,
	AUTO_APPROVE: 128,
	REQUEST_4K: 1024,
	REQUEST_4K_MOVIE: 2048,
	REQUEST_4K_TV: 4096,
	REQUEST_ADVANCED: 8192,
	REQUEST_MOVIE: 262144,
	REQUEST_TV: 524288
};

export const hasPermission = (userPermissions, permission) => {
	if (!userPermissions) return false;
	if ((userPermissions & PERMISSIONS.ADMIN) !== 0) return true;
	return (userPermissions & permission) !== 0;
};

export const canRequest4k = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST_4K) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_4K_MOVIE) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_4K_TV);
};

export const canRequest4kMovies = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST_4K) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_4K_MOVIE);
};

export const canRequest4kTv = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST_4K) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_4K_TV);
};

export const canRequest = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_MOVIE) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_TV);
};

export const canRequestMovies = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_MOVIE);
};

export const canRequestTv = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST) ||
		hasPermission(userPermissions, PERMISSIONS.REQUEST_TV);
};

export const hasAdvancedRequestPermission = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.REQUEST_ADVANCED) ||
		hasPermission(userPermissions, PERMISSIONS.MANAGE_REQUESTS);
};

export const getSettings = async () => {
	return request('/settings/main');
};

export const getBlacklist = async (page = 1) => {
	return request(`/blacklist?take=20&skip=${(page - 1) * 20}`);
};

export const getRadarrServers = async () => {
	return request('/service/radarr');
};

export const getRadarrServerDetails = async (serverId) => {
	return request(`/service/radarr/${serverId}`);
};

export const getSonarrServers = async () => {
	return request('/service/sonarr');
};

export const getSonarrServerDetails = async (serverId) => {
	return request(`/service/sonarr/${serverId}`);
};

export const logout = async () => {
	await request('/auth/logout', {method: 'POST'});
	await clearCookies();
};

export const discover = async (page = 1) => {
	return request(`/discover/movies?page=${page}`);
};

export const discoverTv = async (page = 1) => {
	return request(`/discover/tv?page=${page}`);
};

export const trending = async () => {
	return request('/discover/trending');
};

export const trendingMovies = async (page = 1) => {
	return request(`/discover/movies?page=${page}`);
};

export const trendingTv = async (page = 1) => {
	return request(`/discover/tv?page=${page}`);
};

export const upcomingMovies = async (page = 1) => {
	return request(`/discover/movies/upcoming?page=${page}`);
};

export const upcomingTv = async (page = 1) => {
	return request(`/discover/tv/upcoming?page=${page}`);
};

export const getGenreSliderMovies = async () => {
	return request('/discover/genreslider/movie');
};

export const getGenreSliderTv = async () => {
	return request('/discover/genreslider/tv');
};

export const discoverByGenre = async (mediaType, genreId, page = 1) => {
	const endpoint = mediaType === 'movie' ? 'movies' : 'tv';
	return request(`/discover/${endpoint}?genre=${genreId}&page=${page}`);
};

export const discoverByNetwork = async (networkId, page = 1) => {
	return request(`/discover/tv?network=${networkId}&page=${page}`);
};

export const discoverByStudio = async (studioId, page = 1) => {
	return request(`/discover/movies?studio=${studioId}&page=${page}`);
};

export const discoverByKeyword = async (mediaType, keywordId, page = 1) => {
	const endpoint = mediaType === 'movie' ? 'movies' : 'tv';
	return request(`/discover/${endpoint}?keywords=${keywordId}&page=${page}`);
};

export const getMovieRecommendations = async (movieId, page = 1) => {
	return request(`/movie/${movieId}/recommendations?page=${page}`);
};

export const getTvRecommendations = async (tvId, page = 1) => {
	return request(`/tv/${tvId}/recommendations?page=${page}`);
};

export const getMovieSimilar = async (movieId, page = 1) => {
	return request(`/movie/${movieId}/similar?page=${page}`);
};

export const getTvSimilar = async (tvId, page = 1) => {
	return request(`/tv/${tvId}/similar?page=${page}`);
};

export const search = async (query, page = 1) => {
	return request(`/search?query=${encodeURIComponent(query)}&page=${page}`);
};

export const getMovie = async (tmdbId) => {
	return request(`/movie/${tmdbId}`);
};

export const getTv = async (tmdbId) => {
	return request(`/tv/${tmdbId}`);
};

export const getPerson = async (tmdbId) => {
	return request(`/person/${tmdbId}`);
};

export const getRequests = async (filter = 'all', take = 20, skip = 0) => {
	return request(`/request?filter=${filter}&take=${take}&skip=${skip}`);
};

export const getMyRequests = async (requestedByUserId, take = 50, skip = 0) => {
	console.log('[jellyseerrApi] getMyRequests called:', {requestedByUserId, take, skip});
	const result = await request(`/request?filter=all&requestedBy=${requestedByUserId}&take=${take}&skip=${skip}&sort=modified`);
	console.log('[jellyseerrApi] getMyRequests result:', result?.results?.length || 0, 'requests');
	return result;
};

export const REQUEST_STATUS = {
	PENDING: 1,
	APPROVED: 2,
	DECLINED: 3,
	AVAILABLE: 4
};

export const getRequestStatusText = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return 'Pending';
		case REQUEST_STATUS.APPROVED: return 'Approved';
		case REQUEST_STATUS.DECLINED: return 'Declined';
		case REQUEST_STATUS.AVAILABLE: return 'Available';
		default: return 'Unknown';
	}
};

export const requestMovie = async (tmdbId, options = {}) => {
	const body = {
		mediaType: 'movie',
		mediaId: tmdbId,
		is4k: options.is4k || false
	};

	if (options.serverId != null) body.serverId = options.serverId;
	if (options.profileId != null) body.profileId = options.profileId;
	if (options.rootFolder != null) body.rootFolder = options.rootFolder;

	return request('/request', {
		method: 'POST',
		body
	});
};

export const requestTv = async (tmdbId, options = {}) => {
	const seasonsValue = Array.isArray(options.seasons)
		? options.seasons
		: (options.seasons || 'all');

	const body = {
		mediaType: 'tv',
		mediaId: tmdbId,
		is4k: options.is4k || false,
		seasons: seasonsValue
	};

	if (options.serverId != null) body.serverId = options.serverId;
	if (options.profileId != null) body.profileId = options.profileId;
	if (options.rootFolder != null) body.rootFolder = options.rootFolder;

	return request('/request', {
		method: 'POST',
		body
	});
};

export const cancelRequest = async (requestId) => {
	return request(`/request/${requestId}`, {method: 'DELETE'});
};

export const getMediaStatus = async (mediaType, tmdbId) => {
	if (mediaType === 'movie') {
		return getMovie(tmdbId);
	}
	return getTv(tmdbId);
};

export const getImageUrl = (path, size = 'w500') => {
	if (!path) return null;
	return `https://image.tmdb.org/t/p/${size}${path}`;
};

/**
 * Fetch image and return as blob URL
 * Tizen bypasses CORS so we can fetch directly
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<string|null>} - Blob URL or null
 */
export const proxyImage = async (imageUrl) => {
	if (!imageUrl) return null;

	try {
		const response = await fetch(imageUrl);
		if (!response.ok) return null;

		const blob = await response.blob();
		return URL.createObjectURL(blob);
	} catch (error) {
		console.warn('Image proxy error:', error);
		return null;
	}
};

export default {
	setConfig,
	getConfig,
	setMoonfinConfig,
	setMoonfinMode,
	isMoonfinMode,
	getMoonfinStatus,
	moonfinLogin,
	moonfinLogout,
	moonfinValidate,
	testConnection,
	login,
	loginWithJellyfin,
	logout,
	getUser,
	PERMISSIONS,
	hasPermission,
	canRequest,
	canRequestMovies,
	canRequestTv,
	canRequest4k,
	canRequest4kMovies,
	canRequest4kTv,
	hasAdvancedRequestPermission,
	getSettings,
	getBlacklist,
	getRadarrServers,
	getRadarrServerDetails,
	getSonarrServers,
	getSonarrServerDetails,
	discover,
	discoverTv,
	trending,
	trendingMovies,
	trendingTv,
	upcomingMovies,
	upcomingTv,
	getGenreSliderMovies,
	getGenreSliderTv,
	discoverByGenre,
	discoverByNetwork,
	discoverByStudio,
	discoverByKeyword,
	getMovieRecommendations,
	getTvRecommendations,
	getMovieSimilar,
	getTvSimilar,
	search,
	getMovie,
	getTv,
	getPerson,
	getMediaStatus,
	getRequests,
	getMyRequests,
	REQUEST_STATUS,
	getRequestStatusText,
	requestMovie,
	requestTv,
	cancelRequest,
	getImageUrl,
	proxyImage,
	clearCookies
};
