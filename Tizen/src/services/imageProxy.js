/**
 * Image Proxy Service for Tizen
 *
 * On Tizen, packaged apps (.wgt) bypass CORS restrictions,
 * so we can fetch images directly without a proxy.
 * This module maintains the same API for compatibility.
 */
/* global FileReader */

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
				...options,
				// Tizen apps bypass CORS, but we still set mode for consistency
				mode: 'cors',
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
 * Fetch image as base64 data URL (for cases where blob URL won't work)
 * @param {string} url - The image URL to fetch
 * @returns {Promise<string|null>} - Data URL or null on failure
 */
export const proxyImageAsDataUrl = async (url) => {
	if (!url) return null;

	try {
		const response = await fetch(url);
		if (!response.ok) return null;

		const blob = await response.blob();

		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch (error) {
		console.warn(`Image data URL error for ${url}:`, error);
		return null;
	}
};

/**
 * Preload multiple images for faster display
 * @param {string[]} urls - Array of image URLs to preload
 * @returns {Promise<void>}
 */
export const preloadImages = async (urls) => {
	const validUrls = urls.filter(url => url && !imageCache.has(url));
	await Promise.all(validUrls.map(url => proxyImage(url)));
};

/**
 * Clear the image cache and revoke all blob URLs
 */
export const clearImageCache = () => {
	// Revoke all blob URLs to free memory
	for (const blobUrl of imageCache.values()) {
		URL.revokeObjectURL(blobUrl);
	}
	imageCache.clear();
	pendingRequests.clear();
};

/**
 * Remove a specific image from cache
 * @param {string} url - The original image URL
 */
export const removeFromCache = (url) => {
	if (imageCache.has(url)) {
		URL.revokeObjectURL(imageCache.get(url));
		imageCache.delete(url);
	}
};

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export const getCacheStats = () => ({
	size: imageCache.size,
	maxSize: MAX_CACHE_SIZE,
	pendingRequests: pendingRequests.size
});

export default {
	proxyImage,
	proxyImageAsDataUrl,
	preloadImages,
	clearImageCache,
	removeFromCache,
	getCacheStats
};
