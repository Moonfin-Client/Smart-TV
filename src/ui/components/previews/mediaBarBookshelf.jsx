import { For, createMemo } from 'solid-js'
import { cssShift, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { cssShadow } from '../account/gradient.js'
import { genreGlowRgb } from '../home/galleryGlow.js'
import { padIndex, rgbA } from '../home/barMath.js'
import { gradientUrl } from './mediaBarKit.js'
import { COVER, artColor, itemAt } from './kit.js'

// The Bookshelf bar preview: the first title face out in the middle of a wooden shelf, a row of
// book spines either side in their genre's color, each numbered with its title running up it, all
// standing on a plank along the bottom.
const ACTIVE_H = 540 * 0.84
const ACTIVE_W = ACTIVE_H * 0.72
const SPINE_H = 540 * 0.76
const SPINE_W = 36
const CENTER_W = ACTIVE_W + 56
const MAX_SIDE = Math.min(20, Math.max(1, Math.floor((960 - CENTER_W) / 2 / (SPINE_W + 4))))
const FLOOR = 540 - 12
const ROW_W = MAX_SIDE * 2 * (SPINE_W + 4) + 16 + ACTIVE_W
const ROW_X = (960 - ROW_W) / 2
const ACTIVE_X = ROW_X + MAX_SIDE * (SPINE_W + 4) + 8
const ACTIVE_Y = FLOOR - ACTIVE_H
const ART_X = ACTIVE_W * 0.12
const SIDE_W = (960 - CENTER_W - 16) / 2
// Number, rule and padding above the title, and the 8 under it.
const LABEL_TOP = 8 + 33 + 4 + 16 + 4
const LABEL_LEN = SPINE_H - LABEL_TOP - 8
const NUM_Y = 8 + cssShift(10.5)
const TEXT_Y = cssShift(10.5)
const SPINE_SHADOW = cssShadow(SPINE_W, SPINE_H, 6, { y: 3, blur: 6, color: shadowColor('#0000008c') })
const BOOK_SHADOW = cssShadow(ACTIVE_W, ACTIVE_H, 3, { y: 6, blur: 14, color: shadowColor('#000000bf') })
const PLANK_SHADOW = cssShadow(960, 13, 0, { y: -2, blur: 5, color: shadowColor('#000000a6') })

export default function MediaBarBookshelf(props) {
  const font = uiFont('bold')
  const active = () => props.items[0]
  const spines = createMemo(() => {
    const out = []
    const add = (i, slot) => {
      const item = itemAt(props.items, i)
      const glow = rgbA(genreGlowRgb(item.genres))
      out.push({
        k: 's' + i,
        x: slot < MAX_SIDE ? ROW_X + 2 + slot * (SPINE_W + 4) : ACTIVE_X + ACTIVE_W + 8 + 2 + (slot - MAX_SIDE) * (SPINE_W + 4),
        num: padIndex(i),
        title: (item.title || '').toUpperCase(),
        src: gradientUrl({ w: SPINE_W, h: SPINE_H, angle: 90, stops: [['#00000059', 0], ['#ffffff1f', 0.25], [glow, 0.6], ['#00000073', 1]] }),
      })
    }
    for (let i = MAX_SIDE, slot = 0; i >= 1; i--, slot++) add(i, slot)
    for (let i = MAX_SIDE + 1, slot = MAX_SIDE; i <= MAX_SIDE * 2; i++, slot++) add(i, slot)
    return out
  })
  return (
    <view width={960} height={540}>
      <view width={SIDE_W} height={540} colorLeft="#130905ff" colorRight="#23150dff" />
      <view x={SIDE_W} width={CENTER_W + 16} height={540} color="#382314ff">
        <view x={8} width={CENTER_W} height={540} color="#1c100aff" />
      </view>
      <view x={SIDE_W + CENTER_W + 16} width={SIDE_W} height={540} colorLeft="#23150dff" colorRight="#130905ff" />
      <view>
        <For each={spines()}>
          {(sp) => (
            <view x={sp.x} y={117.6} width={36} height={410.4}>
              <view x={SPINE_SHADOW.x} y={SPINE_SHADOW.y} width={SPINE_SHADOW.w} height={SPINE_SHADOW.h} borderRadius={SPINE_SHADOW.r} color="#00000000" shadow={SPINE_SHADOW.shadow} />
              <view width={36} height={410.4} borderRadius={6} src={sp.src} color="#ffffffff" />
              <text fontFamily={font} fontSize={10.5} lineHeight={33} letterSpacing={0.5} y={NUM_Y} maxWidth={36} contain="width" textAlign="center" color="#e5d5b8e6">
                {sp.num}
              </text>
              <view x={17.5} y={45} width={1} height={16} color="#e5d5b840" />
              <text
                x={18 + TEXT_Y}
                y={LABEL_TOP + LABEL_LEN / 2}
                mountX={0.5}
                mountY={0.5}
                rotation={-Math.PI / 2}
                fontFamily={font}
                fontSize={10.5}
                lineHeight={33}
                letterSpacing={1.2}
                maxWidth={LABEL_LEN}
                maxLines={1}
                contain="width"
                textAlign="center"
                color="#e5d5b8ff"
              >
                {sp.title}
              </text>
            </view>
          )}
        </For>
      </view>
      <view x={ACTIVE_X + BOOK_SHADOW.x} y={ACTIVE_Y + BOOK_SHADOW.y} width={BOOK_SHADOW.w} height={BOOK_SHADOW.h} borderRadius={BOOK_SHADOW.r} color="#00000000" shadow={BOOK_SHADOW.shadow} />
      <view x={ACTIVE_X} y={ACTIVE_Y} width={ACTIVE_W} height={ACTIVE_H} borderRadius={[3, 8, 8, 3]} color={rgbA(genreGlowRgb(active().genres))} />
      <view
        x={ACTIVE_X + ART_X}
        y={ACTIVE_Y}
        width={ACTIVE_W - ART_X}
        height={ACTIVE_H}
        borderRadius={[0, 8, 8, 0]}
        src={active().posterUrl || ''}
        textureOptions={COVER}
        color={artColor(active().posterUrl, props.t)}
      />
      <view x={PLANK_SHADOW.x} y={527 + PLANK_SHADOW.y} width={PLANK_SHADOW.w} height={PLANK_SHADOW.h} color="#00000000" shadow={PLANK_SHADOW.shadow} />
      <view y={527} width={960} height={13} colorTop="#5a3d28ff" colorBottom="#26180eff" />
      <view y={527} width={960} height={1} color="#ffffff14" />
    </view>
  )
}
