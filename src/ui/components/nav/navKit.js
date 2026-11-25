// Pieces every nav style keeps. Call them in a component's body, since they clean up with it.
import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onCleanup } from 'solid-js'
import * as settings from '../../../state/settings.js'
import { formatClockTime, shiftedNow } from '../../../utils/clock.js'
import { textReady } from '../../text.js'
import { userImageUrl } from '../../images.js'
import { onFriendsChange } from './friends.js'

// The clock's text while shown() is true. It changes once a minute, on the minute, so it costs one
// frame a minute. [prefs] are the settings to read in place of the saved ones (Settings' preview).
export const navClock = (shown, prefs) => {
  const [minute, setMinute] = createSignal(0)
  let timer
  const next = () => {
    timer = setTimeout(
      () => {
        setMinute(minute() + 1)
        next()
      },
      60050 - (Date.now() % 60000),
    )
  }
  next()
  onCleanup(() => clearTimeout(timer))
  return createMemo(() => {
    minute()
    const s = (prefs && prefs()) || settings.all()
    return shown() ? formatClockTime(shiftedNow(s.timeOffsetHours), s.clockDisplay) : ''
  })
}

// A count that moves whenever the Friends button or its badge should change.
export const friendsTicker = () => {
  const [tick, setTick] = createSignal(0)
  onCleanup(onFriendsChange(() => setTick(tick() + 1)))
  return tick
}

// True once the measuring faces are in, for layouts built from textWidth.
export const fontsReady = () => {
  const [ready, setReady] = createSignal(false)
  textReady().then(() => setReady(true))
  return ready
}

// For a memo's equals: true when two plain objects hold the same values, so a list item that comes
// back unchanged doesn't update what draws it.
export const sameFields = (a, b) => {
  if (a === b) return true
  if (!a || !b) return false
  for (const k in a) if (a[k] !== b[k]) return false
  for (const k in b) if (!(k in a)) return false
  return true
}

export const navUser = (store) => ({
  avatar: createMemo(() => {
    const u = store.user
    return u && u.PrimaryImageTag ? userImageUrl(store.serverUrl, store.userId, u.PrimaryImageTag) : ''
  }),
  name: () => (store.user && store.user.Name) || $L('User'),
  initial: () => {
    const name = (store.user && store.user.Name) || ''
    return name ? name.charAt(0) : 'U'
  },
})

// The User Opacity setting as an alpha. [prefs] are the settings to read in place of the saved ones.
export const userOpacity = (prefs) => {
  const s = prefs || settings.all()
  return (s.userOpacity == null ? 85 : s.userOpacity) / 100
}
