// Seven presses of the About > Version row open After Hours. From the third press a toast counts
// what's left, and the seventh says it's unlocked and opens the arcade. The count resets after
// three seconds without a press.
import $L from '../../services/i18n.js'
import { loadSounds, playSound, sleepAudio } from './sound.js'
import { esc, mountLayer } from './dom.js'

const PRESSES = 7
const TOAST_FROM = 3
const RESET_MS = 3000

let arcadeOpen = false
let count = 0
let timer = null
let toastEl = null

const showToast = (n) => {
  if (n < TOAST_FROM) {
    if (toastEl) {
      toastEl.parentNode.removeChild(toastEl)
      toastEl = null
    }
    return
  }
  if (!toastEl) toastEl = mountLayer('ah-toast-host')
  const left = PRESSES - n
  if (!left) {
    toastEl.innerHTML = `<div class="ah-toast ah-done">${esc($L('After Hours unlocked'))}</div>`
    return
  }
  let dots = ''
  for (let i = 0; i < PRESSES; i++) dots += i < n ? '<i class="ah-on"></i>' : '<i></i>'
  const text = left === 1 ? $L('1 more press') : $L('{count} more presses').replace('{count}', left)
  toastEl.innerHTML = `<div class="ah-toast"><span>${esc(text)}</span><span class="ah-dots">${dots}</span></div>`
}

const setCount = (n) => {
  count = n
  showToast(n)
}

const close = () => {
  arcadeOpen = false
}

// The arcade module only loads on the seventh press.
const openArcade = () => {
  arcadeOpen = true
  import('./AfterHours.js')
    .then((m) => m.openAfterHours({ onClose: close }))
    .catch((e) => {
      console.warn('[afterhours] could not open', e)
      arcadeOpen = false
    })
}

// A press wakes the TV's audio, so it's let go again once the count runs out.
export const pressVersion = () => {
  if (arcadeOpen) return
  const sounds = loadSounds()
  const n = count + 1
  clearTimeout(timer)
  setCount(n)
  if (n < PRESSES) {
    // The first press starts the decode, so its tick lands once the kit is ready.
    sounds.then(() => playSound('tick'))
    timer = setTimeout(() => {
      setCount(0)
      sleepAudio()
    }, RESET_MS)
    return
  }
  count = 0
  sounds.then(() => playSound('fanfare'))
  openArcade()
  timer = setTimeout(() => setCount(0), 1500)
}
