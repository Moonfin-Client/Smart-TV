import $L from '../../../services/i18n.js'
import { For, createMemo, createSignal, onCleanup } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { textWidth } from './look.js'
import { keyed } from '../library/pageKit.js'
import { tx } from '../../fx.js'

// The subtitle offset strip at the top of the player: minus, the offset and plus, the cue timeline
// when the track has lines, and Reset. Focus stays the default blue whatever the theme. Props
// `offset` and `timeline` (buildSubtitleTimeline's answer or null). It calls
// onOffsetChange(seconds) and closePanel() on its holder, which mounts it and calls open().
const MINUS = '−'
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const PLAYHEAD_SHADOW = { color: shadowColor('#000000e6'), x: 0, y: 0, blur: 8, spread: 0 }
const PANEL_EDGE = { width: 1, color: hex('#ffffff26') }
const BUTTON_EDGE = { width: 1, color: hex('#ffffff33') }
const FOCUS_EDGE = { width: 1, color: hex('#00a4dc') }
const FADE = { duration: 200 }

const Round = (props) => (
  <view x={props.x} width={64} height={64} transition={{ scale: FADE }} scale={props.lit ? 1.1 : 1}>
    <view width={64} height={64} borderRadius={32} transition={{ color: FADE }} color={props.lit ? '#00a4dc4d' : '#ffffff1a'} />
    <view width={64} height={64} borderRadius={32} color="#00000000" border={BUTTON_EDGE} />
    <view width={64} height={64} borderRadius={32} color="#00000000" border={FOCUS_EDGE} transition={{ alpha: FADE }} alpha={props.lit ? 1 : 0} />
    <text fontFamily={props.font} fontSize={28} x={32} y={32} mountX={0.5} mountY={0.5} color="#ffffffff">
      {props.glyph}
    </text>
  </view>
)

