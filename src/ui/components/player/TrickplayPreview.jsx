import { Index, createEffect, createMemo, createSignal, on } from 'solid-js'
import { getServerUrl, getApiKey } from '../../../services/jellyfinApi.js'
import { plexTrickplayFrameUrl } from '../../../utils/plexUrls.js'
import { planSeekSheetIndexes, trickplayTile } from '../../../utils/trickplaySheets.js'
import { VERTICAL_TRAVEL_TOP_MARGIN, planTrickplayPreview } from '../../../utils/trickplayLayout.js'
import * as settings from '../../../state/settings.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { BAR } from './osdLayout.js'
import { isTileLoaded, tileSrc, whenSheetLoaded, whenTileLoaded } from './sheetCache.js'

// One trickplay thumbnail, a strip of them a scrub step apart, or the thumbnail over the whole picture, the way
// the trickplay settings say. The holder mounts one with `cover` under its controls (full mode) and one over
// them (single and strip). Each tile draws its own crop of the sprite sheet, and keeps its last crop until the
// next one is up. Props: tp ({ info, width, itemId, sourceId } or null), pos and dur in ms, step in seconds,
// visible, warm, barY (the bar's top) and cover. The node has warmAt(ms).
// shortcut: the tiles' 8 px corners are square under their rounded border, the scissor clip can't round them.
const REST_GAP = 8
const TILE_SPACING = 4
const OVERFLOW_MARGIN = 16
const CLEAR = '#00000000'

// How a thumbnail fills the screen in full mode, the way the video itself is shown.
const coverSize = (tile, zoomMode) => {
  const fit = Math.min(1920 / tile.width, 1080 / tile.height)
  const crop = Math.max(1920 / tile.width, 1080 / tile.height)
  if (zoomMode === 'stretch') return { width: 1920, height: 1080 }
  const scale = zoomMode === 'autoCrop' ? crop : fit
  return { width: tile.width * scale, height: tile.height * scale }
}

