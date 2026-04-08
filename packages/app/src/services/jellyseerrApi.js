import {isWebOS, isTizen} from '../platform';

let jellyseerrUrl = null;
let userId = null;

let moonfinMode = false;
let jellyfinServerUrl = null;
let jellyfinAccessToken = null;

const isLegacyTizen = () => {
if (!isTizen() || typeof navigator === 'undefined') return false;
const match = (navigator.userAgent || '').match(/Tizen\s([0-9]+(?:\.[0-9]+)?)/i);
if (!match) return false;
const version = parseFloat(match[1]);
return Number.isFinite(version) && version <= 2.4;
};

// webOS 4 and legacy Tizen builds can fail HTTPS validation for image.tmdb.org,
// so use HTTP on those devices.
const _useHttp = isWebOS() || isLegacyTizen();

export const setConfig = (url, user) => {
jellyseerrUrl = url?.replace(/\/+$/, '');
userId = user;
console.log('[Jellyseerr] Config set:', {url: jellyseerrUrl, userId, moonfinMode});
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

export const getConfig = () => ({jellyseerrUrl, userId, moonfinMode, jellyfinServerUrl});

const fetchRequest = async (params) => {
const {url, method = 'GET', headers = {}, body, timeout = 30000} = params;

try {
const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;

const response = await fetch(url, {
method,
headers,
body: body || undefined,
signal: controller?.signal
});

if (timeoutId) clearTimeout(timeoutId);

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

const moonfinRequest = async (endpoint, options = {}) => {
if (!jellyfinServerUrl || !jellyfinAccessToken) {
throw new Error('Moonfin not configured');
}

const path = endpoint.replace(/^\//, '');
const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Api/${path}`;
const headers = {
'Content-Type': 'application/json',
'Accept': 'application/json',
'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
};

const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

console.log('[Jellyseerr/Moonfin] Request:', options.method || 'GET', endpoint);

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

console.log('[Jellyseerr/Moonfin] Response:', result.status, endpoint);

if (result.status >= 400) {
let errorMessage = `Moonfin proxy error: ${result.status}`;
if (result.body) {
try {
const errorBody = JSON.parse(result.body);
if (errorBody.FileContents) {
try {
const decoded = JSON.parse(decodeURIComponent(escape(atob(errorBody.FileContents))));
errorMessage = decoded.message || decoded.error || errorMessage;
} catch (e2) { void e2; }
} else {
errorMessage = errorBody.message || errorBody.error || errorMessage;
}
} catch (e) { void e; }
}
const error = new Error(errorMessage);
error.status = result.status;
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
console.log('[Jellyseerr/Moonfin] Unwrapped FileContents for:', endpoint,
'keys:', Object.keys(unwrapped || {}));
return unwrapped;
} catch (decodeErr) {
console.log('[Jellyseerr/Moonfin] FileContents decode failed for:', endpoint, decodeErr.message);
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
const errorBody = JSON.parse(result.body);
errorMessage = errorBody.message || errorBody.error || errorMessage;
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

const url = `${jellyfinServerUrl}/Moonfin/Jellyseerr/Status`;
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

export const moonfinLogin = async (username, password) => {
if (!jellyfinServerUrl || !jellyfinAccessToken) {
throw new Error('Moonfin not configured');
}

return moonfinAuthRequest(
`${jellyfinServerUrl}/Moonfin/Jellyseerr/Login`,
'POST',
{
'Content-Type': 'application/json',
'Accept': 'application/json',
'Authorization': `MediaBrowser Token="${jellyfinAccessToken}"`
},
JSON.stringify({username, password}),
30000
);
};

export const moonfinLogout = async () => {
if (!jellyfinServerUrl || !jellyfinAccessToken) {
throw new Error('Moonfin not configured');
}

return moonfinAuthRequest(
`${jellyfinServerUrl}/Moonfin/Jellyseerr/Logout`,
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
`${jellyfinServerUrl}/Moonfin/Jellyseerr/Validate`,
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

export const moonfinPing = async (serverUrl, token) => {
const sUrl = serverUrl || jellyfinServerUrl;
const sToken = token || jellyfinAccessToken;
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

export const getMoonfinConfig = async (serverUrl, token) => {
const sUrl = serverUrl || jellyfinServerUrl;
const sToken = token || jellyfinAccessToken;
if (!sUrl || !sToken) {
throw new Error('Server URL and token required');
}

const url = `${sUrl}/Moonfin/Jellyseerr/Config`;
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
REQUEST_TV: 524288
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
const proto = _useHttp ? 'http' : 'https';
return `${proto}://image.tmdb.org/t/p/${size}${path}`;
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
setConfig,
getConfig,
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
saveMoonfinProfile,
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
proxyImage
};
