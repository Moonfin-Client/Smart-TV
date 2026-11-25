import $L from '../../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { fitText, textWidth } from './measure.js'
import { formatDuration, videoResolutionLabel } from '../../../utils/helpers.js'
import * as settings from '../../../state/settings.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import RatingsRow from '../home/RatingsRow.jsx'
import { tx } from '../../fx.js'

// The focused item's name, facts and ratings over a library grid. It keeps a fixed height, so the
// grid holds still as focus moves. The Favorites HUD (variant 'hud') shows compact ratings once focus
// rests on a card.
const RATINGS_DEBOUNCE_MS = 250

// Year and runtime as plain text, the series status and age rating as pills.
const metaPieces = (item) => {
  const out = []
  if (!item) return out
  if (item.ProductionYear) out.push({ kind: 'text', text: String(item.ProductionYear) })
  if (item.RunTimeTicks > 0 && item.Type !== 'Series') {
    const dur = formatDuration(item.RunTimeTicks)
    if (dur !== '0m') out.push({ kind: 'text', text: dur })
  }
  if (item.Type === 'Series' && item.Status) {
    const continuing = item.Status === 'Continuing'
    out.push({ kind: continuing ? 'live' : 'ended', text: continuing ? $L('Continuing') : $L('Ended') })
  }
  if (item.OfficialRating && item.Type !== 'Playlist') out.push({ kind: 'rating', text: item.OfficialRating })
  return out
}

const PILL = { live: '#22c55e', ended: '#ef4444', rating: '#ffffff26', chip: '#ffffff26' }

// The Favorites HUD sets the same facts larger, with compact ratings under them.
const VARIANTS = {
  library: {
    nameSize: 29, nameLh: 33, metaY: 33, textSize: 20, textLh: 33, pillSize: 16, pillH: 39, pillPadX: 9,
    pillLh: 33, pillTextY: 3, pillR: 6, gap: 12,
  },
  hud: {
    nameSize: 32, nameLh: 38.4, metaY: 41.4, textSize: 22, textLh: 28.6, pillSize: 18, pillH: 29.4, pillPadX: 10,
    pillLh: 23.4, pillTextY: 3, pillR: 4, gap: 13, ratingsY: 77.4, compact: true,
  },
}

const hudPieces = (item) => {
  const out = []
  if (!item) return out
  if (item.ProductionYear) out.push({ kind: 'text', text: String(item.ProductionYear) })
  const runtime = item.Type === 'Series' ? '' : formatDuration(item.RunTimeTicks)
  if (runtime && runtime !== '0m') out.push({ kind: 'text', text: runtime })
  if (item.Type === 'Series' && item.Status === 'Continuing') out.push({ kind: 'live', text: $L('Continuing') })
  if (item.Type === 'Series' && item.Status === 'Ended') out.push({ kind: 'ended', text: $L('Ended') })
  if (item.OfficialRating) out.push({ kind: 'chip', text: item.OfficialRating })
  const resolution = videoResolutionLabel(item)
  if (resolution) out.push({ kind: 'chip', text: resolution })
  return out
}

export default function FocusedInfo(props) {
  const [ratingsItem, setRatingsItem] = createSignal(null)
  const [bodyAlpha, setBodyAlpha] = createSignal(1)
  const [fadeMs, setFadeMs] = createSignal(0)
  const hud = () => props.variant === 'hud'
  const v = () => VARIANTS[props.variant] || VARIANTS.library
  const name = createMemo(() => {
    const it = props.item
    const raw = it ? (hud() && it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} - ${it.Name}` : it.Name) : ''
    return fitText(raw || '', v().nameSize, 'bold', props.w || 1746)
  })
  const meta = createMemo(() => {
    const vv = v()
    const pieces = hud() ? hudPieces(props.item) : metaPieces(props.item)
    const pill = pieces.some((p) => p.kind !== 'text')
    let x = 0
    return pieces.map((p) => {
      const textW = p.kind === 'text' ? textWidth(p.text, vv.textSize, 'medium') : textWidth(p.text, vv.pillSize, 'bold')
      const w = p.kind === 'text' ? textW : textW + vv.pillPadX * 2
      const out = {
        x, w, text: p.text, isText: p.kind === 'text', bg: PILL[p.kind] || '',
        font: p.kind === 'text' ? uiFont('medium') : uiFont('bold'),
        y: p.kind === 'text' ? (pill ? (vv.pillH - vv.textLh) / 2 : 0) : 0,
      }
      x += w + vv.gap
      return out
    })
  })
  // The ratings start under the meta line, which is taller when it holds a pill.
  const ratingsY = () => {
    const vv = v()
    if (vv.ratingsY) return vv.ratingsY
    const pieces = meta()
    if (!pieces.length) return vv.metaY
    return vv.metaY + (pieces.some((p) => !p.isText) ? vv.pillH : vv.textLh)
  }
  const plugin = () => isMdblistEnabled(settings.all())

  let shownId = null
  let ratingsTimer = null
  let fadeTimer = null
  onCleanup(() => {
    clearTimeout(ratingsTimer)
    clearTimeout(fadeTimer)
  })
  // The library block's ratings follow focus at once. The HUD fades its body in for each card and
  // holds its ratings until focus rests.
  createEffect(
    on(
      () => props.item,
      (item) => {
        if (!hud()) return setRatingsItem(item || null)
        clearTimeout(ratingsTimer)
        setRatingsItem(null)
        if (!item) return
        if (item.Id !== shownId) {
          shownId = item.Id
          setFadeMs(0)
          setBodyAlpha(0)
          clearTimeout(fadeTimer)
          fadeTimer = setTimeout(() => {
            setFadeMs(200)
            setBodyAlpha(1)
          }, 16)
        }
        ratingsTimer = setTimeout(() => setRatingsItem(item), RATINGS_DEBOUNCE_MS)
      },
    ),
  )
  return (
    <view x={props.x || 0} y={props.y || 0} alpha={bodyAlpha()} transition={tx({ alpha: { duration: fadeMs(), easing: 'ease' } })}>
      <text fontFamily={fontFor(name(), 'bold')} fontSize={v().nameSize} lineHeight={v().nameLh} maxWidth={(props.w || 1746) + 6} maxLines={1} color="#ffffff">
        {name()}
      </text>
      <view y={v().metaY}>
        <view>
          <For each={meta().filter((m) => !m.isText)}>
            {(pl) => (
              <view x={pl.x} width={pl.w} height={v().pillH} borderRadius={v().pillR} color={pl.bg}>
                <text fontFamily={pl.font} fontSize={v().pillSize} x={v().pillPadX} y={v().pillTextY} lineHeight={v().pillLh} color="#ffffff">
                  {pl.text}
                </text>
              </view>
            )}
          </For>
        </view>
        <view>
          <For each={meta().filter((m) => m.isText)}>
            {(mt) => (
              <text fontFamily={mt.font} fontSize={v().textSize} x={mt.x} y={mt.y} lineHeight={v().textLh} color="#ffffffb3">
                {mt.text}
              </text>
            )}
          </For>
        </view>
      </view>
      <view y={ratingsY()}>
        {/* One row takes each item in place, since a row per item made and dropped about 35 nodes a move. */}
        <Show when={ratingsItem()}>
          <RatingsRow
            item={ratingsItem()}
            serverUrl={(ratingsItem() && ratingsItem()._serverUrl) || ''}
            compact={!!v().compact}
            pluginEnabled={plugin()}
            maxW={props.w}
          />
        </Show>
      </view>
    </view>
  )
}
