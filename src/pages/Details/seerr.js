// The Seerr side of a details page: which Seerr buttons the action row offers, the status pills the
// metadata row shows, and the pieces the Seerr tab draws. A title Seerr can't place leaves it idle,
// so the page renders as it would without Seerr.
// The arr queue, download bars, Get a different release and the status poll are added by
// ui/components/seerr/SeerrStatusDownloads.jsx (withDownloads, pollSeerr).
import $L from '../../services/i18n.js'
import * as seerrApi from '../../services/seerrApi.js'
import { api } from '../../services/jellyfinApi.js'
import { checkSeerr } from '../../state/seerr.js'
import { MEDIA_STATUS, REQUEST_STATUS } from '../../utils/seerrStatus.js'
import { getStatusPills, isSeasonRerequestable, seasonMarkerStatus } from '../../utils/seerrBadges.js'
import { cancelableRequests, isContinuingSeries, requestOfferFor, seasonNumbersOf, unavailableOrRequestedSeasons } from '../../utils/seerrRequestRules.js'
import { hasMediaFacts } from '../../utils/seerrMediaFacts.js'
import { normalizeMediaItem } from '../../utils/seerrHomeRows.js'
import { streamingProviders as providersFor, streamingRegion } from '../../utils/seerrStreaming.js'
import { IDLE, bestSearchMatch, isSeriesPart, seerrTargetFor, seriesTargetFrom } from '../../utils/seerrTarget.js'

const IDLE_OVERLAY = {
  isActive: false, loading: false, details: null, statusPills: [], seasonMarkers: new Map(), similarCards: [], recommendationCards: [],
  streamingProviders: [], pieces: {}, hasTabContent: false, showsRequest: false, showsRequest4k: false, showsReportIssue: false,
  showsManage: false, showsManageSlot: false, showsWatchlist: false, showsSwapRelease: false, onWatchlist: false, displayName: 'Seerr',
}

export const idleSeerr = () => ({ ...IDLE_OVERLAY })

const chipCount = (d) => ((d && d.genres) || []).length + ((d && d.keywords) || []).length

const pages = async (fetcher, id) => {
  const out = []
  for (let page = 1; page <= 3; page++) {
    try {
      const data = await fetcher(id, page)
      if (data && data.results) out.push(...data.results)
    } catch (e) {
      break
    }
  }
  return out
}

const resolveTarget = async (item) => {
  if (isSeriesPart(item)) {
    const series = await api.getItem(item.SeriesId).catch(() => null)
    return series ? seriesTargetFrom(series) : IDLE
  }
  const target = seerrTargetFor(item)
  if (target.mediaId || !target.imdbId) return target
  let page = await seerrApi.search(target.imdbId).catch(() => null)
  if (!(page && page.results && page.results.length) && target.title) page = await seerrApi.search(target.title).catch(() => null)
  const match = bestSearchMatch((page && page.results) || [], target.mediaType)
  if (!match) return target
  return { ...target, mediaId: match.id, mediaType: match.mediaType === 'tv' || match.mediaType === 'movie' ? match.mediaType : target.mediaType }
}

