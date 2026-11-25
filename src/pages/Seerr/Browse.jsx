import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, on, onCleanup, onMount } from 'solid-js'
import SeerrPosterCard from '../../ui/components/seerr/SeerrPosterCard.jsx'
import BrowseDialog from '../../ui/components/seerr/BrowseDialog.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import { Kept, keyed } from '../../ui/components/library/pageKit.js'
import { goHome } from '../../ui/components/library/goHome.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { textWidth } from '../../ui/components/seerr/look.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import * as seerrApi from '../../services/seerrApi.js'
import { POSTER_SIZE_OPTIONS, seerrPosterSize } from '../../utils/gridChrome.js'
import {
  buildSeerrDiscoverParams, getSeerrSortOptions, getSeerrTvStatusOptions, getSeerrMinRatingOptions, getSeerrMinVoteOptions,
  getSeerrRuntimeOptions, getSeerrReleaseOptions, hasSeerrDiscoverFilters,
} from '../../utils/seerrBrowseFilters.js'
import * as settings from '../../state/settings.js'
import { checkSeerr } from '../../state/seerr.js'
import { posterModel, openSeerrItem } from './seerrModels.js'
import {
  browseGridMetrics, browseStateKey, cardSubtitle, gridScrollFor, matchesBrowseFilters, readBrowseState, statusLabel,
  writeBrowseState, yearOf,
} from './browseGrid.js'

