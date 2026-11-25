// Builds the Home rows from the user's homeRows setting. Each enabled section loads on its own, so
// Home can draw the first ones and hold the rest back until focus comes near them. Rows page in
// more cards as focus nears their end (utils/rowPaging.js), each carrying its readHead.
// shortcut: no other servers' picked rows, and Since you watched doesn't load again when Seerr signs
// in or out while Home is up. Add them with multi-server Home.
import $L from '../services/i18n.js'
import { api, HOME_ROW_ITEM_FIELDS, getApiKey, getServerUrl, getServerType, getUserId, resolveItemsByProviderIds } from '../services/jellyfinApi.js'
import { scopedGetItems } from '../services/libraryScope.js'
import { getActiveParentalFilter, withoutBlockedItems } from '../services/parentalControls.js'
import { fetchSeasonalRow } from '../services/externalRowsApi.js'
import { mergeHomeRows } from '../utils/homeLayout.js'
import { isExternalRowAvailable, isRowEnabledBySetting } from '../utils/homeRowGates.js'
import { isKidsMode, kidsModeRows, mergesContinueWatchingNextUp } from '../utils/kidsMode.js'
import { isLiveTvLibrary, librariesForNav } from '../utils/liveTvLibrary.js'
import { isGameLibrary, refreshGameLibraries, resolveGameLibraryId } from '../utils/gameLibrary.js'
import { gameHeadline } from '../utils/gameArt.js'
import * as gamesApi from '../services/gamesApi.js'
import { isPickedRow, isPickedRowShown, isSameServer, isSeerrSliderRow } from '../utils/pickedRows.js'
import { apiSortBy, getGenresIncludeTypes, isPlaylistOrder, resolveSortOrder } from '../utils/homeRowSorting.js'
import { collapseLatestTvItems, latestMediaFetchLimitForCollection, normalizeLatestMediaItems } from '../utils/latestMediaRowNormalizer.js'
import { genericCollectionLabel, mergeRecentRows } from '../utils/mergeRecentRows.js'
import {
  buildSeasonalRow, fetchCalendarRows, fetchCustomHomeRow, fetchExternalPresetRow, formatWatchingNowSubtitle, getExternalHomeRowConfigs,
  normalizeWatchingNowItem, sortExternalItems,
} from '../utils/externalHomeRows.js'
import { loadRewatchItems, loadSinceYouWatchedRows } from '../services/homeRecommendations.js'
import { studioRowSortBy } from '../utils/studioRowSort.js'
import { studioLogoIndex } from '../pages/Details/studioLogos.js'
import { pickRepresentative } from './genreSamples.js'
import { loadCollectionRowItems } from '../utils/collectionRowItems.js'
import { SEERR_SECTION_TO_CONFIG, fetchSeerrHomeRow, getSeerrHomeRowConfigs, normalizeMediaItem } from '../utils/seerrHomeRows.js'
import { loadSliderHomeRow } from '../utils/seerrSliders.js'
import { seasonalCountryParam } from '../utils/seasonalRow.js'
import { setTmdbThumbsAvailable } from '../utils/tmdbThumb.js'
import { resolveDeviceCountry } from '../utils/deviceCountry.js'
import { withoutBlockedOrUnrated } from '../utils/parentalFilter.js'
import { checkSeerr } from './seerr.js'
import * as settings from './settings.js'
import { getStore } from './store.js'
import { readLibrariesFromAllServers } from '../services/connectionPool.js'
import { mergeLibrariesByType, mergesLibraries } from '../utils/mergedCopies.js'
import { unifiedMode } from '../ui/components/library/multiServer.js'
import { FULL_ROW_READ, ROW_MAX_ITEMS, ROW_PAGE_SIZE, moreAfter, nextHeadLength, extendRow, readFoldedHead } from '../utils/rowPaging.js'
import { fetchWatchingNow } from '../services/mdblistApi.js'
import { shuffled } from '../utils/shuffled.js'

const ROW_LIMIT = 20
const CALENDAR_IDS = ['radarr_calendar', 'sonarr_calendar']
const RESUME_LIMIT = 12
const NEXT_UP_LIMIT = 24
const LATEST_LIMIT = 16
const PICKED_ROW_LIMIT = 40
const EXCLUDED_COLLECTION_TYPES = ['boxsets', 'books', 'musicvideos', 'homevideos', 'photos']

const FAVORITES = {
  favoriteMovies: { title: () => $L('Favorite Movies'), types: 'Movie', type: 'poster' },
  favoriteSeries: { title: () => $L('Favorite Series'), types: 'Series', type: 'poster' },
  favoriteEpisodes: { title: () => $L('Favorite Episodes'), types: 'Episode', type: 'landscape' },
  favoritePeople: { title: () => $L('Favorite People'), types: 'Person', type: 'circle' },
  favoriteArtists: { title: () => $L('Favorite Artists'), types: 'MusicArtist', type: 'square' },
  favoriteMusicVideos: { title: () => $L('Favorite Music Videos'), types: 'MusicVideo', type: 'landscape' },
  favoriteAlbums: { title: () => $L('Favorite Albums'), types: 'MusicAlbum', type: 'square' },
  favoriteSongs: { title: () => $L('Favorite Songs'), types: 'Audio', type: 'square' },
}

// The settings the rows are built from. Home reloads its rows when any of them changes.
const ROW_SETTINGS = [
  'homeRows', 'mergeContinueWatchingNextUp', 'kidsModeEnabled', 'useMoonfinPlugin', 'uiLanguage',
  'displayFavoritesRows', 'displayCollectionsRows', 'displayGenresRows', 'displayPlaylistsRows', 'displayAudioRows',
  'hideWatchedInRecentRows', 'mergeRecentRowsByType', 'recentlyReleasedSeriesType', 'nextUpMaxDays',
  'hiddenContinueWatchingItems', 'hiddenNextUpSeries',
  'favoritesRowSortBy', 'favoritesRowSortOrder', 'collectionsRowSortBy', 'collectionsRowSortOrder', 'collectionsRowShowEpisodes',
  'genresRowSortBy', 'genresRowSortOrder', 'genresRowItemFilter', 'playlistsRowSortBy', 'playlistsRowSortOrder',
  'playlistsRowShowEpisodes', 'audioRowsSortBy', 'audioRowsSortOrder', 'imdbRowsSortBy', 'imdbRowsSortOrder',
  'tmdbRowsSortBy', 'tmdbRowsSortOrder', 'seerrRowsSortBy', 'seerrRowsSortOrder',
  'seasonalRowCountry', 'seasonalRowHiddenHolidays', 'seasonalRowAllYear',
  'displayStudiosRows', 'studiosRowSortBy', 'studiosRowSortOrder',
  'displayRewatchRow', 'rewatchIncludeMovies', 'rewatchIncludeShows', 'rewatchIncludeCollections', 'rewatchSortBy',
  'sinceYouWatchedSource', 'sinceYouWatchedSourceItem', 'sinceYouWatchedSourceType', 'sinceYouWatchedIncludeWatched', 'tmdbApiKey',
  'customHomeRows', 'calendarRowSeeAll', 'seasonalRowEnabled', 'mdblistWatchingNowEnabled', 'mergeRadarrSonarrCalendars', 'dateFormat',
  'radarrCalendarShowCinema', 'radarrCalendarShowDigital', 'radarrCalendarShowPhysical', 'radarrCalendarShowDate',
  'radarrCalendarHideDownloaded', 'sonarrCalendarShowDate', 'sonarrCalendarShowEpisodeInfo', 'sonarrCalendarHideDownloaded',
]
export const homeRowsKey = () => JSON.stringify(ROW_SETTINGS.map((k) => settings.get(k)))

