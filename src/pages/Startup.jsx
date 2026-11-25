import { onMount } from 'solid-js'
import Ring from '../ui/components/Ring.jsx'
import { cssStops, rawTheme } from '../ui/components/account/look.js'
import { restore } from '../state/auth.js'
import { getFromStorage } from '../services/storage.js'
import { SETUP_QUESTION_KEYS, noteAnsweredSettings } from '../utils/setupWizardGate.js'
import { enterApp } from '../state/shell/gate.js'
import { router } from '../app/router.js'

// Restores the saved session, then goes on through the PIN and setup gates to Home, or to sign-in,
// which opens on who's watching when there's a known server. With `resume` the account is already
// signed in (a switch from the account menu) and only the gates run, which also gives Home a fresh
// start when the switch began on Home.
// The loading screen is a 135 degree wash of the theme's background, surface and surface variant.
// Its see-through colors are laid over black, since the renderer's gradient draws them solid.
// shortcut: the quarter-ring spinner stands in for the full loading spinner (Spinner.jsx).
const solid = (argb) => {
  const v = String(argb).replace('#', '')
  const full = v.length === 6 ? 'ff' + v : v
  const a = parseInt(full.slice(0, 2), 16) / 255
  const ch = (i) => Math.round(parseInt(full.slice(i, i + 2), 16) * a)
  return ((ch(2) << 24) | (ch(4) << 16) | (ch(6) << 8) | 255) >>> 0
}
const wash = () => {
  const c = rawTheme().colors
  return {
    angle: ((135 + 180) * Math.PI) / 180,
    ...cssStops([solid(c.background), solid(c.surface), solid(c.surfaceVariant)], [0, 0.5, 1]),
  }
}

export default function Startup(props) {
  onMount(async () => {
    if (props.resume) {
      await enterApp(router)
      return
    }
    // Read off the raw blob before defaults fill it in. A key present there was chosen by someone,
    // so the setup wizard skips the question it answers.
    const stored = await getFromStorage('settings').catch(() => null)
    if (stored) noteAnsweredSettings(SETUP_QUESTION_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(stored, key)))
    let signedIn = false
    try {
      signedIn = await restore()
    } catch (e) {
      console.error('[startup] restore failed', e)
    }
    if (signedIn) await enterApp(router)
    else router.to('/login', {}, { inHistory: false })
  })
  return (
    <view width={1920} height={1080} color="#ffffffff" linearGradient={wash()}>
      <Ring x={937} y={517} size={46} tint="#ffffffff" />
    </view>
  )
}