// Every title of a genre, studio, network or keyword (or all movies or series) in a poster
// grid, with the status chips, the A to Z bar, the sort and filter panel and the poster size
// panel. The nav stays hidden here.
const MAX_PAGES = 25
const MIN_MATCHES = 10
const MAX_PAGES_PER_SCAN = 6
const LETTERS = ['', '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
const STATUS_FILTERS = [
  { key: 'all', label: () => $L('All') },
  { key: 'available', label: () => $L('Available') },
  { key: 'requested', label: () => $L('Requested') },
]
const TOOLS = ['home', 'sort', 'settings']
// The grid's window, from 24px under the header to the footer.
const GRID_H = 684
const FILTER_KEYS = ['sortBy', 'statusFilter', 'letter', 'genreIds', 'tvStatuses', 'language', 'minRating', 'minVotes', 'runtime', 'released']

// The line under a poster in runs, the star apart, since Roboto has no star glyph.
const subtitleRuns = (line) => {
  const at = line.indexOf('★')
  if (at < 0) return line ? [{ k: 'a', text: line, x: 0, font: fontFor(line) }] : []
  // The renderer drops a run's outer spaces, so they go into the offsets instead.
  const lead = line.slice(0, at)
  const tail = line.slice(at + 1)
  const starX = textWidth(lead, 20)
  const tailX = starX + textWidth('★', 20) + textWidth(tail.slice(0, tail.length - tail.replace(/^\s+/, '').length), 20)
  const runs = [{ k: 's', text: '★', x: starX, font: 'roboto-web' }, { k: 'b', text: tail.trim(), x: tailX, font: fontFor(tail) }]
  return lead.trim() ? [{ k: 'a', text: lead.trim(), x: 0, font: fontFor(lead) }].concat(runs) : runs
}

const EMPTY_CARD = {
  idx: -1, hidden: true, x: 0, y: -2000, title: '', subtitle: '', subParts: [], image: '', initial: '',
  marks: { type: null, dot: null, banner: null, typeY: 10 },
}

const nearest = (list, x) => {
  let best = 0
  list.forEach((entry, i) => {
    if (Math.abs(entry.cx - x) < Math.abs(list[best].cx - x)) best = i
  })
  return best
}

export default function Browse(props) {
  const store = getStore()
  const s0 = settings.all()
  const st = reactive({
    enabled: true,
    items: [],
    loading: true,
    mt: 'movie',
    sortBy: 'popularity.desc',
    statusFilter: 'all',
    letter: '',
    genreIds: [],
    tvStatuses: [],
    language: '',
    minRating: '',
    minVotes: '',
    runtime: '',
    released: '',
    filterGenres: [],
    filterLanguages: [],
    genresExpanded: false,
    languagesExpanded: false,
    posterSize: seerrPosterSize(s0),
    zoom: s0.cardFocusZoom !== false,
    dialog: '',
    zone: 'tools',
    toolIdx: 0,
    alphaIdx: 0,
    gridIdx: 0,
    scroll: 0,
    // The focused title's line, kept after a reload.
    entry: null,
  })
  const my = { gen: 0, page: 1, totalPages: 1, loadingMore: false, missed: false, cooldown: false, optionsRequested: false, saved: null, key: '', alive: true }
  const titleFont = uiFont()
  const lineFont = uiFont('medium')
  const chipFont = uiFont()
  const chipOnFont = uiFont('bold')
  const letterFont = uiFont('medium')
  const letterOnFont = uiFont('bold')
  const badgeFont = uiFont('bold')
  const footFont = uiFont()
  let root
  let dialogRef = null
  onCleanup(() => (my.alive = false))

  const t = () => theme()
  const title = () => {
    if (props.name) return props.name
    if (props.kind === 'all') return props.mediatype === 'tv' ? $L('Series') : $L('Movies')
    return $L('Browse')
  }
  const item = () => (props.kind === 'all' ? { name: title() } : { id: Number(props.itemid) || props.itemid, name: title() })
  const metrics = createMemo(() => {
    const m = browseGridMetrics(st.posterSize, st.zoom)
    return { ...m, pitchX: m.cellWidth + m.spacing, pitchY: m.cellHeight + m.spacing }
  })
  // The toolbar in focus order: Home, Sort & Filter and Seerr Settings, then the status chips.
  const tools = createMemo(() => {
    const out = TOOLS.map((id, i) => ({ id, kind: 'tool', icon: id, x: 100 + i * 77, cx: 135 + i * 77, i }))
    let x = 351
    STATUS_FILTERS.forEach((option, n) => {
      const on = st.statusFilter === option.key
      const label = option.label()
      const w = Math.round(textWidth(label, 20, on ? 'bold' : 'regular') + 34)
      out.push({ id: option.key, kind: 'chip', label, on, x, w, cx: x + w / 2, i: n + 3 })
      x += w + 10
    })
    return out
  })
  const toolFocus = () => (st.zone === 'tools' && !st.dialog ? st.toolIdx : -1)
  const letters = createMemo(() => {
    let x = 100
    return LETTERS.map((entry, i) => {
      const on = st.letter === entry
      const label = entry || $L('All')
      const w = Math.max(50, Math.round(textWidth(label, 25, on ? 'bold' : 'medium') + 20))
      const at = x
      x += w
      return { key: entry || 'all', label, on, x: at, w, cx: at + w / 2, i }
    })
  })
  const letterFocus = () => (st.zone === 'alpha' && !st.dialog ? st.alphaIdx : -1)
  // Each title's card, built once per title and poster size.
  const built = new WeakMap()
  const cardAt = (i) => {
    const entry = st.items[i]
    if (!entry) return null
    const m = metrics()
    const was = built.get(entry)
    if (was && was.i === i && was.m === m) return was.card
    const card = {
      ...posterModel(entry, i, { subtitle: '', artW: m.artWidth, mediaType: st.mt }),
      subParts: subtitleRuns(cardSubtitle(entry)),
      initial: '',
      placeholderIcon: 'movie',
      x: (i % m.columns) * m.pitchX + m.inset,
      y: Math.floor(i / m.columns) * m.pitchY + m.headroom,
    }
    built.set(entry, { i, m, card })
    return card
  }
  // The rows in and just around the window, so a long list only builds what can be seen.
  const visibleRows = () => {
    const p = metrics().pitchY
    const from = Math.max(0, Math.floor(st.scroll / p) - 1)
    return [from, from + Math.ceil(GRID_H / p) + 1]
  }
  // A fixed set of card slots the window's titles move through, each title keeping the slot its
  // index lands on, so scrolling builds and drops no cards.
  const shownCards = createMemo(() => {
    const cols = metrics().columns
    const [from, to] = visibleRows()
    const slots = (to - from + 1) * cols
    const out = []
    for (let n = 0; n < slots; n++) {
      const i = from * cols + n
      const card = cardAt(i)
      out.push({ slot: `slot${i % slots}`, card: card || EMPTY_CARD })
    }
    return out
  })
  const slots = keyed(shownCards, (e) => e.slot)
  const gridFocus = () => (st.zone === 'grid' && !st.dialog ? st.gridIdx : -1)
  const gridH = () => {
    const m = metrics()
    return Math.max(GRID_H, Math.ceil(st.items.length / m.columns) * m.pitchY + m.pitchY)
  }
  // The focused title and its year, rating, status and type, kept after focus leaves the grid.
  const focusLine = createMemo(() => {
    const e = st.entry
    if (!e) return { title: '', titleFont, texts: [], star: null, badge: null }
    const name = e.title || e.name || ''
    const year = yearOf(e)
    const status = e.mediaInfo && e.mediaInfo.status
    const label = statusLabel(status)
    const texts = []
    let star = null
    let badge = null
    let x = 100
    const text = (str) => {
      texts.push({ key: `t${texts.length}`, text: str, x })
      x += textWidth(str, 23, 'medium') + 13
    }
    if (year.length === 4) text(year)
    if (e.voteAverage > 0) {
      star = x
      const rating = e.voteAverage.toFixed(1)
      texts.push({ key: 'rating', text: rating, x: x + 26 })
      x += 26 + textWidth(rating, 23, 'medium') + 13
    }
    if (label) {
      const w = textWidth(label, 18, 'bold') + 20
      badge = { text: label, x, w, color: status === 4 || status === 5 ? '#22c55eff' : '#6366f1ff' }
      x += w + 13
    }
    if (e.mediaType) text(e.mediaType === 'tv' ? $L('Series') : $L('Movie'))
    return { title: name, titleFont: fontFor(name, 'bold'), texts, star, badge }
  })
  const statusFooter = () => {
    const option = STATUS_FILTERS.find((o) => o.key === st.statusFilter)
    return option ? option.label() : $L('All')
  }
  const countFooter = () => $L('{count} Items').replace('{count}', st.items.length)
  const empty = () => {
    if (st.loading || st.items.length) return ''
    return st.enabled ? $L('No results') : $L('Seerr is not configured')
  }
  const showMediaTypeFilter = () => props.kind === 'genre' || props.kind === 'keyword' || props.kind === 'all'
  const filterState = () => ({
    genreIds: st.genreIds, tvStatuses: st.tvStatuses, language: st.language, minRating: st.minRating,
    minVotes: st.minVotes, runtime: st.runtime, released: st.released,
  })
  const dialogRows = createMemo(() => {
    if (st.dialog === 'settings') {
      return [
        { kind: 'title', id: 't', label: $L('Seerr Settings') },
        { kind: 'subtitle', id: 's', label: $L('Poster Size') },
        { kind: 'divider', id: 'd' },
      ].concat(POSTER_SIZE_OPTIONS.map((o) => ({ kind: 'radio', id: `size:${o.key}`, label: o.label(), on: st.posterSize === o.key })))
    }
    if (st.dialog !== 'sort') return []
    const rows = [{ kind: 'title', id: 't', label: $L('Sort & Filter') }, { kind: 'divider', id: 'd0' }]
    getSeerrSortOptions(st.mt).forEach((o) => {
      const active = st.sortBy.indexOf(o.key + '.') === 0
      rows.push({ kind: 'radio', id: `sort:${o.key}`, label: o.label, on: active, arrow: active ? (/\.asc$/.test(st.sortBy) ? 'asc' : 'desc') : '' })
    })
    const section = (id, label) => rows.push({ kind: 'divider', id: `d-${id}` }, { kind: 'section', id: `s-${id}`, label })
    if (showMediaTypeFilter()) {
      section('type', $L('Media Type'))
      rows.push(
        { kind: 'radio', id: 'type:movie', label: $L('Movies'), on: st.mt === 'movie' },
        { kind: 'radio', id: 'type:tv', label: $L('TV Shows'), on: st.mt === 'tv' }
      )
    }
    if (st.filterGenres.length) {
      rows.push({ kind: 'divider', id: 'd-genres' })
      rows.push({ kind: 'expander', id: 'genres', label: $L('Genres'), count: st.genreIds.length, expanded: st.genresExpanded })
      if (st.genresExpanded) {
        st.filterGenres.forEach((g) => rows.push({ kind: 'check', id: `genre:${g.id}`, label: g.name, on: st.genreIds.indexOf(g.id) >= 0 }))
      }
    }
    if (st.mt === 'tv') {
      section('tvstatus', $L('Series Status'))
      getSeerrTvStatusOptions().forEach((o) => rows.push({ kind: 'check', id: `tvstatus:${o.key}`, label: o.label, on: st.tvStatuses.indexOf(o.key) >= 0 }))
    }
    const radios = (id, label, options, value) => {
      section(id, label)
      options.forEach((o) => rows.push({ kind: 'radio', id: `${id}:${o.key}`, label: o.label, on: value === o.key }))
    }
    radios('released', $L('Released'), getSeerrReleaseOptions(), st.released)
    radios('minRating', $L('Minimum Rating'), getSeerrMinRatingOptions(), st.minRating)
    radios('minVotes', $L('Minimum Votes'), getSeerrMinVoteOptions(), st.minVotes)
    radios('runtime', $L('Runtime'), getSeerrRuntimeOptions(), st.runtime)
    if (st.filterLanguages.length) {
      rows.push({ kind: 'divider', id: 'd-lang' })
      rows.push({ kind: 'expander', id: 'languages', label: $L('Original Language'), count: st.language ? 1 : 0, expanded: st.languagesExpanded })
      if (st.languagesExpanded) {
        rows.push({ kind: 'radio', id: 'lang:', label: $L('All'), on: st.language === '' })
        st.filterLanguages.forEach((l) => rows.push({ kind: 'radio', id: `lang:${l.code}`, label: l.name, on: st.language === l.code }))
      }
    }
    if (hasSeerrDiscoverFilters(filterState())) rows.push({ kind: 'divider', id: 'd-clear' }, { kind: 'clear', id: 'clear', label: $L('Clear Filters') })
    return rows
  })

  const focusZone = () => {
    if (st.dialog && dialogRef) return dialogRef.setFocus()
    if (root) root.setFocus()
  }
  const saveState = () => {
    const state = { mediaType: st.mt }
    FILTER_KEYS.forEach((k) => {
      state[k] = st[k]
    })
    writeBrowseState(my.key, state)
  }
  const fetchMatches = async (page) => {
    const params = {
      page,
      sortBy: st.sortBy,
      ...buildSeerrDiscoverParams({ routeGenreId: props.kind === 'genre' ? item().id : undefined, ...filterState() }),
    }
    if (props.kind === 'studio') params.studio = item().id
    if (props.kind === 'network') params.network = item().id
    if (props.kind === 'keyword') params.keywords = item().id
    const result = await seerrApi.discoverFiltered(st.mt, params)
    return {
      matches: (result.results || []).filter((entry) => matchesBrowseFilters(entry, st.statusFilter, st.letter)),
      totalPages: result.totalPages || 1,
    }
  }
  const applyPage = (page, { matches, totalPages }, append) => {
    my.totalPages = totalPages
    my.page = page
    st.items = append ? st.items.concat(matches) : matches
    return matches.length
  }
  const scrollTo = (i) => {
    const m = metrics()
    st.scroll = gridScrollFor(Math.floor(i / m.columns), st.scroll, { pitch: m.pitchY, view: GRID_H, box: m.cellHeight + 24 })
  }
  // More loads once a card within eight of the end is drawn, counting three rows past the window.
  // A load asked for while busy is asked again on the next move.
  const maybeLoadMore = () => {
    const m = metrics()
    const drawn = (Math.floor((st.scroll + GRID_H) / m.pitchY) + 4) * m.columns - 1
    if (st.items.length && drawn >= st.items.length - 8) loadMore()
  }
  const focusGrid = (i) => {
    batch(() => {
      st.gridIdx = i
      scrollTo(i)
      const e = st.items[i]
      if (e) {
        st.entry = {
          title: e.title || e.name || '', releaseDate: e.releaseDate || '', firstAirDate: e.firstAirDate || '',
          voteAverage: e.voteAverage || 0, mediaInfo: { status: e.mediaInfo ? e.mediaInfo.status : null }, mediaType: e.mediaType || '',
        }
      }
    })
    if (my.missed) loadMore()
    else maybeLoadMore()
  }
  // A fresh load from the first page. Coming back to a browse that had been paged through reloads
  // as far as it had reached, so the title it was left on is there to return to.
  const reload = async (restoring) => {
    saveState()
    const gen = ++my.gen
    batch(() => {
      st.loading = true
      st.items = []
      st.scroll = 0
      st.gridIdx = 0
    })
    my.loadingMore = true
    my.missed = false
    my.page = 1
    const saved = restoring ? my.saved : null
    const lastPage = saved && saved.pagesLoaded ? Math.min(saved.pagesLoaded, MAX_PAGES) : 1
    try {
      let matched = 0
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await fetchMatches(page)
        if (gen !== my.gen) return
        matched += applyPage(page, result, page > 1)
        if (page >= my.totalPages) break
        if (page >= lastPage && (matched >= MIN_MATCHES || page >= MAX_PAGES_PER_SCAN)) break
      }
    } catch (e) {
      console.error('[seerr] browse failed', e)
    }
    if (gen !== my.gen) return
    my.loadingMore = false
    st.loading = false
    const at = saved && saved.focusedId != null ? st.items.findIndex((i) => i.id === saved.focusedId) : -1
    if (at >= 0) {
      st.zone = 'grid'
      focusGrid(at)
    } else maybeLoadMore()
  }
  async function loadMore() {
    if (my.loadingMore || my.cooldown) {
      my.missed = true
      return
    }
    my.missed = false
    const start = my.page + 1
    const last = Math.min(my.totalPages || 1, MAX_PAGES, start + MAX_PAGES_PER_SCAN - 1)
    if (start > last) return
    const gen = my.gen
    my.loadingMore = true
    try {
      let matched = 0
      for (let page = start; page <= last && matched < MIN_MATCHES; page++) {
        const result = await fetchMatches(page)
        if (gen !== my.gen) return
        matched += applyPage(page, result, true)
      }
    } catch (e) {
      console.error('[seerr] browse paging failed', e)
    }
    if (gen !== my.gen) return
    my.loadingMore = false
    my.missed = false
    my.cooldown = true
    setTimeout(() => (my.cooldown = false), 500)
    maybeLoadMore()
  }
  // The genre and language lists are only read once the panel opens.
  const loadFilterOptions = async () => {
    if (my.optionsRequested) return
    my.optionsRequested = true
    const [genres, languages] = await Promise.all([
      (st.mt === 'tv' ? seerrApi.getGenreSliderTv() : seerrApi.getGenreSliderMovies()).catch(() => []),
      seerrApi.getLanguages().catch(() => []),
    ])
    if (!my.alive) return
    batch(() => {
      st.filterGenres = genres || []
      st.filterLanguages = (languages || [])
        .filter((l) => l.iso_639_1)
        .map((l) => ({ code: l.iso_639_1, name: l.english_name || l.name || l.iso_639_1 }))
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  }
  const openDialog = (which) => {
    if (which === 'sort') {
      loadFilterOptions()
      st.genresExpanded = false
      st.languagesExpanded = false
    }
    st.dialog = which
    if (dialogRef) dialogRef.open()
    focusZone()
  }
  const closeDialog = () => {
    st.dialog = ''
    focusZone()
  }
  // Media types own their genres and statuses, so switching type drops them.
  const setMediaType = (mt) => {
    if (mt === st.mt) return
    batch(() => {
      st.mt = mt
      st.filterGenres = []
      st.genreIds = []
      st.tvStatuses = []
    })
    my.optionsRequested = false
  }
  const onBrowseDialog = (row) => {
    const parts = String(row.id).split(':')
    const group = parts[0]
    const value = parts.slice(1).join(':')
    if (group === 'size') {
      settings.set('seerrPosterSize', value)
      st.posterSize = value
      closeDialog()
      st.scroll = 0
      scrollTo(st.gridIdx)
      return
    }
    if (group === 'genres') return (st.genresExpanded = !st.genresExpanded)
    if (group === 'languages') return (st.languagesExpanded = !st.languagesExpanded)
    // Picking a sort, a media type or Clear closes the panel, a filter keeps it open.
    let close = true
    if (group === 'sort') {
      const option = getSeerrSortOptions(st.mt).find((o) => o.key === value)
      if (!option) return
      // Picking the active axis again flips its direction.
      if (st.sortBy.indexOf(value + '.') === 0) st.sortBy = /\.asc$/.test(st.sortBy) ? `${value}.desc` : `${value}.asc`
      else st.sortBy = option.defaultValue
    } else if (group === 'type') {
      setMediaType(value)
    } else if (group === 'genre') {
      const id = parseInt(value, 10)
      st.genreIds = st.genreIds.indexOf(id) >= 0 ? st.genreIds.filter((g) => g !== id) : st.genreIds.concat([id])
      close = false
    } else if (group === 'tvstatus') {
      const key = parseInt(value, 10)
      st.tvStatuses = st.tvStatuses.indexOf(key) >= 0 ? st.tvStatuses.filter((k) => k !== key) : st.tvStatuses.concat([key])
      close = false
    } else if (group === 'lang' || group === 'released' || group === 'minRating' || group === 'minVotes' || group === 'runtime') {
      st[group === 'lang' ? 'language' : group] = value
      close = false
    } else if (group === 'clear') {
      batch(() => {
        st.genreIds = []
        st.tvStatuses = []
        st.language = ''
        st.minRating = ''
        st.minVotes = ''
        st.runtime = ''
        st.released = ''
      })
    } else return
    if (close) closeDialog()
    reload()
  }
  const selectTool = () => {
    const tool = tools()[st.toolIdx]
    if (tool.kind === 'chip') {
      if (st.statusFilter === tool.id) return
      st.statusFilter = tool.id
      reload()
    } else if (tool.id === 'home') goHome()
    else openDialog(tool.id)
  }
  const openItem = (i) => {
    const entry = st.items[i]
    if (!entry) return
    writeBrowseState(my.key, { focusedId: entry.id, pagesLoaded: my.page })
    // Only the id and type go along, so the title opens on its Seerr page.
    openSeerrItem(router, { id: entry.id, mediaType: entry.media_type || entry.mediaType || (entry.title ? 'movie' : 'tv') })
  }

  createEffect(on(props.page.active, (a) => a && (store.navSection = 'seerr')))
  onMount(async () => {
    store.navSection = 'seerr'
    my.key = browseStateKey(props.kind, item(), props.mediatype)
    const saved = (my.saved = readBrowseState(my.key))
    batch(() => {
      if (saved && saved.mediaType) st.mt = saved.mediaType
      else if (props.kind === 'studio') st.mt = 'movie'
      else if (props.kind === 'network') st.mt = 'tv'
      else st.mt = props.mediatype === 'tv' ? 'tv' : 'movie'
      if (saved) {
        FILTER_KEYS.forEach((k) => {
          if (saved[k] != null) st[k] = saved[k]
        })
      }
    })
    focusZone()
    const seerr = await checkSeerr()
    if (!my.alive) return
    if (!seerr.enabled) {
      batch(() => {
        st.enabled = false
        st.loading = false
      })
      return
    }
    reload(true)
  })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#101010ff"
      onLeft={() => {
        const cols = metrics().columns
        if (st.zone === 'tools') st.toolIdx = Math.max(0, st.toolIdx - 1)
        else if (st.zone === 'alpha') st.alphaIdx = Math.max(0, st.alphaIdx - 1)
        else if (st.gridIdx % cols > 0) focusGrid(st.gridIdx - 1)
        return true
      }}
      onRight={() => {
        const cols = metrics().columns
        if (st.zone === 'tools') st.toolIdx = Math.min(tools().length - 1, st.toolIdx + 1)
        else if (st.zone === 'alpha') st.alphaIdx = Math.min(LETTERS.length - 1, st.alphaIdx + 1)
        else if (st.gridIdx % cols < cols - 1 && st.gridIdx + 1 < st.items.length) focusGrid(st.gridIdx + 1)
        return true
      }}
      onUp={() => {
        // Up and Down move to the nearest control in the next band.
        const m = metrics()
        if (st.zone === 'alpha') {
          batch(() => {
            st.zone = 'tools'
            st.toolIdx = nearest(tools(), letters()[st.alphaIdx].cx)
          })
        } else if (st.zone === 'grid') {
          if (st.gridIdx >= m.columns) focusGrid(st.gridIdx - m.columns)
          else {
            batch(() => {
              st.zone = 'alpha'
              st.alphaIdx = nearest(letters(), m.edge + (st.gridIdx % m.columns) * m.pitchX + m.inset + m.artWidth / 2)
            })
          }
        }
        return true
      }}
      onDown={() => {
        const m = metrics()
        if (st.zone === 'tools') {
          batch(() => {
            st.zone = 'alpha'
            st.alphaIdx = nearest(letters(), tools()[st.toolIdx].cx)
          })
        } else if (st.zone === 'alpha') {
          if (!st.items.length) return true
          const row = Math.floor((st.scroll + m.pitchY / 2) / m.pitchY)
          const centers = []
          for (let c = 0; c < m.columns; c++) centers.push({ cx: m.edge + c * m.pitchX + m.inset + m.artWidth / 2 })
          st.zone = 'grid'
          focusGrid(Math.min(row * m.columns + nearest(centers, letters()[st.alphaIdx].cx), st.items.length - 1))
        } else if (st.gridIdx + m.columns < st.items.length) {
          focusGrid(st.gridIdx + m.columns)
        } else if (Math.floor(st.gridIdx / m.columns) < Math.floor((st.items.length - 1) / m.columns)) {
          focusGrid(st.items.length - 1)
        }
        return true
      }}
      onEnter={() => {
        if (st.zone === 'tools') selectTool()
        else if (st.zone === 'grid') openItem(st.gridIdx)
        else {
          const entry = LETTERS[st.alphaIdx]
          if (entry !== st.letter) {
            st.letter = entry
            reload()
          }
        }
        return true
      }}
      onBack={() => {
        // Back from the grid climbs to the A to Z bar's All first.
        if (st.zone === 'grid') {
          batch(() => {
            st.zone = 'alpha'
            st.alphaIdx = 0
          })
          return true
        }
        return false
      }}
    >
      <text x={100} y={22} fontFamily={titleFont} fontSize={43} lineHeight={51.6} maxWidth={1720} maxLines={1} contain="width" textAlign="center" color="#ffffffff">
        {title()}
      </text>

      <text x={100} y={84} fontFamily={focusLine().titleFont} fontSize={33} lineHeight={42} maxWidth={1720} maxLines={1} color="#ffffffff">
        {focusLine().title}
      </text>
      <view>
        <For each={focusLine().texts}>
          {(p) => (
            <text x={p.x} y={129} fontFamily={lineFont} fontSize={23} lineHeight={30} color="#ffffffb3">
              {p.text}
            </text>
          )}
        </For>
      </view>
      <view>
        <Show when={focusLine().star != null}>
          <view x={focusLine().star} y={130.5} width={23} height={23} src="icons/star.webp" color="#ff9800ff" />
        </Show>
      </view>
      <view>
        <Show when={focusLine().badge}>
          {(b) => (
            <view x={b().x} y={129.2} width={b().w} height={25.6} borderRadius={7} color={b().color}>
              <text x={10} y={4} fontFamily={badgeFont} fontSize={18} lineHeight={21.6} color="#ffffffff">
                {b().text}
              </text>
            </view>
          )}
        </Show>
      </view>

      <view>
        <For each={tools().slice(0, 3)}>
          {(tool) => {
            const focused = () => toolFocus() === tool.i
            return (
              <view x={tool.x} y={185} width={70} height={70}>
                <view width={70} height={70} borderRadius={10} color="#ffffffff" alpha={focused() ? 1 : 0} />
                <view width={70} height={70} borderRadius={10} color="#00000000" border={{ width: 2, color: hex(t().focus) }} alpha={focused() ? 1 : 0} />
                <view x={11.5} y={11.5} width={47} height={47} src={'icons/' + tool.icon + '.webp'} color={focused() ? '#00a4dcff' : '#ffffff80'} />
              </view>
            )
          }}
        </For>
      </view>
      <view>
        <For each={tools().slice(3)}>
          {(chip) => (
            <view x={chip.x} y={201} width={chip.w} height={38}>
              <view width={chip.w} height={38} borderRadius={19} color={chip.on ? '#6366f1ff' : '#ffffff14'} />
              <view width={chip.w} height={38} borderRadius={19} color="#00000000" border={{ width: 2, color: hex(t().focus) }} alpha={toolFocus() === chip.i ? 1 : 0} />
              <text x={17} y={9} fontFamily={chip.on ? chipOnFont : chipFont} fontSize={20} lineHeight={24} color={chip.on ? '#ffffffff' : '#ffffffb3'}>
                {chip.label}
              </text>
            </view>
          )}
        </For>
      </view>

      <view>
        <For each={letters()}>
          {(lt) => (
            <view x={lt.x} y={268} width={lt.w} height={57}>
              <view width={lt.w} height={57} borderRadius={7} color="#ffffff1a" alpha={lt.on ? 1 : 0} />
              <view width={lt.w} height={57} borderRadius={7} color="#00000000" border={{ width: 2, color: hex(t().focus) }} alpha={letterFocus() === lt.i ? 1 : 0} />
              <text
                x={lt.w / 2}
                y={13}
                mountX={0.5}
                fontFamily={lt.on ? letterOnFont : letterFont}
                fontSize={25}
                lineHeight={33}
                color={lt.on ? '#6366f1ff' : '#ffffff8c'}
              >
                {lt.label}
              </text>
            </view>
          )}
        </For>
      </view>

      <view x={metrics().edge} y={356} width={1920 - 2 * metrics().edge} height={GRID_H} clipping>
        <view transition={{ y: { duration: 250, easing: 'ease-out' } }} y={-st.scroll} width={1920} height={gridH()}>
          <For each={slots.keys()}>
            {(k) => {
              const c = () => slots.item(k)().card
              return (
                <SeerrPosterCard
                  x={c().x}
                  y={c().y}
                  alpha={c().hidden ? 0 : 1}
                  card={c()}
                  w={metrics().artWidth}
                  h={metrics().imageHeight}
                  focused={c().idx === gridFocus()}
                  zoom={st.zoom}
                  ring={t().focus}
                  titleColor="#e6e6e6ff"
                />
              )
            }}
          </For>
        </view>
      </view>

      <view>
        <Show when={st.loading && !st.items.length}>
          <Spinner x={928} y={654} size={64} />
        </Show>
      </view>
      <text x={960} y={674} mountX={0.5} fontFamily={footFont} fontSize={24} color="#ffffffb3">
        {empty()}
      </text>

      <text x={100} y={1051.5} fontFamily={footFont} fontSize={18} color="#ffffff4d">
        {statusFooter()}
      </text>
      <text x={1820} y={1049} mountX={1} fontFamily={footFont} fontSize={22} color="#ffffff73">
        {countFooter()}
      </text>

      <view>
        <Show when={st.dialog}>
          <Kept gone={() => (dialogRef = null)}>
            <BrowseDialog
              ref={(n) => (dialogRef = n)}
              rows={dialogRows()}
              onBrowseDialog={onBrowseDialog}
              onBrowseDialogClose={closeDialog}
            />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
