import { onCleanup } from 'solid-js'
import { openItemMenu } from './ItemMenuHost.jsx'
import * as settings from '../../../state/settings.js'
import { LONG_PRESS_MS } from '../../../utils/longPress.js'

// The card menu for a list of cards outside Details: holding OK on a card for LONG_PRESS_MS opens
// its menu, and a shorter press acts on the card on its release. The hold's repeats are dropped,
// and once the menu is up its release lands there.
// `itemAt()` is the focused card's item (null lets OK through to the list), `press()` what OK does,
// and `rowKey()` the row's key for Home's Continue Watching and Next Up options. Put `down` and `up`
// on the list as onCaptureEnter and onCaptureEnterRelease, so they run before the list's own OK,
// and `menu` as onMenu, for a remote with a menu key, which opens the menu at once.
const CONTINUE_ROWS = { resume: true, nextup: true, 'continue-nextup': true }

export const menuOptions = (rowKey) =>
  CONTINUE_ROWS[rowKey] ? { isContinueWatchingOrNextUp: true, playImmediately: settings.get('continueWatchingDefaultAction') === 'play' } : {}

export const menuHold = (itemAt, press, rowKey) => {
  let timer = null
  let down = false
  let opened = false
  const end = () => {
    clearTimeout(timer)
    timer = null
    down = false
  }
  onCleanup(end)
  return {
    // The menu key isn't OK, so the menu has no held OK to wait out.
    menu: () => {
      const it = itemAt()
      return !!(it && openItemMenu(it, { ...menuOptions(rowKey ? rowKey() : ''), held: false }))
    },
    down: () => {
      if (down) return true
      const it = itemAt()
      if (!it) return false
      down = true
      opened = false
      timer = setTimeout(() => {
        timer = null
        opened = openItemMenu(it, menuOptions(rowKey ? rowKey() : ''))
        if (opened) end()
      }, LONG_PRESS_MS)
      return true
    },
    up: () => {
      if (!down) return false
      const acted = opened
      end()
      if (!acted) press()
      return true
    },
  }
}
