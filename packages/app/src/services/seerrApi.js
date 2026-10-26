import {isWebOS, isLegacyTizen} from '../platform';
import {fetchWithTimeout} from '../utils/fetchTimeout';
import {mediaServerQueue} from '../utils/requestQueue';
import {normalizeWatchlistBody} from './seerrApi.watchlistShape';
import {sharePending} from '../utils/sharePending';
import {isPlexUrl} from '../utils/plexUrls';

let moonfinMode = false;
let jellyfinServerUrl = null;
let jellyfinAccessToken = null;

// webOS 4 and legacy Tizen builds (<=3.0) can fail HTTPS validation for image.tmdb.org,
// so use HTTP on those devices.
const shouldUseHttp = isWebOS() || isLegacyTizen();

export const setMoonfinConfig = (serverUrl, token) => {
	jellyfinServerUrl = serverUrl?.replace(/\/+$/, '');
	jellyfinAccessToken = token;
};

export const setMoonfinMode = (enabled) => {
	moonfinMode = !!enabled;
};

export const isMoonfinMode = () => moonfinMode;

const fetchRequest = async (params) => {
	const {url, method = 'GET', headers = {}, body, timeout = 15000} = params;
	// Plex never has the plugin, so its requests are answered here instead of going out.
	if (isPlexUrl(url)) return {success: true, status: 404, headers: {}, body: ''};

	try {
		const response = await mediaServerQueue.run(() => fetchWithTimeout(url, {
			method,
			headers,
			body: body || undefined
		}, timeout));

		const responseBody = await response.text();

		return {
			success: true,
			status: response.status,
			headers: (function () {
				// Build headers object manually for Chromium 47 compat (no Headers.entries())
				const h = {};
				response.headers.forEach(function (value, key) { h[key] = value; });
				return h;
			})(),
			body: responseBody
		};
	} catch (error) {
		return {
			success: false,
			error: error.name === 'AbortError' ? 'Request timed out' : (error.message || 'Request failed')
		};
	}
};

// What a server said went wrong, capped. The message ends up in the diagnostic
// report, and a raw body from a proxy in front of the server is an error page
// that can carry paths or tokens.
const errorDetail = (body) => {
	const detail = String(body?.message || body?.error || body?.code || '').trim();
	if (!detail) return null;
	return detail.length > 200 ? `${detail.slice(0, 200)}...` : detail;
};

const moonfinRequest = async (endpoint, options = {}) => {
	if (!jellyfinServerUrl || !jellyfinAccessToken) {
		throw new Error('Moonfin not configured');
	}

	const path = endpoint.replace(/^\//, '');
	const url = `${jellyfinServerUrl}/Moonfin/Seerr/Api/${path}`;
	const headers = {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
	};

	const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

	const result = await fetchRequest({
		url,
		method: options.method || 'GET',
		headers,
		body: bodyStr,
		timeout: 30000
	});

	if (!result.success) {
		throw new Error(result.error || 'Moonfin proxy request failed');
	}

	if (result.status >= 400) {
		let errorMessage = `Moonfin proxy error: ${result.status}`;
		let errorCode = null;
		if (result.body) {
			try {
				const errorBody = JSON.parse(result.body);
				let payload = errorBody;
				if (errorBody.FileContents) {
					try {
						payload = JSON.parse(decodeURIComponent(escape(atob(errorBody.FileContents))));
					} catch (e2) { void e2; payload = null; }
				}
				if (payload) {
					errorMessage = errorDetail(payload) || errorMessage;
					// Surface the plugin's structured reason (UPSTREAM_REDIRECT / UPSTREAM_HTML /
					// SESSION_EXPIRED) so the UI can explain why instead of showing an empty row.
					errorCode = payload.code || null;
				}
			} catch (e) { void e; }
		}
		const error = new Error(errorMessage);
		error.status = result.status;
		if (errorCode) error.code = errorCode;
		throw error;
	}

	if (!result.body) return null;

	try {
		const parsed = JSON.parse(result.body);

		if (parsed.FileContents !== undefined) {
			try {
				const decoded = decodeURIComponent(escape(atob(parsed.FileContents)));
				if (!decoded) return null;
				const unwrapped = JSON.parse(decoded);
				return unwrapped;
			} catch (decodeErr) {
				return null;
			}
		}

		return parsed;
	} catch (e) {
		return result.body;
	}
};

const moonfinAuthRequest = async (url, method, headers, body, timeout = 15000) => {
	const result = await fetchRequest({url, method, headers, body, timeout});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		let errorMessage = `Moonfin request failed: ${result.status}`;
		if (result.body) {
			try {
				errorMessage = errorDetail(JSON.parse(result.body)) || errorMessage;
			} catch (e) { void e; }
		}
		const error = new Error(errorMessage);
		error.status = result.status;
		throw error;
	}

	if (!result.body) return null;
	try { return JSON.parse(result.body); } catch (e) { return result.body; }
};

