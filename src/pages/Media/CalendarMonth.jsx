import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import CalPill from '../../ui/components/calendar/CalPill.jsx'
import CalRow from '../../ui/components/calendar/CalRow.jsx'
import CalMessage from '../../ui/components/calendar/CalMessage.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { navOnLeft } from '../../ui/theme.js'
import { reactive } from '../../state/reactive.js'
import * as settings from '../../state/settings.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { focusNav } from '../../app/focus.js'
import { BADGE, PROBLEM, entriesOn, isoDay, monthGridDays, sameDay, startOfDay } from '../../utils/calendarEntries.js'
import { formatFullDate, formatShortDayName, localeDate } from '../../utils/dateFormat.js'
import { calendarNow, filterCalendar, loadCalendarData, lookKey } from '../../ui/components/calendar/calendarData.js'
import {
  LH, agendaRowModel, insets, calendarActions, calendarDayName, calendarLook, dp, fitLine, fitLines, lineY, messageModel, pillBox, pillModel,
  textWidth, weekStartOf,
} from '../../ui/components/calendar/calendarLook.js'
import { fontsReady } from '../../ui/components/calendar/calendarLayout.js'

// The full calendar behind both styles: a month grid with the picked day's entries beside it.
// Focus follows the picked day, so moving onto a day from another month turns the grid to that
// month. `day` opens it on that day. `preview` draws it in the settings preview with `prefs` as its
// settings, leaving focus, the nav and the route alone.

const PANEL_W = dp(400)
const CLEAR = '#00000000'
const NO_PANEL = { x: 0, w: PANEL_W, name: '', nameFont: uiFont('bold'), nameY: 0, date: '', dateFont: uiFont(), dateY: 0, empty: '', emptyY: 0, listTop: 0, listH: 0 }

const hasPremiere = (entries, badges) => badges && entries.some((e) => e.badge === BADGE.seriesPremiere || e.badge === BADGE.seasonPremiere)

