import $L from '../../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSelector, on, onCleanup } from 'solid-js'
import MusicCard from './MusicCard.jsx'
import MusicTrackList, { trackRows, trackListHeight } from './MusicTrackList.jsx'
import HeroButtons, { heroButtons } from './HeroButtons.jsx'
import MusicFilterPanel from './MusicFilterPanel.jsx'
import MusicSkeleton from './MusicSkeleton.jsx'
import MusicTabBar from './MusicTabBar.jsx'
import { tabBarWidth } from '../books/bookText.js'
import { lineY } from '../books/bookGrid.js'
import { keepInView } from './musicGrid.js'
import { clampText } from './screenParts.jsx'
import { wrapLines } from '../details/measure.js'
import { fitText } from '../library/measure.js'
import { Kept } from '../library/pageKit.js'
import { uiFont, fontFor, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { reactive } from '../../../state/reactive.js'
import { api } from '../../../services/jellyfinApi.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import * as settings from '../../../state/settings.js'
import {
  SEE_ALL_TARGET, itemsOf, mediaCard, musicArtUrl, playQueue, playSongFromAlbum, songSubtitle, subtitleFor, tabList,
  OVERVIEW_TAB, openMusicItem, cardLine, TILE_COLORS,
} from '../../../pages/Music/music.js'

const INSET = 48
const AVAILABLE = 1920 - INSET * 2
const LATEST_GAP = 20
const GENRE_GAP = 16
const SHELF_CARD = 168
const SHELF_STEP = SHELF_CARD + 20
// A focused section's top lands this far under the screen's top, with no glide.
const SCROLL_PAD = 16
const SHELF_IDS = ['albumArtists', 'favorites', 'playlists', 'artists', 'albums']
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const ART_SHADOW = { color: shadowColor('#0000008c'), x: 0, y: 24, blur: 60, spread: 0 }

const columnsFor = (available, gap, step, min, max) => Math.min(max, Math.max(min, Math.floor((available + gap) / step)))
const LATEST_COLS = columnsFor(AVAILABLE, LATEST_GAP, 200, 3, 8)
const LATEST_SIDE = Math.floor((AVAILABLE - LATEST_GAP * (LATEST_COLS - 1)) / LATEST_COLS)
const GENRE_COLS = columnsFor(AVAILABLE, GENRE_GAP, 166, 2, 8)
const GENRE_W = (AVAILABLE - GENRE_GAP * (GENRE_COLS - 1)) / GENRE_COLS

const trackCountLabel = (n) => (n === 1 ? $L('1 track') : $L('{count} tracks').replace('{count}', String(n)))

const buildChain = (s) => {
  const chain = ['tabs']
  if (s.hero) chain.push('play')
  if (s.latest) chain.push('latest')
  if (s.last) chain.push('last')
  if (s.genres) chain.push('genres')
  for (let i = 0; i < s.shelves; i++) chain.push('row:' + i)
  return chain
}

function RoundButton(props) {
  return (
    <view x={props.x} y={18} width={60} height={60}>
      <view x={-3} y={-3} width={66} height={66} borderRadius={33} color={NONE} border={{ width: 3, color: hex(props.look.focus) }} alpha={props.focused ? 1 : 0} />
      <view width={60} height={60} borderRadius={30} color="#00000059" />
      <view x={15} y={15} width={30} height={30} src={props.icon} />
      <view width={60} height={60} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick} />
    </view>
  )
}

function SeeAll(props) {
  return (
    <view x={props.x} y={28 + 3.5} width={props.w} height={49} alpha={props.alpha == null ? 1 : props.alpha}>
      <view x={-3} y={-3} width={props.w + 6} height={55} borderRadius={19} color={NONE} border={{ width: 3, color: hex(props.look.focus) }} alpha={props.focused ? 1 : 0} />
      <text fontFamily={uiFont()} fontSize={18} x={12} y={lineY(8, 33, 18)} color={props.look.os(0.7)}>
        {props.label}
      </text>
      <view width={props.w} height={49} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick} />
    </view>
  )
}

