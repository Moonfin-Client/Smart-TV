import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createSelector, on, onCleanup, onMount } from 'solid-js'
import GuidePopup from '../../ui/components/livetv/GuidePopup.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import IncompleteBadge from '../../ui/components/home/IncompleteBadge.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { NEON_GLOW } from '../../ui/components/library/libraryChrome.js'
import { cssShift, displayFont, fontFor, normalShift, textWidth, uiFont } from '../../ui/text.js'
import { activeThemeId } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { configureIncomplete } from '../../ui/components/livetv/incompleteSetup.js'
import * as settings from '../../state/settings.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import {
  canKeepAsComplete, incompleteRecordingFor, keepAsComplete, onIncompleteRecordings, refreshIncompleteRecordings,
} from '../../services/incompleteRecordings.js'
import { incompleteText } from '../Details/detailMarks.js'
import { isLiveTvLibrary } from '../../utils/liveTvLibrary.js'
import { formatDayLabel } from '../../utils/clock.js'
import { formatDuration, getImageUrl } from '../../utils/helpers.js'
import { parseServerDate } from '../../utils/serverDate.js'
import { seriesChoiceFlags, seriesChoiceOf } from '../../utils/liveTvGuide.js'
import { LH, addText, popupModel } from '../../ui/components/livetv/guideModels.js'
import { BTN, REC_DANGER, seriesPopup } from '../../ui/components/livetv/livetvPopups.js'
import { nextStop } from '../../ui/components/settings/focusStops.js'

// The Recordings, Schedule and Series Recordings tabs as rails of cards, and the popups a card opens
// (play or delete a recording, cancel a timer, a series rule's settings).

const BODY_Y = 95
const BODY_H = 1080 - BODY_Y
const RAIL_H = 18 + LH + 12 + 240
const CARD_STEP = 318
const COVER = { resizeMode: { type: 'cover' } }
const RING = { width: 3, color: hex('#ffffff') }
// Under Neon Pulse the titles take the display face and glow pink, the subtitles turn cyan and the
// focus ring is pink.
const neonOn = () => activeThemeId(settings.all()) === 'neon_pulse'
const NEON_RING = { width: 3, color: hex('#ff2e92') }
// The dialog titles get the same look, and their subtitles turn cyan.
const neonTitle = () =>
  neonOn() ? { measure: 'neon-display-bold', font: (ln) => displayFont('bold', ln), color: '#ff2e92', spacing: 0.4, shadow: NEON_GLOW } : null

// A canceled, finished or failed timer, or one whose showing is over, has nothing left to record.
const HIDDEN_TIMER_STATUSES = ['Cancelled', 'Completed', 'Error']
const isUpcomingTimer = (timer, now) => {
  const end = parseServerDate(timer.EndDate)
  return HIDDEN_TIMER_STATUSES.indexOf(timer.Status) < 0 && !(end && end.getTime() <= now)
}

const joinParts = (...parts) => parts.filter(Boolean).join(' • ')

// A Thumb tag goes through the backdrop endpoint, then comes the primary image, then the parent's
// backdrop, and finally the placeholder icon.
const recordingImageUrl = (serverUrl, item) => {
  if (!item) return ''
  if (item.ImageTags && item.ImageTags.Thumb) return getImageUrl(serverUrl, item.Id, 'Backdrop/0', { maxWidth: 600 })
  if (item.ImageTags && item.ImageTags.Primary) return getImageUrl(serverUrl, item.Id, 'Primary', { maxHeight: 450, tag: item.ImageTags.Primary })
  if (item.ParentThumbItemId) return getImageUrl(serverUrl, item.ParentThumbItemId, 'Backdrop/0', { maxWidth: 600 })
  return ''
}

