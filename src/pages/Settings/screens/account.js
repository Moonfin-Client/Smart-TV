// The account and system screens of Settings: Settings Sync, the Seerr sign-in panel, the PIN
// Code and Kids Mode screens, Parental Controls, the QR link, Logs, the themes, Check for Updates,
// the playback time preview and Clear All Data.
import $L from '../../../services/i18n.js'
import * as settings from '../../../state/settings.js'
import * as sync from '../../../state/settingsSync.js'
import * as auth from '../../../state/auth.js'
import { checkSeerr } from '../../../state/seerr.js'
import * as seerrApi from '../../../services/seerrApi.js'
import serverLogger from '../../../services/serverLogger.js'
import { acceptsReports } from '../../../services/clientLogUpload.js'
import { getBlockedRatings, setBlockedRatings } from '../../../services/parentalControls.js'
import { checkForUpdatesDetailed } from '../../../services/versionChecker.js'
import { api, getApiKey, getServerType, getServerUrl, getUserId } from '../../../services/jellyfinApi.js'
import { defaultSettings } from '../../../context/defaultSettings.js'
import { getAvailableThemes, isBuiltInThemeId, registerStoreTheme, removeStoreTheme } from '../../../theme/themeRegistry.js'
import { parseThemeSpec } from '../../../theme/themeSpec.js'
import { fetchThemeStoreCatalog, fetchThemeJson } from '../../../services/themeStoreApi.js'
import { clearAllStorage, getFromStorage, saveToStorage } from '../../../services/storage.js'
import { ratingIsRanked, sortRatingsBySeverity } from '../../../utils/parentalFilter.js'
import { formatPlaybackTimeSlot } from '../../../utils/playbackTimeLabels.js'
import { kidsModeNeedsPin } from '../../../utils/kidsMode.js'
import { drawQrCode } from '../../../utils/qrCanvas.js'
import { getRommAccount, startRommLink, unlinkRomm } from '../../../services/gamesApi.js'
import { forgetPlexMoonbase, getPlexMoonbaseAddress, normalizeMoonbaseAddress, setPlexMoonbaseAddress } from '../../../services/plexMoonbase.js'
import { plexMoonbaseUrl } from '../../../utils/plexUrls.js'
import { KIDS_PIN, clearedLockout, hashPin, isPinShaped, lockoutRemaining, pinMatches, registerFailedAttempt, tooManyAttempts } from '../../../utils/pinLockout.js'
import { PIN_ACCEPTED, dropSignInPin, refreshSignInPin, signInPinChanges, signInPinFor, signInPinMessage, storeSignInPin, verifySignInPin } from '../../../utils/signInPin.js'
import { buttonsBlock, inputBlock, spinnerBlock, cancelSave } from '../../../ui/components/settings/blocks.js'
import { BORDER_REST as REST, dp, lineCount, over, textWidth } from '../../../ui/components/settings/look.js'
import { lc } from '../../../ui/theme.js'
import { cssStops } from '../../../ui/components/account/gradient.js'
import { COLUMN_W } from '../../../ui/components/settings/layoutRows.js'
import { navEntry } from '../schemaEntries.js'

export const SCREENS = {}
export const CUSTOM = {}

const userPin = () => signInPinFor(settings.all(), getUserId())
const pinAccount = () =>
  getServerUrl() && getApiKey() ? { serverUrl: getServerUrl(), accessToken: getApiKey(), serverType: getServerType(), userId: getUserId() } : null
const savePin = (record) => settings.update(signInPinChanges(settings.all(), getUserId(), record))
const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 4)

const PROFILE_CARDS = {
  global: { label: () => $L('Global'), caption: () => $L('Applies everywhere'), icon: 'public' },
  desktop: { label: () => $L('Desktop'), caption: () => $L('Overrides Global'), icon: 'desktop_windows' },
  mobile: { label: () => $L('Mobile'), caption: () => $L('Overrides Global'), icon: 'smartphone' },
  tv: { label: () => $L('TV'), icon: 'tv' },
}
// Two to a row, so up and down move between rows and left and right stay inside one.
const PROFILE_ROWS = [
  ['global', 'desktop'],
  ['mobile', 'tv'],
]

// What the plugin screen keeps between presses: the switch's status line and the profile
// actions' message and armed reset.
const syncState = (page) => page._sync || (page._sync = { status: '', connecting: false, busy: false, message: '', armed: false })

const describeConnection = (enabled, connected, connecting, version, statusText, seerrLabel) => {
  if (!enabled) return { text: $L('Connect for ratings, sync, and {seerrLabel} proxy').replace('{seerrLabel}', seerrLabel), dot: '' }
  if (connected) return { text: version ? $L('Connected, version {version}').replace('{version}', version) : $L('Connected'), dot: '#22c55eff' }
  if (connecting) return { text: $L('Connecting to Moonfin...'), dot: '#f59e0bff' }
  return { text: statusText || $L('Not connected'), dot: '#cf6679ff' }
}

// Runs one profile action, with the screen saying it's busy until the server answers.
const runProfile = async (page, action) => {
  const st = syncState(page)
  if (st.busy) return
  st.busy = true
  st.message = ''
  st.armed = false
  page.refresh()
  try {
    st.message = await action()
  } catch (e) {
    st.message = $L('Could not reach the server')
  }
  st.busy = false
  page.refresh()
}

const toggleMoonbase = async (page) => {
  const st = syncState(page)
  const enabling = !settings.get('useMoonfinPlugin')
  settings.set('useMoonfinPlugin', enabling)
  if (!enabling) {
    st.status = ''
    page.refresh()
    return
  }
  if (!getServerUrl() || !getApiKey()) {
    st.status = $L('Not connected to a Jellyfin server')
    page.refresh()
    return
  }
  st.connecting = true
  st.status = $L('Checking Moonfin plugin...')
  page.refresh()
  try {
    const state = await checkSeerr(true)
    page._ctxData.seerr = state
    st.status = state.authenticated ? $L('Connected via Moonfin!') : $L('Moonfin plugin found but no session. Please log in.')
    sync.syncOnLogin().catch(() => {})
  } catch (err) {
    st.status = `${$L('Moonfin connection failed:')} ${err && err.message}`
  }
  st.connecting = false
  page.refresh()
}

