import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import RatingsRow from '../home/RatingsRow.jsx'
import { cssShift, fontFor, normalShift, uiFont } from '../../text.js'
import { shadowColor, theme } from '../../theme.js'
import { rgba } from '../../themeColor.js'
import { hex } from '../../color.js'
import { fontsReady, textWidth } from './measure.js'
import { buildItemImageUrl, getInfoBits } from './shuffleHelpers.js'
import { ACTION, CARD, actionX, cardXs, nearest, panelLayout, pickerLayout, pickerScroll } from './shuffleLayout.js'
import { api, getApiKey, getServerUrl } from '../../../services/jellyfinApi.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { fetchRandomItems, fetchShuffleGenres, fetchShuffleLibraries } from '../../../services/shuffleOverlayService.js'
import { unifiedMode } from './multiServer.js'
import { routeForItem } from '../../../state/libraryRoutes.js'
import { router } from '../../../app/router.js'
import * as settings from '../../../state/settings.js'
import { tx } from '../../fx.js'

// The nav's Shuffle opens this over any page: five random titles, the focused one's details and
// ratings, and the three ways to shuffle again, with a picker for the library and genre ones. App
// mounts it while its overlay is 'shuffle' and closes it on onClose(opened), where opened means a
// card took the viewer to a page that takes focus itself. Its colors come from the theme.
// shortcut: the picker dims the dialog without desaturating it, which the renderer has no cheap way
// to draw.
// shortcut: closing puts focus back wherever the nav enters (Home, or the page's own entry in Reel and
// Mosaic), not on Shuffle. Give the nav styles a way to take focus on a given entry if it should.
const ITEM_LIMIT = 5
const ACTION_IDS = ['library', 'random', 'genres']
const ACTION_LABELS = [() => $L('LIBRARY SHUFFLE'), () => $L('RANDOM SHUFFLE'), () => $L('GENRES SHUFFLE')]
const CLEAR = '#00000000'
const EASE = (duration) => ({ duration, easing: 'ease' })
const DIALOG_SHADOW = { color: shadowColor('#00000073'), x: 0, y: 20, blur: 60, spread: 0 }

