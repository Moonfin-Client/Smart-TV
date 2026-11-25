import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import { rowFont } from './rowFont.js'
import { dialogTitleLook } from './faces.js'
import { dp, textWidth } from './look.js'
import { COLUMN_W } from './layoutRows.js'
import { fx, EASE_OUT } from './fx.js'

// The settings picker: a dialog over the screen it was chosen on, as wide as its longest choice in
// steps of 56 units from 280 until the column stops it, with a radio per choice. Only the focused
// choice fills, so focus never looks like the current value. It calls onOptionFocus(index) and
// onOptionPick(index) on its holder, and leaves Back to it. Its node has start(index), which opens
// it on that choice.
const STEP = dp(56)
const MIN_W = dp(280)
const PAD_X = dp(40)
const PAD_Y = dp(24)
const TITLE_TOP = dp(22)
const TITLE_X = dp(24)
const TITLE_SIZE = dp(18)
const TITLE_LH = dp(18) * 1.333
const TITLE_BOTTOM = dp(12)
const LIST_X = dp(12)
const LIST_BOTTOM = dp(12)
const OPT_MIN = dp(56)
const OPT_TWO = dp(72)
const OPT_MARGIN = dp(1)
const OPT_PAD_X = dp(14)
const RADIO = dp(18)
const RADIO_GAP = dp(14)
const SWATCH = dp(24)
const LABEL_SIZE = dp(15)
const LABEL_LH = dp(15) * 1.17
const HINT_SIZE = dp(12)
const HINT_LH = dp(12) * 1.17

