import $L from '../../../../services/i18n.js'
import { For, Show, createMemo, createSelector, onCleanup } from 'solid-js'
import MusicCard from '../MusicCard.jsx'
import MusicTrackList, { trackRows, trackListHeight } from '../MusicTrackList.jsx'
import HeroButtons, { heroButtons } from '../HeroButtons.jsx'
import MusicFilterPanel from '../MusicFilterPanel.jsx'
import { ScreenHeader, pointerIn, wholeInView, clampText, headerHeight, layoutControls, cardSide, contentWidth, gridRows, rowIndexOf, gridMove, keepInView } from '../screenParts.jsx'
import { lineY } from '../../books/bookGrid.js'
import { wrapLines } from '../../details/measure.js'
import { Kept } from '../../library/pageKit.js'
import { uiFont, fontFor } from '../../../text.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { formatDuration } from '../../../../utils/helpers.js'
import { countLabel, itemsOf, mediaCard, openMusicItem, playQueue } from '../../../../pages/Music/music.js'
import { shuffled } from '../../../../utils/shuffled.js'

const COLUMNS = 6
const GAP = 30
const PAGE = 100
const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,Genres,AlbumArtist,AlbumArtists,ChildCount'
const VIEW_H = 999
const MARGIN = 600

const albumSorts = () => [
  { id: 'recent', label: $L('Recently Added'), SortBy: 'DateCreated,SortName', SortOrder: 'Descending' },
  { id: 'name', label: $L('A to Z'), SortBy: 'SortName', SortOrder: 'Ascending' },
  { id: 'year', label: $L('Year'), SortBy: 'ProductionYear,PremiereDate,SortName', SortOrder: 'Descending' },
  { id: 'artist', label: $L('Artist'), SortBy: 'AlbumArtist,SortName', SortOrder: 'Ascending' },
]

const sumTicks = (tracks) => tracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0)

function Panel(props) {
  const look = () => props.look
  const p = () => props.panel
  return (
    <view x={props.x} y={props.y} width={p().w} height={p().h}>
      <view x={p().caretX} y={-14} width={28} height={14} clipping>
        <view x={14} y={14} width={20} height={20} rotation={Math.PI / 4} mountX={0.5} mountY={0.5} color={look().os(0.06)} />
      </view>
      <view width={p().w} height={p().h} borderRadius={24} color={look().os(0.06)} />
      <text fontFamily={uiFont('bold')} fontSize={18} letterSpacing={1} x={36} y={30 + lineY(0, 33, 18)} color={look().accent}>
        {p().eyebrow}
      </text>
      <text fontFamily={p().titleFont} fontSize={40} lineHeight={44} maxLines={2} maxWidth={495} x={36} y={30 + 41 + 1} color={look().onSurface}>
        {p().title}
      </text>
      <text fontFamily={p().metaFont} fontSize={21} maxWidth={495} maxLines={1} x={36} y={p().metaY} color={look().os(0.75)}>
        {p().meta}
      </text>
      <text fontFamily={uiFont()} fontSize={19} maxWidth={495} maxLines={1} x={36} y={p().subY} color={look().os(0.65)}>
        {p().subMeta}
      </text>
      <HeroButtons x={36} y={p().buttonsY} buttons={p().buttons} focus={props.bfocus} look={look()} onPointerButton={props.onPointerButton} />
      <view>
        <Show when={p().rows}>
          <MusicTrackList x={579} y={30} rows={p().rows} focus={props.tfocus} w={p().w - 615} columns={2} look={look()} onPointerTrack={props.onPointerTrack} />
        </Show>
      </view>
      <view>
        <Show when={!p().rows}>
          <text fontFamily={uiFont()} fontSize={20} x={591} y={30 + 12 + 5.8} color={look().os(0.5)}>
            {$L('Loading...')}
          </text>
        </Show>
      </view>
    </view>
  )
}

