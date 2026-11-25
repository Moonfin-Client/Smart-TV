// Two layers of cache behind Home. One lives in memory for as long as the app is running, so
// coming back to Home is instant. The other is written to storage under the key earlier versions
// used, so a cold start has something to draw before the first request comes back. The storage
// goes through setCacheStorage() (services/storage.js, set by Home, swapped by the check).

import { isKidsMode } from '../utils/kidsMode.js'

// Bumped whenever a card needs a field the cache used to drop, so rows saved under the old shape
// are fetched again rather than restored with gaps.
const STORAGE_KEY_BROWSE = 'browse_cache_v6'
const STALE_BROWSE_KEYS = ['browse_cache_v4', 'browse_cache_v5']

export const CACHE_TTL_VOLATILE = 5 * 60 * 1000
export const CACHE_TTL_LIBRARIES = 30 * 60 * 1000
export const VOLATILE_REFRESH_COOLDOWN_MS = 60 * 1000
const CACHE_SAVE_DEBOUNCE_MS = 3000

// The settings that decide what the media bar holds. A setting missing here won't redraw the bar
// when it changes. Kids Mode leaves the outside lists out.
export const featuredConfigKey = (s = {}) =>
  JSON.stringify([
    false,
    s.useMoonfinPlugin === true,
    s.mediaBarSourceType || 'random',
    s.featuredContentType == null ? null : s.featuredContentType,
    s.featuredItemCount == null ? null : s.featuredItemCount,
    s.mediaBarNewReleaseDays == null ? null : s.mediaBarNewReleaseDays,
    s.mediaBarNewMovieDays == null ? null : s.mediaBarNewMovieDays,
    s.recentlyReleasedSeriesType == null ? null : s.recentlyReleasedSeriesType,
    s.hideWatchedInRecentRows === true,
    s.mediaBarLibraryIds || [],
    s.mediaBarCollectionIds || [],
    s.excludedGenres || [],
    s.mediaBarExternalLists || [],
    isKidsMode(s),
  ])

// The recent rows come out per library or merged by type, and Recently Released holds series,
// seasons or episodes, so rows stored for one of those mustn't answer for another. shortcut: no
// merged libraries term since Home reads one server, add one when Home reads merged libraries.
export const rowConfigKey = (s) => {
  const released = s.recentlyReleasedSeriesType
  return (
    (s.mergeRecentRowsByType ? 'merged-recent' : 'per-library') +
    (released && released !== 'series' ? `:${released}` : '') +
    (s.hideWatchedInRecentRows === true ? ':hide-watched' : '')
  )
}

// Rows that answer to a setting are rebuilt on every load rather than read back from either cache.
const MEDIA_SECTION_ROWS = ['audioartists', 'audioalbums', 'audioplaylists', 'resumeaudio', 'activerecordings', 'onnow']
export const hasDynamicRowConfig = (s) => {
  const enabled = (s.homeRows || []).filter((row) => row && row.enabled)
  return !!(
    s.displayFavoritesRows ||
    s.displayCollectionsRows ||
    s.displayGenresRows ||
    s.displayPlaylistsRows ||
    s.displayStudiosRows ||
    enabled.some((row) => row.id.indexOf('sinceyouwatched') === 0 || row.id === 'rewatch') ||
    enabled.some((row) => MEDIA_SECTION_ROWS.indexOf(row.id) >= 0)
  )
}

let storage = null
export const setCacheStorage = (impl) => {
  storage = impl
}

// Read and written across mounts on purpose, so leaving Home and coming back doesn't refetch
// everything.
export const memoryCache = {
  rowData: null,
  libraries: null,
  featuredItems: null,
  timestamp: null,
  // Which shape of the recent rows these were built for, since a cache of per library rows says
  // nothing about the merged ones and the other way round.
  rowConfigKey: null,
  // The media bar settings the shown items were drawn for. A set drawn for other settings replaces them.
  featuredConfigKey: null,
  // When Recently Added and Recently Released were last read. The timestamp above moves whenever
  // Continue Watching and Next Up are read again, which says nothing about these.
  recentAt: null,
  // Whose rows these are, so a fresh load can tell an account change, which has to throw the rows
  // away, from an ordinary return to Home. Emptying the rows leaves it alone.
  owner: null,
  // Sections known to come back empty, because their last load did or the first load for the
  // account found nothing stored for them. Their placeholders stay hidden while they load again,
  // so an empty section doesn't flash its title on every load. A refresh keeps them.
  emptySections: {},
  emptySectionsSeeded: false,
}

