import $L from '@enact/i18n/$L';

export const TIMEOUT = 'timeout';
export const DNS_OR_NETWORK = 'network';
export const INVALID_ADDRESS = 'invalid_address';
export const SERVER_NOT_JELLYFIN = 'not_jellyfin';
export const VERSION_UNSUPPORTED = 'version_unsupported';
export const AUTH_FAILED = 'auth_failed';
export const SERVER_ERROR = 'server_error';
export const INSECURE_CERT = 'insecure_cert';

export const MIN_SERVER_VERSION = '10.9.0';

// Looked up rather than stored, because $L only has the strings once the locale
// chunk has landed and these modules are imported well before that.
const MESSAGES = {
	[TIMEOUT]: () => $L('Connection timed out. Check the address and your network.'),
	[DNS_OR_NETWORK]: () => $L('Could not reach server. Check the address and that the server is running.'),
	[INVALID_ADDRESS]: () => $L('Invalid server address format.'),
	[SERVER_NOT_JELLYFIN]: () => $L('Server responded but does not appear to be Jellyfin or Emby.'),
	[VERSION_UNSUPPORTED]: () => $L('Server version is not supported. Minimum: {version}').replace('{version}', MIN_SERVER_VERSION) + '.',
	[AUTH_FAILED]: () => $L('Invalid username or password.'),
	[SERVER_ERROR]: () => $L('Server error. Please try again later.'),
	[INSECURE_CERT]: () => $L('Your TV rejected this server\'s security certificate. Check the TV\'s date & time, update webOS, or use a server whose certificate your TV trusts. Public servers using Let\'s Encrypt may not work on older TVs.')
};

const LOGIN_MESSAGES = {
	[AUTH_FAILED]: () => $L('Invalid username or password.'),
	[TIMEOUT]: () => $L('Server timed out during login.')
};

export function getConnectionMessage (type) {
	return MESSAGES[type] ? MESSAGES[type]() : $L('Failed to connect. Check the address and try again.');
}

export function getLoginMessage (type) {
	return LOGIN_MESSAGES[type] ? LOGIN_MESSAGES[type]() : $L('Login failed. Please try again.');
}

// A refusal at sign in. Jellyfin only gives the reason (an access schedule that doesn't
// allow the current time, a lockout, a disabled account) in its own log, and sends
// "Error processing request." outside development, so the status is all there is.
export function isSignInForbidden (err) {
	return Boolean(err) && err.status === 403;
}

export function getSignInMessage (err) {
	if (isSignInForbidden(err)) {
		return $L('This account can\'t sign in right now. It may be outside its allowed hours, locked or disabled. Try again later or ask an administrator.');
	}
	return getLoginMessage(classifyError(err));
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

/**
 * Work out which media server answered. A server that names itself is taken at
 * its word, and past that Emby is the only one that ships a four part version
 * below 10. Null means the reply came from something else entirely.
 *
 * @param {string} [productName]
 * @param {string} [version]
 * @returns {string|null} 'jellyfin', 'emby', or null
 */
export function detectServerType (productName, version) {
	const named = String(productName || '').toLowerCase();
	if (named.indexOf('jellyfin') >= 0) return 'jellyfin';
	if (named.indexOf('emby') >= 0) return 'emby';

	const parts = String(version || '').split('.');
	const major = parseInt(parts[0], 10);
	if (!Number.isNaN(major) && parts.length >= 4 && major < 10) return 'emby';
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

// Whether the web client opens its Quick Connect page from a link with the code
// already filled in. That page arrived in Jellyfin 10.9, and older servers only
// have the page without the prefill. A version that doesn't parse counts as
// recent enough, since the alternative is hiding it on every server that
// reports something unexpected.
export function supportsQuickConnectWebLink (versionString) {
	const parts = String(versionString || '').split('.');
	const major = parseInt(parts[0], 10);
	const minor = parseInt(parts[1], 10);
	if (Number.isNaN(major) || Number.isNaN(minor)) return true;
	return major > 10 || (major === 10 && minor >= 9);
}
