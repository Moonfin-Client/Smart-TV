// The TV's own keyboard: a real <input> laid over the field and focused, which brings up webOS's
// VKB or Tizen's IME (and the remote's microphone with them). What's typed comes back through
// onChange, and Enter (or the IME's Done) closes it as submitted. Back, the IME's Cancel, Up, Down,
// the VKB closing or the input losing focus close it without. onClose(submitted, key) says which,
// with 'up' or 'down' when an arrow closed it.
import * as settings from '../../../state/settings.js'

const BACK = [461, 10009, 27, 65385]
const DONE = [13, 65376]

let el = null
let session = null

// Keyboard Style set to Native hands every field to the TV's keyboard.
export const usesNativeKeyboard = () => settings.get('keyboardStyle') === 'native'

const stageScale = () => {
  const canvas = typeof document !== 'undefined' && document.querySelector('canvas')
  const box = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1920 }
  return { left: box.left, top: box.top, k: box.width / 1920 }
}

const close = (submitted, key) => {
  const s = session
  if (!s) return
  session = null
  el.removeEventListener('input', s.onInput)
  el.removeEventListener('keydown', s.onKey)
  el.removeEventListener('keyup', s.onKeyUp)
  el.removeEventListener('blur', s.onBlur)
  document.removeEventListener('keyboardStateChange', s.onVkb)
  el.blur()
  el.style.display = 'none'
  if (s.onClose) s.onClose(!!submitted, key || '')
}

// rect is the field's box on the 1920x1080 stage.
export const openNativeInput = ({ value = '', password = false, maxLength, rect, onChange, onClose }) => {
  if (typeof document === 'undefined') return false
  if (session) close(false)
  if (!el) {
    el = document.createElement('input')
    el.setAttribute('autocomplete', 'off')
    el.setAttribute('autocorrect', 'off')
    el.setAttribute('autocapitalize', 'off')
    el.setAttribute('spellcheck', 'false')
    // Nearly invisible rather than hidden: a TV only raises its keyboard for an input it can see.
    el.style.cssText = 'position:fixed;z-index:10;opacity:0.01;border:0;padding:0;margin:0;outline:none;background:transparent;color:transparent;caret-color:transparent;font-size:16px;'
    document.body.appendChild(el)
  }
  const { left, top, k } = stageScale()
  const r = rect || { x: 0, y: 0, w: 800, h: 80 }
  el.style.left = `${left + r.x * k}px`
  el.style.top = `${top + r.y * k}px`
  el.style.width = `${r.w * k}px`
  el.style.height = `${r.h * k}px`
  el.style.display = 'block'
  el.type = password ? 'password' : 'text'
  if (maxLength) el.maxLength = maxLength
  else el.removeAttribute('maxlength')
  el.value = String(value)
  const s = { onClose }
  s.onInput = () => onChange && onChange(el.value)
  // Keys stay with the input, so the app behind doesn't act on what's typed.
  s.onKey = (e) => {
    e.stopPropagation()
    const code = e.keyCode || e.which
    if (DONE.indexOf(code) >= 0) {
      e.preventDefault()
      close(true)
    } else if (BACK.indexOf(code) >= 0) {
      e.preventDefault()
      close(false)
    } else if (code === 38 || code === 40) {
      e.preventDefault()
      close(false, code === 38 ? 'up' : 'down')
    }
  }
  s.onKeyUp = (e) => e.stopPropagation()
  s.onBlur = () => close(false)
  // webOS closes its keyboard without blurring the field.
  s.onVkb = (e) => {
    if (!(e.detail && e.detail.visibility)) close(false)
  }
  el.addEventListener('input', s.onInput)
  el.addEventListener('keydown', s.onKey)
  el.addEventListener('keyup', s.onKeyUp)
  el.addEventListener('blur', s.onBlur)
  document.addEventListener('keyboardStateChange', s.onVkb)
  session = s
  el.focus()
  try {
    el.setSelectionRange(el.value.length, el.value.length)
  } catch (e) {
    // Password fields on some engines refuse selection changes
  }
  return true
}

export const closeNativeInput = () => close(false)

// Where a node sits on the stage, from the renderer's transform.
export const stageRect = (node, w, h) => {
  const gt = node && node.globalTransform
  return { x: gt ? gt.tx : 0, y: gt ? gt.ty : 0, w, h }
}