// Reset asks for a second press instead of raising a dialog.
const resetProfile = (page) => {
  const st = syncState(page)
  if (st.busy) return
  const active = sync.activeSyncProfile(settings.get('syncProfile'))
  if (!st.armed) {
    st.armed = true
    st.message = active === 'global' ? $L('Press again to erase every stored profile on the server') : $L('Press again to reset this profile to global')
    page.refresh()
    return
  }
  runProfile(page, async () => {
    await seerrApi.deleteMoonfinProfile(active, getServerUrl(), getApiKey())
    // What still stands on the server is what this device should show from here on.
    const resolved = await seerrApi.getMoonfinResolvedProfile(active, getServerUrl(), getApiKey()).catch(() => null)
    const reset = {}
    sync.SYNCABLE_KEYS.forEach((key) => {
      if (key in defaultSettings) reset[key] = defaultSettings[key]
    })
    settings.update({ ...reset, ...(resolved ? sync.profileToLocal(resolved) : {}) }, { silent: true })
    return $L('Profile reset')
  })
}

const syncBlock = (page, ctx) => {
  const st = syncState(page)
  const s = ctx.settings
  const info = ctx.seerr.pluginInfo
  const enabled = !!s.useMoonfinPlugin
  const connected = enabled && !!info
  const showSync = connected && info.settingsSyncEnabled === true
  const status = describeConnection(enabled, connected, st.connecting, info && info.version, st.status, ctx.seerrLabel)
  const active = sync.activeSyncProfile(s.syncProfile)
  const services = connected
    ? [info.mdblistAvailable === true && $L('MDBList'), info.tmdbAvailable === true && $L('TMDB'), info.seerrEnabled === true && ctx.seerrLabel].filter(Boolean)
    : []
  const PAD_TOP = dp(8)
  const X = dp(12)
  const CARD_W = COLUMN_W - 2 * X
  const CARD_PAD = dp(14) + REST
  let chipX = 0
  const chips = services.map((label, i) => {
    const w = textWidth(label, dp(11), 'medium', dp(0.5)) + 2 * dp(10) + 2
    const out = { k: 'chip' + i, label, x: chipX, w }
    chipX += w + dp(6)
    return out
  })
  const statusRowH = 106.84
  const statusH = 1 + CARD_PAD + statusRowH + (chips.length ? 38.71 : 0) + CARD_PAD + 1
  const stops = [{ sid: 'setting-useMoonfinPlugin', x: X, y: PAD_TOP, w: CARD_W, h: statusH, press: (pg) => toggleMoonbase(pg) }]
  const out = {
    type: 'block',
    block: 'acct.sync',
    k: 'sync',
    statusY: PAD_TOP,
    statusH,
    statusTitle: $L('Moonbase'),
    statusText: status.text,
    statusDot: status.dot || '#00000000',
    on: enabled,
    onLabel: enabled ? $L('On') : $L('Off'),
    icon: connected ? 'extension' : 'extension_off',
    chips,
    profiles: [],
    transfer: [],
    sections: [],
  }
  let y = PAD_TOP + statusH
  if (showSync) {
    out.sections.push({ k: 'profile', y, text: $L('Profile'), caption: $L('This device syncs with the profile you pick until you pick another.') })
    y += dp(20) + dp(17.16) + dp(6) + dp(16) + dp(12)
    const gap = dp(10)
    PROFILE_ROWS.forEach((row) => {
      const borders = row.map((p) => (p === active ? 3 : 1))
      const fixed = row.reduce((a, p, i) => a + 2 * (dp(12) + REST) + 2 * borders[i], 0)
      const free = CARD_W - gap - fixed
      let x = X
      const rowH = 33.39 + 26.71 + 2 * (dp(12) + REST) + 2 * Math.max(...borders)
      row.forEach((profile, i) => {
        const card = PROFILE_CARDS[profile]
        const w = free / 2 + 2 * (dp(12) + REST) + 2 * borders[i]
        const sid = 'sync-profile-' + profile
        out.profiles.push({
          k: sid,
          sid,
          x,
          y,
          w,
          h: rowH,
          border: borders[i],
          active: profile === active,
          icon: card.icon,
          label: card.label(),
          caption: profile === 'tv' ? $L('This device') : card.caption(),
          device: profile === 'tv',
        })
        stops.push({
          sid,
          x,
          y,
          w,
          h: rowH,
          press: (pg) => {
            const sst = syncState(pg)
            sync.selectSyncProfile(profile)
            sst.message = ''
            sst.armed = false
            pg.refresh()
          },
        })
        x += w + gap
      })
      y += rowH + gap
    })
    y += dp(12) - gap
    const tX = X + dp(12)
    const tW = (CARD_W - 2 * dp(12) - gap) / 2
    const tH = 33.39 + 26.71 + 2 * (dp(12) + REST) + 2
    const resetLabel = $L('Reset {profile} Profile').replace('{profile}', PROFILE_CARDS[active].label())
    const resetW = 2 * (dp(10) + REST) + 2 + dp(20) + dp(8) + textWidth(resetLabel, dp(14), 'bold', dp(0.1))
    const resetY = y + dp(12) + tH + dp(8)
    const resetH = 33.39 + 2 * (dp(8) + REST) + 2
    const msg = st.busy ? $L('Working...') : st.message
    const transferH = dp(12) + tH + dp(8) + resetH + (msg ? dp(8) + dp(16) : 0) + dp(12)
    out.transfer.push({
      k: 'transfer',
      y,
      h: transferH,
      btnY: y + dp(12),
      btnH: tH,
      loadX: tX,
      saveX: tX + tW + gap,
      btnW: tW,
      resetX: tX,
      resetY,
      resetW,
      resetH,
      resetLabel,
      message: msg || '',
      messageY: resetY + resetH + dp(8),
    })
    stops.push({
      sid: 'sync-profile-load',
      x: tX,
      y: y + dp(12),
      w: tW,
      h: tH,
      press: (pg) => runProfile(pg, async () => ((await sync.loadSyncProfile()) ? $L('Profile loaded') : $L('No stored settings for this profile'))),
    })
    stops.push({
      sid: 'sync-profile-save',
      x: tX + tW + gap,
      y: y + dp(12),
      w: tW,
      h: tH,
      press: (pg) =>
        runProfile(pg, async () => {
          await sync.saveSyncProfile()
          return $L('Settings synced to profile')
        }),
    })
    stops.push({ sid: 'sync-profile-reset', x: tX, y: resetY, w: resetW, h: resetH, press: (pg) => resetProfile(pg) })
    y += transferH
  }
  out.h = y + dp(16)
  out.stops = stops
  out.loadLabel = $L('Load')
  out.loadSub = $L('Server to this device')
  out.saveLabel = $L('Save')
  out.saveSub = $L('This device to server')
  return out
}