const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

// Each playlist opened into its items for Show Individual Episodes, an empty or unreadable one
// keeping its own card.
const expandPlaylistsToItems = async (playlists, limit, usePlaylistOrder, sortBy, sortOrder) => {
  const expanded = await Promise.all(playlists.map(async (playlist) => {
    if (!playlist || playlist.Type !== 'Playlist') return [playlist]
    try {
      const result = usePlaylistOrder
        ? await api.getPlaylistItems(playlist.Id, limit)
        : await api.getItems({ ParentId: playlist.Id, SortBy: sortBy, SortOrder: sortOrder, Limit: limit, Fields: HOME_ROW_ITEM_FIELDS })
      const items = itemsOf(result)
      return items.length ? items : [playlist]
    } catch (e) {
      return [playlist]
    }
  }))
  return [].concat(...expanded).slice(0, limit)
}

export const isExternalItem = (it) => !!(it && it._seerr && !it._resolvedFromExternal)

// The source label under an outside row's title.
const subtitleFor = (key) => {
  if (key.indexOf('imdb-') === 0) return $L('IMDb List')
  if (key.indexOf('tmdb_') === 0) return $L('TMDB Lists')
  if (key.indexOf('mdblist_') === 0 && key !== 'mdblist_watching_now') return $L('MDBList Lists')
  if (key.indexOf('justwatch_') === 0) return $L('JustWatch')
  if (key === 'radarr_calendar') return $L('Radarr Calendar')
  if (key === 'sonarr_calendar') return $L('Sonarr Calendar')
  if (key === 'seasonal') return $L('Seasonal')
  return ''
}

// A row keeps the server's items, and the look Home draws them in makes the cards. Titles a blocked
// rating keeps out never make it in.
const row = (key, title, items, type = 'poster', flags) => ({
  key,
  id: key,
  title,
  subtitle: subtitleFor(key),
  type,
  items: withoutBlockedItems(items),
  ...flags,
})

// A row that can page: readHead(limit) answers { Items, hasMore } or a server list result.
const pageable = (r, result, limit, readHead) => ({ ...r, readHead, hasMore: moreAfter(result, limit) })

// The row with the next, longer head read in, or the row as it was when the read fails.
export const pageRow = async (r) => {
  const limit = nextHeadLength(r)
  const result = await r.readHead(limit)
  return extendRow(r, withoutBlockedItems((result && result.Items) || []), moreAfter(result, limit))
}

// My Media's tiles: every library, the Live TV one too, except in Kids Mode.
const libraryTiles = (ctx) =>
  librariesForNav(ctx.allLibs, false, { hideLiveTv: isKidsMode(ctx.s) }).map((lib) => ({ ...lib, Type: 'CollectionFolder', isLibraryTile: true }))

export const parseHiddenMap = (val) => {
  if (!val) return {}
  try {
    return typeof val === 'string' ? JSON.parse(val) : val
  } catch (e) {
    return {}
  }
}

// A hidden card comes back once it's been played since.
const isHidden = (item, hidden, seriesOnly) => {
  const key = seriesOnly ? item.SeriesId : item.SeriesId || item.Id
  if (!key || !hidden[key]) return false
  const hiddenAt = Date.parse(hidden[key])
  if (!isFinite(hiddenAt)) return false
  const played = item.UserData && item.UserData.LastPlayedDate
  return !(played && Date.parse(played) > hiddenAt)
}

// Old TV engines don't sort stably, so the index breaks ties.
const byNewest = (a, b) => (a.d === b.d ? a.i - b.i : !a.d ? 1 : !b.d ? -1 : a.d < b.d ? 1 : -1)

// Next Up borrows its series' last played date so the merged row orders by what was watched most
// recently. The episodes played most recently lend their series' date too.
const mergeContinue = (resume, nextUp, recentlyPlayed = []) => {
  const seriesPlayed = {}
  const inResume = {}
  resume.forEach((it) => (inResume[it.Id] = true))
  resume.concat(recentlyPlayed).forEach((it) => {
    const played = it.UserData && it.UserData.LastPlayedDate
    if (it.SeriesId && played && (!seriesPlayed[it.SeriesId] || played > seriesPlayed[it.SeriesId])) seriesPlayed[it.SeriesId] = played
  })
  return resume
    .concat(nextUp.filter((it) => !inResume[it.Id]))
    .map((it, i) => ({ it, i, d: (it.UserData && it.UserData.LastPlayedDate) || seriesPlayed[it.SeriesId] || '' }))
    .sort(byNewest)
    .map((x) => x.it)
}

// A game library's row comes from Moonbase, since the server can't see the games. A server without the route leaves the row out.
const gameRow = async (lib, released, key, title) => {
  const libraryId = resolveGameLibraryId(lib)
  const games = await gamesApi.getRecentGames(libraryId, released).catch(() => [])
  if (!Array.isArray(games) || !games.length) return null
  const library = { ...lib, Id: libraryId }
  // What the info area reads for the focused card ("1985 • NES"), and routeForItem's way to the game.
  const items = games.map((game) => {
    const name = gameHeadline(game.title, game.fileName)
    const art = game.boxart || {}
    return {
      ...game,
      title: name,
      Id: game.id,
      Name: name,
      ProductionYear: game.year,
      Overview: game.overview,
      Genres: game.system ? [game.system] : [],
      isGame: true,
      _library: library,
      _aspect: art.width > 0 && art.height > 0 ? art.width / art.height : null,
    }
  })
  return { key, id: key, title, subtitle: '', type: 'game', items, isGameRow: true, isLatestRow: !released, isRecentlyReleasedRow: released, library }
}

