import $L from '../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import Dialog from '../../ui/components/Dialog.jsx'
import GameCard from '../../ui/components/games/GameCard.jsx'
import CorePicker from '../../ui/components/games/CorePicker.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { lineCount } from '../../ui/components/games/wrap.js'
import { cssShift, fontFor, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { shadowColor } from '../../ui/theme.js'
import * as gamesApi from '../../services/gamesApi.js'
import { isSupported, needsThreads, unsupportedMessage } from '../../utils/emulatorjs.js'
import { gameHeadline } from '../../utils/gameArt.js'
import { loadGameStateWithMigration } from '../../utils/gameSaves.js'
import { formatBytes } from '../../utils/seerrStatus.js'
import { audio, stop as stopMusic } from '../../state/audioPlayer.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { coreChoices, coreLabel } from './coreChoices.js'
import { decodeParam, gamePath, playPath, playersLabel, relatedCard } from './gameModels.js'
import { placeButtons } from './placeButtons.js'

const ROW_W = 820
const POSTER_H = 132
const POSTER_MAX_W = 300
const POSTER_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 12, blur: 32, spread: 0 }
const BUTTON_SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 18, blur: 18, spread: 0 }
const SAVE_RING = { width: 2, color: hex('#ffffff8c') }
const COVER = { resizeMode: { type: 'cover' } }

const metaLine = (game) => [game.year, game.genre, playersLabel(game.players)].filter(Boolean).join('  ·  ')

// The metadata the hero doesn't already show.
const facts = (game) =>
  [
    [$L('Developer'), game.developer],
    [$L('Publisher'), game.publisher],
    [$L('Franchise'), game.franchise],
    [$L('Region'), game.region],
    [$L('Rating'), game.rating ? `${Number(game.rating).toFixed(1)} / 5` : null],
    [$L('Size'), game.sizeBytes > 0 ? formatBytes(game.sizeBytes) : null],
  ].filter((f) => f[1])

const primaryAction = (save) => {
  if (save === 'checking') return { icon: 'game_hourglassTop', label: $L('Checking for save…') }
  if (save === 'failed') return { icon: 'game_refresh', label: $L('Retry save check') }
  return { icon: 'game_play', label: save === 'available' ? $L('Continue') : $L('Play') }
}

