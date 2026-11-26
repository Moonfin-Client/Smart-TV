import $L from './services/i18n.js'
import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import { activeElement } from '@solidtv/solid'
import { useFocusManager } from '@solidtv/solid/primitives'
import { HashRouter } from '@solidtv/solid/primitives/router'
import { Route } from '@solidjs/router'
import NavBar from './ui/components/NavBar.jsx'
import Toast from './ui/components/Toast.jsx'
import Dialog from './ui/components/Dialog.jsx'
import AccountMenu from './ui/components/shell/AccountMenu.jsx'
import ServerMessages from './ui/components/shell/ServerMessages.jsx'
import ShuffleOverlay from './ui/components/library/ShuffleOverlay.jsx'
import UpdateNotification from './ui/components/shell/UpdateNotification.jsx'
import TimesUp from './ui/components/shell/TimesUp.jsx'
import NoConnection, { ConnectionBanner } from './ui/components/shell/NoConnection.jsx'
import NotificationToast from './ui/components/shell/NotificationToast.jsx'
import SeasonalTheme from './ui/components/shell/SeasonalTheme.jsx'
import Screensaver from './ui/components/shell/Screensaver.jsx'
import MergedCopyPicker from './ui/components/modals/MergedCopyPicker.jsx'
import ItemMenuHost from './ui/components/modals/ItemMenuHost.jsx'
import PartyLayer from './ui/components/party/PartyLayer.jsx'
import { badgeNotes, chatNote, muteChat } from './ui/components/shell/notifications.js'
import { PageStack, isInside } from './app/PageStack.jsx'
import { KEY_MAP } from './app/keys.js'
import { current, router, setRouterHooks } from './app/router.js'
import { focusNav } from './app/focus.js'
import { focusActivePage } from './state/pages.js'
import { Details, WatchParty } from './routes.js'
import { achievements, clearUnlocks, onAchievementsChange, shownIncomingMessage, syncAchievements } from './state/achievements.js'
import * as audioPlayer from './state/audioPlayer.js'
import * as auth from './state/auth.js'
import * as settings from './state/settings.js'
import { getStore, toast } from './state/store.js'
import { flushSettingsPush } from './state/settingsSync.js'
import { shell, setShellApp } from './state/shell/shellState.js'
import { startIdle, wake } from './state/shell/idle.js'
import { markPopupsRead, pendingPopups } from './state/shell/messages.js'
import { startConnection } from './state/shell/connection.js'
import { releaseVideos, startLifecycle } from './state/shell/lifecycle.js'
import { dismissUpdate, scheduleUpdateCheck } from './state/shell/update.js'
import { requestExit } from './state/shell/exit.js'
import { checkSeerr } from './state/seerr.js'
import { configureIncomplete } from './ui/components/livetv/incompleteSetup.js'
import { loadSavedThemes, theme } from './ui/theme.js'
import { getPlatform, isVega } from './platform.js'
import { activateApp, exitApp } from './utils/appLifecycle.js'
import { setupPlatformLifecycle } from './services/video.js'
import { recheckAccess } from './state/shell/access.js'
import { afterHomeReady } from './utils/homeReady.js'
import { isKidsMode } from './utils/kidsMode.js'
import { hasMergedCopies, mergesLibraries } from './utils/mergedCopies.js'
import { findEveryCopy } from './services/mergedTitleReads.js'
import { hasMultipleServers } from './services/multiServerManager.js'
import * as remoteControl from './services/remoteControl.js'
import { endSessionByServer, playsSiloSession } from './services/playback.js'
import { roomBlocksTransport } from './services/syncPlay.js'
import { setSiloPlaybackControlHandlers } from './services/siloPlaybackControl.js'
import { offerRemoteSearch } from './pages/Search/remoteSearch.js'

if (import.meta.env.VITE_LAB) import('./ui/components/shell/lab/Lab.jsx')

// The page behind the canvas is painted in the theme's background, which shows wherever the canvas
// is clear. The Tizen player clears it, since AVPlay draws under the whole page.
const cssColor = (c) => {
  const ch = (i) => parseInt(c.slice(i, i + 2), 16)
  return `rgba(${ch(1)}, ${ch(3)}, ${ch(5)}, ${(c.length > 7 ? ch(7) : 255) / 255})`
}
const paintPage = (css) => {
  document.documentElement.style.background = css
  document.body.style.background = css
}

