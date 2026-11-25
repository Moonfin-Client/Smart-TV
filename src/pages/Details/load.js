// Everything a details page shows about one item: the record first, then the lists that hang off
// it, each handed to `set` as it lands so the page fills in behind the hero. `alive()` says whether
// the page still wants this item.
import $L from '../../services/i18n.js'
import { api, getServerType, getServerUrl } from '../../services/jellyfinApi.js'
import { isBlocked as isContentBlocked, isBlockedNow, observeItem } from '../../services/blockedContentGate.js'
import { withoutBlockedItems } from '../../services/parentalControls.js'
import { canScoreSeedLocally, getOnlineRecommendations, getRecommendations, mergeRecommendations } from '../../services/homeRecommendations.js'
import { fetchTmdbSeasonRatings, isRatingSourceAllowed, resolveSeriesTmdbId } from '../../services/mdblistApi.js'
import { getItemAudioPref, getSeriesAudioPref, syncSeriesTrackChoices } from '../../services/subtitlePrefs.js'
import { fromServerStream, matchSeriesTrackIndex } from '../../utils/seriesTrackPrefs.js'
import { isStreamlessStaticSource, probedSources } from '../../utils/placeholderSource.js'
import { mergeEpisodeCast, mergeEpisodePeople, resolveParentCast } from '../../utils/episodeCast.js'
import { withPersonRoles } from '../../utils/personCredits.js'
import { sectionVisibility } from '../../utils/detailSectionLayout.js'
import { loadTmdbReviews, reviewsQuery } from '../../utils/tmdbReviews.js'
import * as playback from '../../services/playback.js'
import { all } from '../../state/settings.js'
import { checkSeerr } from '../../state/seerr.js'
import { detailsSubtitlePosition } from '../Player/initialSubtitle.js'
import { findParentCollections } from './parentCollection.js'
import { compareFeatures } from './extraCategories.js'
import { fetchAllPlaylistItems } from './playlistItems.js'
import { fetchMissingCollectionItems } from './seerrMissingCollectionItems.js'
import { buildCollectionIndex, collectionPlaylistItems, fetchCollectionPage, indexEntryFor } from './collectionPlaylist.js'
import { DEFAULT_SORT, SORT_CUSTOM, mergeSavedOrder, orderCollectionIndex } from './nouveau/nouveauCollectionSort.js'
import { boxSetPeople } from './detailsMedia.js'
import { trailerChoicesFor } from './trailerChoices.js'
import { getApiForItem } from '../../services/connectionPool.js'
import { withServer } from '../../state/libraryRoutes.js'
import { searchedTrailers, searchesForTrailer } from '../../services/youtubeTrailer.js'

const SIMILAR_LIMIT = 20
const COLLECTION_PAGE_SIZE = 50
const COLLECTION_TITLES_QUERY = { SortBy: 'ProductionYear,SortName', SortOrder: 'Ascending' }
const PROBED_TYPES = ['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer']

// The lists a page starts with, so the last item's never show under the next.
export const emptyLists = () => ({
  seasons: [], episodes: [], seriesEpisodes: [], similar: [], similarLoaded: false, playListsLoaded: false, extras: [], cast: [],
  nextUp: [], nextEpisode: null, collectionItems: [], collectionMembers: [], missingCollectionItems: [], parentCollections: [],
  similarSource: 'jellyfin', albumTracks: [], artistAlbums: [], playlistItems: [], collectionSort: DEFAULT_SORT,
  collectionPlaylistLoading: false, episodeRatings: {}, reviews: [],
})

// An item from another server is read, with everything under it, through that server.
export const apiFor = (item) => getApiForItem(item) || api

const withProbedSources = async (data) => {
  const api = apiFor(data)
  const src = data && data.MediaSources && data.MediaSources[0]
  if (!data || PROBED_TYPES.indexOf(data.Type) < 0 || !isStreamlessStaticSource(data, src && src.Id)) return data
  const probed = probedSources(await api.getPlaybackInfo(data.Id, { AutoOpenLiveStream: false }).catch(() => null))
  return probed.length ? { ...data, MediaSources: probed } : data
}

// Another server's api has no getItemForDetail, so its getItem reads the same record without the
// chapters.
export const fetchItem = async (id, server) => {
  const api = apiFor(server)
  return withProbedSources(withServer(server, await (api.getItemForDetail ? api.getItemForDetail(id) : api.getItem(id))))
}

