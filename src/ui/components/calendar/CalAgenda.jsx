import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createSignal, on, onCleanup } from 'solid-js'
import CalPill from './CalPill.jsx'
import CalRow from './CalRow.jsx'
import CalMessage from './CalMessage.jsx'
import { keyed } from '../library/pageKit.js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { navOnLeft } from '../../theme.js'
import { reactive } from '../../../state/reactive.js'
import * as settings from '../../../state/settings.js'
import { router } from '../../../app/router.js'
import { focusNav } from '../../../app/focus.js'
import { inLibrary, recentOf, sameDay, upcomingOf } from '../../../utils/calendarEntries.js'
import { formatShortDayName, localeDate } from '../../../utils/dateFormat.js'
import { filterCalendar } from './calendarData.js'
import { nextStop } from '../settings/focusStops.js'
import {
  KICKER_LS, LH, LS, insets, agendaRowModel, artIcon, artUrl, calendarActions, calendarDayName, calendarLook, calendarSubtitle, calendarWhen,
  dp, fitLines, flowPills, flowTags, lineY, linesY, messageModel, pillBox, pillModel, tabModel, textWidth, titleButton,
} from './calendarLook.js'

// The day by day list with a preview of the focused entry beside it, and the Upcoming and Recently
// aired tabs and the Full calendar button above the list. Only the rows near
// the scroll position are built. The page hands it `data` (each load and every settings change),
// and it calls the page's openMonth() and reload().

const GAP = dp(32)
const BUILD_MARGIN = 300
const COVER = { resizeMode: { type: 'cover' } }
const CLEAR = '#00000000'
const NO_PREVIEW = { on: false, x: 0, y: 0, w: 0, h: 0, src: '', icon: '', scrimTop: { top: CLEAR, bottom: CLEAR }, scrimBottom: { top: CLEAR, bottom: CLEAR } }

// Where the list was, kept while a page it opened sits on top so Back lands there again.
let returnTo = null

