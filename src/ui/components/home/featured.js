// The media bar's slides.
// shortcut: one server only (no merged libraries). Add the merged reads when Home merges servers.
import { api, getServerUrl, getApiKey } from '../../../services/jellyfinApi.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { fetchTmdbDetails } from '../../../services/externalRowsApi.js'
import { retainPermitted } from '../../../services/libraryScope.js'
import { getActiveParentalFilter, withoutBlockedItems } from '../../../services/parentalControls.js'
import { IMDB_PRESETS, fetchCustomHomeRow, fetchExternalPresetRow } from '../../../utils/externalHomeRows.js'
import { withoutBlockedOrUnrated } from '../../../utils/parentalFilter.js'
import { isKidsMode } from '../../../utils/kidsMode.js'
import { DATED_SOURCES, newMovieOf, recentEpisodes } from '../../../utils/mediaBarNewRelease.js'
import { isWatchedForRecentRow } from '../../../utils/latestMediaRowNormalizer.js'
import { parseServerDate } from '../../../utils/serverDate.js'
import mapBounded from '../../../utils/mapBounded.js'
import { shuffled as shuffle } from '../../../utils/shuffled.js'
import { activeSyncProfile } from '../../../state/settingsSync.js'
import * as settings from '../../../state/settings.js'
import { resolveOverlayColor } from '../../../theme/overlayColors.js'

const POOL_SIZE = 40
const FIELDS = 'PrimaryImageAspectRatio,Overview,Genres,ProviderIds,RemoteTrailers,OfficialRating,ChildCount,Taglines,DateCreated,DateLastMediaAdded,PremiereDate'
const INCLUDE_TYPES = { movies: 'Movie', tv: 'Series' }

// The info box takes the overlay color at three quarters of its opacity.
export const panelColor = () => {
  const hex = resolveOverlayColor(settings.get('mediaBarOverlayColor'))
  const saved = settings.get('mediaBarOverlayOpacity')
  const opacity = Number(saved == null ? 50 : saved)
  const a = Math.round(((isFinite(opacity) ? opacity : 50) / 100) * 0.75 * 255)
  return hex + (a < 16 ? '0' : '') + a.toString(16)
}

export const barEnabled = () => settings.get('featuredBarStyle') !== 'off'

// The settings that decide what the bar holds or how it draws. Home reloads the bar when one changes.
export const featuredKey = () => {
  const s = settings.all()
  return JSON.stringify([
    s.featuredBarStyle, s.useMoonfinPlugin === true, s.mediaBarSourceType || 'random', s.mediaBarSortOrder || 'default',
    s.featuredContentType, s.featuredItemCount,
    s.mediaBarNewReleaseDays, s.mediaBarNewMovieDays, s.recentlyReleasedSeriesType, s.hideWatchedInRecentRows === true,
    s.mediaBarLibraryIds || [], s.mediaBarCollectionIds || [], s.excludedGenres || [], s.mediaBarExternalLists || [],
    isKidsMode(s), s.syncProfile, s.hideHomeMediaDescription, s.mediaBarOverlayColor, s.mediaBarOverlayOpacity,
  ])
}

const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

const matchesContentType = (item, contentType) => !INCLUDE_TYPES[contentType] || (item && item.Type === INCLUDE_TYPES[contentType])

// An item with no genres is kept, since there is nothing to match it against.
const withoutExcludedGenres = (items, excludedGenres) => {
  const excluded = (Array.isArray(excludedGenres) ? excludedGenres : []).map((g) => String(g).trim().toLowerCase()).filter(Boolean)
  if (!excluded.length) return items
  return items.filter((item) => {
    const names = (item.Genres || []).concat((item.GenreItems || []).map((g) => g && g.Name).filter(Boolean)).map((n) => String(n).trim().toLowerCase())
    return !names.some((n) => excluded.indexOf(n) >= 0)
  })
}

const latestChildDates = (children, fields) => {
  const latest = new Map()
  children.forEach((child) => {
    const id = child.Type === 'Series' ? child.Id : child.SeriesId
    if (!id) return
    fields.forEach((field) => {
      const date = parseServerDate(child[field])
      if (!date) return
      const existing = latest.get(id)
      if (!existing || date.getTime() > existing.getTime()) {
        latest.set(id, date)
      }
    })
  })
  return latest
}

