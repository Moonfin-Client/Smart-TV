import { For, Show, createEffect, createMemo, createSignal, on, untrack } from 'solid-js'
import { keyed } from '../library/pageKit.js'
import SettingsRow from './SettingsRow.jsx'
import SettingsBlock from './SettingsBlock.jsx'
import { BAR } from './look.js'
import { COLUMN_W } from './layoutRows.js'
import { rowFont } from './rowFont.js'
import { settingsFaces } from './faces.js'
import { stopsOf, nextStop } from './focusStops.js'
import { fx, EASE_OUT } from './fx.js'

// One settings screen: the title that stays put, then the list, which scrolls so the focused row
// sits 90% of the way down. [rows] and [height] come from layoutRows. Focus moves between the stops
// the rows offer by where they sit, and the holder hears onListFocus(sid, stop), onListEnter(sid,
// stop), onListSide(sid, dir, stop) (true when it took the key), onListEdge(dir) and
// onListAction(). Back goes on to the holder.
// The column's corners are rounded by each fill here, since a clip can't be. [corners] overrides
// them as [topLeft, topRight, bottomRight, bottomLeft] (the Friends drawer rounds only its left side).
const VIEW_TOP = BAR.h
const FOLLOW = 0.9
const MARGIN = 420
const R = 33.39
const ACTION = 'settings-title-action'

