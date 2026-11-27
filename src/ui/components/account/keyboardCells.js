// The overlay keyboard's layout, as plain data for ui/components/Keyboard.jsx: the panel, every
// key in its resting and its selected look, the chips, the hints and the popup. Keys are kept by
// cell ('row-col'), so a key press only swaps which cell draws selected.
// `measure(text, size, weight, spacing)` is look.js textWidth.
import $L from '../../../services/i18n.js'
import { getKeyboardStyleOptions } from './keyboardStyles.js'
import { keyBoxes, alternatesFor, keyUnitSpan, KEY_GAP_FACTOR, maxRowSpan } from './keyboardLayouts.js'

const URL_CHIPS = ['https://', 'http://', 'www.', 'jellyfin', '.com', '.org', '.net', ':8096', '/']
const EMAIL_CHIPS = ['@gmail.com', '@outlook.com', '@icloud.com', '@yahoo.com', '.com', '.']

// Docked places keys by cell, on grids 1648 px wide (528 for the number pad).
const DOCK = { columns: [[0, 72], [96, 52], [152, 52], [208, 52], [264, 52], [320, 52], [376, 52], [432, 52], [488, 52], [544, 52], [600, 52], [676, 148]], scale: 2, step: 108, h: 96, gridH: 420, contentW: 1648 }
const PAD = { columns: [[0, 84], [90, 84], [180, 84]], scale: 2, step: 108, h: 96, gridH: 528, contentW: 528 }
const RAIL = { MODE_LOWER: 'abc', MODE_UPPER: 'ABC', MODE_NUM: '123' }
const LINE_ICON = { SHIFT: 1, SHIFT_LOCKED: 1, BACKSPACE: 1, CURSORL: 1, CURSORR: 1, PASTE: 1, IME: 1, SEARCH: 1, CHECK: 1, BACK: 1 }
const FILL_ICON = { BACKSPACE: 36, PASTE: 32, CURSORL: 44, CURSORR: 44, DONE: 40, IME: 36, SHIFT: 40, SHIFT_LOCKED: 40 }

const GLASS_FOCUS_FILL = '#f5f7fa'
const GLASS_FOCUS_INK = '#0b0d12'
const NONE = '#00000000'

// Where a step up or down lands. Cells still holding the same key are passed over.
export const rowAfter = (layout, row, col, dRow) => {
  const key = layout[row][Math.min(col, layout[row].length - 1)]
  let next = row + dRow
  while (next >= 0 && next < layout.length && layout[next][Math.min(col, layout[next].length - 1)] === key) next += dRow
  return next
}
// Where a step along a row lands, the next cell holding a different key, wrapping around the row.
export const colAfter = (line, col, dCol) => {
  let next = col
  do {
    next = (next + dCol + line.length) % line.length
  } while (line[next] === line[col] && next !== col)
  return next
}

// The cell a selection at row, col draws in: Docked's keys span cells, so it's the span's first.
export const cellAt = (look, layout, row, col) => {
  if (row < 0) return ''
  if (look !== 'docked') return `${row}-${col}`
  const box = keyBoxes(layout).find((b) => row >= b.row && row <= b.lastRow && col >= b.col && col <= b.lastCol)
  return box ? `${box.row}-${box.col}` : ''
}

// The chips over the keys for the session's purpose.
export const chipsFor = (s, text, suggestions, revealed) => {
  if (!s) return []
  const purpose = s.purpose || 'text'
  if (purpose === 'url') {
    const query = text.toLowerCase()
    const recents = (s.recents || [])
      .filter((e) => !query || (e.toLowerCase().indexOf(query) >= 0 && e !== text))
      .slice(0, 5)
      .map((value) => ({ value, replaceOnTap: true }))
    return recents.concat(URL_CHIPS.map((value) => ({ value })))
  }
  if (purpose === 'email') return EMAIL_CHIPS.map((value) => ({ value }))
  if (purpose === 'username') return (s.recents || []).slice(0, 5).map((value) => ({ value, submitOnTap: true }))
  if (purpose === 'search') return (text ? suggestions : (s.recents || []).slice(0, 5)).map((value) => ({ value, submitOnTap: true }))
  if (s.password && purpose !== 'numeric') return [{ value: revealed ? $L('Hide password') : $L('Show password'), reveal: true }]
  return []
}

