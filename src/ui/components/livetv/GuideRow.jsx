import { For, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import Spinner from '../Spinner.jsx'
import { hex } from '../../color.js'
import { keyed } from '../library/pageKit.js'
import { uiFont } from '../../text.js'
import { tx } from '../../fx.js'

// One channel's row in the guide, purely visual. The page owns focus and passes the focused cell's
// key ('ch' for the channel cell). The cell parts come as flat lists from flattenCells, each list in
// its own container so the layers keep their order.
const NO_CELL = { x: 0, w: 0, a: 0 }
const CONTAIN = { resizeMode: { type: 'contain' } }
const CH_EDGE = { width: 1.5, color: hex('#00a4dcb3') }
const CELL_EDGE = { width: 3, color: hex('#00a4dc') }
const BAR_R = [4, 0, 0, 4]
const byK = (it) => it.k

export default function GuideRow(props) {
  const [hide, setHide] = createSignal('')
  const fl = () => props.fl
  const ch = () => props.ch
  const onCh = () => props.focusKey === 'ch'
  const isFocused = createSelector(() => props.focusKey)
  const cells = keyed(() => fl().cells, (c) => c.key)
  const bars = keyed(() => fl().bars, byK)
  const markers = keyed(() => fl().markers, byK)
  const titles = keyed(() => fl().titles, byK)
  const metas = keyed(() => fl().metas, byK)
  const dots = keyed(() => fl().dots, byK)
  const spins = keyed(() => fl().spins, byK)
  const progress = keyed(() => fl().progress, byK)
  const mq = keyed(() => props.mq || [], byK)
  const logo = keyed(() => ch().logo, byK)
  const fav = keyed(() => ch().fav, byK)
  const num = keyed(() => ch().num, byK)

  // The row draws one focus layer and one brighter bar over the focused cell, so a move changes
  // those few nodes rather than running a focus binding on every cell.
  const focusCell = createMemo(() => {
    const k = props.focusKey
    return (k && k !== 'ch' && fl().cells.find((c) => c.key === k)) || NO_CELL
  })
  // Over the bar's 0.5a, a second one at 0.4a / (1 - 0.5a) shows as the focused bar's 0.9a.
  const focusBar = createMemo(() => {
    const k = props.focusKey
    const b = k && k !== 'ch' ? fl().bars.find((x) => x.ck === k) : null
    return b && !b.live ? b : null
  })
  // The marquee draws its own copy of the focused cell's overflowing lines, so those hide. Set
  // only when it changes, which a cell whose lines all fit never does.
  createEffect(
    on([() => props.focusKey, () => props.mqOn], ([k, mqOn]) => {
      const over = (t) => t.ck === k && t.over > 0
      const f = fl()
      setHide(mqOn && k && k !== 'ch' && (f.titles.some(over) || f.metas.some(over)) ? k : '')
    }),
  )
  const hidden = (t) => t.ck === hide() && t.over > 0

  return (
    <view
      y={props.y || 0}
      width={1850}
      height={87}
      // Focus scrolls the guide to the row, so the Magic Remote's cursor rings the channel or a
      // program and a click focuses it and presses it (app/pointer.js).
      pointerItems={() =>
        props.onPointerCell
          ? [{ x: 9, y: 0, w: 278, h: 87, r: 14.5, key: 'ch' }].concat(fl().cells.map((c) => ({ x: 297 + c.x, y: 3, w: c.w, h: 81, r: 9, key: c.key })))
          : []
      }
      pointerItemRing
      onPointerItemClick={(it) => props.onPointerCell(it.key)}
    >
      <view x={9} width={278} height={87} borderRadius={14.5} color="#353940f0" alpha={onCh() ? 0 : 1} />
      <view x={9} width={278} height={87} borderRadius={14.5} color="#00a4dc29" border={CH_EDGE} alpha={onCh() ? 1 : 0} />
      <view>
        <For each={logo.keys()}>{(k) => <view x={22} y={1} width={91} height={85} src={k} textureOptions={CONTAIN} />}</For>
      </view>
      <view>
        <For each={ch().fallback}>{() => <view x={56} y={32} width={23} height={23} src="icons/guide_tv.webp" color="#ffffff80" />}</For>
      </view>
      <view>
        <For each={fav.keys()}>
          {(k) => {
            const fv = fav.item(k)
            return <view x={fv().x} y={17.5} width={15} height={15} src="icons/favorite.webp" color="#f44336" />
          }}
        </For>
      </view>
      <view>
        <For each={num.keys()}>
          {(k) => {
            const n = num.item(k)
            return (
              <view x={n().x} y={8.5} width={n().w} height={33} borderRadius={10} color={onCh() ? '#00a4dc' : '#ffffff1f'}>
                <text fontFamily={uiFont('bold')} fontSize={19} x={9} y={n().ty} lineHeight={33} color={onCh() ? '#062430' : '#ffffffd9'}>
                  {n().text}
                </text>
              </view>
            )
          }}
        </For>
      </view>
      <text
        fontFamily={onCh() ? ch().nameFontFocus : ch().nameFont}
        fontSize={17.5}
        x={onCh() ? ch().nameXFocus : ch().nameX}
        y={ch().nameY}
        lineHeight={33}
        maxWidth={152}
        maxLines={1}
        color="#ffffff"
        alpha={onCh() && ch().nameOver > 0 && props.mqOn ? 0 : 1}
      >
        {ch().name}
      </text>
      <view x={296} width={1} height={87} color="#8ec8f054" />

      <view x={297} y={3} width={1553} height={81}>
        <view>
          <For each={cells.keys()}>
            {(k) => {
              const c = cells.item(k)
              return (
                <view x={c().x} width={c().w} height={81} alpha={c().a}>
                  <view width={c().w} height={81} borderRadius={9} color={c().bg} alpha={isFocused(k) ? 0 : 1} />
                </view>
              )
            }}
          </For>
        </view>
        <view x={focusCell().x} width={focusCell().w} height={81} borderRadius={9} color="#1c2c3c" border={CELL_EDGE} alpha={focusCell().a} />
        <view>
          <For each={bars.keys()}>
            {(k) => {
              const b = bars.item(k)
              return <view x={b().x} width={4} height={81} borderRadius={BAR_R} color={b().color} alpha={(b().live ? 0.9 : 0.5) * b().a} />
            }}
          </For>
        </view>
        <view
          x={focusBar() ? focusBar().x : 0}
          width={4}
          height={81}
          borderRadius={BAR_R}
          color={focusBar() ? focusBar().color : '#00000000'}
          alpha={focusBar() ? (0.4 * focusBar().a) / (1 - 0.5 * focusBar().a) : 0}
        />
        <view>
          <For each={markers.keys()}>
            {(k) => {
              const m = markers.item(k)
              return <view x={m().x} y={11} width={21} height={21} src="icons/continues_from.webp" color="#ffffffb3" alpha={m().a} />
            }}
          </For>
        </view>
        <view>
          <For each={titles.keys()}>
            {(k) => {
              const t = titles.item(k)
              return (
                <text
                  fontFamily={t().font}
                  fontSize={26}
                  x={t().x}
                  y={t().y}
                  lineHeight={t().lh}
                  maxWidth={t().w}
                  maxLines={t().lines}
                  color={t().color}
                  alpha={hidden(t()) ? 0 : t().a}
                >
                  {t().text}
                </text>
              )
            }}
          </For>
        </view>
        <view>
          <For each={metas.keys()}>
            {(k) => {
              const e = metas.item(k)
              return (
                <text
                  fontFamily={e().font}
                  fontSize={20}
                  x={e().x}
                  y={e().y}
                  lineHeight={23.4}
                  maxWidth={e().w}
                  maxLines={1}
                  color="#ffffff8c"
                  alpha={hidden(e()) ? 0 : e().a}
                >
                  {e().text}
                </text>
              )
            }}
          </For>
        </view>
        <view>
          <For each={dots.keys()}>
            {(k) => {
              const d = dots.item(k)
              return <view x={d().x} y={9} width={21} height={21} src={d().src} color={d().color} alpha={d().a} />
            }}
          </For>
        </view>
        <view>
          <For each={spins.keys()}>
            {(k) => {
              const sp = spins.item(k)
              return <Spinner x={sp().x} y={22.5} size={36} />
            }}
          </For>
        </view>
        <view>
          <For each={progress.keys()}>
            {(k) => {
              const p = progress.item(k)
              return (
                <view x={p().x} y={75} width={p().w} height={6} color="#404040" alpha={p().a}>
                  <view width={p().fill} height={6} color="#00a4dc" />
                </view>
              )
            }}
          </For>
        </view>
      </view>
      <view alpha={props.mqOn ? 1 : 0}>
        <For each={mq.keys()}>
          {(k) => {
            const q = mq.item(k)
            return (
              <view x={q().x} y={q().y} width={q().w} height={q().h} clipping>
                <text
                  fontFamily={q().font}
                  fontSize={q().size}
                  y={q().ty}
                  lineHeight={q().lh}
                  color={q().color}
                  transition={tx({ x: { duration: props.mqOn ? q().dur : 0, easing: 'linear' } })}
                  x={props.mqOn ? -q().over : 0}
                >
                  {q().text}
                </text>
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