export default function CalendarMonth(props) {
  const store = getStore()
  const st = reactive({
    pg: '#101010',
    ring: '#00a4dc',
    fill: '#ffffff',
    ink: '#000000de',
    pl: 0,
    pt: 0,
    title: '',
    titleFont: uiFont('bold'),
    titleY: 0,
    buttons: [],
    weekdays: [],
    cells: [],
    entryItems: [],
    ringBox: { x: 0, y: 0, w: 0, h: 0 },
    message: null,
    panel: NO_PANEL,
    rows: [],
    panelH: 0,
    panelScroll: 0,
    panelRing: { y: 0, h: 0 },
    zone: 'grid',
    btnAt: 0,
    rowAt: 0,
  })
  const [has, setHas] = createSignal(false)
  const d0 = props.day ? new Date(props.day) : null
  const my = { initial: d0 && !isNaN(d0.getTime()) ? startOfDay(d0) : null, gen: 0, layoutVersion: 0, cellMemo: {}, days: [], dayEntries: [] }
  let root
  let alive = true
  onCleanup(() => {
    alive = false
  })
  const buttons = keyed(() => st.buttons, (b) => b.k)
  const weekdays = keyed(() => st.weekdays, (w) => w.k)
  const cells = keyed(() => st.cells, (c) => c.k)
  const entryItems = keyed(() => st.entryItems, (e) => e.k)
  const rows = keyed(() => st.rows, (r) => r.k)

  const load = async (refresh) => {
    const gen = ++my.gen
    if (!my.data) {
      const now = calendarNow()
      my.data = { loading: true, all: [], now, today: startOfDay(now) }
      batch(build)
    }
    let data
    try {
      data = await loadCalendarData(refresh, props.prefs || undefined)
    } catch (e) {
      const now = calendarNow()
      data = { loading: false, problem: PROBLEM.failed, all: [], now, today: startOfDay(now) }
    }
    if (gen !== my.gen || !alive) return
    my.data = data
    batch(build)
  }
  const build = () => {
    const data = my.data
    const s = props.prefs || settings.all()
    const look = calendarLook(s)
    const at = insets(s)
    my.s = s
    my.look = look
    my.at = at
    st.pg = look.page
    st.ring = look.focus
    st.fill = look.focusFill
    st.ink = look.focusInk
    st.pl = at.left
    st.pt = at.top
    const filtered = data.loading ? { entries: [], hidesSpoilers: () => false } : filterCalendar(data.all, s)
    my.entries = filtered.entries
    my.spoilers = filtered.hidesSpoilers
    my.today = data.today
    my.now = data.now
    const byDay = {}
    filtered.entries.forEach((e) => {
      const key = isoDay(e.day)
      ;(byDay[key] = byDay[key] || []).push(e)
    })
    my.byDay = byDay
    if (!my.selected) {
      my.selected = my.initial || data.today
      my.month = new Date(my.selected.getFullYear(), my.selected.getMonth(), 1)
    }
    layout()
  }
  const layout = () => {
    my.layoutVersion++
    const s = my.s
    const look = my.look
    const at = my.at
    const data = my.data
    const W = 1920 - at.left - at.right
    const mainW = W - PANEL_W - dp(24)
    my.mainW = mainW
    const titleLh = dp(30) * LH
    st.titleY = lineY(at.top, titleLh, dp(30))
    const title = localeDate(my.month, { month: 'long', year: 'numeric' })
    st.titleFont = fontFor(title, 'bold')

    const month = my.month
    const canGoBack = month > data.windowStart || !data.windowStart
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    const canGoForward = !data.windowEnd || next < data.windowEnd
    const specs = [
      { id: 'prev', icon: 'chevron_left_rounded', disabled: !canGoBack },
      { id: 'next', icon: 'chevron_right_rounded', disabled: !canGoForward },
      { id: 'today', label: $L('Today'), icon: 'today_rounded' },
    ]
    const boxes = specs.map((b) => ({ ...pillModel(b, look, uiFont), ...pillBox({ label: b.label, icon: b.icon, compact: true }) }))
    // The arrows sit 6 apart and 10 before Today.
    let x = at.left + mainW
    for (let i = boxes.length - 1; i >= 0; i--) {
      x -= boxes[i].w
      boxes[i].x = x
      boxes[i].y = at.top + (titleLh - boxes[i].h) / 2
      boxes[i].at = i
      x -= i === 2 ? dp(10) : dp(6)
    }
    st.buttons = boxes
    my.canGoBack = canGoBack
    my.canGoForward = canGoForward
    st.title = fitLine(title, dp(30), 'bold', boxes[0].x - at.left)

    const days = monthGridDays(month, weekStartOf(s.calendarWeekStart))
    my.days = days
    const colW = mainW / 7
    const wdTop = at.top + titleLh + dp(12)
    const wdLh = dp(12) * LH
    st.weekdays = days.slice(0, 7).map((d, i) => {
      const label = localeDate(d, { weekday: 'short' })
      return { k: String(d.getDay()), label, font: fontFor(label, 'bold'), x: at.left + colW * i + colW / 2, y: lineY(wdTop, wdLh, dp(12)) }
    })
    const gridTop = wdTop + wdLh + dp(6)
    const gridH = 1080 - at.bottom - gridTop
    my.grid = { top: gridTop, h: gridH, colW, rowH: gridH / (days.length / 7) }

    const ready = !data.loading && !data.problem
    if (!ready) {
      st.message = messageModel({ x: at.left, y: gridTop, w: mainW, h: gridH }, { loading: data.loading, problem: data.problem }, look, uiFont)
      st.cells = []
      st.entryItems = []
      if (st.message.retry.length) st.zone = 'retry'
    } else {
      st.message = null
      if (st.zone === 'retry') st.zone = 'grid'
      setCells()
    }
    layoutPanel()
  }
  const cellModel = (d, i) => {
    const look = my.look
    const g = my.grid
    const col = i % 7
    const row = Math.floor(i / 7)
    const inMonth = d.getMonth() === my.month.getMonth()
    const selected = sameDay(d, my.selected)
    const today = sameDay(d, my.today)
    const entries = my.byDay[isoDay(d)] || []
    const w = g.colW - dp(3) * 2
    const h = g.rowH - dp(3) * 2
    // Today's 1.5 dp border, which Chrome draws at a whole 2 px.
    const inset = today ? 2 : 0
    const padTop = dp(6)
    const numLh = dp(15) * LH
    const shown = entries.slice(0, 2)
    const more = entries.length - shown.length
    const entryTop = padTop + numLh + dp(4)
    const entryLh = dp(12) * LH
    const tagLabel = $L('NEW')
    const tagSize = dp(11)
    const tagLh = tagSize * LH
    const tagW = dp(7) * 2 + textWidth(tagLabel, tagSize, 'bold', dp(0.2))
    const tagH = dp(2) * 2 + tagLh
    const innerW = w - inset * 2
    const cellX = my.at.left + col * g.colW + dp(3)
    const cellY = g.top + row * g.rowH + dp(3)
    return {
      k: isoDay(d),
      x: cellX,
      y: cellY,
      w,
      h,
      inset,
      today,
      todayColor: look.accent,
      bg: selected ? look.accentA(0.2) : inMonth ? '#ffffff0d' : '#ffffff05',
      number: String(d.getDate()),
      numberFont: uiFont('bold'),
      numberY: lineY(padTop, numLh, dp(15)),
      // The picked cell is tinted with the accent already.
      numberColor: !inMonth ? '#ffffff4d' : today && !selected ? look.accent : '#fffffff2',
      // At most one NEW tag per cell, pushed right but never over the day's number.
      tag: { on: hasPremiere(entries, look.badges), label: tagLabel, font: uiFont('bold'), x: Math.max(dp(8) + textWidth(String(d.getDate()), dp(15), 'bold'), innerW - dp(8) - tagW), y: padTop + (numLh - tagH) / 2, w: tagW, h: tagH, ty: lineY(dp(2), tagLh, tagSize), color: look.accent, fill: look.accentA(0.18) },
      // Each entry is clipped where the cell's padding starts, as the cell's overflow cuts it.
      entries: shown.map((e, j) => ({
        k: e.key,
        x: cellX + inset + dp(8),
        y: cellY + inset + entryTop + j * (entryLh + dp(3)),
        w: innerW - dp(8) * 2,
        h: Math.max(0, Math.min(entryLh, h - inset * 2 - padTop - (entryTop + j * (entryLh + dp(3))))),
        barY: (entryLh - dp(14)) / 2,
        bar: look.color(e, my.now),
        title: fitLine(e.title, dp(12), 'regular', innerW - dp(8) * 2 - dp(3) - dp(5)),
        font: fontFor(e.title),
        ty: lineY(0, entryLh, dp(12)),
        color: inMonth ? '#ffffffd9' : '#ffffff59',
      })),
      more: more > 0 ? $L('+{count} more').replace('{count}', String(more)) : '',
      moreFont: uiFont(),
      moreY: lineY(entryTop + shown.length * (entryLh + dp(3)), dp(11) * LH, dp(11)),
      // The line wraps in the cell's width as CSS does, and the cell cuts what wrapped below.
      moreW: innerW - dp(8) * 2,
    }
  }
  const setCells = () => {
    // A cell whose look is unchanged keeps its model, so moving focus only redraws the two cells it touched.
    const old = my.cellMemo
    const memo = {}
    const list = my.days.map((d, i) => {
      const sig = [isoDay(d), sameDay(d, my.selected), my.month.getMonth(), my.layoutVersion].join('|')
      const c = old[sig] || cellModel(d, i)
      memo[sig] = c
      return c
    })
    my.cellMemo = memo
    my.cells = list
    const items = []
    list.forEach((c) => c.entries.forEach((e) => items.push(e)))
    st.cells = list
    st.entryItems = items
    placeRing()
  }
  const placeRing = () => {
    const c = my.cells[selectedIndex()]
    if (c) st.ringBox = { x: c.x, y: c.y, w: c.w, h: c.h }
  }
  const layoutPanel = () => {
    const s = my.s
    const at = my.at
    const sel = my.selected
    const dayName = calendarDayName(sel, my.today, s.dateFormat)
    const fullDate = formatFullDate(sel, s.dateFormat)
    // Today, tomorrow and yesterday keep their word above the date. Any other day's name would only repeat the date.
    const relative = dayName !== formatShortDayName(sel, s.dateFormat)
    const name = relative ? dayName : fullDate
    const nameLh = dp(20) * LH
    const dateLh = dp(14) * LH
    const headH = nameLh + (relative ? dp(2) + dateLh : 0)
    const entries = my.data.loading || my.data.problem ? [] : entriesOn(my.entries, sel)
    my.dayEntries = entries
    const listTop = headH + dp(12)
    const listH = 1080 - at.bottom - at.top - listTop
    const out = []
    let y = 0
    entries.forEach((e) => {
      const m = agendaRowModel(e, { w: PANEL_W, compact: true, look: my.look, now: my.now, spoilers: my.spoilers(e), s, fontFor, uiFont })
      out.push({ ...m, y })
      y += m.h
    })
    my.panelH = y
    st.panelH = y
    st.rows = out
    st.panel = {
      x: at.left + my.mainW + dp(24),
      w: PANEL_W,
      name: fitLines(name, dp(20), 'bold', PANEL_W, 99),
      nameFont: fontFor(name, 'bold'),
      nameY: lineY(0, nameLh, dp(20)),
      date: relative ? fullDate : '',
      dateFont: uiFont(),
      dateY: lineY(nameLh + dp(2), dateLh, dp(14)),
      empty: entries.length ? '' : $L('Nothing on this day'),
      emptyY: lineY(headH + (1080 - at.bottom - at.top - headH - dateLh) / 2, dateLh, dp(14)),
      listTop,
      listH,
    }
    st.panelScroll = 0
    if (st.zone === 'panel' && !out.length) st.zone = 'grid'
  }
  // Picks a day. One from another month turns the grid to it, and focus follows onto its cell.
  const pick = (day) => {
    const changedMonth = day.getMonth() !== my.month.getMonth() || day.getFullYear() !== my.month.getFullYear()
    my.selected = day
    if (changedMonth) {
      my.month = new Date(day.getFullYear(), day.getMonth(), 1)
      layout()
    } else {
      setCells()
      layoutPanel()
    }
  }
  const shiftMonth = (by) => {
    const m = my.month
    const next = new Date(m.getFullYear(), m.getMonth() + by, 1)
    my.month = next
    my.selected = next.getFullYear() === my.today.getFullYear() && next.getMonth() === my.today.getMonth() ? my.today : next
    layout()
  }
  const focusPanelRow = (i) => {
    st.zone = 'panel'
    st.rowAt = i
    const r = st.rows[i]
    // Centered in the panel's list.
    const max = Math.max(0, my.panelH - st.panel.listH)
    st.panelScroll = Math.max(0, Math.min(max, r.y + r.h / 2 - st.panel.listH / 2))
    st.panelRing = { y: r.y, h: r.h }
  }
  const focusCellAt = (i) => {
    if (i < 0 || i >= my.days.length) return
    st.zone = 'grid'
    pick(my.days[i])
  }
  const selectedIndex = () => my.days.findIndex((d) => sameDay(d, my.selected))
  const nearestButton = () => {
    const c = my.cells && my.cells[selectedIndex()]
    if (!c) return 2
    const mid = c.x + c.w / 2
    const list = st.buttons
    let best = 0
    list.forEach((b, i) => {
      if (Math.abs(b.x + b.w / 2 - mid) < Math.abs(list[best].x + list[best].w / 2 - mid)) best = i
    })
    return best
  }
  // Right from the grid's last column goes to the panel row nearest the cell's height.
  const nearestPanelRow = () => {
    const c = my.cells[selectedIndex()]
    const mid = c.y + c.h / 2 - my.at.top - st.panel.listTop + st.panelScroll
    const list = st.rows
    let best = 0
    list.forEach((r, i) => {
      const b = list[best]
      if (Math.abs(r.y + r.h / 2 - mid) < Math.abs(b.y + b.h / 2 - mid)) best = i
    })
    return best
  }
  const cellBelowButton = () => {
    const b = st.buttons[st.btnAt]
    const mid = b.x + b.w / 2 - my.at.left
    return Math.max(0, Math.min(6, Math.floor(mid / my.grid.colW)))
  }
  // The Magic Remote's cursor (app/pointer.js). The buttons and Retry take focus on hover. A day
  // changes the list beside the grid, so the cursor only rings a day (crossing the grid to the list
  // would change it) and a click picks it. The list centers its focused row, so a row too rings and
  // a click focuses it and opens it. Hover also takes focus back from the nav.
  const point = (fn) => {
    if (!my.s) return
    batch(fn)
    if (!has() && root) root.setFocus()
  }
  const gridBox = () => {
    const list = my.cells || []
    if (!list.length) return { x: 0, y: 0, w: 0, h: 0 }
    const x = Math.min(...list.map((c) => c.x))
    const y = Math.min(...list.map((c) => c.y))
    return { x, y, w: Math.max(...list.map((c) => c.x + c.w)) - x, h: Math.max(...list.map((c) => c.y + c.h)) - y }
  }
  const pointDay = (i) => {
    if (my.s && !st.message && my.days[i]) point(() => focusCellAt(i))
    return false
  }
  const pointRow = (i) => {
    if (!my.s || !st.rows[i]) return false
    point(() => focusPanelRow(i))
    return true
  }
  const key = (fn) => () => {
    if (my.s) batch(fn)
    return true
  }

  const sig = createMemo(lookKey)
  createEffect(on(sig, () => my.data && load(false), { defer: true }))
  createEffect(
    on(
      () => props.page && props.page.active(),
      (active) => {
        if (active && !props.preview) store.navSection = 'calendar'
      }
    )
  )
  load(false)
  // Text is measured for the layout, so it's laid out again once the font files are in.
  fontsReady().then(() => alive && my.data && batch(build))
  // A theme's own face measures once it has loaded, which bumps settingsVersion.
  createEffect(on(() => store.settingsVersion, () => my.data && batch(build), { defer: true }))
  onMount(() => {
    if (!props.preview && root) root.setFocus()
  })

  return (
    <view
      ref={(n) => (root = n)}
      width={1920}
      height={1080}
      color={st.pg}
      onFocusChanged={setHas}
      onLeft={key(() => {
        const sidebar = navOnLeft(my.s)
        if (st.zone === 'header') {
          if (st.btnAt > 0) st.btnAt = st.btnAt - 1
          else if (sidebar) focusNav()
        } else if (st.zone === 'panel') {
          st.zone = 'grid'
        } else if (st.zone === 'grid') {
          const i = selectedIndex()
          if (i % 7 > 0) focusCellAt(i - 1)
          else if (sidebar) focusNav()
        } else if (sidebar) focusNav()
      })}
      onRight={key(() => {
        if (st.zone === 'header') {
          if (st.btnAt < st.buttons.length - 1) st.btnAt = st.btnAt + 1
        } else if (st.zone === 'grid') {
          const i = selectedIndex()
          if (i % 7 < 6) focusCellAt(i + 1)
          else if (st.rows.length) focusPanelRow(nearestPanelRow())
        }
      })}
      onUp={key(() => {
        if (st.zone === 'grid') {
          const i = selectedIndex()
          if (i >= 7) focusCellAt(i - 7)
          else {
            st.zone = 'header'
            st.btnAt = nearestButton()
          }
        } else if (st.zone === 'panel') {
          if (st.rowAt > 0) focusPanelRow(st.rowAt - 1)
          else {
            // Today sits above the panel's first row.
            st.zone = 'header'
            st.btnAt = 2
          }
        } else if (st.zone === 'retry') {
          st.zone = 'header'
          st.btnAt = 2
        } else if (st.zone === 'header' && !navOnLeft(my.s)) focusNav()
      })}
      onDown={key(() => {
        if (st.zone === 'grid') {
          const i = selectedIndex()
          if (i + 7 < my.days.length) focusCellAt(i + 7)
        } else if (st.zone === 'panel') {
          if (st.rowAt < st.rows.length - 1) focusPanelRow(st.rowAt + 1)
        } else if (st.zone === 'header') {
          if (st.message) {
            if (st.message.retry.length) st.zone = 'retry'
            return
          }
          focusCellAt(cellBelowButton())
        }
      })}
      onEnter={key(() => {
        if (st.zone === 'retry') return load(true)
        if (st.zone === 'header') {
          const b = st.buttons[st.btnAt]
          if (b.id === 'prev' && my.canGoBack) shiftMonth(-1)
          else if (b.id === 'next' && my.canGoForward) shiftMonth(1)
          else if (b.id === 'today') {
            my.selected = my.today
            my.month = new Date(my.today.getFullYear(), my.today.getMonth(), 1)
            st.zone = 'grid'
            layout()
          }
          return
        }
        if (st.zone === 'grid') {
          // OK on a day moves into its list when it has one.
          if (st.rows.length) focusPanelRow(0)
          return
        }
        const e = my.dayEntries[st.rowAt]
        if (e) calendarActions(router, my.s).select(e)
      })}
    >
      <text fontFamily={st.titleFont} fontSize={50.09} x={st.pl} y={st.titleY} letterSpacing={0.42} color="#ffffff">
        {st.title}
      </text>
      <view>
        <For each={buttons.keys()}>
          {(k) => {
            const b = buttons.item(k)
            return (
              <CalPill
                x={b().x}
                y={b().y}
                p={b()}
                focused={st.zone === 'header' && st.btnAt === b().at && has()}
                ring={st.ring}
                fill={st.fill}
                ink={st.ink}
                onPointerOver={() =>
                  point(() => {
                    st.zone = 'header'
                    st.btnAt = b().at
                  })
                }
              />
            )
          }}
        </For>
      </view>
      <view>
        <For each={weekdays.keys()}>
          {(k) => {
            const w = weekdays.item(k)
            return (
              <text fontFamily={w().font} fontSize={20.03} x={w().x} y={w().y} mountX={0.5} letterSpacing={0.42} color="#ffffff8c">
                {w().label}
              </text>
            )
          }}
        </For>
      </view>
      <view>
        <For each={cells.keys()}>
          {(k) => {
            const c = cells.item(k)
            return (
              <view x={c().x} y={c().y} width={c().w} height={c().h} borderRadius={16.7} color={c().bg}>
                <view width={c().w} height={c().h} borderRadius={16.7} color={CLEAR} border={{ width: 2, color: hex(c().todayColor) }} alpha={c().today ? 1 : 0} />
                <view x={c().inset} y={c().inset} width={c().w - c().inset * 2} height={c().h - c().inset * 2 - 10.02} clipping>
                  <text fontFamily={c().numberFont} fontSize={25.04} x={13.36} y={c().numberY} letterSpacing={0.42} color={c().numberColor}>
                    {c().number}
                  </text>
                  <view x={c().tag.x} y={c().tag.y} width={c().tag.w} height={c().tag.h} borderRadius={10.02} color={c().tag.fill} alpha={c().tag.on ? 1 : 0}>
                    <text fontFamily={c().tag.font} fontSize={18.37} x={11.69} y={c().tag.ty} letterSpacing={0.33} color={c().tag.color}>
                      {c().tag.label}
                    </text>
                  </view>
                  <text fontFamily={c().moreFont} fontSize={18.37} x={13.36} y={c().moreY} maxWidth={c().moreW} letterSpacing={0.42} color="#ffffff8c">
                    {c().more}
                  </text>
                </view>
              </view>
            )
          }}
        </For>
      </view>
      <view>
        <For each={entryItems.keys()}>
          {(k) => {
            const e = entryItems.item(k)
            return (
              <view x={e().x} y={e().y} width={e().w} height={e().h} clipping>
                <view y={e().barY} width={5.01} height={23.37} borderRadius={3.34} color={e().bar} />
                <text fontFamily={e().font} fontSize={20.03} x={13.36} y={e().ty} letterSpacing={0.42} color={e().color}>
                  {e().title}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <view
        x={st.ringBox.x}
        y={st.ringBox.y}
        width={st.ringBox.w}
        height={st.ringBox.h}
        borderRadius={16.7}
        color={CLEAR}
        border={{ width: 3, color: hex(st.ring) }}
        alpha={st.zone === 'grid' && has() && !st.message ? 1 : 0}
      />
      <view
        x={st.cells.length ? gridBox().x : 0}
        y={st.cells.length ? gridBox().y : 0}
        width={st.cells.length ? gridBox().w : 0}
        height={st.cells.length ? gridBox().h : 0}
        pointerItems={() => {
          const box = gridBox()
          return (my.cells || []).map((c) => ({ x: c.x - box.x, y: c.y - box.y, w: c.w, h: c.h }))
        }}
        pointerItemRing={16.7}
        onPointerItemClick={(_, i) => pointDay(i)}
      />
      <view>
        <Show when={st.message}>
          {(m) => (
            <CalMessage
              m={m()}
              retryFocused={st.zone === 'retry' && has()}
              ring={st.ring}
              fill={st.fill}
              ink={st.ink}
              onPointerRetry={() => point(() => (st.zone = 'retry'))}
            />
          )}
        </Show>
      </view>

      <view x={st.panel.x} y={st.pt}>
        <text fontFamily={st.panel.nameFont} fontSize={33.39} y={st.panel.nameY} letterSpacing={0.42} color="#ffffff">
          {st.panel.name}
        </text>
        <text fontFamily={st.panel.dateFont} fontSize={23.37} y={st.panel.dateY} letterSpacing={0.42} color="#ffffff8c">
          {st.panel.date}
        </text>
        <text fontFamily={st.panel.dateFont} fontSize={23.37} x={st.panel.w / 2} y={st.panel.emptyY} mountX={0.5} letterSpacing={0.42} color="#ffffff99">
          {st.panel.empty}
        </text>
        <view y={st.panel.listTop} width={st.panel.w} height={st.panel.listH} clipping>
          <view y={-st.panelScroll} width={st.panel.w} height={Math.max(st.panel.listH, st.panelH)}>
            <view>
              <For each={rows.keys()}>
                {(k) => {
                  const r = rows.item(k)
                  return <CalRow y={r().y} r={r()} />
                }}
              </For>
            </view>
            <view
              y={st.panelRing.y}
              width={st.panel.w}
              height={st.panelRing.h}
              borderRadius={16.7}
              color={CLEAR}
              border={{ width: 3, color: hex(st.ring) }}
              alpha={st.zone === 'panel' && has() ? 1 : 0}
            />
            <view
              width={st.panel.w}
              height={Math.max(st.panel.listH, st.panelH)}
              pointerItems={() => st.rows.map((r) => ({ x: 0, y: r.y, w: st.panel.w, h: r.h }))}
              pointerItemRing={16.7}
              onPointerItemClick={(_, i) => pointRow(i)}
            />
          </view>
        </view>
      </view>
    </view>
  )
}