export default function GameDetails(props) {
  const st = reactive({
    current: null,
    loading: true,
    saveState: 'checking',
    related: [],
    zone: 'actions',
    cur: 0,
    rcur: 0,
    scrollY: 0,
    rowX: 0,
    picker: false,
    unsupported: '',
    pageFocused: false,
    posterW: 1,
    posterShown: true,
    toastText: '',
  })
  const [measured, setMeasured] = createSignal(0)
  const my = { lib: decodeParam(props.lib), check: 0, played: false, toastTimer: null }
  let root
  let pickerRef = null
  let dialogRef = null
  const active = () => !props.page || props.page.active()
  onCleanup(() => clearTimeout(my.toastTimer))

  // Laid out again once the real widths are in, and when the theme or its face changes.
  const info = createMemo(() => {
    measured()
    getStore().settingsVersion
    const g = st.current || {}
    const title = gameHeadline(g.title, g.fileName)
    const meta = metaLine(g).replace(/\s+/g, ' ')
    // The renderer would keep a description's line breaks and runs of spaces, so they fold to one.
    const overview = (g.overview || '').replace(/\s+/g, ' ').trim()
    const kicker = (g.system || '').toUpperCase()
    return {
      kicker,
      title,
      titleLines: Math.max(1, lineCount(title, 72, 'bold', ROW_W, textWidth)),
      meta,
      overview,
      overviewLines: Math.min(3, lineCount(overview, 24, 'regular', ROW_W, textWidth)),
      poster: g.id ? gamesApi.gameThumbUrl(my.lib, g.id) : '',
      snap: g.id ? gamesApi.gameThumbUrl(my.lib, g.id, 'snap') : '',
      facts: g.id ? facts(g) : [],
    }
  })
  const choices = createMemo(() => coreChoices(st.current))
  const buttons = createMemo(() => {
    measured()
    getStore().settingsVersion
    const g = st.current
    if (!g) return []
    const s = st.saveState
    const list = [{ id: 'play', kind: 'primary', ...primaryAction(s), disabled: s === 'checking' }]
    if (s === 'available') list.push({ id: 'fresh', kind: 'neutral', icon: 'game_refresh', label: $L('Start fresh') })
    if (choices().length > 1) list.push({ id: 'core', kind: 'core', icon: 'game_memory', label: coreLabel(g.core) })
    // Each label sits in a 66px line under 3px of padding.
    const labelY = 3 + cssShift(39, uiFont('bold'))
    return placeButtons(list, textWidth).map((b, i) => {
      const focused = st.pageFocused && st.zone === 'actions' && st.cur === i && !st.picker && !st.unsupported
      const fill = focused ? '#e6e6e6' : b.kind === 'primary' ? '#00a4dc' : b.kind === 'core' ? '#2e74e0' : '#7d848c'
      return { ...b, focused, fill, labelY, ink: focused ? '#4c5059' : '#e6e6e6', fillAlpha: b.disabled ? 0.585 : 1, inkAlpha: b.disabled ? 0.4 : 1 }
    })
  })
  const btns = keyed(buttons, (b) => b.id)
  const saveText = () => {
    if (st.saveState === 'available') return $L('Save found. Continue picks up from it.')
    return st.saveState === 'absent' ? $L('No save on this server yet') : ''
  }
  const pos = createMemo(() => {
    const i = info()
    const title = 249
    const meta = title + i.titleLines * 77.76 + 12
    let y = meta + 33 + 18
    const overview = y
    if (i.overview) y += i.overviewLines * 36 + 20
    const actions = y
    y += 78
    const save = y + 14
    if (saveText()) y = save + 33
    const factsY = y + 22
    let fx = 0
    let row = 0
    const placedFacts = i.facts.map(([label, value]) => {
      const w = Math.max(textWidth(label, 19), textWidth(String(value), 25))
      // Each fact's 48px right margin counts toward the line it has to fit on.
      if (fx && fx + w + 48 > ROW_W) {
        fx = 0
        row++
      }
      const at = { label, value: String(value), x: 96 + fx, y: factsY + row * 82 }
      fx += w + 48
      return at
    })
    if (placedFacts.length) y = factsY + (row + 1) * 82
    const related = y + 8
    return { title, meta, overview, actions, save, facts: placedFacts, related }
  })
  const relatedPlaced = createMemo(() => {
    let x = 108
    return st.related.map((c, i) => {
      const at = x
      x += c.w + 24
      return { ...c, x: at, i }
    })
  })
  const rowW = () => {
    const list = relatedPlaced()
    const last = list[list.length - 1]
    return last ? last.x + last.w + 24 : 1920
  }
  const rowH = () => relatedPlaced().reduce((h, c) => Math.max(h, c.h), 0)
  const contentH = () => Math.max(1080, pos().related + 53 + rowH() + 40)

  const focusZone = () => {
    if (st.zone === 'related' && !st.related.length) st.zone = 'actions'
    if (st.current && root && active()) root.setFocus()
  }
  const checkSave = (g) => {
    const check = ++my.check
    st.saveState = 'checking'
    loadGameStateWithMigration(g.id, g.core)
      .then((bytes) => {
        if (check === my.check) st.saveState = bytes ? 'available' : 'absent'
      })
      .catch(() => {
        if (check === my.check) st.saveState = 'failed'
      })
      .then(() => {
        if (check !== my.check) return
        st.zone = 'actions'
        st.cur = 0
        focusZone()
      })
  }
  const load = async () => {
    const id = decodeParam(props.id)
    if (props.game) {
      st.current = props.game
      st.loading = false
    }
    let full = null
    try {
      ;[full] = await Promise.all([gamesApi.getGame(my.lib, id), fontsReady()])
    } catch (e) {
      full = null
    }
    setMeasured(measured() + 1)
    st.loading = false
    if (full) st.current = full
    if (!st.current) return
    // The summary still has the id and core the save key needs.
    checkSave(st.current)
    focusZone()
    if (!full) return
    const g = full
    Promise.all([gamesApi.getGames(my.lib, g.system), gamesApi.getBoxArtAspects(my.lib, g.system).catch(() => null)])
      .then(([all, aspects]) => {
        const others = (all || []).filter((x) => x.id !== g.id).slice(0, 20)
        st.related = others.map((x) => relatedCard(my.lib, x, aspects ? aspects.get(x.id) : null, undefined, 1))
      })
      .catch(() => {})
  }

  // The page scrolls only as far as it takes to show the focused card whole.
  const revealRelated = () => {
    const c = relatedPlaced()[st.rcur]
    if (!c) return
    const bottom = pos().related + 53 + c.h
    if (bottom - st.scrollY > 1080) st.scrollY = bottom - 1080
    const right = 96 + c.x + c.w + 12
    const left = 96 + c.x - 12
    if (right - st.rowX > 1920) st.rowX = right - 1920
    else if (left - st.rowX < 96) st.rowX = Math.max(0, left - 96)
  }
  const showToast = (text) => {
    st.toastText = text
    clearTimeout(my.toastTimer)
    my.toastTimer = setTimeout(() => (st.toastText = ''), 3000)
  }
  const play = (fresh) => {
    const g = st.current
    if (st.saveState !== 'absent' && st.saveState !== 'available') return
    if (!isSupported()) st.unsupported = unsupportedMessage()
    else if (needsThreads(g.core)) {
      st.unsupported = $L("PSP games can't run on this TV. The PSP emulator needs multithreading, which isn't available here.")
    } else {
      if (audio.active) stopMusic()
      my.played = true
      router.to(playPath(my.lib, g.id), { game: g, fresh: !!fresh })
      return
    }
    if (dialogRef) dialogRef.setFocus()
  }
  const press = (id) => {
    if (id === 'play' && st.saveState === 'failed') checkSave(st.current)
    else if (id === 'play') play(false)
    else if (id === 'fresh') play(true)
    else if (id === 'core') {
      st.picker = true
      if (pickerRef) pickerRef.setFocus()
    }
  }
  const onDismiss = () => {
    st.unsupported = ''
    st.zone = 'actions'
    st.cur = 0
    focusZone()
  }
  const onPickerClose = () => {
    st.picker = false
    st.cur = buttons().findIndex((b) => b.id === 'core')
    focusZone()
  }
  // The save key includes the core, so the save is checked again for the one picked.
  const onPick = (core) => {
    st.picker = false
    focusZone()
    const gameId = st.current.id
    gamesApi
      .setGameCoreOverride(my.lib, gameId, core)
      .then((updated) => {
        if (!updated || !st.current || updated.id !== st.current.id) return
        st.current = updated
        checkSave(updated)
      })
      .catch(() => {
        showToast($L('Could not change the core.'))
        st.cur = buttons().findIndex((b) => b.id === 'core')
      })
  }

  const handle = (fn) => () => {
    fn()
    return true
  }
  const left = () => {
    if (st.zone === 'actions' && st.cur > 0) st.cur = st.cur - 1
    else if (st.zone === 'related' && st.rcur > 0) {
      st.rcur = st.rcur - 1
      revealRelated()
    }
  }
  const right = () => {
    if (st.zone === 'actions' && st.cur < buttons().length - 1) st.cur = st.cur + 1
    else if (st.zone === 'related' && st.rcur < st.related.length - 1) {
      st.rcur = st.rcur + 1
      revealRelated()
    }
  }
  // Down lands on the visible card nearest the focused button.
  const down = () => {
    if (st.zone !== 'actions' || !st.related.length) return
    const b = buttons()[st.cur]
    const mid = b ? 96 + b.x + b.w / 2 : 0
    const placed = relatedPlaced()
    let best = 0
    placed.forEach((c, i) => {
      const cx = 96 + c.x + c.w / 2 - st.rowX
      const bx = 96 + placed[best].x + placed[best].w / 2 - st.rowX
      if (cx <= 1920 && Math.abs(cx - mid) < Math.abs(bx - mid)) best = i
    })
    st.rcur = best
    st.zone = 'related'
    revealRelated()
  }
  const enter = () => {
    if (st.zone === 'actions') {
      const b = buttons()[st.cur]
      if (b && !b.disabled) press(b.id)
    } else {
      const c = st.related[st.rcur]
      if (c) router.to(gamePath(my.lib, c.raw.id), { game: c.raw })
    }
  }

  onMount(() => {
    load()
    if (root && active()) root.setFocus()
  })
  // Back from the player, where the game may have saved.
  createEffect(
    on(
      active,
      (on) => {
        if (!on || !my.played || !st.current) return
        my.played = false
        checkSave(st.current)
      },
      { defer: true },
    ),
  )

  const relatedFocus = (i) => st.pageFocused && st.zone === 'related' && i === st.rcur
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#0b0f14"
      forwardFocus={() => {
        if (st.unsupported && dialogRef) {
          dialogRef.setFocus()
          return true
        }
        if (st.picker && pickerRef) {
          pickerRef.setFocus()
          return true
        }
        return false
      }}
      onFocusChanged={(has) => (st.pageFocused = has)}
      onLeft={handle(left)}
      onRight={handle(right)}
      onUp={handle(() => st.zone === 'related' && (st.zone = 'actions'))}
      onDown={handle(down)}
      onEnter={handle(enter)}
      onBack={handle(() => router.back())}
    >
      <view width={1920} height={contentH()} y={-st.scrollY} transition={{ y: { duration: 200, easing: 'ease-out' } }} alpha={st.current ? 1 : 0}>
        <view x={686} width={1234} height={1080} src={info().snap} textureOptions={COVER} />
        <view width={1920} height={1080} src="images/game_details_scrim.webp" />
        <view
          x={96}
          y={56}
          width={st.posterW}
          height={POSTER_H}
          borderRadius={12}
          color="#00000000"
          shadow={POSTER_SHADOW}
          alpha={st.posterW > 1 && st.posterShown ? 1 : 0}
        />
        <view
          x={96}
          y={56}
          width={st.posterW}
          height={POSTER_H}
          borderRadius={12}
          src={info().poster}
          alpha={st.posterShown ? 1 : 0}
          onEvent={{
            loaded: (n, e) => {
              const d = e && e.dimensions
              if (d && d.w && d.h) st.posterW = Math.min(POSTER_MAX_W, (d.w / d.h) * POSTER_H)
            },
            failed: () => (st.posterShown = false),
          }}
        />
        <text x={96} y={209} fontFamily={fontFor(info().kicker, 'bold')} fontSize={20} lineHeight={33} letterSpacing={2.8} color="#00a4dc">
          {info().kicker}
        </text>
        <text x={96} y={pos().title + 4} fontFamily={fontFor(info().title, 'bold')} fontSize={72} lineHeight={77.76} maxWidth={ROW_W} color="#ffffff">
          {info().title}
        </text>
        <text x={96} y={pos().meta + 1.5} fontFamily={fontFor(info().meta)} fontSize={26} lineHeight={33} maxWidth={ROW_W} maxLines={1} color="#cfd6e0">
          {info().meta}
        </text>
        <text x={96} y={pos().overview + 1.5} fontFamily={fontFor(info().overview)} fontSize={24} lineHeight={36} maxWidth={ROW_W} maxLines={3} color="#cfd6e0">
          {info().overview}
        </text>

        <view>
          <For each={btns.keys()}>
            {(k) => {
              const b = btns.item(k)
              return (
                <view x={96 + b().x} y={pos().actions + 3} width={b().w} height={72}>
                  <view width={b().w} height={72} pivot={0.5} scale={b().focused ? 1.05 : 1} transition={{ scale: { duration: 200, easing: 'ease-out' } }}>
                    <view width={b().w} height={72} borderRadius={6} color="#00000000" shadow={BUTTON_SHADOW} alpha={b().focused ? 1 : 0} />
                    <view width={b().w} height={72} borderRadius={6} color={b().fill} alpha={b().fillAlpha} />
                  </view>
                  <view x={b().iconX} y={11.6} width={48.75} height={48.75} src={`icons/${b().icon}.webp`} color={b().ink} alpha={b().inkAlpha} />
                  <text
                    fontFamily={uiFont('bold')}
                    x={b().labelX}
                    y={b().labelY}
                    fontSize={39}
                    lineHeight={66}
                    maxWidth={b().room}
                    maxLines={1}
                    color={b().ink}
                    alpha={b().inkAlpha}
                  >
                    {b().label}
                  </text>
                </view>
              )
            }}
          </For>
        </view>

        <view x={96} y={pos().save} alpha={saveText() ? 1 : 0}>
          <view y={10.5} width={12} height={12} borderRadius={6} color="#7fe0b0" alpha={st.saveState === 'available' ? 1 : 0} />
          <view y={10.5} width={12} height={12} borderRadius={6} color="#00000000" border={SAVE_RING} alpha={st.saveState === 'absent' ? 1 : 0} />
          <text x={24} y={1.5} fontFamily={uiFont()} fontSize={22} lineHeight={33} color="#cfd6e0">
            {saveText()}
          </text>
        </view>

        <view>
          <For each={pos().facts}>
            {(f) => (
              <view x={f.x} y={f.y}>
                <text y={1} fontFamily={uiFont()} fontSize={19} lineHeight={33} color="#9aa4b2">
                  {f.label}
                </text>
                <text y={38.5} fontFamily={fontFor(f.value)} fontSize={25} lineHeight={33} color="#ffffff">
                  {f.value}
                </text>
              </view>
            )}
          </For>
        </view>

        <view y={pos().related} width={1920} height={53 + rowH()} alpha={st.related.length ? 1 : 0}>
          <text x={96} y={1.5} fontFamily={uiFont('medium')} fontSize={26} lineHeight={33} color="#ffffff">
            {$L('More in {system}').replace('{system}', (st.current && st.current.system) || '')}
          </text>
          <view y={53} width={rowW()} height={rowH()} x={-st.rowX} transition={{ x: { duration: 200, easing: 'ease-out' } }}>
            <For each={relatedPlaced()}>{(c) => <GameCard x={c.x} card={c} focused={relatedFocus(c.i)} />}</For>
          </view>
        </view>
      </view>

      <Spinner x={928} y={508} size={64} alpha={st.loading ? 1 : 0} />
      <text x={960} y={540} mountX={0.5} mountY={0.5} fontFamily={uiFont()} fontSize={28} color="#cfd6e0" alpha={!st.current && !st.loading ? 1 : 0}>
        {$L('Game not found.')}
      </text>

      <view>
        <Show when={st.picker}>
          <CorePicker
            ref={(n) => (pickerRef = n)}
            choices={choices()}
            current={st.current ? st.current.core : ''}
            onPick={onPick}
            onPickerClose={onPickerClose}
          />
        </Show>
      </view>
      <view x={960 - (textWidth(st.toastText, 20) + 56) / 2} y={959} width={textWidth(st.toastText, 20) + 56} height={61} borderRadius={12} color="#1e1e28e6" alpha={st.toastText ? 1 : 0}>
        <text x={28} y={16} fontFamily={uiFont()} fontSize={20} lineHeight={33} color="#ffffff">
          {st.toastText}
        </text>
      </view>
      <view>
        <Show when={st.unsupported}>
          <Dialog
            ref={(n) => (dialogRef = n)}
            variant="message"
            title={$L('Games')}
            message={st.unsupported}
            buttons={[{ id: 'ok', label: $L('OK'), primary: true }]}
            onDialog={onDismiss}
          />
        </Show>
      </view>
    </view>
  )
}
