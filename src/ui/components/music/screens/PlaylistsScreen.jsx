import $L from '../../../../services/i18n.js'
import { For, Show, createMemo, createSelector, onCleanup } from 'solid-js'
import MusicTrackList, { trackRows, trackLayout } from '../MusicTrackList.jsx'
import HeroButtons, { heroButtons } from '../HeroButtons.jsx'
import { ScreenHeader, clampText, keepInView, contentWidth } from '../screenParts.jsx'
import { lineY } from '../../books/bookGrid.js'
import { wrapLines } from '../../details/measure.js'
import { uiFont, fontFor } from '../../../text.js'
import { hex } from '../../../color.js'
import { reactive } from '../../../../state/reactive.js'
import { api } from '../../../../services/jellyfinApi.js'
import { formatDuration } from '../../../../utils/helpers.js'
import { filterAudioPlaylists, PLAYLIST_FIELDS, countLabel, itemsOf, musicArtUrl, openMusicItem, playQueue, subtitleFor } from '../../../../pages/Music/music.js'
import { shuffled } from '../../../../utils/shuffled.js'

const PAGE = 100
const SHOW_DELAY = 250
const ROW_H = 90
const LIST_TOP = 73.2 + 18
const LIST_H = 999 - LIST_TOP
const DETAIL_X = 684
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

const playlistMeta = (pl) =>
  [pl.ChildCount > 0 ? countLabel(pl.ChildCount, $L('1 song'), $L('{count} songs')) : '', formatDuration(pl.CumulativeRunTimeTicks || pl.RunTimeTicks)]
    .filter(Boolean)
    .join(' · ')

function Row(props) {
  const look = () => props.look
  const r = () => props.row
  return (
    <view y={r().i * ROW_H} width={570} height={ROW_H}>
      <view width={570} height={ROW_H} borderRadius={18} color={props.focused ? look().os(0.12) : props.shown ? look().accent16 : NONE} />
      <view width={570} height={ROW_H} borderRadius={18} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view x={18} y={12} width={66} height={66} borderRadius={12} color={look().os(0.06)} />
      <view>
        <Show when={!r().art}>
          <view x={34.5} y={28.5} width={33} height={33} src="icons/core_queue_music.webp" color={look().os(0.45)} />
        </Show>
      </view>
      <view>
        <Show when={r().art}>
          <view x={18} y={12} width={66} height={66} borderRadius={12} src={r().art} textureOptions={COVER} />
        </Show>
      </view>
      <text fontFamily={r().nameFont} fontSize={22} x={105} y={lineY((ROW_H - 72) / 2, 33, 22)} maxWidth={447} maxLines={1} color="#ffffffff">
        {r().name}
      </text>
      <text fontFamily={uiFont()} fontSize={19} x={105} y={lineY((ROW_H - 72) / 2 + 33 + 6, 33, 19)} maxWidth={447} maxLines={1} color={look().os(0.65)}>
        {r().meta}
      </text>
    </view>
  )
}

