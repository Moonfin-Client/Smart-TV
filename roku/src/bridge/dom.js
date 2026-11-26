// The remote's keys as the keydown and keyup events a TV browser sends.
const g = globalThis

const KEYS = {
  up: ['ArrowUp', 38],
  down: ['ArrowDown', 40],
  left: ['ArrowLeft', 37],
  right: ['ArrowRight', 39],
  OK: ['Enter', 13],
  // GoBack is the Back SolidTV listens for, and Backspace stays the keyboard's delete.
  back: ['GoBack', 461],
  backspace: ['Backspace', 8],
  play: ['MediaPlayPause', 179],
  rev: ['MediaRewind', 227],
  fwd: ['MediaFastForward', 228],
  options: ['ContextMenu', 93],
  replay: ['MediaTrackPrevious', 177],
}

const send = (type, name, repeat) => {
  const [key, keyCode] = KEYS[name] || typed(name)
  const e = {
    type,
    key,
    code: key,
    keyCode,
    which: keyCode,
    repeat,
    timeStamp: Date.now(),
    defaultPrevented: false,
    stopped: false,
    immediateStopped: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
    stopImmediatePropagation() {
      this.stopped = true
      this.immediateStopped = true
    },
  }
  // Window's capture listeners, then the page's (on document), then window's bubbling ones.
  g.window.dispatchTo(e, 'capture')
  if (!e.stopped) g.document.dispatchTo(e)
  if (!e.stopped) g.window.dispatchTo(e, 'bubble')
}

// A typed character arrives as Lit_ and the character, URL-encoded, as ECP and Roku keyboards send it.
const typed = (name) => {
  const ch = decodeURIComponent(name.slice(4))
  return [ch, ch.toUpperCase().charCodeAt(0)]
}

// A press, a release, or the scene's repeat of a held arrow (MoonfinScene.brs).
export const pressKey = (name, press, repeat) => {
  if (!KEYS[name] && name.indexOf('Lit_') !== 0) return
  send(press ? 'keydown' : 'keyup', name, !!repeat)
}
