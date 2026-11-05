// The artwork behind every wizard preview.
//
// A small pull of random library items, shaped down to what the previews
// draw: names, artwork urls and a line of metadata. Held in module state so
// every step reads the same items and nothing loads twice.

import {getImageUrl, getBackdropId, getPrimaryImageId, getLogoUrl} from '../../utils/helpers';
import * as jellyfinApi from '../../services/jellyfinApi';

let items = [];
let loading = false;
const listeners = [];

const notify = () => {
	for (const listener of listeners) listener(items);
};

export const getPreviewItems = () => items;

export const subscribePreviewItems = (listener) => {
	listeners.push(listener);
	return () => {
		const index = listeners.indexOf(listener);
		if (index !== -1) listeners.splice(index, 1);
	};
};

const ticksToMinutes = (ticks) => {
	if (!ticks) return null;
	return Math.round(ticks / 600000000);
};

const adaptItem = (item) => {
	const serverUrl = jellyfinApi.getServerUrl();
	const backdropId = getBackdropId(item);
	const posterId = getPrimaryImageId(item);
	return {
		title: item.Name || '',
		type: item.Type || null,
		year: item.ProductionYear || null,
		officialRating: item.OfficialRating || null,
		runtimeMinutes: ticksToMinutes(item.RunTimeTicks),
		genres: Array.isArray(item.Genres) ? item.Genres : [],
		overview: item.Overview || null,
		communityRating: typeof item.CommunityRating === 'number' ? item.CommunityRating : null,
		posterUrl: posterId ? getImageUrl(serverUrl, posterId, 'Primary', {maxWidth: 400, quality: 85}) : null,
		backdropUrl: backdropId ? getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 85}) : null,
		logoUrl: getLogoUrl(serverUrl, item, {maxWidth: 800, quality: 90})
	};
};

// The wizard runs seconds after the first sign in, which is exactly when a
// first fetch can fail or come back empty, so a single early miss retries
// with a growing delay rather than leaving every preview on the drawn stand
// ins for the whole wizard.
const applyFetched = (result) => {
	const fetched = (result?.Items || []).filter((item) => item.Type !== 'BoxSet');
	if (fetched.length === 0) return false;
	items = fetched.map(adaptItem);
	notify();
	return true;
};

export const ensurePreviewItemsLoaded = async (api) => {
	if (items.length > 0 || loading || !api) return;
	loading = true;
	try {
		const attempts = 4;
		let delay = 2000;
		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				if (applyFetched(await api.getRandomItems('both', 10))) return;
			} catch (e) {
				console.warn('[SetupWizard] Preview fetch failed:', e?.message || e);
			}
			if (attempt < attempts - 1) {
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay *= 2;
			}
		}
		// The pull above only takes titles that carry a backdrop, so a library
		// without one has been answering the same empty list every time. Ask
		// again without that requirement before giving up on real artwork.
		try {
			if (typeof api.getPreviewItems === 'function') {
				applyFetched(await api.getPreviewItems(10));
			}
		} catch (e) {
			console.warn('[SetupWizard] Preview fallback fetch failed:', e?.message || e);
		}
	} finally {
		loading = false;
	}
};
