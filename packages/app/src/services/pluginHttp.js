import {fetchWithTimeout as sharedFetchWithTimeout} from '../utils/fetchTimeout';

const DEFAULT_ACCEPT = 'application/json';
const DEFAULT_TIMEOUT_MS = 15000;

export const normalizeServerUrl = (value) => {
	if (!value || typeof value !== 'string') return '';
	return value.replace(/\/+$/, '');
};

export const createAuthHeaders = (token, accept = DEFAULT_ACCEPT) => {
	const headers = {
		Accept: accept
	};
	if (token) {
		headers.Authorization = `MediaBrowser Token="${token}"`;
		headers['X-Emby-Token'] = token;
	}
	return headers;
};

export const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) =>
	sharedFetchWithTimeout(url, options, timeoutMs);

export const createHttpError = (status, body) => {
	const error = new Error(`API Error: ${status}`);
	error.status = status;
	error.body = body;
	return error;
};

export const formatErrorMessage = (error) => {
	if (!error) return null;
	if (typeof error === 'string') return error;
	if (error.status) return `HTTP ${error.status}`;
	if (error.name === 'AbortError') return 'Timed out';
	return error.message || 'Unknown error';
};

const parseJsonBody = (text) => {
	try {
		return JSON.parse(text);
	} catch {
		const error = new Error('Invalid JSON response');
		error.body = text;
		throw error;
	}
};

export const requestText = async ({
	serverUrl,
	endpoint,
	token,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	accept = DEFAULT_ACCEPT
}) => {
	const baseUrl = normalizeServerUrl(serverUrl);
	if (!baseUrl) {
		throw new Error('Invalid server URL');
	}
	const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
		method: 'GET',
		headers: createAuthHeaders(token, accept)
	}, timeoutMs);
	const text = await response.text();
	if (!response.ok) {
		throw createHttpError(response.status, text);
	}
	return text;
};

export const requestJson = async ({
	serverUrl,
	endpoint,
	token,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	accept = DEFAULT_ACCEPT
}) => {
	const text = await requestText({
		serverUrl,
		endpoint,
		token,
		timeoutMs,
		accept
	});
	if (!text) return null;
	return parseJsonBody(text);
};

export const requestJsonForSession = async (session, endpoint, timeoutMs = DEFAULT_TIMEOUT_MS) => {
	return requestJson({
		serverUrl: session?.url,
		endpoint,
		token: session?.accessToken,
		timeoutMs
	});
};