CUSTOM.moonbasePlugin = (page, row, ctx) => syncBlock(page, ctx)

// Plex can't run plugins, so Moonbase for Plex runs beside it. Left empty the app looks next to
// the Plex server. Saved when the keyboard closes, then Moonbase is looked for again.
const moonbaseAddressSaved = (page) => {
  const s = settings.all()
  if (!s.useMoonfinPlugin || !getServerUrl() || !getApiKey()) {
    page.ctx.actions.refreshPlugin()
    return
  }
  forgetPlexMoonbase(getServerUrl())
  checkSeerr(true)
    .then((state) => {
      page._ctxData.seerr = state
      page.refresh()
    })
    .catch((e) => console.warn('[Settings] Moonbase for Plex not found:', e && e.message))
}

CUSTOM.moonbaseAddress = (page, row, ctx) => {
  const serverId = ctx.activeServer && ctx.activeServer.serverId
  const st = page._moonbaseAddress || (page._moonbaseAddress = { serverId: null, address: '' })
  if (st.serverId !== serverId) {
    st.serverId = serverId
    st.address = ''
    if (serverId) {
      getPlexMoonbaseAddress(serverId).then(
        (saved) => {
          if (st.serverId !== serverId) return
          st.address = saved
          page.refresh()
        },
        () => {}
      )
    }
  }
  return inputBlock('moonbase-address', {
    sid: 'setting-moonbaseAddress',
    label: $L('Moonbase Address'),
    value: st.address,
    placeholder: plexMoonbaseUrl(ctx.serverUrl) || '',
    purpose: 'url',
    onLive: (value) => {
      st.address = value
      page.refresh()
    },
    onDone: async (value) => {
      if (!serverId) return
      const saved = normalizeMoonbaseAddress(value)
      await setPlexMoonbaseAddress(serverId, saved)
      st.address = saved
      page.refresh()
      moonbaseAddressSaved(page)
    },
  })
}

const seerrForm = (page) =>
  page._seerrForm || (page._seerrForm = { authType: 'jellyfin', username: '', password: '', submitting: false, message: '', error: '' })

// A row of outlined buttons that fill with the focused button color and grow a little on focus.
const actionButtons = (k, buttons) => {
  let x = 24
  const h = 14 * 2 + 17 * 1.172 + 4
  const placed = buttons.map((b) => {
    const w = textWidth(b.label, 17, 'bold') + 56 + 4
    const out = { ...b, k: b.sid, x, y: 8, w, h }
    x += w + 12
    return out
  })
  return {
    type: 'block',
    block: 'acct.actions',
    k,
    h: 8 + h + 16,
    buttons: placed,
    stops: placed.filter((b) => !b.disabled).map((b) => ({ sid: b.sid, x: b.x, y: b.y, w: b.w, h: b.h, press: b.press })),
  }
}

const reloadSeerr = async (page) => {
  page._ctxData.seerr = await checkSeerr(true).catch(() => page._ctxData.seerr)
  page.refresh()
}

const seerrLogin = async (page) => {
  const f = seerrForm(page)
  const label = page.ctx.seerrLabel
  const plexAccount = getServerType() === 'plex' && f.authType !== 'local'
  const username = f.username.trim()
  if (!username && !plexAccount) {
    f.message = ''
    f.error = $L('Enter username/email.')
    page.refresh()
    return
  }
  f.submitting = true
  f.message = ''
  f.error = ''
  page.refresh()
  try {
    await seerrApi.moonfinLogin(username, f.password, plexAccount ? 'plex' : f.authType)
    f.password = ''
    f.message = $L('Signed in to {seerrLabel}.').replace('{seerrLabel}', label)
    syncState(page).status = $L('Connected via Moonfin!')
  } catch (err) {
    f.error = (err && typeof err.message === 'string' && err.message.trim()) || $L('Login failed')
  }
  f.submitting = false
  reloadSeerr(page)
}

const seerrLogout = async (page) => {
  const f = seerrForm(page)
  const label = page.ctx.seerrLabel
  f.submitting = true
  f.message = ''
  f.error = ''
  page.refresh()
  try {
    await seerrApi.moonfinLogout()
    f.password = ''
    f.message = $L('Signed out from {seerrLabel}.').replace('{seerrLabel}', label)
    syncState(page).status = $L('Moonfin plugin found but no session. Please log in.')
  } catch (err) {
    f.error = (err && typeof err.message === 'string' && err.message.trim()) || $L('Sign-out failed')
  }
  f.submitting = false
  reloadSeerr(page)
}

const infoRow = (id, label, value) => ({ type: 'card', sid: 'info-' + id, title: label, sub: value, subTone: 'caption', trail: 'empty' })

