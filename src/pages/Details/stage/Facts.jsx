import $L from '../../../services/i18n.js'
import { For, createSignal, untrack } from 'solid-js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, fontFor, themeSpacing, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { factsWeight } from '../premiere/premiereRules.js'
import { pointerFocus } from '../../../app/pointer.js'

// The people and studios behind a title, one cell each. A cell takes focus first, and OK opens it
// so its names can be picked, holding focus there until Back closes it. The crew list merges a
// director who also wrote, so the roles are read from People. With `weighByText` each cell's width
// follows how much text it holds.
//
// Props: `tokens`, `x`, `y`, `alpha`, `ref`. Its node has draw({item, showsSection, w, weighByText}),
// which returns the panel's height (0 when it's empty), and close(), which shuts an open cell and
// says whether one was open. Calls onFactsEdge(dir) for Up and Down, and Left or Right off the
// panel's ends, and onFactsPerson(person) or onFactsStudio(name) on OK on a name.
const PAD_X = 27
const PAD_Y = 23
// Layout counts the cells' 2.5px borders as 2px.
const BORDER = 2
const NAME_H = 48
const NAME_GAP = 13.4
const PANEL_EDGE = hex('#ffffff0f')
const NAME_EDGE = hex('#ffffff1a')
const NO_CELL = { key: '', i: -1, x: 0, w: 0, title: '', titleX: 0, titleY: 0, radius: 0 }
const NO_NAME = { k: '', cell: '', j: -1, x: 0, y: 0, w: 0, name: '', font: 'roboto', textY: 0, row: 0, cx: 0 }

const factGroups = (item, showsSection) => {
  const people = showsSection('crew') ? item.People || [] : []
  const directors = people.filter((p) => p.Type === 'Director')
  const writers = people.filter((p) => p.Type === 'Writer')
  const studios = showsSection('studios') ? (item.Studios || []).map((st) => st && st.Name).filter(Boolean) : []
  return [
    { key: 'directors', title: directors.length === 1 ? $L('Director') : $L('Directors'), names: directors.map((p) => ({ key: p.Id || p.Name, name: p.Name, person: p })) },
    { key: 'writers', title: writers.length === 1 ? $L('Writer') : $L('Writers'), names: writers.map((p) => ({ key: p.Id || p.Name, name: p.Name, person: p })) },
    { key: 'studios', title: $L('Studio'), names: studios.map((name) => ({ key: name, name })) },
  ].filter((g) => g.names.length)
}

// The names of one cell, wrapped and centered in its inner width.
const placeNames = (names, innerW) => {
  const rows = []
  let row = []
  let x = 0
  names.forEach((n) => {
    const full = 2 * BORDER + 34 + textWidth(n.name, 20)
    const w = Math.min(innerW, full)
    if (row.length && x + NAME_GAP + w > innerW) {
      rows.push({ items: row, w: x })
      row = []
      x = 0
    }
    // A name wider than its cell is cut at the box's padding.
    row.push({ ...n, w, cut: full > innerW, x: row.length ? x + NAME_GAP : 0 })
    x += (row.length > 1 ? NAME_GAP : 0) + w
  })
  if (row.length) rows.push({ items: row, w: x })
  const out = []
  rows.forEach((r, ri) => r.items.forEach((n) => out.push({ ...n, row: ri, x: (innerW - r.w) / 2 + n.x, y: ri * (NAME_H + NAME_GAP) })))
  return { names: out, h: rows.length ? rows.length * NAME_H + (rows.length - 1) * NAME_GAP : 0 }
}

