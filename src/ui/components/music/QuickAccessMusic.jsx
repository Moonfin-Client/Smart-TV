import $L from '../../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSelector, on } from 'solid-js'
import MusicTrackList, { trackRows, trackListHeight } from './MusicTrackList.jsx'
import MusicFilterPanel from './MusicFilterPanel.jsx'
import MusicSkeleton from './MusicSkeleton.jsx'
import { MusicShelf, SHELF_CARD, SHELF_STEP } from './ImmersiveMusic.jsx'
import { lineY } from '../books/bookGrid.js'
import { keepInView } from './musicGrid.js'
import { Kept } from '../library/pageKit.js'
import { uiFont, fontFor, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { reactive } from '../../../state/reactive.js'
import { SEE_ALL_TARGET, cardLine, mediaCard, musicArtUrl, musicCategories, openMusicItem, playSongFromAlbum, songSubtitle } from '../../../pages/Music/music.js'

const RAIL_W = 248
const INSET = 32
const GRID_W = 1920 - RAIL_W - INSET * 2
const QUICK_COLS = Math.min(4, Math.max(2, Math.floor(GRID_W / 240)))
const QUICK_W = (GRID_W - 10 * (QUICK_COLS - 1)) / QUICK_COLS
const SHELF_IDS = ['latestMusic', 'albumArtists', 'favorites', 'artists', 'albums']
const CONTENT_W = 1920 - RAIL_W
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

const quickItems = (lastPlayed = [], playlists = [], max = 8) => {
  const seen = {}
  const albums = []
  lastPlayed.forEach((t) => {
    const key = t.AlbumId || t.Id
    if (seen[key]) return
    seen[key] = true
    albums.push(
      t.AlbumId
        ? { Id: t.AlbumId, Type: 'MusicAlbum', Name: t.Album || t.Name, ImageTags: t.AlbumPrimaryImageTag ? { Primary: t.AlbumPrimaryImageTag } : undefined, _serverUrl: t._serverUrl }
        : t
    )
  })
  return albums.concat(playlists).slice(0, max)
}

function RailItem(props) {
  const look = () => props.look
  const it = () => props.item
  return (
    <view x={12} y={it().y} width={224} height={it().h}>
      <view width={224} height={it().h} borderRadius={10} color={it().selected ? look().accent16 : NONE} />
      <view width={224} height={it().h} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick} />
      <view x={-3} y={-3} width={230} height={it().h + 6} borderRadius={13} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view>
        <Show when={it().kind === 'item' && it().icon}>
          <view
            x={12}
            y={(it().h - it().iconS) / 2}
            width={it().iconS}
            height={it().iconS}
            borderRadius={it().art !== null ? 6 : 0}
            src={it().icon}
            textureOptions={it().art ? COVER : undefined}
            color={it().iconColor}
          />
        </Show>
      </view>
      <view>
        <Show when={it().kind === 'item' && !it().icon}>
          <view x={12} y={(it().h - it().iconS) / 2} width={it().iconS} height={it().iconS} borderRadius={6} color={it().iconColor} />
        </Show>
      </view>
      <text fontFamily={it().font} fontSize={it().size} x={it().textX} y={it().ty} maxWidth={224 - it().textX - 12} maxLines={1} color={it().ink}>
        {it().label}
      </text>
    </view>
  )
}

