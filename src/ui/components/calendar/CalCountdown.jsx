import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import CalPill from './CalPill.jsx'
import CalMessage from './CalMessage.jsx'
import { keyed } from '../library/pageKit.js'
import { drawn } from '../shell/sprite.js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { navOnLeft } from '../../theme.js'
import { reactive } from '../../../state/reactive.js'
import * as settings from '../../../state/settings.js'
import { router } from '../../../app/router.js'
import { focusNav } from '../../../app/focus.js'
import { inLibrary, nextOf, pad, readyToWatchOf, thisWeekOf } from '../../../utils/calendarEntries.js'
import { calendarNow, filterCalendar } from './calendarData.js'
import {
  KICKER_LS, LH, LS, insets, READY_COLOR, argb, artIcon, artUrl, calendarActions, calendarLook, calendarSubtitle, calendarWhen, dp,
  fitLine, fitLines, flowPills, lineY, linesY, messageModel, pillBox, pillModel, textWidth, thumbOf, titleButton,
} from './calendarLook.js'
import { stackColumn } from './calendarLayout.js'

// A hero for the next thing to air with a countdown, over rows of what's coming this week and
// what's ready now. With nothing coming up, the newest ready item takes the hero and the timer goes.
// The whole view is one list that scrolls edge to edge, and focus centers the focused card in its
// row and the row on the screen. The page hands it `data` (each load and every settings change),
// and it calls the page's openMonth() and reload().

// Minutes are the smallest unit shown, so a tick every 20 s keeps it within a third of a minute.
const TICK_MS = 20000
const HERO_H = dp(420)
const INFO_W = dp(560)
const CARD_GAP = dp(14)
const POSTER = { w: dp(150), h: dp(225 + 52), art: dp(225) }
const THUMB = { w: dp(280), h: dp(157.5 + 52), art: dp(157.5) }
const COVER = { resizeMode: { type: 'cover' } }
const CLEAR = '#00000000'
const NO_ROW = { on: false, title: '', titleFont: uiFont('bold'), titleY: 0, cardsY: 0, ch: 0, cw: 0, sx: 0, ringX: 0, tw: 0 }