export default function CalAgenda(props) {
  const st = reactive({
    pg: '#101010',
    ring: '#00a4dc',
    fill: '#ffffff',
    ink: '#000000de',
    pl: 0,
    listW: 0,
    titleY: 0,
    titleFont: uiFont('bold'),
    tabs: [],
    listTop: 0,
    listH: 0,
    contentH: 0,
    scrollY: 0,
    shownDays: [],
    shownRows: [],
    ringY: 0,
    ringH: 0,
    hasRows: false,
    message: null,
    pv: NO_PREVIEW,
    pvTexts: [],
    pvTags: [],
    pvButtons: [],
    zone: 'list',
    tabAt: 0,
    rowAt: 0,
    btnAt: 0,
  })
  const [has, setHas] = createSignal(false)
  const heading = $L('Calendar')
  // The settings preview leaves the list's saved place alone.
  const kept = props.preview ? null : returnTo
  if (!props.preview) returnTo = null
  const my = {
    recent: !!(kept && kept.recent),
    focusedKey: (kept && kept.focusedKey) || null,
    restore: kept,
    keep: false,
    list: [],
    items: [],
    rowsAt: [],
    rowModels: {},
    pvButtons: [],
    shown: null,
  }
  onCleanup(() => {
    // Leaving through one of the list's own pages keeps its place, any other way out lets it go.
    if (!props.preview) returnTo = my.keep ? { recent: my.recent, focusedKey: my.focusedKey, zone: st.zone, btnAt: st.btnAt, tabAt: st.tabAt } : null
  })

  const tabs = keyed(() => st.tabs, (t) => t.k)
  const days = keyed(() => st.shownDays, (d) => d.k)
  const rows = keyed(() => st.shownRows, (r) => r.k)
  const pvTexts = keyed(() => st.pvTexts, (t) => t.k)
  const pvTags = keyed(() => st.pvTags, (t) => t.k)
  const pvButtons = keyed(() => st.pvButtons, (b) => b.k)

  const build = () => {
    const data = my.data
    if (!data) return
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
    const W = 1920 - at.left - at.right
    const listW = (W - GAP) / 2
    st.listW = listW
    my.px = at.left + listW + GAP
    const titleLh = dp(30) * LH
    st.titleY = lineY(at.top, titleLh, dp(30))
    const tabsTop = at.top + titleLh + dp(10)
    const tabH = tabModel('x', 'x', false, look, uiFont).h
    my.tabsTop = tabsTop
    my.tabH = tabH
    buildTabs()
    st.listTop = tabsTop + tabH + dp(12)
    st.listH = 1080 - at.bottom - st.listTop

    const { entries, hidesSpoilers } = data.loading ? { entries: [], hidesSpoilers: () => false } : filterCalendar(data.all, s)
    my.spoilers = hidesSpoilers
    my.now = data.now
    my.today = data.today
    const list = data.loading ? [] : my.recent ? recentOf(entries, data.today) : upcomingOf(entries, data.today)
    my.list = list
    my.rowModels = {}
    layoutList(list)
    const hasRows = !data.loading && !data.problem && list.length > 0
    st.hasRows = hasRows
    if (!hasRows) {
      const box = { x: at.left, y: tabsTop + tabH, w: listW, h: 1080 - at.bottom - tabsTop - tabH }
      const emptyText = my.recent ? $L('Nothing aired recently') : $L('Nothing coming up')
      st.message = messageModel(box, { loading: data.loading, problem: data.problem, emptyText }, look, uiFont)
      st.pv = NO_PREVIEW
      st.pvTexts = []
      st.pvTags = []
      st.pvButtons = []
      my.pvButtons = []
      st.shownRows = []
      st.shownDays = []
      if (st.message.retry.length) st.zone = 'retry'
      else if (!data.loading && st.zone !== 'tabs') focusTab(my.recent ? 1 : 0)
      my.shown = data.loading ? my.shown : -1
      return
    }
    st.message = null
    // The first row takes focus once there is one, or the row Back came back to. A new tab, or a
    // list that changes length, lands on the first row again.
    const first = my.shown == null || my.shown < 0
    const changed = my.shown !== list.length
    my.shown = list.length
    const restore = my.restore
    my.restore = null
    let i = my.focusedKey ? list.findIndex((e) => e.key === my.focusedKey) : -1
    if (changed && !(first && restore)) i = 0
    if (i < 0) i = 0
    if (restore && restore.zone === 'preview') {
      focusRow(i)
      st.zone = 'preview'
      st.btnAt = Math.min(restore.btnAt || 0, Math.max(0, my.pvButtons.length - 1))
    } else if (restore && restore.zone === 'tabs') {
      focusRow(i)
      focusTab(restore.tabAt || 0)
    } else if (changed) focusRow(i)
    else focusRow(i, true)
  }
  const buildTabs = () => {
    const look = my.look
    const list = [
      tabModel('upcoming', $L('Upcoming'), !my.recent, look, uiFont),
      tabModel('recent', $L('Recently aired'), my.recent, look, uiFont),
    ]
    const label = $L('Full calendar')
    const full = { ...pillModel({ id: 'full', label, icon: 'calendar_month_rounded' }, look, uiFont), ...pillBox({ label, icon: 'calendar_month_rounded', compact: true }) }
    let x = my.at.left
    list.forEach((t, i) => {
      t.x = x
      t.y = my.tabsTop + (my.tabH - t.h) / 2
      t.at = i
      x += t.w + dp(8)
    })
    full.x = my.at.left + st.listW - full.w
    full.y = my.tabsTop + (my.tabH - full.h) / 2
    full.at = 2
    st.tabs = list.concat([full])
  }
  // Day headers and rows top to bottom, each with its place in the list.
  const layoutList = (list) => {
    const s = my.s
    const items = []
    let y = 0
    let lastDay = null
    list.forEach((e, i) => {
      if (!lastDay || !sameDay(lastDay, e.day)) {
        const padTop = dp(!lastDay ? 4 : 20)
        const nameLh = dp(16) * LH
        const name = calendarDayName(e.day, my.today, s.dateFormat)
        const isToday = sameDay(e.day, my.today)
        const date = name !== formatShortDayName(e.day, s.dateFormat) ? localeDate(e.day, { month: 'long', day: 'numeric' }) : ''
        items.push({
          kind: 'day',
          k: 'day-' + e.day.getTime(),
          y,
          h: padTop + nameLh + dp(8),
          name,
          font: uiFont('bold'),
          color: isToday ? my.look.accent : '#ffffff',
          nameY: lineY(padTop, nameLh, dp(16)),
          date,
          dateFont: uiFont(),
          dateX: textWidth(name, dp(16), 'bold') + dp(8),
          dateY: lineY(padTop + (nameLh - dp(14) * LH) / 2, dp(14) * LH, dp(14)),
        })
        lastDay = e.day
        y += items[items.length - 1].h
      }
      items.push({ kind: 'row', i, k: e.key, y, h: dp(6) * 2 + dp(72) })
      y += dp(6) * 2 + dp(72)
    })
    my.items = items
    my.rowsAt = items.filter((it) => it.kind === 'row')
    my.contentH = y + dp(24)
    st.contentH = my.contentH
  }
  // Kept with its place, so a focus move hands every row it keeps the same object and no row redraws.
  const rowModel = (it) => {
    const e = my.list[it.i]
    let m = my.rowModels[e.key]
    if (!m) {
      m = { ...agendaRowModel(e, { w: st.listW - dp(8), compact: false, look: my.look, now: my.now, spoilers: my.spoilers(e), s: my.s, fontFor, uiFont }), y: it.y }
      my.rowModels[e.key] = m
    }
    return m
  }
  // Builds the headers and rows near the scroll position.
  const syncWindow = () => {
    const top = st.scrollY - BUILD_MARGIN
    const bottom = st.scrollY + st.listH + BUILD_MARGIN
    const shownDays = []
    const shownRows = []
    my.items.forEach((it) => {
      if (it.y + it.h < top || it.y > bottom) return
      if (it.kind === 'day') shownDays.push(it)
      else shownRows.push(rowModel(it))
    })
    st.shownDays = shownDays
    st.shownRows = shownRows
  }
  // Up from a full width row goes to the tab nearest its middle.
  const nearestTab = () => {
    const mid = st.pl + (st.listW - dp(8)) / 2
    const list = st.tabs
    let best = 0
    list.forEach((t, i) => {
      if (Math.abs(t.x + t.w / 2 - mid) < Math.abs(list[best].x + list[best].w / 2 - mid)) best = i
    })
    return best
  }
  const focusRow = (i, keepZone) => {
    const list = my.list
    if (!list.length) return
    i = Math.max(0, Math.min(i, list.length - 1))
    st.rowAt = i
    my.focusedKey = list[i].key
    const it = my.rowsAt[i]
    // Scrolled so the row sits in the middle of the list.
    const max = Math.max(0, my.contentH - st.listH)
    st.scrollY = Math.max(0, Math.min(max, it.y + it.h / 2 - st.listH / 2))
    st.ringY = it.y
    st.ringH = it.h
    if (!keepZone) st.zone = 'list'
    syncWindow()
    buildPreview(list[i])
  }
  const focusTab = (i) => {
    st.zone = 'tabs'
    st.tabAt = i
  }
  const buildPreview = (e) => {
    const s = my.s
    const look = my.look
    const at = my.at
    const w = st.listW
    const h = 1080 - at.top - at.bottom
    const innerW = w - dp(28) * 2
    const spoilers = my.spoilers(e)
    const now = my.now
    const kicker = [look.badgeOf(e), calendarWhen(e, my.today, s.clockDisplay, s.dateFormat)].filter(Boolean).join(' · ').toUpperCase()
    const subtitle = calendarSubtitle(e, spoilers)
    const art = (!spoilers && e.stillUrl) || e.backdropUrl
    const actions = calendarActions(router, s)
    const buttons = []
    if (inLibrary(e)) buttons.push({ id: 'play', label: $L('Play'), icon: 'play_arrow_rounded', primary: true })
    if (actions.showsRequest(e)) buttons.push({ id: 'request', label: $L('Request'), icon: 'add_rounded', primary: !inLibrary(e) })
    if (actions.canOpen(e)) buttons.push(titleButton(e))
    const overview = !spoilers && e.overview ? e.overview : ''
    const tags = flowTags(look.chips(e).concat(look.tags(e, now)), innerW)
    const pills = flowPills(buttons, { maxW: innerW })
    const pillsH = pills.reduce((m, p) => Math.max(m, p.y + p.h), 0)

    // Laid out top to bottom, then the block is pinned to the pane's bottom padding.
    const parts = []
    const add = (k, text, size, weight, lh, lines, color, mt, ls = LS) =>
      parts.push({ k, text, size, weight, lh, lines: lines || text.split('\n').length, color, mt, ls })
    add('kicker', kicker, dp(13), 'bold', dp(13) * LH, 1, look.color(e, now), 0, KICKER_LS)
    add('title', fitLines(e.title, dp(32), 'bold', innerW, 2), dp(32), 'bold', dp(32) * LH, 0, '#ffffff', dp(6))
    if (subtitle) add('sub', fitLines(subtitle, dp(16), 'regular', innerW, 99), dp(16), 'regular', dp(16) * LH, 0, '#ffffffcc', dp(4))
    let y = 0
    const texts = []
    parts.forEach((p) => {
      y += p.mt
      texts.push({ k: p.k, text: p.text, font: fontFor(p.text, p.weight), size: p.size, lh: p.lh, lines: p.lines, ls: p.ls, color: p.color, y: linesY(y, p.size) })
      y += p.lh * p.lines
    })
    y += dp(8)
    const tagsTop = y
    y += tags.h
    if (overview) {
      y += dp(12)
      const lh = dp(15) * 1.35
      const ov = fitLines(overview, dp(15), 'regular', innerW, 3)
      const lines = ov.split('\n').length
      texts.push({ k: 'overview', text: ov, font: fontFor(overview), size: dp(15), lh, lines, ls: LS, color: '#ffffffbf', y: linesY(y, dp(15)) })
      y += lh * lines
    }
    let buttonsTop = y
    if (pills.length) {
      buttonsTop = y + dp(20)
      y = buttonsTop + pillsH
    }
    const shift = h - dp(28) - y
    texts.forEach((t) => (t.y += shift))
    my.pvButtons = pills
    st.pvTexts = texts
    st.pvTags = tags.tags.map((t) => ({ ...t, font: fontFor(t.label, 'bold'), y: t.y + tagsTop + shift }))
    st.pvButtons = pills.map((p, i) => ({ ...pillModel(p, look, uiFont), at: i, y: buttonsTop + p.y + shift }))
    st.pv = {
      on: true,
      x: my.px,
      y: at.top,
      w,
      h,
      src: artUrl(art),
      icon: `icons/${artIcon(e)}.webp`,
      scrimTop: { top: look.bg(0.1), bottom: look.bg(0.75) },
      scrimBottom: { top: look.bg(0.75), bottom: look.bg(0.97) },
    }
    st.btnAt = Math.min(st.btnAt, Math.max(0, pills.length - 1))
  }
  const switchTab = (toRecent) => {
    if (toRecent === my.recent) return
    my.recent = toRecent
    my.focusedKey = null
    my.shown = -1
    build()
  }
  const press = () => {
    const actions = calendarActions(router, my.s)
    if (st.zone === 'retry') return props.reload()
    if (st.zone === 'tabs') {
      if (st.tabAt === 2) {
        my.keep = true
        return props.openMonth()
      }
      return switchTab(st.tabAt === 1)
    }
    const e = my.list[st.rowAt]
    if (!e) return
    my.keep = true
    if (st.zone === 'list') return actions.select(e)
    const b = my.pvButtons[st.btnAt]
    if (!b) return
    if (b.id === 'play') actions.play(e)
    else if (b.id === 'request') actions.request(e)
    else actions.openTitle(e)
  }
  // Up and Down from the preview's buttons pick the nearest stop over the whole screen as one flat
  // set: the rows (off screen ones too), the tabs and the other buttons.
  const fromPreview = (dir) => {
    const stops = st.tabs.map((t) => ({ sid: `t${t.at}`, tab: t.at, x: t.x, y: t.y, w: t.w, h: t.h }))
    my.rowsAt.forEach((it, i) => stops.push({ sid: `r${i}`, row: i, x: st.pl, y: st.listTop + it.y - st.scrollY, w: st.listW - dp(8), h: it.h }))
    st.pvButtons.forEach((b) => stops.push({ sid: `b${b.at}`, btn: b.at, x: my.px + 46.75 + b.x, y: st.pv.y + b.y, w: b.w, h: b.h }))
    const to = nextStop(stops, stops.find((x) => x.sid === `b${st.btnAt}`), dir)
    if (!to) return
    if (to.row != null) focusRow(to.row)
    else if (to.tab != null) focusTab(to.tab)
    else st.btnAt = to.btn
  }
  // The first row whose top shows below the tabs.
  const firstVisibleRow = () => Math.max(0, my.rowsAt.findIndex((it) => it.y + it.h > st.scrollY))
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

  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={1080}
      color={st.pg}
      onFocusChanged={setHas}
      onLeft={key(() => {
        const sidebar = navOnLeft(my.s)
        if (st.zone === 'tabs') {
          if (st.tabAt > 0) st.tabAt = st.tabAt - 1
          else if (sidebar) focusNav()
        } else if (st.zone === 'preview') {
          if (st.btnAt > 0) st.btnAt = st.btnAt - 1
          else st.zone = 'list'
        } else if (sidebar) focusNav()
      })}
      onRight={key(() => {
        if (st.zone === 'tabs') {
          // The end of the tabs row stays put, rather than jumping over to the preview.
          if (st.tabAt < 2) st.tabAt = st.tabAt + 1
        } else if (st.zone === 'preview') {
          if (st.btnAt < my.pvButtons.length - 1) st.btnAt = st.btnAt + 1
        } else if (st.zone === 'list' && my.pvButtons.length) {
          st.zone = 'preview'
          st.btnAt = 0
        }
      })}
      onUp={key(() => {
        if (st.zone === 'list') {
          if (st.rowAt > 0) focusRow(st.rowAt - 1)
          else focusTab(nearestTab())
        } else if (st.zone === 'retry') focusTab(nearestTab())
        else if (st.zone === 'preview') fromPreview('up')
        else if (st.zone === 'tabs' && !navOnLeft(my.s)) focusNav()
      })}
      onDown={key(() => {
        if (st.zone === 'list') {
          if (st.rowAt < my.list.length - 1) focusRow(st.rowAt + 1)
        } else if (st.zone === 'preview') fromPreview('down')
        else if (st.zone === 'tabs') {
          if (st.hasRows) focusRow(firstVisibleRow())
          else if (st.message && st.message.retry.length) st.zone = 'retry'
        }
      })}
      onEnter={key(press)}
    >
      <text fontFamily={st.titleFont} fontSize={50.09} x={st.pl} y={st.titleY} letterSpacing={0.42} color="#ffffff">
        {heading}
      </text>
      <view>
        <For each={tabs.keys()}>
          {(k) => {
            const t = tabs.item(k)
            return (
              <CalPill
                x={t().x}
                y={t().y}
                p={t()}
                focused={st.zone === 'tabs' && st.tabAt === t().at && has()}
                ring={st.ring}
                fill={st.fill}
                ink={st.ink}
              />
            )
          }}
        </For>
      </view>

      <view x={st.pl} y={st.listTop} width={st.listW} height={st.listH} clipping alpha={st.hasRows ? 1 : 0}>
        <view y={-st.scrollY} width={st.listW} height={Math.max(st.listH, st.contentH)}>
          <view>
            <For each={days.keys()}>
              {(k) => {
                const d = days.item(k)
                return (
                  <view y={d().y} width={st.listW} height={d().h}>
                    <text fontFamily={d().font} fontSize={26.71} y={d().nameY} letterSpacing={0.42} color={d().color}>
                      {d().name}
                    </text>
                    <text fontFamily={d().dateFont} fontSize={23.37} x={d().dateX} y={d().dateY} letterSpacing={0.42} color="#ffffff8c">
                      {d().date}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view>
            <For each={rows.keys()}>
              {(k) => {
                const r = rows.item(k)
                return <CalRow y={r().y} r={r()} />
              }}
            </For>
          </view>
          <view
            y={st.ringY}
            width={st.listW - 13.36}
            height={st.ringH}
            borderRadius={16.7}
            color={CLEAR}
            border={{ width: 3, color: hex(st.ring) }}
            alpha={st.zone === 'list' && has() ? 1 : 0}
          />
        </view>
      </view>
      <view>
        <Show when={st.message}>
          {(m) => <CalMessage m={m()} retryFocused={st.zone === 'retry' && has()} ring={st.ring} fill={st.fill} ink={st.ink} />}
        </Show>
      </view>

      <view x={st.pv.x} y={st.pv.y} alpha={st.pv.on ? 1 : 0}>
        <view width={st.pv.w} height={st.pv.h} borderRadius={26.71} color="#ffffff0f">
          <view x={st.pv.w / 2 - 20} y={st.pv.h / 2 - 20} width={40} height={40} src={st.pv.icon} color="#ffffff4d" />
          <view width={st.pv.w} height={st.pv.h} borderRadius={26.71} src={st.pv.src} textureOptions={COVER} alpha={st.pv.src ? 1 : 0} />
          <view width={st.pv.w} height={st.pv.h / 2} borderRadius={[26.71, 26.71, 0, 0]} colorTop={st.pv.scrimTop.top} colorBottom={st.pv.scrimTop.bottom} />
          <view y={st.pv.h / 2} width={st.pv.w} height={st.pv.h / 2} borderRadius={[0, 0, 26.71, 26.71]} colorTop={st.pv.scrimBottom.top} colorBottom={st.pv.scrimBottom.bottom} />
          <view>
            <For each={pvTexts.keys()}>
              {(k) => {
                const t = pvTexts.item(k)
                return (
                  <text fontFamily={t().font} fontSize={t().size} x={46.75} y={t().y} lineHeight={t().lh} letterSpacing={t().ls} color={t().color}>
                    {t().text}
                  </text>
                )
              }}
            </For>
          </view>
          <view>
            <For each={pvTags.keys()}>
              {(k) => {
                const t = pvTags.item(k)
                return (
                  <view x={46.75 + t().x} y={t().y} width={t().w} height={t().h} borderRadius={10.02} color={t().fill}>
                    <text fontFamily={t().font} fontSize={18.37} x={11.69} y={t().ty} letterSpacing={0.33} color={t().color}>
                      {t().label}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view>
            <For each={pvButtons.keys()}>
              {(k) => {
                const b = pvButtons.item(k)
                return (
                  <CalPill
                    x={46.75 + b().x}
                    y={b().y}
                    p={b()}
                    focused={st.zone === 'preview' && st.btnAt === b().at && has()}
                    ring={st.ring}
                    fill={st.fill}
                    ink={st.ink}
                  />
                )
              }}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}
