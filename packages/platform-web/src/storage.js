// The hosted page shares moonfin.io's origin with the Flutter client at /web, so
// clearing this app's data has to leave that client's keys alone.
import {getAllKeys as allPrefixedKeys, removeFromStorage} from '@moonfin/platform-vega/storage';

export {initStorage, getFromStorage, saveToStorage, removeFromStorage} from '@moonfin/platform-vega/storage';

// What moonfin.io/web keeps under the same prefix. A key it adds needs adding here too.
const WEB_CLIENT_KEYS = ['bootstrap_credentials', 'home_rows_cache'];

export const getAllKeys = async () => (await allPrefixedKeys()).filter((key) => !WEB_CLIENT_KEYS.includes(key));

export const clearAllStorage = async () => {
	try {
		await Promise.all((await getAllKeys()).map(removeFromStorage));
		return true;
	} catch (error) {
		console.error('[storage] Error clearing storage:', error);
		return false;
	}
};
