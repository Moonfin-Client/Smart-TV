const STORAGE_PREFIX = 'moonfin_';

const clearOldData = async () => {
	const temporaryPatterns = ['_cache', '_temp', '_preview'];

	try {
		const keysToRemove = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(STORAGE_PREFIX)) {
				const shortKey = key.substring(STORAGE_PREFIX.length);
				if (temporaryPatterns.some(pattern => shortKey.includes(pattern))) {
					keysToRemove.push(key);
				}
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key));
	} catch (error) {
		console.warn('[storage] Error during cleanup:', error);
	}
};

// Nothing to set up on Tizen
export const initStorage = async () => {
	return true;
};

export const getFromStorage = async (key) => {
	try {
		const item = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
		if (item === null) return null;

		try {
			return JSON.parse(item);
		} catch (parseError) {
			return item;
		}
	} catch (error) {
		console.warn(`[storage] Error reading key "${key}":`, error);
		return null;
	}
};

export const saveToStorage = async (key, value) => {
	try {
		const serialized = JSON.stringify(value);
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
		return true;
	} catch (error) {
		console.error(`[storage] Error saving key "${key}":`, error);

		if (error.name === 'QuotaExceededError') {
			console.warn('[storage] Storage quota exceeded, attempting cleanup');
			await clearOldData();

			try {
				localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
				return true;
			} catch (retryError) {
				console.error('[storage] Still failed after cleanup:', retryError);
			}
		}
		return false;
	}
};

export const removeFromStorage = async (key) => {
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
		return true;
	} catch (error) {
		console.warn(`[storage] Error removing key "${key}":`, error);
		return false;
	}
};

export const clearAllStorage = async () => {
	try {
		const keysToRemove = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(STORAGE_PREFIX)) {
				keysToRemove.push(key);
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key));
		return true;
	} catch (error) {
		console.error('[storage] Error clearing storage:', error);
		return false;
	}
};