// Selecting an album opens it in a panel under its row rather than leaving the screen.
export default function AlbumsScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const side = cardSide(COLUMNS, 120, GAP)
  const sorts = albumSorts()
  const st = reactive({
    sortId: 'recent',
    genre: null,
    genres: null,
    showGenres: false,
    items: [],
    total: 0,
    loaded: false,
    complete: false,
    openIndex: -1,
    tracks: null,
    zone: 'grid',
    hcur: 0,
    cur: 0,
    pb: 0,
    pt: 0,
    scrollY: 0,
    active: false,
  })
  const my = { gen: 0, next: 0, busy: false, landed: false, alive: true }
  onCleanup(() => (my.alive = false))
  let root
  let genresPanel = null

  const controls = createMemo(() => {
    const filter = { kind: 'pill', id: 'filter', label: st.genre ? st.genre.Name : $L('Filter'), icon: 'core_filter_list', accentIcon: !!st.genre }
    return [{ kind: 'tabs', tabs: sorts, active: st.sortId }, filter]
  })
  const stops = createMemo(() => layoutControls(controls()).stops)
  const headerH = createMemo(() => headerHeight(controls()))
  const on = () => st.active && !st.showGenres
  const headFocus = () => (on() && st.zone === 'header' ? st.hcur : -1)
  const countText = () => (st.total > 0 ? countLabel(st.total, $L('1 album'), $L('{count} albums')) : '')
  const rows = createMemo(() => gridRows(st.items.length, COLUMNS))
  const openRow = () => (st.openIndex >= 0 ? rowIndexOf(rows(), st.openIndex) : -1)
  const panel = createMemo(() => {
    const album = st.openIndex >= 0 ? st.items[st.openIndex] : null
    if (!album) return null
    const tracks = st.tracks
    const artist = album.AlbumArtist || (album.AlbumArtists && album.AlbumArtists[0] && album.AlbumArtists[0].Name) || ''
    const count = tracks ? tracks.length : album.ChildCount
    const ticks = tracks && tracks.length ? sumTicks(tracks) : album.RunTimeTicks
    const meta = [artist, album.ProductionYear ? String(album.ProductionYear) : ''].filter(Boolean).join(' · ')
    const subMeta = [count > 0 ? countLabel(count, $L('1 track'), $L('{count} tracks')) : '', formatDuration(ticks), album.Genres && album.Genres[0]]
      .filter(Boolean)
      .join(' · ')
    const lines = Math.max(1, Math.min(2, wrapLines(album.Name || '', 40, 'bold', 495).length))
    let y = 30 + 33 + 8 + lines * 44
    const metaTop = meta ? y + 6 : y
    if (meta) y += 6 + 33
    const subTop = subMeta ? y + 6 : y
    if (subMeta) y += 6 + 33
    const buttonsY = y + 28
    const infoH = buttonsY + 52 - 30
    const trackList = tracks ? trackRows(tracks, { mode: 'numbered' }) : null
    const tracksH = trackList ? trackListHeight(trackList, 2) : 12 + 33
    const row = rows()[openRow()]
    const start = row ? row.start : 0
    return {
      album,
      eyebrow: $L('Album').toUpperCase(),
      title: clampText(album.Name || '', 40, 'bold', 495, 2),
      titleFont: fontFor(album.Name || '', 'bold'),
      meta,
      metaFont: fontFor(meta),
      metaY: lineY(metaTop, 33, 21),
      subMeta,
      subY: lineY(subTop, 33, 19),
      buttonsY,
      buttons: heroButtons([
        { id: 'play', label: $L('Play'), icon: 'core_play_arrow', primary: true },
        { id: 'shuffle', label: $L('Shuffle'), icon: 'core_shuffle' },
        { id: 'open', label: $L('Open Album'), icon: 'core_album' },
      ]),
      rows: trackList,
      h: 60 + Math.max(infoH, tracksH),
      caretX: (st.openIndex - start) * (side + GAP) + side / 2 - 14,
      w: vw - 120,
    }
  })
  const rowTops = createMemo(() => {
    const tops = []
    let y = 24
    const open = openRow()
    const pn = panel()
    rows().forEach((row, r) => {
      tops.push(y)
      y += side + 104
      if (r === open && pn) y += pn.h + 30
    })
    return { tops, end: y + 60 }
  })
  const panelY = () => (openRow() >= 0 ? rowTops().tops[openRow()] + side + 104 : 0)
  // A card model is reused while its album stays the same.
  const models = createMemo((prev) => st.items.map((it, i) => (prev && prev[i] && prev[i].raw === it ? prev[i] : mediaCard(it, i))))
  const cards = createMemo(() => {
    const tops = rowTops().tops
    const top = st.scrollY - MARGIN
    const bottom = st.scrollY + VIEW_H + MARGIN
    const all = models()
    const out = []
    rows().forEach((row, r) => {
      if (tops[r] + side + 86 < top || tops[r] > bottom) return
      for (let i = row.start; i < row.end; i++) out.push(all[i])
    })
    return out
  })
  const gridSel = createSelector(() => (on() && st.zone === 'grid' ? st.cur : -1))
  const bFocus = () => (on() && st.zone === 'pbuttons' ? st.pb : -1)
  const tFocus = () => (on() && st.zone === 'ptracks' ? st.pt : -1)
  const genreOptions = () => [{ id: null, label: $L('All Genres') }].concat((st.genres || []).map((g) => ({ id: g.Id, label: g.Name, raw: g })))

  const fetchPage = async (start) => {
    const sort = sorts.find((s) => s.id === st.sortId)
    const res = await api.getItems({
      ParentId: props.library && props.library.Id,
      IncludeItemTypes: 'MusicAlbum',
      Recursive: true,
      SortBy: sort.SortBy,
      SortOrder: sort.SortOrder,
      GenreIds: st.genre ? st.genre.Id : undefined,
      Fields: FIELDS,
      StartIndex: start,
      Limit: PAGE,
    })
    return { items: itemsOf(res), total: (res && res.TotalRecordCount) || itemsOf(res).length }
  }
  const reload = async () => {
    const gen = ++my.gen
    st.items = []
    st.loaded = false
    st.complete = false
    st.openIndex = -1
    st.tracks = null
    st.scrollY = 0
    try {
      const page = await fetchPage(0)
      if (gen !== my.gen || !my.alive) return
      st.total = page.total
      st.items = page.items
      my.next = PAGE
    } catch (e) {
      if (gen !== my.gen || !my.alive) return
      st.total = 0
    }
    st.loaded = true
    st.complete = st.items.length >= st.total
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
        st.complete = st.items.length >= st.total || !page.items.length
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
    else st.zone = 'header'
  }
  const scrollTo = (top, bottom) => {
    const viewH = VIEW_H - headerH()
    st.scrollY = keepInView(st.scrollY, top, bottom, viewH, rowTops().end - viewH)
  }
  const focusIndex = (i) => {
    st.zone = 'grid'
    st.cur = i
    const r = rowIndexOf(rows(), i)
    const top = rowTops().tops[r]
    scrollTo(top, top + side + 86)
    if (r >= rows().length - 3) loadMore()
  }
  const openAlbum = async (i) => {
    if (st.openIndex === i) {
      st.openIndex = -1
      return
    }
    st.tracks = null
    st.openIndex = i
    const album = st.items[i]
    try {
      const res = await api.getAlbumTracks(album.Id)
      if (st.openIndex === i && my.alive) st.tracks = itemsOf(res)
    } catch (e) {
      if (st.openIndex === i && my.alive) st.tracks = []
    }
  }
  const focusPanelButtons = () => {
    st.zone = 'pbuttons'
    st.pb = 0
    scrollTo(panelY() + panel().buttonsY, panelY() + panel().buttonsY + 52)
  }
  const focusPanelTrack = (i) => {
    st.zone = 'ptracks'
    st.pt = i
    const y = panelY() + 30 + Math.floor(i / 2) * 51
    scrollTo(y, y + 51)
  }
  // The Magic Remote's cursor (app/pointer.js): the header's stops and the open album's buttons and
  // tracks take focus on hover; an album in full view too, one the grid would scroll to on a click.
  const point = pointerIn(st, my, props)
  const cardShows = (i) => {
    const top = rowTops().tops[rowIndexOf(rows(), i)] || 0
    return wholeInView(st.scrollY, VIEW_H - headerH(), top, top + side + 86)
  }
  const pointCard = (i) => {
    if (st.showGenres || !cardShows(i) || (on() && st.zone === 'grid' && st.cur === i)) return
    point(() => focusIndex(i))
  }
  const clickCard = (i) => {
    if (st.showGenres || !st.items[i]) return false
    point(() => focusIndex(i))
    return true
  }
  const focusBelow = () => {
    const below = gridMove(rows(), openRow(), st.openIndex, 'down')
    if (below != null) focusIndex(below)
  }
  const closeGenres = () => {
    st.zone = 'header'
    st.hcur = stops().length - 1
    root.setFocus()
    st.showGenres = false
  }
  const openGenres = async () => {
    st.showGenres = true
    if (genresPanel) genresPanel.setFocus()
    if (st.genres) return
    try {
      const res = await api.getMusicGenres({ ParentId: props.library && props.library.Id, IncludeItemTypes: 'MusicAlbum' })
      if (my.alive) st.genres = itemsOf(res)
    } catch (e) {
      if (my.alive) st.genres = []
    }
  }
  const play = (list, at = 0) => playQueue(list || [], at)

  reload()

  return (
    <view
      ref={(n) => {
        root = n
        // Down from the strip does its own landing, so land() doesn't run on the focus that follows.
        n.enterFromStrip = () => {
          my.landed = true
          st.zone = 'header'
          st.hcur = 0
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
        const z = st.zone
        if (z === 'header') {
          if (st.hcur === 0) props.onEdgeLeft()
          else st.hcur = st.hcur - 1
        } else if (z === 'grid') {
          const next = gridMove(rows(), rowIndexOf(rows(), st.cur), st.cur, 'left')
          if (next != null) focusIndex(next)
          else props.onEdgeLeft()
        } else if (z === 'pbuttons') {
          if (st.pb === 0) props.onEdgeLeft()
          else st.pb = st.pb - 1
        } else if (z === 'ptracks') {
          if (st.pt % 2 === 1) focusPanelTrack(st.pt - 1)
          else {
            st.zone = 'pbuttons'
            st.pb = 0
          }
        }
        return true
      }}
      onRight={() => {
        const z = st.zone
        if (z === 'header') st.hcur = Math.min(stops().length - 1, st.hcur + 1)
        else if (z === 'grid') {
          const next = gridMove(rows(), rowIndexOf(rows(), st.cur), st.cur, 'right')
          if (next != null) focusIndex(next)
        } else if (z === 'pbuttons') {
          if (st.pb < 2) st.pb = st.pb + 1
          else if (panel().rows && panel().rows.length) focusPanelTrack(0)
        } else if (z === 'ptracks') {
          if (st.pt % 2 === 0 && st.pt + 1 < panel().rows.length) focusPanelTrack(st.pt + 1)
        }
        return true
      }}
      onUp={() => {
        const z = st.zone
        if (z === 'header') props.focusStrip()
        else if (z === 'grid') {
          const row = rowIndexOf(rows(), st.cur)
          if (row === 0) {
            st.zone = 'header'
            st.hcur = 0
          } else if (openRow() >= 0 && row === openRow() + 1) focusPanelButtons()
          else focusIndex(gridMove(rows(), row, st.cur, 'up'))
        } else if (z === 'pbuttons') focusIndex(st.openIndex)
        else if (z === 'ptracks') {
          if (st.pt >= 2) focusPanelTrack(st.pt - 2)
          else focusIndex(st.openIndex)
        }
        return true
      }}
      onDown={() => {
        const z = st.zone
        if (z === 'header') {
          if (st.items.length) focusIndex(0)
        } else if (z === 'grid') {
          const row = rowIndexOf(rows(), st.cur)
          if (openRow() >= 0 && row === openRow()) focusPanelButtons()
          else {
            const next = gridMove(rows(), row, st.cur, 'down')
            if (next != null) focusIndex(next)
          }
        } else if (z === 'pbuttons') focusBelow()
        else if (z === 'ptracks') {
          if (st.pt + 2 < panel().rows.length) focusPanelTrack(st.pt + 2)
          else focusBelow()
        }
        return true
      }}
      onEnter={() => {
        const z = st.zone
        if (z === 'header') {
          const stop = stops()[st.hcur]
          if (stop.id === 'filter') openGenres()
          else if (stop.id !== st.sortId) {
            st.sortId = stop.id
            reload()
          }
        } else if (z === 'grid') openAlbum(st.cur)
        else if (z === 'pbuttons') {
          const id = panel().buttons[st.pb].id
          if (id === 'play') play(st.tracks, 0)
          else if (id === 'shuffle') play(shuffled(st.tracks || []), 0)
          else openMusicItem(panel().album)
        } else if (z === 'ptracks') play(st.tracks, st.pt)
        return true
      }}
      onBack={() => {
        if (st.openIndex < 0) return false
        const i = st.openIndex
        focusIndex(i)
        st.openIndex = -1
        return true
      }}
    >
      <view y={headerH()} width={vw} height={VIEW_H - headerH()} clipping>
        <view y={-st.scrollY} width={vw} height={rowTops().end}>
          <view width={vw} height={rowTops().end}>
            <For each={cards()}>
              {(c) => (
                <MusicCard
                  x={60 + (c.idx % COLUMNS) * (side + GAP)}
                  y={rowTops().tops[Math.floor(c.idx / COLUMNS)] || 0}
                  card={c}
                  size={side}
                  look={look()}
                  focused={gridSel(c.idx)}
                  onPointerOver={() => pointCard(c.idx)}
                  onPointerClick={() => clickCard(c.idx)}
                />
              )}
            </For>
          </view>
          <view width={vw} height={rowTops().end}>
            <Show when={panel()}>
              <Panel
                x={60}
                y={panelY()}
                panel={panel()}
                look={look()}
                bfocus={bFocus()}
                tfocus={tFocus()}
                onPointerButton={(i) =>
                  point(() => {
                    st.zone = 'pbuttons'
                    st.pb = i
                  })
                }
                onPointerTrack={(i) =>
                  point(() => {
                    st.zone = 'ptracks'
                    st.pt = i
                  })
                }
              />
            </Show>
          </view>
        </view>
        <view>
          <Show when={st.complete && !st.items.length}>
            <text fontFamily={uiFont()} fontSize={20} x={vw / 2} y={48 + 5.8} mountX={0.5} color={look().os(0.5)}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
      <ScreenHeader
        title={$L('Albums')}
        count={countText()}
        controls={controls()}
        focus={headFocus()}
        look={look()}
        onPointerStop={(i) =>
          !st.showGenres &&
          point(() => {
            st.zone = 'header'
            st.hcur = i
          })
        }
      />
      <view>
        <Show when={st.showGenres}>
          <Kept gone={() => (genresPanel = null)}>
            <MusicFilterPanel
              ref={(n) => (genresPanel = n)}
              kind="genres"
              options={genreOptions()}
              picked={st.genre ? st.genre.Id : null}
              look={look()}
              onFilterPick={(option) => {
                st.genre = option ? option.raw : null
                closeGenres()
                my.landed = true
                reload()
              }}
              onFilterClose={closeGenres}
            />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
