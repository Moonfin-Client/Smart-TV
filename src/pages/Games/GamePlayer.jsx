import $L from '../../services/i18n.js'
import { Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Dialog from '../../ui/components/Dialog.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import { fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import * as gamesApi from '../../services/gamesApi.js'
import serverLogger from '../../services/serverLogger.js'
import { giveControllerToGame, initVideo, keepScreenOn, setupVisibilityHandler } from '../../services/video.js'
import * as ejs from '../../utils/emulatorjs.js'
import { gameStateKey, loadGameStateWithMigration, loadSram, saveSram } from '../../utils/gameSaves.js'
import { KEYS, isBackKey } from '../../utils/keys.js'
import { reactive } from '../../state/reactive.js'
import { router } from '../../app/router.js'
import { decodeParam } from './gameModels.js'
import { blurGame, captureGameKeys, focusGame, mountGameLayer, revokeBlobs } from './gameHost.js'

// EmulatorJS draws into its own DOM layer (gameHost.js). While the game runs the layer sits above
// the canvas and has the keyboard. The pause menu, the emulator settings and the spinner are drawn
// on the canvas, so the layer drops under it while they're up and the paused frame shows through
// the transparent canvas. EmulatorJS's own controller screen is DOM, so the layer stays on top.
// shortcut: there's no gamepad Start and Select hold to open the menu, only the remote's Back. Add
// one once a gamepad has been tried with the app.
const EXIT_SAVE_TIMEOUT = 3000

// What the remote means on the controller screen. Left to EmulatorJS, these keys would be recorded
// as keyboard bindings.
const CONTROL_KEYS = {
  [KEYS.UP]: 'DPAD_UP',
  [KEYS.DOWN]: 'DPAD_DOWN',
  [KEYS.LEFT]: 'DPAD_LEFT',
  [KEYS.RIGHT]: 'DPAD_RIGHT',
  [KEYS.ENTER]: 'BUTTON_2',
}

const choiceIndex = (opt) => Math.max(0, opt.choices.findIndex((c) => c.value === opt.current))

const PANEL_PAD = 12
const ROW_STEP = 70.6
const LIST_STEP = 69
const LIST_MAX_H = 864
const LIST_RING = { width: 2, color: hex('#00a4dc') }

export default function GamePlayer(props) {
  const st = reactive({
    phase: 'loading',
    panel: '',
    cur: 0,
    scrollY: 0,
    message: '',
    unsupported: '',
    settings: [],
    pickerFor: -1,
    hasSave: false,
    fastForward: false,
    gameTitle: '',
    toastText: '',
  })
  const [measured, setMeasured] = createSignal(0)
  const my = { blobs: [], closed: false, exiting: false, game: null, layer: null, screenOn: false, removeVisibility: null, settingsScroll: 0, toastTimer: null }
  let root
  let dialogRef = null

  // The pause menu, or the exit confirmation in its place. Back comes first in the confirmation so
  // the highlight it opens on can't end the game.
  const menuRows = createMemo(() => {
    measured()
    const list =
      st.panel === 'confirm'
        ? [
            { id: 'cancel', label: $L('Back'), icon: 'game_arrowBack' },
            { id: 'saveExit', label: $L('Save & exit'), icon: 'game_save' },
            { id: 'exitNow', label: $L('Exit'), icon: 'game_close', danger: true },
          ]
        : [
            { id: 'resume', label: $L('Resume'), icon: 'game_play' },
            { id: 'save', label: $L('Save state'), icon: 'game_save' },
            st.hasSave ? { id: 'load', label: $L('Load state'), icon: 'game_download' } : null,
            { id: 'restart', label: $L('Restart'), icon: 'game_refresh' },
            { id: 'ff', label: $L('Fast-forward'), icon: 'game_fastForward', trailing: st.fastForward ? $L('On') : $L('Off') },
            { id: 'controls', label: $L('Controller settings'), icon: 'game_gamepad' },
            { id: 'settings', label: $L('Emulator settings'), icon: 'game_tune' },
            { id: 'exit', label: $L('Exit'), icon: 'game_close', danger: true },
          ].filter(Boolean)
    return list.map((r, i) => {
      const focused = st.cur === i
      return {
        ...r,
        y: PANEL_PAD + 97 + 4 + i * ROW_STEP,
        font: fontFor(r.label),
        trailing: r.trailing || '',
        trailingX: 504 - textWidth(r.trailing || '', 22.62),
        focused,
        ink: focused ? '#ffffff' : r.danger ? '#ff9d9d' : '#ffffff',
        trailingAlpha: focused ? 0.7 : 0.38,
      }
    })
  })
  const menuBox = () => {
    const h = PANEL_PAD * 2 + 97 + menuRows().length * ROW_STEP + 4
    return { h, y: (1080 - h) / 2 }
  }
  const menuOpen = () => st.panel === 'menu' || st.panel === 'confirm'
  const listOpen = () => st.panel === 'settings' || st.panel === 'picker'
  // Emulator settings: the label, a chevron each side of the value (dim at either end), Left and
  // Right step it, OK opens the full list. The picker lists one setting's values with a check.
  const listRows = createMemo(() => {
    measured()
    if (st.panel === 'picker') {
      const opt = st.settings[st.pickerFor]
      if (!opt) return []
      const at = choiceIndex(opt)
      return opt.choices.map((c, i) => ({
        y: i * LIST_STEP,
        label: c.label,
        font: fontFor(c.label),
        check: i === at,
        value: '',
        valueFont: uiFont(),
        labelW: i === at ? 570 : 614,
        valueX: 0,
        prevX: 0,
        prevAlpha: 0,
        nextAlpha: 0,
        focused: st.cur === i,
      }))
    }
    return st.settings.map((opt, i) => {
      const at = choiceIndex(opt)
      const value = opt.choices[at].label
      const vw = textWidth(value, 24.18) + 15.6
      return {
        y: i * LIST_STEP,
        label: opt.label,
        font: fontFor(opt.label),
        check: false,
        value,
        valueFont: fontFor(value),
        labelW: 602.8 - vw - 31.2 - 20,
        valueX: 602.8 - vw + 7.8,
        prevX: 602.8 - vw - 31.2,
        prevAlpha: at > 0 ? 0.54 : 0.12,
        nextAlpha: at < opt.choices.length - 1 ? 0.54 : 0.12,
        focused: st.cur === i,
      }
    })
  })
  const listBox = () => {
    const rows = listRows().length
    const body = st.panel === 'settings' && !rows ? 6 + 89 : 6 + rows * LIST_STEP + 4
    const h = Math.min(LIST_MAX_H, PANEL_PAD * 2 + 93 + body)
    return { h, y: (1080 - h) / 2, viewH: h - PANEL_PAD * 2 - 93 - 6 }
  }
  const listTitle = () => {
    if (st.panel === 'picker') return (st.settings[st.pickerFor] && st.settings[st.pickerFor].label) || ''
    return $L('Emulator settings')
  }
  const toastW = () => textWidth(st.toastText, 20) + 56

  const raiseLayer = (above) => my.layer && my.layer.raise(above)
  const removeLayer = () => {
    if (my.layer) my.layer.remove()
    my.layer = null
  }
  const focusRoot = () => root && root.setFocus()
  const fail = (message) => {
    // EmulatorJS leaves its own error text up, which would sit over this message.
    ejs.destroyEmulator()
    removeLayer()
    st.message = message
    st.phase = 'error'
    st.panel = ''
  }
  // Fire-and-forget save upload for paths that can't await, like leaving and backgrounding.
  const flushState = () => {
    const game = my.game
    saveSram(game.id, ejs.getSram())
    try {
      const bytes = ejs.getState()
      if (bytes && bytes.length) gamesApi.putStateBytes(gameStateKey(game.id, game.core), bytes).catch(() => {})
    } catch (e) {
      // The emulator never booted.
    }
  }
  // True only when a state reached the server. A game with nothing to save yet gives false, and a
  // failed upload throws so the caller can say so.
  const saveState = async () => {
    let bytes = null
    try {
      bytes = ejs.getState()
    } catch (e) {
      // No game loaded yet.
    }
    if (!bytes || !bytes.length) return false
    await gamesApi.putStateBytes(gameStateKey(my.game.id, my.game.core), bytes)
    st.hasSave = true
    return true
  }
  // Keep the TV screen awake while the game runs, and pause and save when the app is backgrounded,
  // since Tizen may kill it there.
  const holdScreen = () => {
    giveControllerToGame(true)
    initVideo()
      .then(() => {
        if (my.closed) return
        my.screenOn = true
        my.removeVisibility = setupVisibilityHandler(
          () => {
            ejs.setPaused(true)
            flushState()
          },
          () => {
            if (!st.panel && st.phase === 'ready') ejs.setPaused(false)
          },
        )
        return keepScreenOn(true)
      })
      .catch(() => {})
  }
  const resume = () => {
    st.panel = ''
    raiseLayer(true)
    focusRoot()
    ejs.setPaused(false)
    focusGame()
  }
  // The game pauses and gives up the keyboard while a canvas panel is up, and the layer drops under
  // the canvas so the paused frame shows behind the panel.
  const openMenu = (at) => {
    ejs.setPaused(true)
    blurGame()
    raiseLayer(false)
    st.panel = 'menu'
    st.cur = at || 0
    focusRoot()
  }

  const start = async () => {
    const lib = decodeParam(props.lib)
    let game = props.game
    try {
      if (!game) game = await gamesApi.getGame(lib, decodeParam(props.id))
    } catch (e) {
      game = null
    }
    if (my.closed) return
    if (!game) return fail($L('Game file not found.'))
    my.game = game
    // The menu heads with the game's title as the server sent it.
    st.gameTitle = game.title || ''
    my.layer = mountGameLayer()
    // Arcade cores find a game by its zip name, which EmulatorJS takes from the ROM URL, or from the
    // game name when the ROM is a Blob.
    const arcadeFileName = game.core === 'mame' || game.core === 'arcade' ? game.fileName : null
    try {
      const [rom, settingsJson, existing, dataPath, sram] = await Promise.all([
        gamesApi.getRomUrl(lib, game.id, arcadeFileName),
        gamesApi.getSettingsBlob(),
        // Read on Restart too so Load state is still offered. A failed read counts as no save
        // instead of stopping the game.
        loadGameStateWithMigration(game.id, game.core).catch(() => null),
        gamesApi.getEmulatorDataPath(),
        loadSram(game.id),
      ])
      if (my.closed) return
      if (rom.isBlob) my.blobs.push(rom.url)
      let biosUrl
      if (game.bios && game.bios.length) {
        biosUrl = await gamesApi.getBiosBlobUrl(lib, game.bios[0].id)
        if (my.closed) return
        my.blobs.push(biosUrl)
      }
      st.hasSave = existing != null
      await ejs.startEmulator({
        selector: '#game',
        core: game.core,
        gameUrl: rom.url,
        biosUrl,
        gameName: rom.isBlob && arcadeFileName ? arcadeFileName : game.title,
        settingsJson,
        stateBytes: props.fresh ? null : existing,
        dataPath,
      })
      if (my.closed) return
      // A save state already holds the battery save, so only a fresh boot takes one.
      if (sram && (props.fresh || !existing)) ejs.applySram(sram)
      st.phase = 'ready'
      resume()
      holdScreen()
    } catch (e) {
      // Backing out mid-load lands here too, and that isn't worth reporting.
      if (my.closed) return
      serverLogger.error(
        serverLogger.LOG_CATEGORIES.APP,
        '[Games] could not start game',
        { core: game.core, system: game.system, status: e.status || null, totalBytes: e.totalBytes || null, message: e.message || String(e) },
        false,
      )
      if (e.romTooLarge) fail($L('This game is too large to run on this TV.'))
      else fail(e.status === 404 ? $L('Game file not found.') : $L('Could not start this game on this device.'))
    }
  }

  const exit = async (stateSaved) => {
    if (my.exiting) return
    my.exiting = true
    const game = my.game
    const persist = async () => {
      if (!game) return
      const sram = saveSram(game.id, ejs.getSram())
      if (!stateSaved) await saveState()
      await gamesApi.putSettingsBlob(ejs.getSettingsJson())
      await sram
    }
    let timer
    const cap = new Promise((resolve) => {
      timer = setTimeout(resolve, EXIT_SAVE_TIMEOUT)
    })
    try {
      await Promise.race([persist(), cap])
    } catch (e) {
      // Leaving either way.
    }
    clearTimeout(timer)
    if (!my.closed) router.back()
  }
  const showToast = (text) => {
    st.toastText = text
    clearTimeout(my.toastTimer)
    my.toastTimer = setTimeout(() => (st.toastText = ''), 3000)
  }
  // A failed action shows its message and goes back to the game either way.
  const run = async (action, failure) => {
    try {
      await action()
    } catch (e) {
      showToast(failure)
    }
    resume()
  }
  const menuIndex = (id) => Math.max(0, menuRows().findIndex((r) => r.id === id))
  // The game stays paused behind the controller screen, like it does behind the pause menu.
  const openControls = () => {
    if (!ejs.openControls()) {
      showToast($L('Could not reach the game to open controller settings.'))
      return
    }
    st.panel = 'controls'
    raiseLayer(true)
    focusRoot()
  }
  const pressMenu = async (id) => {
    if (my.exiting) return
    if (st.panel === 'confirm') {
      if (id === 'cancel') openMenu()
      else if (id === 'exitNow') exit(false)
      else {
        // Leaves only once the state is stored, since leaving on a failed save is what the
        // confirmation is there to prevent.
        const saved = await saveState().catch(() => false)
        if (saved) exit(true)
        else showToast($L('Could not save state. Still playing.'))
      }
      return
    }
    if (id === 'resume') resume()
    else if (id === 'save') run(() => saveState(), $L('Could not save state.'))
    else if (id === 'load') {
      run(async () => {
        const bytes = await loadGameStateWithMigration(my.game.id, my.game.core)
        if (bytes) ejs.loadState(bytes)
      }, $L('Could not load state.'))
    } else if (id === 'restart') run(() => ejs.restart(), $L('Could not restart.'))
    else if (id === 'ff') {
      st.fastForward = !st.fastForward
      ejs.toggleFastForward(st.fastForward)
    } else if (id === 'controls') openControls()
    else if (id === 'settings') {
      st.settings = ejs.getOptions()
      st.panel = 'settings'
      st.scrollY = 0
      st.cur = st.settings.length ? 0 : -1
    } else if (id === 'exit') {
      // A game that never got going has nothing to lose, so it leaves without asking.
      if (st.phase !== 'ready') exit(false)
      else {
        st.panel = 'confirm'
        st.cur = 0
      }
    }
  }
  // Back returns to the pause menu. The screen's own Close goes straight back to the game.
  const closeControls = (reason) => {
    if (reason === 'back') openMenu()
    else resume()
  }
  const setChoice = (i, value) => {
    const opt = st.settings[i]
    ejs.setOption(opt.id, value)
    const next = st.settings.slice()
    next[i] = { ...opt, current: value }
    st.settings = next
  }
  // Left and right step through a setting's values and stop at either end.
  const stepSetting = (dir) => {
    const opt = st.settings[st.cur]
    if (!opt) return
    const at = choiceIndex(opt)
    const next = Math.min(opt.choices.length - 1, Math.max(0, at + dir))
    if (next !== at) setChoice(st.cur, opt.choices[next].value)
  }
  // The list scrolls only as far as it takes to show the focused row.
  const reveal = () => {
    if (st.cur < 0) return
    const top = st.cur * LIST_STEP
    const bottom = top + LIST_STEP + 4
    const view = listBox().viewH
    if (top < st.scrollY) st.scrollY = top
    else if (bottom > st.scrollY + view) st.scrollY = bottom - view
  }
  const openPicker = () => {
    st.pickerFor = st.cur
    my.settingsScroll = st.scrollY
    st.panel = 'picker'
    st.scrollY = 0
    st.cur = choiceIndex(st.settings[st.pickerFor])
    reveal()
  }
  const closePicker = () => {
    st.panel = 'settings'
    st.cur = st.pickerFor
    st.scrollY = my.settingsScroll || 0
    reveal()
  }
  const closeSettings = () => {
    st.panel = 'menu'
    st.cur = menuIndex('settings')
  }
  // Back and the controller screen's keys are taken before EmulatorJS or the canvas see them.
  const captureKey = (e) => {
    if (st.panel === 'controls') {
      const label = CONTROL_KEYS[e.keyCode]
      const back = isBackKey(e)
      if (!label && !back) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type !== 'keydown') return
      const reason = ejs.controlInput(back ? 'BACK' : label)
      if (reason) closeControls(reason)
      return
    }
    if (st.phase !== 'ready' || st.panel || !isBackKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'keydown' && !my.exiting) openMenu()
  }

  const up = () => {
    if (menuOpen()) {
      if (st.cur > 0) st.cur = st.cur - 1
    } else if (st.panel === 'settings') {
      // The close button counts as the top of the list, and Up from it wraps to the bottom.
      const last = st.settings.length - 1
      st.cur = st.cur === -1 ? last : st.cur - 1
      reveal()
    } else if (st.panel === 'picker') {
      const last = listRows().length - 1
      st.cur = st.cur > 0 ? st.cur - 1 : last
      reveal()
    }
  }
  const down = () => {
    if (menuOpen()) {
      if (st.cur < menuRows().length - 1) st.cur = st.cur + 1
    } else if (st.panel === 'settings') {
      const last = st.settings.length - 1
      if (last < 0) return
      st.cur = st.cur === last ? -1 : st.cur + 1
      if (st.cur === 0) st.scrollY = 0
      reveal()
    } else if (st.panel === 'picker') {
      const last = listRows().length - 1
      st.cur = st.cur < last ? st.cur + 1 : 0
      reveal()
    }
  }
  const enter = () => {
    if (menuOpen()) {
      const r = menuRows()[st.cur]
      if (r) pressMenu(r.id)
    } else if (st.panel === 'settings') {
      if (st.cur === -1) closeSettings()
      else openPicker()
    } else if (st.panel === 'picker') {
      const opt = st.settings[st.pickerFor]
      if (opt && opt.choices[st.cur]) setChoice(st.pickerFor, opt.choices[st.cur].value)
      closePicker()
    }
  }
  const back = () => {
    if (my.exiting) return
    if (st.phase === 'error') return router.back()
    if (st.panel === 'confirm') openMenu()
    else if (st.panel === 'picker') closePicker()
    else if (st.panel === 'settings') closeSettings()
    else if (st.panel === 'menu') resume()
    // A TV remote has no Start or Select, so Back opens the menu, even over the loading spinner.
    else openMenu()
  }

  let releaseKeys = null
  onMount(() => {
    releaseKeys = captureGameKeys(captureKey)
    fontsReady().then(() => setMeasured(measured() + 1))
    if (!ejs.isSupported()) {
      st.phase = 'unsupported'
      st.unsupported = ejs.unsupportedMessage()
      return
    }
    focusRoot()
    start()
  })
  onCleanup(() => {
    my.closed = true
    clearTimeout(my.toastTimer)
    if (releaseKeys) releaseKeys()
    if (my.removeVisibility) my.removeVisibility()
    if (my.screenOn) {
      try {
        keepScreenOn(false)
      } catch (e) {
        // The platform module never loaded.
      }
    }
    giveControllerToGame(false)
    // Best-effort save on the way out, skipped when Exit already saved.
    if (!my.exiting && my.game) {
      flushState()
      gamesApi.putSettingsBlob(ejs.getSettingsJson())
    }
    ejs.destroyEmulator()
    removeLayer()
    revokeBlobs(my.blobs)
    my.blobs = []
  })

  const handle = (fn) => () => {
    fn()
    return true
  }
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      forwardFocus={() => {
        if (!st.unsupported || !dialogRef) return false
        dialogRef.setFocus()
        return true
      }}
      onUp={handle(up)}
      onDown={handle(down)}
      onLeft={handle(() => st.panel === 'settings' && stepSetting(-1))}
      onRight={handle(() => st.panel === 'settings' && stepSetting(1))}
      onEnter={handle(enter)}
      onBack={handle(back)}
    >
      <Spinner x={928} y={508} size={64} alpha={st.phase === 'loading' ? 1 : 0} />
      <text x={384} y={540} mountY={0.5} fontFamily={fontFor(st.message)} fontSize={30} maxWidth={1152} contain="width" textAlign="center" color="#ffffff">
        {st.message}
      </text>

      <view width={1920} height={1080} alpha={menuOpen() ? 1 : 0}>
        <view width={1920} height={1080} color="#0000008c" />
        <view x={680} y={menuBox().y} width={560} height={menuBox().h} borderRadius={18} color="#141a22f5">
          <text x={28} y={26.5} fontFamily={fontFor(st.gameTitle, 'bold')} fontSize={30} lineHeight={33} maxWidth={504} maxLines={1} color="#ffffff">
            {st.gameTitle}
          </text>
          <text x={28} y={61} fontFamily={uiFont()} fontSize={22.5} lineHeight={33} color="#ffffff8a">
            {$L('Paused')}
          </text>
          <view x={12} y={108} width={536} height={1} color="#ffffff1f" />
          <view>
            <Index each={menuRows()}>
              {(r) => (
                <view x={18} y={r().y} width={524} height={66.6}>
                  <view width={524} height={66.6} borderRadius={12} color="#00a4dc" alpha={r().focused ? 1 : 0} />
                  <view x={20} y={16} width={34.6} height={34.6} src={`icons/${r().icon}.webp`} color={r().ink} />
                  <text x={75.4} y={19.5} fontFamily={r().font} fontSize={26} lineHeight={33} maxWidth={400} maxLines={1} color={r().ink}>
                    {r().label}
                  </text>
                  <text x={r().trailingX} y={19.5} fontFamily={uiFont()} fontSize={22.62} lineHeight={33} color={r().ink} alpha={r().trailingAlpha}>
                    {r().trailing}
                  </text>
                </view>
              )}
            </Index>
          </view>
        </view>
      </view>

      <view width={1920} height={1080} alpha={listOpen() ? 1 : 0}>
        <view width={1920} height={1080} color="#0000008c" />
        <view x={615} y={listBox().y} width={690} height={listBox().h} borderRadius={18} color="#141a22f5">
          <view
            x={st.panel === 'picker' ? 16 : 594}
            y={16}
            width={80}
            height={80}
            borderRadius={18}
            color="#00a4dc"
            alpha={st.panel === 'settings' && st.cur === -1 ? 1 : 0}
          />
          <view
            x={st.panel === 'picker' ? 36 : 614}
            y={36}
            width={40}
            height={40}
            src={st.panel === 'picker' ? 'icons/game_arrowBack.webp' : 'icons/game_close.webp'}
            color={st.panel === 'picker' || st.cur === -1 ? '#ffffff' : '#ffffff8a'}
          />
          <text
            x={st.panel === 'picker' ? 108 : 28}
            y={42}
            fontFamily={fontFor(listTitle(), 'bold')}
            fontSize={30}
            lineHeight={33}
            maxWidth={554}
            maxLines={1}
            color="#ffffff"
          >
            {listTitle()}
          </text>
          <view x={12} y={104} width={666} height={1} color="#ffffff1f" />
          <view x={12} y={111} width={666} height={Math.max(0, listBox().viewH)} clipping>
            <view width={666} height={Math.max(listBox().viewH, listRows().length * LIST_STEP + 8)} y={-st.scrollY} transition={{ y: { duration: 150 } }}>
              <Index each={listRows()}>
                {(r) => (
                  <view x={6} y={r().y + 4} width={654} height={65}>
                    <view width={654} height={65} borderRadius={12} color="#00a4dc33" border={LIST_RING} alpha={r().focused ? 1 : 0} />
                    <text x={20} y={18.5} fontFamily={r().font} fontSize={26} lineHeight={33} maxWidth={r().labelW} maxLines={1} color="#ffffff">
                      {r().label}
                    </text>
                    <view x={r().prevX} y={16.9} width={31.2} height={31.2} src="icons/game_chevronLeft.webp" alpha={r().prevAlpha} />
                    <text x={r().valueX} y={18.2} fontFamily={r().valueFont} fontSize={24.18} lineHeight={33} color="#ffffff">
                      {r().value}
                    </text>
                    <view x={602.8} y={16.9} width={31.2} height={31.2} src="icons/game_chevronRight.webp" alpha={r().nextAlpha} />
                    <view x={602.8} y={16.9} width={31.2} height={31.2} src="icons/game_check.webp" color="#00a4dc" alpha={r().check ? 1 : 0} />
                  </view>
                )}
              </Index>
            </view>
          </view>
          <text x={345} y={141} mountX={0.5} fontFamily={uiFont()} fontSize={24} color="#8b95a3" alpha={st.panel === 'settings' && !st.settings.length ? 1 : 0}>
            {$L('This core has no adjustable options.')}
          </text>
        </view>
      </view>

      <view x={960 - toastW() / 2} y={959} width={toastW()} height={61} borderRadius={12} color="#1e1e28e6" alpha={st.toastText ? 1 : 0}>
        <text x={28} y={16} fontFamily={uiFont()} fontSize={20} lineHeight={33} color="#ffffff">
          {st.toastText}
        </text>
      </view>
      <view>
        <Show when={st.unsupported}>
          <Dialog
            ref={(n) => {
              // It opens as the page does, so it takes focus as it mounts.
              dialogRef = n
              n.setFocus()
            }}
            variant="message"
            title={$L('Games')}
            message={st.unsupported}
            buttons={[{ id: 'ok', label: $L('OK'), primary: true }]}
            onDialog={() => router.back()}
          />
        </Show>
      </view>
    </view>
  )
}
