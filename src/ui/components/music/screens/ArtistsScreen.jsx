import $L from '../../../../services/i18n.js'
import { For, Index, Show, createMemo, createSelector, onCleanup } from 'solid-js'
import MusicCard from '../MusicCard.jsx'
import { ScreenHeader, pointerIn, wholeInView, headerHeight, layoutControls, cardSide, contentWidth, gridRows, rowIndexOf, gridMove, keepInView } from '../screenParts.jsx'
import { lineY } from '../../books/bookGrid.js'
import { uiFont } from '../../../text.js'
import { hex } from '../../../color.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { LETTERS } from '../../../../utils/gridChrome.js'
import { countLabel, itemsOf, letterOf, mediaCard, openMusicItem, playQueue } from '../../../../pages/Music/music.js'

const COLUMNS = 7
const GAP = 30
const PAGE = 100
const VIEW_H = 999
const MARGIN = 600
const NONE = '#00000000'

function Rail(props) {
  const look = () => props.look
  return (
    <view x={props.x} y={12} width={50} height={801}>
      <view width={50} height={801} borderRadius={21} color={look().os(0.05)} />
      <Index each={LETTERS}>
        {(l, i) => (
          <view x={6} y={9 + i * 29} width={38} height={28}>
            <view x={-3} y={-3} width={44} height={34} borderRadius={12} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focus === i ? 1 : 0} />
            <text fontFamily={uiFont('bold')} fontSize={17} x={19} y={lineY(0, 28, 17)} mountX={0.5} color={props.current === l() ? look().accent : look().os(0.7)}>
              {l()}
            </text>
            <view width={38} height={28} onPointerOver={() => props.onPointerLetter && props.onPointerLetter(i)} />
          </view>
        )}
      </Index>
    </view>
  )
}

