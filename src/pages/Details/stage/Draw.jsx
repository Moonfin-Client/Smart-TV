import { For } from 'solid-js'
import { hex } from '../../../ui/color.js'
import { byKey } from '../../../ui/components/details/keyed.js'

// Draws a display list from Draw.js, keyed so an entry that stays keeps its node and only what
// changed is set again. `list` is {rects, imgs, texts}. Rects, pictures and texts each draw in a
// container of their own, in that order. `w` and `h` size them inside a scrolling track, which an
// unsized view would take from its parent once and then be culled by.
const GONE = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, color: '#00000000', bw: 0, bc: '#00000000', src: '', text: '', size: 20, font: 'roboto', lh: 0, maxw: 0, maxlines: 0, ls: 0 }

// Rich text arrives wrapped in [i] tags, but this renderer takes a font style, so the tags come off.
const plain = (tx) => (tx.rich ? String(tx.text).replace(/^\[i\]/, '').replace(/\[\/i\]$/, '') : tx.text)

export default function Draw(props) {
  const rects = byKey(() => props.list && props.list.rects, GONE)
  const imgs = byKey(() => props.list && props.list.imgs, GONE)
  const texts = byKey(() => props.list && props.list.texts, GONE)
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.w} height={props.h} alpha={props.alpha == null ? 1 : props.alpha}>
      <view width={props.w} height={props.h}>
        <For each={rects.keys()}>
          {(k) => (
            <view
              x={rects.at(k).x}
              y={rects.at(k).y}
              width={rects.at(k).w}
              height={rects.at(k).h}
              borderRadius={rects.at(k).r}
              color={rects.at(k).color}
              border={rects.at(k).bw ? { width: rects.at(k).bw, color: hex(rects.at(k).bc) } : undefined}
            />
          )}
        </For>
      </view>
      <view width={props.w} height={props.h}>
        <For each={imgs.keys()}>
          {(k) => (
            <view
              x={imgs.at(k).x}
              y={imgs.at(k).y}
              width={imgs.at(k).w}
              height={imgs.at(k).h}
              src={imgs.at(k).src || undefined}
              color={imgs.at(k).color}
              borderRadius={imgs.at(k).r}
              textureOptions={{ resizeMode: { type: imgs.at(k).fit || 'cover' } }}
            />
          )}
        </For>
      </view>
      <view width={props.w} height={props.h}>
        <For each={texts.keys()}>
          {(k) => (
            <text
              x={texts.at(k).x}
              y={texts.at(k).y}
              fontFamily={texts.at(k).font}
              fontStyle={texts.at(k).rich ? 'italic' : 'normal'}
              fontSize={texts.at(k).size}
              color={texts.at(k).color}
              lineHeight={texts.at(k).lh || undefined}
              letterSpacing={texts.at(k).ls || 0}
              maxWidth={texts.at(k).maxw || undefined}
              maxLines={texts.at(k).maxw ? texts.at(k).maxlines || undefined : undefined}
              textShadow={texts.at(k).shadow || undefined}
            >
              {plain(texts.at(k))}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
