import $L from '../../../services/i18n.js'
import { For, Match, Show, Switch, batch, createMemo, createSelector, createSignal, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { seriesCoverUrls, seriesItemCountLabel } from '../../../utils/bookLibrary.js'
import BookCard from './BookCard.jsx'
import { Pill, ScreenTitle } from './BookControls.jsx'
import { bookCard } from './bookCards.js'
import { columnsFor, countLabel, gridMove, gridRows, lineY, rowIndexOf } from './bookGrid.js'
import { faceOf, pillWidth } from './bookParts.js'
import { ellipsize, textWidth } from './bookText.js'
import { FAVORITE_PANELS, bookMenuItem, splitFavorites } from './bookScreens.js'
import { titlesFetcher } from './bookTitles.js'

const HEADER_H = 73.2
const ALL_FAVORITES = 500
const PER_PANEL = 4
const SERIES_PER_PANEL = 2
const SERIES_COVER = 180
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

// A tile on the board or in a panel's full list: a book card, a series cover or an author's face.
const tileFor = (panel, item, i, size) => {
  if (panel === 'series') {
    const name = item.Name || ''
    return {
      kind: 'series',
      key: item.Id,
      raw: item,
      w: SERIES_COVER,
      h: SERIES_COVER * 1.5 + 10 + 33 + 6 + 33,
      image: seriesCoverUrls(item._serverUrl || getServerUrl(), item)[0] || '',
      name: ellipsize(name, 19, 'bold', SERIES_COVER),
      nameFont: fontFor(name, 'bold'),
      sub: seriesItemCountLabel(item.ChildCount || 0),
    }
  }
  if (panel === 'authors') {
    const name = item.Name || ''
    return Object.assign(faceOf(item, i), {
      kind: 'author',
      key: item.Id || item.Name,
      raw: item,
      w: size,
      h: size + 10 + 33,
      name: ellipsize(name, 19, 'bold', size),
      nameFont: fontFor(name, 'bold'),
      initialsSize: size * 0.36,
    })
  }
  const card = bookCard(item, i, size)
  card.kind = 'book'
  return card
}

function TileView(props) {
  const t = () => props.tile
  return (
    <view x={props.x} y={props.y}>
      <Switch>
        <Match when={t().kind === 'book'}>
          <BookCard card={t()} focused={props.focused} look={props.look} zoom={props.zoom} />
        </Match>
        <Match when={t().kind === 'series'}>
          <view>
            <view width={180} height={270} borderRadius={10} color={props.look.os08}>
              <Show when={t().image}>
                <view width={180} height={270} borderRadius={10} src={t().image} textureOptions={COVER} />
              </Show>
            </view>
            <text fontFamily={t().nameFont} fontSize={19} x={90} mountX={0.5} y={286} color={props.look.onSurface}>
              {t().name}
            </text>
            <text fontFamily={uiFont()} fontSize={19} x={90} mountX={0.5} y={325} color={props.look.os65}>
              {t().sub}
            </text>
          </view>
        </Match>
        <Match when={t().kind === 'author'}>
          <view>
            <view
              x={-4}
              y={-4}
              width={t().w + 8}
              height={t().w + 8}
              borderRadius={(t().w + 8) / 2}
              color={CLEAR}
              border={{ width: 4, color: hex(props.look.focus) }}
              alpha={props.focused ? 1 : 0}
            />
            <view width={t().w} height={t().w} borderRadius={t().w / 2} color={t().image ? props.look.os06 : t().color}>
              <text fontFamily={t().nameFont} fontSize={t().initialsSize} x={t().w / 2} mountX={0.5} y={t().w * 0.29 + t().initialsSize * 0.07} color="#ffffff">
                {t().initials}
              </text>
              <Show when={t().image}>
                <view width={t().w} height={t().w} borderRadius={t().w / 2} src={t().image} textureOptions={COVER} />
              </Show>
            </view>
            <text fontFamily={t().nameFont} fontSize={19} x={t().w / 2} mountX={0.5} y={t().w + 16} color={props.look.onSurface}>
              {t().name}
            </text>
          </view>
        </Match>
      </Switch>
    </view>
  )
}

function FavoritePanel(props) {
  const pn = () => props.pn
  const placed = keyed(() => pn().placed, (p) => p.k)
  return (
    <view x={pn().x} y={pn().y} width={pn().w} height={pn().h}>
      <view width={pn().w} height={pn().h} borderRadius={24} color={props.look.os06} />
      <text fontFamily={uiFont('bold')} fontSize={28} x={24} y={24 + props.headingY} color={props.look.onSurface}>
        {pn().label}
      </text>
      <text fontFamily={uiFont()} fontSize={20} x={pn().countX} y={24 + props.headingY + 7} color={props.look.os65}>
        {pn().count}
      </text>
      <Pill x={pn().allX} y={24} label={props.seeAll} h={46} size={18} focused={props.allFocused} look={props.look} />
      <view x={24} y={70}>
        <For each={placed.keys()}>
          {(k) => {
            const pt = placed.item(k)
            return <TileView x={pt().x} y={pt().y} tile={pt().tile} look={props.look} zoom={props.zoom} focused={props.col === pt().t} />
          }}
        </For>
      </view>
    </view>
  )
}

// Each panel hides while it's empty. See All opens a panel's whole list in place, and Back closes
// it. The host gets onScreenLeft(), onScreenUp() and openItem(item), and the node has land().
export default function FavoritesScreen(props) {
  const [lists, setLists] = createSignal(null)
  const [expanded, setExpanded] = createSignal('')
  const [zone, setZone] = createSignal('items')
  const [panel, setPanel] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [gcur, setGcur] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  let landPending = false
  const seeAll = $L('See All')
  const backLabel = $L('Back')
  const boldFont = uiFont('bold')
  const textFont = uiFont()
  const look = () => props.look
  const cw = () => 1920 - (props.railW || 0)
  const panelCard = () => {
    const room = 1920 - (props.railW || 0) - 120
    return Math.min(170, Math.floor(((room - 30) / 2 - 48 - 20 * (PER_PANEL - 1)) / PER_PANEL))
  }
  const panels = createMemo(() => {
    const l = lists()
    if (!l) return []
    const pw = (cw() - 90) / 2 - 30
    const out = FAVORITE_PANELS.filter((p) => l[p.id].length > 0).map((p, i) => {
      const its = l[p.id].slice(0, p.id === 'series' ? SERIES_PER_PANEL : PER_PANEL)
      const tiles = its.map((item, t) => tileFor(p.id, item, t, panelCard()))
      const tallest = tiles.reduce((h, tile) => Math.max(h, tile.h), 0)
      let x = 0
      const placed = tiles.map((tile, t) => {
        const o = { k: tile.key, t, tile, x, y: 12 + tallest - tile.h }
        x += tile.w + 20
        return o
      })
      const label = p.label()
      return {
        k: p.id,
        id: p.id,
        i,
        label,
        count: String(l[p.id].length),
        countX: 24 + textWidth(label, 28, 'bold') + 12,
        x: 60 + (i % 2) * (pw + 30),
        w: pw,
        h: 24 + 46 + 24 + tallest + 12,
        placed,
        allX: pw - 24 - pillWidth(seeAll, false) + 8,
      }
    })
    // Panels in a row stretch to the taller of the two.
    let y = 24
    for (let r = 0; r < out.length; r += 2) {
      const h = Math.max(out[r].h, out[r + 1] ? out[r + 1].h : 0)
      out[r].y = y
      out[r].h = h
      if (out[r + 1]) {
        out[r + 1].y = y
        out[r + 1].h = h
      }
      y += h + 30
    }
    return out
  })
  const total = () => panels().reduce((sum, p) => sum + lists()[p.id].length, 0)
  const count = () => (total() ? countLabel(total(), $L('1 favorite'), $L('{count} favorites')) : '')
  const height = () => {
    const last = panels()[panels().length - 1]
    return last ? last.y + last.h + 30 + 60 : 0
  }
  const board = keyed(() => (expanded() ? [] : panels()), (p) => p.k)
  // A panel's whole list, in place of the board.
  const grid = createMemo(() => {
    const id = expanded()
    if (!id) return null
    const its = lists()[id]
    const tiled = id === 'series' || id === 'authors'
    const cols = columnsFor(230, 120, 30, props.railW || 0)
    const tiles = its.map((item, i) => (tiled ? tileFor(id, item, i, panelCard()) : tileFor('books', item, i, cols.width)))
    const rows = gridRows(tiles.length, cols.columns)
    let y = 24
    const placed = []
    rows.forEach((row) => {
      let h = 0
      for (let i = row.start; i < row.end; i++) h = Math.max(h, tiles[i].h + (tiles[i].kind === 'book' ? 78 : 0))
      let x = 60
      for (let i = row.start; i < row.end; i++) {
        const th = tiles[i].h + (tiles[i].kind === 'book' ? 78 : 0)
        placed.push({ k: tiles[i].key, i, tile: tiles[i], x, y: y + h - th, h: th })
        x += tiles[i].w + 30
      }
      y += h + 24
    })
    const p = FAVORITE_PANELS.find((e) => e.id === id)
    const label = p ? p.label() : ''
    const labelX = 60 + pillWidth(backLabel, true) + 30
    return {
      rows,
      placed,
      height: y + 60,
      label,
      labelX,
      count: countLabel(its.length, $L('1 favorite'), $L('{count} favorites')),
      countX: labelX + textWidth(label, 48, 'bold') + 20,
    }
  })
  const gridList = keyed(() => (grid() ? grid().placed : []), (p) => p.k)
  const isGridTile = createSelector(() => (zone() === 'grid' && has() ? gcur() : null))
  const gridHead = () => grid() || { label: '', labelX: 0, count: '', countX: 0 }
  const headingY = lineY((46 - 33) / 2, 33, 28)

  onMount(async () => {
    const quietly = (promise, fallback) => promise.catch(() => fallback)
    const libraryId = props.library.Id
    const [titles, folders, artists] = await Promise.all([
      quietly(titlesFetcher({ api, library: props.library, favorites: true })(0, ALL_FAVORITES), { items: [] }),
      quietly(api.getItems({ ParentId: libraryId, IncludeItemTypes: 'Folder', Recursive: true, Filters: 'IsFavorite', Fields: 'ParentId' }), null),
      quietly(api.getArtists({ ParentId: libraryId, IsFavorite: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName' }), null),
    ])
    const favoriteFolders = ((folders && folders.Items) || []).map((f) => f.Id)
    setLists(
      Object.assign(splitFavorites(titles.items), {
        series: props.data.series.filter((entry) => entry.IsFolder && favoriteFolders.indexOf(entry.Id) >= 0),
        authors: (artists && artists.Items) || [],
      }),
    )
    if (landPending) land()
  })

  const reveal = () => {
    let top
    let h
    if (expanded()) {
      const p = grid().placed[gcur()]
      if (!p) return
      top = p.y
      h = p.h
    } else {
      const pn = panels()[panel()]
      if (!pn) return
      top = pn.y + (zone() === 'all' ? 24 : 70)
      h = zone() === 'all' ? 46 : pn.y + pn.h - 12 - top
    }
    const view = props.viewH - HEADER_H
    const full = expanded() ? grid().height : height()
    setScrollY(focusScroll(top, h, scrollY(), view, Math.max(0, full - view)))
  }
  const land = () => {
    if (!lists()) {
      landPending = true
      return
    }
    landPending = false
    batch(() => {
      setZone(expanded() ? 'grid' : 'items')
      setPanel(0)
      setCol(0)
    })
    reveal()
  }
  const open = (id) => {
    batch(() => {
      setExpanded(id)
      setZone('grid')
      setGcur(0)
      setScrollY(0)
    })
  }
  // Back closes a panel's full list first. True when it took the key.
  const closeExpanded = () => {
    if (!expanded()) return false
    const i = panels().findIndex((p) => p.id === expanded())
    batch(() => {
      setExpanded('')
      setZone('all')
      setPanel(Math.max(0, i))
      setScrollY(0)
    })
    reveal()
    return true
  }
  const gridKey = (direction) => {
    const rows = grid().rows
    const next = gridMove(rows, rowIndexOf(rows, gcur()), gcur(), direction)
    if (next != null) {
      setGcur(next)
      return reveal()
    }
    if (direction === 'up') setZone('back')
    else if (direction === 'left') props.host.onScreenLeft()
  }
  const boardKey = (direction) => {
    const pn = panels()[panel()]
    if (!pn) return
    if (zone() === 'all') {
      if (direction === 'down') setZone('items')
      else if (direction === 'up' && panel() >= 2) {
        batch(() => {
          setPanel(panel() - 2)
          setZone('items')
          setCol(0)
        })
      } else if (direction === 'up') props.host.onScreenUp()
      else if (direction === 'left' && panel() % 2 === 1) {
        batch(() => {
          setPanel(panel() - 1)
          setZone('items')
          setCol(panels()[panel()].placed.length - 1)
        })
      } else if (direction === 'left') props.host.onScreenLeft()
      return reveal()
    }
    if (direction === 'up') setZone('all')
    else if (direction === 'down' && panels()[panel() + 2]) {
      batch(() => {
        setPanel(panel() + 2)
        setCol(Math.min(col(), panels()[panel()].placed.length - 1))
      })
    } else if (direction === 'left') {
      if (col() > 0) setCol(col() - 1)
      else if (panel() % 2 === 1) {
        batch(() => {
          setPanel(panel() - 1)
          setCol(panels()[panel()].placed.length - 1)
        })
      } else props.host.onScreenLeft()
    } else if (direction === 'right') {
      if (col() < pn.placed.length - 1) setCol(col() + 1)
      else if (panel() % 2 === 0 && panels()[panel() + 1]) {
        batch(() => {
          setPanel(panel() + 1)
          setCol(0)
        })
      }
    }
    reveal()
  }
  const key = (direction) => () => {
    if (zone() === 'grid') gridKey(direction)
    else if (zone() === 'back') {
      if (direction === 'down') {
        batch(() => {
          setZone('grid')
          setGcur(0)
        })
      } else if (direction === 'up') props.host.onScreenUp()
      else if (direction === 'left') props.host.onScreenLeft()
    } else boardKey(direction)
    return true
  }
  const focusedTile = () => {
    if (zone() === 'grid') return (grid().placed[gcur()] || {}).tile
    if (zone() !== 'items') return null
    const pn = panels()[panel()]
    return pn && pn.placed[col()] ? pn.placed[col()].tile : null
  }
  const enter = () => {
    if (zone() === 'back') return closeExpanded()
    if (zone() === 'grid') {
      const t = focusedTile()
      return t && props.host.openItem(t.raw)
    }
    const pn = panels()[panel()]
    if (!pn) return
    if (zone() === 'all') return open(pn.id)
    const t = focusedTile()
    if (t) props.host.openItem(t.raw)
  }
  const heldItem = () => {
    const t = focusedTile()
    return t && t.kind === 'book' ? bookMenuItem(t.raw) : null
  }
  const hold = menuHold(heldItem, enter)
  return (
    <view
      ref={(n) => {
        n.land = land
        if (props.ref) props.ref(n)
      }}
      width={cw()}
      height={props.viewH}
      onFocusChanged={setHas}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onUp={key('up')}
      onDown={key('down')}
      onLeft={key('left')}
      onRight={key('right')}
      onEnter={() => {
        enter()
        return true
      }}
      onBack={() => closeExpanded()}
    >
      <view alpha={expanded() ? 0 : 1}>
        <ScreenTitle title={$L('Favorites')} count={count()} look={look()} />
      </view>
      <view alpha={expanded() ? 1 : 0}>
        <Pill x={60} y={18} label={backLabel} icon="core_arrow_left" focused={zone() === 'back' && has()} look={look()} />
        <text fontFamily={boldFont} fontSize={48} x={gridHead().labelX} y={17} color={look().onSurface}>
          {gridHead().label}
        </text>
        <text fontFamily={textFont} fontSize={22} x={gridHead().countX} y={41} color={look().os65}>
          {gridHead().count}
        </text>
      </view>
      <view y={HEADER_H} width={cw()} height={props.viewH - HEADER_H} clipping>
        <view y={-scrollY()} width={cw()} height={Math.max(props.viewH, expanded() ? grid().height : height())}>
          <view>
            <For each={board.keys()}>
              {(k) => {
                const pn = board.item(k)
                return (
                  <FavoritePanel
                    pn={pn()}
                    look={look()}
                    zoom={props.zoom}
                    seeAll={seeAll}
                    headingY={headingY}
                    allFocused={zone() === 'all' && has() && panel() === pn().i}
                    col={zone() === 'items' && has() && panel() === pn().i ? col() : -1}
                  />
                )
              }}
            </For>
          </view>
          <view>
            <For each={gridList.keys()}>
              {(k) => {
                const gt = gridList.item(k)
                return <TileView x={gt().x} y={gt().y} tile={gt().tile} look={look()} zoom={props.zoom} focused={isGridTile(gt().i)} />
              }}
            </For>
          </view>
          <view>
            <Show when={lists() && !panels().length && !expanded()}>
              <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={54} mountX={0.5} color={look().os50}>
                {$L('No items found')}
              </text>
            </Show>
          </view>
        </view>
      </view>
    </view>
  )
}
