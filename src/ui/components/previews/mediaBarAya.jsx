import { For, Show, createMemo } from 'solid-js'
import HomePreview from './HomePreview.jsx'
import MediaBarLogo, { MediaBarRelease } from './mediaBarLogo.jsx'
import { dotsLayout } from './mediaBarKit.js'
import { COVER, artColor } from './kit.js'

// The Aya bar preview: artwork first in a framed panel taking 65 percent of the screen, the logo top
// left and the page marks top right, Home's modern rows underneath. With [peek] it grows down to the
// peeking row, which MediaBarPreview draws over the space left.
const ROWS_PICK = { kind: 'rows', modern: true }

export default function MediaBarAya(props) {
  const item = () => props.items[0]
  const barH = () => (props.peek ? 540 - 103 - props.peek : 540 * 0.65 - 103)
  const dots = createMemo(() => {
    const d = dotsLayout(props.s.featuredItemCount, { active: 16, inactive: 10, gap: 2.5, pill: true, height: 2 })
    return { x: 880 - 24 - d.w, marks: d.marks }
  })
  const rowsY = () => 71 + barH() + 32
  return (
    <view width={960} height={540}>
      <view x={80} y={71} width={800} height={barH()} borderRadius={18} src={item().backdropUrl || ''} textureOptions={COVER} color={artColor(item().backdropUrl, props.t)} />
      <MediaBarLogo x={124} y={111} w={340} h={100} align="topLeft" url={item().logoUrl} title={item().title} size={32} weight="bold" lh={32} ls={-0.5} ink={props.t.onSurface} />
      <view>
        <Show when={item().newRelease}>
          <MediaBarRelease x={124} y={219} />
        </Show>
      </view>
      <view x={dots().x} y={93}>
        <For each={dots().marks}>
          {(d) => <view x={d.x} y={d.y} width={d.w} height={d.h} borderRadius={d.r} color={d.first ? props.t.onSurface : props.t.onSurfaceA(0.3)} />}
        </For>
      </view>
      <view>
        <Show when={!props.peek}>
          <view y={rowsY()} width={960} height={540 - rowsY()} clipping>
            <HomePreview s={props.s} items={props.items} pick={ROWS_PICK} />
          </view>
        </Show>
      </view>
    </view>
  )
}