// A refresh keeps the media bar unless the caller asks for it, or an account change clears everything.
export const clearMemoryCache = ({ keepFeatured = false } = {}) => {
  memoryCache.rowData = null
  memoryCache.libraries = null
  memoryCache.timestamp = null
  memoryCache.rowConfigKey = null
  memoryCache.recentAt = null
  if (keepFeatured) return
  memoryCache.featuredItems = null
  memoryCache.featuredConfigKey = null
}

export const isCacheValid = (timestamp, ttl) => {
  if (!timestamp) return false
  return Date.now() - timestamp < ttl
}

// Stored rows older than this say nothing about which sections are empty now.
const STORED_ROWS_MAX_AGE = 3 * 24 * 60 * 60 * 1000

const fillsSection = (row, id) =>
  !!(row.items && row.items.length > 0) &&
  (row.id === id || (id === 'latest-media' && row.isLatestRow) || (id === 'recently-released' && row.isRecentlyReleasedRow))

export const isEmptySection = (id) => !!memoryCache.emptySections[id]

export const resetEmptySections = () => {
  memoryCache.emptySections = {}
  memoryCache.emptySectionsSeeded = false
}

// Called only for a load that went through, since a failed one says nothing about the section.
export const settleSections = (ids, rows) =>
  ids.forEach((id) => {
    if ((rows || []).some((row) => fillsSection(row, id))) delete memoryCache.emptySections[id]
    else memoryCache.emptySections[id] = true
  })

// The first load for an account has no loads of its own to go on, so a section the stored rows
// hold nothing for counts as empty. On Now is left out, since its rows only hold for the minutes
// they describe.
export const seedEmptySections = (ids, stored) => {
  if (memoryCache.emptySectionsSeeded) return
  memoryCache.emptySectionsSeeded = true
  if (!stored || !stored.rowData || !stored.rowData.length || !isCacheValid(stored.timestamp, STORED_ROWS_MAX_AGE)) return
  ids.forEach((id) => {
    if (id !== 'onnow' && !stored.rowData.some((row) => fillsSection(row, id))) memoryCache.emptySections[id] = true
  })
}

// Genre tiles borrow a library item's artwork. Keeping only the fields the card reads stops the
// cache growing for no gain on memory tight TVs.
const stripRepresentativeForCache = (rep) => (rep ? { Id: rep.Id, ImageTags: rep.ImageTags, BackdropImageTags: rep.BackdropImageTags } : undefined)

const stripItemForCache = (item) => ({
  Id: item.Id,
  Name: item.Name,
  Type: item.Type,
  ImageTags: item.ImageTags,
  // Everything below is needed to render a card. Anything left out is quietly gone on the next
  // load, because a warm cache skips the fetch that would rebuild it.
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
  // A poster row shows an episode's series poster, or its season's.
  SeriesPrimaryImageTag: item.SeriesPrimaryImageTag,
  ParentPrimaryImageItemId: item.ParentPrimaryImageItemId,
  ParentPrimaryImageTag: item.ParentPrimaryImageTag,
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
  UserData: item.UserData
    ? {
        PlayedPercentage: item.UserData.PlayedPercentage,
        Played: item.UserData.Played,
        LastPlayedDate: item.UserData.LastPlayedDate,
        // How far in the viewer got decides whether a title offers Resume, so dropping this would
        // have Details open without one and grow a Resume a moment later.
        PlaybackPositionTicks: item.UserData.PlaybackPositionTicks,
      }
    : undefined,
  _serverUrl: item._serverUrl,
  _serverType: item._serverType,
  _serverName: item._serverName,
  _serverAccessToken: item._serverAccessToken,
  _serverUserId: item._serverUserId,
  _serverId: item._serverId,
  isLibraryTile: item.isLibraryTile,
  isRecordingsShortcut: item.isRecordingsShortcut,
  // A merged library's tile and a card several servers hold, from merged libraries.
  _imageItemId: item._imageItemId,
  _mergedType: item._mergedType,
  _mergedCopies: Array.isArray(item._mergedCopies) ? item._mergedCopies.map(stripItemForCache) : undefined,
})

