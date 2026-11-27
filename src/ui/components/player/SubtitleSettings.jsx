import $L from '../../../services/i18n.js'
import { For, Index, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import { cssShift, normalShift, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'
import { resolveSubtitleStyleSettings, subtitleStyleKey } from '../../../utils/subtitleConstants.js'
import { retrySubtitleFont } from '../../../services/subtitleFonts.js'
import { localPoint } from '../../../app/pointer.js'
import { VIEW_H, scrollTo, settingRows, stepValue } from '../../../pages/Player/subtitleSettings.js'
import { keyed } from '../library/pageKit.js'
import { tx } from '../../fx.js'

// Every subtitle style setting, SDR or (with HDR on screen and subtitleHdrSeparate on) its HDR twin,
// with a scroller and sliders. Focus and values draw in the default blue whatever the theme. Up and
// Down walk the rows and the footer, Left and Right move a slider, Enter cycles a value. It writes
// the settings itself and calls applySubtitleStyle() and closePanel() on its holder. The holder
// mounts it and calls open(isHdr).
const TRACK_X = 67
const TRACK_W = 546
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const KNOB_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 3, blur: 6, spread: 0 }
const PANEL_BORDER = { width: 1, color: hex('#ffffff26') }
const FOCUS_BORDER = { width: 1, color: hex('#00a4dc') }
const FADE = { duration: 200, easing: 'ease' }

export default function SubtitleSettings(props) {
  const [rows, setRows] = createSignal([])
  const [contentH, setContentH] = createSignal(0)
  const [cur, setCur] = createSignal('size')
  const [scroll, setScroll] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [active, setActive] = createSignal(false)
  const title = $L('Subtitle Appearance')
  const closeLabel = $L('Press BACK to close')
  const titleFont = uiFont('bold')
  const labelFont = uiFont('medium')
  const valueFont = uiFont('bold')
  const closeFont = uiFont()
  const titleY = 84.2 + cssShift(40)
  const buttonTextY = 21 + normalShift(24)
  const sliderTextY = 16 + cssShift(24)
  const closeTextY = 10 + normalShift(18)
  let hdr = false
  let list = []
  let timer = null
  onCleanup(() => clearTimeout(timer))

  const lit = createSelector(() => (active() ? cur() : ''))
  const buttons = keyed(
    createMemo(() => rows().filter((r) => r.kind === 'button')),
    (r) => r.id,
  )
  const sliders = keyed(
    createMemo(() =>
      rows()
        .filter((r) => r.kind === 'slider')
        .map((r) => {
          const f = Math.max(0, Math.min(1, (Number(r.raw || 0) - r.min) / (r.max - r.min)))
          return { ...r, fillW: TRACK_W * f, knobX: TRACK_X + TRACK_W * f }
        }),
    ),
    (r) => r.id,
  )
  const dividers = createMemo(() => rows().filter((r) => r.kind === 'divider'))
  const closeOn = () => active() && cur() === 'close'

  const style = () => resolveSubtitleStyleSettings(settings.all(), hdr)
  const refresh = () => {
    const s = style()
    const next = settingRows(s)
    next.forEach((r) => {
      if (r.kind === 'button') r.raw = s[r.key]
    })
    list = next
    setContentH(next.contentH)
    setRows(next.slice())
    // A row that went away can leave the view past the new end.
    setScroll(Math.min(scroll(), Math.max(0, next.contentH - VIEW_H)))
  }
  // Each open starts at the top on Size, and the panel fades and slides in.
  const open = (isHdr) => {
    hdr = !!isHdr
    refresh()
    setCur('size')
    setScroll(0)
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
  }
  const focusable = () => list.filter((r) => r.kind !== 'divider').map((r) => r.id).concat('close')
  const move = (dir) => {
    const ids = focusable()
    const next = ids[ids.indexOf(cur()) + dir]
    if (!next) return true
    setCur(next)
    const r = list.find((x) => x.id === next)
    if (r) setScroll(scrollTo(scroll(), r, contentH()))
    return true
  }
  const write = (r, value) => {
    const all = settings.all()
    if (r.key === 'subtitleFont') retrySubtitleFont(value)
    settings.set(r.hdr ? subtitleStyleKey(r.key, hdr && !!all.subtitleHdrSeparate) : r.key, value)
    refresh()
    if (props.applySubtitleStyle) props.applySubtitleStyle()
  }
  // The Magic Remote's cursor (app/pointer.js): a row in full view takes focus on hover, one the list
  // would scroll to only on a click, so the list doesn't move under the cursor.
  const pointAt = (id) => {
    const r = list.find((x) => x.id === id)
    if (!r || cur() === id || r.focusY < scroll() || r.focusY + r.focusH > scroll() + VIEW_H) return
    setCur(id)
  }
  // A click on a slider's track sets it to that point.
  const clickAt = (id, n, p) => {
    const r = list.find((x) => x.id === id)
    if (!r) return false
    setCur(id)
    setScroll(scrollTo(scroll(), r, contentH()))
    if (r.kind === 'slider') {
      const at = localPoint(n, p)
      if (at.y < 60) return false
      const f = Math.max(0, Math.min(1, (at.x - TRACK_X) / TRACK_W))
      write(r, stepValue({ ...r, raw: r.min + f * (r.max - r.min) }, 0))
      return false
    }
    return r.kind === 'button'
  }
  const slide = (dir) => {
    const r = list.find((x) => x.id === cur())
    if (r && r.kind === 'slider') write(r, stepValue(r, dir))
    return true
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      pointerModal
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onFocusChanged={setActive}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onLeft={() => slide(-1)}
      onRight={() => slide(1)}
      onEnter={() => {
        if (cur() === 'close') {
          if (props.closePanel) props.closePanel()
          return true
        }
        const r = list.find((x) => x.id === cur())
        if (!r || r.kind !== 'button') return true
        if (r.toggle) write(r, !r.raw)
        else {
          const at = r.options.findIndex((o) => o.value === r.raw)
          write(r, r.options[((at < 0 ? 0 : at) + 1) % r.options.length].value)
        }
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view
        x={559}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={57 + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={802}
        height={966}
      >
        <view width={802} height={966} borderRadius={16} color="#00000000" shadow={SHADOW} />
        <view width={802} height={966} borderRadius={16} color="#1e1e1efa" border={PANEL_BORDER} />
        <text fontFamily={titleFont} fontSize={40} lineHeight={33} x={401} y={titleY} mountX={0.5} color="#ffffffff">
          {title}
        </text>

        <view x={51} y={152.2} width={700} height={648} clipping>
          <view transition={{ y: { duration: 200, easing: 'ease-in-out' } }} y={-scroll()} width={700} height={Math.max(648, contentH())}>
            <view>
              <Index each={dividers()}>{(d) => <view y={d().y} width={700} height={1} color="#ffffff1a" />}</Index>
            </view>
            <view>
              <For each={buttons.keys()}>
                {(k) => {
                  const b = buttons.item(k)
                  const focused = () => lit(k)
                  return (
                    <view
                      x={10}
                      y={b().y}
                      width={680}
                      height={70}
                      transition={{ scale: FADE }}
                      scale={focused() ? 1.02 : 1}
                      onPointerOver={() => pointAt(k)}
                      onPointerClick={() => clickAt(k)}
                    >
                      <view width={680} height={70} borderRadius={10} transition={{ color: FADE }} color={focused() ? '#00a4dc4d' : '#ffffff14'} />
                      <view width={680} height={70} borderRadius={10} color="#00000000" border={PANEL_BORDER} />
                      <view width={680} height={70} borderRadius={10} color="#00000000" border={FOCUS_BORDER} transition={{ alpha: FADE }} alpha={focused() ? 1 : 0} />
                      <text fontFamily={labelFont} fontSize={24} lineHeight={1} x={31} y={buttonTextY} color="#ffffffff">
                        {b().label}
                      </text>
                      <text fontFamily={valueFont} fontSize={24} lineHeight={1} x={649} y={buttonTextY} mountX={1} color="#00a4dcff">
                        {b().value || ' '}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
            <view>
              <For each={sliders.keys()}>
                {(k) => {
                  const sl = sliders.item(k)
                  const focused = () => lit(k)
                  return (
                    <view x={10} y={sl().y} width={680} height={122} onPointerOver={() => pointAt(k)} onPointerClick={(n, p) => clickAt(k, n, p)}>
                      <view width={680} height={122} borderRadius={10} transition={{ color: FADE }} color={focused() ? '#00a4dc26' : '#ffffff14'} />
                      <view width={680} height={122} borderRadius={10} color="#00000000" border={PANEL_BORDER} />
                      <view width={680} height={122} borderRadius={10} color="#00000000" border={FOCUS_BORDER} transition={{ alpha: FADE }} alpha={focused() ? 1 : 0} />
                      <text fontFamily={labelFont} fontSize={24} lineHeight={33} x={31} y={sliderTextY} color="#ffffffff">
                        {sl().label}
                      </text>
                      <text fontFamily={valueFont} fontSize={24} lineHeight={33} x={649} y={sliderTextY} mountX={1} color="#00a4dcff">
                        {sl().value || ' '}
                      </text>
                      <view x={67} y={82} width={546} height={6} borderRadius={3} color="#373a41ff" />
                      <view x={67} y={82} width={sl().fillW} height={6} borderRadius={3} color={focused() ? '#e6e6e6ff' : '#8d9298ff'} />
                      <view x={sl().knobX - 9} y={76} width={18} height={18} borderRadius={9} color="#8d9298ff" alpha={focused() ? 0 : 1} />
                      <view x={sl().knobX - 12} y={73} width={24} height={24} borderRadius={12} color="#00000000" shadow={KNOB_SHADOW} alpha={focused() ? 1 : 0} />
                      <view x={sl().knobX - 12} y={73} width={24} height={24} borderRadius={12} color="#e6e6e6ff" alpha={focused() ? 1 : 0} />
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>

        <view
          x={51}
          y={800.2}
          width={700}
          height={41}
          borderRadius={4}
          color={closeOn() ? '#ffffff1a' : '#00000000'}
          onPointerOver={() => cur() !== 'close' && setCur('close')}
        >
          <text fontFamily={closeFont} fontSize={18} lineHeight={1} x={350} y={closeTextY} mountX={0.5} color={closeOn() ? '#ffffffff' : '#ffffff99'}>
            {closeLabel}
          </text>
        </view>
      </view>
    </view>
  )
}
