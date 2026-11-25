import $L from '../../../../services/i18n.js'
import { For, Show, createMemo, onCleanup } from 'solid-js'
import MusicTrackList, { trackRows, trackLayout } from '../MusicTrackList.jsx'
import { ScreenHeader, pointerIn, wholeInView, headerHeight, keepInView, contentWidth } from '../screenParts.jsx'
import { lineY } from '../../books/bookGrid.js'
import { uiFont } from '../../../text.js'
import { hex } from '../../../color.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { TILE_COLORS, countLabel, itemsOf, musicArtUrl, playQueue, playSongFromAlbum, subtitleFor } from '../../../../pages/Music/music.js'
import { shuffled } from '../../../../utils/shuffled.js'

const LIST_LENGTH = 5
const VIEW_H = 999
const NONE = '#00000000'

const songMixes = () => [
  { id: 'everything', eyebrow: $L('Shuffle'), title: $L('Everything'), line: $L('300 songs at random'), query: { SortBy: 'Random', Limit: 300 } },
  { id: 'mostPlayed', eyebrow: $L('Mix'), title: $L('Most Played'), line: $L('Your top 100'), color: TILE_COLORS[4], query: { Filters: 'IsPlayed', SortBy: 'PlayCount,SortName', SortOrder: 'Descending', Limit: 100 } },
  { id: 'fresh', eyebrow: $L('Mix'), title: $L('Fresh Arrivals'), line: $L('The newest 100 songs'), color: TILE_COLORS[7], query: { SortBy: 'DateCreated,SortName', SortOrder: 'Descending', Limit: 100 } },
  { id: 'rediscover', eyebrow: $L('Mix'), title: $L('Rediscover'), line: $L("Favorites you haven't played lately"), color: TILE_COLORS[3], query: { IsFavorite: true, SortBy: 'DatePlayed,SortName', SortOrder: 'Ascending', Limit: 100 }, shuffle: true },
]
const mixQuery = (mix, libraryId) => ({ ParentId: libraryId, IncludeItemTypes: 'Audio', Recursive: true, ...mix.query })

function Mix(props) {
  const look = () => props.look
  const m = () => props.mix
  const fill = () => (m().color ? m().color + 'ff' : look().accent)
  const ink = () => (m().color ? '#ffffffff' : look().onAccent)
  return (
    <view x={m().x} width={m().w} height={225} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick}>
      <view x={-3} y={-3} width={m().w + 6} height={231} borderRadius={27} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view width={m().w} height={225} borderRadius={24} color={fill()} />
      <text fontFamily={uiFont('bold')} fontSize={18} letterSpacing={1.8} x={30} y={27 + lineY(0, 33, 18)} color={ink()} alpha={0.85}>
        {m().eyebrow.toUpperCase()}
      </text>
      <text fontFamily={uiFont('bold')} fontSize={36} x={30} y={27 + 33 + 9 + lineY(0, 33, 36)} maxWidth={m().w - 60} maxLines={1} color={ink()}>
        {m().title}
      </text>
      <text fontFamily={uiFont()} fontSize={21} lineHeight={26.25} x={30} y={27 + 33 + 9 + 33 + 6 + 1} maxWidth={m().w - 60 - 84} color={ink()} alpha={0.85}>
        {m().line}
      </text>
      <view x={m().w - 24 - 72} y={129} width={72} height={72} borderRadius={36} color="#ffffffff">
        <view x={16.5} y={16.5} width={39} height={39} src="icons/core_play_arrow.webp" color="#101010ff" />
      </view>
    </view>
  )
}