CUSTOM.seerrPanel = (page, row, ctx) => {
  const f = seerrForm(page)
  const label = ctx.seerrLabel
  const plex = ctx.serverType === 'plex'
  const out = []
  if (!ctx.settings.useMoonfinPlugin) {
    out.push({ type: 'text', style: 'authHint', k: 'seerr-hint', text: $L('Enable the Moonfin plugin first to sign in to {seerrLabel}.').replace('{seerrLabel}', label) })
  } else if (ctx.seerr.pluginInfo && ctx.seerr.pluginInfo.seerrEnabled === false) {
    out.push({ type: 'text', style: 'authHint', k: 'seerr-hint', text: $L('{seerrLabel} is disabled by your server administrator.').replace('{seerrLabel}', label) })
  } else if (ctx.seerr.isEnabled && ctx.seerr.isAuthenticated) {
    let method = $L('Jellyfin Account')
    if (f.authType === 'local') method = $L('Local Account')
    else if (plex) method = $L('Plex Account')
    out.push(infoRow('seerrConnStatus', $L('Status'), $L('Connected via Moonfin')))
    out.push(infoRow('seerrAuthType', $L('Sign-In Method'), method))
    if (page._ctxData.seerrUrl) out.push(infoRow('seerrUrl', $L('{seerrLabel} URL').replace('{seerrLabel}', label), page._ctxData.seerrUrl))
    if (ctx.seerr.user) out.push(infoRow('seerrUser', $L('User'), ctx.seerr.user.displayName || $L('Moonfin User')))
    out.push(actionButtons('seerr-out', [{ sid: 'seerr-signout', label: f.submitting ? $L('Signing Out...') : $L('Sign Out'), danger: true, disabled: f.submitting, press: (pg) => seerrLogout(pg) }]))
  } else {
    const plexAccount = plex && f.authType !== 'local'
    const pick = (type) => (pg) => {
      const st = seerrForm(pg)
      st.authType = type
      st.message = ''
      st.error = ''
      pg.refresh()
    }
    out.push({ type: 'text', k: 'seerr-desc', text: $L('Sign in directly through the Moonfin plugin. No app backend is required.') })
    out.push({
      type: 'card',
      sid: 'seerr-auth-jellyfin',
      title: plex ? $L('Plex Account') : $L('Jellyfin Account'),
      sub: plex ? $L('Use the Plex account you signed in with') : $L('Use your Jellyfin username and password'),
      subTone: 'caption',
      trail: 'check',
      on: f.authType === 'jellyfin',
      selected: f.authType === 'jellyfin',
      press: pick('jellyfin'),
    })
    out.push({
      type: 'card',
      sid: 'seerr-auth-local',
      title: $L('Local Account'),
      sub: $L('Use your local {seerrLabel} account credentials').replace('{seerrLabel}', label),
      subTone: 'caption',
      trail: 'check',
      on: f.authType === 'local',
      selected: f.authType === 'local',
      press: pick('local'),
    })
    if (!plexAccount) {
      out.push(
        inputBlock('seerr-user', {
          sid: 'seerr-username-input',
          label: $L('Username / Email'),
          value: f.username,
          placeholder: f.authType === 'local' ? $L('Local username or email') : $L('Jellyfin username'),
          purpose: f.authType === 'local' ? 'email' : 'username',
          onDone: (value) => {
            f.username = value
            f.message = ''
            f.error = ''
            page.refresh()
          },
        })
      )
      out.push(
        inputBlock('seerr-pass', {
          sid: 'seerr-password-input',
          label: $L('Password'),
          value: f.password,
          secret: true,
          onDone: (value) => {
            f.password = value
            f.message = ''
            f.error = ''
            page.refresh()
            // Enter in the password field signs in.
            if (!f.submitting) seerrLogin(page)
          },
        })
      )
    }
    out.push(
      actionButtons('seerr-in', [
        { sid: 'seerr-signin', label: f.submitting ? $L('Signing In...') : $L('Sign In'), disabled: f.submitting || (!plexAccount && !f.username.trim()), press: (pg) => seerrLogin(pg) },
      ])
    )
  }
  if (f.message) out.push({ type: 'text', style: 'status', k: 'seerr-msg', text: f.message })
  if (f.error) out.push({ type: 'text', style: 'error', k: 'seerr-err', text: f.error })
  return out
}

// Linking runs on the user's phone, since a TV has no good way to sign in to RomM. The TV shows a
// code and a QR code, and the server picks up the approval while it waits, read again on RomM's
// interval until the link settles.
const ROMM_BUTTONS = { idle: 'romm-link', pending: 'romm-cancel', linked: 'romm-unlink' }

const rommState = (page) => page._romm || (page._romm = { failed: false, busy: false, mode: null, qrFor: null, qr: null })

const setRomm = (page, next) => {
  if (!next) return
  page._ctxData.romm = next
  page.refresh()
}

const pollRomm = (page) => {
  const data = page._ctxData
  const pending = data.romm && !data.romm.linked && data.romm.pending
  const st = rommState(page)
  const code = pending ? pending.userCode : null
  if (st.pollCode === code) return
  if (st.timer) clearInterval(st.timer)
  st.timer = null
  st.pollCode = code
  if (!code) return
  st.timer = setInterval(async () => {
    if (st.polling) return
    st.polling = true
    try {
      setRomm(page, await getRommAccount())
    } catch (e) {
      // The next tick tries again.
    }
    st.polling = false
  }, Math.max(pending.intervalSeconds || 5, 2) * 1000)
}

// A second press while a request is out is dropped, so the buttons never need to gray out.
const runRomm = async (page, request) => {
  const st = rommState(page)
  if (st.busy) return
  st.busy = true
  st.failed = false
  page.refresh()
  try {
    setRomm(page, await request())
  } catch (e) {
    st.failed = true
  }
  st.busy = false
  page.refresh()
}

const rommError = (romm, st) => {
  if (st.failed) return $L("Couldn't reach the server. Try again.")
  if (romm.error === 'expired') return $L('The code expired. Link again to get a new one.')
  if (romm.error === 'denied') return $L('The link was turned down in RomM.')
  if (romm.error === 'unreachable') return $L("Couldn't reach the RomM server. Try again in a moment.")
  return null
}

const qrImage = (url) => {
  try {
    const canvas = document.createElement('canvas')
    drawQrCode(canvas, url)
    return { src: canvas.toDataURL('image/png'), size: canvas.width }
  } catch (e) {
    return { src: '', size: 0 }
  }
}

const rommQr = (st, url) => {
  if (st.qrFor !== url) {
    st.qrFor = url
    st.qr = qrImage(url)
  }
  return st.qr
}