// The record, or {blocked: true} when parental controls refuse it, or null when it can't load.
export const loadRecord = async (id, seed, server) => {
  if (seed && seed.Id === id && isBlockedNow(seed)) return { blocked: true }
  let data
  try {
    data = await fetchItem(id, server)
  } catch (e) {
    return null
  }
  if (!data) return null
  if (await isContentBlocked(data)) return { blocked: true }
  observeItem(data)
  return { item: data }
}

// Which version, audio and subtitle the page shows as picked before the viewer chooses: a remembered
// track for the title or its series, else the server's default, and the subtitle playback starts on.
export const initialTracks = async (data) => {
  const ms = data.MediaSources && data.MediaSources[0]
  if (!ms) return { version: 0, audio: 0, subtitle: -1 }
  await syncSeriesTrackChoices(data)
  const audios = (ms.MediaStreams || []).filter((s) => s.Type === 'Audio')
  const itemPref = await getItemAudioPref(data.Id)
  const seriesPref = data.SeriesId ? await getSeriesAudioPref(data.SeriesId) : undefined
  const matched = audios.some((s) => s.Index === itemPref)
    ? itemPref
    : seriesPref ? matchSeriesTrackIndex(audios.map(fromServerStream), seriesPref) : null
  const remembered = matched !== null && matched >= 0 ? audios.findIndex((s) => s.Index === matched) : -1
  const shown = remembered >= 0 ? remembered : audios.findIndex((s) => s.Index === ms.DefaultAudioStreamIndex)
  const subtitle = await detailsSubtitlePosition(data, ms, all(), audios[shown])
  return { version: 0, audio: Math.max(0, shown), subtitle }
}

// The people an item starts with. An episode's own list is merged with its season's actors later.
export const peopleOf = (data) =>
  data.People && data.People.length
    ? data.Type === 'Episode' ? mergeEpisodePeople({ episodePeople: data.People, parentActors: [] }) : data.People
    : []

const keep = (res, fallbackRating) => withoutBlockedItems((res && res.Items) || [], fallbackRating)

const fetchSimilar = async (data) => {
  const api = apiFor(data)
  const s = all()
  const source = s.recommendationSystemSource || 'local'
  const plugin = await Promise.resolve(checkSeerr()).catch(() => null)
  const canScore = Boolean(plugin && plugin.pluginInfo && plugin.pluginInfo.recommendationsSupported === true)
  const stock = () => api.getSimilar(data.Id, SIMILAR_LIMIT, 'moonfin').catch(() => null)
  const scored = () => api.getMoonfinSimilar(data.Id, SIMILAR_LIMIT).catch(() => null)
  const localScored = () => (canScoreSeedLocally(data)
    ? getRecommendations(api, data, { includeWatched: true, limit: SIMILAR_LIMIT }).catch(() => [])
    : Promise.resolve([]))
  if (source === 'server') return { data: await stock(), source: 'jellyfin' }
  if (source === 'online') {
    const cards = await getOnlineRecommendations(s, data).catch(() => [])
    if (cards.length) return { data: { Items: cards }, source: 'tmdb' }
  }
  if (source === 'hybrid') {
    const [stockData, scoredData] = await Promise.all([stock(), canScore ? scored() : localScored().then((Items) => ({ Items }))])
    const merged = mergeRecommendations(stockData && stockData.Items, scoredData && scoredData.Items, SIMILAR_LIMIT)
    if (merged.length) return { data: { Items: merged }, source: 'moonfin' }
  }
  if (source === 'local') {
    if (canScore) {
      const scoredData = await scored()
      if (scoredData && scoredData.Items && scoredData.Items.length) return { data: scoredData, source: 'moonfin' }
    }
    const local = await localScored()
    if (local.length) return { data: { Items: local }, source: 'moonfin' }
  }
  return { data: await api.getSimilar(data.Id, SIMILAR_LIMIT).catch(() => null), source: 'jellyfin' }
}