export const getMoonfinStatus = async () => {
	if (!jellyfinServerUrl || !jellyfinAccessToken) {
		throw new Error('Moonfin not configured');
	}

	const url = `${jellyfinServerUrl}/Moonfin/Seerr/Status`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin status check failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return JSON.parse(result.body);
	} catch (e) {
		throw new Error('Invalid response from Moonfin');
	}
};

export const moonfinLogin = async (username, password, authType = 'jellyfin') => {
	if (!jellyfinServerUrl || !jellyfinAccessToken) {
		throw new Error('Moonfin not configured');
	}

	const normalizedAuthType = authType === 'local' ? 'local' : 'jellyfin';

	return moonfinAuthRequest(
`${jellyfinServerUrl}/Moonfin/Seerr/Login`,
'POST',
{
	'Content-Type': 'application/json',
	'Accept': 'application/json',
	'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
},
JSON.stringify({username, password, authType: normalizedAuthType}),
30000
	);
};

export const moonfinLogout = async () => {
	if (!jellyfinServerUrl || !jellyfinAccessToken) {
		throw new Error('Moonfin not configured');
	}

	return moonfinAuthRequest(
`${jellyfinServerUrl}/Moonfin/Seerr/Logout`,
'DELETE',
{'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`},
undefined,
15000
	);
};

export const moonfinValidate = async () => {
	if (!jellyfinServerUrl || !jellyfinAccessToken) {
		throw new Error('Moonfin not configured');
	}

	return moonfinAuthRequest(
`${jellyfinServerUrl}/Moonfin/Seerr/Validate`,
'GET',
{
	'Accept': 'application/json',
	'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
}
	);
};

const normalizeKeys = (obj) => {
	if (!obj || typeof obj !== 'object') return obj;
	const result = {};
	for (const key of Object.keys(obj)) {
		const normalized = key.charAt(0).toLowerCase() + key.slice(1);
		result[normalized] = obj[key];
	}
	return result;
};

const normalizeMoonfinStreamEvent = (payload) => {
	if (payload == null) return null;

	let parsed = payload;
	if (typeof parsed === 'string') {
		const trimmed = parsed.trim();
		if (!trimmed) return null;
		try {
			parsed = JSON.parse(trimmed);
		} catch (_) {
			return {type: trimmed};
		}
	}

	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	return normalizeKeys(parsed);
};

const pingOnce = async (sUrl, sToken) => {
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Ping`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin ping failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return normalizeKeys(JSON.parse(result.body));
	} catch (e) {
		throw new Error('Invalid response from Moonfin Ping');
	}
};

// More than one caller pings at launch, so a ping still on its way is shared.
const sharedPing = sharePending((sUrl, sToken) => `${sUrl}|${sToken}`, pingOnce);

export const moonfinPing = (serverUrl, token) => sharedPing(serverUrl || jellyfinServerUrl, token || jellyfinAccessToken);

// The messages the admin wrote for this viewer, as the plugin sends them.
export const getMoonfinMessages = async (serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const result = await fetchRequest({
		url: `${sUrl}/Moonfin/Messages`,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin messages failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return JSON.parse(result.body);
	} catch (e) {
		throw new Error('Invalid response from Moonfin Messages');
	}
};

export const getMoonfinConfig = async (serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Seerr/Config`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin config failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return normalizeKeys(JSON.parse(result.body));
	} catch (e) {
		throw new Error('Invalid response from Moonfin Config');
	}
};