const dateAddedOf = (item) => {
  const effective = parseServerDate(item?._effectiveDateCreated)
  const lastMediaAdded = parseServerDate(item?.DateLastMediaAdded)
  if (effective && (!lastMediaAdded || effective.getTime() > lastMediaAdded.getTime())) {
    return effective
  }
  if (lastMediaAdded) return lastMediaAdded
  return parseServerDate(item?.DateCreated)
}

const releaseDateOf = (item) => {
  const effective = parseServerDate(item?._effectivePremiereDate)
  if (effective) return effective
  const premiere = parseServerDate(item?.PremiereDate)
  if (premiere) return premiere
  const year = Number(item?.ProductionYear)
  if (Number.isFinite(year) && year > 0) return new Date(Date.UTC(year, 0, 1))
  return null
}

const compareNullableDates = (a, b, descending) => {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return descending ? b.getTime() - a.getTime() : a.getTime() - b.getTime()
}

// Re-orders the already-selected media bar slides according to mediaBarSortOrder.
// 'default' leaves the selected source's order untouched.
export const sortFeaturedItems = (items, sortOrder = 'default') => {
  if (!Array.isArray(items) || items.length < 2 || !sortOrder || sortOrder === 'default') {
    return items
  }
  if (sortOrder === 'random') {
    return shuffle(items)
  }
  const validDateSorts = ['dateAddedDesc', 'dateAddedAsc', 'releaseDateDesc', 'releaseDateAsc']
  if (!validDateSorts.includes(sortOrder)) {
    return items
  }
  const descending = sortOrder === 'dateAddedDesc' || sortOrder === 'releaseDateDesc'
  const byDateAdded = sortOrder === 'dateAddedDesc' || sortOrder === 'dateAddedAsc'
  return [...items].sort((a, b) => {
    const primary = compareNullableDates(
      byDateAdded ? dateAddedOf(a) : releaseDateOf(a),
      byDateAdded ? dateAddedOf(b) : releaseDateOf(b),
      descending
    )
    if (primary !== 0) return primary
    const secondary = compareNullableDates(
      byDateAdded ? releaseDateOf(a) : dateAddedOf(a),
      byDateAdded ? releaseDateOf(b) : dateAddedOf(b),
      descending
    )
    if (secondary !== 0) return secondary
    return String(a?.Name || '').toLowerCase().localeCompare(String(b?.Name || '').toLowerCase())
  })
}

// Reads the picked libraries or collections six at a time. Random sources shuffle and skip
// remaining sources once twice as many usable titles are in hand; dated sources read every source
// and interleave one usable title from each in turn.
export const readFeaturedSources = async (sourceIds, fetchSource, isUsable, count, { dated = false } = {}) => {
  const seen = new Set()
  let usable = 0
  const orderedIds = dated ? [...sourceIds] : shuffle(sourceIds)
  const batches = orderedIds.map(() => null)
  await mapBounded(orderedIds.map((id, index) => ({ id, index })), 6, async ({ id: sourceId, index }) => {
    if (!dated && usable >= count * 2) return
    const kept = []
    const batchSeen = dated ? new Set() : seen
    const result = await fetchSource(sourceId).catch(() => null)
    itemsOf(result).forEach((item) => {
      if (batchSeen.has(item.Id)) return
      batchSeen.add(item.Id)
      if (dated) {
        if (!isUsable(item)) return
        kept.push(item)
        usable++
      } else {
        kept.push(item)
        if (isUsable(item)) usable++
      }
    })
    batches[index] = kept
  })
  if (!dated) {
    return batches.flatMap((batch) => batch || [])
  }
  // Deduplicate deterministically in turn order so a faster source cannot steal a shared title
  // from an earlier source.
  const interleaved = []
  const cursors = batches.map(() => 0)
  let progressed = true
  while (progressed) {
    progressed = false
    for (let sIdx = 0; sIdx < batches.length; sIdx++) {
      const batch = batches[sIdx]
      if (!batch) continue
      while (cursors[sIdx] < batch.length && seen.has(batch[cursors[sIdx]].Id)) {
        cursors[sIdx]++
      }
      if (cursors[sIdx] < batch.length) {
        const item = batch[cursors[sIdx]++]
        seen.add(item.Id)
        interleaved.push(item)
        progressed = true
      }
    }
  }
  return interleaved
}