export default function ArtistsScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const side = cardSide(COLUMNS, 190, GAP)
  const st = reactive({
    mode: (props.screen && props.screen.mode) || 'albumArtists',
    descending: false,
    items: [],
    total: 0,
    loaded: false,
    complete: false,
    zone: 'grid',
    hcur: 0,
    cur: 0,
    rcur: 0,
    lastIndex: 0,
    scrollY: 0,
    active: false,
  })
  const my = { gen: 0, next: 0, busy: false, landed: false, pending: null, alive: true }
  onCleanup(() => (my.alive = false))

  const controls = createMemo(() => [
    { kind: 'tabs', tabs: [{ id: 'albumArtists', label: $L('Album Artists') }, { id: 'artists', label: $L('All Artists') }], active: st.mode },
    { kind: 'pill', id: 'sort', label: st.descending ? $L('Z to A') : $L('A to Z'), icon: 'core_sort_by_alpha' },
    { kind: 'pill', id: 'shuffle', label: $L('Shuffle All'), icon: 'core_shuffle' },
  ])
  const stops = createMemo(() => layoutControls(controls()).stops)
  const headerH = createMemo(() => headerHeight(controls()))
  const headFocus = () => (st.active && st.zone === 'header' ? st.hcur : -1)
  const countText = () => (st.total > 0 ? countLabel(st.total, $L('1 artist'), $L('{count} artists')) : '')
  const rows = createMemo(() => gridRows(st.items.length, COLUMNS, (i) => letterOf(st.items[i])))
  const layoutY = createMemo(() => {
    const tops = []
    const heads = []
    let y = 24
    rows().forEach((row, r) => {
      if (row.heading) {
        heads.push({ r, letter: row.section, top: y, y: y + 6 + lineY(0, 33, 36) - 2 })
        y += 6 + 33 + 12
      }
      tops.push(y)
      y += side + 53 + 18
    })
    return { tops, heads, end: y + 60 }
  })
  const models = createMemo((prev) => st.items.map((it, i) => (prev && prev[i] && prev[i].raw === it ? prev[i] : mediaCard(it, i, true))))
  const inView = (top, h) => top + h >= st.scrollY - MARGIN && top <= st.scrollY + VIEW_H + MARGIN
  const cards = createMemo(() => {
    const tops = layoutY().tops
    const all = models()
    const out = []
    rows().forEach((row, r) => {
      if (!inView(tops[r], side + 53)) return
      for (let i = row.start; i < row.end; i++) out.push(all[i])
    })
    return out
  })
  const heads = createMemo(() => layoutY().heads.filter((h) => inView(h.top, 51)))
  const currentLetter = () => {
    const r = rowIndexOf(rows(), st.lastIndex)
    return (rows()[r] && rows()[r].section) || (rows()[0] && rows()[0].section) || null
  }
  const gridSel = createSelector(() => (st.active && st.zone === 'grid' ? st.cur : -1))
  const railFocus = () => (st.active && st.zone === 'rail' ? st.rcur : -1)

  const fetchPage = async (start) => {
    const load = st.mode === 'artists' ? api.getArtists : api.getAlbumArtists
    const res = await load({
      ParentId: props.library && props.library.Id,
      SortBy: 'SortName',
      SortOrder: st.descending ? 'Descending' : 'Ascending',
      Fields: 'PrimaryImageAspectRatio,SortName',
      StartIndex: start,
      Limit: PAGE,
    })
    const items = itemsOf(res).map((a) => (a.AlbumCount > 0 ? { ...a, Subtitle: countLabel(a.AlbumCount, $L('1 album'), $L('{count} albums')) } : a))
    return { items, total: (res && res.TotalRecordCount) || items.length }
  }
  const reload = async () => {
    const gen = ++my.gen
    st.items = []
    st.loaded = false
    st.complete = false
    st.scrollY = 0
    st.lastIndex = 0
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
    if (my.pending) jump(my.pending)
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
    if (my.pending) jump(my.pending)
  }
  const land = () => {
    if (!st.loaded) return
    my.landed = true
    if (st.items.length) focusIndex(0)
    else st.zone = 'header'
  }
  const focusIndex = (i) => {
    st.zone = 'grid'
    st.cur = i
    st.lastIndex = i
    const r = rowIndexOf(rows(), i)
    const top = layoutY().tops[r]
    const viewH = VIEW_H - headerH()
    st.scrollY = keepInView(st.scrollY, top, top + side + 53, viewH, layoutY().end - viewH)
    if (r >= rows().length - 3) loadMore()
  }
  // The Magic Remote's cursor (app/pointer.js): the header's stops and the letters take focus on
  // hover; an artist in full view too, one the grid would scroll to on a click.
  const point = pointerIn(st, my, props)
  const pointCard = (i) => {
    const top = layoutY().tops[rowIndexOf(rows(), i)] || 0
    if (!wholeInView(st.scrollY, VIEW_H - headerH(), top, top + side + 53)) return
    if (!(st.active && st.zone === 'grid' && st.cur === i)) point(() => focusIndex(i))
  }
  const clickCard = (i) => {
    if (!st.items[i]) return false
    point(() => focusIndex(i))
    return true
  }
  // A letter pages the list in until it turns up, then brings its heading to the top and lands on
  // its first artist.
  const jump = (letter) => {
    const wanted = LETTERS.indexOf(letter)
    const list = rows()
    let row = list.findIndex((rw) => {
      if (!rw.heading) return false
      const at = LETTERS.indexOf(rw.section)
      return st.descending ? at <= wanted : at >= wanted
    })
    if (row < 0 && !st.complete) {
      my.pending = letter
      loadMore()
      return
    }
    my.pending = null
    if (row < 0) {
      for (let r = list.length - 1; r >= 0; r--) {
        if (list[r].heading) {
          row = r
          break
        }
      }
    }
    if (row < 0) return
    const head = layoutY().heads.find((h) => h.r === row)
    const viewH = VIEW_H - headerH()
    if (head) st.scrollY = Math.max(0, Math.min(head.top - 12, Math.max(0, layoutY().end - viewH)))
    st.zone = 'grid'
    st.cur = list[row].start
    st.lastIndex = st.cur
  }

  reload()

  return (
    <view
      ref={(n) => {
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
        } else if (z === 'rail') focusIndex(st.lastIndex)
        return true
      }}
      onRight={() => {
        const z = st.zone
        if (z === 'header') st.hcur = Math.min(stops().length - 1, st.hcur + 1)
        else if (z === 'grid') {
          const r = rowIndexOf(rows(), st.cur)
          if (st.cur === rows()[r].end - 1) {
            st.zone = 'rail'
            st.rcur = Math.max(0, LETTERS.indexOf(rows()[r].section))
          } else focusIndex(gridMove(rows(), r, st.cur, 'right'))
        }
        return true
      }}
      onUp={() => {
        const z = st.zone
        if (z === 'header') props.focusStrip()
        else if (z === 'rail') {
          if (st.rcur > 0) st.rcur = st.rcur - 1
        } else {
          const r = rowIndexOf(rows(), st.cur)
          if (r === 0) {
            st.zone = 'header'
            st.hcur = 0
          } else focusIndex(gridMove(rows(), r, st.cur, 'up'))
        }
        return true
      }}
      onDown={() => {
        const z = st.zone
        if (z === 'header') {
          if (st.items.length) focusIndex(0)
        } else if (z === 'rail') {
          if (st.rcur < LETTERS.length - 1) st.rcur = st.rcur + 1
        } else {
          const next = gridMove(rows(), rowIndexOf(rows(), st.cur), st.cur, 'down')
          if (next != null) focusIndex(next)
        }
        return true
      }}
      onEnter={() => {
        const z = st.zone
        if (z === 'header') {
          const stop = stops()[st.hcur]
          if (stop.id === 'sort') {
            st.descending = !st.descending
            reload()
          } else if (stop.id === 'shuffle') {
            api
              .getItems({ ParentId: props.library && props.library.Id, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'Random', Limit: 300, Fields: 'MediaSources,MediaStreams' })
              .then((res) => playQueue(itemsOf(res), 0))
              .catch(() => {})
          } else if (stop.id !== st.mode) {
            st.mode = stop.id
            reload()
          }
        } else if (z === 'grid') openMusicItem(st.items[st.cur])
        else if (z === 'rail') jump(LETTERS[st.rcur])
        return true
      }}
    >
      <view y={headerH()} width={vw} height={VIEW_H - headerH()} clipping>
        <view y={-st.scrollY} width={vw} height={layoutY().end}>
          <view width={vw} height={layoutY().end}>
            <For each={heads()}>
              {(hd) => (
                <text fontFamily={uiFont('bold')} fontSize={36} x={60} y={hd.y} color={look().accent}>
                  {hd.letter}
                </text>
              )}
            </For>
          </view>
          <view width={vw} height={layoutY().end}>
            <For each={cards()}>
              {(c) => {
                const r = () => rowIndexOf(rows(), c.idx)
                return (
                  <MusicCard
                    x={60 + (c.idx - (rows()[r()] || { start: c.idx }).start) * (side + GAP)}
                    y={layoutY().tops[r()] || 0}
                    card={c}
                    size={side}
                    look={look()}
                    focused={gridSel(c.idx)}
                    onPointerOver={() => pointCard(c.idx)}
                    onPointerClick={() => clickCard(c.idx)}
                  />
                )
              }}
            </For>
          </view>
        </view>
        <view>
          <Show when={st.items.length}>
            <Rail
              x={vw - 86}
              current={currentLetter()}
              focus={railFocus()}
              look={look()}
              onPointerLetter={(i) =>
                point(() => {
                  st.zone = 'rail'
                  st.rcur = i
                })
              }
            />
          </Show>
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
        title={$L('Artists')}
        count={countText()}
        controls={controls()}
        focus={headFocus()}
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