// Left from the content reaches the rail's Overview, and Right from the rail goes back into the content.
export default function QuickAccessMusic(props) {
  const look = () => props.look
  const st = reactive({ zone: 'quick', rcur: 2, railScroll: 0, qcur: 0, pcur: 0, shelf: 0, shelfCur: [], shelfX: [], scrollY: 0, active: false, filterOn: false })
  const my = { landed: false }
  let root
  let filterRef = null

  const rowOf = createMemo(() => {
    const map = {}
    ;(props.rows || []).forEach((r) => (map[r.id] = r))
    return map
  })
  const lastPlayed = () => rowOf().lastPlayed || null
  const playlists = () => (rowOf().playlists && rowOf().playlists.items) || []
  const shelves = createMemo(() => SHELF_IDS.map((id) => rowOf()[id]).filter(Boolean))
  const quick = createMemo(() => quickItems(lastPlayed() ? lastPlayed().items : [], playlists()))
  const name = () => (props.library && props.library.Name) || $L('Music')
  const title = () => (quick().length ? $L('Jump Back In') : name())
  const filterLabel = $L('Sort & Filter')
  const pillW = () => Math.ceil(16 + 18 + 8 + textWidth(filterLabel, 14, 'bold') + 16)
  const railItems = createMemo(() => {
    const l = look()
    const out = []
    let y = 16
    out.push({ k: 'home', i: 0, kind: 'header', y, h: 72 })
    y += 72
    const item = (k, label, icon, selected) => {
      const i = out.length
      out.push({
        k, i, kind: 'item', y, h: 44, label, font: fontFor(label, 'bold'), size: 15, textX: 44, ty: lineY((44 - 33) / 2, 33, 15),
        icon: 'icons/' + icon + '.webp', iconS: 20, art: null, selected, ink: selected ? l.accent : l.os(0.86), iconColor: selected ? l.accent : l.os(0.86),
      })
      y += 44
    }
    item('search', $L('Search Music'), 'nav_search', false)
    item('overview', $L('Overview'), 'core_space_dashboard_outlined', true)
    musicCategories().forEach((c) => item(c.id, c.label, c.icon, false))
    if (playlists().length) {
      out.push({ k: 'plabel', i: -1, kind: 'label', y, h: 59, label: $L('PLAYLISTS'), font: uiFont('bold'), size: 12, textX: 12, ty: 18 + lineY(0, 33, 12), iconS: 0, art: null, ink: l.os(0.62) })
      y += 59
    }
    playlists().forEach((pl) => {
      const i = out.length
      const art = musicArtUrl(pl, 120)
      out.push({
        k: 'pl' + pl.Id, i, kind: 'item', raw: pl, y, h: 48, label: pl.Name || '', font: fontFor(pl.Name || '', 'bold'), size: 14, textX: 56,
        ty: lineY((48 - 33) / 2, 33, 14), icon: art, iconS: 32, art, selected: false, ink: l.os(0.86), iconColor: art ? '#ffffffff' : l.os(0.06),
      })
      y += 48
    })
    return out
  })
  const railRows = createMemo(() => railItems().filter((r) => r.kind !== 'header'))
  const railStops = createMemo(() => railItems().filter((r) => r.kind !== 'label'))
  const tiles = createMemo(() =>
    quick().map((it, i) => ({
      i,
      raw: it,
      x: INSET + (i % QUICK_COLS) * (QUICK_W + 10),
      y: Math.floor(i / QUICK_COLS) * 74,
      art: musicArtUrl(it, 160),
      label: it.Name || '',
      font: fontFor(it.Name || '', 'bold'),
      ty: (64 - (Math.ceil(textWidth(it.Name || '', 14, 'bold')) > QUICK_W - 86 ? 33.6 : 16.8)) / 2 - 1,
    }))
  )
  const lastRows = createMemo(() =>
    lastPlayed() ? trackRows(lastPlayed().items.slice(0, 6), { mode: 'art', artFor: (t) => musicArtUrl(t, 120), subtitleFor: songSubtitle }) : []
  )
  // Last Played sits under Latest, or first when Latest is hidden.
  const lastAt = () => (shelves()[0] && shelves()[0].id === 'latestMusic' ? 1 : 0)
  const layout = createMemo((prev) => {
    const old = {}
    ;((prev && prev.sections) || []).forEach((s) => (old[s.k] = s))
    let y = 16 + 40
    const quickY = y + 16
    if (quick().length) y += 16 + Math.ceil(quick().length / QUICK_COLS) * 74 - 10
    const sections = []
    const shelf = (row, i) => {
      const info = row.items.some((it) => cardLine(it)) ? 86 : 53
      const h = 28 + 62 + 5 + SHELF_CARD + info + 5
      const was = old[row.id]
      sections.push(
        was && was.row === row && was.i === i && was.y === y
          ? was
          : {
              id: 'row:' + i, k: row.id, i, y, h, row, title: row.title, titleFont: fontFor(row.title, 'bold'),
              cards: row.items.map((it, n) => mediaCard(it, n, row.cardType === 'circle')), seeAll: !!SEE_ALL_TARGET[row.id],
            }
      )
      y += h
    }
    const at = lastAt()
    shelves().slice(0, at).forEach((r, i) => shelf(r, i))
    let lastY = 0
    if (lastPlayed()) {
      lastY = y
      y += 28 + 64 + trackListHeight(lastRows())
    }
    shelves().slice(at).forEach((r, i) => shelf(r, i + at))
    return { quickY, sections, lastY, end: y + 60 }
  })
  const chain = createMemo(() => {
    const rows = layout().sections.map((s) => s.id)
    const at = lastAt()
    return ['header'].concat(quick().length ? ['quick'] : [], rows.slice(0, at), lastPlayed() ? ['last'] : [], rows.slice(at))
  })
  const live = () => st.active && !st.filterOn
  const railSel = createSelector(() => (live() && st.zone === 'rail' && railStops()[st.rcur] ? railStops()[st.rcur].i : -1))
  const quickSel = createSelector(() => (live() && st.zone === 'quick' ? st.qcur : -1))
  const secOf = (i) => layout().sections.find((x) => x.i === i)
  const seeAllW = () => Math.ceil(textWidth($L('See All'), 18)) + 24

  const nodeTop = (node) => {
    if (node === 'header' || node === 'quick') return 0
    if (node === 'last') return layout().lastY
    const s = layout().sections.find((x) => x.id === node)
    return s ? s.y : 0
  }
  const focusNode = (node) => {
    const max = Math.max(0, layout().end - 1080)
    st.scrollY = Math.max(0, Math.min(max, nodeTop(node) - 16))
    if (node === 'header') st.zone = 'header'
    else if (node === 'quick') {
      st.zone = 'quick'
      st.qcur = 0
    } else if (node === 'last') {
      st.zone = 'last'
      st.pcur = 0
    } else {
      st.zone = 'shelf'
      st.shelf = parseInt(node.slice(4), 10)
    }
  }
  const landFirst = () => {
    if (my.landed) return
    my.landed = true
    focusNode(chain()[1] || chain()[0])
  }
  const nodeOf = () => (st.zone === 'shelf' || st.zone === 'shelfAll' ? 'row:' + st.shelf : st.zone)
  const step = (d) => {
    const c = chain()
    const at = c.indexOf(nodeOf())
    const next = c[at + d]
    if (at >= 0 && next) focusNode(next)
  }
  const railTotal = () => {
    const items = railItems()
    return items[items.length - 1].y + items[items.length - 1].h + 24
  }
  const keepRail = () => {
    const r = railStops()[st.rcur]
    if (!r) return
    const total = railTotal()
    let s = st.railScroll
    if (r.y - s < 0) s = r.y - 24
    else if (r.y + r.h - s > 1080) s = r.y + r.h - 1080 + 24
    st.railScroll = Math.max(0, Math.min(s, Math.max(0, total - 1080)))
  }
  const focusRail = () => {
    st.zone = 'rail'
    st.rcur = railStops().findIndex((r) => r.k === 'overview')
    keepRail()
  }
  const setShelfCur = (i, cur) => {
    const next = st.shelfCur.slice()
    next[i] = cur
    st.shelfCur = next
    const sec = secOf(i)
    const x = 32 + cur * SHELF_STEP
    const contentW = 32 + sec.cards.length * SHELF_STEP - 20 + 20
    const xs = st.shelfX.slice()
    xs[i] = keepInView(st.shelfX[i] || 0, x, x + SHELF_CARD, CONTENT_W, contentW - CONTENT_W)
    st.shelfX = xs
  }
  // The Magic Remote's cursor (app/pointer.js). Focus scrolls the page to the focused section, so the
  // filter button and the quick tiles take focus on hover only with the page at the top, and the
  // Last Played tracks, the shelves' cards and See All ring and take it on a click. A rail item takes
  // it on hover in full view, on a click when the rail would scroll to it.
  const point = (fn) => {
    my.landed = true
    fn()
    if (!st.active && root) root.setFocus()
  }
  const pointTop = (fn, click) => {
    if (st.filterOn || (!click && st.scrollY !== 0)) return false
    point(fn)
    return click
  }
  const pointRail = (it, click) => {
    const at = railStops().findIndex((r) => r.i === it.i)
    if (st.filterOn || at < 0) return false
    const top = it.y - st.railScroll
    if (!click && (top < 0 || top + it.h > 1080 || (live() && st.zone === 'rail' && st.rcur === at))) return false
    point(() => {
      st.zone = 'rail'
      st.rcur = at
      keepRail()
    })
    return click
  }
  const pointSection = (node, set) => {
    if (st.filterOn) return false
    point(() => {
      focusNode(node)
      set()
    })
    return true
  }
  const openFilter = () => {
    st.filterOn = true
    if (filterRef) filterRef.setFocus()
  }
  const closeFilter = () => {
    st.zone = 'header'
    root.setFocus()
    st.filterOn = false
  }

  createEffect(
    on(
      () => props.loading,
      (v) => {
        if (!v) setTimeout(landFirst, 0)
      }
    )
  )

  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      color="#0a0a0aff"
      onFocusChanged={(has) => (st.active = has)}
      onLeft={() => {
        const z = st.zone
        if (z === 'rail' || z === 'shelfAll') return true
        if (z === 'quick' && st.qcur % QUICK_COLS > 0) {
          st.qcur = st.qcur - 1
          return true
        }
        if (z === 'shelf') {
          const cur = st.shelfCur[st.shelf] || 0
          if (cur > 0) {
            setShelfCur(st.shelf, cur - 1)
            return true
          }
        }
        focusRail()
        return true
      }}
      onRight={() => {
        const z = st.zone
        if (z === 'rail') focusNode(chain()[1] || chain()[0])
        else if (z === 'quick' && st.qcur % QUICK_COLS < QUICK_COLS - 1 && st.qcur < tiles().length - 1) st.qcur = st.qcur + 1
        else if (z === 'shelf') {
          const cur = st.shelfCur[st.shelf] || 0
          if (cur < secOf(st.shelf).cards.length - 1) setShelfCur(st.shelf, cur + 1)
        }
        return true
      }}
      onUp={() => {
        const z = st.zone
        if (z === 'rail') {
          if (st.rcur > 0) st.rcur = st.rcur - 1
          keepRail()
        } else if (z === 'quick' && st.qcur >= QUICK_COLS) st.qcur = st.qcur - QUICK_COLS
        else if (z === 'last' && st.pcur > 0) st.pcur = st.pcur - 1
        else if (z === 'shelf' && secOf(st.shelf).seeAll) st.zone = 'shelfAll'
        else step(-1)
        return true
      }}
      onDown={() => {
        const z = st.zone
        if (z === 'rail') {
          if (st.rcur < railStops().length - 1) st.rcur = st.rcur + 1
          keepRail()
        } else if (z === 'quick' && st.qcur + QUICK_COLS < tiles().length) st.qcur = st.qcur + QUICK_COLS
        else if (z === 'last' && st.pcur < lastRows().length - 1) st.pcur = st.pcur + 1
        else if (z === 'shelfAll') st.zone = 'shelf'
        else step(1)
        return true
      }}
      onEnter={() => {
        const z = st.zone
        if (z === 'rail') {
          const r = railStops()[st.rcur]
          if (r.k === 'home') props.onHome()
          else if (r.k === 'search') props.onSearch()
          else if (r.k === 'overview') focusNode(chain()[1] || chain()[0])
          else if (r.raw) openMusicItem(r.raw)
          else props.onOpenGrid(r.k)
        } else if (z === 'header') openFilter()
        else if (z === 'quick') {
          const it = tiles()[st.qcur].raw
          if (it.Type === 'Audio') playSongFromAlbum(it)
          else openMusicItem(it)
        } else if (z === 'last') playSongFromAlbum(lastPlayed().items[st.pcur])
        else if (z === 'shelfAll') props.onOpenGrid(SEE_ALL_TARGET[secOf(st.shelf).k])
        else if (z === 'shelf') {
          const card = secOf(st.shelf).cards[st.shelfCur[st.shelf] || 0]
          if (card) openMusicItem(card.raw)
        }
        return true
      }}
    >
      <view width={RAIL_W} height={1080} color={look().os(0.03)} clipping>
        <view y={-st.railScroll} width={RAIL_W} height={Math.max(1080, railTotal())}>
          <view
            x={24}
            y={16}
            width={60}
            height={60}
            onPointerOver={() => pointRail(railStops()[0], false)}
            onPointerClick={() => pointRail(railStops()[0], true)}
          >
            <view x={-3} y={-3} width={66} height={66} borderRadius={33} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={railSel(0) ? 1 : 0} />
            <view width={60} height={60} borderRadius={30} color="#00000059" />
            <view x={15} y={15} width={30} height={30} src="icons/nav_home.webp" />
          </view>
          <text fontFamily={fontFor(name(), 'bold')} fontSize={24} x={96} y={16 + lineY((60 - 33) / 2, 33, 24)} maxWidth={140} maxLines={1} color="#ffffffff">
            {name()}
          </text>
          <For each={railRows()}>{(it) => <RailItem
                item={it}
                look={look()}
                focused={it.kind === 'item' && railSel(it.i)}
                onPointerOver={() => it.kind === 'item' && pointRail(it, false)}
                onPointerClick={() => it.kind === 'item' && pointRail(it, true)}
              />}</For>
        </view>
      </view>
      <view x={RAIL_W} width={CONTENT_W} height={1080} clipping>
        <view y={-st.scrollY} width={CONTENT_W} height={Math.max(1080, layout().end)}>
          <text fontFamily={uiFont('bold')} fontSize={26} x={32} y={16 + lineY((40 - 33) / 2, 33, 26)} maxWidth={CONTENT_W - 64 - pillW() - 16} maxLines={1} color="#ffffffff">
            {title()}
          </text>
          <view
            x={CONTENT_W - 32 - pillW()}
            y={16}
            width={pillW()}
            height={40}
            onPointerOver={() => !(live() && st.zone === 'header') && pointTop(() => focusNode('header'), false)}
            onPointerClick={() => pointTop(() => focusNode('header'), true)}
          >
            <view x={-3} y={-3} width={pillW() + 6} height={46} borderRadius={23} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={live() && st.zone === 'header' ? 1 : 0} />
            <view width={pillW()} height={40} borderRadius={20} color={look().os(0.08)} />
            <view x={16} y={11} width={18} height={18} src="icons/mus_filter.webp" />
            <text fontFamily={uiFont('bold')} fontSize={14} x={42} y={lineY((40 - 33) / 2, 33, 14)} color="#ffffffff">
              {filterLabel}
            </text>
          </view>
          <view y={layout().quickY} width={CONTENT_W} height={300}>
            <For each={tiles()}>
              {(tl) => (
                <view
                  x={tl.x}
                  y={tl.y}
                  width={QUICK_W}
                  height={64}
                  onPointerOver={() => !quickSel(tl.i) && pointTop(() => (focusNode('quick'), (st.qcur = tl.i)), false)}
                  onPointerClick={() => pointTop(() => (focusNode('quick'), (st.qcur = tl.i)), true)}
                >
                  <view x={-3} y={-3} width={QUICK_W + 6} height={70} borderRadius={13} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={quickSel(tl.i) ? 1 : 0} />
                  <view width={QUICK_W} height={64} borderRadius={10} color={look().os(0.08)} />
                  <view width={64} height={64} borderRadius={10} color={look().os(0.06)} />
                  <view>
                    <Show when={tl.art}>
                      <view width={64} height={64} borderRadius={10} src={tl.art} textureOptions={COVER} />
                    </Show>
                  </view>
                  <text fontFamily={tl.font} fontSize={14} lineHeight={16.8} maxLines={2} x={76} y={tl.ty} maxWidth={QUICK_W - 86} color="#ffffffff">
                    {tl.label}
                  </text>
                </view>
              )}
            </For>
          </view>
          <view width={CONTENT_W} height={Math.max(1080, layout().end)}>
            <Show when={props.loading}>
              <MusicSkeleton y={56} />
            </Show>
          </view>
          <view width={CONTENT_W} height={Math.max(1080, layout().end)}>
            <Show when={!props.loading && !(props.rows || []).length}>
              <text fontFamily={uiFont()} fontSize={20} x={836} y={56 + 200 - 12} mountX={0.5} color={look().os(0.5)}>
                {$L('No music items found')}
              </text>
            </Show>
          </view>
          <view width={CONTENT_W} height={Math.max(1080, layout().end)}>
            <Show when={lastPlayed() && !props.loading}>
              <view y={layout().lastY} width={CONTENT_W} height={92 + trackListHeight(lastRows())}>
                <text fontFamily={uiFont('bold')} fontSize={28} x={32} y={28 + 11.5 + 2.5} color={look().onSurface}>
                  {$L('Last Played')}
                </text>
                <MusicTrackList
                  x={32}
                  y={92}
                  rows={lastRows()}
                  focus={live() && st.zone === 'last' ? st.pcur : -1}
                  w={1608}
                  look={look()}
                  pointerTrackRing
                  onPointerTrackClick={(i) => pointSection('last', () => (st.pcur = i))}
                />
              </view>
            </Show>
          </view>
          <view width={CONTENT_W} height={Math.max(1080, layout().end)}>
            <For each={layout().sections}>
              {(sc) => (
                <view y={sc.y} width={CONTENT_W} height={sc.h}>
                  <text fontFamily={sc.titleFont} fontSize={28} x={32} y={28 + 11.5 + 2.5} color={look().onSurface}>
                    {sc.title}
                  </text>
                  <view
                    x={1660 - seeAllW()}
                    y={28 + 3.5}
                    width={seeAllW()}
                    height={49}
                    alpha={sc.seeAll ? 1 : 0}
                  >
                    <view
                      x={-3}
                      y={-3}
                      width={seeAllW() + 6}
                      height={55}
                      borderRadius={19}
                      color={NONE}
                      border={{ width: 3, color: hex(look().focus) }}
                      alpha={live() && st.zone === 'shelfAll' && st.shelf === sc.i ? 1 : 0}
                    />
                    <text fontFamily={uiFont()} fontSize={18} x={12} y={14} color={look().os(0.7)}>
                      {$L('See All')}
                    </text>
                    <view
                      width={seeAllW()}
                      height={49}
                      pointerRing={16}
                      onPointerClick={() =>
                        sc.seeAll &&
                        pointSection('row:' + sc.i, () => {
                          st.zone = 'shelfAll'
                        })
                      }
                    />
                  </view>
                  <MusicShelf
                    y={90}
                    x0={32}
                    viewW={CONTENT_W}
                    cards={sc.cards}
                    look={look()}
                    sx={st.shelfX[sc.i] || 0}
                    focus={live() && st.zone === 'shelf' && st.shelf === sc.i ? st.shelfCur[sc.i] || 0 : -1}
                    onPointerCard={(idx) => pointSection('row:' + sc.i, () => setShelfCur(sc.i, idx))}
                  />
                </view>
              )}
            </For>
          </view>
        </view>
      </view>
      <view>
        <Show when={st.filterOn}>
          <Kept gone={() => (filterRef = null)}>
            <MusicFilterPanel ref={(n) => (filterRef = n)} kind="library" look={look()} onFilterClose={closeFilter} onFilterChange={() => props.onSettingsChanged()} />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
