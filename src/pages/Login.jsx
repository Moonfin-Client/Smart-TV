import $L from '../services/i18n.js'
import { For, Index, batch, createMemo, createSelector, createSignal, onCleanup, onMount } from 'solid-js'
import { useHold } from '@solidtv/solid/primitives'
import Keyboard from '../ui/components/Keyboard.jsx'
import Dialog from '../ui/components/Dialog.jsx'
import Ring from '../ui/components/Ring.jsx'
import ProfileCarousel, { carouselHeight } from '../ui/components/account/ProfileCarousel.jsx'
import PillRow from '../ui/components/account/PillRow.jsx'
import LoginButton from '../ui/components/account/LoginButton.jsx'
import LoginField from '../ui/components/account/LoginField.jsx'
import ServerTile from '../ui/components/account/ServerTile.jsx'
import ChoiceCard from '../ui/components/account/ChoiceCard.jsx'
import AddServerButton from '../ui/components/account/AddServerButton.jsx'
import {
  CARD_PAD, CODE_SIZE, FRAME_PAD, LINE, LOGO, TILE_GAP, TILE_H, addressRows, codeCells, descentShift, formatQuickConnectCode, foundRows, panelBox, stepCard, usersLayout,
} from '../ui/components/account/loginCards.js'
import { cssStops, loginColors, spacingFor, textWidth, themeDy } from '../ui/components/account/look.js'
import { siloNewPasswordIssue, siloNewPasswordMessage } from '../ui/components/account/siloNewPassword.js'
import { usesNativeKeyboard } from '../ui/components/account/nativeInput.js'
import { qrDataUrl } from '../ui/components/account/qr.js'
import { roboto } from '../ui/components/shell/MessageMarkdown.js'
import { fontFor, textReady, uiFont } from '../ui/text.js'
import { hex } from '../ui/color.js'
import { shadowColor } from '../ui/theme.js'
import * as jellyfinApi from '../services/jellyfinApi.js'
import * as embyConnect from '../services/embyConnect.js'
import * as plexTv from '../services/plexTv.js'
import { probeSiloOrNull } from '../services/siloApi.js'
import * as multiServerManager from '../services/multiServerManager.js'
import { discoverLocalServers } from '../services/serverDiscovery.js'
import { saveToStorage } from '../services/storage.js'
import { generateCandidates, normalizeServerBaseUrl, quickConnectApprovalUrl } from '../utils/serverUrl.js'
import {
  classifyError, detectServerType, getConnectionMessage, getSignInMessage, isSignInForbidden, isVersionSupported,
  supportsQuickConnectWebLink, INVALID_ADDRESS, SERVER_NOT_JELLYFIN, VERSION_UNSUPPORTED, INSECURE_CERT, MIN_SERVER_VERSION,
} from '../utils/connectionErrors.js'
import { forgottenPinUsername, noteProvedSignIn } from '../utils/signInPin.js'
import * as auth from '../state/auth.js'
import * as settings from '../state/settings.js'
import { getStore } from '../state/store.js'
import { reactive } from '../state/reactive.js'
import { enterApp } from '../state/shell/gate.js'
import { requestExit } from '../state/shell/exit.js'
import { router } from '../app/router.js'

// The sign-in screens: the server list with discovery and the Add Server panel, who's watching,
// sign in with Quick Connect or a password, Emby Connect, Plex, and the error lines they show. A
// known server opens on who's watching. `mode` is addUser or addServer, from the account
// switcher. The layout is in ui/components/account/loginCards.js.
const QUICK_CONNECT_POLL = 5000
const PLEX_PIN_POLL = 1000
const LONG_PRESS_DELAY = 500
const BRAND_NAMES = { jellyfin: 'Jellyfin', emby: 'Emby', plex: 'Plex', silo: 'Silo' }
const SPECIFIC_FAILURES = [INVALID_ADDRESS, SERVER_NOT_JELLYFIN, VERSION_UNSUPPORTED]
const FOUND_TILES = {
  jellyfin: { bg: '#aa5cc329', fg: '#c88be0' },
  emby: { bg: '#52b54b24', fg: '#7bd175' },
  silo: { bg: '#6096dc24', fg: '#8fb8ec' },
  plex: { bg: '#e5a00d24', fg: '#f2bc45' },
}
const NONE = '#00000000'
const CODE_FONT = roboto('bold')
const COLORS = loginColors()
// Corner to corner, which is 119 degrees on a 16:9 screen. The renderer's line runs the other way
// round from CSS's, hence the half turn.
const BG = { angle: ((119 + 180) * Math.PI) / 180, ...cssStops([0x0a0a0aff, 0x1a1a2eff, 0x16213eff], [0, 0.5, 1]) }
const PANEL_SHADOW = { color: shadowColor('#0000008c'), x: 0, y: 40.07, blur: 100.17, spread: 0 }
const STATUS_BORDER = { width: 2, color: hex('#00a4dc66') }
// The sign-in carousel always shows two faces either side, whatever its width.
const USERS_REACH = 2

const hasQuickConnect = (target) => !!target && target.serverType !== 'emby' && target.serverType !== 'plex'
const plexAccountToken = (accounts, serverId) => {
  const list = accounts
    .filter((a) => a.serverId === serverId && a.plexToken)
    .sort((a, b) => String(b.lastConnected || '').localeCompare(String(a.lastConnected || '')))
  return list.length ? list[0].plexToken : null
}
const plexErrorMessage = (err) => (err && err.status === 401 ? getSignInMessage(err) : getConnectionMessage(classifyError(err)))
const credentialFocusTarget = (user) => (!user ? 'username-input' : user.hasPassword ? 'password-input' : 'signin-btn')

// Signs in with a token another flow proved: saved like any sign-in, then made the active account.
// shortcut: a Plex account's machine id and plex.tv token aren't kept (auth's addServer takes
// neither), so a later Plex Home switch can't ask plex.tv as this account. Add them with Plex.
const tokenSignIn = async (url, result, options) => {
  jellyfinApi.setServer(url)
  jellyfinApi.setServerType(options.serverType || 'jellyfin')
  jellyfinApi.setAuth(result.User.Id, result.AccessToken)
  let name = options.serverName
  if (!name) {
    const m = String(url).match(/^\w+:\/\/([^/:]+)/)
    name = m ? m[1] : $L('Media Server')
  }
  const saved = await multiServerManager.addServer(
    url, name, result.User.Id, result.User.Name, result.AccessToken, result.User.PrimaryImageTag, options.serverType || 'jellyfin', options.serverVersion || null,
  )
  await saveToStorage('auth', { serverUrl: url, userId: result.User.Id, token: result.AccessToken, user: result.User })
  if (!(await auth.switchUser(saved.serverId, result.User.Id))) throw new Error('sign-in failed')
  return result
}

// The keyboard edits whichever field it opened on, and its Done is that field's Enter.
const FIELDS = {
  'username-input': { key: 'username', prop: 'username', purpose: 'username', password: false, row: 'user' },
  'password-input': { key: 'password', prop: 'password', purpose: 'password', password: true, row: 'pass' },
  'add-address-input': { key: 'address', prop: 'addressValue', purpose: 'url', password: false },
  'emby-username-input': { key: 'emby-username', prop: 'username', purpose: 'email', password: false, row: 'user' },
  'emby-password-input': { key: 'emby-password', prop: 'password', purpose: 'password', password: true, row: 'pass' },
  'plex-username-input': { key: 'plex-username', prop: 'username', purpose: 'email', password: false, row: 'user' },
  'plex-password-input': { key: 'plex-password', prop: 'password', purpose: 'password', password: true, row: 'pass' },
  'plex-code-input': { key: 'plex-code', prop: 'plexCode', purpose: 'number', password: false, row: 'code' },
}