function Shelf(props) {
  const sel = createSelector(() => props.focus)
  const cards = createMemo(() =>
    props.cards.filter((c) => {
      const x = props.x0 + c.idx * SHELF_STEP - props.sx
      return x + SHELF_CARD > -400 && x < props.viewW + 400
    })
  )
  return (
    <view y={props.y} width={props.viewW} height={264} clipping>
      <view x={-props.sx} width={props.x0 + props.cards.length * SHELF_STEP + 60} height={264}>
        <For each={cards()}>
          {(cd) => (
            <MusicCard
              x={props.x0 + cd.idx * SHELF_STEP}
              y={5}
              card={cd}
              size={SHELF_CARD}
              look={props.look}
              focused={sel(cd.idx)}
              pointerRing={props.onPointerCard ? 12 : undefined}
              onPointerClick={props.onPointerCard ? () => props.onPointerCard(cd.idx) : undefined}
            />
          )}
        </For>
      </view>
    </view>
  )
}
export { Shelf as MusicShelf, SHELF_STEP, SHELF_CARD }

export default function ImmersiveMusic(props) {
  const look = () => props.look
  const TABS = tabList()
  const H_SEARCH = TABS.length + 1
  const H_FILTER = TABS.length + 2
  const st = reactive({
    zone: 'header',
    active: false,
    hcur: 1,
    bcur: 0,
    tcur: 0,
    lcur: 0,
    pcur: 0,
    gcur: 0,
    shelf: 0,
    shelfCur: [],
    shelfX: [],
    scrollY: 0,
    album: null,
    albumTracks: [],
    genres: [],
    filterOn: false,
  })
  const my = { albumReq: 0, landed: false, alive: true }
  onCleanup(() => (my.alive = false))
  let root
  let filterRef = null

  const libName = () => (props.library && props.library.Name) || $L('Music')
  const libNameShown = createMemo(() => fitText(libName(), 24, 'bold', 420))
  const tabsX = () => 124 + Math.min(420, Math.ceil(textWidth(libNameShown(), 24, 'bold'))) + 28
  const live = () => st.active && !st.filterOn
  const highlight = () => (st.zone === 'header' && st.hcur >= 1 && st.hcur <= TABS.length ? TABS[st.hcur - 1].id : OVERVIEW_TAB)
  const tabFocus = () => (live() && st.zone === 'header' && st.hcur >= 1 && st.hcur <= TABS.length ? st.hcur - 1 : -1)
  const rowOf = createMemo(() => {
    const map = {}
    ;(props.rows || []).forEach((r) => (map[r.id] = r))
    return map
  })
  const latest = () => rowOf().latestMusic || null
  const last = () => rowOf().lastPlayed || null
  const shelves = createMemo(() => SHELF_IDS.map((id) => rowOf()[id]).filter(Boolean))
  const hero = () => !props.loading && !!props.featured
  const heroItem = () => st.album || props.featured
  const artUrl = createMemo(() => musicArtUrl(heroItem(), 600))
  const backdrop = () => (props.loading || !artUrl() || settings.get('hideBackdropsInLibraries') ? '' : serverBlurredUrl(artUrl(), 40))
  const heroTitle = () => {
    const f = props.featured
    if (st.album && st.album.Name) return st.album.Name
    return f ? (f.Type === 'Audio' ? f.Album || f.Name : f.Name) || '' : ''
  }
  const heroMeta = () => {
    const item = heroItem()
    return [subtitleFor(item), item && item.ProductionYear ? String(item.ProductionYear) : '', st.albumTracks.length ? trackCountLabel(st.albumTracks.length) : '']
      .filter(Boolean)
      .join(' · ')
  }
  const eyebrow = () => (last() ? $L('JUMP BACK IN') : $L('RECENTLY ADDED'))
  const shownTracks = () => st.albumTracks.slice(0, 6)
  const albumRows = createMemo(() => trackRows(shownTracks(), { mode: 'numbered', activeId: props.featured && props.featured.Id }))
  const infoW = () => 1920 - INSET - (INSET + 300 + 40) - (shownTracks().length ? 40 + 480 : 0)
  const heroBox = createMemo(() => {
    const lines = Math.max(1, Math.min(2, wrapLines(heroTitle(), 52, 'bold', infoW()).length))
    const meta = !!heroMeta()
    const infoH = 33 + 8 + lines * 54.6 + (meta ? 8 + 33 : 0) + 24 + 52
    const tracksH = shownTracks().length ? 12 + 43 + shownTracks().length * 51 + 12 : 0
    const contentH = Math.max(300, infoH, tracksH)
    const bottom = 79 + 32 + contentH
    const titleTop = bottom - 52 - 24 - (meta ? 33 + 8 : 0) - lines * 54.6
    return {
      end: bottom + 40,
      artY: bottom - 300,
      buttonsY: bottom - 52,
      metaY: lineY(bottom - 52 - 24 - 33, 33, 16),
      titleY: titleTop + 3,
      eyebrowY: lineY(titleTop - 8 - 33, 33, 13),
      tracksY: bottom - tracksH,
      tracksH,
    }
  })
  const buttons = createMemo(() => {
    const list = [
      { id: 'play', label: $L('Play'), icon: 'mus_play', primary: true },
      { id: 'shuffle', label: $L('Shuffle'), icon: 'nav_shuffle' },
    ]
    if (st.album) {
      const fav = !!(st.album.UserData && st.album.UserData.IsFavorite)
      list.push({ id: 'favorite', label: '', icon: fav ? 'nav_favorites' : 'mus_heart_outline', round: true, on: fav })
    }
    return heroButtons(list)
  })
  const topH = () => (hero() ? heroBox().end : 79)
  const latestCards = createMemo(() => (latest() ? latest().items.slice(0, LATEST_COLS * 2).map((it, i) => mediaCard(it, i)) : []))
  const lastRows = createMemo(() => (last() ? trackRows(last().items.slice(0, 5), { mode: 'art', artFor: (t) => musicArtUrl(t, 120), subtitleFor: songSubtitle }) : []))
  const genreTiles = createMemo(() =>
    st.genres.slice(0, GENRE_COLS).map((g, i) => ({
      i,
      raw: g,
      x: INSET + i * (GENRE_W + GENRE_GAP),
      color: TILE_COLORS[i % TILE_COLORS.length] + 'ff',
      label: fitText(g.Name || '', 18, 'bold', GENRE_W - 24),
      font: fontFor(g.Name || '', 'bold'),
    }))
  )
  const seeAllW = () => Math.ceil(textWidth($L('See All'), 18)) + 24
  const sections = createMemo(() => {
    if (props.loading) return { list: [], at: {}, end: topH() }
    const list = []
    let y = topH()
    if (latest()) {
      const rows = Math.ceil(latestCards().length / LATEST_COLS)
      const h = 28 + 64 + rows * 316 - 20
      list.push({ id: 'latest', y, h })
      y += h
    }
    if (last()) {
      const h = 92 + trackListHeight(lastRows())
      list.push({ id: 'last', y, h })
      y += h
    }
    if (genreTiles().length) {
      list.push({ id: 'genres', y, h: 188 })
      y += 188
    }
    // A card's caption is a line for its name and one for its artist when it has one.
    shelves().forEach((row, i) => {
      const info = row.items.some((it) => cardLine(it)) ? 86 : 53
      const h = 90 + 5 + SHELF_CARD + info + 5
      list.push({ id: 'row:' + i, y, h, row })
      y += h
    })
    const at = {}
    list.forEach((s) => (at[s.id] = s))
    return { list, at, end: y }
  })
  const secY = (id) => (sections().at[id] ? sections().at[id].y : 0)
  const shelfSecs = createMemo((prev) => {
    const old = {}
    ;(prev || []).forEach((s) => (old[s.k] = s))
    return sections()
      .list.filter((s) => s.row)
      .map((s, i) => {
        const was = old[s.row.id]
        if (was && was.row === s.row && was.i === i && was.y === s.y) return was
        return {
          k: s.row.id,
          i,
          y: s.y,
          row: s.row,
          title: s.row.title,
          titleFont: fontFor(s.row.title, 'bold'),
          cards: s.row.items.map((it, n) => mediaCard(it, n, s.row.cardType === 'circle')),
          seeAll: !!SEE_ALL_TARGET[s.row.id],
        }
      })
  })
  const contentH = () => sections().end + 60
  const chain = createMemo(() => buildChain({ hero: hero(), latest: !!latest(), last: !!last(), genres: genreTiles().length > 0, shelves: shelves().length }))
  const at = (zone) => live() && st.zone === zone
  const latestSel = createSelector(() => (at('latest') ? st.lcur : -1))
  const genreSel = createSelector(() => (at('genres') ? st.gcur : -1))

  const loadAlbum = async () => {
    const f = props.featured
    const albumId = f ? (f.Type === 'MusicAlbum' ? f.Id : f.AlbumId) : null
    st.album = null
    st.albumTracks = []
    if (!albumId) return
    const req = ++my.albumReq
    try {
      const [item, tracks] = await Promise.all([api.getItem(albumId), api.getAlbumTracks(albumId)])
      if (req !== my.albumReq || !my.alive) return
      st.album = item
      st.albumTracks = itemsOf(tracks)
    } catch (e) {
      // The hero keeps the featured item's own details.
    }
  }
  const loadGenres = async () => {
    const id = props.library && props.library.Id
    if (!id) return
    try {
      const res = await api.getMusicGenres({ ParentId: id, Limit: 8 })
      if (my.alive && props.library && props.library.Id === id) st.genres = itemsOf(res)
    } catch (e) {
      if (my.alive) st.genres = []
    }
  }
  const nodeTop = (node) => (node === 'tabs' || node === 'play' ? 0 : secY(node))
  const scrollTo = (node) => {
    const max = Math.max(0, contentH() - 1080)
    st.scrollY = Math.max(0, Math.min(max, nodeTop(node) - SCROLL_PAD))
  }
  const focusNode = (node) => {
    scrollTo(node)
    if (node === 'tabs') {
      st.zone = 'header'
      st.hcur = 1
    } else if (node === 'play') {
      st.zone = 'buttons'
      st.bcur = 0
    } else if (node === 'latest') {
      st.zone = 'latest'
      st.lcur = 0
    } else if (node === 'last') {
      st.zone = 'last'
      st.pcur = 0
    } else if (node === 'genres') {
      st.zone = 'genres'
      st.gcur = 0
    } else if (node.indexOf('row:') === 0) {
      st.zone = 'shelf'
      st.shelf = parseInt(node.slice(4), 10)
    }
  }
  const landFirst = () => {
    if (my.landed) return
    my.landed = true
    focusNode(chain()[1] || chain()[0])
  }
  const nodeOfZone = () => {
    const z = st.zone
    if (z === 'header') return 'tabs'
    if (z === 'buttons' || z === 'tracks') return 'play'
    if (z === 'genresAll') return 'genres'
    if (z === 'shelf' || z === 'shelfAll') return 'row:' + st.shelf
    return z
  }
  const step = (direction) => {
    const c = chain()
    const i = c.indexOf(nodeOfZone())
    const next = c[i + (direction === 'up' ? -1 : 1)]
    if (i >= 0 && next) focusNode(next)
  }
  const setShelfCur = (i, cur) => {
    const next = st.shelfCur.slice()
    next[i] = cur
    st.shelfCur = next
    const x = 48 + cur * SHELF_STEP
    const count = (shelfSecs()[i] && shelfSecs()[i].cards.length) || 0
    const contentW = 48 + count * SHELF_STEP - 20 + 20
    const xs = st.shelfX.slice()
    xs[i] = keepInView(st.shelfX[i] || 0, x, x + SHELF_CARD, 1920, contentW - 1920)
    st.shelfX = xs
  }
  // The Magic Remote's cursor (app/pointer.js). Focus scrolls the page to the focused section, so a
  // control takes focus on hover only while its section is where the page already sits; otherwise a
  // click focuses it and presses it. The shelves glide to their focused card, so a card rings and
  // takes focus on a click.
  const point = (fn) => {
    my.landed = true
    fn()
    if (!st.active && root) root.setFocus()
  }
  const sits = (node) => Math.max(0, Math.min(Math.max(0, contentH() - 1080), nodeTop(node) - SCROLL_PAD)) === st.scrollY
  const pointNode = (node, set, click, lit) => {
    if (st.filterOn || (!click && (!sits(node) || lit))) return false
    point(() => {
      focusNode(node)
      if (set) set()
    })
    return click
  }
  const over = (node, set, lit) => () => pointNode(node, set, false, lit && lit())
  const click = (node, set) => () => pointNode(node, set, true)
  const header = (i) => () => {
    st.hcur = i
  }
  const openFilter = () => {
    st.filterOn = true
    if (filterRef) filterRef.setFocus()
  }
  const closeFilter = () => {
    st.zone = 'header'
    st.hcur = H_FILTER
    root.setFocus()
    st.filterOn = false
  }
  const playHero = () => {
    const f = props.featured
    if (!f) return
    if (f.Type === 'Audio') playSongFromAlbum(f, st.albumTracks)
    else if (st.albumTracks.length) playQueue(st.albumTracks, 0)
    else openMusicItem(f)
  }
  const shuffleHero = async () => {
    const f = props.featured
    const parentId = (f && (f.Type === 'MusicAlbum' ? f.Id : f.AlbumId)) || (f && f.Id)
    if (!parentId) return
    const res = await api
      .getItems({ ParentId: parentId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'Random', Limit: 300, Fields: 'MediaSources,MediaStreams' })
      .catch(() => null)
    playQueue(itemsOf(res), 0)
  }
  const toggleFavorite = async () => {
    const album = st.album
    if (!album) return
    const next = !(album.UserData && album.UserData.IsFavorite)
    try {
      await api.setFavorite(album.Id, next)
      if (my.alive && st.album && st.album.Id === album.Id) st.album = { ...album, UserData: { ...(album.UserData || {}), IsFavorite: next } }
    } catch (e) {
      // The heart keeps showing what the server still has.
    }
  }

  createEffect(on(() => props.featured, loadAlbum))
  createEffect(on(() => props.library, loadGenres))
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
        if (z === 'header') st.hcur = Math.max(0, st.hcur - 1)
        else if (z === 'buttons') st.bcur = Math.max(0, st.bcur - 1)
        else if (z === 'tracks') {
          st.zone = 'buttons'
          st.bcur = buttons().length - 1
        } else if (z === 'latest') {
          if (st.lcur % LATEST_COLS > 0) st.lcur = st.lcur - 1
        } else if (z === 'genres') st.gcur = Math.max(0, st.gcur - 1)
        else if (z === 'shelf') {
          const cur = st.shelfCur[st.shelf] || 0
          if (cur > 0) setShelfCur(st.shelf, cur - 1)
        }
        return true
      }}
      onRight={() => {
        const z = st.zone
        if (z === 'header') st.hcur = Math.min(H_FILTER, st.hcur + 1)
        else if (z === 'buttons') {
          if (st.bcur < buttons().length - 1) st.bcur = st.bcur + 1
          else if (shownTracks().length) {
            st.zone = 'tracks'
            st.tcur = 0
          }
        } else if (z === 'latest') {
          if (st.lcur % LATEST_COLS < LATEST_COLS - 1 && st.lcur < latestCards().length - 1) st.lcur = st.lcur + 1
        } else if (z === 'genres') st.gcur = Math.min(genreTiles().length - 1, st.gcur + 1)
        else if (z === 'shelf') {
          const cur = st.shelfCur[st.shelf] || 0
          if (cur < shelfSecs()[st.shelf].cards.length - 1) setShelfCur(st.shelf, cur + 1)
        }
        return true
      }}
      onUp={() => {
        const z = st.zone
        if (z === 'header') return true
        if (z === 'tracks' && st.tcur > 0) st.tcur = st.tcur - 1
        else if (z === 'latest' && st.lcur >= LATEST_COLS) st.lcur = st.lcur - LATEST_COLS
        else if (z === 'last' && st.pcur > 0) st.pcur = st.pcur - 1
        else if (z === 'genres') st.zone = 'genresAll'
        else if (z === 'shelf' && shelfSecs()[st.shelf].seeAll) st.zone = 'shelfAll'
        else step('up')
        return true
      }}
      onDown={() => {
        const z = st.zone
        if (z === 'tracks' && st.tcur < shownTracks().length - 1) st.tcur = st.tcur + 1
        else if (z === 'latest' && st.lcur < LATEST_COLS && latestCards().length > LATEST_COLS) {
          st.lcur = Math.min(st.lcur + LATEST_COLS, latestCards().length - 1)
        } else if (z === 'last' && st.pcur < lastRows().length - 1) st.pcur = st.pcur + 1
        else if (z === 'genresAll') focusNode('genres')
        else if (z === 'shelfAll') {
          scrollTo('row:' + st.shelf)
          st.zone = 'shelf'
        } else step('down')
        return true
      }}
      onEnter={() => {
        const z = st.zone
        if (z === 'header') {
          if (st.hcur === 0) props.onHome()
          else if (st.hcur === H_SEARCH) props.onSearch()
          else if (st.hcur === H_FILTER) openFilter()
          else {
            const id = TABS[st.hcur - 1].id
            if (id !== OVERVIEW_TAB) props.onOpenGrid(id)
          }
        } else if (z === 'buttons') {
          const id = buttons()[st.bcur].id
          if (id === 'play') playHero()
          else if (id === 'shuffle') shuffleHero()
          else if (id === 'favorite') toggleFavorite()
        } else if (z === 'tracks') playQueue(st.albumTracks, st.tcur)
        else if (z === 'latest') openMusicItem(latestCards()[st.lcur].raw)
        else if (z === 'last') playSongFromAlbum(last().items[st.pcur])
        else if (z === 'genres') props.onOpenGenre(genreTiles()[st.gcur].raw)
        else if (z === 'genresAll') props.onOpenGrid('genres')
        else if (z === 'shelfAll') props.onOpenGrid(SEE_ALL_TARGET[shelves()[st.shelf].id])
        else if (z === 'shelf') {
          const it = shelves()[st.shelf].items[st.shelfCur[st.shelf] || 0]
          if (it) openMusicItem(it)
        }
        return true
      }}
    >
      <view y={-st.scrollY} width={1920} height={Math.max(1080, contentH())}>
        <view width={1920} height={Math.max(1080, contentH())}>
          <Show when={backdrop()} keyed>
            {(src) => (
              <view width={1920} height={topH()} clipping>
                <view x={-57.6} y={-0.03 * topH()} width={2035.2} height={topH() * 1.06} src={src} textureOptions={COVER} />
                <view width={1920} height={topH() * 0.65} colorTop="#0a0a0a59" colorBottom="#0a0a0ab3" />
                <view y={topH() * 0.65} width={1920} height={topH() * 0.35 + 1} colorTop="#0a0a0ab3" colorBottom="#0a0a0aff" />
              </view>
            )}
          </Show>
        </view>

        <RoundButton
          x={48}
          icon="icons/nav_home.webp"
          look={look()}
          focused={at('header') && st.hcur === 0}
          onPointerOver={over('tabs', header(0), () => at('header') && st.hcur === 0)}
          onPointerClick={click('tabs', header(0))}
        />
        <text fontFamily={uiFont('bold')} fontSize={24} x={124} y={31 + 4.3} color="#ffffffff">
          {libNameShown()}
        </text>
        <view x={tabsX()} y={16} width={tabBarWidth(TABS, highlight())} height={63} clipping>
          <MusicTabBar
            tabs={TABS}
            active={highlight()}
            focus={tabFocus()}
            look={look()}
            onPointerTab={(i) => over('tabs', header(i + 1), () => tabFocus() === i)()}
            onPointerTabClick={(i) => click('tabs', header(i + 1))()}
          />
        </view>
        <RoundButton
          x={1744}
          icon="icons/nav_search.webp"
          look={look()}
          focused={at('header') && st.hcur === H_SEARCH}
          onPointerOver={over('tabs', header(H_SEARCH), () => at('header') && st.hcur === H_SEARCH)}
          onPointerClick={click('tabs', header(H_SEARCH))}
        />
        <RoundButton
          x={1812}
          icon="icons/mus_filter.webp"
          look={look()}
          focused={at('header') && st.hcur === H_FILTER}
          onPointerOver={over('tabs', header(H_FILTER), () => at('header') && st.hcur === H_FILTER)}
          onPointerClick={click('tabs', header(H_FILTER))}
        />

        <view width={1920} height={topH()} alpha={hero() ? 1 : 0}>
          <view x={48} y={heroBox().artY} width={300} height={300}>
            <view width={300} height={300} borderRadius={16} color={NONE} shadow={ART_SHADOW} />
            <view width={300} height={300} borderRadius={16} color="#ffffff14" />
            <Show when={artUrl()} keyed>
              {(src) => <view width={300} height={300} borderRadius={16} src={src} textureOptions={COVER} />}
            </Show>
          </view>
          <text fontFamily={uiFont('bold')} fontSize={13} letterSpacing={1.6} x={388} y={heroBox().eyebrowY} color={look().accent}>
            {eyebrow()}
          </text>
          <text
            fontFamily={fontFor(heroTitle(), 'bold')}
            fontSize={52}
            lineHeight={54.6}
            letterSpacing={-1}
            maxLines={2}
            maxWidth={infoW()}
            x={388}
            y={heroBox().titleY}
            color="#ffffffff"
          >
            {clampText(heroTitle(), 52, 'bold', infoW(), 2)}
          </text>
          <view>
            <Show when={heroMeta()}>
              <text fontFamily={fontFor(heroMeta())} fontSize={16} x={388} y={heroBox().metaY} maxWidth={infoW()} maxLines={1} color="#ffffffcc">
                {heroMeta()}
              </text>
            </Show>
          </view>
          <HeroButtons
            x={388}
            y={heroBox().buttonsY}
            buttons={buttons()}
            focus={at('buttons') ? st.bcur : -1}
            look={look()}
            onPointerButton={(i) => over('play', () => (st.bcur = i), () => at('buttons') && st.bcur === i)()}
            onPointerButtonClick={(i) => click('play', () => (st.bcur = i))()}
          />
        </view>
        <view width={1920} height={Math.max(1080, contentH())}>
          <Show when={hero() && shownTracks().length}>
            <view x={1392} y={heroBox().tracksY} width={480} height={heroBox().tracksH} borderRadius={16} color="#0000006b">
              <text fontFamily={uiFont('bold')} fontSize={16} letterSpacing={1} x={20} y={16 + 6} color="#ffffffb3">
                {$L('FROM THIS ALBUM')}
              </text>
              <MusicTrackList
                x={12}
                y={55}
                rows={albumRows()}
                focus={at('tracks') ? st.tcur : -1}
                w={456}
                look={look()}
                onPointerTrack={(i) => over('play', () => ((st.zone = 'tracks'), (st.tcur = i)), () => at('tracks') && st.tcur === i)()}
                onPointerTrackClick={(i) => click('play', () => ((st.zone = 'tracks'), (st.tcur = i)))()}
              />
            </view>
          </Show>
        </view>

        <view width={1920} height={Math.max(1080, contentH())}>
          <Show when={props.loading}>
            <MusicSkeleton y={topH()} />
          </Show>
        </view>
        <view width={1920} height={Math.max(1080, contentH())}>
          <Show when={!props.loading && !(props.rows || []).length}>
            <text fontFamily={uiFont()} fontSize={20} x={960} y={topH() + 200 - 12} mountX={0.5} color={look().os(0.5)}>
              {$L('No music items found')}
            </text>
          </Show>
        </view>

        <view y={secY('latest')} width={1920} height={1000} alpha={latest() ? 1 : 0}>
          <text fontFamily={uiFont('bold')} fontSize={28} x={48} y={28 + 11.5 + 2.5} color={look().onSurface}>
            {latest() ? latest().title : ''}
          </text>
          <view x={48} y={92} width={1824} height={700}>
            <For each={latestCards()}>
              {(cd) => (
                <MusicCard
                  x={(cd.idx % LATEST_COLS) * (LATEST_SIDE + LATEST_GAP)}
                  y={Math.floor(cd.idx / LATEST_COLS) * 316}
                  card={cd}
                  size={LATEST_SIDE}
                  look={look()}
                  focused={latestSel(cd.idx)}
                  onPointerOver={over('latest', () => (st.lcur = cd.idx), () => latestSel(cd.idx))}
                  onPointerClick={click('latest', () => (st.lcur = cd.idx))}
                />
              )}
            </For>
          </view>
        </view>

        <view y={secY('last')} width={1920} height={600} alpha={last() ? 1 : 0}>
          <text fontFamily={uiFont('bold')} fontSize={28} x={48} y={28 + 11.5 + 2.5} color={look().onSurface}>
            {$L('Last Played')}
          </text>
          <MusicTrackList
            x={48}
            y={92}
            rows={lastRows()}
            focus={at('last') ? st.pcur : -1}
            w={1824}
            look={look()}
            onPointerTrack={(i) => over('last', () => (st.pcur = i), () => at('last') && st.pcur === i)()}
            onPointerTrackClick={(i) => click('last', () => (st.pcur = i))()}
          />
        </view>

        <view y={secY('genres')} width={1920} height={188} alpha={genreTiles().length ? 1 : 0}>
          <text fontFamily={uiFont('bold')} fontSize={28} x={48} y={28 + 11.5 + 2.5} color={look().onSurface}>
            {$L('Browse By Genre')}
          </text>
          <SeeAll
            x={1872 - seeAllW()}
            w={seeAllW()}
            label={$L('See All')}
            look={look()}
            focused={at('genresAll')}
            onPointerOver={over('genres', () => (st.zone = 'genresAll'), () => at('genresAll'))}
            onPointerClick={click('genres', () => (st.zone = 'genresAll'))}
          />
          <view>
            <For each={genreTiles()}>
              {(gt) => (
                <view
                  x={gt.x}
                  y={92}
                  width={GENRE_W}
                  height={96}
                  onPointerOver={over('genres', () => (st.gcur = gt.i), () => genreSel(gt.i))}
                  onPointerClick={click('genres', () => (st.gcur = gt.i))}
                >
                  <view x={-3} y={-3} width={GENRE_W + 6} height={102} borderRadius={17} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={genreSel(gt.i) ? 1 : 0} />
                  <view width={GENRE_W} height={96} borderRadius={14} color={gt.color} />
                  <text fontFamily={gt.font} fontSize={18} x={12} y={lineY(96 - 12 - 33, 33, 18)} color="#ffffffff">
                    {gt.label}
                  </text>
                </view>
              )}
            </For>
          </view>
        </view>

        <view width={1920} height={Math.max(1080, contentH())}>
          <For each={shelfSecs()}>
            {(sh) => (
              <view y={sh.y} width={1920} height={400}>
                <text fontFamily={sh.titleFont} fontSize={28} x={48} y={28 + 11.5 + 2.5} color={look().onSurface}>
                  {sh.title}
                </text>
                <SeeAll
                  x={1908 - seeAllW()}
                  w={seeAllW()}
                  label={$L('See All')}
                  look={look()}
                  alpha={sh.seeAll ? 1 : 0}
                  focused={at('shelfAll') && st.shelf === sh.i}
                  onPointerOver={() => sh.seeAll && over('row:' + sh.i, () => (st.zone = 'shelfAll'), () => at('shelfAll') && st.shelf === sh.i)()}
                  onPointerClick={() => sh.seeAll && click('row:' + sh.i, () => (st.zone = 'shelfAll'))()}
                />
                <Shelf
                  y={90}
                  x0={48}
                  viewW={1920}
                  cards={sh.cards}
                  look={look()}
                  sx={st.shelfX[sh.i] || 0}
                  focus={at('shelf') && st.shelf === sh.i ? st.shelfCur[sh.i] || 0 : -1}
                  onPointerCard={(idx) => click('row:' + sh.i, () => setShelfCur(sh.i, idx))()}
                />
              </view>
            )}
          </For>
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