// One row per library, or one per library type when mergeRecentRowsByType is on. Game rows hold
// games, so they never merge and go after the merged ones.
const recentRows = async (ctx, released, read) => {
  const prefix = released ? 'recently-released' : 'latest'
  const label = (name) => $L(released ? 'Recently Released {libraryName}' : 'Recently Added {libraryName}').replace('{libraryName}', name)
  const flags = (lib) => (released ? { isRecentlyReleasedRow: true, library: lib } : { isLatestRow: true, library: lib })
  const results = (
    await Promise.all(
      ctx.libs.map((lib) =>
        isGameLibrary(lib.Id, lib.CollectionType, lib.Name)
          ? gameRow(lib, released, `${prefix}-${lib.Id}`, label(lib.Name))
          : read(lib)
              .then((got) => ({ lib, ...got }))
              .catch(() => null)
      )
    )
  ).filter((r) => r && r.items.length)
  if (ctx.s.mergeRecentRowsByType) {
    return mergeRecentRows(results.filter((r) => r.lib), released ? 'PremiereDate' : 'DateCreated')
      .map((m) => row(`${prefix}-merged-${m.collectionType}`, label(genericCollectionLabel(m.collectionType)), m.items, m.cardType === 'square' ? 'square' : 'poster', released ? { isRecentlyReleasedRow: true } : { isLatestRow: true }))
      .concat(results.filter((r) => r.key))
  }
  return results.map((r) =>
    r.key
      ? r
      : { ...row(`${prefix}-${r.lib.Id}`, label(r.lib.Name), r.items, String(r.lib.CollectionType).toLowerCase() === 'music' ? 'square' : 'poster', flags(r.lib)), readHead: r.readHead, hasMore: r.hasMore }
  )
}

const SAMPLE_FIELDS = 'PrimaryImageAspectRatio,Genres,ImageTags,BackdropImageTags'

// One query for every genre's sample title, then one genre at a time for the ones it missed. A
// genre without any keeps a plain card.
const withSamples = async (ctx, genres) => {
  try {
    const names = genres.map((g) => g.Name).filter(Boolean)
    const res = await api.getItems({
      IncludeItemTypes: ctx.genresTypes,
      Recursive: true,
      Fields: SAMPLE_FIELDS,
      Genres: names.join('|'),
      Limit: Math.min(Math.max(names.length * 8, 50), 300),
      SortBy: 'SortName',
    })
    const samples = itemsOf(res)
    let out = genres.map((g) => {
      const rep = pickRepresentative(g, samples)
      return rep ? { ...g, Type: 'Genre', _representative: rep } : { ...g, Type: 'Genre' }
    })
    const missing = out.filter((g) => !g._representative)
    if (missing.length) {
      const found = await Promise.all(
        missing.map((g) =>
          api
            .getItems({ IncludeItemTypes: ctx.genresTypes, Recursive: true, Fields: SAMPLE_FIELDS, Genres: g.Name, Limit: 1, SortBy: 'SortName' })
            .then((r) => ({ id: g.Id, rep: itemsOf(r)[0] || null }))
            .catch(() => ({ id: g.Id, rep: null }))
        )
      )
      out = out.map((g) => {
        if (g._representative) return g
        const hit = found.find((f) => f.id === g.Id)
        return hit && hit.rep ? { ...g, Type: 'Genre', _representative: hit.rep } : g
      })
    }
    return out
  } catch (e) {
    console.warn('[home] genre samples failed', e)
    return genres
  }
}

// The outside rows only show while the plugin can fill them.
const pluginReady = async (ctx, id) => {
  const seerr = await ctx.seerr
  return isExternalRowAvailable(id, { settings: ctx.s, pluginInfo: seerr && seerr.pluginInfo, serverType: getServerType() }) === true
}

const notHidden = (items, hidden, seriesOnly) => items.filter((it) => !isHidden(it, hidden, seriesOnly))
// Heads of Continue Watching and Next Up as { Items, hasMore }, with the hidden cards left out.
const readResume = (ctx) => (limit) =>
  api.getResumeItems(limit).then((res) => ({ Items: notHidden(itemsOf(res), ctx.hiddenCW, false), hasMore: moreAfter(res, limit) }))
const readNextUp = (ctx) => (limit) =>
  api.getNextUp(limit, null, ctx.s.nextUpMaxDays).then((res) => ({ Items: notHidden(itemsOf(res), ctx.hiddenNU, true), hasMore: moreAfter(res, limit) }))
const NONE = { Items: [], hasMore: false }
// The played episodes the merged row borrows series dates from.
const recentlyPlayed = () =>
  api
    .getItems({ IncludeItemTypes: 'Episode', Filters: 'IsPlayed', Recursive: true, SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 100, Fields: 'UserData,SeriesId' })
    .then(itemsOf)
    .catch(() => [])
const resume = (ctx) => ctx.resume || (ctx.resume = readResume(ctx)(RESUME_LIMIT).catch(() => NONE))
const nextUp = (ctx) => ctx.nextUp || (ctx.nextUp = readNextUp(ctx)(NEXT_UP_LIMIT).catch(() => NONE))
const notIn = (items, others) => {
  const ids = {}
  others.forEach((it) => (ids[it.Id] = true))
  return items.filter((it) => !ids[it.Id])
}

// A library's Recently Added, read `limit` cards long. The server's list has no start index, so a
// longer row is asked for again, and a show's new episodes fold into one card for the series.
const readLatestHead = (lib, hideWatched) => (limit) =>
  readFoldedHead(
    (size) => api.getLatest(lib.Id, size),
    (latest) => normalizeLatestMediaItems(latest, { collectionType: lib.CollectionType, limit: 0, hideWatched }),
    limit,
    latestMediaFetchLimitForCollection(lib.CollectionType, limit, Infinity, hideWatched),
    hideWatched ? FULL_ROW_READ : undefined
  )

// The first read. With watched titles hidden a full read can still leave the row short, so it's
// read once more as far as FULL_ROW_READ.
const readLatest = async (lib, hideWatched) => {
  const limit = latestMediaFetchLimitForCollection(lib.CollectionType, LATEST_LIMIT, undefined, hideWatched)
  const latest = await api.getLatest(lib.Id, limit)
  if (!hideWatched || !Array.isArray(latest) || latest.length < limit || normalizeLatestMediaItems(latest, { collectionType: lib.CollectionType, hideWatched }).length >= LATEST_LIMIT) {
    return latest
  }
  return api.getLatest(lib.Id, FULL_ROW_READ).catch(() => latest)
}

