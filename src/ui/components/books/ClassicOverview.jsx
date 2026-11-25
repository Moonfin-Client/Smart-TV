import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSelector, createSignal, on, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import {
  SCOPE_ALL,
  availableScopes,
  bookImageUrl,
  bookProgressMeta,
  bookSeriesEntries,
  bookSubtitle,
  isAudiobookItem,
  isAudiobookLibrary,
  isMixedLibrary,
  matchesScope,
  peopleAuthors,
  playedPercent,
  scopeLabel,
} from '../../../utils/bookLibrary.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import BookShelf from './BookShelf.jsx'
import { bookCard } from './bookCards.js'
import { ellipsize, textWidth } from './bookText.js'
import { CARD_W, avatarCard, byName, chipCard, classicShelves, loadClassicRows, scopedAuthors } from './classicShelves.js'
import { bookMenuItem } from './bookScreens.js'

const HERO_H = 594
const STATS_H = 118
const SCOPE_H = 70
const SHELF_HEAD = 28 + 56 + 6
const SHELF_PAD = [8, 33, 8, 48]
const SCROLL_PAD = 16
// Classic keeps this accent on every theme.
const ACCENT = '#00a4dc'
const CLEAR = '#00000000'
const WHITE_RING = { width: 4, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }
const COVER_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 17, blur: 40, spread: 0 }
const NO_HERO = { none: true, image: '', backdrop: '', eyebrow: '', title: '', subtitle: '', cta: '', ctaW: 0, percent: 0, meta: '', titleY: 0, subtitleY: 0, actionsY: 0, textTop: 0 }

