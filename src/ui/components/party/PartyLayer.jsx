import $L from '../../../services/i18n.js'
import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import Keyboard from '../Keyboard.jsx'
import PartyFloat from './PartyFloat.jsx'
import PartyPanel from './PartyPanel.jsx'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { keyed } from '../library/pageKit.js'
import { fontsReady, textWidth as measure } from '../library/measure.js'
import * as settings from '../../../state/settings.js'
import { focusActivePage } from '../../../state/pages.js'
import { getStore } from '../../../state/store.js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import {
  chatLines, liveReactions, untilNext, waitingFor, secondsLeft, barKeys, barScroll, avatarColor, statusColor, isReady,
  CHAT_MS, REACTION_MS, TOAST_MS, READY_WAIT_MS,
} from './feed.js'
import { BASELINE_DROP } from './measure.js'
import { flowText } from './sheetMath.js'
import { toastText, toastIcon, quickReplies, waitLine, startingAnyway } from './words.js'
import { tx } from '../../fx.js'

const LINE = 33
const TICK_MS = 250
// Chat lines fade in over the first 5% of their six seconds and out over the last 20%.
const CHAT_IN_MS = 300
const CHAT_OUT_AT = 4800
// The toast drops 12px as it fades in over the first 8% of its four seconds, and fades out over the last 10%.
const TOAST_IN_MS = 320
const TOAST_OUT_AT = 3600
const BUBBLE_TEXT_MAX = 668
const ROW_W = 1740
const GREEN_RING = { width: 3, color: hex('#3ecf8e') }
const COUNT_RING = { width: 6, color: hex('#00a4dc') }
const TYPE_RING = { width: 3, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }

// Where a text node goes so its glyphs land in a line box whose top is `top`.
const ty = (top, size) => top + BASELINE_DROP * size

