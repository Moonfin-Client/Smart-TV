import $L from '../../../services/i18n.js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { getRenderer } from '@solidtv/solid'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { formatPlaybackTimeSlot } from '../../../utils/playbackTimeLabels.js'
import { chapterMarkerPositions } from '../../../utils/chapterMarkers.js'
import { zoomInternalFromSetting } from '../../../utils/playbackTuning.js'
import { resolveSubtitleStyleSettings, getSubtitleOverlayStyle } from '../../../utils/subtitleConstants.js'
import { VERTICAL_TRAVEL_TOP_MARGIN, planTrickplayPreview } from '../../../utils/trickplayLayout.js'
import { airsText } from '../../../utils/calendarEntries.js'
import { drawSubtitles, pictureData } from '../../../pages/Player/subtitleCanvas.js'
import { osdButtons } from '../../../pages/Player/osdButtons.js'
import { LOADING_KEYS } from '../../../pages/Settings/previewRows.js'
import SkipPrompt from '../player/SkipPrompt.jsx'
import NextUpCard from '../player/NextUpCard.jsx'
import PlayerOsd from '../player/PlayerOsd.jsx'
import { bottomLayout } from '../player/osdLayout.js'
import LoadingAnimation from '../shell/LoadingAnimation.jsx'
import { cssShadow } from '../account/gradient.js'
import { gradientUrl } from './mediaBarKit.js'
import { CONTAIN, COVER } from './kit.js'
import { SAMPLE_CHAPTERS, SAMPLE_DURATION, SAMPLE_SEGMENTS, SUBTITLE_LINES, playerMoment, pictureBox, controlsFloor } from './playerLayout.js'

// The player mid-episode at [moment], the picture fitted by Zoom Mode, the subtitle line in its SDR
// or [hdr] look, the player's own controls (PlayerOsd) for the sample episode, the skip prompt or the
// Next Up card, the paused description, the scrub thumbnails while seeking, and the loading
// animation before the stream starts. The controls, subtitle, prompts and loading layer are laid out
// at the TV's size and drawn at half.
const FAKE_DURATION_MS = 3600000
// The episode the controls play: chapters, a season, a subtitle track, a second audio track, a cast and a next episode.
const SAMPLE_OSD = {
  isLive: false, nextEpisode: true, audioCount: 2, subtitleCount: 1, chapterCount: SAMPLE_CHAPTERS.length, canDownload: true,
  hasCast: true, selectedQuality: null, sleepOn: false, canBrowseEpisodes: true, isFavorite: false, canFavorite: true, inParty: false,
}
// The active scrub tile's box-shadow: 0 0 16px of the accent at 0.5.
const TILE_GLOW = { color: shadowColor('#00a4dc80'), blur: 16 }
const NO_GLOW = { x: 0, y: 0, w: 0, h: 0, r: 0, shadow: undefined }
const DESC_SHADE = () => gradientUrl({ w: 960, h: 540, angle: 90, stops: [['#000000d9', 0], ['#0000004d', 1]] })

const pseudoRandom = (seed) => {
  let x = seed | 0
  x = Math.imul((x >>> 16) ^ x, 0x45d9f3b)
  x = Math.imul((x >>> 16) ^ x, 0x45d9f3b)
  x = (x >>> 16) ^ x
  return (x & 0xffffff) / 0xffffff
}

// A stand-in scrub tile: the logo drifting about the frame, settling somewhere new every few steps
// the way a cut would, with the step's number in the corner.
const fakeTile = (index, width, height, large) => {
  const shot = Math.floor(index / 3)
  const clamp = (v) => Math.min(1, Math.max(-1, v))
  const bx = clamp(pseudoRandom(shot * 2 + 1) * 2 - 1 + Math.sin(index * 2.7) * 0.08)
  const by = clamp(pseudoRandom(shot * 2 + 2) * 2 - 1 + Math.sin(index * 3.3 + 1.5) * 0.08)
  const logo = Math.min(width, height) * (large ? 0.6 : 0.7)
  return { logo, logoX: ((1 + bx) / 2) * (width - logo), logoY: ((1 + by) / 2) * (height - logo), index: String(index), size: large ? 20 : 12 }
}