export const getMoonfinSettings = async (serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Settings`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status === 404) return null;
	if (result.status >= 400) {
		const error = new Error(`Moonfin settings fetch failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return JSON.parse(result.body);
	} catch (e) {
		throw new Error('Invalid response from Moonfin Settings');
	}
};

export const getMoonfinThemes = async (serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Themes`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status === 404) return null;
	if (result.status >= 400) {
		const error = new Error(`Moonfin themes fetch failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return JSON.parse(result.body);
	} catch (e) {
		throw new Error('Invalid response from Moonfin Themes');
	}
};

// One flattened profile: the device override merged over global and the
// admin defaults, which is what Load and Reset apply locally.
export const getMoonfinResolvedProfile = async (profileName, serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Settings/Resolved/${profileName}`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status === 404) return null;
	if (result.status >= 400) {
		const error = new Error(`Moonfin resolved profile fetch failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	try {
		return JSON.parse(result.body);
	} catch (e) {
		throw new Error('Invalid response from Moonfin Settings');
	}
};

// Resetting the global profile clears the whole stored settings file, while a
// device profile reset just drops that one override. The server refuses a
// profile delete on global, hence the split.
export const deleteMoonfinProfile = async (profileName, serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = profileName === 'global'
		? `${sUrl}/Moonfin/Settings`
		: `${sUrl}/Moonfin/Settings/Profile/${profileName}`;
	const result = await fetchRequest({
		url,
		method: 'DELETE',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin profile reset failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	return true;
};

export const saveMoonfinProfile = async (profileName, profile, serverUrl, token) => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}

	const url = `${sUrl}/Moonfin/Settings/Profile/${profileName}`;
	const result = await fetchRequest({
		url,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		body: JSON.stringify({
			profile,
			clientId: 'moonfin-tv'
		}),
		timeout: 15000
	});

	if (!result.success) throw new Error(result.error || 'Network error');
	if (result.status >= 400) {
		const error = new Error(`Moonfin profile save failed: ${result.status}`);
		error.status = result.status;
		throw error;
	}

	return true;
};

export const subscribeMoonfinSettingsStream = (serverUrl, token, onEvent, onError) => {
	const sUrl = (serverUrl || jellyfinServerUrl || '').replace(/\/+$/, '');
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) {
		throw new Error('Server URL and token required');
	}
	if (isPlexUrl(sUrl)) throw new Error('Plex servers have no settings stream');

	let closed = false;
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	let eventSource = null;

	const emitError = (error) => {
		if (closed) return;
		if (error?.name === 'AbortError') return;
		if (typeof onError === 'function') {
			onError(error);
		}
	};

	const emitEvent = (payload) => {
		if (closed) return;
		const normalized = normalizeMoonfinStreamEvent(payload);
		if (!normalized) return;
		if (typeof onEvent === 'function') {
			onEvent(normalized);
		}
	};

	const connectWithEventSource = () => {
		const EventSourceCtor = typeof globalThis !== 'undefined' ? globalThis.EventSource : undefined;
		if (typeof EventSourceCtor === 'undefined') {
			return false;
		}

		const streamUrl = `${sUrl}/Moonfin/Settings/Stream?ApiKey=${encodeURIComponent(sToken)}`;
		try {
			eventSource = new EventSourceCtor(streamUrl);
		} catch (error) {
			emitError(error);
			return false;
		}

		eventSource.onmessage = (messageEvent) => {
			const payload = messageEvent?.data;
			if (!payload) return;
			emitEvent(payload);
		};

		eventSource.onerror = () => {
			if (closed) return;
			try {
				eventSource?.close();
			} catch (error) {
				void error;
			}
			eventSource = null;
			emitError(new Error('Moonfin settings stream closed'));
		};

		return true;
	};

	const run = async () => {
		try {
			const response = await fetch(`${sUrl}/Moonfin/Settings/Stream`, {
				method: 'GET',
				headers: {
					'Accept': 'text/event-stream',
					'Authorization': `MediaBrowser Token="${sToken}"`
				},
				signal: controller?.signal
			});

			if (!response.ok) {
				const error = new Error(`Moonfin settings stream failed: ${response.status}`);
				error.status = response.status;
				throw error;
			}

			if (!response.body || typeof response.body.getReader !== 'function') {
				if (connectWithEventSource()) {
					return;
				}
				throw new Error('Moonfin settings stream is not supported on this device');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (!closed) {
				const {value, done} = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, {stream: true});
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const rawLine of lines) {
					const line = rawLine.trimEnd();
					if (!line.startsWith('data:')) continue;

					const payload = line.slice(5).trim();
					if (!payload) continue;

					try {
						const parsed = JSON.parse(payload);
						emitEvent(parsed);
					} catch (error) {
						emitEvent(payload);
					}
				}
			}

			if (!closed) {
				emitError(new Error('Moonfin settings stream closed'));
			}
		} catch (error) {
			emitError(error);
		}
	};

	run();

	return {
		abort: () => {
			closed = true;
			try {
				controller?.abort();
			} catch (error) {
				void error;
			}
			try {
				eventSource?.close();
			} catch (error) {
				void error;
			}
			eventSource = null;
		}
	};
};