const friendlyDate = (date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((day - today) / 86400000)
  if (diff === 0) return $L('Today')
  if (diff === 1) return $L('Tomorrow')
  if (diff === -1) return $L('Yesterday')
  return formatDayLabel(date)
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Recordings(props) {
  const store = getStore()
  const font = uiFont()
  const st = reactive({
    loading: true,
    tab: 'recordings',
    pills: [],
    pillCur: 0,
    // Nothing holds focus until the first key.
    zone: 'none',
    railTitles: [],
    lanes: [],
    rail: 0,
    col: 0,
    scrollY: 0,
    emptyText: '',
    trackH: BODY_H,
    popup: null,
  })
  const my = {
    rows: { recent: [], series: [], movies: [], sports: [], kids: [] },
    timers: [],
    seriesTimers: [],
    reads: { started: 0, applied: 0 },
    rails: [],
    lanes: [],
    scrollX: null,
    rs: null,
    sel: null,
  }
  let root
  let popupRef = null
  const active = () => !props.page || props.page.active()
  const pills = keyed(() => st.pills, (p) => p.k)
  const railTitles = keyed(() => st.railTitles, (t) => t.k)
  const lanes = keyed(() => st.lanes, (l) => l.k)
  // A popup takes focus off the card, which settles back to its resting size and dim.
  const focusKey = () => (st.zone === 'rails' && !st.popup ? `${st.rail}-${st.col}` : '')
  const isFocused = createSelector(focusKey)
  const pillOn = (i) => st.zone === 'pills' && st.pillCur === i

  const enter = () => {
    const lib = (store.libraries || []).find(isLiveTvLibrary)
    if (lib) store.navSection = lib.Id
  }
  // The schedule is read again whenever a series rule changes, and reads can finish out of order,
  // so only one newer than the last applied replaces the list.
  const reloadTimers = () => {
    const read = ++my.reads.started
    return api.getLiveTvTimers().then((result) => {
      if (read < my.reads.applied) return
      my.reads.applied = read
      const now = Date.now()
      my.timers = ((result && result.Items) || []).filter((t) => isUpcomingTimer(t, now))
      if (!st.loading) build()
    }, () => {})
  }
  const load = async () => {
    st.loading = true
    const [recent, series, movies, sports, kids, seriesTimers] = await Promise.all([
      api.getLiveTvRecordings({ limit: 40 }).catch(() => null),
      api.getLiveTvRecordings({ limit: 60, isSeries: true }).catch(() => null),
      api.getLiveTvRecordings({ limit: 60, isMovie: true }).catch(() => null),
      api.getLiveTvRecordings({ limit: 60, isSports: true }).catch(() => null),
      api.getLiveTvRecordings({ limit: 60, isKids: true }).catch(() => null),
      api.getLiveTvSeriesTimers().catch(() => null),
      reloadTimers(),
    ])
    const items = (r) => (r && r.Items) || []
    my.rows = { recent: items(recent), series: items(series), movies: items(movies), sports: items(sports), kids: items(kids) }
    my.seriesTimers = items(seriesTimers)
    st.loading = false
    build()
  }
  const railsFor = () => {
    const server = getServerUrl()
    const rec = (r) => ({ payload: r, kind: 'recording', image: recordingImageUrl(server, r), title: r.Name, sub: joinParts(r.ChannelName, r.EpisodeTitle) })
    const timer = (t) => ({ payload: t, kind: 'timer', image: recordingImageUrl(server, t.ProgramInfo), title: t.Name, sub: joinParts(t.ChannelName, t.ProgramInfo && t.ProgramInfo.EpisodeTitle) })
    if (st.tab === 'recordings') {
      const cutoff = Date.now() + 86400000
      const soon = my.timers.filter((t) => t.StartDate && new Date(t.StartDate).getTime() < cutoff)
      const r = my.rows
      return [
        { title: $L('Scheduled in Next 24 Hours'), items: soon.map(timer) },
        { title: $L('Recent Recordings'), items: r.recent.map(rec) },
        { title: $L('TV Series'), items: r.series.map(rec) },
        { title: $L('Movies'), items: r.movies.map(rec) },
        { title: $L('Sports'), items: r.sports.map(rec) },
        { title: $L('Kids'), items: r.kids.map(rec) },
      ].filter((rail) => rail.items.length > 0)
    }
    if (st.tab === 'schedule') {
      const groups = {}
      my.timers.forEach((t) => {
        if (!t.StartDate) return
        const start = new Date(t.StartDate)
        const key = dayKey(start)
        if (!groups[key]) groups[key] = { key, date: start, items: [] }
        groups[key].items.push(t)
      })
      return Object.keys(groups).sort().map((k) => ({ title: friendlyDate(groups[k].date), items: groups[k].items.map(timer) }))
    }
    if (!my.seriesTimers.length) return []
    return [{
      title: '',
      items: my.seriesTimers.map((s) => ({
        payload: s, kind: 'seriesTimer', image: '', series: true, title: s.Name,
        sub: joinParts(s.RecordAnyChannel ? $L('All channels') : s.ChannelName, s.DayPattern),
      })),
    }]
  }
  const build = () => {
    const r = my.rows
    const count = r.recent.length + r.series.length + r.movies.length + r.sports.length + r.kids.length
    const labels = [
      { id: 'recordings', label: `${$L('Recordings')} (${count})` },
      { id: 'schedule', label: `${$L('Schedule')} (${my.timers.length})` },
      { id: 'series', label: `${$L('Series Recordings')} (${my.seriesTimers.length})` },
    ]
    // Right aligned: 12 between the tab pills and 18 before the back arrow.
    let x = 1884 - 69 - 18
    const tabs = labels.slice().reverse().map((l) => {
      const w = Math.round(textWidth(l.label, 20) + 42)
      x -= w
      const p = { k: l.id, id: l.id, x, y: 31.5, w, h: 44, label: l.label, on: st.tab === l.id, ty: 10 + normalShift(20) }
      x -= 12
      return p
    }).reverse()
    tabs.forEach((p, i) => {
      p.i = i
    })
    const rails = railsFor()
    my.rails = rails
    const titles = []
    my.scrollX = my.scrollX && my.scrollX.length === rails.length ? my.scrollX : rails.map(() => 0)
    my.rs = my.rs && my.rs.length === rails.length ? my.rs : rails.map(() => 0)
    const lanes = rails.map((rail, ri) => {
      const top = ri * RAIL_H + 18
      let railTop = top
      if (rail.title) {
        titles.push({ k: `t${ri}`, text: rail.title, font: fontFor(rail.title, 'bold'), y: top + cssShift(27) })
        railTop += LH + 12
      }
      return { k: `r${ri}`, top: railTop, rs: my.rs[ri], cards: rail.items.map((it, ci) => cardModel(it, ri, ci)) }
    })
    my.lanes = lanes
    batch(() => {
      st.pills = tabs
      st.railTitles = titles
      st.lanes = lanes
      st.trackH = Math.max(BODY_H, rails.length * RAIL_H + 18)
      st.emptyText = rails.length ? '' : st.tab === 'recordings' ? $L('No recordings found') : st.tab === 'schedule' ? $L('No scheduled recordings') : $L('No series recordings')
      if (st.zone === 'rails' && !rails.length) focusPills(st.pillCur)
      else if (st.zone === 'rails') focusCard(Math.min(st.rail, rails.length - 1), st.col)
    })
  }
  const cardModel = (it, ri, ci) => ({
    k: `${ri}-${it.payload.Id}`, fk: `${ri}-${ci}`, c: ci, x: 90 + ci * CARD_STEP - my.scrollX[ri],
    // The card is as tall as its lines: the 168 thumb, 8 and a 33 title line, then 2 and a 33 subtitle line.
    h: it.sub ? 244 : 209,
    image: it.image, series: !!it.series, icon: it.series ? 'icons/smart_record.webp' : 'icons/dvr.webp', iconColor: it.series ? '#ffffff26' : '#ffffff33',
    title: it.title || '', titleFont: neonOn() ? displayFont('bold', it.title || '') : fontFor(it.title || '', 'medium'), tShift: cssShift(20),
    sub: it.sub || '', subFont: fontFor(it.sub || ''), sShift: cssShift(16),
    incomplete: it.kind === 'recording' && !!incompleteRecordingFor(it.payload.Id),
  })
  const focusPills = (i) => {
    batch(() => {
      st.zone = 'pills'
      st.pillCur = Math.max(0, Math.min(3, i))
    })
  }
  // Focus scrolls the card into view by the least it takes, then its row. The 240 tall rail clips a
  // 244 tall card with a subtitle, so the first such card focused in a rail scrolls the rail up by
  // the 9 of its top padding, and it stays there.
  const focusCard = (ri, ci) => {
    const lane = my.lanes[ri]
    if (!lane) return
    ci = Math.max(0, Math.min(lane.cards.length - 1, ci))
    batch(() => {
      st.zone = 'rails'
      st.rail = ri
      st.col = ci
      const left = 90 + ci * CARD_STEP - my.scrollX[ri]
      let sx = my.scrollX[ri]
      if (left < 0) sx += left
      else if (left + 300 > 1920) sx += left + 300 - 1920
      const rs = lane.cards[ci].h > 240 ? 9 : my.rs[ri]
      if (sx !== my.scrollX[ri] || rs !== my.rs[ri]) {
        my.scrollX[ri] = sx
        my.rs[ri] = rs
        const next = { ...lane, rs, cards: lane.cards.map((c) => ({ ...c, x: 90 + c.c * CARD_STEP - sx })) }
        my.lanes = my.lanes.map((l, i) => (i === ri ? next : l))
        st.lanes = my.lanes
      }
      // The row's box starts below its 18 margin and ends at the rail's bottom.
      const top = ri * RAIL_H + 18
      const bottom = (ri + 1) * RAIL_H
      if (top < st.scrollY) st.scrollY = top
      else if (bottom > st.scrollY + BODY_H) st.scrollY = bottom - BODY_H
    })
  }
  // Every arrow goes to the nearest pill or card that way, across rails and up to the pills, measured
  // with the focused card scaled 1.08 about its middle.
  const stops = () => {
    const out = st.pills.map((p) => ({ sid: `p${p.i}`, pill: p.i, x: p.x, y: p.y, w: p.w, h: p.h }))
    out.push({ sid: 'p3', pill: 3, x: 1815, y: 30, w: 69, h: 47 })
    my.lanes.forEach((lane, ri) => {
      lane.cards.forEach((c) => {
        const x = c.x
        const y = BODY_Y + lane.top + 9 - lane.rs - st.scrollY
        const on = st.zone === 'rails' && st.rail === ri && st.col === c.c
        const grow = on ? 0.04 : 0
        out.push({ sid: c.fk, r: ri, c: c.c, x: x - 300 * grow, y: y - c.h * grow, w: 300 * (1 + 2 * grow), h: c.h * (1 + 2 * grow) })
      })
    })
    return out
  }
  // With focus lost after a popup, the next key puts focus back on the card.
  // shortcut: this ignores where the Magic Remote's pointer last was. Track the pointer if that case matters.
  const move = (dir) => {
    if (st.zone === 'none') return focusPills(0)
    if (st.zone === 'lost') return focusCard(st.rail, st.col)
    const all = stops()
    const sid = st.zone === 'pills' ? `p${st.pillCur}` : `${st.rail}-${st.col}`
    const to = nextStop(all, all.find((s) => s.sid === sid), dir)
    if (!to) return
    if (to.pill != null) focusPills(to.pill)
    else focusCard(to.r, to.c)
  }
  const selectCard = () => {
    const it = my.rails[st.rail] && my.rails[st.rail].items[st.col]
    if (!it) return
    openPopup(it.kind, it.payload)
  }
  const openPopup = (kind, item) => {
    my.sel = { kind, item }
    let m
    if (kind === 'recording') {
      const buttons = [{ id: 'play', label: $L('Play'), ...BTN() }]
      const incomplete = incompleteText(incompleteRecordingFor(item.Id), settings.get('clockDisplay'))
      if (incomplete && canKeepAsComplete()) buttons.push({ id: 'keep', label: $L('Keep as Complete'), ...BTN() })
      buttons.push({ id: 'delete', label: $L('Delete'), ...REC_DANGER() }, { id: 'close', label: $L('Close'), ...BTN() })
      m = popupModel({
        width: 840, title: item.Name || '', titleStyle: neonTitle(), titleGap: 18, buttons,
        body: (ctx) => {
          let y = 0
          if (item.EpisodeTitle) y = addText(ctx, 'sub', y, item.EpisodeTitle, { size: 21, color: neonOn() ? '#00e5ff' : '#ffffffb3' })
          if (item.Overview) y = addText(ctx, 'ov', y + 12, item.Overview, { size: 20, lh: 30, color: '#ffffff99' })
          const meta = joinParts(item.ChannelName, item.RunTimeTicks ? formatDuration(item.RunTimeTicks) : '')
          y = addText(ctx, 'meta', y + 12, meta || ' ', { size: 18, color: '#ffffff80' })
          return incomplete ? addText(ctx, 'inc', y + 12, incomplete, { size: 18, weight: 'bold', color: '#e0a33c' }) : y
        },
      })
      m.focus = 'play'
    } else if (kind === 'timer') {
      m = popupModel({
        width: 700, bg: '#1a1a2e', title: $L('Cancel Recording?'), titleStyle: neonTitle(), titleGap: 18,
        buttons: [{ id: 'no', label: $L('No'), ...BTN() }, { id: 'yes', label: $L('Yes, Cancel'), ...REC_DANGER() }],
        body: (ctx) => addText(ctx, 'q', 0, $L('Cancel scheduled recording of "{name}"?').replace('{name}', item.Name || ''), { size: 21, color: '#ffffffcc' }),
      })
      // No is the default so a stray OK can't cancel anything.
      m.focus = 'no'
    } else if (kind === 'seriesTimer') {
      m = popupModel({
        width: 700, bg: '#1a1a2e', title: item.Name || '', titleStyle: neonTitle(), titleGap: 18,
        buttons: [
          { id: 'close', label: $L('Close'), ...BTN() },
          { id: 'settings', label: $L('Series Settings'), ...BTN() },
          { id: 'cancelSeries', label: $L('Cancel Series Recording'), ...REC_DANGER() },
        ],
      })
      m.focus = 'close'
    } else if (kind === 'seriesChoice') {
      m = seriesPopup(seriesChoiceOf(item), neonTitle())
    }
    st.popup = m
    if (popupRef) popupRef.setFocus()
  }
  // Closing a popup doesn't put focus back, so nothing shows focus until the next key.
  const closePopup = () => {
    batch(() => {
      st.popup = null
      if (st.zone === 'rails') st.zone = 'lost'
    })
    my.sel = null
    if (root) root.setFocus()
  }
  const onPopup = async (id) => {
    const sel = my.sel
    if (!sel) return
    const item = sel.item
    if (id === 'back' || id === 'close' || id === 'no') return closePopup()
    try {
      if (sel.kind === 'recording') {
        if (id === 'play') {
          closePopup()
          router.to(`/player/${item.Id}`)
        } else if (id === 'delete') {
          await api.deleteItem(item.Id)
          Object.keys(my.rows).forEach((k) => {
            my.rows[k] = my.rows[k].filter((r) => r.Id !== item.Id)
          })
          closePopup()
          build()
        } else if (id === 'keep') {
          await keepAsComplete(item.Id)
          closePopup()
        }
      } else if (sel.kind === 'timer' && id === 'yes') {
        await api.cancelLiveTvTimer(item.Id)
        // A read started before the cancel can still return the canceled timer.
        my.reads.applied = ++my.reads.started
        my.timers = my.timers.filter((t) => t.Id !== item.Id)
        closePopup()
        build()
      } else if (sel.kind === 'seriesTimer') {
        if (id === 'settings') openPopup('seriesChoice', item)
        else if (id === 'cancelSeries') {
          await api.cancelLiveTvSeriesTimer(item.Id)
          my.seriesTimers = my.seriesTimers.filter((s) => s.Id !== item.Id)
          reloadTimers()
          closePopup()
          build()
        }
      } else if (sel.kind === 'seriesChoice') {
        if (seriesChoiceOf(item) !== id) {
          const updated = { ...item, ...seriesChoiceFlags(id) }
          await api.updateLiveTvSeriesTimer(item.Id, updated)
          my.seriesTimers = my.seriesTimers.map((s) => (s.Id === item.Id ? updated : s))
          reloadTimers()
        }
        closePopup()
        build()
      }
    } catch (err) {
      console.error('[recordings] action failed', err)
    }
  }

  // The Magic Remote's cursor (app/pointer.js): a pill takes focus on hover. Focus scrolls the rails
  // to a card, so the cursor rings a card and a click focuses it and opens it.
  const pointPill = (i) => !st.popup && !(st.zone === 'pills' && st.pillCur === i) && focusPills(i)
  const pointCard = (ri, ci) => {
    if (st.popup || !my.lanes[ri]) return false
    focusCard(ri, ci)
    return true
  }
  const enterKey = () => {
    if (st.zone === 'none') return
    if (st.zone === 'lost') return focusCard(st.rail, st.col)
    if (st.zone === 'rails') return selectCard()
    if (st.pillCur === 3) return router.back()
    const p = st.pills[st.pillCur]
    if (!p) return
    if (p.id !== st.tab) {
      st.tab = p.id
      my.scrollX = null
      my.rs = null
      st.scrollY = 0
      build()
    }
  }
  const handle = (fn) => () => {
    fn()
    return true
  }

  let offIncomplete = null
  onMount(() => {
    enter()
    configureIncomplete(store.user)
    load()
    refreshIncompleteRecordings()
    // The incomplete list lands after the cards, and the badges follow it.
    offIncomplete = onIncompleteRecordings(() => {
      if (!st.loading) build()
    })
    // A lazy page isn't there when the stack focuses its root, so it takes focus itself.
    if (root && active()) root.setFocus()
  })
  createEffect(on(active, (on) => on && enter(), { defer: true }))
  onCleanup(() => offIncomplete && offIncomplete())

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#000000"
      forwardFocus={() => {
        if (!st.popup || !popupRef) return false
        popupRef.setFocus()
        return true
      }}
      onUp={handle(() => move('up'))}
      onDown={handle(() => move('down'))}
      onLeft={handle(() => move('left'))}
      onRight={handle(() => move('right'))}
      onEnter={handle(enterKey)}
      onBack={handle(() => router.back())}
    >
      <Spinner x={928} y={508} size={64} alpha={st.loading ? 1 : 0} />
      <view alpha={st.loading ? 0 : 1}>
        <text
          fontFamily={neonOn() ? displayFont('bold') : uiFont('bold')}
          fontSize={39}
          x={36}
          y={neonOn() ? 35.5 : 37 + 3.5}
          lineHeight={33}
          letterSpacing={neonOn() ? 0.4 : 0}
          color={neonOn() ? '#ff2e92' : '#ffffff'}
          textShadow={neonOn() ? NEON_GLOW : undefined}
        >
          {$L('Recordings')}
        </text>
        <view>
          <For each={pills.keys()}>
            {(k) => {
              const p = pills.item(k)
              return (
                <view x={p().x} y={p().y} width={p().w} height={p().h} onPointerOver={() => pointPill(p().i)}>
                  <view width={p().w} height={p().h} borderRadius={30} color={p().on ? '#00a4dcb3' : '#ffffff1a'} alpha={pillOn(p().i) ? 0 : 1} />
                  <view width={p().w} height={p().h} borderRadius={30} color="#00a4dc" alpha={pillOn(p().i) ? 1 : 0} />
                  <text fontFamily={font} fontSize={20} x={21} y={p().ty} lineHeight={1} color={p().on || pillOn(p().i) ? '#ffffff' : '#ffffffcc'}>
                    {p().label}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <view x={1815} y={30} width={69} height={47} onPointerOver={() => pointPill(3)}>
          <view width={69} height={47} borderRadius={30} color="#ffffff1a" alpha={pillOn(3) ? 0 : 1} />
          <view width={69} height={47} borderRadius={30} color="#00a4dc" alpha={pillOn(3) ? 1 : 0} />
          <view x={21} y={10} width={27} height={27} src="icons/arrow_back.webp" color={pillOn(3) ? '#ffffff' : '#ffffffcc'} />
        </view>

        <view y={BODY_Y} width={1920} height={BODY_H} clipping>
          <view
            transition={{ y: { duration: 250, easing: 'ease-out' } }}
            y={-st.scrollY}
            width={1920}
            height={st.trackH}
          >
            <view>
              <For each={railTitles.keys()}>
                {(k) => {
                  const rt = railTitles.item(k)
                  return (
                    <text fontFamily={rt().font} fontSize={27} x={90} y={rt().y} lineHeight={33} color="#ffffff">
                      {rt().text}
                    </text>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={lanes.keys()}>
                {(lk) => {
                  const lane = lanes.item(lk)
                  const cards = keyed(() => lane().cards, (c) => c.k)
                  return (
                    <view y={lane().top} width={1920} height={240} clipping>
                      <view transition={{ y: { duration: 250, easing: 'ease-out' } }} y={9 - lane().rs} width={1920} height={244}>
                        <For each={cards.keys()}>
                          {(k) => {
                            const c = cards.item(k)
                            const on = () => isFocused(c().fk)
                            return (
                              <view
                                transition={{ x: { duration: 250, easing: 'ease-out' }, scale: { duration: 150 }, alpha: { duration: 150 } }}
                                x={c().x}
                                width={300}
                                height={c().h}
                                pivot={0.5}
                                scale={on() ? 1.08 : 1}
                                alpha={on() ? 1 : 0.75}
                                pointerRing={6}
                                onPointerClick={() => pointCard(my.lanes.findIndex((l) => l.k === lk), c().c)}
                              >
                                <view width={300} height={168} borderRadius={6} color="#ffffff0f" />
                                <view
                                  x={114}
                                  y={48}
                                  width={72}
                                  height={72}
                                  src={c().icon}
                                  alpha={c().image ? 0 : 1}
                                  color={c().series && on() ? '#ffffff66' : c().iconColor}
                                />
                                <view x={3} y={3} width={294} height={162} borderRadius={3} src={c().image} textureOptions={COVER} alpha={c().image ? 1 : 0} />
                                <view width={300} height={168} borderRadius={6} color="#00000000" border={neonOn() ? NEON_RING : RING} alpha={on() ? 1 : 0} />
                                <view>
                                  <Show when={c().incomplete}>
                                    <IncompleteBadge x={8} y={8} />
                                  </Show>
                                </view>
                                <text fontFamily={c().titleFont} fontSize={20} y={176 + c().tShift} lineHeight={33} maxWidth={300} maxLines={1} letterSpacing={neonOn() ? 0.4 : 0} color={neonOn() ? '#ff2e92' : '#ffffff'} textShadow={neonOn() ? NEON_GLOW : undefined}>
                                  {c().title}
                                </text>
                                <text fontFamily={c().subFont} fontSize={16} y={211 + c().sShift} lineHeight={33} maxWidth={300} maxLines={1} color={neonOn() ? '#00e5ff' : '#ffffff80'}>
                                  {c().sub}
                                </text>
                              </view>
                            )
                          }}
                        </For>
                      </view>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>
        <text fontFamily={font} fontSize={21} x={960} y={215 + 2} mountX={0.5} lineHeight={33} color="#ffffff80" alpha={st.emptyText ? 1 : 0}>
          {st.emptyText}
        </text>
      </view>
      <GuidePopup ref={(n) => (popupRef = n)} m={st.popup} alpha={st.popup ? 1 : 0} onPopup={onPopup} />
    </view>
  )
}