export default function ShuffleOverlay(props) {
  const [shown, setShown] = createSignal(false)
  const [fontsIn, setFontsIn] = createSignal(0)
  const [items, setItems] = createSignal([])
  const [selected, setSelected] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal(false)
  const [libraryLabel, setLibraryLabel] = createSignal('')
  const [activeGenre, setActiveGenre] = createSignal('')
  const [pickerOpen, setPickerOpen] = createSignal(false)
  const [pickerKind, setPickerKind] = createSignal('library')
  const [pickerItems, setPickerItems] = createSignal([])
  const [pickerLoading, setPickerLoading] = createSignal(false)
  const [zone, setZone] = createSignal('actions')
  const [card, setCard] = createSignal(0)
  const [action, setAction] = createSignal(1)
  const [pick, setPick] = createSignal(0)
  const [pickTop, setPickTop] = createSignal(0)
  const [ratingsH, setRatingsH] = createSignal(0)
  const bold = uiFont('bold')
  // The theme's colors in the roles the dialog paints. Focused buttons take the theme's focused
  // button fill and ink, with the focus color as their edge; Pixel squares the panels off and Glass
  // keeps a white edge.
  const look = createMemo(() => {
    const th = theme()
    // A theme color at a share of its own opacity (Glass's colors are see-through to begin with).
    const fade = (c, a) => rgba(c, a * (String(c).length === 9 ? parseInt(String(c).slice(7, 9), 16) / 255 : 1))
    const edge = (a) => ({ width: th.isPixel ? 3 : 1, color: hex(th.isPixel ? th.surfaceVariant : th.isGlass ? '#ffffff33' : th.os(a)) })
    return {
      isPixel: th.isPixel,
      r: (v) => (th.isPixel ? 0 : v),
      // The scrims keep the old dimming, in the theme's scrim color.
      scrim: rgba(th.scrim, 0.7),
      dim: rgba(th.scrim, 0.45),
      tl: fade(th.background, 0.96),
      tr: fade(th.surface, 0.95),
      bl: fade(th.surface, 0.96),
      // Glass's surfaceVariant is a faint white, which would leave the corner almost clear.
      br: th.isGlass ? fade(th.surface, 0.93) : fade(th.surfaceVariant, 0.93),
      boxEdge: edge(0.18),
      pickerFill: fade(th.surface, 0.95),
      pickerEdge: edge(0.2),
      infoFill: rgba(th.scrim, 0.34),
      infoEdge: { width: 1, color: hex(th.os(0.12)) },
      badge: th.accentA(0.2),
      primary: th.accentA(0.28),
      button: th.os(0.12),
      focusFill: th.buttonFocused,
      focusInk: th.onButtonFocused,
      halo: { width: 3, color: hex(fade(th.focus, 0.3)) },
      actionHalo: { width: 2, color: hex(fade(th.focus, 0.3)) },
      focusEdge: { width: 1, color: hex(th.focus) },
      tile: th.os(0.08),
      tileEdge: { width: 1, color: hex(th.os(0.15)) },
      ink: th.onSurface,
      soft: th.os(0.9),
      meta: th.textSecondary,
      faint: th.os(0.6),
      empty: th.os(0.78),
      rule: th.os(0.1),
      rule2: th.os(0.12),
    }
  })
  const regular = uiFont()
  const my = { last: 'random', unified: null, gen: 0, pickGen: 0, libraryId: null }

  // The card under focus, or -1 while an action or the picker has it.
  const active = () => (zone() === 'cards' && !pickerOpen() ? card() : -1)
  const showCards = () => !loading() && !error() && items().length > 0
  const badge = createMemo(() => {
    fontsIn()
    const text = $L('RANDOM SHUFFLE')
    return { text, w: 28 + textWidth(text, 20, 'bold', 0.8) }
  })
  const summary = () => (libraryLabel()
    ? `${$L('Library')}: ${libraryLabel()}`
    : activeGenre()
      ? `${$L('Genre')}: ${activeGenre()}`
      : $L('All Libraries'))
  const cards = createMemo(() => {
    if (!showCards()) return []
    const list = items()
    const xs = cardXs(list.length)
    const server = getServerUrl()
    const token = getApiKey()
    return list.map((it, i) => {
      const image = buildItemImageUrl(it, server, token)
      const letter = image ? '' : (it.Name && it.Name.charAt(0)) || '?'
      return { i, x: xs[i], image, letter, letterFont: fontFor(letter, 'bold') }
    })
  })
  const item = () => items()[selected()] || null
  const panel = createMemo(() => panelLayout(getInfoBits(item()).length ? 33 : 0, ratingsH()))
  const title = () => (item() && item().Name) || $L('No items found')
  // The meta line's bits with a bullet between each, 10 either side of it.
  const meta = createMemo(() => {
    fontsIn()
    const out = { texts: [], dots: [] }
    let x = 167
    const dot = textWidth('•', 19)
    getInfoBits(item()).forEach((text, i) => {
      if (i) {
        out.dots.push({ x: x + 10 })
        x += 20 + dot
      }
      out.texts.push({ x, text, font: fontFor(text) })
      x += textWidth(text, 19)
    })
    return out
  })
  const overview = () => (item() && item().Overview) || $L('Discover a random item from your library.')
  const mdb = () => isMdblistEnabled(settings.all())
  // A browser sets a line's glyphs lower in its box than the renderer does (see ui/text.js).
  const sh = {
    c18: cssShift(18), c19: cssShift(19), c20: cssShift(20), c26: cssShift(26), c32: cssShift(32), c44: cssShift(44), c64: cssShift(64),
    n20: normalShift(20), n22: normalShift(22), n23: normalShift(23), n24: normalShift(24),
  }
  // What stands in the card row while there are no cards: the loading or empty line centered in
  // it, or the error line with Try Again after it.
  const placeholder = createMemo(() => {
    fontsIn()
    if (showCards()) return null
    const text = loading() ? $L('Loading your library...') : error() ? $L('Unable to connect to server') : $L('No items found')
    const y = CARD.top + (panel().rowH - 33) / 2 + sh.c26
    const labelW = textWidth(text, 26, 'bold')
    if (!error() || loading()) return { text, x: 960 - labelW / 2, y, retry: null }
    const retry = $L('Try Again')
    const retryW = 34 + textWidth(retry, 20, 'bold')
    const x = 150 + (1620 - labelW - 14 - retryW) / 2
    return { text, x, y, retry: { text: retry, x: x + labelW + 14, w: retryW } }
  })
  const actions = ACTION_IDS.map((id, i) => ({ i, x: actionX(i), label: ACTION_LABELS[i](), primary: i === 1 }))
  const pickerTitle = () => (pickerKind() === 'library' ? $L('Select Library') : $L('Select Genre'))
  const pickerMessage = () => {
    if (pickerLoading()) return $L('Loading...')
    if (!pickerItems().length) return pickerKind() === 'library' ? $L('No libraries found') : $L('No genres found')
    return ''
  }
  const pickerBox = createMemo(() => pickerLayout(pickerItems().length, pickerMessage()))
  const pickerRows = createMemo(() => {
    if (pickerMessage()) return []
    return pickerItems().map((it, i) => {
      const label = (it && (it._shuffleLabel || it.Name)) || String(it)
      return { i, y: i * 56, label, font: fontFor(label) }
    })
  })

  const unified = async () => {
    if (my.unified === null) my.unified = await unifiedMode()
    return my.unified
  }
  const contentType = () => settings.get('shuffleContentType') || 'both'
  const loadItems = async ({ libraryId = null, genreName = null, restoreFocusId = 'random' }) => {
    setLoading(true)
    setError(false)
    const gen = ++my.gen
    try {
      const result = await fetchRandomItems({ api, unifiedMode: await unified(), contentType: contentType(), limit: ITEM_LIMIT, libraryId, genreName })
      if (gen !== my.gen) return
      setItems(result || [])
      setSelected(0)
      my.last = restoreFocusId
    } catch (e) {
      if (gen !== my.gen) return
      setItems([])
      setSelected(0)
      setError(true)
    }
    setLoading(false)
    settle()
  }
  // Once results are in, or the picker shuts, focus lands on the first card, or with none on the
  // control that asked last.
  const settle = () => {
    if (pickerOpen()) return
    if (showCards()) return focusCard(0)
    focusId(my.last)
  }
  const focusId = (id) => {
    if (id === 'retry' && placeholder() && placeholder().retry) return setZone('retry')
    if (id.indexOf('card-') === 0 && showCards()) return focusCard(Number(id.slice(5)))
    setZone('actions')
    setAction(Math.max(0, ACTION_IDS.indexOf(id)))
  }
  const focusCard = (i) => {
    setZone('cards')
    setCard(i)
    setSelected(i)
    my.last = 'card-' + i
  }
  const focusAction = (i) => {
    setZone('actions')
    setAction(i)
    my.last = ACTION_IDS[i]
  }
  const openPicker = async (kind) => {
    setPickerKind(kind)
    setPickerItems([])
    setPickerOpen(true)
    setPickerLoading(true)
    const gen = ++my.pickGen
    try {
      const fetcher = kind === 'library' ? fetchShuffleLibraries : fetchShuffleGenres
      const list = await fetcher({ api, unifiedMode: await unified(), contentType: contentType() })
      if (gen === my.pickGen) setPickerItems(list || [])
    } catch (e) {
      console.error('[shuffle] picker failed', e)
    }
    if (gen !== my.pickGen) return
    setPickerLoading(false)
    // Focus enters the list on its first entry, or on Cancel when it's empty.
    setZone('picker')
    setPick(0)
    setPickTop(0)
  }
  const closePicker = () => {
    my.pickGen++
    setPickerOpen(false)
    setPickerLoading(false)
    settle()
  }
  const choose = (entry) => {
    const library = pickerKind() === 'library'
    my.libraryId = library ? entry.Id : null
    setLibraryLabel(library ? entry._shuffleLabel || entry.Name : '')
    setActiveGenre(library ? '' : entry)
    setPickerOpen(false)
    setPickerItems([])
    // Focus is nowhere until the new picks are in, since there's no first card yet to take it.
    setZone('none')
    loadItems({ libraryId: library ? entry.Id : null, genreName: library ? null : entry, restoreFocusId: library ? 'library' : 'genres' })
  }
  const movePick = (delta) => {
    const last = pickerRows().length
    const next = Math.max(0, Math.min(last, pick() + delta))
    if (next === pick()) return
    setPick(next)
    if (next < last) setPickTop(pickerScroll(next, pickTop(), pickerBox().listH))
  }
  // The overlay goes without handing focus back, since the page that opens takes it.
  const open = (it) => {
    const [path, data] = routeForItem(it)
    router.to(path, data)
    if (props.onClose) props.onClose(true)
  }
  const close = () => props.onClose && props.onClose(false)

  let root
  onMount(() => {
    root.setFocus()
    setShown(true)
    fontsReady().then(() => setFontsIn(fontsIn() + 1))
    loadItems({})
  })

  const lit = (i) => zone() === 'actions' && action() === i
  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      alpha={shown() ? 1 : 0}
      transition={tx({ alpha: EASE(180) })}
      onLeft={() => {
        if (zone() === 'cards') {
          if (card() > 0) focusCard(card() - 1)
          else focusAction(0)
        } else if (zone() === 'actions' && action() > 0) focusAction(action() - 1)
        return true
      }}
      onRight={() => {
        if (zone() === 'cards' && card() < items().length - 1) focusCard(card() + 1)
        else if (zone() === 'actions' && action() < 2) focusAction(action() + 1)
        return true
      }}
      onUp={() => {
        if (zone() === 'picker') return movePick(-1) || true
        if (zone() !== 'actions' || pickerOpen()) return true
        const center = actionX(action()) + ACTION.w / 2
        if (showCards()) focusCard(nearest(center, cards().map((c) => c.x), CARD.w))
        else if (placeholder() && placeholder().retry) {
          setZone('retry')
          my.last = 'retry'
        }
        return true
      }}
      onDown={() => {
        if (zone() === 'picker') return movePick(1) || true
        if (zone() === 'cards') return focusAction(1) || true
        if (zone() === 'retry') {
          const r = placeholder().retry
          focusAction(nearest(r.x + r.w / 2, [0, 1, 2].map(actionX), ACTION.w))
        }
        return true
      }}
      onEnter={() => {
        if (zone() === 'picker') {
          if (pick() >= pickerRows().length) closePicker()
          else choose(pickerItems()[pick()])
          return true
        }
        if (pickerOpen()) return true
        if (zone() === 'cards') open(items()[card()])
        else if (zone() === 'retry') loadItems({ libraryId: my.libraryId || null, genreName: activeGenre() || null, restoreFocusId: my.last })
        else if (action() === 0) openPicker('library')
        else if (action() === 1) loadItems({ restoreFocusId: 'random' })
        else openPicker('genre')
        return true
      }}
      onBack={() => {
        if (pickerOpen()) closePicker()
        else close()
        return true
      }}
    >
      <view width={1920} height={1080} color={look().scrim} />
      <view
        width={1920}
        height={1080}
        pivot={0.5}
        alpha={pickerOpen() ? 0.72 : 1}
        scale={pickerOpen() ? 0.985 : 1}
        transition={tx({ alpha: EASE(180), scale: EASE(180) })}
      >
        <view x={131} y={61} width={1658} height={958} borderRadius={look().r(26)} color={CLEAR} shadow={DIALOG_SHADOW} />
        {/* The dialog's 135 degree wash from top left to bottom right, as four corner colors. */}
        <view
          x={131}
          y={61}
          width={1658}
          height={958}
          borderRadius={look().r(26)}
          colorTl={look().tl}
          colorTr={look().tr}
          colorBl={look().bl}
          colorBr={look().br}
          border={look().boxEdge}
        />
        <view x={150} y={80} width={badge().w} height={49} borderRadius={24.5} color={look().badge}>
          <text fontFamily={bold} fontSize={20} lineHeight={33} letterSpacing={0.8} x={14} y={8 + sh.c20} color={look().ink}>
            {badge().text}
          </text>
        </view>
        <text fontFamily={fontFor(summary())} fontSize={18} lineHeight={33} x={1770} y={88 + sh.c18} mountX={1} color={look().meta}>
          {summary()}
        </text>

        <view>
          <For each={cards()}>
            {(c) => {
              const on = () => c.i === active()
              return (
                <view
                  x={c.x}
                  y={on() ? 137 : 147}
                  width={172}
                  height={260}
                  pivot={0.5}
                  scale={on() ? 1.16 : 1}
                  alpha={on() ? 1 : 0.6}
                  transition={tx({ y: EASE(140), scale: EASE(140), alpha: EASE(140) })}
                >
                  <view x={-3} y={-3} width={180} height={266} borderRadius={17} color={CLEAR} border={look().halo} alpha={on() ? 1 : 0} />
                  <view width={174} height={260} borderRadius={14} color={look().tile} border={look().tileEdge} />
                  <Show when={c.image}>
                    <view x={1} y={1} width={172} height={258} borderRadius={13} src={c.image} />
                  </Show>
                  <Show when={c.letter}>
                    <text fontFamily={c.letterFont} fontSize={64} lineHeight={33} x={87} y={113.5 + sh.c64} mountX={0.5} color={look().faint}>
                      {c.letter}
                    </text>
                  </Show>
                  <view width={174} height={260} borderRadius={14} color={CLEAR} border={look().focusEdge} alpha={on() ? 1 : 0} />
                </view>
              )
            }}
          </For>
        </view>
        <view>
          <Show when={placeholder()}>
            <text fontFamily={bold} fontSize={26} lineHeight={33} x={placeholder().x} y={placeholder().y} color={look().soft}>
              {placeholder().text}
            </text>
          </Show>
        </view>
        <view>
          <Show when={placeholder() && placeholder().retry}>
            <view x={placeholder().retry.x} y={147} width={placeholder().retry.w} height={46}>
              <view width={placeholder().retry.w} height={46} borderRadius={12} color={look().primary} alpha={zone() === 'retry' ? 0 : 1} />
              <view
                width={placeholder().retry.w}
                height={46}
                borderRadius={12}
                color={look().focusFill}
                border={look().focusEdge}
                alpha={zone() === 'retry' ? 1 : 0}
              />
              <text fontFamily={bold} fontSize={20} lineHeight={1} x={17} y={11 + sh.n20} color={zone() === 'retry' ? look().focusInk : look().ink}>
                {placeholder().retry.text}
              </text>
            </view>
          </Show>
        </view>

        <view x={150} y={panel().y} width={1620} height={panel().h} borderRadius={look().r(16)} color={look().infoFill} border={look().infoEdge} />
        <text
          fontFamily={fontFor(title(), 'bold')}
          fontSize={44}
          lineHeight={33}
          x={167}
          y={panel().titleY + sh.c44}
          maxWidth={1586}
          maxLines={1}
          color={look().ink}
        >
          {title()}
        </text>
        <view>
          <For each={meta().texts}>
            {(mt) => (
              <text fontFamily={mt.font} fontSize={19} lineHeight={33} x={mt.x} y={panel().metaY + sh.c19} color={look().meta}>
                {mt.text}
              </text>
            )}
          </For>
        </view>
        <view>
          <For each={meta().dots}>
            {(dt) => (
              <text fontFamily={regular} fontSize={19} lineHeight={33} x={dt.x} y={panel().metaY + sh.c19} color={look().faint}>
                •
              </text>
            )}
          </For>
        </view>
        <RatingsRow
          x={167}
          y={panel().ratingsY}
          item={item()}
          compact
          pluginEnabled={mdb()}
          maxW={1586}
          onLayout={(box) => setRatingsH(box.empty ? 0 : box.h)}
        />
        <text
          fontFamily={fontFor(overview())}
          fontSize={18}
          lineHeight={25.2}
          x={167}
          y={panel().overviewY + sh.c18}
          maxWidth={1586}
          maxLines={4}
          color={look().soft}
        >
          {overview()}
        </text>

        <view>
          <For each={actions}>
            {(a) => (
              <view x={a.x} y={939} width={532} height={61}>
                <view width={532} height={61} borderRadius={14} color={a.primary ? look().primary : look().button} alpha={lit(a.i) ? 0 : 1} transition={{ alpha: { duration: 120 } }} />
                <view x={-2} y={-2} width={536} height={65} borderRadius={16} color={CLEAR} border={look().actionHalo} alpha={lit(a.i) ? 1 : 0} />
                <view
                  width={532}
                  height={61}
                  borderRadius={14}
                  color={look().focusFill}
                  border={look().focusEdge}
                  alpha={lit(a.i) ? 1 : 0}
                  transition={{ alpha: { duration: 120 } }}
                />
                <text fontFamily={bold} fontSize={23} lineHeight={1} x={266} y={17 + sh.n23} mountX={0.5} color={lit(a.i) ? look().focusInk : look().ink} transition={{ color: { duration: 120 } }}>
                  {a.label}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>

      <view width={1920} height={1080} alpha={pickerOpen() ? 1 : 0} transition={tx({ alpha: EASE(180) })}>
        <view width={1920} height={1080} color={look().dim} />
        <view
          x={619}
          y={pickerBox().y + (pickerOpen() ? 0 : 10)}
          width={682}
          height={pickerBox().h}
          pivot={0.5}
          scale={pickerOpen() ? 1 : 0.985}
          transition={tx({ y: EASE(180), scale: EASE(180) })}
        >
          <view width={682} height={pickerBox().h} borderRadius={look().r(20)} color={look().pickerFill} border={look().pickerEdge} />
          <text fontFamily={bold} fontSize={32} lineHeight={33} x={19} y={17 + sh.c32} color={look().ink}>
            {pickerTitle()}
          </text>
          <view x={1} y={66} width={680} height={1} color={look().rule} />
          <view x={1} y={67} width={680} height={pickerBox().listH} clipping>
            <view y={-pickTop()} width={680} height={pickerRows().length * 56}>
              <For each={pickerRows()}>
                {(r) => (
                  <view y={r.y} width={680} height={56}>
                    <view width={680} height={56} color={look().focusFill} alpha={zone() === 'picker' && pick() === r.i ? 1 : 0} />
                    <text
                      fontFamily={r.font}
                      fontSize={24}
                      lineHeight={1}
                      x={18}
                      y={14 + sh.n24}
                      maxWidth={644}
                      maxLines={1}
                      color={zone() === 'picker' && pick() === r.i ? look().focusInk : look().ink}
                    >
                      {r.label}
                    </text>
                  </view>
                )}
              </For>
            </view>
            <text fontFamily={regular} fontSize={22} lineHeight={1} x={18} y={22 + sh.n22} color={look().empty}>
              {pickerMessage()}
            </text>
          </view>
          <view x={1} y={67 + pickerBox().listH} width={680} height={57}>
            <view
              width={680}
              height={57}
              borderRadius={look().isPixel ? 0 : [0, 0, 19, 19]}
              color={look().focusFill}
              alpha={zone() === 'picker' && pick() === pickerRows().length ? 1 : 0}
            />
            <view width={680} height={1} color={look().rule2} />
            <text
              fontFamily={bold}
              fontSize={24}
              lineHeight={1}
              x={18}
              y={15 + sh.n24}
              color={zone() === 'picker' && pick() === pickerRows().length ? look().focusInk : look().ink}
            >
              {$L('Cancel')}
            </text>
          </view>
        </view>
      </view>
    </view>
  )
}