export default function TrickplayPreview(props) {
  const [arrived, setArrived] = createSignal(0)
  let shown = null

  // Silo's sheets come with their own addresses, Plex's frames from its part.
  const urlFor = (imageIndex) => {
    const tp = props.tp
    if (tp.info && tp.info.SiloSheets) return tp.info.SiloSheets[imageIndex] || null
    if (tp.info && tp.info.PlexPartId) return plexTrickplayFrameUrl(getServerUrl(), tp.info, imageIndex)
    return `${getServerUrl()}/Videos/${tp.itemId}/Trickplay/${tp.width}/${imageIndex}.jpg?MediaSourceId=${tp.sourceId}&ApiKey=${getApiKey()}`
  }
  // A tile that isn't up yet is asked for, and the tiles are worked out again when it lands.
  const ready = (url, t) => {
    if (!url) return false
    if (isTileLoaded(url, t)) return true
    whenTileLoaded(url, t, () => setArrived((n) => n + 1))
    return false
  }
  const opts = createMemo(() => {
    const s = settings.all()
    return {
      mode: s.trickPlayMode || 'single',
      scale: s.trickPlayPreviewScale != null ? s.trickPlayPreviewScale : 30,
      vertical: s.trickPlayVerticalPosition || 0,
      follow: s.trickPlayFollowScrub !== false,
      zoom: s.playerZoomMode || 'fit',
    }
  })
  // The tile border and glow follow the theme's accent and text color.
  const look = createMemo(() => {
    const t = theme()
    return {
      on: { width: 2, color: hex(t.accent) },
      off: { width: 1, color: hex(t.os(0.2)) },
      glow: { color: shadowColor(t.accentA(0.5)), x: 0, y: 0, blur: 16, spread: 0 },
    }
  })
  const tile = (key, x, y, w, h, hit, active) => {
    const base = { key, x, y, w, h, alpha: hit ? 1 : 0, active }
    if (!hit) return { ...base, src: '', cx: 0, cy: 0, cw: 0, ch: 0 }
    return { ...base, src: tileSrc(hit.url, hit.tile), cx: hit.tile.x, cy: hit.tile.y, cw: hit.tile.width, ch: hit.tile.height }
  }
  const tiles = createMemo(() => {
    const tp = props.tp
    const o = opts()
    if (!tp || !props.visible || arrived() < 0 || o.mode === 'disabled' || (o.mode === 'full') !== !!props.cover) return []
    const pos = props.pos
    const main = trickplayTile(tp.info, pos)
    if (!main) return []
    const mainUrl = urlFor(main.imageIndex)
    if (ready(mainUrl, main)) shown = { url: mainUrl, tile: main }
    if (o.mode === 'full') {
      if (!shown) return []
      const f = coverSize(shown.tile, o.zoom)
      return [tile('cover', (1920 - f.width) / 2, (1080 - f.height) / 2, f.width, f.height, shown, false)]
    }
    const barY = props.barY
    const plan = planTrickplayPreview({
      trackWidth: BAR.W,
      scalePercent: o.scale,
      aspect: main.height / main.width,
      maxHeightBudget: Math.max(barY - REST_GAP - VERTICAL_TRAVEL_TOP_MARGIN, 32),
      positionMs: pos,
      durationMs: props.dur || 0,
      followScrub: o.follow,
      verticalPositionPercent: o.vertical,
      isStrip: o.mode === 'strip',
      spacing: TILE_SPACING,
      overflowMargin: OVERFLOW_MARGIN,
      stepMs: Math.max(1, (props.step || 10) * 1000),
    })
    // The strip's bottom rests 8 above the bar's bottom edge, its tiles centered in it.
    const y = barY + BAR.H - REST_GAP - plan.verticalTravel - plan.tileHeight
    return plan.slots.map((slot, n) => {
      let hit = null
      if (slot.slotIndex === 0) hit = shown
      else if (slot.targetMs !== null) {
        const t = trickplayTile(tp.info, slot.targetMs)
        const url = t && urlFor(t.imageIndex)
        hit = t && ready(url, t) ? { url, tile: t } : null
      }
      const x = BAR.X + plan.leftOffset + n * (plan.tileWidth + TILE_SPACING)
      return tile(`s${slot.slotIndex}`, x, y, plan.tileWidth, plan.tileHeight, hit, slot.slotIndex === 0)
    })
  })

  const prefetch = (forward) => {
    const tp = props.tp
    if (!tp) return
    planSeekSheetIndexes({ info: tp.info, positionMs: props.pos, durationMs: props.dur, stepMs: (props.step || 10) * 1000, forward }).forEach((i) =>
      whenSheetLoaded(urlFor(i))
    )
  }
  // The controls coming up is the cue that a scrub may follow, and while scrubbing the sheets ahead are warmed.
  createEffect(
    on(
      () => props.warm,
      (v) => {
        if (v && !props.visible) prefetch(true)
      },
      { defer: true }
    )
  )
  createEffect(
    on(
      () => props.pos,
      (v, old) => {
        if (props.visible) prefetch(v >= (old || 0))
      },
      { defer: true }
    )
  )

  return (
    <view
      ref={(n) => {
        // The sheet under the playhead is kept loaded as playback goes along, so a scrub doesn't wait for it.
        n.warmAt = (positionMs) => {
          const tp = props.tp
          const t = tp && positionMs > 0 && trickplayTile(tp.info, positionMs)
          if (t) whenSheetLoaded(urlFor(t.imageIndex))
        }
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
    >
      <view width={1920} height={1080} color="#000000ff" alpha={props.cover && tiles().length > 0 ? 1 : 0} />
      <view width={1920} height={1080}>
        <Index each={tiles()}>
          {(t) => (
            <view x={t().x} y={t().y} width={t().w} height={t().h}>
              <view width={t().w} height={t().h} borderRadius={8} color={CLEAR} shadow={look().glow} alpha={!props.cover && t().active ? t().alpha : 0} />
              <view width={t().w} height={t().h} color={props.cover ? CLEAR : '#000000ff'} clipping alpha={t().alpha}>
                <view srcX={t().cx} srcY={t().cy} srcWidth={t().cw} srcHeight={t().ch} src={t().src} width={t().w} height={t().h} />
              </view>
              <view
                width={t().w}
                height={t().h}
                borderRadius={8}
                color={CLEAR}
                border={t().active ? look().on : look().off}
                alpha={props.cover ? 0 : t().alpha}
              />
            </view>
          )}
        </Index>
      </view>
    </view>
  )
}
