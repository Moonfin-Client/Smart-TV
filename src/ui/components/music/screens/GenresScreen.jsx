import $L from '../../../../services/i18n.js'
import { For, Show, createMemo, createSelector, onCleanup } from 'solid-js'
import MusicCard from '../MusicCard.jsx'
import { ScreenHeader, pointerIn, wholeInView, headerHeight, keepInView, contentWidth } from '../screenParts.jsx'
import { lineY } from '../../books/bookGrid.js'
import { uiFont, fontFor, textWidth } from '../../../text.js'
import { hex } from '../../../color.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { TILE_COLORS, countLabel, itemsOf, mediaCard, openMusicItem, playQueue } from '../../../../pages/Music/music.js'

const SHELF_PAGE = 20
const STRIDE = 290
const CARD = 176
const CARD_STEP = CARD + 24
const SHELF_X = 60 + 345 + 33
const ALBUM_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,AlbumArtist'
const NONE = '#00000000'
const BOXES = [0, 1, 2, 3, 4, 5, 6].map((i) => SHELF_X + i * CARD_STEP)

const albumCount = (g) => (g.AlbumCount != null ? g.AlbumCount : g.ChildCount != null ? g.ChildCount : null)
const byName = (a, b) => (a.SortName || a.Name || '').localeCompare(b.SortName || b.Name || '')

function Station(props) {
  const look = () => props.look
  const r = () => props.row
  const chip = $L('Shuffle')
  const chipW = Math.ceil(15 + 30 + 9 + textWidth(chip, 21, 'bold') + 21)
  return (
    <view x={60} y={10} width={345} height={240} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick}>
      <view x={-3} y={-3} width={351} height={246} borderRadius={27} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view width={345} height={240} borderRadius={24} color={r().color} />
      <text fontFamily={r().nameFont} fontSize={36} x={27} y={24 + 1.2} maxWidth={291} maxLines={1} color="#ffffffff">
        {r().name}
      </text>
      <view>
        <Show when={r().meta}>
          <text fontFamily={uiFont()} fontSize={21} x={27} y={24 + 41.4 + 3 + 5.6} color="#ffffffff" alpha={0.85}>
            {r().meta}
          </text>
        </Show>
      </view>
      <view x={27} y={162} width={chipW} height={54} borderRadius={27} color="#0000004d">
        <view x={15} y={12} width={30} height={30} src="icons/core_shuffle.webp" color="#ffffffff" />
        <text fontFamily={uiFont('bold')} fontSize={21} x={54} y={lineY((54 - 33) / 2, 33, 21)} color="#ffffffff">
          {chip}
        </text>
      </view>
    </view>
  )
}

function GenreRow(props) {
  const look = () => props.look
  const r = () => props.row
  const sel = createSelector(() => props.focus - 1)
  const cards = createMemo(() => {
    const sx = props.sx
    return r().cards.filter((c) => {
      const x = SHELF_X + c.idx * CARD_STEP - sx
      return x + CARD > -400 && x < props.vw + 400
    })
  })
  return (
    <view y={r().y} width={props.vw} height={260}>
      <view y={-7} width={props.vw} height={274} clipping>
        <view y={7} width={props.vw} height={260}>
          <view>
            <Show when={r().loading}>
              <For each={BOXES}>{(x) => <view x={x} y={10} width={CARD} height={CARD} borderRadius={12} color={look().os(0.06)} />}</For>
            </Show>
          </view>
          <view x={-props.sx} width={SHELF_X + r().cards.length * CARD_STEP + 60} height={260}>
            <For each={cards()}>
              {(cd) => (
                <MusicCard
                  x={SHELF_X + cd.idx * CARD_STEP}
                  y={-1}
                  card={cd}
                  size={CARD}
                  look={look()}
                  focused={sel(cd.idx)}
                  pointerRing={12}
                  onPointerClick={() => props.onPointerCol(cd.idx + 1, true)}
                />
              )}
            </For>
          </view>
        </view>
      </view>
      <Station
        row={r()}
        look={look()}
        focused={props.focus === 0}
        onPointerOver={() => props.onPointerCol(0, false)}
        onPointerClick={() => props.onPointerCol(0, true)}
      />
    </view>
  )
}

