import $L from '../../services/i18n.js'
import { For, Show, batch, onCleanup, onMount } from 'solid-js'
import Grid from '../../ui/components/Grid.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import Chrome from '../../ui/components/library/Chrome.jsx'
import LibraryPanel from '../../ui/components/library/LibraryPanel.jsx'
import LibraryTile from '../../ui/components/library/LibraryTile.jsx'
import { Kept, keyed } from '../../ui/components/library/pageKit.js'
import { focusMs, slideMs } from '../../ui/components/library/motion.js'
import { fitText, fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { colorNum } from '../../ui/components/library/libraryChrome.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { reactive } from '../../state/reactive.js'
import { router } from '../../app/router.js'
import { focusNav } from '../../app/focus.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import * as connectionPool from '../../services/connectionPool.js'
import { getActiveParentalFilter } from '../../services/parentalControls.js'
import { withoutBlocked } from '../../utils/parentalFilter.js'
import { BATCH, createSparse, isRangeLoaded, missingBatches, placePage, unloadDistant } from './sparsePages.js'
import { getBackdropId, getImageUrl, getPrimaryImageId } from '../../utils/helpers.js'
import { routeForItem } from '../../state/libraryRoutes.js'
import { menuHold } from '../../ui/components/modals/menuHold.js'
import * as settings from '../../state/settings.js'
import { LETTERS } from '../../utils/gridChrome.js'

// One genre's movies and shows across the libraries (/genrebrowse/:id with genreName, which a genre
// card on Home opens, or with genre, a multi server genre from Genres). The grid holds every title at
// its server position and reads the pages it shows, so it can jump anywhere and let go of what it left.
const SORT_OPTIONS = [
  { key: 'SortName,Ascending', label: 'Name (A-Z)' },
  { key: 'SortName,Descending', label: 'Name (Z-A)' },
  { key: 'CommunityRating,Descending', label: 'Rating' },
  { key: 'DateCreated,Descending', label: 'Date Added' },
  { key: 'PremiereDate,Descending', label: 'Release Date' },
  { key: 'Random,Ascending', label: 'Random' },
]
const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'Movie', label: 'Movies' },
  { key: 'Series', label: 'TV Shows' },
]
const VIEW_H = 787
const COLS = 9
const TILE_H = 380
const UNLOAD_EVERY = 500
const COVER = { resizeMode: { type: 'cover' } }

