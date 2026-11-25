// The artwork behind every preview: a small pull of random library items shaped down to what the
// previews draw, held in module state so the wizard and Settings read the same items and nothing
// loads twice.
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { getImageUrl, getBackdropId, getPrimaryImageId, getLogoUrl } from '../../../utils/helpers.js'
import { showsWatchedCheck } from '../../../utils/playedState.js'
import { getEpisodeLabels } from '../home/modernCardLayout.js'

let items = []
let loading = false
const listeners = []

const notify = () => listeners.slice().forEach((fn) => fn(items))

export const getPreviewItems = () => items

export const subscribePreviewItems = (fn) => {
  listeners.push(fn)
  return () => {
    const at = listeners.indexOf(fn)
    if (at >= 0) listeners.splice(at, 1)
  }
}

const ticksToMinutes = (ticks) => (ticks ? Math.round(ticks / 600000000) : null)

export const adaptItem = (item) => {
  const serverUrl = getServerUrl()
  const backdropId = getBackdropId(item)
  const posterId = getPrimaryImageId(item)
  const labels = item.Type === 'Episode' ? getEpisodeLabels(item) : null
  return {
    id: item.Id,
    title: item.Name || '',
    seriesName: item.Type === 'Episode' ? item.SeriesName || null : null,
    episodeLine: (labels && labels.full) || null,
    type: item.Type || null,
    year: item.ProductionYear || null,
    officialRating: item.OfficialRating || null,
    runtimeMinutes: ticksToMinutes(item.RunTimeTicks),
    genres: Array.isArray(item.Genres) ? item.Genres : [],
    overview: item.Overview || null,
    communityRating: typeof item.CommunityRating === 'number' ? item.CommunityRating : null,
    posterUrl: posterId ? getImageUrl(serverUrl, posterId, 'Primary', { maxHeight: 360, quality: 80 }) : null,
    backdropUrl: backdropId ? getImageUrl(serverUrl, backdropId, 'Backdrop', { maxWidth: 1280, quality: 85 }) : null,
    logoUrl: getLogoUrl(serverUrl, item, { maxWidth: 800, quality: 90 }),
    played: showsWatchedCheck(item),
    playedPercentage: (item.UserData && item.UserData.PlayedPercentage) || 0,
    unplayedCount: (item.UserData && item.UserData.UnplayedItemCount) || 0,
  }
}

const applyFetched = (result) => {
  const fetched = ((result && result.Items) || []).filter((item) => item.Type !== 'BoxSet')
  if (fetched.length === 0) return false
  items = fetched.map(adaptItem)
  notify()
  return true
}

// The wizard runs seconds after the first sign in, when a first fetch can fail or come back
// empty, so an early miss retries with a growing delay, then asks without the backdrop filter.
export const ensurePreviewItemsLoaded = async () => {
  if (items.length > 0 || loading) return
  loading = true
  try {
    let delay = 2000
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (applyFetched(await api.getRandomItems('both', 10))) return
      } catch (e) {
        console.warn('[SetupWizard] Preview fetch failed:', (e && e.message) || e)
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2
      }
    }
    try {
      if (typeof api.getPreviewItems === 'function') applyFetched(await api.getPreviewItems(10))
    } catch (e) {
      console.warn('[SetupWizard] Preview fallback fetch failed:', (e && e.message) || e)
    }
  } finally {
    loading = false
  }
}