// The plugin's media bar cards leave out the provider ids, season count, and dates, so one call fills them in.
const withBarFields = async (items) => {
  const res = await api.getItems({
    Ids: items.map((item) => item.Id).join(','),
    Fields: 'ProviderIds,ChildCount,DateCreated,DateLastMediaAdded,PremiereDate',
    EnableImages: false,
  }).catch(() => null)
  const byId = {}
  itemsOf(res).forEach((item) => (byId[item.Id] = item))
  return items.map((item) => {
    const full = byId[item.Id]
    return {
      ProviderIds: full && full.ProviderIds,
      ChildCount: full && full.ChildCount,
      ...(full && full.DateCreated ? { DateCreated: full.DateCreated } : {}),
      ...(full && full.DateLastMediaAdded ? { DateLastMediaAdded: full.DateLastMediaAdded } : {}),
      ...(full && full.PremiereDate ? { PremiereDate: full.PremiereDate } : {}),
      ...item,
    }
  })
}

const seriesIdsOf = (children) => {
  const ids = []
  children.forEach((child) => {
    const id = child.Type === 'Series' ? child.Id : child.SeriesId
    if (id && ids.indexOf(id) < 0) ids.push(id)
  })
  return ids.slice(0, POOL_SIZE)
}

// A null parentId reads every library. New Releases asks for episodes, since a series' own date is its first season's.
const readDatedSource = async (sourceType, parentId, { contentType, days, movieDays, seriesType, count, hideWatched }) => {
  const unwatched = (items) => (hideWatched ? items.filter((item) => !isWatchedForRecentRow(item)) : items)
  const now = new Date()
  const released = async (types, limit, opts = {}) =>
    itemsOf(
      await api.getItems({
        ParentId: parentId,
        IncludeItemTypes: types,
        Recursive: true,
        SortBy: 'PremiereDate',
        SortOrder: 'Descending',
        MaxPremiereDate: now.toISOString(),
        MinPremiereDate: opts.sinceDays ? new Date(now.getTime() - opts.sinceDays * 86400000).toISOString() : null,
        Filters: opts.unplayed ? 'IsUnplayed' : null,
        Limit: limit,
        Fields: FIELDS,
        CollapseBoxSetItems: false,
        EnableTotalRecordCount: false,
      })
    )
  const seriesOf = async (ids, sourceChildren = []) => {
    if (!ids.length) return []
    const fetched = itemsOf(await api.getItems({ Ids: ids.join(','), Fields: FIELDS, EnableTotalRecordCount: false }))
    const premiereDates = sourceChildren.length ? latestChildDates(sourceChildren, ['PremiereDate']) : null
    const addedDates = sourceChildren.length ? latestChildDates(sourceChildren, ['DateLastMediaAdded', 'DateCreated']) : null
    const rank = new Map(ids.map((id, index) => [id, index]))
    return fetched
      .map((item) => {
        const aired = premiereDates && premiereDates.get(item.Id)
        const added = addedDates && addedDates.get(item.Id)
        if (!aired && !added) return item
        return {
          ...item,
          ...(aired ? { _effectivePremiereDate: aired.toISOString() } : {}),
          ...(added ? { _effectiveDateCreated: added.toISOString() } : {}),
        }
      })
      .sort((a, b) => (rank.has(a.Id) ? rank.get(a.Id) : ids.length) - (rank.has(b.Id) ? rank.get(b.Id) : ids.length))
  }
  const mergeByReleaseDate = (series, movies) =>
    series.concat(movies).sort((a, b) => compareNullableDates(releaseDateOf(a), releaseDateOf(b), true))

  if (sourceType === 'newReleases') {
    const [series, movies] = await Promise.all([
      contentType === 'movies' ? [] : recentEpisodes(api, parentId, days, 300).then((episodes) => seriesOf(seriesIdsOf(episodes), episodes)),
      contentType === 'tv' ? [] : released('Movie', POOL_SIZE, { sinceDays: movieDays, unplayed: hideWatched }),
    ])
    return mergeByReleaseDate(series, movies.filter((movie) => newMovieOf(movie, now, movieDays)))
  }
  if (sourceType === 'recentlyReleased') {
    const childType = contentType !== 'movies' && { season: 'Season', episode: 'Episode' }[seriesType]
    if (!childType) return unwatched(await released(INCLUDE_TYPES[contentType] || 'Movie,Series', POOL_SIZE))
    const latestSeries = async () => {
      let sourceChildren = await released(childType, POOL_SIZE * 4, { unplayed: hideWatched })
      if (!sourceChildren.length) return released('Series', POOL_SIZE, { unplayed: hideWatched })
      let ids = seriesIdsOf(sourceChildren)
      if (ids.length < count && sourceChildren.length >= POOL_SIZE * 4) {
        sourceChildren = await released(childType, 500, { unplayed: hideWatched }).catch(() => sourceChildren)
        ids = seriesIdsOf(sourceChildren)
      }
      return seriesOf(ids, sourceChildren)
    }
    const [series, movies] = await Promise.all([latestSeries(), contentType === 'tv' ? [] : released('Movie', POOL_SIZE, { unplayed: hideWatched })])
    return unwatched(mergeByReleaseDate(series, movies))
  }
  const latest = await api.getLatestItems({ ParentId: parentId, IncludeItemTypes: INCLUDE_TYPES[contentType] || 'Movie,Series', Limit: POOL_SIZE, Fields: FIELDS })
  return Array.isArray(latest) ? unwatched(latest) : []
}

