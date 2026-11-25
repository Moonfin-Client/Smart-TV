import $L from '../../../services/i18n.js'
import { batch, onCleanup } from 'solid-js'
import { getImageUrl } from '../../../utils/helpers.js'
import { localeDate } from '../../../utils/dateFormat.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { get as setting } from '../../../state/settings.js'
import { reactive } from '../../../state/reactive.js'
import { colors } from '../../theme.js'
import { hex } from '../../color.js'
import { faceDy, fontFor } from '../../text.js'
import { FADE_MS, INFO_MS, PREFETCH_AHEAD, bottomBar, canStartSlideshow, stepIndex, viewerItems } from './photoSlideshow.js'
import { keepAwake, onHidden, prefetchImage } from './photoHost.js'

// The fullscreen photo viewer. The page holding it gets the viewer's root node through `ref`, with
// open(item, items, opts), items(), setItems, setMore, showItem, setRunning, running() and close()
// on it, and hears onViewerMore(), onViewerClose(item) and onViewerPlayVideo(item, index, byHand).

// Each text offset is where Roboto sits in its 33 px line, and a theme's face moves it by faceDy.
const at = (base, size) => base + faceDy(size, false)

const SLOTS = 3
const empty = () => ({ src: '', x: 0, y: 0, w: 1920, h: 1080, a: 0 })
const FADE = { alpha: { duration: 1000, easing: 'ease-in-out' } }
const SPINNER_EDGE = { width: 3, color: hex('#ffffff26') }
const FAIL_EDGE = { width: 3, color: hex('#ffffff66') }
const BUTTON_EDGE = { width: 3, color: hex('#00a4dc') }

const photoUrl = (it) =>
  getImageUrl(it._serverUrl || getServerUrl(), it.Id, 'Primary', { maxWidth: 1920, maxHeight: 1080, quality: 90 }) || ''

