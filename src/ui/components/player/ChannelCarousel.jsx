import { Index, createSignal, onCleanup } from 'solid-js'
import CarouselCard from './CarouselCard.jsx'
import { EMPTY_CARD, PITCH, SLOTS, VISIBLE, cardModel, currentProgram, headerModel, lineCount, slotPlan } from './carouselModels.js'
import { createLiveTvGuideStore } from '../../../services/liveTvGuideStore.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import * as settings from '../../../state/settings.js'
import { carouselNeighborhood, channelComparator, channelIndexFor, guideLeftEdge } from '../../../utils/liveTvGuide.js'
import { remoteShortcut } from '../../../utils/keys.js'
import { fontFor, textWidth } from '../../text.js'
import { tx } from '../../fx.js'

const HOLD_START_DELAY_MS = 350
const HOLD_REPEAT_MS = 110
const HOLD_SAFETY_MS = 900
const SETTLE_DEBOUNCE_MS = 150
const BLIND_LOAD_THROTTLE_MS = 500
const INACTIVITY_MS = 2 * 60 * 1000
const EXIT_MS = 140
const NOTICE_MS = 4000
const DRIFT_LINEUPS = 100
const READING_CHARS_PER_SECOND = 17

const ENTER_EASE = 'cubic-bezier(0.215, 0.61, 0.355, 1)'
const EXIT_EASE = 'cubic-bezier(0.55, 0.055, 0.675, 0.19)'
const STRIP_W = 1824