// The whole outside list goes in the pool. An id this TV has no list for comes back empty.
const fetchList = (id, customRows, language) => {
  const options = { language, limit: Infinity }
  const custom = customRows.find((row) => row.id === id)
  if (custom) return fetchCustomHomeRow(custom, options)
  const imdb = IMDB_PRESETS.find((preset) => preset.type === id)
  return fetchExternalPresetRow(imdb ? imdb.id : id, options)
}

const titleKey = (item) => {
  const ids = item.ProviderIds || {}
  const id = ids.Tmdb || ids.Imdb
  return id ? `${item.Type}:${id}` : null
}

// A list title dressed as a slide from what TMDB knows about it. Null when there is no backdrop.
const toExternalSlide = (item, details) => {
  const backdrop = details && details.backdropPath ? seerrApi.getImageUrl(details.backdropPath, 'w1280') : item._externalBackdropUrl
  if (!backdrop) return null
  return {
    ...item,
    Overview: (details && details.overview) || item.Overview,
    CommunityRating: details && details.rating != null ? details.rating : item.CommunityRating,
    Genres: details && details.genres && details.genres.length ? details.genres : item.Genres,
    RunTimeTicks: details && details.runTimeTicks != null ? details.runTimeTicks : item.RunTimeTicks,
    LogoUrl: details && details.logoPath ? seerrApi.getImageUrl(details.logoPath, 'w500') : null,
    _externalBackdropUrl: backdrop,
  }
}

// Up to a bar's worth of list titles shuffled in with the library picks. Only the ones that make
// it on are looked up on TMDB.
const withExternalSlides = async (libraryItems, listIds, s) => {
  const count = s.featuredItemCount
  const [lists, ping] = await Promise.all([
    Promise.all(listIds.map((id) => fetchList(id, s.customHomeRows || [], s.uiLanguage))),
    seerrApi.moonfinPing(getServerUrl(), getApiKey()).catch(() => null),
  ])
  const detailsSupported = !!(ping && ping.tmdbDetailsSupported === true)
  const seen = {}
  const pool = withoutBlockedOrUnrated(
    [].concat(...lists).filter((item) => {
      const key = titleKey(item)
      if (!key || seen[key]) return false
      seen[key] = true
      return matchesContentType(item, s.featuredContentType) && !!(item._externalBackdropUrl || detailsSupported)
    }),
    getActiveParentalFilter()
  )
  const chosen = shuffle(libraryItems.concat(shuffle(pool).slice(0, count))).slice(0, count)
  const slides = await Promise.all(
    chosen.map(async (item) => {
      if (!item._external) return item
      const ids = item.ProviderIds || {}
      const details = detailsSupported ? await fetchTmdbDetails({ type: item._seerrMediaType, tmdbId: ids.Tmdb, imdbId: ids.Imdb }) : null
      return toExternalSlide(item, details)
    })
  )
  return slides.filter(Boolean)
}