export default function PlaylistsScreen(props) {
  const look = () => props.look
  const vw = contentWidth()
  const detailW = vw - 60 - DETAIL_X
  const st = reactive({
    items: [],
    total: 0,
    loaded: false,
    complete: false,
    shownIndex: 0,
    songs: null,
    zone: 'list',
    cur: 0,
    bcur: 0,
    scur: 0,
    listY: 0,
    detailY: 0,
    active: false,
  })
  const my = { next: 0, busy: false, landed: false, songsFor: null, timer: null, alive: true }
  onCleanup(() => {
    my.alive = false
    clearTimeout(my.timer)
  })

  const count = () => (st.complete ? st.items.length : st.total)
  const countText = () => (count() > 0 ? countLabel(count(), $L('1 playlist'), $L('{count} playlists')) : '')
  const empty = () => st.complete && !st.items.length
  const rows = createMemo((prev) =>
    st.items.map((pl, i) =>
      prev && prev[i] && prev[i].raw === pl
        ? prev[i]
        : { raw: pl, i, name: pl.Name || '', nameFont: fontFor(pl.Name || '', 'bold'), meta: playlistMeta(pl), art: musicArtUrl(pl, 120) }
    )
  )
  const visibleRows = createMemo(() => {
    const first = Math.floor(st.listY / ROW_H) - 2
    const last = Math.ceil((st.listY + LIST_H) / ROW_H) + 2
    return rows().filter((r) => r.i >= first && r.i <= last)
  })
  const shown = () => st.items[st.shownIndex] || null
  const detail = createMemo(() => {
    const pl = shown()
    if (!pl) return null
    const infoW = detailW - 300 - 42
    const lines = Math.max(1, Math.min(2, wrapLines(pl.Name || '', 52, 'bold', infoW).length))
    const meta = playlistMeta(pl)
    const infoH = 33 + 8 + lines * 54.6 + 6 + 33 + 28 + 52
    const topH = Math.max(300, infoH)
    const infoTop = 33 + topH - infoH
    return {
      id: pl.Id,
      art: musicArtUrl(pl, 400),
      artY: 33 + topH - 300,
      title: clampText(pl.Name || '', 52, 'bold', infoW, 2),
      titleFont: fontFor(pl.Name || '', 'bold'),
      titleY: infoTop + 33 + 8 + 3,
      eyebrowY: lineY(infoTop, 33, 18),
      meta,
      metaY: lineY(infoTop + 33 + 8 + lines * 54.6 + 6, 33, 21),
      buttonsY: infoTop + infoH - 52,
      infoW,
      tracksY: 33 + topH + 33,
    }
  })
  const buttons = heroButtons([
    { id: 'play', label: $L('Play'), icon: 'core_play_arrow', primary: true },
    { id: 'shuffle', label: $L('Shuffle'), icon: 'core_shuffle' },
    { id: 'open', label: $L('Open Playlist'), icon: 'core_queue_music' },
  ])
  const songRows = createMemo(() => (st.songs ? trackRows(st.songs, { mode: 'art', artFor: (t) => musicArtUrl(t, 120), subtitleFor }) : []))
  const songLay = createMemo(() => trackLayout(songRows()))
  const listSel = createSelector(() => (st.active && st.zone === 'list' ? st.cur : -1))
  const shownSel = createSelector(() => st.shownIndex)
  const bFocus = () => (st.active && st.zone === 'buttons' ? st.bcur : -1)
  const sFocus = () => (st.active && st.zone === 'songs' ? st.scur : -1)
  const songView = () => {
    const d = detail()
    const top = st.detailY - (d ? d.tracksY : 0)
    return [top - 400, top + 999 + 400]
  }

  const loadSongs = async () => {
    const pl = shown()
    st.songs = null
    st.detailY = 0
    if (!pl) return
    my.songsFor = pl.Id
    try {
      const res = await api.getPlaylistItems(pl.Id)
      if (my.songsFor === pl.Id && my.alive) st.songs = itemsOf(res)
    } catch (e) {
      if (my.songsFor === pl.Id && my.alive) st.songs = []
    }
  }
  const loadPage = async (start) => {
    if (my.busy) return
    my.busy = true
    try {
      const res = await api.getItems({
        Recursive: true,
        IncludeItemTypes: 'Playlist',
        Fields: `${PLAYLIST_FIELDS},CumulativeRunTimeTicks`,
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        StartIndex: start,
        Limit: PAGE,
      })
      const found = await filterAudioPlaylists(itemsOf(res))
      if (!my.alive) return
      st.items = st.items.concat(found)
      st.total = (res && res.TotalRecordCount) || 0
      my.next = start + PAGE
      st.complete = my.next >= st.total
    } catch (e) {
      st.complete = true
    }
    st.loaded = true
    my.busy = false
    // A page that held no audio playlists says nothing yet, so the next one is asked for.
    if (!st.complete && !st.items.length) return loadPage(my.next)
    if (st.items.length && st.songs === null && !my.songsFor) loadSongs()
    if (st.active && !my.landed) land()
  }
  const land = () => {
    if (!st.loaded || (!st.items.length && !st.complete)) return
    my.landed = true
    if (st.items.length) focusRow(0)
    else props.focusStrip()
  }
  const show = (i) => {
    if (i === st.shownIndex && my.songsFor) return
    st.shownIndex = i
    loadSongs()
  }
  const focusRow = (i) => {
    st.zone = 'list'
    st.cur = i
    st.listY = keepInView(st.listY, i * ROW_H, (i + 1) * ROW_H, LIST_H - 48, st.items.length * ROW_H + 48 - LIST_H + 48)
    clearTimeout(my.timer)
    my.timer = setTimeout(() => show(i), SHOW_DELAY)
    if (i >= st.items.length - 5 && !st.complete) loadPage(my.next)
  }
  const focusButtons = (i) => {
    st.zone = 'buttons'
    st.bcur = i
    st.detailY = 0
  }
  const focusSong = (i) => {
    st.zone = 'songs'
    st.scur = i
    const lay = songLay()
    const top = detail().tracksY + lay.ys[i]
    st.detailY = keepInView(st.detailY, top, top + lay.hs[i], 999, detail().tracksY + lay.total + 60 - 999)
  }

  loadPage(0)

  return (
    <view
      ref={(n) => {
        // Down from the strip does its own landing, so land() doesn't run on the focus that follows.
        n.enterFromStrip = () => {
          if (!st.items.length) return false
          my.landed = true
          n.setFocus()
          focusRow(0)
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
        if (st.zone === 'buttons' && st.bcur > 0) st.bcur = st.bcur - 1
        else if (st.zone === 'buttons' || st.zone === 'songs') focusRow(st.shownIndex)
        else if (st.zone === 'list') props.onEdgeLeft()
        return true
      }}
      onRight={() => {
        if (st.zone === 'list') {
          clearTimeout(my.timer)
          show(st.cur)
          focusButtons(0)
        } else if (st.zone === 'buttons' && st.bcur < 2) st.bcur = st.bcur + 1
        return true
      }}
      onUp={() => {
        if (st.zone === 'list') {
          if (st.cur > 0) focusRow(st.cur - 1)
          else props.focusStrip()
        } else if (st.zone === 'buttons') props.focusStrip()
        else if (st.zone === 'songs') {
          if (st.scur > 0) focusSong(st.scur - 1)
          else focusButtons(0)
        }
        return true
      }}
      onDown={() => {
        if (st.zone === 'list') {
          if (st.cur < st.items.length - 1) focusRow(st.cur + 1)
        } else if (st.zone === 'buttons') {
          if (songRows().length) focusSong(0)
        } else if (st.zone === 'songs' && st.scur < songRows().length - 1) focusSong(st.scur + 1)
        return true
      }}
      onEnter={() => {
        if (st.zone === 'list') openMusicItem(st.items[st.cur])
        else if (st.zone === 'buttons') {
          const id = buttons[st.bcur].id
          if (id === 'play') playQueue(st.songs || [], 0)
          else if (id === 'shuffle') playQueue(shuffled(st.songs || []), 0)
          else if (shown()) openMusicItem(shown())
        } else if (st.zone === 'songs') playQueue(st.songs || [], st.scur)
        return true
      }}
    >
      <view>
        <Show when={!empty()}>
          <view x={60} y={LIST_TOP} width={570} height={LIST_H} clipping>
            <view y={18 - st.listY} width={570} height={Math.max(LIST_H, st.items.length * ROW_H + 48)}>
              <For each={visibleRows()}>{(rw) => <Row row={rw} look={look()} focused={listSel(rw.i)} shown={shownSel(rw.i)} />}</For>
            </view>
          </view>
          <ScreenHeader title={$L('Playlists')} count={countText()} look={look()} left={60} />
        </Show>
      </view>
      <view x={DETAIL_X} width={detailW} height={999} clipping>
        <view y={-st.detailY} width={detailW} height={(detail() ? detail().tracksY : 0) + songLay().total + 999}>
          <view width={detailW} height={(detail() ? detail().tracksY : 0) + songLay().total + 999}>
            <Show when={detail()}>
              <view y={detail().artY} width={300} height={300} borderRadius={21} color={look().os(0.08)} />
              <view>
                <Show when={!detail().art}>
                  <view x={75} y={detail().artY + 75} width={150} height={150} src="icons/core_queue_music.webp" color={look().os(0.45)} />
                </Show>
              </view>
              <view>
                <Show when={detail().art} keyed>
                  {(src) => <view y={detail().artY} width={300} height={300} borderRadius={21} src={src} textureOptions={COVER} />}
                </Show>
              </view>
              <text fontFamily={uiFont('bold')} fontSize={18} letterSpacing={1} x={342} y={detail().eyebrowY} color={look().accent}>
                {$L('Playlist').toUpperCase()}
              </text>
              <text
                fontFamily={detail().titleFont}
                fontSize={52}
                lineHeight={54.6}
                letterSpacing={-1}
                maxLines={2}
                maxWidth={detail().infoW}
                x={342}
                y={detail().titleY}
                color={look().onSurface}
              >
                {detail().title}
              </text>
              <text fontFamily={uiFont()} fontSize={21} x={342} y={detail().metaY} maxWidth={detail().infoW} maxLines={1} color={look().os(0.75)}>
                {detail().meta}
              </text>
              <HeroButtons x={342} y={detail().buttonsY} buttons={buttons} focus={bFocus()} look={look()} />
            </Show>
          </view>
          <view width={detailW} height={(detail() ? detail().tracksY : 0) + songLay().total + 999}>
            <Show when={st.songs}>
              <MusicTrackList y={detail() ? detail().tracksY : 0} rows={songRows()} focus={sFocus()} w={detailW} look={look()} view={songView()} />
            </Show>
          </view>
          <view width={detailW} height={(detail() ? detail().tracksY : 0) + songLay().total + 999}>
            <Show when={detail() && !st.songs}>
              <text fontFamily={uiFont()} fontSize={20} x={12} y={detail().tracksY + 12 + 5.8} color={look().os(0.5)}>
                {$L('Loading...')}
              </text>
            </Show>
          </view>
        </view>
      </view>
      <view>
        <Show when={empty()}>
          <ScreenHeader title={$L('Playlists')} count={countText()} look={look()} />
          <text fontFamily={uiFont()} fontSize={20} x={vw / 2} y={73.2 + 48 + 5.8} mountX={0.5} color={look().os(0.5)}>
            {$L('No items found')}
          </text>
        </Show>
      </view>
    </view>
  )
}