export default function GenreBrowse(props) {
  const st = reactive({
    controls: [],
    texts: [],
    cards: [],
    opts: {},
    loading: true,
    backdrop: '',
    emptyText: '',
    panel: '',
    panelTitle: '',
    panelRows: [],
  })
  const my = { sort: SORT_OPTIONS[0].key, filter: 'all', letter: null, items: [], zone: 'chrome', gen: 0 }
  let chromeRef = null
  let grid = null
  let panelRef = null
  let backdropTimer = null
  onCleanup(() => clearTimeout(backdropTimer))
  const texts = keyed(() => st.texts, (t) => t.k)
  const plainFont = uiFont()

  const reload = () => {
    my.gen++
    // With ratings blocked, pages come back with gaps, so the grid holds only what survived and
    // reads on from how far into the server's list it has got.
    my.compact = getActiveParentalFilter().isActive
    my.sparse = null
    my.items = []
    my.rawFetched = 0
    my.total = 0
    my.blocked = 0
    my.mark = 0
    my.pendingNext = false
    my.cache = {}
    my.backdropSet = false
    batch(() => {
      st.cards = []
      st.loading = true
      chrome()
    })
    loadItems(0, true)
  }
  const params = (start) => {
    const group = !!settings.get('groupItemsIntoCollections')
    const [field, order] = my.sort.split(',')
    const p = {
      StartIndex: start, Limit: BATCH, SortBy: field, SortOrder: order, Recursive: true, Genres: my.genre,
      EnableTotalRecordCount: true, CollapseBoxSetItems: group, ExcludeItemTypes: 'Playlist,Episode,Season,Folder',
      Fields: 'ProductionYear,ImageTags,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,SeriesId,SeriesPrimaryImageTag,UserData,OfficialRating',
    }
    if (props.libraryId) p.ParentId = props.libraryId
    if (my.filter !== 'all') p.IncludeItemTypes = group && (my.filter === 'Movie' || my.filter === 'Series') ? `${my.filter},BoxSet` : my.filter
    else p.IncludeItemTypes = group ? 'Movie,Series,BoxSet' : 'Movie,Series'
    if (my.letter === '#') p.NameLessThan = 'A'
    else if (my.letter) p.NameStartsWith = my.letter
    return p
  }
  // A genre merged across servers asks every server, and one from another server asks that one.
  const fetchItems = async (p) => {
    const g = my.genreObj
    if (g && g._unifiedGenre) return connectionPool.getGenreItemsFromAllServers(p)
    if (g && g._serverUrl) {
      const r = await connectionPool.getApiForItem(g).getItems(p)
      const tag = {
        _serverUrl: g._serverUrl, _serverType: g._serverType, _serverAccessToken: g._serverAccessToken,
        _serverUserId: g._serverUserId, _serverName: g._serverName, _serverId: g._serverId,
      }
      return { ...r, Items: ((r && r.Items) || []).map((it) => ({ ...it, ...tag })) }
    }
    return api.getItems(p)
  }
  const loadItems = async (start, reset) => {
    if (!my.genre) return
    const s = my.sparse
    if (!reset) {
      if (my.compact) {
        if (my.pendingNext) return
        my.pendingNext = true
      } else {
        if (!s || isRangeLoaded(s, start, start + BATCH - 1) || s.pending[start]) return
        s.pending[start] = true
      }
    }
    const gen = my.gen
    try {
      const r = await fetchItems(params(start))
      if (gen !== my.gen) return
      const fetched = (r && r.Items) || []
      my.total = (r && r.TotalRecordCount) || 0
      let shown = fetched
      if (my.compact) {
        shown = withoutBlocked(fetched, getActiveParentalFilter())
        my.rawFetched = start + fetched.length
        my.items = reset ? shown : my.items.concat(shown)
        my.blocked = (reset ? 0 : my.blocked) + fetched.length - shown.length
      } else if (reset) {
        my.sparse = createSparse(my.total)
        placePage(my.sparse, start, fetched)
      } else placePage(s, start, fetched)
      if (reset && !my.backdropSet && !settings.get('hideBackdropsInLibraries')) {
        const first = shown.find((it) => getBackdropId(it))
        if (first) {
          st.backdrop = getImageUrl(first._serverUrl || getServerUrl(), getBackdropId(first), 'Backdrop', { maxWidth: 1920, quality: 100 })
          my.backdropSet = true
        }
      }
    } catch (e) {
      console.error('Failed to load genre items:', e)
    } finally {
      if (s) delete s.pending[start]
      if (!reset && my.compact) my.pendingNext = false
    }
    if (gen !== my.gen) return
    if (reset) st.loading = false
    show()
    ensureLoaded()
  }
  // Every empty card in view reads its page, and the list lets go of far away titles each time a
  // 500th one comes into view.
  const ensureLoaded = () => {
    if (!grid || st.loading) return
    const first = grid.first()
    const from = Math.max(0, first - 1) * COLS
    const to = (first + Math.ceil(VIEW_H / TILE_H) + 1) * COLS
    if (my.compact) {
      if (my.rawFetched < my.total && my.items.length < to) loadItems(my.rawFetched, false)
      return
    }
    const s = my.sparse
    if (!s) return
    missingBatches(s, from, to).forEach((b) => loadItems(b, false))
    const mark = Math.floor((to - 1) / UNLOAD_EVERY) * UNLOAD_EVERY
    if (mark > 0 && mark >= from && mark !== my.mark) {
      my.mark = mark
      if (unloadDistant(s, mark)) show()
    }
  }
  const cardFor = (it, i) => {
    const id = getPrimaryImageId(it)
    const title = fitText(it.Name || '', 16, 'medium', 171)
    const year = it.ProductionYear ? String(it.ProductionYear) : ''
    return {
      key: it.Id + '-' + i, idx: i, image: id ? getImageUrl(it._serverUrl || getServerUrl(), id, 'Primary', { maxHeight: 300, quality: 80 }) : '',
      icon: 'lib_movie', title, titleFont: fontFor(title, 'medium'), subtitle: year, subtitleFont: uiFont(),
      fav: false, played: !!(it.UserData && it.UserData.Played), clip: null, raw: it,
    }
  }
  const show = () => {
    const t = theme()
    batch(() => {
      st.opts = {
        cellW: 211, cellH: 380, padX: 10, padY: 10, cardW: 177, cardH: 276 + 70, posterH: 276, showText: true, ms: focusMs(200),
        slide: slideMs(200), artBg: '#ffffff0d', mutedIcon: '#ffffff4d', favY: 8, boldFont: uiFont('bold'),
        watchedBg: t.badgeWatched, onBadge: t.onBadge, tSize: 16, tY: 13.9, tLh: 33, sSize: 14, sY: 50.9, sLh: 33,
        loadingBg: '#ffffff12',
      }
      // Cards are made once per title and kept, since a page landing rebuilds the whole list.
      const cache = my.cache
      const card = (it, i) => {
        const had = cache[i]
        if (had && had.raw === it) return had
        return (cache[i] = cardFor(it, i))
      }
      const slots = my.compact ? my.items : my.sparse ? my.sparse.slots : []
      const cards = slots.map((it, i) => (it ? card(it, i) : { key: 'ph' + i, idx: i, loading: true }))
      if (my.compact && my.rawFetched < my.total) cards.push({ key: 'ph' + cards.length, idx: cards.length, loading: true })
      st.cards = cards
      st.emptyText = !st.loading && !st.cards.length ? $L('No items found') : ''
      chrome()
    })
  }
  const chrome = () => {
    const sort = SORT_OPTIONS.find((o) => o.key === my.sort)
    const filter = FILTER_OPTIONS.find((o) => o.key === my.filter)
    let sub = `${sort ? $L(sort.label) : ''} • ${filter ? $L(filter.label) : ''}`
    if (my.letter) sub += ` • ${$L('Starting with "{letter}"').replace('{letter}', my.letter)}`
    const count = `${Math.max(0, (my.total || 0) - (my.blocked || 0))} ${$L('items')}`
    st.texts = [
      { k: 'title', text: my.genre || '', size: 38, font: fontFor(my.genre || '', 'bold'), color: '#ffffff', x: 72, y: 115 },
      { k: 'sub', text: sub, size: 16, font: uiFont(), color: '#ffffff99', x: 72, y: 152 },
      { k: 'count', text: count, size: 18, font: uiFont(), color: '#ffffff99', x: 1872 - textWidth(count, 18), y: 133.5 },
    ]
    const ms = focusMs(150)
    const button = (id, icon, label, x) => {
      const w = Math.ceil(20 + 6 + textWidth(label, 16) + 2 * 20 + 2)
      return {
        id, group: 'toolbar', kind: 'button', x, y: 206.5, w, h: 46, r: 8, ms,
        base: '#ffffff1a', fill: '#ffffff33', ring: true, ringBorder: { w: 2, color: colorNum('#00a4dc') },
        icon, ix: 21, iy: 13, isz: 20, iconOff: '#ffffff', inkOn: '#ffffff', iconAlpha: 1,
        label, lfont: uiFont(), lsize: 16, lx: 47, ly: 13, lh: 20, lmax: w, labelOff: '#ffffff', labelOn: '#ffffff',
        next: { down: 'out' },
      }
    }
    const controls = [
      button('sort', 'lib_sort', sort ? $L(sort.label) : '', 48),
      button('filter', 'lib_show', filter ? $L(filter.label) : '', 48 + 143 + 16),
    ]
    let x = 369.7
    LETTERS.forEach((l) => {
      const active = my.letter === l
      controls.push({
        id: 'L-' + l, group: 'toolbar', kind: 'letter', letter: l, x, y: 206, w: 45, h: 47, r: 6, ms,
        base: active ? '#00a4dc' : '#ffffff0d', fill: '#ffffff33', ring: true, ringBorder: { w: 2, color: colorNum('#00a4dc') },
        label: l, lfont: uiFont('bold'), lsize: 18, lx: (45 - textWidth(l, 18, 'bold')) / 2, ly: 13, lh: 21, lmax: 45,
        labelOff: active ? '#ffffff' : '#ffffffb3', labelOn: '#ffffff', next: { down: 'out' },
      })
      x += 52.9
    })
    st.controls = controls
  }
  const focusZone = () => {
    if (props.page && !props.page.active()) return
    if (st.panel && panelRef) return panelRef.setFocus()
    if (my.zone === 'grid' && grid) return grid.setFocus()
    my.zone = 'chrome'
    if (chromeRef) chromeRef.setFocus()
  }
  // A pick applies right away and the dialog stays up until Back, like the library's sort panel.
  const openPanel = (which) => {
    const keep = st.panel === which
    const list = which === 'sort' ? SORT_OPTIONS : FILTER_OPTIONS
    const cur = which === 'sort' ? my.sort : my.filter
    batch(() => {
      st.panel = which
      st.panelTitle = which === 'sort' ? $L('Sort By') : $L('Filter')
      st.panelRows = list.map((o) => ({ kind: 'radio', id: which + '-' + o.key, value: o.key, label: $L(o.label), selected: o.key === cur }))
    })
    if (!keep && panelRef) {
      panelRef.select(which + '-' + cur)
      focusZone()
    }
  }
  const onGridFocus = (card) => {
    ensureLoaded()
    const it = card.raw
    const id = it && getBackdropId(it)
    if (!id || settings.get('hideBackdropsInLibraries')) return
    clearTimeout(backdropTimer)
    backdropTimer = setTimeout(() => {
      st.backdrop = getImageUrl(it._serverUrl || getServerUrl(), id, 'Backdrop', { maxWidth: 1280, quality: 80 })
    }, 300)
  }
  const onGridSelect = (card) => {
    if (!card.raw) return
    const [path, data] = routeForItem(card.raw)
    router.to(path, data)
  }
  // Holding OK on a card opens its menu.
  const hold = menuHold(
    () => (grid && grid.current() && grid.current().raw) || null,
    () => grid && grid.current() && onGridSelect(grid.current()),
  )

  onMount(async () => {
    await fontsReady()
    my.genreObj = props.genre || null
    my.genre = (props.genre && props.genre.name) || props.genreName || ''
    if (!my.genre && (props.genreId || props.id)) {
      try {
        my.genre = (await api.getItem(props.genreId || props.id)).Name
      } catch (e) {
        my.genre = ''
      }
    }
    reload()
    focusZone()
  })

  return (
    <view
      width={1920}
      height={1080}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      onUp={() => {
        if (st.panel) return true
        if (my.zone === 'grid') {
          my.zone = 'chrome'
          if (chromeRef) chromeRef.selectGroup('toolbar')
          focusZone()
        }
        return true
      }}
      onLeft={() => {
        if (!st.panel && my.zone === 'grid') focusNav()
        return true
      }}
      onBack={() => {
        if (st.panel) {
          st.panel = ''
          focusZone()
        } else router.back()
        return true
      }}
    >
      <view width={1920} height={1080} colorTl="#101010" colorTr="#161616" colorBl="#171717" colorBr="#171717" />
      <view>
        <Show when={st.backdrop} keyed>
          {(url) => (
            <view width={1920} height={1080}>
              <view width={1920} height={1080} src={url} textureOptions={COVER} />
              <view width={1920} height={1080} colorTop="#101010b3" colorBottom="#101010f2" />
            </view>
          )}
        </Show>
      </view>
      <view>
        <For each={texts.keys()}>
          {(k) => {
            const t = texts.item(k)
            return (
              <text fontFamily={t().font} fontSize={t().size} x={t().x} y={t().y} lineHeight={33} color={t().color}>
                {t().text}
              </text>
            )
          }}
        </For>
      </view>
      <view x={20} y={283} width={1880} height={VIEW_H} clipping onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
        <Show when={st.cards.length}>
          <Kept gone={() => (grid = null)}>
            <Grid
              ref={(n) => (grid = n)}
              items={st.cards}
              tile={LibraryTile}
              cols={COLS}
              tileW={211}
              tileH={TILE_H}
              gap={20}
              viewH={VIEW_H}
              opts={st.opts}
              slideMs={st.opts.slide}
              onGridFocus={onGridFocus}
              onGridEnd={ensureLoaded}
              onGridSelect={onGridSelect}
            />
          </Kept>
        </Show>
      </view>
      <view>
        <Show when={st.loading && !st.cards.length}>
          <Spinner x={928} y={620} size={64} />
        </Show>
      </view>
      <view>
        <Show when={st.emptyText}>
          <text fontFamily={plainFont} fontSize={24} x={960} y={640} mountX={0.5} color="#ffffff80">
            {st.emptyText}
          </text>
        </Show>
      </view>
      <Chrome
        ref={(n) => (chromeRef = n)}
        controls={st.controls}
        onChromeEdge={(dir) => {
          if (dir === 'down' && st.cards.length) {
            my.zone = 'grid'
            focusZone()
          } else if (dir === 'left' || dir === 'up') focusNav()
          return true
        }}
        onChromeSelect={(id, c) => {
          if (id === 'sort' || id === 'filter') return openPanel(id)
          if (c.kind === 'letter') {
            my.letter = c.letter === my.letter ? null : c.letter
            reload()
          }
        }}
      />
      <view>
        <Show when={st.panel}>
          <Kept gone={() => (panelRef = null)}>
            <LibraryPanel
              ref={(n) => (panelRef = n)}
              title={st.panelTitle}
              rows={st.panelRows}
              narrow
              onPanelSelect={(r) => {
                if (st.panel === 'sort') my.sort = r.value
                else my.filter = r.value
                reload()
                openPanel(st.panel)
              }}
            />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
