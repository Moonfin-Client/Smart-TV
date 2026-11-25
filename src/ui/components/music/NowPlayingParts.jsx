import $L from '../../../services/i18n.js'
import { For, Index, Show, createMemo, createSelector, createSignal, onCleanup, onMount } from 'solid-js'
import LoopMarquee from '../home/LoopMarquee.jsx'
import { lineY, withAlpha } from '../books/bookGrid.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { keyed } from '../library/pageKit.js'
import { uiFont, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { perfTier } from '../../tier.js'

// The player keeps the default blue accent whatever the theme.
export const PLAYER_ACCENT = '#00a4dc'
const ACCENT = '#00a4dcff'
const NONE = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

// Each blob is a layer larger than the screen on every side holding one radial gradient, and only
// the layer moves, 24 seconds each way.
const BLOBS = [
  { cx: 288 + 384, cy: 135 + 216, dx: 240, dy: 108 },
  { cx: 1728 + 384, cy: 351 + 216, dx: -192, dy: 162 },
  { cx: 768 + 384, cy: 999 + 216, dx: 288, dy: -135 },
]
const LAYER_W = 1920 + 768
const LAYER_H = 1080 + 432
const RADIUS = 1188
const DRIFT = { x: { duration: 24000, easing: 'linear' }, y: { duration: 24000, easing: 'linear' } }
const rgbaNum = (c, a) => (((c.r & 255) << 24) | ((c.g & 255) << 16) | ((c.b & 255) << 8) | Math.round(a * 255)) >>> 0

export function AmbientBackground(props) {
  const [out, setOut] = createSignal(false)
  onMount(() => {
    const first = setTimeout(() => setOut(true), 50)
    const turn = setInterval(() => setOut(!out()), 24000)
    onCleanup(() => {
      clearTimeout(first)
      clearInterval(turn)
    })
  })
  const blobs = createMemo(() => {
    const pal = props.palette || []
    return BLOBS.map((b, i) => {
      const c = pal[i] || { r: 0, g: 164, b: 220 }
      return { dx: b.dx, dy: b.dy, grad: { colors: [rgbaNum(c, 0.55), rgbaNum(c, 0)], stops: [0, 1], w: RADIUS, h: RADIUS, pivot: [b.cx / LAYER_W, b.cy / LAYER_H] } }
    })
  })
  return (
    <view width={1920} height={1080} color={props.bg + 'ff'} clipping>
      <Index each={blobs()}>
        {(bl) => (
          <view
            transition={DRIFT}
            x={-384 + (out() ? bl().dx : 0)}
            y={-216 + (out() ? bl().dy : 0)}
            width={LAYER_W}
            height={LAYER_H}
            color="#00000001"
            radialGradient={bl().grad}
          />
        )}
      </Index>
      <view width={1920} height={594} colorTop={withAlpha(props.bg, 0.15)} colorBottom={withAlpha(props.bg, 0.4)} />
      <view y={594} width={1920} height={486} colorTop={withAlpha(props.bg, 0.4)} colorBottom={withAlpha(props.bg, 0.86)} />
    </view>
  )
}

const LOSSLESS = ['flac', 'alac', 'wav', 'ape', 'wavpack', 'wv', 'tak', 'tta', 'dsd', 'dsf', 'mlp', 'truehd', 'pcm']
export const qualityLabel = (item) => {
  const streamsOf = (x) => (x && x.MediaStreams) || []
  const sources = (item && item.MediaSources) || []
  const stream = streamsOf(item).find((s) => s.Type === 'Audio') || streamsOf(sources[0]).find((s) => s.Type === 'Audio') || null
  const container = sources[0] && sources[0].Container
  const raw = (stream && stream.Codec) || container || ''
  if (!raw) return ''
  const parts = [raw.toUpperCase()]
  const rate = stream && stream.SampleRate
  if (rate > 0) {
    const khz = rate / 1000
    const k = khz === Math.floor(khz) ? String(khz) : khz.toFixed(1)
    parts.push(stream.BitDepth ? `${stream.BitDepth}/${k}` : `${k} kHz`)
  }
  if (LOSSLESS.indexOf(raw.toLowerCase()) >= 0) parts.push($L('Lossless'))
  else {
    const withRate = sources.find((s) => s.Bitrate > 0)
    const bitRate = stream && stream.BitRate > 0 ? stream.BitRate : withRate && withRate.Bitrate
    if (bitRate > 0) parts.push(`${Math.round(bitRate / 1000)}k`)
  }
  return parts.join(' · ')
}

export function QualityBadge(props) {
  const w = () => Math.ceil(textWidth(props.label, 12, 'bold', 0.3)) + 20 + 2
  return (
    <view x={1880 - w()} y={10} width={w()} height={43} borderRadius={13} color="#ffffff1a" border={{ width: 1, color: hex(ACCENT) }} alpha={0.92}>
      <text fontFamily={uiFont('bold')} fontSize={12} letterSpacing={0.3} x={11} y={15} color={ACCENT}>
        {props.label}
      </text>
    </view>
  )
}

const ART_SHADOW = { color: shadowColor('#0000008c'), x: 0, y: 10, blur: 30, spread: 0 }

export function TrackInfo(props) {
  const albumY = () => (props.artist ? 518 + 21 + 60 + 6 + 35 + 4 : 518 + 21 + 60 + 4)
  return (
    <view x={props.x} y={props.y} width={518} height={700}>
      <view width={518} height={518} borderRadius={16} color={NONE} shadow={ART_SHADOW} />
      <view width={518} height={518} borderRadius={16} color="#ffffff14" />
      <view>
        <Show when={!props.art}>
          <view x={211} y={211} width={96} height={96} src="icons/mus_note.webp" color="#ffffff61" />
        </Show>
      </view>
      <view>
        <Show when={props.art} keyed>
          {(src) => <view width={518} height={518} borderRadius={16} src={src} textureOptions={COVER} />}
        </Show>
      </view>
      <LoopMarquee y={539} text={props.title} font={fontFor(props.title, 'bold')} size={48} lh={60} ink="#ffffffff" width={518} active weight="bold" />
      <view>
        <Show when={props.artist}>
          <text fontFamily={fontFor(props.artist, 'medium')} fontSize={28} y={605} maxWidth={518} maxLines={1} color={ACCENT}>
            {props.artist}
          </text>
        </Show>
      </view>
      <view>
        <Show when={props.album}>
          <LoopMarquee y={albumY()} text={props.album} font={fontFor(props.album)} size={24} lh={30} ink="#ffffff80" width={518} active />
        </Show>
      </view>
    </view>
  )
}

const GLOW_SHADOW = { color: '#00a4dc8c', x: 0, y: 0, blur: 18 }
const LINE_T = { scale: { duration: 220, easing: 'ease-out' }, color: { duration: 220, easing: 'ease-out' } }

// Follows playback with the line being sung a third of the way down. Once the remote is inside,
// every line is a stop and the focused one sits at the top.
export function LyricsPanel(props) {
  const followMs = perfTier() === 'low' ? 0 : 300
  const message = () => {
    if (props.loading) return $L('Loading lyrics...')
    if (props.error) return props.error
    if (!(props.lines || []).length) return $L('No lyrics available')
    return ''
  }
  const flow = createMemo(() => {
    const maxW = (props.w - 48) * 0.75
    const synced = props.synced
    const size = synced ? 27 : 24
    const lh = synced ? 36.45 : 32.4
    let y = 48
    return (props.lines || []).map((l, i) => {
      const rows = Math.max(1, wrapLines(l.text, size, synced ? 'bold' : 'medium', maxW).length)
      const h = rows * lh
      const out = { i, text: l.text, y, h, maxW, ty: lineY(0, lh, size) - 2 }
      y += h + 12
      return out
    })
  })
  const flowH = () => {
    const f = flow()
    return f.length ? f[f.length - 1].y + f[f.length - 1].h + 48 : 0
  }
  const follow = createMemo(() => {
    const line = flow()[props.activeIndex]
    if (!line) return 0
    const top = line.y - props.h * 0.3 + line.h / 2
    return Math.max(0, Math.min(top, Math.max(0, flowH() - props.h)))
  })
  const boxes = createMemo(() => {
    const boxW = props.w - 16 - 24
    let y = 12
    return (props.lines || []).map((l, i) => {
      const rows = Math.max(1, wrapLines(l.text, 27, 'medium', boxW - 40).length)
      const boxH = 1 * 2 + 9 * 2 + rows * 33
      const out = { i, text: l.text, y, boxW, boxH, cy: 10 + lineY(0, 33, 27) - 2 }
      y += boxH + 3
      return out
    })
  })
  const boxesH = () => {
    const b = boxes()
    return b.length ? b[b.length - 1].y + b[b.length - 1].boxH + 12 : 0
  }
  const cursorScroll = () => {
    const box = boxes()[props.cur]
    if (!box) return 0
    return Math.max(0, Math.min(box.y, Math.max(0, boxesH() - props.h)))
  }
  const isActive = createSelector(() => props.activeIndex)
  const isCur = createSelector(() => props.cur)
  // shortcut: this renderer has no render to texture, so each line fades whole by where its middle
  // sits in the edge fade, rather than pixel by pixel. Use a texture mask if the renderer gains one.
  const fade = (line) => {
    const edge = props.h * 0.12
    const mid = line.y + line.h / 2 - follow()
    return Math.max(0, Math.min(1, Math.min(mid, props.h - mid) / edge))
  }
  return (
    <view width={props.w} height={props.h}>
      <view>
        <Show when={!message() && !props.cursor}>
          <view width={props.w} height={props.h} clipping>
            <view transition={{ y: { duration: followMs } }} x={24} y={-follow()} width={props.w} height={Math.max(props.h, flowH())}>
              <For each={flow()}>
                {(ln) => {
                  const on = () => isActive(ln.i)
                  const font = () => fontFor(ln.text, props.synced || on() ? 'bold' : 'medium')
                  return (
                    <view y={ln.y} width={ln.maxW} height={ln.h} pivotX={0} pivotY={0.5} transition={LINE_T} scale={on() ? 1.333 : 1} alpha={fade(ln)}>
                      <text
                        fontFamily={font()}
                        fontSize={props.synced ? 27 : 24}
                        lineHeight={props.synced ? 36.45 : 32.4}
                        maxWidth={ln.maxW}
                        y={ln.ty}
                        transition={LINE_T}
                        color={!props.synced ? '#ffffffcc' : on() ? ACCENT : '#ffffff61'}
                        textShadow={props.synced && on() ? GLOW_SHADOW : undefined}
                      >
                        {ln.text}
                      </text>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </Show>
      </view>
      <view>
        <Show when={!message() && props.cursor}>
          <view width={props.w} height={props.h} clipping>
            <view x={20} y={-cursorScroll()} width={props.w} height={Math.max(props.h, boxesH())}>
              <For each={boxes()}>
                {(bx) => (
                  <view y={bx.y} width={bx.boxW} height={bx.boxH}>
                    <view width={bx.boxW} height={bx.boxH} borderRadius={10} color="#00a4dc38" border={{ width: 1, color: hex(ACCENT) }} alpha={isCur(bx.i) ? 1 : 0} />
                    <text
                      fontFamily={fontFor(bx.text, isCur(bx.i) ? 'bold' : 'medium')}
                      fontSize={27}
                      x={19}
                      y={bx.cy}
                      maxWidth={bx.boxW - 40}
                      lineHeight={33}
                      color={isCur(bx.i) ? '#ffffffff' : '#ffffffb3'}
                    >
                      {bx.text}
                    </text>
                  </view>
                )}
              </For>
            </view>
          </view>
        </Show>
      </view>
      <view>
        <Show when={message()}>
          <text fontFamily={uiFont()} fontSize={16} x={props.w / 2} y={props.h / 2 - 9} mountX={0.5} color="#ffffff80">
            {message()}
          </text>
        </Show>
      </view>
    </view>
  )
}

const ROW_GLOW = { color: shadowColor('#00a4dc66'), x: 0, y: 0, blur: 14, spread: 1 }

function QueueRow(props) {
  const r = () => props.row
  const textW = () => props.w - 2 - 36 - 84 - 24 - (r().current ? 24 + 20 : 0)
  return (
    <view y={8 + r().i * 114} width={props.w} height={110}>
      <view width={props.w} height={110} borderRadius={16} color={NONE} shadow={ROW_GLOW} alpha={props.focused ? 1 : 0} />
      <view width={props.w} height={110} borderRadius={16} color="#00a4dc38" border={{ width: 1, color: hex(ACCENT) }} alpha={props.focused ? 1 : 0} />
      <view x={19} y={13} width={84} height={84} borderRadius={4} color="#ffffff1a" />
      <view>
        <Show when={r().art} keyed>
          {(src) => <view x={19} y={13} width={84} height={84} borderRadius={4} src={src} textureOptions={COVER} />}
        </Show>
      </view>
      <LoopMarquee
        x={127}
        y={20}
        text={r().title}
        font={fontFor(r().title, r().current ? 'bold' : 'regular')}
        size={28}
        lh={33}
        ink={r().current ? ACCENT : '#ffffffff'}
        width={textW()}
        active={props.focused}
        weight={r().current ? 'bold' : 'regular'}
      />
      <text fontFamily={uiFont()} fontSize={22} x={127} y={56 + 5.6} maxWidth={textW()} maxLines={1} color="#ffffff80">
        {r().artist}
      </text>
      <view>
        <Show when={r().current}>
          <view x={props.w - 19 - 20} y={45} width={20} height={20} src="icons/mus_equalizer.webp" color={ACCENT} />
        </Show>
      </view>
    </view>
  )
}

// The focused row sits at the top, or the playing track while the remote is outside.
export function QueuePanel(props) {
  const rowW = () => props.w - 16
  const anchor = () => (props.cursor ? props.cur : props.currentIndex)
  const scroll = () => {
    const n = (props.rows || []).length
    const total = 4 + n * 114 + 4
    return Math.max(0, Math.min(4 + Math.max(0, anchor()) * 114, Math.max(0, total - props.h)))
  }
  const near = createMemo(() => {
    const first = Math.floor(scroll() / 114) - 2
    const last = Math.ceil((scroll() + props.h) / 114) + 2
    return (props.rows || []).filter((r) => r.i >= first && r.i <= last)
  })
  const list = keyed(near, (r) => r.k)
  const isFocused = createSelector(() => (props.cursor ? props.cur : -1))
  return (
    <view width={props.w} height={props.h} clipping>
      <view x={8} y={-scroll()} width={rowW()} height={Math.max(props.h, 8 + (props.rows || []).length * 114)}>
        <For each={list.keys()}>
          {(k) => {
            const r = list.item(k)
            return <QueueRow row={r()} w={rowW()} focused={isFocused(r().i)} />
          }}
        </For>
      </view>
      <view>
        <Show when={!(props.rows || []).length}>
          <text fontFamily={uiFont()} fontSize={16} x={props.w / 2} y={props.h / 2 - 9} mountX={0.5} color="#ffffff8a">
            {$L('Queue is empty')}
          </text>
        </Show>
      </view>
    </view>
  )
}

function DockButton(props) {
  const b = () => props.btn
  const tipW = () => Math.ceil(textWidth(b().label, 18, 'bold')) + 30 + 4
  return (
    <view x={b().x} width={84} height={84}>
      <view width={84} height={84} borderRadius={42} color="#00a4dc2e" alpha={b().selected && !props.focused ? 1 : 0} />
      <view width={84} height={84} borderRadius={42} color="#ffffff38" border={{ width: 3, color: 0xffffffff }} alpha={props.focused ? 1 : 0} />
      <view x={21} y={21} width={42} height={42} src={'icons/' + b().icon + '.webp'} color={b().active ? ACCENT : '#ffffffff'} alpha={b().disabled ? 0.3 : 1} />
      <view>
        <Show when={props.focused}>
          <view x={42 - tipW() / 2} y={-63} width={tipW()} height={51} borderRadius={12} color="#000000c7" border={{ width: 2, color: hex('#ffffff73') }}>
            <text fontFamily={uiFont('bold')} fontSize={18} x={17} y={2 + 8 + 5.9} color="#ffffffff">
              {b().label}
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}

export function Dock(props) {
  const isFocused = createSelector(() => props.focus)
  return (
    <view y={props.y} width={1920} height={84}>
      <Index each={props.buttons}>{(db) => <DockButton btn={db()} focused={isFocused(db().i)} />}</Index>
    </view>
  )
}

const THUMB_SHADOW = { color: shadowColor('#00000066'), x: 0, y: 2, blur: 8, spread: 0 }

export function SeekBar(props) {
  const fillW = () => 1872 * Math.max(0, Math.min(1, props.progress || 0))
  const bufW = () => 1872 * Math.max(props.progress || 0, Math.min(1, props.buffered || 0))
  return (
    <view x={props.x} y={props.y} width={1872} height={6}>
      <view width={1872} height={6} borderRadius={3} color={props.colors.track} />
      <view width={bufW()} height={6} borderRadius={3} color={props.colors.buffered} />
      <view width={fillW()} height={6} borderRadius={3} color={props.colors.fill} />
      <view
        transition={{ scale: { duration: 200 } }}
        x={fillW()}
        y={3}
        width={21}
        height={21}
        mountX={0.5}
        mountY={0.5}
        borderRadius={10.5}
        color={props.focused ? '#ffffffff' : props.colors.thumb}
        shadow={THUMB_SHADOW}
        scale={props.focused ? 1.3 : 1}
      />
    </view>
  )
}