CUSTOM.rommPanel = (page, row, ctx) => {
  const romm = ctx.romm || { available: false, linked: false }
  const st = rommState(page)
  const pending = romm.linked ? null : romm.pending
  const mode = romm.linked ? 'linked' : pending ? 'pending' : 'idle'
  pollRomm(page)
  // The button that had focus goes away when the link changes state, so focus moves to the new one.
  if (st.mode !== mode) {
    const moved = st.mode !== null
    st.mode = mode
    if (moved) page.$setTimeout(() => page.focusList(ROMM_BUTTONS[mode]), 0)
  }
  const out = []
  if (mode === 'idle') {
    out.push({ type: 'text', k: 'romm-desc', text: $L('Link your RomM account so you see the games it has and your saves go to RomM.') })
    out.push(actionButtons('romm-btns', [{ sid: ROMM_BUTTONS.idle, label: $L('Link Account'), press: (pg) => runRomm(pg, startRommLink) }]))
  } else if (mode === 'pending') {
    const qr = rommQr(st, pending.verificationUrlComplete || pending.verificationUrl)
    out.push({ type: 'text', k: 'romm-desc', text: $L('Scan the QR code with your phone, or open the address below and enter the code. Then approve Moonfin in RomM.') })
    out.push({ type: 'text', style: 'rommCode', k: 'romm-code', text: pending.userCode })
    out.push({ type: 'block', block: 'acct.qr', k: 'romm-qr', h: 20 + qr.size + 20, src: qr.src, size: qr.size })
    out.push({ type: 'text', k: 'romm-url', text: pending.verificationUrl })
    out.push(actionButtons('romm-btns', [{ sid: ROMM_BUTTONS.pending, label: $L('Cancel'), press: (pg) => runRomm(pg, unlinkRomm) }]))
  } else {
    out.push(infoRow('rommUser', $L('Status'), $L('Linked as {username}').replace('{username}', romm.username || 'RomM')))
    out.push({ type: 'text', style: 'authHint', k: 'romm-hint', text: $L('Unlinking makes Moonfin forget its RomM key. You can also remove the key in RomM under your API tokens.') })
    out.push(actionButtons('romm-btns', [{ sid: ROMM_BUTTONS.linked, label: $L('Unlink'), danger: true, press: (pg) => runRomm(pg, unlinkRomm) }]))
  }
  const error = rommError(romm, st)
  if (error) out.push({ type: 'text', style: 'error', k: 'romm-err', text: error })
  return out
}

CUSTOM.checkForUpdates = (page) => {
  const st = page._update || (page._update = { state: 'idle', message: '' })
  return navEntry(
    'check-for-updates',
    $L('Check for Updates'),
    st.state === 'checking' ? $L('Checking...') : st.message || $L('Check for the latest Moonfin release'),
    'system_update_alt',
    {
      press: async (pg) => {
        const u = pg._update
        if (u.state === 'checking') return
        u.state = 'checking'
        pg.refresh()
        const result = await checkForUpdatesDetailed().catch(() => ({ status: 'error' }))
        if (result.status === 'update') {
          u.message = $L('Version {version} is available').replace('{version}', result.latestVersion)
          window.dispatchEvent(new CustomEvent('moonfin:show-update'))
        } else if (result.status === 'current') u.message = $L('You are on the latest version')
        else u.message = $L('Could not reach the update server')
        u.state = 'done'
        pg.refresh()
      },
    }
  )
}

// The six time slots drawn against a sample time, so the layout can be judged without playing.
CUSTOM.playbackTimePreview = (page, row, ctx) => {
  const s = ctx.settings
  const args = { position: 42 * 60 + 10, duration: 3600 + 58 * 60 + 33, clockDisplay: s.clockDisplay, timeOffsetHours: s.timeOffsetHours }
  const slot = (key) => formatPlaybackTimeSlot({ slot: s[key], ...args }) || ''
  return {
    type: 'block',
    block: 'acct.playbackTime',
    k: 'playbackTime',
    // Each row takes the app's 33px line.
    h: 16 + 33 + 8 + 6 + 8 + 33 + 16 + 12,
    above: [slot('playbackTimeAboveLeft'), slot('playbackTimeAboveCenter'), slot('playbackTimeAboveRight')],
    below: [slot('playbackTimeBelowLeft'), slot('playbackTimeBelowCenter'), slot('playbackTimeBelowRight')],
    fill: args.position / args.duration,
  }
}

const pinScreen = (page, view, k, title, desc, saveLabel, onSave) => [
  { type: 'text', k: k + '-desc', text: desc },
  inputBlock(k + '-in', {
    sid: k === 'pin' ? 'pin-code-input' : 'kids-pin-input',
    label: $L('PIN'),
    value: view.pin || '',
    placeholder: $L('4 digits'),
    secret: true,
    purpose: 'numeric',
    maxLength: 4,
    onDone: (value) => {
      view.pin = digits(value)
      view.error = ''
      page.refresh()
    },
  }),
  view.error ? { type: 'text', style: 'error', k: k + '-err', text: view.error } : null,
  cancelSave(k + '-btns', {
    cancelSid: k === 'pin' ? 'pin-code-cancel' : 'kids-pin-cancel',
    saveSid: k === 'pin' ? 'pin-code-save' : 'kids-pin-save',
    saveLabel,
    onCancel: (pg) => pg.pop(),
    onSave,
  }),
]

const verifying = (view) => (view.verify == null ? view.purpose !== 'enable' : view.verify)

const submitPin = async (page, view) => {
  if (view.busy) return
  const entered = view.pin || ''
  const fail = (message) => {
    view.pin = ''
    view.error = message
    page.refresh()
  }
  if (!isPinShaped(entered)) {
    view.error = $L('PIN must be exactly 4 digits.')
    page.refresh()
    return
  }
  const record = userPin()
  view.busy = true
  try {
    if (!verifying(view)) {
      const stored = await storeSignInPin(record, entered, pinAccount(), view.current)
      if (stored.refused) return fail(stored.refused)
      savePin(stored.record)
      page.pop()
      return
    }
    const checked = await verifySignInPin(record, entered, pinAccount())
    if (checked.record !== record) savePin(checked.record)
    if (checked.outcome !== PIN_ACCEPTED) return fail(signInPinMessage(checked))
    if (view.purpose === 'change') {
      // The server wants the current PIN again to replace it.
      view.verify = false
      view.current = entered
      view.pin = ''
      view.error = ''
      page.refresh()
      return
    }
    // A PIN the server holds has no off switch, only removal.
    if (view.purpose === 'disable' && !checked.record.server) {
      savePin({ ...checked.record, enabled: false })
      page.pop()
      return
    }
    const dropped = await dropSignInPin(checked.record, pinAccount(), entered)
    if (dropped.refused) return fail(dropped.refused)
    savePin(dropped.record)
    page.pop()
  } finally {
    view.busy = false
  }
}