// The panel or dock behind the keys, with what sits above the keys.
export const frameFor = ({ look, numberPad, hasChips, rows, p }) => {
  if (look === 'docked') {
    const g = numberPad ? PAD : DOCK
    const sugg = hasChips ? 76 : 0
    const contentH = 80 + sugg + 32 + g.gridH
    const h = contentH + 88 + 1
    const top = 1080 - h
    const x = (1920 - g.contentW) / 2
    return { show: 1, look, glow: p.accentGlow, glowBlur: 60, glowY: 24, top, h, x, w: g.contentW, echoY: top + 1 + 44, suggY: top + 1 + 44 + 100, gridY: top + 1 + 44 + 80 + sugg + 32 }
  }
  const glass = look === 'glass'
  const narrow = numberPad
  const maxW = glass ? (narrow ? 680 : 1700) : narrow ? 640 : 1640
  const padX = glass ? 36 : 28
  const w = Math.min(maxW, 1920 - 96)
  const header = glass ? !narrow : hasChips
  const headerH = header ? (glass ? 72 + 24 : 72 + 16) : 0
  const keyH = glass ? 88 : 80
  const rowGap = glass ? 16 : 8
  const gridH = rows * keyH + (rows - 1) * rowGap
  const h = (glass ? 32 + 36 : 48) + headerH + gridH
  const top = 1080 - (glass ? 36 : 32) - h
  const x = (1920 - w) / 2
  const fg = p.focusGlow.length ? p.focusGlow[0] : { color: NONE, blur: 0, spread: 0, y: 0 }
  const glow = glass ? '#0000008c' : fg.color
  return { show: 1, look, glow, glowBlur: glass ? 52 : fg.blur, glowSpread: glass ? 0 : fg.spread, glowY: glass ? 20 : fg.y, top, h, x, w, padX, headerY: top + (glass ? 32 : 24), gridY: top + (glass ? 32 : 24) + headerH, gridW: w - 2 * padX, keyH, rowGap }
}

