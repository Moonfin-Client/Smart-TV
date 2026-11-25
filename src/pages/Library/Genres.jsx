import $L from '../../services/i18n.js'
import { For, Show, batch, onMount } from 'solid-js'
import Grid from '../../ui/components/Grid.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import Chrome from '../../ui/components/library/Chrome.jsx'
import SidePanel from '../../ui/components/library/SidePanel.jsx'
import GenreTile from '../../ui/components/library/GenreTile.jsx'
import { Kept, keyed, pageTimers } from '../../ui/components/library/pageKit.js'
import { roundButton } from '../../ui/components/library/roundButton.js'
import { virtualGridLayout } from '../../ui/components/library/tileGridMath.js'
import { focusMs, slideMs } from '../../ui/components/library/motion.js'
import { fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { goHome } from '../../ui/components/library/goHome.js'
import { unifiedMode } from '../../ui/components/library/multiServer.js'
import { displayFont, fontFor, uiFont } from '../../ui/text.js'
import { activeThemeId, shadowColor } from '../../ui/theme.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import * as connectionPool from '../../services/connectionPool.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import { getBackdropId, getImageUrl } from '../../utils/helpers.js'
import { capitalize, cycleValue } from '../../utils/gridChrome.js'
import * as settings from '../../state/settings.js'
import { menuHold } from '../../ui/components/modals/menuHold.js'
import { shuffled } from '../../utils/shuffled.js'

// Every movie and show genre as backdrop cards (/genres, or /genres/:id for one library). A genre
// opens the library screen narrowed to it. In multi server mode the genres are every server's merged,
// and one of them opens GenreBrowse across the servers.
const SORT_OPTIONS = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'count-desc', label: 'Most Items' },
  { key: 'count-asc', label: 'Least Items' },
  { key: 'random', label: 'Random' },
]
const CARD_SIZES = ['small', 'medium', 'large']
const ITEM_SIZES = { small: [240, 130], medium: [320, 180], large: [400, 230] }
const CARD_HEIGHTS = { small: 100, medium: 140, large: 180 }
const VIEW_H = 874
const serverOf = (s) => ({
  _serverUrl: s._serverUrl, _serverType: s._serverType, _serverAccessToken: s._serverAccessToken,
  _serverUserId: s._serverUserId, _serverName: s._serverName, _serverId: s._serverId,
})

const neonOn = () => activeThemeId(settings.all()) === 'neon_pulse'
const NEON = {
  accent: '#ff2e92',
  cyan: '#00e5ff',
  glow: { color: '#ff2e9259', x: 0, y: 0, blur: 8 },
  button: { fill: '#ff2e9226', ringBorder: { w: 1, color: 0xff2e92ff }, next: { down: 'out' } },
  tile: {
    ring: { width: 3, color: 0xff2e92ff },
    glow: { color: shadowColor('#ff2e9259'), x: 0, y: 0, blur: 14, spread: 0 },
    nameColor: '#ff2e92',
    nameSpacing: 0.4,
    nameShadow: { color: '#ff2e9259', x: 0, y: 0, blur: 8 },
    countColor: '#00e5ff',
  },
}

