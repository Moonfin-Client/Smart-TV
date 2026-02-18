/**
 * Image Proxy Service for webOS
 *
 * Packaged apps (.ipk) bypass CORS restrictions,
 * so we can fetch images directly without a Luna service proxy.
 * This module maintains the same API for compatibility.
 */

const imageCache = new Map();
const pendingRequests = new Map();

// Maximum cache size (number of images)
const MAX_CACHE_SIZE = 100;

/**
 * Fetch and cache an image, returning a blob URL
 * @param {string} url - The image URL to fetch
 * @param {Object} options - Optional fetch options (headers, etc.)
 * @returns {Promise<string|null>} - Blob URL or null on failure
 */
export const proxyImage = async (url, options = {}) => {
	if (!url) return null;

	// Return cached version if available
	if (imageCache.has(url)) {
		return imageCache.get(url);
	}

	// Return pending request if one exists
	if (pendingRequests.has(url)) {
		return pendingRequests.get(url);
	}

	const promise = (async () => {
		try {
			const response = await fetch(url, {
				method: 'GET',
				...options
			});

			if (!response.ok) {
				console.warn(`Image fetch failed: ${response.status} for ${url}`);
				pendingRequests.delete(url);
				return null;
			}

			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);

			// Manage cache size - remove oldest entries if needed
			if (imageCache.size >= MAX_CACHE_SIZE) {
				const oldestKey = imageCache.keys().next().value;
				const oldBlobUrl = imageCache.get(oldestKey);
				URL.revokeObjectURL(oldBlobUrl);
				imageCache.delete(oldestKey);
			}

			imageCache.set(url, blobUrl);
			pendingRequests.delete(url);
			return blobUrl;
		} catch (error) {
			console.warn(`Image proxy error for ${url}:`, error);
			pendingRequests.delete(url);
			return null;
		}
	})();

	pendingRequests.set(url, promise);
	return promise;
};

/**
 * Clear the image cache and revoke all blob URLs
 */
export const clearImageCache = () => {
	for (const blobUrl of imageCache.values()) {
		URL.revokeObjectURL(blobUrl);
	}
	imageCache.clear();
	pendingRequests.clear();
	console.log('[imageProxy] Cache cleared');
};

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export const getCacheStats = () => ({
	size: imageCache.size,
	pending: pendingRequests.size
});

export default {
	proxyImage,
	clearImageCache,
	getCacheStats
};