// A collection's own titles, a page at a time.
export const readCollectionTitles = async (titles, id, item) => {
  const api = apiFor(item)
  titles.loading = true
  const data = await api.getItems({
    ParentId: id, ...COLLECTION_TITLES_QUERY, StartIndex: titles.fetched, Limit: COLLECTION_PAGE_SIZE,
    Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,People',
  }).catch(() => null)
  titles.loading = false
  if (!data) return []
  const page = data.Items || []
  titles.fetched += page.length
  titles.more = typeof data.TotalRecordCount === 'number' ? titles.fetched < data.TotalRecordCount : page.length === COLLECTION_PAGE_SIZE
  return withoutBlockedItems(page)
}

// The page's lists. `set(patch)` merges into the page and `get()` reads the lists back, for the
// pieces that append.
export const loadLists = async (data, { set, get, alive, collection }) => {
  const api = apiFor(data)
  const id = data.Id
  const t = data.Type
  const s = all()
  const fallbackRating = data.OfficialRating
  let boxSetMembers = []

  if (t === 'Series') {
    const style = s.detailScreenStyle
    const wantsEpisodes = ['v4', 'v5', 'v6', 'v7', 'v9'].indexOf(style) >= 0
    const [seasonsData, nextUpData, episodesData] = await Promise.all([
      api.getSeasons(id).catch(() => null),
      api.getNextUp(1, id).catch(() => null),
      wantsEpisodes ? api.getEpisodes(id).catch(() => null) : null,
    ])
    if (!alive()) return
    const patch = {}
    if (seasonsData) patch.seasons = keep(seasonsData, fallbackRating)
    if (nextUpData && nextUpData.Items && nextUpData.Items.length) patch.nextUp = nextUpData.Items
    if (episodesData) patch.seriesEpisodes = keep(episodesData, fallbackRating)
    set(patch)
  }

  if (t === 'Season') {
    const hasActors = Array.isArray(data.People) && data.People.some((p) => p.Type === 'Actor')
    if (!hasActors && data.SeriesId) {
      resolveParentCast({ apiClient: api, seriesId: data.SeriesId }).then((parentActors) => {
        if (alive() && parentActors && parentActors.length) set({ cast: mergeEpisodeCast({ episodeActors: data.People || [], parentActors }) })
      })
    }
    const episodesData = await api.getEpisodes(data.SeriesId, id).catch(() => null)
    if (!alive()) return
    if (episodesData) set({ episodes: keep(episodesData, fallbackRating) })
  }

  if (t === 'Episode') {
    const seasonId = data.SeasonId || data.ParentId
    const wantsWholeSeries = Boolean(data.SeriesId) && ['v3', 'v5', 'v6', 'v7', 'v9'].indexOf(s.detailScreenStyle) >= 0 &&
      sectionVisibility(s.hiddenDetailSectionsTv)('moreEpisodes')
    resolveParentCast({ apiClient: api, seasonId, seriesId: data.SeriesId }).then((parentActors) => {
      if (alive() && parentActors && parentActors.length) set({ cast: mergeEpisodePeople({ episodePeople: data.People || [], parentActors }) })
    })
    const [seasonData, seriesData] = await Promise.all([
      data.SeriesId && seasonId ? api.getEpisodes(data.SeriesId, seasonId).catch(() => null) : null,
      wantsWholeSeries ? api.getEpisodes(data.SeriesId).catch(() => null) : null,
    ])
    if (!alive()) return
    const patch = {}
    if (seasonData) patch.episodes = keep(seasonData, fallbackRating)
    if (seriesData) patch.seriesEpisodes = keep(seriesData, fallbackRating)
    set(patch)
    playback.getNextEpisode(data).then((next) => alive() && set({ nextEpisode: next || null })).catch(() => {})
  }

  if (t === 'BoxSet') {
    collection.titles = { fetched: 0, more: false, loading: false }
    const titles = collection.titles
    const [collectionData, firstPage] = await Promise.all([
      api.getItems({ ParentId: id, ...COLLECTION_TITLES_QUERY, Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds' }).catch(() => null),
      readCollectionTitles(titles, id, data),
    ])
    if (!alive()) return
    const patch = { collectionItems: firstPage, cast: boxSetPeople(firstPage) }
    boxSetMembers = (collectionData && collectionData.Items) || []
    if (collectionData) {
      const members = withoutBlockedItems(boxSetMembers)
      patch.collectionMembers = members
      const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
      if (members.length && seerr && seerr.available) {
        fetchMissingCollectionItems({ boxSet: data, members, settings: s })
          .then((missing) => alive() && missing.length && set({ missingCollectionItems: missing }))
          .catch(() => {})
      }
    }
    set(patch)
  }

  if (t === 'MusicAlbum') {
    const [tracks, similar] = await Promise.all([api.getAlbumTracks(id).catch(() => null), api.getSimilar(id).catch(() => null)])
    if (!alive()) return
    set({ albumTracks: keep(tracks), similar: keep(similar), similarLoaded: true })
  }

  if (t === 'MusicArtist') {
    const [albums, similar] = await Promise.all([api.getAlbumsByArtist(id).catch(() => null), api.getSimilar(id).catch(() => null)])
    if (!alive()) return
    set({ artistAlbums: keep(albums), similar: keep(similar), similarLoaded: true })
  }

  if (t === 'Playlist') {
    const entries = await fetchAllPlaylistItems(api, id).catch(() => null)
    if (!alive()) return
    if (entries) set({ playlistItems: withoutBlockedItems(entries) })
  }

  set({ playListsLoaded: true })

  const needsSimilar = ['Person', 'BoxSet', 'MusicAlbum', 'MusicArtist', 'Playlist'].indexOf(t) < 0
  const needsExtras = ['Movie', 'Episode', 'Video', 'Season', 'Series'].indexOf(t) >= 0
  const needsBoxSet = t === 'Movie' || t === 'Video' || t === 'Series'
  const collectionsLookup = needsBoxSet ? findParentCollections(api, data).catch(() => []) : Promise.resolve([])
  const [similarResult, extrasData, partsData] = await Promise.all([
    needsSimilar ? fetchSimilar(data) : null,
    needsExtras ? api.getSpecialFeatures(id).catch(() => null) : null,
    needsExtras && data.PartCount > 1 ? api.getAdditionalParts(id).catch(() => null) : null,
  ])
  if (!alive()) return
  const patch = {}
  if (similarResult && similarResult.data) {
    patch.similar = keep(similarResult.data)
    patch.similarSource = similarResult.source
  }
  if (t !== 'MusicAlbum' && t !== 'MusicArtist') patch.similarLoaded = true
  const parts = ((partsData && partsData.Items) || []).map((part) => ({ ...part, _additionalPart: true }))
  if (extrasData || parts.length) {
    const features = (Array.isArray(extrasData) ? extrasData : []).filter((e) => e.Id !== id).sort(compareFeatures)
    patch.extras = withoutBlockedItems([...parts, ...features])
  }
  set(patch)

  const collections = await collectionsLookup
  // Every collection's titles are read at once, and the rows still go up in the collections' order.
  const reads = await Promise.all(collections.map((boxSet) => api.getItems({
    ParentId: boxSet.Id, SortBy: 'PremiereDate,SortName', SortOrder: 'Ascending',
    Fields: 'PrimaryImageAspectRatio,ProductionYear,ProviderIds,People',
  }).catch(() => null)))
  for (let i = 0; i < collections.length; i++) {
    const boxSet = collections[i]
    const members = keep(reads[i])
    if (members.length <= 1) continue
    if (!alive()) return
    set({ parentCollections: get().parentCollections.concat({ id: boxSet.Id, name: boxSet.Name || $L('Collection'), boxSetItem: boxSet, items: members, missingItems: [] }) })
    const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
    if (seerr && seerr.available) {
      fetchMissingCollectionItems({ boxSet, members, settings: s }).then((missing) => {
        if (!alive() || !missing.length) return
        set({ parentCollections: get().parentCollections.map((entry) => (entry.id === boxSet.Id ? { ...entry, missingItems: missing } : entry)) })
      }).catch(() => {})
    }
  }

  if (t === 'BoxSet') {
    set({ collectionPlaylistLoading: true })
    const [scanned, saved] = await Promise.all([
      buildCollectionIndex(api, id),
      Promise.resolve(api.getCollectionOrder && api.getCollectionOrder(id)).catch(() => null),
    ])
    if (!alive()) return
    const entries = scanned.length ? scanned : collectionPlaylistItems([], boxSetMembers).map(indexEntryFor)
    const customOrder = Array.isArray(saved) && saved.length ? mergeSavedOrder(saved, entries) : []
    collection.entries = entries
    collection.item = data
    collection.customOrder = customOrder
    collection.sort = customOrder.length ? SORT_CUSTOM : DEFAULT_SORT
    await startCollectionPlaylist(collection, customOrder.length ? customOrder : orderCollectionIndex(entries, collection.sort), { set, alive })
  }

  if (t === 'Person') {
    const films = await api.getItemsByPerson(id, 50).catch(() => null)
    if (!alive()) return
    if (films) set({ similar: withPersonRoles(keep(films), id) })
  }
}

// Starts the collection's play order over from its first page.
const startCollectionPlaylist = async (collection, index, { set, alive }) => {
  const api = apiFor(collection.item)
  const generation = (collection.generation = (collection.generation || 0) + 1)
  collection.index = index
  collection.fetched = 0
  collection.hasMore = false
  set({ collectionSort: collection.sort, collectionPlaylistLoading: true, playlistItems: [] })
  try {
    const page = await fetchCollectionPage(api, index, 0)
    if (!alive() || generation !== collection.generation) return
    collection.fetched = page.fetchedCount
    collection.hasMore = page.hasMore
    set({ playlistItems: withoutBlockedItems(page.items) })
  } finally {
    if (alive() && generation === collection.generation) set({ collectionPlaylistLoading: false })
  }
}

export const loadMoreCollectionItems = async (collection, { set, get, alive }) => {
  const api = apiFor(collection.item)
  if (collection.loading || !collection.hasMore) return
  collection.loading = true
  const generation = collection.generation
  try {
    const page = await fetchCollectionPage(api, collection.index, collection.fetched)
    if (!alive() || generation !== collection.generation) return
    collection.fetched = page.fetchedCount
    collection.hasMore = page.hasMore
    const visible = withoutBlockedItems(page.items)
    if (visible.length) set({ playlistItems: get().playlistItems.concat(visible) })
  } catch (e) {
    collection.hasMore = false
  } finally {
    collection.loading = false
  }
}

export const chooseCollectionSort = (collection, option, ctx) => {
  if (option === collection.sort) return
  collection.sort = option
  const entries = collection.entries
  if (!entries) {
    ctx.set({ collectionSort: option })
    return
  }
  let index = collection.index
  if (option === SORT_CUSTOM) {
    if (collection.customOrder && collection.customOrder.length) index = collection.customOrder
  } else if (entries.length) {
    index = orderCollectionIndex(entries, option)
  }
  startCollectionPlaylist(collection, index, ctx).catch(() => {})
}

// The TMDB score of each episode in the season on screen, by episode number.
export const loadEpisodeRatings = async (item) => {
  const s = all()
  if (!s.useMoonfinPlugin || !s.tmdbEpisodeRatingsEnabled || !isRatingSourceAllowed(s.mdblistRatingSources, 'tmdb')) return {}
  if (item.Type !== 'Season' && item.Type !== 'Episode') return {}
  const season = item.Type === 'Season' ? item.IndexNumber : item.ParentIndexNumber
  if (season == null) return {}
  const tmdbId = await resolveSeriesTmdbId(item).catch(() => null)
  if (!tmdbId) return {}
  const data = await fetchTmdbSeasonRatings(item._serverUrl || getServerUrl(), tmdbId, season).catch(() => null)
  const out = {}
  ;((data && data.episodes) || []).forEach((ep) => (out[ep.episodeNumber] = ep.voteAverage))
  return out
}

// TMDB reviews from the plugin, which an older plugin says it can't give.
export const loadReviews = async (item) => {
  const api = apiFor(item)
  const s = all()
  if (s.useMoonfinPlugin !== true || !sectionVisibility(s.hiddenDetailSectionsTv)('reviews')) return []
  const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
  if (!seerr || !seerr.pluginInfo || seerr.pluginInfo.tmdbReviewsSupported !== true) return []
  const query = reviewsQuery(item)
  return query ? loadTmdbReviews(api, query).catch(() => []) : []
}

// What the Trailer button can play: the server's own trailers, then each YouTube one once. A title on
// a server that keeps no trailer links has YouTube searched for one.
export const loadTrailerChoices = async (item) => {
  const api = apiFor(item)
  const local = await api.getLocalTrailers(item.Id).catch(() => null)
  const localItems = Array.isArray(local) ? local : (local && local.Items) || []
  let remote = item.RemoteTrailers || []
  if (!localItems.length && !remote.length && searchesForTrailer(item, getServerType())) remote = await searchedTrailers(item).catch(() => [])
  return trailerChoicesFor(localItems, remote)
}