// Enough of the rows to tell whether a write is worth making. Resume and Next Up also fold in how
// far through each item is, since that's the part that moves while nothing else does.
const cacheSignature = (rowData) =>
  rowData
    .map((row) => {
      let progressSum = 0
      if (row.id === 'resume' || row.id === 'nextup') {
        row.items.forEach((item) => {
          progressSum += (item.UserData && item.UserData.PlayedPercentage) || 0
        })
      }
      return `${row.id}:${row.items.length}:${(row.items[0] && row.items[0].Id) || ''}:${Math.round(progressSum)}`
    })
    .join('|')

let saveTimer = null
let lastSignature = null

export const cancelPendingCacheSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

// Rows settle in bursts as each loader finishes, so the write waits for them to stop rather than
// running once per burst.
export const saveBrowseCache = (rowData, libraries, featuredItems, { serverUrl, userId }) => {
  const signature = cacheSignature(rowData)
  if (signature === lastSignature) return
  // Read now, since a draw or a load that lands before the write runs would otherwise save its key
  // with these items.
  const featuredConfigKey = memoryCache.featuredConfigKey
  const rowConfigKey = memoryCache.rowConfigKey

  cancelPendingCacheSave()
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      await storage.saveToStorage(STORAGE_KEY_BROWSE, {
        // A row's reader can't be stored, so a row read back from storage can't page until Home
        // loads it again.
        rowData: rowData.map((row) => ({ ...row, readHead: undefined, hasMore: false, items: row.items.map(stripItemForCache) })),
        libraries,
        featuredItems,
        timestamp: Date.now(),
        serverUrl,
        userId,
        rowConfigKey,
        recentAt: memoryCache.recentAt,
        featuredConfigKey,
      })
      lastSignature = signature
    } catch (e) {
      console.warn('[Browse] Failed to save cache:', e)
    }
  }, CACHE_SAVE_DEBOUNCE_MS)
}

// A change the rows depend on was made somewhere else, so the stored rows can't be drawn again.
export const clearBrowseCache = () => {
  cancelPendingCacheSave()
  lastSignature = null
  return Promise.resolve()
    .then(() => storage.removeFromStorage(STORAGE_KEY_BROWSE))
    .catch(() => {})
}

// A cache written for a different server or user says nothing about this one.
export const loadBrowseCache = async (serverUrl, userId) => {
  STALE_BROWSE_KEYS.forEach((key) => {
    Promise.resolve()
      .then(() => storage.removeFromStorage(key))
      .catch(() => {})
  })
  try {
    const cached = await storage.getFromStorage(STORAGE_KEY_BROWSE)
    if (cached && cached.serverUrl === serverUrl && cached.userId === userId) return cached
  } catch (e) {
    console.warn('[Browse] Failed to load cache:', e)
  }
  return null
}

// Asks Home to refresh. Details marking a title watched, playback ending and a change to the
// libraries send it. detail.featured marks a refresh that changes what the bar may hold,
// detail.libraries a change to the libraries themselves, which has to show straight away, and
// detail.newMediaBar Home pressed while Home shows.
const refreshListeners = []
export const onBrowseRefresh = (fn) => {
  refreshListeners.push(fn)
  return () => {
    const at = refreshListeners.indexOf(fn)
    if (at >= 0) refreshListeners.splice(at, 1)
  }
}
export const browseRefresh = (detail = {}) => refreshListeners.slice().forEach((fn) => fn(detail))
// Some utils send it as a window event instead (Hide Watched's server write), so that's heard too.
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('moonfin:browseRefresh', (e) => browseRefresh((e && e.detail) || {}))

// Whether the app is in the background, and a hook for it coming back to the front, which catches
// Home's rows up. Older sets only fire the prefixed event.
export const appHidden = () => typeof document !== 'undefined' && !!(document.hidden || document.webkitHidden)
export const watchAppVisible = (fn) => {
  if (typeof document === 'undefined') return () => {}
  const handle = () => fn(appHidden())
  document.addEventListener('visibilitychange', handle)
  document.addEventListener('webkitvisibilitychange', handle)
  return () => {
    document.removeEventListener('visibilitychange', handle)
    document.removeEventListener('webkitvisibilitychange', handle)
  }
}