// Every key, by cell, as { idle, sel }: its look at rest and while selected.
// ctx: { look, numberPad, numericPage, shifted, layout, frame: f, p, search, fonts: { regular, medium, bold }, high }
export const cellsFor = (ctx) => {
  const { look, layout, frame: f, p, fonts, high } = ctx
  const keys = []
  const map = {}
  if (look === 'docked') {
    const g = ctx.numberPad ? PAD : DOCK
    const mode = ctx.numericPage ? 'MODE_NUM' : ctx.shifted ? 'MODE_UPPER' : 'MODE_LOWER'
    const lastCol = layout[0].length - 1
    keyBoxes(layout).forEach((box) => {
      const left = g.columns[box.col][0] * g.scale
      const last = g.columns[box.lastCol]
      const w = (last[0] + last[1]) * g.scale - left
      const top = box.row * g.step
      const h = box.lastRow * g.step + g.h - top
      let kind = 'cell'
      if (!ctx.numberPad) {
        if (box.col === 0) kind = 'rail'
        else if (box.col === lastCol) kind = 'action'
        else if (box.key === 'SPACE') kind = 'space'
      }
      const label = box.key
      const done = label === 'DONE'
      const doneAction = done && kind === 'action'
      const make = (selected) => {
        const c = { x: f.x + left, y: f.gridY + top, w, h, r: kind === 'rail' || kind === 'space' ? 24 : 28, scale: 1 }
        c.fill = NONE
        if (selected) c.fill = p.accent
        else if (doneAction) c.fill = p.accentSoft
        else if (kind === 'rail' && label === mode) c.fill = '#ffffff12'
        else if (kind === 'action') c.fill = '#ffffff0d'
        c.border = 0
        c.borderColor = NONE
        if (!selected && doneAction) {
          c.border = 2
          c.borderColor = p.accentLine
        } else if (!selected && kind === 'space') {
          c.border = 2
          c.borderColor = '#ffffff1a'
        }
        c.ring = selected ? p.accentRing : ''
        c.glow = selected && high ? p.accentGlow : ''
        let color = '#ffffffd1'
        let size = 42
        let font = fonts.regular
        if (kind === 'rail') {
          color = label === mode ? '#ffffff' : '#ffffff73'
          size = 28
          font = label === mode ? fonts.bold : fonts.medium
        } else if (kind === 'space') {
          color = '#ffffff73'
          size = 26
        } else if (kind === 'action') {
          color = done ? p.accentText : '#ffffffc7'
          size = 26
          font = done ? fonts.bold : fonts.medium
        } else if (label.length > 1) color = '#ffffffb3'
        else if (done) color = p.accentText
        if (selected) {
          color = p.accentInk
          font = fonts.bold
        }
        c.color = color
        c.size = size
        c.font = font
        c.ls = kind === 'rail' ? 0.6 : kind === 'space' ? 0.8 : 0
        c.label = ''
        c.icon = ''
        c.iconSize = 40
        if (kind === 'action') {
          c.icon = done ? (ctx.search ? 'kbl_search' : 'kbl_check') : 'kbl_backspace'
          c.iconSize = 48
          c.label = done ? (ctx.search ? $L('Search') : $L('Done')) : $L('Delete')
          c.iconY = (h - 97) / 2
          c.labelY = c.iconY + 64
        } else if (RAIL[label]) c.label = RAIL[label]
        else if (label === 'SPACE') c.label = $L('space')
        else if (label === 'DONE') c.icon = 'kbl_check'
        else if (LINE_ICON[label]) {
          c.icon = 'kbl_' + label.toLowerCase()
          c.iconSize = label === 'IME' ? 44 : 40
        } else c.label = label
        if (kind !== 'action') {
          c.iconY = (h - c.iconSize) / 2
          c.labelY = (h - 33) / 2
        }
        c.z = selected ? 2 : 1
        c.dot = alternatesFor(label) && !selected ? 1 : 0
        c.dotX = w / 2 - 3
        c.dotY = h - 18
        c.dotColor = '#ffffff3d'
        return c
      }
      const k = `${box.row}-${box.col}`
      keys.push(k)
      map[k] = { label, idle: make(false), sel: make(true) }
    })
    return { keys, map }
  }
  const glass = look === 'glass'
  const uniform = ctx.numberPad
  const base = f.gridW / maxRowSpan(layout, uniform)
  const spacing = base * KEY_GAP_FACTOR
  const search = glass && ctx.search
  layout.forEach((line, r) => {
    const rowW = line.reduce((sum, key) => sum + base * keyUnitSpan(key, uniform), 0) + (line.length - 1) * spacing
    let x = f.x + f.padX + (f.gridW - rowW) / 2
    line.forEach((label, col) => {
      const w = base * keyUnitSpan(label, uniform)
      const at = x
      x += w + spacing
      const make = (selected) => {
        const c = { x: at, y: f.gridY + r * (f.keyH + f.rowGap), w, h: f.keyH, label: '', icon: '', iconSize: 36, dot: 0, z: selected ? 2 : 1 }
        if (glass) {
          c.r = 24
          c.scale = selected ? 1.12 : 1
          c.border = 0
          c.borderColor = NONE
          c.ring = ''
          c.glow = selected && high ? '#0000008c' : ''
          c.glow2 = selected && high ? '#ffffff29' : ''
          if (selected) {
            c.fill = GLASS_FOCUS_FILL
            c.color = GLASS_FOCUS_INK
          } else if (label === 'DONE') {
            c.fill = p.accentWash
            c.color = p.accentText
          } else if (label === 'SPACE' || label.length > 1) {
            c.fill = '#ffffff09'
            c.color = label === 'SPACE' ? '#ffffff73' : '#ffffff9e'
          } else {
            c.fill = '#ffffff13'
            c.color = '#ffffffeb'
          }
          c.size = 38
          c.font = fonts.medium
          c.ls = 0
          if (label === 'SHIFT') {
            c.icon = ctx.shifted ? 'kbl_shift_locked' : 'kbl_shift'
            c.iconSize = 40
          } else if (label === '123' || label === 'ABC') {
            c.label = label
            c.size = 27
            c.font = fonts.bold
            c.ls = 0.4
          } else if (label === 'SPACE') {
            c.label = $L('space')
            c.size = 27
          } else if (label === 'DONE') {
            c.label = search ? $L('Search') : $L('Done')
            c.size = 27
            c.font = fonts.bold
            c.ls = 0.4
          } else if (LINE_ICON[label]) {
            c.icon = 'kbl_' + label.toLowerCase()
            c.iconSize = label === 'BACKSPACE' ? 42 : 36
          } else c.label = label
        } else {
          c.r = p.chipRadius
          c.scale = 1
          c.fill = selected ? p.selectedKey : p.idleKey
          c.border = selected ? p.selectedKeyBorder.w : p.idleKeyBorder.w
          c.borderColor = selected ? p.selectedKeyBorder.color : p.idleKeyBorder.color
          c.ring = ''
          c.glow = selected && high && p.focusGlow.length ? p.focusGlow[0].color : ''
          c.color = selected ? p.textOnSelected : p.textPrimary
          c.size = 28
          c.font = fonts.bold
          c.ls = 0.3
          const iconColor = (name) => {
            if (selected) return p.textOnSelected
            if (name === 'SHIFT') return ctx.shifted ? p.accent : p.textPrimary
            if (name === 'DONE' || name === 'IME') return p.accent
            return p.textPrimary
          }
          if (label === 'SPACE') {
            c.bar = 1
            c.barColor = selected ? p.textOnSelected : p.textMuted
          } else if (FILL_ICON[label]) {
            const name = label === 'SHIFT' && ctx.shifted ? 'SHIFT_LOCKED' : label
            c.icon = 'kb_' + name.toLowerCase()
            c.iconSize = FILL_ICON[name]
            c.color = iconColor(label)
          } else c.label = label
          c.dot = alternatesFor(label) ? 1 : 0
          c.dotX = w - 12 - 7
          c.dotY = 10
          c.dotColor = (selected ? p.textOnSelected : p.textMuted).slice(0, 7) + '8c'
        }
        c.iconY = (c.h - c.iconSize) / 2
        c.labelY = (c.h - 33) / 2
        return c
      }
      const k = `${r}-${col}`
      keys.push(k)
      map[k] = { label, idle: make(false), sel: make(true) }
    })
  })
  return { keys, map }
}