export const loadFeaturedItems = async () => {
  const s = settings.all()
  const count = s.featuredItemCount || 10
  const sourceType = s.mediaBarSourceType || 'random'
  // The saved picks sync across servers, so only what this server still offers and allows is trusted.
  const picked = s.mediaBarLibraryIds || []
  const views = picked.length ? itemsOf(await api.getLibraries().catch(() => null)) : null
  const libraryIds = await retainPermitted(api, picked.filter((id) => !views || views.some((view) => view.Id === id)))
  const collectionIds = s.mediaBarCollectionIds || []
  const sourceIds = libraryIds.concat(collectionIds)
  const hasSourceFilter = sourceIds.length > 0
  const externalIds = s.useMoonfinPlugin && !isKidsMode(s) ? s.mediaBarExternalLists || [] : []

  const isUsable = (item) =>
    item.Type !== 'BoxSet' &&
    !!(item.BackdropImageTags && item.BackdropImageTags.length) &&
    matchesContentType(item, s.featuredContentType) &&
    withoutExcludedGenres([item], s.excludedGenres).length > 0 &&
    withoutBlockedItems([item]).length > 0
  const pickFrom = (pool, { dated: isDated = false } = {}) => {
    const usable = pool.filter(isUsable)
    return (isDated ? usable : shuffle(usable)).slice(0, count)
  }

  let items = []
  // Lists picked on their own fill the bar alone, and fall back to the default draw when empty.
  if (externalIds.length && !hasSourceFilter) items = await withExternalSlides([], externalIds, s)

  const dated = DATED_SOURCES.indexOf(sourceType) >= 0
  if (!items.length && s.useMoonfinPlugin && !dated) {
    // The plugin answers from the synced picks of the profile this TV syncs with.
    const res = await seerrApi.getMoonfinMediaBar(getServerUrl(), getApiKey(), activeSyncProfile(s.syncProfile)).catch(() => null)
    if (res && res.Items && res.Items.length) items = await withBarFields(res.Items)
  }

  if (!items.length && dated) {
    const options = {
      contentType: s.featuredContentType,
      days: s.mediaBarNewReleaseDays,
      movieDays: s.mediaBarNewMovieDays,
      seriesType: s.recentlyReleasedSeriesType,
      count,
      hideWatched: s.hideWatchedInRecentRows === true,
    }
    const readSource = async (parentId) => ({ Items: await readDatedSource(sourceType, parentId, options) })
    items = pickFrom(await readFeaturedSources(hasSourceFilter ? sourceIds : [null], readSource, isUsable, count, { dated: true }), { dated: true })
  }

  // A dated source with nothing in its window shows random titles instead.
  if (!items.length) {
    if (hasSourceFilter) {
      const readSource = (id) => (collectionIds.indexOf(id) >= 0 ? api.getCollectionItems(id, 50) : api.getRandomItems(s.featuredContentType, count * 2, id))
      items = pickFrom(await readFeaturedSources(sourceIds, readSource, isUsable, count))
    } else {
      items = itemsOf(await api.getRandomItems(s.featuredContentType, count))
    }
  }

  if (externalIds.length && hasSourceFilter) items = await withExternalSlides(items, externalIds, s)

  const filtered = withoutExcludedGenres(items.filter((item) => item.Type !== 'BoxSet' && matchesContentType(item, s.featuredContentType)), s.excludedGenres)
  return sortFeaturedItems(filtered, s.mediaBarSortOrder || 'default')
}
