import $L from '../../services/i18n.js'
import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import GameGrid from '../../ui/components/games/GameGrid.jsx'
import Keyboard from '../../ui/components/Keyboard.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import BackdropLayer from '../../ui/components/shell/BackdropLayer.jsx'
import { openNativeInput, usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import { fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { NEON_GLOW } from '../../ui/components/library/libraryChrome.js'
import { fallbackHex } from '../../ui/components/games/art.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { theme } from '../../ui/theme.js'
import * as gamesApi from '../../services/gamesApi.js'
import * as settings from '../../state/settings.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { boxArtCell, boxArtNeedsFill, gameDisplayTitle, medianAspect, saveGridAspect, savedGridAspect } from '../../utils/gameArt.js'
import { buildGameIndex, gameIndexMatches, gameQueryWords } from '../../utils/gameBrowse.js'
import { LETTERS, focusOverhang, horizontalCellPad } from '../../utils/gridChrome.js'
import { pageDirection } from '../../utils/keys.js'
import { decodeParam, firstImage, gamePath } from './gameModels.js'

const ALL_LETTER = ''
const LETTER_VALUES = [ALL_LETTER].concat(LETTERS)
const GRID_INSET = 140
const MIN_ROW_GAP = 10
const CARD_WIDTH = 145
const CAPTION_HEIGHT = 70
const GRID_VIEW = 754
// The focused game's block, which the Show Media Details setting takes out of the column.
const INFO_H = 152
const BACKDROP_KINDS = ['snap', 'title', 'boxart']
const ACCENT = '#00a4dc'
const RING = { width: 3, color: hex('#ffffff') }
const LETTER_RING = { width: 1, color: hex(ACCENT) }

const gridGeometry = (gridAspect, viewH = GRID_VIEW) => {
  const cell = boxArtCell(gridAspect)
  const cellAspect = cell.width / cell.height
  const gridWidth = 1920 - GRID_INSET
  const preferredWidth = CARD_WIDTH * cell.width
  const padX = horizontalCellPad(preferredWidth, gridWidth)
  const cols = Math.max(1, Math.floor(gridWidth / (preferredWidth + padX * 2)))
  const cellW = Math.floor(gridWidth / cols)
  const coverW = cellW - padX * 2
  const coverH = Math.round(coverW / cellAspect)
  const cardH = coverH + CAPTION_HEIGHT
  const padY = Math.max(MIN_ROW_GAP, focusOverhang(cardH))
  return { cols, cellW, padX, padY, coverW, coverH, cardH, cellAspect, stride: cardH + padY * 2, viewH }
}

const titleLines = (title, w) => (textWidth(title, 19) > w ? 2 : 1)

export default function GameSystem(props) {
  const st = reactive({
    cards: [],
    geo: gridGeometry(null),
    loading: true,
    error: '',
    zone: 'grid',
    tool: 0,
    letter: ALL_LETTER,
    query: '',
    typing: false,
    focusName: '',
    meta: [],
    metaIcons: [],
    overview: '',
    backdrop: '',
    focused: false,
  })
  const [measured, setMeasured] = createSignal(0)
  const my = { lib: '', focusId: null, detail: null, native: false, detailTimer: null, backdropTimer: null }
  let root
  let grid
  let kb
  const active = () => !props.page || props.page.active()
  const title = props.systemName || decodeParam(props.system) || $L('Games')
  const showDetails = () => settings.get('showMediaDetailsOnLibraryPage') !== false
  const backdrops = () => !settings.get('hideBackdropsInLibraries')
  // Neon Pulse sets the names in its pink, and the details, titles and back glyph in its cyan.
  const neon = () => theme().id === 'neon_pulse'
  const viewH = () => (showDetails() ? GRID_VIEW : GRID_VIEW + INFO_H)

  const letters = createMemo(() => {
    measured()
    getStore().settingsVersion
    let x = 129
    return LETTER_VALUES.map((value, i) => {
      const label = value || $L('All')
      const focused = st.focused && st.zone === 'tools' && st.tool === i + 1
      const bold = focused || st.letter === value
      // 9px of padding and a 1px border each side.
      const w = textWidth(label, 22, bold ? 'bold' : 'medium') + 20
      const at = x
      x += w + 2
      return { label, x: at, w, focused, font: uiFont(bold ? 'bold' : 'medium'), color: bold ? ACCENT : '#ffffffd9' }
    })
  })
  const visible = createMemo(() => {
    const words = gameQueryWords(st.query)
    const list = !words.length && !st.letter ? st.cards : st.cards.filter((c) => gameIndexMatches(c.index, words, st.letter))
    return list.map((c, i) => (c.idx === i ? c : { ...c, idx: i, key: `${c.id}-${i}` }))
  })
  const emptyText = () => {
    if (st.loading) return ''
    if (st.error) return st.error
    return visible().length ? '' : $L('No items found')
  }
  // The placeholder clears while a keyboard has the box.
  const queryText = () => st.query || (st.typing ? '' : $L('Search this library...'))
  const backOn = () => st.focused && st.zone === 'tools' && st.tool === 0

  const focusZone = () => {
    if (st.typing && !my.native && kb) return kb.setFocus()
    if (st.zone === 'grid' && !visible().length) st.zone = 'tools'
    if (st.zone === 'grid' && grid) grid.setFocus()
    else if (root) root.setFocus()
  }

  const load = async () => {
    const lib = decodeParam(props.lib)
    const system = decodeParam(props.system)
    my.lib = lib
    // Every card takes the system's middle box art shape. The grid keeps the shape it had last
    // time and saves any new one, so only a first visit changes shape once the sizes come in.
    fontsReady().then(() => setMeasured(measured() + 1))
    const scope = `${lib}/${system}`
    let gridAspect = savedGridAspect(scope)
    st.geo = gridGeometry(gridAspect, viewH())
    try {
      const [games, aspects] = await Promise.all([
        gamesApi.getGames(lib, system),
        gamesApi.getBoxArtAspects(lib, system).catch(() => null),
        fontsReady(),
      ])
      if (aspects) {
        const median = medianAspect(aspects)
        if (median != null) {
          if (gridAspect == null) gridAspect = median
          const saved = savedGridAspect(scope)
          if (saved == null || Math.abs(saved - median) > 0.01) saveGridAspect(scope, median)
        }
      } else gridAspect = null
      const geo = gridGeometry(gridAspect, viewH())
      st.geo = geo
      st.cards = (games || []).map((g, i) => {
        const name = gameDisplayTitle(g.title, g.fileName)
        // Art shows whole when it's off the grid's shape, or the server sent no size for it.
        const aspect = aspects ? aspects.get(g.id) : null
        return {
          key: `${g.id}-${i}`,
          idx: i,
          id: g.id,
          title: name,
          titleFont: fontFor(name),
          index: buildGameIndex(name, g.fileName),
          bg: fallbackHex(g.id),
          image: gamesApi.gameThumbUrl(lib, g.id),
          contain: gridAspect != null && aspects != null && (aspect == null || boxArtNeedsFill(aspect, geo.cellAspect)),
          innerH: geo.coverH + 6 + titleLines(name, geo.coverW) * 22.8,
          raw: g,
        }
      })
    } catch (e) {
      st.error = (e && e.message) || $L('Failed to load games')
    }
    st.loading = false
    st.zone = 'grid'
    if (active()) focusZone()
  }

  const setDetail = (d) => {
    my.detail = d
    const pieces = []
    if (d) {
      if (d.year) pieces.push({ text: String(d.year) })
      if (d.genre) pieces.push({ text: d.genre })
      if (d.region) pieces.push({ text: d.region })
      if (d.players) pieces.push({ icon: 'game_players', text: String(d.players) })
      if (d.rating) pieces.push({ icon: 'game_rating', text: Number(d.rating).toFixed(1) })
    }
    // An icon sits 4px before its number, and pieces sit 14px apart.
    let x = 70
    const icons = []
    st.meta = pieces.map((p) => {
      if (p.icon) {
        icons.push({ x, src: `icons/${p.icon}.webp` })
        x += 24
      }
      const at = x
      x += textWidth(p.text, 20, 'medium') + 14
      return { x: at, text: p.text, font: fontFor(p.text, 'medium') }
    })
    st.metaIcons = icons
    // The renderer would keep a description's line breaks and runs of spaces, so they fold to one.
    st.overview = ((d && d.overview) || '').replace(/\s+/g, ' ').trim()
  }
  // The row under the title fills in from the full record, which only the focused game is worth
  // asking for. The record for the game before stays until its replacement lands.
  const onGridFocus = (card) => {
    const game = card.raw
    my.focusId = game.id
    st.focusName = card.title
    if (!my.detail || my.detail.id !== game.id) setDetail(null)
    clearTimeout(my.detailTimer)
    my.detailTimer = setTimeout(() => {
      gamesApi
        .getGame(my.lib, game.id)
        .then((full) => my.focusId === game.id && setDetail(full))
        .catch(() => my.focusId === game.id && setDetail(null))
    }, 250)
    // The screenshot stands in for a backdrop, falling back to the title screen and then the
    // cover, since not every rom set carries all three.
    if (!backdrops()) return
    clearTimeout(my.backdropTimer)
    my.backdropTimer = setTimeout(() => {
      firstImage(BACKDROP_KINDS.map((k) => gamesApi.gameThumbUrl(my.lib, game.id, k))).then((url) => {
        if (url && my.focusId === game.id) st.backdrop = url
      })
    }, 250)
  }
  onCleanup(() => {
    clearTimeout(my.detailTimer)
    clearTimeout(my.backdropTimer)
  })
  const onGridSelect = (card) => router.to(gamePath(my.lib, card.raw.id), { game: card.raw })

  const setQuery = (q) => {
    st.query = q
    st.letter = ALL_LETTER
  }
  const onKeyboardClose = () => {
    st.typing = false
    my.native = false
    st.zone = 'search'
    focusZone()
  }
  // The TV's keyboard types into a real input laid over the search box.
  const openNative = () => {
    my.native = true
    const opened = openNativeInput({
      value: st.query,
      rect: { x: 1328, y: 12, w: 502, h: 66 },
      onChange: (text) => setQuery(text),
      onClose: (submitted, key) => {
        onKeyboardClose(submitted)
        // Down out of the search lands on the back button.
        if (key === 'down') {
          st.zone = 'tools'
          st.tool = 0
        }
      },
    })
    if (!opened) onKeyboardClose(false)
  }
  const openSearch = () => {
    st.typing = true
    if (usesNativeKeyboard()) return openNative()
    my.native = false
    kb.open({ value: st.query })
    kb.setFocus()
  }

  const handle = (fn) => () => {
    fn()
    return true
  }
  const up = () => {
    if (st.zone === 'grid') {
      st.zone = 'tools'
      st.tool = 0
    } else if (st.zone === 'tools') st.zone = 'search'
    focusZone()
  }
  const down = () => {
    // Down out of the search lands on the back button rather than skipping into the grid.
    if (st.zone === 'search') {
      st.zone = 'tools'
      st.tool = 0
    } else if (st.zone === 'tools' && visible().length) st.zone = 'grid'
    focusZone()
  }
  const enter = () => {
    if (st.zone === 'search') openSearch()
    else if (st.zone === 'tools') {
      if (st.tool === 0) router.back()
      else st.letter = LETTER_VALUES[st.tool - 1]
    }
  }
  // Page Up and Page Down, and the keys a TV sends for them, page the grid.
  const anyKey = (e) => {
    const dir = pageDirection(e.keyCode)
    if (!dir || st.zone !== 'grid' || !grid) return false
    grid.page(dir)
    return true
  }

  onMount(() => {
    load()
    if (root && active()) root.setFocus()
  })

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#101010"
      forwardFocus={() => {
        if (st.typing && !my.native && kb) {
          kb.setFocus()
          return true
        }
        if (st.zone !== 'grid' || !grid || !visible().length) return false
        grid.setFocus()
        return true
      }}
      onFocusChanged={(has) => (st.focused = has)}
      onUp={handle(up)}
      onDown={handle(down)}
      onLeft={handle(() => st.zone === 'tools' && st.tool > 0 && (st.tool = st.tool - 1))}
      onRight={handle(() => st.zone === 'tools' && st.tool < LETTER_VALUES.length && (st.tool = st.tool + 1))}
      onEnter={handle(enter)}
      // Back leaves the search box first, then the screen.
      onBack={handle(() => (st.typing ? onKeyboardClose(false) : router.back()))}
      onKeyPress={anyKey}
    >
      <view>
        <Show when={backdrops()}>
          <BackdropLayer url={st.backdrop} blur={settings.get('backdropBlurHome')} />
        </Show>
      </view>

      <text
        x={650}
        y={32}
        fontFamily={fontFor(title)}
        fontSize={38}
        lineHeight={33}
        maxWidth={620}
        contain="width"
        textAlign="center"
        maxLines={1}
        textShadow={neon() ? NEON_GLOW : undefined}
        color={neon() ? '#ff2e92' : '#ffffff'}
      >
        {title}
      </text>
      <view x={1270} y={12} width={580} height={66} borderRadius={33} color="#1e1e28b8" />
      <view x={1270} y={12} width={580} height={66} borderRadius={33} color="#00000000" border={RING} alpha={st.focused && st.zone === 'search' ? 1 : 0} />
      <view x={1290} y={31} width={28} height={28} src="icons/game_search.webp" />
      {/* An input clips what doesn't fit rather than cutting it with an ellipsis. */}
      <view x={1331} y={12} width={496} height={66} clipping>
        <text y={18} fontFamily={st.query ? fontFor(st.query) : uiFont()} fontSize={25} lineHeight={33} color={st.query ? '#ffffff' : '#ffffff9e'}>
          {queryText()}
        </text>
      </view>

      <view alpha={showDetails() ? 1 : 0}>
        <text
          x={70}
          y={89}
          fontFamily={fontFor(st.focusName, 'bold')}
          fontSize={29}
          lineHeight={33}
          maxWidth={1780}
          maxLines={1}
          textShadow={neon() ? NEON_GLOW : undefined}
          color={neon() ? '#ff2e92' : '#ffffff'}
        >
          {st.focusName}
        </text>
        <view>
          <For each={st.metaIcons}>
            {(g) => <view x={g.x} y={126.5} width={20} height={20} src={g.src} color={neon() ? '#00e5ff' : '#ffffffb3'} />}
          </For>
        </view>
        <view>
          <For each={st.meta}>
            {(p) => (
              <text x={p.x} y={121} fontFamily={p.font} fontSize={20} lineHeight={33} color={neon() ? '#00e5ff' : '#ffffffb3'}>
                {p.text}
              </text>
            )}
          </For>
        </view>
        <text x={70} y={161} fontFamily={fontFor(st.overview)} fontSize={19} lineHeight={23.75} maxWidth={1780} maxLines={2} color="#ffffffa6">
          {st.overview}
        </text>
      </view>

      <view y={showDetails() ? 0 : -INFO_H} width={1920} height={1080}>
        <view x={70} y={248} width={44} height={44} borderRadius={9} color="#ffffff" alpha={backOn() ? 1 : 0} />
        <view x={77.5} y={255.5} width={29} height={29} src="icons/game_back.webp" color={backOn() ? '#101010' : neon() ? '#00e5ff' : '#ffffff80'} />
        <view>
          <Index each={letters()}>
            {(lt) => (
              <view x={lt().x} y={248} width={lt().w} height={44}>
                <view width={lt().w} height={44} borderRadius={6} color="#00000000" border={LETTER_RING} alpha={lt().focused ? 1 : 0} />
                <text x={lt().w / 2} y={23} mountX={0.5} mountY={0.5} fontFamily={lt().font} fontSize={22} color={lt().color}>
                  {lt().label}
                </text>
              </view>
            )}
          </Index>
        </view>
        <view y={316} width={1920} height={st.geo.viewH} clipping>
          <view alpha={!st.loading && visible().length > 0 ? 1 : 0}>
            <GameGrid ref={(n) => (grid = n)} x={70} items={visible()} geo={st.geo} neon={neon()} onGridFocus={onGridFocus} onGridSelect={onGridSelect} />
          </view>
        </view>
      </view>
      <Spinner x={928} y={showDetails() ? 661 : 585} size={64} alpha={st.loading ? 1 : 0} />
      <text x={960} y={showDetails() ? 693 : 617} mountX={0.5} mountY={0.5} fontFamily={uiFont()} fontSize={28} color="#ffffff80">
        {emptyText()}
      </text>

      <Keyboard
        overlay
        ref={(n) => (kb = n)}
        onKeyboardChange={(text) => setQuery(text)}
        onKeyboardClose={onKeyboardClose}
        onKeyboardNative={openNative}
      />
    </view>
  )
}