// A shelf of genre chips or author portraits.
function ChipRow(props) {
  const [sx, setSx] = createSignal(0)
  const chip = () => props.row.kind === 'chip'
  const list = keyed(() => props.row.cards, (c) => c.key)
  const index = createMemo(() => {
    const m = {}
    props.row.cards.forEach((c, i) => (m[c.key] = i))
    return m
  })
  const isFocused = createSelector(() => props.focus)
  createEffect(
    on(
      () => props.focus,
      (i) => {
        if (i < 0) return
        const w = props.row.cards[0].w
        const contentW = 48 + props.row.cards.length * (w + 20) - 20 + 33
        setSx(focusScroll(48 + i * (w + 20), w, sx(), 1920, Math.max(0, contentW - 1920)))
      },
    ),
  )
  return (
    <view x={-sx()} y={8} width={48 + props.row.cards.length * ((props.row.cards[0] || { w: 0 }).w + 20) + 33} height={props.row.h}>
      <For each={list.keys()}>
        {(k) => {
          const card = list.item(k)
          const i = () => index()[k]
          const lit = () => isFocused(i())
          return chip() ? (
            <view x={48 + i() * (card().w + 20)} width={250} height={73} pivot={0.5} transition={{ scale: { duration: 150 } }} scale={lit() ? 1.04 : 1}>
              <view width={250} height={73} borderRadius={36.5} color={props.look.os08} />
              <view x={-4} y={-4} width={258} height={81} borderRadius={40.5} color={CLEAR} border={WHITE_RING} alpha={lit() ? 1 : 0} />
              <text fontFamily={card().labelFont} fontSize={22} x={125} mountX={0.5} y={25} color="#ffffff">
                {card().label}
              </text>
            </view>
          ) : (
            <view x={48 + i() * (card().w + 20)} width={198} height={242} pivot={0.5} transition={{ scale: { duration: 150 } }} scale={lit() ? 1.05 : 1}>
              <view
                width={198}
                height={198}
                borderRadius={99}
                color={card().image ? props.look.os06 : props.look.t.surfaceVariant}
                border={{ width: props.look.t.cardBorder.w, color: hex(props.look.t.cardBorder.color) }}
              />
              <Show
                when={card().image}
                fallback={
                  <view width={198} height={198}>
                    <view width={198} height={198} borderRadius={99} colorTop={props.look.accentA(0.25)} colorBottom={CLEAR} />
                    <text
                      fontFamily={card().nameFont}
                      fontSize={20}
                      lineHeight={26}
                      letterSpacing={3}
                      x={16}
                      y={99}
                      mountY={0.5}
                      maxWidth={166}
                      maxLines={4}
                      contain="width"
                      textAlign="center"
                      color={props.look.os50}
                    >
                      {card().name}
                    </text>
                  </view>
                }
              >
                <view
                  width={198}
                  height={198}
                  borderRadius={99}
                  src={card().image}
                  textureOptions={COVER}
                  border={{ width: props.look.t.cardBorder.w, color: hex(props.look.t.cardBorder.color) }}
                />
              </Show>
              <view width={198} height={198} borderRadius={99} color={CLEAR} border={{ width: 4, color: hex(props.look.focus) }} alpha={lit() ? 1 : 0} />
              <text fontFamily={card().titleFont} fontSize={20} x={99} mountX={0.5} y={214} color={props.look.onSurface}>
                {card().title}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}

// Focus walks the hero, the format filter, then a stop per shelf, and a shelf comes back to the card
// it was left on. The host gets onScreenUp(), openItem(item), readItem(item) and openScreen(screen),
// and the node has land().
export default function ClassicOverview(props) {
  const [extra, setExtra] = createSignal(null)
  const [scope, setScope] = createSignal(SCOPE_ALL)
  const [node, setNode] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [seeAll, setSeeAll] = createSignal(false)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  let lastCols = {}
  let landPending = false
  const boldFont = uiFont('bold')
  const textFont = uiFont()
  const mediumFont = uiFont('medium')
  const seeAllLabel = $L('See All')
  const look = () => props.look

  const mixed = createMemo(() => isMixedLibrary(props.library, props.data.counts))
  const scopes = createMemo(() => availableScopes(props.data.counts))
  const series = createMemo(() => {
    const d = props.data
    return scope() === SCOPE_ALL ? d.series : bookSeriesEntries(d.titles.filter((t) => matchesScope(t, scope())), d.folders, props.foldersAsSeries)
  })
  const authors = createMemo(() => {
    const e = extra()
    if (!e) return []
    const artists = props.data.authors.filter((author) => author.Type !== 'Person')
    const credited = peopleAuthors(e.allBooks.concat(e.all), artists.map((a) => String(a.Name || '').toLowerCase()))
    return scopedAuthors(credited.length ? artists.concat(credited).sort(byName) : artists, props.data.titles, scope())
  })
  const featured = createMemo(() => {
    const e = extra()
    return props.data.resume[0] || (e && (e.latestBooks[0] || e.latestAudiobooks[0] || e.latestComics[0])) || null
  })
  const hero = createMemo(() => {
    const item = featured()
    if (!item) return NO_HERO
    const audio = isAudiobookItem(item)
    const percent = playedPercent(item)
    const started = percent > 0
    const url = bookImageUrl(item._serverUrl || getServerUrl(), item) || ''
    let cta = audio ? $L('Listen') : $L('Read')
    if (started) cta = audio ? $L('Continue Listening') : $L('Continue Reading')
    const subtitle = bookSubtitle(item)
    const title = item.Name || ''
    const textW = 1920 - 160 - 53 - 200
    const titleLines = Math.max(1, Math.ceil(textWidth(title, 50, 'bold') / textW))
    const textH = 33 + 10 + 54 * titleLines + (subtitle ? 7 + 33 : 0) + 23 + 63
    return {
      none: false,
      image: url,
      backdrop: url ? serverBlurredUrl(url, 60) || url : '',
      eyebrow: (audio ? $L('Continue Listening') : $L('Continue Reading')).toUpperCase(),
      title,
      titleFont: fontFor(title, 'bold'),
      subtitle: ellipsize(subtitle, 23, 'regular', textW),
      subtitleFont: fontFor(subtitle),
      textTop: HERO_H - 40 - textH,
      titleY: 33 + 10,
      subtitleY: 33 + 10 + 54 * titleLines + 7,
      actionsY: textH - 63,
      cta,
      ctaW: Math.ceil(textWidth(cta, 22, 'bold')) + 54 + 37,
      percent: started ? Math.min(percent, 100) / 100 : 0,
      meta: bookProgressMeta(item) || '',
    }
  })
  const stats = createMemo(() => {
    const d = props.data
    const audioLibrary = isAudiobookLibrary(props.library)
    const list = (mixed()
      ? [
          { label: $L('Books'), count: d.counts.books },
          { label: $L('Audiobooks'), count: d.counts.audiobooks },
          { label: $L('Comics'), count: d.counts.comics },
        ]
      : [{ label: audioLibrary ? $L('Audiobooks') : $L('Books'), count: d.counts.all }]
    )
      .concat([
        { label: $L('Series'), count: series().length },
        { label: $L('Authors'), count: scope() === SCOPE_ALL ? d.authorCount : authors().length },
        { label: $L('Genres'), count: d.genres.length },
      ])
      .filter((s) => s.count > 0)
    const w = (1920 - 96 - 13 * (list.length - 1)) / Math.max(1, list.length)
    return list.map((s, i) => ({ k: s.label, x: 48 + i * (w + 13), w, count: String(s.count), label: s.label.toUpperCase() }))
  })
  const statList = keyed(stats, (s) => s.k)
  const scopeBar = createMemo(() => {
    const w = Math.min(1920 - 96, 700)
    const n = scopes().length
    return {
      x: (1920 - w) / 2,
      w,
      segW: w / n,
      thumbX: (scopes().indexOf(scope()) * w) / n,
      segs: scopes().map((id, i) => ({ k: id, x: (i * w) / n + w / n / 2, label: scopeLabel(id), on: id === scope() })),
    }
  })
  const segs = keyed(() => scopeBar().segs, (s) => s.k)
  // The stops top to bottom with where each sits in the scroller.
  const layoutRows = createMemo(() => {
    const e = extra()
    if (!e) return { stops: [], rows: [], statsY: 0, scopeY: -1, height: 0 }
    const shelves = classicShelves({ library: props.library, scope: scope(), mixed: mixed(), data: props.data, extra: e, series: series(), authors: authors() })
    const stops = []
    let y = 0
    if (!hero().none) {
      stops.push({ kind: 'hero', y: 0 })
      y = HERO_H
    } else y = 94
    const statsY = y
    y += STATS_H
    let scopeY = -1
    if (mixed()) {
      scopeY = y
      stops.push({ kind: 'scope', y })
      y += SCOPE_H
    }
    const rows = shelves.map((shelf, r) => {
      let cards
      if (shelf.kind === 'chip') cards = shelf.items.map(chipCard)
      else if (shelf.kind === 'avatar') cards = shelf.items.map(avatarCard)
      else cards = shelf.items.map((item, i) => bookCard(item, i, CARD_W, { showFormat: shelf.mixFormats }))
      const tallest = cards.reduce((h, c) => Math.max(h, c.h + 78), 0)
      const h = 8 + (shelf.kind === 'chip' ? 73 : shelf.kind === 'avatar' ? CARD_W + 53 : tallest) + 8
      const out = {
        k: shelf.id,
        r,
        y,
        h,
        kind: shelf.kind || '',
        cards,
        title: shelf.title,
        titleFont: fontFor(shelf.title, 'bold'),
        seeAll: shelf.seeAll || null,
        seeAllW: Math.ceil(textWidth(seeAllLabel, 18)) + 24,
      }
      stops.push({ kind: 'row', y, r })
      y += SHELF_HEAD + h
      return out
    })
    return { stops, rows, statsY, scopeY, height: y + 100 }
  })
  const rows = keyed(() => layoutRows().rows, (r) => r.k)
  const stop = () => layoutRows().stops[node()] || null
  const ctaFocused = () => has() && stop() && stop().kind === 'hero'
  const scopeFocused = () => has() && stop() && stop().kind === 'scope'

  onMount(async () => {
    let rowsIn
    try {
      rowsIn = await loadClassicRows(props.library)
    } catch (e) {
      rowsIn = { latestBooks: [], latestAudiobooks: [], latestComics: [], lastPlayed: [], allBooks: [], allAudiobooks: [], allComics: [], all: [] }
    }
    setExtra(rowsIn)
    if (landPending) land()
  })

  // Each stop lands near the top of the screen.
  const reveal = () => {
    const s = stop()
    if (!s) return
    if (s.kind === 'hero') setScrollY(0)
    else setScrollY(Math.max(0, Math.min(s.y - SCROLL_PAD, Math.max(0, layoutRows().height - props.viewH))))
  }
  const go = (next) => {
    const s = stop()
    if (s && s.kind === 'row') lastCols[s.r] = col()
    const to = layoutRows().stops[next]
    batch(() => {
      setNode(next)
      setCol(to && to.kind === 'row' ? lastCols[to.r] || 0 : 0)
      setSeeAll(false)
    })
    reveal()
  }
  const land = () => {
    if (!extra()) {
      landPending = true
      return
    }
    landPending = false
    lastCols = {}
    batch(() => {
      setNode(0)
      setCol(0)
      setSeeAll(false)
    })
    reveal()
  }
  const move = (step) => {
    const next = node() + step
    if (next < 0) return props.host.onScreenUp()
    if (next >= layoutRows().stops.length) return
    go(next)
  }
  const pickScope = (step) => {
    const i = scopes().indexOf(scope())
    const next = scopes()[i + step]
    if (!next) return
    lastCols = {}
    setScope(next)
  }
  const enter = () => {
    const s = stop()
    if (!s) return
    if (s.kind === 'hero') return featured() && props.host.readItem(featured())
    if (s.kind !== 'row') return
    const row = layoutRows().rows[s.r]
    if (seeAll()) return row.seeAll && props.host.openScreen(row.seeAll)
    const card = row.cards[col()]
    if (card) props.host.openItem(card.raw)
  }
  const focusedBook = () => {
    const s = stop()
    if (!s || s.kind !== 'row' || seeAll()) return null
    const row = layoutRows().rows[s.r]
    const card = row && !row.kind ? row.cards[col()] : null
    return card ? bookMenuItem(card.raw) : null
  }
  const hold = menuHold(focusedBook, enter)

  return (
    <view
      ref={(n) => {
        n.land = land
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={props.viewH}
      clipping
      onFocusChanged={setHas}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onUp={() => {
        const s = stop()
        // Up from a shelf with a See All stops there first.
        if (s && s.kind === 'row' && !seeAll() && layoutRows().rows[s.r].seeAll) setSeeAll(true)
        else move(-1)
        return true
      }}
      onDown={() => {
        if (seeAll()) setSeeAll(false)
        else move(1)
        return true
      }}
      onLeft={() => {
        const s = stop()
        if (!s || seeAll()) return true
        if (s.kind === 'scope') pickScope(-1)
        else if (s.kind === 'row' && col() > 0) setCol(col() - 1)
        return true
      }}
      onRight={() => {
        const s = stop()
        if (!s || seeAll()) return true
        if (s.kind === 'scope') pickScope(1)
        else if (s.kind === 'row' && col() < layoutRows().rows[s.r].cards.length - 1) setCol(col() + 1)
        return true
      }}
      onEnter={() => {
        enter()
        return true
      }}
    >
      <view y={-scrollY()} width={1920} height={Math.max(props.viewH, layoutRows().height)} alpha={extra() ? 1 : 0}>
        <view width={1920} height={HERO_H} clipping alpha={extra() && !hero().none ? 1 : 0}>
          <view>
            <Show when={hero().backdrop}>
              <view x={-58} y={-18} width={2036} height={630} src={hero().backdrop} textureOptions={COVER} />
            </Show>
          </view>
          <view width={1920} height={327} colorTop="#0a0a0a40" colorBottom="#0a0a0a99" />
          <view y={327} width={1920} height={267} colorTop="#0a0a0a99" colorBottom="#0a0a0aff" />
          <view x={1640} y={254} width={200} height={300}>
            <view width={200} height={300} borderRadius={15} color={CLEAR} shadow={COVER_SHADOW} />
            <view width={200} height={300} borderRadius={15} color="#ffffff1a" />
            <view>
              <Show when={hero().image}>
                <view width={200} height={300} borderRadius={15} src={hero().image} textureOptions={COVER} />
              </Show>
            </view>
          </view>
          <view x={80} y={hero().textTop}>
            <text fontFamily={boldFont} fontSize={17} letterSpacing={2.3} y={8} color={ACCENT}>
              {hero().eyebrow}
            </text>
            <text fontFamily={hero().titleFont || 'roboto-bold'} fontSize={50} lineHeight={54} y={hero().titleY + 2} maxWidth={1507} color={look().onSurface}>
              {hero().title}
            </text>
            <text fontFamily={hero().subtitleFont || 'roboto'} fontSize={23} y={hero().subtitleY + 5} color={look().os(0.7)}>
              {hero().subtitle}
            </text>
            <view y={hero().actionsY}>
              <view width={hero().ctaW} height={63} pivot={0.5} transition={{ scale: { duration: 150, easing: 'ease-out' } }} scale={ctaFocused() ? 1.06 : 1}>
                <view x={-4} y={-4} width={hero().ctaW + 8} height={71} borderRadius={35.5} color={CLEAR} border={WHITE_RING} alpha={ctaFocused() ? 1 : 0} />
                <view width={hero().ctaW} height={63} borderRadius={31.5} color={ACCENT} />
                <view x={27} y={18} width={27} height={27} src="icons/book_play_arrow.webp" color="#ffffff" />
                <text fontFamily={boldFont} fontSize={22} x={64} y={20} color="#ffffff">
                  {hero().cta}
                </text>
              </view>
              <view x={hero().ctaW + 27} y={29} width={367} height={5} borderRadius={2.5} color={look().os(0.18)} alpha={hero().percent > 0 ? 1 : 0}>
                <view width={367 * hero().percent} height={5} color={ACCENT} />
              </view>
              <text fontFamily={textFont} fontSize={19} x={hero().ctaW + (hero().percent > 0 ? 27 + 367 + 17 : 17)} y={22} color={look().os(0.7)}>
                {hero().meta}
              </text>
            </view>
          </view>
        </view>
        <view y={layoutRows().statsY + 7} width={1920} height={98}>
          <For each={statList.keys()}>
            {(k) => {
              const st = statList.item(k)
              return (
                <view x={st().x} width={st().w} height={98} borderRadius={20} color={look().os06}>
                  <text fontFamily={boldFont} fontSize={28} x={st().w / 2} mountX={0.5} y={16} color={look().onSurface}>
                    {st().count}
                  </text>
                  <text fontFamily={textFont} fontSize={15} letterSpacing={1} x={st().w / 2} mountX={0.5} y={59} color={look().os50}>
                    {st().label}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <view x={scopeBar().x} y={layoutRows().scopeY + 13} width={scopeBar().w} height={57} alpha={mixed() ? 1 : 0}>
          <view x={-4} y={-4} width={scopeBar().w + 8} height={65} borderRadius={32.5} color={CLEAR} border={WHITE_RING} alpha={scopeFocused() ? 1 : 0} />
          <view width={scopeBar().w} height={57} borderRadius={28.5} color={look().os08} />
          <view transition={{ x: { duration: 200, easing: 'ease-out' } }} x={scopeBar().thumbX} width={scopeBar().segW} height={57} borderRadius={28.5} color={ACCENT} />
          <view>
            <For each={segs.keys()}>
              {(k) => {
                const sg = segs.item(k)
                return (
                  <text fontFamily={sg().on ? boldFont : mediumFont} fontSize={22} x={sg().x} mountX={0.5} y={16} color={sg().on ? '#ffffff' : look().os75}>
                    {sg().label}
                  </text>
                )
              }}
            </For>
          </view>
        </view>
        <view>
          <For each={rows.keys()}>
            {(k) => {
              const rw = rows.item(k)
              const here = () => has() && stop() && stop().kind === 'row' && stop().r === rw().r
              const focus = () => (here() && !seeAll() ? col() : -1)
              return (
                <view y={rw().y} width={1920} height={90 + rw().h}>
                  <text fontFamily={rw().titleFont} fontSize={28} x={48} y={41} color={look().onSurface}>
                    {rw().title}
                  </text>
                  <view x={1920 - 12 - rw().seeAllW} y={31.5} alpha={rw().seeAll ? 1 : 0}>
                    <view
                      x={-3}
                      y={-3}
                      width={rw().seeAllW + 6}
                      height={55}
                      borderRadius={19}
                      color={CLEAR}
                      border={{ width: 3, color: hex(look().focus) }}
                      alpha={here() && seeAll() ? 1 : 0}
                    />
                    <text fontFamily={textFont} fontSize={18} x={12} y={15} color={look().os(0.7)}>
                      {seeAllLabel}
                    </text>
                  </view>
                  <view y={90} width={1920} height={rw().h} clipping>
                    <Show
                      when={rw().kind}
                      fallback={<BookShelf cards={rw().cards} top focus={focus()} gap={20} pad={SHELF_PAD} viewW={1920} look={look()} zoom={props.zoom} />}
                    >
                      <ChipRow row={rw()} focus={focus()} look={look()} />
                    </Show>
                  </view>
                </view>
              )
            }}
          </For>
        </view>
        <view>
          <Show when={extra() && !layoutRows().rows.length}>
            <view y={layoutRows().statsY + 118} width={1920}>
              <view x={913} y={107} width={94} height={94} src="icons/book_auto_stories_outlined.webp" color={look().os35} />
              <text fontFamily={boldFont} fontSize={30} x={960} mountX={0.5} y={231} color={look().os(0.85)}>
                {$L('No Books Found')}
              </text>
              <text fontFamily={textFont} fontSize={23} x={960} mountX={0.5} y={282} color={look().os50}>
                {$L('This library does not contain any books, audiobooks, or comics yet.')}
              </text>
            </view>
          </Show>
        </view>
      </view>
    </view>
  )
}
