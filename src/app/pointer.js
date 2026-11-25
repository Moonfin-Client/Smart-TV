// The LG Magic Remote's pointer (and a mouse). The UI is one canvas, so the browser's click lands on
// the canvas and this works out which control is under the cursor, like a DOM event: the topmost node
// that draws something there, then up its parents to the first one that takes the pointer.
//
// A control takes the pointer with these props:
//   onPointerOver(node)   the cursor came onto it. Controls whose screen holds still move focus here.
//   onPointerClick(node, p)  OK (or a mouse click) on it, p the stage point (localPoint() maps it). Returning true means it focused the control
//                         and Enter should now press it. Without one, a click on a control with
//                         onPointerOver is that control's Enter: hover has already focused it.
//   pointerRing           draw the hover ring around it (PointerRing.jsx). Rows that slide under focus
//                         use this instead of onPointerOver, since moving focus would slide the card
//                         away from the cursor.
//   pointerItems()        a list drawn in one batch, with no node per item: the items' boxes
//                         [{ x, y, w, h, r? }] relative to the node. The node then takes
//                         onPointerItem(item, i) on hover, onPointerItemClick(item, i) on a click
//                         (true for Enter after it, as above; without one a click is Enter after
//                         the hover), and pointerItemRing (true or a radius) to ring the item.
//   onPointerChildOver(i, child), onPointerChildClick(i, child)
//                         on a node whose children are a list's items in order (a <For>): the
//                         cursor on child i. pointerChildRing (true or a radius) rings the child.
// A node that draws but takes no pointer (a dialog's backdrop) still stops what's under it, unless it
// has pointerSkip (the hover ring itself). While focus is inside a node with pointerModal (the
// on-screen keyboard, a dialog that doesn't cover the screen), only controls inside it take the pointer.
import { createSignal } from 'solid-js'
import { activeElement, rootNode } from '@solidtv/solid'
import { wake } from '../state/shell/idle.js'

const STAGE_W = 1920
// webOS can send OK as an Enter key as well as the click. The key acts, and a click this soon after
// it is the same press.
const SAME_PRESS_MS = 300

const [ring, setRing] = createSignal(null)
// The hover ring's box on the stage, or null.
export { ring as pointerRing }

let hovered = null
let lastX = -1
let lastY = -1
// Where the cursor last was on the stage, while webOS shows it.
let cursorAt = null
// When the last Enter key from the remote came with the cursor on a control.
let enterAt = 0
// Whether the Enter keydown in progress went to the pointer, so its keyup goes there too.
let enterTaken = false

const takes = (n) => !!(n.onPointerOver || n.onPointerClick || n.pointerRing || n.pointerItems)

// Where a node draws on the stage: its corner and scale, with the scale of its parents (absX and
// width leave those out).
const frame = (l) => {
  const g = l.globalTransform
  return g ? { x: g.tx, y: g.ty, kx: g.ta || 1, ky: g.td || 1 } : { x: l.absX, y: l.absY, kx: 1, ky: 1 }
}

const inside = (l, x, y) => {
  const f = frame(l)
  return x >= f.x && y >= f.y && x < f.x + (l.width || 0) * f.kx && y < f.y + (l.height || 0) * f.ky
}