export default function SettingsList(props) {
  const [sid, setSid] = createSignal('')
  const [scroll, setScroll] = createSignal(0)
  const [active, setActive] = createSignal(false)
  let at = 0
  const p = () => props.p
  const corners = () => props.corners || [R, R, R, R]
  const viewH = () => props.viewH || 883
  const top = () => (props.title === null ? 0 : VIEW_TOP)
  const view = () => viewH() - top()
  const rows = () => props.rows || []
  const stops = createMemo(() => stopsOf(rows()))
  const trackH = () => Math.max(view(), props.height || 0)
  const shown = createMemo(() => {
    const lo = scroll() - MARGIN
    const hi = scroll() + view() + MARGIN
    return rows().filter((r) => r.y + (r.h || 0) >= lo && r.y <= hi)
  })
  const cards = keyed(() => shown().filter((r) => r.type === 'card'), (r) => r.rk)
  const blocks = keyed(() => shown().filter((r) => r.type === 'block'), (r) => r.k)
  const sections = keyed(() => shown().filter((r) => r.type === 'section' && r.text), (r) => r.k)
  const dividers = keyed(() => shown().filter((r) => r.type === 'divider'), (r) => r.k)
  const texts = keyed(() => shown().filter((r) => r.type === 'text'), (r) => r.k)
  const lit = () => (active() ? sid() : '')
  const faces = createMemo(() => settingsFaces(props.clean))
  const titleX = () => (props.root ? BAR.titleRootX : BAR.titleX)

  const stopBySid = (s) => stops().find((x) => x.sid === s) || null
  // `still` (the Magic Remote's cursor) scrolls only as far as shows all of the stop, so the list
  // doesn't move from under the cursor.
  const follow = (still) => {
    const stop = stopBySid(sid())
    if (!stop) return
    const at = scroll()
    const wanted = still ? Math.min(stop.y, Math.max(at, stop.y + stop.h - view())) : stop.y - FOLLOW * (view() - stop.h)
    setScroll(Math.max(0, Math.min(Math.max(0, (props.height || 0) - view()), wanted)))
  }
  // Puts focus on [s], scrolls to it and tells the holder.
  const focusSid = (s, quiet, still) => {
    const stop = stopBySid(s)
    if (!stop) return false
    setSid(s)
    at = stops().indexOf(stop)
    follow(still)
    if ((!quiet || active()) && props.onListFocus) props.onListFocus(s, stop)
    return true
  }
  const focusFirst = (quiet) => {
    const first = stops()[0]
    if (first) focusSid(first.sid, quiet)
    else {
      // A screen with nothing to focus yet opens at its top.
      setSid('')
      setScroll(0)
    }
  }
  const move = (dir) => {
    const from = stopBySid(sid())
    // A screen that filled in after it opened has nothing focused, and the first press lands on its first row.
    if (!from && stops().length) {
      focusFirst()
      return true
    }
    const next = nextStop(stops(), from, dir)
    if (next) {
      focusSid(next.sid)
      return true
    }
    return false
  }

  // A row that went away hands the focus to the nearest one left.
  createEffect(
    on(
      stops,
      (list) => {
        untrack(() => {
          const s = sid()
          if (s && s !== ACTION && !stopBySid(s)) {
            if (list.length) focusSid(list[Math.min(at || 0, list.length - 1)].sid, true)
            else setSid('')
          } else if (active()) follow()
        })
      },
      { defer: true },
    ),
  )

  const edge = (dir) => props.onListEdge && props.onListEdge(dir)
  return (
    <view
      ref={(n) => {
        n.stopBySid = stopBySid
        n.focusSid = focusSid
        n.focusFirst = focusFirst
        n.current = () => stopBySid(sid())
        n.getSid = () => sid()
        n.setSid = setSid
        n.getScroll = () => scroll()
        n.setScroll = setScroll
        n.setActive = setActive
        if (props.ref) props.ref(n)
      }}
      transition={fx('x', props.xMs || 0, EASE_OUT)}
      x={props.x || 0}
      alpha={props.alpha == null ? 1 : props.alpha}
      width={COLUMN_W}
      height={viewH()}
      onFocusChanged={(has) => {
        setActive(has)
        if (!has) return
        if (!stopBySid(sid())) focusFirst(true)
        else follow()
      }}
      onUp={() => {
        if (sid() === ACTION) {
          edge('up')
          return true
        }
        if (!move('up')) {
          if (props.action) setSid(ACTION)
          else edge('up')
        }
        return true
      }}
      onDown={() => {
        if (sid() === ACTION) focusFirst()
        else move('down')
        return true
      }}
      onLeft={() => {
        const stop = stopBySid(sid())
        if (stop && props.onListSide && props.onListSide(sid(), 'left', stop)) return true
        move('left')
        return true
      }}
      onRight={() => {
        const stop = stopBySid(sid())
        if (stop && props.onListSide && props.onListSide(sid(), 'right', stop)) return true
        if (!move('right')) edge('right')
        return true
      }}
      onEnter={() => {
        if (sid() === ACTION) {
          if (props.onListAction) props.onListAction()
          return true
        }
        const stop = stopBySid(sid())
        if (stop && props.onListEnter) props.onListEnter(sid(), stop)
        return true
      }}
    >
      <view width={COLUMN_W} height={viewH()} borderRadius={corners()} color={p().view} />
      <view y={top()} width={COLUMN_W} height={view()} clipping>
        {/* Sized to the content, so the renderer keeps drawing it however far it scrolls. */}
        <view
          transition={fx('y', props.scrollMs || 0, EASE_OUT)}
          y={-scroll()}
          width={COLUMN_W}
          height={trackH()}
          // The Magic Remote's cursor focuses the setting under it, and OK then uses it (app/pointer.js).
          pointerItems={() => stops()}
          onPointerItem={(it) => {
            if (props.onListPointer) props.onListPointer(it.sid)
            else if (it.sid !== sid()) focusSid(it.sid, false, true)
          }}
        >
          <view width={COLUMN_W} height={trackH()}>
            <For each={sections.keys()}>
              {(k) => {
                const s = sections.item(k)
                return (
                  <text
                    fontFamily={faces().section}
                    fontSize={faces().sectionSize}
                    letterSpacing={faces().sectionSpacing}
                    lineHeight={faces().sectionLH}
                    x={26.71}
                    y={s().y + 35.09 + faces().sectionDy}
                    maxWidth={COLUMN_W - 53.6}
                    color={p().accent}
                  >
                    {s().text}
                  </text>
                )
              }}
            </For>
          </view>
          <view width={COLUMN_W} height={trackH()}>
            <For each={dividers.keys()}>
              {(k) => {
                const d = dividers.item(k)
                return <view x={20.03} y={d().y} width={COLUMN_W - 40.1} height={1} color={p().divider} />
              }}
            </For>
          </view>
          <view width={COLUMN_W} height={trackH()}>
            <For each={texts.keys()}>
              {(k) => {
                const t = texts.item(k)
                const center = () => t().st.align === 'center'
                return (
                  <text
                    fontFamily={rowFont(t().text, t().st.weight === 'bold' ? 'bold' : 'regular')}
                    fontSize={t().st.size}
                    lineHeight={t().st.lh}
                    x={t().textX}
                    y={t().y + t().textY + t().st.size * 0.085}
                    maxWidth={t().textW}
                    contain={center() ? 'width' : 'none'}
                    textAlign={center() ? 'center' : 'left'}
                    letterSpacing={t().st.spacing || 0}
                    color={t().color || p().tone[t().st.tone]}
                  >
                    {t().text || ' '}
                  </text>
                )
              }}
            </For>
          </view>
          <view width={COLUMN_W} height={trackH()}>
            <For each={cards.keys()}>
              {(k) => {
                const r = cards.item(k)
                return <SettingsRow m={r()} focused={r().sid === lit()} p={p()} faces={faces()} fade={props.fade} slide={props.slide} />
              }}
            </For>
          </view>
          <view width={COLUMN_W} height={trackH()}>
            <For each={blocks.keys()}>
              {(k) => {
                const b = blocks.item(k)
                return <SettingsBlock m={b()} focusSid={lit()} p={p()} fade={props.fade} slide={props.slide} />
              }}
            </For>
          </view>
        </view>
      </view>
      <view width={COLUMN_W} height={93.5} borderRadius={[corners()[0], corners()[1], 0, 0]} color={p().bar} alpha={top() ? 1 : 0} />
      <view width={COLUMN_W} height={93.5} borderRadius={[corners()[0], corners()[1], 0, 0]} color={p().barTint} alpha={props.tinted && scroll() > 0 ? 1 : 0} />
      <text
        fontFamily={faces().title(props.title || '')}
        fontSize={faces().titleSize}
        lineHeight={46.75}
        x={titleX()}
        y={24.5 + faces().titleDy}
        maxWidth={COLUMN_W - titleX() - 26.71}
        maxLines={1}
        letterSpacing={faces().titleSpacing}
        textShadow={faces().titleShadow}
        color={faces().titleColor || p().onSurface}
      >
        {props.title || ' '}
      </text>
      <view>
        <Show when={props.action}>
          <view x={COLUMN_W - 74.14} y={6.68} width={80.14} height={80.14}>
            <view width={80.14} height={80.14} borderRadius={40.07} color="#ffffff1a" alpha={sid() === ACTION && active() ? 1 : 0} />
            <view x={20.04} y={20.04} width={40.07} height={40.07} src={'icons/settings/' + props.action + '.webp'} color="#ffffff" />
          </view>
        </Show>
      </view>
    </view>
  )
}
