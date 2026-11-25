// The LG Magic Remote's pointer (and a mouse). The UI is one canvas, so the browser's click lands on
// the canvas and this works out which control is under the cursor, like a DOM event: the topmost node
// that draws something there, then up its parents to the first one that takes the pointer.
//
// A control takes the pointer with these props:
//   onPointerOver(node)   the cursor came onto it. Controls whose screen holds still move focus here.
//   onPointerClick(node)  OK (or a mouse click) on it. Returning true means it focused the control
//                         and Enter should now press it. Without one, a click on a control with
//                         onPointerOver is that control's Enter: hover has already focused it.
//   pointerRing           draw the hover ring around it (PointerRing.jsx). Rows that slide under focus
//                         use this instead of onPointerOver, since moving focus would slide the card
//                         away from the cursor.
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
// When the last Enter key from the remote came with the cursor on a control.
let enterAt = 0
// Whether the Enter keydown in progress went to the pointer, so its keyup goes there too.
let enterTaken = false
// Whether it went on to the focused control after the pointer's control focused itself.
let enterPassed = false

const takes = (n) => !!(n.onPointerOver || n.onPointerClick || n.pointerRing)

const inside = (l, x, y) => x >= l.absX && y >= l.absY && x < l.absX + (l.width || 0) && y < l.absY + (l.height || 0)

// Children in the order they draw: zIndex, then the order they were added.
const drawOrder = (children) => {
  let sorted = false
  for (let i = 1; i < children.length && !sorted; i++) {
    if (((children[i].lng && children[i].lng.zIndex) || 0) < ((children[i - 1].lng && children[i - 1].lng.zIndex) || 0)) sorted = true
  }
  if (!sorted) return children
  return children
    .map((c, i) => ({ c, i, z: (c.lng && c.lng.zIndex) || 0 }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((e) => e.c)
}

// The last node drawn at (x, y) that draws anything.
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
    if (l.isRenderable && inside(l, x, y)) found = c
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

const targetAt = (x, y) => {
  let n = topmost(rootNode, x, y, null)
  while (n && !takes(n)) n = n.parent
  if (!n) return null
  const modal = modalOf()
  return modal && !within(n, modal) ? null : n
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

const hover = (n) => {
  if (n === hovered) return
  hovered = n
  if (n && n.pointerRing) {
    const l = n.lng
    const first = n.children && n.children[0]
    const radius = n.pointerRing !== true ? n.pointerRing : n.borderRadius || (first && first.borderRadius) || 0
    setRing({ x: l.absX, y: l.absY, w: l.width || 0, h: l.height || 0, radius })
  } else if (ring()) setRing(null)
  if (n && n.onPointerOver) n.onPointerOver(n)
}

const synthetic = new WeakSet()

const sendEnter = () => {
  const down = keyEvent('Enter', 13, 'keydown')
  const up = keyEvent('Enter', 13, 'keyup')
  synthetic.add(down)
  synthetic.add(up)
  document.dispatchEvent(down)
  document.dispatchEvent(up)
}

// The press moves focus, which can move the screen, so the ring goes until the cursor moves.
const press = (n) => {
  const enter = n.onPointerClick(n) === true
  clear()
  return enter
}

const onMove = (e) => {
  if (!onCanvas(e)) return
  if (e.clientX === lastX && e.clientY === lastY) return
  lastX = e.clientX
  lastY = e.clientY
  wake()
  const p = toStage(e)
  hover(targetAt(p.x, p.y))
}

const onClick = (e) => {
  if (!onCanvas(e)) return
  if (wake()) return
  if (Date.now() - enterAt < SAME_PRESS_MS) return
  const p = toStage(e)
  const n = targetAt(p.x, p.y)
  if (!n) return
  if (n.onPointerClick) {
    if (press(n)) sendEnter()
    return
  }
  if (!n.onPointerOver) return
  hovered = null
  hover(n)
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
    if (hovered || enterTaken || enterPassed) enterAt = Date.now()
    enterPassed = false
    if (enterTaken) {
      enterTaken = false
      swallow(e)
    }
    return
  }
  if (!enter) {
    if (hovered) clear()
    return
  }
  // A held OK repeats, and the repeats go where the first one went.
  if (enterTaken) return swallow(e)
  if (!hovered || e.repeat) return
  enterAt = Date.now()
  // Hover already focused it, so Enter goes on as it is.
  if (!hovered.onPointerClick) return
  if (press(hovered)) {
    // The control focused itself, and this Enter goes on to press it.
    enterPassed = true
    return
  }
  enterTaken = true
  swallow(e)
}

// webOS hides the cursor a few seconds after the remote stops moving, and when a d-pad key is pressed.
const onCursor = (e) => {
  if (e.detail && e.detail.visibility === false) clear()
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
  document.dispatchEvent(keyEvent(key, code, 'keydown'))
  setTimeout(() => document.dispatchEvent(keyEvent(key, code, 'keyup')), 30)
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
    clear()
  }
}
