import $L from '../../../services/i18n.js'
import { Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import { NEW_EPISODES, NEW_MOVIE, NEW_SEASON, NEW_SERIES } from '../../../utils/mediaBarNewRelease.js'
import { cssShift, fontFor, uiFont } from '../../text.js'

// A media bar's new release label: a white rule down the left of an uppercase kind and, under it,
// the season, the episode or a new movie's tagline. It tells its parent how tall it drew through
// onSize(h), 0 when there's nothing to show.
// shortcut: the tagline is upright, since the app ships no italic Roboto. Add Roboto-BoldItalic to
// the fonts if the slant matters.
const LABELS = {
  [NEW_SERIES]: () => $L('New Series'),
  [NEW_SEASON]: () => $L('New Season'),
  [NEW_EPISODES]: () => $L('New Episodes'),
  [NEW_MOVIE]: () => $L('New Movie'),
}

const detailOf = (kind, season, episode) => {
  if (kind === NEW_MOVIE) return ''
  if (kind !== NEW_EPISODES) return $L('Season {number}').replace('{number}', season)
  return episode === '' || episode == null ? '' : `S${season}:E${episode}`
}

const LABEL_LH = 23 * 1.2
const SHIFT = { label: cssShift(23), line: cssShift(40) }
const LINE_LH = 40 * 1.15

export default function NewReleaseLabel(props) {
  const [quoteH, setQuoteH] = createSignal(0)
  const model = createMemo(() => {
    const kind = props.kind
    if (!kind || !LABELS[kind]) return null
    const label = LABELS[kind]().toUpperCase()
    const quote = kind === NEW_MOVIE ? props.tagline || '' : ''
    const detail = detailOf(kind, props.season, props.episode)
    return { label, labelFont: uiFont('bold'), quote, quoteFont: fontFor(quote, 'bold'), detail, detailFont: uiFont('bold') }
  })
  const height = createMemo(() => {
    const m = model()
    if (!m) return 0
    return LABEL_LH + (m.detail ? LINE_LH : m.quote ? quoteH() || LINE_LH : 0)
  })
  createEffect(on(height, (h) => props.onSize && props.onSize(h)))
  return (
    <view x={props.x} y={props.y}>
      <Show when={model()} keyed>
        {(m) => (
          <view>
            <view width={3} height={height()} color="#ffffffff" />
            <text
              x={20}
              y={SHIFT.label}
              fontFamily={m.labelFont}
              fontSize={23}
              lineHeight={27.6}
              letterSpacing={2}
              maxWidth={650}
              maxLines={1}
              color="#ffffffff"
            >
              {m.label}
            </text>
            <text
              x={20}
              y={27.6 + SHIFT.line}
              fontFamily={m.detailFont}
              fontSize={40}
              lineHeight={46}
              maxWidth={650}
              maxLines={1}
              color="#ffffffff"
            >
              {m.detail}
            </text>
            <text
              x={20}
              y={27.6 + SHIFT.line}
              fontFamily={m.quoteFont}
              fontSize={40}
              lineHeight={46}
              maxWidth={650}
              maxLines={2}
              color="#ffffffff"
              onEvent={{ loaded: (_, e) => e.dimensions.h && setQuoteH(e.dimensions.h) }}
            >
              {m.quote}
            </text>
          </view>
        )}
      </Show>
    </view>
  )
}