export default function OptionsDialog(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const isCur = createSelector(cur)
  const p = () => props.p
  const colH = () => props.colH || 883
  const sq = (r) => (theme().isPixel ? 0 : r)
  const look = createMemo(() => dialogTitleLook(props.title || ''))
  const placed = createMemo(() => {
    let y = 0
    return (props.options || []).map((o, i) => {
      const h = o.hint ? OPT_TWO : OPT_MIN
      const labelX = OPT_PAD_X + RADIO + RADIO_GAP + (o.swatch ? SWATCH + RADIO_GAP : 0)
      const out = {
        ...o,
        i,
        y: y + OPT_MARGIN,
        h,
        on: o.value === props.current,
        labelX,
        labelY: (h - LABEL_LH - (o.hint ? HINT_LH : 0)) / 2,
        naturalW: labelX + Math.max(textWidth(String(o.label), LABEL_SIZE, 'bold'), o.hint ? textWidth(o.hint, HINT_SIZE) : 0) + OPT_PAD_X,
      }
      y += h + 2 * OPT_MARGIN
      return out
    })
  })
  const listH = () => {
    const last = placed()[placed().length - 1]
    return last ? last.y + last.h + OPT_MARGIN : 0
  }
  const width = createMemo(() => {
    const natural = Math.max(textWidth(props.title || '', TITLE_SIZE, 'bold') + 2 * TITLE_X, ...placed().map((o) => o.naturalW + 2 * LIST_X))
    return Math.min(COLUMN_W - 2 * PAD_X, Math.max(MIN_W, Math.ceil((natural - 1) / STEP) * STEP))
  })
  // A pixel theme's title is 60 percent, line height and all.
  const titleLH = () => TITLE_LH * (theme().isPixel ? 0.6 : 1)
  const headH = () => TITLE_TOP + titleLH() + TITLE_BOTTOM
  const height = () => Math.min(colH() - 2 * PAD_Y, headH() + listH() + LIST_BOTTOM)
  const viewH = () => height() - headH() - LIST_BOTTOM
  const border = () => p().dialogBorder || { w: 0, color: '#00000000' }
  const innerW = () => width() - 40.07

  const follow = () => {
    const o = placed()[cur()]
    if (!o) return
    const wanted = o.y - 0.9 * (viewH() - o.h)
    setScroll(Math.max(0, Math.min(Math.max(0, listH() - viewH()), wanted)))
  }
  const tell = () => props.onOptionFocus && props.onOptionFocus(cur())
  const step = (d) => {
    const next = cur() + d
    if (next < 0 || next >= (props.options || []).length) return true
    setCur(next)
    follow()
    tell()
    return true
  }
  return (
    <view
      ref={(n) => {
        n.start = (index) => {
          setCur(Math.max(0, Math.min((props.options || []).length - 1, index)))
          follow()
          tell()
        }
        if (props.ref) props.ref(n)
      }}
      width={COLUMN_W}
      height={colH()}
      onUp={() => step(-1)}
      onDown={() => step(1)}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        if (props.onOptionPick) props.onOptionPick(cur())
        return true
      }}
    >
      <view width={COLUMN_W} height={colH()} borderRadius={33.39} color="#0000008a" />
      <view
        x={(COLUMN_W - width()) / 2}
        y={(colH() - height()) / 2}
        width={width()}
        height={height()}
        borderRadius={p().dialogRadius}
        color={p().dialog}
        border={border().w ? { width: border().w, color: hex(border().color) } : undefined}
      >
        <text
          fontFamily={look().font}
          fontSize={look().size}
          lineHeight={titleLH()}
          x={40.07}
          y={39.28 + look().dy}
          maxWidth={width() - 80.14}
          maxLines={1}
          letterSpacing={look().spacing}
          textShadow={look().shadow}
          color={look().color || '#e6e0e9'}
        >
          {props.title || ' '}
        </text>
        <view x={20.03} y={headH()} width={innerW()} height={viewH()} clipping>
          <view transition={fx('y', 120, EASE_OUT)} y={-scroll()} width={innerW()} height={Math.max(viewH(), listH())}>
            <For each={placed()}>
              {(o) => {
                const lit = () => isCur(o.i)
                return (
                  <view y={o.y} width={innerW()} height={o.h} borderRadius={sq(20.03)} color={lit() ? p().tileFocusFill : '#00000000'}>
                    <view
                      x={23.37}
                      y={(o.h - 30.05) / 2}
                      width={30.05}
                      height={30.05}
                      borderRadius={15.03}
                      color="#00000000"
                      border={{ width: 3.34, color: hex(lit() ? (o.on ? p().strong : '#00000080') : o.on ? p().accent : p().os45) }}
                    />
                    <view
                      x={31.71}
                      y={(o.h - 13.36) / 2}
                      width={13.36}
                      height={13.36}
                      borderRadius={6.68}
                      color={lit() ? p().strong : p().accent}
                      alpha={o.on ? 1 : 0}
                    />
                    {o.swatch ? (
                      <view
                        x={76.79}
                        y={(o.h - dp(24)) / 2}
                        width={40.07}
                        height={40.07}
                        borderRadius={20.03}
                        color={o.swatch}
                        border={{ width: p().swatchRingW, color: hex(o.swatchEdge || p().swatchRing) }}
                      />
                    ) : null}
                    <text
                      fontFamily={rowFont(String(o.label), 'bold')}
                      fontSize={25.04}
                      lineHeight={29.3}
                      x={o.labelX}
                      y={o.labelY + 2.13}
                      maxWidth={innerW() - o.labelX - 23.37}
                      maxLines={1}
                      color={lit() ? p().strong : p().onSurface}
                    >
                      {String(o.label) || ' '}
                    </text>
                    {o.hint ? (
                      <text
                        fontFamily={rowFont(o.hint)}
                        fontSize={20.03}
                        lineHeight={23.44}
                        x={o.labelX}
                        y={o.labelY + LABEL_LH + 1.7}
                        maxWidth={innerW() - o.labelX - 23.37}
                        maxLines={1}
                        color={lit() ? '#00000099' : p().os65}
                      >
                        {o.hint}
                      </text>
                    ) : null}
                  </view>
                )
              }}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}