export default function Login(props) {
  const store = getStore()
  const [fontsIn, setFontsIn] = createSignal(false)
  const s = reactive({
    loading: true,
    step: 'servers',
    server: null,
    users: [],
    accounts: [],
    uniqueServers: [],
    discovered: [],
    isDiscovering: false,
    addressValue: '',
    dialog: null,
    dialogError: null,
    signInUser: null,
    username: '',
    password: '',
    passwordChange: null,
    showQuickConnect: false,
    quickConnectCode: '',
    quickConnectLink: '',
    qrSrc: '',
    connectServers: [],
    connectSession: null,
    error: '',
    status: '',
    isConnecting: false,
    plexPin: null,
    plexQrSrc: '',
    plexServers: [],
    plexUsePassword: false,
    plexCode: '',
    plexNeedsCode: false,
    focusId: '',
    editing: '',
    keyboardOpen: false,
    scroll: 0,
    dormant: false,
  })
  const version = process.env.REACT_APP_VERSION || ''
  const bold = uiFont('bold')
  const medium = uiFont('medium')
  const regular = uiFont()
  const T = {
    savedServers: $L('Saved Servers'),
    discoveredServers: $L('Discovered Servers'),
    noneFound: $L('None found'),
    versionLine: $L('Moonfin version {version}').replace('{version}', version),
    whosWatching: $L("Who's watching?"),
    signIn: $L('Sign In'),
    quickConnect: $L('Quick Connect'),
    password: $L('Password'),
    qcInstruction: $L("Enter this code on your server's web dashboard:"),
    waiting: $L('Waiting for authorization...'),
    back: $L('Back'),
    username: $L('Username'),
    qrCaption: $L("Or scan this with a phone that's signed in to your server"),
    embyConnect: $L('Emby Connect'),
    embySub: $L('Sign in with your Emby Connect account'),
    emailOrUser: $L('Email or Username'),
    selectServer: $L('Select a Server'),
    signInPlex: $L('Sign in with Plex'),
    plexLink: $L('Go to plex.tv/link on any device and enter this code'),
    plexWaiting: $L('Waiting for you to approve the code...'),
    plexWithPassword: $L('Sign in with a password'),
    plexQrCaption: $L("Or scan this with a phone that's signed in to Plex"),
    noPlexServers: $L('No Plex servers found on this account'),
    verification: $L('Verification code'),
    signingIn: $L('Signing in...'),
    addServer: $L('Add Server'),
    chooseHow: $L("Choose how you'd like to connect."),
    serverAddress: $L('Server Address'),
    serverAddressDetail: $L('Jellyfin, Emby or Silo on your network or online'),
    plexDetail: $L('Use your Plex account to find its servers'),
    connectToServer: $L('Connect to Server'),
    addressHelp: $L("The same address you'd open in a browser, including the port."),
    connect: $L('Connect'),
    worksWith: $L('Works with Jellyfin, Emby and Silo. A Plex address opens the Plex sign-in.'),
    serverFound: $L('Server found'),
    continueNote: $L("Continue to choose who's signing in."),
    otherAddress: $L('Use a different address'),
    continue: $L('Continue'),
    removeServer: $L('Remove Server'),
    loading: $L('Loading...'),
  }
  const USER_PILLS = [
    { id: 'add-user-btn', label: $L('Add User'), icon: 'person' },
    { id: 'select-server-btn', label: $L('Select Server'), icon: 'home' },
  ]
  const REMOVE_BUTTONS = [
    { id: 'cancel', label: $L('Cancel') },
    { id: 'remove', label: $L('Remove') },
  ]

  let own
  let kb
  let carousel
  let pills
  let removeDlg
  const fields = {}
  const timers = new Set()
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }
  let qcTimer = null
  let qcRequest = 0
  let qcPolling = null
  let plexTimer = null
  let plexPinRef = null
  let plexRequest = 0
  let plexPolling = false
  let plexAddress = null
  let plexToken = null
  let cancelDiscovery = null
  let editingField = null
  let gone = false

  // The remove dialog takes focus off the page, so nothing on it draws focused under it. Nor does
  // anything while dormant: Back out of the TV's own keyboard leaves nothing focused, and the next
  // key only brings focus back to the field.
  const isFocus = createSelector(() => (s.dormant || (s.dialog && s.dialog.kind === 'remove') ? '' : s.focusId))
  const wake = () => {
    if (!s.dormant) return false
    s.dormant = false
    return true
  }
  const dlg = () => (s.dialog ? `${s.dialog.kind}:${s.dialog.step || ''}` : '')
  const showFrame = () => (!s.loading && s.step !== 'users' ? 1 : 0)
  const showUsers = () => (!s.loading && s.step === 'users' ? 1 : 0)
  const isAdding = () => props.mode === 'addUser' || props.mode === 'addServer'
  const supportsQuickConnect = () => hasQuickConnect(s.server)
  const onSilo = () => !!s.server && s.server.serverType === 'silo'
  const showQr = () => {
    if (!supportsQuickConnect() || !s.showQuickConnect) return false
    return onSilo() ? !!s.quickConnectLink : supportsQuickConnectWebLink(s.server && s.server.version)
  }
  const qrShown = () => (showQr() && s.qrSrc ? 1 : 0)
  const plexQr = () => s.step === 'plex' && !s.plexUsePassword && !!s.plexPin
  const narrow = () => s.step === 'signin' || s.step === 'embyconnect' || s.step === 'plex'
  // A saved Plex server found on this network shows once, at the address it answered on.
  const foundAt = (entry) => {
    if (entry.serverType === 'plex') {
      const hit = s.discovered.find((f) => f.serverType === 'plex' && f.id === entry.machineId)
      if (hit) return hit.address
    }
    return entry.url
  }
  const listedDiscovered = createMemo(() =>
    s.discovered.filter((f) => f.serverType !== 'plex' || !s.uniqueServers.some((e) => e.machineId === f.id)),
  )
  const savedItems = createMemo(() =>
    s.uniqueServers.map((entry, i) => ({
      id: `saved-${i}`,
      y: 46.36 + i * (TILE_H + TILE_GAP),
      serverType: entry.serverType,
      name: entry.name,
      detail: entry.version ? `${foundAt(entry)} • ${entry.version}` : foundAt(entry),
    })),
  )
  const discoveredItems = createMemo(() =>
    listedDiscovered().map((f, i) => ({
      id: `discovered-${i}`,
      y: 46.36 + i * (TILE_H + TILE_GAP),
      serverType: f.serverType,
      name: f.name,
      detail: f.address,
    })),
  )
  const serverName = () => (s.server && s.server.name) || ''
  const logo = createMemo(() => {
    const L = narrow() ? LOGO.small : LOGO.big
    return { ...L, box: L.box + descentShift() }
  })
  const statusBoxH = () => (s.status && !s.dialog && s.step !== 'users' ? 77.07 + 26.71 : 0)
  const notice = () => {
    const e = s.dialogError
    if (!e) return null
    const warning = e.errorType === INSECURE_CERT
    const detail = warning || SPECIFIC_FAILURES.indexOf(e.errorType) >= 0 ? e.error : $L('Check the address and port, and that the server is running.')
    return { warning, detail, title: warning ? '' : $L('Unable to connect to server') }
  }
  const addressHint = () => (s.isConnecting ? $L('Checking {address}').replace('{address}', s.addressValue.trim()) : T.worksWith)
  const passwordChangeNote = () =>
    s.passwordChange
      ? $L("This account's password has to be changed before signing in. Choose a new one of at least {count} characters.").replace(
          '{count}',
          String(s.passwordChange.minimumLength || 1),
        )
      : ''
  const passwordPlaceholder = () => {
    if (s.passwordChange) return $L('New password')
    return s.server && s.server.serverType === 'plex' ? $L('PIN') : $L('Password')
  }
  const signInLabel = () => (s.passwordChange ? $L('Change Password') : $L('Sign In'))
  // What the layout in loginCards.js reads besides the state.
  const derived = {
    get savedItems() {
      return savedItems()
    },
    get discoveredItems() {
      return discoveredItems()
    },
    get supportsQuickConnect() {
      return supportsQuickConnect()
    },
    get showQr() {
      return showQr()
    },
    get plexQr() {
      return plexQr()
    },
    get passwordChangeNote() {
      return passwordChangeNote()
    },
    get signInLabel() {
      return signInLabel()
    },
    get addressHint() {
      return addressHint()
    },
    get notice() {
      return notice()
    },
  }
  // Buttons and pills size to their labels, so the layout runs again once the real widths are in.
  const card = createMemo(() => {
    fontsIn()
    return stepCard(s, derived, T)
  })
  const rows = () => card().rows
  const toggleBtns = () => rows().toggles || []
  const formBtns = () => rows().formButtons || []
  const plexBtns = () => rows().plexButtons || []
  const listTiles = () => rows().list || []
  const mainW = () => rows().mainW || 0
  const footerH = () => (s.step === 'servers' ? 26.71 + LINE : 0)
  const keyboardOnPage = () => s.keyboardOpen && !s.dialog
  const frameH = () => 2 * FRAME_PAD + logo().box + statusBoxH() + card().h + footerH() + (keyboardOnPage() ? 467.5 : 0)
  // The frame sits above center, with a fifth of the spare room above it.
  const frameTop = () => Math.max(0, 1080 - frameH()) * 0.2
  const cardTop = () => frameTop() + FRAME_PAD + logo().box + statusBoxH()
  const qcCells = createMemo(() => codeCells(s.quickConnectCode ? formatQuickConnectCode(s.quickConnectCode) : ''))
  const plexCells = createMemo(() => codeCells(s.plexPin ? s.plexPin.code : ''))
  const carouselItems = createMemo(() => {
    const server = s.server
    return s.users.map((user) => {
      const pin = !user.hasToken && user.plexHome && user.hasPassword
      let line = null
      if (user.hasToken) line = { text: $L('Signed in on this device') }
      else if (pin) line = { text: $L('PIN required'), lock: true }
      else if (user.hasPassword) line = { text: $L('Password required') }
      return {
        key: user.id,
        id: user.id,
        name: user.name,
        imageUrl: user.imageTag ? jellyfinApi.getUserImageUrl(jellyfinApi.getServerUrl(), user.id, user.imageTag, server && server.serverType) : null,
        badge: pin ? 'pin' : null,
        lines: line ? [line] : [],
      }
    })
  })
  // The screen centers on the carousel as tall as the face in the middle makes it (its lines).
  const [hero, setHero] = createSignal(0)
  const uLay = createMemo(() => {
    fontsIn()
    const items = carouselItems()
    const item = items[Math.min(hero(), items.length - 1)]
    return usersLayout(item ? carouselHeight(item, items.length, LINE) : 0, s)
  })
  const userStatusW = () => {
    fontsIn()
    return textWidth(s.status, 21.704) + 2 * 26.71 + 4
  }
  const serverTextW = () => {
    fontsIn()
    return textWidth(serverName(), 25.044)
  }
  const addr = createMemo(() => {
    fontsIn()
    return addressRows(s, derived, T)
  })
  const found = createMemo(() => {
    fontsIn()
    return foundRows(s.dialog && s.dialog.server, T)
  })
  const panel = () => panelBox(s.dialog, s.keyboardOpen, addr().h, found().h)
  const foundServer = () => (s.dialog && s.dialog.server) || null
  const foundTile = () => {
    const f = foundServer()
    return FOUND_TILES[(f && f.serverType) || 'jellyfin'] || FOUND_TILES.jellyfin
  }
  const foundIcon = () => {
    const f = foundServer()
    const type = (f && f.serverType) || 'jellyfin'
    return `icons/acc_${BRAND_NAMES[type] ? type : 'jellyfin'}.webp`
  }
  const foundChips = createMemo(() => {
    fontsIn()
    const f = foundServer()
    if (!f) return []
    const chips = [BRAND_NAMES[f.serverType] || '']
    if (f.version) chips.push(`${$L('Version')} ${f.version}`)
    let x = 0
    return chips.map((label) => {
      const w = textWidth(label, 20.035, 'medium') + 33.39
      const out = { label, x, w }
      x += w + 10.02
      return out
    })
  })
  const removeMessage = () =>
    s.dialog && s.dialog.kind === 'remove' ? $L('Remove "{serverName}" from your servers?').replace('{serverName}', s.dialog.server.name || '') : ''

  const reloadAccounts = async () => {
    const { all, unique } = await auth.loadServers()
    batch(() => {
      s.accounts = all
      s.uniqueServers = unique
    })
  }

  // The page holds focus (on `own`) for its own buttons, fields and tiles, and passes it to the
  // carousel, the pills, the remove dialog and the keyboard.
  const applyFocus = () => {
    if (gone) return
    if (s.keyboardOpen) {
      kb.setFocus()
      return
    }
    if (s.dialog && s.dialog.kind === 'remove') {
      removeDlg.select('cancel')
      removeDlg.setFocus()
      return
    }
    if (s.focusId === 'carousel') carousel.setFocus()
    else if (s.focusId === 'add-user-btn' || s.focusId === 'select-server-btn') {
      pills.select(s.focusId)
      pills.setFocus()
    } else own.setFocus()
  }
  const focusOn = (id) => {
    batch(() => {
      s.focusId = id
      s.dormant = false
    })
    applyFocus()
  }
  const focusLater = (id) => later(() => focusOn(id), 100)
  // What takes focus on screen now, top to bottom, side by side within a row.
  const focusRows = () => {
    const st = s.step
    const d = s.dialog
    if (d && d.kind === 'add') {
      if (d.step === 'choose') return [['add-close-btn'], ['add-choice-address'], ['add-choice-plex'], ['add-choice-emby']]
      if (d.step === 'address') return s.isConnecting ? [] : [['add-back-btn', 'add-close-btn'], ['add-address-input'], ['add-connect-btn']]
      if (d.step === 'found') return [['add-other-address-btn', 'add-continue-btn']]
    }
    const enabled = (list) => (list || []).filter((b) => !b.disabled).map((b) => b.id)
    const all = (list) => (list || []).map((b) => b.id)
    const r = rows()
    if (st === 'servers') {
      const list = savedItems().map((x) => [x.id]).concat(discoveredItems().map((x) => [x.id]))
      return s.isConnecting ? list : list.concat([['add-server-btn']])
    }
    if (st === 'signin') {
      const out = []
      if (supportsQuickConnect()) out.push(['qc-toggle-btn', 'pw-toggle-btn'])
      if (r.qc) out.push(['back-btn'])
      else {
        if (!s.isConnecting && r.user >= 0) out.push(['username-input'])
        if (!s.isConnecting && r.pass >= 0) out.push(['password-input'])
        out.push(enabled(r.formButtons))
      }
      return out
    }
    if (st === 'embyconnect' || (st === 'plex' && s.plexUsePassword)) {
      const prefix = st === 'plex' ? 'plex' : 'emby'
      const out = s.isConnecting ? [] : [[`${prefix}-username-input`], [`${prefix}-password-input`]]
      if (st === 'plex' && s.plexNeedsCode && !s.isConnecting) out.push(['plex-code-input'])
      // A disabled Sign In still counts when the nearest button is picked, and isDisabled keeps focus put.
      return enabled(r.formButtons).length ? out.concat([all(r.formButtons)]) : out
    }
    if (st === 'plex') return s.isConnecting ? [] : [enabled(r.plexButtons)]
    if (st === 'embyconnect-servers' || st === 'plex-servers') {
      const list = (r.list || []).map((x) => [x.id])
      return s.isConnecting ? list : list.concat([['list-back-btn']])
    }
    return []
  }
  const isDisabled = (id) => {
    const r = rows()
    return [r.toggles, r.formButtons, r.plexButtons].some((list) => (list || []).some((b) => b.id === id && b.disabled))
  }
  // Up and Down land on the item in the next row whose middle is nearest the one focus left. When
  // that one is disabled (Emby's or Plex's Sign In with a field empty), focus stays where it was.
  const centerOf = (id) => {
    const r = rows()
    const lists = [r.toggles, r.formButtons, r.plexButtons]
    for (let i = 0; i < lists.length; i++) {
      const hit = (lists[i] || []).find((b) => b.id === id)
      if (hit) return hit.x + hit.w / 2
    }
    if (id === 'add-back-btn') return 33.39
    if (id === 'add-close-btn') return 756
    if (id === 'add-other-address-btn') return found().otherX
    if (id === 'add-continue-btn') return found().continueX
    return (r.mainW || 892.9) / 2
  }
  const moveFocus = (dRow, dCol) => {
    const list = focusRows()
    let r = -1
    list.forEach((row, i) => {
      if (row.indexOf(s.focusId) >= 0) r = i
    })
    if (r < 0) {
      const first = list.length ? list[0].filter((id) => !isDisabled(id))[0] : null
      if (first) focusOn(first)
      return
    }
    if (dCol) {
      const next = list[r].indexOf(s.focusId) + dCol
      if (next >= 0 && next < list[r].length && !isDisabled(list[r][next])) focusOn(list[r][next])
      return
    }
    r += dRow
    if (r < 0 || r >= list.length || !list[r].length) return
    const from = centerOf(s.focusId)
    let best = list[r][0]
    let bestD = Infinity
    list[r].forEach((id) => {
      const dist = Math.abs(centerOf(id) - from)
      if (dist < bestD) {
        bestD = dist
        best = id
      }
    })
    if (!isDisabled(best)) focusOn(best)
  }

  const startDiscovery = () => {
    if (cancelDiscovery) return
    s.discovered = []
    s.isDiscovering = true
    const saved = s.uniqueServers.map((e) => normalizeServerBaseUrl(e.url).toLowerCase())
    cancelDiscovery = discoverLocalServers({
      onFound: (f) => {
        if (saved.indexOf(normalizeServerBaseUrl(f.address).toLowerCase()) >= 0) return
        // A saved Plex server may have been reached through the relay, so the next start tries this address first.
        const savedPlex = f.serverType === 'plex' && s.uniqueServers.find((e) => e.machineId === f.id)
        if (savedPlex) {
          const others = (savedPlex.candidateAddresses || [savedPlex.url]).filter((uri) => uri !== f.address)
          multiServerManager.updateServer(savedPlex.serverId, { url: f.address, candidateAddresses: [f.address].concat(others) }).catch(() => {})
        }
        s.discovered = s.discovered.concat([f])
      },
      onDone: () => {
        s.isDiscovering = false
      },
    })
  }
  const stopDiscovery = () => {
    if (cancelDiscovery) cancelDiscovery()
    cancelDiscovery = null
    s.isDiscovering = false
  }

  const stopQuickConnect = () => {
    if (qcTimer) clearInterval(qcTimer)
    qcTimer = null
    qcRequest++
    batch(() => {
      s.quickConnectCode = ''
      s.quickConnectLink = ''
      s.qrSrc = ''
    })
  }
  const stopPlexPolling = () => {
    if (plexTimer) clearInterval(plexTimer)
    plexTimer = null
    plexPinRef = null
    plexRequest++
  }
  const finishLogin = async () => {
    stopQuickConnect()
    stopPlexPolling()
    await enterApp(router)
  }

  const goToServers = () => {
    stopQuickConnect()
    batch(() => {
      s.step = 'servers'
      s.server = null
      s.users = []
      s.signInUser = null
      s.error = ''
      s.status = ''
      s.scroll = 0
    })
    startDiscovery()
    focusLater('add-server-btn')
  }
  const goToSignIn = (target, user) => {
    // Only a Plex Home member switches in with a PIN. Anyone else signs in through plex.tv again.
    if (target && target.serverType === 'plex' && !(user && user.plexHome)) {
      startPlexSignIn()
      return
    }
    stopQuickConnect()
    stopDiscovery()
    // Quick Connect opens first. A server that has it switched off says so on the first request,
    // and the screen drops to the password.
    const quickConnect = hasQuickConnect(target)
    batch(() => {
      s.signInUser = user || null
      s.username = user ? user.name : ''
      s.password = ''
      s.error = ''
      s.status = ''
      s.showQuickConnect = quickConnect
      s.step = 'signin'
    })
    if (quickConnect) startQuickConnect()
    else focusLater(credentialFocusTarget(user))
  }
  const openServer = async (saved, { forceSignIn = false, signInAs = null } = {}) => {
    stopDiscovery()
    // A server only just probed already says what it is, a saved one is asked again.
    const serverType = saved.serverId
      ? await multiServerManager.checkServerType(saved.serverId, saved.url, saved.serverType || 'jellyfin')
      : saved.serverType || 'jellyfin'
    const target = { ...saved, serverType }
    jellyfinApi.setServer(target.url)
    jellyfinApi.setServerType(target.serverType)
    batch(() => {
      s.server = target
      s.error = ''
      s.status = ''
    })
    if (forceSignIn) {
      goToSignIn(target, signInAs)
      return
    }
    batch(() => {
      s.step = 'users'
      s.users = []
      s.status = $L('Loading users...')
    })
    let info = null
    try {
      info = await jellyfinApi.api.getPublicInfo()
    } catch (e) {
      // A saved server we can't reach still lists the users already stored
    }
    let publicUsers = []
    try {
      publicUsers = (await jellyfinApi.api.getPublicUsers()) || []
    } catch (e) {
      // A server can switch its public user list off, which offers nobody up
    }
    let homeUsers = []
    const accountToken = target.serverType === 'plex' ? plexAccountToken(s.accounts, target.serverId) : null
    if (accountToken) {
      try {
        homeUsers = await plexTv.getHomeUsers(accountToken)
      } catch (e) {
        // Without plex.tv the saved accounts still sign in
      }
    }
    if (gone) return
    const merged = []
    const byId = {}
    s.accounts.forEach((account) => {
      if (account.serverId !== target.serverId) return
      byId[account.userId] = true
      const home = homeUsers.find((u) => u.id === account.userId)
      merged.push({ id: account.userId, name: account.username, imageTag: account.primaryImageTag, hasToken: true, hasPassword: home ? home.hasPin : true, plexHome: !!home })
    })
    publicUsers.forEach((u) => {
      if (byId[u.Id]) return
      byId[u.Id] = true
      merged.push({ id: u.Id, name: u.Name, imageTag: u.PrimaryImageTag, hasToken: false, hasPassword: u.HasPassword !== false })
    })
    homeUsers.forEach((u) => {
      if (byId[u.id]) return
      byId[u.id] = true
      merged.push({ id: u.id, name: u.name, imageTag: 'plex', hasToken: false, hasPassword: u.hasPin, plexHome: true })
    })
    batch(() => {
      s.server = {
        ...target,
        name: (info && info.ServerName) || target.name,
        version: (info && info.Version) || target.version || null,
        loginDisclaimer: (info && info.LoginDisclaimer) || null,
      }
      s.status = ''
    })
    if (!merged.length) {
      goToSignIn(s.server, null)
      return
    }
    batch(() => {
      s.users = merged
      setHero(0)
    })
    if (carousel) carousel.setIndex(0)
    focusLater('carousel')
  }

  // First screen on arrival: a known server goes straight to its users, anything else starts
  // at the server list.
  const bootstrap = async () => {
    const active = await multiServerManager.getActiveServer().catch(() => null)
    if (props.mode === 'addUser' && store.serverUrl) {
      const saved =
        s.uniqueServers.find((e) => active && e.serverId === active.serverId) || s.uniqueServers.find((e) => e.url === store.serverUrl)
      openServer(saved || { serverId: null, url: store.serverUrl, name: store.serverName, serverType: 'jellyfin', version: null }, { forceSignIn: true })
      return
    }
    if (props.mode === 'addServer') {
      goToServers()
      return
    }
    // Silo ended the login, so that account signs in again, its name filled in.
    const again = auth.takeSiloSignInAgain()
    if (again) {
      const kept = s.uniqueServers.find((e) => e.url === again.server.url)
      openServer(kept || again.server, { forceSignIn: true, signInAs: { name: again.username, hasPassword: true } })
      return
    }
    const known = active ? s.uniqueServers.find((e) => e.serverId === active.serverId) : null
    // Forgot PIN lands on that account's sign-in, since only its password clears the PIN.
    const forgottenName = known ? forgottenPinUsername(known.url) : null
    if (forgottenName) openServer(known, { forceSignIn: true, signInAs: { name: forgottenName, hasPassword: true } })
    else if (known) openServer(known)
    else goToServers()
  }

  const probeServer = async (input) => {
    const candidates = generateCandidates(input)
    if (!candidates.length) return { error: getConnectionMessage(INVALID_ADDRESS), errorType: INVALID_ADDRESS }
    // The probe asks the Jellyfin way, even when a Plex server was signed in before.
    jellyfinApi.setServerType('jellyfin')
    let lastErrorType = null
    for (const candidate of candidates) {
      s.status = $L('Trying {url}...').replace('{url}', candidate)
      jellyfinApi.setServer(candidate)
      try {
        // Silo's own API is asked first: its web app answers Jellyfin's probe with a page.
        const siloInfo = await probeSiloOrNull(candidate)
        if (siloInfo) {
          jellyfinApi.setServerType('silo')
          return {
            server: { serverId: null, url: candidate, name: siloInfo.ServerName || candidate, serverType: 'silo', version: siloInfo.Version || null, loginDisclaimer: siloInfo.LoginDisclaimer || null },
          }
        }
        const info = await jellyfinApi.api.getPublicInfo()
        if (!info) continue
        const serverType = detectServerType(info.ProductName, info.Version)
        if (!serverType) {
          lastErrorType = SERVER_NOT_JELLYFIN
          continue
        }
        // Emby reports a 4.x version that has nothing to do with the Jellyfin minimum
        if (serverType === 'jellyfin' && !isVersionSupported(info.Version)) {
          return {
            error: $L('Server version {version} is not supported. Minimum: {minimum}.').replace('{version}', info.Version).replace('{minimum}', MIN_SERVER_VERSION),
            errorType: VERSION_UNSUPPORTED,
          }
        }
        jellyfinApi.setServerType(serverType)
        return { server: { serverId: null, url: candidate, name: info.ServerName || candidate, serverType, version: info.Version || null, loginDisclaimer: info.LoginDisclaimer || null } }
      } catch (err) {
        if (err && err.siloApiUnsupported) {
          return {
            error: err.serverIsNewer
              ? $L('This Silo server needs a newer version of Moonfin. Update Moonfin to use it.')
              : $L('This Silo server is too old for this version of Moonfin. Update Silo to use it.'),
            errorType: VERSION_UNSUPPORTED,
          }
        }
        // A cert rejection is the most actionable diagnosis, so a later network failure doesn't mask it.
        if (lastErrorType !== INSECURE_CERT) lastErrorType = classifyError(err) || lastErrorType
      }
    }
    return { error: getConnectionMessage(lastErrorType), errorType: lastErrorType }
  }
  const connectTo = async (input, { inDialog = false } = {}) => {
    s.isConnecting = true
    if (inDialog) s.dialogError = null
    else s.error = ''
    const result = await probeServer(input)
    // Only Jellyfin, Emby and Silo answer that probe, so a Plex server goes to its plex.tv sign-in.
    const plex = result.error ? await plexTv.findServerAt(input).catch(() => null) : null
    batch(() => {
      s.status = ''
      s.isConnecting = false
    })
    if (plex) {
      startPlexSignIn(plex)
      return
    }
    if (result.error) {
      if (inDialog) s.dialogError = result
      else s.error = result.error
      focusLater(inDialog ? 'add-connect-btn' : 'add-server-btn')
      return
    }
    // From the add panel the server is shown first, so the address can be corrected before signing in.
    if (inDialog) {
      s.dialog = { kind: 'add', step: 'found', server: result.server }
      focusLater('add-continue-btn')
      return
    }
    openServer(result.server)
  }

  const signIn = async (name, secret) => {
    if (!s.server || !name) return false
    batch(() => {
      s.isConnecting = true
      s.error = ''
      s.status = isAdding() ? $L('Adding user...') : $L('Signing in...')
    })
    try {
      await auth.login(jellyfinApi.getServerUrl(), name, secret, { serverName: s.server.name, serverType: s.server.serverType, serverVersion: s.server.version })
      s.isConnecting = false
      await finishLogin()
      return true
    } catch (err) {
      batch(() => {
        s.status = ''
        s.isConnecting = false
      })
      if (err && err.code === 'password_change_required') {
        // The password just typed is the temporary one, which Silo won't take back as the new one.
        batch(() => {
          s.passwordChange = { minimumLength: err.minimumLength || 0, maximumBytes: err.maximumBytes || 0, temporaryPassword: secret }
          s.password = ''
        })
        focusLater('password-input')
        return false
      }
      s.error =
        err && err.code === 'password_change_unavailable'
          ? $L("This account's password has to be changed in Silo's web app before signing in here.")
          : getSignInMessage(err)
      return false
    }
  }
  // Replaces the temporary password the sign-in stopped on, then finishes signing in.
  const changeRequiredPassword = async () => {
    if (!s.password) return
    const issue = siloNewPasswordIssue({ newPassword: s.password, ...s.passwordChange })
    if (issue) {
      s.error = siloNewPasswordMessage(issue, s.passwordChange && s.passwordChange.minimumLength)
      return
    }
    batch(() => {
      s.isConnecting = true
      s.error = ''
      s.status = isAdding() ? $L('Adding user...') : $L('Signing in...')
    })
    try {
      const result = await jellyfinApi.api.changeRequiredPassword(s.password)
      batch(() => {
        s.passwordChange = null
        s.password = ''
      })
      await tokenSignIn(jellyfinApi.getServerUrl(), result, { serverName: s.server.name, serverType: s.server.serverType, serverVersion: s.server.version })
      batch(() => {
        s.isConnecting = false
        s.status = ''
      })
      await finishLogin()
    } catch (err) {
      batch(() => {
        if ((err && err.code === 'password_changed_sign_in') || (err && err.status === 401)) {
          s.passwordChange = null
          s.password = ''
          s.error = $L('The password changed. Sign in with the new one.')
        } else {
          // Silo says why a new password was refused (too short, too long).
          s.error = err && (err.status === 422 || err.status === 400) ? err.message : getSignInMessage(err)
        }
        s.isConnecting = false
        s.status = ''
      })
    }
  }
  // A Plex Home member signs in with their own plex.tv token, from a switch that checks their PIN.
  const signInPlexHome = async (user, pin) => {
    const accountToken = plexAccountToken(s.accounts, s.server && s.server.serverId)
    if (!s.server || !user || !accountToken) return false
    batch(() => {
      s.isConnecting = true
      s.error = ''
      s.status = isAdding() ? $L('Adding user...') : $L('Signing in...')
    })
    try {
      const memberToken = await plexTv.switchHomeUser(accountToken, user.id, pin)
      if (!memberToken) {
        s.error = $L('Incorrect PIN')
        return false
      }
      const match = (await plexTv.getServers(memberToken)).find((entry) => entry.id === s.server.machineId)
      if (!match) {
        s.error = $L("{target} isn't shared with this account.").replace('{target}', s.server.name)
        return false
      }
      if (pin) noteProvedSignIn(s.server.url, user.id)
      await tokenSignIn(
        s.server.url,
        { User: { Id: user.id, Name: user.name, PrimaryImageTag: 'plex' }, AccessToken: match.accessToken },
        { serverName: s.server.name, serverType: 'plex', serverVersion: s.server.version },
      )
      await finishLogin()
      return true
    } catch (err) {
      s.error = plexErrorMessage(err)
      return false
    } finally {
      batch(() => {
        s.isConnecting = false
        s.status = ''
      })
    }
  }
  const handleUserSelect = async (user) => {
    if (!s.server) return
    const always = settings.get('alwaysAuthenticate') === true
    // An account with a token resumes, unless the viewer asked to be challenged every time or
    // is here to add an account.
    if (user.hasToken && !always && !isAdding() && s.server.serverId) {
      batch(() => {
        s.isConnecting = true
        s.status = $L('Signing in...')
      })
      const ok = await auth.switchUser(s.server.serverId, user.id)
      batch(() => {
        s.isConnecting = false
        s.status = ''
      })
      if (ok) {
        await finishLogin()
        return
      }
      goToSignIn(s.server, user)
      return
    }
    if (user.plexHome && !user.hasPassword) {
      await signInPlexHome(user, '')
      return
    }
    if (!user.hasPassword && !always) {
      if (await signIn(user.name, '')) return
      goToSignIn(s.server, user)
      return
    }
    goToSignIn(s.server, user)
  }
  const handleSignIn = () => {
    if (s.passwordChange) {
      changeRequiredPassword()
      return
    }
    if (s.server && s.server.serverType === 'plex') {
      signInPlexHome(s.signInUser, s.password)
      return
    }
    if (!s.username.trim()) return
    signIn(s.username.trim(), s.password)
  }

  const pollQuickConnect = async (secret) => {
    // A slow answer would otherwise overlap the next tick, and both could sign in.
    if (qcPolling === secret) return
    qcPolling = secret
    try {
      const state = await jellyfinApi.api.getQuickConnectState(secret)
      // A Silo code that ran out (or was declined) is done, so a fresh one is asked for.
      if (state.Expired) {
        stopQuickConnect()
        startQuickConnect()
        return
      }
      if (!state.Authenticated) return
      stopQuickConnect()
      s.status = isAdding() ? $L('Adding user...') : $L('Signing in...')
      const srv = s.server || {}
      const result = await auth.pollQuickConnect(jellyfinApi.getServerUrl(), secret, { serverName: srv.name, serverType: srv.serverType, serverVersion: srv.version })
      if (result) await finishLogin()
    } catch (err) {
      console.error('Quick Connect poll error:', err)
      // Once approved the code is gone, so a refusal has to be said or the screen stays on
      // "Waiting for authorization..."
      if (isSignInForbidden(err)) {
        batch(() => {
          s.error = getSignInMessage(err)
          s.status = ''
        })
      }
    } finally {
      if (qcPolling === secret) qcPolling = null
    }
  }
  const startQuickConnect = async () => {
    if (qcTimer || s.quickConnectCode) return
    const request = ++qcRequest
    try {
      const result = await jellyfinApi.api.initiateQuickConnect()
      if (request !== qcRequest || s.step !== 'signin' || !s.showQuickConnect) return
      if (!result || !result.Code || !result.Secret) return
      batch(() => {
        s.quickConnectCode = result.Code
        s.quickConnectLink = result.VerificationUriComplete || ''
      })
      qcTimer = setInterval(() => pollQuickConnect(result.Secret), QUICK_CONNECT_POLL)
      if (showQr()) s.qrSrc = qrDataUrl(onSilo() ? s.quickConnectLink : quickConnectApprovalUrl(s.server && s.server.url, s.quickConnectCode))
      focusLater('back-btn')
    } catch (e) {
      if (request !== qcRequest) return
      s.error = $L('Quick Connect is disabled')
      selectPassword()
    }
  }
  const selectPassword = () => {
    stopQuickConnect()
    s.showQuickConnect = false
    focusLater(credentialFocusTarget(s.signInUser))
  }
  const selectQuickConnect = () => {
    if (s.showQuickConnect) return
    batch(() => {
      s.showQuickConnect = true
      s.error = ''
    })
    startQuickConnect()
  }

  const embyConnectErrorMessage = (err) => {
    switch (err && err.reason) {
      case 'invalidCredentials':
        return $L('Invalid Emby Connect username or password')
      case 'invalidAuthResponse':
        return $L('Invalid Emby Connect credentials')
      case 'noLinkedServers':
        return $L('No servers linked to this Emby Connect account')
      case 'noReachableAddress':
        return $L('No reachable address provided')
      case 'unableToConnectServer':
        return $L('Unable to connect to server')
      default:
        return $L('Network error while contacting Emby Connect or the selected server')
    }
  }
  const finishEmbyLogin = async (target, session) => {
    const exchange = await embyConnect.connectToServer(target, session.userId)
    await tokenSignIn(
      exchange.resolvedBaseUrl,
      { User: { Id: exchange.localUserId, Name: session.userName || s.username }, AccessToken: exchange.accessToken },
      { serverName: target.name, serverType: 'emby' },
    )
    batch(() => {
      s.isConnecting = false
      s.status = ''
    })
    await finishLogin()
  }
  const handleEmbyConnectStart = () => {
    stopDiscovery()
    batch(() => {
      s.error = ''
      s.status = ''
      s.username = ''
      s.password = ''
      s.connectServers = []
      s.connectSession = null
      s.step = 'embyconnect'
    })
    focusLater('emby-username-input')
  }
  const handleEmbyConnectSignIn = async () => {
    if (!s.username.trim() || !s.password) return
    batch(() => {
      s.error = ''
      s.isConnecting = true
      s.status = $L('Signing in...')
    })
    try {
      const { session, servers: linked } = await embyConnect.authenticateAndLoadServers(s.username.trim(), s.password)
      if (!linked.length) {
        const err = new Error('No linked servers')
        err.reason = 'noLinkedServers'
        throw err
      }
      if (linked.length === 1) {
        s.status = $L('Connecting to server...')
        await finishEmbyLogin(linked[0], session)
        return
      }
      batch(() => {
        s.connectSession = session
        s.connectServers = linked
        s.step = 'embyconnect-servers'
        s.status = ''
        s.isConnecting = false
      })
      focusLater('emby-server-0')
    } catch (err) {
      batch(() => {
        s.isConnecting = false
        s.status = ''
        s.error = embyConnectErrorMessage(err)
      })
    }
  }
  const handleEmbyServer = async (index) => {
    const target = s.connectServers[index]
    if (!s.connectSession || !target) return
    batch(() => {
      s.error = ''
      s.isConnecting = true
      s.status = $L('Connecting to server...')
    })
    try {
      await finishEmbyLogin(target, s.connectSession)
    } catch (err) {
      batch(() => {
        s.isConnecting = false
        s.status = ''
        s.error = embyConnectErrorMessage(err)
      })
    }
  }

  const pollPlex = async () => {
    const pin = plexPinRef
    if (plexPolling || !pin) return
    if (Date.now() > pin.expiresAt) {
      plexPinRef = null
      requestPlexPin()
      return
    }
    plexPolling = true
    let token = null
    try {
      token = await plexTv.checkPin(pin.id)
    } catch (err) {
      plexPolling = false
      if (plexPinRef !== pin) return
      // plex.tv drops a code once it runs out, sometimes before its countdown here does.
      if (err.status === 404) {
        plexPinRef = null
        requestPlexPin()
        return
      }
      // Dropped connections, 429 and 5xx usually clear up, so the next tick retries those.
      if (err.status && err.status < 500 && err.status !== 429) {
        stopPlexPolling()
        batch(() => {
          s.plexPin = null
          s.error = plexErrorMessage(err)
        })
      }
      return
    }
    plexPolling = false
    if (token && plexPinRef === pin) {
      plexPinRef = null
      plexSignedIn(token)
    }
  }
  const requestPlexPin = async () => {
    stopPlexPolling()
    const request = plexRequest
    try {
      const pin = await plexTv.createPin()
      if (request !== plexRequest) return
      plexPinRef = pin
      batch(() => {
        s.plexPin = pin
        s.plexQrSrc = qrDataUrl(plexTv.plexLinkUrl(pin.code))
      })
      plexTimer = setInterval(pollPlex, PLEX_PIN_POLL)
    } catch (err) {
      if (request !== plexRequest) return
      batch(() => {
        s.plexPin = null
        s.error = plexErrorMessage(err)
      })
    }
  }
  // A typed address that answered as Plex goes first on the server it belongs to.
  const startPlexSignIn = (typed = null) => {
    stopQuickConnect()
    plexAddress = typed
    plexToken = null
    batch(() => {
      s.dialog = null
      s.error = ''
      s.status = ''
      s.plexPin = null
      s.plexServers = []
      s.plexUsePassword = false
      s.plexNeedsCode = false
      s.plexCode = ''
      s.username = ''
      s.password = ''
      s.step = 'plex'
    })
    // Discovery keeps going through Plex's sign-in, since the server's LAN address is often one plex.tv can't list.
    startDiscovery()
    requestPlexPin()
    focusLater('plex-password-btn')
  }
  const connectPlex = async (target, token) => {
    batch(() => {
      s.isConnecting = true
      s.error = ''
      s.status = $L('Connecting to server...')
    })
    try {
      const both = await Promise.all([plexTv.findReachableUri(target.connections, target.id), plexTv.getAccount(token)])
      const uri = both[0]
      const account = both[1]
      if (!uri) {
        s.error = $L('Unable to connect to {target}').replace('{target}', target.name)
        return
      }
      // A saved server keeps its entry when it answers at a new address.
      const saved = s.uniqueServers.find((e) => e.machineId === target.id)
      if (saved && saved.url !== uri) await multiServerManager.updateServer(saved.serverId, { url: uri })
      noteProvedSignIn(uri, account.id)
      await tokenSignIn(
        uri,
        { User: { Id: account.id, Name: account.name, PrimaryImageTag: 'plex' }, AccessToken: target.accessToken },
        { serverName: target.name, serverType: 'plex', serverVersion: target.version },
      )
      await finishLogin()
    } catch (err) {
      s.error = plexErrorMessage(err)
    } finally {
      batch(() => {
        s.isConnecting = false
        s.status = ''
      })
    }
  }
  // The account's servers, with the address typed in, then any found on this network, then the
  // one saved, ahead of what plex.tv lists.
  const plexSignedIn = async (token) => {
    stopPlexPolling()
    plexToken = token
    batch(() => {
      s.error = ''
      s.isConnecting = true
      s.status = $L('Connecting to server...')
    })
    let servers
    try {
      servers = (await plexTv.getServers(token)).map((entry) => {
        const typed = plexAddress && plexAddress.machineId === entry.id ? plexAddress.uri : null
        const known = s.uniqueServers.find((k) => k.machineId === entry.id)
        const lan = s.discovered.filter((f) => f.serverType === 'plex' && f.id === entry.id).map((f) => f.address)
        const first = [typed].concat(lan, [known && known.url]).filter(Boolean)
        return { ...entry, connections: first.concat(entry.connections.filter((uri) => first.indexOf(uri) < 0)) }
      })
    } catch (err) {
      batch(() => {
        s.isConnecting = false
        s.status = ''
        s.plexPin = null
        s.error = plexErrorMessage(err)
      })
      return
    }
    // The list stays up behind a lone server too, so a failed connection can be tried again from it.
    batch(() => {
      s.isConnecting = false
      s.status = ''
      s.plexServers = servers
      s.step = 'plex-servers'
    })
    stopDiscovery()
    focusLater(servers.length ? 'plex-server-0' : 'list-back-btn')
    if (servers.length === 1) await connectPlex(servers[0], token)
  }
  const handlePlexPasswordSignIn = async () => {
    if (!s.username.trim() || !s.password || s.isConnecting) return
    batch(() => {
      s.isConnecting = true
      s.error = ''
      s.status = $L('Signing in...')
    })
    let token
    try {
      token = await plexTv.signIn(s.username.trim(), s.password, s.plexNeedsCode ? s.plexCode.trim() : null)
    } catch (err) {
      batch(() => {
        s.isConnecting = false
        s.status = ''
      })
      // An account with two step sign-in turns the password down until its code comes along.
      if (!s.plexNeedsCode && plexTv.needsVerificationCode(err)) {
        s.plexNeedsCode = true
        focusLater('plex-code-input')
        return
      }
      s.error = plexErrorMessage(err)
      return
    }
    await plexSignedIn(token)
  }

  const closeDialog = () => {
    batch(() => {
      s.dialog = null
      s.dialogError = null
    })
    focusLater('add-server-btn')
  }
  const showAddressStep = () => {
    batch(() => {
      s.dialogError = null
      s.dialog = { kind: 'add', step: 'address' }
    })
    focusLater('add-address-input')
  }
  const showChooseStep = () => {
    batch(() => {
      s.dialogError = null
      s.dialog = { kind: 'add', step: 'choose' }
    })
    focusLater('add-choice-address')
  }
  const submitAddress = () => {
    if (!s.addressValue.trim() || s.isConnecting) return
    connectTo(s.addressValue, { inDialog: true })
  }
  const continueToServer = () => {
    const f = foundServer()
    s.dialog = null
    if (f) openServer(f)
  }
  const confirmRemove = async () => {
    const target = s.dialog && s.dialog.server
    s.dialog = null
    if (target) {
      await multiServerManager.removeServer(target.serverId)
      await reloadAccounts()
    }
    focusLater('add-server-btn')
  }
  const onDialog = (id) => {
    if (id === 'remove') confirmRemove()
    else closeDialog()
  }

  const revealField = (row) => {
    const top = cardTop() + CARD_PAD + 1 + (rows().form || 0) + (rows()[row] || 0)
    const docH = Math.max(1080, frameH())
    const target = Math.max(0, Math.min(docH - 1080, top - 1080 * 0.12))
    if (target > s.scroll) s.scroll = target
  }
  const onKeyboardChange = (text) => {
    const f = FIELDS[editingField]
    if (f) s[f.prop] = text
  }
  const fieldEnter = (id) => {
    if (id === 'username-input') focusLater(s.signInUser && s.signInUser.hasPassword === false ? 'signin-btn' : 'password-input')
    else if (id === 'password-input') handleSignIn()
    else if (id === 'add-address-input') submitAddress()
    else if (id === 'emby-password-input') handleEmbyConnectSignIn()
    else if (id === 'plex-password-input') {
      if (s.plexNeedsCode) focusLater('plex-code-input')
      else handlePlexPasswordSignIn()
    } else if (id === 'plex-code-input') handlePlexPasswordSignIn()
  }
  const onKeyboardClose = (submitted) => {
    const id = editingField
    editingField = null
    batch(() => {
      s.editing = ''
      s.keyboardOpen = false
      s.scroll = 0
    })
    focusOn(id)
    if (submitted) fieldEnter(id)
  }
  const openNative = (id) => {
    const f = FIELDS[id]
    const field = fields[id]
    editingField = id
    // The TV's keyboard covers the screen like this one's, so the screen makes the same room.
    batch(() => {
      s.editing = f.key
      s.keyboardOpen = true
    })
    if (!s.dialog && f.row) later(() => revealField(f.row), 200)
    const opened =
      field &&
      field.openNative({
        value: s[f.prop] || '',
        password: f.password,
        onChange: onKeyboardChange,
        onClose: (submitted, key) => {
          onKeyboardClose(submitted)
          if (key) moveFocus(key === 'up' ? -1 : 1, 0)
          else if (!submitted) s.dormant = true
        },
      })
    if (!opened) {
      batch(() => {
        s.editing = ''
        s.keyboardOpen = false
      })
    }
  }
  const openKeyboard = (id) => {
    const f = FIELDS[id]
    if (!f || s.isConnecting) return
    let recents = []
    if (f.purpose === 'url') recents = s.uniqueServers.map((e) => e.url).filter(Boolean)
    if (f.purpose === 'username') {
      s.accounts.forEach((a) => {
        if (a.username && recents.indexOf(a.username) < 0) recents.push(a.username)
      })
    }
    editingField = id
    // Keyboard Style Native hands the field to the TV's own keyboard instead.
    if (usesNativeKeyboard()) {
      openNative(id)
      return
    }
    batch(() => {
      s.editing = f.key
      s.keyboardOpen = true
    })
    kb.open({ value: s[f.prop] || '', purpose: f.purpose, password: f.password, recents })
    kb.setFocus()
    // The page grows room under the card and pulls the field toward the top, above the keys.
    if (!s.dialog && f.row) later(() => revealField(f.row), 200)
  }
  // The keyboard's own style picker chose Native, so the field goes to the TV's keyboard.
  const onKeyboardNative = () => {
    const id = editingField
    batch(() => {
      s.keyboardOpen = false
      s.scroll = 0
    })
    if (id) openNative(id)
  }

  // What OK does on the page's own focus.
  const activate = (id) => {
    if (FIELDS[id]) {
      openKeyboard(id)
      return
    }
    if (/^saved-/.test(id)) {
      const entry = s.uniqueServers[Number(id.slice(6))]
      if (entry) openServer({ ...entry, url: foundAt(entry) })
    } else if (/^discovered-/.test(id)) {
      if (s.isConnecting) return
      const f = listedDiscovered()[Number(id.slice(11))]
      if (f && f.serverType === 'plex') startPlexSignIn({ uri: f.address, machineId: f.id })
      else if (f) connectTo(f.address)
    } else if (id === 'add-server-btn') {
      s.addressValue = ''
      showChooseStep()
    } else if (id === 'add-close-btn') closeDialog()
    else if (id === 'add-back-btn') showChooseStep()
    else if (id === 'add-choice-address') showAddressStep()
    else if (id === 'add-choice-plex') startPlexSignIn()
    else if (id === 'add-choice-emby') {
      s.dialog = null
      handleEmbyConnectStart()
    } else if (id === 'add-connect-btn') submitAddress()
    else if (id === 'add-other-address-btn') showAddressStep()
    else if (id === 'add-continue-btn') continueToServer()
    else if (id === 'qc-toggle-btn') selectQuickConnect()
    else if (id === 'pw-toggle-btn') {
      s.error = ''
      selectPassword()
    } else if (id === 'back-btn' || id === 'emby-back-btn' || id === 'list-back-btn' || id === 'plex-code-back-btn' || id === 'plex-back-btn') goBack()
    else if (id === 'signin-btn') handleSignIn()
    else if (id === 'emby-signin-btn') handleEmbyConnectSignIn()
    else if (/^emby-server-/.test(id)) handleEmbyServer(Number(id.slice(12)))
    else if (/^plex-server-/.test(id)) {
      const target = s.plexServers[Number(id.slice(12))]
      if (target && plexToken && !s.isConnecting) connectPlex(target, plexToken)
    } else if (id === 'plex-password-btn') {
      batch(() => {
        s.plexUsePassword = true
        s.error = ''
      })
      focusLater('plex-username-input')
    } else if (id === 'plex-signin-btn') handlePlexPasswordSignIn()
  }
  const onCarouselActivate = (item) => {
    const user = s.users.find((u) => String(u.id) === String(item.id))
    if (user) handleUserSelect(user)
  }
  const onPill = (id) => {
    if (id === 'add-user-btn') {
      if (s.server) goToSignIn(s.server, null)
    } else if (id === 'select-server-btn') goToServers()
  }
  // The carousel and the pills hand over what they don't use themselves.
  const onChildKey = (dir) => {
    if (s.focusId === 'carousel' && dir === 'down') focusOn('select-server-btn')
    else if ((s.focusId === 'add-user-btn' || s.focusId === 'select-server-btn') && dir === 'up') focusOn('carousel')
  }

  // Back walks back through the screens, and from the first one leaves.
  const goBack = () => {
    const st = s.step
    if (st === 'plex' || st === 'plex-servers') {
      if (s.isConnecting) return true
      if (st === 'plex' && s.plexUsePassword) {
        batch(() => {
          s.plexUsePassword = false
          s.error = ''
        })
        if (!plexTimer) requestPlexPin()
        focusLater('plex-password-btn')
        return true
      }
      stopPlexPolling()
      stopDiscovery()
      if (s.users.length) {
        s.step = 'users'
        focusLater('carousel')
      } else goToServers()
      return true
    }
    if (s.dialog) {
      if (s.dialog.step === 'found') showAddressStep()
      else if (s.dialog.step === 'address' && !s.isConnecting) showChooseStep()
      else if (!s.isConnecting) closeDialog()
      return true
    }
    if (st === 'embyconnect-servers') {
      batch(() => {
        s.connectServers = []
        s.connectSession = null
        s.step = 'embyconnect'
      })
      focusLater('emby-username-input')
      return true
    }
    if (st === 'embyconnect') {
      goToServers()
      return true
    }
    if (st === 'signin') {
      if (s.passwordChange) {
        // Giving up the change ends the login it was waiting on.
        batch(() => {
          s.passwordChange = null
          s.password = ''
          s.error = ''
        })
        if (jellyfinApi.api.cancelRequiredPasswordChange) jellyfinApi.api.cancelRequiredPasswordChange()
        focusLater('password-input')
        return true
      }
      stopQuickConnect()
      if (s.users.length) {
        s.step = 'users'
        focusLater('carousel')
      } else goToServers()
      return true
    }
    if (st === 'users') {
      goToServers()
      return true
    }
    return false
  }

  // Hold OK on a saved server to forget it. Once the hold opens the dialog the key is still down,
  // and the focus manager drops its repeats until it's released.
  let heldId = ''
  // It's a hold when no release has come by 500ms, whether or not the remote repeats.
  const [holdSaved, releaseSaved] = useHold({
    holdThreshold: LONG_PRESS_DELAY,
    holdRequiresRepeat: false,
    onEnter: () => activate(heldId),
    onHold: () => {
      const entry = s.uniqueServers[Number(heldId.slice(6))]
      if (!entry) return
      s.dialog = { kind: 'remove', server: entry }
      later(applyFocus, 100)
    },
  })

  onMount(async () => {
    // Buttons and pills size to their labels, so the measuring faces come in first.
    await textReady()
    setFontsIn(true)
    await reloadAccounts()
    if (gone) return
    s.loading = false
    bootstrap()
  })
  onCleanup(() => {
    gone = true
    timers.forEach((id) => clearTimeout(id))
    timers.clear()
    stopQuickConnect()
    stopPlexPolling()
    stopDiscovery()
  })

  const errorFont = () => fontFor(s.error)
  const statusFont = () => fontFor(s.status)
  const centered = (w) => ({ maxWidth: w, contain: 'width', textAlign: 'center' })
  return (
    <view
      width={1920}
      height={1080}
      color="#ffffffff"
      linearGradient={BG}
      forwardFocus={() => {
        applyFocus()
        return true
      }}
      onUp={() => {
        if (wake()) return true
        if (s.step === 'users' && !s.dialog) onChildKey('up')
        else moveFocus(-1, 0)
        return true
      }}
      onDown={() => {
        if (wake()) return true
        if (s.step === 'users' && !s.dialog) onChildKey('down')
        else moveFocus(1, 0)
        return true
      }}
      onLeft={() => {
        if (!wake()) moveFocus(0, -1)
        return true
      }}
      onRight={() => {
        if (!wake()) moveFocus(0, 1)
        return true
      }}
      onEnter={(...args) => {
        if (wake()) return true
        const id = s.focusId
        if (/^saved-/.test(id)) {
          if (!args[0] || !args[0].repeat) heldId = id
          return holdSaved(...args)
        }
        activate(id)
        return true
      }}
      onEnterRelease={(...args) => {
        if (/^saved-/.test(heldId)) releaseSaved(...args)
        return true
      }}
      onBack={() => {
        s.dormant = false
        if (goBack()) return true
        if (isAdding() && store.authenticated) router.back()
        else requestExit()
        return true
      }}
    >
      <view ref={own} width={1} height={1} />
      <view alpha={s.loading ? 1 : 0}>
        <Ring x={937} y={496.3} size={46.07} />
        <text
          fontFamily={regular}
          fontSize={23.374}
          lineHeight={33}
          x={960}
          y={556.55 + themeDy(23.374, regular)}
          mountX={0.5}
          color="#ffffff"
          letterSpacing={spacingFor(regular)}
        >
          {T.loading}
        </text>
      </view>

      <view alpha={showFrame()} y={-s.scroll} width={1920} height={Math.max(1080, frameH())}>
        <view x={960 - logo().w / 2} y={frameTop() + 26.71} width={logo().w} height={logo().h} src="resources/logo-and-text.webp" />
        <view x={960 - card().w / 2} y={frameTop() + 26.71 + logo().box} width={card().w} height={77.07} alpha={statusBoxH() ? 1 : 0}>
          <view width={card().w} height={77.07} borderRadius={20.03} color="#00a4dc2e" border={STATUS_BORDER} />
          <text
            fontFamily={statusFont()}
            fontSize={21.704}
            lineHeight={33}
            x={card().w / 2}
            y={24.02 + themeDy(21.704, statusFont())}
            mountX={0.5}
            color="#00a4dc"
            letterSpacing={spacingFor(statusFont())}
          >
            {s.status || ' '}
          </text>
        </view>
        <view x={960 - card().w / 2} y={cardTop()} width={card().w} height={card().h}>
          <view width={card().w} height={card().h} borderRadius={33.39} color="#111528cc" border={{ width: 1, color: hex('#ffffff33') }} />

          <view alpha={s.step === 'servers' ? 1 : 0} x={54.43} y={54.43}>
            <view alpha={savedItems().length ? 1 : 0}>
              <text
                y={2.15 + themeDy(23.374, bold)}
                fontFamily={bold}
                fontSize={23.374}
                lineHeight={33}
                color="#ffffff"
                letterSpacing={spacingFor(bold)}
              >
                {T.savedServers}
              </text>
              <view>
                <For each={savedItems()}>
                  {(it) => <ServerTile y={it.y} serverType={it.serverType} name={it.name} detail={it.detail} focused={isFocus(it.id)} />}
                </For>
              </view>
            </view>
            <view y={rows().discovered || 0}>
              <text
                y={2.15 + themeDy(23.374, bold)}
                fontFamily={bold}
                fontSize={23.374}
                lineHeight={33}
                color="#ffffff"
                letterSpacing={spacingFor(bold)}
              >
                {T.discoveredServers}
              </text>
              <view>
                <For each={discoveredItems()}>
                  {(it) => <ServerTile y={it.y} serverType={it.serverType} name={it.name} detail={it.detail} focused={isFocus(it.id)} />}
                </For>
              </view>
              <view alpha={rows().spinner ? 1 : 0}>
                <Ring x={506.9} y={72.98} size={46.07} />
              </view>
              <text
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={33}
                y={68.54 + themeDy(23.374, regular)}
                color="#ffffff66"
                alpha={rows().none ? 1 : 0}
                letterSpacing={spacingFor(regular)}
              >
                {T.noneFound}
              </text>
              <view alpha={rows().tight ? 1 : 0}>
                <Ring x={514.6} y={rows().tight || 0} size={30.7} />
              </view>
            </view>
            <text
              fontFamily={errorFont()}
              fontSize={23.374}
              lineHeight={33}
              y={((rows().error || 0) + 2.15) + themeDy(23.374, errorFont())}
              maxWidth={1059.9}
              color="#ef4444"
              alpha={s.error ? 1 : 0}
              letterSpacing={spacingFor(errorFont())}
            >
              {s.error || ' '}
            </text>
            <AddServerButton y={rows().add || 0} focused={isFocus('add-server-btn')} disabled={s.isConnecting} />
          </view>

          <view alpha={s.step === 'signin' ? 1 : 0} x={54.43} y={54.43 + (rows().mainY || 0)}>
            <text
              y={3.68 + themeDy(40.07, bold)}
              fontFamily={bold}
              fontSize={40.07}
              lineHeight={33}
              x={mainW() / 2}
              mountX={0.5}
              color="#ffffff"
              letterSpacing={spacingFor(bold)}
            >
              {T.signIn}
            </text>
            <text
              fontFamily={regular}
              fontSize={20.035}
              lineHeight={33}
              x={mainW() / 2}
              y={41.52 + themeDy(20.035, regular)}
              mountX={0.5}
              color="#ffffff80"
              letterSpacing={spacingFor(regular)}
            >
              {$L('Connecting to {serverName}').replace('{serverName}', serverName())}
            </text>
            <view>
              <Index each={toggleBtns()}>
                {(b) => <LoginButton x={b().x} w={b().w} y={112.73} kind="toggle" label={b().label} selected={b().selected} focused={isFocus(b().id)} />}
              </Index>
            </view>
            <view alpha={rows().qc ? 1 : 0} y={rows().qc || 0}>
              <text
                y={2.15 + themeDy(23.374, regular)}
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={33}
                {...centered(mainW() || 1)}
                color="#ffffffb3"
                letterSpacing={spacingFor(regular)}
              >
                {T.qcInstruction}
              </text>
              <view alpha={s.quickConnectCode ? 1 : 0} x={mainW() / 2} y={rows().instrShift || 0}>
                <view>
                  <Index each={qcCells()}>
                    {(c) => (
                      <text fontFamily={CODE_FONT} fontSize={CODE_SIZE} lineHeight={33} x={c().x} y={79.75} mountX={0.5} color="#00a4dc">
                        {c().ch}
                      </text>
                    )}
                  </Index>
                </view>
                <Ring x={-23.04} y={132.78} size={46.07} tint="#00a4dcb3" />
                <text
                  fontFamily={regular}
                  fontSize={20.035}
                  lineHeight={33}
                  y={207.14 + (rows().spinShift || 0) + themeDy(20.035, regular)}
                  mountX={0.5}
                  color="#ffffff80"
                  letterSpacing={spacingFor(regular)}
                >
                  {T.waiting}
                </text>
              </view>
              <view alpha={!s.quickConnectCode && !s.error ? 1 : 0} y={rows().instrShift || 0}>
                <Ring x={mainW() / 2 - 36.73} y={66.39} size={73.46} thick={9} />
              </view>
              <text
                {...centered(mainW() || 1)}
                fontFamily={errorFont()}
                fontSize={23.374}
                lineHeight={33}
                y={((rows().qcError || 0) + 2.15) + themeDy(23.374, errorFont())}
                color="#ef4444"
                alpha={s.error ? 1 : 0}
                letterSpacing={spacingFor(errorFont())}
              >
                {s.error || ' '}
              </text>
              <LoginButton x={(mainW() - (rows().backW || 0)) / 2} y={rows().qcBack || 0} w={rows().backW} label={T.back} focused={isFocus('back-btn')} />
            </view>
            <view alpha={rows().form ? 1 : 0} y={rows().form || 0}>
              <text
                {...centered(mainW() || 1)}
                y={1.84 + themeDy(20.035, regular)}
                fontFamily={regular}
                fontSize={20.035}
                lineHeight={33}
                color="#ffffff80"
                alpha={s.passwordChange ? 1 : 0}
                letterSpacing={spacingFor(regular)}
              >
                {passwordChangeNote() || ' '}
              </text>
              <LoginField
                ref={(n) => (fields['username-input'] = n)}
                y={rows().user || 0}
                w={892.9}
                value={s.username}
                placeholder={T.username}
                focused={isFocus('username-input')}
                editing={s.editing === 'username'}
                alpha={rows().user >= 0 ? 1 : 0}
              />
              <LoginField
                ref={(n) => (fields['password-input'] = n)}
                y={rows().pass || 0}
                w={892.9}
                value={s.password}
                placeholder={passwordPlaceholder()}
                secret
                focused={isFocus('password-input')}
                editing={s.editing === 'password'}
                alpha={rows().pass >= 0 ? 1 : 0}
              />
              <text
                {...centered(mainW() || 1)}
                fontFamily={errorFont()}
                fontSize={23.374}
                lineHeight={33}
                y={((rows().formError || 0) + 2.15) + themeDy(23.374, errorFont())}
                color="#ef4444"
                alpha={s.error ? 1 : 0}
                letterSpacing={spacingFor(errorFont())}
              >
                {s.error || ' '}
              </text>
              <view>
                <Index each={s.step === 'signin' ? formBtns() : []}>
                  {(b) => (
                    <LoginButton
                      x={b().x}
                      w={b().w}
                      y={rows().formButtonsY}
                      label={b().label}
                      focused={isFocus(b().id)}
                      busy={b().busy}
                      disabled={b().disabled}
                    />
                  )}
                </Index>
              </view>
            </view>
            <view alpha={qrShown()} x={mainW() + 66.78} y={(rows().qrY || 0) - (rows().mainY || 0)}>
              <view width={367.3} height={367.3} borderRadius={20.03} src={s.qrSrc || undefined} />
              <text
                {...centered(367.3)}
                fontFamily={regular}
                fontSize={20.035}
                lineHeight={33}
                y={382.5 + themeDy(20.035, regular)}
                color="#ffffff80"
                letterSpacing={spacingFor(regular)}
              >
                {T.qrCaption}
              </text>
            </view>
          </view>

          <view alpha={s.step === 'embyconnect' ? 1 : 0} x={54.43} y={54.43}>
            <text
              y={3.68 + themeDy(40.07, bold)}
              fontFamily={bold}
              fontSize={40.07}
              lineHeight={33}
              x={446.45}
              mountX={0.5}
              color="#ffffff"
              letterSpacing={spacingFor(bold)}
            >
              {T.embyConnect}
            </text>
            <text
              fontFamily={regular}
              fontSize={20.035}
              lineHeight={33}
              x={446.45}
              y={41.52 + themeDy(20.035, regular)}
              mountX={0.5}
              color="#ffffff80"
              letterSpacing={spacingFor(regular)}
            >
              {T.embySub}
            </text>
            <LoginField
              ref={(n) => (fields['emby-username-input'] = n)}
              y={rows().user || 0}
              w={892.9}
              value={s.username}
              placeholder={T.emailOrUser}
              focused={isFocus('emby-username-input')}
              editing={s.editing === 'emby-username'}
            />
            <LoginField
              ref={(n) => (fields['emby-password-input'] = n)}
              y={rows().pass || 0}
              w={892.9}
              value={s.password}
              placeholder={T.password}
              secret
              focused={isFocus('emby-password-input')}
              editing={s.editing === 'emby-password'}
            />
            <text
              {...centered(892.9)}
              fontFamily={errorFont()}
              fontSize={23.374}
              lineHeight={33}
              y={((rows().formError || 0) + 2.15) + themeDy(23.374, errorFont())}
              color="#ef4444"
              alpha={s.error ? 1 : 0}
              letterSpacing={spacingFor(errorFont())}
            >
              {s.error || ' '}
            </text>
            <view>
              <Index each={s.step === 'embyconnect' ? formBtns() : []}>
                {(b) => <LoginButton x={b().x} w={b().w} y={rows().formButtonsY} label={b().label} focused={isFocus(b().id)} disabled={b().disabled} />}
              </Index>
            </view>
          </view>

          <view alpha={s.step === 'embyconnect-servers' || s.step === 'plex-servers' ? 1 : 0} x={54.43} y={54.43}>
            <text
              y={2.15 + themeDy(23.374, bold)}
              fontFamily={bold}
              fontSize={23.374}
              lineHeight={33}
              color="#ffffff"
              letterSpacing={spacingFor(bold)}
            >
              {T.selectServer}
            </text>
            <text
              fontFamily={regular}
              fontSize={23.374}
              lineHeight={33}
              y={68.54 + themeDy(23.374, regular)}
              color="#ffffff66"
              alpha={rows().none ? 1 : 0}
              letterSpacing={spacingFor(regular)}
            >
              {T.noPlexServers}
            </text>
            <view>
              <Index each={listTiles()}>
                {(it) => <ServerTile y={it().y} serverType={it().serverType} name={it().name} detail={it().detail} focused={isFocus(it().id)} />}
              </Index>
            </view>
            <text
              fontFamily={errorFont()}
              fontSize={23.374}
              lineHeight={33}
              y={((rows().error || 0) + 2.15) + themeDy(23.374, errorFont())}
              maxWidth={1059.9}
              color="#ef4444"
              alpha={s.error ? 1 : 0}
              letterSpacing={spacingFor(errorFont())}
            >
              {s.error || ' '}
            </text>
            <LoginButton kind="action" y={rows().add || 0} w={1059.9} label={T.back} disabled={s.isConnecting} focused={isFocus('list-back-btn')} />
          </view>

          <view alpha={s.step === 'plex' ? 1 : 0} x={54.43} y={54.43 + (rows().mainY || 0)}>
            <text
              y={3.68 + themeDy(40.07, bold)}
              fontFamily={bold}
              fontSize={40.07}
              lineHeight={33}
              x={mainW() / 2}
              mountX={0.5}
              color="#ffffff"
              letterSpacing={spacingFor(bold)}
            >
              {T.signInPlex}
            </text>
            <view alpha={s.plexUsePassword ? 0 : 1} y={73.07}>
              <text
                y={2.15 + themeDy(23.374, regular)}
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={33}
                {...centered(mainW() || 1)}
                color="#ffffffb3"
                letterSpacing={spacingFor(regular)}
              >
                {T.plexLink}
              </text>
              <view alpha={s.plexPin ? 1 : 0} x={mainW() / 2} y={rows().instrShift || 0}>
                <view>
                  <Index each={plexCells()}>
                    {(c) => (
                      <text fontFamily={CODE_FONT} fontSize={CODE_SIZE} lineHeight={33} x={c().x} y={79.75} mountX={0.5} color="#00a4dc">
                        {c().ch}
                      </text>
                    )}
                  </Index>
                </view>
                <Ring x={-23.04} y={132.78} size={46.07} tint="#00a4dcb3" />
                <text
                  fontFamily={regular}
                  fontSize={20.035}
                  lineHeight={33}
                  y={207.14 + (rows().spinShift || 0) + themeDy(20.035, regular)}
                  mountX={0.5}
                  color="#ffffff80"
                  letterSpacing={spacingFor(regular)}
                >
                  {T.plexWaiting}
                </text>
              </view>
              <view alpha={!s.plexPin && !s.error ? 1 : 0} y={rows().instrShift || 0}>
                <Ring x={mainW() / 2 - 23.04} y={59.71} size={46.07} />
              </view>
              <text
                {...centered(mainW() || 1)}
                fontFamily={errorFont()}
                fontSize={23.374}
                lineHeight={33}
                y={((rows().qcError || 0) + 2.15) + themeDy(23.374, errorFont())}
                color="#ef4444"
                alpha={s.error ? 1 : 0}
                letterSpacing={spacingFor(errorFont())}
              >
                {s.error || ' '}
              </text>
              <view>
                <Index each={plexBtns()}>
                  {(b) => <LoginButton x={b().x} w={b().w} y={rows().qcBack || 0} label={b().label} focused={isFocus(b().id)} disabled={s.isConnecting} />}
                </Index>
              </view>
            </view>
            <view alpha={s.plexUsePassword ? 1 : 0} y={rows().form || 0}>
              <LoginField
                ref={(n) => (fields['plex-username-input'] = n)}
                y={rows().user || 0}
                w={892.9}
                value={s.username}
                placeholder={T.emailOrUser}
                focused={isFocus('plex-username-input')}
                editing={s.editing === 'plex-username'}
              />
              <LoginField
                ref={(n) => (fields['plex-password-input'] = n)}
                y={rows().pass || 0}
                w={892.9}
                value={s.password}
                placeholder={T.password}
                secret
                focused={isFocus('plex-password-input')}
                editing={s.editing === 'plex-password'}
              />
              <LoginField
                ref={(n) => (fields['plex-code-input'] = n)}
                y={rows().code || 0}
                w={892.9}
                value={s.plexCode}
                placeholder={T.verification}
                focused={isFocus('plex-code-input')}
                editing={s.editing === 'plex-code'}
                alpha={s.plexNeedsCode ? 1 : 0}
              />
              <text
                {...centered(892.9)}
                fontFamily={errorFont()}
                fontSize={23.374}
                lineHeight={33}
                y={((rows().formError || 0) + 2.15) + themeDy(23.374, errorFont())}
                color="#ef4444"
                alpha={s.error ? 1 : 0}
                letterSpacing={spacingFor(errorFont())}
              >
                {s.error || ' '}
              </text>
              <view>
                <Index each={s.step === 'plex' ? formBtns() : []}>
                  {(b) => <LoginButton x={b().x} w={b().w} y={rows().formButtonsY} label={b().label} focused={isFocus(b().id)} disabled={b().disabled} />}
                </Index>
              </view>
            </view>
            <view alpha={plexQr() ? 1 : 0} x={mainW() + 66.78} y={(rows().qrY || 0) - (rows().mainY || 0)}>
              <view width={367.3} height={367.3} borderRadius={20.03} src={s.plexQrSrc || undefined} />
              <text
                {...centered(367.3)}
                fontFamily={regular}
                fontSize={20.035}
                lineHeight={33}
                y={382.5 + themeDy(20.035, regular)}
                color="#ffffff80"
                letterSpacing={spacingFor(regular)}
              >
                {T.plexQrCaption}
              </text>
            </view>
          </view>
        </view>
        <text
          fontFamily={regular}
          fontSize={20.035}
          lineHeight={33}
          x={960}
          y={(cardTop() + card().h + 26.71 + 1.84) + themeDy(20.035, regular)}
          mountX={0.5}
          color="#ffffff66"
          alpha={s.step === 'servers' ? 1 : 0}
          letterSpacing={spacingFor(regular)}
        >
          {T.versionLine}
        </text>
      </view>

      <view alpha={showUsers()}>
        <view x={96.84} y={63.4} width={296} height={66.78} src="resources/logo-and-text.webp" />
        <view alpha={serverName() ? 1 : 0}>
          <view x={1823.16 - serverTextW() - 43.41} y={81.77} width={30.05} height={30.05} src="icons/acc_dnsOutlined.webp" color="#ffffffa6" />
          <text
            fontFamily={fontFor(serverName())}
            fontSize={25.044}
            lineHeight={33}
            x={1823.16}
            y={82.59 + themeDy(25.044, fontFor(serverName()))}
            mountX={1}
            color="#ffffffa6"
            letterSpacing={spacingFor(fontFor(serverName()))}
          >
            {serverName() || ' '}
          </text>
        </view>
        <text
          fontFamily={medium}
          fontSize={33.391}
          lineHeight={33}
          x={960}
          y={(uLay().titleY + 3.07) + themeDy(33.391, medium)}
          mountX={0.5}
          color="#ffffffb3"
          letterSpacing={spacingFor(medium)}
        >
          {T.whosWatching}
        </text>
        <ProfileCarousel
          ref={(n) => (carousel = n)}
          y={uLay().carouselY}
          items={carouselItems()}
          colors={COLORS}
          lineH={33}
          reach={USERS_REACH}
          onCarouselIndex={setHero}
          onCarouselActivate={onCarouselActivate}
        />
        <view alpha={s.status && !s.dialog ? 1 : 0} x={960 - userStatusW() / 2} y={uLay().statusY} width={userStatusW()} height={77.07}>
          <view width={userStatusW()} height={77.07} borderRadius={20.03} color="#00a4dc2e" border={STATUS_BORDER} />
          <text
            fontFamily={statusFont()}
            fontSize={21.704}
            lineHeight={33}
            x={28.71}
            y={24.02 + themeDy(21.704, statusFont())}
            color="#00a4dc"
            letterSpacing={spacingFor(statusFont())}
          >
            {s.status || ' '}
          </text>
        </view>
        <text
          {...centered(1726.3)}
          fontFamily={regular}
          fontSize={20.035}
          lineHeight={33}
          x={96.84}
          y={(uLay().disclaimerY + 1.84) + themeDy(20.035, regular)}
          color="#ffffffb3"
          alpha={uLay().disclaimer ? 1 : 0}
          letterSpacing={spacingFor(regular)}
        >
          {uLay().disclaimer || ' '}
        </text>
        <text
          {...centered(1726.3)}
          fontFamily={errorFont()}
          fontSize={23.374}
          lineHeight={33}
          x={96.84}
          y={(uLay().errorY + 2.15) + themeDy(23.374, errorFont())}
          color="#ef4444"
          alpha={s.error ? 1 : 0}
          letterSpacing={spacingFor(errorFont())}
        >
          {s.error || ' '}
        </text>
        <PillRow ref={(n) => (pills = n)} y={943.13} pills={USER_PILLS} colors={COLORS} onPill={onPill} />
      </view>

      <view alpha={dlg().indexOf('add:') === 0 ? 1 : 0} width={1920} height={1080} color="#05071099">
        <view x={525.9} y={panel().y} width={868.2} height={panel().h} borderRadius={40.07} color={NONE} shadow={PANEL_SHADOW} />
        <view x={525.9} y={panel().y} width={868.2} height={panel().h} borderRadius={40.07} color="#1d2130f0">
          <view width={868.2} height={panel().h * 0.35} borderRadius={[40.07, 40.07, 0, 0]} colorTop="#ffffff14" colorBottom="#ffffff00" />
          <view width={868.2} height={panel().h} borderRadius={40.07} color={NONE} border={{ width: 1, color: hex('#ffffff33') }} />
          <view x={39.4} y={39.4}>
            <view alpha={dlg() === 'add:choose' ? 1 : 0}>
              <text
                fontFamily={bold}
                fontSize={36.73}
                lineHeight={47.75}
                letterSpacing={-0.334 + spacingFor(bold)}
                y={10.05 + themeDy(36.73, bold)}
                color="#fffffff5"
              >
                {T.addServer}
              </text>
              <text
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={32.72}
                y={63.25 + themeDy(23.374, regular)}
                color="#ffffff9e"
                letterSpacing={spacingFor(regular)}
              >
                {T.chooseHow}
              </text>
              <LoginButton kind="round" icon="closeRounded" x={722.6} focused={isFocus('add-close-btn')} />
              <ChoiceCard y={127.19} tile="accent" title={T.serverAddress} detail={T.serverAddressDetail} focused={isFocus('add-choice-address')} />
              <ChoiceCard y={269.39} tile="plex" title={T.signInPlex} detail={T.plexDetail} focused={isFocus('add-choice-plex')} />
              <ChoiceCard y={411.59} tile="emby" title={T.embyConnect} detail={T.embySub} focused={isFocus('add-choice-emby')} />
            </view>
            <view alpha={dlg() === 'add:address' ? 1 : 0}>
              <LoginButton kind="round" icon="arrowBack" disabled={s.isConnecting} focused={isFocus('add-back-btn')} />
              <text
                fontFamily={bold}
                fontSize={36.73}
                lineHeight={47.75}
                letterSpacing={-0.334 + spacingFor(bold)}
                x={86.8}
                y={10.05 + themeDy(36.73, bold)}
                color="#fffffff5"
              >
                {T.connectToServer}
              </text>
              <text
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={32.72}
                x={86.8}
                y={63.25 + themeDy(23.374, regular)}
                maxWidth={615.8}
                color="#ffffff9e"
                alpha={s.keyboardOpen ? 0 : 1}
                letterSpacing={spacingFor(regular)}
              >
                {T.addressHelp}
              </text>
              <LoginButton kind="round" icon="closeRounded" x={722.6} disabled={s.isConnecting} focused={isFocus('add-close-btn')} />
              <text
                fontFamily={medium}
                fontSize={20.035}
                lineHeight={33}
                letterSpacing={0.5 + spacingFor(medium)}
                y={(addr().label + 1.84) + themeDy(20.035, medium)}
                color="#ffffff99"
              >
                {T.serverAddress}
              </text>
              <LoginField
                ref={(n) => (fields['add-address-input'] = n)}
                look="address"
                y={addr().field}
                w={789.4}
                value={s.addressValue}
                placeholder="https://your-server.example.com"
                focused={isFocus('add-address-input')}
                editing={s.editing === 'address'}
              />
              <LoginButton
                kind="primary"
                y={addr().connect}
                w={789.4}
                label={T.connect}
                busy={s.isConnecting}
                disabled={s.isConnecting}
                focused={isFocus('add-connect-btn')}
              />
              <text
                fontFamily={regular}
                fontSize={20.035}
                lineHeight={28.05}
                y={(addr().hint + 1.84) + themeDy(20.035, regular)}
                maxWidth={789.4}
                color="#ffffff80"
                alpha={s.keyboardOpen ? 0 : 1}
                letterSpacing={spacingFor(regular)}
              >
                {addressHint()}
              </text>
              <view alpha={notice() && !s.keyboardOpen ? 1 : 0} y={addr().notice}>
                <view
                  width={789.4}
                  height={addr().noticeH}
                  borderRadius={23.37}
                  color={addr().warning ? '#f5b43c14' : '#ef44441a'}
                  border={{ width: 1, color: hex(addr().warning ? '#f5b43c4d' : '#ef44444d') }}
                />
                <view
                  x={19.37}
                  y={19.37}
                  width={33.39}
                  height={33.39}
                  src={addr().warning ? 'icons/acc_shield.webp' : 'icons/acc_error.webp'}
                  color={addr().warning ? '#ffd27a' : '#ffb4b4'}
                />
                <text
                  fontFamily={bold}
                  fontSize={23.374}
                  lineHeight={33}
                  x={72.78}
                  y={20.52 + themeDy(23.374, bold)}
                  color="#ffb4b4"
                  letterSpacing={spacingFor(bold)}
                >
                  {addr().noticeTitle || ' '}
                </text>
                <text
                  fontFamily={regular}
                  fontSize={21.704}
                  lineHeight={31.47}
                  x={72.78}
                  y={(addr().noticeTextY + 1.99) + themeDy(21.704, regular)}
                  maxWidth={694.8}
                  color={addr().warning ? '#ffd27ad9' : '#ffb4b4d9'}
                  letterSpacing={spacingFor(regular)}
                >
                  {addr().noticeText || ' '}
                </text>
              </view>
            </view>
            <view alpha={dlg() === 'add:found' ? 1 : 0}>
              <view y={9.85} width={46.75} height={46.75} borderRadius={23.37} color="#34d39929">
                <view x={8.35} y={8.35} width={30.05} height={30.05} src="icons/acc_checkRounded.webp" color="#5ee0ae" />
              </view>
              <text
                fontFamily={bold}
                fontSize={36.73}
                lineHeight={47.75}
                letterSpacing={-0.334 + spacingFor(bold)}
                x={63.45}
                y={12.72 + themeDy(36.73, bold)}
                color="#fffffff5"
              >
                {T.serverFound}
              </text>
              <view y={77.8} width={789.4} height={found().cardH}>
                <view width={789.4} height={found().cardH} borderRadius={30.05} color="#ffffff0a" border={{ width: 1, color: hex('#ffffff17') }} />
                <view x={26.04} y={(found().cardH - 93.49) / 2} width={93.49} height={93.49} borderRadius={26.71} color={foundTile().bg}>
                  <view x={21.7} y={21.7} width={50.09} height={50.09} src={foundIcon()} color={foundTile().fg} />
                </view>
                <view x={142.9} y={(found().cardH - found().bodyH) / 2}>
                  <text
                    y={2.76 + themeDy(30.05, fontFor((foundServer() && foundServer().name) || '', 'bold'))}
                    fontFamily={fontFor((foundServer() && foundServer().name) || '', 'bold')}
                    fontSize={30.05}
                    lineHeight={35.23}
                    maxWidth={621.5}
                    maxLines={2}
                    color="#fffffff5"
                    letterSpacing={spacingFor(fontFor((foundServer() && foundServer().name) || '', 'bold'))}
                  >
                    {(foundServer() && foundServer().name) || ' '}
                  </text>
                  <view y={found().chipsY}>
                    <Index each={foundChips()}>
                      {(c) => (
                        <view x={c().x} width={c().w} height={40.04}>
                          <view width={c().w} height={40.04} borderRadius={20.03} color="#ffffff12" />
                          <text
                            fontFamily={medium}
                            fontSize={20.035}
                            lineHeight={26.7}
                            x={16.7}
                            y={8.52 + themeDy(20.035, medium)}
                            color="#ffffffd9"
                            letterSpacing={spacingFor(medium)}
                          >
                            {c().label || ' '}
                          </text>
                        </view>
                      )}
                    </Index>
                  </view>
                  <text
                    fontFamily={fontFor((foundServer() && foundServer().url) || '')}
                    fontSize={21.704}
                    lineHeight={25.43}
                    y={(found().addressY + 1.99) + themeDy(21.704, fontFor((foundServer() && foundServer().url) || ''))}
                    maxWidth={621.5}
                    maxLines={1}
                    color="#ffffff8c"
                    letterSpacing={spacingFor(fontFor((foundServer() && foundServer().url) || ''))}
                  >
                    {(foundServer() && foundServer().url) || ' '}
                  </text>
                </view>
              </view>
              <text
                fontFamily={regular}
                fontSize={23.374}
                lineHeight={32.72}
                y={(found().note + 2.15) + themeDy(23.374, regular)}
                maxWidth={789.4}
                color="#ffffff9e"
                letterSpacing={spacingFor(regular)}
              >
                {T.continueNote}
              </text>
              <LoginButton
                kind="ghost"
                x={found().otherX}
                w={found().otherW}
                y={found().actions}
                label={T.otherAddress}
                focused={isFocus('add-other-address-btn')}
              />
              <LoginButton
                kind="primary"
                x={found().continueX}
                w={found().continueW}
                y={found().actions}
                label={T.continue}
                focused={isFocus('add-continue-btn')}
              />
            </view>
          </view>
        </view>
      </view>

      <Dialog
        ref={(n) => (removeDlg = n)}
        show={dlg() === 'remove:'}
        title={T.removeServer}
        message={removeMessage()}
        buttons={REMOVE_BUTTONS}
        onDialog={onDialog}
      />
      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={onKeyboardChange}
        onKeyboardClose={onKeyboardClose}
        onKeyboardNative={onKeyboardNative}
      />
    </view>
  )
}
