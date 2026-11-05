// Two layers of cache sit behind the home screen. One lives in memory for as long as the app
// is running, so coming back to Browse is instant. The other is written to storage so a cold
// start has something to draw before the first request comes back.

import {getFromStorage, removeFromStorage, saveToStorage} from '../../services/storage';

// Bumped whenever a card needs a field the cache used to drop, so rows saved under the old shape
// are fetched again rather than restored with gaps.
const STORAGE_KEY_BROWSE = 'browse_cache_v5';
const STALE_BROWSE_KEYS = ['browse_cache_v4'];

export const CACHE_TTL_VOLATILE = 5 * 60 * 1000;
export const CACHE_TTL_LIBRARIES = 30 * 60 * 1000;
export const VOLATILE_REFRESH_COOLDOWN_MS = 60 * 1000;
const CACHE_SAVE_DEBOUNCE_MS = 3000;

// Read and written across mounts on purpose, so leaving Browse and coming back doesn't
// refetch everything.
export const memoryCache = {
	rowData: null,
	libraries: null,
	featuredItems: null,
	timestamp: null,
	// Which shape of the recent rows these were built for, since a cache of per
	// library rows says nothing about the merged ones and the other way round.
	rowConfigKey: null,
	// The media bar settings the shown items were drawn for; a set drawn for other settings replaces them.
	featuredConfigKey: null,
	// Whose rows these are. Kept so a fresh mount can tell an account change, which has to
	// throw the rows away, apart from an ordinary return to the home screen, which is the
	// whole reason the cache is here. Emptying the rows leaves it alone, since a refresh
	// still belongs to the same account.
	owner: null,
	// Sections known to come back empty, because their last load did or the first load for the
	// account found nothing stored for them. Their placeholders stay hidden while they load
	// again, so an empty section doesn't flash its title on every load. A refresh keeps them.
	emptySections: new Set(),
	emptySectionsSeeded: false
};

// A refresh keeps the media bar unless the caller asks for it, or an account change clears everything.
export const clearMemoryCache = ({keepFeatured = false} = {}) => {
	memoryCache.rowData = null;
	memoryCache.libraries = null;
	memoryCache.timestamp = null;
	memoryCache.rowConfigKey = null;
	if (keepFeatured) return;
	memoryCache.featuredItems = null;
	memoryCache.featuredConfigKey = null;
};

export const isCacheValid = (timestamp, ttl) => {
	if (!timestamp) return false;
	return Date.now() - timestamp < ttl;
};

// Stored rows older than this say nothing about which sections are empty now.
const STORED_ROWS_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

const fillsSection = (row, id) => row.items?.length > 0 && (row.id === id ||
	(id === 'latest-media' && row.isLatestRow) || (id === 'recently-released' && row.isRecentlyReleasedRow));

export const resetEmptySections = () => {
	memoryCache.emptySections = new Set();
	memoryCache.emptySectionsSeeded = false;
};

// Called only for a load that went through, since a failed one says nothing about the section.
export const settleSections = (ids, rows) => ids.forEach((id) => {
	if ((rows || []).some((row) => fillsSection(row, id))) memoryCache.emptySections.delete(id);
	else memoryCache.emptySections.add(id);
});

// The first load for an account has no loads of its own to go on, so a section the stored rows
// hold nothing for counts as empty. On Now is left out, since its rows only hold for the minutes
// they describe.
export const seedEmptySections = (ids, stored) => {
	if (memoryCache.emptySectionsSeeded) return;
	memoryCache.emptySectionsSeeded = true;
	if (!stored?.rowData?.length || !isCacheValid(stored.timestamp, STORED_ROWS_MAX_AGE)) return;
	ids.forEach((id) => {
		if (id !== 'onnow' && !stored.rowData.some((row) => fillsSection(row, id))) memoryCache.emptySections.add(id);
	});
};

// Genre tiles borrow a library item's artwork. Keeping only the fields the card reads stops
// the cache growing for no gain on memory tight TVs.
const stripRepresentativeForCache = (rep) => (rep ? {
	Id: rep.Id,
	ImageTags: rep.ImageTags,
	BackdropImageTags: rep.BackdropImageTags
} : undefined);