export default function OffsetOverlay(props) {
  const [cur, setCur] = createSignal('reset')
  const [on, setOn] = createSignal(false)
  const [active, setActive] = createSignal(false)
  const title = $L('Subtitle Offset')
  const resetLabel = $L('Reset')
  const closeLabel = $L('Press BACK to close')
  const titleFont = uiFont('bold')
  const valueFont = uiFont('bold')
  const glyphFont = fontFor(MINUS)
  const plainFont = uiFont()
  let timer = null
  onCleanup(() => clearTimeout(timer))

  const wide = () => !!props.timeline
  const contentW = () => (wide() ? 900 : 600)
  const panelW = () => contentW() + 54
  const panelH = () => (wide() ? 494.9 : 336.9)
  // The row of minus, value and plus is 348 wide with the trailing margin on plus.
  const rowX = () => 27 + (contentW() - 348) / 2
  const shown = () => {
    const o = Number(props.offset) || 0
    return `${o > 0 ? '+' : ''}${o.toFixed(1)}s`
  }
  const actionsY = () => (wide() ? 358.9 : 200.9)
  const resetW = textWidth(resetLabel, 20) + 62
  const closeW = textWidth(closeLabel, 18) + 40
  const lit = (id) => active() && cur() === id
  const markers = createMemo(() => {
    const t = props.timeline
    return t ? t.markers.map((m) => ({ key: String(m.time), label: m.label, x: 27 + (m.left / 100) * 900 })) : []
  })
  const bars = createMemo(() => {
    const t = props.timeline
    return t
      ? t.bars.map((b) => ({
          key: b.key,
          x: (b.left / 100) * 898,
          w: (b.width / 100) * 898,
          color: b.isActive ? '#00a4dc8c' : '#ffffff38',
          text: b.text,
          font: fontFor(b.text),
        }))
      : []
  })
  // The timeline follows the playhead several times a second, so marks and bars stay by key.
  const markList = keyed(markers, (m) => m.key)
  const barList = keyed(bars, (b) => b.key)
  const playX = () => {
    const t = props.timeline
    return t ? (t.playheadLeft / 100) * 898 - 2 : 0
  }

  // Focus starts on Reset.
  const open = () => {
    setCur('reset')
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
  }
  const change = (seconds) => {
    if (props.onOffsetChange) props.onOffsetChange(Math.round(seconds * 10) / 10)
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onFocusChanged={setActive}
      onUp={() => {
        // Up from Reset goes to plus, the nearer of the two buttons.
        if (cur() === 'reset') setCur('plus')
        else if (cur() === 'close') setCur('reset')
        return true
      }}
      onDown={() => {
        if (cur() === 'minus' || cur() === 'plus') setCur('reset')
        else if (cur() === 'reset') setCur('close')
        return true
      }}
      onLeft={() => {
        if (cur() === 'plus') setCur('minus')
        return true
      }}
      onRight={() => {
        if (cur() === 'minus') setCur('plus')
        return true
      }}
      onEnter={() => {
        const o = Number(props.offset) || 0
        if (cur() === 'minus') change(o - 0.1)
        else if (cur() === 'plus') change(o + 0.1)
        else if (cur() === 'reset') change(0)
        else if (props.closePanel) props.closePanel()
        return true
      }}
    >
      <view width={1920} height={486} colorTop="#000000b3" colorBottom="#00000000" />
      <view
        x={(1920 - panelW()) / 2}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={60 + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={panelW()}
        height={panelH()}
      >
        <view width={panelW()} height={panelH()} borderRadius={16} color="#00000000" shadow={SHADOW} />
        <view width={panelW()} height={panelH()} borderRadius={16} color="#1e1e1efa" border={PANEL_EDGE} />
        <text fontFamily={titleFont} fontSize={30} x={panelW() / 2} y={54.82} mountX={0.5} color="#ffffffff">
          {title}
        </text>

        <view x={rowX()} y={108.9} width={360} height={64}>
          <Round x={0} lit={lit('minus')} font={glyphFont} glyph={MINUS} />
          <text fontFamily={valueFont} fontSize={36} x={164} y={14.9} mountX={0.5} color="#ffffffff">
            {shown()}
          </text>
          <Round x={264} lit={lit('plus')} font={plainFont} glyph="+" />
        </view>

        <view alpha={wide() ? 1 : 0} y={200.9} width={954} height={134}>
          <view>
            <For each={markList.keys()}>
              {(k) => {
                const m = markList.item(k)
                return (
                  <text fontFamily={plainFont} fontSize={18} x={m().x} mountX={0.5} color="#ffffff80">
                    {m().label}
                  </text>
                )
              }}
            </For>
          </view>
          <view x={27} y={32} width={900} height={102} borderRadius={8} color="#00000080" border={PANEL_EDGE} />
          <view x={28} y={33} width={898} height={100} clipping>
            <view>
              <For each={barList.keys()}>
                {(k) => {
                  const b = barList.item(k)
                  return (
                    <view x={b().x} y={12} width={b().w} height={76} borderRadius={4} color={b().color}>
                      <text fontFamily={b().font} fontSize={18} x={6} y={8.25} maxWidth={Math.max(1, b().w - 12)} maxLines={1} color="#ffffffff">
                        {b().text || ' '}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view x={playX()} width={4} height={100} color="#00000000" shadow={PLAYHEAD_SHADOW} />
            <view x={playX()} width={4} height={100} color="#ffffffff" />
          </view>
        </view>

        <view x={(panelW() - resetW) / 2} y={actionsY()} width={resetW} height={56}>
          <view width={resetW} height={56} borderRadius={8} transition={{ color: FADE }} color={lit('reset') ? '#00a4dc4d' : '#ffffff1a'} />
          <view width={resetW} height={56} borderRadius={8} color="#00000000" border={BUTTON_EDGE} />
          <view width={resetW} height={56} borderRadius={8} color="#00000000" border={FOCUS_EDGE} transition={{ alpha: FADE }} alpha={lit('reset') ? 1 : 0} />
          <text fontFamily={plainFont} fontSize={20} x={31} y={18.28} color="#ffffffff">
            {resetLabel}
          </text>
        </view>

        <view x={27} y={actionsY() + 68} width={closeW} height={41} borderRadius={4} color={lit('close') ? '#ffffff1a' : '#00000000'}>
          <text fontFamily={plainFont} fontSize={18} x={20} y={11.95} color={lit('close') ? '#ffffffff' : '#ffffff99'}>
            {closeLabel}
          </text>
        </view>
      </view>
    </view>
  )
}