export default function PlayerPreview(props) {
  const bold = uiFont('bold')
  const [subTick, setSubTick] = createSignal(0)
  const [sub, setSub] = createSignal(null)
  let osd
  const item = () => (props.items || [])[0] || null
  const next = () => (props.items || [])[1] || item()
  const loading = () => props.moment === 'loading'
  const m = createMemo(() => playerMoment(props.moment || 'middle', props.s))
  const pic = () => pictureBox(m().fit)
  const picSrc = () => (item() && item().backdropUrl) || ''
  const describe = () => m().describing && !loading()
  // The time rows' three slots above and below the bar.
  const times = createMemo(() => {
    const s = props.s
    const args = { position: m().progress * SAMPLE_DURATION, duration: SAMPLE_DURATION, clockDisplay: s.clockDisplay, timeOffsetHours: s.timeOffsetHours }
    const slot = (key) => formatPlaybackTimeSlot({ slot: s[key], ...args })
    return {
      above: ['playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight'].map(slot),
      below: ['playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight'].map(slot),
    }
  })
  const lay = createMemo(() => bottomLayout({ live: false, above: times().above.some((x) => x !== ''), below: times().below.some((x) => x !== ''), buttons: true }))
  const controlsOn = () => !!m().controls && !loading()
  const marks = createMemo(() => {
    if (!props.s.showChapterMarkers) return []
    const total = SAMPLE_DURATION * 1000
    return chapterMarkerPositions(SAMPLE_CHAPTERS, total).map((ms) => ({ key: String(ms), x: (ms / total) * 1872 }))
  })
  const buttons = createMemo(() => osdButtons({ ...SAMPLE_OSD, isPaused: m().paused, subtitleOn: m().subtitles, zoomMode: zoomInternalFromSetting(props.s.playerZoomMode) }, props.s))
  // What holds the remote, which nothing in the preview really does: the play button or the bar.
  const osdFocus = () => (controlsOn() ? m().focus || '' : '')
  // The bar keeps the player's own colors under every theme, and its thumb turns white without the
  // focus scale while the bar holds the remote.
  const barColors = createMemo(() => ({ track: '#404040ff', fill: '#00a4dcff', thumb: osdFocus() === 'progress' ? '#ffffffff' : '#00a4dcff' }))
  const head = createMemo(
    () => {
      const it = item()
      return { logo: (it && it.logoUrl) || '', name: it ? it.title : '', line: 'S1:E1 - Pilot' }
    },
    undefined,
    { equals: (a, b) => a.logo === b.logo && a.name === b.name },
  )
  // The skip prompt or the Next Up card, with the countdown style being tried.
  const skip = createMemo(() => {
    const k = m().skip
    if (!k || loading()) return null
    return { k: 'skip' + k, prompt: { type: k, start: 0, ...SAMPLE_SEGMENTS[k], countdownStyle: props.s.nextUpCountdownStyle || 'both' } }
  })
  const card = createMemo(() => {
    const c = m().card
    if (!c || loading()) return null
    const s = props.s
    const nx = next() || { title: '', backdropUrl: '' }
    const date = new Date()
    date.setDate(date.getDate() + 3)
    return {
      k: 'card' + (c.airDate ? 'a' : 'n') + (c.countdown == null ? '' : 'c'),
      count: c.countdown,
      card: {
        title: nx.title,
        pill: 'S1:E2',
        image: c.airDate ? '' : nx.backdropUrl || '',
        minimal: s.nextUpBehavior === 'minimal',
        airs: c.airDate ? airsText(date, new Date(), s.dateFormat) : '',
        markers: [],
        timeout: c.airDate ? 0 : m().timeout,
        countdownStyle: s.nextUpCountdownStyle || 'both',
      },
    }
  })
  // The subtitle's look, lifted over the controls while they're up.
  const subStyle = createMemo(() => {
    const style = resolveSubtitleStyleSettings(props.s, !!props.hdr)
    if (!m().controls) return style
    const floor = controlsFloor(lay())
    return floor > parseFloat(getSubtitleOverlayStyle(style).bottom) ? { ...style, subtitlePosition: 'absolute', subtitlePositionAbsolute: 100 - floor } : style
  })
  // The line as a picture, uploaded as its pixels since this renderer's textures take no canvas.
  createEffect(() => {
    subTick()
    if (!m().subtitles || loading()) return setSub(null)
    const lang = props.s.subtitleLanguage
    const line = SUBTITLE_LINES[lang] || 'Wait, did you hear that?'
    const drawn = drawSubtitles(line, null, subStyle(), false, () => setSubTick(subTick() + 1), { primary: SUBTITLE_LINES[lang] ? lang.slice(0, 2) : 'en' })
    let held = pictureData(drawn)
    if (!held) return setSub(null)
    const tex = getRenderer().stage.txManager.createTexture('ImageTexture', { src: () => held })
    tex.once('loaded', () => (held = null))
    setSub({ tex, x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h, alpha: drawn.alpha })
  })
  // A texture made from pixels isn't shared, so the line before goes once the view holds the next.
  createEffect(on(sub, (now, before) => before && (!now || now.tex !== before.tex) && before.tex.destroy()))
  // The scrub thumbnails while seeking: one, a strip a step apart, or one over the whole picture.
  const scrub = createMemo(() => {
    const s = props.s
    if (props.moment !== 'seek' || s.trickPlayMode === 'disabled' || !m().controls) return { cover: null, tiles: [] }
    const positionMs = m().progress * FAKE_DURATION_MS
    const stepMs = Math.max(1, (s.seekStep || 10) * 1000)
    const step = (ms) => Math.round(ms / stepMs)
    if (s.trickPlayMode === 'full') {
      const k = s.playerZoomMode === 'autoCrop' ? Math.max(960 / 16, 540 / 9) : Math.min(960 / 16, 540 / 9)
      const w = s.playerZoomMode === 'stretch' ? 960 : 16 * k
      const h = s.playerZoomMode === 'stretch' ? 540 : 9 * k
      return { cover: { x: (960 - w) / 2, y: (540 - h) / 2, w, h, ...fakeTile(step(positionMs), w, h, true) }, tiles: [] }
    }
    const floor = (1080 - lay().barY) / 2
    const plan = planTrickplayPreview({
      trackWidth: 936,
      scalePercent: s.trickPlayPreviewScale,
      aspect: 9 / 16,
      maxHeightBudget: Math.max(540 - floor - VERTICAL_TRAVEL_TOP_MARGIN * 0.5, 32),
      positionMs,
      durationMs: FAKE_DURATION_MS,
      followScrub: s.trickPlayFollowScrub,
      verticalPositionPercent: s.trickPlayVerticalPosition,
      isStrip: s.trickPlayMode === 'strip',
      spacing: 4,
      overflowMargin: 8,
      stepMs,
    })
    const y = 540 - floor - plan.verticalTravel - plan.tileHeight
    let x = 12 + plan.leftOffset
    const tiles = plan.slots.map((slot, i) => {
      if (i > 0) x += 4
      const active = slot.slotIndex === 0
      const glow = active ? cssShadow(plan.tileWidth, plan.tileHeight, 8, { ...TILE_GLOW, x: 0, y: 0, spread: 0 }) : NO_GLOW
      const out = { k: 't' + slot.slotIndex, x, y, w: plan.tileWidth, h: plan.tileHeight, active, glow, empty: slot.targetMs === null, ...fakeTile(slot.targetMs === null ? 0 : step(slot.targetMs), plan.tileWidth, plan.tileHeight, false) }
      x += plan.tileWidth
      return out
    })
    return { cover: null, tiles }
  })
  // The loading animation at the TV's size, mounted again when a tried loading setting changes it.
  const loadingKey = () => (loading() ? LOADING_KEYS.map((key) => String(props.s[key])).join('|') : '')
  // The play button holds the remote while the controls are up.
  createEffect(on(osdFocus, (f) => osd && f === 'button' && osd.focusRow('bottom')))
  onCleanup(() => {
    const last = sub()
    setSub(null)
    if (last) last.tex.destroy()
  })
  return (
    <view width={960} height={540} color="#000000ff" clipping>
      <view
        alpha={loading() ? 0 : 1}
        x={pic().x}
        y={pic().y}
        width={pic().w}
        height={pic().h}
        scaleX={1}
        scaleY={pic().scaleY}
        pivot={0}
        src={picSrc()}
        textureOptions={COVER}
        color={picSrc() ? '#ffffffff' : props.t.onSurfaceA(0.1)}
      />
      <view>
        <Show when={scrub().cover}>
          {(cv) => (
            <view x={cv().x} y={cv().y} width={cv().w} height={cv().h} color="#000000ff" clipping>
              <view x={cv().logoX} y={cv().logoY} width={cv().logo} height={cv().logo} src="resources/banner-dark.webp" textureOptions={CONTAIN} />
              <text fontFamily={bold} fontSize={20} lineHeight={23.4} x={cv().w - 3} mountX={1} y={cv().h - 2 - 23.4 + 2} color="#ffffffb3">
                {cv().index}
              </text>
            </view>
          )}
        </Show>
      </view>
      <view>
        <Show when={describe()}>
          <view width={960} height={540} src={DESC_SHADE()} color="#ffffffff">
            <text fontFamily={bold} fontSize={13} lineHeight={33} x={48} y={111} color="#ffffffff">
              {$L('Paused').toUpperCase()}
            </text>
            <text fontFamily={fontFor(item() ? item().title : '', 'bold')} fontSize={32} lineHeight={33} x={48} y={153} maxWidth={460} maxLines={1} color="#ffffffff">
              {item() ? item().title : ''}
            </text>
            <text fontFamily={fontFor((item() && item().overview) || '', 'medium')} fontSize={15} lineHeight={21} x={48} y={192} maxWidth={460} maxLines={8} color="#ffffffff">
              {(item() && item().overview) || ''}
            </text>
          </view>
        </Show>
      </view>

      <view scale={0.5} pivot={0} width={1920} height={1080}>
        <view>
          <Show when={sub()}>
            {(sb) => <view texture={sb().tex} x={sb().x} y={sb().y} width={sb().w} height={sb().h} alpha={sb().alpha} color="#ffffffff" />}
          </Show>
        </view>
        <view alpha={controlsOn() ? 1 : 0} width={1920} height={1080}>
          <PlayerOsd
            ref={(n) => (osd = n)}
            shown
            dim={1}
            head={head()}
            slots={times()}
            progress={m().progress}
            buffered={0}
            marks={marks()}
            buttons={buttons()}
            barColors={barColors()}
            held={osdFocus() === 'button'}
          />
        </view>
        <view>
          <Show when={skip()} keyed>
            {(sk) => <SkipPrompt prompt={sk.prompt} show />}
          </Show>
        </view>
        <view>
          <Show when={card()} keyed>
            {(cd) => <NextUpCard card={cd.card} countdown={cd.count} show />}
          </Show>
        </view>
      </view>

      <view>
        <For each={scrub().tiles}>
          {(tl) => (
            <view x={tl.x} y={tl.y} width={tl.w} height={tl.h} alpha={tl.empty ? 0 : 1}>
              <view alpha={tl.active ? 1 : 0} x={tl.glow.x} y={tl.glow.y} width={tl.glow.w} height={tl.glow.h} borderRadius={tl.glow.r} color="#00000000" shadow={tl.glow.shadow} />
              <view width={tl.w} height={tl.h} borderRadius={8} color="#000000ff" />
              <view x={tl.logoX} y={tl.logoY} width={tl.logo} height={tl.logo} src="resources/banner-dark.webp" textureOptions={CONTAIN} />
              <text fontFamily={bold} fontSize={12} lineHeight={14} x={tl.w - 3} mountX={1} y={tl.h - 15} color="#ffffffb3">
                {tl.index}
              </text>
              <view width={tl.w} height={tl.h} borderRadius={8} color="#00000000" border={{ width: tl.active ? 2 : 1, color: hex(tl.active ? '#00a4dcff' : props.t.onSurfaceA(0.2)) }} />
            </view>
          )}
        </For>
      </view>
      <view scale={0.5} pivot={0} width={1920} height={1080}>
        <Show when={loadingKey()} keyed>
          {() => <LoadingAnimation label={$L('Loading Stream...')} dimmed prefs={props.s} />}
        </Show>
      </view>
    </view>
  )
}
