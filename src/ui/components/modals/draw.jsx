import { For, createSignal, onCleanup, onMount } from 'solid-js'
import { byKey } from '../details/keyed.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'

// The modals lay themselves out as lists of plain pieces. Each list draws by key in a container of
// its own, so a piece that stays keeps its node and only what changed is set again. `list` is the
// array, read reactively.
//   Rects:  { k, x, y, w, h, r, color, bw, bc, a }
//   Glows:  { k, x, y, w, h, r, color, blur, spread, oy }, a shadow on a clear node
//   Imgs:   { k, x, y, w, h, r, src, fit }
//   Icons:  { k, x, y, w, h, src, color, a }
//   Texts:  { k, x, y, t, font, size, color, lh, maxw, lines, ls, a }
const NO_RECT = { x: 0, y: 0, w: 0, h: 0, r: 0, color: '#00000000', bw: 0, bc: '#00000000', a: 0 }
const NO_TEXT = { x: 0, y: 0, t: ' ', font: 'Roboto', size: 20, color: '#00000000', lh: 0, maxw: 0, lines: 0, ls: 0, a: 0 }

const alphaOf = (e) => (e.a == null ? 1 : e.a)

export function Rects(props) {
  const L = byKey(() => props.list, NO_RECT)
  return (
    <view>
      <For each={L.keys()}>
        {(k) => {
          const e = () => L.at(k)
          return (
            <view
              x={e().x}
              y={e().y}
              width={e().w}
              height={e().h}
              borderRadius={e().r || 0}
              color={e().color}
              alpha={alphaOf(e())}
              border={e().bw ? { width: e().bw, color: hex(e().bc) } : undefined}
            />
          )
        }}
      </For>
    </view>
  )
}

export function Glows(props) {
  const L = byKey(() => props.list, NO_RECT)
  return (
    <view>
      <For each={L.keys()}>
        {(k) => {
          const e = () => L.at(k)
          return (
            <view
              x={e().x}
              y={e().y}
              width={e().w}
              height={e().h}
              borderRadius={e().r || 0}
              color="#00000000"
              shadow={{ color: shadowColor(e().color), x: 0, y: e().oy || 0, blur: e().blur || 0, spread: e().spread || 0 }}
            />
          )
        }}
      </For>
    </view>
  )
}

export function Imgs(props) {
  const L = byKey(() => props.list, NO_RECT)
  return (
    <view>
      <For each={L.keys()}>
        {(k) => {
          const e = () => L.at(k)
          return (
            <view
              x={e().x}
              y={e().y}
              width={e().w}
              height={e().h}
              borderRadius={e().r || 0}
              src={e().src || ''}
              alpha={e().src ? alphaOf(e()) : 0}
              textureOptions={{ resizeMode: { type: e().fit || 'cover' } }}
            />
          )
        }}
      </For>
    </view>
  )
}

export function Icons(props) {
  const L = byKey(() => props.list, NO_RECT)
  return (
    <view>
      <For each={L.keys()}>
        {(k) => {
          const e = () => L.at(k)
          return (
            <view
              x={e().x}
              y={e().y}
              width={e().w || 24}
              height={e().h || e().w || 24}
              src={e().src}
              color={e().color || '#ffffffff'}
              alpha={alphaOf(e())}
            />
          )
        }}
      </For>
    </view>
  )
}

export function Texts(props) {
  const L = byKey(() => props.list, NO_TEXT)
  return (
    <view>
      <For each={L.keys()}>
        {(k) => {
          const e = () => L.at(k)
          return (
            <text
              x={e().x}
              y={e().y}
              fontFamily={e().font}
              fontSize={e().size}
              color={e().color}
              lineHeight={e().lh || undefined}
              letterSpacing={e().ls || 0}
              maxWidth={e().maxw || undefined}
              maxLines={e().lines || undefined}
              alpha={alphaOf(e())}
            >
              {e().t || ' '}
            </text>
          )
        }}
      </For>
    </view>
  )
}

export const oneLine = (list) => list.map((tx) => ({ ...tx, maxw: tx.maxw || 4000, lines: 1 }))

// A modal's open animation: false as it mounts, true a moment later, so props bound to it with a
// transition animate in from their closed values.
export const appear = () => {
  const [on, setOn] = createSignal(false)
  onMount(() => {
    const t = setTimeout(() => setOn(true), 0)
    onCleanup(() => clearTimeout(t))
  })
  return on
}
