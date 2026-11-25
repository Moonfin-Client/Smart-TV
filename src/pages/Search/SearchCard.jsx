import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import LabelSet from '../../ui/components/home/LabelSet.jsx'
import { labelSets, watchMarks } from '../../ui/components/home/cardMarks.js'
import { highMs } from '../../ui/tier.js'
import { cssShift, uiFont } from '../../ui/text.js'
import { shadowColor } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'

// A search result card. It's purely visual, the row or grid that owns it passes focused. The art's
// badges and the admin's poster labels sit inside the 3px frame.
// card: { w, imgH, image, circle, placeholder, title, titleFont, subtitle, subtitleFont, watched, h,
//   serverName, serverW, serverFont, servers, serversW, labelsId, labelsTop, labelsTopRight, labelsBottom }
const COVER = { resizeMode: { type: 'cover' } }
const CLEAR = '#00000000'
const RING = { width: 3, color: hex('#ffffff') }
const WHITE_EDGE = { width: 1.5, color: hex('#ffffff') }
const MERGED_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 1, blur: 3, spread: 0 }
const WATCHED_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 1.5, blur: 8, spread: 0 }

export default function SearchCard(props) {
  const [marks, setMarks] = createSignal(0)
  const boldFont = uiFont('bold')
  const shift18 = cssShift(18)
  const c = () => props.card
  const ms = highMs(200)
  const radius = () => (c().circle ? c().w / 2 : 8)
  const innerRadius = () => (c().circle ? (c().w - 6) / 2 : 5)
  let watcher = null
  const bump = () => setMarks(marks() + 1)
  // Most cards never hear anything, so they only redraw when there's something to show or clear.
  const followMarks = () => {
    const had = watcher && watcher.read()
    if (watcher) watcher.stop()
    watcher = c() && c().labelsId ? watchMarks(c(), bump) : null
    const now = watcher && watcher.read()
    if ((had && (had.badges.length || had.incomplete)) || (now && (now.badges.length || now.incomplete))) bump()
  }
  // A rebuilt row hands over a fresh copy of the same title, which keeps what it already heard.
  createEffect(
    on(c, (now, was) => {
      if (!was || now.labelsId !== was.labelsId || (now.raw && now.raw.Id) !== (was.raw && was.raw.Id)) followMarks()
    }),
  )
  onCleanup(() => watcher && watcher.stop())
  // Poster labels over the art inside the frame. Search draws no incomplete recording badge.
  const labels = createMemo(() => {
    marks()
    const seen = watcher ? watcher.read() : null
    return seen ? labelSets(seen.badges, c(), c().w - 6, c().imgH - 6, false, bump) : []
  })
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={c().w}
      height={c().h}
      pivot={0.5}
      scale={props.focused ? 1.08 : 1}
      transition={{ scale: { duration: ms, easing: 'ease' } }}
    >
      <view width={c().w} height={c().imgH} borderRadius={radius()} color="#ffffff14" />
      <view>
        <Show
          when={c().image}
          fallback={
            <view
              x={c().w / 2 - 22}
              y={c().imgH / 2 - 22}
              width={44}
              height={44}
              src={'icons/' + c().placeholder + '.webp'}
              color="#ffffff33"
            />
          }
        >
          <view x={3} y={3} width={c().w - 6} height={c().imgH - 6} borderRadius={innerRadius()} src={c().image} textureOptions={COVER} />
        </Show>
      </view>
      <view>
        <Show when={c().servers}>
          <view x={9} y={c().imgH - 41} width={c().serversW} height={30}>
            <view width={c().serversW} height={30} borderRadius={15} color={CLEAR} shadow={MERGED_SHADOW} />
            <view width={c().serversW} height={30} borderRadius={15} color="#000000bf" border={WHITE_EDGE} />
            <view x={9} y={6} width={18} height={18} src="icons/dns.webp" color="#ffffff" />
            <text fontFamily={boldFont} fontSize={18} x={31} y={6} lineHeight={18} color="#ffffff">
              {c().servers}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={c().serverName}>
          <view x={c().w - 11 - c().serverW} y={11} width={c().serverW} height={41} borderRadius={4} color="#000000bf">
            <text
              fontFamily={c().serverFont}
              fontSize={18}
              x={10}
              y={4 + shift18}
              lineHeight={33}
              maxWidth={c().serverW - 20}
              maxLines={1}
              color="#ffffff"
            >
              {c().serverName}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={c().watched}>
          <view x={c().w - 38} y={11} width={27} height={27}>
            <view x={4} y={4} width={19} height={19} borderRadius={9.5} color={CLEAR} shadow={WATCHED_SHADOW} />
            <view width={27} height={27} borderRadius={13.5} color={c().watchedColor} border={WHITE_EDGE} />
            <view x={6.5} y={6.5} width={14} height={14} src="icons/watched_check.webp" color="#ffffff" />
          </view>
        </Show>
      </view>
      <view x={3} y={3}>
        <For each={labels()}>{(ls) => <LabelSet w={c().w - 6} h={c().imgH - 6} nodes={ls.nodes} />}</For>
      </view>
      <view width={c().w} height={c().imgH} borderRadius={radius()} color={CLEAR} border={RING} alpha={props.focused ? 1 : 0} />
      <text fontFamily={c().titleFont} fontSize={15} lineHeight={33} y={c().imgH + 9.5} maxWidth={c().w} maxLines={1} color="#ffffff">
        {c().title}
      </text>
      <text fontFamily={c().subtitleFont} fontSize={13} lineHeight={33} y={c().imgH + 44} maxWidth={c().w} maxLines={1} color="#ffffff99">
        {c().subtitle}
      </text>
    </view>
  )
}
