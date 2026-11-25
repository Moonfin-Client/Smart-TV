import { For, createMemo } from 'solid-js'
import PartyImage from './PartyImage.jsx'
import { keyed } from '../library/pageKit.js'
import { hex } from '../../color.js'

// Draws a screen laid out in pixels (pages/WatchParty/sheet.js) from plain lists: boxes (one with a
// `src` is a tinted icon), then border rings, then pictures, then the boxes and rings that sit on
// pictures, then text, each list in its own layer. Text arrives already wrapped and cut. Items keep
// their keys across focus moves and only change color or alpha, so a move never builds or reorders
// nodes.
const byK = (it) => it.k

const Boxes = (props) => {
  const l = keyed(props.list, byK)
  return (
    <view>
      <For each={l.keys()}>
        {(k) => {
          const b = l.item(k)
          return <view x={b().x} y={b().y} width={b().w} height={b().h} color={b().c} borderRadius={b().r} alpha={b().a} src={b().src} />
        }}
      </For>
    </view>
  )
}

const Rings = (props) => {
  const l = keyed(props.list, byK)
  return (
    <view>
      <For each={l.keys()}>
        {(k) => {
          const g = l.item(k)
          return (
            <view
              x={g().x}
              y={g().y}
              width={g().w}
              height={g().h}
              color="#00000000"
              borderRadius={g().r}
              border={{ width: g().bw, color: hex(g().c) }}
              alpha={g().a}
            />
          )
        }}
      </For>
    </view>
  )
}

export default function PartyPaint(props) {
  const p = () => props.paint
  const pics = keyed(() => p().pics, byK)
  const texts = keyed(() => p().texts, byK)
  return (
    <view>
      <Boxes list={() => p().boxes} />
      <Rings list={() => p().rings} />
      <view>
        <For each={pics.keys()}>
          {(k) => {
            const it = pics.item(k)
            // Every layout hands over a new list, which would send the picture back to its first address.
            const srcs = createMemo(() => it().srcs, undefined, { equals: (a, b) => a.join('|') === b.join('|') })
            return (
              <view alpha={it().a == null ? 1 : it().a}>
                <PartyImage x={it().x} y={it().y} w={it().w} h={it().h} r={it().r} srcs={srcs()} />
              </view>
            )
          }}
        </For>
      </view>
      <Boxes list={() => p().boxes2} />
      <Rings list={() => p().rings2} />
      <view>
        <For each={texts.keys()}>
          {(k) => {
            const t = texts.item(k)
            return (
              <text
                x={t().x}
                y={t().y}
                mountX={t().mx}
                fontFamily={t().f}
                fontSize={t().s}
                lineHeight={t().lh}
                letterSpacing={t().ls}
                color={t().c}
                alpha={t().a}
              >
                {t().t}
              </text>
            )
          }}
        </For>
      </view>
    </view>
  )
}
