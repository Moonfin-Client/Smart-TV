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
      if (date && !(latest.get(id) >= date)) latest.set(id, date)
    })
  })
  return latest
}

const dateAddedOf = (item) => {
  const effective = parseServerDate(item._effectiveDateCreated)
  const lastAdded = parseServerDate(item.DateLastMediaAdded)
  return (effective && !(lastAdded >= effective) ? effective : lastAdded) || parseServerDate(item.DateCreated)
}

const releaseDateOf = (item) => {
  const date = parseServerDate(item._effectivePremiereDate) || parseServerDate(item.PremiereDate)
  const year = Number(item.ProductionYear)
  return date || (year > 0 ? new Date(Date.UTC(year, 0, 1)) : null)
}

// Titles without the date go last either way.
const compareNullableDates = (a, b, descending) => {
  if (!a || !b) return (a ? -1 : 0) + (b ? 1 : 0)
  return descending ? b - a : a - b
}

// Each sort's date, the date that breaks its ties, and whether it runs newest first.
const DATE_SORTS = {
  dateAddedDesc: [dateAddedOf, releaseDateOf, true],
  dateAddedAsc: [dateAddedOf, releaseDateOf, false],
  releaseDateDesc: [releaseDateOf, dateAddedOf, true],
  releaseDateAsc: [releaseDateOf, dateAddedOf, false],
}

// Puts the slides the source picked in the Sort Order setting's order. Source Default keeps them as they are.
export const sortFeaturedItems = (items, sortOrder) => {
  if (sortOrder === 'random') return shuffle(items)
  const sort = DATE_SORTS[sortOrder]
  if (!sort) return items
  const [by, then, descending] = sort
  const name = (item) => String(item.Name || '').toLowerCase()
  const compare = (date, a, b) => compareNullableDates(date(a), date(b), descending)
  return [...items].sort((a, b) => compare(by, a, b) || compare(then, a, b) || name(a).localeCompare(name(b)))
}

// Reads the picked libraries or collections six at a time in a shuffled order, and skips the ones
// still waiting once there are twice as many usable titles as the bar shows.
const readFeaturedSources = async (sourceIds, fetchSource, isUsable, count) => {
  const items = []
  const seen = {}
  let usable = 0
  await mapBounded(shuffle(sourceIds), 6, async (sourceId) => {
    if (usable >= count * 2) return
    const result = await fetchSource(sourceId).catch(() => null)
    itemsOf(result).forEach((item) => {
      if (seen[item.Id]) return
      seen[item.Id] = true
      items.push(item)
      if (isUsable(item)) usable++
    })
  })
  return items
}

// Reads every picked source and takes their usable titles in turn, each source's newest first. A title
// two sources share goes to the one whose turn comes first, however fast each answered.
export const readDatedSources = async (sourceIds, fetchSource, isUsable) => {
  const batches = sourceIds.map(() => [])
  await mapBounded(sourceIds.map((id, i) => [id, i]), 6, async ([id, i]) => {
    batches[i] = itemsOf(await fetchSource(id).catch(() => null)).filter(isUsable)
  })
  const seen = new Set()
  const out = []
  const next = batches.map(() => 0)
  let added = true
  while (added) {
    added = false
    batches.forEach((batch, i) => {
      while (next[i] < batch.length && seen.has(batch[next[i]].Id)) next[i]++
      if (next[i] >= batch.length) return
      const item = batch[next[i]++]
      seen.add(item.Id)
      out.push(item)
      added = true
    })
  }
  return out
}

// The plugin's media bar cards leave out the provider ids, season count and dates, so one call fills them in.
const withBarFields = async (items) => {
  const res = await api.getItems({
    Ids: items.map((item) => item.Id).join(','),
    Fields: 'ProviderIds,ChildCount,DateCreated,DateLastMediaAdded,PremiereDate',
    EnableImages: false,
  }).catch(() => null)
  const byId = {}
  itemsOf(res).forEach((item) => (byId[item.Id] = item))
  return items.map((item) => {
    const { ProviderIds, ChildCount, DateCreated, DateLastMediaAdded, PremiereDate } = byId[item.Id] || {}
    return { ProviderIds, ChildCount, DateCreated, DateLastMediaAdded, PremiereDate, ...item }
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
  // A series takes the newest air and added dates of the episodes that brought it in, and keeps their order.
  const seriesOf = async (ids, children = []) => {
    if (!ids.length) return []
    const aired = latestChildDates(children, ['PremiereDate'])
    const added = latestChildDates(children, ['DateLastMediaAdded', 'DateCreated'])
    const rank = new Map(ids.map((id, i) => [id, i]))
    return itemsOf(await api.getItems({ Ids: ids.join(','), Fields: FIELDS, EnableTotalRecordCount: false }))
      .map((item) => ({ ...item, _effectivePremiereDate: aired.get(item.Id), _effectiveDateCreated: added.get(item.Id) }))
      .sort((a, b) => rank.get(a.Id) - rank.get(b.Id))
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
      let children = await released(childType, POOL_SIZE * 4, { unplayed: hideWatched })
      if (!children.length) return released('Series', POOL_SIZE, { unplayed: hideWatched })
      let ids = seriesIdsOf(children)
      if (ids.length < count && children.length >= POOL_SIZE * 4) {
        children = await released(childType, 500, { unplayed: hideWatched }).catch(() => children)
        ids = seriesIdsOf(children)
      }
      return seriesOf(ids, children)
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
const withExternalSlides = async (libraryItems, listIds, s, dated) => {
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
  const picks = shuffle(pool).slice(0, count)
  // A dated source's titles keep their newest first order, with the list titles taking every other place.
  const mixed = dated
    ? libraryItems.flatMap((item, i) => (picks[i] ? [item, picks[i]] : [item])).concat(picks.slice(libraryItems.length))
    : shuffle(libraryItems.concat(picks))
  const chosen = mixed.slice(0, count)
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
  const pickFrom = (pool) => shuffle(pool.filter(isUsable)).slice(0, count)

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
    items = (await readDatedSources(hasSourceFilter ? sourceIds : [null], readSource, isUsable)).slice(0, count)
  }

  // A dated source with nothing in its window shows random titles instead.
  if (!items.length) {
    if (hasSourceFilter) {
      const readSource = (id) => (collectionIds.indexOf(id) >= 0 ? api.getCollectionItems(id, 50) : api.getRandomItems(s.featuredContentType, count * 2, id, null, FIELDS))
      items = pickFrom(await readFeaturedSources(sourceIds, readSource, isUsable, count))
    } else {
      items = itemsOf(await api.getRandomItems(s.featuredContentType, count, null, null, FIELDS))
    }
  }

  if (externalIds.length && hasSourceFilter) items = await withExternalSlides(items, externalIds, s, dated)

  const kept = items.filter((item) => item.Type !== 'BoxSet' && matchesContentType(item, s.featuredContentType))
  return sortFeaturedItems(withoutExcludedGenres(kept, s.excludedGenres), s.mediaBarSortOrder)
}