export default function GenresScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const st = reactive({ genres: null, byAlbums: true, shelves: {}, zone: 'rows', row: 0, lastCol: {}, shelfX: {}, scrollY: 0, active: false })
  const my = { landed: false, loading: {}, alive: true }
  onCleanup(() => (my.alive = false))

  const counted = () => !!st.genres && st.genres.some((g) => albumCount(g) != null)
  const sorted = createMemo(() => {
    if (!st.genres) return []
    const list = st.genres.slice()
    if (counted() && st.byAlbums) list.sort((a, b) => (albumCount(b) || 0) - (albumCount(a) || 0) || byName(a, b))
    else list.sort(byName)
    return list
  })
  const controls = createMemo(() => (counted() ? [{ kind: 'pill', id: 'sort', label: st.byAlbums ? $L('Most Albums') : $L('A to Z'), icon: 'core_sort' }] : []))
  const headerH = createMemo(() => headerHeight(controls()))
  const countText = () => (sorted().length ? countLabel(sorted().length, $L('1 genre'), $L('{count} genres')) : '')
  // A row model is reused while its genre and its shelf stay the same.
  const rows = createMemo((prev) => {
    const old = {}
    ;(prev || []).forEach((r) => (old[r.k] = r))
    return sorted().map((g, i) => {
      const shelf = st.shelves[g.Id]
      const was = old[g.Id]
      if (was && was.i === i && was.shelf === shelf) return was
      const count = albumCount(g)
      return {
        k: g.Id,
        i,
        raw: g,
        shelf,
        y: 30 + i * STRIDE,
        name: g.Name || '',
        nameFont: fontFor(g.Name || '', 'bold'),
        meta: count > 0 ? countLabel(count, $L('1 album'), $L('{count} albums')) : '',
        color: TILE_COLORS[i % TILE_COLORS.length] + 'ff',
        loading: !shelf,
        cards: shelf ? shelf.items.map((it, n) => mediaCard(it, n)) : [],
      }
    })
  })
  const visibleRows = createMemo(() => {
    const viewH = 999 - headerH()
    return rows().filter((r) => r.y + 260 >= st.scrollY - STRIDE && r.y <= st.scrollY + viewH + STRIDE)
  })
  const contentH = () => 30 + sorted().length * STRIDE + 60

  const loadShelf = async (g) => {
    const key = g.Id
    const shelf = st.shelves[key]
    if (my.loading[key] || (shelf && shelf.items.length >= shelf.total)) return
    my.loading[key] = true
    try {
      const res = await api.getItems({
        ParentId: props.library && props.library.Id,
        IncludeItemTypes: 'MusicAlbum',
        GenreIds: key,
        Recursive: true,
        SortBy: 'DateCreated,SortName',
        SortOrder: 'Descending',
        Fields: ALBUM_FIELDS,
        StartIndex: shelf ? shelf.items.length : 0,
        Limit: SHELF_PAGE,
      })
      if (!my.alive) return
      const items = ((st.shelves[key] && st.shelves[key].items) || []).concat(itemsOf(res))
      st.shelves = { ...st.shelves, [key]: { items, total: res && res.TotalRecordCount != null ? res.TotalRecordCount : items.length } }
    } catch (e) {
      if (!my.alive) return
      const items = (st.shelves[key] && st.shelves[key].items) || []
      st.shelves = { ...st.shelves, [key]: { items, total: items.length } }
    }
    my.loading[key] = false
  }
  // Rows fetch their albums once they're on screen.
  const loadVisible = () => {
    const viewH = 999 - headerH()
    const first = Math.max(0, Math.floor(st.scrollY / STRIDE) - 1)
    const last = Math.ceil((st.scrollY + viewH) / STRIDE) + 1
    sorted()
      .slice(first, last)
      .forEach((g) => {
        if (!st.shelves[g.Id]) loadShelf(g)
      })
  }
  const land = () => {
    if (st.genres === null) return
    my.landed = true
    if (sorted().length) focusRow(0)
    else if (controls().length) st.zone = 'header'
    else props.focusStrip()
  }
  const focusRow = (r) => {
    st.zone = 'rows'
    st.row = r
    const top = 30 + r * STRIDE
    const viewH = 999 - headerH()
    st.scrollY = keepInView(st.scrollY, top, top + 260, viewH, contentH() - viewH)
    loadVisible()
  }
  const setCol = (col) => {
    const row = rows()[st.row]
    st.lastCol = { ...st.lastCol, [row.k]: col }
    if (col > 0) {
      const n = col - 1
      const x = SHELF_X + n * CARD_STEP
      const contentW = SHELF_X + row.cards.length * CARD_STEP - 24 + 60
      // The shelf scrolls in its own box, which starts 33px before the first card.
      const edge = SHELF_X - 33
      st.shelfX = { ...st.shelfX, [row.k]: keepInView(st.shelfX[row.k] || 0, x - edge, x - edge + CARD, vw - edge, contentW - vw) }
      const shelf = st.shelves[row.k]
      if (shelf && n >= shelf.items.length - 5 && shelf.items.length < shelf.total) loadShelf(row.raw)
    }
  }
  // The Magic Remote's cursor (app/pointer.js): the header and a row's Shuffle station take focus on
  // hover while in full view. The shelves slide to their focused album, so the cursor rings one and a
  // click focuses it and opens it, as it does a station the list would scroll to.
  const point = pointerIn(st, my, props)
  const pointCol = (r, col, click) => {
    if (!rows()[r]) return false
    const top = 30 + r * STRIDE
    const whole = wholeInView(st.scrollY, 999 - headerH(), top, top + 260)
    if (!click && (!whole || (st.active && st.zone === 'rows' && st.row === r && !(st.lastCol[rows()[r].k] || 0)))) return false
    point(() => {
      focusRow(r)
      setCol(col)
    })
    return click
  }
  const focusOf = (r) => (st.active && st.zone === 'rows' && st.row === r.i ? st.lastCol[r.k] || 0 : -1)
  ;(async () => {
    let genres = []
    try {
      const res = await api.getMusicGenres({ ParentId: props.library && props.library.Id, IncludeItemTypes: 'MusicAlbum', Fields: 'ItemCounts' })
      genres = itemsOf(res)
    } catch (e) {
      genres = []
    }
    if (!my.alive) return
    st.genres = genres
    loadVisible()
    if (st.active && !my.landed) land()
  })()

  return (
    <view
      ref={(n) => {
        // Down from the strip does its own landing, so land() doesn't run on the focus that follows.
        n.enterFromStrip = () => {
          if (controls().length) st.zone = 'header'
          else if (sorted().length) focusRow(0)
          else return false
          my.landed = true
          n.setFocus()
        }
        props.ref(n)
      }}
      width={vw}
      height={999}
      onFocusChanged={(has) => {
        st.active = has
        if (has && !my.landed) land()
      }}
      onLeft={() => {
        if (st.zone !== 'rows') return true
        const row = rows()[st.row]
        const col = (row && st.lastCol[row.k]) || 0
        if (col > 0) setCol(col - 1)
        else props.onEdgeLeft()
        return true
      }}
      onRight={() => {
        if (st.zone !== 'rows') return true
        const row = rows()[st.row]
        if (!row) return true
        const col = st.lastCol[row.k] || 0
        if (col < row.cards.length) setCol(col + 1)
        return true
      }}
      onUp={() => {
        if (st.zone === 'header') props.focusStrip()
        else if (st.row > 0) focusRow(st.row - 1)
        else if (controls().length) st.zone = 'header'
        else props.focusStrip()
        return true
      }}
      onDown={() => {
        if (st.zone === 'header') {
          if (sorted().length) focusRow(st.row)
        } else if (st.row < sorted().length - 1) focusRow(st.row + 1)
        return true
      }}
      onEnter={() => {
        if (st.zone === 'header') {
          st.byAlbums = !st.byAlbums
          setTimeout(loadVisible, 0)
          return true
        }
        const row = rows()[st.row]
        if (!row) return true
        const col = st.lastCol[row.k] || 0
        if (col === 0) {
          api
            .getItems({ ParentId: props.library && props.library.Id, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'Random', Limit: 300, GenreIds: row.raw.Id, Fields: 'MediaSources,MediaStreams' })
            .then((res) => playQueue(itemsOf(res), 0))
            .catch(() => {})
        } else if (row.cards[col - 1]) openMusicItem(row.cards[col - 1].raw)
        return true
      }}
    >
      <view y={headerH()} width={vw} height={999 - headerH()} clipping>
        <view y={-st.scrollY} width={vw} height={contentH()}>
          <For each={visibleRows()}>{(gr) => <GenreRow row={gr} vw={vw} look={look()} sx={st.shelfX[gr.k] || 0} focus={focusOf(gr)} onPointerCol={(col, click) => pointCol(gr.i, col, click)} />}</For>
        </view>
        <view>
          <Show when={st.genres && !st.genres.length}>
            <text fontFamily={uiFont()} fontSize={20} x={vw / 2} y={48 + 5.8} mountX={0.5} color={look().os(0.5)}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
      <ScreenHeader title={$L('Genres')} count={countText()} controls={controls()} focus={st.active && st.zone === 'header' ? 0 : -1}
        look={look()}
        onPointerStop={() => point(() => (st.zone = 'header'))}
      />
    </view>
  )
}