// The channel carousel over live playback: the program header over a strip of channel cards whose
// centered card is the selection. The strip wraps at both ends, and holding Left or Right runs
// through the lineup. It takes its guide data from the prewarm the player keeps, or loads its own
// store when there's none.
//
// The holder mounts it while it's up, calls open({ prewarm, api, channels, currentChannelId,
// sortBy }) and focuses it, and hears onCarouselSelect(channel), onCarouselDismiss() after Back has
// slid it away, and onCarouselControls() when Down asks for the controls. sync(channelId) moves the
// strip back to the channel the player went back to, showNotice(text) shows a failed switch and
// close() takes it down at once.
//
// Only SLOTS cards exist. Each holds the raw index that's its own modulo, so a move rewrites the
// one card that left the far edge and flips the centered look on two. The track moves by whole
// pitches as the raw index grows either way, so it's laid out `shift` to the right of its own
// origin and sized to cover every raw index the strip can reach, or the renderer would cull it.
export default function ChannelCarousel(props) {
  const [shown, setShown] = createSignal(false)
  const [moveMs, setMoveMs] = createSignal(0)
  const [easing, setEasing] = createSignal(ENTER_EASE)
  const [ready, setReady] = createSignal(false)
  const [slots, setSlots] = createSignal([])
  const [trackX, setTrackX] = createSignal(0)
  const [trackMs, setTrackMs] = createSignal(0)
  const [shift, setShift] = createSignal(0)
  const [headTitle, setHeadTitle] = createSignal('')
  const [headMeta, setHeadMeta] = createSignal('')
  const [headOverview, setHeadOverview] = createSignal('')
  const [titleFont, setTitleFont] = createSignal('roboto-bold')
  const [metaFont, setMetaFont] = createSignal('roboto')
  const [overviewFont, setOverviewFont] = createSignal('roboto')
  const [ovY, setOvY] = createSignal(0)
  const [ovMs, setOvMs] = createSignal(0)
  const [notice, setNotice] = createSignal('')
  const [noticeFont, setNoticeFont] = createSignal('roboto')
  const [noticeW, setNoticeW] = createSignal(0)

  const st = {
    dismissed: false,
    timers: {},
    hold: { direction: 0, start: null, repeat: null, watchdog: null },
    load: { busy: false, again: false, lastBlind: 0 },
    models: {},
    prewarm: null,
    ownStore: null,
    store: null,
    lineup: [],
    channels: [],
    clock: null,
    server: '',
    ready: false,
    raw: 0,
    centeredId: null,
    slots: null,
    unsubscribe: null,
  }

  const clearTimer = (name) => {
    if (st.timers[name]) clearTimeout(st.timers[name])
    st.timers[name] = null
  }
  const endHold = () => {
    const hold = st.hold
    if (!hold) return
    if (hold.start) clearTimeout(hold.start)
    if (hold.repeat) clearInterval(hold.repeat)
    if (hold.watchdog) clearTimeout(hold.watchdog)
    st.hold = { direction: 0, start: null, repeat: null, watchdog: null }
  }
  const teardown = () => {
    Object.keys(st.timers).forEach((k) => clearTimeout(st.timers[k]))
    st.timers = {}
    endHold()
    if (st.unsubscribe) st.unsubscribe()
    st.unsubscribe = null
    if (st.ownStore) {
      st.ownStore.cancelBoundaryRefresh()
      st.ownStore.dispose()
      st.ownStore = null
    }
  }

  // A description past two lines scrolls up at reading pace, holds on its last lines, then snaps
  // back and starts over.
  const stopMarquee = () => {
    clearTimer('marquee')
    setOvMs(0)
    setOvY(0)
  }
  const startMarquee = (text) => {
    stopMarquee()
    const lines = text ? lineCount(text, 26, 1778) : 0
    if (lines <= 2) return
    const textH = lines * 32.5
    const viewH = 65
    const chars = text.length
    const msPerChar = 1000 / READING_CHARS_PER_SECOND
    const visibleMs = ((chars * viewH) / textH) * msPerChar
    const holdMs = Math.max(1600, Math.round(visibleMs))
    const scrollMs = Math.round(((chars * (textH - viewH)) / textH) * msPerChar)
    const endHoldMs = Math.max(1600, Math.round(visibleMs / 2))
    const cycle = () => {
      st.timers.marquee = setTimeout(() => {
        setOvMs(scrollMs)
        setOvY(viewH - textH)
        st.timers.marquee = setTimeout(() => {
          setOvMs(0)
          setOvY(0)
          cycle()
        }, scrollMs + endHoldMs)
      }, holdMs)
    }
    cycle()
  }
  const setHeader = (channel, program) => {
    const h = headerModel(channel, program || null, st.clock)
    if (h.title !== headTitle()) {
      setTitleFont(fontFor(h.title, 'bold'))
      setHeadTitle(h.title)
    }
    if (h.meta !== headMeta()) {
      setMetaFont(fontFor(h.meta))
      setHeadMeta(h.meta)
    }
    if (h.overview !== headOverview()) {
      setOverviewFont(fontFor(h.overview))
      setHeadOverview(h.overview)
      startMarquee(h.overview)
    }
  }
  const updateHeader = () => {
    const id = st.centeredId
    if (!id) return
    const channel = st.channels.find((c) => c.Id === id) || null
    setHeader(channel, currentProgram(st.store, id, Date.now()))
  }
  const scheduleHeader = () => {
    clearTimer('header')
    st.timers.header = setTimeout(() => {
      if (st.hold.direction) {
        scheduleHeader()
        return
      }
      updateHeader()
    }, SETTLE_DEBOUNCE_MS)
  }

  const modelFor = (channel) => {
    let m = st.models[channel.Id]
    if (!m) {
      m = cardModel(channel, st.store, Date.now(), st.server, st.clock)
      st.models[channel.Id] = m
    }
    return m
  }
  // Puts each slot where the plan says. A slot whose place, channel or look is unchanged keeps its
  // object, so the strip only redraws the cards that differ.
  const layoutStrip = (animate) => {
    const count = st.channels.length
    if (!st.ready || !count) return
    const big = count > VISIBLE
    const want = big ? SLOTS : count
    let list = st.slots || []
    if (list.length !== want) {
      list = []
      for (let n = 0; n < want; n++) list.push({ k: `s${n}`, x: 0, m: EMPTY_CARD, c: false, ch: -1 })
    }
    const next = list.slice()
    let changed = next.length !== (st.slots || []).length
    slotPlan(st.raw, count).forEach((p) => {
      const s = next[p.slot]
      const m = modelFor(st.channels[p.channel])
      if (s.x !== p.x || s.m !== m || s.c !== p.centered) {
        next[p.slot] = { k: s.k, x: p.x, m, c: p.centered, ch: p.channel }
        changed = true
      }
    })
    st.slots = next
    // The timing goes first, so a jump or a new lineup's shift never animates.
    setTrackMs(animate && big ? HOLD_REPEAT_MS : 0)
    setShift((count * DRIFT_LINEUPS + SLOTS) * PITCH)
    if (changed) setSlots(next)
    setTrackX(big ? -st.raw * PITCH : 0)
  }
  // New guide data: every card on the strip takes its fresh model.
  const refreshSlots = () => {
    const next = (st.slots || []).map((s) => {
      const channel = st.channels[s.ch]
      const m = channel ? modelFor(channel) : s.m
      return m === s.m ? s : { ...s, m }
    })
    st.slots = next
    setSlots(next)
  }
  const loadVisible = async () => {
    const store = st.store
    if (!st.ready || !store) return
    const load = st.load
    if (load.busy) {
      load.again = true
      return
    }
    load.busy = true
    const ids = carouselNeighborhood(st.channels, st.centeredId, VISIBLE)
    try {
      if (st.prewarm) await st.prewarm.ensureVisibleChannels(ids)
      else {
        await store.ensureProgramsForChannels(ids)
        store.scheduleBoundaryRefresh()
      }
    } catch (e) {
      // Cached cards stay when a newly visible channel can't be loaded.
    } finally {
      load.busy = false
      if (load.again) {
        load.again = false
        scheduleVisibleLoad()
      }
    }
  }
  const scheduleVisibleLoad = () => {
    clearTimer('load')
    const store = st.store
    if (st.ready && store && !store.unfilteredProgramsForChannel(st.centeredId).length) {
      const now = Date.now()
      if (now - st.load.lastBlind >= BLIND_LOAD_THROTTLE_MS) {
        st.load.lastBlind = now
        loadVisible()
        return
      }
    }
    st.timers.load = setTimeout(loadVisible, SETTLE_DEBOUNCE_MS)
  }
  const finishLoad = () => {
    const store = st.store
    if (st.dismissed || !store) return
    const ids = new Set(st.lineup.map((c) => c.Id))
    const next = store.filteredChannels.filter((c) => ids.has(c.Id))
    if (!next.length) {
      dismiss()
      return
    }
    const index = Math.max(0, next.findIndex((c) => c.Id === st.centeredId))
    st.channels = next
    st.raw = index
    st.centeredId = next[index].Id
    st.ready = true
    setReady(true)
    st.models = {}
    layoutStrip(false)
    if (!st.prewarm) store.scheduleBoundaryRefresh()
    scheduleHeader()
    scheduleVisibleLoad()
  }
  // A store of its own refreshes on the quarter hour, the way a prewarm's does on its own.
  const scheduleQuarterHour = () => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), (Math.floor(now.getMinutes() / 15) + 1) * 15)
    st.timers.quarter = setTimeout(() => {
      if (st.ownStore) st.ownStore.refreshAtQuarterHour()
      scheduleQuarterHour()
    }, next.getTime() - now.getTime())
  }
  const subscribe = () => {
    const store = st.store
    if (!store) return
    st.unsubscribe = store.subscribe(() => {
      st.models = {}
      if (st.ready) refreshSlots()
      if (st.ready && !st.hold.direction) updateHeader()
      else if (st.ready) scheduleHeader()
    })
    const prewarm = st.prewarm
    if (prewarm && prewarm.isWarm) {
      prewarm.ensureReady()
      scheduleHeader()
      scheduleVisibleLoad()
    } else if (prewarm) {
      prewarm.ensureReady().then(finishLoad)
    } else {
      store
        .load({
          initialChannelIds: carouselNeighborhood(st.channels, st.centeredId, VISIBLE),
          windowStart: guideLeftEdge(Date.now()),
          livePosition: true,
        })
        .then(finishLoad)
      scheduleQuarterHour()
    }
  }

  const moveBy = (delta) => {
    const total = st.channels.length
    if (total <= 1 || !delta) return
    const before = channelIndexFor(st.raw, total)
    let target = st.raw + delta
    let jump = false
    if (Math.abs(target) >= total * DRIFT_LINEUPS) {
      // A whole number of lineups away, so the same channel sits at the center after the jump.
      target -= Math.round(target / total) * total
      jump = true
    }
    st.raw = target
    layoutStrip(!jump)
    const after = channelIndexFor(target, total)
    if (after !== before) {
      st.centeredId = st.channels[after].Id
      setHeader(null)
      scheduleHeader()
      scheduleVisibleLoad()
    }
  }

  const stepFromTimer = () => {
    if (st.hold.direction) moveBy(st.hold.direction)
  }
  const beginHold = (direction) => {
    const hold = st.hold
    if (hold.start) clearTimeout(hold.start)
    if (hold.repeat) clearInterval(hold.repeat)
    hold.direction = direction
    moveBy(direction)
    hold.start = setTimeout(() => {
      stepFromTimer()
      st.hold.repeat = setInterval(stepFromTimer, HOLD_REPEAT_MS)
    }, HOLD_START_DELAY_MS)
  }
  // Refreshed by each incoming key event only, so a hold whose key up never arrives can't scroll forever.
  const refreshWatchdog = () => {
    if (st.hold.watchdog) clearTimeout(st.hold.watchdog)
    st.hold.watchdog = setTimeout(endHold, HOLD_SAFETY_MS)
  }
  const resetInactivity = () => {
    clearTimer('hide')
    if (!st.dismissed) st.timers.hide = setTimeout(dismiss, INACTIVITY_MS)
  }
  // Older engines don't flag a repeat, so a press in the direction already held counts as one.
  // A new direction, or a hold the watchdog ended, starts over. Key up ends the hold.
  const arrow = (direction) => {
    if (st.dismissed) return true
    resetInactivity()
    refreshWatchdog()
    if (st.hold.direction !== direction) beginHold(direction)
    return true
  }

  const open =({ prewarm, api, channels, currentChannelId, sortBy }) => {
    teardown()
    st.dismissed = false
    st.hold = { direction: 0, start: null, repeat: null, watchdog: null }
    st.load = { busy: false, again: false, lastBlind: 0 }
    st.models = {}
    st.prewarm = prewarm || null
    st.ownStore = !prewarm && api ? createLiveTvGuideStore(api, { sortBy }) : null
    st.store = prewarm ? prewarm.store : st.ownStore
    st.lineup = channels || []
    st.clock = settings.get('clockDisplay')
    st.server = getServerUrl()
    let initial = null
    if (prewarm && prewarm.isWarm) {
      const ids = new Set(st.lineup.map((c) => c.Id))
      const warmed = prewarm.store.filteredChannels.filter((c) => ids.has(c.Id))
      if (warmed.length) initial = warmed
    }
    st.channels = initial || st.lineup.slice().sort(channelComparator(sortBy))
    st.ready = !st.store || !!(prewarm && prewarm.isWarm)
    st.raw = Math.max(0, st.channels.findIndex((c) => c.Id === currentChannelId))
    st.centeredId = st.channels[st.raw] ? st.channels[st.raw].Id : null
    setReady(st.ready)
    setNotice('')
    layoutStrip(false)
    if (st.ready && st.centeredId) updateHeader()
    else setHeader(null)
    subscribe()
    // It slides in from below a frame after it's laid out, so the entry animates.
    setMoveMs(0)
    setShown(false)
    st.timers.enter = setTimeout(() => {
      setEasing(ENTER_EASE)
      setMoveMs(180)
      setShown(true)
    }, 16)
    resetInactivity()
  }
  // Taken down at once, when Down hands over to the controls or the player closes it.
  const close = () => {
    teardown()
    st.dismissed = true
    setMoveMs(0)
    setShown(false)
    setNotice('')
    stopMarquee()
  }
  // Slides the strip away before telling the holder, which then gives focus back.
  const dismiss = () => {
    if (st.dismissed) return
    st.dismissed = true
    endHold()
    clearTimer('hide')
    setEasing(EXIT_EASE)
    setMoveMs(EXIT_MS)
    setShown(false)
    st.timers.exit = setTimeout(() => {
      teardown()
      stopMarquee()
      if (props.onCarouselDismiss) props.onCarouselDismiss()
    }, EXIT_MS)
  }
  // The player went back to the channel that was working after a switch failed, so the strip goes
  // back to it too, without sliding there.
  const sync = (channelId) => {
    if (st.dismissed || !st.channels) return
    const list = st.channels
    const index = list.findIndex((c) => c.Id === channelId)
    const centered = channelIndexFor(st.raw, list.length)
    if (index < 0 || index === centered) return
    endHold()
    st.raw = st.raw - centered + index
    st.centeredId = channelId
    layoutStrip(false)
    scheduleHeader()
    scheduleVisibleLoad()
  }
  const showNotice = (text) => {
    clearTimer('notice')
    setNoticeFont(fontFor(text))
    setNoticeW(textWidth(text, 20) + 56)
    setNotice(text)
    st.timers.notice = setTimeout(() => setNotice(''), NOTICE_MS)
  }
  onCleanup(teardown)

  return (
    <view
      ref={(n) => {
        n.open = open
        n.close = close
        n.sync = sync
        n.showNotice = showNotice
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={472.95}
      transition={tx({ y: { duration: moveMs(), easing: easing() } })}
      y={shown() ? 607.05 : 1080}
      onLeft={() => arrow(-1)}
      onRight={() => arrow(1)}
      onLeftRelease={() => {
        endHold()
        return false
      }}
      onRightRelease={() => {
        endHold()
        return false
      }}
      // Up does nothing here, and taking it keeps focus from wandering behind the strip.
      onUp={() => {
        if (!st.dismissed) resetInactivity()
        return true
      }}
      onDown={() => {
        if (st.dismissed) return true
        st.dismissed = true
        endHold()
        clearTimer('hide')
        if (props.onCarouselControls) props.onCarouselControls()
        return true
      }}
      onEnter={() => {
        if (st.dismissed) return true
        resetInactivity()
        endHold()
        const list = st.channels || []
        const channel = list[channelIndexFor(st.raw, list.length)]
        if (channel && props.onCarouselSelect) props.onCarouselSelect(channel)
        return true
      }}
      onBack={() => {
        dismiss()
        return true
      }}
      // Stop, Guide and Recordings still leave the player with the strip up. It takes every other key.
      onStop={() => false}
      onKeyPress={(e, mapped) => {
        if (mapped === 'Stop') return false
        const shortcut = remoteShortcut(e)
        if (shortcut === 'guide' || shortcut === 'recordings') return false
        if (!st.dismissed) resetInactivity()
        return true
      }}
    >
      <view width={1920} height={132.43} colorTop="#00000000" colorBottom="#000000d1" />
      <view y={132.43} width={1920} height={340.52} colorTop="#000000d1" colorBottom="#000000f0" />
      <text fontFamily={titleFont()} fontSize={29} lineHeight={34} x={71} y={59.5} maxWidth={1778} maxLines={1} color="#ffffffff">
        {headTitle() || ' '}
      </text>
      <text fontFamily={metaFont()} fontSize={20} lineHeight={24} x={71} y={96} maxWidth={1778} maxLines={1} color="#ffffffb3">
        {headMeta() || ' '}
      </text>
      <view x={71} y={124} width={1778} height={65} clipping>
        <text
          fontFamily={overviewFont()}
          fontSize={26}
          lineHeight={32.5}
          maxWidth={1778}
          color="#ffffff99"
          transition={tx({ y: { duration: ovMs(), easing: 'linear' } })}
          y={2.5 + ovY()}
        >
          {headOverview() || ' '}
        </text>
      </view>
      <view x={48} y={206} width={STRIP_W} height={218.95} clipping alpha={ready() ? 1 : 0}>
        <view
          width={2 * shift() + STRIP_W}
          height={218.95}
          transition={tx({ x: { duration: trackMs(), easing: 'linear' } })}
          x={trackX() - shift()}
        >
          <Index each={slots()}>{(s) => <CarouselCard x={shift() + s().x} m={s().m} centered={s().c} />}</Index>
        </view>
      </view>
      <view alpha={notice() ? 1 : 0} x={960 - noticeW() / 2} y={352} width={noticeW()} height={61} borderRadius={12} color="#1e1e28e6">
        <text fontFamily={noticeFont()} fontSize={20} lineHeight={33} x={28} y={16} color="#ffffffff">
          {notice() || ' '}
        </text>
      </view>
    </view>
  )
}