// Entering a list picks the candidate whose span is nearest the one focus left.
const nearest = (list, from) => {
  let best = 0
  let bestD = Infinity
  list.forEach((it, i) => {
    const d = Math.max(0, it.l - from.r, from.l - it.r) * 1000 + Math.abs(it.l + it.r - from.l - from.r)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

// One of the two card rows, its cards windowed around the scroll and one focus ring over them.
const Lane = (props) => {
  const r = () => props.row
  const cards = keyed(() => props.cards, (c) => c.k)
  return (
    <view>
      <text fontFamily={r().titleFont} fontSize={33.39} x={props.x} y={r().titleY} letterSpacing={0.42} color="#ffffff" alpha={r().on ? 1 : 0}>
        {r().title}
      </text>
      <view x={props.x} y={r().cardsY} width={1920 - props.x} height={r().ch} clipping alpha={r().on ? 1 : 0}>
        <view x={-r().sx} width={r().tw} height={r().ch}>
          <view>
            <For each={cards.keys()}>
              {(k) => {
                const c = cards.item(k)
                return (
                  <view x={c().x} width={c().w} height={c().h}>
                    <view width={c().w} height={c().ah} borderRadius={16.7} color="#ffffff0f">
                      <view x={c().w / 2 - 20} y={c().ah / 2 - 20} width={40} height={40} src={c().icon} color="#ffffff4d" />
                      <view width={c().w} height={c().ah} borderRadius={16.7} src={c().src} textureOptions={COVER} alpha={c().src ? 1 : 0} />
                    </view>
                    <text fontFamily={c().titleFont} fontSize={23.37} y={c().titleTy} letterSpacing={0.42} color="#ffffff">
                      {c().title}
                    </text>
                    <text fontFamily={c().lineFont} fontSize={20.03} y={c().lineTy} letterSpacing={0.42} color={c().color}>
                      {c().line}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view
            x={r().ringX}
            width={r().cw}
            height={r().ch}
            borderRadius={16.7}
            color={CLEAR}
            border={{ width: 3, color: hex(props.ring) }}
            alpha={props.focused ? 1 : 0}
          />
        </view>
      </view>
    </view>
  )
}

export default function CalCountdown(props) {
  const st = reactive({
    shown: false,
    pg: '#101010',
    ring: '#00a4dc',
    fill: '#ffffff',
    ink: '#000000de',
    pl: 0,
    pt: 0,
    heroW: 0,
    heroBg: CLEAR,
    scrollY: 0,
    contentH: 1080,
    art: { x: 0, y: 0, w: 0, h: 0, src: '', icon: 'icons/tv_rounded.webp' },
    scrim: [],
    info: { x: 0, y: 0 },
    texts: [],
    cells: [],
    buttons: [],
    week: NO_ROW,
    weekCards: [],
    ready: NO_ROW,
    readyCards: [],
    zone: 'hero',
    heroAt: 0,
    message: null,
  })
  const [has, setHas] = createSignal(false)
  const my = { rows: [], entries: [], hero: null, counting: false }
  let root
  const scrim = keyed(() => st.scrim, (s) => s.k)
  const texts = keyed(() => st.texts, (t) => t.k)
  const cells = keyed(() => st.cells, (c) => c.k)
  const buttons = keyed(() => st.buttons, (b) => b.k)

  const build = () => {
    const data = my.data
    if (!data) return
    const s = props.prefs || settings.all()
    const look = calendarLook(s)
    const at = insets(s)
    my.look = look
    my.s = s
    my.at = at
    st.pg = look.page
    st.ring = look.focus
    st.fill = look.focusFill
    st.ink = look.focusInk
    st.pl = at.left
    st.pt = at.top
    const { entries, hidesSpoilers } = data.loading ? { entries: [], hidesSpoilers: () => false } : filterCalendar(data.all, s)
    my.entries = entries
    my.spoilers = hidesSpoilers
    my.now = data.now
    my.today = data.today
    const next = nextOf(entries, data.now)
    const ready = readyToWatchOf(entries, data.today)
    const hero = next || ready[0] || null
    if (data.loading || data.problem || !hero) {
      st.shown = false
      my.rows = []
      publish()
      st.buttons = []
      my.hero = null
      st.message = messageModel2(data, at, look)
      // Retry takes focus when there is one.
      st.zone = st.message.state.retry.length ? 'retry' : 'full'
      return
    }
    st.message = null
    const heroChanged = !my.hero || my.hero.key !== hero.key
    my.hero = hero
    my.counting = !!next
    buildHero(hero, !!next)
    const week = thisWeekOf(entries, data.today, data.now).filter((e) => e !== hero)
    const readyRow = ready.filter((e) => e !== hero)
    const poster = s.calendarImageType !== 'thumb'
    const rows = []
    let y = at.top + HERO_H
    if (week.length) {
      rows.push(rowModel('week', $L('Coming up this week'), week, poster, y))
      y = rows[rows.length - 1].bottom
    }
    if (readyRow.length) rows.push(rowModel('ready', $L('Ready to watch'), readyRow, false, y))
    // A rebuild keeps each row's place.
    const old = {}
    my.rows.forEach((r) => (old[r.k] = r))
    rows.forEach((r) => {
      const was = old[r.k]
      if (was && !heroChanged) {
        r.at = Math.min(was.at, r.items.length - 1)
        r.sx = Math.min(was.sx, r.maxSx)
        r.visited = was.visited
      }
    })
    my.rows = rows
    publish()
    my.contentH = (rows.length ? rows[rows.length - 1].bottom : at.top + HERO_H) + dp(32)
    st.contentH = Math.max(1080, my.contentH)
    st.shown = true
    if (heroChanged || (st.zone !== 'hero' && !rows.some((r) => r.k === st.zone))) {
      // The first hero button takes focus once there is a hero, or the place Back came back to.
      st.zone = 'hero'
      st.heroAt = 0
      st.scrollY = 0
    }
    st.heroAt = Math.min(st.heroAt, st.buttons.length - 1)
    st.scrollY = Math.min(st.scrollY, Math.max(0, my.contentH - 1080))
  }
  const buildHero = (e, counting) => {
    const s = my.s
    const look = my.look
    const at = my.at
    const W = 1920 - at.left - at.right
    st.heroW = W
    st.heroBg = look.bg(1)
    const spoilers = my.spoilers(e)
    // The art is sized by the hero's width alone, so the 16:9 backdrop sits centered with bands above and below.
    const artW = W * 0.68
    const artH = (artW * 9) / 16
    const artSrc = e.backdropUrl || (!spoilers ? e.stillUrl : null)
    st.art = { x: W - artW, y: (HERO_H - artH) / 2, w: artW, h: artH, src: artUrl(artSrc), icon: `icons/${artIcon(e)}.webp` }
    const x38 = W * 0.38
    const x75 = W * 0.75
    st.scrim = [
      { k: 'a', x: 0, w: x38, r: [30.05, 0, 0, 30.05], left: look.bg(1), right: look.bg(0.92) },
      { k: 'b', x: x38, w: x75 - x38, r: 0, left: look.bg(0.92), right: look.bg(0.15) },
      { k: 'c', x: x75, w: W - x75, r: [0, 30.05, 30.05, 0], left: look.bg(0.15), right: look.bg(0.15) },
    ]
    const today = my.today
    const now = my.now
    const kicker = (counting ? [look.badgeOf(e), calendarWhen(e, today, s.clockDisplay, s.dateFormat)].filter(Boolean).join(' · ') : $L('Ready to watch')).toUpperCase()
    const subtitle = calendarSubtitle(e, spoilers)
    const overview = !spoilers && e.overview ? e.overview : ''
    const actions = calendarActions(router, s)
    const list = []
    if (!counting && inLibrary(e)) list.push({ id: 'play', label: $L('Play'), icon: 'play_arrow_rounded', primary: true })
    if (actions.showsRequest(e)) list.push({ id: 'request', label: $L('Request'), icon: 'add_rounded' })
    if (actions.canOpen(e)) list.push(titleButton(e))
    list.push({ id: 'full', label: $L('Full calendar'), icon: 'calendar_month_rounded' })

    // The info column, top to bottom. Blocks that clip their text shrink in proportion to their
    // height when the column runs past the hero, as flex items do.
    const blocks = []
    const kSize = dp(13)
    blocks.push({ k: 'kicker', text: kicker, size: kSize, lh: kSize * LH, lines: 1, weight: 'bold', ls: KICKER_LS, color: counting ? look.color(e, now) : argb(READY_COLOR), mt: 0 })
    const tSize = dp(40)
    const title = fitLines(e.title, tSize, 'bold', INFO_W, 2)
    blocks.push({ k: 'title', text: title, font: fontFor(e.title, 'bold'), size: tSize, lh: tSize * 1.1, lines: title.split('\n').length, weight: 'bold', ls: LS, color: '#ffffff', mt: dp(6), shrink: true })
    if (subtitle) {
      const size = dp(18)
      blocks.push({ k: 'sub', text: fitLine(subtitle, size, 'regular', INFO_W), size, lh: size * LH, lines: 1, weight: 'regular', ls: LS, color: '#ffffffcc', mt: dp(6), shrink: true })
    }
    if (counting) {
      const size = dp(12)
      blocks.push({ k: 'label', text: $L('Starts in'), size, lh: size * LH, lines: 1, weight: 'bold', ls: LS, color: '#ffffff99', mt: dp(16), ui: true })
      blocks.push({ k: 'cells', h: dp(8) * 2 + dp(26) * LH + dp(12) * LH, mt: dp(6) })
    }
    if (overview) {
      const size = dp(15)
      const ov = fitLines(overview, size, 'regular', INFO_W, 3)
      blocks.push({ k: 'overview', text: ov, size, lh: size * 1.35, lines: ov.split('\n').length, weight: 'regular', ls: LS, color: '#ffffffbf', mt: dp(14), shrink: true })
    }
    const pills = flowPills(list, { maxW: INFO_W })
    const pillsH = pills.reduce((m, p) => Math.max(m, p.y + p.h), 0)
    blocks.push({ k: 'buttons', h: pillsH, mt: dp(18) })
    blocks.forEach((b) => {
      if (b.h == null) b.h = b.lh * b.lines
    })
    stackColumn(blocks, HERO_H - dp(24) * 2)
    const out = []
    blocks.forEach((b) => {
      b.top += dp(24)
      if (b.text != null) {
        out.push({
          k: b.k,
          text: b.text,
          font: b.font || (b.ui ? uiFont(b.weight) : fontFor(b.text, b.weight)),
          size: b.size,
          lh: b.lh,
          ls: b.ls,
          color: b.color,
          top: b.top,
          ty: linesY(0, b.size),
          boxW: INFO_W + 4,
          boxH: Math.max(0, b.h),
        })
      }
    })
    const cellsAt = blocks.find((b) => b.k === 'cells')
    st.cells = cellsAt ? cellModels(e, cellsAt.top) : []
    const buttonsAt = blocks.find((b) => b.k === 'buttons').top
    st.texts = out
    st.buttons = pills.map((p, i) => ({ ...pillModel(p, look, uiFont), at: i, y: buttonsAt + p.y }))
    st.info = { x: dp(32), y: 0 }
  }
  const cellModels = (e, top) => {
    const now = calendarNow()
    my.now = now
    const target = e.hasTime ? e.date : e.day
    const left = Math.max(0, target - now)
    const days = Math.floor(left / 86400000)
    const hours = Math.floor(left / 3600000) % 24
    // Rounded up so the last minute reads 1, not 0.
    const minutes = Math.ceil((left % 3600000) / 60000) % 60
    const vs = dp(26)
    const us = dp(12)
    const list = []
    if (days > 0) list.push([days, $L('days')])
    list.push([hours, $L('hr')], [minutes, $L('min')])
    let x = 0
    return list.map(([value, unit]) => {
      const text = pad(value)
      const w = Math.max(dp(64), dp(12) * 2 + Math.max(textWidth(text, vs, 'bold'), textWidth(unit, us)))
      const cell = {
        k: unit,
        value: text,
        unit,
        font: uiFont('bold'),
        uFont: uiFont(),
        vs,
        us,
        ls: LS,
        x,
        y: top,
        w,
        h: dp(8) * 2 + vs * LH + us * LH,
        vy: lineY(dp(8), vs * LH, vs),
        uy: lineY(dp(8) + vs * LH, us * LH, us),
      }
      x += w + dp(8)
      return cell
    })
  }
  const rowModel = (k, title, items, poster, top) => {
    const size = poster ? POSTER : THUMB
    const look = my.look
    const s = my.s
    const titleSize = dp(20)
    const titleY = top + dp(24)
    const cardsY = titleY + titleSize * LH + dp(10)
    const clientW = 1920 - my.at.left
    const contentW = items.length * (size.w + CARD_GAP) + dp(48 - 14)
    const cards = items.map((e, i) => {
      const spoilers = my.spoilers(e)
      const line = inLibrary(e) ? calendarSubtitle(e, spoilers) : calendarWhen(e, my.today, s.clockDisplay, s.dateFormat)
      return {
        k: e.key,
        x: i * (size.w + CARD_GAP),
        title: fitLine(e.title, dp(14), 'bold', size.w),
        titleFont: fontFor(e.title, 'bold'),
        line: fitLine(line, dp(12), 'regular', size.w),
        lineFont: fontFor(line),
        color: look.color(e, my.now).slice(0, 7) + 'e6',
        src: artUrl(poster ? e.posterUrl : thumbOf(e, spoilers), true),
        icon: `icons/${artIcon(e)}.webp`,
        w: size.w,
        h: size.h,
        ah: size.art,
        titleTy: lineY(size.art + dp(6), dp(14) * LH, dp(14)),
        lineTy: lineY(size.art + dp(6) + dp(14) * LH, dp(12) * LH, dp(12)),
      }
    })
    return {
      k,
      title,
      titleFont: uiFont('bold'),
      items: cards,
      entries: items,
      titleY: lineY(titleY, titleSize * LH, titleSize),
      cardsY,
      top: cardsY,
      cw: size.w,
      ch: size.h,
      at: 0,
      sx: 0,
      maxSx: Math.max(0, contentW - clientW),
      clientW,
      contentW,
      visited: false,
      bottom: cardsY + size.h,
    }
  }
  // The cards in and next to the visible span, so a long row only builds what can show.
  const windowOf = (row) => {
    const pitch = row.cw + CARD_GAP
    const first = Math.max(0, Math.floor(row.sx / pitch) - 1)
    const last = Math.min(row.items.length - 1, Math.ceil((row.sx + row.clientW) / pitch) + 1)
    return row.items.slice(first, last + 1)
  }
  // Hands each row's place and cards to the two fixed lanes.
  const publish = () => {
    ;['week', 'ready'].forEach((k) => {
      const row = my.rows.find((r) => r.k === k)
      if (!row) {
        st[k] = NO_ROW
        st[k + 'Cards'] = []
        return
      }
      st[k] = {
        on: true,
        title: row.title,
        titleFont: row.titleFont,
        titleY: row.titleY,
        cardsY: row.cardsY,
        ch: row.ch,
        cw: row.cw,
        sx: row.sx,
        ringX: row.at * (row.cw + CARD_GAP),
        tw: Math.max(row.contentW, row.clientW),
      }
      st[k + 'Cards'] = windowOf(row)
    })
  }
  const messageModel2 = (data, at, look) => {
    const W = 1920 - at.left - at.right
    const titleSize = dp(28)
    const header = titleSize * LH
    const label = $L('Full calendar')
    const full = pillBox({ label, icon: 'calendar_month_rounded', compact: true })
    return {
      k: 'message',
      x: at.left,
      y: at.top,
      title: $L('Calendar'),
      titleFont: uiFont('bold'),
      titleSize,
      titleY: lineY(0, header, titleSize),
      ls: LS,
      full: { ...pillModel({ id: 'full', label, icon: 'calendar_month_rounded' }, look, uiFont), ...full, x: W - full.w, y: (header - full.h) / 2 },
      state: messageModel({ x: 0, y: header, w: W, h: 1080 - at.top - at.bottom - header }, { loading: data.loading, problem: data.problem, emptyText: $L('Nothing coming up') }, look, uiFont),
    }
  }
  const tick = () => {
    // A kept-alive page keeps its timers, so the countdown only moves while it can be seen.
    if (!drawn(root) || !my.data || my.data.loading) return
    const now = calendarNow()
    const next = nextOf(my.entries, now)
    const hero = next || (my.hero && !my.counting ? my.hero : null)
    if (!my.hero || !hero || hero.key !== my.hero.key) {
      my.data = { ...my.data, now }
      build()
      return
    }
    if (my.counting) {
      const cellsTop = st.cells.length ? st.cells[0].y : 0
      const next2 = cellModels(my.hero, cellsTop)
      // A day boundary drops the days cell, which moves the rest of the column.
      if (next2.length !== st.cells.length) {
        my.data = { ...my.data, now }
        build()
      } else st.cells = next2
    }
  }
  const focusHero = (i) => {
    st.zone = 'hero'
    st.heroAt = Math.max(0, Math.min(i, st.buttons.length - 1))
    // Up from the rows only scrolls far enough to show the buttons, so the whole hero is brought back.
    st.scrollY = 0
  }
  const focusCard = (row, i) => {
    const at = Math.max(0, Math.min(i, row.items.length - 1))
    row.at = at
    row.visited = true
    // Centered in its row, and the row in the screen.
    const pitch = row.cw + CARD_GAP
    const areaCenter = (my.at.left + 1920 - my.at.right) / 2 - my.at.left
    const cardCenter = at * pitch + row.cw / 2 - row.sx
    row.sx = Math.max(0, Math.min(row.maxSx, row.sx + cardCenter - areaCenter))
    st.zone = row.k
    st.scrollY = Math.max(0, Math.min(my.contentH - 1080, row.top + row.ch / 2 - 540))
    publish()
  }
  // A row is entered at its last focused card, or its first.
  const enterRow = (row) => focusCard(row, row.visited ? row.at : 0)
  const heroSpan = (i) => {
    const b = st.buttons[i]
    // The hero and the rows both start at the left inset, so spans are measured from there.
    const x = st.info.x
    return { l: x + b.x, r: x + b.x + b.w }
  }
  const cardSpan = (row) => {
    const x = row.at * (row.cw + CARD_GAP) - row.sx
    return { l: x, r: x + row.cw }
  }
  const press = () => {
    if (st.zone === 'full') return props.openMonth()
    if (st.zone === 'retry') return props.reload()
    const actions = calendarActions(router, my.s)
    if (st.zone === 'hero') {
      const b = st.buttons[st.heroAt]
      const e = my.hero
      if (!b || !e) return
      if (b.id === 'play') actions.play(e)
      else if (b.id === 'request') actions.request(e)
      else if (b.id === 'open') actions.openTitle(e)
      else if (b.id === 'full') props.openMonth()
      return
    }
    const row = my.rows.find((r) => r.k === st.zone)
    if (row) actions.select(row.entries[row.at])
  }
  const rowIndex = () => my.rows.findIndex((r) => r.k === st.zone)
  const key = (fn) => () => {
    if (my.s) batch(fn)
    return true
  }

  createEffect(
    on(
      () => props.data,
      (data) => {
        if (!data) return
        my.data = data
        batch(build)
      }
    )
  )
  onMount(() => {
    const timer = setInterval(() => batch(tick), TICK_MS)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color={st.pg}
      onFocusChanged={setHas}
      onLeft={key(() => {
        const sidebar = navOnLeft(my.s)
        if (st.message) {
          if (sidebar) focusNav()
          return
        }
        if (st.zone === 'hero') {
          if (st.heroAt > 0) st.heroAt = st.heroAt - 1
          else if (sidebar) focusNav()
          return
        }
        const row = my.rows[rowIndex()]
        if (row.at > 0) focusCard(row, row.at - 1)
        else if (sidebar) focusNav()
      })}
      onRight={key(() => {
        if (st.message) return
        if (st.zone === 'hero') {
          // Past the last button, Right goes to the first row.
          if (st.heroAt < st.buttons.length - 1) st.heroAt = st.heroAt + 1
          else if (my.rows.length) enterRow(my.rows[0])
          return
        }
        const row = my.rows[rowIndex()]
        if (row.at < row.items.length - 1) focusCard(row, row.at + 1)
      })}
      onUp={key(() => {
        if (st.message) {
          if (st.zone === 'retry') st.zone = 'full'
          else if (!navOnLeft(my.s)) focusNav()
          return
        }
        if (st.zone === 'hero') {
          if (!navOnLeft(my.s)) focusNav()
          return
        }
        const i = rowIndex()
        const from = cardSpan(my.rows[i])
        if (i > 0) enterRow(my.rows[i - 1])
        else focusHero(nearest(st.buttons.map((b, j) => heroSpan(j)), from))
      })}
      onDown={key(() => {
        if (st.message) {
          if (st.message.state.retry.length) st.zone = 'retry'
          return
        }
        if (st.zone === 'hero') {
          if (my.rows.length) enterRow(my.rows[0])
          return
        }
        const i = rowIndex()
        if (i < my.rows.length - 1) enterRow(my.rows[i + 1])
      })}
      onEnter={key(press)}
    >
      <view y={-st.scrollY} width={1920} height={st.contentH} alpha={st.shown ? 1 : 0}>
        <view x={st.pl} y={st.pt} width={st.heroW} height={701.2}>
          <view width={st.heroW} height={701.2} borderRadius={30.05} color={st.heroBg} />
          <view x={st.art.x} y={st.art.y} width={st.art.w} height={st.art.h} color="#ffffff0f" clipping>
            {/* The fallback icon is centered on the art's top edge, so the clipping cuts its upper half. */}
            <view x={st.art.w / 2 - 20} y={-20} width={40} height={40} src={st.art.icon} color="#ffffff4d" />
            <view width={st.art.w} height={st.art.h} src={st.art.src} textureOptions={COVER} alpha={st.art.src ? 1 : 0} />
          </view>
          <view>
            <For each={scrim.keys()}>
              {(k) => {
                const sc = scrim.item(k)
                return <view x={sc().x} width={sc().w} height={701.2} borderRadius={sc().r} colorLeft={sc().left} colorRight={sc().right} />
              }}
            </For>
          </view>
          <view x={st.info.x} y={st.info.y}>
            <view>
              <For each={texts.keys()}>
                {(k) => {
                  const t = texts.item(k)
                  return (
                    <view y={t().top} width={t().boxW} height={t().boxH} clipping>
                      <text fontFamily={t().font} fontSize={t().size} y={t().ty} lineHeight={t().lh} letterSpacing={t().ls} color={t().color}>
                        {t().text}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={cells.keys()}>
                {(k) => {
                  const c = cells.item(k)
                  return (
                    <view x={c().x} y={c().y} width={c().w} height={c().h} borderRadius={16.7} color="#ffffff1a">
                      <text fontFamily={c().font} fontSize={c().vs} x={c().w / 2} y={c().vy} mountX={0.5} letterSpacing={c().ls} color="#ffffff">
                        {c().value}
                      </text>
                      <text fontFamily={c().uFont} fontSize={c().us} x={c().w / 2} y={c().uy} mountX={0.5} letterSpacing={c().ls} color="#ffffff99">
                        {c().unit}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={buttons.keys()}>
                {(k) => {
                  const b = buttons.item(k)
                  return (
                    <CalPill x={b().x} y={b().y} p={b()} focused={st.zone === 'hero' && st.heroAt === b().at && has()} ring={st.ring} fill={st.fill} ink={st.ink} />
                  )
                }}
              </For>
            </view>
          </view>
        </view>

        <Lane row={st.week} cards={st.weekCards} x={st.pl} ring={st.ring} focused={st.zone === 'week' && has()} />
        <Lane row={st.ready} cards={st.readyCards} x={st.pl} ring={st.ring} focused={st.zone === 'ready' && has()} />
      </view>

      <view>
        <Show when={st.message}>
          {(m) => (
            <view x={m().x} y={m().y}>
              <text fontFamily={m().titleFont} fontSize={m().titleSize} y={m().titleY} letterSpacing={m().ls} color="#ffffff">
                {m().title}
              </text>
              <CalPill x={m().full.x} y={m().full.y} p={m().full} focused={st.zone === 'full' && has()} ring={st.ring} fill={st.fill} ink={st.ink} />
              <CalMessage m={m().state} retryFocused={st.zone === 'retry' && has()} ring={st.ring} fill={st.fill} ink={st.ink} />
            </view>
          )}
        </Show>
      </view>
    </view>
  )
}