// Children in the order they draw: zIndex, then the order they were added.
const drawOrder = (children) => {
  let unsorted = false
  for (let i = 1; i < children.length && !unsorted; i++) {
    if (((children[i].lng && children[i].lng.zIndex) || 0) < ((children[i - 1].lng && children[i - 1].lng.zIndex) || 0)) unsorted = true
  }
  if (!unsorted) return children
  return children
    .map((c, i) => ({ c, i, z: (c.lng && c.lng.zIndex) || 0 }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((e) => e.c)
}

const outline = (c) => c.color === 0 && !c.src && c.lng.text === undefined

// The last node drawn at (x, y) that draws anything or takes the pointer.
const topmost = (node, x, y, found) => {
  const kids = node.children
  if (!kids || !kids.length) return found
  const list = drawOrder(kids)
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    const l = c.lng
    if (!c.rendered || !l || typeof l.absX !== 'number' || c.pointerSkip) continue
    if (l.worldAlpha === 0) continue
    if (l.clipping && !inside(l, x, y)) continue
    // A hit area (a control with nothing inside it) counts where it is though it draws nothing. A
    // wrapper counts through what its children draw, since a view without a size takes its parent's.
    // A clear box that only draws a border or a shadow over the rest (a window's rim) doesn't count.
    const area = takes(c) && !(c.children && c.children.length)
    if ((area || (l.isRenderable && !outline(c))) && inside(l, x, y)) found = c
    found = topmost(c, x, y, found)
  }
  return found
}

const within = (n, top) => {
  for (let p = n; p; p = p.parent) if (p === top) return true
  return false
}

const modalOf = () => {
  for (let p = activeElement(); p; p = p.parent) if (p.pointerModal) return p
  return null
}

// What takes the pointer at (x, y): { node, i, over, click, ring }. An item list the point misses
// lets it go on to the parents.
const targetOf = (n, x, y) => {
  const l = n.lng
  const f = frame(l)
  if (n.pointerItems) {
    const items = n.pointerItems() || []
    const lx = (x - f.x) / f.kx
    const ly = (y - f.y) / f.ky
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it || lx < it.x || ly < it.y || lx >= it.x + it.w || ly >= it.y + it.h) continue
      const r = n.pointerItemRing
      return {
        node: n,
        i,
        over: n.onPointerItem ? () => n.onPointerItem(it, i, n) : null,
        click: n.onPointerItemClick ? () => n.onPointerItemClick(it, i, n, { x, y }) : null,
        ring: r ? { x: f.x + it.x * f.kx, y: f.y + it.y * f.ky, w: it.w * f.kx, h: it.h * f.ky, radius: (r === true ? it.r || 0 : r) * f.kx } : null,
      }
    }
    if (!(n.onPointerOver || n.onPointerClick || n.pointerRing)) return null
  }
  let ring = null
  if (n.pointerRing) {
    const first = n.children && n.children[0]
    const radius = n.pointerRing !== true ? n.pointerRing : n.borderRadius || (first && first.borderRadius) || 0
    ring = { x: f.x, y: f.y, w: (l.width || 0) * f.kx, h: (l.height || 0) * f.ky, radius: radius * f.kx }
  }
  return {
    node: n,
    i: -1,
    over: n.onPointerOver ? () => n.onPointerOver(n) : null,
    click: n.onPointerClick ? () => n.onPointerClick(n, { x, y }) : null,
    ring,
  }
}

const childTarget = (list, child, x, y) => {
  const i = list.children.indexOf(child)
  if (i < 0) return null
  const l = child.lng
  const f = frame(l)
  const r = list.pointerChildRing
  return {
    node: list,
    i,
    over: list.onPointerChildOver ? () => list.onPointerChildOver(i, child) : null,
    click: list.onPointerChildClick ? () => list.onPointerChildClick(i, child, { x, y }) : null,
    ring: r && l.width ? { x: f.x, y: f.y, w: l.width * f.kx, h: (l.height || 0) * f.ky, radius: (r === true ? child.borderRadius || 0 : r) * f.kx } : null,
  }
}

const listOf = (n) => n.parent && (n.parent.onPointerChildClick || n.parent.onPointerChildOver) ? n.parent : null

const targetAt = (x, y) => {
  let n = topmost(rootNode, x, y, null)
  let t = null
  for (; n && !t; n = n.parent) {
    if (takes(n)) t = targetOf(n, x, y)
    if (!t && listOf(n)) t = childTarget(n.parent, n, x, y)
  }
  if (!t) return null
  const modal = modalOf()
  return modal && !within(t.node, modal) ? null : t
}

// Focuses a control from the pointer. A page that keeps its own focus state (a zone, a focus id) has
// onPointerFocus(node) on a node above it, which focuses the control its own way and returns true;
// otherwise the control takes focus as it is.
export const pointerFocus = (node) => {
  if (!node || node.states.has('$focus')) return
  for (let p = node.parent; p; p = p.parent) if (p.onPointerFocus && p.onPointerFocus(node) === true) return
  node.setFocus()
}

// A stage point in a node's own units, for a control that acts on where it's clicked (a seek bar).
export const localPoint = (node, p) => {
  const f = frame(node.lng)
  return { x: (p.x - f.x) / f.kx, y: (p.y - f.y) / f.ky }
}

// Hears every move of the cursor over the app, as a page that shows its controls on movement wants.
const movers = new Set()
export const pointerMoves = (fn) => {
  movers.add(fn)
  return () => movers.delete(fn)
}

const toStage = (e) => {
  const canvas = document.querySelector('canvas')
  const box = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: STAGE_W }
  const k = box.width ? STAGE_W / box.width : 1
  return { x: (e.clientX - box.left) * k, y: (e.clientY - box.top) * k }
}

// Only the app's own canvas: AfterHours and the game emulator draw DOM of their own.
const onCanvas = (e) => {
  const t = e.target
  return !t || t === document || t === document.body || t === document.documentElement || t.tagName === 'CANVAS'
}

const clear = () => {
  hovered = null
  if (ring()) setRing(null)
}

const same = (a, b) => (a && b ? a.node === b.node && a.i === b.i : a === b)

const hover = (t) => {
  if (same(t, hovered)) return
  hovered = t
  if (t && t.ring) setRing(t.ring)
  else if (ring()) setRing(null)
  if (t && t.over) t.over()
}

const synthetic = new WeakSet()

