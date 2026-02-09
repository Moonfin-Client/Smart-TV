/**
 * useProxiedImage hook for Tizen
 *
 * On Tizen, packaged apps bypass CORS so we can fetch images directly.
 * This hook fetches images and returns blob URLs for display.
 */

import {useState, useEffect, useRef} from 'react';

const imageCache = new Map();
const MAX_CACHE_SIZE = 100;

// AbortController polyfill check for Tizen 4.0 (Chromium 56-63)
const hasAbortController = typeof AbortController !== 'undefined';

/**
 * Hook to fetch and proxy an image URL
 * @param {string} originalUrl - The original image URL
 * @returns {{imageUrl: string|null, loading: boolean}}
 */
export const useProxiedImage = (originalUrl) => {
	const [imageUrl, setImageUrl] = useState(originalUrl);
	const [loading, setLoading] = useState(true);
	const abortControllerRef = useRef(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		isMountedRef.current = true;
		setLoading(true);

		// No URL provided
		if (!originalUrl) {
			setImageUrl(null);
			setLoading(false);
			return;
		}

		// Return from cache if available
		if (imageCache.has(originalUrl)) {
			setImageUrl(imageCache.get(originalUrl));
			setLoading(false);
			return;
		}

		// For non-CORS affected URLs (same origin), use directly
		if (!originalUrl.includes('image.tmdb.org') && !originalUrl.includes('themoviedb.org')) {
			setImageUrl(originalUrl);
			setLoading(false);
			return;
		}

		// Abort any previous request (if AbortController is available)
		if (hasAbortController && abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		if (hasAbortController) {
			abortControllerRef.current = new AbortController();
		}

		// Fetch and create blob URL
		const fetchImage = async () => {
			try {
				const fetchOptions = hasAbortController
					? { signal: abortControllerRef.current.signal }
					: {};

				const response = await fetch(originalUrl, fetchOptions);

				if (!response.ok) {
					// Fall back to original URL on error
					if (isMountedRef.current) {
						setImageUrl(originalUrl);
						setLoading(false);
					}
					return;
				}

				const blob = await response.blob();
				const blobUrl = URL.createObjectURL(blob);

				// Manage cache size
				if (imageCache.size >= MAX_CACHE_SIZE) {
					const oldestKey = imageCache.keys().next().value;
					const oldBlobUrl = imageCache.get(oldestKey);
					URL.revokeObjectURL(oldBlobUrl);
					imageCache.delete(oldestKey);
				}

				imageCache.set(originalUrl, blobUrl);

				if (isMountedRef.current) {
					setImageUrl(blobUrl);
					setLoading(false);
				}
			} catch (error) {
				if (error.name === 'AbortError') {
					return; // Request was aborted, ignore
				}
				console.warn('Image fetch error:', error);
				// Fall back to original URL on error
				if (isMountedRef.current) {
					setImageUrl(originalUrl);
					setLoading(false);
				}
			}
		};

		fetchImage();

		return () => {
			isMountedRef.current = false;
			if (hasAbortController && abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, [originalUrl]);

	return {imageUrl, loading};
};

/**
 * Clear the image cache (useful when memory is low)
 */
export const clearImageProxyCache = () => {
	for (const blobUrl of imageCache.values()) {
		URL.revokeObjectURL(blobUrl);
	}
	imageCache.clear();
};

export default useProxiedImage;