// Jellyfin sends member pictures at full size, so they're asked for at about the size they show.
const sized = (url) => (url ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}maxHeight=96` : '')

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const initialOf = (name) => (String(name || '').charAt(0) || '?').toUpperCase()

let layer = null

// The player's Chat and "Your watch party" buttons open the chat bar and the people panel. Each says
// whether it opened, and `onClose` runs when it closes, so the player can bring its controls back.
export const openPartyChat = (onClose) => !!layer && layer.openBar(onClose)
export const openPartyPanel = (onClose) => !!layer && layer.openPanel(onClose)

// A list kept by key, each item in its own node, in a container of its own.
function Keyed(props) {
  const l = keyed(props.list, props.keyOf || ((it) => it.k))
  return (
    <view>
      <For each={l.keys()}>{(k) => props.children(l.item(k))}</For>
    </view>
  )
}

// What a Moonbase party draws over the player: the toast naming who did what, the last three chat
// lines for six seconds each, reactions rising, the wait for everyone's player and the 3, 2, 1. None
// of that takes focus. Only the chat bar does. Every part is built from a list that's empty while
// nothing shows, and the only timer runs to the next moment something on screen changes, so the
// layer costs nothing while idle.
export default function PartyLayer(props) {
  const list = () => createSignal([], { equals: same })
  const [lines, setLines] = list()
  const [floats, setFloats] = list()
  const [toasts, setToasts] = list()
  const [waits, setWaits] = list()
  const [faces, setFaces] = list()
  const [counts, setCounts] = list()
  const [bars, setBars] = list()
  const [keys, setKeys] = list()
  const [dividers, setDividers] = list()
  const [people, setPeople] = list()
  const [panel, setPanel] = createSignal(false)
  const [focusIdx, setFocusIdx] = createSignal(-1)
  const [scroll, setScroll] = createSignal(0)
  const my = { open: false, typing: false, cur: 0, keys: [], wp: null, toastSeen: null, toastAt: 0, timer: null, typed: '', onClose: null, unsub: null, gone: false }
  let root
  let kb
  const uiRegular = () => uiFont()
  const uiBold = () => uiFont('bold')
  const headY = ty(867, 20)

  const moonbaseRoom = () => {
    const st = my.wp && my.wp.state()
    return st && st.room && st.backend === 'moonbase' ? st.room : null
  }
  const avatar = (member) => (member && my.wp ? sized(my.wp.avatarUrlFor(member.profileId)) : '')
  const schedule = (ms) => {
    clearTimeout(my.timer)
    my.timer = ms > 0 ? setTimeout(() => refresh(), ms + 20) : null
  }

  // Chat bubbles stack up from 220px above the bottom (300 with the bar up), 12px apart, newest lowest.
  const placeLines = (list, room, now) => {
    let bottom = my.open ? 780 : 860
    const out = []
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      const wrapped = flowText([{ text: m.text, style: 0 }], BUBBLE_TEXT_MAX, (word) => measure(word, 24))
      const textLines = wrapped.map((line) => line.map((seg) => seg.text).join(''))
      const textW = Math.min(BUBBLE_TEXT_MAX, Math.max(measure(m.displayName, 18, 'medium'), ...textLines.map((t) => measure(t, 24))))
      const h = 12 + 24.3 + 2 + textLines.length * 32.4 + 12
      bottom -= h
      const member = room.members.find((p) => p.profileId === m.memberId)
      const url = avatar(member)
      const shown = (member && member.displayName) || m.displayName
      const age = now - m.receivedAt
      let a = 1
      let d = 0
      if (!my.open && m.receivedAt > 0) {
        if (age < 30) a = 0
        else if (age < CHAT_OUT_AT) d = CHAT_IN_MS
        else {
          a = 0
          d = CHAT_MS - CHAT_OUT_AT
        }
      }
      out.unshift({
        k: m.id || `${m.memberId}|${m.sentAt}|${m.text}`,
        y: bottom,
        h,
        w: 12 + 44 + 14 + Math.ceil(textW) + 22,
        a,
        d,
        av: url ? '#3a3a3a' : avatarColor(shown),
        initial: url ? ' ' : initialOf(shown),
        iy: ty(12 + (44 - 21.1) / 2, 18),
        pic: url,
        name: m.displayName || ' ',
        nameFont: fontFor(m.displayName, 'medium'),
        ny: ty(12, 18),
        text: textLines.join('\n') || ' ',
        textFont: fontFor(m.text),
        ty: ty(12 + 24.3 + 2, 24),
      })
      bottom -= 12
    }
    return out
  }
  // Reactions rise from 300px above the bottom in a 200px column 100px in from the right, each a third
  // of it further left.
  const placeFloats = (list) =>
    list.map((r, i) => {
      const tw = r.name ? 20 + Math.ceil(measure(r.name, 18, 'medium')) : 0
      const fw = Math.max(76, tw)
      const fh = r.name ? 76 + 4 + 37 : 76
      return { id: r.id, reaction: r.reaction, name: r.name, fw, tw, x: 1820 - (i % 3) * 60 - fw, y: 780 - fh }
    })
  // The toast's avatar is drawn from the name alone, so it's always the initial.
  const toastModel = (toast, text, age) => {
    const icon = toastIcon(toast)
    const w = 10 + 44 + 14 + Math.ceil(measure(text, 24)) + 28
    let a = 1
    let d = TOAST_IN_MS
    let dy = 0
    if (age < 30) {
      a = 0
      dy = -12
      d = 0
    } else if (age >= TOAST_OUT_AT) {
      a = 0
      d = TOAST_MS - TOAST_OUT_AT
    }
    return {
      id: toast.id,
      text,
      x: 960 - w / 2,
      w,
      a,
      d,
      dy,
      font: fontFor(text),
      ty: ty(10 + (44 - LINE) / 2, 24),
      icon: icon ? `${icon}.webp` : '',
      bg: icon ? '#3a2e10' : avatarColor(toast.name || ''),
      initial: icon ? ' ' : initialOf(toast.name),
      iy: ty(10 + (44 - 21.1) / 2, 18),
    }
  }
  // The ready wait's card, centered: the faces, ringed green when ready and dashed amber while not,
  // then who it's waiting for and how long until it starts anyway.
  const placeWait = (room, since, now) => {
    if (!room) {
      setWaits([])
      setFaces([])
      return
    }
    const present = room.members.filter((m) => m.connected)
    const pending = waitingFor(room)
    const left = secondsLeft(since + READY_WAIT_MS, now)
    const line = waitLine(pending)
    const sub = pending.length && left > 0 ? startingAnyway(left) : ''
    const span = present.length ? 50 + (present.length - 1) * 40 : 0
    const inner = Math.max(span, measure(line, 26, 'medium'), sub ? measure(sub, 20) : 0)
    const w = Math.ceil(inner) + 112
    const h = 36 + 50 + 16 + LINE + (sub ? 6 + LINE : 0) + 36
    const x = 960 - w / 2
    const y = 540 - h / 2
    setWaits([{ k: 'w', x, y, w, h, line, lineFont: fontFor(line, 'medium'), sub, ly: ty(36 + 50 + 16, 26), sy: ty(36 + 50 + 16 + LINE + 6, 20) }])
    const x0 = 960 - span / 2
    setFaces(
      present.map((m, i) => ({
        k: m.profileId,
        x: x0 + i * 40,
        y: y + 36,
        av: avatarColor(m.displayName),
        ready: isReady(m),
        initial: initialOf(m.displayName),
        iy: ty(3 + (44 - 21.1) / 2, 18),
      })),
    )
  }
  const placeBar = (room) => {
    const replies = quickReplies()
    const list = barKeys(room, replies, $L('Type'), (text) => measure(text, 23, 'medium'))
    my.keys = list
    my.cur = Math.min(my.cur, Math.max(0, list.length - 1))
    setKeys(
      list.map((k, i) => ({
        id: k.id,
        i,
        kind: k.kind,
        x: k.x,
        w: k.w,
        label: k.label,
        y: k.kind === 'reaction' ? 0 : k.kind === 'type' ? 5 : 8,
        h: k.kind === 'reaction' ? 84 : k.kind === 'type' ? 74 : 68,
        r: k.kind === 'reaction' ? 20 : k.kind === 'type' ? 37 : 34,
        src: k.reaction ? `party/${k.reaction}.webp` : '',
        font: fontFor(k.label, k.kind === 'type' ? 'regular' : 'medium'),
        ink: k.kind === 'type' ? '#a9a9a9' : '#ffffff',
        // The Type field looks like an input, with its placeholder left-aligned and riding high in the box.
        tx: k.kind === 'type' ? 28 : k.w / 2,
        mx: k.kind === 'type' ? 0 : 0.5,
        ty: ty(k.kind === 'type' ? 5 : (68 - 26.96) / 2, 23),
      })),
    )
    const first = list.find((k) => k.divider)
    setDividers(first ? [{ k: 'd', x: first.divider }] : [])
    setScroll(barScroll(list, my.cur, ROW_W))
    setFocusIdx(my.typing ? -1 : my.cur)
    const count = String(room.members.length)
    const n = room.members.length
    const sw = 10 + n * 44 + Math.max(0, n - 1) * 12 + 12 + Math.ceil(measure(count, 22)) + 20
    setBars([{ k: 'b', sw, count, cx: sw - 20 - Math.ceil(measure(count, 22)), cy: ty((60 - LINE) / 2, 22) }])
    setPeople(
      room.members.map((m, i) => ({
        k: m.profileId,
        x: 1860 - sw + 10 + i * 56,
        av: avatarColor(m.displayName),
        dot: statusColor(m),
        initial: initialOf(m.displayName),
        iy: ty((44 - 21.1) / 2, 18),
      })),
    )
  }

  const refresh = () => {
    const st = my.wp && my.wp.state()
    const room = st && st.room
    if (!room || st.backend !== 'moonbase') return clear()
    const now = Date.now()
    const player = !!props.atPlayer
    const shown = player || my.open
    const chat = shown ? chatLines(st.chat, now, my.open, settings.get('watchPartyChatOverlay') !== false) : []
    const live = shown && !panel() ? liveReactions(st.reactions, now) : []
    const times = live.map((r) => r.at + REACTION_MS)
    if (!my.open) chat.forEach((m) => times.push(m.receivedAt + 30, m.receivedAt + CHAT_OUT_AT, m.receivedAt + CHAT_MS))
    setLines(placeLines(chat, room, now))
    setFloats(placeFloats(live))

    if (st.toast && st.toast.id !== my.toastSeen) {
      my.toastSeen = st.toast.id
      my.toastAt = now
    }
    const words = player && st.toast && now < my.toastAt + TOAST_MS ? toastText(st.toast) : ''
    if (words) times.push(my.toastAt + 30, my.toastAt + TOAST_OUT_AT, my.toastAt + TOAST_MS)
    setToasts(words ? [toastModel(st.toast, words, now - my.toastAt)] : [])

    const count = player && st.countdownAt ? secondsLeft(st.countdownAt, now) : 0
    const waiting = player && !st.countdownAt && room.playbackState === 'waiting' && !!st.waitingSince
    setCounts(count > 0 ? [{ k: 'c', n: String(count), ny: ty(432.5 + 84 - 16.5, 84), ly: ty(432.5 + 168 + 14, 24) }] : [])
    placeWait(waiting ? room : null, st.waitingSince, now)
    if (count > 0 || waiting) times.push(now + TICK_MS)

    if (my.open) placeBar(room)
    schedule(untilNext(times, now))
  }
  const clear = () => {
    if (panel()) closePanel()
    if (my.open) closeBar()
    ;[setLines, setFloats, setToasts, setWaits, setFaces, setCounts].forEach((set) => set([]))
    schedule(0)
  }
  // Whoever opened the bar or panel gets focus back: the player brings its controls back on the
  // button, other pages take focus as a whole.
  const refocus = () => {
    const done = my.onClose
    my.onClose = null
    if (done) done()
    else focusActivePage()
  }
  const openBar = (onClose) => {
    const room = moonbaseRoom()
    if (!room || !(room.chatEnabled || room.reactionsEnabled)) return false
    if (panel()) closePanel()
    my.open = true
    my.typing = false
    my.cur = 0
    my.typed = ''
    my.onClose = onClose || null
    refresh()
    if (root) root.setFocus()
    return true
  }
  const closeTyping = (back = true) => {
    if (!my.typing) return
    my.typing = false
    if (back && my.open) {
      setFocusIdx(my.cur)
      if (root) root.setFocus()
    }
  }
  const closeBar = () => {
    if (!my.open) return
    my.open = false
    closeTyping(false)
    setBars([])
    setKeys([])
    setDividers([])
    setPeople([])
    setFocusIdx(-1)
    refresh()
    refocus()
  }
  const openPanel = (onClose) => {
    if (!moonbaseRoom()) return false
    if (my.open) closeBar()
    my.onClose = onClose || null
    setPanel(true)
    refresh()
    return true
  }
  const closePanel = () => {
    if (!panel()) return
    setPanel(false)
    refresh()
    refocus()
  }
  const moveBar = (step) => {
    const next = my.cur + step
    if (next < 0 || next >= my.keys.length) return
    my.cur = next
    setFocusIdx(next)
    setScroll(barScroll(my.keys, next, ROW_W))
  }

  const onKeyboardChange = (text) => {
    my.typed = String(text || '').slice(0, 500)
  }
  // Done acts like Enter in the field and sends. Back leaves the bar open on Type.
  const onKeyboardClose = (submitted) => {
    if (submitted && my.wp && my.wp.sendChat(my.typed)) {
      my.typing = false
      closeBar()
      return
    }
    closeTyping()
  }
  // The TV's keyboard types into a real input laid over the Type field.
  const openNative = () => {
    const k = (my.keys || []).find((x) => x.kind === 'type')
    const rect = k ? { x: 90 + k.x - scroll(), y: 918 + k.y, w: k.w, h: k.h } : { x: 90, y: 918, w: 400, h: 68 }
    const opened = openNativeInput({ value: my.typed, maxLength: 500, rect, onChange: onKeyboardChange, onClose: onKeyboardClose })
    if (!opened) onKeyboardClose(false)
  }
  const openTyping = () => {
    my.typing = true
    setFocusIdx(-1)
    if (usesNativeKeyboard()) return openNative()
    kb.open({ value: my.typed, purpose: 'text', maxLength: 500 })
    kb.setFocus()
  }
  const press = () => {
    const key = my.keys[my.cur]
    if (!key || !my.wp) return
    if (key.kind === 'reaction') my.wp.sendReaction(key.reaction)
    else if (key.kind === 'reply' && my.wp.sendChat(key.label)) closeBar()
    else if (key.kind === 'type') openTyping()
  }

  onMount(() => {
    layer = { openBar, openPanel }
    // Test scripts open the bar and the panel through this, the same way the player's buttons do.
    if (typeof window !== 'undefined') window.__moonfinParty = layer
    import('../../../services/siloWatchParty.js')
      .then(({ watchParty }) => {
        my.wp = watchParty
        const st = watchParty.state()
        if (my.gone) return
        my.toastSeen = st.toast && st.toast.id
        my.unsub = watchParty.subscribe(() => refresh())
        refresh()
      })
      .catch((e) => console.warn('[party] layer', e))
    fontsReady().then(() => refresh())
  })
  onCleanup(() => {
    my.gone = true
    if (my.unsub) my.unsub()
    clearTimeout(my.timer)
    if (layer && layer.openBar === openBar) layer = null
  })
  // A theme change, or a theme face that finished loading, lays the layer out again.
  createEffect(on(() => getStore().settingsVersion, () => refresh(), { defer: true }))
  // A bar opened over one page doesn't stay open over the next, which takes focus.
  createEffect(
    on(
      () => props.atPlayer,
      () => {
        if (panel()) closePanel()
        if (my.open) closeBar()
        else refresh()
      },
      { defer: true },
    ),
  )

  // The Magic Remote's cursor (app/pointer.js): a key in full view on the bar takes focus on hover, one
  // the bar would scroll to on a click. While the bar has focus only it takes the pointer.
  const pointKey = (i, click) => {
    const k = my.keys[i]
    if (my.typing || !k) return false
    const x = k.x - scroll()
    if (!click && (x < 0 || x + k.w > ROW_W || my.cur === i)) return false
    if (my.cur !== i) {
      my.cur = i
      setFocusIdx(i)
      setScroll(barScroll(my.keys, i, ROW_W))
    }
    return click
  }
  const handle = (fn) => () => {
    fn()
    return true
  }
  return (
    <view
      ref={root}
      width={1920}
      pointerModal
      height={1080}
      onLeft={handle(() => !my.typing && moveBar(-1))}
      onRight={handle(() => !my.typing && moveBar(1))}
      onUp={() => true}
      onDown={() => true}
      onEnter={handle(() => !my.typing && press())}
      onBack={handle(() => (my.typing ? closeTyping() : closeBar()))}
    >
      <Keyed list={toasts} keyOf={(t) => t.id}>
        {(t) => (
          <view
            transition={tx({ y: { duration: 320 }, alpha: { duration: t().d } })}
            x={t().x}
            y={44 + t().dy}
            width={t().w}
            height={64}
            borderRadius={32}
            color="#101010e6"
            alpha={t().a}
          >
            <view x={10} y={10} width={44} height={44} borderRadius={22} color={t().bg} />
            <view x={19} y={19} width={26} height={26} src={t().icon} color="#f5b942" alpha={t().icon ? 1 : 0} />
            <text x={32} y={t().iy} mountX={0.5} fontFamily={uiBold()} fontSize={18} lineHeight={21.1} color="#ffffff">
              {t().initial}
            </text>
            <text x={68} y={t().ty} fontFamily={t().font} fontSize={24} lineHeight={33} color="#ffffff">
              {t().text}
            </text>
          </view>
        )}
      </Keyed>
      <Keyed list={floats} keyOf={(r) => r.id}>
        {(r) => <PartyFloat x={r().x} y={r().y} reaction={r().reaction} name={r().name} fw={r().fw} tw={r().tw} />}
      </Keyed>
      <Keyed list={lines}>
        {(l) => (
          <view
            transition={tx({ alpha: { duration: l().d, easing: 'linear' } })}
            x={60}
            y={l().y}
            width={l().w}
            height={l().h}
            borderRadius={18}
            color="#101010d6"
            alpha={l().a}
          >
            <view x={12} y={12} width={44} height={44} borderRadius={22} color={l().av} />
            <text x={34} y={l().iy} mountX={0.5} fontFamily={uiBold()} fontSize={18} lineHeight={21.1} color="#ffffff">
              {l().initial}
            </text>
            <view x={12} y={12} width={44} height={44} borderRadius={22} src={l().pic} alpha={l().pic ? 1 : 0} textureOptions={COVER} />
            <text x={70} y={l().ny} fontFamily={l().nameFont} fontSize={18} lineHeight={24.3} color="#9fd0ff">
              {l().name}
            </text>
            <text x={70} y={l().ty} fontFamily={l().textFont} fontSize={24} lineHeight={32.4} color="#ffffff">
              {l().text}
            </text>
          </view>
        )}
      </Keyed>
      <Keyed list={waits}>
        {(w) => (
          <view x={w().x} y={w().y} width={w().w} height={w().h} borderRadius={24} color="#000000d9">
            <text x={w().w / 2} y={w().ly} mountX={0.5} fontFamily={w().lineFont} fontSize={26} lineHeight={33} color="#ffffff">
              {w().line}
            </text>
            <text x={w().w / 2} y={w().sy} mountX={0.5} fontFamily={uiRegular()} fontSize={20} lineHeight={33} color="#a8a8a8">
              {w().sub || ' '}
            </text>
          </view>
        )}
      </Keyed>
      <Keyed list={faces}>
        {(f) => (
          <view x={f().x} y={f().y} width={50} height={50}>
            <view x={3} y={3} width={44} height={44} borderRadius={22} color={f().av} />
            <text x={25} y={f().iy} mountX={0.5} fontFamily={uiBold()} fontSize={18} lineHeight={21.1} color="#ffffff">
              {f().initial}
            </text>
            <view width={50} height={50} borderRadius={25} color="#00000000" border={GREEN_RING} alpha={f().ready ? 1 : 0} />
            <view width={50} height={50} src="party/dashring.webp" color="#f5b942" alpha={f().ready ? 0 : 1} />
          </view>
        )}
      </Keyed>
      <Keyed list={counts}>
        {(c) => (
          <view width={1920} height={1080} color="#00000099">
            <view x={876} y={432.5} width={168} height={168} borderRadius={84} color="#00000000" border={COUNT_RING} />
            <text x={960} y={c().ny} mountX={0.5} fontFamily={uiBold()} fontSize={84} lineHeight={33} color="#ffffff">
              {c().n}
            </text>
            <text x={960} y={c().ly} mountX={0.5} fontFamily={uiRegular()} fontSize={24} lineHeight={33} color="#e6e6e6">
              {$L('Starting together')}
            </text>
          </view>
        )}
      </Keyed>

      <Keyed list={bars}>
        {() => (
          <view x={60} y={843} width={1800} height={183} borderRadius={28} color="#101010eb">
            <text x={30} y={headY - 843} fontFamily={uiRegular()} fontSize={20} lineHeight={33} color="#a8a8a8">
              {$L('Send to the party')}
            </text>
            <text x={1770} y={headY - 843} mountX={1} fontFamily={uiRegular()} fontSize={20} lineHeight={33} color="#a8a8a8">
              {$L('Back to close')}
            </text>
          </view>
        )}
      </Keyed>
      <view x={90} y={918} width={bars().length ? ROW_W : 0} height={84} clipping>
        <view
          transition={{ x: { duration: 180 } }}
          x={-scroll()}
          width={keys().length ? keys()[keys().length - 1].x + keys()[keys().length - 1].w : 0}
          height={84}
        >
          <Keyed list={keys} keyOf={(k) => k.id}>
            {(k) => (
              <view
                x={k().x}
                y={k().y}
                width={k().w}
                height={k().h}
                borderRadius={k().r}
                color={k().i === focusIdx() && k().kind !== 'type' ? '#ffffff' : '#2a2a2a'}
                onPointerOver={() => pointKey(k().i, false)}
                onPointerClick={() => pointKey(k().i, true)}
              >
                <view x={17} y={17} width={50} height={50} src={k().src} alpha={k().src ? 1 : 0} />
                <text
                  x={k().tx}
                  y={k().ty}
                  mountX={k().mx}
                  fontFamily={k().font}
                  fontSize={23}
                  lineHeight={26.96}
                  color={k().i === focusIdx() && k().kind === 'reply' ? '#101010' : k().ink}
                >
                  {k().label || ' '}
                </text>
                <view
                  width={k().w}
                  height={k().h}
                  color="#00000000"
                  borderRadius={k().r}
                  border={TYPE_RING}
                  alpha={k().kind === 'type' && k().i === focusIdx() ? 1 : 0}
                />
              </view>
            )}
          </Keyed>
          <Keyed list={dividers}>{(d) => <view x={d().x} y={14} width={2} height={56} color="#333333" />}</Keyed>
        </view>
      </view>
      <Keyed list={bars}>
        {(b) => (
          <view x={1860 - b().sw} y={44} width={b().sw} height={60} borderRadius={30} color="#101010cc">
            <text x={b().cx} y={b().cy} fontFamily={uiRegular()} fontSize={22} lineHeight={33} color="#ffffff">
              {b().count}
            </text>
          </view>
        )}
      </Keyed>
      <Keyed list={people}>
        {(p) => (
          <view x={p().x} y={52} width={48} height={48}>
            <view width={44} height={44} borderRadius={22} color={p().av} />
            <text x={22} y={p().iy} mountX={0.5} fontFamily={uiBold()} fontSize={18} lineHeight={21.1} color="#ffffff">
              {p().initial}
            </text>
            <view x={22} y={22} width={26} height={26} borderRadius={13} color="#101010" />
            <view x={26} y={26} width={18} height={18} borderRadius={9} color={p().dot} />
          </view>
        )}
      </Keyed>

      <Keyboard overlay ref={(n) => (kb = n)} onKeyboardChange={onKeyboardChange} onKeyboardClose={onKeyboardClose} onKeyboardNative={openNative} />
      <view>
        <Show when={panel()}>
          <PartyPanel onClose={closePanel} />
        </Show>
      </view>
    </view>
  )
}