// Docked's typed line: the text either side of the caret and the rest of a chip it starts.
export const echoFor = ({ session: s, text, cursor, revealed, chips, frame, numberPad, measure }) => {
  const shown = s.password && !revealed ? text.replace(/[\s\S]/g, '•') : text
  const before = shown.slice(0, cursor)
  const after = shown.slice(cursor)
  let ghost = ''
  if (!s.password && !after && shown) {
    const typed = shown.toLowerCase()
    const match = chips.find((chip) => (chip.submitOnTap || chip.replaceOnTap) && chip.value.length > shown.length && chip.value.toLowerCase().indexOf(typed) === 0)
    if (match) ghost = match.value.slice(shown.length)
  }
  const hintsW = numberPad ? 0 : 376 + 32
  const room = frame.w - hintsW
  const beforeW = measure(before, 60, 'regular', -0.6)
  const afterW = measure(after, 60, 'regular', -0.6)
  const lineW = beforeW + 12 + afterW
  // A line too long for the row keeps its end in view.
  const shift = Math.max(0, lineW - room)
  return { shown, before, after, ghost, x: -shift, caretX: -shift + beforeW + 4, afterX: -shift + beforeW + 12, ghostX: -shift + lineW, room }
}

// The key hints over the keys: hold for accents, and Docked's close.
export const hintsFor = ({ look, numberPad, frame: f, measure }) => {
  if (look === 'docked' && !numberPad) {
    const right = f.x + f.w
    const closeW = 44 + 14 + measure($L('close'), 23)
    const accentsW = 49 + 14 + measure($L('hold for accents'), 23)
    const closeX = right - closeW
    const accentsX = closeX - 32 - accentsW
    return [
      { k: 'ok', x: accentsX, y: f.echoY + 22, cap: 'OK', capW: 49, text: $L('hold for accents'), color: '#ffffff80' },
      { k: 'close', x: closeX, y: f.echoY + 22, cap: '', capW: 44, text: $L('close'), color: '#ffffff80' },
    ]
  }
  if (look === 'glass' && !numberPad) {
    const w = 49 + 14 + measure($L('hold for accents'), 23)
    return [{ k: 'ok', x: f.x + f.w - f.padX - w, y: f.headerY + 18, cap: 'OK', capW: 49, text: $L('hold for accents'), color: '#ffffff8c' }]
  }
  return []
}

