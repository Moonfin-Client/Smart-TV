export const TIMEOUT = 'timeout';
export const DNS_OR_NETWORK = 'network';
export const INVALID_ADDRESS = 'invalid_address';
export const SERVER_NOT_JELLYFIN = 'not_jellyfin';
export const VERSION_UNSUPPORTED = 'version_unsupported';
export const AUTH_FAILED = 'auth_failed';
export const SERVER_ERROR = 'server_error';

export const MIN_SERVER_VERSION = '10.9.0';

const MESSAGES = {
	[TIMEOUT]: 'Connection timed out. Check the address and your network.',
	[DNS_OR_NETWORK]: 'Could not reach server. Check the address and that the server is running.',
	[INVALID_ADDRESS]: 'Invalid server address format.',
	[SERVER_NOT_JELLYFIN]: 'Server responded but does not appear to be Jellyfin.',
	[VERSION_UNSUPPORTED]: 'Server version is not supported. Minimum: ' + MIN_SERVER_VERSION + '.',
	[AUTH_FAILED]: 'Invalid username or password.',
	[SERVER_ERROR]: 'Server error. Please try again later.'
};

const LOGIN_MESSAGES = {
	[AUTH_FAILED]: 'Invalid username or password.',
	[TIMEOUT]: 'Server timed out during login.'
};

export function getConnectionMessage (type) {
	return MESSAGES[type] || 'Failed to connect. Check the address and try again.';
}

export function getLoginMessage (type) {
	return LOGIN_MESSAGES[type] || 'Login failed. Please try again.';
}

export function classifyError (err) {
	if (!err) return null;
	if (err.connectionType) return err.connectionType;
	if (err.name === 'AbortError' || err.message === 'The operation was aborted.') return TIMEOUT;
	if (err instanceof TypeError) return DNS_OR_NETWORK;
	const status = err.status || err.response?.status;
	if (status === 401 || status === 403) return AUTH_FAILED;
	if (status >= 500) return SERVER_ERROR;
	return null;
}

export function isVersionSupported (versionString) {
	if (!versionString) return false;
	const parts = versionString.split('.').map(Number);
	const min = MIN_SERVER_VERSION.split('.').map(Number);
	for (let i = 0; i < min.length; i++) {
		if ((parts[i] || 0) > min[i]) return true;
		if ((parts[i] || 0) < min[i]) return false;
	}
	return true;
}
