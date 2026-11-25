import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { tier } from '../../tier.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import * as settings from '../../../state/settings.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import {
  SCOPE_ALL,
  availableScopes,
  bookImageUrl,
  bookProgressMeta,
  bookSubtitle,
  isAudiobookItem,
  isAudiobookLibrary,
  isMixedLibrary,
  matchesScope,
  playedPercent,
  scopeLabel,
  scopedTypes,
  seriesCoverUrls,
  seriesItemCountLabel,
  titlesLabel,
} from '../../../utils/bookLibrary.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import BookShelf from './BookShelf.jsx'
import { TabBar } from './BookControls.jsx'
import { bookCard } from './bookCards.js'
import { ellipsize, textWidth } from './bookText.js'
import { loadBookRow } from './bookLibraryData.js'
import { TITLES, bookMenuItem, formatEyebrow, screenFor } from './bookScreens.js'
import { genreColor, initialsOf } from './bookParts.js'

const INSET = 80
const RECENT_COUNT = 20
const AUTHOR_COUNT = 6
const GENRE_COUNT = 6
const CARD_W = 267
const SECTION = 53 + 73 + 13
const SERIF = 'literata-web'
const SCROLL_PAD = 16
// Reading Room keeps these on every theme.
const ACCENT = '#00a4dc'
const SURFACE = '#1c1c1c'
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const WHITE = (w) => ({ width: w, color: hex('#ffffff') })
const SHELF_PAD = [14, 33, 14, INSET]

// A series with its covers fanned out behind each other, its name and its size under them.
function FanTile(props) {
  const fan = keyed(() => props.tile.fan, (f) => f.k)
  return (
    <view x={props.x} width={285} height={455}>
      <view width={285} height={372} pivot={0.5} transition={{ scale: { duration: 150 } }} scale={props.focused ? 1.03 : 1}>
        <For each={fan.keys()}>
          {(k) => {
            const fc = fan.item(k)
            return (
              <view x={fc().x} y={fc().y} width={234} height={351} borderRadius={13} alpha={fc().alpha} color={props.look.os12}>
                <Show when={fc().url}>
                  <view width={234} height={351} borderRadius={13} src={fc().url} textureOptions={COVER} />
                </Show>
              </view>
            )
          }}
        </For>
        <view x={-4} y={-4} width={293} height={380} borderRadius={17} color={CLEAR} border={WHITE(4)} alpha={props.focused ? 1 : 0} />
      </view>
      <text fontFamily={props.tile.nameFont} fontSize={20} y={394} color={props.look.onSurface}>
        {props.tile.name}
      </text>
      <text fontFamily={uiFont()} fontSize={16} y={429} color={props.look.os60}>
        {props.tile.count}
      </text>
    </view>
  )
}

// A section's See All, a text link that rings on focus.
const SeeAll = (props) => (
  <view x={props.x} y={65} width={79} height={49}>
    <view x={-3} y={-3} width={85} height={55} borderRadius={19} color={CLEAR} border={WHITE(3)} alpha={props.on ? 1 : 0} />
    <text fontFamily={uiFont()} fontSize={18} x={12} y={15} color={props.on ? '#ffffff' : props.look.os(0.7)}>
      {$L('See All')}
    </text>
  </view>
)

