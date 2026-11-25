import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { displayFont, fontFor, themeSpacing, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { focusMs } from './motion.js'
import { layoutSide } from './sideLayout.js'
import { activeThemeId } from '../../theme.js'
import { keyed } from './pageKit.js'
import * as settings from '../../../state/settings.js'

// The sort and settings sheet the Genres and Favorites screens slide in from the right. Up and Down
// move between rows and Enter calls onSideSelect(row) on the holder. Its node has select(id).
// `neon` draws the Genres sheet's Neon Pulse look (Favorites has none), and `metrics`
// ({ titleGap, labelGap, radioH, restInk }) takes Favorites' roomier sheet, whose resting options are
// dimmer.
// shortcut: the sheet's backdrop blur isn't drawn, only its 92 percent tint.
const FOCUSABLE = { radio: 1, setting: 1 }
const ACCENT_EDGE = { width: 1, color: hex('#00a4dc') }
const RADIO_EDGE = { width: 1, color: hex('#ffffff66') }
const NEON = {
  accent: '#ff2e92',
  cyan: '#00e5ff',
  glow: { color: '#ff2e9259', x: 0, y: 0, blur: 8 },
  edge: { width: 1, color: hex('#ff2e92') },
  lit: '#ff2e9226',
  picked: '#ff2e921f',
}

export default function SidePanel(props) {
  const [cur, setCur] = createSignal(0)
  const [shown, setShown] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const ms = focusMs(250)
  const placed = createMemo(() => {
    let f = 0
    return layoutSide(props.rows || [], props.metrics, activeThemeId(settings.all()) === 'neon_pulse')
      .filter((r) => r.kind !== 'end')
      .map((r, i) => ({
        ...r,
        rk: (r.id || r.kind) + '-' + i,
        fi: FOCUSABLE[r.kind] ? f++ : -1,
        font: r.kind === 'radio' ? fontFor(r.label || '', 'medium') : props.neon && (r.kind === 'title' || r.kind === 'setting') ? displayFont('bold', r.label || '') : uiFont('bold'),
        valueFont: uiFont(),
        text: r.kind === 'header' || r.kind === 'label' ? String(r.label || '').toUpperCase() : r.label || '',
        isLabel: r.kind === 'header' || r.kind === 'label',
        isTitle: r.kind === 'title',
        isRadio: r.kind === 'radio',
        isSetting: r.kind === 'setting',
      }))
  })
  const focusables = createMemo(() => placed().filter((r) => r.fi >= 0))
  const labels = createMemo(() => placed().filter((r) => r.isLabel || r.isTitle))
  // A pick hands in new rows, so each one is drawn by key and only what changed is set again.
  const labelRows = keyed(labels, (r) => r.rk)
  const optionRows = keyed(focusables, (r) => r.rk)
  onMount(() => {
    const t = setTimeout(() => setShown(true), 16)
    onCleanup(() => clearTimeout(t))
  })
  return (
    <view
      ref={(n) => {
        n.select = (id) => {
          const i = focusables().findIndex((r) => r.id === id)
          if (i >= 0) setCur(i)
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      onFocusChanged={setFocused}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (cur() < focusables().length - 1) setCur(cur() + 1)
        return true
      }}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        const r = focusables()[cur()]
        if (r && props.onSideSelect) props.onSideSelect(r)
        return true
      }}
    >
      <view width={1920} height={1080} color="#00000073" />
      <view x={shown() ? 1475 : 1920} width={445} height={1080} transition={{ x: { duration: ms, easing: 'ease-out' } }}>
        <view width={445} height={1080} color="#141428eb" />
        <view width={1} height={1080} color="#ffffff0f" />
        <view>
          <For each={labelRows.keys()}>
            {(k) => {
              const lb = labelRows.item(k)
              return (
                <text
                  fontFamily={lb().font}
                  fontSize={lb().isTitle ? 28 : lb().kind === 'header' ? 14 : 13}
                  lineHeight={33}
                  x={33}
                  y={lb().y}
                  letterSpacing={lb().isTitle ? (props.neon ? 0.4 : 0) : 1}
                  color={lb().isTitle ? (props.neon ? NEON.accent : '#ffffff') : props.neon ? NEON.cyan : '#ffffff66'}
                  textShadow={lb().isTitle && props.neon ? NEON.glow : undefined}
                >
                  {lb().text}
                </text>
              )
            }}
          </For>
        </view>
        <view>
          <For each={optionRows.keys()}>
            {(k) => {
              const op = optionRows.item(k)
              const lit = () => focused() && op().fi === cur()
              return (
                <view x={33} y={op().y} width={380} height={op().h}>
                  <view width={380} height={op().h} borderRadius={8} color={op().selected ? (props.neon ? NEON.picked : '#00a4dc1f') : '#00000000'} />
                  <view
                    width={380}
                    height={op().h}
                    borderRadius={8}
                    color={props.neon ? NEON.lit : '#ffffff1a'}
                    border={props.neon ? NEON.edge : ACCENT_EDGE}
                    alpha={lit() ? 1 : 0}
                  />
                  <Show when={op().isRadio}>
                    <view x={17} y={(op().h - 22) / 2} width={22} height={22} borderRadius={11} color="#00000000" border={RADIO_EDGE} />
                    <Show when={op().selected}>
                      <view x={23} y={(op().h - 22) / 2 + 6} width={10} height={10} borderRadius={5} color={props.neon ? NEON.accent : '#00a4dc'} />
                    </Show>
                  </Show>
                  <text
                    fontFamily={op().font}
                    fontSize={op().isRadio ? 18 : 19}
                    x={op().isRadio ? 53 : 17}
                    y={op().isRadio ? (op().h - 22) / 2 : 19}
                    maxWidth={340}
                    maxLines={1}
                    letterSpacing={props.neon && op().isSetting ? 0.4 : themeSpacing()}
                    color={props.neon && op().isSetting ? NEON.accent : op().isRadio && !op().selected && !lit() && props.metrics ? props.metrics.restInk : '#ffffff'}
                    textShadow={props.neon && op().isSetting ? NEON.glow : undefined}
                  >
                    {op().text}
                  </text>
                  <Show when={op().isSetting}>
                    <text fontFamily={op().valueFont} fontSize={16} x={17} y={45} letterSpacing={themeSpacing()} color={props.neon ? NEON.cyan : '#ffffff8c'}>
                      {op().value || ''}
                    </text>
                  </Show>
                </view>
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
