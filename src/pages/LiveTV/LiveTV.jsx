import $L from '../../services/i18n.js'
import { For, batch, createEffect, on, onCleanup, onMount } from 'solid-js'
import GuideRow from '../../ui/components/livetv/GuideRow.jsx'
import GuidePopup from '../../ui/components/livetv/GuidePopup.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import { keyed, pageTimers } from '../../ui/components/library/pageKit.js'
import { cssShift, fontFor, textWidth, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { configureIncomplete } from '../../ui/components/livetv/incompleteSetup.js'
import * as settings from '../../state/settings.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import { createLiveTvGuideStore } from '../../services/liveTvGuideStore.js'
import { getLiveTvLastChannelId, loadLiveTvLastChannel, setLiveTvLastChannelId } from '../../services/liveTvLastChannel.js'
import { isLiveTvLibrary } from '../../utils/liveTvLibrary.js'
import { getImageUrl } from '../../utils/helpers.js'
import { formatClockTime, formatDayLabel } from '../../utils/clock.js'
import { KEYS, pageDirection, remoteShortcut } from '../../utils/keys.js'
import {
  CELL_KINDS, CHANNEL_SORTS, DEFAULT_SERIES_CHOICE, GUIDE_FILTERS, artworkSource, buildRowCells, clampAnchorInto,
  episodeTitleOf, floorToHalfHour, genreFor, guideLeftEdge, isLiveAt, programAiringAt, programEnd, programStart,
  reanchorSelection, recordingMark, resolveCellIndexAt, seasonEpisodeLabel, seriesChoiceFlags, seriesChoiceOf,
} from '../../utils/liveTvGuide.js'
import { RECORD_OUTCOME, outcomeAddsFutureShowing, recordAiring, recordAiringMessage, recordPromptChannel } from '../../utils/recordAiring.js'
import {
  GRID_H, PX, ROW_H, WINDOW_MS, barModels, cellModels, channelModel, chipModels, collapse, flattenCells, heroModel, marqueeItems,
} from '../../ui/components/livetv/guideModels.js'
import { datePopup, programPopup, recordPromptPopup, seriesPopup, sortPopup } from '../../ui/components/livetv/livetvPopups.js'

// The program guide: filter chips, the hero that previews the focused program, the window bar, and
// the grid of channels and their programs, with liveTvGuideStore holding the data. Only the rows near
// the scroll position exist as nodes, built a few per tick.

const MINUTE = 60000
const HALF_HOUR = 30 * MINUTE
const MAX_HISTORY_MS = 24 * 60 * MINUTE
const QUIET_MS = 1000
const VISIBLE_ROWS = 9
const OVERSCAN = 2
const BATCH = 3
const PREFETCH_ROWS = 12
const ARTWORK_MARGIN = 5
const BAR_LAST = 5
const PLEX_MISSING_FILTERS = ['sports', 'news', 'kids']
const CONTAIN = { resizeMode: { type: 'contain' } }
const COVER = { resizeMode: { type: 'cover' } }
const PLATE_R = [23, 0, 0, 23]
const byK = (it) => it.k

const normalizeSort = (value) => (CHANNEL_SORTS.indexOf(value) >= 0 ? value : 'number')
const clockOf = (ms) => formatClockTime(new Date(ms), settings.get('clockDisplay'))
const isLoadingCells = (cells) => cells.length === 1 && cells[0].kind === CELL_KINDS.loading
const rowsPerViewport = () => Math.max(1, Math.floor(GRID_H / ROW_H))

export default function LiveTV(props) {
  const store = getStore()
  const later = pageTimers()
  const font = uiFont()
  const boldFont = uiFont('bold')
  const st = reactive({
    status: 'loading',
    message: '',
    count: 0,
    rows: [],
    scrollY: 0,
    focusRowId: '',
    focusCellKey: '',
    zone: 'grid',
    chips: [],
    chipCur: 0,
    barCur: 0,
    winLabel: '',
    winFont: font,
    slots: [],
    hero: heroModel({ title: $L('Guide Timeline') }),
    plateW: 157,
    plateH: 209,
    synY: 0,
    popup: null,
    mq: [],
    mqOn: false,
    promptBusy: false,
    numberBuffer: '',
    toastText: '',
  })
  const bar = barModels()
  // Plain state the screen doesn't draw from.
  const my = {
    version: 0,
    channels: [],
    cells: {},
    row: 0,
    onChannel: true,
    sel: null,
    pending: null,
    lastBar: 0,
    focusRef: { railFocused: false, channelId: null, program: null, area: null },
    restored: false,
    prevState: 'loading',
    prevLineup: '',
    keyAt: 0,
    now: Date.now(),
    toastKey: 0,
  }
  let root
  let popupRef = null
  const active = () => !props.page || props.page.active()

  const chips = keyed(() => st.chips, byK)
  const barButtons = keyed(() => bar.buttons, byK)
  const slots = keyed(() => st.slots, byK)
  const rows = keyed(() => st.rows, (r) => r.key)
  const heroBoxes = keyed(() => st.hero.boxes, byK)
  const heroIcons = keyed(() => st.hero.icons, byK)
  const heroTexts = keyed(() => st.hero.texts, byK)
  const plate = () => st.hero.plate[0] || null
  const syn = () => st.hero.synopsis
  // The grid shows focus only while it has it.
  const gridKey = () => (st.zone === 'grid' && !st.popup ? st.focusCellKey : '')
  const gridShown = () => st.status === 'ready' && st.count > 0
  const toastW = () => textWidth(st.toastText, 20) + 56
  const numberW = () => textWidth(st.numberBuffer, 54, 'bold') + 72
  const barOn = (i) => st.zone === 'bar' && st.barCur === i && !st.popup

  // The nav bar is hidden over Live TV, so only its section is set here.
  const enter = () => {
    const lib = (store.libraries || []).find(isLiveTvLibrary)
    if (lib) store.navSection = lib.Id
  }
  const scheduleRefresh = () => {
    if (my.refreshTimer) return
    my.refreshTimer = later(() => {
      my.refreshTimer = null
      refresh()
    }, 0)
  }
  // Runs after every store change.
  const refresh = () => {
    const s = my.store
    if (!s) return
    my.version++
    const list = s.filteredChannels
    my.channels = list
    batch(() => {
      st.status = s.state
      st.count = list.length
      st.chips = chipModels(my.filters, s.filter)
      st.winLabel = collapse(`${formatDayLabel(new Date(s.guideDate))}  ${clockOf(s.windowStart)} – ${clockOf(s.windowEnd)}`)
      st.winFont = fontFor(st.winLabel)
      const next = []
      for (let t = s.windowStart, i = 0; t < s.windowEnd; t += HALF_HOUR, i++) {
        next.push({ k: String(t), label: clockOf(t), x: i * HALF_HOUR * PX + 12, y: cssShift(17) })
      }
      st.slots = next
    })
    if (s.state === 'error') {
      st.message = $L('Failed to load guide: {error}').replace('{error}', (s.error && s.error.message) || String(s.error || ''))
      return
    }
    const prev = my.prevState
    my.prevState = s.state
    if (s.state !== 'ready') {
      st.message = ''
      return
    }
    st.message = list.length ? '' : $L('No channels found')
    s.scheduleBoundaryRefresh()
    queueArtwork()
    const lineup = list.map((c) => c.Id).join(',')
    const changed = lineup !== my.prevLineup
    my.prevLineup = lineup
    if (!my.restored) {
      if (!list.length) return
      my.restored = true
      loadLiveTvLastChannel().then(() => {
        const at = my.channels.findIndex((c) => c.Id === getLiveTvLastChannelId())
        focusChannelRow(at >= 0 ? at : 0)
      })
      return
    }
    if (prev === 'loading' && !st.popup && my.focusRef.area === 'grid') {
      restoreGridFocus()
      return
    }
    // A filter or sort moved the selected channel to another row, or out of the lineup.
    if (changed && my.sel && list.length) {
      let row = list.findIndex((c) => c.Id === my.sel.channelId)
      if (row < 0) {
        row = Math.min(Math.max(0, my.row), list.length - 1)
        const fb = cellsFor(list[row].Id)
        if (fb.length) {
          const cell = fb[resolveCellIndexAt(fb, my.sel.anchorTime)]
          my.sel = { channelId: list[row].Id, anchorTime: clampAnchorInto(cell, my.sel.anchorTime), programId: cell.program ? cell.program.Id : null }
        }
      }
      if (my.focusRef.area === 'grid' && !st.popup) {
        if (my.onChannel) focusChannelRow(row)
        else focusSelected()
      } else my.row = row
    }
    applyPending()
    syncRows()
  }
  // What a row's cells are built from. The store adds programs to a channel's list in place, so the
  // list's length is part of it as well as which list it is.
  const cellInputs = (id) => {
    const s = my.store
    const visible = s.programsForChannel(id)
    const unfiltered = s.unfilteredProgramsForChannel(id)
    return [visible, visible.length, unfiltered, unfiltered.length, s.hasProgramsFor(id), s.windowStart, s.windowEnd]
  }
  // A row's cells stand until the next refresh or clock tick, and then they're built again only
  // when what they're built from has changed.
  const cellsFor = (id) => {
    let kept = my.cells[id]
    if (kept && kept.version === my.version) return kept.cells
    const inputs = cellInputs(id)
    if (!kept || !inputs.every((v, i) => v === kept.inputs[i])) {
      kept = my.cells[id] = {
        inputs,
        cells: buildRowCells({ visible: inputs[0], unfiltered: inputs[2], loaded: inputs[4], windowStart: inputs[5], windowEnd: inputs[6] }),
      }
    }
    kept.version = my.version
    return kept.cells
  }
  const rowModel = (i) => {
    const ch = my.channels[i]
    const tag = ch.ImageTags && ch.ImageTags.Primary
    const logo = tag ? getImageUrl(getServerUrl(), ch.Id, 'Primary', { maxHeight: ROW_H, tag }) : ''
    return {
      key: ch.Id, id: ch.Id, idx: i, v: my.version, y: i * ROW_H,
      ch: channelModel(ch, logo),
      fl: flattenCells(cellModels(cellsFor(ch.Id), my.store.windowStart, my.now, $L('No program data'))),
    }
  }
  const scheduleSync = (delay = 0) => {
    if (my.syncTimer) return
    my.syncTimer = later(() => {
      my.syncTimer = null
      syncRows()
    }, delay)
  }
  // Keeps rows for the channels around the scroll position, building a few per tick, nearest
  // the focused row first.
  const syncRows = () => {
    const s = my.store
    const list = my.channels
    if (!s || !list.length) {
      if (st.rows.length) st.rows = []
      return
    }
    const top = Math.floor(st.scrollY / ROW_H)
    const first = Math.max(0, top - OVERSCAN)
    const last = Math.min(list.length - 1, top + VISIBLE_ROWS + OVERSCAN)
    const have = {}
    st.rows.forEach((r) => {
      if (r.idx >= first && r.idx <= last && list[r.idx] && list[r.idx].Id === r.id) have[r.idx] = r
    })
    const todo = []
    for (let i = first; i <= last; i++) if (!have[i] || have[i].v !== my.version) todo.push(i)
    todo.sort((a, b) => Math.abs(a - my.row) - Math.abs(b - my.row))
    todo.slice(0, BATCH).forEach((i) => {
      have[i] = rowModel(i)
    })
    const next = []
    for (let i = first; i <= last; i++) if (have[i]) next.push(have[i])
    st.rows = next
    if (todo.length > BATCH) scheduleSync(32)
    if (s.state === 'ready' && s.hasMorePrograms && last + PREFETCH_ROWS >= s.programsHighWater) s.loadMorePrograms()
  }
  const queueArtwork = () => {
    const s = my.store
    const list = my.channels
    if (!s) return
    if (!list.length) {
      s.queueArtworkPrefetch([], { replace: true })
      return
    }
    const firstRow = Math.floor(st.scrollY / ROW_H)
    const start = Math.max(0, firstRow - ARTWORK_MARGIN)
    const end = Math.min(list.length, firstRow + Math.ceil(GRID_H / ROW_H) + ARTWORK_MARGIN)
    const programs = []
    list.slice(start, end).forEach((c) => programs.push(...s.programsForChannel(c.Id)))
    s.queueArtworkPrefetch(programs, { replace: true })
  }
  // The focused row scrolls to the top of the grid, so the rows below it are the ones in view.
  const scrollToRow = (i) => {
    const max = Math.max(0, my.channels.length * ROW_H - GRID_H)
    const target = Math.max(0, Math.min(max, i * ROW_H))
    if (target !== st.scrollY) {
      st.scrollY = target
      scheduleSync()
      if (my.artTimer) clearTimeout(my.artTimer)
      my.artTimer = later(() => queueArtwork(), 250)
    }
  }

  const setGridFocus = (row, cellKey) => {
    my.row = row
    const ch = my.channels[row]
    batch(() => {
      st.zone = 'grid'
      st.focusRowId = ch ? ch.Id : ''
      st.focusCellKey = cellKey
      scrollToRow(row)
    })
    scheduleSync()
    updateHero()
    startMarquee()
  }
  const startMarquee = () => {
    if (my.mqTimer) clearTimeout(my.mqTimer)
    my.mqTimer = null
    st.mqOn = false
    const row = st.rows.find((r) => r.id === st.focusRowId) || (my.channels[my.row] ? rowModel(my.row) : null)
    const items = marqueeItems(row, st.focusCellKey)
    st.mq = items
    if (!items.length) return
    const longest = Math.max(...items.map((q) => q.dur))
    const run = () => {
      my.mqTimer = later(() => {
        st.mqOn = true
        my.mqTimer = later(() => {
          st.mqOn = false
          run()
        }, longest + 1000)
      }, 1500)
    }
    run()
  }
  const focusChannelRow = (i) => {
    const list = my.channels
    if (i < 0 || i >= list.length) return
    my.pending = null
    my.onChannel = true
    my.focusRef = { railFocused: true, channelId: list[i].Id, program: null, area: 'grid' }
    setGridFocus(i, 'ch')
  }
  const focusCellAt = (row, idx) => {
    const ch = my.channels[row]
    if (!ch) return
    const cells = cellsFor(ch.Id)
    const cell = cells[idx]
    if (!cell) return
    my.onChannel = false
    const cur = my.sel
    const now = Date.now()
    const base = now >= my.store.windowStart && now < my.store.windowEnd ? now : my.store.windowStart
    my.sel = { channelId: ch.Id, anchorTime: clampAnchorInto(cell, cur ? cur.anchorTime : base), programId: cell.program ? cell.program.Id : null }
    my.focusRef = { railFocused: false, channelId: ch.Id, program: cell.program || null, area: 'grid' }
    setGridFocus(row, `${cell.kind}-${cell.start}`)
  }
  // Focus back on the selection, used after the window or the lineup changed under it.
  const focusSelected = () => {
    const sel = my.sel
    if (!sel || st.popup) return
    const row = my.channels.findIndex((c) => c.Id === sel.channelId)
    if (row < 0) return
    const cells = cellsFor(sel.channelId)
    if (!cells.length || isLoadingCells(cells)) return
    focusCellAt(row, resolveCellIndexAt(cells, sel.anchorTime))
  }
  const focusBar = (i) => {
    if (i < 0 || i > BAR_LAST) return
    my.pending = null
    my.lastBar = i
    batch(() => {
      st.barCur = i
      st.zone = 'bar'
    })
    my.focusRef = { ...my.focusRef, area: 'bar' }
  }
  const focusChip = (i) => {
    if (i < 0 || i >= st.chips.length) return
    batch(() => {
      st.chipCur = i
      st.zone = 'chips'
    })
    my.focusRef = { ...my.focusRef, area: 'chips' }
  }
  // Moves one row holding the anchor time. A row still loading defers the move.
  const moveVertically = (delta) => {
    const sel = my.sel
    if (!sel) return
    const target = my.row + delta
    const list = my.channels
    if (target < 0 || target >= list.length) return
    const cells = cellsFor(list[target].Id)
    if (!cells.length) return
    if (isLoadingCells(cells)) {
      my.pending = { row: target, anchorTime: sel.anchorTime }
      return
    }
    focusCellAt(target, resolveCellIndexAt(cells, sel.anchorTime))
  }
  const applyPending = () => {
    const p = my.pending
    if (!p || st.popup) return
    const ch = my.channels[p.row]
    if (!ch) return
    const cells = cellsFor(ch.Id)
    if (!cells.length || isLoadingCells(cells)) return
    my.pending = null
    focusCellAt(p.row, resolveCellIndexAt(cells, p.anchorTime))
  }
  const pageRows = (dir) => {
    const list = my.channels
    if (!list.length) return
    const target = Math.max(0, Math.min(list.length - 1, my.row + dir * rowsPerViewport()))
    if (target === my.row) return
    moveVertically(target - my.row)
    if (my.pending) scrollToRow(target)
  }
  // Enters the program row at the anchor last used, or now when focus came through the channel.
  const focusProgramFromChannel = () => {
    const ch = my.channels[my.row]
    if (!ch) return
    const s = my.store
    const cells = cellsFor(ch.Id)
    if (!cells.length || isLoadingCells(cells)) return
    const raw = my.sel ? my.sel.anchorTime : Date.now()
    const anchor = raw < s.windowStart ? s.windowStart : raw > s.windowEnd ? s.windowEnd - 1 : raw
    const idx = resolveCellIndexAt(cells, anchor)
    my.sel = { channelId: ch.Id, anchorTime: clampAnchorInto(cells[idx], anchor), programId: null }
    focusCellAt(my.row, idx)
  }
  const restoreGridFocus = () => {
    const sel = my.sel
    if (sel && !my.onChannel) {
      const cells = cellsFor(sel.channelId)
      const row = my.channels.findIndex((c) => c.Id === sel.channelId)
      if (cells.length && row >= 0 && !isLoadingCells(cells)) {
        focusCellAt(row, resolveCellIndexAt(cells, sel.anchorTime))
        return
      }
    }
    focusChannelRow(Math.min(Math.max(0, my.row), Math.max(0, my.channels.length - 1)))
  }

  // focusGrid is false when a window button drove the shift. allowPast is only for Earlier.
  const shiftWindow = async (amount, { focusGrid = true, allowPast = false } = {}) => {
    const s = my.store
    my.pending = null
    const oldStart = s.windowStart
    const oldEnd = s.windowEnd
    const live = guideLeftEdge(Date.now())
    const floor = allowPast ? live - MAX_HISTORY_MS : live
    const target = amount < 0 && oldStart + amount < floor ? floor : oldStart + amount
    if (target === oldStart) return
    try {
      await s.setWindowStart(target, { livePosition: target === live })
    } catch (e) {
      return
    }
    const sel = my.sel
    if (!sel) return
    const cells = cellsFor(sel.channelId)
    if (!cells.length) return
    const edge = amount < 0 ? oldStart - 1 : oldEnd
    const cell = cells[resolveCellIndexAt(cells, edge)]
    my.sel = { ...sel, anchorTime: clampAnchorInto(cell, edge), programId: cell.program ? cell.program.Id : null }
    if (focusGrid && st.zone === 'grid' && !my.onChannel) focusSelected()
  }
  const anchorToWindowStart = () => {
    const sel = my.sel
    const s = my.store
    if (!sel) return
    const cells = cellsFor(sel.channelId)
    if (!cells.length) {
      my.sel = { ...sel, anchorTime: s.windowStart, programId: null }
      return
    }
    const cell = cells[resolveCellIndexAt(cells, s.windowStart)]
    my.sel = { ...sel, anchorTime: clampAnchorInto(cell, s.windowStart), programId: cell.program ? cell.program.Id : null }
    if (st.zone === 'grid' && !my.onChannel) focusSelected()
  }
  const goToNow = async () => {
    my.pending = null
    await my.store.goToNow({ windowStart: guideLeftEdge(Date.now()) })
    anchorToWindowStart()
  }
  // The window moves on the half hour the left edge floors to, so one timer waits for the next.
  const armReanchor = () => {
    const schedule = () => {
      const at = Date.now()
      my.reanchorTimer = later(tick, floorToHalfHour(at) + HALF_HOUR - at)
    }
    const tick = () => {
      const at = Date.now()
      const quiet = QUIET_MS - (at - my.keyAt)
      if (my.keyAt && quiet > 0) {
        my.reanchorTimer = later(tick, quiet)
        return
      }
      schedule()
      reanchor(at)
    }
    schedule()
  }
  const reanchor = async (at) => {
    const s = my.store
    if (!s || !s.atLivePosition) return
    try {
      await s.setWindowStart(guideLeftEdge(at), { livePosition: true })
    } catch (e) {
      s.scheduleBoundaryRefresh()
      return
    }
    await s.refreshAtQuarterHour()
    const sel = my.sel
    if (!sel) return
    const cells = cellsFor(sel.channelId)
    if (!cells.length) return
    const next = reanchorSelection({ current: sel, cells, now: at })
    if (next.anchorTime === sel.anchorTime && next.programId === sel.programId) return
    my.pending = null
    my.sel = next
    if (st.zone === 'grid' && !my.onChannel) focusSelected()
  }

  // The hero shows the focused program, or what the focused channel airs now.
  const updateHero = () => {
    const s = my.store
    if (!s) return
    const { program, railFocused, channelId } = my.focusRef
    const channel = !railFocused && program ? s.channelForId(program.ChannelId) : channelId ? s.channelForId(channelId) : null
    const now = Date.now()
    const preview = program || (channel ? programAiringAt(s.programsForChannel(channel.Id), now) : null)
    const server = getServerUrl()
    const logoUrl = channel && channel.ImageTags && channel.ImageTags.Primary
      ? getImageUrl(server, channel.Id, 'Primary', { maxHeight: 209, tag: channel.ImageTags.Primary })
      : null
    const artwork = preview ? artworkSource(preview) || s.cachedArtworkFor(preview.Id) : null
    let programImageUrl = null
    if (artwork) {
      programImageUrl = artwork.isThumb
        ? getImageUrl(server, artwork.itemId, 'Thumb', { maxWidth: 157, tag: artwork.tag })
        : getImageUrl(server, artwork.itemId, 'Primary', { maxWidth: 157, maxHeight: 209, tag: artwork.tag })
    }
    // The bulk fetch carries no artwork, so the focused program's is looked up once focus settles.
    const previewId = preview ? preview.Id : null
    if (previewId !== my.heroPreviewId) {
      my.heroPreviewId = previewId
      if (my.artLookup) clearTimeout(my.artLookup)
      if (preview && !artworkSource(preview) && !s.hasArtworkResult(preview.Id)) {
        my.artLookup = later(() => {
          s.artworkSourceFor(preview).then((result) => {
            if (result) updateHero()
          })
        }, 500)
      }
    }
    const clockDisplay = settings.get('clockDisplay')
    const episodeTitle = preview ? episodeTitleOf(preview) : ''
    const suffix = episodeTitle && episodeTitle !== (preview && preview.Name) ? ` - ${episodeTitle}` : ''
    const label = preview ? seasonEpisodeLabel(preview) : null
    const genre = preview ? genreFor(preview) : null
    const heroProps = {
      title: (channel && channel.Name) || (preview && preview.Name) || $L('Guide Timeline'),
      programTitle: channel ? (preview && preview.Name) || null : null,
      programSubtitle: `${suffix}${label ? ` (${label})` : ''}`,
      channelLogoUrl: logoUrl,
      programImageUrl,
      timeLabel: preview ? `${formatClockTime(new Date(programStart(preview)), clockDisplay)} - ${formatClockTime(new Date(programEnd(preview)), clockDisplay)}` : null,
      genreLabel: genre ? genre.label : null,
      officialRating: (preview && preview.OfficialRating) || null,
      communityRating: preview && preview.CommunityRating != null ? preview.CommunityRating : null,
      badgeLabel: preview ? (preview.IsPremiere ? $L('Premiere') : preview.IsNew ? $L('New') : preview.IsRepeat ? $L('Repeat') : null) : null,
      synopsis: (preview && preview.Overview) || null,
      isLive: preview ? isLiveAt(preview, now) : false,
      mark: preview ? recordingMark(preview) : null,
    }
    const key = JSON.stringify(heroProps)
    if (key === my.heroKey) return
    my.heroKey = key
    const prevPlate = st.hero.plate[0] && st.hero.plate[0].src
    const hero = heroModel(heroProps)
    const next = hero.plate[0]
    batch(() => {
      st.hero = hero
      if (!next || next.src !== prevPlate) {
        st.plateW = 157
        st.plateH = 209
      }
    })
    startSynopsis()
  }
  // A logo smaller than the plate keeps its own size.
  const onLogoLoaded = (node, e) => {
    const dim = e && e.dimensions
    if (!dim || !dim.w || !dim.h) return
    const scale = Math.min(1, 157 / dim.w, 209 / dim.h)
    batch(() => {
      st.plateW = dim.w * scale
      st.plateH = dim.h * scale
    })
  }
  // A synopsis past three lines scrolls up at reading pace and back.
  const startSynopsis = () => {
    if (my.synTimer) clearTimeout(my.synTimer)
    my.synTimer = null
    st.synY = 0
    const s = st.hero.synopsis
    if (!s || s.lines <= 3) return
    const textH = s.lines * 27.6
    const viewH = s.h
    const maxOffset = textH - viewH
    const chars = s.text.length
    const msPerChar = 1000 / 17
    const visibleMs = ((chars * viewH) / textH) * msPerChar
    const holdMs = Math.max(1600, Math.round(visibleMs))
    const scrollMs = Math.round(((chars * (textH - viewH)) / textH) * msPerChar)
    const endHoldMs = Math.max(1600, Math.round(visibleMs / 3))
    const step = 50
    const cycle = () => {
      my.synTimer = later(() => {
        const started = Date.now()
        const run = () => {
          if (!active()) {
            my.synTimer = later(run, 500)
            return
          }
          const t = Math.min(1, (Date.now() - started) / scrollMs)
          st.synY = maxOffset * t
          if (t < 1) my.synTimer = later(run, step)
          else {
            my.synTimer = later(() => {
              st.synY = 0
              cycle()
            }, endHoldMs)
          }
        }
        run()
      }, holdMs)
    }
    cycle()
  }

  const watchChannel = (channelId) => {
    const ch = my.channels.find((c) => c.Id === channelId)
    if (!ch) return
    setLiveTvLastChannelId(ch.Id)
    router.to(`/player/${ch.Id}`, { live: true })
  }
  const selectCell = () => {
    const ch = my.channels[my.row]
    if (!ch) return
    const cells = cellsFor(ch.Id)
    const sel = my.sel
    const cell = sel ? cells[resolveCellIndexAt(cells, sel.anchorTime)] : null
    if (!cell) return
    if (cell.kind === CELL_KINDS.program && cell.program) {
      my.pending = null
      my.busy = false
      openProgram(cell.program)
    } else if (cell.kind === CELL_KINDS.gap || cell.kind === CELL_KINDS.filtered) {
      watchChannel(ch.Id)
    }
  }
  const openPopup = (kind, data, model) => {
    my.popupKind = kind
    my.popupData = data
    st.popup = model
    if (popupRef) popupRef.setFocus()
  }
  const openProgram = (program) => {
    openPopup('program', { program }, programPopup({
      program, channel: my.store.channelForId(program.ChannelId), now: Date.now(), clockDisplay: settings.get('clockDisplay'),
    }))
  }
  const closePopup = (refocus = true) => {
    st.popup = null
    my.popupKind = null
    if (root) root.setFocus()
    if (refocus) later(() => restoreGridFocus(), 0)
  }
  const showToast = (message) => {
    if (!message) return
    st.toastText = message
    const key = ++my.toastKey
    later(() => {
      if (my.toastKey === key) st.toastText = ''
    }, 3000)
  }
  const runAction = async (action, success, failure) => {
    if (my.busy) return
    my.busy = true
    try {
      const message = await action()
      closePopup()
      showToast(typeof message === 'string' ? message : success)
    } catch (e) {
      my.busy = false
      showToast(failure)
    }
  }
  // The Record prompt, answered by onPopup. Back answers null.
  const prompt = (p) => new Promise((resolve) => {
    my.resolvePrompt = resolve
    my.promptReturn = { kind: my.popupKind, data: my.popupData, model: st.popup }
    openPopup('prompt', null, recordPromptPopup({ ...p, clockDisplay: settings.get('clockDisplay') }))
  })
  const settlePrompt = (choice) => {
    const resolve = my.resolvePrompt
    my.resolvePrompt = null
    const back = my.promptReturn
    my.promptReturn = null
    if (back) openPopup(back.kind, back.data, back.model)
    if (resolve) resolve(choice)
  }
  const recordProgram = async (target) => {
    if (my.busy) return
    my.busy = true
    const s = my.store
    try {
      const channel = s.channelForId(target.ChannelId)
      const outcome = await recordAiring({
        program: target,
        start: new Date(programStart(target)),
        createTimer: () => s.toggleProgramRecording(target),
        prompt: (p) => prompt(p),
        setLoading: (on) => {
          st.promptBusy = on
        },
        stillValid: () => my.popupKind === 'program' && my.popupData && my.popupData.program.Id === target.Id,
        channel: channel ? recordPromptChannel(channel.ChannelNumber, channel.Name) : undefined,
      })
      if (outcome === RECORD_OUTCOME.cancelled) {
        my.busy = false
        return
      }
      if (outcomeAddsFutureShowing(outcome)) await s.refreshRecordings().catch(() => {})
      closePopup()
      showToast(recordAiringMessage(outcome))
    } catch (e) {
      my.busy = false
      showToast($L('Unable to create recording'))
    }
  }
  const openSeriesSettings = async (target) => {
    if (my.busy) return
    my.busy = true
    try {
      const rule = await api.getLiveTvSeriesTimer(target.SeriesTimerId)
      my.busy = false
      openPopup('series', { program: target, rule }, seriesPopup(seriesChoiceOf(rule)))
    } catch (e) {
      my.busy = false
      showToast($L('Unable to update series recording'))
    }
  }
  const onPopup = (id) => {
    const kind = my.popupKind
    const data = my.popupData
    const s = my.store
    if (kind === 'prompt') {
      settlePrompt(id === 'back' ? null : id)
      return
    }
    if (id === 'back') {
      if (kind === 'sort' || kind === 'date') {
        closePopup(false)
        focusBar(my.lastBar)
      } else closePopup()
      return
    }
    if (kind === 'sort') {
      settings.set('liveTvChannelSortBy', id)
      my.pending = null
      s.setSortBy(id)
      closePopup(false)
      focusBar(my.lastBar)
    } else if (kind === 'date') {
      const o = st.popup.options.find((x) => x.id === id)
      closePopup(false)
      focusBar(my.lastBar)
      if (o) s.setDate(o.date.getTime()).then(() => anchorToWindowStart())
    } else if (kind === 'series') {
      const { program, rule } = data
      if (!rule) {
        runAction(() => s.toggleSeriesRecording(program, seriesChoiceFlags(id)), $L('Series set to record'), $L('Unable to create series recording'))
      } else if (seriesChoiceOf(rule) === id) {
        closePopup()
      } else {
        runAction(async () => {
          await api.updateLiveTvSeriesTimer(rule.Id, { ...rule, ...seriesChoiceFlags(id) })
          await s.refreshRecordings()
        }, $L('Series recording updated'), $L('Unable to update series recording'))
      }
    } else if (kind === 'program') {
      const program = data.program
      const channel = s.channelForId(program.ChannelId)
      const favorite = !!(channel && channel.UserData && channel.UserData.IsFavorite === true)
      if (id === 'record') {
        if (program.TimerId == null) recordProgram(program)
        else runAction(() => s.toggleProgramRecording(program), $L('Recording cancelled'), $L('Failed to cancel recording'))
      } else if (id === 'seriesSettings') {
        openSeriesSettings(program)
      } else if (id === 'series') {
        if (program.SeriesTimerId != null) {
          runAction(() => s.toggleSeriesRecording(program), $L('Series recording cancelled'), $L('Failed to cancel series recording'))
        } else {
          openPopup('series', { program, rule: null }, seriesPopup(DEFAULT_SERIES_CHOICE))
        }
      } else if (id === 'favorite') {
        runAction(
          () => s.toggleChannelFavorite(program.ChannelId),
          favorite ? $L('Removed from favorite channels') : $L('Added to favorite channels'),
          $L('Failed to update favorite channel')
        )
      } else if (id === 'watch') {
        if (my.busy) return
        my.busy = true
        st.popup = null
        my.popupKind = null
        if (root) root.setFocus()
        watchChannel(program.ChannelId)
      } else if (id === 'close') {
        closePopup()
      }
    }
  }
  const onBarEnter = (id) => {
    const s = my.store
    if (id === 'earlier') shiftWindow(-s.guideWindow, { focusGrid: false, allowPast: true })
    else if (id === 'later') shiftWindow(s.guideWindow, { focusGrid: false })
    else if (id === 'now') goToNow()
    else if (id === 'sort') {
      my.pending = null
      openPopup('sort', null, sortPopup(s.sortBy))
    } else if (id === 'date') {
      my.pending = null
      openPopup('date', null, datePopup(s.guideDate))
    } else if (id === 'recordings') router.to('/recordings')
  }

  const homeRowIndex = () => {
    const homeId = getLiveTvLastChannelId()
    const list = my.channels
    if (!list.length) return -1
    return homeId ? list.findIndex((c) => c.Id === homeId) : 0
  }
  const isExploring = () => {
    const s = my.store
    const homeId = getLiveTvLastChannelId()
    if (homeId) return !s.atLivePosition || my.focusRef.channelId !== homeId
    if (!my.channels.length) return false
    return !s.atLivePosition || !(my.onChannel && my.row === 0)
  }
  const resetToEntry = async () => {
    my.resetting = true
    my.sel = null
    my.pending = null
    try {
      await my.store.setWindowStart(guideLeftEdge(Date.now()), { livePosition: true })
    } catch (e) {
      // The rows keep the programs they had.
    }
    my.resetting = false
    const i = homeRowIndex()
    if (i >= 0) focusChannelRow(i)
  }

  const typeDigit = (digit) => {
    if (my.numTimer) clearTimeout(my.numTimer)
    const typed = st.numberBuffer + digit
    st.numberBuffer = typed
    my.numTimer = later(() => {
      const i = my.channels.findIndex((c) => c.ChannelNumber === typed)
      if (i >= 0) focusChannelRow(i)
      st.numberBuffer = ''
    }, 1500)
  }
  const onKey = () => {
    my.keyAt = Date.now()
    my.pending = null
  }

  const up = () => {
    onKey()
    if (st.zone === 'chips') return
    if (st.zone === 'bar') return focusChip(0)
    if (!st.count) return
    if (my.onChannel) {
      if (my.row === 0) focusBar(my.lastBar)
      else focusChannelRow(my.row - 1)
    } else if (my.row === 0) focusBar(my.lastBar)
    else moveVertically(-1)
  }
  const down = () => {
    onKey()
    if (st.zone === 'chips') return focusBar(my.lastBar)
    if (st.zone === 'bar') {
      if (!st.count) return
      // Down lands on the channel focused last, or the first row once that one is filtered out.
      return focusChannelRow(Math.max(0, my.channels.findIndex((c) => c.Id === my.focusRef.channelId)))
    }
    if (!st.count) return
    if (my.onChannel) {
      if (my.row < my.channels.length - 1) focusChannelRow(my.row + 1)
    } else moveVertically(1)
  }
  const left = () => {
    onKey()
    if (st.zone === 'chips') return focusChip(st.chipCur - 1)
    if (st.zone === 'bar') return focusBar(st.barCur - 1)
    if (!st.count) return
    if (my.onChannel) return focusChip(0)
    const ch = my.channels[my.row]
    const cells = cellsFor(ch.Id)
    const i = resolveCellIndexAt(cells, my.sel ? my.sel.anchorTime : Date.now())
    if (i > 0) {
      my.sel = { ...my.sel, anchorTime: clampAnchorInto(cells[i - 1], cells[i - 1].start) }
      focusCellAt(my.row, i - 1)
    } else if (my.store.windowStart > guideLeftEdge(Date.now())) {
      shiftWindow(-HALF_HOUR)
    } else focusChannelRow(my.row)
  }
  const right = () => {
    onKey()
    if (st.zone === 'chips') return focusChip(st.chipCur + 1)
    if (st.zone === 'bar') return focusBar(st.barCur + 1)
    if (!st.count) return
    if (my.onChannel) return focusProgramFromChannel()
    const ch = my.channels[my.row]
    const cells = cellsFor(ch.Id)
    const i = resolveCellIndexAt(cells, my.sel ? my.sel.anchorTime : Date.now())
    if (i < cells.length - 1) {
      my.sel = { ...my.sel, anchorTime: clampAnchorInto(cells[i + 1], cells[i + 1].start) }
      focusCellAt(my.row, i + 1)
    } else shiftWindow(HALF_HOUR)
  }
  // The Magic Remote's cursor (app/pointer.js): the filters and the buttons take focus on hover; in
  // the grid, which scrolls to the focused row, a click focuses the channel or the program and OK
  // then presses it.
  const pointChip = (i) => !st.popup && !(st.zone === 'chips' && st.chipCur === i) && focusChip(i)
  const pointBar = (i) => !st.popup && !(st.zone === 'bar' && st.barCur === i) && focusBar(i)
  const pointCell = (row, key) => {
    const ch = my.channels[row]
    if (st.popup || !ch || !my.store) return false
    if (key === 'ch') {
      focusChannelRow(row)
      return true
    }
    const cells = cellsFor(ch.Id)
    if (isLoadingCells(cells)) return false
    const at = cells.findIndex((c) => `${c.kind}-${c.start}` === key)
    if (at < 0) return false
    focusCellAt(row, at)
    return true
  }
  const enterKey = () => {
    if (st.zone === 'chips') {
      const c = st.chips[st.chipCur]
      my.pending = null
      if (c) my.store.setFilter(c.key)
    } else if (st.zone === 'bar') {
      const b = bar.buttons[st.barCur]
      if (b) onBarEnter(b.id)
    } else if (st.count) {
      if (my.onChannel) watchChannel(my.channels[my.row].Id)
      else selectCell()
    }
  }
  // Back in the grid first re-homes a guide that drifted from where it opened, then moves up to
  // the filters, and only leaves from above the grid.
  const back = () => {
    if (my.resetting) return
    if (st.zone === 'grid' && st.count && my.store && my.store.state === 'ready') {
      if (!isExploring() || homeRowIndex() < 0) focusChip(0)
      else resetToEntry()
      return
    }
    router.back()
  }
  const anyKey = (e) => {
    const code = e.keyCode
    if (remoteShortcut(e) === 'recordings') {
      router.to('/recordings')
      return true
    }
    const page = pageDirection(code)
    if (page && st.zone === 'grid' && st.count) {
      onKey()
      if (my.onChannel) focusChannelRow(Math.max(0, Math.min(my.channels.length - 1, my.row + page * rowsPerViewport())))
      else pageRows(page)
      return true
    }
    if (code >= KEYS.NUM_0 && code <= KEYS.NUM_9) {
      typeDigit(String.fromCharCode(code))
      return true
    }
    return false
  }
  const handle = (fn) => () => {
    fn()
    return true
  }

  onMount(() => {
    enter()
    const filters = store.serverType === 'plex' ? GUIDE_FILTERS.filter((f) => PLEX_MISSING_FILTERS.indexOf(f.key) < 0) : GUIDE_FILTERS
    my.filters = filters
    const guide = createLiveTvGuideStore(api, { sortBy: normalizeSort(settings.get('liveTvChannelSortBy')) })
    my.store = guide
    st.chips = chipModels(filters, guide.filter)
    my.unsub = guide.subscribe(() => scheduleRefresh())
    my.unsubArt = guide.subscribeArtwork(() => updateHero())
    configureIncomplete(store.user)
    loadLiveTvLastChannel()
    guide.load({ window: WINDOW_MS, windowStart: guideLeftEdge(Date.now()), livePosition: true })
    // A clock the cells read their live and ended state from.
    const clock = setInterval(() => {
      if (!active()) return
      my.now = Date.now()
      my.version++
      // Only the built rows keep their cells, so the cache doesn't grow with every channel scrolled past.
      const built = {}
      st.rows.forEach((r) => {
        if (my.cells[r.id]) built[r.id] = my.cells[r.id]
      })
      my.cells = built
      syncRows()
      updateHero()
    }, 15000)
    onCleanup(() => clearInterval(clock))
    armReanchor()
    // A lazy page isn't there when the stack focuses its root, so it takes focus itself.
    if (root && active()) root.setFocus()
  })
  createEffect(on(active, (on) => on && enter(), { defer: true }))
  onCleanup(() => {
    if (my.unsub) my.unsub()
    if (my.unsubArt) my.unsubArt()
    if (my.store) my.store.dispose()
    my.store = null
    if (my.resolvePrompt) my.resolvePrompt(null)
  })

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
      onUp={handle(up)}
      onDown={handle(down)}
      onLeft={handle(left)}
      onRight={handle(right)}
      onEnter={handle(enterKey)}
      onBack={handle(back)}
      onKeyPress={anyKey}
    >
      <view>
        <For each={chips.keys()}>
          {(k) => {
            const c = chips.item(k)
            return (
              <view x={c().x} y={12} width={c().w} height={44} onPointerOver={() => pointChip(c().i)}>
                <view width={c().w} height={44} borderRadius={19} color={c().bg} border={{ width: 3, color: hex(c().border) }} />
                <view
                  width={c().w}
                  height={44}
                  borderRadius={19}
                  color="#00000000"
                  border={{ width: 3, color: hex(c().ring) }}
                  alpha={st.zone === 'chips' && st.chipCur === c().i ? 1 : 0}
                />
                <text fontFamily={c().font} fontSize={20} x={20} y={c().ty} lineHeight={1} color={c().color}>
                  {c().label}
                </text>
              </view>
            )
          }}
        </For>
      </view>

      <view x={35} y={59} width={1850} height={209} borderRadius={23} color="#1a1a1a73" />
      <view alpha={plate() ? 1 : 0}>
        <view x={35} y={59} width={157} height={209} borderRadius={PLATE_R} color={plate() && plate().artwork ? '#00000000' : '#353940f0'} />
        <view
          x={35 + (157 - st.plateW) / 2}
          y={59 + (209 - st.plateH) / 2}
          width={st.plateW}
          height={st.plateH}
          src={plate() && !plate().artwork ? plate().src : ''}
          alpha={plate() && !plate().artwork ? 1 : 0}
          textureOptions={CONTAIN}
          onEvent={{ loaded: onLogoLoaded }}
        />
        <view
          x={35}
          y={59}
          width={157}
          height={209}
          borderRadius={PLATE_R}
          src={plate() && plate().artwork ? plate().src : ''}
          alpha={plate() && plate().artwork ? 1 : 0}
          textureOptions={COVER}
        />
      </view>
      <view>
        <For each={heroBoxes.keys()}>
          {(k) => {
            const hb = heroBoxes.item(k)
            return (
              <view
                x={hb().x}
                y={hb().y}
                width={hb().w}
                height={hb().h}
                borderRadius={hb().r}
                color={hb().color}
                border={{ width: hb().bw, color: hex(hb().border) }}
              />
            )
          }}
        </For>
      </view>
      <view>
        <For each={heroIcons.keys()}>
          {(k) => {
            const hi = heroIcons.item(k)
            return <view x={hi().x} y={hi().y} width={hi().s} height={hi().s} src={hi().src} color={hi().color} />
          }}
        </For>
      </view>
      <view>
        <For each={heroTexts.keys()}>
          {(k) => {
            const ht = heroTexts.item(k)
            return (
              <text
                fontFamily={ht().font}
                fontSize={ht().size}
                x={ht().x}
                y={ht().y}
                lineHeight={ht().lh}
                maxWidth={ht().w}
                maxLines={1}
                color={ht().color}
                letterSpacing={ht().ls || 0}
              >
                {ht().text}
              </text>
            )
          }}
        </For>
      </view>
      <view x={syn() ? syn().x : 0} y={syn() ? syn().y : 0} width={syn() ? syn().w : 0} height={syn() ? syn().h : 0} clipping alpha={syn() ? 1 : 0}>
        <text
          fontFamily={syn() ? syn().font : font}
          fontSize={23}
          y={(syn() ? syn().ty : 0) - st.synY}
          lineHeight={27.6}
          maxWidth={syn() ? syn().w : 1}
          color="#ffffffb8"
        >
          {syn() ? syn().text : ''}
        </text>
      </view>

      <view>
        <For each={barButtons.keys()}>
          {(k) => {
            const b = barButtons.item(k)()
            return (
              <view x={b.x} y={b.y} width={b.w} height={b.h} onPointerOver={() => pointBar(b.i)}>
                <view width={b.w} height={b.h} borderRadius={b.r} color="#ffffff1a" alpha={barOn(b.i) ? 0 : 1} />
                <view width={b.w} height={b.h} borderRadius={b.r} color="#00a4dc" alpha={barOn(b.i) ? 1 : 0} />
                <view x={b.ix} y={b.iy} width={b.is} height={b.is} src={b.src} alpha={b.src ? 1 : 0} color={barOn(b.i) ? '#ffffff' : '#ffffffcc'} />
                <text fontFamily={b.font} fontSize={19} x={b.tx} y={b.ty} lineHeight={1} color={barOn(b.i) ? '#ffffff' : '#ffffffcc'}>
                  {b.label}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <text fontFamily={st.winFont} fontSize={20} x={bar.labelX} y={274.5 + 2} lineHeight={33} maxWidth={bar.labelW} maxLines={1} color="#ffffffcc">
        {st.winLabel}
      </text>

      <view alpha={gridShown() ? 1 : 0}>
        <view x={332} y={314} width={1553} height={34} clipping>
          <For each={slots.keys()}>
            {(k) => {
              const sl = slots.item(k)
              return (
                <text fontFamily={font} fontSize={17} x={sl().x} y={sl().y} lineHeight={34} color="#ffffffb3">
                  {sl().label}
                </text>
              )
            }}
          </For>
        </view>
        <view x={35} y={348} width={1850} height={1} color="#8ec8f054" />
        <view x={35} y={349} width={1850} height={708} clipping>
          <view transition={{ y: { duration: 200, easing: 'ease-in-out' } }} y={-st.scrollY} width={1850} height={Math.max(708, st.count * ROW_H)}>
            <For each={rows.keys()}>
              {(k) => {
                const row = rows.item(k)
                const focused = () => k === st.focusRowId
                return (
                  <GuideRow
                    y={row().y}
                    ch={row().ch}
                    fl={row().fl}
                    focusKey={focused() ? gridKey() : ''}
                    mq={focused() ? st.mq : []}
                    mqOn={focused() ? st.mqOn && st.zone === 'grid' : false}
                    onPointerCell={(key) => pointCell(row().idx, key)}
                  />
                )
              }}
            </For>
          </view>
        </view>
      </view>

      <Spinner x={928} y={660} size={64} alpha={st.status === 'loading' ? 1 : 0} />
      <text fontFamily={font} fontSize={20} x={960} y={669 + 2} mountX={0.5} lineHeight={33} color="#ffffffb3" alpha={st.message ? 1 : 0}>
        {st.message}
      </text>

      <view alpha={st.numberBuffer ? 1 : 0} x={1860 - numberW()} y={60} width={numberW()} height={69} borderRadius={18} color="#000000d9">
        <text fontFamily={boldFont} fontSize={54} x={36} y={18 + 5} lineHeight={33} color="#ffffff">
          {st.numberBuffer}
        </text>
      </view>

      <GuidePopup ref={(n) => (popupRef = n)} m={st.popup} alpha={st.popup ? 1 : 0} onPopup={onPopup} />
      <view alpha={st.promptBusy ? 1 : 0} width={1920} height={1080} color="#0000008a">
        <Spinner x={931} y={511} size={58} />
      </view>

      <view alpha={st.toastText ? 1 : 0} x={960 - toastW() / 2} y={959} width={toastW()} height={61} borderRadius={12} color="#1e1e28e6">
        <text fontFamily={font} fontSize={20} x={28} y={14 + 2} lineHeight={33} color="#ffffff">
          {st.toastText}
        </text>
      </view>
    </view>
  )
}
