import { Show, createMemo } from 'solid-js'
import ClassicCard from './home/ClassicCard.jsx'
import { homeLook } from './home/look.js'
import { classicCard } from './home/cards.js'
import * as settings from '../../state/settings.js'
import { shadowColor } from '../theme.js'

// A media card, purely visual: whatever owns it decides focus, so a focus change only animates
// alpha and scale. `card` is a ui/models.js toCard(). With look="media" it draws the classic card
// the way Details lays out grids and seasons, from the card's raw item in its `cardType` shape, and
// for a season its Seerr marker from `seerrSeason`.
const RING_SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 0, blur: 24, spread: 2 }
const COVER = { resizeMode: { type: 'cover' } }

export default function Card(props) {
  const c = () => props.card || {}
  const plain = () => !props.look
  const lit = () => !!props.focused && plain()
  const round = () => (c().type === 'circle' ? props.w / 2 : 10)
  const smart = createMemo(() => {
    const raw = props.look === 'media' && props.card && props.card.raw
    if (!raw) return null
    const s = settings.all()
    const look = { ...homeLook({ ...s, homeRowsStyle: 'v1' }), plain: true }
    const model = classicCard(raw, props.card.idx || 0, {
      s,
      cardType: props.cardType || 'portrait',
      imageType: 'poster',
      plain: true,
      seerrSeason: props.seerrSeason,
    })
    return { model, look }
  })
  return (
    <view
      width={props.w}
      height={props.h}
      pivot={0.5}
      scale={lit() ? 1.06 : 1}
      transition={{ scale: { duration: 140 } }}
    >
      <Show when={plain()}>
        <view
          x={-5}
          y={-5}
          width={props.w + 10}
          height={props.h + 10}
          borderRadius={c().type === 'circle' ? (props.w + 10) / 2 : 14}
          color="#ffffffff"
          shadow={RING_SHADOW}
          alpha={lit() ? 1 : 0}
          transition={{ alpha: { duration: 140 } }}
        />
        <Show
          when={c().image}
          fallback={
            <view width={props.w} height={props.h} borderRadius={round()} color="#26262bff">
              <text x={14} y={14} fontFamily={c().titleFont} fontSize={24} maxWidth={props.w - 28} maxLines={4} color="#9a9aa0ff">
                {c().title}
              </text>
            </view>
          }
        >
          <view width={props.w} height={props.h} borderRadius={round()} src={c().image} textureOptions={COVER} />
        </Show>
        <Show when={c().progress > 0.01}>
          <view x={10} y={props.h - 16} width={props.w - 20} height={6} borderRadius={3} color="#000000aa">
            <view height={6} borderRadius={3} color="#00a4dcff" width={(props.w - 20) * c().progress} />
          </view>
        </Show>
        <Show when={c().played}>
          <view x={props.w - 42} y={10} width={32} height={32} borderRadius={16} color="#00a4dcff">
            <view x={6} y={6} width={20} height={20} src="icons/check.webp" />
          </view>
        </Show>
        <text y={props.h + 14} fontFamily={c().titleFont} fontSize={22} maxWidth={props.w} maxLines={1} color={lit() ? '#ffffffff' : '#c8c8ccff'}>
          {c().title}
        </text>
        <text y={props.h + 44} fontFamily={c().subtitleFont} fontSize={19} maxWidth={props.w} maxLines={1} color="#8a8a90ff">
          {c().subtitle}
        </text>
      </Show>
      <view>
        <Show when={smart()} keyed>
          {(sm) => <ClassicCard card={sm.model} focused={props.focused} look={sm.look} />}
        </Show>
      </view>
    </view>
  )
}