// The chips, each { idle, sel }. Docked bolds the part that matches the typed text. A selected
// Glass or Classic chip wears its keys' glow.
export const chipCellsFor = ({ look, chips, frame: f, p, fonts, typed, search, high, measure }) => {
  const keys = []
  const map = {}
  const add = (i, value, idle, sel) => {
    const k = `${i}-${value}`
    keys.push(k)
    map[k] = { i, idle, sel }
  }
  if (look === 'docked') {
    let x = f.x - 20
    chips.forEach((chip, i) => {
      const w = measure(chip.value, 30) + 40
      const at = typed ? chip.value.toLowerCase().indexOf(typed) : -1
      const base = {
        x, y: f.suggY, w, h: 56, r: 28, text: chip.value, size: 30, font: fonts.regular, textY: 11.5, textX: 20, maxW: 0,
        matchX: at >= 0 ? 20 + measure(chip.value.slice(0, at), 30) : 0, match: at >= 0 ? chip.value.slice(at, at + typed.length) : '',
        border: 0, borderColor: NONE, icon: 0,
      }
      add(i, chip.value, { ...base, fill: NONE, color: '#ffffff80', matchColor: '#fffffff2' }, { ...base, fill: p.accent, color: p.accentInk, matchColor: p.accentInk })
      x += w + 16
    })
    return { keys, map }
  }
  if (look === 'glass') {
    let x = f.x + f.padX
    chips.forEach((chip, i) => {
      const w = Math.min(400, measure(chip.value, 27, 'medium') + 48 + (search ? 40 : 0))
      const base = {
        x, y: f.headerY + 4, w, h: 64, r: 20, text: chip.value, size: 27, font: fonts.medium, textY: 15.5, textX: 24 + (search ? 40 : 0),
        maxW: 400 - 48 - (search ? 40 : 0) + 4, match: '', matchX: 0, matchColor: NONE, border: 0, borderColor: NONE, icon: search ? 1 : 0,
      }
      add(i, chip.value, { ...base, fill: '#ffffff0f', color: '#ffffffdb' }, { ...base, fill: GLASS_FOCUS_FILL, color: GLASS_FOCUS_INK, glow: high ? 1 : 0, glow2: high ? 1 : 0 })
      x += w + 12
    })
    return { keys, map }
  }
  // Classic's chips are border-box around 16 by 24 of padding and a 33px line, centered in the 72px
  // bar, so the selected one's thicker border grows it and pushes the rest right by `grow`.
  const ib = p.idleKeyBorder.w || 0
  const sb = p.selectedKeyBorder.w || 0
  const box = (bw, text) => {
    const w = Math.min(480, measure(text, 26, 'bold') + 48 + 2 * bw)
    const h = 65 + 2 * bw
    return { w, h, y: f.headerY + (72 - h) / 2, textX: 24 + bw, textY: 16 + bw, maxW: w - 48 - 2 * bw + 4 }
  }
  let x = f.x + f.padX
  chips.forEach((chip, i) => {
    const idle = box(ib, chip.value)
    const base = { x, r: p.chipRadius, text: chip.value, size: 26, font: fonts.bold, match: '', matchX: 0, matchColor: NONE, icon: 0 }
    add(
      i,
      chip.value,
      { ...base, ...idle, fill: p.chipBackground, color: p.textPrimary, border: ib, borderColor: p.idleKeyBorder.color },
      { ...base, ...box(sb, chip.value), fill: p.selectedKey, color: p.textOnSelected, border: sb, borderColor: p.selectedKeyBorder.color, glow: high && p.focusGlow.length ? 1 : 0 },
    )
    x += idle.w + 12
  })
  return { keys, map, grow: 2 * (sb - ib) }
}