// A paged list read as { items, hasMore, readHead } for the recent rows.
const headOf = async (readHead, limit) => {
  const res = await readHead(limit)
  return { items: itemsOf(res), hasMore: moreAfter(res, limit), readHead }
}

const LOADERS = {
  // Pages go after the cards already drawn: Continue Watching is read to its end first, then Next Up.
  'continue-nextup': async (ctx) => {
    const [r, n, played] = await Promise.all([resume(ctx), nextUp(ctx), recentlyPlayed()])
    const part = (got) => ({ n: got.Items.length, more: got.hasMore })
    const parts = { resume: part(r), nextup: part(n) }
    const readHead = async () => {
      for (const id of ['resume', 'nextup']) {
        const p = parts[id]
        if (!p.more) continue
        const limit = Math.min(p.n + ROW_PAGE_SIZE, ROW_MAX_ITEMS)
        const got = await (id === 'resume' ? readResume(ctx) : readNextUp(ctx))(limit)
        const added = got.Items.length > p.n
        p.more = added && got.Items.length < ROW_MAX_ITEMS && got.hasMore
        p.n = Math.max(p.n, got.Items.length)
        if (added) return { Items: got.Items, hasMore: parts.resume.more || parts.nextup.more }
      }
      return { Items: [], hasMore: false }
    }
    const items = mergeContinue(r.Items, n.Items, played).slice(0, ROW_MAX_ITEMS)
    return [{ ...row('continue-nextup', $L('Continue Watching & Next Up'), items, 'landscape'), readHead, hasMore: items.length < ROW_MAX_ITEMS && (r.hasMore || n.hasMore) }]
  },
  resume: async (ctx) => {
    const r = await resume(ctx)
    return [pageable(row('resume', $L('Continue Watching'), r.Items, 'landscape'), r, RESUME_LIMIT, readResume(ctx))]
  },
  nextup: async (ctx) => {
    const [r, n] = await Promise.all([resume(ctx), nextUp(ctx)])
    const readHead = (limit) => readNextUp(ctx)(limit).then((res) => ({ ...res, Items: notIn(res.Items, r.Items) }))
    return [pageable(row('nextup', $L('Next Up'), notIn(n.Items, r.Items), 'landscape'), n, NEXT_UP_LIMIT, readHead)]
  },
  'library-tiles': async (ctx) => [row('library-tiles', $L('My Media'), libraryTiles(ctx), 'landscape', { isLibraryRow: true })],
  // The same libraries drawn as icon buttons instead of artwork tiles.
  librarybuttons: async (ctx) => [row('librarybuttons', $L('Library Buttons'), libraryTiles(ctx), 'square', { isLibraryRow: true, isButtonRow: true })],
  livetv: async (ctx) => {
    const lib = ctx.allLibs.find((l) => String(l.CollectionType || '').toLowerCase() === 'livetv')
    if (!lib) return []
    const items = [
      { ...lib, Name: $L('Guide'), Type: 'CollectionFolder', isLibraryTile: true },
      { Id: 'livetv-recordings', Name: $L('Recordings'), Type: 'CollectionFolder', isRecordingsShortcut: true },
    ]
    return [row('livetv', $L('Live TV'), items, 'landscape', { isLiveTvRow: true })]
  },
  'latest-media': async (ctx) => {
    const hideWatched = ctx.s.hideWatchedInRecentRows === true
    return recentRows(ctx, false, (lib) =>
      readLatest(lib, hideWatched).then((latest) => ({
        items: normalizeLatestMediaItems(latest, { collectionType: lib.CollectionType, limit: LATEST_LIMIT, hideWatched }),
        hasMore: true,
        readHead: readLatestHead(lib, hideWatched),
      }))
    )
  },
  'recently-released': async (ctx) => {
    const types = { season: 'Movie,Season', episode: 'Movie,Episode' }[ctx.s.recentlyReleasedSeriesType] || 'Movie,Series'
    return recentRows(ctx, true, (lib) => headOf((limit) => api.getRecentlyReleased(lib.Id, limit, types, ctx.s.hideWatchedInRecentRows), LATEST_LIMIT))
  },
  collections: async (ctx) => {
    const sortBy = apiSortBy(ctx.s.collectionsRowSortBy || 'SortName')
    const readHead = (limit) =>
      scopedGetItems(api, {
        IncludeItemTypes: 'BoxSet',
        Recursive: true,
        SortBy: sortBy,
        SortOrder: resolveSortOrder(sortBy, ctx.s.collectionsRowSortOrder),
        Limit: limit,
        Fields: `${HOME_ROW_ITEM_FIELDS},DateCreated,PremiereDate,CommunityRating,CriticRating,RunTimeTicks`,
      })
    const res = await readHead(ROW_LIMIT)
    return [pageable(row('collections', $L('Collections'), itemsOf(res)), res, ROW_LIMIT, readHead)]
  },
  genres: async (ctx) => {
    const sortBy = apiSortBy(ctx.s.genresRowSortBy || 'SortName')
    const order = resolveSortOrder(sortBy, ctx.s.genresRowSortOrder)
    let genres = itemsOf(await api.getGenres(undefined, ctx.genresTypes, sortBy, order))
    const lower = sortBy.toLowerCase()
    if (lower === 'sortname' || lower === 'name') {
      const dir = order === 'Descending' ? -1 : 1
      genres = genres.slice().sort((a, b) => dir * (a.Name || '').localeCompare(b.Name || ''))
    } else if (lower === 'random') {
      genres = shuffled(genres)
    }
    return [row('genres', $L('Genres'), await withSamples(ctx, genres), 'landscape', { isGenreRow: true })]
  },
  playlists: async (ctx) => {
    const sortBy = apiSortBy(ctx.s.playlistsRowSortBy || 'SortName')
    const sortOrder = resolveSortOrder(sortBy, ctx.s.playlistsRowSortOrder)
    const playlists = itemsOf(await api.getPlaylists(sortBy, sortOrder))
    const items = ctx.s.playlistsRowShowEpisodes && playlists.length
      ? await expandPlaylistsToItems(playlists, 20, isPlaylistOrder(ctx.s.playlistsRowSortBy), sortBy, sortOrder)
      : playlists
    return [row('playlists', $L('Playlists'), items, 'square')]
  },
  audioartists: async (ctx) => {
    const readHead = (limit) =>
      scopedGetItems(
        api,
        { IncludeItemTypes: 'MusicArtist', Limit: limit, SortBy: ctx.audioSort, SortOrder: ctx.audioOrder, Fields: HOME_ROW_ITEM_FIELDS },
        { via: (p) => api.getAlbumArtists(p) }
      )
    const res = await readHead(ROW_LIMIT)
    return [pageable(row('audioartists', $L('Music Artists'), itemsOf(res), 'square'), res, ROW_LIMIT, readHead)]
  },
  audioalbums: async (ctx) => {
    const readHead = (limit) =>
      scopedGetItems(api, { IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: ctx.audioSort, SortOrder: ctx.audioOrder, Limit: limit, Fields: HOME_ROW_ITEM_FIELDS })
    const res = await readHead(ROW_LIMIT)
    return [pageable(row('audioalbums', $L('Music Albums'), itemsOf(res), 'square'), res, ROW_LIMIT, readHead)]
  },
  audioplaylists: async (ctx) => {
    const lists = itemsOf(await api.getPlaylists(ctx.audioSort, ctx.audioOrder)).filter((it) => it.MediaType === 'Audio')
    return [row('audioplaylists', $L('Music Playlists'), lists, 'square')]
  },
  resumeaudio: async () => {
    const readHead = (limit) => api.getResumeAudioItems(limit)
    const res = await readHead(ROW_LIMIT)
    return [pageable(row('resumeaudio', $L('Continue Listening'), itemsOf(res), 'square'), res, ROW_LIMIT, readHead)]
  },
  activerecordings: async () => [row('activerecordings', $L('Recordings'), itemsOf(await api.getLiveTvRecordings()), 'landscape')],
  onnow: async () => [row('onnow', $L('On Now'), itemsOf(await api.getLiveTvAiringPrograms(ROW_LIMIT)), 'landscape')],
  // Studio art is a wide logo that Modern's portrait cards would crop, so the row stays Classic in
  // either style. A studio borrows Moonbase's TMDB logo when its name matches exactly.
  studios: async (ctx) => {
    const sortBy = studioRowSortBy(ctx.s.studiosRowSortBy)
    const logos = ctx.s.useMoonfinPlugin && api.getStudioLogos ? api.getStudioLogos().catch(() => null) : null
    const res = await api.getStudios(ROW_LIMIT, sortBy, resolveSortOrder(sortBy, ctx.s.studiosRowSortOrder)).catch(() => null)
    const items = itemsOf(res)
    if (!items.length) return []
    return [row('studios', $L('Studios'), withStudioLogos(items, await logos, getServerUrl(), getApiKey()), 'landscape', { forceClassic: true })]
  },
  rewatch: async (ctx) => {
    const items = await loadRewatchItems(api, {
      rewatchIncludeMovies: ctx.s.rewatchIncludeMovies,
      rewatchIncludeShows: ctx.s.rewatchIncludeShows,
      rewatchIncludeCollections: ctx.s.rewatchIncludeCollections,
      rewatchSortBy: ctx.s.rewatchSortBy,
    }).catch(() => null)
    return items && items.length ? [row('rewatch', $L('Rewatch'), items, 'poster')] : []
  },
  seasonal: async (ctx) => {
    if (!(await pluginReady(ctx, 'seasonal'))) return []
    const country = seasonalCountryParam(ctx.s.seasonalRowCountry, await resolveDeviceCountry())
    const built = buildSeasonalRow(await fetchSeasonalRow({ country, allYear: ctx.s.seasonalRowAllYear === true }), ctx.s.seasonalRowHiddenHolidays || [])
    return built ? [row('seasonal', built.title, withoutBlockedOrUnrated(built.items, getActiveParentalFilter(), false), 'poster', { isExternalRow: true })] : []
  },
}

