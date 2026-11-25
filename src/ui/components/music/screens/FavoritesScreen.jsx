import $L from '../../../../services/i18n.js'
import { For, Show, createMemo, createSelector, onCleanup } from 'solid-js'
import MusicCard from '../MusicCard.jsx'
import MusicTrackList, { trackRows, trackRowHeight } from '../MusicTrackList.jsx'
import { ScreenHeader, pointerIn, wholeInView, headerHeight, layoutControls, cardSide, contentWidth, gridRows, rowIndexOf, gridMove, keepInView } from '../screenParts.jsx'
import { uiFont } from '../../../text.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { filterAudioPlaylists, PLAYLIST_FIELDS, itemsOf, mediaCard, musicArtUrl, openMusicItem, playQueue, songSubtitle } from '../../../../pages/Music/music.js'

const PAGE = 100
const GAP = 30
const VIEW_H = 999
const MARGIN = 600
const LAYOUT = {
  songs: { columns: 2 },
  albums: { columns: 6, circle: false },
  artists: { columns: 7, circle: true },
  playlists: { columns: 6, circle: false },
}
const favoriteTabs = () => [
  { id: 'songs', label: $L('Songs') },
  { id: 'albums', label: $L('Albums') },
  { id: 'artists', label: $L('Artists') },
  { id: 'playlists', label: $L('Playlists') },
]

