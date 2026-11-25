import $L from '../../../services/i18n.js'
import { For, Match, Show, Switch, createMemo } from 'solid-js'
import HomePreview from './HomePreview.jsx'
import MediaBarMoonfin from './mediaBarMoonfin.jsx'
import MediaBarMakd from './mediaBarMakd.jsx'
import MediaBarBookshelf from './mediaBarBookshelf.jsx'
import MediaBarGallery from './mediaBarGallery.jsx'
import MediaBarBanner from './mediaBarBanner.jsx'
import MediaBarAya from './mediaBarAya.jsx'
import { fallbackShapes, gradientUrl, rowPeekCover, toBottomRight, withNewReleasePreview } from './mediaBarKit.js'

// The media bar in [mode] on the sample titles, or its drawn stand-in until they arrive. [homeRows]
// are Home's own rows, the first of which peeks along the bottom while Peek Home Rows is on. The bars
// lay their content out above it and the Bookshelf scales down from the top, the way Home makes room
// for it.
const BARS = ['moonfin', 'makd', 'bookshelf', 'gallery', 'banner', 'aya', 'off']
const OFF_PICK = { kind: 'rows', modern: true, focusFirst: true }
// The stand in on its 320 by 140 box, fit into the screen and centered.
const FB_SCALE = Math.min(960 / 320, 540 / 140)
const FB_X = (960 - 320 * FB_SCALE) / 2
const FB_Y = (540 - 140 * FB_SCALE) / 2

export default function MediaBarPreview(props) {
  const bar = () => (BARS.indexOf(props.mode) >= 0 ? props.mode : 'moonfin')
  const live = () => (props.items || []).length > 0
  const shown = createMemo(() => {
    if (!live()) return []
    const list = props.s.hideHomeMediaDescription ? props.items.map((item) => ({ ...item, overview: '' })) : props.items
    return withNewReleasePreview(list, !!props.s.mediaBarNewReleaseBanner)
  })
  const first = () => {
    const rows = props.homeRows
    return rows && rows.length ? rows[0] : { id: 'resume', title: $L('Continue Watching'), shape: 'landscape' }
  }
  const peek = createMemo(() => (live() ? rowPeekCover(props.s, bar(), first(), props.s.homeRowsStyle !== 'v1') : 0))
  const peekPick = createMemo(() => ({ kind: 'peek', top: 540 - peek(), row: first() }))
  const fallback = createMemo(() => {
    if (live()) return []
    const stops = [[props.t.accentA(0.34), 0], [props.t.surface, 1]]
    const grad = (b) => gradientUrl({ w: b.w, h: b.h, angle: toBottomRight(b.w, b.h), stops })
    return fallbackShapes(bar(), props.t).map((b) => ({ ...b, src: b.grad ? grad(b) : '' }))
  })
  return (
    <view width={960} height={540}>
      <view x={FB_X} y={FB_Y} scale={FB_SCALE} pivot={0} width={320} height={140} clipping>
        <For each={fallback()}>
          {(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={b.r} alpha={b.a} src={b.src} color={b.src ? '#ffffffff' : b.c} />}
        </For>
      </view>
      <view>
        <Show when={live()}>
          <view width={960} height={540} color={props.t.background} />
        </Show>
      </view>
      <view>
        <Show when={live()}>
          <Switch>
            <Match when={bar() === 'moonfin'}>
              <MediaBarMoonfin s={props.s} t={props.t} items={shown()} peek={peek()} />
            </Match>
            <Match when={bar() === 'makd'}>
              <MediaBarMakd s={props.s} t={props.t} items={shown()} peek={peek()} />
            </Match>
            <Match when={bar() === 'bookshelf'}>
              <view width={960} height={540} scale={(540 - peek()) / 540} pivotX={0.5} pivotY={0}>
                <MediaBarBookshelf s={props.s} t={props.t} items={shown()} />
              </view>
            </Match>
            <Match when={bar() === 'gallery'}>
              <MediaBarGallery s={props.s} t={props.t} items={shown()} peek={peek()} />
            </Match>
            <Match when={bar() === 'banner'}>
              <MediaBarBanner s={props.s} t={props.t} items={shown()} />
            </Match>
            <Match when={bar() === 'aya'}>
              <MediaBarAya s={props.s} t={props.t} items={shown()} peek={peek()} />
            </Match>
            <Match when={bar() === 'off'}>
              <HomePreview s={props.s} items={shown()} pick={OFF_PICK} />
            </Match>
          </Switch>
        </Show>
      </view>
      <view>
        <Show when={live() && peek()}>
          <HomePreview s={props.s} items={shown()} pick={peekPick()} homeRows={props.homeRows} />
        </Show>
      </view>
    </view>
  )
}
