import { Index, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { cssShift, themeSpacing, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { highMs } from '../../../ui/tier.js'
import { holdPress } from '../../../utils/longPress.js'
import { buttonLook, tagFor, toolbarLayout, TAG_H } from './toolbar.js'
import { wa } from './layout.js'
import { tx } from '../../../ui/fx.js'
import { pointerFocus } from '../../../app/pointer.js'

// Frost's toolbar: Play a pill in the accent, the rest bare 90px icons that take a lighter platter
// and grow when focused, with the label floating above on a dark tag. The pane is the ornament glass
// under them.
//
// Props: `buttons` [{id, icon, label, active, long}], `held`, `look` (the theme's colors for it),
// `pixel` (a pixel theme squares off the buttons). Calls onAction(id), onActionLong(id) and
// onActionsEdge(dir) for Up, Down, and Left off the first or Right off the last button. Its node has
// current(), cur() and selectFirst().
const LOOK = {
  play: '#0a84ffdb', playInk: '#ffffffff', playFocus: '#fffffff2', playFocusInk: '#0a0a12ff', ring: '#ffffff4d', platter: '#ffffff52',
  ink: '#ffffffff', active: '#0a84ffff', tag: '#242428f7', tagInk: '#ffffffff', pane: '#303036e6', rimInk: (a) => wa('#ffffff', a),
}

// Frost's rim: a 1.5px hairline over a box, brighter along the top. The renderer takes one border
// color per node, so the top is a second, top-only border over the first, strong enough that the two
// add up to 0.24 on top against 0.08 on the other sides.
export function Rim(props) {
  return (
    <>
      <view width={props.w} height={props.h} borderRadius={props.r} color="#00000000" border={{ width: 1.5, color: hex(props.ink(0.08)) }} />
      <view width={props.w} height={props.h} borderRadius={props.r} color="#00000000" borderTop={{ width: 1.5, color: hex(props.ink(0.16 / 0.92)) }} />
    </>
  )
}

export default function Toolbar(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const lk = () => props.look || LOOK
  const semi = () => uiFont('bold')
  const buttons = () => props.buttons || []
  const laid = createMemo(() => toolbarLayout(buttons()))
  const looks = createMemo(() => laid().placed.map(buttonLook))
  const isOn = createSelector(() => (focused() ? cur() : -1))
  const tag = createMemo(() => (focused() ? tagFor(laid().placed[cur()]) : null))
  const ms = () => highMs(180)
  const sq = (r) => (props.pixel ? 0 : r)

  createEffect(
    on(buttons, (list) => {
      if (cur() >= list.length) setCur(Math.max(0, list.length - 1))
    }),
  )

  const edge = (dir) => {
    if (props.onActionsEdge) props.onActionsEdge(dir)
    return true
  }
  // Play and Resume open Advanced Playback when held, so they act on release.
  const hold = holdPress()

  return (
    <view
      // The Magic Remote's cursor focuses the button under it, and OK then presses it (app/pointer.js).
      pointerItems={() => laid().placed}
      onPointerItem={(it, i, n) => {
        pointerFocus(n)
        if (cur() !== i) setCur(i)
      }}
      ref={(n) => {
        n.current = () => buttons()[cur()]
        n.cur = cur
        n.selectFirst = () => setCur(0)
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={laid().w}
      height={laid().h}
      alpha={props.held ? 0 : 1}
      onFocusChanged={(has) => {
        setFocused(has)
        if (!has) hold.cancel()
      }}
      onUp={() => edge('up')}
      onDown={() => edge('down')}
      onLeft={() => {
        if (cur() > 0) setCur(cur() - 1)
        else edge('left')
        return true
      }}
      onRight={() => {
        if (cur() < buttons().length - 1) setCur(cur() + 1)
        else edge('right')
        return true
      }}
      onEnter={() => {
        const b = buttons()[cur()]
        if (!b) return true
        if (!b.long) {
          if (props.onAction) props.onAction(b.id)
          return true
        }
        hold.start(b, () => {
          if (props.onActionLong) props.onActionLong(b.id)
        })
        return true
      }}
      onMenu={() => {
        const b = buttons()[cur()]
        if (!b || !b.long || !props.onActionLong) return false
        props.onActionLong(b.id)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((b) => {
          if (props.onAction) props.onAction(b.id)
        })
      }}
    >
      <view width={laid().w} height={laid().h} borderRadius={57} color={lk().pane} />
      <Rim w={laid().w} h={laid().h} r={57} ink={lk().rimInk} />
      <view>
        <Index each={laid().placed}>
          {(p, i) => {
            const look = () => looks()[i] || looks()[0]
            const on = () => isOn(i)
            const ink = () => {
              const b = p().b
              if (look().lead) return on() ? lk().playFocusInk : lk().playInk
              return b.active ? (b.id === 'favorite' ? '#ff375fff' : lk().active) : lk().ink
            }
            return (
              <view
                transition={tx({ scale: { duration: ms() } })}
                x={p().x}
                y={p().y}
                width={p().w}
                height={p().h}
                pivot={0.5}
                scale={on() ? (look().lead ? 1.06 : 1.12) : 1}
              >
                <view alpha={look().lead ? 1 : 0} x={6} y={6} width={p().w - 12} height={p().h - 12} borderRadius={sq(45)} color={on() ? lk().playFocus : lk().play} />
                <view alpha={look().lead && on() ? 1 : 0} width={p().w} height={p().h} borderRadius={sq(51)} color="#00000000" border={{ width: 6, color: hex(lk().ring) }} />
                <view alpha={!look().lead && on() ? 1 : 0} width={p().w} height={p().h} borderRadius={45} color={lk().platter} />
                <view x={look().iconX} y={look().iconY} width={look().iconW} height={look().iconW} src={look().icon} color={ink()} />
                <text
                  alpha={look().lead ? 1 : 0}
                  x={look().labelX}
                  y={look().labelY}
                  fontFamily={semi()}
                  letterSpacing={themeSpacing()}
                  fontSize={28.5}
                  lineHeight={34}
                  maxWidth={look().labelW || undefined}
                  maxLines={1}
                  color={ink()}
                >
                  {look().lead ? look().label : ''}
                </text>
              </view>
            )
          }}
        </Index>
      </view>
      <view alpha={tag() ? 1 : 0} x={tag() ? tag().x : 0} y={tag() ? tag().y : 0} width={tag() ? tag().w : 0} height={TAG_H} borderRadius={24} color={lk().tag}>
        <text x={21} y={10.5 + cssShift(21)} fontFamily={semi()} fontSize={21} lineHeight={23.1} letterSpacing={themeSpacing()} color={lk().tagInk}>
          {tag() ? tag().label : ''}
        </text>
      </view>
    </view>
  )
}