const stripItemForCache = (item) => ({
	Id: item.Id,
	Name: item.Name,
	Type: item.Type,
	ImageTags: item.ImageTags,
	// Everything below is needed to render a card. Anything left out is quietly gone on
	// the next load, because a warm cache skips the fetch that would rebuild it.
	BackdropImageTags: item.BackdropImageTags,
	ProviderIds: item.ProviderIds,
	UserRating: item.UserRating,
	OfficialRating: item.OfficialRating,
	_representative: stripRepresentativeForCache(item._representative),
	_external: item._external,
	_externalPosterUrl: item._externalPosterUrl,
	_externalBackdropUrl: item._externalBackdropUrl,
	_resolvedFromExternal: item._resolvedFromExternal,
	_seerr: item._seerr,
	_seerrType: item._seerrType,
	_seerrMediaType: item._seerrMediaType,
	_seerrRaw: item._seerrRaw,
	mediaInfo: item.mediaInfo,
	SeriesName: item.SeriesName,
	SeriesId: item.SeriesId,
	ParentIndexNumber: item.ParentIndexNumber,
	IndexNumber: item.IndexNumber,
	ParentThumbItemId: item.ParentThumbItemId,
	ParentBackdropItemId: item.ParentBackdropItemId,
	ParentBackdropImageTags: item.ParentBackdropImageTags,
	CommunityRating: item.CommunityRating,
	Genres: item.Genres,
	GenreItems: item.GenreItems,
	Overview: item.Overview,
	ProductionYear: item.ProductionYear,
	RunTimeTicks: item.RunTimeTicks,
	AlbumId: item.AlbumId,
	AlbumPrimaryImageTag: item.AlbumPrimaryImageTag,
	AlbumArtist: item.AlbumArtist,
	CollectionType: item.CollectionType,
	UserData: item.UserData ? {
		PlayedPercentage: item.UserData.PlayedPercentage,
		Played: item.UserData.Played,
		LastPlayedDate: item.UserData.LastPlayedDate,
		// How far in the viewer got is what decides whether a title offers Resume, and the
		// detail screen opens on the row it was reached from, so dropping this would have it
		// open without one and grow a Resume a moment later.
		PlaybackPositionTicks: item.UserData.PlaybackPositionTicks
	} : undefined,
	_serverUrl: item._serverUrl,
	_serverType: item._serverType,
	_serverName: item._serverName,
	_serverAccessToken: item._serverAccessToken,
	_serverUserId: item._serverUserId,
	_serverId: item._serverId,
	isLibraryTile: item.isLibraryTile,
	isRecordingsShortcut: item.isRecordingsShortcut
});

// Enough of the rows to tell whether a write is worth making. Resume and Next Up also fold in
// how far through each item is, since that is the part that moves while nothing else does.
const cacheSignature = (rowData) => rowData.map((row) => {
	let progressSum = 0;
	if (row.id === 'resume' || row.id === 'nextup') {
		row.items.forEach((item) => {
			progressSum += item.UserData?.PlayedPercentage || 0;
		});
	}
	return `${row.id}:${row.items.length}:${row.items[0]?.Id || ''}:${Math.round(progressSum)}`;
}).join('|');

let saveTimer = null;
let lastSignature = null;

export const cancelPendingCacheSave = () => {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
};

// Rows settle in bursts as each loader finishes, so the write waits for them to stop rather
// than running once per burst.
export const saveBrowseCache = (rowData, libraries, featuredItems, {serverUrl, userId}) => {
	const signature = cacheSignature(rowData);
	if (signature === lastSignature) return;
	// Read now, since a draw that lands before the write runs would otherwise save its key with these items.
	const featuredConfigKey = memoryCache.featuredConfigKey;

	cancelPendingCacheSave();
	saveTimer = setTimeout(async () => {
		saveTimer = null;
		try {
			await saveToStorage(STORAGE_KEY_BROWSE, {
				// A row's reader can't be stored, so a row read back from storage can't page until
				// Home loads it again.
				rowData: rowData.map((row) => ({...row, readHead: undefined, hasMore: false, items: row.items.map(stripItemForCache)})),
				libraries,
				featuredItems,
				timestamp: Date.now(),
				serverUrl,
				userId,
				rowConfigKey: memoryCache.rowConfigKey,
				featuredConfigKey
			});
			lastSignature = signature;
		} catch (e) {
			console.warn('[Browse] Failed to save cache:', e);
		}
	}, CACHE_SAVE_DEBOUNCE_MS);
};

// A change the rows depend on was made somewhere else, so the stored rows cant be drawn again.
export const clearBrowseCache = () => {
	cancelPendingCacheSave();
	lastSignature = null;
	return removeFromStorage(STORAGE_KEY_BROWSE).catch(() => {});
};

// A cache written for a different server or user says nothing about this one.
export const loadBrowseCache = async (serverUrl, userId) => {
	STALE_BROWSE_KEYS.forEach((key) => {
		removeFromStorage(key).catch(() => {});
	});
	try {
		const cached = await getFromStorage(STORAGE_KEY_BROWSE);
		if (cached && cached.serverUrl === serverUrl && cached.userId === userId) {
			return cached;
		}
	} catch (e) {
		console.warn('[Browse] Failed to load cache:', e);
	}
	return null;
};