const withStudioLogos = (studios, logoList, serverUrl, token) => {
  if (!logoList || !logoList.success || !Array.isArray(logoList.companies)) return studios
  const { byName } = studioLogoIndex(logoList.companies, serverUrl, token)
  return studios.map((studio) => {
    const logo = byName.get(String(studio.Name || '').trim().toLowerCase())
    return logo ? { ...studio, _studioLogoUrl: logo } : studio
  })
}

// Every Since you watched row comes from one read. Seerr's suggestions only join while Seerr is on and signed in.
const sinceYouWatched = (ctx) =>
  ctx.syw ||
  (ctx.syw = ctx.seerr.then((seerr) =>
    loadSinceYouWatchedRows(
      api,
      {
        sinceYouWatchedSource: ctx.s.sinceYouWatchedSource,
        sinceYouWatchedSourceItem: ctx.s.sinceYouWatchedSourceItem,
        sinceYouWatchedSourceType: ctx.s.sinceYouWatchedSourceType,
        sinceYouWatchedIncludeWatched: ctx.s.sinceYouWatchedIncludeWatched,
        tmdbApiKey: ctx.s.tmdbApiKey,
        recommendationsSupported: !!(seerr && seerr.pluginInfo && seerr.pluginInfo.recommendationsSupported === true),
      },
      ctx.sywIndexes,
      !!(seerr && seerr.enabled && seerr.authenticated)
    ).catch(() => [])
  ))

const loadSinceYouWatchedSection = async (ctx, section) => {
  const found = (await sinceYouWatched(ctx)).find((r) => r.id === section.id)
  if (!found) return []
  return [row(found.id, $L('Since you watched {name}').replace('{name}', found.seedName), found.items, 'poster', found.isSeerr === true ? { isOnlineRecoRow: true } : undefined)]
}

// A list the viewer pasted, resolved against the library like the charts.
const loadCustom = async (ctx, section) => {
  const cfg = section.custom
  const items = await fetchCustomHomeRow(cfg, { language: ctx.s.uiLanguage })
  if (!items || !items.length) return []
  const resolved = withoutBlockedOrUnrated(await resolveItemsByProviderIds(items), getActiveParentalFilter())
  return [row(section.id, cfg.name || cfg.title || $L('Custom'), resolved, 'poster', { isExternalRow: true, isCustomRow: true })]
}

