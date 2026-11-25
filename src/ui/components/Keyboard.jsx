import { For, batch, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { uiFont, fontFor } from '../text.js'
import { lc, theme, shadowColor } from '../theme.js'
import { hex } from '../color.js'
import { hex2 } from '../themeColor.js'
import * as settings from '../../state/settings.js'
import { toRgbTriplet, inkOn } from '../../theme/themeSpec.js'
import { glows, motion, rawTheme, textWidth } from './account/look.js'
import { getKeyboardStyleOptions } from './account/keyboardStyles.js'
import {
  NUMERIC_LAYOUT,
  NUMBER_PAD_LAYOUT,
  DOCKED_NUMERIC_LAYOUT,
  dockedFor,
  lowerFor,
  upperFor,
  variantForLocale,
  alternatesFor,
  REPEATABLE_KEYS,
} from './account/keyboardLayouts.js'
import * as textModel from './account/keyboardTextModel.js'
import { cellAt, cellsFor, chipCellsFor, chipsFor, colAfter, echoFor, frameFor, hintsFor, popupCellsFor, rowAfter } from './account/keyboardCells.js'
import { OverNav } from '../layers.jsx'

// With `overlay`, it's the keyboard every text field opens, drawn over the whole screen and the nav
// in the Keyboard Style setting's look. The holder calls open({value, purpose, password, maxLength,
// recents, suggestionsBuilder, onExitTop}) on its node, then setFocus(). It hears
// onKeyboardChange(text, cursor) and onKeyboardClose(submitted), and moves focus away itself then.
// Keyboard Style Native never opens this keyboard: the holder hands its field to the TV's own
// keyboard, and picking Native in the style picker calls onKeyboardNative() to do the same.
// Without `overlay`, it's an inline grid placed at x, y. It calls onKeyboardInput(char),
// onKeyboardBackspace() and onKeyboardDone(), and lets arrows past its edges and Back bubble.
const LETTERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['#shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '#back'],
  ['#sym', '@', '/', ':', '#space', '_', '#done'],
]
const SYMBOLS = [
  ['!', '?', '#', '$', '%', '&', '*', '(', ')', '='],
  ['+', '[', ']', '{', '}', '<', '>', '|', '\\', '^'],
  ['~', '`', "'", '"', ';', ',', '€', '£', '¥', '§'],
  ['#shift', '°', '•', '¿', '¡', 'ñ', 'é', 'ü', '.', '#back'],
  ['#sym', '@', '/', ':', '#space', '_', '#done'],
]
const KEY = 84
const GAP = 10
const WIDE = { '#space': 3 * KEY + 2 * GAP, '#done': 2 * KEY + GAP, '#sym': KEY + 40, '#shift': KEY, '#back': KEY }
const LABEL = { '#shift': '', '#back': '', '#space': '', '#done': 'Done', '#sym': '?123' }
const ICON = { '#shift': 'arrow_upward', '#back': 'backspace', '#space': 'space_bar' }

const LONG_PRESS_MS = 500
const NONE = '#00000000'

const rgbHex = (triplet, a = 1) =>
  '#' +
  triplet
    .split(', ')
    .map((v) => hex2(Number(v)))
    .join('') +
  hex2(a * 255)

// The keyboard's palette, as '#rrggbbaa' colors.
const palette = () => {
  const t = theme()
  const raw = rawTheme()
  const rgb = toRgbTriplet(raw.colors.accent)
  const lift = rgb
    .split(', ')
    .map((p) => Number(p) + (255 - Number(p)) * 0.55)
    .join(', ')
  return {
    panel: t.surface,
    panelBorder: t.cardBorder,
    panelRadius: t.cardRadius,
    idleKey: t.surfaceVariant.slice(0, 7) + hex2(parseInt(t.surfaceVariant.slice(7, 9) || 'ff', 16) * 0.92),
    idleKeyBorder: t.chipBorder,
    selectedKey: t.buttonFocused,
    // The theme's own focus color, since the Focus Color setting doesn't apply to the keyboard.
    selectedKeyBorder: { w: raw.borders.focusBorder.width, color: lc(raw.borders.focusBorder.color) },
    textPrimary: t.onSurface,
    textMuted: t.onSurface.slice(0, 7) + hex2(parseInt(t.onSurface.slice(7, 9) || 'ff', 16) * 0.64),
    textOnSelected: t.onButtonFocused,
    chipBackground: t.chipBackground,
    chipRadius: Math.min(t.chipRadius, 40),
    focusGlow: t.focusGlow,
    accent: rgbHex(rgb),
    accentInk: inkOn(raw.colors.accent) === '0, 0, 0' ? '#04131a' : '#ffffff',
    accentText: rgbHex(lift),
    accentWash: rgbHex(rgb, 0.2),
    accentSoft: rgbHex(rgb, 0.14),
    accentLine: rgbHex(rgb, 0.38),
    accentRing: rgbHex(rgb, 0.18),
    accentGlow: rgbHex(rgb, 0.28),
  }
}

// A key list kept by cell: the For holds strings, so a rebuilt map only updates props, and each
// cell reads its own entry, keeping its last one while a rebuild drops it.
const entry = (map, k) => {
  let last
  return () => {
    const e = map()[k]
    if (e) last = e
    return last
  }
}

function InlineKeyboard(props) {
  const [shift, setShift] = createSignal(false)
  const [symbols, setSymbols] = createSignal(false)
  const [row, setRow] = createSignal(1)
  const [col, setCol] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(() => `${row()}-${col()}`)
  const font = uiFont('medium')
  const rowsOf = () => (symbols() ? SYMBOLS : LETTERS)
  // Both pages have the same shape, so cells keep their nodes across Shift and ?123.
  const keys = createMemo(() => {
    const map = {}
    const ids = []
    rowsOf().forEach((line, r) => {
      let x = 0
      line.forEach((k, c) => {
        const w = WIDE[k] || KEY
        const char = k[0] === '#' || k.length !== 1 ? k : shift() ? k.toUpperCase() : k
        const label = LABEL[k] !== undefined ? LABEL[k] : char
        const id = `${r}-${c}`
        ids.push(id)
        map[id] = { r, c, k, char, label, icon: ICON[k] || '', x, y: r * (KEY + GAP), w }
        x += w + GAP
      })
    })
    return { ids, map }
  })
  const keyAt = (r, c) => keys().map[`${r}-${c}`]
  const moveRow = (delta) => {
    const nr = row() + delta
    if (nr < 0 || nr >= rowsOf().length) return false
    const cur = keyAt(row(), col())
    const cx = cur ? cur.x + cur.w / 2 : 0
    let best = 0
    let bestDist = Infinity
    rowsOf()[nr].forEach((_, c) => {
      const k = keyAt(nr, c)
      const d = Math.abs(k.x + k.w / 2 - cx)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    })
    setRow(nr)
    setCol(best)
    return true
  }
  const press = () => {
    const key = keyAt(row(), col())
    if (!key) return
    if (key.k === '#shift') setShift(!shift())
    else if (key.k === '#sym') setSymbols(!symbols())
    else if (key.k === '#back') props.onKeyboardBackspace && props.onKeyboardBackspace()
    else if (key.k === '#space') props.onKeyboardInput && props.onKeyboardInput(' ')
    else if (key.k === '#done') props.onKeyboardDone && props.onKeyboardDone()
    else if (props.onKeyboardInput) props.onKeyboardInput(key.char)
  }
  const map = () => keys().map
  return (
    <view
      ref={props.ref}
      x={props.x || 0}
      y={props.y || 0}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (col() <= 0) return false
        setCol(col() - 1)
        return true
      }}
      onRight={() => {
        if (col() >= rowsOf()[row()].length - 1) return false
        setCol(col() + 1)
        return true
      }}
      onUp={() => moveRow(-1)}
      onDown={() => moveRow(1)}
      onEnter={() => {
        press()
        return true
      }}
    >
      <For each={keys().ids}>
        {(id) => {
          const k = entry(map, id)
          const on = () => focused() && isCur(id)
          const ink = () => (on() ? '#101010ff' : '#ffffffff')
          return (
            <view
              x={k().x}
              y={k().y}
              width={k().w}
              height={84}
              borderRadius={12}
              color={on() ? '#ffffffff' : k().k === '#shift' && shift() ? '#00a4dcff' : '#ffffff1f'}
            >
              <text x={k().w / 2} y={26.75} mountX={0.5} fontFamily={font} fontSize={30} color={ink()} alpha={k().icon ? 0 : 1}>
                {k().label || ' '}
              </text>
              <view
                x={(k().w - 40) / 2}
                y={22}
                width={40}
                height={40}
                src={k().icon ? `icons/${k().icon}.webp` : undefined}
                color={ink()}
                alpha={k().icon ? 1 : 0}
              />
            </view>
          )
        }}
      </For>
    </view>
  )
}