export default function FavoritesScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const st = reactive({ counts: null, tab: null, items: [], loaded: false, complete: false, zone: 'grid', hcur: 0, cur: 0, scrollY: 0, active: false })
  const my = { gen: 0, next: 0, total: 0, busy: false, landed: false, alive: true }
  onCleanup(() => (my.alive = false))

  const tabs = createMemo(() => {
    if (!st.counts) return []
    return favoriteTabs()
      .filter((t) => st.counts[t.id] > 0)
      .map((t) => ({ id: t.id, label: `${t.label} ${st.counts[t.id]}` }))
  })
  const extra = createMemo(() => (tabs().length ? { tabs: tabs(), active: st.tab } : null))
  const controls = createMemo(() => {
    if (st.tab !== 'songs') return []
    return [
      { kind: 'pill', id: 'play', label: $L('Play'), icon: 'core_play_arrow', primary: true },
      { kind: 'pill', id: 'shuffle', label: $L('Shuffle'), icon: 'core_shuffle' },
    ]
  })
  const stops = createMemo(() => tabs().map((t) => ({ id: t.id, tab: true })).concat(layoutControls(controls()).stops))
  const headerH = createMemo(() => headerHeight(controls(), extra()))
  const layout = () => LAYOUT[st.tab] || LAYOUT.albums
  const side = () => cardSide(layout().columns, 120, GAP)
  const rows = createMemo(() => gridRows(st.items.length, layout().columns))
  const songRows = createMemo(() => (st.tab === 'songs' ? trackRows(st.items, { mode: 'art', artFor: (t) => musicArtUrl(t, 120), subtitleFor: songSubtitle }) : []))
  const models = createMemo((prev) =>
    st.tab === 'songs' ? [] : st.items.map((it, i) => (prev && prev[i] && prev[i].raw === it ? prev[i] : mediaCard(it, i, layout().circle)))
  )
  const rowStep = createMemo(() => {
    if (st.tab === 'songs') return trackRowHeight(songRows())
    const info = models().some((c) => c.subtitle) ? 86 : 53
    return side() + info + 18
  })
  const cards = createMemo(() => {
    const cols = layout().columns
    return models().filter((c) => {
      const y = 24 + Math.floor(c.idx / cols) * rowStep()
      return y + rowStep() >= st.scrollY - MARGIN && y <= st.scrollY + VIEW_H + MARGIN
    })
  })
  const contentH = () => 24 + rows().length * rowStep() + 60
  const gridFocus = () => (st.active && st.zone === 'grid' ? st.cur : -1)
  const gridSel = createSelector(gridFocus)

  const fetchPlaylists = async (start) => {
    // The counts already read the first page when the screen opened.
    if (start === 0 && my.firstPlaylists) {
      const first = my.firstPlaylists
      my.firstPlaylists = null
      return first
    }
    const res = await api.getItems({
      Recursive: true,
      IncludeItemTypes: 'Playlist',
      Fields: `${PLAYLIST_FIELDS},CumulativeRunTimeTicks`,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      IsFavorite: true,
      StartIndex: start,
      Limit: PAGE,
    })
    return { items: await filterAudioPlaylists(itemsOf(res)), total: (res && res.TotalRecordCount) || 0 }
  }
  const fetchPage = async (start) => {
    const id = props.library && props.library.Id
    const base = { ParentId: id, Recursive: true, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: start, Limit: PAGE }
    let res
    if (st.tab === 'songs') res = await api.getItems({ ...base, IncludeItemTypes: 'Audio' })
    else if (st.tab === 'albums') res = await api.getItems({ ...base, IncludeItemTypes: 'MusicAlbum', Fields: 'PrimaryImageAspectRatio,ProductionYear,AlbumArtist' })
    else if (st.tab === 'artists') {
      res = await api.getArtists({ ParentId: id, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName', StartIndex: start, Limit: PAGE })
    } else if (st.tab === 'playlists') return fetchPlaylists(start)
    return { items: itemsOf(res), total: (res && res.TotalRecordCount) || itemsOf(res).length }
  }
  const setTab = async (tab) => {
    const gen = ++my.gen
    st.tab = tab
    st.items = []
    st.loaded = false
    st.complete = false
    st.scrollY = 0
    if (!tab) {
      st.loaded = true
      if (st.active && !my.landed) land()
      return
    }
    try {
      const page = await fetchPage(0)
      if (gen !== my.gen || !my.alive) return
      st.items = page.items
      my.total = page.total
      my.next = PAGE
    } catch (e) {
      if (gen !== my.gen || !my.alive) return
    }
    st.loaded = true
    st.complete = st.items.length >= (my.total || 0)
    if (st.active && !my.landed) land()
  }
  const loadMore = async () => {
    if (my.busy || !st.loaded || st.complete) return
    my.busy = true
    const gen = my.gen
    try {
      const page = await fetchPage(my.next)
      if (gen === my.gen && my.alive) {
        st.items = st.items.concat(page.items)
        my.next += PAGE
        st.complete = st.items.length >= page.total || !page.items.length
      }
    } catch (e) {
      if (gen === my.gen && my.alive) st.complete = true
    }
    my.busy = false
  }
  const land = () => {
    if (!st.loaded) return
    my.landed = true
    if (st.items.length) focusIndex(0)
    else if (stops().length) st.zone = 'header'
    else props.focusStrip()
  }
  const focusIndex = (i) => {
    st.zone = 'grid'
    st.cur = i
    const r = rowIndexOf(rows(), i)
    const top = 24 + r * rowStep()
    const viewH = VIEW_H - headerH()
    st.scrollY = keepInView(st.scrollY, top, top + rowStep() - (st.tab === 'songs' ? 0 : 18), viewH, contentH() - viewH)
    if (r >= rows().length - 3) loadMore()
  }
  // The Magic Remote's cursor (app/pointer.js): the header's stops take focus on hover, and an item
  // too while in full view; one the grid would scroll to takes it on a click.
  const point = pointerIn(st, my, props)
  const pointItem = (i, click) => {
    const top = 24 + rowIndexOf(rows(), i) * rowStep()
    const bottom = top + rowStep() - (st.tab === 'songs' ? 0 : 18)
    if (!click && (!wholeInView(st.scrollY, VIEW_H - headerH(), top, bottom) || (st.active && st.zone === 'grid' && st.cur === i))) return false
    point(() => focusIndex(i))
    return click
  }
  const move = (direction) => {
    const next = gridMove(rows(), rowIndexOf(rows(), st.cur), st.cur, direction)
    if (next != null) focusIndex(next)
    return next
  }
  ;(async () => {
    const id = props.library && props.library.Id
    const counting = { ParentId: id, Recursive: true, IsFavorite: true, Limit: 0 }
    const total = (res) => (res && res.TotalRecordCount) || 0
    const [songs, albums, artists, playlists] = await Promise.all([
      api.getItems({ ...counting, IncludeItemTypes: 'Audio' }).catch(() => null),
      api.getItems({ ...counting, IncludeItemTypes: 'MusicAlbum' }).catch(() => null),
      api.getArtists({ ParentId: id, IsFavorite: true, Limit: 0 }).catch(() => null),
      fetchPlaylists(0).catch(() => null),
    ])
    if (!my.alive) return
    my.firstPlaylists = playlists
    const counts = {
      songs: total(songs),
      albums: total(albums),
      artists: total(artists),
      playlists: !playlists ? 0 : playlists.total <= PAGE ? playlists.items.length : playlists.total,
    }
    st.counts = counts
    const requested = props.screen && props.screen.tab
    const first = favoriteTabs().find((t) => counts[t.id] > 0)
    setTab(requested && counts[requested] > 0 ? requested : first ? first.id : null)
  })()

  return (
    <view
      ref={(n) => {
        // Down from the strip does its own landing, so land() doesn't run on the focus that follows.
        n.enterFromStrip = () => {
          if (stops().length) {
            st.zone = 'header'
            st.hcur = 0
          } else if (st.items.length) focusIndex(0)
          else return false
          my.landed = true
          n.setFocus()
        }
        props.ref(n)
      }}
      width={vw}
      height={VIEW_H}
      onFocusChanged={(has) => {
        st.active = has
        if (has && !my.landed) land()
      }}
      onLeft={() => {
        if (st.zone === 'header') {
          if (st.hcur === 0) props.onEdgeLeft()
          else st.hcur = st.hcur - 1
        } else if (move('left') == null) props.onEdgeLeft()
        return true
      }}
      onRight={() => {
        if (st.zone === 'header') st.hcur = Math.min(stops().length - 1, st.hcur + 1)
        else move('right')
        return true
      }}
      onUp={() => {
        if (st.zone === 'header') props.focusStrip()
        else if (rowIndexOf(rows(), st.cur) === 0) {
          if (stops().length) {
            st.zone = 'header'
            st.hcur = 0
          } else props.focusStrip()
        } else move('up')
        return true
      }}
      onDown={() => {
        if (st.zone === 'header') {
          if (st.items.length) focusIndex(0)
        } else move('down')
        return true
      }}
      onEnter={() => {
        if (st.zone === 'header') {
          const stop = stops()[st.hcur]
          if (!stop) return true
          const base = { ParentId: props.library && props.library.Id, IncludeItemTypes: 'Audio', IsFavorite: true, Recursive: true, Limit: 300, Fields: 'MediaSources,MediaStreams' }
          if (stop.tab) {
            if (stop.id !== st.tab) setTab(stop.id)
          } else if (stop.id === 'play') api.getItems({ ...base, SortBy: 'SortName' }).then((res) => playQueue(itemsOf(res), 0)).catch(() => {})
          else if (stop.id === 'shuffle') api.getItems({ ...base, SortBy: 'Random' }).then((res) => playQueue(itemsOf(res), 0)).catch(() => {})
          return true
        }
        if (st.tab === 'songs') playQueue(st.items, st.cur)
        else if (st.items[st.cur]) openMusicItem(st.items[st.cur])
        return true
      }}
    >
      <view y={headerH()} width={vw} height={VIEW_H - headerH()} clipping>
        <view y={-st.scrollY} width={vw} height={contentH()}>
          <view width={vw} height={contentH()}>
            <For each={cards()}>
              {(c) => (
                <MusicCard
                  x={60 + (c.idx % layout().columns) * (side() + GAP)}
                  y={24 + Math.floor(c.idx / layout().columns) * rowStep()}
                  card={c}
                  size={side()}
                  look={look()}
                  focused={gridSel(c.idx)}
                  onPointerOver={() => pointItem(c.idx, false)}
                  onPointerClick={() => pointItem(c.idx, true)}
                />
              )}
            </For>
          </view>
          <view width={vw} height={contentH()}>
            <Show when={st.tab === 'songs'}>
              <MusicTrackList
                x={60}
                y={24}
                rows={songRows()}
                focus={gridFocus()}
                w={vw - 120}
                columns={2}
                look={look()}
                view={[st.scrollY - 24 - MARGIN, st.scrollY - 24 + VIEW_H + MARGIN]}
                onPointerTrack={(i) => pointItem(i, false)}
                onPointerTrackClick={(i) => pointItem(i, true)}
              />
            </Show>
          </view>
        </view>
        <view>
          <Show when={st.counts && !st.tab}>
            <text fontFamily={uiFont()} fontSize={20} x={vw / 2} y={48 + 5.8} mountX={0.5} color={look().os(0.5)}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
      <ScreenHeader
        title={$L('Favorites')}
        controls={controls()}
        extra={extra()}
        focus={st.active && st.zone === 'header' ? st.hcur : -1}
        look={look()}
        onPointerStop={(i) =>
          point(() => {
            st.zone = 'header'
            st.hcur = i
          })
        }
      />
    </view>
  )
}
