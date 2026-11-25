import { getImageUrl } from '../../utils/helpers.js'

export const DEFAULT_DETAILS_BACKDROP_INTERVAL_MS = 15000
export const VALID_DETAILS_BACKDROP_INTERVALS_MS = [5000, 10000, 15000, 30000]

export const normalizeBackdropIntervalMs = (value) => {
  const ms = Number(value)
  return VALID_DETAILS_BACKDROP_INTERVALS_MS.includes(ms)
    ? ms
    : DEFAULT_DETAILS_BACKDROP_INTERVAL_MS
}

// All backdrop URLs an item can cycle through on its details screen: its own
// BackdropImageTags first, otherwise its parent's (for seasons and episodes).
export const getDetailBackdropUrls = (serverUrl, item, options = { maxWidth: 1920, quality: 90 }) => {
  if (!item) return []
  if (item._externalBackdropUrl) return [item._externalBackdropUrl]

  const ownTags = item.BackdropImageTags
  const parentId = item.ParentBackdropItemId
  const parentTags = item.ParentBackdropImageTags

  const id = ownTags?.length > 0
    ? item.Id
    : (parentId && parentTags?.length > 0 ? parentId : null)
  const tags = ownTags?.length > 0 ? ownTags : (id ? parentTags : null)
  if (!id || !tags?.length) return []

  const seen = new Set()
  const urls = []
  tags.forEach((tag, index) => {
    const imageType = index === 0 ? 'Backdrop' : `Backdrop/${index}`
    const url = getImageUrl(serverUrl, id, imageType, { ...options, tag, index })
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  })
  return urls
}

// Derives the 640px server-blurred glass URL from an active Jellyfin/Emby backdrop URL,
// preserving the exact item ID, Backdrop/N index, and tag across cycle ticks.
export const toGlassBackdropUrl = (backdropUrl) => {
  if (!backdropUrl) return ''
  const resized = /[?&]maxWidth=\d+/.test(backdropUrl)
    ? backdropUrl.replace(/([?&]maxWidth=)\d+/, '$1640')
    : `${backdropUrl}${backdropUrl.includes('?') ? '&' : '?'}maxWidth=640`
  return /[?&]blur=/.test(resized) ? resized : `${resized}&blur=3`
}

// Fisher-Yates shuffle without replacement so every backdrop is shown once
// before the set repeats. When reshuffling across a cycle boundary, avoid
// repeating `avoidFirst` back-to-back.
export const buildBackdropCycleOrder = (source, shuffle, avoidFirst = null, random = Math.random) => {
  const order = source.slice()
  if (!shuffle || order.length <= 1) return order
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  if (avoidFirst && order[0] === avoidFirst) {
    const swapIdx = 1 + Math.floor(random() * (order.length - 1))
    const tmp = order[0]
    order[0] = order[swapIdx]
    order[swapIdx] = tmp
  }
  return order
}

// Timer-driven backdrop cycler for Details.jsx. Call sync() on every paint with
// the current URL list and settings; only restarts the timer when the list or
// settings change, and supports pause()/resume() when the page is hidden behind
// playback or backgrounded.
export const createBackdropCycler = (onChange, { setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) => {
  let key = ''
  let sourceList = []
  let order = []
  let index = 0
  let current = ''
  let shouldCycle = false
  let shuffleEnabled = true
  let durationMs = DEFAULT_DETAILS_BACKDROP_INTERVAL_MS
  let paused = false
  let timer = null

  const clearTimer = () => {
    if (timer != null) {
      clearIntervalFn(timer)
      timer = null
    }
  }

  const startTimer = () => {
    if (timer != null || !shouldCycle || paused || sourceList.length <= 1) return
    timer = setIntervalFn(() => {
      const nextIndex = index + 1
      if (nextIndex >= order.length) {
        const lastShown = order[order.length - 1] || null
        order = buildBackdropCycleOrder(sourceList, shuffleEnabled, lastShown)
        index = 0
      } else {
        index = nextIndex
      }
      current = order[index]
      if (onChange) onChange(current)
    }, durationMs)
  }

  const stop = () => {
    clearTimer()
    key = ''
  }

  const pause = () => {
    paused = true
    clearTimer()
  }

  const resume = () => {
    paused = false
    startTimer()
  }

  const sync = (urls, { enabled = true, shuffle = true, intervalMs = DEFAULT_DETAILS_BACKDROP_INTERVAL_MS, isPaused = paused } = {}) => {
    const list = Array.isArray(urls) ? urls : []
    const nextDurationMs = normalizeBackdropIntervalMs(intervalMs)
    const nextShouldCycle = Boolean(enabled) && list.length > 1
    const nextKey = `${list.join('\n')}|${nextShouldCycle ? 1 : 0}|${shuffle ? 1 : 0}|${nextDurationMs}`
    paused = Boolean(isPaused)

    if (nextKey === key) {
      if (paused) clearTimer()
      else startTimer()
      return current
    }

    clearTimer()
    key = nextKey
    sourceList = list
    shouldCycle = nextShouldCycle
    shuffleEnabled = Boolean(shuffle)
    durationMs = nextDurationMs

    if (!list.length) {
      order = []
      index = 0
      current = ''
      return current
    }
    if (!shouldCycle) {
      order = list.slice()
      index = 0
      current = order[0]
      return current
    }

    order = buildBackdropCycleOrder(list, shuffleEnabled)
    index = 0
    current = order[0]
    startTimer()
    return current
  }

  return { sync, pause, resume, stop }
}