export default function StageFacts(props) {
  const [box, setBox] = createSignal({ w: 0, h: 0 })
  const [cells, setCells] = createSignal([])
  const [names, setNames] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [open, setOpen] = createSignal('')
  const [nameCur, setNameCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || { focus: '#00a4dcff' }
  const semi = () => uiFont('bold')
  const cellList = byKey(cells, NO_CELL)
  const nameList = byKey(names, NO_NAME)
  let groups = []

  const draw = ({ item, showsSection, w, weighByText }) =>
    untrack(() => {
      groups = factGroups(item, showsSection)
      if (!groups.length) {
        setCells([])
        setNames([])
        setBox({ w, h: 0 })
        return 0
      }
      const weights = groups.map((g) => (weighByText ? factsWeight(g.names.map((n) => n.name)) : 1))
      const total = weights.reduce((a, b) => a + b, 0)
      const inner = w - 2
      // A cell is its borders and padding plus its share of the room left. The cells after the first
      // have the 1px divider for a left border.
      const lb = (i) => (i ? 1 : BORDER)
      const free = inner - groups.reduce((sum, g, i) => sum + lb(i) + BORDER + 2 * PAD_X, 0)
      let x = 1
      let tallest = 0
      const laid = groups.map((g, i) => {
        const cw = lb(i) + BORDER + 2 * PAD_X + (free * weights[i]) / total
        const placed = placeNames(g.names, cw - lb(i) - BORDER - 2 * PAD_X)
        tallest = Math.max(tallest, placed.h)
        const cell = { ...g, i, x, w: cw, placed, lb: lb(i) }
        x += cw
        return cell
      })
      const last = laid.length - 1
      const h = 2 + 2 * BORDER + 2 * PAD_Y + 33 + 13 + tallest
      setCells(
        laid.map((c) => {
          const title = c.title.toUpperCase()
          const tw = textWidth(title, 18.4, 'bold') + 1.7 * title.length
          const radius = last === 0 ? 18 : c.i === 0 ? [18, 0, 0, 18] : c.i === last ? [0, 18, 18, 0] : 0
          return { k: c.key, key: c.key, i: c.i, x: c.x, w: c.w, title, titleX: (c.w - tw) / 2, titleY: BORDER + PAD_Y + cssShift(18.4), radius }
        }),
      )
      const out = []
      laid.forEach((c) => {
        c.placed.names.forEach((n, j) => {
          out.push({
            k: `${c.key}-${j}`, cell: c.key, j, x: c.x + c.lb + PAD_X + n.x, y: 1 + BORDER + PAD_Y + 33 + 13 + n.y, w: n.w, name: n.name,
            font: fontFor(n.name, 'regular'), textY: 9 + cssShift(20), row: n.row, cx: n.x + n.w / 2, cut: n.cut,
          })
        })
      })
      setNames(out)
      setBox({ w, h })
      if (cur() >= laid.length) setCur(0)
      if (open() && !laid.some((c) => c.key === open())) setOpen('')
      return h
    })

  const openNames = () => names().filter((n) => n.cell === open())
  const close = () => {
    if (!open()) return false
    setOpen('')
    return true
  }
  const edge = (dir) => {
    if (props.onFactsEdge) props.onFactsEdge(dir)
    return true
  }
  // Up and Down inside an open cell go to the nearest name on the next row.
  const stepRow = (d) => {
    const list = openNames()
    const here = list[nameCur()]
    if (!here) return true
    const next = list.filter((n) => n.row === here.row + d)
    if (!next.length) return true
    let best = next[0]
    next.forEach((n) => {
      if (Math.abs(n.cx - here.cx) < Math.abs(best.cx - here.cx)) best = n
    })
    setNameCur(best.j)
    return true
  }
  const cellOn = (i) => focused() && !open() && i === cur()
  const nameOn = (n) => focused() && open() === n.cell && nameCur() === n.j

  return (
    <view
      ref={(n) => {
        n.draw = draw
        n.close = close
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={box().w}
      height={box().h}
      alpha={(props.alpha == null ? 1 : props.alpha) * (cells().length ? 1 : 0)}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (open()) {
          const list = openNames()
          if (nameCur() > 0 && list[nameCur() - 1].row === list[nameCur()].row) setNameCur(nameCur() - 1)
          return true
        }
        if (cur() > 0) setCur(cur() - 1)
        else edge('left')
        return true
      }}
      onRight={() => {
        if (open()) {
          const list = openNames()
          if (nameCur() < list.length - 1 && list[nameCur() + 1].row === list[nameCur()].row) setNameCur(nameCur() + 1)
          return true
        }
        if (cur() < cells().length - 1) setCur(cur() + 1)
        else edge('right')
        return true
      }}
      onUp={() => (open() ? stepRow(-1) : edge('up'))}
      onDown={() => (open() ? stepRow(1) : edge('down'))}
      onEnter={() => {
        if (!open()) {
          const c = cells()[cur()]
          if (!c) return true
          setNameCur(0)
          setOpen(c.key)
          return true
        }
        const g = groups.find((x) => x.key === open())
        const n = g && g.names[nameCur()]
        if (!n) return true
        if (n.person) props.onFactsPerson(n.person)
        else props.onFactsStudio(n.name)
        return true
      }}
      onBack={() => close()}
    >
      <view width={box().w} height={box().h} borderRadius={20} color="#ffffff08" border={{ width: 1, color: PANEL_EDGE }} />
      <view
        width={box().w}
        height={box().h}
        // The Magic Remote's cursor focuses the fact under it, and OK then opens it (app/pointer.js).
        onPointerChildOver={(i, child) => {
          pointerFocus(child.parent.parent)
          const c = cellList.at(cellList.keys()[i])
          if (c && c.i !== cur()) setCur(c.i)
        }}
      >
        <For each={cellList.keys()}>
          {(k) => {
            const c = () => cellList.at(k)
            return (
              <view x={c().x} y={1} width={c().w} height={box().h - 2}>
                <view alpha={c().i ? 1 : 0} width={1} height={box().h - 2} color="#ffffff14" />
                <view
                  alpha={cellOn(c().i) ? 1 : 0}
                  width={c().w}
                  height={box().h - 2}
                  borderRadius={c().radius}
                  color={t().accentA ? t().accentA(0.1) : '#00a4dc1a'}
                  border={{ width: 2.5, color: hex(t().focus) }}
                />
                <text x={c().titleX} y={c().titleY} fontFamily={semi()} fontSize={18.4} lineHeight={33} letterSpacing={1.7} color="#ffffff66">
                  {c().title}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <view width={box().w} height={box().h}>
        <For each={nameList.keys()}>
          {(k) => {
            const n = () => nameList.at(k)
            const on = () => nameOn(n())
            return (
              <view x={n().x} y={n().y} width={n().w} height={NAME_H}>
                <view width={n().w} height={NAME_H} borderRadius={13} color="#ffffff0a" border={{ width: 2, color: NAME_EDGE }} alpha={on() ? 0 : 1} />
                <view width={n().w} height={NAME_H} borderRadius={13} color="#00a4dc26" border={{ width: 2, color: hex(t().focus) }} alpha={on() ? 1 : 0} />
                <text
                  x={19}
                  y={n().textY}
                  fontFamily={n().font}
                  fontSize={20}
                  lineHeight={30}
                  letterSpacing={themeSpacing()}
                  maxWidth={n().cut ? n().w - 2 * BORDER - 34 : n().w}
                  maxLines={1}
                  color={on() ? '#ffffffff' : '#ffffffd9'}
                >
                  {n().name}
                </text>
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
