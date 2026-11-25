import { For, createEffect, createMemo, createSignal, on, untrack } from 'solid-js'
import PanelRow from './PanelRow.jsx'
import { displayFont, fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth } from './measure.js'
import { layoutPanel, scrollFor } from './panelLayout.js'
import { perfTier } from '../../tier.js'
import { keyed } from './pageKit.js'
import { NEON_GLOW } from './libraryChrome.js'

// The library's centered dialogs (Sort & Filter, Display, Group By): a frosted card that scrolls
// inside itself once it runs taller than 88 percent of the screen. Up and Down move between the rows
// that take focus, Enter calls onPanelSelect(row) on the holder, and the page closes it on Back.
// Its node has current(), currentRect(), select(id), reset() and step(d).
// `neon` draws Neon Pulse: the title in the display face glowing in the accent, the headings cyan,
// and the option rows focused and picked in the accent.
// shortcut: the card's backdrop blur isn't drawn, only its 92 percent tint. Add a blurred copy of the
// screen behind it if the tint alone reads differently on TVs.
const FOCUSABLE = { check: 1, radio: 1, clear: 1, more: 1, section: 1, search: 1 }
const EDGE = { width: 1, color: hex('#ffffff2e') }

export default function LibraryPanel(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const width = () => (props.narrow ? 500 : 560)
  const laid = createMemo(() => layoutPanel(props.rows || []))
  const placed = createMemo(() => {
    const inner = width() - 50
    const sumFont = uiFont('bold')
    let f = 0
    return laid().rows.map((r, i) => {
      const label = r.label == null ? '' : String(r.label)
      const focusable = !!FOCUSABLE[r.kind]
      return {
        ...r,
        rk: (r.key || r.id || r.kind) + '-' + i,
        fi: focusable ? f++ : -1,
        focusable,
        labelFont: fontFor(label, 'medium'),
        labelText: label,
        summaryText: r.summary || '',
        summaryX: inner - 51 - Math.min(textWidth(r.summary || '', 19, 'bold'), inner * 0.45 - 24),
        sumFont,
        inner,
      }
    })
  })
  // Rows are kept by key, so a refreshed panel updates each row in place.
  const rows = keyed(placed, (r) => r.rk)
  const focusables = createMemo(() => placed().filter((r) => r.focusable))
  const curRow = () => focusables()[cur()] || null
  const height = () => Math.min(laid().height, 950.4)
  const top = () => (1080 - height()) / 2
  const left = () => (1920 - width()) / 2
  // On the high tier a blur behind the 92 percent tint would settle on one even color, so that tier
  // gets that color. The lower tiers draw the plain tint.
  const fill = () => (perfTier() === 'high' ? '#131325' : '#141428eb')
  const titleFont = uiFont('bold')

  const keepInView = () => {
    const r = untrack(curRow)
    if (r) setScroll(scrollFor(r, untrack(scroll), untrack(height), untrack(laid).height))
  }
  createEffect(
    on(
      () => props.rows,
      () => {
        const n = untrack(focusables).length
        if (untrack(cur) >= n) setCur(Math.max(0, n - 1))
        keepInView()
      },
      { defer: true },
    ),
  )
  const step = (d) => {
    const next = cur() + d
    if (next < 0 || next >= focusables().length) return
    setCur(next)
    keepInView()
  }
  return (
    <view
      ref={(n) => {
        n.current = () => untrack(curRow)
        // The focused row's box on the screen, for the TV's own keyboard to sit over.
        n.currentRect = () => {
          const r = untrack(curRow)
          return r ? { x: left() + 25, y: top() + r.y - scroll(), w: width() - 50, h: r.h } : null
        }
        // Puts focus on the row with this id, as the panel opens or after the row it was on went away.
        n.select = (id) => {
          const i = untrack(focusables).findIndex((r) => r.id === id)
          if (i >= 0) setCur(i)
          keepInView()
          return i >= 0
        }
        n.reset = () => {
          setCur(0)
          setScroll(0)
        }
        n.step = step
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onFocusChanged={setFocused}
      onUp={() => {
        step(-1)
        return true
      }}
      onDown={() => {
        step(1)
        return true
      }}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        const r = curRow()
        if (r && props.onPanelSelect) props.onPanelSelect(r)
        return true
      }}
    >
      <view width={1920} height={1080} color="#00000073" />
      <view x={left()} y={top()} width={width()} height={height()} borderRadius={28} color={fill()} border={EDGE} />
      <view x={left()} y={top()} width={width()} height={height()} clipping>
        <view y={-scroll()} width={width()} height={laid().height}>
          <text
            fontFamily={props.neon ? displayFont('bold', props.title || '') : titleFont}
            fontSize={29}
            x={37}
            y={31}
            lineHeight={33}
            letterSpacing={props.neon ? 0.4 : 0}
            color={props.neon ? '#ff2e92' : '#ffffff'}
            textShadow={props.neon ? NEON_GLOW : undefined}
          >
            {props.title || ''}
          </text>
          <view>
            <For each={rows.keys()}>
              {(k) => {
                const row = rows.item(k)
                return <PanelRow r={row()} neon={props.neon} focused={focused() && row().fi === cur()} />
              }}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}
