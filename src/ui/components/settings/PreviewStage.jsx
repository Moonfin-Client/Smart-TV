import { Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import * as settings from '../../../state/settings.js'
import { previewPalette } from '../previews/palette.js'
import { getPreviewItems, subscribePreviewItems, ensurePreviewItemsLoaded } from '../previews/previewData.js'
import { DESIGN_W } from '../previews/kit.js'
import HomePreview from '../previews/HomePreview.jsx'
import MediaBarPreview from '../previews/MediaBarPreview.jsx'
import DetailPreview from '../previews/DetailPreview.jsx'
import PlayerPreview from '../previews/PlayerPreview.jsx'
import KeyboardPreview from '../previews/KeyboardPreview.jsx'
import ScreensaverPreview from '../previews/ScreensaverPreview.jsx'
import ScreenPreview from '../previews/ScreenPreview.jsx'
import { cornerMask } from '../previews/cornerMask.js'
import { over } from './look.js'

// The stage both the settings live preview and the setup wizard draw on: one 960 by 540 screen
// from previews/ scaled into [w] by [h] at [x], [y]. [pick] says which (previews/scenePick.js),
// [tried] holds a picker's focused value over the saved settings, and [homeRows] are Home's own
// rows for the scenes that draw them.
// This renderer has no rounded clip, so with [radius] the stage covers its own corners in
// [behind], the page's color under the frame, as it shows over the black under the canvas. Its
// holder draws the frame's shadow and ring after it.
export default function PreviewStage(props) {
  const [items, setItems] = createSignal(getPreviewItems())
  const s = createMemo(() => {
    const all = settings.all()
    return props.tried ? { ...all, ...props.tried } : all
  })
  const t = createMemo(() => previewPalette(s()))
  const scale = () => (props.w || DESIGN_W) / DESIGN_W
  const p = () => props.pick || {}
  const kind = () => p().kind || ''
  const rows = () => (p().homeRows ? props.homeRows || null : null)
  const saver = () => kind() === 'home' && !!p().screensaver && s().screensaverEnabled !== false
  const corners = () => [cornerMask(), { x: 0, y: 0, w: props.w, h: props.h, radius: props.radius }]
  onMount(() => {
    const off = subscribePreviewItems((list) => setItems(list.slice()))
    onCleanup(off)
    ensurePreviewItemsLoaded()
  })
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.w} height={props.h} clipping>
      <view scale={scale()} pivot={0} width={960} height={540}>
        <view>
          <Switch>
            <Match when={kind() === 'home' || kind() === 'navbar' || kind() === 'rows'}>
              <HomePreview s={s()} items={items()} pick={p()} homeRows={rows()} hasLiveTv={props.hasLiveTv} />
            </Match>
            <Match when={kind() === 'mediaBar'}>
              <MediaBarPreview s={s()} t={t()} items={items()} mode={p().mode} homeRows={rows()} />
            </Match>
            <Match when={kind() === 'details'}>
              <DetailPreview s={s()} t={t()} items={items()} variant={p().variant} />
            </Match>
            <Match when={kind() === 'player'}>
              <PlayerPreview s={s()} t={t()} items={items()} moment={p().moment} hdr={p().hdr} />
            </Match>
            <Match when={kind() === 'search'}>
              <KeyboardPreview s={s()} t={t()} items={items()} />
            </Match>
            <Match when={kind() === 'calendar' || kind() === 'library'}>
              <ScreenPreview s={s()} t={t()} items={items()} pick={p()} library={props.library} hasLiveTv={props.hasLiveTv} />
            </Match>
          </Switch>
        </view>
        <view>
          <Show when={saver()}>
            <ScreensaverPreview s={s()} t={t()} items={items()} />
          </Show>
        </view>
      </view>
      <view>
        <Show when={props.radius && props.behind}>
          <view width={props.w} height={props.h} color={over(props.behind, '#000000ff')} shader={corners()} />
        </Show>
      </view>
    </view>
  )
}
