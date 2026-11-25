import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import CountdownRing from './CountdownRing.jsx'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'
import { ACCENT, textWidth } from './look.js'
import { formatRemaining, panelFill, panelShadow } from './overlayLook.js'

const SEGMENT_LABELS = { intro: 'Intro', outro: 'Outro', preview: 'Preview', recap: 'Recap', commercial: 'Commercial' }
const RING = 52
const NO_PROMPT = { type: 'intro', start: 0, remainingSeconds: 0, progress: 0 }

// The skip prompt: a capsule with the skip glyph, "Skip Intro", "Ends in 1:29" and a ring that
// drains for as long as the segment has left, as the Media Segment Countdown setting picks. Under
// a minute, with both countdowns on, the ring holds the seconds instead of the timer text.
// `prompt` is popups.js' { type, start, remainingSeconds, progress }, `show` draws it. It sits
// right 35, bottom clear of the controls bar (its 212 plus 6), which stays laid out while the
// controls are hidden. Enter calls skipSegment() on its holder, and the other keys go on to it.
export default function SkipPrompt(props) {
  const [active, setActive] = createSignal(false)
  const font = uiFont('bold')
  const fill = panelFill()
  const shadow = panelShadow()
  const look = createMemo(() => {
    const p = props.prompt || NO_PROMPT
    // The settings preview hands over the countdown style being tried.
    const style = p.countdownStyle || settings.get('nextUpCountdownStyle') || 'both'
    const ring = style === 'progressBar' || style === 'both'
    const timer = style === 'timer' || style === 'both'
    const secs = Math.max(0, p.remainingSeconds)
    const inRing = timer && ring && secs < 60
    // Cinema Mode's trailers say just Skip.
    const label = p.label || $L('Skip {segment}').replace('{segment}', $L(SEGMENT_LABELS[p.type] || SEGMENT_LABELS.intro))
    const timerText = timer && !inRing ? $L('Ends in {time}').replace('{time}', formatRemaining(secs)) : ''
    // 1 border, 29 padding, the 29 glyph and 13 to the label.
    const labelX = 72
    const labelEnd = labelX + textWidth(label, 22, 'bold')
    const timerX = labelEnd + 12
    const ringX = (timerText ? timerX + textWidth(timerText, 20, 'bold') : labelEnd) + 19
    const w = Math.round((ring ? ringX + RING : ringX - 19) + 24)
    const h = (ring ? RING : 29) + 32
    return {
      w,
      h,
      x: 1885 - w,
      y: 862 - h,
      r: Math.min(41, h / 2),
      label,
      labelX,
      timerText,
      timerX,
      ringX,
      number: inRing ? String(secs) : '',
      ring: ring ? 1 : 0,
      glyph: ring && !inRing ? 1 : 0,
      progress: ring ? p.progress : 0,
    }
  })
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      x={look().x}
      y={look().y}
      width={look().w}
      height={look().h}
      alpha={props.show ? 1 : 0}
      onFocusChanged={setActive}
      onEnter={() => {
        if (props.skipSegment) props.skipSegment()
        return true
      }}
    >
      <view width={look().w} height={look().h} borderRadius={look().r} color="#00000000" shadow={shadow} />
      <view width={look().w} height={look().h} borderRadius={look().r} color={fill} />
      <view width={look().w} height={look().h} borderRadius={look().r} color="#00000000" border={{ width: 1, color: hex(ACCENT) }} alpha={active() ? 1 : 0} />
      <view x={30} y={(look().h - 29) / 2} width={29} height={29} src="icons/skip_next.webp" color={ACCENT} />
      <text fontFamily={font} fontSize={22} x={look().labelX} y={look().h / 2 - 11} lineHeight={26} color="#ffffffff">
        {look().label}
      </text>
      <text
        alpha={look().timerText ? 1 : 0}
        fontFamily={font}
        fontSize={20}
        x={look().timerX}
        y={look().h / 2 - 9.5}
        lineHeight={23}
        color="#ffffff80"
      >
        {look().timerText || ' '}
      </text>
      <view x={look().ringX} y={16} width={52} height={52} alpha={look().ring}>
        <CountdownRing size={52} stroke={4} progress={look().progress} track="#ffffff29" value={ACCENT} />
        <view x={15} y={15} width={22} height={22} src="icons/skip_next.webp" color={ACCENT} alpha={look().glyph} />
      </view>
      <text
        alpha={look().number ? 1 : 0}
        fontFamily={font}
        fontSize={20}
        x={look().ringX + 26}
        y={32.5}
        lineHeight={23}
        mountX={0.5}
        color="#ffffffff"
      >
        {look().number || ' '}
      </text>
    </view>
  )
}