export const getMoonfinMediaBar = async (serverUrl, token, profile = 'tv') => {
	const sUrl = serverUrl || jellyfinServerUrl;
	const sToken = token || jellyfinAccessToken;
	if (!sUrl || !sToken) return null;

	const url = `${sUrl}/Moonfin/MediaBar?profile=${encodeURIComponent(profile)}`;
	const result = await fetchRequest({
		url,
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'Authorization': `MediaBrowser Token="${sToken}"`
		},
		timeout: 15000
	});

	if (!result.success || result.status >= 400) return null;
	try {
		return JSON.parse(result.body);
	} catch {
		return null;
	}
};

const request = async (endpoint, options = {}) => {
	return moonfinRequest(endpoint, options);
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
	REQUEST_TV: 524288,
	MANAGE_ISSUES: 1048576,
	VIEW_ISSUES: 2097152,
	CREATE_ISSUES: 4194304
};

const normalizePermissionValue = (userPermissions) => {
	if (userPermissions == null) return null;
	const numeric = Number(userPermissions);
	return Number.isFinite(numeric) ? numeric : null;
};

export const hasPermission = (userPermissions, permission) => {
	const normalizedPermissions = normalizePermissionValue(userPermissions);
	if (normalizedPermissions == null) return false;
	if ((normalizedPermissions & PERMISSIONS.ADMIN) !== 0) return true;
	return (normalizedPermissions & permission) !== 0;
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

export const canManageRequests = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.MANAGE_REQUESTS);
};

export const canManageIssues = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.MANAGE_ISSUES);
};

export const canCreateIssues = (userPermissions) => {
	return hasPermission(userPermissions, PERMISSIONS.CREATE_ISSUES) ||
hasPermission(userPermissions, PERMISSIONS.MANAGE_ISSUES);
};

export const getSettings = async () => {
	return request('/settings/main');
};