SCREENS.pinCode = {
  clean: true,
  title: (page, view) => (verifying(view) ? $L('Enter PIN') : $L('Set PIN Code')),
  entries: (page, view) =>
    pinScreen(
      page,
      view,
      'pin',
      verifying(view) ? $L('Enter PIN') : $L('Set PIN Code'),
      verifying(view) ? $L('Enter your 4-digit PIN') : $L('Enter a 4-digit PIN used to unlock the app when PIN protection is enabled.'),
      verifying(view) ? $L('Continue') : $L('Save'),
      (pg) => submitPin(pg, view)
    ),
}

// The PIN may have been set or removed on another device since. The Seerr panel shows the Seerr
// address the plugin reports in its status or config.
export const load = (page, data, done) => {
  if (getServerUrl() && getApiKey()) {
    getRommAccount()
      .then((account) => {
        if (account) {
          data.romm = account
          done()
        }
      })
      .catch(() => {})
  }
  Promise.all([seerrApi.getMoonfinStatus().catch(() => null), seerrApi.getMoonfinConfig(getServerUrl(), getApiKey()).catch(() => null)]).then(
    ([status, config]) => {
      const url = (status && status.url) || (config && (config.url || config.jellyfinServerUrl)) || ''
      if (url) {
        data.seerrUrl = url
        done()
      }
    }
  )
  const record = userPin()
  if (!getUserId() || !pinAccount()) return
  refreshSignInPin(record, pinAccount())
    .then((next) => {
      if (next && next !== record) savePin(next)
    })
    .catch(() => {})
}

// A fresh PIN every time the mode goes on, and the way out costs a growing wait per wrong guess.
SCREENS.kidsModeSet = {
  title: () => $L('Set Kids Mode PIN'),
  entries: (page, view) =>
    pinScreen(page, view, 'kids', $L('Set Kids Mode PIN'), $L('Choose a 4-digit PIN. You will need it to turn Kids Mode off.'), $L('Save'), (pg) => {
      if (!/^\d{4}$/.test(view.pin || '')) {
        view.error = $L('PIN must be exactly 4 digits.')
        pg.refresh()
        return
      }
      settings.update({ kidsPinHash: hashPin(view.pin), kidsModeEnabled: true, ...clearedLockout(KIDS_PIN) })
      pg.resetStack()
    }),
}

SCREENS.kidsModeExit = {
  title: () => $L('Exit Kids Mode'),
  entries: (page, view) =>
    pinScreen(page, view, 'kids', $L('Exit Kids Mode'), $L('Enter your PIN to restore the full app'), $L('Unlock'), (pg) => {
      const s = settings.all()
      const waiting = kidsModeNeedsPin(s) ? lockoutRemaining(s, KIDS_PIN) : 0
      if (waiting > 0) {
        view.pin = ''
        view.error = tooManyAttempts(waiting)
        pg.refresh()
        return
      }
      if (kidsModeNeedsPin(s) && !pinMatches(view.pin || '', { hash: s.kidsPinHash })) {
        const { wait, changes } = registerFailedAttempt(s, KIDS_PIN)
        settings.update(changes)
        view.pin = ''
        view.error = wait > 0 ? tooManyAttempts(wait) : $L('Incorrect PIN')
        pg.refresh()
        return
      }
      settings.update({ kidsModeEnabled: false, kidsPinHash: '', ...clearedLockout(KIDS_PIN) })
      pg.resetStack()
    }),
}

// Read off the items, since Jellyfin 12 answers the filters route with an empty rating list.
// Capped at fifteen pages so a huge library can't pin the screen on a spinner.
const readServerRatings = async () => {
  const found = {}
  let start = 0
  for (let pages = 0; pages < 15; pages++) {
    const res = await api.getItems({ IncludeItemTypes: 'Movie,Series,Episode,Video,MusicVideo,Book,AudioBook', Recursive: true, Fields: 'OfficialRating', StartIndex: start, Limit: 200, EnableTotalRecordCount: true })
    const items = (res && Array.isArray(res.Items) && res.Items) || []
    items.forEach((it) => {
      const r = typeof (it && it.OfficialRating) === 'string' ? it.OfficialRating.trim() : ''
      if (r) found[r.toUpperCase()] = true
    })
    if (items.length < 200) break
    start += items.length
    if (typeof res.TotalRecordCount === 'number' && start >= res.TotalRecordCount) break
  }
  return Object.keys(found)
}

const ratingRow = (rating, blocked) => ({
  type: 'card',
  sid: 'blocked-rating-' + rating,
  title: rating,
  icon: blocked ? 'check_box' : 'check_box_outline_blank',
  iconStyle: 'plain',
  trail: 'none',
  press: (pg) => {
    // Read from the store rather than the screen, so two quick presses can't drop a change.
    const now = getBlockedRatings()
    setBlockedRatings(now.indexOf(rating) >= 0 ? now.filter((v) => v !== rating) : now.concat(rating))
    pg.refresh()
  },
})

SCREENS.blockedRatings = {
  clean: true,
  title: () => $L('Parental Controls'),
  entries: (page, view) => {
    // Read on every open, so a rating the server picked up since shows without a restart.
    if (!view.requested) {
      view.requested = true
      view.ratings = null
      readServerRatings()
        .then((list) => {
          view.ratings = list
          page.refresh()
          page.$setTimeout(() => page.focusList(null), 0)
        })
        .catch(() => {
          view.failed = true
          view.ratings = []
          page.refresh()
        })
    }
    const blocked = getBlockedRatings()
    const out = [
      { type: 'text', style: 'lead', k: 'lead', text: $L('Block content with the following ratings:') },
      { type: 'text', style: 'hintClean', k: 'hint', text: $L('Blocking a rating also blocks everything stronger than it.') },
    ]
    if (view.ratings === null) {
      out.push(spinnerBlock('spin'))
      return out
    }
    const seen = {}
    const all = sortRatingsBySeverity(view.ratings.concat(blocked).filter((r) => (seen[r] ? false : (seen[r] = true))))
    if (!all.length) {
      out.push({ type: 'text', k: 'none', text: view.failed ? $L('Could not load server ratings. Showing saved ratings only.') : $L('No content ratings were found on this server yet.') })
      return out
    }
    if (view.failed) out.push({ type: 'text', style: 'error', k: 'failed', text: $L('Could not refresh ratings from server. Showing saved ratings.') })
    const ranked = all.filter(ratingIsRanked)
    const unranked = all.filter((r) => !ratingIsRanked(r))
    if (ranked.length) out.push({ type: 'section', k: 'sec-ranked', text: $L('Ratings') })
    ranked.forEach((r) => out.push(ratingRow(r, blocked.indexOf(r) >= 0)))
    if (unranked.length) out.push({ type: 'section', k: 'sec-unranked', text: $L('Only blocks itself') })
    unranked.forEach((r) => out.push(ratingRow(r, blocked.indexOf(r) >= 0)))
    return out
  },
}

