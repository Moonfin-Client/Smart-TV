import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onCleanup } from 'solid-js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { fetchVideoDetails } from '../../../services/youtubeTrailer.js'
import { getBackdropId, getImageUrl } from '../../../utils/helpers.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { Icons, Imgs, Rects, Texts } from './draw.jsx'

// The side panel the trailer button opens when there's more than one trailer, with a still, the
// length and the name for each. YouTube rows learn their length and channel once the panel is up,
// and a row that never hears back goes without.
// Props: `choices`, `item`. Enter calls onTrailerPick(choice), Back onTrailerPickerClose().
const TICKS_PER_SECOND = 10000000
const THUMB = { maxWidth: 320, quality: 90 }
const ROW = { x: 1303, w: 593, h: 144, gap: 9, top: 119.5 + 21 }
const TEXT_X = 1543
const TEXT_W = 338
const VIEW_BOTTOM = 1080 - 21

export default function TrailerPicker(props) {
  const [details, setDetails] = createSignal({})
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const choices = () => props.choices || []
  let alive = true
  onCleanup(() => (alive = false))
  choices().forEach(({ videoId }) => {
    if (!videoId) return
    fetchVideoDetails(videoId)
      .then((found) => {
        if (alive && found) setDetails({ ...details(), [videoId]: found })
      })
      .catch(() => {})
  })

  const head = createMemo(() => {
    const name = (props.item && props.item.Name) || ''
    const count = $L('{count} trailers').replace('{count}', String(choices().length))
    return {
      title: $L('Trailers'), titleY: 30 + cssShift(30), name, nameFont: fontFor(name), nameY: 70.5 + cssShift(20),
      count, countX: 1884 - textWidth(count, 20), countY: 50.25 + cssShift(20),
    }
  })
  const laid = createMemo(() => {
    const server = getServerUrl()
    const it = props.item
    const backId = it ? getBackdropId(it) : null
    const backdrop = backId ? getImageUrl(server, backId, 'Backdrop', THUMB) : ''
    const out = { frames: [], thumbs: [], texts: [], pills: [], icons: [] }
    const bold = uiFont('bold')
    const medium = uiFont('medium')
    choices().forEach((c, i) => {
      const y = ROW.top + i * (ROW.h + ROW.gap)
      const found = c.videoId ? details()[c.videoId] : null
      const seconds = c.local ? (c.local.RunTimeTicks || 0) / TICKS_PER_SECOND : (found && found.lengthSeconds) || 0
      let src = `https://i.ytimg.com/vi/${c.videoId}/mqdefault.jpg`
      if (c.local) {
        const tag = c.local.ImageTags && c.local.ImageTags.Primary
        src = tag ? getImageUrl(server, c.local.Id, 'Primary', { ...THUMB, tag }) : backdrop
      }
      const tx = ROW.x + 15
      const ty = y + 15
      out.frames.push({ k: `f${c.key}`, x: tx, y: ty, w: 204, h: 114, r: 12, color: '#ffffff0f' })
      out.thumbs.push({ k: `t${c.key}`, x: tx, y: ty, w: 204, h: 114, r: 12, src })
      if (seconds > 0) {
        const d = formatPlaybackDuration(seconds)
        const w = textWidth(d, 17, 'bold') + 16
        out.pills.push({ k: `d${c.key}`, x: tx + 204 - 8 - w, y: ty + 114 - 8 - 24, w, h: 24, r: 6, color: '#000000cc' })
        out.texts.push({ k: `dt${c.key}`, x: tx + 204 - 8 - w + 8, y: ty + 114 - 8 - 24 + 2 + cssShift(17), t: d, size: 17, font: bold, lh: 20, color: '#ffffffff', maxw: 400, lines: 1 })
      }
      // The text column centers in the row: two lines of title at most, the channel, the pill.
      const title = c.title || $L('Trailer')
      const lines = Math.min(2, wrapLines(title, 22, 'bold', TEXT_W).length)
      const author = found && found.author ? found.author : ''
      let h = lines * 28.6
      if (author) h += 6 + 24
      if (c.subtitled) h += 6 + 26
      let cy = y + (ROW.h - h) / 2
      out.texts.push({ k: `n${c.key}`, x: TEXT_X, y: cy + cssShift(22), t: title, size: 22, font: fontFor(title, 'bold'), lh: 28.6, color: '#ffffffff', maxw: TEXT_W, lines: 2 })
      cy += lines * 28.6
      if (author) {
        cy += 6
        out.texts.push({ k: `a${c.key}`, x: TEXT_X, y: cy + cssShift(20), t: author, size: 20, font: fontFor(author), lh: 24, color: '#ffffffa8', maxw: TEXT_W, lines: 1 })
        cy += 24
      }
      if (c.subtitled) {
        cy += 6
        const label = $L('Subtitled')
        const w = 11 + 18 + 6 + textWidth(label, 17, 'medium') + 11
        out.pills.push({ k: `s${c.key}`, x: TEXT_X, y: cy, w, h: 26, r: 13, color: '#ffffff1a' })
        out.icons.push({ k: `si${c.key}`, x: TEXT_X + 11, y: cy + 4, w: 18, h: 18, src: 'icons/d/subtitle.webp', color: '#ffffffd1' })
        out.texts.push({ k: `st${c.key}`, x: TEXT_X + 35, y: cy + 3 + cssShift(17), t: label, size: 17, font: medium, lh: 20, color: '#ffffffd1', maxw: 400, lines: 1 })
      }
    })
    return out
  })
  const focusY = () => ROW.top + cur() * (ROW.h + ROW.gap)

  const reveal = () => {
    const top = ROW.top + cur() * (ROW.h + ROW.gap)
    const bottom = ROW.top + choices().length * (ROW.h + ROW.gap) - ROW.gap + 21
    const viewTop = 119.5 + 21
    if (top - scroll() < viewTop) setScroll(Math.max(0, top - viewTop))
    else if (top + ROW.h - scroll() > VIEW_BOTTOM) setScroll(Math.min(bottom - 1080, top + ROW.h - VIEW_BOTTOM))
  }
  const bold = uiFont('bold')
  const regular = uiFont()
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        reveal()
        return true
      }}
      onDown={() => {
        if (cur() < choices().length - 1) setCur(cur() + 1)
        reveal()
        return true
      }}
      onEnter={() => {
        const c = choices()[cur()]
        if (c && props.onTrailerPick) props.onTrailerPick(c)
        return true
      }}
      onBack={() => {
        if (props.onTrailerPickerClose) props.onTrailerPickerClose()
        return true
      }}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#0000004d" />
      <view x={1278} y={-1} width={643} height={1082} borderRadius={[30, 0, 0, 30]} color="#1c1c1ff7" border={{ width: 1, color: hex('#ffffff1a') }} />
      <view x={1315} y={45.75} width={33} height={33} src="icons/d/trailer.webp" color="#ffffffd9" />
      <text fontFamily={bold} fontSize={30} x={1366} y={head().titleY} lineHeight={37.5} color="#ffffffff">
        {head().title}
      </text>
      <text fontFamily={head().nameFont} fontSize={20} x={1366} y={head().nameY} lineHeight={24} maxWidth={421} maxLines={1} color="#ffffffa3">
        {head().name || ' '}
      </text>
      <text fontFamily={regular} fontSize={20} x={head().countX} y={head().countY} lineHeight={24} color="#ffffffa3">
        {head().count}
      </text>
      <view x={1279} y={119} width={641} height={1} color="#ffffff14" />
      <view x={1279} y={119.5} width={641} height={960.5} clipping>
        <view x={-1279} y={-119.5 - scroll()} width={1920} height={Math.max(1080, ROW.top + choices().length * (ROW.h + ROW.gap) + 21)}>
          <view
            x={1303}
            y={focusY()}
            width={593}
            height={144}
            borderRadius={18}
            color="#0f3a47ff"
            border={{ width: 3, color: hex('#ffffffff') }}
            alpha={choices().length ? 1 : 0}
          />
          <Rects list={laid().frames} />
          <Imgs list={laid().thumbs} />
          <Rects list={laid().pills} />
          <Icons list={laid().icons} />
          <Texts list={laid().texts} />
        </view>
      </view>
    </view>
  )
}