// Radarr's and Sonarr's calendars load together. Merged, the first of the two in the row order
// draws them as one row, and the other section is never planned.
const calendars = (ctx) =>
  ctx.calendarRows ||
  (ctx.calendarRows = (async () => {
    const [radarr, sonarr] = await Promise.all(['radarr_calendar', 'sonarr_calendar'].map((id) => ctx.calendarIds.indexOf(id) >= 0 && pluginReady(ctx, id)))
    if (!radarr && !sonarr) return []
    const s = ctx.s
    const rows = await fetchCalendarRows(
      {
        mergeRadarrSonarrCalendars: s.mergeRadarrSonarrCalendars,
        radarrCalendarShowCinema: s.radarrCalendarShowCinema,
        radarrCalendarShowDigital: s.radarrCalendarShowDigital,
        radarrCalendarShowPhysical: s.radarrCalendarShowPhysical,
        radarrCalendarShowDate: s.radarrCalendarShowDate,
        radarrCalendarHideDownloaded: s.radarrCalendarHideDownloaded,
        sonarrCalendarShowDate: s.sonarrCalendarShowDate,
        sonarrCalendarShowEpisodeInfo: s.sonarrCalendarShowEpisodeInfo,
        sonarrCalendarHideDownloaded: s.sonarrCalendarHideDownloaded,
        dateFormat: s.dateFormat,
      },
      { radarrEnabled: !!radarr, sonarrEnabled: !!sonarr }
    )
    return Promise.all(rows.map(async (r) => ({ ...r, items: await resolveItemsByProviderIds(r.items) })))
  })())

const loadCalendar = async (ctx, section) => {
  const rows = await calendars(ctx)
  const wanted = ctx.calendarsMerged ? rows.filter((r) => r.isCalendarMerged) : rows.filter((r) => r.id === section.id)
  return wanted.map((r) => ({
    ...row(r.id, r.title, r.items, 'poster', { isExternalRow: true, isCalendarRow: true, isCalendarMerged: !!r.isCalendarMerged }),
    subtitle: r.isCalendarMerged ? $L('Radarr and Sonarr Calendars') : subtitleFor(r.id),
    // The last card opens the calendar's month.
    seeAllCalendar: ctx.s.calendarRowSeeAll !== false,
  }))
}

// The IMDb, TMDB, MDBList and JustWatch charts. Owned titles become library items, the rest open in Seerr.
const loadChart = async (ctx, cfg) => {
  if (!(await pluginReady(ctx, cfg.id))) return []
  const imdb = cfg.id.indexOf('imdb-') === 0
  const items = await fetchExternalPresetRow(cfg.id, {
    language: ctx.s.uiLanguage,
    sortBy: imdb ? ctx.s.imdbRowsSortBy : ctx.s.tmdbRowsSortBy,
    sortOrder: imdb ? ctx.s.imdbRowsSortOrder : ctx.s.tmdbRowsSortOrder,
  })
  if (!items || !items.length) return []
  return [row(cfg.id, cfg.title, withoutBlockedOrUnrated(await resolveItemsByProviderIds(items), getActiveParentalFilter()), 'poster', { isExternalRow: true })]
}

const seerrSignedIn = async (ctx) => {
  const seerr = await ctx.seerr
  return seerr && seerr.enabled && seerr.authenticated ? seerr : null
}

const loadSeerr = async (ctx, section) => {
  const seerr = await seerrSignedIn(ctx)
  const cfg = seerr && getSeerrHomeRowConfigs().find((c) => c.id === SEERR_SECTION_TO_CONFIG[section.id])
  if (!cfg) return []
  const items = await fetchSeerrHomeRow(cfg.id, { userId: seerr.user && seerr.user.seerrUserId })
  const sorted = cfg.type === 'shortcut' ? items : sortExternalItems(items, ctx.s.seerrRowsSortBy, ctx.s.seerrRowsSortOrder)
  const tiles = cfg.type === 'genre' || cfg.type === 'studio' || cfg.type === 'network' || cfg.type === 'shortcut'
  const type = cfg.cardType === 'portrait' ? 'poster' : cfg.cardType === 'logo' ? 'logo' : 'landscape'
  return [row(section.id, cfg.title, sorted, type, { isSeerrRow: true, isTileRow: tiles })]
}

// MDBList's Watching Now chart. Owned titles become library items so they open and play without Seerr.
const loadWatchingNow = async (ctx) => {
  if (!(await pluginReady(ctx, 'mdblist_watching_now'))) return []
  const data = await fetchWatchingNow(null)
  const identified = ((data && data.items) || []).filter((item) => item && (item.imdb_id || item.tmdb_id))
  if (!identified.length) return []
  const items = await resolveItemsByProviderIds(identified.map(normalizeWatchingNowItem))
  return [{ ...row('mdblist_watching_now', $L('Watching on MDBList'), items, 'landscape', { isExternalRow: true, isWatchingNowRow: true }), subtitle: formatWatchingNowSubtitle(data) }]
}

const loadSlider = async (ctx, section) => {
  if (!(await seerrSignedIn(ctx))) return []
  const loaded = await loadSliderHomeRow(section).catch(() => null)
  if (!loaded || !loaded.results.length) return []
  return [row(section.id, loaded.slider.title, sortExternalItems(loaded.results.map(normalizeMediaItem), ctx.s.seerrRowsSortBy, ctx.s.seerrRowsSortOrder), 'poster', { isSeerrRow: true })]
}

// A collection, genre, playlist or Silo section picked as a row of its own (the Moonbase plugin sections).
const readPicked = async (ctx, section, limit) => {
  const s = ctx.s
  const query = { Limit: limit, Fields: HOME_ROW_ITEM_FIELDS }
  if (section.source === 'server') {
    return (api.getServerHomeSectionItems ? await api.getServerHomeSectionItems(section.itemId, limit) : null) || { Items: [] }
  }
  if (section.source === 'collections') {
    const sortBy = apiSortBy(s.collectionsRowSortBy || 'SortName')
    return {
      Items: await loadCollectionRowItems(api, section.itemId, {
        limit, usePlaylistOrder: isPlaylistOrder(s.collectionsRowSortBy), sortBy, sortOrder: resolveSortOrder(sortBy, s.collectionsRowSortOrder),
        showEpisodes: s.collectionsRowShowEpisodes,
      }),
    }
  }
  if (section.source === 'genres') {
    const sortBy = apiSortBy(s.genresRowSortBy || 'SortName')
    const params = { ...query, GenreIds: section.itemId, IncludeItemTypes: ctx.genresTypes, ExcludeItemTypes: 'Episode', Recursive: true }
    return api.getItems({ ...params, SortBy: sortBy, SortOrder: resolveSortOrder(sortBy, s.genresRowSortOrder) })
  }
  const sortBy = apiSortBy(s.playlistsRowSortBy || 'SortName')
  const readPlaylist = (size) =>
    isPlaylistOrder(s.playlistsRowSortBy)
      ? api.getPlaylistItems(section.itemId, size)
      : api.getItems({ ...query, Limit: size, ParentId: section.itemId, SortBy: sortBy, SortOrder: resolveSortOrder(sortBy, s.playlistsRowSortOrder) })
  if (s.playlistsRowShowEpisodes) return (await readPlaylist(limit)) || { Items: [] }
  // A series' episodes fold into one card, so a head of cards can take a longer read.
  return readFoldedHead(async (size) => itemsOf(await readPlaylist(size)), collapseLatestTvItems, limit)
}

