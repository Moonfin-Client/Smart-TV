import { For, Show, createMemo, createSelector } from 'solid-js'
import { lineY } from '../books/bookGrid.js'
import { fontFor, uiFont, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { keyed } from '../library/pageKit.js'
import { trackLength } from '../../../pages/Music/music.js'

const PAD_X = 12
const PAD_Y = 8
const BORDER = 1
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const COL_GAP = 36

// `mode` is 'numbered' or 'art', and `ranked` adds the place in the list.
export const trackRows = (tracks, { mode = 'art', ranked = false, subtitleFor, artFor, metaFor, activeId } = {}) =>
  (tracks || []).map((t, i) => {
    const subtitle = subtitleFor ? subtitleFor(t) || '' : ''
    const length = metaFor ? metaFor(t) || '' : trackLength(t.RunTimeTicks)
    return {
      k: `${t.PlaylistItemId || t.Id}:${i}`,
      i,
      raw: t,
      number: mode === 'numbered' ? String(t.IndexNumber != null ? t.IndexNumber : i + 1) : '',
      rank: ranked ? String(i + 1) : '',
      art: mode === 'art' ? (artFor && artFor(t)) || '' : null,
      title: t.Name || '',
      titleFont: fontFor(t.Name || '', 'bold'),
      subtitle,
      subFont: fontFor(subtitle),
      length,
      lengthW: length ? Math.ceil(textWidth(length, 18)) : 0,
      active: !!activeId && t.Id === activeId,
    }
  })

// A song with no line under it stands shorter.
const rowHeight = (r) => PAD_Y * 2 + BORDER * 2 + Math.max(r.art !== null ? 56 : 0, r.subtitle ? 66 : 33)
export const trackRowHeight = (rows) => (rows && rows.length ? Math.max(...rows.map(rowHeight)) : 0)

// With `columns` 2, a line is as tall as its taller song.
export const trackLayout = (rows, columns = 1) => {
  const ys = []
  const hs = []
  let y = 0
  for (let i = 0; i < (rows || []).length; i += columns) {
    const line = rows.slice(i, i + columns)
    const h = Math.max(...line.map(rowHeight))
    line.forEach((r, n) => {
      ys[i + n] = y
      hs[i + n] = rowHeight(r)
    })
    y += h
  }
  return { ys, hs, total: y }
}

export const trackListHeight = (rows, columns = 1) => trackLayout(rows, columns).total

function TrackRow(props) {
  const r = () => props.row
  const look = () => props.look
  const lead = () => PAD_X + BORDER + (r().rank ? 52 : 0)
  const textX = () => lead() + (r().number ? 56 : r().art !== null ? 76 : 0)
  const lengthX = () => props.w - PAD_X - BORDER - r().lengthW
  const titleMax = () => (r().length ? lengthX() - 12 : props.w - PAD_X - BORDER) - textX()
  const textTop = () => (props.h - (r().subtitle ? 66 : 33)) / 2
  const soft = () => (props.focused ? look().invertedSoft : look().os(0.65))
  const numColor = () => {
    if (props.focused) return look().invertedSoft
    return r().active ? look().accent : look().os(0.65)
  }
  return (
    <view x={props.x} y={props.y} width={props.w} height={props.h}>
      <view width={props.w} height={props.h} borderRadius={10} color={r().active ? look().accent16 : NONE} />
      <view
        width={props.w}
        height={props.h}
        borderRadius={10}
        color={look().buttonFocused}
        border={{ width: 1, color: hex(look().accent72) }}
        alpha={props.focused ? 1 : 0}
      />
      <view>
        <Show when={r().rank}>
          <text fontFamily={uiFont('bold')} fontSize={26} x={31} y={lineY((props.h - 33) / 2, 33, 26)} mountX={0.5} color={look().accent}>
            {r().rank}
          </text>
        </Show>
      </view>
      <view>
        <Show when={r().number}>
          <text
            fontFamily={uiFont(r().active ? 'bold' : 'regular')}
            fontSize={20}
            x={lead() + 36}
            y={lineY((props.h - 33) / 2, 33, 20)}
            mountX={1}
            color={numColor()}
          >
            {r().number}
          </text>
        </Show>
      </view>
      <view>
        <Show when={r().art !== null}>
          <view x={lead()} y={(props.h - 56) / 2} width={56} height={56} borderRadius={8} color={look().os(0.06)} />
        </Show>
      </view>
      <view>
        <Show when={r().art}>
          <view x={lead()} y={(props.h - 56) / 2} width={56} height={56} borderRadius={8} src={r().art} textureOptions={COVER} />
        </Show>
      </view>
      <text
        fontFamily={r().titleFont}
        fontSize={22}
        x={textX()}
        y={lineY(textTop(), 33, 22)}
        maxWidth={titleMax()}
        maxLines={1}
        color={props.focused ? look().invertedStrong : look().onSurface}
      >
        {r().title}
      </text>
      <view>
        <Show when={r().subtitle}>
          <text fontFamily={r().subFont} fontSize={18} x={textX()} y={lineY(textTop() + 33, 33, 18)} maxWidth={titleMax()} maxLines={1} color={soft()}>
            {r().subtitle}
          </text>
        </Show>
      </view>
      <view>
        <Show when={r().length}>
          <text fontFamily={uiFont()} fontSize={18} x={lengthX()} y={lineY((props.h - 33) / 2, 33, 18)} color={soft()}>
            {r().length}
          </text>
        </Show>
      </view>
    </view>
  )
}

// The screen owns the arrows and passes `focus`, the focused row or -1. `view` ([top, bottom] in the
// list's own coordinates) draws only the rows that reach into it, for a list long enough to scroll.
// onPointerTrack(i, box) and onPointerTrackClick(i, box) hear the Magic Remote's cursor on a row, the
// box in the list's coordinates (app/pointer.js). pointerTrackRing rings the row under the cursor,
// for a list whose focus scrolls the page.
export default function MusicTrackList(props) {
  const cols = () => (props.columns === 2 ? 2 : 1)
  const colW = () => (cols() === 2 ? (props.w - COL_GAP) / 2 : props.w)
  const lay = createMemo(() => trackLayout(props.rows, cols()))
  const placed = createMemo(() => {
    const l = lay()
    const view = props.view
    const out = []
    ;(props.rows || []).forEach((r) => {
      const y = l.ys[r.i]
      if (view && (y + l.hs[r.i] < view[0] || y > view[1])) return
      out.push({ r, k: r.k, i: r.i, x: (r.i % cols()) * (colW() + COL_GAP), y, h: l.hs[r.i] })
    })
    return out
  })
  const list = keyed(placed, (p) => p.k)
  const isFocused = createSelector(() => props.focus)
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.w} height={lay().total}>
      <For each={list.keys()}>
        {(k) => {
          const p = list.item(k)
          return <TrackRow x={p().x} y={p().y} row={p().r} w={colW()} h={p().h} look={props.look} focused={isFocused(p().i)} />
        }}
      </For>
      <view
        width={props.w}
        height={lay().total}
        pointerItems={() => (props.onPointerTrack || props.onPointerTrackClick ? placed().map((p) => ({ x: p.x, y: p.y, w: colW(), h: p.h, i: p.i })) : [])}
        onPointerItem={props.onPointerTrack ? (it) => props.onPointerTrack(it.i, it) : undefined}
        pointerItemRing={props.pointerTrackRing ? 10 : undefined}
        onPointerItemClick={props.onPointerTrackClick ? (it) => props.onPointerTrackClick(it.i, it) : undefined}
      />
    </view>
  )
}