// On the next tick, once the focus the click moved has settled, or the press would go to what had
// focus before.
const sendEnter = () => {
  const down = keyEvent('Enter', 13, 'keydown')
  const up = keyEvent('Enter', 13, 'keyup')
  synthetic.add(down)
  synthetic.add(up)
  setTimeout(() => {
    document.dispatchEvent(down)
    document.dispatchEvent(up)
  }, 0)
}

// The press moves focus, which can move the screen, so the ring goes until the cursor moves.
const press = (t) => {
  const enter = t.click() === true
  clear()
  return enter
}

// The cursor left the canvas or hid: the next move counts even at the same spot.
const forgetCursor = () => {
  cursorAt = null
  lastX = -1
  lastY = -1
}

const onMove = (e) => {
  if (!onCanvas(e)) {
    if (cursorAt) {
      forgetCursor()
      clear()
    }
    return
  }
  if (e.clientX === lastX && e.clientY === lastY) return
  lastX = e.clientX
  lastY = e.clientY
  wake()
  const p = toStage(e)
  cursorAt = p
  movers.forEach((fn) => fn(p))
  hover(targetAt(p.x, p.y))
}

const onClick = (e) => {
  if (!onCanvas(e)) return
  if (wake()) return
  if (Date.now() - enterAt < SAME_PRESS_MS) return
  const p = toStage(e)
  const t = targetAt(p.x, p.y)
  if (!t) return
  if (t.click) {
    if (press(t)) sendEnter()
    return
  }
  if (!t.over) return
  hovered = null
  hover(t)
  sendEnter()
}

// Ahead of the focus manager. OK with the cursor on a control is that control's press; any other key
// is the d-pad taking over, so the hover goes.
const swallow = (e) => {
  e.preventDefault()
  e.stopPropagation()
}

const onKey = (e) => {
  if (synthetic.has(e)) return
  const enter = e.keyCode === 13
  if (e.type === 'keyup') {
    if (!enter) return
    // The click that follows this press is the same press.
    if (hovered || enterTaken) enterAt = Date.now()
    if (enterTaken) {
      enterTaken = false
      swallow(e)
    }
    return
  }
  if (!enter) {
    // The d-pad hides the cursor; other keys (Back, media) leave it where it is.
    if (e.keyCode >= 37 && e.keyCode <= 40) forgetCursor()
    if (hovered) clear()
    return
  }
  // A held OK repeats, and the repeats go where the first one went.
  if (enterTaken) return swallow(e)
  if (e.repeat) return
  // What's under the cursor now: a dialog may have opened or the screen changed since it last moved,
  // and a press clears the hover until it moves again.
  const was = hovered
  if (cursorAt) hover(targetAt(cursorAt.x, cursorAt.y))
  else if (hovered) clear()
  if (!hovered) return
  enterAt = Date.now()
  if (!hovered.click) {
    // Hover already focused it, so Enter goes on as it is. Focus this hover only just asked for
    // settles later, so the press goes out after it, as a click's does.
    if (same(was, hovered)) return
    sendEnter()
    enterTaken = true
    return swallow(e)
  }
  // The control focused itself for this press, which reaches it once that focus has settled.
  if (press(hovered)) sendEnter()
  enterTaken = true
  swallow(e)
}

// webOS hides the cursor a few seconds after the remote stops moving, and when a d-pad key is pressed.
const onCursor = (e) => {
  if (!e.detail || e.detail.visibility !== false) return
  forgetCursor()
  clear()
}

const keyEvent = (key, keyCode, type) => {
  const ev = new KeyboardEvent(type, { key, keyCode, which: keyCode, bubbles: true })
  // Chrome 38 (webOS 3) ignores key and keyCode in the init, so they're put on the event.
  if (ev.keyCode !== keyCode) {
    Object.defineProperty(ev, 'key', { get: () => key })
    Object.defineProperty(ev, 'keyCode', { get: () => keyCode })
    Object.defineProperty(ev, 'which', { get: () => keyCode })
  }
  return ev
}

// The wheel steps up and down like the d-pad.
let wheelAt = 0
const onWheel = (e) => {
  if (!onCanvas(e) || !e.deltaY) return
  const now = Date.now()
  if (now - wheelAt < 250) return
  wheelAt = now
  const up = e.deltaY < 0
  const key = up ? 'ArrowUp' : 'ArrowDown'
  const code = up ? 38 : 40
  // The cursor stays up while the wheel turns, so these steps don't count as the d-pad.
  const stepDown = keyEvent(key, code, 'keydown')
  const stepUp = keyEvent(key, code, 'keyup')
  synthetic.add(stepDown)
  synthetic.add(stepUp)
  document.dispatchEvent(stepDown)
  setTimeout(() => document.dispatchEvent(stepUp), 30)
}

export const startPointer = () => {
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('wheel', onWheel, { capture: true, passive: true })
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
  document.addEventListener('cursorStateChange', onCursor)
  return () => {
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKey, true)
    document.removeEventListener('cursorStateChange', onCursor)
    forgetCursor()
    enterTaken = false
    clear()
  }
}