const loadPicked = async (ctx, section) => {
  const readHead = (limit) => readPicked(ctx, section, limit)
  const first = await readHead(PICKED_ROW_LIMIT)
  // What the row's See All card opens.
  const collection = section.source === 'collections' ? { Id: section.itemId, Name: section.name, Type: 'BoxSet' } : undefined
  return [pageable(row(section.id, section.name, itemsOf(first), 'poster', { isPluginRow: true, collection }), first, PICKED_ROW_LIMIT, readHead)]
}

// The enabled sections in the user's order, each a unit Home loads on its own, and what the loaders share.
// [tried] plans with those settings instead of the saved ones, for Settings' live preview, and
// leaves the rows Home has shown alone.
export const planHomeRows = (libraries, tried = null) => {
  const s = tried || settings.all()
  const serverUrl = getServerUrl()
  // A layout from a client that predates the seasonal or Watching Now row lacks it, so its own
  // toggle decides how it comes back.
  const added = { seasonal: s.seasonalRowEnabled === true, mdblist_watching_now: s.mdblistWatchingNowEnabled === true }
  const config = kidsModeRows(mergeHomeRows(s.homeRows, added), isKidsMode(s))
  const enabled = config.filter((r) => r.enabled).sort((a, b) => a.order - b.order)
  const charts = getExternalHomeRowConfigs()
  const merge = mergesContinueWatchingNextUp(s)
  const sections = []
  let merged = false
  const calendarIds = enabled.filter((r) => CALENDAR_IDS.indexOf(r.id) >= 0).map((r) => r.id)
  const calendarsMerged = calendarIds.length === 2 && !!s.mergeRadarrSonarrCalendars
  let calendarPlanned = false
  enabled.forEach((cfg) => {
    if (merge && (cfg.id === 'resume' || cfg.id === 'nextup')) {
      if (!merged) sections.push({ id: 'continue-nextup' })
      merged = true
    } else if (CALENDAR_IDS.indexOf(cfg.id) >= 0) {
      if (!(calendarsMerged && calendarPlanned)) sections.push(cfg)
      calendarPlanned = true
    } else if (cfg.id.indexOf('sinceyouwatched') === 0) {
      if (parseInt(cfg.id.replace('sinceyouwatched', ''), 10) >= 1) sections.push(cfg)
    } else if (isPickedRow(cfg)) {
      if (isPickedRowShown(cfg, s, serverUrl, getServerType()) && (!cfg.serverUrl || isSameServer(cfg.serverUrl, serverUrl))) sections.push(cfg)
    } else if (isSeerrSliderRow(cfg)) {
      if (isSameServer(cfg.serverUrl, serverUrl)) sections.push(cfg)
    } else if (isRowEnabledBySetting(cfg.id, s) && (LOADERS[cfg.id] || FAVORITES[cfg.id] || SEERR_SECTION_TO_CONFIG[cfg.id] || cfg.id === 'mdblist_watching_now' || charts.some((c) => c.id === cfg.id))) {
      sections.push(cfg)
    }
  })

  // The lists the viewer pasted come after every row with a place in the order.
  const custom = !isKidsMode(s) && s.useMoonfinPlugin ? s.customHomeRows || [] : []
  custom.filter((r) => r && r.enabled).forEach((r) => sections.push({ id: `external-${r.id}`, custom: r }))

  const audioSort = apiSortBy(s.audioRowsSortBy || 'SortName')
  if (!tried) noteHomePlan(sections)
  const ctx = {
    s,
    tried: !!tried,
    allLibs: libraries,
    libs: [],
    charts,
    seerr: checkSeerr()
      .then((seerr) => {
        // A Seerr or outside list title grows into the plugin's titled thumb once the plugin says it makes them.
        const info = (seerr && seerr.pluginInfo) || {}
        setTmdbThumbsAvailable(!!s.useMoonfinPlugin && info.tmdbAvailable === true && info.tmdbThumbsSupported === true)
        return seerr
      })
      .catch(() => null),
    hiddenCW: parseHiddenMap(s.hiddenContinueWatchingItems),
    hiddenNU: parseHiddenMap(s.hiddenNextUpSeries),
    genresTypes: getGenresIncludeTypes(s.genresRowItemFilter),
    audioSort,
    audioOrder: resolveSortOrder(audioSort, s.audioRowsSortOrder),
    favoriteSort: apiSortBy(s.favoritesRowSortBy || 'SortName'),
    sywIndexes: sections
      .filter((x) => x.id.indexOf('sinceyouwatched') === 0)
      .map((x) => parseInt(x.id.replace('sinceyouwatched', ''), 10))
      .sort((a, b) => a - b),
    calendarIds,
    calendarsMerged,
  }
  // The per library rows skip the libraries the account keeps out of its latest media. The game
  // library list has to be in before a library can be told apart as one.
  ctx.libsReady = Promise.all([api.getUserConfiguration().catch(() => null), refreshGameLibraries()]).then(([user]) => {
    const excludes = (user && user.Configuration && user.Configuration.LatestItemsExcludes) || []
    ctx.libs = libraries.filter(
      (lib) =>
        EXCLUDED_COLLECTION_TYPES.indexOf(String(lib.CollectionType || '').toLowerCase()) < 0 &&
        !(isKidsMode(s) && isLiveTvLibrary(lib)) &&
        excludes.indexOf(lib.Id) < 0
    )
  })
  return { sections, ctx }
}

