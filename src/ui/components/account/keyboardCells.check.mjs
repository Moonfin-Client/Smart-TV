// node --conditions=browser src/ui/components/account/keyboardCells.check.mjs
import assert from 'node:assert/strict'

const { cellAt, cellsFor, colAfter, frameFor, popupCellsFor, rowAfter } = await import('./keyboardCells.js')
const { dockedFor, lowerFor } = await import('./keyboardLayouts.js')

const c = '#808080ff'
const p = {
  panel: c, panelBorder: { w: 1, color: c }, panelRadius: 14, idleKey: c, idleKeyBorder: { w: 1, color: c }, selectedKey: c,
  selectedKeyBorder: { w: 2, color: c }, textPrimary: c, textMuted: c, textOnSelected: c, chipBackground: c, chipRadius: 40, focusGlow: [],
  accent: c, accentInk: c, accentText: c, accentWash: c, accentSoft: c, accentLine: c, accentRing: c, accentGlow: c,
}
const fonts = { regular: 'r', medium: 'm', bold: 'b' }
const measure = (t, size) => String(t).length * size * 0.5
const lay = (look, layout) => {
  const frame = frameFor({ look, numberPad: false, hasChips: false, rows: layout.length, p })
  return { frame, cells: cellsFor({ look, numberPad: false, numericPage: false, shifted: false, layout, frame, p, search: false, fonts, high: true }) }
}

// Docked: Delete and Done span rows, so a step down from Delete passes its own cells, and a
// selection anywhere in a span draws in the span's first cell.
const docked = dockedFor('qwerty', false)
const last = docked[0].length - 1
assert.equal(docked[0][last], docked[1][last])
assert.ok(rowAfter(docked, 0, last, 1) > 1)
assert.equal(cellAt('docked', docked, 1, last), `0-${last}`)
assert.equal(colAfter(['a', 'b', 'b', 'c'], 1, 1), 3)

// The popups over the docked keyboard: the accents of s at 313, 606 (358 by 106) and the style
// picker over the keyboard key at 31, 582 (354 by 346).
const d = lay('docked', docked)
const s = d.cells.map['1-2']
assert.equal(s.label, 's')
const acc = popupCellsFor({ pop: { options: ['s', 'ß', 'ś', 'š'], index: 0 }, key: s.sel, look: 'docked', p, fonts, measure })
const panel = acc.cells[0]
assert.deepEqual([acc.x + panel.x, acc.y + panel.y, panel.w, panel.h], [313, 606, 358, 106])
assert.deepEqual([acc.x + acc.cells[1].x, acc.y + acc.cells[1].y], [330, 623])
const ime = d.cells.map['3-0']
assert.equal(ime.label, 'IME')
const picker = popupCellsFor({ pop: { options: ['native', 'classic', 'glass', 'docked'], index: 3, picker: true }, key: ime.sel, look: 'docked', p, fonts, measure })
assert.deepEqual([picker.x + picker.cells[0].x, picker.y + picker.cells[0].y, picker.cells[0].w, picker.cells[0].h], [31, 582, 354, 346])

// Glass grows the selected key, and its popup with it.
const g = lay('glass', lowerFor('qwerty'))
assert.equal(g.cells.map['0-0'].sel.scale, 1.12)
assert.equal(g.cells.map['0-0'].idle.scale, 1)
console.log('keyboardCells ok')
