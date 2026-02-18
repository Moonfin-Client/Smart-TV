/**
 * Storage Service for Tizen
 *
 * Uses localStorage for persistent storage on Tizen TVs.
 * Tizen web apps have access to standard Web Storage APIs.
 */

const STORAGE_PREFIX = 'moonfin_';

/**
 * Clear old/temporary data to free up space
 * @returns {Promise<void>}
 */
const clearOldData = async () => {
	// Clear any cached/temporary data patterns
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
		console.log(`[storage] Cleared ${keysToRemove.length} temporary items`);
	} catch (error) {
		console.warn('[storage] Error during cleanup:', error);
	}
};

/**
 * Initialize storage (no-op for Tizen, kept for API compatibility)
 * @returns {Promise<boolean>} Always resolves to true
 */
export const initStorage = async () => {
	return true;
};

/**
 * Get a value from storage
 * @param {string} key - The key to retrieve
 * @returns {Promise<any|null>} - The stored value or null
 */
export const getFromStorage = async (key) => {
	try {
		const item = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
		if (item === null) return null;

		try {
			return JSON.parse(item);
		} catch (parseError) {
			// If it's not valid JSON, return as string
			return item;
		}
	} catch (error) {
		console.warn(`[storage] Error reading key "${key}":`, error);
		return null;
	}
};

/**
 * Save a value to storage
 * @param {string} key - The key to store under
 * @param {any} value - The value to store (will be JSON serialized)
 * @returns {Promise<boolean>} - True if successful
 */
export const saveToStorage = async (key, value) => {
	try {
		const serialized = JSON.stringify(value);
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
		return true;
	} catch (error) {
		console.error(`[storage] Error saving key "${key}":`, error);

		// If we hit quota, try to clear old data
		if (error.name === 'QuotaExceededError') {
			console.warn('[storage] Storage quota exceeded, attempting cleanup');
			await clearOldData();

			// Try again after cleanup
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

/**
 * Remove a value from storage
 * @param {string} key - The key to remove
 * @returns {Promise<boolean>} - True if successful
 */
export const removeFromStorage = async (key) => {
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
		return true;
	} catch (error) {
		console.warn(`[storage] Error removing key "${key}":`, error);
		return false;
	}
};

/**
 * Clear all Moonfin data from storage
 * @returns {Promise<boolean>} - True if successful
 */
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

/**
 * Get all keys in storage
 * @returns {Promise<string[]>} - Array of keys (without prefix)
 */
export const getAllKeys = async () => {
	const keys = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(STORAGE_PREFIX)) {
				keys.push(key.substring(STORAGE_PREFIX.length));
			}
		}
	} catch (error) {
		console.warn('[storage] Error getting keys:', error);
	}
	return keys;
};

/**
 * Get storage usage information
 * @returns {Promise<{used: number, keys: number}>}
 */
export const getStorageInfo = async () => {
	let totalSize = 0;
	let keyCount = 0;

	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(STORAGE_PREFIX)) {
				const value = localStorage.getItem(key);
				totalSize += key.length + (value?.length || 0);
				keyCount++;
			}
		}
	} catch (error) {
		console.warn('[storage] Error calculating storage info:', error);
	}

	return {
		used: totalSize,
		keys: keyCount
	};
};

export default {
	initStorage,
	getFromStorage,
	saveToStorage,
	removeFromStorage,
	clearAllStorage,
	getAllKeys,
	getStorageInfo
};