export default function Genres(props) {
  const store = getStore()
  const later = pageTimers()
  const st = reactive({
    controls: [],
    texts: [],
    cards: [],
    cols: 1,
    tileW: 0,
    tileH: 0,
    opts: {},
    loading: true,
    panel: '',
    panelRows: [],
    statusText: '',
    emptyText: '',
  })
  const my = { genres: [], libraries: [], lib: null, zone: 'chrome', gen: 0 }
  let chromeRef = null
  let grid = null
  let panelRef = null
  const texts = keyed(() => st.texts, (t) => t.k)
  const plainFont = uiFont()

  const loadLibraries = async () => {
    try {
      const all = my.unified ? await connectionPool.getLibrariesFromAllServers() : ((await api.getLibraries()) || {}).Items || []
      my.libraries = all.filter((l) => l.CollectionType === 'movies' || l.CollectionType === 'tvshows')
    } catch (e) {
      console.error('Failed to load libraries:', e)
    }
  }
  const load = async () => {
    const gen = ++my.gen
    batch(() => {
      st.loading = true
      st.emptyText = ''
      st.cards = []
    })
    const lib = my.lib
    try {
      let list
      let serverApi = api
      if (my.unified && !lib) {
        // Every server's genres, each with a backdrop from a random pool, since a merged genre has no
        // one server to ask for its titles.
        const genres = await connectionPool.getGenresFromAllServers()
        let pool = []
        try {
          const random = await connectionPool.getRandomItemsFromAllServers('both', 30)
          pool = random
            .filter((it) => getBackdropId(it) !== null)
            .map((it) => getImageUrl(it._serverUrl || getServerUrl(), getBackdropId(it), 'Backdrop', { maxWidth: 780, quality: 80 }))
        } catch (e) {
          console.warn('[Genres] Failed to fetch backdrop pool:', e)
        }
        if (gen !== my.gen) return
        my.genres = genres.map((g, i) => ({
          id: g.Id, name: g.Name, itemCount: g.ChildCount || 0, backdropUrl: pool.length ? pool[i % pool.length] : '', _unifiedGenre: true,
        }))
        st.loading = false
        show()
        return
      } else if (my.unified && lib && lib._serverUrl) {
        serverApi = connectionPool.getApiForItem(lib)
        const res = serverApi ? await serverApi.getGenres(lib.Id) : null
        list = ((res && res.Items) || []).map((g) => ({ ...g, ...serverOf(lib) }))
      } else {
        const res = await api.getGenres(lib ? lib.Id : undefined)
        list = (res && res.Items) || []
      }
      const group = !!settings.get('groupItemsIntoCollections')
      const used = {}
      const server = (lib && lib._serverUrl) || getServerUrl()
      const dataFor = async (genre) => {
        try {
          const params = {
            Genres: genre.Name,
            IncludeItemTypes: group ? 'Movie,Series,BoxSet' : 'Movie,Series',
            ExcludeItemTypes: 'Playlist,Episode,Season,Folder',
            CollapseBoxSetItems: group,
            Recursive: true,
            Limit: 5,
            SortBy: 'Random',
            EnableTotalRecordCount: true,
            Fields: 'BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId',
          }
          if (lib) params.ParentId = lib.Id
          const r = serverApi ? await serverApi.getItems(params) : null
          const count = (r && r.TotalRecordCount) || 0
          if (!count) return null
          // Each card takes a backdrop no other has taken, repeating one only when it has to.
          const withArt = ((r && r.Items) || []).map((it) => ({ it, id: getBackdropId(it) })).filter((e) => e.id)
          const chosen = withArt.find((e) => !used[e.id]) || withArt[0]
          if (chosen) used[chosen.id] = true
          return {
            id: genre.Id, name: genre.Name, itemCount: count,
            backdropUrl: chosen ? getImageUrl(server, chosen.id, 'Backdrop', { maxWidth: 780, quality: 80 }) : '',
            ...serverOf(genre),
          }
        } catch (e) {
          console.error(`Failed to get data for genre ${genre.Name}:`, e)
          return null
        }
      }
      const out = []
      for (let i = 0; i < list.length; i += 10) {
        const chunk = await Promise.all(list.slice(i, i + 10).map(dataFor))
        if (gen !== my.gen) return
        out.push(...chunk)
      }
      my.genres = out.filter(Boolean)
    } catch (e) {
      console.error('Failed to load genres:', e)
      my.genres = []
    }
    if (gen !== my.gen) return
    st.loading = false
    show()
  }
  const sorted = () => {
    if (my.sort === 'random') return shuffled(my.genres)
    const list = my.genres.slice()
    switch (my.sort) {
      case 'name-asc': list.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'name-desc': list.sort((a, b) => b.name.localeCompare(a.name)); break
      case 'count-desc': list.sort((a, b) => b.itemCount - a.itemCount); break
      case 'count-asc': list.sort((a, b) => a.itemCount - b.itemCount); break
      default: break
    }
    return list
  }
  const show = () => {
    batch(() => {
      st.cards = sorted().map((g, i) => ({
        key: g.id + '-' + i, idx: i, name: g.name, nameFont: neonOn() ? displayFont('bold', g.name) : fontFor(g.name, 'bold'),
        countText: g.itemCount > 0 ? `${g.itemCount} ${$L('items')}` : '', image: g.backdropUrl, raw: g,
      }))
      st.emptyText = !st.loading && !st.cards.length ? $L('No genres found') : ''
      header()
      const current = (SORT_OPTIONS.find((o) => o.key === my.sort) || {}).label
      const label = current ? $L(current) : ''
      st.statusText = my.lib
        ? $L("{count} genres in '{libraryName}' sorted by {sortLabel}").replace('{count}', st.cards.length).replace('{libraryName}', my.lib.Name).replace('{sortLabel}', label)
        : $L('{count} genres sorted by {sortLabel}').replace('{count}', st.cards.length).replace('{sortLabel}', label)
    })
  }
  // The title, the library it's narrowed to and the count, centered on their baseline.
  const header = () => {
    const title = $L('Genres')
    const neon = neonOn()
    const parts = [
      neon
        ? { k: 'title', text: title, size: 42, font: displayFont('bold'), color: NEON.accent, spacing: 0.4, shadow: NEON.glow, w: textWidth(title, 42, 'neon-display-bold', 0.4), y: 24, gap: 0 }
        : { k: 'title', text: title, size: 42, font: uiFont('bold'), color: '#ffffff', spacing: -0.5, w: textWidth(title, 42, 'bold', -0.5), y: 24, gap: 0 },
    ]
    const muted = neon ? NEON.cyan : '#ffffff80'
    if (my.lib) parts.push({ k: 'sub', text: my.lib.Name, size: 18, font: fontFor(my.lib.Name), color: muted, w: textWidth(my.lib.Name, 18), y: 32, gap: 12 })
    const counter = `${st.cards.length} ${$L('genres')}`
    parts.push({ k: 'count', text: counter, size: 18, font: uiFont(), color: muted, w: textWidth(counter, 18), y: 32, gap: 16 })
    const total = parts.reduce((a, p) => a + p.gap + p.w, 0)
    let x = 960 - total / 2
    st.texts = parts.map((p) => {
      x += p.gap
      const out = { ...p, x }
      x += p.w
      return out
    })
    const ms = focusMs(200)
    st.controls = [
      roundButton('home', 'lib_home_plain', 862, 75, ms, neonOn() ? NEON.button : undefined),
      roundButton('sort', 'lib_sort_az', 934, 75, ms, neonOn() ? NEON.button : undefined),
      roundButton('settings', 'lib_settings_outline', 1006, 75, ms, neonOn() ? NEON.button : undefined),
    ]
  }
  const layout = () => {
    const [minW, minH] = ITEM_SIZES[my.size] || ITEM_SIZES.medium
    const g = virtualGridLayout(1880, minW, minH, 20)
    batch(() => {
      st.cols = g.columns
      st.tileW = g.stepX
      st.tileH = g.stepY
      st.opts = { cardW: g.itemWidth - 20, cardH: CARD_HEIGHTS[my.size] || 140, ms: focusMs(250), slide: slideMs(200), countFont: uiFont(), ...(neonOn() ? NEON.tile : {}) }
    })
  }
  const focusZone = () => {
    if (props.page && !props.page.active()) return
    if (st.panel && panelRef) return panelRef.setFocus()
    if (my.zone === 'grid' && grid) return grid.setFocus()
    my.zone = 'chrome'
    if (chromeRef) chromeRef.setFocus()
  }
  const openPanel = (which) => {
    if (which === 'sort') {
      const rows = [{ kind: 'title', label: $L('Sort & Filter') }, { kind: 'label', label: $L('Sort By') }]
      SORT_OPTIONS.forEach((o, i) => rows.push({ kind: 'radio', id: `genre-sort-option-${i}`, value: o.key, label: $L(o.label), selected: my.sort === o.key }))
      rows.push({ kind: 'end' })
      if (my.libraries.length) {
        rows.push({ kind: 'label', label: $L('Library') })
        rows.push({ kind: 'radio', id: 'genre-lib-all', value: '', label: $L('All Libraries'), selected: !my.lib })
        my.libraries.forEach((l, i) => rows.push({
          kind: 'radio', id: `genre-lib-${i}`, lib: l, label: my.unified && l._serverName ? `${l.Name} (${l._serverName})` : l.Name,
          selected: !!my.lib && my.lib.Id === l.Id,
        }))
      }
      st.panelRows = rows
    } else {
      st.panelRows = [
        { kind: 'header', label: $L('Genres') },
        { kind: 'title', label: $L('Settings') },
        { kind: 'setting', id: 'genres-settings-card-size', label: $L('Card size'), value: $L(capitalize(my.size)) },
      ]
    }
    st.panel = which
    focusZone()
  }
  const closePanel = () => {
    st.panel = ''
    focusZone()
  }
  const onSideSelect = (r) => {
    if (r.id === 'genres-settings-card-size') {
      my.size = cycleValue(CARD_SIZES, my.size)
      saveToStorage('genres_cardSize', my.size)
      layout()
      openPanel('settings')
      return
    }
    if (r.id.indexOf('genre-sort-option-') === 0) {
      my.sort = r.value
      saveToStorage('genres_sortOrder', r.value)
      show()
    } else {
      my.lib = r.lib || null
      load()
    }
    st.panel = ''
    later(() => {
      my.zone = st.cards.length ? 'grid' : 'chrome'
      focusZone()
    }, 100)
  }
  // A genre merged across servers goes to GenreBrowse, which asks every server, and one from another
  // server opens the library screen on that server alone.
  const onGridSelect = (card) => {
    const g = card.raw
    if (g._unifiedGenre) return router.to(`/genrebrowse/${g.id}`, { genre: g })
    if (g._serverUrl) {
      return router.to('/library/all', { genreName: g.name, library: { Id: null, Name: g.name, ...serverOf(g) } })
    }
    router.to(my.lib ? `/library/${my.lib.Id}` : '/library/all', { genreName: g.name })
  }

  // Holding OK on a genre opens its menu, which has the genre's artwork on it for an admin.
  const hold = menuHold(
    () => {
      const g = grid && grid.current() && grid.current().raw
      return g ? { ...g, Id: g.id, Name: g.name, Type: 'Genre' } : null
    },
    () => grid && grid.current() && onGridSelect(grid.current()),
  )

  onMount(async () => {
    my.sort = (await getFromStorage('genres_sortOrder')) || 'name-asc'
    my.size = (await getFromStorage('genres_cardSize')) || 'medium'
    my.unified = await unifiedMode()
    await fontsReady()
    if (props.id) my.lib = (store.libraries || []).find((l) => l.Id === props.id) || null
    header()
    layout()
    loadLibraries()
    load()
    if (chromeRef) chromeRef.select('home')
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
          if (chromeRef) chromeRef.select('home')
          focusZone()
        }
        return true
      }}
      onBack={() => {
        if (st.panel) closePanel()
        else router.back()
        return true
      }}
    >
      <view width={1920} height={1080} colorTl="#101010" colorTr="#161616" colorBl="#171717" colorBr="#171717" />
      <view>
        <For each={texts.keys()}>
          {(k) => {
            const t = texts.item(k)
            return (
              <text fontFamily={t().font} fontSize={t().size} x={t().x} y={t().y} lineHeight={33} color={t().color} letterSpacing={t().spacing || 0} textShadow={t().shadow}>
                {t().text}
              </text>
            )
          }}
        </For>
      </view>
      <view x={20} y={147} width={1880} height={VIEW_H} clipping onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
        <Show when={st.cards.length}>
          <Kept gone={() => (grid = null)}>
            <Grid
              ref={(n) => (grid = n)}
              items={st.cards}
              tile={GenreTile}
              cols={st.cols}
              tileW={st.tileW}
              tileH={st.tileH}
              gap={20}
              viewH={VIEW_H}
              opts={st.opts}
              slideMs={st.opts.slide}
              onGridSelect={onGridSelect}
            />
          </Kept>
        </Show>
      </view>
      <view>
        <Show when={st.loading}>
          <Spinner x={928} y={556} size={64} />
        </Show>
      </view>
      <view>
        <Show when={st.emptyText}>
          <text fontFamily={plainFont} fontSize={24} x={960} y={574} mountX={0.5} color="#ffffff80">
            {st.emptyText}
          </text>
        </Show>
      </view>
      <text fontFamily={plainFont} fontSize={14} x={48} y={1037} lineHeight={33} color={neonOn() ? NEON.cyan : '#ffffff59'}>
        {st.statusText}
      </text>
      <Chrome
        ref={(n) => (chromeRef = n)}
        controls={st.controls}
        onChromeEdge={(dir) => {
          if (dir === 'down' && st.cards.length) {
            my.zone = 'grid'
            focusZone()
          }
          return true
        }}
        onChromeSelect={(id) => (id === 'home' ? goHome() : openPanel(id))}
      />
      <view>
        <Show when={st.panel}>
          <Kept gone={() => (panelRef = null)}>
            <SidePanel ref={(n) => (panelRef = n)} rows={st.panelRows} neon={neonOn()} onSideSelect={onSideSelect} />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