export default function SongsScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const mixW = (vw - 120 - 90) / 4
  const listW = (vw - 120 - 60) / 2
  const st = reactive({ count: null, mostPlayed: [], fresh: [], zone: 'mixes', mcur: 0, lcur: 0, rcur: 0, scrollY: 0, active: false })
  const my = { landed: false, alive: true }
  onCleanup(() => (my.alive = false))
  const controls = [{ kind: 'pill', id: 'all', label: $L('All Songs A to Z'), icon: 'core_sort_by_alpha' }]
  const headerH = headerHeight(controls)
  const mixes = songMixes().map((m, i) => ({ ...m, i, x: 60 + i * (mixW + 30), w: mixW }))
  const countText = () => (st.count > 0 ? countLabel(st.count, $L('1 song'), $L('{count} songs')) : '')
  const mostRows = createMemo(() =>
    trackRows(st.mostPlayed, {
      mode: 'art',
      ranked: true,
      artFor: (t) => musicArtUrl(t, 120),
      subtitleFor,
      metaFor: (t) => countLabel((t.UserData && t.UserData.PlayCount) || 0, $L('1 play'), $L('{count} plays')),
    })
  )
  const freshRows = createMemo(() => trackRows(st.fresh, { mode: 'art', artFor: (t) => musicArtUrl(t, 120), subtitleFor }))
  const lists = createMemo(() => {
    const out = []
    if (mostRows().length) out.push({ id: 'most', title: $L('Most Played'), rows: mostRows() })
    if (freshRows().length) out.push({ id: 'fresh', title: $L('Recently Added'), rows: freshRows() })
    return out.map((l, i) => ({ ...l, i, x: 60 + i * (listW + 60) }))
  })
  const listsTop = 24 + 225 + 36
  const focusOf = (i) => (st.active && st.zone === 'list' + i ? (i === 0 ? st.lcur : st.rcur) : -1)

  const land = () => {
    if (st.count === null) return
    my.landed = true
    st.zone = st.count > 0 ? 'mixes' : 'header'
    st.mcur = 0
  }
  const focusList = (i, row) => {
    const list = lists()[i]
    if (!list) return
    st.zone = 'list' + i
    if (i === 0) st.lcur = row
    else st.rcur = row
    const lay = trackLayout(list.rows)
    const top = listsTop + 64 + lay.ys[row]
    const viewH = VIEW_H - headerH
    const end = listsTop + 64 + Math.max(...lists().map((l) => trackLayout(l.rows).total)) + 60
    st.scrollY = keepInView(st.scrollY, top, top + lay.hs[row], viewH, end - viewH)
  }
  const focusMixes = (i) => {
    st.zone = 'mixes'
    st.mcur = i
    st.scrollY = 0
  }
  // The Magic Remote's cursor (app/pointer.js): the header takes focus on hover, and so do a mix and
  // a song while in full view (a mix brings the page back to the top); otherwise a click does.
  const point = pointerIn(st, my, props)
  const pointMix = (i, click) => {
    if (!click && (st.scrollY !== 0 || (st.active && st.zone === 'mixes' && st.mcur === i))) return false
    point(() => focusMixes(i))
    return click
  }
  const pointSong = (l, i, box, click) => {
    const top = listsTop + 64 + box.y
    const cur = l === 0 ? st.lcur : st.rcur
    if (!click && (!wholeInView(st.scrollY, VIEW_H - headerH, top, top + box.h) || (st.active && st.zone === 'list' + l && cur === i))) return false
    point(() => focusList(l, i))
    return click
  }
  ;(async () => {
    const id = props.library && props.library.Id
    const first = (mix) => api.getItems({ ...mixQuery(mix, id), Limit: LIST_LENGTH }).catch(() => null)
    const [MOST, FRESH] = [songMixes()[1], songMixes()[2]]
    const [all, played, newest] = await Promise.all([
      api.getItems({ ParentId: id, IncludeItemTypes: 'Audio', Recursive: true, Limit: 0 }).catch(() => null),
      first(MOST),
      first(FRESH),
    ])
    if (!my.alive) return
    st.mostPlayed = itemsOf(played)
    st.fresh = itemsOf(newest)
    st.count = (all && all.TotalRecordCount) || 0
    if (st.active && !my.landed) land()
  })()

  return (
    <view
      ref={(n) => {
        // Down from the strip does its own landing, so land() doesn't run on the focus that follows.
        n.enterFromStrip = () => {
          my.landed = true
          st.zone = 'header'
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
        if (st.zone === 'mixes') {
          if (st.mcur === 0) props.onEdgeLeft()
          else st.mcur = st.mcur - 1
        } else if (st.zone === 'list0' || st.zone === 'header') props.onEdgeLeft()
        else if (st.zone === 'list1') focusList(0, Math.min(st.rcur, lists()[0].rows.length - 1))
        return true
      }}
      onRight={() => {
        if (st.zone === 'mixes') st.mcur = Math.min(3, st.mcur + 1)
        else if (st.zone === 'list0' && lists()[1]) focusList(1, Math.min(st.lcur, lists()[1].rows.length - 1))
        return true
      }}
      onUp={() => {
        const z = st.zone
        if (z === 'header') props.focusStrip()
        else if (z === 'mixes') st.zone = 'header'
        else {
          const row = z === 'list0' ? st.lcur : st.rcur
          if (row > 0) focusList(z === 'list0' ? 0 : 1, row - 1)
          else focusMixes(z === 'list0' ? 0 : 2)
        }
        return true
      }}
      onDown={() => {
        const z = st.zone
        if (z === 'header') {
          if (st.count > 0) focusMixes(0)
        } else if (z === 'mixes') {
          const target = lists().length > 1 && st.mcur >= 2 ? 1 : 0
          if (lists()[target]) focusList(target, 0)
        } else {
          const i = z === 'list0' ? 0 : 1
          const row = i === 0 ? st.lcur : st.rcur
          if (row < lists()[i].rows.length - 1) focusList(i, row + 1)
        }
        return true
      }}
      onEnter={() => {
        const z = st.zone
        if (z === 'header') props.onOpenSongsGrid()
        else if (z === 'mixes') {
          const mix = songMixes()[st.mcur]
          api
            .getItems({ ...mixQuery(mix, props.library && props.library.Id), Fields: 'MediaSources,MediaStreams' })
            .catch(() => null)
            .then((res) => {
              const tracks = itemsOf(res)
              playQueue(mix.shuffle ? shuffled(tracks) : tracks, 0)
            })
        } else {
          const list = lists()[z === 'list0' ? 0 : 1]
          const row = list && list.rows[z === 'list0' ? st.lcur : st.rcur]
          if (row) playSongFromAlbum(row.raw)
        }
        return true
      }}
    >
      <view y={headerH} width={vw} height={VIEW_H - headerH} clipping>
        <view y={-st.scrollY} width={vw} height={2000} alpha={st.count > 0 ? 1 : 0}>
          <view y={24} width={vw} height={225}>
            <For each={mixes}>{(mx) => <Mix
                  mix={mx}
                  look={look()}
                  focused={st.active && st.zone === 'mixes' && st.mcur === mx.i}
                  onPointerOver={() => pointMix(mx.i, false)}
                  onPointerClick={() => pointMix(mx.i, true)}
                />}</For>
          </view>
          <view width={vw} height={2000}>
            <For each={lists()}>
              {(l) => (
                <view x={l.x} y={listsTop} width={listW} height={1000}>
                  <text fontFamily={uiFont('bold')} fontSize={28} y={lineY((56 - 33) / 2, 33, 28)} color={look().onSurface}>
                    {l.title}
                  </text>
                  <MusicTrackList
                    y={64}
                    rows={l.rows}
                    focus={focusOf(l.i)}
                    w={listW}
                    look={look()}
                    onPointerTrack={(i, box) => pointSong(l.i, i, box, false)}
                    onPointerTrackClick={(i, box) => pointSong(l.i, i, box, true)}
                  />
                </view>
              )}
            </For>
          </view>
        </view>
        <view>
          <Show when={st.count === 0}>
            <text fontFamily={uiFont()} fontSize={20} x={vw / 2} y={48 + 5.8} mountX={0.5} color={look().os(0.5)}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
      <ScreenHeader
        title={$L('Songs')}
        count={countText()}
        controls={controls}
        focus={st.active && st.zone === 'header' ? 0 : -1}
        look={look()}
        onPointerStop={() => point(() => (st.zone = 'header'))}
      />
    </view>
  )
}