// Focus walks a stop per section, each landing near the top of the screen, and a row comes back to
// the card it was left on. The host gets onScreenUp(), onSearch(), openItem(), readItem() and
// openScreen().
export default function ReadingRoomOverview(props) {
  const [scope, setScope] = createSignal(SCOPE_ALL)
  const [recent, setRecent] = createSignal([])
  const [node, setNode] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [onButton, setOnButton] = createSignal(false)
  const [seeAll, setSeeAll] = createSignal(false)
  const [scrollY, setScrollY] = createSignal(0)
  const [contX, setContX] = createSignal(0)
  const [seriesX, setSeriesX] = createSignal(0)
  const [has, setHas] = createSignal(false)
  let lastCols = {}
  const textFont = uiFont()
  const mediumFont = uiFont('medium')
  const boldFont = uiFont('bold')
  const look = () => props.look
  const backdropAlpha = tier.legacy ? 0.35 : 1

  const audioLibrary = () => isAudiobookLibrary(props.library)
  const mixed = createMemo(() => isMixedLibrary(props.library, props.data.counts))
  const scopes = createMemo(() => availableScopes(props.data.counts))
  const activeScope = createMemo(() => (mixed() && scopes().indexOf(scope()) >= 0 ? scope() : SCOPE_ALL))
  const empty = () => props.data.counts.all === 0 && props.data.resume.length === 0
  const header = createMemo(() => {
    const d = props.data
    const name = (props.library && props.library.Name) || $L('Books')
    const series = d.series.length
    const stats = [
      titlesLabel(d.counts.all),
      series ? (series === 1 ? $L('1 series') : $L('{count} series').replace('{count}', series)) : null,
      d.authorCount ? $L('{count} authors').replace('{count}', d.authorCount) : null,
      d.genreCount ? $L('{count} genres').replace('{count}', d.genreCount) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const lines = textWidth(name, 86, 'bold') > 1273 ? 2 : 1
    const h = Math.max(98.9 * lines + 13 + 33, 73)
    return { name, stats, lines, h, searchLabel: audioLibrary() ? $L('Search audiobooks') : $L('Search books') }
  })
  const continueCards = createMemo(() =>
    props.data.resume.map((item, i) => {
      const audio = isAudiobookItem(item)
      const subtitle = bookSubtitle(item)
      const title = item.Name || ''
      const titleLines = Math.min(2, Math.max(1, Math.ceil(textWidth(title, 37, 'bold') / 300)))
      const read = audio ? $L('Listen') : $L('Read')
      return {
        k: item.Id,
        i,
        raw: item,
        x: INSET + i * 633,
        image: bookImageUrl(item._serverUrl || getServerUrl(), item) || '',
        icon: audio ? 'book_headphones_rounded' : 'book_menu_book_rounded',
        coverH: audio ? 200 : 300,
        eyebrow: formatEyebrow(item).toUpperCase(),
        title,
        subtitle: ellipsize(subtitle, 23, 'regular', 300),
        subtitleFont: fontFor(subtitle),
        subtitleY: 33 + 7 + 42.55 * titleLines + 5,
        fill: Math.min(Math.max(playedPercent(item), 0), 100) / 100,
        meta: bookProgressMeta(item) || '',
        read,
        readW: Math.ceil(textWidth(read, 23, 'bold')) + 17 + 33 + 7 + 23,
      }
    }),
  )
  const contList = keyed(continueCards, (c) => c.k)
  const recentCards = createMemo(() => recent().map((item, i) => bookCard(item, i, CARD_W, { showFormat: mixed() })))
  const seriesTiles = createMemo(() =>
    props.data.series.map((item, i) => {
      const base = item._serverUrl || getServerUrl()
      const covers = seriesCoverUrls(base, item)
      const urls = covers.length ? covers : [bookImageUrl(base, item) || '']
      const fan = urls.map((url, c) => ({ k: 'c' + c, url, x: 234 * 0.11 * c, y: 234 * 0.11 * 0.4 * (2 - c), alpha: [1, 0.85, 0.6][c] })).reverse()
      return {
        k: item.Id,
        i,
        raw: item,
        x: INSET + i * (285 + 33),
        fan,
        name: ellipsize(item.Name || '', 20, 'medium', 285),
        nameFont: fontFor(item.Name || '', 'medium'),
        count: seriesItemCountLabel(item.ChildCount || 0),
      }
    }),
  )
  const seriesList = keyed(seriesTiles, (s) => s.k)
  const authorPills = createMemo(() =>
    props.data.authors.slice(0, AUTHOR_COUNT).map((item, i) => {
      const url = item.ImageTags && item.ImageTags.Primary ? bookImageUrl(item._serverUrl || getServerUrl(), item) : ''
      const n = props.data.authorTitles.get(String(item.Name || '').toLowerCase()) || 0
      return {
        k: item.Id || item.Name,
        i,
        raw: item,
        x: (i % 2) * 430,
        y: Math.floor(i / 2) * 127,
        image: url || '',
        initials: url ? '' : initialsOf(item.Name),
        name: ellipsize(item.Name || '', 25, 'medium', 410 - 6 - 13 - 80 - 20 - 30),
        nameFont: fontFor(item.Name || '', 'medium'),
        count: n > 0 ? titlesLabel(n) : '',
      }
    }),
  )
  const authorList = keyed(authorPills, (a) => a.k)
  const genreTiles = createMemo(() => {
    const w = (840 - 40) / 3
    return props.data.genres.slice(0, GENRE_COUNT).map((item, i) => {
      const count = item.ChildCount || 0
      return {
        k: item.Id,
        i,
        raw: item,
        x: (i % 3) * (w + 20),
        y: Math.floor(i / 3) * 190,
        w,
        color: genreColor(item.Name),
        name: ellipsize(item.Name || '', 32, 'bold', w - 66),
        count: count > 0 ? titlesLabel(count) : '',
      }
    })
  })
  const genreList = keyed(genreTiles, (g) => g.k)
  // Every section's top in the scroller and the stops the remote walks, top to bottom.
  const layoutRows = createMemo(() => {
    const out = { stops: [] }
    let y = 27
    out.stops.push({ kind: 'header', y: 0 })
    y += header().h
    out.headerH = y
    if (props.data.resume.length) {
      out.continueY = y
      out.stops.push({ kind: 'continue', y })
      y += SECTION + 14 + 361 + 14
    }
    out.topH = y
    if (empty()) {
      out.emptyY = y
      out.height = y + 400
      return out
    }
    if (props.data.counts.all > 0) {
      out.scopeY = y
      out.stops.push({ kind: 'scope', y })
      y += 53 + 67
    }
    if (recent().length) {
      out.recentY = y
      out.stops.push({ kind: 'recent', y })
      y += SECTION + 14 + recentCards().reduce((h, c) => Math.max(h, c.h + 78), 0) + 14
    }
    if (props.data.series.length) {
      out.seriesY = y
      out.stops.push({ kind: 'series', y })
      y += SECTION + 14 + 455 + 14
    }
    const authors = authorPills().length
    const genres = genreTiles().length
    if (authors || genres) {
      out.gridY = y
      if (authors) out.stops.push({ kind: 'authors', y })
      if (genres) out.stops.push({ kind: 'genres', y })
      y += 53 + 73 + 17 + Math.max(Math.ceil(authors / 2) * 127, Math.ceil(genres / 3) * 190)
    }
    out.height = y + 40
    return out
  })
  const stop = () => layoutRows().stops[node()] || { kind: '' }
  const focusKind = () => (has() ? stop().kind : '')
  const scopeTabs = createMemo(() => scopes().map((id) => ({ id, label: scopeLabel(id) })))
  const browseLabel = () => {
    const n = props.data.counts[activeScope()]
    return n === 1 ? $L('Browse 1 title') : $L('Browse all {count} titles').replace('{count}', n)
  }
  const browseW = () => Math.ceil(textWidth(browseLabel(), 23)) + 26 + 33
  const backdrop = createMemo(() => {
    const first = props.data.resume[0]
    if (!first || settings.get('hideBackdropsInLibraries')) return ''
    const url = bookImageUrl(first._serverUrl || getServerUrl(), first) || ''
    return url && !tier.legacy ? serverBlurredUrl(url, 60) || url : url
  })
  const isCol = createSelector(col)
  const browseFocused = () => focusKind() === 'scope' && (!mixed() || col() === scopeTabs().length)

  let recentGen = 0
  const loadRecent = async () => {
    const want = activeScope()
    const gen = ++recentGen
    const items = await loadBookRow(api, {
      ParentId: props.library.Id,
      IncludeItemTypes: scopedTypes(props.library, want),
      SortBy: 'DateCreated,SortName',
      SortOrder: 'Descending',
      Limit: 60,
      EnableImageTypes: 'Primary',
    })
    if (gen !== recentGen) return
    setRecent(items.filter((item) => matchesScope(item, want)).slice(0, RECENT_COUNT))
  }
  createEffect(on(activeScope, loadRecent))

  const rowScroll = (sx, x, w, contentW) => focusScroll(x, w, sx, 1920, Math.max(0, contentW - 1920))
  const reveal = () => {
    const s = stop()
    setScrollY(s.kind === 'header' ? 0 : Math.max(0, Math.min(s.y - SCROLL_PAD, Math.max(0, layoutRows().height - props.viewH))))
    if (s.kind === 'continue') setContX(rowScroll(contX(), INSET + col() * 633, 600, INSET + continueCards().length * 633))
    if (s.kind === 'series') setSeriesX(rowScroll(seriesX(), INSET + col() * 318, 285, INSET + seriesTiles().length * 318))
  }
  // A row's container enters on the card last focused in it.
  const ROWS = { continue: 1, recent: 1, series: 1 }
  const go = (next, at) => {
    const was = stop().kind
    if (ROWS[was]) lastCols[was] = col()
    const kind = (layoutRows().stops[next] || {}).kind
    batch(() => {
      setNode(next)
      let c = at != null ? at : ROWS[kind] ? lastCols[kind] || 0 : 0
      if (kind === 'scope' && mixed() && at == null) c = Math.max(0, scopes().indexOf(activeScope()))
      setCol(c)
      setSeeAll(false)
      setOnButton(false)
    })
    reveal()
  }
  // The first load lands under the header.
  const land = () => {
    lastCols = {}
    const stops = layoutRows().stops
    batch(() => {
      setNode(stops.length > 1 ? 1 : 0)
      setCol(stop().kind === 'scope' && mixed() ? Math.max(0, scopes().indexOf(activeScope())) : 0)
      setSeeAll(false)
      setOnButton(false)
    })
    reveal()
    setScrollY(0)
  }
  const stopIndex = (kind) => layoutRows().stops.findIndex((s) => s.kind === kind)
  const upFrom = () => {
    if (node() === 0) return props.host.onScreenUp()
    // Beside the authors, Up from the genres goes to whatever sits above both.
    let prev = node() - 1
    if (stop().kind === 'genres' && layoutRows().stops[prev].kind === 'authors') prev--
    go(prev)
  }
  const downFrom = () => {
    const next = node() + 1
    const stops = layoutRows().stops
    if (stop().kind === 'authors' && stops[next] && stops[next].kind === 'genres') return
    if (next < stops.length) go(next)
  }
  const up = () => {
    const k = stop().kind
    if (k === 'continue' && onButton()) return setOnButton(false)
    if ((k === 'recent' || k === 'series') && !seeAll()) return setSeeAll(true)
    if (k === 'authors' && col() >= 2) return setCol(col() - 2)
    if (k === 'genres' && !seeAll()) {
      if (col() >= 3) return setCol(col() - 3)
      return setSeeAll(true)
    }
    upFrom()
  }
  const down = () => {
    const k = stop().kind
    if (k === 'continue' && !onButton()) return setOnButton(true)
    if (seeAll()) return setSeeAll(false)
    // Inside the authors or the genres Down goes to the next row's nearest tile, and past the last
    // row the authors hand on to the genres.
    if (k === 'authors' && Math.floor(col() / 2) < Math.floor((authorPills().length - 1) / 2)) return setCol(Math.min(col() + 2, authorPills().length - 1))
    if (k === 'genres' && Math.floor(col() / 3) < Math.floor((genreTiles().length - 1) / 3)) return setCol(Math.min(col() + 3, genreTiles().length - 1))
    if (k === 'genres') return
    if (k === 'authors') {
      const g = stopIndex('genres')
      return g >= 0 && go(g, 0)
    }
    downFrom()
  }
  const left = () => {
    const k = stop().kind
    if (seeAll()) return
    if (k === 'genres' && col() % 3 === 0) {
      const a = stopIndex('authors')
      if (a >= 0) go(a, Math.min(authorPills().length - 1, Math.floor(col() / 3) * 2 + 1))
      return
    }
    if (k === 'authors' && col() % 2 === 0) return
    if (col() > 0) {
      setCol(col() - 1)
      if (k === 'scope' && col() < scopeTabs().length) setScope(scopeTabs()[col()].id)
      reveal()
    }
  }
  const right = () => {
    const k = stop().kind
    if (seeAll() || k === 'header') return
    if (k === 'authors' && (col() % 2 === 1 || col() === authorPills().length - 1)) {
      const g = stopIndex('genres')
      if (g >= 0) go(g, Math.min(genreTiles().length - 1, Math.floor(col() / 2) * 3))
      return
    }
    const counts = {
      continue: continueCards().length,
      scope: mixed() ? scopeTabs().length + 1 : 1,
      recent: recentCards().length,
      series: seriesTiles().length,
      authors: authorPills().length,
      genres: k === 'genres' && col() % 3 === 2 ? col() + 1 : genreTiles().length,
    }
    if (col() < (counts[k] || 1) - 1) {
      setCol(col() + 1)
      // The format tabs pick as focus moves along them.
      if (k === 'scope' && col() < scopeTabs().length) setScope(scopeTabs()[col()].id)
      reveal()
    }
  }
  const enter = () => {
    const k = stop().kind
    const host = props.host
    const browseAll = () => host.openScreen(screenFor(TITLES, activeScope()))
    if (k === 'header') return host.onSearch()
    if (k === 'continue') {
      const card = continueCards()[col()]
      if (!card) return
      return onButton() ? host.readItem(card.raw) : host.openItem(card.raw)
    }
    if (k === 'scope') {
      if (!mixed() || col() === scopeTabs().length) return browseAll()
      return setScope(scopeTabs()[col()].id)
    }
    if (k === 'recent') return seeAll() ? browseAll() : recentCards()[col()] && host.openItem(recentCards()[col()].raw)
    if (k === 'series') return seeAll() ? host.openScreen({ id: 'series' }) : host.openItem(seriesTiles()[col()].raw)
    if (k === 'authors') return host.openItem(authorPills()[col()].raw)
    if (k === 'genres') return seeAll() ? host.openScreen({ id: 'genres' }) : host.openItem(genreTiles()[col()].raw)
  }
  // The continue cards and the newest titles' covers open the item menu when OK is held.
  const heldItem = () => {
    const k = stop().kind
    if (k === 'continue' && !onButton()) return bookMenuItem((continueCards()[col()] || {}).raw)
    if (k === 'recent' && !seeAll()) return bookMenuItem((recentCards()[col()] || {}).raw)
    return null
  }
  const hold = menuHold(heldItem, enter)
  const key = (fn) => () => {
    fn()
    return true
  }
  const continueTitle = audioLibrary() ? $L('Continue Listening') : $L('Continue Reading')
  const continueCaption = () => $L('{count} in progress').replace('{count}', props.data.resumeTotal)

  return (
    <view
      ref={(n) => {
        n.land = land
        // Picked from the chips, Overview takes Down to its search pill.
        n.landControls = () => {
          lastCols = {}
          go(0)
          return true
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={props.viewH}
      clipping
      onFocusChanged={setHas}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onUp={key(up)}
      onDown={key(down)}
      onLeft={key(left)}
      onRight={key(right)}
      onEnter={key(enter)}
    >
      <view y={-scrollY()} width={1920} height={Math.max(props.viewH, layoutRows().height)}>
        <view width={1920} height={layoutRows().topH} clipping alpha={backdrop() ? 1 : 0}>
          <view>
            <Show when={backdrop()}>
              <view x={-96} y={-30} width={2112} height={layoutRows().topH * 1.1} src={backdrop()} textureOptions={COVER} alpha={backdropAlpha} />
            </Show>
          </view>
          <view width={1920} height={layoutRows().topH * 0.6} colorTop="#0a0a0a33" colorBottom="#0a0a0abf" />
          <view y={layoutRows().topH * 0.6} width={1920} height={layoutRows().topH * 0.4} colorTop="#0a0a0abf" colorBottom="#0a0a0aff" />
        </view>

        <view x={80} y={27} width={1760} height={header().h}>
          <text fontFamily={SERIF} fontSize={86} lineHeight={98.9} letterSpacing={-0.8} y={17} maxWidth={1273} maxLines={2} color={look().onSurface}>
            {header().name}
          </text>
          <text fontFamily={textFont} fontSize={25} y={98.9 * header().lines + 13} color={look().os65}>
            {header().stats}
          </text>
          <view x={1760 - 80 - 434} y={header().h - 73} width={434} height={73}>
            <view width={434} height={73} borderRadius={36.5} color={look().os06} />
            <view
              width={434}
              height={73}
              borderRadius={36.5}
              color={CLEAR}
              border={{ width: 2, color: hex(focusKind() === 'header' ? '#ffffff' : look().os14) }}
            />
            <view x={27} y={20} width={33} height={33} src="icons/book_search_rounded.webp" color={look().os65} />
            <text fontFamily={textFont} fontSize={23} x={77} y={25} color={look().os65}>
              {header().searchLabel}
            </text>
          </view>
        </view>

        <view y={layoutRows().continueY || 0} width={1920} height={528} alpha={layoutRows().continueY != null ? 1 : 0}>
          <text fontFamily={SERIF} fontSize={28} x={80} y={74} color={look().onSurface}>
            {continueTitle}
          </text>
          <text fontFamily={textFont} fontSize={18} x={1900} mountX={1} y={81} color={look().os65}>
            {continueCaption()}
          </text>
          <view y={139} width={1920} height={389} clipping>
            <view x={-contX()} y={14} width={Math.max(1920, INSET + continueCards().length * 633)} height={361}>
              <For each={contList.keys()}>
                {(k) => {
                  const cc = contList.item(k)
                  const here = () => focusKind() === 'continue' && isCol(cc().i)
                  const card = () => here() && !onButton()
                  const btn = () => here() && onButton()
                  return (
                    <view x={cc().x} width={600} height={361} pivot={0.5} transition={{ scale: { duration: 150, easing: 'ease-out' } }} scale={card() ? 1.02 : 1}>
                      <view width={600} height={361} borderRadius={30} color={SURFACE} />
                      <view width={600} height={361} borderRadius={30} color={CLEAR} border={{ width: 2, color: hex(card() ? '#ffffff' : '#ffffff12') }} />
                      <view x={32} y={32} width={200} height={cc().coverH} borderRadius={13} color={look().os12}>
                        <Show
                          when={cc().image}
                          fallback={<view x={80} y={cc().coverH / 2 - 20} width={40} height={40} src={'icons/' + cc().icon + '.webp'} color="#ffffff66" />}
                        >
                          <view width={200} height={cc().coverH} borderRadius={13} src={cc().image} textureOptions={COVER} />
                        </Show>
                      </view>
                      <view x={265} y={32}>
                        <text fontFamily={boldFont} fontSize={18} letterSpacing={2} y={7} color={look().os62}>
                          {cc().eyebrow}
                        </text>
                        <text fontFamily={SERIF} fontSize={37} lineHeight={42.55} y={42} maxWidth={303} maxLines={2} color={look().onSurface}>
                          {cc().title}
                        </text>
                        <text fontFamily={cc().subtitleFont} fontSize={23} y={cc().subtitleY + 5} color="#ffffffa8">
                          {cc().subtitle}
                        </text>
                        <view y={206} width={303} height={7} borderRadius={3.5} color={look().os14}>
                          <view width={303 * cc().fill} height={7} color={ACCENT} />
                        </view>
                        <text fontFamily={textFont} fontSize={20} y={250} color={look().os(0.7)}>
                          {cc().meta}
                        </text>
                        <view x={303 - cc().readW} y={230} width={cc().readW} height={67} pivot={0.5} transition={{ scale: { duration: 150 } }} scale={btn() ? 1.06 : 1}>
                          <view x={-4} y={-4} width={cc().readW + 8} height={75} borderRadius={37.5} color={CLEAR} border={WHITE(4)} alpha={btn() ? 1 : 0} />
                          <view width={cc().readW} height={67} borderRadius={33.5} color={ACCENT} />
                          <view x={17} y={17} width={33} height={33} src="icons/book_play_arrow_rounded.webp" color="#ffffff" />
                          <text fontFamily={boldFont} fontSize={23} x={57} y={21} color="#ffffff">
                            {cc().read}
                          </text>
                        </view>
                      </view>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>

        <view y={(layoutRows().scopeY || 0) + 53} width={1920} height={67} alpha={layoutRows().scopeY != null ? 1 : 0}>
          <TabBar
            x={80}
            y={2}
            alpha={mixed() ? 1 : 0}
            tabs={scopeTabs()}
            active={activeScope()}
            focus={focusKind() === 'scope' && mixed() && col() < scopeTabs().length ? col() : -1}
            look={look()}
          />
          <view x={1920 - 67 - browseW()} width={browseW()} height={67}>
            <view x={-3} y={-3} width={browseW() + 6} height={73} borderRadius={36.5} color={CLEAR} border={WHITE(3)} alpha={browseFocused() ? 1 : 0} />
            <text fontFamily={textFont} fontSize={23} x={13} y={22} color={browseFocused() ? '#ffffff' : look().os75}>
              {browseLabel()}
            </text>
            <view x={browseW() - 46} y={17} width={33} height={33} src="icons/book_chevron_right_rounded.webp" color={look().os75} />
          </view>
        </view>

        <view y={layoutRows().recentY || 0} width={1920} height={600} alpha={recent().length ? 1 : 0}>
          <text fontFamily={SERIF} fontSize={28} x={80} y={74} color={look().onSurface}>
            {$L('Recently Added')}
          </text>
          <SeeAll x={1920 - 20 - 79} on={focusKind() === 'recent' && seeAll()} look={look()} />
          <BookShelf
            y={139}
            cards={recentCards()}
            top
            focus={focusKind() === 'recent' && !seeAll() ? col() : -1}
            gap={33}
            pad={SHELF_PAD}
            viewW={1920}
            look={look()}
            zoom={props.zoom}
          />
        </view>

        <view y={layoutRows().seriesY || 0} width={1920} height={622} alpha={props.data.series.length ? 1 : 0}>
          <text fontFamily={SERIF} fontSize={28} x={80} y={74} color={look().onSurface}>
            {$L('Series')}
          </text>
          <SeeAll x={1920 - 20 - 79} on={focusKind() === 'series' && seeAll()} look={look()} />
          <view y={139} width={1920} height={483} clipping>
            <view x={-seriesX()} y={14} width={Math.max(1920, INSET + seriesTiles().length * 318)} height={455}>
              <For each={seriesList.keys()}>
                {(k) => {
                  const sv = seriesList.item(k)
                  return <FanTile x={sv().x} tile={sv()} look={look()} focused={focusKind() === 'series' && !seeAll() && isCol(sv().i)} />
                }}
              </For>
            </view>
          </view>
        </view>

        <view x={80} y={layoutRows().gridY || 0} width={1760} height={600} alpha={layoutRows().gridY != null ? 1 : 0}>
          <view width={840} height={600} alpha={authorPills().length ? 1 : 0}>
            <text fontFamily={SERIF} fontSize={28} y={74} color={look().onSurface}>
              {$L('Authors')}
            </text>
            <view y={143} width={840} height={400}>
              <For each={authorList.keys()}>
                {(k) => {
                  const ap = authorList.item(k)
                  return (
                    <view x={ap().x} y={ap().y} width={410} height={107}>
                      <view width={410} height={107} borderRadius={53.5} color={SURFACE} />
                      <view width={410} height={107} borderRadius={53.5} color={CLEAR} border={WHITE(3)} alpha={focusKind() === 'authors' && isCol(ap().i) ? 1 : 0} />
                      <view x={16} y={13.5} width={80} height={80} borderRadius={40} color={look().os12}>
                        <text fontFamily={mediumFont} fontSize={27} x={40} mountX={0.5} y={25} color="#ffffffb3">
                          {ap().initials}
                        </text>
                        <Show when={ap().image}>
                          <view width={80} height={80} borderRadius={40} src={ap().image} textureOptions={COVER} />
                        </Show>
                      </view>
                      <text fontFamily={ap().nameFont} fontSize={25} x={116} y={ap().count ? 24 : 40} color={look().onSurface}>
                        {ap().name}
                      </text>
                      <text fontFamily={textFont} fontSize={22} x={116} y={58} color={look().os60}>
                        {ap().count}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
          <view x={authorPills().length ? 920 : 0} width={840} height={600} alpha={genreTiles().length ? 1 : 0}>
            <text fontFamily={SERIF} fontSize={28} y={74} color={look().onSurface}>
              {$L('Genres')}
            </text>
            <SeeAll x={840 - 79} on={focusKind() === 'genres' && seeAll()} look={look()} />
            <view y={143} width={840} height={400}>
              <For each={genreList.keys()}>
                {(k) => {
                  const gt = genreList.item(k)
                  return (
                    <view x={gt().x} y={gt().y} width={gt().w} height={170}>
                      <view width={gt().w} height={170} borderRadius={27} color={gt().color} />
                      <view
                        width={gt().w}
                        height={170}
                        borderRadius={27}
                        color={CLEAR}
                        border={WHITE(3)}
                        alpha={focusKind() === 'genres' && !seeAll() && isCol(gt().i) ? 1 : 0}
                      />
                      <text fontFamily={SERIF} fontSize={32} x={33} y={gt().count ? 47 : 66} color="#ffffff">
                        {gt().name}
                      </text>
                      <text fontFamily={textFont} fontSize={22} x={33} y={96} color="#ffffffad">
                        {gt().count}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>
      </view>
    </view>
  )
}
