import { api as jellyfinApi, getServerUrl } from '../../services/jellyfinApi.js'
import { createChannelCarouselPrewarm } from '../../services/channelCarouselPrewarm.js'
import { channelComparator } from '../../utils/liveTvGuide.js'

// A switch that hasn't started playing by then counts as failed.
const TUNE_TIMEOUT_MS = 35000

const normalizeServer = (url) => (url || '').replace(/\/+$/, '').toLowerCase()

// The guide data and recordings only come from the signed in server, so a channel from another
// server gets no api here.
export const liveTvApiFor = (serverUrl) => (
  !serverUrl || normalizeServer(serverUrl) === normalizeServer(getServerUrl()) ? jellyfinApi : null
)

// The lineup to zap through, the guide data kept warm behind it, and channel switches. A switch
// has to start playing. When it doesn't, the channel that was working plays again.
//
// play(channel) retunes the player. onFailed(channel) hears a switch that failed, onSucceeded() one
// that played, and onRestore(channel) the channel going back on after a failure. The player
// reports each live item it opens through tuned(item, sortBy), playback starting through
// playing(itemId) and an error through failed(itemId).
// shortcut: the lineup is every channel in the saved sort, not the guide's filtered lineup when
// playback started there. Pass the guide's channels in if that order matters.
export const createChannelSwitch = ({
  play, onFailed, onSucceeded, onRestore,
  setTimer = setTimeout, clearTimer = clearTimeout, apiFor = liveTvApiFor, prewarmFor = createChannelCarouselPrewarm,
}) => {
  let lineup = []
  let item = null
  let api = null
  let prewarm = null
  let pending = null

  // The channel being opened counts as the one playing from here on.
  const begin = (target, previous) => {
    const p = { target, previous, timer: null }
    p.timer = setTimer(() => finish(p, false), TUNE_TIMEOUT_MS)
    pending = p
    item = target
    play(target)
  }

  // A restore has no previous channel of its own, so how it ends only ends the switch.
  const finish = (p, ok) => {
    if (pending !== p) return
    clearTimer(p.timer)
    pending = null
    if (!ok) onFailed(p.target)
    if (!p.previous) return
    if (ok) {
      onSucceeded()
      return
    }
    begin(p.previous, null)
    onRestore(p.previous)
  }

  return {
    get lineup() {
      return lineup
    },
    get api() {
      return api
    },
    get prewarm() {
      return prewarm
    },
    switching: () => !!pending,

    // Every live item the player opens. The lineup is loaded once and kept while it holds the
    // channel, and the guide data behind it warms once surfing settles.
    async tuned(next, sortBy) {
      item = next
      api = apiFor(next._serverUrl)
      if (!lineup.some((c) => c.Id === next.Id)) {
        let list = [next]
        if (api) {
          try {
            const res = await api.getLiveTvChannels()
            const all = ((res && res.Items) || []).slice().sort(channelComparator(sortBy))
            if (all.some((c) => c.Id === next.Id)) list = all
          } catch (e) {
            // The carousel still shows this one channel.
          }
          if (item !== next) return
        }
        lineup = list
      }
      if (!api || lineup.length < 2) return
      if (!prewarm) prewarm = prewarmFor(api, { sortBy })
      prewarm.tuned(lineup)
    },

    // Channel up and down zap through the lineup, one switch at a time.
    step(by) {
      const index = item ? lineup.findIndex((c) => c.Id === item.Id) : -1
      if (pending || index < 0 || lineup.length < 2) return false
      begin(lineup[(index + by + lineup.length) % lineup.length], item)
      return true
    },

    // A channel picked in the carousel. Picking the one already playing only closes it.
    select(channel) {
      if (pending) return 'busy'
      if (item && channel.Id === item.Id) return 'same'
      begin(channel, item)
      return 'switching'
    },

    playing(itemId) {
      if (pending && pending.target.Id === itemId) finish(pending, true)
    },

    // True when the switch answers this error itself, so the player shows nothing: the stream
    // it left going down, or a failed switch going back to the channel before. A failed restore
    // shows its error.
    failed(itemId) {
      const p = pending
      if (!p) return false
      if (p.target.Id !== itemId) return true
      finish(p, false)
      return !!p.previous
    },

    // The player's heart flips the channel in the lineup and in the warm guide data.
    markFavorite(channelId, isFavorite) {
      lineup = lineup.map((c) => (c.Id === channelId ? { ...c, UserData: { ...(c.UserData || {}), IsFavorite: isFavorite } } : c))
      if (prewarm) prewarm.store.setChannelFavorite(channelId, isFavorite)
    },

    // A recording made from the player marks its card without waiting on the hourly refresh.
    refreshRecordings() {
      if (prewarm) prewarm.refresh()
    },

    dispose() {
      if (pending) clearTimer(pending.timer)
      pending = null
      if (prewarm) prewarm.dispose()
      prewarm = null
    },
  }
}