SCREENS.qrLink = {
  title: (page, view) => view.label || '',
  entries: (page, view) => {
    if (!view.qr) view.qr = qrImage(view.url)
    return [
      { type: 'text', k: 'qr-desc', text: $L('Scan with your phone to open this link') },
      { type: 'block', block: 'acct.qr', k: 'qr', h: 20 + view.qr.size + 20, src: view.qr.src, size: view.qr.size },
      { type: 'text', k: 'qr-url', text: view.url || '' },
      { type: 'card', sid: 'qr-link-close', title: $L('Close'), trail: 'none', press: (pg) => pg.pop() },
    ]
  },
}

const logFilters = () => {
  const C = serverLogger.LOG_CATEGORIES || {}
  return [
    { id: 'all', label: 'All' },
    { id: C.NETWORK, label: 'Network' },
    { id: C.PLAYBACK, label: 'Playback' },
    { id: C.SYNCPLAY, label: 'SyncPlay' },
    { id: C.APP, label: 'Application' },
    { id: C.AUTHENTICATION, label: 'Auth' },
    { id: C.NAVIGATION, label: 'Navigation' },
  ]
}
// A full buffer is hundreds of rows, more than these sets will draw at once.
const LOG_STEP = 50
const levelColor = (level) => {
  const L = serverLogger.LOG_LEVELS || {}
  if (level === L.ERROR || level === L.FATAL) return '#ff6b6bff'
  if (level === L.WARNING) return '#ffd166ff'
  return '#ffffffff'
}

SCREENS.diagnostics = {
  clean: true,
  title: () => $L('Logs'),
  entries: (page, view) => {
    if (view.filter == null) {
      view.filter = 'all'
      view.limit = LOG_STEP
      view.message = ''
      view.unsub = serverLogger.subscribe ? serverLogger.subscribe(() => page.refresh()) : null
    }
    // Newest first, which is the order anyone reading a log after something went wrong wants.
    const entries = (serverLogger.getBuffer ? serverLogger.getBuffer() : []).filter((e) => view.filter === 'all' || e.category === view.filter).reverse()
    const shown = entries.slice(0, view.limit)
    const out = [{ type: 'text', k: 'desc', text: $L('Server requests recorded on this device. Video and image traffic is not included.') }]
    const chipH = 16 * 1.172 + 16 + 4
    let x = 24
    let y = 4
    const filters = logFilters().map((f) => {
      const label = $L(f.label)
      const w = textWidth(label, 16) + 36 + 4
      if (x + w > COLUMN_W - 24) {
        x = 24
        y += chipH + 8
      }
      const chip = { k: 'logfilter-' + f.id, sid: 'logfilter-' + f.id, id: f.id, label, x, y, w, h: chipH, on: view.filter === f.id }
      x += w + 8
      return chip
    })
    out.push({
      type: 'block',
      block: 'acct.logFilters',
      k: 'logFilters',
      h: y + chipH + 8 + 12,
      filters,
      stops: filters.map((f) => ({
        sid: f.sid,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        press: (pg) => {
          view.filter = f.id
          view.limit = LOG_STEP
          pg.refresh()
        },
      })),
    })
    if (!entries.length) {
      out.push({
        type: 'text',
        style: 'loading',
        k: 'empty',
        text: settings.get('diagnosticLoggingEnabled') ? $L('Nothing recorded yet.') : $L('Turn on Diagnostic Logging to start recording.'),
      })
    }
    if (shown.length) {
      let ly = 0
      const rows = shown.map((e, i) => {
        const msg = String(e.message || '')
        const lines = Math.max(1, Math.ceil(textWidth(msg, 16) / (COLUMN_W - 48 - 28)))
        const h = 8 + 14 * 1.4 + 2 + lines * 16 * 1.45 + 8
        const r = { k: 'log' + i, y: ly, h, lines, time: String(e.timestamp || '').slice(11, 23), category: String(e.category || '').toUpperCase(), message: msg, color: levelColor(e.level) }
        ly += h + 2
        return r
      })
      out.push({ type: 'block', block: 'acct.log', k: 'logRows', h: ly, rows })
    }
    if (entries.length > view.limit) {
      out.push(
        buttonsBlock('more', [
          {
            sid: 'log-show-more',
            label: `${$L('Show More')} (${entries.length - view.limit})`,
            press: (pg) => {
              view.limit += LOG_STEP
              pg.refresh()
            },
          },
        ])
      )
    }
    const ping = page.ctx.seerr.pluginInfo
    const unavailable = !acceptsReports(getServerType(), ping && ping.clientLogSupported)
      ? getServerType() === 'emby'
        ? $L('This Emby server needs the Moonfin plugin, with client log upload turned on.')
        : $L('This server needs Moonbase, with client log upload turned on.')
      : null
    if (unavailable) out.push({ type: 'text', k: 'unavail', text: unavailable })
    if (view.message) out.push({ type: 'text', style: 'status', k: 'msg', text: view.message })
    out.push(
      buttonsBlock('logBtns', [
        {
          sid: 'log-clear',
          label: $L('Clear'),
          press: (pg) => {
            if (serverLogger.clear) serverLogger.clear()
            view.message = $L('Logs cleared')
            pg.refresh()
          },
        },
        {
          sid: 'log-send',
          label: view.sending ? $L('Sending...') : $L('Send Report'),
          primary: true,
          disabled: view.sending || !!unavailable,
          press: async (pg) => {
            view.sending = true
            view.message = ''
            pg.refresh()
            try {
              await serverLogger.uploadReport()
              view.message = $L('Report sent to the server')
            } catch (err) {
              view.message =
                err && err.status === 403 ? $L('The server is not accepting client logs. Enable them in the server dashboard.') : $L('Could not send the report.')
            }
            view.sending = false
            pg.refresh()
          },
        },
      ])
    )
    return out
  },
  leave: (page, view) => {
    if (view.unsub) view.unsub()
  },
}

