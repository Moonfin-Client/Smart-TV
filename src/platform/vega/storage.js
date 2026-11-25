// localStorage with the app's prefix. The WebView keeps it across launches and
// package updates.

const STORAGE_PREFIX = 'moonfin_';
const TEMPORARY_PATTERNS = ['_cache', '_temp', '_preview'];

const prefixedKeys = () => {
	const keys = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
	}
	return keys;
};

// Cached and preview data goes first when the store is full.
const clearTemporaryData = () => {
	prefixedKeys()
		.filter((key) => TEMPORARY_PATTERNS.some((pattern) => key.substring(STORAGE_PREFIX.length).includes(pattern)))
		.forEach((key) => localStorage.removeItem(key));
};

export const initStorage = async () => true;

export const getFromStorage = async (key) => {
	try {
		const item = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
		if (item === null) return null;
		try {
			return JSON.parse(item);
		} catch (e) {
			return item;
		}
	} catch (error) {
		console.error(`[storage] Error getting ${key}:`, error);
		return null;
	}
};

export const saveToStorage = async (key, value) => {
	const serialized = JSON.stringify(value);
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
		return true;
	} catch (error) {
		if (error.name !== 'QuotaExceededError') {
			console.error(`[storage] Error saving ${key}:`, error);
			return false;
		}
		clearTemporaryData();
		try {
			localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
			return true;
		} catch (retryError) {
			console.error(`[storage] Error saving ${key} after cleanup:`, retryError);
			return false;
		}
	}
};

export const removeFromStorage = async (key) => {
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
		return true;
	} catch (error) {
		console.error(`[storage] Error removing ${key}:`, error);
		return false;
	}
};

export const clearAllStorage = async () => {
	try {
		prefixedKeys().forEach((key) => localStorage.removeItem(key));
		return true;
	} catch (error) {
		console.error('[storage] Error clearing storage:', error);
		return false;
	}
};
