import $L from '../../services/i18n.js'
import { For, createEffect, createMemo, createSelector, on, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import GameSystemCard from '../../ui/components/games/GameSystemCard.jsx'
import { fontFor } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import * as gamesApi from '../../services/gamesApi.js'
import { refreshGameLibraries, resolveGameLibraryId } from '../../utils/gameLibrary.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { fontsReady } from '../../ui/components/library/measure.js'
import { appBackground, decodeParam, goHome, systemPath, systemTile } from './gameModels.js'

const PREVIEWS_PER_SYSTEM = 4
const COLS = 4
const CELL_W = 451.5
const CELL_H = 209
const VIEW_H = 966

// A game names its system in whatever case the folder used.
const systemKey = (id) => (id || '').toLowerCase()

export default function Games(props) {
  const store = getStore()
  const st = reactive({ title: '', systems: [], cur: 0, zone: 'grid', scrollY: 0, loading: true, message: '', focused: false })
  const my = { lib: '', navId: '' }
  let root
  const active = () => !props.page || props.page.active()
  const bg = () => appBackground(theme().background)
  // Laid out again when the theme or its face changes, since a name may wrap differently.
  const tiles = createMemo(() => {
    store.settingsVersion
    return st.systems.map((s) => systemTile(my.lib, s.system, s.previews, s.count))
  })
  const placed = () => tiles().map((t, i) => ({ ...t, x: 70 + (i % COLS) * CELL_W, y: 13 + Math.floor(i / COLS) * CELL_H }))
  const isCur = createSelector(() => (st.focused && st.zone === 'grid' ? st.cur : -1))
  const backOn = () => st.focused && st.zone === 'back'

  const load = async () => {
    const routeId = decodeParam(props.id)
    // The plugin answers to its own library id, which isn't always the user view's.
    await refreshGameLibraries()
    const libs = store.libraries || []
    const view = libs.find((l) => l.Id === routeId) || libs.find((l) => resolveGameLibraryId(l) === routeId)
    const lib = view ? resolveGameLibraryId(view) : routeId
    my.lib = lib
    if (view) {
      my.navId = view.Id
      store.navSection = view.Id
    }
    st.title = (view && view.Name) || $L('Games')

    // The covers are worth having but not worth an error screen, and a system counts what the
    // server said it held until they arrive.
    const [systems, games] = await Promise.all([
      gamesApi.getSystems(lib).catch((e) => ({ error: e })),
      gamesApi.getGames(lib).catch(() => null),
      fontsReady(),
    ])
    st.loading = false
    if (systems && systems.error) {
      const e = systems.error
      // A 404 means the server has no Moonfin plugin, which is worth saying plainly.
      st.message = e.status === 404 ? $L('This server does not have the Moonfin plugin installed.') : e.message || $L('Failed to load games')
      return
    }
    let counts = {}
    ;(systems || []).forEach((s) => {
      if (s.gameCount > 0) counts[systemKey(s.id)] = s.gameCount
    })
    const previews = {}
    if (Array.isArray(games)) {
      counts = {}
      games.forEach((g) => {
        const k = systemKey(g.system)
        counts[k] = (counts[k] || 0) + 1
        if (!previews[k]) previews[k] = []
        if (previews[k].length < PREVIEWS_PER_SYSTEM) previews[k].push(g)
      })
    }
    // A system the server sent no games for has nothing to show.
    const visible = (systems || []).filter((s) => counts[systemKey(s.id)] > 0)
    if (!visible.length) {
      st.message = $L('No games found.')
      return
    }
    st.systems = visible.map((s) => ({ system: s, previews: previews[systemKey(s.id)] || [], count: counts[systemKey(s.id)] }))
  }

  const move = (to) => {
    if (to < 0 || to >= tiles().length || to === st.cur) return
    st.cur = to
    // The scroller brings a tile that left the view back into it, no further.
    const top = Math.floor(to / COLS) * CELL_H
    if (top < st.scrollY) st.scrollY = top
    else if (top + CELL_H > st.scrollY + VIEW_H) st.scrollY = top + CELL_H - VIEW_H
  }
  // The Magic Remote's cursor (app/pointer.js): Back and a system in full view take focus on hover; one
  // the grid would scroll to takes it on a click.
  const pointTile = (i, click) => {
    const top = Math.floor(i / COLS) * CELL_H
    const whole = top >= st.scrollY && top + CELL_H <= st.scrollY + VIEW_H
    if (!click && (!whole || (st.zone === 'grid' && st.cur === i))) return false
    st.zone = 'grid'
    move(i)
    return click
  }
  const handle = (fn) => () => {
    fn()
    return true
  }
  const up = () => {
    if (st.zone !== 'grid') return
    if (st.cur < COLS) st.zone = 'back'
    else move(st.cur - COLS)
  }
  const down = () => {
    if (st.zone === 'back') {
      if (tiles().length) st.zone = 'grid'
      return
    }
    if (Math.floor(st.cur / COLS) < Math.floor((tiles().length - 1) / COLS)) move(Math.min(st.cur + COLS, tiles().length - 1))
  }
  const right = () => {
    if (st.zone !== 'grid' || st.cur % COLS === COLS - 1) return
    if (st.cur + 1 < tiles().length) move(st.cur + 1)
    // Right from the end of a short last row climbs to the tile above and to the right.
    else if (st.cur >= COLS) move(st.cur - COLS + 1)
  }
  const enter = () => {
    if (st.zone === 'back') return goHome()
    const t = tiles()[st.cur]
    if (t) router.to(systemPath(my.lib, t.raw.id), { systemName: t.name })
  }

  onMount(() => {
    load()
    // A lazy page isn't there when the stack focuses its root, so it takes focus itself.
    if (root && active()) root.setFocus()
  })
  createEffect(on(active, (on) => on && my.navId && (store.navSection = my.navId), { defer: true }))

  const rows = () => Math.ceil(tiles().length / COLS)
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color={bg()}
      onFocusChanged={(has) => (st.focused = has)}
      onUp={handle(up)}
      onDown={handle(down)}
      onLeft={handle(() => st.zone === 'grid' && st.cur % COLS > 0 && move(st.cur - 1))}
      onRight={handle(right)}
      onEnter={handle(enter)}
      onBack={handle(goHome)}
    >
      <view alpha={!st.loading && !st.message ? 1 : 0}>
        <view x={70} y={29} width={44} height={44} borderRadius={9} color="#ffffff" alpha={backOn() ? 1 : 0} />
        <view x={77.5} y={36.5} width={29} height={29} src="icons/game_back.webp" color={backOn() ? '#101010' : '#ffffff80'} />
        <view x={70} y={29} width={44} height={44} onPointerOver={() => st.zone !== 'back' && (st.zone = 'back')} />
        <text x={134} y={36.5} fontFamily={fontFor(st.title)} fontSize={32} lineHeight={33} color="#ffffff">
          {st.title}
        </text>
        <view y={85} width={1920} height={VIEW_H} clipping>
          <view width={1920} height={13 + rows() * CELL_H} y={-st.scrollY} transition={{ y: { duration: 250, easing: 'ease-out' } }}>
            <For each={placed()}>
              {(t, i) => (
                <GameSystemCard
                  x={t.x}
                  y={t.y}
                  tile={t}
                  focused={isCur(i())}
                  onPointerOver={() => pointTile(i(), false)}
                  onPointerClick={() => pointTile(i(), true)}
                />
              )}
            </For>
          </view>
        </view>
      </view>
      <Spinner x={928} y={508} size={64} alpha={st.loading ? 1 : 0} />
      <text
        x={384}
        y={540}
        mountY={0.5}
        fontFamily={fontFor(st.message)}
        fontSize={28}
        maxWidth={1152}
        contain="width"
        textAlign="center"
        color="#cfd6e0"
      >
        {st.message}
      </text>
    </view>
  )
}