// Hold OK on a key with accents, or press the keyboard key, and its row of choices opens over it,
// its bottom 88px (glass 104, docked 108) above the key's. `key` is the cell it opened from. The
// popup grows with a selected glass key, so the cells are placed from the key's corner and
// `scale` is the key's. The panel's 1px border adds to its size and insets the choices.
export const popupCellsFor = ({ pop, key, look, p, fonts, measure }) => {
  const classic = look === 'classic'
  const styles = pop.picker ? getKeyboardStyleOptions() : null
  const bw = classic ? p.panelBorder.w || 0 : 1
  const cells = []
  const pick = (selected) => {
    if (classic) {
      return {
        fill: selected ? p.selectedKey : NONE,
        color: selected ? p.textOnSelected : p.textMuted,
        border: selected ? p.selectedKeyBorder.w : 0,
        borderColor: selected ? p.selectedKeyBorder.color : NONE,
        glow: selected && p.focusGlow.length ? p.focusGlow[0] : null,
      }
    }
    if (!selected) return { fill: NONE, color: '#ffffffdb', border: 0, borderColor: NONE, glow: null }
    return { fill: look === 'glass' ? GLASS_FOCUS_FILL : p.accent, color: look === 'glass' ? GLASS_FOCUS_INK : p.accentInk, border: 0, borderColor: NONE, glow: null }
  }
  const lift = look === 'docked' ? 108 : look === 'glass' ? 104 : 88
  // Shifted to stay on screen.
  const place = (w, h) => ({
    x: Math.max(16 - key.x, Math.min(1920 - 16 - w - key.x, key.w / 2 - w / 2)),
    y: key.h - lift - h,
  })
  const panel = (at, w, h) => ({
    k: 'panel', x: at.x, y: at.y, w, h, r: classic ? p.panelRadius : 28, fill: classic ? p.panel : '#1c1e24fa', text: '', check: 0,
    border: bw, borderColor: classic ? p.panelBorder.color : '#ffffff17', shadow: 1, glow: null,
  })
  if (styles) {
    const w = 320 + 32 + 2 * bw
    const h = pop.options.length * 72 + (pop.options.length - 1) * 8 + 32 + 2 * bw
    const at = place(w, h)
    cells.push(panel(at, w, h))
    pop.options.forEach((opt, i) => {
      const s = pick(i === pop.index)
      cells.push({ k: opt, i, x: at.x + bw + 16, y: at.y + bw + 16 + i * 80, w: 320, h: 72, r: classic ? p.chipRadius : 20, ...s, text: styles[i].label, size: 30, font: fonts.medium, textX: 24, check: opt === look ? 1 : 0 })
    })
  } else {
    // Classic's choices are bold, the others' medium.
    const font = classic ? fonts.bold : fonts.medium
    const widths = pop.options.map((o) => Math.max(72, measure(o, 36, classic ? 'bold' : 'medium') + 24))
    const w = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 12 + 32 + 2 * bw
    const h = 72 + 32 + 2 * bw
    const at = place(w, h)
    cells.push(panel(at, w, h))
    let ox = at.x + bw + 16
    pop.options.forEach((opt, i) => {
      const s = pick(i === pop.index)
      cells.push({ k: `${i}${opt}`, i, x: ox, y: at.y + bw + 16, w: widths[i], h: 72, r: classic ? p.chipRadius : 20, ...s, text: opt, size: 36, font, textX: widths[i] / 2, center: 1, check: 0 })
      ox += widths[i] + 12
    })
  }
  return { x: key.x, y: key.y, w: key.w, h: key.h, scale: key.scale, cells }
}
