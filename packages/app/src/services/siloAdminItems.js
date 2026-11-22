// An admin's item tools on Silo: Identify, Refresh Metadata and Change Artwork, through Silo's admin item routes (Silo
// checks the login may change the item), answered in Jellyfin's shapes. Ported from Moonfin-Core's SiloAdminItemsApi.
//
// Silo has no route to delete an item's artwork, only to pick another.

// Silo's artwork kinds by Jellyfin's image types.
export const SILO_ARTWORK_TYPES = {Primary: 'poster', Backdrop: 'backdrop', Logo: 'logo'};
// Provider id names, Silo's key to Jellyfin's.
const PROVIDER_KEYS = {tmdb: 'Tmdb', imdb: 'Imdb', tvdb: 'Tvdb'};
const PROVIDER_NAMES = {tmdb: 'TheMovieDb', imdb: 'IMDb', tvdb: 'TheTVDB'};
const providerName = (key) => PROVIDER_NAMES[key] || String(key || '');
// A search result keeps Silo's own provider ids, which applying the match sends back as they came.
export const SILO_PROVIDER_IDS_KEY = 'SiloProviderIds';
const CHOICES_MS = 2 * 60 * 1000;

const isLink = (url) => typeof url === 'string' && /^https?:\/\//.test(url);

/** Silo's match candidates as Jellyfin's RemoteSearchResult. */
export const siloMatchCandidates = (answer) => (answer?.candidates || [])
	.filter((c) => c && c.provider_ids && typeof c.provider_ids === 'object')
	.map((c) => ({
		...(c.title != null ? {Name: c.title} : null),
		...(c.year != null ? {ProductionYear: c.year} : null),
		...(c.overview != null ? {Overview: c.overview} : null),
		...(c.image_url != null ? {ImageUrl: c.image_url} : null),
		SearchProviderName: (c.sources || []).map(providerName).join(', '),
		ProviderIds: Object.fromEntries(Object.entries(c.provider_ids).map(([key, value]) => [PROVIDER_KEYS[key] || key, String(value)])),
		[SILO_PROVIDER_IDS_KEY]: c.provider_ids
	}));

/** One kind of artwork from Silo's choices, as Jellyfin's RemoteImageInfo. Choices Silo previews inline have no link. */
export const siloImageChoices = (choices, imageType) => {
	const type = SILO_ARTWORK_TYPES[imageType];
	return type ? choices.filter((c) => c.type === type && isLink(c.url)).map((c) => ({
		Url: c.url,
		ProviderName: providerName(c.provider_id),
		Type: imageType,
		...(Number.isFinite(c.width) ? {Width: Math.trunc(c.width)} : null),
		...(Number.isFinite(c.height) ? {Height: Math.trunc(c.height)} : null),
		...(c.rating != null ? {CommunityRating: c.rating} : null),
		...(typeof c.language === 'string' && c.language ? {Language: c.language} : null)
	})) : [];
};

/** `call(path, options)` is a Silo request as the signed-in profile; `forget()` drops cached catalog reads. */
export const createSiloAdminItems = ({call, forget}) => {
	const path = (itemId) => `/api/v2/admin/items/${encodeURIComponent(itemId)}`;
	// Each read asks the providers again, and the artwork screen reads one list per kind, so choices are kept a while.
	const kept = {};
	const readChoices = async (itemId) => {
		const choices = [];
		let cursor = null;
		for (let page = 0; page < 5; page++) {
			const answer = await call(`${path(itemId)}/images`, {query: {limit: 200, cursor}});
			choices.push(...(answer?.items || []).filter((c) => c && typeof c === 'object'));
			cursor = answer?.page?.next_cursor || null;
			if (!cursor) break;
		}
		return choices;
	};
	const choicesOf = (itemId, refresh = false) => {
		const entry = kept[itemId];
		if (!refresh && entry && Date.now() - entry.at < CHOICES_MS) return entry.promise;
		const promise = readChoices(itemId);
		kept[itemId] = {at: Date.now(), promise};
		promise.catch(() => {
			if (kept[itemId]?.promise === promise) delete kept[itemId];
		});
		return promise;
	};
	const changed = (itemId) => {
		delete kept[itemId];
		forget();
	};

	return {
		// Queues a job. Replacing all metadata is Silo's complete refresh, anything else quick.
		refreshItem: (itemId, {replaceAllMetadata} = {}) => call(`${path(itemId)}/refresh-metadata`,
			{method: 'POST', body: {mode: replaceAllMetadata ? 'complete' : 'quick'}}),

		// By title and year, or by provider id, for the item `searchInfo.ItemId`. Silo's search takes no item type.
		searchRemote: async (itemType, searchInfo = {}) => {
			if (!searchInfo.ItemId) throw new Error('Silo matches a known item: ItemId is needed');
			const ids = Object.fromEntries(Object.entries(searchInfo.ProviderIds || {}).map(([key, value]) => [key.toLowerCase(), String(value).trim()]));
			const title = String(searchInfo.Name || '').trim();
			const body = {
				...(title ? {title} : null),
				...(Number.isFinite(searchInfo.Year) ? {year: Math.trunc(searchInfo.Year)} : null)
			};
			Object.keys(PROVIDER_KEYS).forEach((key) => {
				if (ids[key]) body[`${key}_id`] = ids[key];
			});
			return siloMatchCandidates(await call(`${path(searchInfo.ItemId)}/match/search`, {method: 'POST', body}));
		},

		// Matching an unmatched item gives it a new id (local-... becomes movie-tmdb-812), which is answered so the page can
		// reopen under it; null when the id stays.
		applyRemoteSearchResult: async (itemId, result) => {
			const answer = await call(`${path(itemId)}/match/apply`, {method: 'POST', body: {provider_ids: result[SILO_PROVIDER_IDS_KEY]}});
			changed(itemId);
			const id = answer?.content_id;
			return typeof id === 'string' && id && id !== itemId ? id : null;
		},

		getRemoteImages: async (itemId, imageType) => {
			const images = siloImageChoices(await choicesOf(itemId), imageType);
			return {Images: images, TotalRecordCount: images.length};
		},

		// The choice whose preview link was picked, found again from that link.
		downloadRemoteImage: async (itemId, imageType, imageUrl) => {
			const type = SILO_ARTWORK_TYPES[imageType];
			if (!type) throw new Error(`Silo doesn't keep ${imageType} artwork`);
			const find = (choices) => choices.find((c) => c.url === imageUrl);
			const choice = find(await choicesOf(itemId)) || find(await choicesOf(itemId, true));
			if (!choice) throw new Error('That artwork is no longer one of the choices');
			await call(`${path(itemId)}/images/apply`, {method: 'POST', body: {
				original_url: choice.original_url, type, ...(choice.provider_id != null ? {provider_id: choice.provider_id} : null)
			}});
			changed(itemId);
		},

		deleteItemImage: () => Promise.reject(Object.assign(new Error("Silo can't delete artwork, only pick another"), {status: 501}))
	};
};
