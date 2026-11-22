import $L from '@enact/i18n/$L';

import {stripMarkdown} from '../services/serverMessages';
import {uiLocale} from './uiLocale';

// TMDB only reviews films and shows, and the plugin finds them by the TMDB id.
export const reviewsQuery = (item) => {
	const tmdbId = item?.ProviderIds?.Tmdb;
	if (!tmdbId) return null;
	if (item.Type === 'Movie') return {tmdbId: String(tmdbId), type: 'movie'};
	if (item.Type === 'Series') return {tmdbId: String(tmdbId), type: 'tv'};
	return null;
};

const isWebUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

// Keeps what a card and the dialog draw. The link to the review on TMDB is left behind, since a
// TV has nowhere to open it.
export const parseReviews = (payload) => {
	if (!payload || payload.success !== true || !Array.isArray(payload.reviews)) return null;
	return payload.reviews
		.filter((review) => review && typeof review.content === 'string' && review.content.trim())
		.map((review, index) => ({
			id: String(review.id || index),
			author: typeof review.author === 'string' ? review.author.trim() : '',
			rating: typeof review.rating === 'number' && isFinite(review.rating) ? review.rating : null,
			content: review.content,
			createdAt: review.createdAt || null,
			avatarUrl: isWebUrl(review.avatarUrl) ? review.avatarUrl : null
		}));
};

// The interface language as a tag TMDB knows. A viewer who follows the device's language syncs as
// "system", which Smart-TV boots with unchanged, so the TV's own language is used instead.
export const reviewsLanguage = (tag = uiLocale()) =>
	(/^[a-z]{2,3}(-|$)/i.test(tag || '') ? tag : (window.navigator?.language || 'en-US'));

// One answer per title and language for the session. A failed lookup isn't kept, so the next
// visit asks again.
const cache = new Map();

export const loadTmdbReviews = (api, {tmdbId, type}, language = reviewsLanguage()) => {
	const key = `${type}:${tmdbId}:${language}`;
	if (cache.has(key)) return Promise.resolve(cache.get(key));
	if (!api?.getTmdbReviews) return Promise.resolve([]);
	return Promise.resolve()
		.then(() => api.getTmdbReviews(tmdbId, type, language))
		.then((payload) => {
			const reviews = parseReviews(payload);
			if (!reviews) return [];
			cache.set(key, reviews);
			return reviews;
		})
		.catch(() => []);
};

export const clearTmdbReviewsCache = () => cache.clear();

export const reviewPreview = (content) => stripMarkdown(content).replace(/\s*\n\s*/g, ' ');

export const reviewRatingLabel = (rating) => {
	if (typeof rating !== 'number' || !isFinite(rating)) return '';
	return $L('{rating} / 10').replace('{rating}', String(Math.round(rating * 10) / 10));
};

export const reviewDateLabel = (iso) => {
	const date = iso ? new Date(iso) : null;
	if (!date || isNaN(date.getTime())) return '';
	return date.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'short', day: 'numeric'});
};

export const reviewMeta = (review) => [reviewRatingLabel(review.rating), reviewDateLabel(review.createdAt)].filter(Boolean).join(' · ');

export const reviewInitial = (author) => (author || '?').trim().charAt(0).toUpperCase() || '?';