// What Seerr tells every client about itself, including whether it has a 4K backend
// standing by for each kind of media. Asking here rather than reading the server list
// is what the other clients do, and it needs none of the rights that list does.
export const getPublicSettings = async () => {
	return request('/settings/public');
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

// Full Radarr/Sonarr connection settings (hostname, port, apiKey, useSsl,
// baseUrl) used to fetch upcoming calendars directly from the arr servers.
// These are Seerr admin settings, so they require an admin Seerr session.
export const getRadarrSettings = async () => {
	return request('/settings/radarr');
};

export const getSonarrSettings = async () => {
	return request('/settings/sonarr');
};

export const discover = async (page = 1) => {
	return request(`/discover/movies?page=${page}`);
};

export const discoverTv = async (page = 1) => {
	return request(`/discover/tv?page=${page}`);
};

export const trending = async (page = 1) => {
	return request(`/discover/trending?page=${page}`);
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

// The sliders a Seerr admin arranged for its Discover page, in their order.
export const getDiscoverSliders = async () => {
	const sliders = await request('/settings/discover');
	return Array.isArray(sliders) ? sliders : [];
};

// One page of a slider's results. Its path already carries any query the slider's type needs.
export const getDiscoverSliderPage = async (pathWithQuery, page = 1) =>
	request(`/${pathWithQuery}${pathWithQuery.indexOf('?') >= 0 ? '&' : '?'}page=${page}`);

export const getGenreSliderMovies = async () => {
	return request('/discover/genreslider/movie');
};

export const getGenreSliderTv = async () => {
	return request('/discover/genreslider/tv');
};

// One query builder for every discover browse, since the sort and filter
// parameters are the same regardless of what the browse was opened on.
export const discoverFiltered = async (mediaType, {page = 1, sortBy, genre, studio, network, keywords, language, status, voteAverageGte, voteCountGte, withRuntimeGte, withRuntimeLte, releaseDateGte, releaseDateLte} = {}) => {
	const endpoint = mediaType === 'movie' ? 'movies' : 'tv';
	const params = {
		page,
		sortBy,
		genre,
		studio,
		network,
		keywords,
		language,
		status,
		voteAverageGte,
		voteCountGte,
		withRuntimeGte,
		withRuntimeLte,
		// The two media types name their release date bounds differently.
		[mediaType === 'movie' ? 'primaryReleaseDateGte' : 'firstAirDateGte']: releaseDateGte,
		[mediaType === 'movie' ? 'primaryReleaseDateLte' : 'firstAirDateLte']: releaseDateLte
	};
	const query = Object.entries(params)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&');
	return request(`/discover/${endpoint}?${query}`);
};

export const discoverByGenre = async (mediaType, genreId, page = 1) => {
	return discoverFiltered(mediaType, {genre: genreId, page});
};

export const discoverByNetwork = async (networkId, page = 1) => {
	return discoverFiltered('tv', {network: networkId, page});
};

export const discoverByStudio = async (studioId, page = 1) => {
	return discoverFiltered('movie', {studio: studioId, page});
};

export const discoverByKeyword = async (mediaType, keywordId, page = 1) => {
	return discoverFiltered(mediaType, {keywords: keywordId, page});
};

export const getLanguages = async () => {
	return request('/languages');
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

// The person endpoint carries no credits of its own, so the work they appeared
// in and the work they were crew on comes from here.
export const getPersonCombinedCredits = async (tmdbId) => {
	return request(`/person/${tmdbId}/combined_credits`);
};

export const getRequests = async (filter = 'all', take = 20, skip = 0, sort = 'added') => {
	return request(`/request?filter=${filter}&take=${take}&skip=${skip}&sort=${sort}`);
};

export const getRequest = async (requestId) => {
	return request(`/request/${requestId}`);
};

export const getRequestCount = async () => {
	return request('/request/count');
};

export const approveRequest = async (requestId) => {
	return request(`/request/${requestId}/approve`, {method: 'POST'});
};

export const declineRequest = async (requestId) => {
	return request(`/request/${requestId}/decline`, {method: 'POST'});
};

export const retryRequest = async (requestId) => {
	return request(`/request/${requestId}/retry`, {method: 'POST'});
};

export const getMyRequests = async (requestedByUserId, take = 50, skip = 0) => {
	const result = await request(`/request?filter=all&requestedBy=${requestedByUserId}&take=${take}&skip=${skip}&sort=modified`);
	return result;
};

export const getRecentlyAdded = async (take = 20) => {
	return request(`/media?filter=allavailable&sort=mediaAdded&take=${take}`);
};

// The watchlist response needs reshaping before anything downstream can use it.
// seerrApi.watchlistShape.js explains why.
export const getWatchlist = async (page = 1) =>
	normalizeWatchlistBody(await request(`/discover/watchlist?page=${page}`));

export const REQUEST_STATUS = {
	PENDING: 1,
	APPROVED: 2,
	DECLINED: 3,
	FAILED: 4,
	COMPLETED: 5
};

export const getRequestStatusText = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return 'Pending';
		case REQUEST_STATUS.APPROVED: return 'Approved';
		case REQUEST_STATUS.DECLINED: return 'Declined';
		case REQUEST_STATUS.FAILED: return 'Failed';
		case REQUEST_STATUS.COMPLETED: return 'Available';
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

// Adding names the title in the body and removing names it in the path, which is how Seerr
// takes each of them.
export const addToWatchlist = async (tmdbId, mediaType) => {
	return request('/watchlist', {method: 'POST', body: {tmdbId, mediaType}});
};

export const removeFromWatchlist = async (tmdbId, mediaType) => {
	return request(`/watchlist/${tmdbId}?mediaType=${mediaType}`, {method: 'DELETE'});
};

export const getIssues = async (filter = 'open', take = 20, skip = 0) => {
	return request(`/issue?filter=${filter}&take=${take}&skip=${skip}`);
};

export const getIssueCount = async () => {
	return request('/issue/count');
};

export const getIssue = async (issueId) => {
	return request(`/issue/${issueId}`);
};

// mediaId is the seerr internal media id from details.mediaInfo.id, not the tmdb id.
export const createIssue = async ({issueType, message, mediaId, problemSeason = 0, problemEpisode = 0}) => {
	return request('/issue', {
		method: 'POST',
		body: {issueType, message, mediaId, problemSeason, problemEpisode}
	});
};

export const commentOnIssue = async (issueId, message) => {
	return request(`/issue/${issueId}/comment`, {
		method: 'POST',
		body: {message}
	});
};

export const setIssueStatus = async (issueId, status) => {
	return request(`/issue/${issueId}/${status}`, {method: 'POST'});
};

export const deleteIssue = async (issueId) => {
	return request(`/issue/${issueId}`, {method: 'DELETE'});
};

export const getCollection = async (collectionId) => {
	return request(`/collection/${collectionId}`);
};

export const getUserQuota = async (userId) => {
	return request(`/user/${userId}/quota`);
};

export const getMediaStatus = async (mediaType, tmdbId) => {
	if (mediaType === 'movie') {
		return getMovie(tmdbId);
	}
	return getTv(tmdbId);
};

export const getImageUrl = (path, size = 'w500') => {
	if (!path) return null;
	const proto = shouldUseHttp ? 'http' : 'https';
	const normalizedPath = String(path).trim();

	// Already a full TMDB URL - fix the protocol
	if (normalizedPath.startsWith('http://image.tmdb.org') || normalizedPath.startsWith('https://image.tmdb.org')) {
		return normalizedPath.replace(/^https?/, proto);
	}

	// Another site's picture, like the IMDb charts' own posters, is used as it is.
	if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

	if (normalizedPath.startsWith('/t/p/')) {
		return `${proto}://image.tmdb.org${normalizedPath}`;
	}

	const filePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
	return `${proto}://image.tmdb.org/t/p/${size}${filePath}`;
};

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
	setMoonfinConfig,
	setMoonfinMode,
	isMoonfinMode,
	getMoonfinStatus,
	moonfinLogin,
	moonfinLogout,
	moonfinValidate,
	moonfinPing,
	getMoonfinConfig,
	getMoonfinSettings,
	getMoonfinThemes,
	getMoonfinResolvedProfile,
	deleteMoonfinProfile,
	saveMoonfinProfile,
	subscribeMoonfinSettingsStream,
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
	canManageRequests,
	canManageIssues,
	canCreateIssues,
	getSettings,
	getPublicSettings,
	getBlacklist,
	getRadarrServers,
	getRadarrServerDetails,
	getSonarrServers,
	getSonarrServerDetails,
	getRadarrSettings,
	getSonarrSettings,
	discover,
	discoverTv,
	trending,
	trendingMovies,
	trendingTv,
	upcomingMovies,
	upcomingTv,
	getGenreSliderMovies,
	getGenreSliderTv,
	getDiscoverSliders,
	getDiscoverSliderPage,
	discoverFiltered,
	discoverByGenre,
	discoverByNetwork,
	discoverByStudio,
	discoverByKeyword,
	getLanguages,
	getMovieRecommendations,
	getTvRecommendations,
	getMovieSimilar,
	getTvSimilar,
	search,
	getMovie,
	getTv,
	getPerson,
	getPersonCombinedCredits,
	getMediaStatus,
	getRequests,
	getRequest,
	getRequestCount,
	approveRequest,
	declineRequest,
	retryRequest,
	getMyRequests,
	getRecentlyAdded,
	getWatchlist,
	addToWatchlist,
	removeFromWatchlist,
	REQUEST_STATUS,
	getRequestStatusText,
	requestMovie,
	requestTv,
	cancelRequest,
	getIssues,
	getIssueCount,
	getIssue,
	createIssue,
	commentOnIssue,
	setIssueStatus,
	deleteIssue,
	getCollection,
	getUserQuota,
	getImageUrl,
	proxyImage
};