const loadSectionRows = async (section, ctx) => {
  const fav = FAVORITES[section.id]
  if (fav) {
    const readHead = (limit) =>
      scopedGetItems(api, {
        IncludeItemTypes: fav.types,
        Filters: 'IsFavorite',
        SortBy: ctx.favoriteSort,
        SortOrder: resolveSortOrder(ctx.favoriteSort, ctx.s.favoritesRowSortOrder),
        Recursive: true,
        Limit: limit,
        Fields: HOME_ROW_ITEM_FIELDS,
      })
    const res = await readHead(ROW_LIMIT)
    return [pageable(row(section.id, fav.title(), itemsOf(res), fav.type), res, ROW_LIMIT, readHead)]
  }
  if (section.id === 'mdblist_watching_now') return loadWatchingNow(ctx)
  if (isPickedRow(section)) return loadPicked(ctx, section)
  if (isSeerrSliderRow(section)) return loadSlider(ctx, section)
  if (SEERR_SECTION_TO_CONFIG[section.id]) return loadSeerr(ctx, section)
  const chart = ctx.charts.find((c) => c.id === section.id)
  if (chart) return loadChart(ctx, chart)
  if (section.custom) return loadCustom(ctx, section)
  if (CALENDAR_IDS.indexOf(section.id) >= 0) return loadCalendar(ctx, section)
  if (section.id.indexOf('sinceyouwatched') === 0) return loadSinceYouWatchedSection(ctx, section)
  await ctx.libsReady
  return LOADERS[section.id](ctx)
}

// The title a section shows while it loads.
const SECTION_TITLES = {
  resume: () => $L('Continue Watching'),
  'continue-nextup': () => $L('Continue Watching & Next Up'),
  nextup: () => $L('Next Up'),
  'library-tiles': () => $L('My Media'),
  librarybuttons: () => $L('Library Buttons'),
  collections: () => $L('Collections'),
  genres: () => $L('Genres'),
  playlists: () => $L('Playlists'),
  audioartists: () => $L('Music Artists'),
  audioalbums: () => $L('Music Albums'),
  audioplaylists: () => $L('Music Playlists'),
  resumeaudio: () => $L('Continue Listening'),
  activerecordings: () => $L('Recordings'),
  livetv: () => $L('Live TV'),
  onnow: () => $L('On Now'),
  mdblist_watching_now: () => $L('Watching on MDBList'),
  seasonal: () => $L('Seasonal Row'),
}
const AUDIO_SECTIONS = ['audioartists', 'audioalbums', 'audioplaylists']

const sectionTitle = (section, ctx) => {
  const id = section.id
  if (SECTION_TITLES[id]) return SECTION_TITLES[id]()
  if (section.custom) return section.custom.name || section.custom.title || $L('Custom')
  if (id.indexOf('sinceyouwatched') === 0) return $L('Since you watched')
  if (id === 'radarr_calendar') return ctx.calendarsMerged ? $L('Upcoming Releases') : $L('Upcoming Movies')
  if (id === 'sonarr_calendar') return ctx.calendarsMerged ? $L('Upcoming Releases') : $L('Upcoming Episodes')
  if (FAVORITES[id]) return FAVORITES[id].title()
  if (isPickedRow(section) || isSeerrSliderRow(section)) return section.name || ''
  const seerr = SEERR_SECTION_TO_CONFIG[id] && getSeerrHomeRowConfigs().find((c) => c.id === SEERR_SECTION_TO_CONFIG[id])
  if (seerr) return seerr.title
  const chart = ctx.charts.find((c) => c.id === id)
  if (chart) return chart.title
  return section.name ? $L(section.name) : id
}

// A section's stand-in while it loads: its title over placeholder cards.
export const placeholderRow = (section, ctx) => ({
  key: `ph-${section.id}`,
  id: `ph-${section.id}`,
  title: sectionTitle(section, ctx),
  subtitle: '',
  type: AUDIO_SECTIONS.indexOf(section.id) >= 0 ? 'square' : 'poster',
  items: [],
  isPlaceholder: true,
})

// One section's rows without the empty ones. A failed section leaves no row.
export const loadHomeSection = async (section, ctx) => {
  try {
    const rows = (await loadSectionRows(section, ctx)).filter((r) => r.items.length)
    if (!ctx.tried && rows.length) noteHomeRows(section.id, rows)
    return rows
  } catch (e) {
    console.warn('[home] row failed', section.id, e)
    return []
  }
}

// How long to wait before each new read of the libraries while a server hasn't answered.
const LIBRARY_RETRY_DELAYS_MS = [3000, 8000, 20000, 45000]
let libraryRetry = null

// The rows Home last loaded, by section in Home's order, for Settings' live preview. A reload keeps
// a section's rows until Home has them again, and another user starts over.
const shown = { owner: '', order: [], rows: {}, version: 0 }
const shownListeners = []
const noteHomePlan = (sections) => {
  const owner = getServerUrl() + '|' + getUserId()
  if (owner !== shown.owner) shown.rows = {}
  shown.owner = owner
  shown.order = sections.map((section) => section.id)
}
const noteHomeRows = (id, rows) => {
  shown.rows[id] = rows
  shown.version++
  shownListeners.slice().forEach((fn) => fn())
}
export const homeRowsShown = () => shown
export const onHomeRowsShown = (fn) => {
  shownListeners.push(fn)
  return () => {
    const at = shownListeners.indexOf(fn)
    if (at >= 0) shownListeners.splice(at, 1)
  }
}

// The signed-in server's own libraries from the last read, which Home plans its rows from.
// shortcut: Home doesn't read the other servers' rows yet, add them with multi-server Home.
let ownLibraries = null
export const serverLibraries = () => ownLibraries

// The nav's libraries. With Multi-Server Libraries on and more than one server signed in, every
// server's libraries come with the server's name after each, or behind one Movies and one TV Shows
// library with Merge Libraries by Type. A server that hasn't answered is read again a little later.
export const loadLibraries = async (attempt = 0) => {
  clearTimeout(libraryRetry)
  if (!(await unifiedMode())) {
    ownLibraries = itemsOf(await api.getLibraries())
    return ownLibraries
  }
  const { libraries, complete } = await readLibrariesFromAllServers()
  // The same server can be saved twice, so its libraries are taken once.
  const own = {}
  ownLibraries = libraries.filter((lib) => isSameServer(lib._serverUrl, getServerUrl()) && !own[lib.Id] && (own[lib.Id] = true))
  if (!complete && attempt < LIBRARY_RETRY_DELAYS_MS.length) {
    libraryRetry = setTimeout(() => {
      loadLibraries(attempt + 1)
        .then((libs) => {
          const store = getStore()
          if (store) store.libraries = libs
        })
        .catch(() => {})
    }, LIBRARY_RETRY_DELAYS_MS[attempt])
  }
  const libs = mergesLibraries(settings.all(), true) ? mergeLibrariesByType(libraries) : libraries
  // A merged library stands for every server, so it keeps its plain name.
  return libs.map((lib) => (lib._mergedType ? lib : { ...lib, Name: `${lib.Name} (${lib._serverName})` }))
}