const selectThemeById = (id) => {
  if (!getAvailableThemes()[id]) return
  if (isBuiltInThemeId(id)) settings.update({ visualTheme: id, customThemeId: '' })
  else settings.update({ visualTheme: settings.get('visualTheme') || 'moonfin', customThemeId: id })
}

// A Theme Store theme is kept as its raw JSON, so it goes through parseThemeSpec again on the next launch.
const saveStoreTheme = async (raw) => {
  const spec = parseThemeSpec(raw)
  registerStoreTheme(spec)
  const existing = (await getFromStorage('storeThemes')) || {}
  existing[spec.id] = raw
  await saveToStorage('storeThemes', existing)
  return spec
}

const deleteStoreTheme = async (id) => {
  removeStoreTheme(id)
  const existing = (await getFromStorage('storeThemes')) || {}
  delete existing[id]
  await saveToStorage('storeThemes', existing)
  if (settings.get('customThemeId') === id) settings.update({ customThemeId: '' })
}

// The theme cards, 4px apart: a name with a tick when it's picked or saved, a line under it, then
// the color stripe for a theme or the action for a Theme Store entry. Every line takes the app's 33px.
const themeCards = (list) => {
  let y = 0
  const cards = list.map((c) => {
    const foot = c.action != null ? 33 : 36
    const lines = c.desc ? lineCount(c.desc, 14, 'regular', COLUMN_W - 2 - 40) : 0
    const h = 1 + 16 + 33 + 12 + (lines ? lines * 33 + 12 : 0) + foot + 16 + 1
    const card = { ...c, k: c.sid, y, h, footY: h - 1 - 16 - foot, stripe: c.stripe || null, stripeLit: c.stripeLit || null }
    y += h + 4
    return card
  })
  return {
    type: 'block',
    block: 'acct.themes',
    k: 'themes',
    h: y,
    cards,
    stops: cards.map((c) => ({ sid: c.sid, x: 0, y: c.y, w: COLUMN_W, h: c.h, press: c.press })),
  }
}

// The stripe's left-to-right gradient of the theme's four colors. The renderer draws see-through
// stops solid, so each is laid over the card first.
const stripeShader = (theme, under) => {
  const c = theme.colors
  const solid = (argb) => parseInt(over(lc(argb || '#FF000000'), under).slice(1, 7) + 'ff', 16) >>> 0
  return { type: 'linearGradient', angle: ((90 + 180) * Math.PI) / 180, ...cssStops([c.background, c.surface, c.accent, c.rangeProgress].map(solid), [0, 1 / 3, 2 / 3, 1]) }
}

SCREENS.themes = {
  clean: true,
  title: () => $L('Theme'),
  entries: (page) => {
    // The theme's see-through colors show the card under them, or the focus fill once it has focus.
    const card = over(page.p.tileFill, page.p.view)
    const lit = over(page.p.tileFocusFill, page.p.view)
    return [
      themeCards(
        Object.values(getAvailableThemes()).map((theme) => ({
          sid: 'theme-card-' + theme.id,
          name: theme.displayName,
          desc: theme.description || '',
          selected: theme.id === page.ctx.activeThemeId,
          stripe: stripeShader(theme, card),
          stripeLit: stripeShader(theme, lit),
          press: () => selectThemeById(theme.id),
        }))
      ),
    ]
  },
}

// The catalog is read the first time the store opens, since most viewers never look. Store
// cards act like install and uninstall: saving applies the theme, and a saved one is removed,
// which still leaves it in the Theme picker until the next launch.
const themeStore = (page) => page._themeStore || (page._themeStore = { catalog: [], loading: false, error: false, busyId: null })

const pressStoreTheme = async (page, entry) => {
  const st = themeStore(page)
  if (st.busyId) return
  st.busyId = entry.id
  page.refresh()
  try {
    if (getAvailableThemes()[entry.id]) await deleteStoreTheme(entry.id)
    else {
      const spec = await saveStoreTheme(await fetchThemeJson(entry.file))
      selectThemeById(spec.id)
    }
  } catch (e) {
    // A theme that won't download or parse just stays as it was.
  }
  st.busyId = null
  page.refresh()
}

SCREENS.themeStore = {
  clean: true,
  title: () => $L('Theme Store'),
  entries: (page) => {
    const st = themeStore(page)
    if (!st.catalog.length && !st.loading && !st.tried) {
      st.loading = true
      st.error = false
      st.tried = true
      fetchThemeStoreCatalog()
        .then((list) => {
          st.catalog = list
        })
        .catch(() => {
          st.error = true
        })
        .then(() => {
          st.loading = false
          page.refresh()
        })
    }
    const message = (text) => [{ type: 'text', style: 'storeMessage', k: 'store', text }]
    if (st.loading) return message($L('Loading themes…'))
    if (st.error) return message($L("Couldn't load the Theme Store. Check your connection and try again."))
    if (!st.catalog.length) return message($L('No themes are available right now.'))
    const saved = getAvailableThemes()
    return [
      themeCards(
        st.catalog.map((entry) => ({
          sid: 'store-theme-' + entry.id,
          name: entry.displayName,
          desc: entry.description || '',
          selected: false,
          tick: !!saved[entry.id],
          action: st.busyId === entry.id ? $L('Working...') : saved[entry.id] ? $L('Remove') : $L('Save & apply'),
          press: (pg) => pressStoreTheme(pg, entry),
        }))
      ),
    ]
  },
  // A store that opened empty reads the catalog again next time.
  leave: (page) => {
    const st = themeStore(page)
    if (!st.catalog.length) st.tried = false
  },
}

SCREENS.clearAllData = async () => {
  settings.update({ ...defaultSettings })
  await clearAllStorage()
  await auth.logout().catch(() => {})
  window.location.reload()
}