// The screens before Home, which draw no nav bar and never get the screensaver.
const GATE_ROUTES = ['/', '/login', '/pin', '/setup']
const NO_NAV =
  /^\/(library|genre|genres|favorites|livetv|recordings|games|music|books|photos|album|artist|player|trailer|read|nowplaying|seerr\/browse)(\/|$)/
// Kids Mode refuses these however they're reached, from a home row or a search result too.
const KIDS_BLOCKED = /^\/(livetv|recordings|seerr|calendar)/
// While Time's up shows, Back and the arrows reach nothing behind it.
const SWALLOW = { 8: 1, 27: 1, 461: 1, 10009: 1, 37: 1, 38: 1, 39: 1, 40: 1 }
// The screensaver stays built through its 1s fade out.
const SAVER_FADE_MS = 1000

// Each overlay sits in a container of its own, so it keeps its place in the draw order whenever it
// mounts. Plain modules reach the shell through shellApp() (state/shell/shellState.js).
const Shell = (props) => {
  const store = getStore()
  let exitRef
  let timesUpRef
  let pickerRef
  const routePath = createMemo(() => router.state.path || '/')
  const [overlay, setOverlay] = createSignal('')
  const [saverBuilt, setSaverBuilt] = createSignal(false)
  const [notes, setNotes] = createSignal({ streamNote: null, remoteNote: null, badgeNote: null, chatNote: null })
  const refs = {}
  let toNav = false
  let fresh = false
  let badges = []

  // No nav over the sign-in gates, the player, the game screens or the pages that bring their own
  // header. A trailer only fades it, through store.navVisible.
  const chrome = createMemo(() => store.authenticated && GATE_ROUTES.indexOf(routePath()) < 0 && !NO_NAV.test(routePath()))
  const pageBackground = createMemo(() => {
    const t = theme()
    const playing = routePath().indexOf('/player') === 0
    // The bars around the picture are black, whatever the theme.
    if (playing) return getPlatform() === 'tizen' ? 'transparent' : '#000'
    return cssColor(t.background)
  })
  createEffect(on(pageBackground, paintPage))
  const seasonalOn = () => overlay() !== 'shuffle' && !shell.saver && routePath() === '/home'
  let saverTimer = null
  createEffect(
    on(
      () => shell.saver,
      (on) => {
        clearTimeout(saverTimer)
        if (on) setSaverBuilt(true)
        else saverTimer = setTimeout(() => setSaverBuilt(false), SAVER_FADE_MS)
      },
      { defer: true },
    ),
  )
  onCleanup(() => clearTimeout(saverTimer))

  // A gate, a dialog or Time's up is on screen. The screensaver keeps its own list (state/shell/idle.js).
  const shellBusy = () => GATE_ROUTES.indexOf(routePath()) >= 0 || !!overlay() || shell.timesUp
  const restoreFocus = () => {
    if (shell.timesUp && timesUpRef) timesUpRef.setFocus()
    else if (refs[overlay()]) refs[overlay()].setFocus()
    else if (toNav && chrome() && focusNav()) return
    else focusActivePage()
  }
  const openOverlay = (name, nav) => {
    toNav = !!nav
    setOverlay(name)
  }
  const closeOverlay = () => {
    setOverlay('')
    if (!app.maybeUpdate()) restoreFocus()
  }
  const setNote = (slot, note) => setNotes({ ...untrack(notes), [slot]: note || null })

  // The newly signed-in account goes through the gates from the startup screen, since Home can't
  // be navigated to from Home itself.
  const resumeAs = () => router.to('/', { resume: true }, { inHistory: false })

  const app = {
    $router: router,
    get overlay() {
      return overlay()
    },
    closeOverlay,
    freshStart() {
      fresh = true
    },
    openExit() {
      openOverlay('exit', false)
      if (!exitRef) return
      exitRef.select('cancel')
      exitRef.setFocus()
    },
    onDialog(id) {
      if (overlay() === 'exit' && id === 'exit') {
        releaseVideos()
        exitApp()
      } else closeOverlay()
    },
    openAccount() {
      openOverlay('account', true)
    },
    openMessages(nav = true) {
      openOverlay('messages', nav)
    },
    openParty(nav = true) {
      if (store.authenticated) openOverlay('party', nav)
    },
    openShuffle() {
      if (store.authenticated) openOverlay('shuffle', true)
    },
    maybeUpdate() {
      if (!shell.update || overlay() || shell.timesUp || !store.authenticated || GATE_ROUTES.indexOf(routePath()) >= 0) return false
      openOverlay('update', false)
      return true
    },
    // The version counts as seen once closed, so the panel isn't offered again on the way out.
    onUpdateClose() {
      setOverlay('')
      restoreFocus()
      dismissUpdate()
    },
    // Messages the admin set to open the window do, once Home is up and nothing else is.
    maybePopup() {
      if (!pendingPopups().length || shellBusy() || routePath() !== '/home') return
      markPopupsRead()
      app.openMessages(false)
    },
    async onAccountMenu(action, account) {
      closeOverlay()
      if (action === 'close') return
      if (action === 'addUser' || action === 'addServer') return router.to('/login', { mode: action }, { inHistory: false })
      await flushSettingsPush()
      if (action === 'switch') {
        if (await auth.switchUser(account.serverId, account.userId)) return resumeAs()
        toast($L('That account needs to sign in again.'))
      } else if (action === 'signOut') {
        // logout moves to the next saved account when there is one.
        await auth.logout()
        if (store.authenticated) return resumeAs()
      }
      router.to('/login', {}, { inHistory: false })
    },
    onTimesUp() {
      if (audioPlayer.audio.active) audioPlayer.stop()
      setOverlay('')
      if (routePath().indexOf('/player') === 0) router.to('/home')
    },
    // The account stays saved, so it can be picked again once its hours are back.
    onTimesUpSwitch() {
      auth.leaveSession()
      router.to('/login', {}, { inHistory: false })
    },
    // The connection check found the session gone, so the account signs in again.
    sessionExpired() {
      auth.leaveSession()
      router.to('/login', {}, { inHistory: false })
    },
    // The notification banners: one each for Seerr's stream, a message sent from another client,
    // the unlocked badges in turn and the chats in turn, all at the top right.
    showRemoteMessage(text, header) {
      setNote('remoteNote', { key: Date.now(), title: (header && header.trim()) || $L('Remote message'), body: text })
    },
    // The player closed because an admin ended its Silo session, so the screen it returns to says why.
    // An admin's reason for ending it, when Silo gave one, goes under.
    showEndedOnServer(reason) {
      setNote('remoteNote', { key: Date.now(), title: $L('Playback was ended on the Silo server.'), ...(reason ? { body: reason } : null) })
    },
    // shortcut: there's no Seerr settings stream (state/seerr.js), so nothing calls this. Call it with
    // the stream's seerrNotification events once there is one.
    showStreamNotification(event) {
      const title = event && typeof event.title === 'string' ? event.title : ''
      const body = event && typeof event.body === 'string' ? event.body : ''
      if (title || body) setNote('streamNote', { key: Date.now(), title, body })
    },
    onNoteDone(slot) {
      if (slot === 'badgeNote') {
        badges.shift()
        setNote('badgeNote', badges[0] || null)
      } else if (slot === 'chatNote') shownIncomingMessage()
      else setNote(slot, null)
    },
  }
  setShellApp(app)

  const onAchievements = () => {
    const found = achievements().unlocks
    if (found) {
      clearUnlocks()
      const list = badgeNotes(found, routePath().indexOf('/player') === 0)
      const idle = !badges.length
      list.forEach((note) => badges.push(note))
      if (idle && list.length) setNote('badgeNote', list[0])
    }
    syncChat()
  }
  // The first chat waiting gets the banner, unless the viewer is watching something with chat
  // banners muted, which drops it.
  const syncChat = () => {
    const thread = achievements().incomingMessages[0] || null
    if (thread && muteChat(settings.get('muteChatBannersDuringPlayback'), routePath().indexOf('/player') === 0)) {
      shownIncomingMessage()
      return
    }
    const note = thread ? chatNote(thread) : null
    const shown = untrack(notes).chatNote
    if (!note || !shown || shown.key !== note.key) setNote('chatNote', note)
  }

  // A title several servers hold, from a merged library, first asks which server's copy to open,
  // and with Merge Libraries by Type on every title is looked up on the other servers first. Only
  // the latest pick opens.
  // shortcut: it needs the card in the navigation's data ({ item }), which only some pages pass, and
  // the route carries just the copy's id. Pass the item from every page to cover them all.
  let copyBypass = false
  let copyTicket = 0
  const copyFor = async (to) => {
    const item = to && to.data && to.data.item
    if (copyBypass || !item || !/^\/(details|player)\//.test(String(to.path || ''))) {
      copyBypass = false
      return true
    }
    const ticket = ++copyTicket
    let card = item
    if (!hasMergedCopies(card) && mergesLibraries(settings.all(), await hasMultipleServers().catch(() => false))) {
      card = await findEveryCopy(item).catch(() => item)
    }
    if (ticket !== copyTicket || !hasMergedCopies(card)) return ticket === copyTicket
    const copy = await pickerRef.pick(card)
    if (ticket !== copyTicket) return false
    if (!copy) {
      focusActivePage()
      return false
    }
    to.data.item = copy
    if (copy.Id === item.Id) return true
    // The router opens what this returns in place of the card's own copy.
    copyBypass = true
    return { path: String(to.path).replace(item.Id, copy.Id), data: to.data, options: to.options }
  }

  // Quick Look opens a picked title in a drawer over the screen or drawer it was picked on. A drawer
  // belongs to its screen's stack entry, so leaving the screen puts it away and coming back brings
  // it back.
  const [ql, setQl] = createSignal(null)
  let qlBypass = false
  let qlParked = null
  const quickLookFor = (to) => {
    if (qlBypass) {
      qlBypass = false
      return false
    }
    const s = settings.all()
    const path = String(to.path || '')
    // A title only in Seerr (/seerr/item/:mediatype/:id) opens in the drawer too. A book opened from
    // its series is never drawn there, and keeps the series for its page.
    const seerr = /^\/seerr\/item\/(tv|movie)\/(\d+)/.exec(path)
    if ((!seerr && path.indexOf('/details/') !== 0) || s.detailScreenStyle !== 'v8' || isKidsMode(s) || (to.data && to.data.bookSeries)) return false
    if (/^\/(details|person|player|seerr\/item)/.test(routePath())) return false
    const id = seerr ? seerr[2] : to.params && to.params.id
    if (!id) return false
    setQl({ id, mt: seerr ? seerr[1] : '', server: to.data && to.data.server, autoPlay: Boolean(to.data && to.data.autoPlay), entry: current(), previous: untrack(ql) })
    return true
  }
  const closeQuickLook = () => {
    const q = untrack(ql)
    setQl((q && q.previous) || null)
    if (!untrack(ql)) focusActivePage()
  }
  // Open full page swaps the drawer for the title's page, and a season's page opens over the
  // drawer, which comes back with Back.
  const quickLookFullPage = (pick) => {
    if (!pick || !pick.id) return
    const q = untrack(ql)
    if (pick.replace && q) setQl(q.previous || null)
    qlBypass = true
    router.to(pick.seerr ? `/seerr/item/${pick.seerr.type}/${pick.seerr.id}` : `/details/${pick.id}`, q && q.server ? { server: q.server } : {})
  }
  const quickLookAfter = () => {
    const entry = current()
    const q = untrack(ql)
    if (q && entry !== q.entry) {
      qlParked = q
      setQl(null)
    } else if (!q && qlParked && entry === qlParked.entry) {
      setQl(qlParked)
      qlParked = null
    }
  }

  setRouterHooks({
    async beforeEach(to) {
      const copy = await copyFor(to)
      if (copy !== true) return copy
      if (quickLookFor(to)) return false
      // /party opens the Watch Parties dialog over the page instead of replacing it.
      if (to.path === '/party') {
        app.openParty(false)
        return false
      }
      if (KIDS_BLOCKED.test(to.path) && isKidsMode(settings.all())) return '/home'
    },
    afterEach(to) {
      syncChat()
      quickLookAfter()
      // A party that starts playing leaves its dialog for the player.
      if (untrack(overlay) === 'party' && to.path.indexOf('/player') === 0) setOverlay('')
      if (to.path === '/home') {
        // The previous account's pages, kept alive in the back history, go once Home shows for the next.
        if (fresh) {
          fresh = false
          router.clearHistory()
        }
        // A Silo sign-in with several household profiles asks who's watching once Home is up, which
        // is after setup and any PIN.
        if (auth.takeHouseholdPick()) app.openAccount()
        else app.maybePopup()
      }
    },
  })

  // Achievements start over on every sign-in, user switch and sign-out.
  const achievementsKey = createMemo(() => (store.authenticated ? `${store.serverUrl}|${store.userId}` : ''))
  createEffect(on(achievementsKey, (key) => syncAchievements(key)))
  // The incomplete recordings service keeps in step with the plugin's ping, the Moonfin plugin
  // setting and the signed in user.
  createEffect(
    on([() => store.user, settings.all], () => {
      checkSeerr().then(() => configureIncomplete(untrack(() => store.user)))
    }),
  )
  const updateGate = createMemo(() => store.authenticated && settings.get('updateNotificationsEnabled') !== false)
  createEffect(on(updateGate, () => scheduleUpdateCheck(), { defer: true }))
  createEffect(
    on(
      () => shell.timesUp,
      (on) => {
        if (on) timesUpRef && timesUpRef.setFocus()
        else restoreFocus()
      },
      { defer: true },
    ),
  )
  createEffect(
    on(
      () => shell.offline,
      (on) => !on && restoreFocus(),
      { defer: true },
    ),
  )

  // Details loads in the background once Home has shown and the remote has been still a moment.
  // Compiling it holds the main thread on webOS for a second or two, which a key press would wait out.
  let keyAt = 0
  const preloadDetails = () => {
    if (GATE_ROUTES.indexOf(routePath()) < 0 && Date.now() - keyAt > 1500) {
      Details.preload().catch((e) => console.warn('[app] details preload', e))
      return
    }
    setTimeout(preloadDetails, 1000)
  }
  // Ahead of the focus manager, so the key that wakes the screensaver goes no further. While Time's
  // up shows, a page that opened under it may have taken focus, so it takes it back first.
  const onKey = (e) => {
    keyAt = Date.now()
    if (shell.timesUp && timesUpRef && !isInside(activeElement(), timesUpRef)) timesUpRef.setFocus()
    if (wake() || (shell.timesUp && SWALLOW[e.keyCode])) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  onMount(() => {
    loadSavedThemes()
    onAchievementsChange(onAchievements)
    window.addEventListener('keydown', onKey, true)
    afterHomeReady().then(preloadDetails)
    startIdle()
    startConnection()
    // A Smart Hub tile's title opens once someone is past the gates.
    startLifecycle(() => store.authenticated && !!store.user && !shell.timesUp && GATE_ROUTES.indexOf(routePath()) < 0)
    scheduleUpdateCheck()
    remoteControl.setAppControls({
      current: {
        wakeScreensaver: wake,
        notifyInteraction: wake,
        showMessage: (text, header) => app.showRemoteMessage(text, header),
        goHome: () => {
          if (!store.authenticated || shellBusy()) return
          store.navSection = 'home'
          router.to('/home')
        },
        // A phone's search: Search takes it from offerRemoteSearch, or hears it when already open.
        goToSearch: (search) => {
          wake()
          if (!store.authenticated || shellBusy()) return search.close()
          offerRemoteSearch(search)
          store.navSection = 'search'
          router.to('/search')
        },
        // shortcut: playing and queueing sent from another client do nothing. Wire these to the
        // player and audioPlayer to support remote play.
        playItems() {},
        queueItems() {},
      },
    })
    // Silo's playback control lane runs its commands the way a Jellyfin remote's are run.
    onCleanup(
      setSiloPlaybackControlHandlers({
        run: remoteControl.handleMessage,
        plays: playsSiloSession,
        terminate: endSessionByServer,
        // An admin stopped playback from Silo's dashboard and said why.
        stopped: (reason) => app.showRemoteMessage(reason, $L('Playback was stopped on the Silo server.')),
        transportHeld: roomBlocksTransport,
      }),
    )
    router.to('/')
  })
  onCleanup(() => window.removeEventListener('keydown', onKey, true))
  // webOS holds an app relaunched with handlesRelaunch in the background until it activates, and the
  // Xbox and Vega hosts send their remotes' keys and network changes through the same setup.
  // shortcut: a sign-in PIN isn't asked for again on relaunch. Add it with the PIN gate.
  onCleanup(
    setupPlatformLifecycle(() => {
      try {
        recheckAccess()
      } finally {
        activateApp()
      }
    }),
  )

  // What no page or nav handled. Back goes back, and asks to exit where there's nowhere to go.
  // Media keys left unhandled control the music from anywhere.
  const onBack = () => {
    if (routePath() === '/home' || !router.back()) requestExit()
    return true
  }
  const keep = (name) => (n) => (refs[name] = n)
  return (
    <view
      width={1920}
      height={1080}
      onBack={onBack}
      onPlay={() => audioPlayer.audio.active && !audioPlayer.audio.playing && audioPlayer.toggle()}
      onPause={() => audioPlayer.audio.playing && audioPlayer.toggle()}
      onPlayPause={() => audioPlayer.toggle()}
      onStop={() => audioPlayer.audio.active && audioPlayer.stop()}
    >
      {props.children}
      <SeasonalTheme layer="particles" on={seasonalOn()} />
      <NavBar show={chrome()} hidden={!store.navVisible} />
      <SeasonalTheme layer="follower" on={seasonalOn()} />
      <view id="overNav" width={1920} height={1080} />
      <PartyLayer atPlayer={routePath().indexOf('/player') === 0} />
      {/* Quick Look's drawer. It holds focus while its title loads, so presses that land under the
          drawer stay in it, and Back closes it. */}
      <view>
        <Show when={ql()} keyed>
          {(q) => (
            <view
              ref={(n) => n.setFocus()}
              width={1920}
              height={1080}
              onUp={() => true}
              onDown={() => true}
              onLeft={() => true}
              onRight={() => true}
              onEnter={() => true}
              onBack={() => {
                closeQuickLook()
                return true
              }}
            >
              <Details
                id={q.id}
                mediatype={q.mt}
                server={q.server}
                quickLook
                autoPlay={q.autoPlay}
                onAutoPlayed={() => (q.autoPlay = false)}
                onQuickLookClose={closeQuickLook}
                onQuickLookFull={quickLookFullPage}
              />
            </view>
          )}
        </Show>
      </view>
      <view>
        <Show when={overlay() === 'account'}>
          <AccountMenu ref={keep('account')} onAccountMenu={app.onAccountMenu} />
        </Show>
      </view>
      <view>
        <Show when={overlay() === 'messages'}>
          <ServerMessages ref={keep('messages')} onClose={closeOverlay} />
        </Show>
      </view>
      <view>
        <Show when={overlay() === 'shuffle'}>
          <ShuffleOverlay
            ref={keep('shuffle')}
            onClose={(opened) => {
              // A card it opened took the viewer to a page that takes focus itself.
              if (opened) toNav = false
              closeOverlay()
            }}
          />
        </Show>
      </view>
      {/* Amazon's review presses Back until the launcher shows, so on Fire TV Back in the exit dialog
          exits. Everywhere else it cancels. */}
      <view
        onCaptureBack={() => {
          if (!isVega()) return false
          app.onDialog('exit')
          return true
        }}
      >
        <Show when={overlay() === 'exit'}>
          <Dialog
            ref={(n) => (exitRef = refs.exit = n)}
            variant="exit"
            title={$L('Exit Moonfin?')}
            message={$L('Are you sure you want to exit?')}
            buttons={[
              { id: 'cancel', label: $L('Cancel') },
              { id: 'exit', label: $L('Exit'), primary: true },
            ]}
            onDialog={app.onDialog}
          />
        </Show>
      </view>
      <view>
        <Show when={overlay() === 'update'}>
          <UpdateNotification ref={keep('update')} onUpdateClose={app.onUpdateClose} />
        </Show>
      </view>
      <ConnectionBanner show={shell.connection !== 'connected' && store.authenticated} />
      <view>
        <Show when={shell.timesUp}>
          <TimesUp ref={(n) => (timesUpRef = n)} onTimesUpSwitch={app.onTimesUpSwitch} />
        </Show>
      </view>
      <view>
        <Show when={shell.offline}>
          <NoConnection />
        </Show>
      </view>
      <ItemMenuHost />
      <MergedCopyPicker ref={(n) => (pickerRef = n)} />
      <Toast />
      <view>
        <Show when={overlay() === 'party'}>
          <WatchParty ref={keep('party')} />
        </Show>
      </view>
      <NotificationToast lane="streamNote" note={notes().streamNote} onNoteDone={app.onNoteDone} />
      <NotificationToast lane="remoteNote" note={notes().remoteNote} onNoteDone={app.onNoteDone} />
      <NotificationToast lane="badgeNote" note={notes().badgeNote} onNoteDone={app.onNoteDone} />
      <NotificationToast lane="chatNote" note={notes().chatNote} onNoteDone={app.onNoteDone} />
      <view>
        <Show when={shell.saver || saverBuilt()}>
          <Screensaver visible={shell.saver} />
        </Show>
      </view>
    </view>
  )
}

export default function App() {
  useFocusManager(KEY_MAP)
  return (
    <HashRouter root={Shell}>
      <Route path="*all" component={PageStack} />
    </HashRouter>
  )
}
