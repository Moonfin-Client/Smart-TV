import * as connectionPool from './connectionPool';

const SHUFFLE_FIELDS = [
	'PrimaryImageAspectRatio',
	'Overview',
	'Genres',
	'ProviderIds',
	'RunTimeTicks',
	'ProductionYear',
	'CommunityRating',
	'CriticRating',
	'OfficialRating',
	'ImageTags',
	'BackdropImageTags',
	'ParentBackdropImageTags',
	'ParentBackdropItemId',
	'ParentThumbItemId',
	'SeriesPrimaryImageTag',
	'SeriesName',
	'ParentIndexNumber',
	'IndexNumber',
	'UserData',
	'AlbumArtist',
	'AlbumId',
	'AlbumPrimaryImageTag'
].join(',');

const EXCLUDED_LIBRARY_TYPES = new Set(['books', 'playlists', 'livetv', 'boxsets']);
const EXCLUDED_ITEM_TYPES = new Set(['BoxSet', 'CollectionFolder', 'Collection']);

const includeTypesFromContentType = (contentType) => {
	switch (contentType) {
		case 'movies':
			return 'Movie';
		case 'tv':
			return 'Series';
		default:
			return 'Movie,Series';
	}
};

const EXCLUDED_LIBRARY_NAMES = new Set(['folders', 'recordings']);
// A mixed content library holds movies and shows together, and the server says so by sending
// no collection type.
const MIXED_LIBRARY_TYPES = new Set(['', 'mixed', 'unknown']);

const supportsLibraryForContent = (library, contentType) => {
	const collectionType = String(library?.CollectionType || '').trim().toLowerCase();
	if (EXCLUDED_LIBRARY_TYPES.has(collectionType)) return false;
	// Checked ahead of the mixed ones, since these come with no collection type either.
	if (EXCLUDED_LIBRARY_NAMES.has(String(library?.Name || '').trim().toLowerCase())) return false;
	if (MIXED_LIBRARY_TYPES.has(collectionType)) return true;
	if (contentType === 'movies') return collectionType === 'movies';
	if (contentType === 'tv') return collectionType === 'tvshows';
	return collectionType === 'movies' || collectionType === 'tvshows';
};

const normalizeItem = (item) => {
	if (!item || EXCLUDED_ITEM_TYPES.has(item.Type)) return null;
	return item;
};

const dedupeById = (items) => {
	const seen = new Set();
	return items.filter((item) => {
		if (!item?.Id || seen.has(item.Id)) return false;
		seen.add(item.Id);
		return true;
	});
};

export const fetchShuffleLibraries = async ({api, unifiedMode, contentType}) => {
	if (unifiedMode) {
		const allLibraries = await connectionPool.getLibrariesFromAllServers();
		return allLibraries
			.filter((lib) => supportsLibraryForContent(lib, contentType))
			.map((lib) => ({
				...lib,
				_shuffleLabel: `${lib.Name} (${lib._serverName})`
			}));
	}

	const librariesResult = await api.getLibraries();
	const libraries = librariesResult?.Items || [];
	return libraries.filter((lib) => supportsLibraryForContent(lib, contentType));
};

export const fetchShuffleGenres = async ({api, unifiedMode, contentType}) => {
	const includeTypes = includeTypesFromContentType(contentType);

	if (unifiedMode) {
		const genreItems = await connectionPool.executeAll(async (poolApi) => {
			const pooledGenres = await poolApi.getGenres(null, includeTypes, 'SortName', 'Ascending');
			return pooledGenres?.Items || [];
		}, {dedupe: 'Name'});

		return genreItems
			.map((item) => item?.Name)
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}

	const genresResult = await api.getGenres(null, includeTypes, 'SortName', 'Ascending');
	return (genresResult?.Items || [])
		.map((item) => item?.Name)
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
};

const fetchRandomItemsWithRetry = async (fn, maxAttempts = 3) => {
	let lastError;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			if (attempt === maxAttempts) throw err;
		}
	}
	throw lastError;
};

export const fetchRandomItems = async ({
	api,
	unifiedMode,
	contentType,
	limit = 5,
	libraryId = null,
	genreName = null
}) => {
	if (unifiedMode && !libraryId && !genreName) {
		const randomItems = await fetchRandomItemsWithRetry(async () => {
			return connectionPool.getRandomItemsFromAllServers(contentType, limit);
		});
		return dedupeById((randomItems || []).map(normalizeItem).filter(Boolean)).slice(0, limit);
	}

	const fetchScoped = async () => {
		if (unifiedMode) {
			const scopedItems = await connectionPool.executeAll(async (poolApi) => {
				const pooledRandomItems = await poolApi.getRandomItems(contentType, limit * 2, libraryId, genreName, SHUFFLE_FIELDS);
				return pooledRandomItems?.Items || [];
			}, {shuffle: true, limit: limit * 3, dedupe: 'Id'});
			return scopedItems;
		}

		const randomResult = await api.getRandomItems(contentType, limit * 2, libraryId, genreName, SHUFFLE_FIELDS);
		return randomResult?.Items || [];
	};

	const items = await fetchRandomItemsWithRetry(fetchScoped);
	return dedupeById((items || []).map(normalizeItem).filter(Boolean)).slice(0, limit);
};