// `showsSection` is the viewer's detail sections setting.
export const loadSeerrOverlay = async (item, showsSection) => {
  const seerr = await Promise.resolve(checkSeerr()).catch(() => null)
  if (!seerr || !seerr.available || item.Type === 'Person') return idleSeerr()
  const target = await resolveTarget(item)
  if (!target.mediaId) return { ...idleSeerr(), displayName: seerr.displayName }
  const mediaType = target.mediaType
  const isTv = mediaType !== 'movie'
  const [details, userData, publicSettings] = await Promise.all([
    (isTv ? seerrApi.getTv(target.mediaId) : seerrApi.getMovie(target.mediaId)).catch(() => null),
    seerrApi.getUser().catch(() => null),
    seerrApi.getPublicSettings().catch(() => null),
  ])
  if (!details) return { ...idleSeerr(), displayName: seerr.displayName }

  const contextPerms = seerr.user && seerr.user.permissions
  const perms = userData && userData.permissions != null ? userData.permissions : contextPerms != null ? contextPerms : null
  const currentUserId = userData && userData.id != null ? userData.id : null
  const is4kEnabled = (isTv ? publicSettings && publicSettings.series4kEnabled : publicSettings && publicSettings.movie4kEnabled) !== false
  const media = details.mediaInfo || {}
  const hdStatus = media.status != null ? media.status : null
  const status4k = media.status4k != null ? media.status4k : null
  const requests = media.requests || []
  const hdDeclined = requests.some((r) => !r.is4k && r.status === REQUEST_STATUS.DECLINED)
  const fourKDeclined = requests.some((r) => r.is4k && r.status === REQUEST_STATUS.DECLINED)
  const active = requests.filter((r) => r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.APPROVED)
  const pending = requests.filter((r) => r.status === REQUEST_STATUS.PENDING)
  const blocklisted = hdStatus === MEDIA_STATUS.BLOCKLISTED || status4k === MEDIA_STATUS.BLOCKLISTED
  const continuing = isTv && isContinuingSeries(details.status)
  const unrequested = (is4k) => {
    if (!isTv) return false
    const taken = unavailableOrRequestedSeasons(media.seasons, active.filter((r) => Boolean(r.is4k) === is4k), is4k)
    return seasonNumbersOf(details.seasons, details.numberOfSeasons || 0).some((n) => !taken.has(n))
  }
  const hdOffer = requestOfferFor({
    status: hdStatus, hasExistingRequest: active.some((r) => !r.is4k),
    allowed: !blocklisted && !hdDeclined && (isTv ? seerrApi.canRequestTv(perms) : seerrApi.canRequestMovies(perms)),
    isTv, isContinuing: continuing, hasUnrequestedSeasons: unrequested(false),
  })
  const fourKOffer = requestOfferFor({
    status: status4k, hasExistingRequest: active.some((r) => r.is4k),
    allowed: !blocklisted && !fourKDeclined && is4kEnabled && (isTv ? seerrApi.canRequest4kTv(perms) : seerrApi.canRequest4kMovies(perms)),
    isTv, isContinuing: continuing, hasUnrequestedSeasons: unrequested(true),
  })
  const cancelable = (is4k) => cancelableRequests(active.filter((r) => Boolean(r.is4k) === is4k), {
    canManageRequests: seerrApi.canManageRequests(perms), currentUserId,
  })
  const canCancelHd = cancelable(false).length > 0
  const canCancel4k = cancelable(true).length > 0
  const watchable = [MEDIA_STATUS.PARTIALLY_AVAILABLE, MEDIA_STATUS.AVAILABLE]
  const canReportIssue = seerrApi.canCreateIssues(perms) && media.id != null &&
    (watchable.indexOf(hdStatus) >= 0 || watchable.indexOf(status4k) >= 0)
  const canManage = seerrApi.canManageRequests(perms)

  // Season markers for the season cards, from what each season has or has asked for.
  const seasonMarkers = new Map()
  ;(media.seasons || []).forEach((season) => {
    const status = season.status > MEDIA_STATUS.UNKNOWN ? season.status : season.status4k
    if (status > MEDIA_STATUS.UNKNOWN) seasonMarkers.set(season.seasonNumber, status)
  })
  const hdSeasons = new Map()
  requests.forEach((req) => {
    if (req.is4k !== false) return
    ;(req.seasons || []).forEach((sr) => {
      const was = hdSeasons.get(sr.seasonNumber)
      const now = sr.status
      if (!was || (isSeasonRerequestable(was) && !isSeasonRerequestable(now)) || now === REQUEST_STATUS.COMPLETED ||
        (now === REQUEST_STATUS.APPROVED && was === REQUEST_STATUS.PENDING)) hdSeasons.set(sr.seasonNumber, now)
    })
  })
  hdSeasons.forEach((status, n) => {
    if (seasonMarkers.has(n)) return
    const marker = seasonMarkerStatus(status)
    if (marker) seasonMarkers.set(n, marker)
  })

  const showsRecommendations = showsSection('seerrRecommendations')
  const showsSimilar = showsSection('seerrSimilar')
  const [recs, similar] = await Promise.all([
    showsRecommendations ? pages(isTv ? seerrApi.getTvRecommendations : seerrApi.getMovieRecommendations, target.mediaId) : [],
    showsSimilar ? pages(isTv ? seerrApi.getTvSimilar : seerrApi.getMovieSimilar, target.mediaId) : [],
  ])
  const recommendationCards = recs.slice(0, 20).map(normalizeMediaItem)
  const keyOf = (card) => {
    const raw = card._seerrRaw || {}
    return raw.mediaId == null ? null : `${raw.mediaType}:${raw.mediaId}`
  }
  const shown = {}
  recommendationCards.forEach((c) => (shown[keyOf(c)] = true))
  const similarCards = similar.map(normalizeMediaItem).filter((c) => keyOf(c) == null || !shown[keyOf(c)]).slice(0, 20)
  const providers = providersFor(details, streamingRegion(userData, publicSettings))
  const pieces = {
    chips: showsSection('seerrGenresTags') && chipCount(details) > 0,
    facts: showsSection('seerrStats') && hasMediaFacts(details, mediaType),
    streaming: showsSection('seerrStreaming') && providers.length > 0,
    recommendations: recommendationCards.length > 0,
    similar: similarCards.length > 0,
    collection: showsSection('seerrCollection') && Boolean(details.collection),
  }
  const seriesPart = isSeriesPart(item)
  const offersRequest = hdOffer.canRequest
  const out = {
    isActive: true, loading: false, details, mediaType, mediaId: target.mediaId, displayName: seerr.displayName || 'Seerr',
    statusPills: getStatusPills(hdStatus, status4k, hdDeclined, fourKDeclined),
    seasonMarkers, recommendationCards, similarCards, streamingProviders: providers, pieces,
    hasTabContent: Object.keys(pieces).some((k) => pieces[k]),
    offersRequest: hdOffer.canRequest, offersRequest4k: fourKOffer.canRequest, canCancelHd, canCancel4k,
    requestLabel: hdOffer.wantsMore ? $L('Request More') : $L('Request'),
    requestLabel4k: fourKOffer.wantsMore ? $L('Request More in 4K') : $L('Request 4K'),
    showsRequest: offersRequest || canCancelHd,
    showsRequest4k: fourKOffer.canRequest || canCancel4k,
    showsReportIssue: canReportIssue,
    showsManage: canManage && pending.length > 0,
    showsManageSlot: canManage && pending.length > 0,
    showsSwapRelease: false,
    showsWatchlist: true,
    onWatchlist: details.onUserWatchlist === true,
  }
  // A season or episode page only carries the actions. The rest describes the series.
  if (seriesPart) {
    return { ...out, seriesPart: true, statusPills: [], seasonMarkers: new Map(), similarCards: [], recommendationCards: [], streamingProviders: [], pieces: {}, hasTabContent: false }
  }
  return out
}