function OverlayKeyboard(props) {
  const [session, setSession] = createSignal(null)
  const [text, setText] = createSignal('')
  const [cursor, setCursor] = createSignal(0)
  // Search's titles from the results on screen (session.suggestionsBuilder), for typed text.
  const [suggestions, setSuggestions] = createSignal([])
  const [shifted, setShifted] = createSignal(false)
  const [numericPage, setNumericPage] = createSignal(false)
  const [revealed, setRevealed] = createSignal(false)
  const [krow, setKrow] = createSignal(0)
  const [kcol, setKcol] = createSignal(0)
  const [popup, setPopup] = createSignal(null)
  const [look, setLook] = createSignal('docked')
  const [pal, setPal] = createSignal(null)
  let holdTimer = null
  let suggestTimer = null
  let enterHeld = false
  let pendingAlternate = false
  let release = null
  onCleanup(() => {
    clearTimeout(holdTimer)
    clearTimeout(suggestTimer)
  })

  const fonts = createMemo(() => ({ regular: uiFont(), medium: uiFont('medium'), bold: uiFont('bold') }))
  const p = () => pal() || palette()
  const numberPad = createMemo(() => !!session() && session().purpose === 'numeric')
  const railOffset = () => (look() === 'docked' && !numberPad() ? 1 : 0)
  const layout = createMemo(() => {
    if (numberPad()) return NUMBER_PAD_LAYOUT
    const docked = look() === 'docked'
    if (numericPage()) return docked ? DOCKED_NUMERIC_LAYOUT : NUMERIC_LAYOUT
    const variant = variantForLocale(settings.get('uiLanguage'))
    if (docked) return dockedFor(variant, shifted())
    return shifted() ? upperFor(variant) : lowerFor(variant)
  })
  const chips = createMemo(() => chipsFor(session(), text(), suggestions(), revealed()))
  // Only whether there are chips moves the keys, so typing doesn't lay every key out again.
  const hasChips = createMemo(() => chips().length > 0)
  const frame = createMemo(() => {
    if (!session()) return { show: 0 }
    return frameFor({ look: look(), numberPad: numberPad(), hasChips: hasChips(), rows: layout().length, p: p() })
  })
  const cells = createMemo(() => {
    const s = session()
    if (!s) return { keys: [], map: {} }
    return cellsFor({
      look: look(),
      numberPad: numberPad(),
      numericPage: numericPage(),
      shifted: shifted(),
      layout: layout(),
      frame: frame(),
      p: p(),
      search: s.purpose === 'search',
      fonts: fonts(),
      high: glows,
    })
  })
  const selCell = createMemo(() => (session() ? cellAt(look(), layout(), krow(), kcol()) : ''))
  const isSel = createSelector(selCell)
  const chipCells = createMemo(() => {
    const s = session()
    if (!s) return { keys: [], map: {} }
    const typed = look() === 'docked' && !s.password ? text().toLowerCase() : ''
    return chipCellsFor({ look: look(), chips: chips(), frame: frame(), p: p(), fonts: fonts(), typed, search: s.purpose === 'search', high: glows, measure: textWidth })
  })
  const activeChip = createMemo(() => (krow() === -1 ? Math.min(kcol(), chips().length - 1) : -1))
  const isChip = createSelector(activeChip)
  const echo = createMemo(() => {
    const s = session()
    if (!s || look() !== 'docked') return null
    return echoFor({ session: s, text: text(), cursor: cursor(), revealed: revealed(), chips: chips(), frame: frame(), numberPad: numberPad(), measure: textWidth })
  })
  const echoFont = () => (echo() ? fontFor(echo().shown) : fonts().regular)
  const hints = createMemo(() => (session() ? hintsFor({ look: look(), numberPad: numberPad(), frame: frame(), measure: textWidth }) : []))
  const popupBox = createMemo(() => {
    const pop = popup()
    const key = pop && session() && cells().map[pop.cell]
    return key ? popupCellsFor({ pop, key: key.sel, look: look(), p: p(), fonts: fonts(), measure: textWidth }) : null
  })
  const popupCells = () => (popupBox() ? popupBox().cells : [])
  const dur = motion ? 90 : 0

  const selectedKey = () => {
    if (krow() < 0) return null
    const lay = layout()
    const line = lay[Math.min(krow(), lay.length - 1)]
    return line[Math.min(kcol(), line.length - 1)]
  }

  const open = (options) =>
    batch(() => {
      const s = options || {}
      const style = settings.get('keyboardStyle')
      const next = style === 'glass' || style === 'classic' ? style : 'docked'
      setPal(palette())
      setLook(next)
      setSuggestions([])
      clearTimeout(suggestTimer)
      const state = textModel.makeState(s.value || '')
      setText(state.text)
      setCursor(state.cursor)
      setShifted(false)
      setNumericPage(false)
      setRevealed(false)
      setKrow(0)
      // The docked rail sits in the first column, so typing starts one over from it.
      setKcol(next === 'docked' && s.purpose !== 'numeric' ? 1 : 0)
      setPopup(null)
      enterHeld = false
      pendingAlternate = false
      release = null
      setSession(s)
    })
  const close = (submitted) => {
    if (!session()) return
    clearTimeout(holdTimer)
    clearTimeout(suggestTimer)
    setSession(null)
    setPopup(null)
    if (props.onKeyboardClose) props.onKeyboardClose(!!submitted)
  }

  // 280ms after typing stops, up to five distinct titles that aren't the text itself.
  const scheduleSuggestions = (value) => {
    const s = session()
    clearTimeout(suggestTimer)
    if (!s || s.purpose !== 'search' || !s.suggestionsBuilder || !value) return
    suggestTimer = setTimeout(() => {
      Promise.resolve(s.suggestionsBuilder(value))
        .then((results) => {
          if (session() !== s || text() !== value) return
          const unique = []
          ;(results || []).forEach((v) => {
            if (v && v !== value && unique.indexOf(v) < 0) unique.push(v)
          })
          setSuggestions(unique.slice(0, 5))
        })
        .catch(() => {})
    }, 280)
  }
  const applyText = (next) => {
    if (!session()) return
    if (next.text === text() && next.cursor === cursor()) return
    const changed = next.text !== text()
    setText(next.text)
    setCursor(next.cursor)
    // The chip row follows the text, so a shrinking list can't strand the selection.
    if (krow() === -1) {
      const count = chips().length
      if (!count) setKrow(0)
      else if (kcol() > count - 1) setKcol(count - 1)
    }
    if (changed) scheduleSuggestions(next.text)
    if (changed && props.onKeyboardChange) props.onKeyboardChange(next.text, next.cursor)
  }
  const textState = () => ({ text: text(), cursor: cursor() })
  const insert = (value) => {
    const max = Number(session() && session().maxLength)
    if (max > 0 && text().length + value.length > max) return
    applyText(textModel.insertText(textState(), value))
  }
  const paste = () => {
    if (!navigator.clipboard || !navigator.clipboard.readText) return
    navigator.clipboard
      .readText()
      .then((raw) => {
        const cleaned = String(raw || '')
          .replace(/[\r\n]+$/, '')
          .replace(/[\r\n]+/g, ' ')
        if (cleaned) insert(cleaned)
      })
      .catch(() => {})
  }
  const switchPage = () => {
    setNumericPage(!numericPage())
    setShifted(false)
    if (krow() < 0) return
    const lay = layout()
    setKrow(Math.min(krow(), lay.length - 1))
    setKcol(Math.min(kcol(), lay[krow()].length - 1))
  }
  const openStylePicker = () => {
    const options = getKeyboardStyleOptions().map((o) => o.value)
    setPopup({ options, index: Math.max(options.indexOf(look()), 0), awaitRelease: false, picker: true, cell: selCell() })
  }
  const act = (key) => {
    switch (key) {
      case 'BACKSPACE':
        applyText(textModel.backspace(textState()))
        break
      case 'SPACE':
        insert(' ')
        break
      case 'SHIFT':
        setShifted(!shifted())
        break
      case 'CURSORL':
        applyText(textModel.moveCursor(textState(), -1))
        break
      case 'CURSORR':
        applyText(textModel.moveCursor(textState(), 1))
        break
      case 'PASTE':
        paste()
        break
      case 'DONE':
        close(true)
        break
      case '123':
      case 'ABC':
        switchPage()
        break
      case 'IME':
        openStylePicker()
        break
      case 'MODE_LOWER':
      case 'MODE_UPPER':
      case 'MODE_NUM':
        setShifted(key === 'MODE_UPPER')
        setNumericPage(key === 'MODE_NUM')
        break
      default:
        insert(key)
    }
  }
  const activateChip = (chip) => {
    if (!chip) return
    if (chip.reveal) {
      setRevealed(!revealed())
      return
    }
    if (chip.submitOnTap || chip.replaceOnTap) applyText(textModel.makeState(chip.value))
    else insert(chip.value)
    if (chip.submitOnTap) close(true)
  }
  const openAlternates = (key, viaHold) => {
    const options = alternatesFor(key)
    if (!options) return
    setPopup({ options, index: 0, awaitRelease: !!viaHold, cell: selCell() })
  }
  // Saving the style switches this keyboard too, since its look comes from the setting.
  const pickStyle = (style) => {
    settings.set('keyboardStyle', style)
    if (style === 'native') {
      clearTimeout(holdTimer)
      setSession(null)
      setPopup(null)
      if (props.onKeyboardNative) props.onKeyboardNative()
      return
    }
    setLook(style === 'glass' || style === 'classic' ? style : 'docked')
    setShifted(false)
    setNumericPage(false)
    setKrow(0)
    setKcol(look() === 'docked' && !numberPad() ? 1 : 0)
  }
  const commitPopup = (value) => {
    const pop = popup()
    setPopup(null)
    if (pop && pop.picker) pickStyle(value)
    else insert(value)
  }
  const atTopRow = () => {
    if (krow() === -1) return true
    return chips().length === 0 && rowAfter(layout(), krow(), kcol(), -1) < 0
  }
  const move = (dRow, dCol) => {
    const lay = layout()
    const list = chips()
    const offset = railOffset()
    let row = krow()
    let col = kcol()
    if (row === -1) {
      if (dRow > 0) {
        row = 0
        col = Math.min(col + offset, lay[0].length - 1)
      } else if (dCol !== 0 && list.length) col = (col + dCol + list.length) % list.length
    } else if (dRow !== 0) {
      const next = rowAfter(lay, row, col, dRow)
      if (next < 0) {
        if (list.length) {
          row = -1
          col = Math.min(Math.max(col - offset, 0), list.length - 1)
        }
      } else if (next <= lay.length - 1) {
        row = next
        col = Math.min(col, lay[next].length - 1)
      }
    } else col = colAfter(lay[row], col, dCol)
    setKrow(row)
    setKcol(col)
    setPopup(null)
  }
  const exitTop = () => {
    const s = session()
    if (!s || !s.onExitTop || s.onExitTop() === false) return false
    close(true)
    return true
  }
  // An arrow while a popup is up walks its choices instead.
  const popupStep = (delta) => {
    const pop = popup()
    setPopup({ ...pop, index: (pop.index + delta + pop.options.length) % pop.options.length })
  }

  const onEnter = (e) => {
    if (!session()) return false
    const pop = popup()
    // A held OK repeats Delete and the cursor keys, and opens a key's accents.
    if (enterHeld || (e && e.repeat)) {
      if (pop) return true
      const held = selectedKey()
      if (held && REPEATABLE_KEYS.indexOf(held) >= 0) act(held)
      return true
    }
    enterHeld = true
    release = () => {
      clearTimeout(holdTimer)
      enterHeld = false
      const up = popup()
      if (up && up.awaitRelease) {
        setPopup({ ...up, awaitRelease: false })
        return
      }
      if (pendingAlternate) {
        pendingAlternate = false
        act(selectedKey())
      }
    }
    if (pop) {
      if (!pop.awaitRelease) commitPopup(pop.options[pop.index])
      return true
    }
    if (krow() === -1) {
      const list = chips()
      activateChip(list[Math.min(kcol(), list.length - 1)])
      return true
    }
    const key = selectedKey()
    if (alternatesFor(key)) {
      pendingAlternate = true
      clearTimeout(holdTimer)
      holdTimer = setTimeout(() => {
        if (!pendingAlternate) return
        pendingAlternate = false
        openAlternates(selectedKey(), true)
      }, LONG_PRESS_MS)
      return true
    }
    act(key)
    return true
  }
  // Keys from inside <OverNav> bubble to App, so while open this keeps every key, and lets them go
  // once closed, when the holder should already have taken focus back.
  const arrow = (fn) => () => {
    if (!session()) return false
    fn()
    return true
  }

  // The renderer fades a shadow across the box edge over the blur on either side, so a box-shadow
  // goes on a node the size of its box.
  const glowShadow = createMemo(() => {
    const f = frame()
    return { color: shadowColor(f.glow || NONE), x: 0, y: f.glowY || 0, blur: f.glowBlur || 0, spread: f.glowSpread || 0 }
  })
  const cellMap = () => cells().map
  // The Magic Remote's cursor selects the key under it, and OK then presses it (app/pointer.js).
  const pointAt = (row, col) => {
    if (!session() || popup()) return
    batch(() => {
      setKrow(row)
      setKcol(col)
    })
  }
  const chipMap = () => chipCells().map
  const f = frame
  return (
    <OverNav>
      <view
        ref={(n) => {
          n.open = open
          n.close = close
          if (props.ref) props.ref(n)
        }}
        alpha={f().show || 0}
        pointerModal={!!session()}
        onLeft={arrow(() => (popup() ? popupStep(-1) : move(0, -1)))}
        onRight={arrow(() => (popup() ? popupStep(1) : move(0, 1)))}
        onUp={arrow(() => {
          if (popup()) popupStep(-1)
          else if (!(atTopRow() && exitTop())) move(-1, 0)
        })}
        onDown={arrow(() => (popup() ? popupStep(1) : move(1, 0)))}
        onEnter={onEnter}
        onEnterRelease={() => {
          const r = release
          release = null
          if (r) r()
          return !!session() || !!r
        }}
        onBack={(e) => {
          if (!session()) return false
          if (popup()) setPopup(null)
          // A keyboard plugged into the TV deletes with Backspace, which arrives as Back.
          else if (e && e.keyCode === 8) act('BACKSPACE')
          else {
            pendingAlternate = false
            close(false)
          }
          return true
        }}
        onKeyPress={(e) => {
          if (!session()) return false
          // A real keyboard plugged into the TV types straight into the field.
          if (e && e.key && e.key.length === 1 && e.key.charCodeAt(0) >= 32) insert(e.key)
          return true
        }}
      >
        <view width={1920} height={1080} color={f().look === 'docked' ? '#0405088c' : f().look === 'glass' ? '#06080c6b' : NONE} />
        <view alpha={f().look === 'docked' ? 1 : 0} y={f().top || 0} width={1920} height={f().h || 0}>
          <view
            width={1920}
            height={f().h || 0}
            color={NONE}
            alpha={glows ? 1 : 0}
            shadow={{ color: shadowColor('#00000080'), x: 0, y: -60, blur: 120, spread: 0 }}
          />
          <view width={1920} height={f().h || 0} color="#0b0c10f7" />
          <view width={1920} height={1} color="#ffffff12" />
        </view>
        <view alpha={f().look === 'glass' ? 1 : 0} x={f().x || 0} y={f().top || 0}>
          <view
            width={f().w || 0}
            height={f().h || 0}
            borderRadius={48}
            color={NONE}
            alpha={glows ? 1 : 0}
            shadow={{ color: shadowColor('#0000008c'), x: 0, y: 48, blur: 120, spread: 0 }}
          />
          <view width={f().w || 0} height={f().h || 0} borderRadius={48} color="#181a20eb" border={{ width: 2, color: hex('#ffffff17') }} />
        </view>
        <view alpha={f().look === 'classic' ? 1 : 0} x={f().x || 0} y={f().top || 0}>
          <view
            width={f().w || 0}
            height={f().h || 0}
            borderRadius={p().panelRadius}
            color={NONE}
            shadow={{ color: shadowColor('#00000059'), x: 0, y: 12, blur: 40, spread: 0 }}
          />
          <view
            width={f().w || 0}
            height={f().h || 0}
            borderRadius={p().panelRadius}
            color={p().panel}
            border={{ width: p().panelBorder.w || 0, color: hex(p().panelBorder.color) }}
          />
        </view>

        <view alpha={echo() ? 1 : 0} x={f().x || 0} y={f().echoY || 0} width={echo() ? echo().room : 0} height={80} clipping>
          <text y={5.51} x={echo() ? echo().x : 0} fontFamily={echoFont()} fontSize={60} lineHeight={80} letterSpacing={-0.6} color="#ffffffff">
            {(echo() && echo().before) || ' '}
          </text>
          <view x={echo() ? echo().caretX : 0} y={20} width={4} height={60} color={p().accent} />
          <text y={5.51} x={echo() ? echo().afterX : 0} fontFamily={echoFont()} fontSize={60} lineHeight={80} letterSpacing={-0.6} color="#ffffffff">
            {(echo() && echo().after) || ' '}
          </text>
          <text y={5.51} x={echo() ? echo().ghostX : 0} fontFamily={fonts().regular} fontSize={60} lineHeight={80} letterSpacing={-0.6} color="#ffffff47">
            {(echo() && echo().ghost) || ' '}
          </text>
        </view>

        <view>
          <For each={hints()}>
            {(h) => (
              <view x={h.x} y={h.y}>
                <view width={h.capW} height={36} borderRadius={10} color={NONE} border={{ width: 1, color: hex('#ffffff47') }} />
                <text x={h.capW / 2} y={3.34} mountX={0.5} fontFamily={fonts().bold} fontSize={20} lineHeight={33} color="#ffffffbf">
                  {h.cap || ' '}
                </text>
                <view x={11} y={7} width={22} height={22} src="icons/kbl_back.webp" color="#ffffffbf" alpha={h.cap ? 0 : 1} />
                <text x={h.capW + 14} y={3.61} fontFamily={fonts().regular} fontSize={23} lineHeight={33} color={h.color}>
                  {h.text}
                </text>
              </view>
            )}
          </For>
        </view>

        <view>
          <For each={chipCells().keys}>
            {(k) => {
              const e = entry(chipMap, k)
              const c = () => (isChip(e().i) ? e().sel : e().idle)
              const ty = () => c().textY + c().size * 0.0918
              const pushed = () => (activeChip() >= 0 && activeChip() < e().i ? chipCells().grow || 0 : 0)
              return (
                <view x={c().x + pushed()} y={c().y} width={c().w} height={c().h} onPointerOver={() => pointAt(-1, e().i)}>
                  <view width={c().w} height={c().h} borderRadius={c().r} color={NONE} alpha={c().glow ? 1 : 0} shadow={glowShadow()} />
                  <view
                    width={c().w}
                    height={c().h}
                    borderRadius={c().r}
                    color={NONE}
                    alpha={c().glow2 ? 1 : 0}
                    shadow={{ color: shadowColor('#ffffff29'), x: 0, y: 0, blur: 56, spread: 0 }}
                  />
                  <view width={c().w} height={c().h} borderRadius={c().r} color={c().fill} />
                  <view
                    width={c().w}
                    height={c().h}
                    borderRadius={c().r}
                    color={NONE}
                    border={{ width: c().border || 0.001, color: hex(c().borderColor) }}
                    alpha={c().border ? 1 : 0}
                  />
                  <view x={24} y={(c().h - 26) / 2} width={26} height={26} src="icons/kbl_search.webp" color={c().color} alpha={c().icon ? 0.55 : 0} />
                  <text
                    x={c().textX}
                    y={ty()}
                    fontFamily={c().font}
                    fontSize={c().size}
                    lineHeight={33}
                    maxWidth={c().maxW || 4000}
                    maxLines={1}
                    color={c().color}
                  >
                    {c().text}
                  </text>
                  <text x={c().matchX} y={ty()} fontFamily={fonts().bold} fontSize={c().size} lineHeight={33} color={c().matchColor} alpha={c().match ? 1 : 0}>
                    {c().match || ' '}
                  </text>
                </view>
              )
            }}
          </For>
        </view>

        <view>
          <For each={cells().keys}>
            {(k) => {
              const e = entry(cellMap, k)
              const c = () => (isSel(k) ? e().sel : e().idle)
              return (
                <view
                  x={c().x}
                  y={c().y}
                  width={c().w}
                  height={c().h}
                  onPointerOver={() => pointAt(...k.split('-').map(Number))}
                  pivot={0.5}
                  scale={c().scale}
                  transition={{ scale: { duration: dur, easing: 'ease-out' } }}
                  zIndex={c().z}
                >
                  <view width={c().w} height={c().h} borderRadius={c().r} color={NONE} alpha={c().glow ? 1 : 0} shadow={glowShadow()} />
                  <view
                    width={c().w}
                    height={c().h}
                    borderRadius={c().r}
                    color={NONE}
                    alpha={c().glow2 ? 1 : 0}
                    shadow={{ color: shadowColor('#ffffff29'), x: 0, y: 0, blur: 56, spread: 0 }}
                  />
                  <view x={-10} y={-10} width={c().w + 20} height={c().h + 20} borderRadius={c().r + 10} color={c().ring || NONE} alpha={c().ring ? 1 : 0} />
                  <view width={c().w} height={c().h} borderRadius={c().r} color={c().fill} />
                  <view
                    width={c().w}
                    height={c().h}
                    borderRadius={c().r}
                    color={NONE}
                    border={{ width: c().border || 0.001, color: hex(c().borderColor) }}
                    alpha={c().border ? 1 : 0}
                  />
                  <text
                    x={c().w / 2}
                    y={c().labelY + c().size * 0.0918}
                    mountX={0.5}
                    fontFamily={c().font}
                    fontSize={c().size}
                    lineHeight={33}
                    letterSpacing={c().ls || 0}
                    color={c().color}
                    alpha={c().label ? 1 : 0}
                  >
                    {c().label || ' '}
                  </text>
                  <view
                    x={(c().w - c().iconSize) / 2}
                    y={c().iconY}
                    width={c().iconSize}
                    height={c().iconSize}
                    src={c().icon ? `icons/${c().icon}.webp` : undefined}
                    color={c().color}
                    alpha={c().icon ? 1 : 0}
                  />
                  <view x={c().w / 4} y={(c().h - 8) / 2} width={c().w / 2} height={8} borderRadius={4} color={c().barColor || NONE} alpha={c().bar ? 0.65 : 0} />
                  <view
                    x={c().dotX || 0}
                    y={c().dotY || 0}
                    width={f().look === 'docked' ? 6 : 7}
                    height={f().look === 'docked' ? 6 : 7}
                    borderRadius={3.5}
                    color={c().dotColor || NONE}
                    alpha={c().dot ? 1 : 0}
                  />
                </view>
              )
            }}
          </For>
        </view>

        <view
          x={popupBox() ? popupBox().x : 0}
          y={popupBox() ? popupBox().y : 0}
          width={popupBox() ? popupBox().w : 0}
          height={popupBox() ? popupBox().h : 0}
          pivot={0.5}
          scale={popupBox() ? popupBox().scale : 1}
        >
          <For each={popupCells()}>
            {(o) => (
              <view
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                onPointerOver={() => {
                  // The first cell is the popup's panel, not a choice.
                  const pop = popup()
                  const at = pop && o.i != null ? o.i : -1
                  if (at >= 0 && at !== pop.index) setPopup({ ...pop, index: at })
                }}
              >
                <view
                  width={o.w}
                  height={o.h}
                  borderRadius={o.r}
                  color={NONE}
                  alpha={o.shadow && glows ? 1 : 0}
                  shadow={{ color: shadowColor('#00000066'), x: 0, y: 12, blur: 36, spread: 0 }}
                />
                <view
                  width={o.w}
                  height={o.h}
                  borderRadius={o.r}
                  color={NONE}
                  alpha={o.glow ? 1 : 0}
                  shadow={o.glow ? { color: shadowColor(o.glow.color), x: o.glow.x, y: o.glow.y, blur: o.glow.blur, spread: o.glow.spread } : { color: 0, x: 0, y: 0, blur: 0, spread: 0 }}
                />
                <view width={o.w} height={o.h} borderRadius={o.r} color={o.fill} />
                <view
                  width={o.w}
                  height={o.h}
                  borderRadius={o.r}
                  color={NONE}
                  border={{ width: o.border || 0.001, color: hex(o.borderColor || NONE) }}
                  alpha={o.border ? 1 : 0}
                />
                <text
                  x={o.textX || 0}
                  y={(o.h - 33) / 2 + (o.size || 30) * 0.0918}
                  mountX={o.center ? 0.5 : 0}
                  fontFamily={o.font || fonts().medium}
                  fontSize={o.size || 30}
                  lineHeight={33}
                  color={o.color || '#ffffffff'}
                >
                  {o.text || ' '}
                </text>
                <view x={o.w - 24 - 32} y={(o.h - 32) / 2} width={32} height={32} src="icons/kbl_check.webp" color={o.color || '#ffffffff'} alpha={o.check ? 1 : 0} />
              </view>
            )}
          </For>
        </view>
      </view>
    </OverNav>
  )
}

export default function Keyboard(props) {
  return props.overlay ? <OverlayKeyboard {...props} /> : <InlineKeyboard {...props} />
}