export default function PhotoViewer(props) {
  const st = reactive({
    shown: false,
    s0: empty(),
    s1: empty(),
    s2: empty(),
    spinnerOn: false,
    failed: false,
    canPlay: false,
    showButton: false,
    running: false,
    playsVideo: false,
    info: true,
    spin: 0,
    counter: '',
    name: '',
    date: '',
    meta: '',
    hint: '',
    barTop: 1080,
    barH: 0,
    nameY: 0,
    dateY: 0,
    metaY: 0,
    buttonY: 0,
    hintY: 0,
    labelW: 109,
  })
  const shiftFail = at(563, 24)
  const shiftCounter = at(23, 24)
  const shiftName = at(3, 28)
  const shiftDate = at(1, 20)
  const shiftMeta = at(1, 18)
  const shiftLabel = at(16, 24)
  const shiftHint = at(1, 16)
  const failText = $L("This photo can't be shown")
  const slideLabel = $L('Slideshow')
  const my = {
    list: [],
    cur: 0,
    slots: [null, null, null],
    urls: {},
    age: [0, 1, 2],
    loaded: {},
    dims: {},
    more: 0,
    videos: true,
    playable: true,
    pending: null,
    lastShown: null,
    loading: false,
    awake: false,
    pre: {},
  }
  const timers = {}
  const clear = (name) => {
    clearTimeout(timers[name])
    timers[name] = null
  }
  const stopTimers = () => ['fade', 'advance', 'info', 'drop', 'spinner'].forEach(clear)

  const current = () => my.list[my.cur]
  const show = () => {
    const it = current()
    if (!it) return
    // A video the slideshow reaches plays in the player, so its still isn't drawn on the way.
    st.playsVideo = st.running && my.videos && it.Type === 'Video'
    if (!st.playsVideo && my.slots.indexOf(it.Id) < 0) addLayer(it)
    paint()
    labels()
    prefetch()
    syncAwake()
    schedule()
    if (st.playsVideo && props.onViewerPlayVideo) props.onViewerPlayVideo(it, my.cur, false)
  }
  // A photo left behind stays a moment, fading out as the next fades in. Past three layers the oldest goes.
  const addLayer = (it) => {
    let slot = my.slots.indexOf(null)
    if (slot < 0) slot = my.age[0]
    my.age = my.age.filter((s) => s !== slot).concat(slot)
    my.slots[slot] = it.Id
    my.urls[slot] = photoUrl(it)
  }
  const paint = () => {
    const id = (current() || {}).Id
    const status = my.loaded[id]
    const settled = status !== undefined
    batch(() => {
      for (let s = 0; s < SLOTS; s++) {
        const lid = my.slots[s]
        let next = empty()
        if (lid) {
          const on = lid === id ? status === 'ok' : !settled && lid === my.lastShown
          const d = my.dims[lid]
          // Shown at its own size up to the screen's, and centered.
          const scale = d ? Math.min(1, 1920 / d.w, 1080 / d.h) : 1
          const w = d ? Math.round(d.w * scale) : 1920
          const h = d ? Math.round(d.h * scale) : 1080
          // One still loading keeps a sliver of alpha, since the renderer doesn't load what can't be seen.
          const a = on ? 1 : lid === id && !settled ? 0.01 : 0
          next = { src: my.urls[s], x: Math.round((1920 - w) / 2), y: Math.round((1080 - h) / 2), w, h, a }
        }
        st[`s${s}`] = next
      }
      st.failed = status === 'failed'
    })
    const loading = st.shown && !settled && !st.playsVideo
    if (loading === my.loading) return
    my.loading = loading
    // The ring fades in only once a photo has taken half a second.
    clear('spinner')
    st.spinnerOn = false
    if (loading) {
      timers.spinner = setTimeout(() => {
        st.spinnerOn = true
      }, 500)
      turn()
    }
  }
  // The ring turns once every 0.8 seconds while it can be seen.
  const turn = () => {
    if (timers.turn) return
    st.spin += 360
    timers.turn = setInterval(() => {
      if (!my.loading || !st.shown) {
        clearInterval(timers.turn)
        timers.turn = null
        return
      }
      st.spin += 360
    }, 800)
  }
  const settle = (slot, status, dims) => {
    const id = my.slots[slot]
    if (!id) return
    if (dims && dims.w) my.dims[id] = dims
    my.loaded[id] = status
    if (id !== (current() || {}).Id) return
    if (status === 'ok') my.lastShown = id
    paint()
    schedule()
    // Once the photo has appeared (or failed) the ones behind it have faded out and are dropped.
    clear('drop')
    timers.drop = setTimeout(() => {
      if ((current() || {}).Id !== id) return
      for (let s = 0; s < SLOTS; s++) if (my.slots[s] && my.slots[s] !== id) my.slots[s] = null
      const kept = my.loaded[id]
      my.loaded = {}
      my.loaded[id] = kept
      paint()
    }, FADE_MS + 100)
  }
  const labels = () => {
    const list = my.list
    const it = current() || {}
    const many = list.length > 1
    const when = it.PremiereDate || it.DateCreated
    const date = when ? localeDate(new Date(when), { year: 'numeric', month: 'long', day: 'numeric' }) : ''
    const meta = it.Width && it.Height ? `${it.Width} × ${it.Height}` : ''
    const canPlay = it.Type === 'Video' && my.playable && !st.playsVideo
    const showButton = st.running || canStartSlideshow(list, my.cur, my.videos)
    const ok = canPlay ? $L('OK Play') : showButton ? $L('OK Slideshow') : $L('OK Toggle info')
    const bar = bottomBar({ date: !!date, meta: !!meta, button: showButton, hint: many })
    batch(() => {
      st.counter = many ? `${my.cur + 1} / ${list.length + my.more}` : ''
      st.name = it.Name || ''
      st.date = date
      st.meta = meta
      st.canPlay = canPlay
      st.showButton = showButton
      // The gap between the parts is a space, a no-break space and a space.
      st.hint = many ? `${$L('◀ ▶ Navigate')}   ${ok}   ${$L('Back Close')}` : ''
      st.barTop = bar.top
      st.barH = bar.height
      st.nameY = bar.at.name
      st.dateY = bar.at.date || 0
      st.metaY = bar.at.meta || 0
      st.buttonY = bar.at.button || 0
      st.hintY = bar.at.hint || 0
    })
  }
  // The next two and the previous photo are fetched ahead and held, since an image nothing refers to
  // can be dropped before it's used.
  const prefetch = () => {
    const list = my.list
    const kept = {}
    ;[1, 2, -1].forEach((off) => {
      const idx = (my.cur + off + list.length * 2) % list.length
      const it = list[idx]
      if (!it || idx === my.cur || it.Type === 'Video') return
      kept[it.Id] = my.pre[it.Id] || prefetchImage(photoUrl(it))
    })
    my.pre = kept
  }
  // A photo's countdown starts once it has loaded (or failed) and faded in.
  const schedule = () => {
    clear('fade')
    clear('advance')
    const status = my.loaded[(current() || {}).Id]
    if (!st.running || st.playsVideo || status === undefined) return
    const interval = Math.min(30, Math.max(3, Number(setting('photoSlideshowInterval')) || 5)) * 1000
    timers.fade = setTimeout(() => {
      timers.advance = setTimeout(() => step(1, true), interval)
    }, status === 'failed' ? 0 : FADE_MS)
  }
  // A running slideshow on a photo keeps the TV from dimming or starting its own screensaver.
  const syncAwake = () => {
    const on = st.running && !st.playsVideo && st.shown
    if (on === my.awake) return
    my.awake = on
    keepAwake(on)
  }
  // Browsing brings the info up on each photo, while a running slideshow leaves the controls as they are.
  const step = (dir, auto) => {
    const list = my.list
    const hasMore = my.more > 0
    if (list.length <= 1 && !hasMore) return
    if (!st.running && auto !== true) resetInfo()
    if (dir > 0 && hasMore && my.cur === list.length - 1) {
      // A step past the last photo loaded waits for the rest of the folder rather than wrapping.
      if (!my.pending) {
        my.pending = { auto: auto === true, length: list.length }
        needMore()
      }
      return
    }
    if (list.length <= 1) return
    my.cur = stepIndex(list, my.cur, dir, auto === true && !my.videos)
    show()
    afterChange()
  }
  // More is asked for as the end of what's loaded gets near, and a step that was waiting goes ahead once it's in.
  const afterChange = () => {
    if (my.more <= 0) return
    const pending = my.pending
    if (pending && my.list.length > pending.length) {
      my.pending = null
      step(1, pending.auto)
    } else if (pending || my.cur >= my.list.length - PREFETCH_AHEAD) needMore()
  }
  const needMore = () => props.onViewerMore && props.onViewerMore()
  const resetInfo = () => {
    st.info = true
    clear('info')
    timers.info = setTimeout(() => {
      st.info = false
    }, INFO_MS)
  }
  // Up and down bring the controls up, or close them when they're already up.
  const toggleControls = () => {
    if (!st.info) {
      resetInfo()
      return
    }
    clear('info')
    st.info = false
  }
  const setRunning = (on) => {
    st.running = !!on
    show()
  }
  const toggleSlideshow = () => {
    clear('info')
    st.info = false
    setRunning(!st.running)
  }
  // Picked by hand, so it plays like any other video rather than as part of the slideshow.
  const playVideo = () => {
    const it = current()
    if (st.running) setRunning(false)
    if (props.onViewerPlayVideo) props.onViewerPlayVideo(it, my.cur, true)
  }
  const close = () => {
    const item = current()
    stopTimers()
    st.running = false
    st.shown = false
    syncAwake()
    my.slots = [null, null, null]
    paint()
    if (props.onViewerClose) props.onViewerClose(item)
  }

  // opts: more (how many more the folder holds), videos (a slideshow plays videos) and playable (the
  // page can play a video at all, which it can't in a SyncPlay group or a Watch Party).
  const open = (item, items, opts) => {
    const o = opts || {}
    my.list = viewerItems(items, item)
    my.more = o.more || 0
    my.videos = o.videos !== false
    my.playable = o.playable !== false
    my.pending = null
    my.loaded = {}
    my.dims = {}
    my.lastShown = null
    my.slots = [null, null, null]
    const at = item ? my.list.findIndex((i) => i.Id === item.Id) : 0
    my.cur = at >= 0 ? at : 0
    st.running = false
    st.shown = true
    show()
    resetInfo()
  }
  const setItems = (items, more) => {
    const at = my.list[my.cur]
    my.list = viewerItems(items, at)
    if (more != null) my.more = more
    const found = at ? my.list.findIndex((it) => it.Id === at.Id) : -1
    if (found >= 0) my.cur = found
    labels()
    afterChange()
  }
  const setMore = (more) => {
    const had = my.more > 0
    my.more = more
    labels()
    // There turned out to be no more, so a step that was waiting goes ahead.
    if (had && !more && my.pending) {
      const pending = my.pending
      my.pending = null
      step(1, pending.auto)
    } else afterChange()
  }
  // The page brings the viewer back on an item after the player.
  const showItem = (item) => {
    const at = item ? my.list.findIndex((i) => i.Id === item.Id) : -1
    if (at >= 0) my.cur = at
    show()
  }

  const offHidden = onHidden(() => st.running && setRunning(false))
  onCleanup(() => {
    offHidden()
    stopTimers()
    clearInterval(timers.turn)
    if (my.awake) keepAwake(false)
  })

  const slot = (i) => {
    const s = () => st[`s${i}`]
    return (
      <view
        transition={FADE}
        src={s().src}
        x={s().x}
        y={s().y}
        width={s().w}
        height={s().h}
        alpha={s().a}
        onEvent={{ loaded: (n, e) => settle(i, 'ok', e && e.dimensions), failed: () => settle(i, 'failed') }}
      />
    )
  }
  const key = (fn) => () => {
    fn()
    return true
  }

  return (
    <view
      ref={(n) => {
        Object.assign(n, { open, items: () => my.list, setItems, setMore, showItem, setRunning, running: () => st.running, close })
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color="#000000"
      alpha={st.shown ? 1 : 0}
      onLeft={key(() => step(-1))}
      onRight={key(() => step(1))}
      onUp={key(toggleControls)}
      onDown={key(toggleControls)}
      onEnter={(e) => {
        if (e && e.repeat) return true
        if (st.canPlay) playVideo()
        else if (!st.showButton) st.info = !st.info
        else if (st.info) toggleSlideshow()
        else resetInfo()
        return true
      }}
      onBack={key(close)}
      // Nothing else reaches the screen behind the viewer.
      onKeyPress={() => true}
    >
      <view alpha={st.playsVideo ? 0 : 1}>
        {slot(0)}
        {slot(1)}
        {slot(2)}
      </view>

      <view x={936} y={516} width={48} height={48} alpha={st.spinnerOn ? 1 : 0}>
        <view width={48} height={48} borderRadius={24} color="#00000000" border={SPINNER_EDGE} />
        <view
          transition={{ rotation: { duration: 800, easing: 'linear' } }}
          width={48}
          height={48}
          pivot={0.5}
          src="icons/pv_spinner_arc.webp"
          color={colors.accent}
          rotation={(st.spin * Math.PI) / 180}
        />
      </view>

      <view x={900} y={480} width={120} height={120} src="icons/playCircleFill.webp" color="#ffffff" alpha={st.canPlay ? 1 : 0} />

      <view alpha={st.failed && !st.playsVideo ? 1 : 0}>
        <view x={932} y={488} width={56} height={56} borderRadius={8} color="#00000000" border={FAIL_EDGE} />
        <text fontFamily={fontFor(failText)} fontSize={24} lineHeight={33} x={960} y={shiftFail} mountX={0.5} color="#ffffffcc">
          {failText}
        </text>
      </view>

      <view transition={{ alpha: { duration: 300, easing: 'ease' } }} alpha={st.info && !st.playsVideo ? 1 : 0}>
        <view width={1920} height={st.counter ? 73 : 40} colorTop="#000000b3" colorBottom="#00000000" />
        <text fontFamily={fontFor(st.counter, 'medium')} fontSize={24} lineHeight={33} x={1890} y={shiftCounter} mountX={1} color="#ffffff">
          {st.counter}
        </text>

        <view y={st.barTop} width={1920} height={st.barH} colorTop="#00000000" colorBottom="#000000cc" />
        <text fontFamily={fontFor(st.name, 'medium')} fontSize={28} lineHeight={33} x={30} y={st.nameY + shiftName} maxWidth={1860} maxLines={1} color="#ffffff">
          {st.name}
        </text>
        <text fontFamily={fontFor(st.date)} fontSize={20} lineHeight={33} x={30} y={st.dateY + shiftDate} color="#ffffffcc">
          {st.date}
        </text>
        <text fontFamily={fontFor(st.meta)} fontSize={18} lineHeight={33} x={30} y={st.metaY + shiftMeta} color="#ffffff99">
          {st.meta}
        </text>
        <view x={30} y={st.buttonY} width={st.labelW + 86} height={59} borderRadius={8} color="#00000099" border={BUTTON_EDGE} alpha={st.showButton ? 1 : 0}>
          <view x={24} y={18} width={24} height={24} src="icons/pv_play.webp" color="#ffffff" alpha={st.running ? 0 : 1} />
          <view x={27} y={19} width={6} height={22} color="#ffffff" alpha={st.running ? 1 : 0} />
          <view x={39} y={19} width={6} height={22} color="#ffffff" alpha={st.running ? 1 : 0} />
          <text
            fontFamily={fontFor(slideLabel, 'medium')}
            fontSize={24}
            lineHeight={33}
            x={59}
            y={shiftLabel}
            color="#ffffff"
            onEvent={{ loaded: (n, e) => e && e.type === 'text' && e.dimensions.w && (st.labelW = Math.round(e.dimensions.w)) }}
          >
            {slideLabel}
          </text>
        </view>
        <text fontFamily={fontFor(st.hint)} fontSize={16} lineHeight={33} x={30} y={st.hintY + shiftHint} color="#ffffff66">
          {st.hint}
        </text>
      </view>
    </view>
  )
}
